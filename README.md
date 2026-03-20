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

## Labs Dashboard

The Labs tab lets instructors generate hands-on labs from lecture transcripts (captured from Google Meet captions). Labs are extracted automatically using keyword and command detection.

### Interactive Labs (Docker Sandbox)

One lab — **Network Interface Configuration** — supports live command execution in a sandboxed Docker container.

#### Setup

```bash
# 1. Install Docker (if not already installed)
sudo apt install docker.io
sudo usermod -aG docker $USER
# Log out and back in for group change to take effect

# 2. Build the sandbox image
cd server/sandbox
./build.sh
cd ../..
```

#### How it works

- The "Network Interface Configuration" lab card shows a **Run Lab** button
- Clicking it opens an interactive modal with command blocks for `ip a` and `ip addr show`
- Each command has **Run** and **Copy** buttons
- Commands execute inside a short-lived, isolated Docker container:
  - Alpine Linux with `iproute2`
  - No network access (`--network none`)
  - Read-only filesystem
  - 64MB memory limit, 0.5 CPU
  - 10 second timeout
  - Non-root user
  - Auto-removed after execution
- Output appears in a terminal-style panel with exit code and duration
- A visual summary shows interface count, loopback status, and active IPv4 status

#### API Response Shape

```json
{
  "stdout": "1: lo: <LOOPBACK,UP,LOWER_UP>...\n2: eth0: ...",
  "stderr": "",
  "exitCode": 0,
  "durationMs": 342,
  "timedOut": false
}
```

#### Architecture Decisions

- **Strict whitelist**: Only exact-match commands from a backend registry can execute. No free-text shell input.
- **No data model migration**: Executable metadata (`executable`, `allowedCommands`) is added at the API layer by matching lab IDs against the backend registry — no DB schema changes needed.
- **Container-per-command**: Each Run click creates a fresh container. Simple, stateless, easy to reason about. WebSockets and persistent sessions can be added later.
- **Graceful degradation**: If Docker isn't installed, the UI shows setup instructions instead of the Run button crashing.

## Notes

- This app is designed for **local use only** — it executes shell commands, so do not expose it to the internet
- The server must be running for scheduled jobs to execute
- Google Meet auto-join requires a display (X11/Wayland) — it won't work on headless servers
- Google may change Meet's UI at any time, which could break the auto-join selectors
