const http = require('http');
const fs = require('fs');
const path = require('path');

const DEBUG_PORT = 9399;
const CAPTIONS_DIR = path.join(__dirname, 'captions');
const POLL_INTERVAL = 500;
const SETTLE_TIME = 3000;
const WATCH_NAMES = ['izi', 'versano', 'https'];
const TRACK_SPEAKERS = [];

if (!fs.existsSync(CAPTIONS_DIR)) {
  fs.mkdirSync(CAPTIONS_DIR, { recursive: true });
}

let currentDay = null;
let logFile = null;
let lastMinute = null;
const recentLines = [];
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

const WRAP_WIDTH = 80;

function wrapText(text, width = WRAP_WIDTH, indent = '  ') {
  const words = text.split(/\s+/);
  const lines = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= width) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.map(l => indent + l).join('\n');
}

function appendLine(text) {
  for (let i = recentLines.length - 1; i >= 0; i--) {
    const prev = recentLines[i];
    if (text === prev) return;
    if (text.startsWith(prev)) {
      const file = getLogFile();
      const content = fs.readFileSync(file, 'utf8');
      const prevBlock = wrapText(prev) + '\n';
      const lastIdx = content.lastIndexOf(prevBlock);
      if (lastIdx !== -1) {
        const updated = content.slice(0, lastIdx) + wrapText(text) + '\n' + content.slice(lastIdx + prevBlock.length);
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
  const wrapped = wrapText(text);
  let output;
  if (minute !== lastMinute) {
    lastMinute = minute;
    output = `\n[${minute}]\n${wrapped}\n`;
  } else {
    output = `${wrapped}\n`;
  }
  fs.appendFileSync(getLogFile(), output);
}

// HTTP JSON helper
function httpGet(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get(`http://127.0.0.1:${DEBUG_PORT}${urlPath}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(data); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Raw CDP connection to a single tab via its WebSocket URL (no Puppeteer needed)
class CDPSession {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.nextId = 1;
    this.callbacks = new Map();
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.wsUrl);
      this.ws.addEventListener('open', () => resolve());
      this.ws.addEventListener('error', (ev) => reject(new Error('WebSocket error')));
      this.ws.addEventListener('message', (ev) => {
        const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
        if (msg.id && this.callbacks.has(msg.id)) {
          const { resolve, reject } = this.callbacks.get(msg.id);
          this.callbacks.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      });
      this.ws.addEventListener('close', () => {
        for (const { reject } of this.callbacks.values()) {
          reject(new Error('WebSocket closed'));
        }
        this.callbacks.clear();
      });
    });
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.callbacks.has(id)) {
          this.callbacks.delete(id);
          reject(new Error(`CDP timeout: ${method}`));
        }
      }, 30000);
    });
  }

  async evaluate(expression) {
    const result = await this.send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: false,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.text || 'Evaluation failed');
    }
    return result.result.value;
  }

  async close() {
    if (this.ws) this.ws.close();
  }
}

(async () => {
  try {
    console.log(`Connecting to Chrome on port ${DEBUG_PORT}...`);

    // Find the Meet page tab via Chrome's debug HTTP API
    const tabs = await httpGet('/json');
    const meetTab = tabs.find(t =>
      t.type === 'page' &&
      t.url.includes('meet.google.com/') &&
      !t.url.includes('/landing') &&
      !t.url.includes('blob:') &&
      !t.url.includes('meetsw.js') &&
      !t.url.includes('MeetingsWebWorker') &&
      t.webSocketDebuggerUrl
    );

    if (!meetTab) {
      throw new Error('No Meet page tab found');
    }

    console.log(`Found Meet tab: ${meetTab.url}`);
    console.log(`WebSocket: ${meetTab.webSocketDebuggerUrl}`);

    // Connect directly to this one tab via raw CDP WebSocket
    const cdp = new CDPSession(meetTab.webSocketDebuggerUrl);
    await cdp.connect();
    console.log('Connected to Meet tab via CDP');

    // Enable Runtime domain
    await cdp.send('Runtime.enable');
    console.log('Runtime domain enabled');

    console.log(`Saving captions to: ${getLogFile()}`);

    // Write "logged in" immediately
    appendLine('--- logged in ---');

    // Try to enable captions. Robust against label/locale variations and the
    // case where Meet hides the captions toggle behind an icon-only button.
    try {
      const captionsToggled = await cdp.evaluate(`
        (() => {
          const buttons = Array.from(document.querySelectorAll('button'));

          const ON = [
            /turn on caption/i, /captions on/i, /^captions$/i,
            /untertitel einschalten/i, /captions einschalten/i,
            /untertitel aktivieren/i, /aktiviere untertitel/i,
          ];
          const OFF = [/turn off/i, /captions off/i, /ausschalten/i, /deaktivieren/i];

          // 1. aria-label / data-tooltip
          for (const btn of buttons) {
            const label = (btn.getAttribute('aria-label') || '') + ' ' +
                          (btn.getAttribute('data-tooltip') || '');
            if (OFF.some(rx => rx.test(label))) continue;
            if (ON.some(rx => rx.test(label))) {
              btn.click();
              return 'clicked-label: ' + label.trim();
            }
          }

          // 2. Material icon: closed_caption_off = currently off, click to turn on
          for (const btn of buttons) {
            const html = btn.innerHTML || '';
            const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (html.includes('closed_caption_off') && !OFF.some(rx => rx.test(aria))) {
              btn.click();
              return 'clicked-icon: closed_caption_off';
            }
          }

          // 3. Already on?
          for (const btn of buttons) {
            const html = btn.innerHTML || '';
            if (html.includes('closed_caption') && !html.includes('closed_caption_off')) {
              return 'already-on';
            }
          }
          if (document.querySelectorAll('.ygicle').length > 0) return 'already-on';

          return 'not-found';
        })()
      `);
      console.log(`Captions toggle: ${captionsToggled}`);
    } catch (err) {
      console.log(`Caption toggle failed: ${err.message}`);
    }

    // Wait for captions to activate
    await new Promise(r => setTimeout(r, 2000));

    // Poll for captions with auto-reconnect on CDP errors
    const pending = new Map();
    let lastCount = 0;
    let consecutiveErrors = 0;

    while (true) {
      try {
        const entries = await cdp.evaluate(`
          (() => {
            const results = [];
            // Find the live captions panel (role=region, aria-label="Captions")
            const panel = document.querySelector('[role="region"][aria-label="Captions"], [role="region"][aria-label="Untertitel"]');
            if (panel) {
              const textEls = panel.querySelectorAll('.ygicle');
              const nameEls = panel.querySelectorAll('.adE6rb');
              for (let i = 0; i < textEls.length; i++) {
                const speakerEl = nameEls[i] ? nameEls[i].querySelector('.NWpY1d, span') : null;
                results.push({
                  speaker: speakerEl ? speakerEl.textContent.trim() : (nameEls[i] ? nameEls[i].textContent.trim() : ''),
                  text: textEls[i].textContent.trim()
                });
              }
            } else {
              // Fallback: scan whole document
              const textEls = document.querySelectorAll('.ygicle');
              const nameEls = document.querySelectorAll('.adE6rb');
              for (let i = 0; i < textEls.length; i++) {
                results.push({
                  speaker: nameEls[i] ? nameEls[i].textContent.trim() : '',
                  text: textEls[i].textContent.trim()
                });
              }
            }
            return JSON.stringify(results);
          })()
        `);

        consecutiveErrors = 0;
        const parsed = JSON.parse(entries || '[]');
        const now = Date.now();

        for (let i = 0; i < parsed.length; i++) {
          const entry = parsed[i];
          if (!entry.text) continue;
          const prev = pending.get(i);
          if (!prev || prev.text !== entry.text) {
            pending.set(i, { speaker: entry.speaker, text: entry.text, lastChanged: now, logged: false });
          }
        }

        for (const [idx, cap] of pending) {
          if (!cap.logged && (now - cap.lastChanged) >= SETTLE_TIME) {
            cap.logged = true;

            const lower = (cap.speaker + ' ' + cap.text).toLowerCase();
            for (const name of WATCH_NAMES) {
              if (lower.includes(name)) {
                const alert = `${cap.speaker}: "${cap.text}"`;
                console.log(`*** ALERT [${name}]: ${alert}`);
                appendLine(`*** ALERT [${name}]: ${alert}`);
              }
            }

            if (TRACK_SPEAKERS.length > 0 &&
                !TRACK_SPEAKERS.some(s => cap.speaker.toLowerCase().includes(s))) {
              continue;
            }

            appendLine(cap.text);
            console.log(`${cap.speaker}: ${cap.text}`);
          }
        }

        if (parsed.length < lastCount) {
          for (const key of pending.keys()) {
            if (key >= parsed.length) pending.delete(key);
          }
        }
        lastCount = parsed.length;
      } catch (err) {
        consecutiveErrors++;
        const fatal = err.message.includes('WebSocket closed') ||
                      err.message.includes('Target closed') ||
                      err.message.includes('Session closed');

        if (fatal || consecutiveErrors >= 5) {
          // Try to reconnect to Meet tab
          console.log(`CDP error (${consecutiveErrors}x): ${err.message} — attempting reconnect...`);
          try {
            cdp.close();
            await new Promise(r => setTimeout(r, 3000));
            const tabs = await httpGet('/json');
            const meetTab = tabs.find(t =>
              t.type === 'page' &&
              t.url.includes('meet.google.com/') &&
              !t.url.includes('/landing') &&
              t.webSocketDebuggerUrl
            );
            if (!meetTab) {
              console.log('No Meet tab found after reconnect attempt — exiting');
              appendLine('--- Meeting ended ---');
              break;
            }
            const newCdp = new CDPSession(meetTab.webSocketDebuggerUrl);
            await newCdp.connect();
            await newCdp.send('Runtime.enable');
            // replace cdp reference
            Object.assign(cdp, newCdp);
            cdp.ws = newCdp.ws;
            cdp.callbacks = newCdp.callbacks;
            cdp.nextId = newCdp.nextId;
            consecutiveErrors = 0;
            console.log('Reconnected to Meet tab');
          } catch (reconnErr) {
            console.log(`Reconnect failed: ${reconnErr.message} — exiting`);
            appendLine('--- Meeting ended ---');
            break;
          }
        } else {
          console.error(`Poll error: ${err.message}`);
        }
      }

      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
    }

    cdp.close();
    process.exit(0);
  } catch (err) {
    console.error(`Caption tracking failed: ${err.message}`);
    process.exit(1);
  }
})();
