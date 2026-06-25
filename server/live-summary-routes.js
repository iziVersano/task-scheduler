const express = require('express');
const path = require('path');
const fs = require('fs');
const { generateMCQs } = require('./mcq-routes');

const router = express.Router();
const SUMMARY_DIR = path.join(__dirname, 'live-summary');
const SUMMARY_FILE = path.join(SUMMARY_DIR, 'today.md');

function todayDate() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

// Archive today.md to YYYY-MM-DD.md if it belongs to a previous day.
function archiveIfStale() {
  if (!fs.existsSync(SUMMARY_FILE)) return;
  const raw = fs.readFileSync(SUMMARY_FILE, 'utf8');
  const m = raw.match(/^<!-- updated: ([^>]+) -->/);
  if (!m) return;
  const fileDate = m[1].trim().slice(0, 10);
  if (fileDate !== todayDate()) {
    const dest = path.join(SUMMARY_DIR, `${fileDate}.md`);
    if (!fs.existsSync(dest)) fs.renameSync(SUMMARY_FILE, dest);
    else fs.unlinkSync(SUMMARY_FILE); // already archived
  }
}

function readSummary(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const m = raw.match(/^<!-- updated: ([^>]+) -->\n/);
  return {
    text: raw.replace(/^<!-- updated: [^>]+ -->\n/, ''),
    updatedAt: m ? m[1].trim() : null,
  };
}

// ── POST /api/live-summary ───────────────────────────────────────────────────
// The /loop writes its latest class summary here. Auto-archives stale file first.
router.post('/live-summary', express.json({ limit: '1mb' }), (req, res) => {
  const text = (req.body?.text || '').toString();
  if (!text.trim()) return res.status(400).json({ error: 'text is required' });
  try {
    fs.mkdirSync(SUMMARY_DIR, { recursive: true });
    archiveIfStale();
    const stamped = `<!-- updated: ${new Date().toISOString()} -->\n${text}`;
    fs.writeFileSync(SUMMARY_FILE, stamped);
    const savedDate = new Date().toISOString().slice(0, 10);
    res.json({ ok: true, updatedAt: new Date().toISOString() });
    // Fire-and-forget MCQ generation — don't block the response
    generateMCQs(savedDate, text).catch(e => console.error('MCQ generation failed:', e.message));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/live-summary/dates ──────────────────────────────────────────────
// Returns list of all dates that have a saved summary.
router.get('/live-summary/dates', (_req, res) => {
  try {
    fs.mkdirSync(SUMMARY_DIR, { recursive: true });
    archiveIfStale();
    const dates = fs.readdirSync(SUMMARY_DIR)
      .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
      .map(f => f.replace('.md', ''))
      .sort()
      .reverse();
    // Also include today if today.md exists
    if (fs.existsSync(SUMMARY_FILE)) {
      const t = todayDate();
      if (!dates.includes(t)) dates.unshift(t);
    }
    res.json({ dates });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/live-summary ────────────────────────────────────────────────────
// Returns today's summary. Optional ?date=YYYY-MM-DD to fetch a past day.
router.get('/live-summary', (req, res) => {
  try {
    const date = req.query.date;
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      // Specific past date requested
      const dated = path.join(SUMMARY_DIR, `${date}.md`);
      if (!fs.existsSync(dated)) return res.json({ text: '', updatedAt: null, date });
      return res.json({ ...readSummary(dated), date });
    }

    // Today: prefer today.md, fall back to today's dated file
    archiveIfStale();
    const todayDated = path.join(SUMMARY_DIR, `${todayDate()}.md`);
    const file = fs.existsSync(SUMMARY_FILE) ? SUMMARY_FILE
               : fs.existsSync(todayDated)   ? todayDated
               : null;
    if (!file) return res.json({ text: '', updatedAt: null });
    res.json(readSummary(file));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
