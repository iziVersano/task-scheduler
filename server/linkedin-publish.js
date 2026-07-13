require('dotenv').config({ path: __dirname + '/.env' });
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const http = require('http');
const puppeteer = require('puppeteer-core');
const Anthropic = require('@anthropic-ai/sdk');
const db = require('./db');

const CAPTIONS_DIR = path.join(__dirname, 'captions');
const SUMMARY_FILE = path.join(__dirname, 'live-summary', 'today.md');
const CHROME_PATH = '/usr/bin/google-chrome';
const USER_DATA_DIR = path.join(require('os').homedir(), '.config', 'google-chrome');
const DEBUG_PORT = 9400; // separate port from meet-join (9399)
const DRY_RUN = process.env.DRY_RUN === '1';
const TODAY_SUMMARY = process.argv.includes('--today-summary');

function log(msg) {
  const line = `[${new Date().toLocaleTimeString('de-DE')}] ${msg}`;
  console.log(line);
}

// Pick oldest caption file not yet published
function pickNextFile() {
  const files = fs.readdirSync(CAPTIONS_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}.*\.txt$/.test(f))
    .sort();
  const posted = new Set(
    db.prepare('SELECT filename FROM published_articles').all().map(r => r.filename)
  );
  return files.find(f => !posted.has(f)) || null;
}

// Clean raw transcript into readable text
function cleanTranscript(raw) {
  const lines = raw.split('\n');
  const seen = new Set();
  const out = [];

  for (const line of lines) {
    // Strip timestamp-only headers like [10:48] or [10:48:17]
    if (/^\[\d{2}:\d{2}(:\d{2})?\]/.test(line) && !line.includes(':') ) continue;
    // Strip alert lines
    if (line.includes('*** ALERT')) continue;
    // Strip tracking started/ended markers
    if (line.includes('--- Caption tracking') || line.includes('--- logged in ---') || line.includes('--- Meeting ended ---')) continue;

    // Clean the line: remove leading timestamp, trim spaces
    const clean = line
      .replace(/^\[\d{2}:\d{2}(:\d{2})?\]\s*/, '')
      .trim();

    if (!clean) continue;
    if (seen.has(clean)) continue;
    seen.add(clean);
    out.push(clean);
  }

  return out.join('\n');
}

// Convert today.md summary into LinkedIn post text (strip markdown/mermaid)
function summaryToPost(raw) {
  const lines = raw
    .replace(/^<!-- updated:[^>]*-->\n?/m, '')   // strip timestamp comment
    .replace(/```mermaid[\s\S]*?```/gm, '')       // strip mermaid blocks
    .replace(/^>\s*🏢\s*/gm, '🏢 ')             // unquote real-world examples
    .split('\n');

  const out = [];
  let firstHeading = true;
  for (const line of lines) {
    const l = line.trim();
    if (!l || l === '---') continue;
    // Headings → plain label; skip the H1 (it becomes the post title)
    if (/^#{1,3}\s+/.test(l)) {
      if (firstHeading) { firstHeading = false; continue; }
      const heading = l.replace(/^#{1,3}\s+/, '').replace(/\*\*/g, '');
      const prefix = heading.startsWith('📌') ? '' : '📌 ';
      out.push('', `${prefix}${heading}`, '');
      continue;
    }
    // Strip inline markdown: **bold**, `code`, _italic_
    const clean = l
      .replace(/\*\*([^*]+)\*\*/g, '$1')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/^_(.+)_$/, '$1')
      .replace(/_([^_]+)_/g, '$1');
    out.push(clean);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

// Extract title from today.md (the H1 line)
function summaryTitle(raw) {
  const m = raw.match(/^#\s+(.+)$/m);
  return m ? m[1].replace(/\*\*/g, '').replace(/·.*/, '').trim() : 'Today\'s Class Summary';
}

// Summarize transcript into a LinkedIn article via Claude
async function summarize(transcript, filename) {
  const client = new Anthropic();

  // Truncate to ~12k chars to stay within token limits while keeping cost low
  const excerpt = transcript.length > 12000
    ? transcript.slice(0, 12000) + '\n...[truncated]'
    : transcript;

  const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  const dateStr = dateMatch ? dateMatch[1] : filename;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    system: 'You are an expert at turning raw meeting transcripts into engaging LinkedIn articles. Write in the same language as the transcript (German if German, English if English). Output ONLY valid JSON with keys "title" and "body". No markdown, no code blocks, just raw JSON.',
    messages: [{
      role: 'user',
      content: `Convert this Google Meet class/training transcript from ${dateStr} into a LinkedIn article.

The article should:
- Have an engaging title (max 10 words)
- Be 200-350 words
- Have a short intro (1-2 sentences)
- Include 3-5 key learning points as bullet points (use • character)
- End with a short takeaway or reflection
- Skip small talk, filler words, and incomplete sentences
- Focus on the technical/educational content discussed

Transcript:
${excerpt}

Output JSON only: {"title": "...", "body": "..."}`
    }],
  });

  const text = response.content[0].text.trim();
  try {
    return JSON.parse(text);
  } catch {
    // Fallback: try to extract JSON if model added extra text
    const match = text.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('Claude response was not valid JSON: ' + text.slice(0, 200));
  }
}

// Wait for Chrome debug port
function waitForDebugPort(port, maxWait = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    function check() {
      const req = http.get(`http://127.0.0.1:${port}/json/version`, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(JSON.parse(data)));
      });
      req.on('error', () => {
        if (Date.now() - start > maxWait) return reject(new Error('Chrome debug port not ready'));
        setTimeout(check, 500);
      });
      req.end();
    }
    check();
  });
}

