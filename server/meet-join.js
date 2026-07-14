const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const http = require('http');
const fs = require('fs');

const CHROME_PATH = os.platform() === 'win32'
  ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
  : '/usr/bin/google-chrome';
const USER_DATA_DIR = os.platform() === 'win32'
  ? path.join(process.env.LOCALAPPDATA || os.homedir(), 'Google', 'Chrome', 'User Data')
  : path.join(os.homedir(), '.config', 'google-chrome-meet');
const PROFILE_DIR = 'Profile 1';
const DEBUG_PORT = 9399;
const LOG_FILE = path.join(os.tmpdir(), 'meet-join.log');
const DESKTOP_ENV_FILE = path.join(os.homedir(), '.config', 'task-scheduler', 'desktop-env');

// How long to keep waiting in the "host hasn't admitted you / meeting hasn't
// started yet" lobby before giving up. Covers a late or postponed meeting.
// Override with MEET_WAIT_MINUTES env var.
const WAIT_ROOM_MINUTES = Number(process.env.MEET_WAIT_MINUTES) || 20;

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
// --force bypasses the same-day skip (used by manual "Run now" clicks).
const FORCE_JOIN = process.argv.includes('--force');
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

// Force-remove the profile locks and kill any Chrome still holding THIS profile.
// Used when the debug port won't come up — usually because a previous Meet
// Chrome on the same --user-data-dir didn't exit cleanly and is blocking a new
// instance from binding the debug port.
function killChromeOnProfile() {
  const { execSync } = require('child_process');
  try {
    if (os.platform() === 'win32') {
      execSync('taskkill /f /im chrome.exe', { stdio: 'ignore' });
    } else {
      execSync(`pkill -f "user-data-dir=${USER_DATA_DIR}" 2>/dev/null || true`, { stdio: 'ignore' });
    }
    log('Killed lingering Chrome on the meet profile');
  } catch {}
  // Remove all singleton locks unconditionally now that the process is gone.
  for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    try { fs.unlinkSync(path.join(USER_DATA_DIR, name)); } catch {}
  }
}

