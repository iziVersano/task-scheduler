const puppeteer = require('puppeteer-core');
const http = require('http');

const DEBUG_PORT = 9399;
const message = process.argv[2] || '+1';

async function sendChatMessage() {
  // Check Chrome debug port is reachable
  const available = await new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${DEBUG_PORT}/json/version`, (res) => {
      res.resume();
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.end();
  });

  if (!available) {
    console.error('Chrome debug port not available — is Meet running?');
    process.exit(1);
  }

  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
    defaultViewport: null,
    protocolTimeout: 30000,
  });

  const pages = await browser.pages();
  const meetPage = pages.find(p => p.url().includes('meet.google.com'));

  if (!meetPage) {
    console.error('No Google Meet tab found');
    browser.disconnect();
    process.exit(1);
  }

  // Open chat panel if not already open
  const chatOpened = await meetPage.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button'));
    for (const btn of btns) {
      const label = (btn.getAttribute('aria-label') || '').toLowerCase();
      if (label.includes('chat') && !label.includes('close')) {
        btn.click();
        return true;
      }
    }
    return false;
  });

  if (!chatOpened) {
    console.error('Could not find chat button');
    browser.disconnect();
    process.exit(1);
  }

  await new Promise(r => setTimeout(r, 2000));

  // Bring the Meet tab to front so elements are interactable
  await meetPage.bringToFront();
  await new Promise(r => setTimeout(r, 500));

  const typed = await meetPage.evaluate((msg) => {
    const input = document.querySelector('textarea[aria-label*="message" i], textarea[aria-label*="chat" i], textarea[placeholder*="message" i]');
    if (!input) return 'not-found';
    input.focus();
    // Use execCommand to insert text so React/Angular state updates properly
    document.execCommand('insertText', false, msg);
    return 'typed';
  }, message);

  if (typed === 'not-found') {
    console.error('Could not find chat input');
    browser.disconnect();
    process.exit(1);
  }

  console.log(`Typed "${message}" in Meet chat`);

  browser.disconnect();
}

sendChatMessage().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
