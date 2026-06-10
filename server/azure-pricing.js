const puppeteer = require('puppeteer-core');
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const http = require('http');
const fs = require('fs');

// ── Config ──────────────────────────────────────────────────────────────────
const CHROME_PATH = '/usr/bin/google-chrome';
const USER_DATA_DIR = path.join(os.homedir(), '.config', 'google-chrome-meet');
const DEBUG_PORT = 9399;
const LOG_FILE = '/tmp/azure-pricing.log';
const AZURE_URL = 'https://azure.microsoft.com/en-us/pricing/calculator/';
const SCREENSHOT_DIR = '/tmp';

// ── Reused helpers from meet-join.js ────────────────────────────────────────

function log(msg) {
  const line = `[${new Date().toLocaleTimeString('de-DE')}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

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

function launchChromeDetached(url) {
  const args = [
    `--user-data-dir=${USER_DATA_DIR}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-blink-features=AutomationControlled',
    '--start-maximized',
  ];
  if (url) args.push(url);

  const child = spawn(CHROME_PATH, args, {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' },
  });
  child.unref();
  return child.pid;
}

function focusChromeWindow() {
  try {
    const { execSync } = require('child_process');
    execSync(
      `gdbus call --session --dest org.gnome.Shell --object-path /org/gnome/Shell --method org.gnome.Shell.Eval "global.get_window_actors().forEach(a => { if(a.meta_window.get_title().includes('Chrome') || a.meta_window.get_title().includes('Azure')) a.meta_window.activate(global.get_current_time()); })" 2>/dev/null || wmctrl -a Chrome 2>/dev/null || xdotool search --name Chrome windowactivate 2>/dev/null || true`,
      { env: { ...process.env, DISPLAY: ':1' } }
    );
  } catch {}
}

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

async function screenshot(page, name) {
  const filepath = path.join(SCREENSHOT_DIR, `azure-${name}.png`);
  await page.screenshot({ path: filepath, fullPage: false });
  log(`Screenshot: ${filepath}`);
}

// ── Cookie/popup dismissal ──────────────────────────────────────────────────

async function dismissPopups(page) {
  await page.evaluate(() => {
    const dismissWords = [
      'accept all', 'accept', 'reject all', 'reject', 'close',
      'got it', 'i agree', 'ok', 'dismiss', 'no thanks',
      'agree', 'consent', 'continue',
      // German
      'alle akzeptieren', 'akzeptieren', 'ablehnen', 'alle ablehnen',
      'schließen', 'cookies verwalten',
    ];
    // Cookie banners, consent popups — click reject/close to get rid of banner
    document.querySelectorAll('button, a[role="button"], [class*="cookie"] button, [class*="consent"] button, [id*="cookie"] button').forEach(el => {
      const text = (el.innerText || el.textContent || '').trim().toLowerCase();
      if (text === 'ablehnen' || text === 'reject all' || text === 'reject' ||
          text === 'alle ablehnen' || text === 'close' || text === 'schließen') {
        el.click();
      }
    });
  });
  await new Promise(r => setTimeout(r, 1000));
}

// ── Azure Pricing Calculator interactions ───────────────────────────────────

async function waitForCalculatorReady(page) {
  log('Waiting for calculator to load...');
  // Wait for the main calculator UI to appear
  await page.waitForSelector(
    '[class*="pricing"], [class*="calculator"], [data-testid*="calculator"], #calculator, .calculator-container, main',
    { timeout: 30000 }
  );
  await new Promise(r => setTimeout(r, 3000)); // extra settle time for SPA hydration
  log('Calculator page loaded');
}

