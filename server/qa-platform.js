const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const CHROME_PATH = '/usr/bin/google-chrome';
const CHROME_DATA_DIR = path.join(os.homedir(), '.config', 'google-chrome-qa');
const DEBUG_PORT = 9412;
const LOG_FILE = '/tmp/qa-platform.log';
const URL = 'https://platform.qa.com/programs/d8feaf4d-3cae-468a-ae9b-3c4f5ea2a428/';
const DESKTOP_ENV_FILE = path.join(os.homedir(), '.config', 'task-scheduler', 'desktop-env');

const EMAIL = process.env.QA_PLATFORM_EMAIL;
const PASSWORD = process.env.QA_PLATFORM_PASSWORD;

// Optional lab path from the dropdown, e.g.
// "/lab/introduction-virtual-private-cloud-vpc/". When set we open that lab and
// then chain into the AWS Console (student) login for its live sandbox.
const labArg = (process.argv.find(a => a.startsWith('--topic=')) || '').split('=').slice(1).join('=') || '';
const WATCH_MS = 10 * 60 * 1000; // wait up to 10 min for you to open a lab
const QA_PROGRAM = 'd8feaf4d-3cae-468a-ae9b-3c4f5ea2a428';

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

async function clickByText(page, re, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const handle = await Promise.race([
        page.evaluateHandle((pattern) => {
          const rx = new RegExp(pattern, 'i');
          const nodes = [...document.querySelectorAll('button, a, [role="button"], input[type="submit"]')];
          return nodes.find(n => rx.test((n.innerText || n.value || '').trim())) || null;
        }, re.source),
        new Promise((_, rej) => setTimeout(() => rej(new Error('eval timeout')), 2000)),
      ]);
      const el = handle.asElement();
      if (el) {
        await el.evaluate(n => n.scrollIntoView({ block: 'center' }));
        await el.click();
        return true;
      }
    } catch {}
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

