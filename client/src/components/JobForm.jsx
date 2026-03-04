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

const DAYS = [
  { label: 'Mon', value: 1 },
  { label: 'Tue', value: 2 },
  { label: 'Wed', value: 3 },
  { label: 'Thu', value: 4 },
  { label: 'Fri', value: 5 },
  { label: 'Sat', value: 6 },
  { label: 'Sun', value: 0 },
];

// Parse a cron string into manual fields (best effort)
function parseCron(cron) {
  const parts = cron.split(' ');
  if (parts.length !== 5) return null;
  const [minute, hour, , , weekday] = parts;

  // Only parse simple patterns like "30 9 * * 1-5" or "0 14 * * 1,3,5"
  if (minute.includes('/') || minute === '*') return null;
  if (hour.includes('/') || hour === '*') return null;

  const h = parseInt(hour);
  const m = parseInt(minute);
  if (isNaN(h) || isNaN(m)) return null;

  let days = [];
  if (weekday === '*') {
    days = [0, 1, 2, 3, 4, 5, 6];
  } else {
    // Handle ranges (1-5) and lists (1,3,5)
    for (const part of weekday.split(',')) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        for (let i = start; i <= end; i++) days.push(i);
      } else {
        days.push(parseInt(part));
      }
    }
  }

  return {
    hour: String(h).padStart(2, '0'),
    minute: String(m).padStart(2, '0'),
    days,
  };
}

// Build cron string from manual fields
function buildCron(hour, minute, days) {
  const sorted = [...days].sort((a, b) => a - b);
  let dayStr;
  if (sorted.length === 0 || sorted.length === 7) {
    dayStr = '*';
  } else {
    dayStr = sorted.join(',');
  }
  return `${parseInt(minute)} ${parseInt(hour)} * * ${dayStr}`;
}

// Extract Meet URL from a meet-join.js command
function extractMeetUrl(command) {
  if (!command) return '';
  const match = command.match(/https:\/\/meet\.google\.com\/[^\s"']+/);
  return match ? match[0] : '';
}

// Build the full command from a Meet URL
function buildCommand(meetUrl) {
  const clean = meetUrl.trim().replace(/[?&]authuser=\d+/, '');
  return `node /home/dci-student/task-scheduler/server/meet-join.js "${clean}"`;
}

export default function JobForm({ job, onSave, onClose }) {
  const now = new Date();
  const nowHour = String(now.getHours()).padStart(2, '0');
  const nowMinute = String(now.getMinutes()).padStart(2, '0');
  const today = now.getDay(); // 0=Sun, 1=Mon, ...

  const initial = job ? parseCron(job.schedule) : null;

  const defaultSchedule = job?.schedule ?? buildCron(nowHour, nowMinute, [today]);

  const [form, setForm] = useState({
    name:     job?.name     ?? '',
    command:  job?.command  ?? '',
    schedule: defaultSchedule,
    enabled:  job ? Boolean(job.enabled) : true,
  });
  const [meetLink, setMeetLink] = useState(extractMeetUrl(job?.command) || '');
  const [mode, setMode] = useState(initial ? 'manual' : 'manual');
  const [hour, setHour] = useState(initial?.hour ?? nowHour);
  const [minute, setMinute] = useState(initial?.minute ?? nowMinute);
  const [days, setDays] = useState(initial?.days ?? [today]);
  const [error, setSaving_error] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: val }));
  };

  const toggleDay = (dayVal) => {
    setDays((prev) => {
      const next = prev.includes(dayVal)
        ? prev.filter((d) => d !== dayVal)
        : [...prev, dayVal];
      setForm((f) => ({ ...f, schedule: buildCron(hour, minute, next) }));
      return next;
    });
  };

  const updateTime = (h, m) => {
    setHour(h);
    setMinute(m);
    setForm((f) => ({ ...f, schedule: buildCron(h, m, days) }));
  };

  const switchMode = (newMode) => {
    setMode(newMode);
    if (newMode === 'manual') {
      // Sync manual fields from current cron if possible
      const parsed = parseCron(form.schedule);
      if (parsed) {
        setHour(parsed.hour);
        setMinute(parsed.minute);
        setDays(parsed.days);
      } else {
        // Reset to defaults
        setHour('09');
        setMinute('00');
        setDays([1, 2, 3, 4, 5]);
        setForm((f) => ({ ...f, schedule: '0 9 * * 1,2,3,4,5' }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!meetLink.includes('meet.google.com/')) {
      setSaving_error('Please enter a valid Google Meet link');
      return;
    }
    setSaving_error('');
    setSaving(true);
    const submitData = { ...form, command: buildCommand(meetLink) };
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
            <label>Google Meet Link</label>
            <input
              value={meetLink}
              onChange={(e) => setMeetLink(e.target.value)}
              placeholder="https://meet.google.com/abc-defg-hij"
              required
            />
          </div>

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

                <div className="day-picker">
                  <label>Days</label>
                  <div className="day-buttons">
                    {DAYS.map((d) => (
                      <button
                        key={d.value}
                        type="button"
                        className={`day-btn ${days.includes(d.value) ? 'day-active' : ''}`}
                        onClick={() => toggleDay(d.value)}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <small className="hint">
                  Cron: <code>{form.schedule}</code>
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
