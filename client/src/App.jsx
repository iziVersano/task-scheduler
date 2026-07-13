import { useState, useEffect, useCallback } from 'react';
import './App.css';
import JobForm from './components/JobForm.jsx';
import JobLogs from './components/JobLogs.jsx';
import LabsDashboard from './components/LabsDashboard.jsx';
import NetworkLabPage from './components/network-lab/NetworkLabPage.jsx';
import MultiCloudIAM from './components/multi-cloud-iam/MultiCloudIAM.jsx';
import BrowserAutomation from './components/BrowserAutomation.jsx';
import AwsStatus from './components/AwsStatus.jsx';
import DailyRecap from './components/DailyRecap.jsx';
import Diagrams from './components/Diagrams.jsx';
import Slides from './components/Slides.jsx';
import ClassSummary from './components/ClassSummary.jsx';
import { apiFetch } from './apiClient.js';

const API = '/api';

function timeAgo(dateStr) {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function fmt(dateStr) {
  if (!dateStr) return 'Never';
  return new Date(dateStr).toLocaleString();
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function cronToHuman(cron) {
  const parts = cron.split(' ');
  if (parts.length !== 5) return cron;
  const [minute, hour, , , weekday] = parts;

  // Time formatting
  let timeStr;
  if (minute === '*' && hour === '*') return 'Every minute';
  if (minute.startsWith('*/')) return `Every ${minute.slice(2)} min`;
  if (hour === '*') return `Every hour at :${minute.padStart(2, '0')}`;
  const h = parseInt(hour);
  const m = parseInt(minute);
  if (isNaN(h) || isNaN(m)) return cron;
  timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  // Days formatting
  let dayStr;
  if (weekday === '*') {
    dayStr = 'Every day';
  } else {
    const dayNums = [];
    for (const part of weekday.split(',')) {
      if (part.includes('-')) {
        const [start, end] = part.split('-').map(Number);
        for (let i = start; i <= end; i++) dayNums.push(i);
      } else {
        dayNums.push(parseInt(part));
      }
    }
    if (dayNums.length === 5 && [1,2,3,4,5].every(d => dayNums.includes(d))) {
      dayStr = 'Weekdays';
    } else if (dayNums.length === 2 && [0,6].every(d => dayNums.includes(d))) {
      dayStr = 'Weekends';
    } else {
      dayStr = dayNums.map(d => DAY_NAMES[d]).join(', ');
    }
  }

  return `${timeStr} · ${dayStr}`;
}

function extractLink(command) {
  if (!command) return '';
  // Meet link
  const meet = command.match(/https:\/\/meet\.google\.com\/[^\s"']+/);
  if (meet) return { url: meet[0], label: meet[0].replace('https://meet.google.com/', ''), type: 'meet' };
  // open-url.js
  const open = command.match(/open-url\.js\s+"([^"]+)"/);
  if (open) return { url: open[1], label: open[1], type: 'url' };
  return null;
}

export default function App({ keycloak }) {
  const [view, setView]           = useState('scheduler');
  const [jobs, setJobs]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState(null);
  const [showForm, setShowForm]   = useState(false);
  const [editingJob, setEditingJob] = useState(undefined); // null=new, obj=edit
  const [logsJob, setLogsJob]     = useState(null);

  const fetchJobs = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/jobs`);
      if (!res.ok) throw new Error('Cannot reach server on port 3001');
      setJobs(await res.json());
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchJobs();
    const id = setInterval(fetchJobs, 15_000); // auto-refresh every 15 s
    return () => clearInterval(id);
  }, [fetchJobs]);

  const openCreate = () => { setEditingJob(null); setShowForm(true); };
  const openEdit   = (job) => { setEditingJob(job); setShowForm(true); };
  const closeForm  = () => { setShowForm(false); setEditingJob(undefined); };
  const handleSave = () => { closeForm(); fetchJobs(); };

  const handleDelete = async (job) => {
    if (!confirm(`Delete "${job.name}"?`)) return;
    await apiFetch(`${API}/jobs/${job.id}`, { method: 'DELETE' });
    fetchJobs();
  };

  const handleDeleteAll = async () => {
    if (!confirm(`Delete all ${jobs.length} jobs?`)) return;
    await apiFetch(`${API}/jobs`, { method: 'DELETE' });
    fetchJobs();
  };

  const handleToggle = async (job) => {
    await apiFetch(`${API}/jobs/${job.id}/toggle`, { method: 'POST' });
    fetchJobs();
  };

  const handleRun = async (job) => {
    try {
      const res = await apiFetch(`${API}/jobs/${job.id}/run`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error('Run failed:', body.error || res.status);
      }
    } catch (err) {
      console.error('Run request failed:', err);
    }
    // Refresh so the last-run time / status reflect the run just triggered.
    fetchJobs();
  };

  const enabled = jobs.filter((j) => j.enabled).length;

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-left">
          <span className="logo">⚡</span>
          <h1>Task Scheduler</h1>
          <div className="nav-tabs">
            <button className={`nav-tab ${view === 'scheduler' ? 'nav-active' : ''}`} onClick={() => setView('scheduler')}>Scheduler</button>
            <button className={`nav-tab ${view === 'labs' ? 'nav-active' : ''}`} onClick={() => setView('labs')}>Labs</button>
            <button className={`nav-tab ${view === 'network-lab' ? 'nav-active' : ''}`} onClick={() => setView('network-lab')}>Network Lab</button>
            <button className={`nav-tab ${view === 'iam-lab' ? 'nav-active' : ''}`} onClick={() => setView('iam-lab')}>IAM Lab</button>
            <button className={`nav-tab ${view === 'browser' ? 'nav-active' : ''}`} onClick={() => setView('browser')}>Browser</button>
            <button className={`nav-tab ${view === 'aws' ? 'nav-active' : ''}`} onClick={() => setView('aws')}>☁ AWS</button>
            <button className={`nav-tab ${view === 'recap' ? 'nav-active' : ''}`} onClick={() => setView('recap')}>📖 Recap</button>
            <button className={`nav-tab ${view === 'diagrams' ? 'nav-active' : ''}`} onClick={() => setView('diagrams')}>🗺 Diagrams</button>
            <button className={`nav-tab ${view === 'slides' ? 'nav-active' : ''}`} onClick={() => setView('slides')}>🖼 Slides</button>
            <button className={`nav-tab ${view === 'summary' ? 'nav-active' : ''}`} onClick={() => setView('summary')}>🎙 Summary</button>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <a
            href="https://classroom.google.com/u/1/c/ODY1MDM0NDY1ODM3"
            target="_blank"
            rel="noreferrer"
            className="btn btn-neutral"
            title="Open Google Classroom"
          >
            🎓 Classroom
          </a>
          {view === 'scheduler' && (<>
            <button className="btn btn-primary" onClick={openCreate}>+ New Job</button>
            {jobs.length > 0 && (
              <button className="btn btn-danger" onClick={handleDeleteAll}>Delete All</button>
            )}
          </>)}
        </div>
      </header>

      <main className="main">
        {view === 'scheduler' && (<>
          {/* ── Stats ── */}
          <div className="stats-row">
            <div className="stat-card">
              <span className="stat-value">{jobs.length}</span>
              <span className="stat-label">Total</span>
            </div>
            <div className="stat-card stat-active">
              <span className="stat-value">{enabled}</span>
              <span className="stat-label">Active</span>
            </div>
            <div className="stat-card stat-paused">
              <span className="stat-value">{jobs.length - enabled}</span>
              <span className="stat-label">Paused</span>
            </div>
          </div>

          {/* ── Loading ── */}
          {loading && (
            <div className="spinner-wrap"><span className="spinner" /></div>
          )}

          {/* ── Error ── */}
          {error && (
            <div className="alert alert-error">
              ⚠ {error} — make sure the backend is running (<code>npm run server</code>).
            </div>
          )}

          {/* ── Empty state ── */}
          {!loading && !error && jobs.length === 0 && (
            <div className="empty-state">
              <p className="empty-title">No scheduled jobs yet</p>
              <p className="empty-sub">Create your first task to get started.</p>
              <button className="btn btn-primary" onClick={openCreate}>+ New Job</button>
            </div>
          )}

          {/* ── Jobs table ── */}
          {!loading && jobs.length > 0 && (
            <div className="table-card">
              <table className="jobs-table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Name</th>
                    <th>Schedule</th>
                    <th>Link</th>
                    <th>Last Run</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.map((job) => (
                    <tr key={job.id} className={job.enabled ? '' : 'row-disabled'}>
                      <td>
                        <span
                          className={`status-dot ${job.enabled ? 'dot-active' : 'dot-paused'}`}
                          title={job.enabled ? 'Active' : 'Paused'}
                        />
                      </td>
                      <td className="job-name">{job.name}</td>
                      <td>
                        <span className="schedule-badge" title={job.schedule}>{cronToHuman(job.schedule)}</span>
                      </td>
                      <td className="job-cmd">
                        {(() => {
                          const link = extractLink(job.command);
                          if (!link) return <span title={job.command}>{job.command}</span>;
                          if (link.type === 'meet') return (
                            <a href={link.url} target="_blank" rel="noreferrer" className="meet-link">
                              {link.label}
                            </a>
                          );
                          return <span className="meet-link" title={link.url}>{link.label}</span>;
                        })()}
                      </td>
                      <td className="last-run" title={fmt(job.last_run_time)}>
                        {timeAgo(job.last_run_time)}
                      </td>
                      <td className="actions">
                        {extractLink(job.command)?.type === 'url' && (
                          <button
                            className="btn-sm btn-ok"
                            onClick={() => handleRun(job)}
                            title="Open URL now with the correct account"
                          >
                            ▶ Open
                          </button>
                        )}
                        <button
                          className={`btn-sm ${job.enabled ? 'btn-warn' : 'btn-ok'}`}
                          onClick={() => handleToggle(job)}
                          title={job.enabled ? 'Pause job' : 'Enable job'}
                        >
                          {job.enabled ? '⏸ Pause' : '▶ Enable'}
                        </button>
                        <button
                          className="btn-sm btn-neutral"
                          onClick={() => openEdit(job)}
                          title="Edit job"
                        >
                          ✏ Edit
                        </button>
                        <button
                          className="btn-sm btn-neutral"
                          onClick={() => setLogsJob(job)}
                          title="View execution logs"
                        >
                          📋 Logs
                        </button>
                        <button
                          className="btn-sm btn-danger"
                          onClick={() => handleDelete(job)}
                          title="Delete job"
                        >
                          🗑 Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>)}

        {view === 'labs' && <LabsDashboard />}
        {view === 'network-lab' && <NetworkLabPage />}
        {view === 'iam-lab' && <MultiCloudIAM />}
        {view === 'browser' && <BrowserAutomation />}
        {view === 'aws' && <AwsStatus />}
        {view === 'recap' && <DailyRecap />}
        {view === 'diagrams' && <Diagrams />}
        {view === 'slides' && <Slides />}
        {view === 'summary' && <ClassSummary />}
      </main>

      {/* ── Modals ── */}
      {showForm && (
        <JobForm job={editingJob} onSave={handleSave} onClose={closeForm} />
      )}
      {logsJob && (
        <JobLogs job={logsJob} onClose={() => setLogsJob(null)} />
      )}
    </div>
  );
}
