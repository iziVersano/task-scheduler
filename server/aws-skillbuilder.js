const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const CHROME_PATH = '/usr/bin/google-chrome';
const CHROME_DATA_DIR = path.join(os.homedir(), '.config', 'google-chrome-aws');
const DEBUG_PORT = 9410;
const LOG_FILE = '/tmp/aws-skillbuilder.log';
const DESKTOP_ENV_FILE = path.join(os.homedir(), '.config', 'task-scheduler', 'desktop-env');

// Default landing page (post-login) and topic-specific deep links.
const DEFAULT_URL = 'https://skillbuilder.aws/dashboard';
const TOPIC_URLS = {
  'cloud-practitioner': 'https://skillbuilder.aws/exam-prep/cloud-practitioner',
  'solutions-architect': 'https://skillbuilder.aws/exam-prep/solutions-architect-associate',
  'developer-associate': 'https://skillbuilder.aws/exam-prep/developer-associate',
  'sysops-administrator': 'https://skillbuilder.aws/exam-prep/sysops-administrator-associate',
  'practice-questions': 'https://skillbuilder.aws/search?searchTerm=Official+Practice+Question+Set',
  'labs': 'https://skillbuilder.aws/search?searchTerm=Hands-on+Lab',
};

function getTopicOverride() {
  const arg = process.argv.find(a => a.startsWith('--topic='));
  if (!arg) return null;
  const v = arg.slice('--topic='.length).trim();
  return v || null;
}

const EMAIL = process.env.AWS_BUILDER_EMAIL;
const PASSWORD = process.env.AWS_BUILDER_PASSWORD;

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

// Find a clickable element whose visible text matches `re`
async function clickByText(page, re, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      // Hard-cap each evaluate at 2s so a hung context doesn't deadlock the loop.
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
    } catch (e) {
      // Page may have navigated mid-evaluate or context destroyed — wait and retry.
    }
    await new Promise(r => setTimeout(r, 400));
  }
  return false;
}

async function typeIfFound(page, selector, value, timeout = 8000) {
  try {
    await page.waitForSelector(selector, { visible: true, timeout });
    await page.click(selector, { clickCount: 3 }).catch(() => {});
    await page.type(selector, value, { delay: 30 });
    return true;
  } catch {
    return false;
  }
}