// Post article to LinkedIn via Puppeteer using the default Chrome profile (already logged in)
async function postToLinkedIn(title, body) {
  const fullText = `${title}\n\n${body}`;
  log(`Launching Chrome on port ${DEBUG_PORT}...`);

  const child = spawn(CHROME_PATH, [
    `--user-data-dir=${USER_DATA_DIR}`,
    `--remote-debugging-port=${DEBUG_PORT}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--start-maximized',
    'https://www.linkedin.com/feed/',
  ], {
    detached: false,
    stdio: 'ignore',
    env: { ...process.env, DISPLAY: process.env.DISPLAY || ':0' },
  });

  await waitForDebugPort(DEBUG_PORT);
  log('Chrome ready');

  const browser = await puppeteer.connect({
    browserURL: `http://127.0.0.1:${DEBUG_PORT}`,
    defaultViewport: null,
    protocolTimeout: 60000,
  });

  try {
    const pages = await browser.pages();
    let page = pages.find(p => p.url().includes('linkedin.com')) || pages[0];
    await page.bringToFront();

    // Wait for LinkedIn feed to load
    log('Waiting for LinkedIn feed...');
    await page.waitForSelector('[data-placeholder*="Start a post" i], [data-placeholder*="Beitrag" i], .share-box-feed-entry__trigger', { timeout: 20000 });

    // Click "Start a post" button
    const startPost = await page.$('[data-placeholder*="Start a post" i], [data-placeholder*="Beitrag" i], .share-box-feed-entry__trigger');
    await startPost.click();
    await new Promise(r => setTimeout(r, 2000));

    // Wait for the post modal editor
    log('Waiting for post editor...');
    await page.waitForSelector('.ql-editor, [data-placeholder*="What do you want" i], [role="textbox"]', { timeout: 15000 });

    const editor = await page.$('.ql-editor, [data-placeholder*="What do you want" i], [role="textbox"]');
    await editor.click();
    await new Promise(r => setTimeout(r, 500));

    // Type the article content
    log('Typing article...');
    await editor.type(fullText, { delay: 10 });
    await new Promise(r => setTimeout(r, 1000));

    // Click the Post button
    log('Clicking Post button...');
    const posted = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button'));
      for (const btn of btns) {
        const text = (btn.innerText || btn.textContent || '').trim();
        if (text === 'Post' || text === 'Beitrag veröffentlichen' || text === 'Posten') {
          btn.click();
          return text;
        }
      }
      return null;
    });

    if (!posted) {
      const btns = await page.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .map(b => (b.innerText || '').trim())
          .filter(Boolean)
      );
      throw new Error(`Post button not found. Visible buttons: ${JSON.stringify(btns)}`);
    }

    log(`Clicked: "${posted}"`);
    await new Promise(r => setTimeout(r, 3000));

    // Try to get the post URL from the confirmation
    const postUrl = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="linkedin.com/feed/update"]'));
      return links[0]?.href || '';
    }).catch(() => '');

    log(`Posted successfully! URL: ${postUrl || '(not captured)'}`);
    return postUrl;
  } finally {
    browser.disconnect();
    child.kill();
  }
}

(async () => {
  try {
    log('=== LinkedIn Publisher starting ===');

    let title, body, filename;

    if (TODAY_SUMMARY) {
      // ── Post today's live summary directly (no Claude needed) ────────────
      if (!fs.existsSync(SUMMARY_FILE)) {
        log('No live summary found at server/live-summary/today.md. Run the class summary loop first.');
        process.exit(1);
      }
      const raw = fs.readFileSync(SUMMARY_FILE, 'utf8');
      title = summaryTitle(raw);
      body = summaryToPost(raw);
      filename = `summary-${new Date().toISOString().slice(0, 10)}.md`;
      log(`Using today's summary: "${title}"`);
    } else {
      // ── Original flow: pick oldest unpublished transcript ────────────────
      filename = pickNextFile();
      if (!filename) {
        log('No unpublished caption files found. Nothing to do.');
        process.exit(0);
      }
      log(`Selected file: ${filename}`);

      const raw = fs.readFileSync(path.join(CAPTIONS_DIR, filename), 'utf8');
      const transcript = cleanTranscript(raw);
      log(`Transcript cleaned: ${transcript.split('\n').length} lines`);

      if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY not set in server/.env');
      }

      log('Summarizing with Claude...');
      ({ title, body } = await summarize(transcript, filename));
    }

    log(`Title: ${title}`);
    log(`Body preview: ${body.slice(0, 120)}...`);

    if (DRY_RUN) {
      log('--- DRY RUN — not posting to LinkedIn ---');
      log('\n========== ARTICLE ==========');
      console.log(`\n${title}\n\n${body}\n`);
      log('==============================\n');
      process.exit(0);
    }

    const postUrl = await postToLinkedIn(title, body);

    // Record as published
    db.prepare('INSERT INTO published_articles (filename, title, post_url) VALUES (?, ?, ?)')
      .run(filename, title, postUrl);

    log(`Recorded ${filename} as published.`);
    log('=== Done ===');
    process.exit(0);
  } catch (err) {
    console.error(`FAILED: ${err.message}`);
    process.exit(1);
  }
})();
