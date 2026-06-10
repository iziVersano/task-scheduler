const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { requireAuth } = require('./iam-middleware');

const router = express.Router();

// ── Script registry ─────────────────────────────────────────────────────────

const SCRIPTS = {
  'azure-pricing': {
    name: 'Azure Pricing Calculator',
    description: 'Opens Azure Pricing Calculator, adds selected services, extracts estimate and exports',
    script: path.join(__dirname, 'azure-pricing.js'),
    logFile: '/tmp/azure-pricing.log',
    summaryFile: '/tmp/azure-pricing-summary.json',
    screenshots: [
      { name: 'Initial', path: '/tmp/azure-initial.png' },
      { name: 'After Login', path: '/tmp/azure-after-login.png' },
      { name: 'Login Waiting', path: '/tmp/azure-login-waiting.png' },
      { name: 'Calculator Ready', path: '/tmp/azure-calculator-ready.png' },
      { name: 'Configured', path: '/tmp/azure-configured.png' },
      { name: 'Estimate', path: '/tmp/azure-estimate.png' },
      { name: 'Final', path: '/tmp/azure-final.png' },
    ],
    icon: '☁️',
    hasServicePicker: true,
    availableServices: [
      // Popular
      { name: 'Virtual Machines', category: 'Compute' },
      { name: 'Storage Accounts', category: 'Storage' },
      { name: 'Azure SQL Database', category: 'Databases' },
      { name: 'App Service', category: 'Compute' },
      { name: 'Azure Cosmos DB', category: 'Databases' },
      { name: 'Azure Kubernetes Service', category: 'Containers' },
      { name: 'Azure Functions', category: 'Compute' },
      // Networking
      { name: 'Load Balancer', category: 'Networking' },
      { name: 'VPN Gateway', category: 'Networking' },
      { name: 'Azure Firewall', category: 'Networking' },
      { name: 'Virtual Network', category: 'Networking' },
      { name: 'Azure DNS', category: 'Networking' },
      // AI
      { name: 'Azure AI Services', category: 'AI + machine learning' },
      // DevOps
      { name: 'Azure DevOps', category: 'DevOps' },
      { name: 'Azure Monitor', category: 'Management and governance' },
      // Containers
      { name: 'Container Instances', category: 'Containers' },
      // Identity
      { name: 'Microsoft Entra ID', category: 'Identity' },
    ],
  },
  'aws-console': {
    name: 'AWS Console',
    description: 'Opens the AWS Management Console signed in to your account',
    script: path.join(__dirname, 'aws-console.js'),
    logFile: '/tmp/aws-console.log',
    icon: '🟧',
  },
  'aws-skillbuilder': {
    name: 'AWS Skill Builder',
    description: 'Opens AWS Skill Builder (training, cert prep, hands-on labs) with auto-login',
    script: path.join(__dirname, 'aws-skillbuilder.js'),
    logFile: '/tmp/aws-skillbuilder.log',
    icon: '🎓',
    hasTopicPicker: true,
    topicLabel: 'Open which section?',
    availableTopics: [
      { value: '',                      label: '🏠 Dashboard (default)' },
      { value: 'cloud-practitioner',    label: '📘 Cert prep: Cloud Practitioner (CLF-C02)' },
      { value: 'solutions-architect',   label: '📗 Cert prep: Solutions Architect Associate' },
      { value: 'developer-associate',   label: '📙 Cert prep: Developer Associate' },
      { value: 'sysops-administrator',  label: '📕 Cert prep: SysOps Administrator' },
      { value: 'practice-questions',    label: '❓ Official Practice Questions' },
      { value: 'labs',                  label: '🧪 Hands-on Labs catalog' },
    ],
  },
  'aws-skillbuilder-lab': {
    name: 'AWS Lab of the Day',
    description: 'Reads latest captions transcript, finds today\'s AWS topic, opens the matching hands-on lab',
    script: path.join(__dirname, 'aws-skillbuilder-lab.js'),
    logFile: '/tmp/aws-skillbuilder-lab.log',
    icon: '🧪',
  },
  'qa-platform': {
    name: 'QA Platform',
    description: 'Opens platform.qa.com (Learn. To Change.) with auto-login',
    script: path.join(__dirname, 'qa-platform.js'),
    logFile: '/tmp/qa-platform.log',
    icon: '🟦',
  },
  'qa-lab': {
    name: 'QA Lab of the Day',
    description: 'Summarises today\'s class from the transcript and opens QA search tabs for the top labs',
    script: path.join(__dirname, 'qa-lab.js'),
    logFile: '/tmp/qa-lab.log',
    icon: '🔬',
    hasTopicPicker: true,
    topicLabel: 'Override topic (optional)',
    availableTopics: [
      { value: '',                          label: '🤖 Auto (from today\'s transcript)' },
      { value: 'Amazon EC2 Instance, Linux', label: 'EC2 / Linux / SSH' },
      { value: 'Introduction to IAM',        label: 'IAM' },
      { value: 'Introduction to VPC',        label: 'VPC' },
      { value: 'Introduction to S3',         label: 'S3' },
      { value: 'Introduction to Lambda',     label: 'Lambda' },
      { value: 'DynamoDB',                   label: 'DynamoDB' },
      { value: 'AWS Organizations',          label: 'AWS Organizations' },
      { value: 'Control Tower',              label: 'Control Tower' },
      { value: 'Security Lab for Beginners', label: 'Security' },
      { value: 'RDS',                        label: 'RDS' },
      { value: 'CloudWatch',                 label: 'CloudWatch' },
      // Direct course/lab URLs — opened as-is, no search.
      { value: 'https://platform.qa.com/course/design-multi-tier-architectures/saa-d1-introduction/',
        label: '🏗 Course: Design Multi-Tier Architectures (SAA-D1)' },
    ],
  },
  'meet-join': {
    name: 'Google Meet Auto-Join',
    description: 'Opens Google Meet, mutes mic/camera, joins meeting, enables captions, sends greeting',
    script: path.join(__dirname, 'meet-join.js'),
    logFile: '/tmp/meet-join.log',
    screenshots: [
      { name: 'Pre-join', path: '/tmp/meet-prejoin.png' },
    ],
    icon: '📹',
    requiresArg: true,
    argLabel: 'Meet URL',
    argPlaceholder: 'https://meet.google.com/xxx-yyyy-zzz',
  },
};

