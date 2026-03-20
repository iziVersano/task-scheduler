import { useState } from 'react';

const API = '/api';

const SCHEDULE_PRESETS = [
  { label: 'Every minute',        value: '* * * * *' },
  { label: 'Every 5 minutes',     value: '*/5 * * * *' },
  { label: 'Every hour',          value: '0 * * * *' },
  { label: 'Daily at 9 AM',       value: '0 9 * * *' },
  { label: 'Daily at 8 AM',       value: '0 8 * * *' },
  { label: 'Weekdays at 9 AM',    value: '0 9 * * 1-5' },
  { label: 'Every Sunday midnight', value: '0 0 * * 0' },
];

// Parse a cron string into manual fields (best effort)
function parseCron(cron) {
  const parts = cron.split(' ');
  if (parts.length !== 5) return null;
  const [minute, hour] = parts;

  if (minute.includes('/') || minute === '*') return null;
  if (hour.includes('/') || hour === '*') return null;

  const h = parseInt(hour);
  const m = parseInt(minute);
  if (isNaN(h) || isNaN(m)) return null;

  return {
    hour: String(h).padStart(2, '0'),
    minute: String(m).padStart(2, '0'),
  };
}

// Build cron string from manual fields (always runs every day)
function buildCron(hour, minute) {
  return `${parseInt(minute)} ${parseInt(hour)} * * *`;
}

