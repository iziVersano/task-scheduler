const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');

const DEBUG_PORT = 9399;
const CAPTIONS_DIR = path.join(__dirname, 'captions');
const POLL_INTERVAL = 500;       // poll fast to catch all changes
const SETTLE_TIME = 3000;        // wait 3s of no changes before logging
const WATCH_NAMES = ['izi', 'versano', 'https']; // words to watch for (lowercase)
const TRACK_SPEAKERS = ['stefan koehler']; // only save captions from these speakers (lowercase, empty = all)

// Ensure captions directory exists
if (!fs.existsSync(CAPTIONS_DIR)) {
  fs.mkdirSync(CAPTIONS_DIR, { recursive: true });
}

let currentDay = null;
let logFile = null;
let lastMinute = null;
const recentLines = []; // track recent lines to avoid duplicates
const RECENT_LIMIT = 20;

function getLogFile() {
  const today = new Date().toISOString().split('T')[0];
  if (today !== currentDay) {
    currentDay = today;
    logFile = path.join(CAPTIONS_DIR, `${today}.txt`);
    lastMinute = null;
    recentLines.length = 0;
    console.log(`New caption file: ${logFile}`);
  }
  return logFile;
}

function appendLine(text) {
  // Check if this text is a duplicate or extension of a recent line
  for (let i = recentLines.length - 1; i >= 0; i--) {
    const prev = recentLines[i];
    if (text === prev) return; // exact duplicate
    if (text.startsWith(prev)) {
      // New text extends a previous line — replace it in the file
      const file = getLogFile();
      const content = fs.readFileSync(file, 'utf8');
      const lastIdx = content.lastIndexOf(`  ${prev}\n`);
      if (lastIdx !== -1) {
        const updated = content.slice(0, lastIdx) + `  ${text}\n` + content.slice(lastIdx + `  ${prev}\n`.length);
        fs.writeFileSync(file, updated);
        recentLines[i] = text;
        return;
      }
    }
  }

  recentLines.push(text);
  if (recentLines.length > RECENT_LIMIT) recentLines.shift();

  const now = new Date();
  const minute = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  let output;
  if (minute !== lastMinute) {
    lastMinute = minute;
    output = `\n[${minute}]\n  ${text}\n`;
  } else {
    output = `  ${text}\n`;
  }
  fs.appendFileSync(getLogFile(), output);
}


(async () => {
  let browser;
  try {
    console.log(`Connecting to Chrome on port ${DEBUG_PORT}...`);
    browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
      defaultViewport: null,
    });

    const pages = await browser.pages();
    let meetPage = null;
    for (const p of pages) {
      if (p.url().includes('meet.google.com')) {
        meetPage = p;
        break;
      }
    }

    if (!meetPage) {
      throw new Error('No Google Meet tab found');
    }

    console.log(`Found Meet tab: ${meetPage.url()}`);
    console.log(`Saving captions to: ${getLogFile()}`);
    console.log(`Watching for names: ${WATCH_NAMES.join(', ')}`);
    appendLine('--- Caption tracking started ---');

    // Track pending captions: key = element index, value = { speaker, text, lastChanged }
    // Only log a caption once it has stopped changing for SETTLE_TIME
    const pending = new Map();
    let lastCount = 0;

    while (true) {
      try {
        const entries = await meetPage.evaluate(() => {
          const textEls = document.querySelectorAll('.ygicle');
          const nameEls = document.querySelectorAll('.adE6rb');
          const results = [];
          for (let i = 0; i < textEls.length; i++) {
            results.push({
              speaker: nameEls[i] ? nameEls[i].textContent.trim() : '',
              text: textEls[i].textContent.trim()
            });
          }
          return results;
        });

        const now = Date.now();

        for (let i = 0; i < entries.length; i++) {
          const entry = entries[i];
          if (!entry.text) continue;
          const prev = pending.get(i);

          if (!prev || prev.text !== entry.text) {
            // Text is new or still changing — update pending
            pending.set(i, { speaker: entry.speaker, text: entry.text, lastChanged: now, logged: false });
          }
        }

        // Check for settled captions (unchanged for SETTLE_TIME)
        for (const [idx, cap] of pending) {
          if (!cap.logged && (now - cap.lastChanged) >= SETTLE_TIME) {
            cap.logged = true;

            // Check for watched words (from any speaker)
            const lower = (cap.speaker + ' ' + cap.text).toLowerCase();
            for (const name of WATCH_NAMES) {
              if (lower.includes(name)) {
                const alert = `${cap.speaker}: "${cap.text}"`;
                console.log(`*** ALERT [${name}]: ${alert}`);
                appendLine(`*** ALERT [${name}]: ${alert}`);
              }
            }

            // Skip speakers not in TRACK_SPEAKERS (if list is not empty)
            if (TRACK_SPEAKERS.length > 0 &&
                !TRACK_SPEAKERS.some(s => cap.speaker.toLowerCase().includes(s))) {
              continue;
            }

            const line = `${cap.speaker}: ${cap.text}`;
            appendLine(line);
            console.log(line);
          }
        }

        // Clean up old entries that are no longer in the DOM
        if (entries.length < lastCount) {
          for (const key of pending.keys()) {
            if (key >= entries.length) pending.delete(key);
          }
        }
        lastCount = entries.length;
      } catch (err) {
        if (err.message.includes('detached') || err.message.includes('closed') ||
            err.message.includes('Target closed') || err.message.includes('Session closed')) {
          console.log('Meeting ended or tab closed');
          appendLine('--- Meeting ended ---');
          break;
        }
        console.error(`Poll error: ${err.message}`);
        appendLine(`*** Poll error: ${err.message}`);
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    }

    browser.disconnect();
    process.exit(0);
  } catch (err) {
    console.error(`Caption tracking failed: ${err.message}`);
    try { if (browser) browser.disconnect(); } catch {}
    process.exit(1);
  }
})();
