#!/usr/bin/env node
// Walks through EVERY step of the QA lab currently open in the automation Chrome
// (port 9410), capturing each step's instructions, and saves the whole lab to
// server/lab-notes/<lab-slug>.txt.
//
// It clicks the lab's "Next" button to advance, scraping each step, until there
// are no more steps. Then it returns you to the step you started on.
//
// Usage: node save-lab-all.js   (lab open on its session page in Chrome 9410)

const puppeteer = require('puppeteer-core');
const path = require('path');
const fs = require('fs');

const DEBUG_PORT = 9410;
const NOTES_DIR = path.join(__dirname, 'lab-notes');
const LOG_FILE = '/tmp/save-lab.log';

function log(msg) {
  process.stdout.write(msg + '\n');
  try { fs.appendFileSync(LOG_FILE, msg + '\n'); } catch {}
}

// Extract { title, step, body } from the current session page. The ACTIVE step
// name is the step heading immediately preceding the visible "Introduction"
// section of the instruction body (reliable across steps).
async function scrape(page) {
  return page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    const full = main.innerText;

    let title = '';
    const tm = full.match(/HANDS-ON LAB\s*\n+\s*([^\n]+)/i);
    if (tm) title = tm[1].trim();

    // Active step: the heading just before the body's "Introduction" h3.
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

    // Body: from Introduction/Instructions onward, minus the feedback footer.
    let body = full;
    const i1 = full.indexOf('Introduction');
    const i2 = full.indexOf('Instructions');
    const cands = [i1, i2].filter(i => i >= 0);
    const startIdx = cands.length ? Math.min(...cands) : full.indexOf('HANDS-ON LAB');
    if (startIdx >= 0) body = full.slice(startIdx);
    body = body.replace(/Report lab step feedback[\s\S]*$/i, '').trim();

    return { title, step, body };
  });
}

// Click the lab's "Next" button. Returns true if clicked.
async function clickNext(page) {
  return page.evaluate(() => {
    const btn = [...document.querySelectorAll('button, a')]
      .find(e => /^next$/i.test((e.innerText || '').trim()) && !e.disabled);
    if (btn) { btn.click(); return true; }
    return false;
  }).catch(() => false);
}

async function clickBack(page) {
  return page.evaluate(() => {
    const btn = [...document.querySelectorAll('button, a')]
      .find(e => /^back$/i.test((e.innerText || '').trim()) && !e.disabled);
    if (btn) { btn.click(); return true; }
    return false;
  }).catch(() => false);
}

(async () => {
  let browser;
  try {
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${DEBUG_PORT}`, defaultViewport: null });
  } catch {
    log('QA automation Chrome (port 9410) is not running. Open the QA Platform first.');
    process.exit(1);
  }

  const pages = await browser.pages();
  const page = pages.find(p => /\/lab\/.*session-page/.test(p.url()));
  if (!page) {
    log('No lab session page open. Open a lab and reach its instructions, then run this again.');
    browser.disconnect();
    process.exit(1);
  }

  const slugMatch = page.url().match(/\/lab\/([^/]+)\//);
  const slug = slugMatch ? slugMatch[1] : 'unknown-lab';
  const file = path.join(NOTES_DIR, `${slug}.txt`);
  fs.mkdirSync(NOTES_DIR, { recursive: true });

  const startData = await scrape(page);
  const startStep = startData.step;
  log(`Capturing all steps of "${startData.title || slug}" (you are on "${startStep}")...`);

  // 1) Rewind to the FIRST step so we capture the whole lab regardless of where
  //    the user currently is.
  for (let i = 0; i < 30; i++) {
    const before = (await scrape(page)).step;
    const moved = await clickBack(page);
    if (!moved) break;
    await new Promise(r => setTimeout(r, 2000));
    const after = (await scrape(page)).step;
    if (after === before) break; // didn't move → already at first step
  }

  // 2) Walk forward through every step, collecting them in order.
  const collected = [];
  const seen = new Set();

  for (let i = 0; i < 30; i++) { // safety cap
    const d = await scrape(page);
    const key = d.step || d.body.slice(0, 40);
    if (!seen.has(key)) {
      seen.add(key);
      collected.push(d);
      log(`  • captured: ${d.step || '(step ' + collected.length + ')'}`);
    } else {
      // Same step seen again → no forward progress, stop.
      log('  Reached the last step.');
      break;
    }
    const moved = await clickNext(page);
    if (!moved) { log('  Reached the last step (no Next).'); break; }
    await new Promise(r => setTimeout(r, 2500));
  }

  // Write the whole lab fresh (full rewrite so order is clean).
  let out =
`================================================================
LAB: ${startData.title || slug}
URL slug: ${slug}
Captured: ${new Date().toISOString()}
Steps: ${collected.length}
================================================================
`;
  for (const d of collected) {
    out +=
`
### STEP: ${d.step || '(unnamed)'}

${d.body}

----------------------------------------------------------------
`;
  }
  fs.writeFileSync(file, out);
  log(`Saved ${collected.length} step(s) → ${path.relative(path.join(__dirname, '..'), file)}`);

  // Return to where the user started (we ended on the last step). Walk Back
  // until we reach the original step.
  if (startStep) {
    log(`Returning you to "${startStep}"...`);
    for (let i = 0; i < 30; i++) {
      const d = await scrape(page);
      if ((d.step || '') === startStep) break;
      const back = await clickBack(page);
      if (!back) break;
      await new Promise(r => setTimeout(r, 1500));
    }
  }

  browser.disconnect();
  process.exit(0);
})();
