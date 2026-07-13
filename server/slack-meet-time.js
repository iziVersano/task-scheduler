#!/usr/bin/env node
// Reads today's "let's start at HH:MM" announcement from the class Slack channel
// and reschedules the daily Meet auto-join job to that time.
//
// Driven by the scheduler every 5 min between ~08:30 and 09:30. Idempotent:
// if the posted time already matches the job's cron, it does nothing.
//
// Requires in .env:
//   SLACK_TOKEN=xoxp-...                          (user token, *:history + *:read)
//   SLACK_MEET_CHANNEL=cloud_aws_1_materials_and_exercises
// Optional:
//   SLACK_MEET_JOB_ID=202                          (the join job to reschedule)
//   MEET_API=http://localhost:3001                 (this app's API base)

const https = require('https');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const TOKEN = process.env.SLACK_TOKEN;
const CHANNEL_NAME = process.env.SLACK_MEET_CHANNEL || 'cloud_aws_1_materials_and_exercises';
const JOB_ID = process.env.SLACK_MEET_JOB_ID || '202';
const API = process.env.MEET_API || 'http://localhost:3001';
const LOG_FILE = '/tmp/slack-meet-time.log';

function log(msg) {
  const line = `[${new Date().toLocaleTimeString('de-DE')}] ${msg}`;
  process.stdout.write(line + '\n');
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

// ── Slack Web API helper ─────────────────────────────────────────────────────
function slack(method, params = {}) {
  const qs = new URLSearchParams(params).toString();
  const url = `https://slack.com/api/${method}${qs ? '?' + qs : ''}`;
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (!json.ok) return reject(new Error(`Slack ${method}: ${json.error}`));
          resolve(json);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

// Resolve channel name → ID (covers public + private channels).
async function findChannelId(name) {
  let cursor;
  for (let i = 0; i < 10; i++) {
    const res = await slack('conversations.list', {
      types: 'public_channel,private_channel',
      limit: 200,
      exclude_archived: true,
      ...(cursor ? { cursor } : {}),
    });
    const hit = res.channels.find(c => c.name === name);
    if (hit) return hit.id;
    cursor = res.response_metadata?.next_cursor;
    if (!cursor) break;
  }
  return null;
}

// ── Time parsing ─────────────────────────────────────────────────────────────
// Handles: "9.10 am", "9:10am", "09:10", "at 9 am", "start at 10", "9.10".
// Returns { hour, minute } in 24h, or null.
function parseStartTime(text) {
  const t = text.toLowerCase();
  // Must look like a start announcement to avoid grabbing random numbers.
  if (!/(start|begin|kick.?off|losleg|anfang|los geht)/.test(t)) return null;

  // Find "<start-word>...H[:.]MM (am|pm)?" or "at/um H[:.]MM (am|pm)?".
  const best = t.match(/(?:start[^0-9]{0,12}|begin[^0-9]{0,12}|kick.?off[^0-9]{0,12}|at\s+|um\s+)(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?/);
  if (!best) return null;

  let hour = parseInt(best[1], 10);
  let minute = best[2] ? parseInt(best[2], 10) : 0;
  const ap = best[3];

  if (isNaN(hour) || hour < 0 || hour > 23) return null;
  if (minute < 0 || minute > 59) return null;

  if (ap === 'pm' && hour < 12) hour += 12;
  if (ap === 'am' && hour === 12) hour = 0;
  // No am/pm and hour <= 7 almost certainly means morning class — leave as-is
  // (class is in the morning, Berlin time).
  return { hour, minute };
}

// Is the Slack ts from "today" in Europe/Berlin?
function isToday(tsSeconds) {
  const d = new Date(tsSeconds * 1000);
  const fmt = (x) => x.toLocaleDateString('en-CA', { timeZone: 'Europe/Berlin' });
  return fmt(d) === fmt(new Date());
}

// ── Reschedule via this app's API ────────────────────────────────────────────
function putJobSchedule(cron) {
  const body = JSON.stringify({ schedule: cron, enabled: true });
  const u = new URL(`${API}/api/jobs/${JOB_ID}`);
  const http = u.protocol === 'https:' ? require('https') : require('http');
  return new Promise((resolve, reject) => {
    const req = http.request(u, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(JSON.parse(data));
        else reject(new Error(`API ${res.statusCode}: ${data}`));
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function getJob() {
  const u = new URL(`${API}/api/jobs`);
  const http = u.protocol === 'https:' ? require('https') : require('http');
  return new Promise((resolve, reject) => {
    http.get(u, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const jobs = JSON.parse(data);
          resolve(jobs.find(j => String(j.id) === String(JOB_ID)) || null);
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

(async () => {
  if (!TOKEN) { log('SLACK_TOKEN not set — skipping.'); process.exit(0); }

  try {
    const channelId = await findChannelId(CHANNEL_NAME);
    if (!channelId) { log(`Channel "${CHANNEL_NAME}" not found (is the token a member?).`); process.exit(0); }

    // Pull recent messages (since start of today, Berlin).
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const oldest = Math.floor(startOfDay.getTime() / 1000);

    const hist = await slack('conversations.history', {
      channel: channelId,
      oldest: String(oldest),
      limit: 50,
    });

    // Newest first; find the most recent message with a start time today.
    const msgs = (hist.messages || []).filter(m => m.text && isToday(Number(m.ts)));
    let found = null;
    for (const m of msgs) {
      const parsed = parseStartTime(m.text);
      if (parsed) { found = { ...parsed, text: m.text.slice(0, 80) }; break; }
    }

    if (!found) {
      log(`No start-time message found in #${CHANNEL_NAME} today (checked ${msgs.length} msgs).`);
      process.exit(0);
    }

    const cron = `${found.minute} ${found.hour} * * *`;
    log(`Parsed start time ${String(found.hour).padStart(2, '0')}:${String(found.minute).padStart(2, '0')} from: "${found.text}"`);

    const job = await getJob();
    if (job && job.schedule === cron) {
      log(`Job ${JOB_ID} already set to ${cron} — nothing to do.`);
      process.exit(0);
    }

    await putJobSchedule(cron);
    log(`Rescheduled job ${JOB_ID} → ${cron} (was "${job?.schedule || 'unknown'}").`);
    process.exit(0);
  } catch (err) {
    log(`Error: ${err.message}`);
    process.exit(1);
  }
})();
