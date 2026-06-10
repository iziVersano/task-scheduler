const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const http = require('http');
const fs = require('fs');

const CHROME_PATH = '/usr/bin/google-chrome';
const USER_DATA_DIR = path.join(os.homedir(), '.config', 'google-chrome-meet');
const DEBUG_PORT = 9399;
const LOG_FILE = '/tmp/meet-join.log';
const DESKTOP_ENV_FILE = path.join(os.homedir(), '.config', 'task-scheduler', 'desktop-env');

// Load graphical-session env vars (DISPLAY, WAYLAND_DISPLAY, XDG_RUNTIME_DIR,
// etc.) from a snapshot file so Chrome can open a window even when the scheduler
// process was started outside an interactive desktop session (e.g. via systemd
// at boot).
function loadDesktopEnv() {
  try {
    const text = fs.readFileSync(DESKTOP_ENV_FILE, 'utf8');
    const env = {};
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) env[m[1]] = m[2];
    }
    return env;
  } catch {
    return {};
  }
}
const DESKTOP_ENV = loadDesktopEnv();

const meetUrl = process.argv[2];
if (!meetUrl || !meetUrl.includes('meet.google.com')) {
  console.error('Usage: node meet-join.js <google-meet-url>');
  process.exit(1);
}

function log(msg) {
  const line = `[${new Date().toLocaleTimeString('de-DE')}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

// Remove stale Chrome lock files that prevent a new instance from starting
function cleanStaleLocks() {
  for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    const lockPath = path.join(USER_DATA_DIR, name);
    try {
      const target = fs.readlinkSync(lockPath);
      const match = target.match(/-(\d+)$/);
      if (match) {
        try { process.kill(Number(match[1]), 0); } catch {
          fs.unlinkSync(lockPath);
          log(`Removed stale lock: ${name}`);
        }
      }
    } catch {}
  }
}

// Launch Chrome as a visible, foreground process with the Meet URL
function launchChromeDetached(url) {
  const args = [
    `--user-data-dir=${USER_DATA_DIR}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--use-fake-ui-for-media-stream',
    '--start-maximized',
  ];
  if (url) args.push(url);

  const child = spawn(CHROME_PATH, args, {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, ...DESKTOP_ENV },
  });
  child.unref();
  return child.pid;
}

// Bring Chrome window to front
function focusChromeWindow() {
  try {
    // Try multiple methods to bring Chrome to foreground
    const { execSync } = require('child_process');
    // gdbus call works on GNOME desktops (Ubuntu)
    execSync(
      `gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "global.get_window_actors().forEach(a => { if(a.meta_window.get_title().includes('Chrome') || a.meta_window.get_title().includes('Meet')) a.meta_window.activate(global.get_current_time()); })" 2>/dev/null || wmctrl -a Chrome 2>/dev/null || xdotool search --name Chrome windowactivate 2>/dev/null || true`,
      { env: { ...process.env, DISPLAY: ':1' } }
    );
  } catch {}
}

