import { useState, useEffect, useCallback } from 'react';
import LabEditor from './LabEditor.jsx';
import InteractiveLab from './InteractiveLab.jsx';
import { apiFetch } from '../apiClient.js';

const API = '/api';

const CATEGORY_COLORS = {
  Networking: '#6366f1',
  Linux:      '#10b981',
  Security:   '#ef4444',
  Cloud:      '#3b82f6',
  Scripting:  '#f59e0b',
};

const DIFFICULTY_LABELS = {
  1: { label: 'Basic', color: '#10b981' },
  2: { label: 'Commands', color: '#3b82f6' },
  3: { label: 'Troubleshooting', color: '#f59e0b' },
  4: { label: 'Design Challenge', color: '#ef4444' },
};

export default function LabsDashboard() {
  const [labs, setLabs]                   = useState([]);
  const [captions, setCaptions]           = useState([]);
  const [selectedCaption, setSelectedCaption] = useState('');
  const [generating, setGenerating]       = useState(false);
  const [error, setError]                 = useState(null);
  const [editingLab, setEditingLab]       = useState(null);
  const [activeLab, setActiveLab]         = useState(null);
  const [filterCategory, setFilterCategory] = useState('');
  const [filterStatus, setFilterStatus]   = useState('');
  const [summary, setSummary]             = useState(null);

  const fetchLabs = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      const res = await apiFetch(`${API}/labs?${params}`);
      if (!res.ok) throw new Error('Server not reachable');
      setLabs(await res.json());
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  }, [filterStatus]);

  const fetchCaptions = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/labs/captions`);
      if (res.ok) {
        const files = await res.json();
        setCaptions(files);
        if (files.length > 0 && !selectedCaption) setSelectedCaption(files[0]);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchLabs(); fetchCaptions(); }, [fetchLabs, fetchCaptions]);

  const handleGenerate = async () => {
    if (!selectedCaption) return;
    setGenerating(true);
    setError(null);
    setSummary(null);
    try {
      const res = await apiFetch(`${API}/labs/generate`, {
        method: 'POST',
        body: JSON.stringify({ source: selectedCaption }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Generation failed');
      if (data.summary) setSummary(data.summary);
      fetchLabs();
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (lab) => {
    if (!confirm(`Delete lab "${lab.title}"?`)) return;
    await apiFetch(`${API}/labs/${encodeURIComponent(lab.id)}`, { method: 'DELETE' });
    fetchLabs();
  };

  const handlePublish = async (lab) => {
    await apiFetch(`${API}/labs/${encodeURIComponent(lab.id)}/publish`, { method: 'POST' });
    fetchLabs();
  };

  const handleEditorSave = () => {
    setEditingLab(null);
    fetchLabs();
  };

  const published = labs.filter(l => l.status === 'published').length;
  const draft = labs.filter(l => l.status === 'draft').length;

  const filtered = labs.filter(l => {
    if (filterCategory && l.category !== filterCategory) return false;
    return true;
  });

  const categories = [...new Set(labs.map(l => l.category))];

  return (
    <>
      {/* ── Generate Section ── */}
      <div className="lab-generate-section">
        <h2 className="section-title">Generate Labs from Transcript</h2>
        <div className="lab-generate-row">
          <select
            className="lab-select"
            value={selectedCaption}
            onChange={e => setSelectedCaption(e.target.value)}
          >
            <option value="">Select a transcript...</option>
            {captions.map(f => (
              <option key={f} value={f}>{f}</option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            onClick={handleGenerate}
            disabled={generating || !selectedCaption}
          >
            {generating ? 'Generating...' : 'Generate Labs'}
          </button>
        </div>
        {generating && (
          <div className="spinner-wrap"><span className="spinner" /></div>
        )}
      </div>

      {error && (
        <div className="alert alert-error">{error}</div>
      )}

      {/* ── Day Summary ── */}
      {summary && (
        <div className="lab-summary-card">
          <h3 className="lab-summary-title">Day Summary — {summary.date}</h3>
          <div className="lab-summary-meta">
            <span>Time: {summary.timeRange}</span>
            <span>Labs: {summary.labCount}</span>
            <span>Levels: {summary.difficultyRange}</span>
          </div>
          <div className="lab-summary-topics">
            <strong>Key Topics:</strong>
            <div className="lab-summary-topic-list">
              {summary.topicsCovered.map((t, i) => (
                <span key={i} className="lab-summary-topic">{t}</span>
              ))}
            </div>
          </div>
          <div className="lab-summary-categories">
            {summary.categories.map(c => (
              <span key={c} className="lab-category-badge"
                style={{ background: (CATEGORY_COLORS[c] || '#6366f1') + '22', color: CATEGORY_COLORS[c] || '#6366f1' }}>
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* ── Stats ── */}
      <div className="stats-row">
        <div className="stat-card">
          <span className="stat-value">{labs.length}</span>
          <span className="stat-label">Total Labs</span>
        </div>
        <div className="stat-card stat-active">
          <span className="stat-value">{published}</span>
          <span className="stat-label">Published</span>
        </div>
        <div className="stat-card stat-paused">
          <span className="stat-value">{draft}</span>
          <span className="stat-label">Draft</span>
        </div>
      </div>

      {/* ── Filters ── */}
      {labs.length > 0 && (
        <div className="lab-filters">
          <select
            className="lab-filter-select"
            value={filterCategory}
            onChange={e => setFilterCategory(e.target.value)}
          >
            <option value="">All Categories</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select
            className="lab-filter-select"
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
          >
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </div>
      )}

      {/* ── Lab Cards ── */}
      {filtered.length === 0 && !generating && (
        <div className="empty-state">
          <p className="empty-title">No labs yet</p>
          <p className="empty-sub">Select a transcript above and generate labs to get started.</p>
        </div>
      )}

      <div className="lab-cards">
        {filtered.map(lab => {
          const diff = DIFFICULTY_LABELS[lab.difficulty] || DIFFICULTY_LABELS[1];
          return (
            <div key={lab.id} className="lab-card">
              <div className="lab-card-header">
                <span
                  className="lab-category-badge"
                  style={{ background: (CATEGORY_COLORS[lab.category] || '#6366f1') + '22',
                           color: CATEGORY_COLORS[lab.category] || '#6366f1' }}
                >
                  {lab.category}
                </span>
                <div style={{ display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
                  <span className="lab-difficulty-badge" style={{ color: diff.color, borderColor: diff.color + '44' }}>
                    Lvl {lab.difficulty || 1} · {diff.label}
                  </span>
                  <span className={`lab-status-badge ${lab.status === 'published' ? 'lab-status-published' : 'lab-status-draft'}`}>
                    {lab.status}
                  </span>
                </div>
              </div>
              <h3 className="lab-card-title">{lab.title}</h3>
              <p className="lab-card-concept">{lab.concept || lab.description}</p>
              <div className="lab-card-meta">
                <span>{lab.instructions.length} steps</span>
                <span>{lab.commands.length} commands</span>
              </div>
              {lab.commands.length > 0 && (
                <div className="lab-card-commands">
                  {lab.commands.slice(0, 3).map((cmd, i) => (
                    <code key={i}>{cmd}</code>
                  ))}
                  {lab.commands.length > 3 && (
                    <span className="muted">+{lab.commands.length - 3} more</span>
                  )}
                </div>
              )}
              <div className="lab-card-actions">
                <button className="btn-sm btn-primary-sm" onClick={() => setActiveLab(lab)}>
                  Run Lab
                </button>
                <button className="btn-sm btn-neutral" onClick={() => setEditingLab(lab)}>
                  Edit
                </button>
                <button
                  className={`btn-sm ${lab.status === 'published' ? 'btn-warn' : 'btn-ok'}`}
                  onClick={() => handlePublish(lab)}
                >
                  {lab.status === 'published' ? 'Unpublish' : 'Publish'}
                </button>
                <button className="btn-sm btn-danger" onClick={() => handleDelete(lab)}>
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {editingLab && (
        <LabEditor lab={editingLab} onSave={handleEditorSave} onClose={() => setEditingLab(null)} />
      )}

      {activeLab && (
        <InteractiveLab lab={activeLab} onClose={() => setActiveLab(null)} />
      )}
    </>
  );
}
