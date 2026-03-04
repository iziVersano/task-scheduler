// Uses Node.js built-in sqlite (available since Node 22.5 / stable in Node 23+)
const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'jobs.db'));

// Performance & integrity settings
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS jobs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    command       TEXT    NOT NULL,
    schedule      TEXT    NOT NULL,
    enabled       INTEGER NOT NULL DEFAULT 1,
    last_run_time TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS job_logs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id      INTEGER NOT NULL,
    started_at  TEXT    NOT NULL,
    finished_at TEXT,
    exit_code   INTEGER,
    output      TEXT    DEFAULT '',
    error       TEXT    DEFAULT '',
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE
  )
`);

module.exports = db;
