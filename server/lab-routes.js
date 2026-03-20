const express = require('express');
const fs = require('fs');
const path = require('path');
const router = express.Router();
const db = require('./db');
const { analyzeTranscript } = require('./lab-analyzer');
const { executeInSandbox, isExecutableLab, getLabConfig, getSandboxStatus } = require('./sandbox/executor');

const CAPTIONS_DIR = path.join(__dirname, 'captions');
const GENERATED_DIR = path.join(__dirname, 'labs', 'generated');

// Ensure output directory exists
fs.mkdirSync(GENERATED_DIR, { recursive: true });

// ── GET /api/labs/sandbox/status ────────────────────────────────────────────
// Must be above /labs/:id to avoid matching "sandbox" as an id
router.get('/labs/sandbox/status', async (_req, res) => {
  const status = await getSandboxStatus();
  res.json(status);
});

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

    // If source is given, read from captions directory
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

    // Run the 3-pass analyzer
    const labs = analyzeTranscript(text, sourceId);

    if (labs.length === 0) {
      return res.json({ labs: [], message: 'No labs could be generated from this transcript' });
    }

    // Delete existing labs from same source before inserting
    db.prepare('DELETE FROM labs WHERE source_transcript = ?').run(sourceId);

    // Insert labs into database
    const insert = db.prepare(`
      INSERT INTO labs (id, title, category, concept, instructions, commands, source_transcript)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const lab of labs) {
      // Ensure unique id by appending source if needed
      const labId = `${lab.id}-${sourceId}`;
      insert.run(
        labId,
        lab.title,
        lab.category,
        lab.concept,
        JSON.stringify(lab.instructions),
        JSON.stringify(lab.commands),
        lab.sourceTranscript
      );
      lab.id = labId; // update for response
    }

    // Save to file
    const outputFile = path.join(GENERATED_DIR, `${sourceId}.json`);
    fs.writeFileSync(outputFile, JSON.stringify({
      source: sourceId,
      generatedAt: new Date().toISOString(),
      labs,
    }, null, 2));

    res.status(201).json({ labs, file: `labs/generated/${sourceId}.json` });
  } catch (err) {
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
  if (conditions.length) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }
  sql += ' ORDER BY created_at DESC';

  const labs = db.prepare(sql).all(...params);

  // Parse JSON fields and enrich with executable metadata
  const parsed = labs.map(lab => {
    const out = {
      ...lab,
      instructions: JSON.parse(lab.instructions),
      commands: JSON.parse(lab.commands),
    };
    const config = getLabConfig(lab.id);
    if (config) {
      out.executable = true;
      out.allowedCommands = config.allowedCommands;
    }
    return out;
  });

  res.json(parsed);
});

// ── GET /api/labs/:id ───────────────────────────────────────────────────────
router.get('/labs/:id', (req, res) => {
  const lab = db.prepare('SELECT * FROM labs WHERE id = ?').get(req.params.id);
  if (!lab) return res.status(404).json({ error: 'Lab not found' });

  lab.instructions = JSON.parse(lab.instructions);
  lab.commands = JSON.parse(lab.commands);
  const config = getLabConfig(lab.id);
  if (config) {
    lab.executable = true;
    lab.allowedCommands = config.allowedCommands;
  }
  res.json(lab);
});

// ── PUT /api/labs/:id ───────────────────────────────────────────────────────
router.put('/labs/:id', (req, res) => {
  const existing = db.prepare('SELECT * FROM labs WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Lab not found' });

  const title        = req.body.title?.trim()        || existing.title;
  const category     = req.body.category?.trim()     || existing.category;
  const concept      = req.body.concept?.trim()      || existing.concept;
  const instructions = req.body.instructions         || JSON.parse(existing.instructions);
  const commands     = req.body.commands              || JSON.parse(existing.commands);
  const status       = req.body.status               || existing.status;

  // Validate commands
  const safePattern = /^[a-zA-Z0-9.\-\s\/:_=]+$/;
  for (const cmd of commands) {
    if (!safePattern.test(cmd)) {
      return res.status(400).json({ error: `Unsafe command: "${cmd}"` });
    }
  }

  db.prepare(`
    UPDATE labs SET title = ?, category = ?, concept = ?, instructions = ?, commands = ?,
    status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?
  `).run(title, category, concept, JSON.stringify(instructions), JSON.stringify(commands), status, req.params.id);

  const lab = db.prepare('SELECT * FROM labs WHERE id = ?').get(req.params.id);
  lab.instructions = JSON.parse(lab.instructions);
  lab.commands = JSON.parse(lab.commands);
  res.json(lab);
});

// ── POST /api/labs/:id/publish ──────────────────────────────────────────────
router.post('/labs/:id/publish', (req, res) => {
  const lab = db.prepare('SELECT * FROM labs WHERE id = ?').get(req.params.id);
  if (!lab) return res.status(404).json({ error: 'Lab not found' });

  const newStatus = lab.status === 'published' ? 'draft' : 'published';
  db.prepare("UPDATE labs SET status = ?, updated_at = datetime('now', 'localtime') WHERE id = ?")
    .run(newStatus, req.params.id);

  const updated = db.prepare('SELECT * FROM labs WHERE id = ?').get(req.params.id);
  updated.instructions = JSON.parse(updated.instructions);
  updated.commands = JSON.parse(updated.commands);
  res.json(updated);
});

// ── DELETE /api/labs/:id ────────────────────────────────────────────────────
router.delete('/labs/:id', (req, res) => {
  const lab = db.prepare('SELECT id FROM labs WHERE id = ?').get(req.params.id);
  if (!lab) return res.status(404).json({ error: 'Lab not found' });

  db.prepare('DELETE FROM labs WHERE id = ?').run(req.params.id);
  res.json({ success: true });
});

// ── POST /api/labs/:id/execute ──────────────────────────────────────────────
router.post('/labs/:id/execute', async (req, res) => {
  try {
    const lab = db.prepare('SELECT id FROM labs WHERE id = ?').get(req.params.id);
    if (!lab) return res.status(404).json({ error: 'Lab not found' });

    const { command } = req.body;
    if (!command || typeof command !== 'string') {
      return res.status(400).json({ error: 'command is required' });
    }

    const result = await executeInSandbox(req.params.id, command);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

module.exports = router;
