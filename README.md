# Task Scheduler

A local web app to manage and run scheduled tasks using cron syntax. Includes a built-in Google Meet auto-join feature powered by Puppeteer.

![Stack](https://img.shields.io/badge/Express-SQLite-blue) ![Stack](https://img.shields.io/badge/React-Vite-purple)

## Features

- Create, edit, delete, and toggle scheduled jobs
- Cron-based scheduling with preset options
- Execution logs with stdout/stderr capture
- Google Meet auto-join (opens browser, disables mic/camera, clicks Join)
- Dark-themed UI with auto-refresh

## Prerequisites

- **Node.js** v22.5+ (uses built-in `node:sqlite`)
- **Google Chrome** (for Meet auto-join)

## Setup

```bash
# Install dependencies
npm run install:all

# Start both server and client
npm run dev
```

- **Server**: http://localhost:3001
- **Client**: http://localhost:3000

## Creating a Job

1. Open http://localhost:3000
2. Click **"+ New Job"**
3. Fill in:
   - **Name**: e.g. `Morning Standup`
   - **Command**: any shell command (see examples below)
   - **Schedule**: cron expression or pick a preset
4. Save

### Schedule Examples

| Cron Expression | Meaning |
|---|---|
| `* * * * *` | Every minute |
| `*/5 * * * *` | Every 5 minutes |
| `0 9 * * *` | Daily at 9 AM |
| `0 9 * * 1-5` | Weekdays at 9 AM |
| `0 0 * * 0` | Every Sunday at midnight |

### Command Examples

```bash
# Open a URL
xdg-open "https://example.com"

# Run a script
node /path/to/script.js

# Auto-join a Google Meet (see below)
node /path/to/task-scheduler/server/meet-join.js "https://meet.google.com/abc-defg-hij"
```

## Google Meet Auto-Join

The included `meet-join.js` script uses Puppeteer to automatically join a Google Meet call with mic and camera off.

### One-Time Setup

You need a dedicated Chrome profile so the script can use your Google login without conflicting with your main browser:

```bash
# Launch Chrome with a separate profile
google-chrome --user-data-dir=$HOME/.config/google-chrome-meet
```

Log into your Google account in that window, then close it. This only needs to be done once.

### How It Works

1. The scheduler runs `meet-join.js` at the scheduled time
2. The script launches Chrome (detached) with your saved Google session
3. Navigates to the Meet URL
4. Turns off microphone and camera
5. Clicks "Join now" or "Join here too"
6. Disconnects from Chrome, leaving the browser open with you in the meeting

### Creating a Meet Job

Set the command to:

```bash
node /absolute/path/to/task-scheduler/server/meet-join.js "https://meet.google.com/your-meeting-code"
```

## Project Structure

```
task-scheduler/
├── server/
│   ├── index.js          # Express server entry point
│   ├── db.js             # SQLite database setup
│   ├── routes.js         # REST API routes
│   ├── scheduler.js      # Cron job scheduler
│   └── meet-join.js      # Google Meet auto-join script
├── client/
│   └── src/
│       ├── App.jsx       # Main app with job list
│       └── components/
│           ├── JobForm.jsx   # Create/edit job modal
│           └── JobLogs.jsx   # Execution logs modal
└── package.json
```

## API Endpoints

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/jobs` | List all jobs |
| POST | `/api/jobs` | Create a job |
| PUT | `/api/jobs/:id` | Update a job |
| DELETE | `/api/jobs/:id` | Delete a job |
| POST | `/api/jobs/:id/toggle` | Enable/disable a job |
| GET | `/api/jobs/:id/logs` | Get execution logs |
| GET | `/health` | Server health check |

## Notes

- This app is designed for **local use only** — it executes shell commands, so do not expose it to the internet
- The server must be running for scheduled jobs to execute
- Google Meet auto-join requires a display (X11/Wayland) — it won't work on headless servers
- Google may change Meet's UI at any time, which could break the auto-join selectors
