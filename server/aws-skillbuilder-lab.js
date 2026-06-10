const { spawn } = require('child_process');
const puppeteer = require('puppeteer-core');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const CHROME_PATH = '/usr/bin/google-chrome';
const CHROME_DATA_DIR = path.join(os.homedir(), '.config', 'google-chrome-aws');
const DEBUG_PORT = 9410;
const LOG_FILE = '/tmp/aws-skillbuilder-lab.log';
const CAPTIONS_DIR = path.join(__dirname, 'captions');
// Catalog filtered to Hands-On Lab content type. We append &search=<topic> if a
// topic is detected; if results are empty we fall back to this base URL.
const CATALOG_BASE = 'https://explore.skillbuilder.aws/learn/catalog?ctldoc-catalog-0=%22Hands-On%20Lab%22';

// Topic → Skill Builder search query. Order matters: first matching topic with
// the most mentions wins. Keep this small; expand only when caption parsing
// drifts in practice.
const TOPICS = [
  { keyword: /organi[sz]ations?/i,  query: 'AWS Organizations' },
  { keyword: /\bIAM\b/i,             query: 'IAM' },
  { keyword: /\bVPC\b/i,             query: 'VPC' },
  { keyword: /\bS3\b/i,              query: 'S3' },
  { keyword: /\bEC2\b/i,             query: 'EC2' },
  { keyword: /\blambda\b/i,          query: 'Lambda' },
  { keyword: /control[- ]?tower/i,   query: 'Control Tower' },
  { keyword: /cloud[- ]?front/i,     query: 'CloudFront' },
  { keyword: /\brds\b/i,             query: 'RDS' },
  { keyword: /dynamodb/i,            query: 'DynamoDB' },
  { keyword: /\bsqs\b/i,             query: 'SQS' },
  { keyword: /\bsns\b/i,             query: 'SNS' },
];

function log(msg) {
  const line = `[${new Date().toLocaleTimeString('de-DE')}] ${msg}`;
  process.stdout.write(line + '\n');
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function latestCaptionFile() {
  const files = fs.readdirSync(CAPTIONS_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.txt$/.test(f))
    .sort()
    .reverse();
  return files[0] ? path.join(CAPTIONS_DIR, files[0]) : null;
}

function pickTopic(text) {
  const scored = TOPICS.map(t => ({
    ...t,
    count: (text.match(new RegExp(t.keyword.source, 'gi')) || []).length,
  })).filter(t => t.count > 0);
  scored.sort((a, b) => b.count - a.count);
  return scored[0] || null;
}

function waitForDebugPort(maxWait = 15000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      const req = http.get(`http://127.0.0.1:${DEBUG_PORT}/json/version`, (res) => {
        let data = '';
        res.on('data', c => data += c);
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

async function clickByText(page, re, timeout = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const handle = await page.evaluateHandle((pattern) => {
      const rx = new RegExp(pattern, 'i');
      const nodes = [...document.querySelectorAll('button, a, [role="button"], input[type="submit"]')];
      return nodes.find(n => rx.test((n.innerText || n.value || '').trim())) || null;
    }, re.source);
    const el = handle.asElement();
    if (el) {
      await el.evaluate(n => n.scrollIntoView({ block: 'center' }));
      await el.click();
      return true;
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return false;
}

(async () => {
  // Step 1 — pick a topic from the latest caption transcript
  const captionFile = latestCaptionFile();
  if (!captionFile) {
    log('No caption files found. Aborting.');
    process.exit(1);
  }
  log(`Reading: ${path.basename(captionFile)}`);

  const text = fs.readFileSync(captionFile, 'utf8');
  const topic = pickTopic(text);
  if (!topic) {
    log('No known AWS topic mentioned in the transcript. Aborting.');
    process.exit(1);
  }
  log(`Detected topic: "${topic.query}" (${topic.count} mentions)`);

  const topicUrl = `${CATALOG_BASE}&search=${encodeURIComponent(topic.query)}`;
  log(`Topic URL: ${topicUrl}`);

  // Step 2 — bring Chrome up (or attach to existing) and navigate
  const child = spawn(CHROME_PATH, [
    `--user-data-dir=${CHROME_DATA_DIR}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    topicUrl,
  ], { detached: true, stdio: 'ignore' });
  child.unref();

  try {
    await waitForDebugPort();
  } catch {
    // Chrome already running — connect to existing instance
  }

  let browser;
  try {
    browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
      defaultViewport: null,
    });

    const pages = await browser.pages();
    let page = pages.find(p => /skillbuilder\.aws/i.test(p.url()));
    if (!page) {
      page = await browser.newPage();
    }
    await page.bringToFront();

    // Helper: navigate, wait, then return the first visible lab/course card (or
    // a "no results" signal). Skill Builder uses /learn/course/external/... and
    // /learn/lp/... and /learn/learning_plan/... for catalog links.
    async function gotoAndFindLab(url) {
      log(`Navigating: ${url}`);
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      // Catalog pages render async — give the result list time
      await new Promise(r => setTimeout(r, 4500));

      return await page.evaluate(() => {
        const bodyText = document.body.innerText || '';
        const noResults = /couldn.?t find|no results|no training/i.test(bodyText);

        // Candidate selectors: any anchor that looks like a catalog item
        const anchors = [...document.querySelectorAll('a[href*="/learn/"]')];
        const cards = anchors.filter(a => {
          const href = a.getAttribute('href') || '';
          if (!/\/learn\/(course|courses|lp|learning_plan|public\/course)/.test(href)) return false;
          const rect = a.getBoundingClientRect();
          return rect.width > 100 && rect.height > 40;
        });

        if (!cards.length) return { noResults, picked: null };

        const a = cards[0];
        const title = (a.innerText || a.textContent || '').trim().split('\n').filter(Boolean)[0] || '(untitled)';
        return { noResults, picked: { title, href: a.href, index: 0 } };
      });
    }

    // Attempt 1: topic-filtered catalog
    let result = await gotoAndFindLab(topicUrl);
    if (result.noResults || !result.picked) {
      log(result.noResults
        ? 'No results for topic — falling back to the full Hands-On Lab catalog.'
        : 'No lab cards detected on topic page — falling back to the full Hands-On Lab catalog.');
      result = await gotoAndFindLab(CATALOG_BASE);
    }

    if (!result.picked) {
      log('No lab cards visible on the catalog page either — leaving the catalog open for you.');
      browser.disconnect();
      process.exit(0);
    }

    log(`Picked lab: "${result.picked.title}"`);
    log(`Lab URL: ${result.picked.href}`);
    await page.goto(result.picked.href, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Step 4 — wait for the lab detail page to load, try to click "Start lab" / "Launch lab"
    await new Promise(r => setTimeout(r, 4000));
    const started = await clickByText(page, /^(start lab|launch lab|begin lab|start course|enroll)$/i, 6000);
    if (started) {
      log('Clicked Start/Launch.');
    } else {
      log('No Start/Launch button visible — lab detail page is ready for you.');
    }

    log('Done. The rest is hands-on — your tab is on the lab.');
    browser.disconnect();
  } catch (err) {
    log(`Error: ${err.message}`);
    try { browser?.disconnect(); } catch {}
  }

  process.exit(0);
})();
