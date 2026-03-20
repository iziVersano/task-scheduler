const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const http = require('http');
const os = require('os');
const path = require('path');

const url = process.argv[2];
if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) {
  console.error('Usage: node open-url.js <url>');
  process.exit(1);
}

const CHROME_PATH = '/usr/bin/google-chrome';
const CHROME_DATA_DIR = path.join(os.homedir(), '.config', 'google-chrome');
const DEBUG_PORT = 9402;

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

(async () => {
  console.log(`Opening URL: ${url}`);

  const child = spawn(CHROME_PATH, [
    `--user-data-dir=${CHROME_DATA_DIR}`,
    '--profile-directory=Profile 1',
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    url,
  ], { detached: true, stdio: 'ignore' });
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

    // Find the tab with our URL or open it
    const pages = await browser.pages();
    let page = pages.find(p => p.url().includes(new URL(url).hostname));
    if (!page) {
      page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    }

    console.log('Opened:', page.url());
    browser.disconnect();
  } catch (err) {
    console.log('Could not connect to Chrome for reading, URL opened in browser.');
  }

  process.exit(0);
})();
