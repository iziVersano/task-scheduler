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
const LOG_FILE = '/tmp/qa-lab.log';
const CAPTIONS_DIR = path.join(__dirname, 'captions');
const URL = 'https://platform.qa.com/dashboard/';
const DESKTOP_ENV_FILE = path.join(os.homedir(), '.config', 'task-scheduler', 'desktop-env');

// Load graphical-session env vars from a snapshot so Chrome can open a window
// even when this script is spawned by the API server (which often lacks
// WAYLAND_DISPLAY/XDG_RUNTIME_DIR). Same fix as meet-join.js.
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

// Lab names the instructor explicitly references in captions. The transcript
// often spells "IAM" as "I am" because of speech-to-text. Order doesn't matter;
// the most-mentioned wins.
const LAB_PATTERNS = [
  { rx: /create your first.*ec2|first amazon ec2/gi,     name: 'Create your first Amazon EC2 instance' },
  { rx: /connect.*ec2.*ssh|ec2.*using ssh/gi,            name: 'Connect to EC2 using SSH' },
  { rx: /introduction to (i\.? ?a\.? ?m|iam|i am)\b/gi,  name: 'Introduction to IAM' },
  { rx: /introduction to vpc\b/gi,                       name: 'Introduction to VPC' },
  { rx: /introduction to (s3|amazon s3)\b/gi,            name: 'Introduction to S3' },
  { rx: /introduction to ec2\b/gi,                       name: 'Introduction to EC2' },
  { rx: /introduction to lambda\b/gi,                    name: 'Introduction to Lambda' },
  { rx: /introduction to (aws )?organizations?\b/gi,     name: 'Introduction to AWS Organizations' },
  { rx: /amazon ec2 (instance,?)? linux\b/gi,            name: 'Amazon EC2 Instance, Linux' },
  { rx: /security lab for beginners?\b/gi,               name: 'Security Lab for Beginners' },
];

// Topic mentions used both for fallback search and the day summary.
const TOPIC_FALLBACKS = [
  { rx: /\bssh\b/gi,                       name: 'SSH' },
  { rx: /user data/gi,                     name: 'EC2 user data' },
  { rx: /\bkey ?pair\b|\.pem\b/gi,          name: 'key pair' },
  { rx: /\bEBS\b|\bebs\b/gi,                name: 'EBS' },
  { rx: /\bsecurity group\b/gi,            name: 'security group' },
  { rx: /\bubuntu\b/gi,                    name: 'Ubuntu' },
  { rx: /\bvpc\b/gi,                       name: 'VPC' },
  { rx: /\biam\b|\bi am\b/gi,              name: 'IAM' },
  { rx: /\bec2\b|easy to instance/gi,      name: 'EC2' },
  { rx: /\bs3\b/gi,                        name: 'S3' },
  { rx: /\blambda\b/gi,                    name: 'Lambda' },
  { rx: /\bdynamodb\b/gi,                  name: 'DynamoDB' },
  { rx: /availability zones?/gi,           name: 'availability zones' },
  { rx: /\borganizations?\b/gi,            name: 'AWS Organizations' },
  { rx: /\bcontrol tower\b/gi,             name: 'Control Tower' },
];

