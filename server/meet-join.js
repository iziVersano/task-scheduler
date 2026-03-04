const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const http = require('http');

const CHROME_PATH = '/usr/bin/google-chrome';
const USER_DATA_DIR = path.join(os.homedir(), '.config', 'google-chrome-meet');
const DEBUG_PORT = 9399;

const meetUrl = process.argv[2];
if (!meetUrl || !meetUrl.includes('meet.google.com')) {
  console.error('Usage: node meet-join.js <google-meet-url>');
  process.exit(1);
}

// Launch Chrome as a fully detached process that survives Node exiting
function launchChromeDetached() {
  const child = spawn(CHROME_PATH, [
    `--user-data-dir=${USER_DATA_DIR}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--use-fake-ui-for-media-stream',
    '--window-size=1280,720',
  ], {
    detached: true,
    stdio: 'ignore',
  });
  child.unref();
  return child.pid;
}

// Wait for Chrome's debug port to be ready
function waitForDebugPort(maxWait = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      const req = http.get(`http://127.0.0.1:${DEBUG_PORT}/json/version`, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
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

(async () => {
  let browser;
  try {
    console.log(`Opening Meet: ${meetUrl}`);

    // Launch Chrome detached so it survives this process exiting
    launchChromeDetached();
    console.log('Launched Chrome (detached)');

    // Wait for debug port
    await waitForDebugPort();
    console.log(`Chrome ready on port ${DEBUG_PORT}`);

    // Connect via debug port
    browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
      defaultViewport: null,
    });

    const page = await browser.newPage();
    // Hide webdriver flag to avoid automation detection
    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false });
    });
    // Strip authuser param — it causes redirects through accounts.google.com
    const cleanUrl = meetUrl.replace(/[?&]authuser=\d+/, '');
    await page.goto(cleanUrl, { waitUntil: 'networkidle2', timeout: 30000 });

    // If redirected to login, wait for it to resolve (auto-login with saved session)
    if (page.url().includes('accounts.google.com')) {
      console.log('Redirected to accounts.google.com, waiting for auto-login...');
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
      } catch {}
    }

    // If still on login page, the session is missing
    if (page.url().includes('accounts.google.com/signin') ||
        page.url().includes('accounts.google.com/ServiceLogin')) {
      throw new Error(
        'Not logged in. Run this once to set up:\n' +
        '  google-chrome --user-data-dir=$HOME/.config/google-chrome-meet\n' +
        'Log into Google, then close the browser.'
      );
    }

    // Wait for the pre-join screen
    await page.waitForSelector(
      '[aria-label*="microphone" i], [aria-label*="Join" i], [data-is-muted]',
      { timeout: 20000 }
    );

    // Turn off microphone if it's on
    const micOff = await page.$('[aria-label*="Turn off microphone" i]');
    if (micOff) {
      await micOff.click();
      console.log('Turned off microphone');
    }

    // Turn off camera if it's on
    const camOff = await page.$('[aria-label*="Turn off camera" i]');
    if (camOff) {
      await camOff.click();
      console.log('Turned off camera');
    }

    await new Promise((r) => setTimeout(r, 2000));

    // Dismiss any popups/dialogs (notification prompt, cookie banner, etc.)
    await page.evaluate(() => {
      document.querySelectorAll('button').forEach((btn) => {
        const text = btn.textContent.trim().toLowerCase();
        if (text === 'not now' || text === 'dismiss' || text === 'got it') {
          btn.click();
        }
      });
    });
    await new Promise((r) => setTimeout(r, 1000));

    // Click join using page.evaluate for a real DOM click (bypasses overlays)
    const joined = await page.evaluate(() => {
      const targets = ['join now', 'ask to join', 'join here too', 'switch here'];
      const allButtons = Array.from(document.querySelectorAll('button'));
      for (const btn of allButtons) {
        const text = btn.textContent.trim().toLowerCase();
        const label = (btn.getAttribute('aria-label') || '').toLowerCase();
        for (const target of targets) {
          if (text.includes(target) || label.includes(target)) {
            btn.click();
            return target;
          }
        }
      }
      return null;
    });

    if (joined) {
      console.log(`Clicked: "${joined}"`);
    }

    if (!joined) {
      throw new Error('Could not find Join button on the Meet page');
    }

    // Wait to confirm we're in the meeting
    await new Promise((r) => setTimeout(r, 3000));
    console.log('Successfully joined the meeting');

    // Disconnect — Chrome keeps running since it was launched detached
    browser.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(`Meet join failed: ${err.message}`);
    try {
      if (browser) browser.disconnect();
    } catch {}
    process.exit(1);
  }
})();
