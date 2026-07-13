#!/usr/bin/env node
// Reads the instructions of the QA lab currently open in the automation Chrome
// (port 9410) and saves them to server/lab-notes/<lab-slug>.txt.
//
// Designed to be run repeatedly per lab: each run captures the CURRENT step's
// instructions and appends it to that lab's file (de-duplicated by step title),
// so by the time you finish a multi-step lab the file holds the whole thing.
//
// Usage: node save-lab.js   (lab must be open on its session page in Chrome 9410)

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

(async () => {
  let browser;
  try {
    browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
      defaultViewport: null,
    });
  } catch {
    log('QA automation Chrome (port 9410) is not running. Open the QA Platform first.');
    process.exit(1);
  }

  const pages = await browser.pages();
  const sp = pages.find(p => /\/lab\/.*session-page/.test(p.url()));
  if (!sp) {
    log('No lab session page open. Open a lab and reach its instructions, then run this again.');
    browser.disconnect();
    process.exit(1);
  }

  // Lab slug from the URL, e.g. introduction-virtual-private-cloud-vpc
  const slugMatch = sp.url().match(/\/lab\/([^/]+)\//);
  const slug = slugMatch ? slugMatch[1] : 'unknown-lab';

  const data = await sp.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    const full = main.innerText;

    // Lab title — the line after "HANDS-ON LAB".
    let title = '';
    const tm = full.match(/HANDS-ON LAB\s*\n+\s*([^\n]+)/i);
    if (tm) title = tm[1].trim();

    // Active step name = the step heading just before the body's "Introduction"
    // (or "Instructions") section. Reliable across all steps.
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

    // Instruction body — from "Introduction"/"Instructions" onward, trimmed of
    // the trailing feedback widget.
    let body = full;
    const startIdx = (() => {
      const i1 = full.indexOf('Introduction');
      const i2 = full.indexOf('Instructions');
      const cands = [i1, i2].filter(i => i >= 0);
      return cands.length ? Math.min(...cands) : full.indexOf('HANDS-ON LAB');
    })();
    if (startIdx >= 0) body = full.slice(startIdx);
    body = body.replace(/Report lab step feedback[\s\S]*$/i, '').trim();

    return { title, step, body };
  });

  fs.mkdirSync(NOTES_DIR, { recursive: true });
  const file = path.join(NOTES_DIR, `${slug}.txt`);

  // Header written once when the file is first created.
  if (!fs.existsSync(file)) {
    const header =
`================================================================
LAB: ${data.title || slug}
URL slug: ${slug}
Captured: ${new Date().toISOString()}
================================================================
`;
    fs.writeFileSync(file, header);
  }

  // Skip if this exact step body is already saved (avoid duplicates on re-runs).
  const existing = fs.readFileSync(file, 'utf8');
  const stepKey = (data.step || data.body.slice(0, 40)).trim();
  if (existing.includes(`### STEP: ${stepKey}`)) {
    log(`Already saved step "${stepKey}" for ${slug} — nothing new.`);
    browser.disconnect();
    process.exit(0);
  }

  const block =
`
### STEP: ${stepKey}
(captured ${new Date().toLocaleString('de-DE')})

${data.body}

----------------------------------------------------------------
`;
  fs.appendFileSync(file, block);
  log(`Saved step "${stepKey}" → ${path.relative(path.join(__dirname, '..'), file)}`);

  browser.disconnect();
  process.exit(0);
})();
