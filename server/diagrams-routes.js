const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();
const CAPTIONS_DIR = path.join(__dirname, 'captions');

// Topics we look for + the cluster/family they belong to. The cluster determines
// where they appear in the generated diagram (Compute / Storage / etc.).
const TOPICS = [
  // Compute
  { name: 'EC2',                rx: /\bEC2\b|\bec2\b|easy to instance/gi,          cluster: 'Compute' },
  { name: 'Lambda',             rx: /\blambda\b/gi,                                cluster: 'Compute' },
  { name: 'AMI',                rx: /\bAMI\b/gi,                                   cluster: 'Compute' },
  { name: 'Ubuntu',             rx: /\bubuntu\b/gi,                                cluster: 'Compute' },
  // Networking
  { name: 'VPC',                rx: /\bVPC\b|\bvpc\b/gi,                           cluster: 'Networking' },
  { name: 'Security Group',     rx: /\bsecurity group\b/gi,                        cluster: 'Networking' },
  { name: 'Availability Zone',  rx: /availability zones?/gi,                       cluster: 'Networking' },
  // Storage
  { name: 'S3',                 rx: /\bS3\b|\bs3\b/gi,                             cluster: 'Storage' },
  { name: 'EBS',                rx: /\bEBS\b|\bebs\b/gi,                           cluster: 'Storage' },
  // Database
  { name: 'DynamoDB',           rx: /\bdynamodb\b/gi,                              cluster: 'Database' },
  { name: 'RDS',                rx: /\brds\b/gi,                                   cluster: 'Database' },
  // Identity / Governance
  { name: 'IAM',                rx: /\biam\b|\bi am\b/gi,                          cluster: 'Identity' },
  { name: 'Organizations',      rx: /\borganizations?\b/gi,                        cluster: 'Identity' },
  { name: 'Control Tower',      rx: /\bcontrol tower\b/gi,                         cluster: 'Identity' },
  // Access / Sub-topics
  { name: 'SSH',                rx: /\bssh\b/gi,                                   cluster: 'Access' },
  { name: 'Key Pair',           rx: /\bkey ?pair\b|\.pem\b/gi,                     cluster: 'Access' },
  { name: 'User Data',          rx: /user data/gi,                                 cluster: 'Access' },
];

// Edges to draw if both ends are present in today's topics. Captures the
// relationships the instructor actually teaches.
const EDGES = [
  ['EC2',               'SSH',               'connect via'],
  ['SSH',               'Key Pair',          'uses'],
  ['EC2',               'User Data',         'bootstraps with'],
  ['EC2',               'Security Group',    'protected by'],
  ['EC2',               'AMI',               'launched from'],
  ['EC2',               'EBS',               'stores on'],
  ['EC2',               'VPC',               'lives in'],
  ['EC2',               'Availability Zone', 'placed in'],
  ['VPC',               'Availability Zone', 'spans'],
  ['VPC',               'Security Group',    'contains'],
  ['IAM',               'EC2',               'authorises'],
  ['IAM',               'S3',                'authorises'],
  ['IAM',               'DynamoDB',          'authorises'],
  ['Lambda',            'DynamoDB',          'reads/writes'],
  ['Lambda',            'S3',                'reads/writes'],
  ['Organizations',     'Control Tower',     'managed via'],
  ['EC2',               'Ubuntu',            'runs OS'],
];

function recentCaptionFiles(n = 2) {
  if (!fs.existsSync(CAPTIONS_DIR)) return [];
  return fs.readdirSync(CAPTIONS_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.txt$/.test(f))
    .sort()
    .reverse()
    .slice(0, n)
    .map(f => path.join(CAPTIONS_DIR, f));
}

function safeNodeId(name) {
  return name.replace(/[^A-Za-z0-9]/g, '');
}

// ── CIDR / subnetting diagram ────────────────────────────────────────────────
// Today's class covered subnets and IP-range calculation. When the transcript
// mentions CIDR blocks (e.g. 10.0.0.0/16, /24, /30) we render a teaching diagram
// that shows how a VPC block splits into subnets, with computed host counts.

// 2^(32-prefix) total addresses; AWS reserves 5 per subnet → usable = total - 5.
function cidrInfo(prefix) {
  const total = Math.pow(2, 32 - prefix);
  const usable = prefix <= 30 ? Math.max(total - 5, 0) : 0; // AWS reserves 5
  return { total, usable };
}

