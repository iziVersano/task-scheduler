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

export default function JobForm({ job, onSave, onClose }) {
  const [form, setForm] = useState({
    name:     job?.name     ?? 'Morning Meeting',
    command:  job?.command  ?? 'node /home/dci-student/task-scheduler/server/meet-join.js "https://meet.google.com/kdh-gdjc-rke?authuser=0"',
    schedule: job?.schedule ?? '0 9 * * *',
    enabled:  job ? Boolean(job.enabled) : true,
  });
  const [error, setSaving_error]   = useState('');
  const [saving, setSaving] = useState(false);

  const set = (field) => (e) => {
    const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((f) => ({ ...f, [field]: val }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving_error('');
    setSaving(true);
    try {
      const url    = job ? `${API}/jobs/${job.id}` : `${API}/jobs`;
      const method = job ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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
            <label>Command</label>
            <input
              value={form.command}
              onChange={set('command')}
              placeholder='node server/meet-join.js "https://meet.google.com/..."'
              required
            />
          </div>

          <div className="form-group">
            <label>Cron Schedule</label>
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
