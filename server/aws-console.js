const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const CHROME_PATH = '/usr/bin/google-chrome';
const DESKTOP_ENV_FILE = path.join(os.homedir(), '.config', 'task-scheduler', 'desktop-env');

// Two profiles selectable via --account=<name>:
//   (default)  → AWS_CONSOLE_* (account 992382612204, user izi)
//   student    → AWS_STUDENT_* (DCI student login)
// Each uses its own Chrome profile, debug port, and log file so they can run
// side by side without clobbering each other's session.
const accountArg = (process.argv.find(a => a.startsWith('--account=')) || '').split('=')[1] || 'default';
// Optional: a QA lab path to open before reading credentials, e.g.
// "/lab/introduction-virtual-private-cloud-vpc/". Empty = use whatever lab is open.
const labArg = (process.argv.find(a => a.startsWith('--topic=')) || '').split('=').slice(1).join('=') || '';
// Optional: navigate to this URL after login instead of the console home page.
const destinationArg = (process.argv.find(a => a.startsWith('--destination=')) || '').split('=').slice(1).join('=') || '';
const QA_PROGRAM = 'd8feaf4d-3cae-468a-ae9b-3c4f5ea2a428';

const PROFILES = {
  default: {
    accountId: process.env.AWS_CONSOLE_ACCOUNT_ID || process.env.AWS_ACCOUNT_ID,
    username:  process.env.AWS_CONSOLE_USERNAME || '',
    password:  process.env.AWS_CONSOLE_PASSWORD || '',
    dataDir:   path.join(os.homedir(), '.config', 'google-chrome-aws'),
    debugPort: 9410,
    logFile:   '/tmp/aws-console.log',
  },
  student: {
    accountId: process.env.AWS_STUDENT_ACCOUNT_ID,
    username:  process.env.AWS_STUDENT_USERNAME || '',
    password:  process.env.AWS_STUDENT_PASSWORD || '',
    region:    process.env.AWS_STUDENT_REGION,
    dataDir:   path.join(os.homedir(), '.config', 'google-chrome-aws-student'),
    debugPort: 9411,
    logFile:   '/tmp/aws-console-student.log',
  },
};

const profile = PROFILES[accountArg] || PROFILES.default;
let accountId = profile.accountId;
let username  = profile.username;
let password  = profile.password;
const CHROME_DATA_DIR = profile.dataDir;
const DEBUG_PORT = profile.debugPort;
const LOG_FILE = profile.logFile;
let region      = profile.region || process.env.AWS_REGION || 'us-east-1';

// QA Platform automation Chrome (where the lab session page lives).
const QA_DEBUG_PORT = 9412;

// Map QA's human region label ("US West 2") to an AWS region code.
function regionCode(label) {
  if (!label) return null;
  const map = {
    'us east 1': 'us-east-1', 'n. virginia': 'us-east-1',
    'us east 2': 'us-east-2', 'ohio': 'us-east-2',
    'us west 1': 'us-west-1', 'n. california': 'us-west-1',
    'us west 2': 'us-west-2', 'oregon': 'us-west-2',
    'eu west 1': 'eu-west-1', 'ireland': 'eu-west-1',
    'eu central 1': 'eu-central-1', 'frankfurt': 'eu-central-1',
  };
  const key = label.toLowerCase().replace(/[()]/g, '').trim();
  if (/^[a-z]{2}-[a-z]+-\d$/.test(key)) return key; // already a code
  return map[key] || null;
}

