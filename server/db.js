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

db.exec(`
  CREATE TABLE IF NOT EXISTS labs (
    id                TEXT    PRIMARY KEY,
    title             TEXT    NOT NULL,
    category          TEXT    NOT NULL,
    concept           TEXT    NOT NULL DEFAULT '',
    description       TEXT    NOT NULL DEFAULT '',
    instructions      TEXT    NOT NULL DEFAULT '[]',
    commands          TEXT    NOT NULL DEFAULT '[]',
    source_transcript TEXT    NOT NULL,
    status            TEXT    NOT NULL DEFAULT 'draft',
    created_at        TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    updated_at        TEXT    NOT NULL DEFAULT (datetime('now', 'localtime'))
  )
`);

// Add columns to existing databases that predate these fields
try { db.exec(`ALTER TABLE labs ADD COLUMN description TEXT NOT NULL DEFAULT ''`); } catch {}
try { db.exec(`ALTER TABLE labs ADD COLUMN difficulty INTEGER NOT NULL DEFAULT 1`); } catch {}
try { db.exec(`ALTER TABLE labs ADD COLUMN expectedOutput TEXT NOT NULL DEFAULT ''`); } catch {}

db.exec(`
  CREATE TABLE IF NOT EXISTS published_articles (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    filename   TEXT    NOT NULL UNIQUE,
    title      TEXT    NOT NULL DEFAULT '',
    posted_at  TEXT    NOT NULL DEFAULT (datetime('now', 'localtime')),
    post_url   TEXT    NOT NULL DEFAULT ''
  )
`);

module.exports = db;
