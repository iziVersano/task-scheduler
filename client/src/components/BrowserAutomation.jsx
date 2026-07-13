import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../apiClient.js';

const API = '/api';

// Group services by category
function groupByCategory(services) {
  const groups = {};
  for (const s of services) {
    const cat = s.category || 'Other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(s);
  }
  return groups;
}

export default function BrowserAutomation() {
  const [scripts, setScripts] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [expanded, setExpanded] = useState(null);
  const [args, setArgs] = useState({});
  const [selectedServices, setSelectedServices] = useState({});
  const [selectedTopics, setSelectedTopics] = useState({});
  const [loading, setLoading] = useState({});

  const fetchScripts = useCallback(async () => {
    try {
      const res = await apiFetch(`${API}/browser-scripts`);
      if (res.ok) {
        const data = await res.json();
        setScripts(data);
        // Initialize selected services with first 3 defaults
        const init = {};
        for (const s of data) {
          if (s.hasServicePicker && s.availableServices) {
            init[s.id] = s.availableServices.slice(0, 3);
          }
        }
        setSelectedServices(prev => ({ ...init, ...prev }));
      }
    } catch {}
  }, []);

  const fetchStatus = useCallback(async (id) => {
    try {
      const res = await apiFetch(`${API}/browser-scripts/${id}/status`);
      if (res.ok) {
        const status = await res.json();
        setStatuses(prev => ({ ...prev, [id]: status }));
      }
    } catch {}
  }, []);

  useEffect(() => { fetchScripts(); }, [fetchScripts]);

  useEffect(() => {
    if (!expanded) return;
    fetchStatus(expanded);
    const id = setInterval(() => fetchStatus(expanded), 3000);
    return () => clearInterval(id);
  }, [expanded, fetchStatus]);

  const runScript = async (scriptId) => {
    setLoading(prev => ({ ...prev, [scriptId]: true }));
    try {
      await apiFetch(`${API}/browser-scripts/${scriptId}/run`, {
        method: 'POST',
        body: JSON.stringify({
          arg: args[scriptId] || '',
          services: selectedServices[scriptId] || [],
          topic: selectedTopics[scriptId] || '',
        }),
      });
      setExpanded(scriptId);
      setTimeout(() => fetchStatus(scriptId), 1000);
    } catch {}
    setLoading(prev => ({ ...prev, [scriptId]: false }));
  };

  const stopScript = async (scriptId) => {
    await apiFetch(`${API}/browser-scripts/${scriptId}/stop`, { method: 'POST' });
    setTimeout(() => fetchStatus(scriptId), 500);
  };

  const toggleService = (scriptId, service) => {
    setSelectedServices(prev => {
      const current = prev[scriptId] || [];
      const exists = current.find(s => s.name === service.name);
      if (exists) {
        return { ...prev, [scriptId]: current.filter(s => s.name !== service.name) };
      }
      return { ...prev, [scriptId]: [...current, service] };
    });
  };

  const isServiceSelected = (scriptId, serviceName) => {
    return (selectedServices[scriptId] || []).some(s => s.name === serviceName);
  };

  const st = (id) => statuses[id] || {};

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <a
          href="https://classroom.google.com/u/1/c/ODY1MDM0NDY1ODM3"
          target="_blank"
          rel="noreferrer"
          className="btn btn-neutral"
          title="Open Google Classroom"
        >
          🎓 Classroom
        </a>
      </div>

      <div className="stats-row" style={{ marginBottom: '1.5rem' }}>
        <div className="stat-card">
          <span className="stat-value">{scripts.length}</span>
          <span className="stat-label">Scripts</span>
        </div>
        <div className="stat-card stat-active">
          <span className="stat-value">
            {scripts.filter(s => st(s.id).running).length}
          </span>
          <span className="stat-label">Running</span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {scripts.map(script => {
          const status = st(script.id);
          const isExpanded = expanded === script.id;
          const selected = selectedServices[script.id] || [];
          const grouped = script.availableServices ? groupByCategory(script.availableServices) : {};

          return (
            <div key={script.id} className="table-card" style={{ padding: 0 }}>
              {/* Header */}
              <div
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '1rem 1.5rem', cursor: 'pointer',
                }}
                onClick={() => setExpanded(isExpanded ? null : script.id)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span style={{ fontSize: '1.5rem' }}>{script.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, color: '#f1f5f9', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      {script.name}
                      {status.running && (
                        <span style={{
                          display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                          background: '#34d399', animation: 'pulse 1.5s infinite',
                        }} />
                      )}
                    </div>
                    <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: 2 }}>
                      {script.description}
                      {script.hasServicePicker && selected.length > 0 && (
                        <span style={{ color: '#60a5fa' }}>
                          {' '} — {selected.length} service{selected.length !== 1 ? 's' : ''} selected
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  {status.running ? (
                    <button className="btn-sm btn-danger" onClick={e => { e.stopPropagation(); stopScript(script.id); }}>
                      ■ Stop
                    </button>
                  ) : (
                    <button
                      className="btn-sm btn-ok"
                      disabled={loading[script.id] || (script.hasServicePicker && selected.length === 0)}
                      onClick={e => { e.stopPropagation(); runScript(script.id); }}
                    >
                      {loading[script.id] ? '...' : '▶ Run'}
                    </button>
                  )}
                  <span style={{
                    color: '#64748b', fontSize: '1.2rem',
                    transform: isExpanded ? 'rotate(180deg)' : '', transition: 'transform 0.2s',
                  }}>▾</span>
                </div>
              </div>

              {/* Expanded */}
              {isExpanded && (
                <div style={{ borderTop: '1px solid #334155', padding: '1rem 1.5rem' }}>
                  {/* Arg input for Meet */}
                  {script.requiresArg && (
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                        {script.argLabel}
                      </label>
                      <input
                        type="text"
                        value={args[script.id] || ''}
                        onChange={e => setArgs(prev => ({ ...prev, [script.id]: e.target.value }))}
                        placeholder={script.argPlaceholder}
                        style={{
                          width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8,
                          border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0',
                          fontSize: '0.85rem',
                        }}
                      />
                    </div>
                  )}

                  {/* Topic picker (single-select dropdown) */}
                  {script.hasTopicPicker && script.availableTopics && (
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ fontSize: '0.8rem', color: '#94a3b8', display: 'block', marginBottom: 4 }}>
                        {script.topicLabel || 'Topic'}
                      </label>
                      <select
                        value={selectedTopics[script.id] || ''}
                        onChange={e => setSelectedTopics(prev => ({ ...prev, [script.id]: e.target.value }))}
                        style={{
                          width: '100%', padding: '0.5rem 0.75rem', borderRadius: 8,
                          border: '1px solid #334155', background: '#0f172a', color: '#e2e8f0',
                          fontSize: '0.85rem', cursor: 'pointer',
                        }}
                      >
                        {script.availableTopics.map(t => (
                          <option key={t.value} value={t.value}>{t.label}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Service picker */}
                  {script.hasServicePicker && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 8 }}>
                        Select Azure Services
                      </div>
                      {Object.entries(grouped).map(([cat, services]) => (
                        <div key={cat} style={{ marginBottom: '0.75rem' }}>
                          <div style={{
                            fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase',
                            letterSpacing: '0.05em', marginBottom: 4, paddingLeft: 2,
                          }}>
                            {cat}
                          </div>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                            {services.map(svc => {
                              const sel = isServiceSelected(script.id, svc.name);
                              return (
                                <button
                                  key={svc.name}
                                  onClick={() => toggleService(script.id, svc)}
                                  style={{
                                    padding: '0.3rem 0.7rem', borderRadius: 6, fontSize: '0.8rem',
                                    border: sel ? '1px solid #3b82f6' : '1px solid #334155',
                                    background: sel ? 'rgba(59, 130, 246, 0.15)' : '#1e293b',
                                    color: sel ? '#60a5fa' : '#94a3b8',
                                    cursor: 'pointer', transition: 'all 0.15s',
                                  }}
                                >
                                  {sel ? '✓ ' : ''}{svc.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      {selected.length > 0 && (
                        <div style={{
                          marginTop: '0.5rem', fontSize: '0.8rem', color: '#94a3b8',
                          display: 'flex', alignItems: 'center', gap: '0.5rem',
                        }}>
                          <span>{selected.length} selected:</span>
                          <span style={{ color: '#e2e8f0' }}>{selected.map(s => s.name).join(', ')}</span>
                          <button
                            onClick={() => setSelectedServices(prev => ({ ...prev, [script.id]: [] }))}
                            style={{
                              marginLeft: 'auto', padding: '0.15rem 0.5rem', borderRadius: 4,
                              border: '1px solid #334155', background: 'transparent', color: '#64748b',
                              cursor: 'pointer', fontSize: '0.75rem',
                            }}
                          >
                            Clear
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Running status */}
                  {status.running && (
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                      background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.3)',
                      borderRadius: 8, padding: '0.4rem 0.75rem', marginBottom: '1rem',
                      fontSize: '0.8rem', color: '#34d399',
                    }}>
                      Running (PID {status.pid}) — {status.uptime}s
                    </div>
                  )}

                  {/* Summary */}
                  {status.summary && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>
                        Estimate Summary
                      </div>
                      <div style={{
                        background: '#0f172a', border: '1px solid #334155', borderRadius: 8,
                        padding: '0.75rem 1rem', fontSize: '0.85rem',
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                          <span style={{ color: '#94a3b8' }}>Services</span>
                          <span style={{ color: '#f1f5f9' }}>{status.summary.servicesRequested?.join(', ')}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ color: '#94a3b8' }}>Timestamp</span>
                          <span style={{ color: '#f1f5f9' }}>{new Date(status.summary.timestamp).toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Screenshots */}
                  {status.screenshots?.length > 0 && (
                    <div style={{ marginBottom: '1rem' }}>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>
                        Screenshots
                      </div>
                      <div style={{ display: 'flex', gap: '0.75rem', overflowX: 'auto', paddingBottom: 4 }}>
                        {status.screenshots.map((ss, i) => (
                          <div key={i} style={{ flexShrink: 0 }}>
                            <img
                              src={ss.url}
                              alt={ss.name}
                              style={{
                                width: 240, height: 135, objectFit: 'cover',
                                borderRadius: 8, border: '1px solid #334155', cursor: 'pointer',
                              }}
                              onClick={() => window.open(ss.url, '_blank')}
                            />
                            <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 4, textAlign: 'center' }}>
                              {ss.name}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Log */}
                  {status.log && (
                    <div>
                      <div style={{ fontSize: '0.75rem', color: '#94a3b8', textTransform: 'uppercase', marginBottom: 6 }}>
                        Log
                      </div>
                      <pre style={{
                        background: '#0f172a', border: '1px solid #334155', borderRadius: 8,
                        padding: '0.75rem 1rem', fontSize: '0.75rem', color: '#cbd5e1',
                        maxHeight: 200, overflowY: 'auto', whiteSpace: 'pre-wrap', wordBreak: 'break-all',
                        fontFamily: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace",
                      }}>
                        {status.log}
                      </pre>
                    </div>
                  )}

                  {/* Empty */}
                  {!status.log && !status.running && !status.summary && (
                    <div style={{ color: '#64748b', fontSize: '0.85rem', textAlign: 'center', padding: '1rem 0' }}>
                      {script.hasServicePicker ? 'Select services above, then click Run.' : 'No runs yet. Click Run to start.'}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>
    </div>
  );
}