// Read the live lab sandbox credentials from the QA automation Chrome.
// Returns null if QA isn't running or no lab session page is open.
async function readLabCredentials() {
  try {
    const alive = await new Promise((resolve) => {
      const r = http.get(`http://127.0.0.1:${QA_DEBUG_PORT}/json/version`, () => resolve(true));
      r.on('error', () => resolve(false));
      r.end();
    });
    if (!alive) return null;

    const qaBrowser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${QA_DEBUG_PORT}`,
      defaultViewport: null,
    });
    const pages = await qaBrowser.pages();
    // The credentials panel lives on the lab *session-page*. Prefer that tab;
    // otherwise take any lab/qa tab we can navigate.
    let labPage = pages.find(p => /session-page/.test(p.url()))
               || pages.find(p => /\/lab\//.test(p.url()))
               || pages.find(p => /qa\.com/.test(p.url()));
    if (!labPage) { qaBrowser.disconnect(); return null; }

    // If a specific lab was chosen, navigate there first (unless we're already
    // on that lab's session page).
    if (labArg && !labPage.url().includes(labArg)) {
      const target = `https://platform.qa.com${labArg}?program=${QA_PROGRAM}`;
      log(`Navigating QA to chosen lab: ${target}`);
      await labPage.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 4000));
    }

    const scrape = () => labPage.evaluate(() => {
      const txt = document.body.innerText;
      const grab = (label) => {
        const re = new RegExp(label + '\\s*\\n+\\s*([^\\n]+)', 'i');
        const m = txt.match(re);
        return m ? m[1].trim() : null;
      };
      return {
        accountId: grab('Account ID'),
        username: grab('Username'),
        password: grab('Password'),
        region: grab('Region'),
      };
    });

    let creds = await scrape();

    // If we're on a lab overview (not the session page), click "Continue lab" /
    // "Start lab" / "Open" to reach the page that shows the credentials.
    if (!(creds.accountId && /^\d{12}$/.test(creds.accountId))) {
      const advanced = await labPage.evaluate(() => {
        const btn = [...document.querySelectorAll('button, a')]
          .find(b => /continue lab|start lab|resume|open\b/i.test((b.innerText || '').trim()));
        if (btn) { btn.click(); return true; }
        return false;
      }).catch(() => false);
      if (advanced) {
        await new Promise(r => setTimeout(r, 5000));
        creds = await scrape();
      }
    }
    qaBrowser.disconnect();

    // Only accept if it actually looks like a sandbox (12-digit account).
    if (creds.accountId && /^\d{12}$/.test(creds.accountId) && creds.password) {
      return creds;
    }
    return null;
  } catch {
    return null;
  }
}

// Use the classic IAM sign-in URL (?iam_user=true) to bypass the new OAuth/canvas
// flow which AWS's bot-detection prevents from rendering in Puppeteer.
let url = accountId
  ? `https://${accountId}.signin.aws.amazon.com/console?region=${region}`
  : `https://console.aws.amazon.com/console/home?region=${region}`;

function log(msg) {
  const line = `[${new Date().toLocaleTimeString('de-DE')}] ${msg}`;
  process.stdout.write(line + '\n');
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function loadDesktopEnv() {
  try {
    const text = fs.readFileSync(DESKTOP_ENV_FILE, 'utf8');
    const env = {};
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) env[m[1]] = m[2];
    }
    return env;
  } catch { return {}; }
}
const DESKTOP_ENV = loadDesktopEnv();

function cleanStaleLocks() {
  for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    const p = path.join(CHROME_DATA_DIR, name);
    try {
      const stat = fs.lstatSync(p);
      if (!stat.isSymbolicLink()) continue;
      const target = fs.readlinkSync(p);
      const m = target.match(/-(\d+)$/);
      if (m) {
        const pid = Number(m[1]);
        try { process.kill(pid, 0); continue; } catch {
          fs.unlinkSync(p);
          log(`Removed stale ${name} (PID ${pid} dead)`);
        }
      } else {
        fs.unlinkSync(p);
      }
    } catch {}
  }
}

function waitForDebugPort(maxWait = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      const req = http.get(`http://127.0.0.1:${DEBUG_PORT}/json/version`, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(JSON.parse(data)));
      });
      req.on('error', () => {
        if (Date.now() - start > maxWait) return reject(new Error('Chrome debug port not ready'));
        setTimeout(check, 500);
      });
      req.end();
    }
    check();
  });
}

async function typeIfFound(page, selectors, value, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (!el) continue;
        const visible = await el.evaluate(n => {
          const r = n.getBoundingClientRect();
          return r.width > 0 && r.height > 0 && !n.disabled;
        });
        if (!visible) continue;
        await el.click({ clickCount: 3 }).catch(() => {});
        await el.type(value, { delay: 25 });
        return sel;
      } catch {}
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

