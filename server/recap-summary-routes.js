const express = require('express');
const Anthropic = require('@anthropic-ai/sdk').default || require('@anthropic-ai/sdk');

const router = express.Router();
const client = new Anthropic();

const SYSTEM_PROMPT = `You are summarising a daily class transcript for a Cloud Engineering student.
Produce a concise, structured summary that is genuinely useful for revision.

Format the response in Markdown with these sections:

## Topics covered
A short bullet list of the AWS services or concepts the instructor focused on.

## Key points
3-7 bullets capturing the most important takeaways, instructions, or examples.
Include specific commands, lab names, or URLs if they appear verbatim.

## Action items for the student
Anything the instructor explicitly told the student to do, watch, install, or finish.

Keep the whole summary under ~250 words. Skip filler, repetition, side chat, and
auto-caption noise. If a piece of the transcript is unclear, say so rather than inventing.`;

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
