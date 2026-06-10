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
const LOG_FILE = '/tmp/aws-console.log';
const DESKTOP_ENV_FILE = path.join(os.homedir(), '.config', 'task-scheduler', 'desktop-env');

// AWS Console IAM-user sign-in. Falls back to the legacy AWS_ACCOUNT_ID var if
// the dedicated console one isn't set.
const accountId = process.env.AWS_CONSOLE_ACCOUNT_ID || process.env.AWS_ACCOUNT_ID;
const username  = process.env.AWS_CONSOLE_USERNAME || '';
const password  = process.env.AWS_CONSOLE_PASSWORD || '';
const region    = process.env.AWS_REGION || 'us-east-1';

const url = accountId
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
  log(`Opening AWS Console (account: ${accountId || 'default'}, region: ${region}, user: ${username || '(none)'})`);
  log(`URL: ${url}`);

  cleanStaleLocks();
  const child = spawn(CHROME_PATH, [
    `--user-data-dir=${CHROME_DATA_DIR}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    url,
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
    let page = pages.find(p => /aws\.amazon\.com|signin\.aws/i.test(p.url()));
    if (!page) {
      page = await browser.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    } else {
      await page.bringToFront();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    }
    log(`Page: ${page.url()}`);

    // Wait for the page to settle, then check whether we landed on a sign-in form
    // or directly in the console (already signed in).
    await new Promise(r => setTimeout(r, 3500));
    log(`Now at: ${page.url()}`);

    if (!/signin/i.test(page.url())) {
      log('Looks already signed in — done.');
      browser.disconnect();
      process.exit(0);
    }

    if (!username || !password) {
      log('AWS_CONSOLE_USERNAME / AWS_CONSOLE_PASSWORD not set — leaving sign-in to you.');
      browser.disconnect();
      process.exit(0);
    }

    // Fill account ID if the field is on the page (some flows pre-fill it).
    if (accountId) {
      const acct = await typeIfFound(page, [
        'input[name="account"]',
        'input#account',
        'input[id*="account" i]',
      ], accountId, 4000);
      if (acct) log(`Typed account ID into ${acct}`);
    }

    const userSel = await typeIfFound(page, [
      'input[name="username"]',
      'input#username',
      'input[id*="username" i]',
      'input[type="text"]:not([name="account"]):not([id*="account" i])',
    ], username, 8000);
    if (!userSel) {
      log('Username field not found — leaving sign-in to you.');
      browser.disconnect();
      process.exit(0);
    }
    log(`Typed username into ${userSel}`);

    const pwSel = await typeIfFound(page, [
      'input[name="password"]',
      'input#password',
      'input[type="password"]',
    ], password, 8000);
    if (!pwSel) {
      log('Password field not found — leaving sign-in to you.');
      browser.disconnect();
      process.exit(0);
    }
    log(`Typed password into ${pwSel}`);

    // Click sign-in button or press Enter.
    const clickedSubmit = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('button, input[type="submit"]')];
      const submit = btns.find(b => /^(sign in|submit|log in)$/i.test((b.innerText || b.value || '').trim()));
      if (submit) { submit.click(); return true; }
      return false;
    });
    if (!clickedSubmit) await page.keyboard.press('Enter');
    log('Submitted sign-in form.');

    await new Promise(r => setTimeout(r, 5000));
    log(`Final URL: ${page.url()}`);
    browser.disconnect();
  } catch (err) {
    log(`Error: ${err.message}`);
    try { browser?.disconnect(); } catch {}
  }

  process.exit(0);
})();
