#!/usr/bin/env node
// Generates MCQs for every past summary that doesn't have a .json yet.
// Run once: node server/backfill-mcq.js
require('dotenv').config({ path: __dirname + '/.env' });

const fs = require('fs');
const path = require('path');
const { generateMCQs } = require('./mcq-routes');

const SUMMARY_DIR = path.join(__dirname, 'live-summary');
const MCQ_DIR = path.join(__dirname, 'mcq');

function readSummaryText(file) {
  const raw = fs.readFileSync(file, 'utf8');
  return raw.replace(/^<!-- updated: [^>]+ -->\n/, '').trim();
}

async function main() {
  const files = fs.readdirSync(SUMMARY_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort();

  for (const file of files) {
    const date = file.replace('.md', '');
    const mcqFile = path.join(MCQ_DIR, `${date}.json`);
    if (fs.existsSync(mcqFile)) {
      console.log(`  skip ${date} — already has MCQs`);
      continue;
    }
    const text = readSummaryText(path.join(SUMMARY_DIR, file));
    if (text.length < 100) {
      console.log(`  skip ${date} — summary too short`);
      continue;
    }
    console.log(`  generating ${date}…`);
    try {
      const qs = await generateMCQs(date, text);
      console.log(`  ✓ ${date} — ${qs.length} questions`);
    } catch (e) {
      console.error(`  ✗ ${date} — ${e.message}`);
    }
    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 1500));
  }
  console.log('Done.');
}

main();
