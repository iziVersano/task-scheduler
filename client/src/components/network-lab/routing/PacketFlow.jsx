import { useState, useEffect, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { startPacket, setPacketPath, advancePacket, resetPacket } from '../../../store/simulatorSlice';
import { computePacketPath } from './routingUtils';

export default function PacketFlow() {
  const dispatch = useDispatch();
  const nodes = useSelector(s => s.simulator.nodes);
  const links = useSelector(s => s.simulator.links);
  const routes = useSelector(s => s.simulator.routes);
  const packet = useSelector(s => s.simulator.packet);

  const [sourceId, setSourceId] = useState('');
  const [destIp, setDestIp] = useState('10.0.1.10');
  const timerRef = useRef(null);

  const subnets = nodes.filter(n => n.type === 'subnet');

  const handleSend = () => {
    if (!sourceId || !destIp) return;
    dispatch(resetPacket());
    dispatch(startPacket({ sourceNodeId: parseInt(sourceId), destinationIp: destIp }));

    const result = computePacketPath(parseInt(sourceId), destIp, nodes, links, routes);
    dispatch(setPacketPath({
      path: result.path,
      log: result.log,
      status: result.success ? 'success' : 'failed',
    }));
  };

  // Animate packet steps
  useEffect(() => {
    if (packet.status === 'idle' || packet.currentStep < 0) return;
    if (packet.currentStep >= packet.path.length - 1) return;
    timerRef.current = setTimeout(() => dispatch(advancePacket()), 800);
    return () => clearTimeout(timerRef.current);
  }, [packet.currentStep, packet.status, packet.path.length, dispatch]);

  const handleReset = () => {
    clearTimeout(timerRef.current);
    dispatch(resetPacket());
  };

  const stepIcon = (msg) => {
    if (msg.includes('delivered') || msg.includes('Internet')) return '[OK]';
    if (msg.includes('dropped') || msg.includes('Loop') || msg.includes('No ')) return '[!!]';
    if (msg.includes('Matched')) return '>>>';
    if (msg.includes('Forwarding')) return ' ->';
    return '[i]';
  };

  const stepClass = (msg) => {
    if (msg.includes('delivered') || msg.includes('Internet')) return 'nlab-step-ok';
    if (msg.includes('dropped') || msg.includes('Loop') || msg.includes('No ')) return 'nlab-step-err';
    if (msg.includes('Matched')) return 'nlab-step-send';
    if (msg.includes('Forwarding')) return 'nlab-step-reply';
    return 'nlab-step-route';
  };

  return (
    <div className="nlab-routing-packet">
      <h4>Packet Simulator</h4>
      <div className="nlab-routing-packet-controls">
        <div className="nlab-routing-section">
          <label className="nlab-routing-label">Source Subnet</label>
          <select className="nlab-select nlab-sm" value={sourceId} onChange={e => setSourceId(e.target.value)}>
            <option value="">Select...</option>
            {subnets.map(n => <option key={n.id} value={n.id}>{n.label} ({n.cidr})</option>)}
          </select>
        </div>
        <div className="nlab-routing-section">
          <label className="nlab-routing-label">Destination IP</label>
          <input className="nlab-inline-input nlab-sm" placeholder="10.0.1.10" value={destIp} onChange={e => setDestIp(e.target.value)} />
        </div>
        <div className="nlab-routing-packet-btns">
          <button className="btn-sm btn-primary-sm" onClick={handleSend} disabled={!sourceId || !destIp || packet.status === 'running'}>
            Send Packet
          </button>
          {packet.status !== 'idle' && (
            <button className="btn-sm btn-neutral" onClick={handleReset}>Reset</button>
          )}
        </div>
      </div>

      {/* Log */}
      {packet.log.length > 0 && (
        <div className="nlab-terminal-sim" style={{ marginTop: '0.6rem' }}>
          <div className="nlab-terminal-sim-bar">
            <span className={`nlab-terminal-dot ${packet.status === 'success' ? 'dot-ok' : packet.status === 'failed' ? 'dot-err' : 'dot-running'}`} />
            <span>{destIp} — {packet.status === 'success' ? 'Delivered' : packet.status === 'failed' ? 'Dropped' : 'In transit...'}</span>
          </div>
          <div className="nlab-terminal-sim-body">
            {packet.log.map((msg, i) => (
              <div key={i} className={`nlab-step ${stepClass(msg)}`}>
                <span className="nlab-step-icon">{stepIcon(msg)}</span>
                <span className="nlab-step-msg">{msg}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
