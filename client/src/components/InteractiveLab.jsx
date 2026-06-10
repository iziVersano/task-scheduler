import { useState } from 'react';
import { apiFetch } from '../apiClient.js';

const API = '/api';

function Terminal({ result, isRunning }) {
  if (!isRunning && !result) return null;

  if (isRunning) {
    return (
      <div className="ilab-terminal">
        <div className="ilab-terminal-bar">
          <span className="ilab-terminal-dot dot-running" />
          <span>Running...</span>
        </div>
        <div className="ilab-terminal-body">
          <span className="ilab-cursor">_</span>
        </div>
      </div>
    );
  }

  return (
    <div className="ilab-terminal">
      <div className="ilab-terminal-bar">
        <span className={`ilab-terminal-dot ${result.exitCode === 0 ? 'dot-ok' : 'dot-err'}`} />
        <span>
          {result.error ? 'Error' : `Exit ${result.exitCode}`}
          {result.durationMs != null && ` · ${result.durationMs}ms`}
          {result.timedOut && ' · Timed out'}
        </span>
      </div>
      <pre className="ilab-terminal-body">
        {result.error && <span className="stderr">{result.error}</span>}
        {result.stdout && <span className="stdout">{result.stdout}</span>}
        {result.stderr && !result.error && <span className="stderr">{result.stderr}</span>}
        {!result.stdout && !result.stderr && !result.error && <span className="muted">(no output)</span>}
      </pre>
    </div>
  );
}

export default function InteractiveLab({ lab, onClose }) {
  const [results, setResults] = useState({});
  const [running, setRunning] = useState({});
  const [copied, setCopied]   = useState({});

  const handleRun = async (command) => {
    setRunning(r => ({ ...r, [command]: true }));
    setResults(r => ({ ...r, [command]: null }));
    try {
      const res = await apiFetch(`${API}/labs/${encodeURIComponent(lab.id)}/execute`, {
        method: 'POST',
        body: JSON.stringify({ command }),
      });
      const data = await res.json();
      setResults(r => ({ ...r, [command]: res.ok ? data : { error: data.error, exitCode: -1 } }));
    } catch (err) {
      setResults(r => ({ ...r, [command]: { error: err.message, exitCode: -1 } }));
    } finally {
      setRunning(r => ({ ...r, [command]: false }));
    }
  };

  const handleCopy = (command) => {
    navigator.clipboard.writeText(command);
    setCopied(c => ({ ...c, [command]: true }));
    setTimeout(() => setCopied(c => ({ ...c, [command]: false })), 1500);
  };

  const DIFF_LABELS = { 1: 'Basic', 2: 'Commands', 3: 'Troubleshooting', 4: 'Design Challenge' };
  const diffLabel = DIFF_LABELS[lab.difficulty] || 'Basic';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide interactive-lab-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{lab.title}</h2>
            <span className="modal-sub">Level {lab.difficulty || 1} · {diffLabel} — {lab.category}</span>
          </div>
          <button className="btn-icon" onClick={onClose}>&#x2715;</button>
        </div>

        <div className="interactive-lab-body">
          {/* ── Goal / Concept ── */}
          <div className="ilab-section">
            <h3 className="ilab-section-title">Goal</h3>
            <p className="ilab-concept-text">{lab.concept}</p>
          </div>

          {/* ── Instructions ── */}
          <div className="ilab-section">
            <h3 className="ilab-section-title">Step-by-Step</h3>
            <ol className="ilab-instructions">
              {lab.instructions.map((step, i) => <li key={i}>{step}</li>)}
            </ol>
          </div>

          {/* ── Commands ── */}
          {lab.commands.length > 0 && (
            <div className="ilab-section">
              <h3 className="ilab-section-title">Commands</h3>
              {lab.commands.map(cmd => (
                <div key={cmd} className="ilab-command-block">
                  <div className="ilab-command-header">
                    <code className="ilab-command-text">$ {cmd}</code>
                    <div className="ilab-command-actions">
                      <button
                        className="btn-sm btn-neutral"
                        onClick={() => handleCopy(cmd)}
                      >
                        {copied[cmd] ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        className="btn-sm btn-ok"
                        onClick={() => handleRun(cmd)}
                        disabled={running[cmd]}
                      >
                        {running[cmd] ? 'Running...' : 'Run'}
                      </button>
                    </div>
                  </div>
                  <Terminal result={results[cmd]} isRunning={running[cmd]} />
                </div>
              ))}
            </div>
          )}

          {/* ── Expected Output ── */}
          {lab.expectedOutput && (
            <div className="ilab-section">
              <h3 className="ilab-section-title">Expected Output</h3>
              <pre className="ilab-expected">{lab.expectedOutput}</pre>
            </div>
          )}

          {/* ── Explanation ── */}
          {lab.description && (
            <div className="ilab-section">
              <h3 className="ilab-section-title">Explanation</h3>
              <p className="ilab-explanation-text">{lab.description}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
