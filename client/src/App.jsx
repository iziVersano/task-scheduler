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

  let timeStr;
  if (minute === '*' && hour === '*') return 'Every minute';
  if (minute.startsWith('*/')) return `Every ${minute.slice(2)} min`;
  if (hour === '*') return `Every hour at :${minute.padStart(2, '0')}`;
  const h = parseInt(hour);
  const m = parseInt(minute);
  if (isNaN(h) || isNaN(m)) return cron;
  timeStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

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
  if (!command) return null;
  const meet = command.match(/https:\/\/meet\.google\.com\/[^\s"']+/);
  if (meet) return { url: meet[0], label: meet[0].replace('https://meet.google.com/', 'meet.google.com/'), type: 'meet' };
  const open = command.match(/open-url\.js\s+"([^"]+)"/);
  if (open) return { url: open[1], label: open[1], type: 'url' };
  return null;
}

function JobCard({ job, onToggle, onEdit, onDelete, onRun, onLogs }) {
  const link = extractLink(job.command);
  return (
    <div className={`job-card ${job.enabled ? 'job-card--active' : 'job-card--paused'}`}>
      <div className="job-card__header">
        <div className="job-card__status">
          <span className={`status-dot ${job.enabled ? 'dot-active' : 'dot-paused'}`} />
          <span className={`status-label ${job.enabled ? 'status-label--active' : 'status-label--paused'}`}>
            {job.enabled ? 'Active' : 'Paused'}
          </span>
        </div>
        <div className="job-card__actions-top">
          <button className="icon-btn" onClick={() => onEdit(job)} title="Edit">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          <button className="icon-btn icon-btn--danger" onClick={() => onDelete(job)} title="Delete">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>
        </div>
      </div>

      <div className="job-card__body">
        <h3 className="job-card__name">{job.name}</h3>
        <div className="schedule-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
          {cronToHuman(job.schedule)}
        </div>

        {link && (
          <div className="job-card__link">
            {link.type === 'meet' ? (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M15 10l4.553-2.069A1 1 0 0 1 21 8.845v6.31a1 1 0 0 1-1.447.914L15 14"/><rect x="1" y="6" width="14" height="12" rx="2"/></svg>
                <a href={link.url} target="_blank" rel="noreferrer" className="link-text">{link.label}</a>
              </>
            ) : (
              <>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                <span className="link-text" title={link.url}>{link.label}</span>
              </>
            )}
          </div>
        )}

        {!link && job.command && (
          <div className="job-card__cmd" title={job.command}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
            <span>{job.command}</span>
          </div>
        )}
      </div>

      <div className="job-card__footer">
        <span className="last-run" title={fmt(job.last_run_time)}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
          {timeAgo(job.last_run_time)}
        </span>
        <div className="job-card__actions-bottom">
          <button className="icon-btn" onClick={() => onLogs(job)} title="Logs">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
          </button>
          {(link?.type === 'url' || link?.type === 'meet') && (
            <button className="pill-btn pill-btn--run" onClick={() => onRun(job)} title="Run now">
              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
              Run
            </button>
          )}
          <button
            className={`pill-btn ${job.enabled ? 'pill-btn--pause' : 'pill-btn--enable'}`}
            onClick={() => onToggle(job)}
          >
            {job.enabled ? (
              <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause</>
            ) : (
              <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg> Enable</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App({ keycloak }) {
  const [view, setView]             = useState('scheduler');
  const [jobs, setJobs]             = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState(null);
  const [showForm, setShowForm]     = useState(false);
  const [editingJob, setEditingJob] = useState(undefined);
  const [logsJob, setLogsJob]       = useState(null);

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
    const id = setInterval(fetchJobs, 15_000);
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
    await apiFetch(`${API}/jobs/${job.id}/run`, { method: 'POST' });
  };

  const enabled = jobs.filter((j) => j.enabled).length;

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-accent" />
        <div className="header-inner">
          <div className="header-left">
            <div className="logo-wrap">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#a5b4fc" strokeWidth="2.2">
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
              </svg>
            </div>
            <span className="app-title">Task Scheduler</span>
            <nav className="nav-tabs">
              <button className={`nav-tab ${view === 'scheduler' ? 'nav-tab--active' : ''}`} onClick={() => setView('scheduler')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                Scheduler
              </button>
              <button className={`nav-tab ${view === 'labs' ? 'nav-tab--active' : ''}`} onClick={() => setView('labs')}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v11m0 0H5a2 2 0 0 0-2 2v2a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2a2 2 0 0 0-2-2h-4M9 14h6"/></svg>
                Labs
              </button>
              <button className={`nav-tab ${view === 'network-lab' ? 'nav-tab--active' : ''}`} onClick={() => setView('network-lab')}>Network Lab</button>
              <button className={`nav-tab ${view === 'iam-lab' ? 'nav-tab--active' : ''}`} onClick={() => setView('iam-lab')}>IAM Lab</button>
              <button className={`nav-tab ${view === 'browser' ? 'nav-tab--active' : ''}`} onClick={() => setView('browser')}>Browser</button>
              <button className={`nav-tab ${view === 'aws' ? 'nav-tab--active' : ''}`} onClick={() => setView('aws')}>☁ AWS</button>
              <button className={`nav-tab ${view === 'recap' ? 'nav-tab--active' : ''}`} onClick={() => setView('recap')}>📖 Recap</button>
              <button className={`nav-tab ${view === 'diagrams' ? 'nav-tab--active' : ''}`} onClick={() => setView('diagrams')}>🗺 Diagrams</button>
              <button className={`nav-tab ${view === 'slides' ? 'nav-tab--active' : ''}`} onClick={() => setView('slides')}>🖼 Slides</button>
            </nav>
          </div>

          {view === 'scheduler' && (
            <div className="header-actions">
              {jobs.length > 0 && (
                <button className="btn btn-ghost" onClick={handleDeleteAll}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                  Clear all
                </button>
              )}
              <button className="btn btn-primary" onClick={openCreate}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                New Job
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="main">
        {view === 'scheduler' && (
          <>
            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-icon stat-icon--total">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                </div>
                <div>
                  <div className="stat-value">{jobs.length}</div>
                  <div className="stat-label">Total Jobs</div>
                </div>
              </div>
              <div className="stat-card stat-card--active">
                <div className="stat-icon stat-icon--active">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                </div>
                <div>
                  <div className="stat-value stat-value--active">{enabled}</div>
                  <div className="stat-label">Active</div>
                </div>
              </div>
              <div className="stat-card stat-card--paused">
                <div className="stat-icon stat-icon--paused">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                </div>
                <div>
                  <div className="stat-value stat-value--paused">{jobs.length - enabled}</div>
                  <div className="stat-label">Paused</div>
                </div>
              </div>
            </div>

            {loading && (
              <div className="spinner-wrap"><span className="spinner" /></div>
            )}

            {error && (
              <div className="alert alert-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {error} — make sure the backend is running (<code>npm run server</code>).
              </div>
            )}

            {!loading && !error && jobs.length === 0 && (
              <div className="empty-state">
                <div className="empty-icon">
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="16" y2="14"/><line x1="8" y1="18" x2="13" y2="18"/></svg>
                </div>
                <p className="empty-title">No scheduled jobs yet</p>
                <p className="empty-sub">Create your first task to get started.</p>
                <button className="btn btn-primary" onClick={openCreate}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  New Job
                </button>
              </div>
            )}

            {!loading && jobs.length > 0 && (
              <div className="jobs-grid">
                {jobs.map((job) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onToggle={handleToggle}
                    onEdit={openEdit}
                    onDelete={handleDelete}
                    onRun={handleRun}
                    onLogs={setLogsJob}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {view === 'labs' && <LabsDashboard />}
        {view === 'network-lab' && <NetworkLabPage />}
        {view === 'iam-lab' && <MultiCloudIAM />}
        {view === 'browser' && <BrowserAutomation />}
        {view === 'aws' && <AwsStatus />}
        {view === 'recap' && <DailyRecap />}
        {view === 'diagrams' && <Diagrams />}
        {view === 'slides' && <Slides />}
      </main>

      {showForm && (
        <JobForm job={editingJob} onSave={handleSave} onClose={closeForm} />
      )}
      {logsJob && (
        <JobLogs job={logsJob} onClose={() => setLogsJob(null)} />
      )}
    </div>
  );
}
