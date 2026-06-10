import { useState, useEffect, useRef, useCallback } from 'react';
import mermaid from 'mermaid';
import { apiFetch } from '../apiClient.js';

mermaid.initialize({
  startOnLoad: false,
  theme: 'dark',
  flowchart: { curve: 'basis', htmlLabels: true },
});

export default function Diagrams() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const diagramRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch('/api/diagrams/today');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!data?.diagram || !diagramRef.current) return;
    let cancelled = false;
    const id = `mmd-${Date.now()}`;
    mermaid.render(id, data.diagram)
      .then(({ svg }) => {
        if (!cancelled && diagramRef.current) diagramRef.current.innerHTML = svg;
      })
      .catch((e) => {
        if (!cancelled) setError(`Mermaid render error: ${e.message}`);
      });
    return () => { cancelled = true; };
  }, [data]);

  const top = data?.summary?.top || [];

  return (
    <div>
      <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <span className="stat-value">{data?.summary?.totalTopics ?? '—'}</span>
          <span className="stat-label">Topics detected</span>
        </div>
        <div className="stat-card">
          <span className="stat-value" style={{ fontSize: '0.95rem' }}>{data?.date || '—'}</span>
          <span className="stat-label">Source date</span>
        </div>
      </div>

      <div className="table-card" style={{ padding: '1rem 1.5rem', marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div>
            <div style={{ fontWeight: 600, color: '#f1f5f9' }}>Today's topic map</div>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 2 }}>
              {data?.sources?.length
                ? `Generated from ${data.sources.join(' + ')} (today weighted 3×)`
                : 'Generated from the latest caption transcripts'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button className="btn-sm" onClick={() => setShowSource(s => !s)}>
              {showSource ? 'Hide source' : 'Show source'}
            </button>
            <button className="btn-sm btn-ok" onClick={load} disabled={loading}>
              {loading ? '…' : 'Refresh'}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ color: '#f87171', fontSize: '0.85rem', padding: '0.5rem 0' }}>
            {error}
          </div>
        )}

        <div
          ref={diagramRef}
          style={{
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: '1rem',
            minHeight: 320,
            overflowX: 'auto',
            display: 'flex',
            justifyContent: 'center',
          }}
        />

        {showSource && data?.diagram && (
          <pre style={{
            marginTop: '1rem',
            background: '#0f172a',
            border: '1px solid #334155',
            borderRadius: 8,
            padding: '0.75rem 1rem',
            fontSize: '0.75rem',
            color: '#cbd5e1',
            overflowX: 'auto',
            fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
          }}>
            {data.diagram}
          </pre>
        )}
      </div>

      {top.length > 0 && (
        <div className="table-card" style={{ padding: '1rem 1.5rem' }}>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>
            Top topics today
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {top.map(t => (
              <div key={t.name} style={{
                padding: '0.4rem 0.75rem',
                background: '#1e293b',
                border: '1px solid #334155',
                borderRadius: 6,
                fontSize: '0.85rem',
                color: '#e2e8f0',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}>
                <span style={{ fontWeight: 600 }}>{t.name}</span>
                <span style={{ color: '#60a5fa', fontSize: '0.75rem' }}>{t.count}×</span>
                <span style={{ color: '#64748b', fontSize: '0.7rem' }}>{t.cluster}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
