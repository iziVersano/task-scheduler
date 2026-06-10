const express = require('express');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const router = express.Router();
const db = require('./db');
const { analyzeTranscript } = require('./lab-analyzer');
const { requireAuth } = require('./iam-middleware');

const CAPTIONS_DIR = path.join(__dirname, 'captions');
const GENERATED_DIR = path.join(__dirname, 'labs', 'generated');

fs.mkdirSync(GENERATED_DIR, { recursive: true });

// ── Shared enrichment ────────────────────────────────────────────────────────
function enrichLab(lab) {
  return {
    ...lab,
    instructions: JSON.parse(lab.instructions),
    commands: JSON.parse(lab.commands),
  };
}

// ── Safe command whitelist for local execution ──────────────────────────────
const SAFE_COMMANDS = [
  /^ip\s+(a|addr|addr\s+show|route|route\s+show|route\s+get\s+[\d.]+|link\s+show)$/,
  /^ifconfig$/,
  /^ping\s+-c\s+\d+\s+[\w.\-]+$/,
  /^tracepath\s+-m\s+\d+\s+[\w.\-]+$/,
  /^traceroute\s+[\w.\-]+$/,
  /^nslookup\s+[\w.\-]+$/,
  /^nslookup\s+-type=\w+\s+[\w.\-]+$/,
  /^dig\s+[\w.\-]+(\s+\w+)?$/,
  /^ipcalc\s+[\d./]+$/,
  /^id$/,
  /^groups$/,
  /^whoami$/,
  /^sudo\s+whoami$/,
  /^cat\s+\/etc\/(group|hosts|hostname|ssh\/sshd_config)(\s*\|\s*grep\s+\w+)?$/,
  /^sudo\s+apt\s+update$/,
  /^sudo\s+apt\s+upgrade\s+-y$/,
  /^apt\s+list\s+--upgradable$/,
  /^sudo\s+systemctl\s+status\s+\w+$/,
  /^echo\s+"[^"]*"\s*\|\s*bc$/,
  /^python3\s+-c\s+"[^"]*"$/,
  /^ss\s+-\w+$/,
  /^netstat\s+-\w+$/,
  /^arp\s+-[an]$/,
];

function isCommandSafe(cmd) {
  return SAFE_COMMANDS.some(re => re.test(cmd.trim()));
}

