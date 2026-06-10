require('dotenv').config({ path: __dirname + '/.env' });
const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const CAPTIONS_DIR = path.join(__dirname, 'captions');
const timeRegex = /^\[(\d{2}):(\d{2})\]$/;

router.get('/captions/today', (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const file = path.join(CAPTIONS_DIR, `${today}.txt`);

  if (!fs.existsSync(file)) {
    return res.json({ date: today, found: false, text: null, timestamps: [] });
  }

  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split('\n');

  // Collect all unique timestamps in the file
  const timestamps = [];
  for (const line of lines) {
    const m = line.trim().match(timeRegex);
    if (m) {
      const t = `${m[1]}:${m[2]}`;
      if (!timestamps.includes(t)) timestamps.push(t);
    }
  }

  const lastTime = timestamps[timestamps.length - 1] || null;

  res.json({ date: today, found: true, text, timestamps, lastTime });
});

router.post('/captions/last-question', async (req, res) => {
  const { text } = req.body;
  if (!text) return res.status(400).json({ error: 'No transcript text provided' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not set' });
  }

  // Take last ~6000 chars so we focus on the most recent part of the transcript
  const excerpt = text.length > 6000 ? text.slice(-6000) : text;

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 512,
      system: `You are a helpful assistant for a tech training class.
Given the end of a meeting transcript, identify the last question the instructor asked to the team/students (not rhetorical, a real question directed at learners).
Then answer it clearly and concisely in 2-4 sentences.
Respond in the same language as the transcript.
Output ONLY valid JSON: {"question": "...", "answer": "..."}`,
      messages: [{
        role: 'user',
        content: `Here is the end of the class transcript:\n\n${excerpt}\n\nFind the last instructor question and answer it. Output JSON only.`,
      }],
    });

    const raw = response.content[0].text.trim();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { question: '', answer: raw };
    }
    res.json(parsed);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
