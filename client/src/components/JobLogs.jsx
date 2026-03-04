import { useState, useEffect } from 'react';

const API = '/api';

function fmt(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleString();
}

function duration(log) {
  if (!log.finished_at) return <span className="badge badge-running">running</span>;
  const ms = new Date(log.finished_at) - new Date(log.started_at);
  return `${(ms / 1000).toFixed(2)}s`;
}

export default function JobLogs({ job, onClose }) {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    fetch(`${API}/jobs/${job.id}/logs?limit=50`)
      .then((r) => r.json())
      .then((data) => { setLogs(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [job.id]);

  const overlayClick = (e) => e.target === e.currentTarget && onClose();

  const toggleExpand = (id) => setExpanded((prev) => (prev === id ? null : id));

  return (
    <div className="modal-overlay" onClick={overlayClick}>
      <div className="modal modal-wide">
        <div className="modal-header">
          <div>
            <h2>Execution Logs</h2>
            <span className="modal-sub">{job.name}</span>
          </div>
          <button className="btn-icon" onClick={onClose}>✕</button>
        </div>

        {loading && (
          <div className="spinner-wrap"><span className="spinner" /></div>
        )}

        {!loading && logs.length === 0 && (
          <p className="empty-msg">No logs yet — this job has not run yet.</p>
        )}

        {!loading && logs.length > 0 && (
          <div className="logs-table-wrap">
            <table className="logs-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Started</th>
                  <th>Duration</th>
                  <th>Exit</th>
                  <th>Output</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, i) => {
                  const isErr  = log.exit_code !== null && log.exit_code !== 0;
                  const hasOut = log.output || log.error;
                  return (
                    <>
                      <tr
                        key={log.id}
                        className={isErr ? 'row-err' : log.exit_code === null ? 'row-running' : 'row-ok'}
                      >
                        <td className="log-num">{logs.length - i}</td>
                        <td className="log-time">{fmt(log.started_at)}</td>
                        <td>{duration(log)}</td>
                        <td>
                          {log.exit_code === null ? (
                            <span className="badge badge-running">…</span>
                          ) : (
                            <span className={`badge ${log.exit_code === 0 ? 'badge-ok' : 'badge-err'}`}>
                              {log.exit_code}
                            </span>
                          )}
                        </td>
                        <td>
                          {hasOut ? (
                            <button className="btn-link" onClick={() => toggleExpand(log.id)}>
                              {expanded === log.id ? 'hide' : 'show'}
                            </button>
                          ) : (
                            <span className="muted">—</span>
                          )}
                        </td>
                      </tr>
                      {expanded === log.id && hasOut && (
                        <tr key={`${log.id}-out`} className="row-output">
                          <td colSpan={5}>
                            <pre className="log-output">
                              {log.output && <span className="stdout">{log.output}</span>}
                              {log.error  && <span className="stderr">{log.error}</span>}
                            </pre>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
