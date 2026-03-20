import { useState, useEffect } from 'react';

const API = '/api';

function parseIpOutput(stdout) {
  if (!stdout) return null;
  const interfaces = [];
  const blocks = stdout.split(/(?=^\d+:)/m);

  for (const block of blocks) {
    if (!block.trim()) continue;
    const nameMatch = block.match(/^\d+:\s+(\S+):/);
    if (!nameMatch) continue;

    const name = nameMatch[1];
    const stateMatch = block.match(/state\s+(\S+)/);
    const state = stateMatch ? stateMatch[1] : 'UNKNOWN';
    const isLoopback = /LOOPBACK/.test(block);

    const ipv4s = [];
    const ipv4Regex = /inet\s+([\d.]+\/\d+)/g;
    let m;
    while ((m = ipv4Regex.exec(block)) !== null) ipv4s.push(m[1]);

    const ipv6s = [];
    const ipv6Regex = /inet6\s+(\S+)/g;
    while ((m = ipv6Regex.exec(block)) !== null) ipv6s.push(m[1]);

    interfaces.push({ name, state, isLoopback, ipv4s, ipv6s });
  }

  return {
    interfaceCount: interfaces.length,
    hasLoopback: interfaces.some(i => i.isLoopback),
    hasActiveIPv4: interfaces.some(i => !i.isLoopback && i.ipv4s.length > 0),
    interfaces,
  };
}

function parsePingOutput(stdout) {
  if (!stdout) return null;

  // "4 packets transmitted, 4 received, 0% packet loss, time 3003ms"
  const statsMatch = stdout.match(/(\d+) packets transmitted,\s*(\d+) received,\s*([\d.]+)% packet loss/);
  if (!statsMatch) return null;

  const transmitted = parseInt(statsMatch[1], 10);
  const received    = parseInt(statsMatch[2], 10);
  const loss        = parseFloat(statsMatch[3]);

  // "rtt min/avg/max/mdev = 12.3/14.5/16.7/1.2 ms"
  const rttMatch = stdout.match(/rtt min\/avg\/max\/mdev\s*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)\/([\d.]+)\s*ms/);
  const rtt = rttMatch
    ? { min: rttMatch[1], avg: rttMatch[2], max: rttMatch[3] }
    : null;

  // Extract destination from first PING line: "PING 8.8.8.8 (8.8.8.8)"
  const destMatch = stdout.match(/^PING\s+(\S+)/m);
  const destination = destMatch ? destMatch[1] : null;

  return { transmitted, received, loss, rtt, destination, reachable: received > 0 };
}

