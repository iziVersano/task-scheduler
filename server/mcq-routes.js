const express = require('express');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');

const router = express.Router();
const MCQ_DIR = path.join(__dirname, 'mcq');

if (!fs.existsSync(MCQ_DIR)) fs.mkdirSync(MCQ_DIR, { recursive: true });

const SYSTEM_PROMPT = `You are an AWS certification exam question writer specialising in SAA-C03 (Solutions Architect Associate) and CLF-C02 (Cloud Practitioner) style questions.

Given a class summary, produce 8 MCQ questions that test the exact topics covered. Follow these rules strictly:

FORMAT — return ONLY a valid JSON array, no markdown fences, no extra text:
[
  {
    "id": 1,
    "difficulty": "associate",
    "question": "...",
    "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
    "correct": "B",
    "explanation": "..."
  }
]

QUESTION RULES:
- Test the specific facts, thresholds, and concepts from this summary — not generic AWS knowledge
- Include scenario-based questions (a company needs X, what should they do?)
- Include threshold/fact questions (what is the minimum file size that requires multipart upload?)
- Mix difficulty: ~3 practitioner-level (CLF-C02), ~5 associate-level (SAA-C03)
- Wrong options must be plausible — common misconceptions, not obviously wrong
- Distribute correct answer letters across A, B, C, D — don't cluster on one letter
- Explanation must state WHY the correct answer is right AND briefly why the main distractor is wrong
- Do NOT include questions about services not mentioned in the summary
- Each question must have exactly 4 options A, B, C, D`;

// Generate and cache MCQs for a date. Resolves when done; throws on error.
async function generateMCQs(date, summaryText) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Generate 8 MCQ questions based on this class summary:\n\n${summaryText}` }],
  });
  const raw = msg.content[0]?.text?.trim() || '';
  const questions = JSON.parse(raw);
  fs.writeFileSync(path.join(MCQ_DIR, `${date}.json`), JSON.stringify(questions, null, 2));
  return questions;
}

// GET /api/mcq/:date
router.get('/mcq/:date', (req, res) => {
  const { date } = req.params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'invalid date' });
  const file = path.join(MCQ_DIR, `${date}.json`);
  if (!fs.existsSync(file)) return res.json({ questions: null });
  try {
    res.json({ questions: JSON.parse(fs.readFileSync(file, 'utf8')) });
  } catch {
    res.json({ questions: null });
  }
});

module.exports = { router, generateMCQs };