// Extract Meet URL from a meet-join.js command
function extractMeetUrl(command) {
  if (!command) return '';
  const match = command.match(/https:\/\/meet\.google\.com\/[^\s"']+/);
  return match ? match[0] : '';
}

// Extract plain URL from an open-url.js command
function extractOpenUrl(command) {
  if (!command) return '';
  const match = command.match(/open-url\.js\s+"([^"]+)"/);
  return match ? match[1] : '';
}

// Detect job type from saved command
function detectJobType(command) {
  if (!command) return 'meet';
  if (command.includes('meet-join.js')) return 'meet';
  if (command.includes('open-url.js')) return 'url';
  return 'meet';
}

// Build the full command from a Meet URL
function buildMeetCommand(meetUrl) {
  const clean = meetUrl.trim().replace(/[?&]authuser=\d+/, '');
  return `node /home/dci-student/work/task-scheduler/server/meet-join.js "${clean}"`;
}

// Build the full command for a plain URL
function buildUrlCommand(url) {
  return `node /home/dci-student/work/task-scheduler/server/open-url.js "${url.trim()}"`;
}

const TASK_NAMES = [
  'Morning Standup', 'Team Sync', 'Sprint Review', 'Daily Catch-up',
  'Project Check-in', 'Planning Session', 'Retro Meeting', 'Design Review',
  'Code Review', 'Brainstorm Session', 'Client Call', 'Weekly Sync',
  '1-on-1 Meeting', 'Kickoff Meeting', 'Demo Session', 'Strategy Call',
];

function randomName() {
  return TASK_NAMES[Math.floor(Math.random() * TASK_NAMES.length)];
}

export default function JobForm({ job, onSave, onClose }) {
  const now = new Date();
  const nowHour = String(now.getHours()).padStart(2, '0');
  const nowMinute = String(now.getMinutes()).padStart(2, '0');

  const initial = job ? parseCron(job.schedule) : null;

  // When editing, preserve the job's existing time; for new jobs use current time
  const editHour   = initial?.hour   ?? nowHour;
  const editMinute = initial?.minute ?? nowMinute;
  const defaultSchedule = job
    ? (job.schedule)
    : buildCron(nowHour, nowMinute);

  const [form, setForm] = useState({
    name:     job?.name     ?? randomName(),
    command:  job?.command  ?? '',
    schedule: defaultSchedule,
    enabled:  job ? Boolean(job.enabled) : true,
  });
  const [jobType, setJobType] = useState(detectJobType(job?.command));
  const [meetLink, setMeetLink] = useState(extractMeetUrl(job?.command) || 'https://meet.google.com/kdh-gdjc-rke');
  const [openUrl, setOpenUrl] = useState(extractOpenUrl(job?.command) || '');
  const [mode, setMode] = useState('manual');
  const [hour, setHour] = useState(editHour);
  const [minute, setMinute] = useState(editMinute);
  const [error, setSaving_error] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: val }));
  };

  const updateTime = (h, m) => {
    setHour(h);
    setMinute(m);
    setForm((f) => ({ ...f, schedule: buildCron(h, m) }));
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    if (newMode === 'manual') {
      const parsed = parseCron(form.schedule);
      if (parsed) {
        setHour(parsed.hour);
        setMinute(parsed.minute);
      } else {
        setHour('09');
        setMinute('00');
        setForm((f) => ({ ...f, schedule: '0 9 * * *' }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (jobType === 'meet' && !meetLink.includes('meet.google.com/')) {
      setSaving_error('Please enter a valid Google Meet link');
      return;
    }
    if (jobType === 'url' && !openUrl.startsWith('http')) {
      setSaving_error('Please enter a valid URL (starting with http)');
      return;
    }
    setSaving_error('');
    setSaving(true);
    const command = jobType === 'meet' ? buildMeetCommand(meetLink) : buildUrlCommand(openUrl);
    const submitData = { ...form, command };
    try {
      const url    = job ? `${API}/jobs/${job.id}` : `${API}/jobs`;
      const method = job ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(submitData),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');
      onSave();
    } catch (err) {
      setSaving_error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const overlayClick = (e) => e.target === e.currentTarget && onClose();

  return (
    <div className="modal-overlay" onClick={overlayClick}>
      <div className="modal">
        <div className="modal-header">
          <h2>{job ? 'Edit Job' : 'New Job'}</h2>
          <button className="btn-icon" onClick={onClose} type="button">✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Name</label>
            <input
              value={form.name}
              onChange={set('name')}
              placeholder="Morning Standup"
              required
            />
          </div>

          <div className="form-group">
            <label>Type</label>
            <div className="schedule-tabs">
              <button
                type="button"
                className={`tab-btn ${jobType === 'meet' ? 'tab-active' : ''}`}
                onClick={() => setJobType('meet')}
              >
                Google Meet
              </button>
              <button
                type="button"
                className={`tab-btn ${jobType === 'url' ? 'tab-active' : ''}`}
                onClick={() => setJobType('url')}
              >
                Open URL
              </button>
            </div>
          </div>

          {jobType === 'meet' && (
            <div className="form-group">
              <label>Google Meet Link</label>
              <input
                value={meetLink}
                onChange={(e) => setMeetLink(e.target.value)}
                placeholder="https://meet.google.com/abc-defg-hij"
                required
              />
            </div>
          )}

          {jobType === 'url' && (
            <div className="form-group">
              <label>URL to Open</label>
              <input
                value={openUrl}
                onChange={(e) => setOpenUrl(e.target.value)}
                placeholder="https://example.com"
                required
              />
            </div>
          )}

          <div className="form-group">
            <label>Schedule</label>

            <div className="schedule-tabs">
              <button
                type="button"
                className={`tab-btn ${mode === 'manual' ? 'tab-active' : ''}`}
                onClick={() => switchMode('manual')}
              >
                Time & Days
              </button>
              <button
                type="button"
                className={`tab-btn ${mode === 'cron' ? 'tab-active' : ''}`}
                onClick={() => switchMode('cron')}
              >
                Cron Expression
              </button>
            </div>

            {mode === 'manual' && (
              <div className="manual-schedule">
                <div className="time-picker">
                  <label>Time</label>
                  <div className="time-inputs">
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={hour}
                      onChange={(e) => updateTime(e.target.value.padStart(2, '0'), minute)}
                      className="time-input"
                    />
                    <span className="time-sep">:</span>
                    <input
                      type="number"
                      min="0"
                      max="59"
                      value={minute}
                      onChange={(e) => updateTime(hour, e.target.value.padStart(2, '0'))}
                      className="time-input"
                    />
                  </div>
                </div>

                <small className="hint">
                  Runs daily at this time. Cron: <code>{form.schedule}</code>
                </small>
              </div>
            )}

            {mode === 'cron' && (
              <>
                <input
                  value={form.schedule}
                  onChange={set('schedule')}
                  placeholder="0 9 * * *"
                  required
                />
                <small className="hint">
                  Format: <code>minute hour day month weekday</code>
                </small>
                <div className="presets">
                  {SCHEDULE_PRESETS.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      className={`preset-btn ${form.schedule === p.value ? 'preset-active' : ''}`}
                      onClick={() => setForm((f) => ({ ...f, schedule: p.value }))}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="form-group checkbox-row">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={set('enabled')}
              />
              <span>Enable this job</span>
            </label>
          </div>

          {error && <div className="error-msg">{error}</div>}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving…' : job ? 'Update Job' : 'Create Job'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