// Track running processes
const running = new Map();

// ── GET /api/browser-scripts ────────────────────────────────────────────────
router.get('/browser-scripts', (_req, res) => {
  const scripts = Object.entries(SCRIPTS).map(([id, s]) => ({
    id,
    name: s.name,
    description: s.description,
    icon: s.icon,
    requiresArg: s.requiresArg || false,
    argLabel: s.argLabel || null,
    argPlaceholder: s.argPlaceholder || null,
    hasServicePicker: s.hasServicePicker || false,
    availableServices: s.availableServices || null,
    hasTopicPicker: s.hasTopicPicker || false,
    topicLabel: s.topicLabel || null,
    availableTopics: s.availableTopics || null,
    running: running.has(id),
  }));
  res.json(scripts);
});

// ── POST /api/browser-scripts/:id/run ───────────────────────────────────────
router.post('/browser-scripts/:id/run', (req, res) => {
  const { id } = req.params;
  const script = SCRIPTS[id];
  if (!script) return res.status(404).json({ error: 'Script not found' });

  if (running.has(id)) {
    return res.status(409).json({ error: 'Script is already running' });
  }

  // Clear old log
  try { fs.writeFileSync(script.logFile, ''); } catch {}

  const args = [script.script];
  if (script.requiresArg && req.body.arg) {
    args.push(req.body.arg);
  }
  if (script.hasServicePicker && req.body.services?.length) {
    args.push(`--services=${JSON.stringify(req.body.services)}`);
  }
  if (script.hasTopicPicker && req.body.topic) {
    args.push(`--topic=${req.body.topic}`);
  }

  const proc = spawn('node', args, {
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' },
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const startTime = Date.now();
  let output = '';

  proc.stdout.on('data', (d) => { output += d.toString(); });
  proc.stderr.on('data', (d) => { output += d.toString(); });

  running.set(id, { pid: proc.pid, startTime, proc });

  proc.on('close', (code) => {
    running.delete(id);
  });

  res.json({ status: 'started', pid: proc.pid });
});

// ── POST /api/browser-scripts/:id/stop ──────────────────────────────────────
router.post('/browser-scripts/:id/stop', (req, res) => {
  const { id } = req.params;
  const entry = running.get(id);
  if (!entry) return res.status(404).json({ error: 'Script is not running' });

  try {
    entry.proc.kill('SIGTERM');
    setTimeout(() => {
      try { entry.proc.kill('SIGKILL'); } catch {}
    }, 3000);
  } catch {}

  running.delete(id);
  res.json({ status: 'stopped' });
});

// ── GET /api/browser-scripts/:id/status ─────────────────────────────────────
router.get('/browser-scripts/:id/status', (req, res) => {
  const { id } = req.params;
  const script = SCRIPTS[id];
  if (!script) return res.status(404).json({ error: 'Script not found' });

  const isRunning = running.has(id);
  const entry = running.get(id);

  // Read log tail
  let log = '';
  try {
    const content = fs.readFileSync(script.logFile, 'utf8');
    const lines = content.trim().split('\n');
    log = lines.slice(-30).join('\n');
  } catch {}

  // Read summary if exists
  let summary = null;
  if (script.summaryFile) {
    try {
      summary = JSON.parse(fs.readFileSync(script.summaryFile, 'utf8'));
    } catch {}
  }

  // Check which screenshots exist
  const screenshots = (script.screenshots || [])
    .filter(s => { try { return fs.existsSync(s.path); } catch { return false; } })
    .map(s => ({ name: s.name, url: `/api/browser-scripts/${id}/screenshot/${encodeURIComponent(path.basename(s.path))}` }));

  res.json({
    running: isRunning,
    pid: entry?.pid || null,
    uptime: entry ? Math.floor((Date.now() - entry.startTime) / 1000) : null,
    log,
    summary,
    screenshots,
  });
});

// ── GET /api/browser-scripts/:id/screenshot/:file ───────────────────────────
router.get('/browser-scripts/:id/screenshot/:file', (req, res) => {
  const { id, file } = req.params;
  const script = SCRIPTS[id];
  if (!script) return res.status(404).json({ error: 'Script not found' });

  const allowed = (script.screenshots || []).map(s => path.basename(s.path));
  if (!allowed.includes(file)) return res.status(403).json({ error: 'Not allowed' });

  const filePath = (script.screenshots || []).find(s => path.basename(s.path) === file)?.path;
  if (!filePath || !fs.existsSync(filePath)) return res.status(404).json({ error: 'Screenshot not found' });

  res.sendFile(filePath);
});

// ── GET /api/meet/screenshot ─────────────────────────────────────────────────
// Connects to the running Meet Chrome instance and takes a live screenshot
router.get('/meet/screenshot', async (req, res) => {
  const http = require('http');
  const puppeteer = require('puppeteer-core');
  const DEBUG_PORT = 9399;
  const SCREENSHOT_PATH = '/tmp/meet-live.png';

  // Check debug port is up
  const alive = await new Promise(resolve => {
    const r = http.get(`http://127.0.0.1:${DEBUG_PORT}/json/version`, () => resolve(true));
    r.on('error', () => resolve(false));
    r.end();
  });

  if (!alive) return res.status(503).json({ error: 'Meet is not running (Chrome debug port not active)' });

  let browser;
  try {
    browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
      defaultViewport: null,
    });

    const pages = await browser.pages();
    const page = pages.find(p => p.url().includes('meet.google.com'));
    if (!page) return res.status(404).json({ error: 'No Meet tab found' });

    await page.screenshot({ path: SCREENSHOT_PATH, type: 'png' });
    browser.disconnect();
    res.sendFile(SCREENSHOT_PATH);
  } catch (err) {
    try { browser?.disconnect(); } catch {}
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