function log(msg) {
  const line = `[${new Date().toLocaleTimeString('de-DE')}] ${msg}`;
  process.stdout.write(line + '\n');
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

function recentCaptionFiles(n = 2) {
  const files = fs.readdirSync(CAPTIONS_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.txt$/.test(f))
    .sort()
    .reverse()
    .slice(0, n);
  return files.map(f => path.join(CAPTIONS_DIR, f));
}

// Return ranked lists of named labs and topics, with mention counts.
function analyse(text) {
  const score = (list, kind) => list
    .map(p => ({ name: p.name, count: (text.match(p.rx) || []).length, kind, rx: p.rx }))
    .filter(h => h.count > 0)
    .sort((a, b) => b.count - a.count);
  return {
    named: score(LAB_PATTERNS, 'named'),
    topics: score(TOPIC_FALLBACKS, 'topic'),
  };
}

// Map a topic name to a list of keywords that should match a named lab. Lets
// "SSH"/"key pair"/"user data" all route to EC2 labs.
const TOPIC_TO_LAB_KEYWORDS = {
  'SSH':                  ['ec2', 'linux'],
  'EC2 user data':        ['ec2', 'linux'],
  'key pair':             ['ec2', 'linux'],
  'EBS':                  ['ec2', 'linux'],
  'security group':       ['ec2', 'vpc'],
  'Ubuntu':               ['ec2', 'linux'],
  'EC2':                  ['ec2', 'linux'],
  'availability zones':   ['ec2', 'vpc'],
  'VPC':                  ['vpc'],
  'IAM':                  ['iam'],
  'S3':                   ['s3'],
  'Lambda':               ['lambda'],
  'DynamoDB':             ['dynamodb'],
  'AWS Organizations':    ['organizations'],
  'Control Tower':        ['control tower'],
};

function findLabFor(topic, named) {
  const keywords = TOPIC_TO_LAB_KEYWORDS[topic.name] || [topic.name.toLowerCase()];
  return named.find(l => keywords.some(k => l.name.toLowerCase().includes(k)));
}

// Pick up to 2 searches: try to route the top topic to a named lab; second pick
// is either another named lab or the next distinct topic.
function pickSearches(analysis) {
  const picks = [];
  const topTopic = analysis.topics[0];
  if (topTopic) {
    const related = findLabFor(topTopic, analysis.named);
    picks.push(related || topTopic);
  }
  // Second pick: a different named lab or the next topic that maps to a different lab.
  for (const t of analysis.topics.slice(1)) {
    const lab = findLabFor(t, analysis.named);
    const candidate = lab || t;
    if (!picks.some(p => p.name === candidate.name)) {
      picks.push(candidate);
      break;
    }
  }
  if (picks.length < 2 && analysis.named.length) {
    for (const l of analysis.named) {
      if (!picks.some(p => p.name === l.name)) { picks.push(l); break; }
    }
  }
  return picks.slice(0, 2);
}

// Pull 2-3 short sentences from the transcript that mention the lab/topic, so
// the user gets context on why the script picked it. Cleans up filler words and
// caps at ~280 chars.
function blurbFor(text, hit) {
  if (!hit) return '';
  const rx = new RegExp(hit.rx.source, 'gi');
  const sentences = text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 25 && s.length < 220 && rx.test(s));

  if (!sentences.length) return '';
  const seen = new Set();
  const unique = [];
  for (const s of sentences) {
    const key = s.toLowerCase().slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(s);
    if (unique.length === 2) break;
  }
  let blurb = unique.join(' / ');
  if (blurb.length > 280) blurb = blurb.slice(0, 277) + '…';
  return blurb;
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

// Parse --topic=<name> from argv to allow the user to override auto-detection.
function getTopicOverride() {
  const arg = process.argv.find(a => a.startsWith('--topic='));
  if (!arg) return null;
  const v = arg.slice('--topic='.length).trim();
  return v || null;
}

// Remove Chrome Singleton lock files from the AWS profile if they point to a
// dead PID — otherwise Chrome refuses to start a new instance and just forwards
// to "nothing", leaving the debug port closed. Same fix as meet-join.js.
function cleanStaleLocks() {
  for (const name of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
    const p = path.join(CHROME_DATA_DIR, name);
    try {
      const stat = fs.lstatSync(p);
      if (!stat.isSymbolicLink()) continue;
      const target = fs.readlinkSync(p);
      const m = target.match(/-(\d+)$/);
      if (m) {
        const pid = Number(m[1]);
        try {
          process.kill(pid, 0); // probe: throws if dead
          continue;             // PID alive — lock is real, leave it
        } catch {
          fs.unlinkSync(p);
          log(`Removed stale ${name} (target PID ${pid} not running)`);
        }
      } else {
        fs.unlinkSync(p);
        log(`Removed unparseable ${name}`);
      }
    } catch {
      // file doesn't exist or other error — ignore
    }
  }
}

(async () => {
  const topicOverride = getTopicOverride();

  // Step 1: read today + yesterday's transcripts and analyse.
  const captionFiles = recentCaptionFiles(2);
  if (!captionFiles.length) {
    log('No caption files found. Aborting.');
    process.exit(1);
  }
  log(`Reading: ${captionFiles.map(f => path.basename(f)).join(', ')}`);
  // Weight today (first file) 3x vs yesterday so the summary reflects what was
  // taught today rather than the cumulative volume from earlier classes.
  const todayText = fs.readFileSync(captionFiles[0], 'utf8');
  const olderText = captionFiles.slice(1).map(f => fs.readFileSync(f, 'utf8')).join('\n');
  const text = [todayText, todayText, todayText, olderText].join('\n');
  const analysis = analyse(text);

  // Step 2: log a summary of today's class so the user can see what was taught.
  if (analysis.topics.length) {
    const topTopics = analysis.topics.slice(0, 6).map(t => `${t.name} (${t.count})`).join(', ');
    log(`Topics today: ${topTopics}`);
  }
  if (analysis.named.length) {
    const topLabs = analysis.named.slice(0, 4).map(l => `"${l.name}" (${l.count})`).join(', ');
    log(`Named labs mentioned: ${topLabs}`);
    const blurb = blurbFor(text, analysis.named[0]);
    if (blurb) log(`About: ${blurb}`);
  } else if (analysis.topics.length) {
    const blurb = blurbFor(text, analysis.topics[0]);
    if (blurb) log(`About: ${blurb}`);
  }

  let searches;
  if (topicOverride) {
    log(`Topic override: "${topicOverride}" — skipping auto-detection.`);
    searches = [{ name: topicOverride, kind: 'override' }];
  } else {
    searches = pickSearches(analysis);
  }
  if (!searches.length) {
    log('Nothing to search for. Opening QA dashboard only.');
  } else {
    log(`Will open searches for: ${searches.map(s => `"${s.name}"`).join(', ')}`);
  }

  // Step 3: connect to (or launch) Chrome on the AWS profile.
  cleanStaleLocks();
  const child = spawn(CHROME_PATH, [
    `--user-data-dir=${CHROME_DATA_DIR}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    URL,
  ], {
    detached: true,
    stdio: 'ignore',
    env: { ...process.env, ...DESKTOP_ENV },
  });
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

    // Verify we're signed in. Use the existing or a new tab pointed at the dashboard.
    const pages = await browser.pages();
    let page = pages.find(p => /platform\.qa\.com/i.test(p.url()));
    if (!page) page = await browser.newPage();
    await page.bringToFront();
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await new Promise(r => setTimeout(r, 3000));
    log(`Dashboard: ${page.url()}`);

    if (/\/login\//i.test(page.url())) {
      log('Not signed in. Run the "QA Platform" entry first to authenticate.');
      browser.disconnect();
      process.exit(0);
    }

    if (!searches.length) {
      browser.disconnect();
      process.exit(0);
    }

    // Step 4: open one tab per search. If the search name is already a full
    // platform.qa.com URL (deep link to a course/lab), open it directly;
    // otherwise build a /search/?q= URL.
    for (const s of searches) {
      const isDirectUrl = /^https?:\/\//i.test(s.name);
      const url = isDirectUrl
        ? s.name
        : `https://platform.qa.com/search/?q=${encodeURIComponent(s.name)}`;
      const tab = await browser.newPage();
      await tab.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      log(`Opened ${isDirectUrl ? 'lab' : 'search'} tab: "${s.name}" → ${url}`);
    }

    browser.disconnect();
  } catch (err) {
    log(`Error: ${err.message}`);
    try { browser?.disconnect(); } catch {}
  }

  process.exit(0);
})();
