#!/usr/bin/env node
// Background watcher: while a QA lab is open in the automation Chrome (port
// 9410), it polls the session page and AUTO-SAVES each step's instructions to
// server/lab-notes/<lab-slug>.txt the moment you reach it.
//
// QA locks forward navigation, so the whole lab can't be pre-pulled — but as you
// complete steps and click Next, this captures each new step automatically. Just
// do the lab; the file fills itself. Runs until the lab tab closes or it has
// been idle (no new step) for IDLE_EXIT minutes.
//
// Usage: node watch-lab.js   (leave it running while you do the lab)

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const DEBUG_PORT = 9410;
const NOTES_DIR = path.join(__dirname, 'lab-notes');
const LOG_FILE = '/tmp/save-lab.log';
const POLL_MS = 4000;
const IDLE_EXIT_MS = 30 * 60 * 1000; // stop after 30 min with no new step

function log(msg) {
  const line = `[${new Date().toLocaleTimeString('de-DE')}] ${msg}`;
  process.stdout.write(line + '\n');
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

async function connect() {
  try {
    return await puppeteer.connect({ browserURL: `http://127.0.0.1:${DEBUG_PORT}`, defaultViewport: null });
  } catch { return null; }
}

async function scrape(browser) {
  const pages = await browser.pages();
  const page = pages.find(p => /\/lab\/.*session-page/.test(p.url()));
  if (!page) return null;
  const slugMatch = page.url().match(/\/lab\/([^/]+)\//);
  const slug = slugMatch ? slugMatch[1] : 'unknown-lab';
  const data = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    const full = main.innerText;
    let title = '';
    const tm = full.match(/HANDS-ON LAB\s*\n+\s*([^\n]+)/i);
    if (tm) title = tm[1].trim();
    let step = '';
    const headings = [...document.querySelectorAll('h1,h2,h3,h4')];
    const intro = headings.find(h => /^(introduction|instructions)$/i.test((h.innerText || '').trim()));
    if (intro) {
      const idx = headings.indexOf(intro);
      for (let i = idx - 1; i >= 0; i--) {
        const t = (headings[i].innerText || '').trim();
        if (t && t.length < 70 && !/credentials|cloud environment/i.test(t)) { step = t; break; }
      }
    }
    let body = full;
    const i1 = full.indexOf('Introduction');
    const i2 = full.indexOf('Instructions');
    const cands = [i1, i2].filter(i => i >= 0);
    const startIdx = cands.length ? Math.min(...cands) : full.indexOf('HANDS-ON LAB');
    if (startIdx >= 0) body = full.slice(startIdx);
    body = body.replace(/Report lab step feedback[\s\S]*$/i, '').trim();
    return { title, step, body };
  }).catch(() => null);
  return data ? { slug, ...data } : null;
}

function saveStep(slug, data) {
  fs.mkdirSync(NOTES_DIR, { recursive: true });
  const file = path.join(NOTES_DIR, `${slug}.txt`);
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file,
`================================================================
LAB: ${data.title || slug}
URL slug: ${slug}
Started: ${new Date().toISOString()}
================================================================
`);
  }
  const existing = fs.readFileSync(file, 'utf8');
  const key = (data.step || data.body.slice(0, 40)).trim();
  if (existing.includes(`### STEP: ${key}`)) return false; // already saved
  fs.appendFileSync(file,
`
### STEP: ${key}
(captured ${new Date().toLocaleString('de-DE')})

${data.body}

----------------------------------------------------------------
`);
  return true;
}

(async () => {
  log('Lab watcher started — do the lab normally; each step is saved as you reach it.');
  let lastNewStepAt = Date.now();
  let lastStep = null;

  while (Date.now() - lastNewStepAt < IDLE_EXIT_MS) {
    const browser = await connect();
    if (!browser) { await new Promise(r => setTimeout(r, POLL_MS)); continue; }

    const data = await scrape(browser);
    try { browser.disconnect(); } catch {}

    if (data && data.step && data.step !== lastStep) {
      const saved = saveStep(data.slug, data);
      if (saved) {
        log(`Saved step: "${data.step}" → lab-notes/${data.slug}.txt`);
        lastNewStepAt = Date.now();
      }
      lastStep = data.step;
    }
    await new Promise(r => setTimeout(r, POLL_MS));
  }
  log('Lab watcher idle for 30 min — stopping. Re-run if you resume the lab.');
  process.exit(0);
})();