// Wait for Chrome's debug port to be ready
function waitForDebugPort(maxWait = 30000) {
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

// Skip this run if a previous run **today** already succeeded. We track this
// in a tiny stamp file (date string), written after a confirmed join, so we
// can't be fooled by accumulated log history.
const SUCCESS_STAMP = '/tmp/meet-join.last-success';

function alreadyJoinedToday() {
  try {
    const stamp = fs.readFileSync(SUCCESS_STAMP, 'utf8').trim();
    const today = new Date().toISOString().slice(0, 10);
    return stamp === today;
  } catch {
    return false;
  }
}

function markSuccessToday() {
  const today = new Date().toISOString().slice(0, 10);
  try { fs.writeFileSync(SUCCESS_STAMP, today); } catch {}
}

(async () => {
  let browser;
  try {
    if (alreadyJoinedToday()) {
      log(`--- meet-join SKIPPED: already joined today (see prior log) ---`);
      process.exit(0);
    }

    log(`--- meet-join started for ${meetUrl} ---`);

    const cleanUrl = meetUrl.replace(/[?&]authuser=\d+/, '');

    // Check if Chrome is already running on debug port
    const debugPortReady = await new Promise((resolve) => {
      const req = http.get(`http://127.0.0.1:${DEBUG_PORT}/json/version`, (res) => {
        res.resume();
        resolve(true);
      });
      req.on('error', () => resolve(false));
      req.end();
    });

    if (debugPortReady) {
      log('Chrome debug port already active, reusing instance');
      focusChromeWindow();
    } else {
      cleanStaleLocks();
      launchChromeDetached(cleanUrl);
      log('Launched Meet Chrome with debug port');
    }

    await waitForDebugPort();
    log('Chrome debug port ready');

    browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
      defaultViewport: null,
      protocolTimeout: 120000,
    });

    // Open YouTube music in a new tab alongside Meet
    const YOUTUBE_URL = 'https://www.youtube.com/watch?v=h6zdVaAe0OE&list=RDMMhFYKPE68PgE&index=9';
    try {
      const ytPage = await browser.newPage();
      await ytPage.goto(YOUTUBE_URL, { waitUntil: 'domcontentloaded', timeout: 15000 });
      log(`Opened YouTube tab: ${ytPage.url()}`);
    } catch (ytErr) {
      log(`YouTube tab failed (non-fatal): ${ytErr.message}`);
    }

    // If Chrome was already running, open the Meet URL in a new tab
    // If freshly launched, Chrome already has it — find the existing tab
    const pages = await browser.pages();
    let page = pages.find(p => p.url().includes('meet.google.com'));

    if (!page) {
      // Chrome was already running — open Meet in a new tab
      page = await browser.newPage();
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });
      log(`Navigating to: ${cleanUrl}`);
      await page.goto(cleanUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    } else {
      // Existing Meet tab found. If it's NOT on the target meeting URL (e.g.
      // landing page, ended-meeting screen, sign-in wall, stale URL), force a
      // navigation. Otherwise just wait for load.
      const tabUrl = page.url();
      const onTarget = tabUrl.includes(cleanUrl.split('/').pop());
      if (!onTarget) {
        log(`Existing tab at ${tabUrl} — forcing navigation to ${cleanUrl}`);
        try {
          await page.goto(cleanUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        } catch (e) {
          log(`Forced navigation failed: ${e.message}`);
        }
      } else {
        log('Found existing Meet tab on target meeting, waiting for load...');
        try {
          await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});
        } catch {}
        await new Promise(r => setTimeout(r, 3000));
      }
    }

    // Bring window to foreground
    focusChromeWindow();
    await page.bringToFront();
    log(`Page loaded: ${page.url()}`);

    // Handle login redirect
    if (page.url().includes('accounts.google.com')) {
      log('Redirected to Google login, waiting for auto-login...');
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
        log(`After login redirect: ${page.url()}`);
      } catch {
        log('Login wait timed out');
      }
    }

    if (page.url().includes('accounts.google.com/signin') ||
        page.url().includes('accounts.google.com/ServiceLogin')) {
      throw new Error(
        'Not logged in. Run this once to set up:\n' +
        '  google-chrome --user-data-dir=$HOME/.config/google-chrome-meet\n' +
        'Log into Google, then close the browser.'
      );
    }

    // If redirected to landing page, navigate directly to the meeting URL
    if (page.url().includes('meet.google.com/landing') || !page.url().includes(cleanUrl.split('/').pop())) {
      log(`Redirected to ${page.url()}, navigating directly to meeting...`);
      await page.goto(cleanUrl, { waitUntil: 'networkidle2', timeout: 30000 });
      log(`After redirect fix: ${page.url()}`);

      // If still on landing page, the meeting doesn't exist or hasn't started
      if (page.url().includes('meet.google.com/landing')) {
        throw new Error('Meeting not available — redirected to landing page. The meeting may have ended or not started yet.');
      }
    }

    // Wait for Meet UI to load (pre-join OR in-meeting)
    log('Waiting for Meet UI...');
    await page.waitForSelector(
      '[data-is-muted], [aria-label*="microphone" i], [aria-label*="Mikrofon" i], [aria-label*="Join" i], [aria-label*="beitreten" i], [aria-label*="teilnehmen" i], [aria-label*="call_end" i], button[aria-label*="Leave" i], button[aria-label*="Verlassen" i]',
      { timeout: 30000 }
    ).catch(() => log('Selector wait timed out, continuing anyway'));

    // Take debug screenshot
    await page.screenshot({ path: '/tmp/meet-prejoin.png' });
    log('Screenshot saved to /tmp/meet-prejoin.png');

    // Detect if we are already inside the meeting (in-call toolbar has "Leave call" / "Anruf beenden")
    const alreadyInMeeting = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      return btns.some(b => {
        const l = (b.getAttribute('aria-label') || '').toLowerCase();
        return l.includes('leave') || l.includes('verlassen') || l.includes('anruf beenden');
      });
    });
    log(`Already in meeting: ${alreadyInMeeting}`);

    // Helper: mute mic
    async function muteMic() {
      const result = await page.evaluate(() => {
        const els = document.querySelectorAll('[data-is-muted]');
        for (const el of els) {
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          const tooltip = (el.getAttribute('data-tooltip') || '').toLowerCase();
          if (aria.includes('mikrofon') || aria.includes('microphone') || tooltip.includes('microphone') || tooltip.includes('mikrofon')) {
            if (el.getAttribute('data-is-muted') === 'false') { el.click(); return 'clicked'; }
            return 'already-muted';
          }
        }
        // fallback: button with turn off mic label
        const btns = Array.from(document.querySelectorAll('button'));
        for (const btn of btns) {
          const l = (btn.getAttribute('aria-label') || '').toLowerCase();
          if ((l.includes('microphone') || l.includes('mikrofon')) && (l.includes('turn off') || l.includes('ausschalten'))) {
            btn.click(); return 'clicked-btn';
          }
        }
        return 'not-found';
      });
      if (result === 'not-found') {
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyD');
        await page.keyboard.up('Control');
        return 'ctrl+d fallback';
      }
      return result;
    }

    // Helper: mute camera
    async function muteCamera() {
      const result = await page.evaluate(() => {
        const els = document.querySelectorAll('[data-is-muted]');
        for (const el of els) {
          const aria = (el.getAttribute('aria-label') || '').toLowerCase();
          const tooltip = (el.getAttribute('data-tooltip') || '').toLowerCase();
          if (aria.includes('kamera') || aria.includes('camera') || tooltip.includes('camera') || tooltip.includes('kamera')) {
            if (el.getAttribute('data-is-muted') === 'false') { el.click(); return 'clicked'; }
            return 'already-muted';
          }
        }
        const btns = Array.from(document.querySelectorAll('button'));
        for (const btn of btns) {
          const l = (btn.getAttribute('aria-label') || '').toLowerCase();
          if ((l.includes('camera') || l.includes('kamera')) && (l.includes('turn off') || l.includes('ausschalten'))) {
            btn.click(); return 'clicked-btn';
          }
        }
        return 'not-found';
      });
      if (result === 'not-found') {
        await page.keyboard.down('Control');
        await page.keyboard.press('KeyE');
        await page.keyboard.up('Control');
        return 'ctrl+e fallback';
      }
      return result;
    }

    // Helper: enable captions. Tries several signals because Meet's button
    // label varies by locale and the control sometimes hides in an overflow.
    async function enableCaptions() {
      const result = await page.evaluate(() => {
        const buttons = Array.from(document.querySelectorAll('button'));

        // 1. aria-label / data-tooltip text (multilingual + variations)
        const ON_PATTERNS = [
          /turn on caption/i,
          /captions on/i,
          /^captions$/i,
          /untertitel einschalten/i,
          /captions einschalten/i,
          /untertitel aktivieren/i,
          /aktiviere untertitel/i,
        ];
        const OFF_BLOCKS = [/turn off/i, /captions off/i, /ausschalten/i, /deaktivieren/i];

        for (const btn of buttons) {
          const label = (btn.getAttribute('aria-label') || '') + ' ' +
                        (btn.getAttribute('data-tooltip') || '');
          if (OFF_BLOCKS.some(rx => rx.test(label))) continue;
          if (ON_PATTERNS.some(rx => rx.test(label))) {
            btn.click();
            return 'clicked-label: ' + label.trim();
          }
        }

        // 2. Material icon: closed_caption_off means captions are currently off
        for (const btn of buttons) {
          const html = btn.innerHTML || '';
          const aria = (btn.getAttribute('aria-label') || '').toLowerCase();
          if (html.includes('closed_caption_off') && !OFF_BLOCKS.some(rx => rx.test(aria))) {
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

        return 'not-found';
      });
      log(`Captions: ${result}`);

      // 4. Fallback: Meet's built-in keyboard shortcut "c" toggles captions.
      // Only press if everything above failed.
      if (result === 'not-found') {
        try {
          await page.bringToFront();
          await page.keyboard.press('c');
          log('Captions: pressed shortcut "c" as fallback');
          return 'shortcut-c';
        } catch (e) {
          log(`Captions shortcut failed: ${e.message}`);
        }
      }
      return result;
    }

    // Helper: set meeting/caption language to English
    async function setCaptionLanguageEnglish() {
      // Open caption settings dialog
      const settingsOpened = await page.evaluate(() => {
        const btns = Array.from(document.querySelectorAll('button'));
        for (const btn of btns) {
          const l = (btn.getAttribute('aria-label') || '').toLowerCase();
          if (l.includes('open caption settings') || l.includes('untertitel-einstellungen öffnen') ||
              l.includes('caption settings')) {
            btn.click();
            return 'opened: ' + btn.getAttribute('aria-label');
          }
        }
        return 'not-found';
      });
      log(`Caption settings: ${settingsOpened}`);
      if (settingsOpened === 'not-found') return 'menu-not-found';

      await new Promise(r => setTimeout(r, 1500));

      // Open the "Meeting language" combobox
      const comboOpened = await page.evaluate(() => {
        const combo = document.querySelector('[aria-label="Meeting language"], [aria-label="Konferenzsprache"]');
        if (!combo) return 'no-combo';
        combo.click();
        return 'opened';
      });
      log(`Language combobox: ${comboOpened}`);
      if (comboOpened !== 'opened') return 'combo-not-found';

      await new Promise(r => setTimeout(r, 1000));

      // Click English option in dropdown
      const langSet = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('[role="option"], [role="menuitem"], li'));
        for (const item of items) {
          const text = (item.textContent || '').trim().toLowerCase();
          if (text === 'english' || text.startsWith('english ') || text.startsWith('english(')) {
            item.scrollIntoView();
            item.click();
            return 'set: ' + item.textContent.trim();
          }
        }
        return 'english-not-found';
      });
      log(`Caption language set: ${langSet}`);

      await new Promise(r => setTimeout(r, 500));

      // Close the settings dialog
      await page.evaluate(() => {
        const closeBtns = Array.from(document.querySelectorAll('button')).filter(b => {
          const l = (b.getAttribute('aria-label') || '').toLowerCase();
          return l === 'close' || l === 'schließen' || l.includes('close dialog');
        });
        if (closeBtns.length) closeBtns[0].click();
      });

      return langSet;
    }

    if (alreadyInMeeting) {
      // Already in the call — just mute and enable captions
      log('Already in meeting, muting and enabling captions...');
      markSuccessToday();
      log(`Mic: ${await muteMic()}`);
      await new Promise(r => setTimeout(r, 300));
      log(`Camera: ${await muteCamera()}`);
      await new Promise(r => setTimeout(r, 300));
      await enableCaptions();
      await new Promise(r => setTimeout(r, 1000));
      await setCaptionLanguageEnglish();
    } else {
      // Pre-join flow
      log(`Mic: ${await muteMic()}`);
      await new Promise(r => setTimeout(r, 500));
      log(`Camera: ${await muteCamera()}`);
      await new Promise(r => setTimeout(r, 2000));

      // Dismiss popups
      await page.evaluate(() => {
        const dismissWords = ['not now', 'dismiss', 'got it', 'no thanks', 'skip'];
        document.querySelectorAll('button').forEach(btn => {
          const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
          if (dismissWords.some(w => text === w)) btn.click();
        });
      });
      await new Promise(r => setTimeout(r, 1000));

      // Close Meeting Tools dialog
      await page.evaluate(() => {
        document.querySelectorAll('button').forEach(btn => {
          const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
          if (text === 'close') btn.click();
        });
      });
      await new Promise(r => setTimeout(r, 1000));

      // Click join — check all buttons, skip Gemini/Transcribe
      const joined = await page.evaluate(() => {
        const joinKeywords = ['join now', 'join the call', 'ask to join', 'join here too', 'switch here',
          'jetzt beitreten', 'jetzt teilnehmen', 'jetzt am anruf teilnehmen',
          'mach auch hier mit', 'hier wechseln', 'um teilnahme bitten', 'beitreten'];
        const skipWords = ['gemini', 'transcribe', 'companion', 'present', 'notes',
          'begleitmodus', 'präsentieren', 'transkript', 'anmelden', 'stornieren', 'tactiq'];
        const allButtons = Array.from(document.querySelectorAll('button'));
        for (const btn of allButtons) {
          const rawText = (btn.innerText || btn.textContent || '').replace(/\n/g, ' ').trim().toLowerCase();
          const label = (btn.getAttribute('aria-label') || '').toLowerCase();
          if (skipWords.some(w => rawText.includes(w) || label.includes(w))) continue;
          for (const kw of joinKeywords) {
            if (rawText === kw || rawText.includes(kw) || label.includes(kw)) {
              btn.scrollIntoView();
              btn.click();
              return `${kw} (text: "${rawText}")`;
            }
          }
        }
        return null;
      });

      if (joined) {
        log(`Clicked join: "${joined}"`);
      } else {
        const btns = await page.evaluate(() => {
          return Array.from(document.querySelectorAll('button'))
            .filter(b => b.offsetParent !== null)
            .map(b => (b.innerText || '').trim().slice(0, 50))
            .filter(Boolean);
        });
        log(`No join button found. Visible buttons: ${JSON.stringify(btns)}`);

        // Stale Meet tab — reload and try one more time. This commonly recovers
        // when Chrome was reused from a previous session and the pre-join UI
        // didn't render (Meeting ended, sign-in wall, broken DOM).
        log('Reloading the page and retrying join once...');
        try {
          await page.goto(cleanUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        } catch (e) {
          log(`Reload failed: ${e.message}`);
        }
        await new Promise(r => setTimeout(r, 5000));

        const retryJoined = await page.evaluate(() => {
          const joinKeywords = ['join now', 'join the call', 'ask to join', 'join here too', 'switch here',
            'jetzt beitreten', 'jetzt teilnehmen', 'jetzt am anruf teilnehmen',
            'mach auch hier mit', 'hier wechseln', 'um teilnahme bitten', 'beitreten'];
          const skipWords = ['gemini', 'transcribe', 'companion', 'present', 'notes',
            'begleitmodus', 'präsentieren', 'transkript', 'anmelden', 'stornieren', 'tactiq'];
          const allButtons = Array.from(document.querySelectorAll('button'));
          for (const btn of allButtons) {
            const rawText = (btn.innerText || btn.textContent || '').replace(/\n/g, ' ').trim().toLowerCase();
            const label = (btn.getAttribute('aria-label') || '').toLowerCase();
            if (skipWords.some(w => rawText.includes(w) || label.includes(w))) continue;
            for (const kw of joinKeywords) {
              if (rawText === kw || rawText.includes(kw) || label.includes(kw)) {
                btn.scrollIntoView();
                btn.click();
                return `${kw} (text: "${rawText}")`;
              }
            }
          }
          return null;
        });

        if (retryJoined) {
          log(`Retry succeeded — clicked join: "${retryJoined}"`);
        } else {
          const retryBtns = await page.evaluate(() => {
            return Array.from(document.querySelectorAll('button'))
              .filter(b => b.offsetParent !== null)
              .map(b => (b.innerText || '').trim().slice(0, 50))
              .filter(Boolean);
          });
          log(`Retry also failed. Visible buttons: ${JSON.stringify(retryBtns)}`);
          throw new Error('Could not find Join button (after reload)');
        }
      }

      // Wait for meeting to load, dismiss post-join popups
      const postJoinDismiss = ['not now', 'dismiss', 'got it', 'close', 'no thanks', 'skip'];
      for (let i = 0; i < 10; i++) {
        await new Promise(r => setTimeout(r, 500));
        await page.evaluate((words) => {
          document.querySelectorAll('button').forEach(btn => {
            const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
            if (words.includes(text)) btn.click();
          });
        }, postJoinDismiss);
      }
      log('Successfully joined the meeting');
      markSuccessToday();
    }

    // Wait for in-meeting toolbar to fully render before muting
    log('Waiting for in-meeting toolbar...');
    await page.waitForSelector('[aria-label*="Leave" i], [aria-label*="Verlassen" i], [aria-label*="End call" i]', { timeout: 15000 }).catch(() => {});
    await new Promise(r => setTimeout(r, 3000));

    // Retry mic/cam/captions up to 3 times until they confirm
    for (let attempt = 1; attempt <= 3; attempt++) {
      const mic = await muteMic();
      log(`Post-join mic (attempt ${attempt}): ${mic}`);
      await new Promise(r => setTimeout(r, 500));
      const cam = await muteCamera();
      log(`Post-join camera (attempt ${attempt}): ${cam}`);
      await new Promise(r => setTimeout(r, 500));
      const cap = await enableCaptions();
      if (cap !== 'not-found') {
        await new Promise(r => setTimeout(r, 1000));
        await setCaptionLanguageEnglish();
      }
      if (mic !== 'not-found' && cam !== 'not-found' && cap !== 'not-found') break;
      if (attempt < 3) {
        log('Some controls not found, retrying in 3s...');
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    await new Promise(r => setTimeout(r, 1000));

    // Open chat and send +1 (only on fresh join, not already-in-meeting)
    if (!alreadyInMeeting) {
      try {
        const chatOpened = await page.evaluate(() => {
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

        if (chatOpened) {
          log('Opened chat panel');
          await new Promise(r => setTimeout(r, 2000));
          const chatInput = await page.$('textarea[aria-label*="message" i], textarea[aria-label*="chat" i], textarea[placeholder*="message" i]');
          if (chatInput) {
            await chatInput.click();
            await chatInput.type('+1', { delay: 50 });
            log('Typed "+1" in chat');
          } else {
            log('Could not find chat input');
          }
        } else {
          log('Could not find chat button');
        }
      } catch (chatErr) {
        log(`Chat failed: ${chatErr.message}`);
      }
    }

    // Kill any existing caption tracker before starting a fresh one
    const { execSync } = require('child_process');
    try {
      execSync('pkill -f meet-captions.js', { stdio: 'ignore' });
      log('Killed existing caption tracker');
    } catch {}
    await new Promise(r => setTimeout(r, 500));

    // Start caption tracker with same env (needs DISPLAY for Chrome connection)
    const captionScript = path.join(__dirname, 'meet-captions.js');
    const captionLog = fs.openSync('/tmp/meet-captions.log', 'a');
    const captionProc = spawn('node', [captionScript], {
      detached: true,
      stdio: ['ignore', captionLog, captionLog],
      env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' },
    });
    captionProc.unref();
    log('Started caption tracker (background, logging to /tmp/meet-captions.log)');

    log('--- meet-join complete ---');
    browser.disconnect();
    process.exit(0);
  } catch (err) {
    log(`FAILED: ${err.message}`);
    try {
      if (browser) {
        const pages = await browser.pages();
        const meet = pages.find(p => p.url().includes('meet.google.com'));
        if (meet) await meet.screenshot({ path: '/tmp/meet-error.png' }).catch(() => {});
      }
    } catch {}
    try { if (browser) browser.disconnect(); } catch {}
    process.exit(1);
  }
})();