async function typeIfFound(page, selectors, value, timeout = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    for (const sel of selectors) {
      try {
        const el = await page.$(sel);
        if (el) {
          const visible = await el.evaluate(n => {
            const r = n.getBoundingClientRect();
            return r.width > 0 && r.height > 0 && !n.disabled;
          });
          if (visible) {
            await el.click({ clickCount: 3 }).catch(() => {});
            await el.type(value, { delay: 25 });
            return sel;
          }
        }
      } catch {}
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

// When a lab is chosen from the dropdown: open it, click "Continue lab" to reach
// the session page, then hand off to aws-console.js (student) which scrapes the
// live sandbox credentials and signs into the AWS Console.
// Fresh short-lived connection to the QA Chrome debug port. Returns a browser
// handle or null. Using fresh connections each poll keeps us resilient to the
// port hiccuping and never holds an exclusive handle that disturbs the user.
async function connectQa() {
  try {
    return await puppeteer.connect({
      browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
      defaultViewport: null,
    });
  } catch { return null; }
}

// Inspect the QA browser:
//   • session page with a 12-digit Account ID  → return { lab } (ready!)
//   • lab overview page with a "Continue lab"   → click it, return 'advancing'
//   • neither                                   → return null (keep waiting)
async function inspectQa(browser) {
  const pages = await browser.pages();

  // Dismiss Ela AI popup if open — it blocks the lab buttons
  for (const p of pages) {
    await p.evaluate(() => {
      const btn = [...document.querySelectorAll('button, [role="button"]')]
        .find(b => /^(close|✕|×)$/i.test((b.innerText || b.getAttribute('aria-label') || '').trim()));
      if (btn) btn.click();
    }).catch(() => {});
  }

  const sp = pages.find(p => /session-page/.test(p.url()));
  if (sp) {
    // Click the Open button if it's ready — this opens AWS Console via federated login
    const openClicked = await sp.evaluate(() => {
      const btn = [...document.querySelectorAll('button, a')]
        .find(b => /^open$/i.test((b.innerText || '').trim()));
      if (btn && !btn.disabled) { btn.click(); return true; }
      return false;
    }).catch(() => false);
    if (openClicked) return 'opened';

    // Fallback: check credentials are present (lab still loading)
    const ok = await sp.evaluate(() => /Account ID\s*\n+\s*\d{12}/i.test(document.body.innerText))
      .catch(() => false);
    if (ok) {
      const m = sp.url().match(/\/lab\/([^/]+)\//);
      return { lab: m ? `/lab/${m[1]}/` : '/lab/' };
    }
  }

  // Only click Continue/Start/Resume/Launch on a specific lab page — NOT on
  // assignment or program overview pages (which show Resume for video courses).
  const labPage = pages.find(p => /platform\.qa\.com\/lab\//.test(p.url()));
  if (labPage) {
    const clicked = await labPage.evaluate(() => {
      const btn = [...document.querySelectorAll('button, a')]
        .find(b => /^(continue lab|start lab|resume|launch lab|open)$/i.test((b.innerText || '').trim()));
      if (btn) { btn.click(); return true; }
      return false;
    }).catch(() => false);
    if (clicked) return 'advancing';
  }

  return null;
}

// Wait-and-watch flow: after QA is open, let the user click whichever lab they
// want. We poll until a lab session page with live credentials appears, then
// hand off to aws-console.js (student) to scrape + sign into AWS. Resilient to
// the debug port dropping (reconnects each poll).
async function watchAndChain(browser) {
  // Release the handle so the user's clicks aren't disturbed.
  try { browser.disconnect(); } catch {}

  log('Pick a lab in the QA window. I will sign into AWS once its credentials appear...');
  const deadline = Date.now() + WATCH_MS;
  let lastTick = 0;

  while (Date.now() < deadline) {
    const b = await connectQa();
    let res = null;
    if (b) {
      try { res = await inspectQa(b); } catch {}
      try { b.disconnect(); } catch {}

      if (res === 'advancing') {
        log('On lab overview — clicked "Continue lab", waiting for the session page...');
        await new Promise(r => setTimeout(r, 5000));
        continue;
      }
      if (res === 'opened') {
        log('Clicked Open button — AWS Console opening via QA federated login.');
        process.exit(0);
      }
      if (res && res.lab) {
        log(`Lab session ready (${res.lab}) — clicking Open button...`);
        const awsScript = path.join(__dirname, 'aws-console.js');
        const child = spawn('node', [awsScript, '--account=student', `--topic=${res.lab}`], {
          detached: true, stdio: 'ignore', env: { ...process.env },
        });
        child.unref();
        log('--- QA Platform + AWS Console chain complete ---');
        process.exit(0);
      }
    }

    if (Date.now() - lastTick > 30000) {
      log(b
        ? `Waiting for you to open a lab... (${Math.round((deadline - Date.now())/60000)} min left)`
        : 'QA window not reachable — is it still open?');
      lastTick = Date.now();
    }
    await new Promise(r => setTimeout(r, 3000));
  }
  log('No lab opened within the wait window — leaving QA open, not opening AWS.');
}

(async () => {
  log('Opening QA Platform');
  log(`URL: ${URL}`);
  if (!EMAIL || !PASSWORD) {
    log('WARN: QA_PLATFORM_EMAIL / QA_PLATFORM_PASSWORD not set — opening without auto-login.');
  }

  cleanStaleLocks();
  const child = spawn(CHROME_PATH, [
    `--user-data-dir=${CHROME_DATA_DIR}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    URL,
  ], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, ...DESKTOP_ENV },
  });
  child.unref();

  try {
    await waitForDebugPort();
  } catch {
    // Chrome already running — connect to existing instance
  }

  let browser;
  try {
    browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
      defaultViewport: null,
    });

    const pages = await browser.pages();
    let page = pages.find(p => /qa\.com/i.test(p.url()));
    if (!page) page = await browser.newPage();
    await page.bringToFront();
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    log(`Page: ${page.url()}`);

    // Give the SPA time to fully hydrate — login method buttons render late.
    await new Promise(r => setTimeout(r, 5000));

    // Already signed in? Platform redirects authed users away from /login/.
    if (!/\/login/i.test(page.url()) &&
        !/login\.platform\.qa\.com/i.test(page.url()) &&
        /platform\.qa\.com/i.test(page.url())) {
      log(`Looks already signed in — at ${page.url()}`);
      const dismissed = await clickByText(page, /^(remind me later|skip|close|maybe later)$/i, 3000);
      if (dismissed) log('Dismissed welcome modal.');
      await watchAndChain(browser);
      browser.disconnect();
      process.exit(0);
    }

    // Dismiss cookie banner — required because it overlays the login UI.
    log('Dismissing cookie banner...');
    try {
      const dismissed = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button, a, [role="button"]')]
          .find(b => /accept all cookies|use necessary cookies only/i.test((b.innerText || '').trim()));
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (dismissed) {
        await new Promise(r => setTimeout(r, 2500));
        log('Cookie banner dismissed.');
      } else {
        log('No cookie banner (already accepted or never shown).');
      }
    } catch {}

    if (!EMAIL || !PASSWORD) {
      browser.disconnect();
      process.exit(0);
    }

    // QA Platform offers two paths: "Login with your company account" (SSO) and
    // "Login with email and password" (form + reCAPTCHA). The user logs in via
    // the email/password form. The form lives inside an iframe.

    // Step 1: if not already on the Auth0 login page, click "Login with email
    // and password" on the outer platform.qa.com/login/ page to trigger the
    // Auth0 redirect.
    if (/login\.platform\.qa\.com\/u\/login/.test(page.url())) {
      log('Already on Auth0 login page — skipping outer click.');
    } else {
      log('Clicking "Login with email and password"...');
      const emailLinkClicked = await clickByText(page, /login with email and password|email and password/i, 10000);
      if (emailLinkClicked) {
        log('Clicked email/password link. Waiting for Auth0 redirect...');
        try {
          await page.waitForFunction(
            () => /login\.platform\.qa\.com\/u\/login/.test(location.href),
            { timeout: 15000 }
          );
          log(`Landed on Auth0: ${page.url()}`);
        } catch {
          log(`No Auth0 redirect detected — current URL: ${page.url()}`);
        }
      } else {
        log('No "email and password" link found in time.');
      }
    }

    // Step 2: type into the Auth0 form. We know the exact selectors:
    //   input#username (name="username", type="text")
    //   input#password (name="password", type="password")
    // Submit button text: "Login with email".
    log('Typing credentials into Auth0 form...');
    const emailFilled = await typeIfFound(page, [
      '#username',
      'input[name="username"]',
      'input[type="email"]',
      'input[id*="email" i]',
      'input[autocomplete="username"]',
    ], EMAIL, 12000);
    if (!emailFilled) {
      log('Could not find email/username field — leaving the rest to you.');
      browser.disconnect();
      process.exit(0);
    }
    log(`Typed email into ${emailFilled}`);

    const pwFilled = await typeIfFound(page, [
      '#password',
      'input[name="password"]',
      'input[type="password"]',
    ], PASSWORD, 8000);
    if (!pwFilled) {
      log('Could not find password field — leaving the rest to you.');
      browser.disconnect();
      process.exit(0);
    }
    log(`Typed password into ${pwFilled}`);

    // Step 3: click the "Login with email" submit button.
    const submitClicked = await clickByText(page, /^login with email$|^log ?in$|^sign in$|^submit$/i, 4000);
    if (submitClicked) {
      log('Clicked submit. Waiting for navigation...');
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    } else {
      log('Submit button not found — pressing Enter as fallback.');
      await page.keyboard.press('Enter');
      await new Promise(r => setTimeout(r, 4000));
    }

    log(`Final URL: ${page.url()}`);
    const dismissed = await clickByText(page, /^(remind me later|skip|close|maybe later)$/i, 4000);
    if (dismissed) log('Dismissed welcome modal.');

    await watchAndChain(browser);

    browser.disconnect();
  } catch (err) {
    log(`Error: ${err.message}`);
    try { browser?.disconnect(); } catch {}
  }

  process.exit(0);
})();