async function selectCategory(page, category) {
  log(`Selecting category: ${category}`);
  const clicked = await page.evaluate((cat) => {
    const lower = cat.toLowerCase();
    // Categories are in a sidebar list (links or buttons)
    const items = document.querySelectorAll('a, button, li, [role="tab"], [role="menuitem"]');
    for (const el of items) {
      const text = (el.innerText || el.textContent || '').trim().toLowerCase();
      // Exact or close match on category name
      if (text === lower || text.startsWith(lower)) {
        if (el.offsetParent !== null) {
          el.click();
          return text;
        }
      }
    }
    return null;
  }, category);

  if (clicked) {
    log(`Category selected: ${clicked}`);
    await new Promise(r => setTimeout(r, 2000));
    return true;
  }
  log(`Category "${category}" not found`);
  return false;
}

async function addServiceByCard(page, serviceName, category) {
  log(`Adding service: ${serviceName}` + (category ? ` (category: ${category})` : ''));

  // If a category is specified, navigate to it first
  if (category) {
    await selectCategory(page, category);
  }

  // Find the product card matching the service name and click its "Add to estimate" button.
  // Works for both English and German UI.
  const result = await page.evaluate((name) => {
    const lowerName = name.toLowerCase();
    // German translations for common services
    const nameMap = {
      'virtual machines': ['virtuelle maschinen', 'virtual machines'],
      'storage accounts': ['speicherkonten', 'storage accounts', 'speicher'],
      'azure sql database': ['sql-datenbank', 'azure sql database', 'sql database', 'azure sql-datenbank'],
      'app service': ['app-dienst', 'app service'],
      'azure cosmos db': ['azure cosmos db', 'cosmos db'],
      'azure kubernetes service': ['azure kubernetes service', 'kubernetes'],
      'azure functions': ['azure functions', 'functions'],
      'load balancer': ['load balancer', 'lastenausgleich'],
      'vpn gateway': ['vpn gateway', 'vpn-gateway'],
      'azure firewall': ['azure firewall'],
      'azure active directory': ['azure active directory', 'microsoft entra id'],
      'azure devops': ['azure devops'],
      'azure monitor': ['azure monitor'],
      'virtual network': ['virtual network', 'virtuelles netzwerk'],
      'azure blob storage': ['azure blob storage', 'blob storage', 'blob-speicher'],
      'azure dns': ['azure dns'],
      'container instances': ['container instances', 'containerinstanzen'],
      'azure ai services': ['azure ai services', 'cognitive services'],
    };
    const aliases = nameMap[lowerName] || [lowerName];

    // Find all "Add to estimate" / "Zur Schätzung hinzufügen" buttons
    const addButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
      const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
      return (text.includes('zur schätzung') || text.includes('add to estimate')) && btn.offsetParent !== null;
    });

    // For each add button, walk up to find the card and match the service name
    for (const btn of addButtons) {
      let container = btn.parentElement;
      for (let i = 0; i < 6 && container; i++) {
        const containerText = (container.innerText || '').toLowerCase();
        for (const alias of aliases) {
          if (containerText.includes(alias)) {
            btn.click();
            return `added: ${alias}`;
          }
        }
        container = container.parentElement;
      }
    }

    // Return debug info
    const visibleCards = [];
    addButtons.forEach(btn => {
      let p = btn.parentElement;
      for (let i = 0; i < 4 && p; i++) { p = p.parentElement; }
      if (p) {
        const heading = p.querySelector('h3, h4, strong, [class*="title"], [class*="name"]');
        visibleCards.push((heading?.textContent || p.innerText || '').trim().slice(0, 50));
      }
    });
    return { error: true, visibleCards };
  }, serviceName);

  if (typeof result === 'string') {
    log(result);
    await new Promise(r => setTimeout(r, 2000));
    return true;
  }

  log(`Could not find "${serviceName}". Visible cards: ${JSON.stringify(result.visibleCards)}`);
  return false;
}

async function addServiceFromCatalog(page, serviceName) {
  log(`Looking for "${serviceName}" in catalog...`);

  const found = await page.evaluate((name) => {
    const lowerName = name.toLowerCase();
    // Azure calculator groups services in categories with clickable cards
    const allElements = document.querySelectorAll('button, a, [role="button"], [class*="card"], [class*="tile"]');
    for (const el of allElements) {
      const text = (el.innerText || el.textContent || '').trim().toLowerCase();
      if (text.includes(lowerName) && el.offsetParent !== null) {
        el.click();
        return text.slice(0, 80);
      }
    }
    return null;
  }, serviceName);

  if (found) {
    log(`Catalog click: "${found}"`);
    await new Promise(r => setTimeout(r, 2000));
    return true;
  }
  return false;
}