(async () => {
  log('Opening AWS Skill Builder');

  const topic = getTopicOverride();
  const URL = topic && TOPIC_URLS[topic] ? TOPIC_URLS[topic] : DEFAULT_URL;
  if (topic) log(`Topic: ${topic}`);
  log(`URL: ${URL}`);

  if (!EMAIL || !PASSWORD) {
    log('WARN: AWS_BUILDER_EMAIL / AWS_BUILDER_PASSWORD not set — opening site without auto-login.');
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

    // Find or open the Skill Builder tab — only match skillbuilder.aws hostnames,
    // not the unrelated AWS Console OAuth flow that lives on signin.aws.amazon.com.
    const pages = await browser.pages();
    let page = pages.find(p => /\bskillbuilder\.aws\b/i.test(p.url()));
    if (!page) {
      page = await browser.newPage();
    }
    await page.bringToFront();
    // Try the topic URL first. If we land on /login (not authed) the script
    // continues with auto-login; otherwise we're done.
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 2500));

    log(`Page: ${page.url()}`);

    // If the topic URL kept us off /login and off the marketing root, we're
    // signed in — done.
    if (!/\/login|auth\.skillbuilder|signin\.aws/i.test(page.url()) &&
        !/^https?:\/\/skillbuilder\.aws\/?$/i.test(page.url())) {
      log('Looks already signed in — done.');
      browser.disconnect();
      process.exit(0);
    }

    // Not authed yet — explicitly navigate to /login to trigger the Auth0 flow.
    await page.goto('https://skillbuilder.aws/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    log(`Login page: ${page.url()}`);

    // Dismiss the AWS cookie banner if present — it can intercept clicks.
    // Some AWS pages reload on cookie acceptance, so wait for any nav to settle.
    try {
      const clicked = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find(b => /^accept$/i.test((b.innerText||'').trim()));
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (clicked) await new Promise(r => setTimeout(r, 2000));
    } catch {}

    // Already signed in? skillbuilder.aws/learn renders without /login/ in the URL once authed
    if (/\/learn(\/|$)/.test(page.url()) && !/login|auth/i.test(page.url())) {
      log('Looks already signed in — done.');
      browser.disconnect();
      process.exit(0);
    }

    if (!EMAIL || !PASSWORD) {
      browser.disconnect();
      process.exit(0);
    }

    // Step 1: Skill Builder's login page has two stages.
    //   Stage A: "Choose a sign in method" with "Create or Sign in" → AWS Builder ID flow.
    //   Stage B: After clicking, the AWS Builder ID page offers "Continue with Google".
    // We click through both to reach Google's OAuth screen.
    log('Looking for "Create or Sign in" button...');
    const clickedBuilder = await clickByText(page, /create or sign in/i, 12000);
    if (clickedBuilder) {
      log('Clicked "Create or Sign in".');
    } else {
      log('No "Create or Sign in" button — maybe already on the AWS Builder ID page.');
    }

    await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
    log(`After click: ${page.url()}`);

    // Dismiss the cookie banner on the new sign-in page too.
    try {
      await new Promise(r => setTimeout(r, 1500));
      await page.evaluate(() => {
        const btn = [...document.querySelectorAll('button')].find(b => /^accept$/i.test((b.innerText||'').trim()));
        if (btn) btn.click();
      });
      await new Promise(r => setTimeout(r, 1000));
    } catch {}

    // Step 2: prefer Google SSO — click "Continue with Google".
    log('Looking for "Continue with Google"...');
    const clickedGoogle = await clickByText(page, /continue with google/i, 8000);
    if (clickedGoogle) {
      log('Clicked "Continue with Google". Handing off to Google OAuth.');
      await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
      log(`Google page: ${page.url()}`);

      // If the AWS Chrome profile is already signed into Google, Google's
      // account chooser auto-redirects back to Skill Builder. Wait briefly to
      // see whether we land back on skillbuilder.aws.
      await new Promise(r => setTimeout(r, 4000));
      log(`Now at: ${page.url()}`);

      if (/skillbuilder\.aws/i.test(page.url()) && !/login|auth/i.test(page.url())) {
        log('Google SSO completed — signed in.');
      } else {
        log('Google sign-in needs your input (pick account, type password, 2FA). Complete it manually — the session will persist for next time.');
      }
      browser.disconnect();
      process.exit(0);
    }

    // Fallback: Google button wasn't found, fall back to AWS Builder ID email/password.
    log('"Continue with Google" not found — falling back to AWS Builder ID email/password.');

    const emailSelectors = [
      'input[type="email"]',
      'input[name="email"]',
      'input[id*="email" i]',
      'input[placeholder*="email" i]',
      'input[placeholder*="username" i]',
      'input[placeholder*="@" i]',
      'input[type="text"]:not([type="hidden"]):not([role="checkbox"])',
    ];
    let emailTyped = false;
    for (const sel of emailSelectors) {
      if (await typeIfFound(page, sel, EMAIL, 4000)) {
        log(`Typed email into ${sel}`);
        emailTyped = true;
        break;
      }
    }
    if (!emailTyped) {
      log('Could not find email input — leaving rest to you.');
      browser.disconnect();
      process.exit(0);
    }

    // Submit email (Next / Continue / Submit) — try button first, fall back to Enter
    const nextClicked = await clickByText(page, /^(next|continue|sign in|submit)$/i, 4000);
    if (!nextClicked) {
      await page.keyboard.press('Enter');
    }
    log('Submitted email.');

    // Step 3: wait for the password input
    await new Promise(r => setTimeout(r, 1500));
    const passwordSelectors = [
      'input[type="password"]',
      'input[name="password"]',
      'input[id*="password" i]',
    ];
    let pwTyped = false;
    for (const sel of passwordSelectors) {
      if (await typeIfFound(page, sel, PASSWORD, 8000)) {
        log(`Typed password into ${sel}`);
        pwTyped = true;
        break;
      }
    }
    if (!pwTyped) {
      log('Could not find password input — leaving rest to you (maybe MFA / email-code step).');
      browser.disconnect();
      process.exit(0);
    }

    const submitClicked = await clickByText(page, /^(sign in|continue|submit|log in)$/i, 4000);
    if (!submitClicked) {
      await page.keyboard.press('Enter');
    }
    log('Submitted password.');

    // Give it a moment to navigate. If MFA / email verification is required, the page will sit on it.
    await new Promise(r => setTimeout(r, 4000));
    log(`Final URL: ${page.url()}`);

    browser.disconnect();
  } catch (err) {
    log(`Error: ${err.message}`);
    try { browser?.disconnect(); } catch {}
  }

  process.exit(0);
})();