// Pull real CIDR mentions out of the transcript. Handles "10.0.0.0/16" and the
// spoken/transcribed "slash 24" / "/ 24" / bare "/24" prefixes.
function extractCidrs(text) {
  const full = new Set();
  const prefixes = new Set();

  // Full a.b.c.d/nn
  for (const m of text.matchAll(/\b(\d{1,3}(?:\.\d{1,3}){3})\s*\/\s*(\d{1,2})\b/g)) {
    const p = Number(m[2]);
    if (p >= 0 && p <= 32) full.add(`${m[1]}/${p}`);
  }
  // Bare or spoken prefixes: "/16", "slash 24"
  for (const m of text.matchAll(/(?:\/\s*|slash\s+)(\d{1,2})\b/gi)) {
    const p = Number(m[1]);
    if (p >= 8 && p <= 32) prefixes.add(p);
  }
  return { full: [...full], prefixes: [...prefixes].sort((a, b) => a - b) };
}

function buildCidrMermaid(text) {
  const { full, prefixes } = extractCidrs(text);
  if (!full.length && !prefixes.length) return null;

  const lines = ['flowchart TD'];
  lines.push('  classDef vpc fill:#1e3a5f,stroke:#3b82f6,color:#fff;');
  lines.push('  classDef pub fill:#14532d,stroke:#22c55e,color:#fff;');
  lines.push('  classDef priv fill:#3b1e54,stroke:#a855f7,color:#fff;');
  lines.push('  classDef calc fill:#422006,stroke:#f59e0b,color:#fff;');

  // Pick a base VPC block: prefer a /16 that was actually mentioned, else default.
  const vpc = full.find(c => c.endsWith('/16')) || '10.0.0.0/16';
  const vInfo = cidrInfo(Number(vpc.split('/')[1]));
  lines.push(`  VPC["VPC ${vpc}<br/>${vInfo.total.toLocaleString()} IPs"]`);
  lines.push('  class VPC vpc;');

  // Subnets: use mentioned /24-ish blocks, otherwise illustrate public/private.
  const subnetBlocks = full.filter(c => {
    const p = Number(c.split('/')[1]);
    return p >= 17 && p <= 28;
  });

  if (subnetBlocks.length) {
    subnetBlocks.slice(0, 6).forEach((c, i) => {
      const info = cidrInfo(Number(c.split('/')[1]));
      const id = `SUB${i}`;
      const kind = i % 2 === 0 ? 'pub' : 'priv';
      const label = `${i % 2 === 0 ? 'Public' : 'Private'} Subnet<br/>${c}<br/>${info.usable} usable`;
      lines.push(`  ${id}["${label}"]`);
      lines.push(`  VPC --> ${id}`);
      lines.push(`  class ${id} ${kind};`);
    });
  } else {
    const sub = cidrInfo(24);
    lines.push(`  SUB0["Public Subnet<br/>10.0.1.0/24<br/>${sub.usable} usable"]`);
    lines.push(`  SUB1["Private Subnet<br/>10.0.2.0/24<br/>${sub.usable} usable"]`);
    lines.push('  VPC --> SUB0');
    lines.push('  VPC --> SUB1');
    lines.push('  class SUB0 pub;');
    lines.push('  class SUB1 priv;');
  }

  // Prefix cheat-sheet for the prefixes mentioned in class.
  const cheats = (prefixes.length ? prefixes : [16, 24, 28, 30])
    .filter(p => p >= 16)
    .slice(0, 6)
    .map(p => {
      const info = cidrInfo(p);
      return `/${p} → ${info.total.toLocaleString()} IPs (${info.usable} usable)`;
    });
  if (cheats.length) {
    lines.push(`  CALC["Prefix → hosts<br/>${cheats.join('<br/>')}"]`);
    lines.push('  VPC -.-> CALC');
    lines.push('  class CALC calc;');
  }

  return lines.join('\n');
}

