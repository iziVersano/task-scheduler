const express = require('express');
const path = require('path');
const fs = require('fs');
const http = require('http');
const puppeteer = require('puppeteer-core');

const router = express.Router();

const DEBUG_PORT = 9399; // same Chrome the Meet auto-join uses
const SLIDES_DIR = path.join(__dirname, 'slides');

function dayDir(date = new Date()) {
  const d = date.toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' }); // YYYY-MM-DD
  const dir = path.join(SLIDES_DIR, d);
  fs.mkdirSync(dir, { recursive: true });
  return { dir, day: d };
}

function meetAlive() {
  return new Promise((resolve) => {
    const r = http.get(`http://127.0.0.1:${DEBUG_PORT}/json/version`, () => resolve(true));
    r.on('error', () => resolve(false));
    r.end();
  });
}

// ── POST /api/slides/capture ─────────────────────────────────────────────────
// Grabs a screenshot of the live Meet tab and saves it into today's folder.
router.post('/slides/capture', async (req, res) => {
  if (!(await meetAlive())) {
    return res.status(503).json({ error: 'Meet is not running (Chrome debug port not active)' });
  }

  let browser;
  try {
    browser = await puppeteer.connect({
      browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
      defaultViewport: null,
    });
    const pages = await browser.pages();
    const page = pages.find(p => p.url().includes('meet.google.com'));
    if (!page) { browser.disconnect(); return res.status(404).json({ error: 'No Meet tab found' }); }

    const { dir, day } = dayDir();
    const time = new Date().toLocaleTimeString('en-GB', { timeZone: 'Europe/Berlin' }).replace(/:/g, '-');
    const filename = `${time}.png`;
    const filePath = path.join(dir, filename);

    await page.screenshot({ path: filePath, type: 'png' });
    browser.disconnect();

    res.json({ ok: true, day, filename, url: `/api/slides/${day}/${filename}` });
  } catch (err) {
    try { browser?.disconnect(); } catch {}
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/slides/days ─────────────────────────────────────────────────────
// Lists available days (newest first) with a count.
router.get('/slides/days', (_req, res) => {
  try {
    if (!fs.existsSync(SLIDES_DIR)) return res.json([]);
    const days = fs.readdirSync(SLIDES_DIR)
      .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .map(d => ({
        day: d,
        count: fs.readdirSync(path.join(SLIDES_DIR, d)).filter(f => f.endsWith('.png')).length,
      }))
      .filter(d => d.count > 0)
      .sort((a, b) => b.day.localeCompare(a.day));
    res.json(days);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/slides/:day ─────────────────────────────────────────────────────
// Lists the slides for a given day (newest first).
router.get('/slides/:day', (req, res) => {
  const { day } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return res.status(400).json({ error: 'Bad day' });
  const dir = path.join(SLIDES_DIR, day);
  if (!fs.existsSync(dir)) return res.json([]);
  try {
    const files = fs.readdirSync(dir)
      .filter(f => f.endsWith('.png'))
      .sort((a, b) => b.localeCompare(a))
      .map(f => ({ filename: f, url: `/api/slides/${day}/${f}` }));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/slides/:day/:file ───────────────────────────────────────────────
router.get('/slides/:day/:file', (req, res) => {
  const { day, file } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^[\w.-]+\.png$/.test(file)) {
    return res.status(400).json({ error: 'Bad path' });
  }
  const filePath = path.join(SLIDES_DIR, day, file);
  if (!filePath.startsWith(SLIDES_DIR) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(filePath);
});

// ── DELETE /api/slides/:day/:file ────────────────────────────────────────────
router.delete('/slides/:day/:file', (req, res) => {
  const { day, file } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^[\w.-]+\.png$/.test(file)) {
    return res.status(400).json({ error: 'Bad path' });
  }
  const filePath = path.join(SLIDES_DIR, day, file);
  if (!filePath.startsWith(SLIDES_DIR) || !fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Not found' });
  }
  try { fs.unlinkSync(filePath); res.json({ ok: true }); }
  catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
