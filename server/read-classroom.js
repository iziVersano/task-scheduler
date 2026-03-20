const puppeteer = require('puppeteer-core');
const http = require('http');

// Try ports where Chrome may be listening
const PORTS = [9400, 9401, 9402, 9399];

function tryPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ port, info: JSON.parse(data) }); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.end();
  });
}

async function findChromePort() {
  for (const port of PORTS) {
    const result = await tryPort(port);
    if (result) return result.port;
  }
  return null;
}

(async () => {
  const port = await findChromePort();
  if (!port) {
    console.error('No Chrome debug port found. Close Chrome and click ▶ Open again.');
    process.exit(1);
  }

  console.log(`Connecting to Chrome on port ${port}...`);
  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${port}`,
    defaultViewport: null,
  });

  const pages = await browser.pages();
  console.log('Open tabs:', pages.map(p => p.url()));

  let page = pages.find(p => p.url().includes('classroom.google.com'));

  if (!page) {
    console.log('No Classroom tab found, navigating...');
    page = pages[0] || await browser.newPage();
    await page.goto('https://classroom.google.com/c/ODQ2MzQ3MDE0NDcx', { waitUntil: 'networkidle2', timeout: 30000 });
  }

  if (page.url().includes('accounts.google.com')) {
    console.error('Not logged in to Google Classroom on this Chrome instance.');
    browser.disconnect();
    process.exit(1);
  }

  console.log('Classroom URL:', page.url());
  await new Promise(r => setTimeout(r, 2000));

  // Click the first (topmost = latest) assignment
  const clicked = await page.evaluate(() => {
    const cards = document.querySelectorAll('li[data-item-id], div[data-item-id]');
    if (cards.length > 0) {
      const link = cards[0].querySelector('a, h3');
      if (link) { link.click(); return link.innerText.trim().slice(0, 120); }
      cards[0].click();
      return cards[0].innerText.trim().slice(0, 120);
    }
    const h3 = document.querySelector('h3');
    if (h3) {
      const parent = h3.closest('a, li, [tabindex]');
      if (parent) { parent.click(); return h3.innerText.trim(); }
    }
    return null;
  });

  if (!clicked) {
    console.error('Could not find an assignment to click. Page content:');
    const txt = await page.evaluate(() => document.body.innerText);
    console.log(txt.slice(0, 500));
    browser.disconnect();
    process.exit(1);
  }

  console.log('Clicked assignment:', clicked);
  await new Promise(r => setTimeout(r, 4000));
  await page.waitForSelector('h1, h2, [jsname], [class*="title"]', { timeout: 10000 }).catch(() => {});
  await new Promise(r => setTimeout(r, 1000));

  const content = await page.evaluate(() => {
    const main = document.querySelector('main, [role="main"]') || document.body;
    return main.innerText.trim();
  });

  console.log('\n========== ASSIGNMENT ==========');
  console.log(content.slice(0, 8000));
  console.log('================================');

  browser.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