async function configureVM(page) {
  log('Configuring VM options...');

  // Try to set region
  await page.evaluate(() => {
    const selects = document.querySelectorAll('select, [role="listbox"], [role="combobox"]');
    for (const sel of selects) {
      const label = (sel.getAttribute('aria-label') || sel.previousElementSibling?.textContent || '').toLowerCase();
      if (label.includes('region') || label.includes('location')) {
        // Try to select West Europe
        if (sel.tagName === 'SELECT') {
          for (const opt of sel.options) {
            if (opt.text.toLowerCase().includes('west europe') || opt.text.toLowerCase().includes('germany')) {
              sel.value = opt.value;
              sel.dispatchEvent(new Event('change', { bubbles: true }));
              return 'region-set';
            }
          }
        } else {
          sel.click();
        }
      }
    }
    return null;
  });

  await new Promise(r => setTimeout(r, 1500));

  // Try to set OS
  await page.evaluate(() => {
    const elements = document.querySelectorAll('select, [role="listbox"], [role="combobox"], button, [role="button"]');
    for (const el of elements) {
      const label = (el.getAttribute('aria-label') || el.previousElementSibling?.textContent || '').toLowerCase();
      const text = (el.innerText || '').toLowerCase();
      if (label.includes('operating system') || label.includes('os') || text.includes('windows') || text.includes('linux')) {
        if (el.tagName === 'SELECT') {
          for (const opt of el.options) {
            if (opt.text.toLowerCase().includes('linux') || opt.text.toLowerCase().includes('ubuntu')) {
              el.value = opt.value;
              el.dispatchEvent(new Event('change', { bubbles: true }));
              return;
            }
          }
        }
      }
    }
  });

  await new Promise(r => setTimeout(r, 1000));
  log('VM configuration attempted');
}

async function getEstimateSummary(page) {
  log('Extracting estimate summary...');

  const summary = await page.evaluate(() => {
    const results = {};

    // Look for total/estimate price
    const priceElements = document.querySelectorAll(
      '[class*="total"], [class*="estimate"], [class*="price"], [class*="cost"], [class*="amount"]'
    );
    for (const el of priceElements) {
      const text = (el.innerText || el.textContent || '').trim();
      if (text.match(/[\$€£]\s*[\d,.]+/) || text.match(/[\d,.]+\s*[\$€£\/]/)) {
        results.total = text;
        break;
      }
    }

    // Get all added service names and their individual prices
    const services = [];
    const serviceCards = document.querySelectorAll(
      '[class*="service-row"], [class*="estimate-row"], [class*="line-item"], ' +
      '[class*="product-row"], [class*="card"]'
    );
    for (const card of serviceCards) {
      const text = (card.innerText || '').trim();
      if (text.length > 5 && text.length < 500) {
        services.push(text.replace(/\n/g, ' | ').slice(0, 200));
      }
    }
    results.services = services.slice(0, 10);

    return results;
  });

  log(`Estimate: ${JSON.stringify(summary)}`);
  return summary;
}

async function exportEstimate(page) {
  log('Looking for export option...');

  const exported = await page.evaluate(() => {
    // Look specifically for "Export" button (not "Save" or "Saved estimates")
    const btns = Array.from(document.querySelectorAll('button, a, [role="button"]'));
    for (const btn of btns) {
      const text = (btn.innerText || btn.textContent || '').trim().toLowerCase();
      // Only match "export" — not "save", "saved estimates", or "share" which navigate away
      if (text === 'export' && btn.offsetParent !== null) {
        btn.click();
        return `clicked: export`;
      }
    }
    return null;
  });

  if (exported) {
    log(`Export: ${exported}`);
    await new Promise(r => setTimeout(r, 2000));
  } else {
    log('No export button found');
  }
  return exported;
}

