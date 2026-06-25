#!/usr/bin/env node
// node server/build-site.js  →  dist/index.html
const fs = require('fs');
const path = require('path');

const SUMMARY_DIR = path.join(__dirname, 'live-summary');
const MCQ_DIR     = path.join(__dirname, 'mcq');
const DIST_DIR    = path.join(__dirname, '..', 'dist');
const TEMPLATE    = path.join(__dirname, 'site-template.html');

fs.mkdirSync(DIST_DIR, { recursive: true });

function readEntry(filePath, date) {
  const raw  = fs.readFileSync(filePath, 'utf8');
  const text = raw.replace(/^<!-- updated: [^>]+ -->\n/, '').trim();
  const mcqFile = path.join(MCQ_DIR, `${date}.json`);
  const mcqs = fs.existsSync(mcqFile) ? JSON.parse(fs.readFileSync(mcqFile, 'utf8')) : [];
  return { date, text, mcqs };
}

const today = new Date().toISOString().slice(0, 10);
const todayFile = path.join(SUMMARY_DIR, 'today.md');

const datedSummaries = fs.readdirSync(SUMMARY_DIR)
  .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
  .sort().reverse()
  .map(f => readEntry(path.join(SUMMARY_DIR, f), f.replace('.md', '')));

// Prepend today.md if it exists and isn't already covered by a dated file
const hasTodayDated = datedSummaries.some(s => s.date === today);
const todayEntries = (!hasTodayDated && fs.existsSync(todayFile))
  ? [readEntry(todayFile, today)]
  : [];

const summaries = [...todayEntries, ...datedSummaries]
  .filter(s => s.text.length > 50);

const html = fs.readFileSync(TEMPLATE, 'utf8')
  .replace('__DAYS__', JSON.stringify(summaries));

fs.writeFileSync(path.join(DIST_DIR, 'index.html'), html);
const kb = (html.length / 1024).toFixed(1);
const mcqTotal = summaries.reduce((a, s) => a + s.mcqs.length, 0);
console.log(`Built dist/index.html — ${kb} KB  (${summaries.length} days, ${mcqTotal} MCQs)`);
