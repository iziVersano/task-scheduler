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

// ── GET /api/diagrams/today ─────────────────────────────────────────────────
router.get('/diagrams/today', (req, res) => {
  const files = recentCaptionFiles(2);
  if (!files.length) {
    return res.json({ diagram: 'flowchart TD\n  empty["No caption files found"]', summary: null });
  }

  // Weight today (first file) 3x so today's class dominates the diagram.
  const todayText = fs.readFileSync(files[0], 'utf8');
  const olderText = files.slice(1).map(f => fs.readFileSync(f, 'utf8')).join('\n');
  const text = [todayText, todayText, todayText, olderText].join('\n');

  const dateLabel = path.basename(files[0], '.txt');
  const diagram = buildMermaid(text, dateLabel);

  const hits = TOPICS
    .map(t => ({ ...t, count: (text.match(t.rx) || []).length }))
    .filter(t => t.count > 0)
    .sort((a, b) => b.count - a.count);

  res.json({
    date: dateLabel,
    sources: files.map(f => path.basename(f)),
    diagram,
    summary: summary(text, hits),
  });
});

module.exports = router;