// ── GET /api/labs/captions ──────────────────────────────────────────────────
router.get('/labs/captions', (req, res) => {
  try {
    if (!fs.existsSync(CAPTIONS_DIR)) return res.json([]);
    const files = fs.readdirSync(CAPTIONS_DIR)
      .filter(f => f.endsWith('.txt'))
      .sort()
      .reverse();
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/labs/generate ─────────────────────────────────────────────────
router.post('/labs/generate', (req, res) => {
  try {
    let { source, text } = req.body;

    if (source && !text) {
      const filePath = path.join(CAPTIONS_DIR, source);
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: `Caption file not found: ${source}` });
      }
      text = fs.readFileSync(filePath, 'utf-8');
    }

    if (!text?.trim()) {
      return res.status(400).json({ error: 'No transcript text provided' });
    }

    const sourceId = source ? source.replace('.txt', '') : `upload-${Date.now()}`;
    const result = analyzeTranscript(text, sourceId);

    if (result.labs.length === 0) {
      return res.json({ summary: result.summary, labs: [], message: 'No labs could be generated from this transcript' });
    }

    // Delete existing labs from same source
    db.prepare('DELETE FROM labs WHERE source_transcript = ?').run(sourceId);

    const insert = db.prepare(`
      INSERT INTO labs (id, title, category, concept, description, instructions, commands, source_transcript, difficulty)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const lab of result.labs) {
      const labId = `${lab.id}-${sourceId}`;
      insert.run(
        labId,
        lab.title,
        lab.category,
        lab.concept,
        lab.description || '',
        JSON.stringify(lab.instructions),
        JSON.stringify(lab.commands),
        lab.sourceTranscript,
        lab.difficulty || 1
      );
      lab.id = labId;
    }

    // Save to file
    const outputFile = path.join(GENERATED_DIR, `${sourceId}.json`);
    fs.writeFileSync(outputFile, JSON.stringify({
      source: sourceId,
      generatedAt: new Date().toISOString(),
      summary: result.summary,
      labs: result.labs,
    }, null, 2));

    res.status(201).json({ summary: result.summary, labs: result.labs, file: `labs/generated/${sourceId}.json` });
  } catch (err) {
    console.error('Lab generation error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/labs ───────────────────────────────────────────────────────────
router.get('/labs', (req, res) => {
  let sql = 'SELECT * FROM labs';
  const params = [];
  const conditions = [];

  if (req.query.source) {
    conditions.push('source_transcript = ?');
    params.push(req.query.source);
  }
  if (req.query.status) {
    conditions.push('status = ?');
    params.push(req.query.status);
  }
  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY created_at DESC';

  const labs = db.prepare(sql).all(...params);
  res.json(labs.map(enrichLab));
});

// ── GET /api/labs/:id ───────────────────────────────────────────────────────
router.get('/labs/:id', (req, res) => {
  const lab = db.prepare('SELECT * FROM labs WHERE id = ?').get(req.params.id);
  if (!lab) return res.status(404).json({ error: 'Lab not found' });
  res.json(enrichLab(lab));
});

// ── PUT /api/labs/:id ───────────────────────────────────────────────────────
router.put('/labs/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM labs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Lab not found' });

  const title        = req.body.title?.trim()        || existing.title;
  const category     = req.body.category?.trim()     || existing.category;
  const concept      = req.body.concept?.trim()      || existing.concept;
  const description  = req.body.description != null ? req.body.description : existing.description;
  const instructions = req.body.instructions         || JSON.parse(existing.instructions);
  const commands     = req.body.commands              || JSON.parse(existing.commands);
  const status       = req.body.status               || existing.status;

  db.prepare(`
    UPDATE labs SET title = ?, category = ?, concept = ?, description = ?, instructions = ?, commands = ?,
    status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?
  `).run(title, category, concept, description, JSON.stringify(instructions), JSON.stringify(commands), status, req.params.id);

  res.json(enrichLab(db.prepare('SELECT * FROM labs WHERE id = ?').get(req.params.id)));
});

// ── POST /api/labs/:id/publish ──────────────────────────────────────────────
router.post('/labs/:id/publish', (req, res) => {
  const lab = db.prepare('SELECT * FROM labs WHERE id = ?').get(req.params.id);
  if (!lab) return res.status(404).json({ error: 'Lab not found' });

  const newStatus = lab.status === 'published' ? 'draft' : 'published';
  db.prepare("UPDATE labs SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
    .run(newStatus, req.params.id);

  res.json(enrichLab(db.prepare('SELECT * FROM labs WHERE id = ?').get(req.params.id)));
});

// ── DELETE /api/labs/:id ────────────────────────────────────────────────────
router.delete('/labs/:id', (req, res) => {
  const lab = db.prepare('SELECT id FROM labs WHERE id = ?').get(req.params.id);
  if (!lab) return res.status(404).json({ error: 'Lab not found' });

  db.prepare('DELETE FROM labs WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── POST /api/labs/:id/execute — run command locally (no Docker) ────────────
router.post('/labs/:id/execute', (req, res) => {
  const lab = db.prepare('SELECT id FROM labs WHERE id = ?').get(req.params.id);
  if (!lab) return res.status(404).json({ error: 'Lab not found' });

  const { command } = req.body;
  if (!command || typeof command !== 'string') {
    return res.status(400).json({ error: 'command is required' });
  }

  if (!isCommandSafe(command)) {
    return res.status(403).json({ error: `Command not allowed: "${command}"` });
  }

  const start = Date.now();
  execFile('bash', ['-c', command], { timeout: 15000, maxBuffer: 256 * 1024 }, (err, stdout, stderr) => {
    const durationMs = Date.now() - start;

    if (err && err.killed) {
      return res.json({ stdout: stdout || '', stderr: 'Command timed out', exitCode: 124, durationMs, timedOut: true });
    }

    res.json({
      stdout: stdout || '',
      stderr: stderr || '',
      exitCode: err ? (err.code || 1) : 0,
      durationMs,
      timedOut: false,
    });
  });
});

module.exports = router;
