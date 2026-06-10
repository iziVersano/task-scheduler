import { useState, useEffect, useRef } from 'react';
import { simulatePing } from './networkUtils.js';

export default function PingSimulator({ devices, gateway, prefix }) {
  const [sourceIp, setSourceIp] = useState('');
  const [destIp, setDestIp] = useState('');
  const [result, setResult] = useState(null);
  const [animIdx, setAnimIdx] = useState(-1);
  const timerRef = useRef(null);

  const allOptions = [
    { ip: gateway, label: `Gateway (${gateway})` },
    ...devices.map(d => ({ ip: d.ipAddress, label: `${d.deviceName} (${d.ipAddress})` })),
  ];

  const runPing = () => {
    if (!sourceIp || !destIp) return;
    const res = simulatePing(sourceIp, destIp, gateway, prefix, devices);
    setResult(res);
    setAnimIdx(0);
  };

  useEffect(() => {
    if (!result || animIdx < 0) return;
    if (animIdx >= result.steps.length) return;
    timerRef.current = setTimeout(() => setAnimIdx(i => i + 1), 600);
    return () => clearTimeout(timerRef.current);
  }, [animIdx, result]);

  const reset = () => {
    setResult(null);
    setAnimIdx(-1);
    clearTimeout(timerRef.current);
  };

  const stepIcon = (type) => {
    switch (type) {
      case 'send': return '>>>';
      case 'reply': return '<<<';
      case 'route': return '<~>';
      case 'success': return '[OK]';
      case 'error': return '[!!]';
      case 'info': return '[i]';
      default: return '---';
    }
  };

  const stepClass = (type) => {
    if (type === 'success' || type === 'info') return 'nlab-step-ok';
    if (type === 'error') return 'nlab-step-err';
    if (type === 'send') return 'nlab-step-send';
    if (type === 'reply') return 'nlab-step-reply';
    return 'nlab-step-route';
  };

  return (
    <div className="nlab-panel">
      <h3 className="nlab-panel-title">Ping Simulator</h3>
      <div className="nlab-ping-controls">
        <div className="nlab-ping-select-group">
          <label>Source</label>
          <select className="nlab-select" value={sourceIp} onChange={e => { setSourceIp(e.target.value); reset(); }}>
            <option value="">Select source...</option>
            {allOptions.map(o => (
              <option key={o.ip} value={o.ip}>{o.label}</option>
            ))}
          </select>
        </div>
        <span className="nlab-ping-arrow">&#8594;</span>
        <div className="nlab-ping-select-group">
          <label>Destination</label>
          <select className="nlab-select" value={destIp} onChange={e => { setDestIp(e.target.value); reset(); }}>
            <option value="">Select destination...</option>
            {allOptions.map(o => (
              <option key={o.ip} value={o.ip}>{o.label}</option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" onClick={runPing} disabled={!sourceIp || !destIp}>
          Ping
        </button>
      </div>

      {result && (
        <div className="nlab-ping-result">
          <div className="nlab-terminal-sim">
            <div className="nlab-terminal-sim-bar">
              <span className={`nlab-terminal-dot ${result.success ? 'dot-ok' : 'dot-err'}`} />
              <span>ping {destIp}</span>
            </div>
            <div className="nlab-terminal-sim-body">
              {result.steps.slice(0, animIdx + 1).map((step, i) => (
                <div key={i} className={`nlab-step ${stepClass(step.type)}`}>
                  <span className="nlab-step-icon">{stepIcon(step.type)}</span>
                  <span className="nlab-step-msg">{step.message}</span>
                </div>
              ))}
              {animIdx < result.steps.length && <span className="nlab-cursor">_</span>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