(async () => {
  // For the student profile: click the QA lab's "Open" button which opens the
  // AWS Console pre-authenticated via QA's federated login — no sign-in form needed.
  if (accountArg === 'student') {
    try {
      const alive = await new Promise(resolve => {
        const r = http.get(`http://127.0.0.1:${QA_DEBUG_PORT}/json/version`, () => resolve(true));
        r.on('error', () => resolve(false));
        r.end();
      });
      if (alive) {
        const qaBrowser = await puppeteer.connect({
          browserURL: `http://127.0.0.1:${QA_DEBUG_PORT}`,
          defaultViewport: null,
        });
        const pages = await qaBrowser.pages();
        const labPage = pages.find(p => /session-page/.test(p.url()))
                     || pages.find(p => /\/lab\//.test(p.url()));
        if (labPage) {
          // If a specific lab was requested, navigate there first
          if (labArg && !labPage.url().includes(labArg)) {
            const target = `https://platform.qa.com${labArg}?program=${QA_PROGRAM}`;
            log(`Navigating QA to chosen lab: ${target}`);
            await labPage.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
            await new Promise(r => setTimeout(r, 4000));
          }
          log('Clicking the QA lab Open button to launch federated AWS Console...');
          const clicked = await labPage.evaluate(() => {
            const btn = [...document.querySelectorAll('button, a')]
              .find(b => /^open$/i.test((b.innerText || '').trim()));
            if (btn) { btn.click(); return true; }
            return false;
          }).catch(() => false);
          if (clicked) {
            log('Clicked Open — AWS Console will open in a new tab via QA federated login.');
            qaBrowser.disconnect();
            process.exit(0);
          }
        }
        qaBrowser.disconnect();
      }
    } catch (e) {
      log(`QA federated click failed: ${e.message} — falling back to credential sign-in`);
    }

    // QA not open or session page not loaded yet — tell the user
    log('No QA lab session page found. Please open a lab in QA Platform first, then click Run again.');
    process.exit(0);
  }

  // Rebuild URL now that account/region may have changed.
  url = accountId
    ? `https://${accountId}.signin.aws.amazon.com/console?region=${region}`
    : `https://console.aws.amazon.com/console/home?region=${region}`;

  const targetUrl = destinationArg || url;
  log(`Opening AWS Console [profile: ${accountArg}] → ${targetUrl}`);

  cleanStaleLocks();

  // Check if Chrome is already running with a debug port — if so, open a new tab.
  const portAlive = await new Promise(resolve => {
    const r = http.get(`http://127.0.0.1:${DEBUG_PORT}/json/version`, () => resolve(true));
    r.on('error', () => resolve(false));
    r.end();
  });

  if (!portAlive) {
    // Launch Chrome fresh
    spawn(CHROME_PATH, [
      `--user-data-dir=${CHROME_DATA_DIR}`,
      `--remote-debugging-port=${DEBUG_PORT}`,
      '--no-first-run',
      '--no-default-browser-check',
      url,
    ], { detached: true, stdio: 'ignore', env: { ...process.env, ...DESKTOP_ENV } }).unref();
    log('Chrome launched, waiting for debug port...');
    await waitForDebugPort(20000).catch(() => {});
  }

  try {
    const browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
      defaultViewport: null,
    });

    const pages = await browser.pages();
    // Close any DevTools tabs — they freeze page JS
    for (const p of pages) {
      if (p.url().startsWith('devtools://')) await p.close().catch(() => {});
    }

    const freshPages = await browser.pages();
    let page = freshPages.find(p => /signin\.aws|aws\.amazon/i.test(p.url()));
    if (!page) {
      page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    }
    await page.bringToFront();

    // Wait up to 15s for the sign-in form fields to appear
    const formReady = await (async () => {
      const start = Date.now();
      while (Date.now() - start < 15000) {
        const has = await page.evaluate(() =>
          !!document.querySelector('input[name="username"], input[name="password"]')
        ).catch(() => false);
        if (has) return true;
        await new Promise(r => setTimeout(r, 500));
      }
      return false;
    })();

    if (!formReady) {
      // Already signed in — just navigate to destination
      log(`No sign-in form found — may already be signed in. URL: ${page.url()}`);
      if (destinationArg) {
        await page.goto(destinationArg, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
        log(`Navigated to destination: ${page.url()}`);
      }
      browser.disconnect();
      process.exit(0);
    }

    log('Sign-in form found — filling credentials...');

    if (accountId) {
      await page.$eval('input[name="account"]', el => { el.value = ''; el.focus(); }).catch(() => {});
      await page.type('input[name="account"]', accountId, { delay: 30 }).catch(() => {});
    }
    await page.$eval('input[name="username"]', el => { el.value = ''; el.focus(); }).catch(() => {});
    await page.type('input[name="username"]', username, { delay: 30 });
    await page.$eval('input[name="password"]', el => { el.value = ''; el.focus(); }).catch(() => {});
    await page.type('input[name="password"]', password, { delay: 30 });
    await page.keyboard.press('Enter');
    log('Submitted sign-in form, waiting for redirect...');

    await new Promise(r => setTimeout(r, 6000));
    log(`Signed in. URL: ${page.url()}`);

    if (destinationArg && !/signin/i.test(page.url())) {
      await page.goto(destinationArg, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      log(`Navigated to destination: ${page.url()}`);
    }

    browser.disconnect();
  } catch (err) {
    log(`Error: ${err.message}`);
  }

  process.exit(0);
})();
