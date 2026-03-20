const cron = require('node-cron');
const { exec } = require('child_process');
const db = require('./db');

// Map of jobId -> cron Task
const activeTasks = new Map();

function executeJob(job) {
  const startedAt = new Date().toISOString();

  const logId = db
    .prepare('INSERT INTO job_logs (job_id, started_at) VALUES (?, ?)')
    .run(job.id, startedAt).lastInsertRowid;

  console.log(`[${new Date().toLocaleTimeString()}] Running "${job.name}": ${job.command}`);

  exec(job.command, { timeout: 120000, shell: true }, (error, stdout, stderr) => {
    const finishedAt = new Date().toISOString();
    const exitCode = error ? (error.code ?? 1) : 0;

    db.prepare(`
      UPDATE job_logs
      SET finished_at = ?, exit_code = ?, output = ?, error = ?
      WHERE id = ?
    `).run(finishedAt, exitCode, stdout || '', error ? (error.message || stderr) : (stderr || ''), logId);

    db.prepare('UPDATE jobs SET last_run_time = ? WHERE id = ?').run(finishedAt, job.id);

    console.log(`[${new Date().toLocaleTimeString()}] Finished "${job.name}" (exit ${exitCode})`);
  });
}

function scheduleJob(job) {
  // Stop any existing instance
  if (activeTasks.has(job.id)) {
    activeTasks.get(job.id).stop();
    activeTasks.delete(job.id);
  }

  if (!job.enabled) return;

  if (!cron.validate(job.schedule)) {
    console.error(`Invalid schedule for "${job.name}": "${job.schedule}"`);
    return;
  }

  const task = cron.schedule(job.schedule, () => {
    // Re-fetch fresh state in case the job was updated after scheduling
    const current = db.prepare('SELECT * FROM jobs WHERE id = ?').get(job.id);
    if (current && current.enabled) {
      executeJob(current);
    }
  }, { timezone: 'Europe/Berlin' });

  activeTasks.set(job.id, task);
  console.log(`Scheduled "${job.name}" at cron: ${job.schedule}`);
}

function unscheduleJob(jobId) {
  if (activeTasks.has(jobId)) {
    activeTasks.get(jobId).stop();
    activeTasks.delete(jobId);
    console.log(`Unscheduled job ID: ${jobId}`);
  }
}

function initScheduler() {
  const jobs = db.prepare('SELECT * FROM jobs WHERE enabled = 1').all();
  console.log(`Initializing scheduler — loading ${jobs.length} enabled job(s)...`);
  for (const job of jobs) {
    scheduleJob(job);
  }
}

module.exports = { scheduleJob, unscheduleJob, initScheduler, executeJob };
