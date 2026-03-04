const express = require('express');
const cron = require('node-cron');
const router = express.Router();
const db = require('./db');
const { scheduleJob, unscheduleJob } = require('./scheduler');

// ── GET /api/jobs ─────────────────────────────────────────────────────────────
router.get('/jobs', (req, res) => {
  const jobs = db.prepare('SELECT * FROM jobs ORDER BY id DESC').all();
  res.json(jobs);
});

// ── POST /api/jobs ────────────────────────────────────────────────────────────
router.post('/jobs', (req, res) => {
  const { name, command, schedule, enabled = true } = req.body;

  if (!name?.trim() || !command?.trim() || !schedule?.trim()) {
    return res.status(400).json({ error: 'name, command, and schedule are required' });
  }
  if (!cron.validate(schedule.trim())) {
    return res.status(400).json({ error: `Invalid cron schedule: "${schedule}"` });
  }

  const { lastInsertRowid } = db
    .prepare('INSERT INTO jobs (name, command, schedule, enabled) VALUES (?, ?, ?, ?)')
    .run(name.trim(), command.trim(), schedule.trim(), enabled ? 1 : 0);

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(lastInsertRowid);
  if (job.enabled) scheduleJob(job);

  res.status(201).json(job);
});

// ── PUT /api/jobs/:id ─────────────────────────────────────────────────────────
router.put('/jobs/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const existing = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Job not found' });

  const name     = req.body.name?.trim()     || existing.name;
  const command  = req.body.command?.trim()  || existing.command;
  const schedule = req.body.schedule?.trim() || existing.schedule;
  const enabled  = req.body.enabled !== undefined
    ? (req.body.enabled ? 1 : 0)
    : existing.enabled;

  if (!cron.validate(schedule)) {
    return res.status(400).json({ error: `Invalid cron schedule: "${schedule}"` });
  }

  db.prepare('UPDATE jobs SET name = ?, command = ?, schedule = ?, enabled = ? WHERE id = ?')
    .run(name, command, schedule, enabled, id);

  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  unscheduleJob(id);
  if (job.enabled) scheduleJob(job);

  res.json(job);
});

// ── DELETE /api/jobs/:id ──────────────────────────────────────────────────────
router.delete('/jobs/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!db.prepare('SELECT id FROM jobs WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Job not found' });
  }
  unscheduleJob(id);
  db.prepare('DELETE FROM jobs WHERE id = ?').run(id);
  res.json({ success: true });
});

// ── POST /api/jobs/:id/toggle ─────────────────────────────────────────────────
router.post('/jobs/:id/toggle', (req, res) => {
  const id = parseInt(req.params.id);
  const job = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  if (!job) return res.status(404).json({ error: 'Job not found' });

  const newEnabled = job.enabled ? 0 : 1;
  db.prepare('UPDATE jobs SET enabled = ? WHERE id = ?').run(newEnabled, id);

  const updated = db.prepare('SELECT * FROM jobs WHERE id = ?').get(id);
  if (newEnabled) {
    scheduleJob(updated);
  } else {
    unscheduleJob(id);
  }

  res.json(updated);
});

// ── GET /api/jobs/:id/logs ────────────────────────────────────────────────────
router.get('/jobs/:id/logs', (req, res) => {
  const id = parseInt(req.params.id);
  if (!db.prepare('SELECT id FROM jobs WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Job not found' });
  }
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const logs = db
    .prepare('SELECT * FROM job_logs WHERE job_id = ? ORDER BY started_at DESC LIMIT ?')
    .all(id, limit);
  res.json(logs);
});

module.exports = router;