// ── Services to add ─────────────────────────────────────────────────────────
// Each entry: { name, category (optional — sidebar category to click first) }
// Pass --services as JSON arg to override, e.g.:
//   node azure-pricing.js --services '[{"name":"Azure Functions","category":"Compute"}]'

const DEFAULT_SERVICES = [
  { name: 'Virtual Machines', category: 'Compute' },
  { name: 'Storage Accounts', category: 'Storage' },
  { name: 'Azure SQL Database', category: 'Databases' },
];

// Parse CLI override
let SERVICES_TO_ADD = DEFAULT_SERVICES;
const servicesArg = process.argv.find(a => a.startsWith('--services='));
if (servicesArg) {
  try { SERVICES_TO_ADD = JSON.parse(servicesArg.split('=').slice(1).join('=')); } catch {}
} else if (process.argv[2] && process.argv[2].startsWith('[')) {
  try { SERVICES_TO_ADD = JSON.parse(process.argv[2]); } catch {}
}

// ── Main ────────────────────────────────────────────────────────────────────

(async () => {
  let browser;
  try {
    log('--- azure-pricing started ---');

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
      launchChromeDetached(AZURE_URL);
      log('Launched Chrome with debug port');
    }

    await waitForDebugPort();
    log('Chrome debug port ready');

    browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
      defaultViewport: null,
      protocolTimeout: 120000,
    });

    // Find existing Azure tab or open new one
    const pages = await browser.pages();
    let page = pages.find(p => p.url().includes('azure.microsoft.com'));

    if (!page) {
      page = await browser.newPage();
      await page.evaluateOnNewDocument(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => false });
      });
    } else {
      log('Found existing Azure tab');
      await page.bringToFront();
    }

    // Always navigate fresh to ensure clean state
    log(`Navigating to: ${AZURE_URL}`);
    await page.goto(AZURE_URL, { waitUntil: 'networkidle2', timeout: 45000 });

    focusChromeWindow();
    await page.bringToFront();
    log(`Page loaded: ${page.url()}`);

    // Dismiss cookie banners / consent popups
    await dismissPopups(page);
    await new Promise(r => setTimeout(r, 2000));
    await dismissPopups(page); // try again after delay

    // Dismiss chat widget if present
    await page.evaluate(() => {
      const chatClose = document.querySelector('[aria-label*="close" i], [aria-label*="schließen" i], [class*="chat"] button[aria-label*="close" i]');
      if (chatClose) chatClose.click();
      // Also try to close any overlay
      document.querySelectorAll('[class*="proactive"], [class*="chat-container"], [id*="chat"]').forEach(el => {
        const closeBtn = el.querySelector('button');
        if (closeBtn) closeBtn.click();
      });
    });
    await new Promise(r => setTimeout(r, 1000));

    await screenshot(page, 'initial');

    // ── Sign in to Microsoft ────────────────────────────────────────────────
    // ── Sign in via top-right header "Sign in" link ───────────────────────
    const signInClicked = await page.evaluate(() => {
      // The real Sign in is in the Microsoft global header bar (top-right)
      // It's typically an <a> with href containing login.microsoftonline.com
      // or text "Sign in" in the nav header area
      const headerLinks = document.querySelectorAll('header a, nav a, [class*="header"] a, [id*="header"] a, a[href*="login.microsoftonline"], a[href*="login.live.com"]');
      for (const el of headerLinks) {
        const text = (el.innerText || el.textContent || '').trim().toLowerCase();
        const href = (el.getAttribute('href') || '').toLowerCase();
        if ((text === 'sign in' || text === 'anmelden' || href.includes('login.microsoftonline') || href.includes('login.live.com')) && el.offsetParent !== null) {
          el.click();
          return `clicked: ${text} (href: ${href.slice(0, 60)})`;
        }
      }
      // Fallback: "Log in" link in the banner
      const allLinks = document.querySelectorAll('a');
      for (const el of allLinks) {
        const href = (el.getAttribute('href') || '').toLowerCase();
        if (href.includes('login.microsoftonline') || href.includes('login.live.com')) {
          el.click();
          return `fallback: ${href.slice(0, 60)}`;
        }
      }
      return null;
    });

    if (signInClicked) {
      log(`Sign in: ${signInClicked}`);
      log('Waiting for Microsoft login...');
      try {
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 }).catch(() => {});

        const currentUrl = page.url();
        if (currentUrl.includes('login.microsoftonline.com') || currentUrl.includes('login.live.com')) {
          log(`On login page: ${currentUrl}`);
          await screenshot(page, 'login-page');
          // Wait for auto-login or manual login — up to 60s
          for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 3000));
            const url = page.url();
            if (url.includes('azure.microsoft.com')) {
              log('Login complete — back on Azure');
              break;
            }
            if (i === 5) {
              log('Still on login page — waiting for manual login...');
              await screenshot(page, 'login-waiting');
            }
          }
        } else {
          log(`After sign-in click: ${currentUrl}`);
        }

        // Navigate back to calculator if needed
        if (!page.url().includes('pricing/calculator')) {
          log('Navigating back to pricing calculator...');
          await page.goto(AZURE_URL, { waitUntil: 'networkidle2', timeout: 45000 });
        }
      } catch (loginErr) {
        log(`Login flow issue: ${loginErr.message}`);
      }
      await new Promise(r => setTimeout(r, 2000));
    } else {
      log('No sign-in link found (may already be signed in)');
    }

    await screenshot(page, 'after-login');

    // Wait for calculator to be ready
    await waitForCalculatorReady(page);
    await screenshot(page, 'calculator-ready');

    // Ensure we're on the Products tab and scrolled to top
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      // Click "Products" tab to make sure we see the product catalog
      const tabs = document.querySelectorAll('a, button, [role="tab"]');
      for (const tab of tabs) {
        const text = (tab.innerText || tab.textContent || '').trim().toLowerCase();
        if ((text === 'products' || text === 'produkte') && tab.offsetParent !== null) {
          tab.click();
          break;
        }
      }
    });
    await new Promise(r => setTimeout(r, 2000));

    // Add services
    for (const service of SERVICES_TO_ADD) {
      const name = typeof service === 'string' ? service : service.name;
      const category = typeof service === 'string' ? null : service.category;
      const added = await addServiceByCard(page, name, category);
      if (!added) {
        // Fallback: try without category (maybe it's visible on current page)
        if (category) await addServiceByCard(page, name, null);
      }
      await screenshot(page, `after-${name.replace(/\s+/g, '-').toLowerCase()}`);
      await new Promise(r => setTimeout(r, 1500));
    }

    // Configure VM if it was added
    await configureVM(page);
    await screenshot(page, 'configured');

    // Get estimate summary
    const summary = await getEstimateSummary(page);
    await screenshot(page, 'estimate');

    // Try to export
    await exportEstimate(page);
    await screenshot(page, 'final');

    // Save summary to file
    const summaryPath = path.join(SCREENSHOT_DIR, 'azure-pricing-summary.json');
    fs.writeFileSync(summaryPath, JSON.stringify({
      timestamp: new Date().toISOString(),
      url: page.url(),
      servicesRequested: SERVICES_TO_ADD.map(s => typeof s === 'string' ? s : s.name),
      estimate: summary,
    }, null, 2));
    log(`Summary saved: ${summaryPath}`);

    log('--- azure-pricing complete ---');
    browser.disconnect();
    process.exit(0);
  } catch (err) {
    log(`FAILED: ${err.message}`);
    try {
      if (browser) {
        const pages = await browser.pages();
        const az = pages.find(p => p.url().includes('azure'));
        if (az) await az.screenshot({ path: '/tmp/azure-pricing-error.png' }).catch(() => {});
      }
    } catch {}
    try { if (browser) browser.disconnect(); } catch {}
    process.exit(1);
  }
})();