export default function InteractiveLab({ lab, onClose }) {
  const [sandboxReady, setSandboxReady] = useState(null);
  const [results, setResults]           = useState({});  // keyed by command
  const [running, setRunning]           = useState({});
  const [copied, setCopied]             = useState({});

  // Check sandbox status on mount
  useEffect(() => {
    fetch(`${API}/labs/sandbox/status`)
      .then(r => r.json())
      .then(s => setSandboxReady(s))
      .catch(() => setSandboxReady({ docker: false, image: false, ready: false }));
  }, []);

  const handleRun = async (command) => {
    setRunning(r => ({ ...r, [command]: true }));
    setResults(r => ({ ...r, [command]: null }));
    try {
      const res = await fetch(`${API}/labs/${encodeURIComponent(lab.id)}/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResults(r => ({ ...r, [command]: { error: data.error, exitCode: -1 } }));
      } else {
        setResults(r => ({ ...r, [command]: data }));
      }
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

  // Build result summary based on which commands have run
  const ipResult   = results['ip a'] || results['ip addr show'];
  const pingResult = Object.entries(results).find(([cmd]) => cmd.startsWith('ping'))?.[1];

  const parsed     = ipResult?.stdout   ? parseIpOutput(ipResult.stdout)     : null;
  const pingParsed = pingResult?.stdout ? parsePingOutput(pingResult.stdout)  : null;

  const allowedCommands = lab.allowedCommands || [];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-wide interactive-lab-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{lab.title}</h2>
            <span className="modal-sub">{lab.concept}</span>
          </div>
          <button className="btn-icon" onClick={onClose}>&#x2715;</button>
        </div>

        <div className="interactive-lab-body">
          {/* ── Sandbox Status ── */}
          {sandboxReady !== null && !sandboxReady.ready && (
            <div className="sandbox-warning">
              <strong>Sandbox not ready</strong>
              {!sandboxReady.docker && (
                <p>Docker is not installed or not running.<br/>
                  <code>sudo apt install docker.io && sudo usermod -aG docker $USER</code></p>
              )}
              {sandboxReady.docker && !sandboxReady.image && (
                <p>Sandbox image not built.<br/>
                  <code>cd server/sandbox && ./build.sh</code></p>
              )}
            </div>
          )}

          {/* ── Instructions ── */}
          <div className="ilab-section">
            <h3 className="ilab-section-title">Instructions</h3>
            <ol className="ilab-instructions">
              {lab.instructions.map((step, i) => (
                <li key={i}>{step}</li>
              ))}
            </ol>
          </div>

          {/* ── Command Blocks ── */}
          <div className="ilab-section">
            <h3 className="ilab-section-title">Commands</h3>
            {allowedCommands.map(cmd => {
              const result = results[cmd];
              const isRunning = running[cmd];
              const isCopied = copied[cmd];

              return (
                <div key={cmd} className="ilab-command-block">
                  <div className="ilab-command-header">
                    <code className="ilab-command-text">$ {cmd}</code>
                    <div className="ilab-command-actions">
                      <button
                        className="btn-sm btn-neutral"
                        onClick={() => handleCopy(cmd)}
                        title="Copy command"
                      >
                        {isCopied ? 'Copied' : 'Copy'}
                      </button>
                      <button
                        className="btn-sm btn-ok"
                        onClick={() => handleRun(cmd)}
                        disabled={isRunning || (sandboxReady && !sandboxReady.ready)}
                        title="Run in sandbox"
                      >
                        {isRunning ? 'Running...' : 'Run'}
                      </button>
                    </div>
                  </div>

                  {/* Loading indicator */}
                  {isRunning && (
                    <div className="ilab-terminal">
                      <div className="ilab-terminal-bar">
                        <span className="ilab-terminal-dot dot-running" />
                        <span>Executing in sandbox...</span>
                      </div>
                      <div className="ilab-terminal-body">
                        <span className="ilab-cursor">_</span>
                      </div>
                    </div>
                  )}

                  {/* Result */}
                  {result && !isRunning && (
                    <div className="ilab-terminal">
                      <div className="ilab-terminal-bar">
                        <span className={`ilab-terminal-dot ${result.exitCode === 0 ? 'dot-ok' : 'dot-err'}`} />
                        <span>
                          {result.error
                            ? 'Error'
                            : `Exit ${result.exitCode}`}
                          {result.durationMs != null && ` \u00b7 ${result.durationMs}ms`}
                          {result.timedOut && ' \u00b7 Timed out'}
                        </span>
                      </div>
                      <pre className="ilab-terminal-body">
                        {result.error && (
                          <span className="stderr">{result.error}</span>
                        )}
                        {result.stdout && (
                          <span className="stdout">{result.stdout}</span>
                        )}
                        {result.stderr && !result.error && (
                          <span className="stderr">{result.stderr}</span>
                        )}
                        {!result.stdout && !result.stderr && !result.error && (
                          <span className="muted">(no output)</span>
                        )}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Ping Summary ── */}
          {pingParsed && (
            <div className="ilab-section">
              <h3 className="ilab-section-title">Result Summary</h3>
              <div className="ilab-summary-grid">
                <div className={`ilab-summary-card ${pingParsed.reachable ? 'summary-ok' : 'summary-warn'}`}>
                  <span className="ilab-summary-value">{pingParsed.reachable ? 'Yes' : 'No'}</span>
                  <span className="ilab-summary-label">Reachable</span>
                </div>
                <div className="ilab-summary-card">
                  <span className="ilab-summary-value">{pingParsed.received}/{pingParsed.transmitted}</span>
                  <span className="ilab-summary-label">Packets received</span>
                </div>
                <div className={`ilab-summary-card ${pingParsed.loss === 0 ? 'summary-ok' : 'summary-warn'}`}>
                  <span className="ilab-summary-value">{pingParsed.loss}%</span>
                  <span className="ilab-summary-label">Packet loss</span>
                </div>
                {pingParsed.rtt && (
                  <div className="ilab-summary-card">
                    <span className="ilab-summary-value">{pingParsed.rtt.avg} ms</span>
                    <span className="ilab-summary-label">Avg RTT</span>
                  </div>
                )}
              </div>
              {pingParsed.destination && (
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Target: <code>{pingParsed.destination}</code>
                  {pingParsed.rtt && ` · min ${pingParsed.rtt.min} ms / max ${pingParsed.rtt.max} ms`}
                </p>
              )}
            </div>
          )}

          {/* ── Visual Summary ── */}
          {parsed && (
            <div className="ilab-section">
              <h3 className="ilab-section-title">Result Summary</h3>
              <div className="ilab-summary-grid">
                <div className="ilab-summary-card">
                  <span className="ilab-summary-value">{parsed.interfaceCount}</span>
                  <span className="ilab-summary-label">Interfaces</span>
                </div>
                <div className={`ilab-summary-card ${parsed.hasLoopback ? 'summary-ok' : 'summary-warn'}`}>
                  <span className="ilab-summary-value">{parsed.hasLoopback ? 'Yes' : 'No'}</span>
                  <span className="ilab-summary-label">Loopback</span>
                </div>
                <div className={`ilab-summary-card ${parsed.hasActiveIPv4 ? 'summary-ok' : 'summary-warn'}`}>
                  <span className="ilab-summary-value">{parsed.hasActiveIPv4 ? 'Yes' : 'No'}</span>
                  <span className="ilab-summary-label">Active IPv4</span>
                </div>
              </div>

              {/* Interface detail cards */}
              <div className="ilab-interfaces">
                {parsed.interfaces.map((iface, i) => (
                  <div key={i} className="ilab-iface-card">
                    <div className="ilab-iface-header">
                      <strong>{iface.name}</strong>
                      <span className={`badge ${iface.state === 'UP' ? 'badge-ok' : iface.state === 'DOWN' ? 'badge-err' : 'badge-running'}`}>
                        {iface.state}
                      </span>
                    </div>
                    {iface.ipv4s.length > 0 && (
                      <div className="ilab-iface-addrs">
                        {iface.ipv4s.map((ip, j) => (
                          <code key={j}>{ip}</code>
                        ))}
                      </div>
                    )}
                    {iface.ipv6s.length > 0 && (
                      <div className="ilab-iface-addrs ilab-ipv6">
                        {iface.ipv6s.map((ip, j) => (
                          <code key={j}>{ip}</code>
                        ))}
                      </div>
                    )}
                    {iface.ipv4s.length === 0 && iface.ipv6s.length === 0 && (
                      <span className="muted" style={{ fontSize: '0.78rem' }}>No addresses assigned</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