// Launch Chrome as a visible, foreground process with the Meet URL
function launchChromeDetached(url) {
  const args = [
    `--user-data-dir=${USER_DATA_DIR}`,
    `--profile-directory=${PROFILE_DIR}`,
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

// Skip this run only if **this same meeting** was already joined today. The
// stamp stores `YYYY-MM-DD <meetingId>` so a *different* meeting still opens and
// gets the full standard settings (mic muted, camera off, captions on, +1).
// This way every meeting that opens keeps the original meeting's settings,
// while we still avoid re-joining the exact same room we're already in.
const SUCCESS_STAMP = path.join(os.tmpdir(), 'meet-join.last-success');

// Normalise a Meet URL to its room code, e.g. "abc-defg-hij".
function meetId(url) {
  const m = (url || '').match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/i);
  return m ? m[1].toLowerCase() : (url || '').trim();
}

function alreadyJoinedToday(url) {
  try {
    const stamp = fs.readFileSync(SUCCESS_STAMP, 'utf8').trim();
    const today = new Date().toISOString().slice(0, 10);
    const [stampDate, stampId] = stamp.split(/\s+/);
    if (stampDate !== today) return false;
    // Old stamps stored only a date (no meeting id) — treat those as "joined
    // today" for safety so we don't re-open a meeting on upgrade.
    if (!stampId) return true;
    // Skip only when it's the same meeting room.
    return stampId === meetId(url);
  } catch {
    return false;
  }
}

function markSuccessToday(url) {
  const today = new Date().toISOString().slice(0, 10);
  try { fs.writeFileSync(SUCCESS_STAMP, `${today} ${meetId(url)}`); } catch {}
}

(async () => {
  let browser;
  try {
    if (!FORCE_JOIN && alreadyJoinedToday(meetUrl)) {
      log(`--- meet-join SKIPPED: already joined THIS meeting (${meetId(meetUrl)}) today (use Run to force) ---`);
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

    // Wait for the debug port. If it never comes up, a stale Chrome on this
    // profile is usually blocking it — kill it, clear locks, and relaunch once.
    try {
      await waitForDebugPort();
    } catch (e) {
      log(`Debug port not ready (${e.message}) — clearing profile and retrying...`);
      killChromeOnProfile();
      await new Promise(r => setTimeout(r, 2000));
      launchChromeDetached(cleanUrl);
      log('Relaunched Meet Chrome after clearing profile');
      await waitForDebugPort();
    }
    log('Chrome debug port ready');

    // Connect to Chrome and immediately do a real CDP call (browser.pages()) to
    // prove the DevTools protocol actually works. A reused Chrome can answer the
    // /json/version HTTP probe while being wedged — the first real command then
    // hangs (Network.enable timed out), which used to time out the whole job.
    // If that health check fails, the reused instance is dead: kill it, relaunch
    // fresh, and reconnect once.
    const PROTOCOL_TIMEOUT = 30000; // well under the 120s job exec budget
    async function connectAndProbe() {
      const b = await puppeteer.connect({
        browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
        defaultViewport: null,
        protocolTimeout: PROTOCOL_TIMEOUT,
      });
      const pages = await b.pages(); // first real CDP call — proves the protocol is alive
      return { b, pages };
    }

    let pages;
    try {
      ({ b: browser, pages } = await connectAndProbe());
    } catch (e) {
      log(`Reused Chrome is unresponsive (${e.message}) — killing and relaunching fresh...`);
      try { if (browser) browser.disconnect(); } catch {}
      killChromeOnProfile();
      await new Promise(r => setTimeout(r, 2000));
      cleanStaleLocks();
      launchChromeDetached(cleanUrl);
      await waitForDebugPort();
      log('Relaunched Meet Chrome after unresponsive reuse');
      ({ b: browser, pages } = await connectAndProbe());
    }

    // The YouTube music tab is a nice-to-have. It used to be opened here, BEFORE
    // the Meet join — but on a busy reused Chrome its newPage()/goto is the first
    // heavy CDP op and would stall, blocking the actual join. It's now opened
    // after we're in the meeting (see below), so it can never delay joining.

    // If Chrome was already running, open the Meet URL in a new tab
    // If freshly launched, Chrome already has it — find the existing tab
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
        'Not logged in to Google in your Chrome profile. Please log into Google in Chrome (Profile 1) and try again.'
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
    await page.screenshot({ path: path.join(os.tmpdir(), 'meet-prejoin.png') });
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
      // Press only if everything above failed. Click the meeting area first so
      // keyboard focus is in the call (not on a button/menu), or "c" is ignored.
      if (result === 'not-found') {
        try {
          await page.bringToFront();
          // Move focus into the meeting canvas before the shortcut.
          await page.evaluate(() => {
            const main = document.querySelector('[data-allocation-index], [jsname], main, body');
            if (main && main.focus) main.focus();
          });
          await page.mouse.click(640, 360).catch(() => {});
          await new Promise(r => setTimeout(r, 300));
          await page.keyboard.press('c');
          log('Captions: pressed shortcut "c" as fallback');
          await new Promise(r => setTimeout(r, 1500));

          // Verify: did a captions container appear / button flip to "on"?
          const on = await page.evaluate(() => {
            const btns = Array.from(document.querySelectorAll('button'));
            const onBtn = btns.find(b => (b.innerHTML || '').includes('closed_caption') &&
              !(b.innerHTML || '').includes('closed_caption_off'));
            const region = document.querySelector('[aria-label*="aption" i][role="region"], [class*="caption" i]');
            return !!onBtn || !!region;
          }).catch(() => false);

          if (!on) {
            // Try once more — some layouts need a second press after the menu closes.
            await page.keyboard.press('c');
            await new Promise(r => setTimeout(r, 1000));
          }
          log(`Captions: shortcut result — ${on ? 'on' : 'pressed (unverified)'}`);
          return on ? 'shortcut-on' : 'shortcut-c';
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
      markSuccessToday(meetUrl);
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
      log('Clicked join — checking whether we are admitted or in a waiting room...');
    }

    // ── Waiting-room handler ──────────────────────────────────────────────────
    // After "Ask to join", Google may park us on a lobby screen:
    //   "Please wait until a meeting host brings you into the call"
    //   "Asking to be let in..."  /  "You'll join the call when someone lets you in"
    // This is exactly what a LATE or POSTPONED meeting looks like — the host
    // hasn't started or admitted us yet. Poll until the in-meeting toolbar (the
    // Leave / End-call button) appears, or give up after WAIT_ROOM_MINUTES.
    async function inMeetingToolbarVisible() {
      return page.evaluate(() => {
        const sel = '[aria-label*="Leave" i],[aria-label*="Verlassen" i],[aria-label*="End call" i],[aria-label*="Anruf beenden" i]';
        const el = document.querySelector(sel);
        return !!(el && el.offsetParent !== null);
      }).catch(() => false);
    }
    async function lobbyText() {
      return page.evaluate(() => {
        const body = (document.body.innerText || '').toLowerCase();
        const patterns = [
          'wait until a meeting host', 'brings you into the call',
          'asking to be let in', "you'll join the call when",
          'someone lets you in', 'warten, bis dich ein moderator',
          'um beitritt bitten', 'bitte warte',
        ];
        return patterns.find(p => body.includes(p)) || '';
      }).catch(() => '');
    }

    log('Waiting for in-meeting toolbar...');
    if (!(await inMeetingToolbarVisible())) {
      const lobby = await lobbyText();
      if (lobby) {
        log(`In waiting room ("${lobby}"). Host may be late — polling up to ${WAIT_ROOM_MINUTES} min...`);
      } else {
        log('Toolbar not up yet — waiting briefly for the meeting to load...');
      }

      const deadline = Date.now() + WAIT_ROOM_MINUTES * 60_000;
      let admitted = false;
      let lastLog = 0;
      while (Date.now() < deadline) {
        if (await inMeetingToolbarVisible()) { admitted = true; break; }

        // If the lobby is asking us to (re)request entry, click the button.
        await page.evaluate(() => {
          const btn = Array.from(document.querySelectorAll('button'))
            .find(b => /ask to join|join now|rejoin|erneut beitreten|um beitritt bitten/i
              .test((b.innerText || '').trim()) && b.offsetParent !== null);
          if (btn) btn.click();
        }).catch(() => {});

        // Heartbeat to the log every ~60s so we can see it's still waiting.
        if (Date.now() - lastLog > 60_000) {
          const mins = Math.round((deadline - Date.now()) / 60_000);
          log(`Still waiting for host... (~${mins} min left)`);
          lastLog = Date.now();
          await page.screenshot({ path: path.join(os.tmpdir(), 'meet-waiting.png') }).catch(() => {});
        }
        await new Promise(r => setTimeout(r, 5000));
      }

      if (!admitted) {
        log(`Host never admitted us within ${WAIT_ROOM_MINUTES} min — meeting likely late or postponed.`);
        log('Leaving the tab open in the lobby so you can be admitted manually. Not marking success.');
        await page.screenshot({ path: path.join(os.tmpdir(), 'meet-waiting.png') }).catch(() => {});
        browser.disconnect();
        process.exit(2);
      }
      log('Host admitted us — now in the meeting.');
    }

    // Confirmed in the meeting — only now count it as a success.
    if (!alreadyInMeeting) markSuccessToday(meetUrl);
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
      if (os.platform() === 'win32') {
        execSync('taskkill /f /fi "CommandLine eq *meet-captions*"', { stdio: 'ignore' });
      } else {
        execSync('pkill -f meet-captions.js', { stdio: 'ignore' });
      }
      log('Killed existing caption tracker');
    } catch {}
    await new Promise(r => setTimeout(r, 500));

    // Now that we're safely in the meeting, open the YouTube music tab as a
    // best-effort extra. Bounded so it can never delay completion even if the
    // reused Chrome is busy.
    const YOUTUBE_URL = 'https://www.youtube.com/watch?v=h6zdVaAe0OE&list=RDMMhFYKPE68PgE&index=9';
    try {
      await Promise.race([
        (async () => {
          const ytPage = await browser.newPage();
          await ytPage.goto(YOUTUBE_URL, { waitUntil: 'domcontentloaded', timeout: 12000 });
          log(`Opened YouTube tab: ${ytPage.url()}`);
        })(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000)),
      ]);
    } catch (ytErr) {
      log(`YouTube tab skipped (non-fatal): ${ytErr.message}`);
    }

    // Start caption tracker with same env (needs DISPLAY for Chrome connection)
    const captionScript = path.join(__dirname, 'meet-captions.js');
    const captionLogPath = path.join(os.tmpdir(), 'meet-captions.log');
    const captionLog = fs.openSync(captionLogPath, 'a');
    const captionEnv = { ...process.env, ...DESKTOP_ENV };
    if (os.platform() !== 'win32' && !captionEnv.DISPLAY) captionEnv.DISPLAY = ':0';
    const captionProc = spawn('node', [captionScript], {
      detached: true,
      stdio: ['ignore', captionLog, captionLog],
      env: captionEnv,
    });
    captionProc.unref();
    log(`Started caption tracker (background, logging to ${captionLogPath})`);

    log('--- meet-join complete ---');
    browser.disconnect();
    process.exit(0);
  } catch (err) {
    log(`FAILED: ${err.message}`);
    try {
      if (browser) {
        const pages = await browser.pages();
        const meet = pages.find(p => p.url().includes('meet.google.com'));
        if (meet) await meet.screenshot({ path: path.join(os.tmpdir(), 'meet-error.png') }).catch(() => {});
      }
    } catch {}
    try { if (browser) browser.disconnect(); } catch {}
    process.exit(1);
  }
})();
