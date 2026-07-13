const express = require('express');
const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');

const router = express.Router();
const client = new Anthropic();

const SYSTEM_PROMPT = `You are summarising a daily class transcript for a Cloud Engineering student preparing for AWS exams.
Produce a thorough yet concise structured summary — cover EVERY topic the instructor touched on, even briefly. Missing a topic is worse than being slightly longer.

Format the response in Markdown. For EACH topic/section use this exact structure:

## <Topic name>
- Bullet points covering the core concept, how it works, and any specifics the instructor explained
- Include exact numbers, thresholds, or comparisons the instructor mentioned (e.g. "greater than 5 GB → must use multi-part upload")

> 🏢 **Real world:** A concrete named-company example (Netflix, Spotify, Airbnb, a bank, etc.) showing how this concept applies in production. Be specific — not "a company might…" but "Netflix does X because Y".

\`\`\`mermaid
<a diagram visualising this concept — graph TD/LR, sequenceDiagram, or flowchart>
\`\`\`

⚠️ **Exam tip:** (only include this block if the instructor said something like "remember this", "this will be on the exam", "notice", "important", "they ask this" — quote or closely paraphrase what the instructor flagged)

---

Rules:
- Cover every topic from the transcript in its own ## section. Do not merge unrelated topics.
- Under each ## section always include: bullets, real-world example, mermaid diagram, and exam tip (if instructor flagged it).
- Exam tips must only appear when the instructor explicitly called something out as exam-relevant or important to remember.
- Skip pure filler, off-topic chat, and auto-caption noise. If something is unclear, note it briefly.
- Do not add a word-count limit — cover everything.`;


router.post('/recap/summarize', async (req, res) => {
  const text = (req.body?.text || '').toString().trim();
  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }
  if (text.length > 250_000) {
    return res.status(413).json({ error: 'text too large; trim the time range first' });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured on the server' });
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('X-Accel-Buffering', 'no');

  try {
    const stream = client.messages.stream({
      model: 'claude-opus-4-8',
      max_tokens: 16000,
      thinking: { type: 'adaptive' },
      output_config: { effort: 'medium' },
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: `Summarise the following class transcript:\n\n${text}`,
        },
      ],
    });

    stream.on('text', (delta) => {
      res.write(delta);
    });

    const final = await stream.finalMessage();
    if (final.stop_reason === 'refusal') {
      res.write('\n\n[The model refused to summarise this content.]');
    } else if (final.stop_reason === 'max_tokens') {
      res.write('\n\n[Summary truncated — increase max_tokens.]');
    }
    res.end();
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      res.write(`\n\n[Anthropic API error ${err.status}: ${err.message}]`);
    } else {
      res.write(`\n\n[Server error: ${err.message}]`);
    }
    res.end();
  }
});

module.exports = router;