function buildMermaid(text, dateLabel) {
  const hits = TOPICS
    .map(t => ({ ...t, count: (text.match(t.rx) || []).length }))
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count);

  if (!hits.length) {
    return `flowchart TD\n  empty["No AWS topics detected in ${dateLabel}"]`;
  }

  const present = new Set(hits.map(h => h.name));
  const byCluster = {};
  for (const h of hits) {
    (byCluster[h.cluster] ||= []).push(h);
  }

  const lines = ['flowchart LR', `  classDef hot fill:#0ea5e9,stroke:#0369a1,color:#fff;`];
  lines.push(`  classDef warm fill:#1e293b,stroke:#475569,color:#e2e8f0;`);

  // Clusters as subgraphs
  for (const [cluster, items] of Object.entries(byCluster)) {
    lines.push(`  subgraph ${safeNodeId(cluster)}["${cluster}"]`);
    for (const item of items) {
      const id = safeNodeId(item.name);
      const label = `${item.name}<br/>${item.count}×`;
      lines.push(`    ${id}["${label}"]`);
    }
    lines.push('  end');
  }

  // Edges
  for (const [a, b, label] of EDGES) {
    if (present.has(a) && present.has(b)) {
      lines.push(`  ${safeNodeId(a)} -- "${label}" --> ${safeNodeId(b)}`);
    }
  }

  // Highlight the top 3 topics
  for (const top of hits.slice(0, 3)) {
    lines.push(`  class ${safeNodeId(top.name)} hot;`);
  }
  for (const t of hits.slice(3)) {
    lines.push(`  class ${safeNodeId(t.name)} warm;`);
  }

  return lines.join('\n');
}

function summary(text, hits) {
  const top = hits.slice(0, 6).map(h => ({ name: h.name, count: h.count, cluster: h.cluster }));
  return { totalTopics: hits.length, top };
}

// List all transcript dates that exist, newest first.
function allCaptionDates() {
  if (!fs.existsSync(CAPTIONS_DIR)) return [];
  return fs.readdirSync(CAPTIONS_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.txt$/.test(f))
    .map(f => path.basename(f, '.txt'))
    .sort()
    .reverse();
}

// Build a diagram payload for one specific date. When `withContext` is true,
// the previous day is mixed in (today weighted 3×) — matching the original
// "today" behaviour so the latest class dominates.
function diagramForDate(dateLabel, { withContext = true } = {}) {
  const file = path.join(CAPTIONS_DIR, `${dateLabel}.txt`);
  if (!fs.existsSync(file)) return null;

  const todayText = fs.readFileSync(file, 'utf8');
  const sources = [`${dateLabel}.txt`];

  let text = todayText;
  if (withContext) {
    // Find the chronologically previous transcript for light context.
    const dates = allCaptionDates();
    const idx = dates.indexOf(dateLabel);
    const prev = idx >= 0 && idx + 1 < dates.length ? dates[idx + 1] : null;
    const olderText = prev ? fs.readFileSync(path.join(CAPTIONS_DIR, `${prev}.txt`), 'utf8') : '';
    if (prev) sources.push(`${prev}.txt`);
    text = [todayText, todayText, todayText, olderText].join('\n');
  }

  const diagram = buildMermaid(text, dateLabel);
  const cidrDiagram = buildCidrMermaid(text); // null when no subnet/CIDR content
  const hits = TOPICS
    .map(t => ({ ...t, count: (text.match(t.rx) || []).length }))
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count);

  return { date: dateLabel, sources, diagram, cidrDiagram, summary: summary(text, hits) };
}

// ── GET /api/diagrams/days ──────────────────────────────────────────────────
// Lists every transcript day with its detected topic count (for the grid).
router.get('/diagrams/days', (_req, res) => {
  const dates = allCaptionDates();
  const out = dates.map(d => {
    const text = fs.readFileSync(path.join(CAPTIONS_DIR, `${d}.txt`), 'utf8');
    const hits = TOPICS.filter(t => (text.match(t.rx) || []).length > 0);
    const topTopic = TOPICS
      .map(t => ({ name: t.name, count: (text.match(t.rx) || []).length }))
      .filter(t => t.count > 0)
      .sort((a, b) => b.count - a.count)[0];
    return { date: d, topics: hits.length, top: topTopic?.name || null };
  }).filter(d => d.topics > 0);
  res.json(out);
});

// ── GET /api/diagrams/day/:date ─────────────────────────────────────────────
router.get('/diagrams/day/:date', (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Bad date' });
  // Per-day view: just that day's transcript, no cross-day weighting.
  const payload = diagramForDate(date, { withContext: false });
  if (!payload) return res.status(404).json({ error: 'No transcript for that date' });
  res.json(payload);
});

// ── GET /api/diagrams/today ─────────────────────────────────────────────────
router.get('/diagrams/today', (_req, res) => {
  const dates = allCaptionDates();
  if (!dates.length) {
    return res.json({ diagram: 'flowchart TD\n  empty["No caption files found"]', summary: null });
  }
  res.json(diagramForDate(dates[0], { withContext: true }));
});

module.exports = router;
