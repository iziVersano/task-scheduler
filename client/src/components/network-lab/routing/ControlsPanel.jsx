import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { addNode, removeNode, addLink, removeLink, loadPreset, loadProtocol } from '../../../store/simulatorSlice';

const NODE_TYPES = [
  { value: 'subnet', label: 'Subnet' },
  { value: 'router', label: 'Router' },
  { value: 'internet-gateway', label: 'Internet Gateway' },
  { value: 'peering', label: 'Peering Connection' },
];

export default function ControlsPanel() {
  const dispatch = useDispatch();
  const nodes = useSelector(s => s.simulator.nodes);
  const links = useSelector(s => s.simulator.links);
  const currentProtocol = useSelector(s => s.simulator.protocol);
  const [nodeType, setNodeType] = useState('subnet');
  const [nodeLabel, setNodeLabel] = useState('');
  const [nodeCidr, setNodeCidr] = useState('');
  const [linkSource, setLinkSource] = useState('');
  const [linkTarget, setLinkTarget] = useState('');

  const handleAddNode = () => {
    dispatch(addNode({ type: nodeType, label: nodeLabel || '', cidr: nodeCidr }));
    setNodeLabel('');
    setNodeCidr('');
  };

  const handleAddLink = () => {
    if (!linkSource || !linkTarget) return;
    dispatch(addLink({ sourceId: parseInt(linkSource), targetId: parseInt(linkTarget) }));
    setLinkSource('');
    setLinkTarget('');
  };

  return (
    <div className="nlab-routing-controls">
      <div className="nlab-routing-controls-header">
        <h4>Network Builder</h4>
        <button className="btn-sm btn-neutral" onClick={() => currentProtocol ? dispatch(loadProtocol(currentProtocol)) : dispatch(loadPreset())}>Reset</button>
      </div>

      {/* Add Node */}
      <div className="nlab-routing-section">
        <label className="nlab-routing-label">Add Node</label>
        <select className="nlab-select nlab-sm" value={nodeType} onChange={e => setNodeType(e.target.value)}>
          {NODE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <input className="nlab-inline-input nlab-sm" placeholder="Label" value={nodeLabel} onChange={e => setNodeLabel(e.target.value)} />
        {(nodeType === 'subnet' || nodeType === 'router') && (
          <input className="nlab-inline-input nlab-sm" placeholder="CIDR (e.g. 10.0.2.0/24)" value={nodeCidr} onChange={e => setNodeCidr(e.target.value)} />
        )}
        <button className="btn-sm btn-ok" onClick={handleAddNode}>Add</button>
      </div>

      {/* Add Link */}
      <div className="nlab-routing-section">
        <label className="nlab-routing-label">Connect Nodes</label>
        <div className="nlab-routing-link-row">
          <select className="nlab-select nlab-sm" value={linkSource} onChange={e => setLinkSource(e.target.value)}>
            <option value="">From...</option>
            {nodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
          <span className="nlab-routing-arrow">→</span>
          <select className="nlab-select nlab-sm" value={linkTarget} onChange={e => setLinkTarget(e.target.value)}>
            <option value="">To...</option>
            {nodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
          <button className="btn-sm btn-ok" onClick={handleAddLink}>Link</button>
        </div>
      </div>

      {/* Node list */}
      <div className="nlab-routing-section">
        <label className="nlab-routing-label">Nodes ({nodes.length})</label>
        <div className="nlab-routing-node-list">
          {nodes.map(n => (
            <div key={n.id} className="nlab-routing-node-item">
              <span className="nlab-routing-node-dot" style={{ background: n.type === 'router' ? '#f59e0b' : n.type === 'internet-gateway' ? '#10b981' : n.type === 'peering' ? '#ec4899' : '#6366f1' }} />
              <span>{n.label}</span>
              {n.cidr && <code className="nlab-routing-cidr-small">{n.cidr}</code>}
              <button className="btn-sm btn-danger nlab-routing-rm" onClick={() => dispatch(removeNode(n.id))}>x</button>
            </div>
          ))}
        </div>
      </div>

      {/* Links list */}
      {links.length > 0 && (
        <div className="nlab-routing-section">
          <label className="nlab-routing-label">Links ({links.length})</label>
          <div className="nlab-routing-node-list">
            {links.map(l => {
              const s = nodes.find(n => n.id === l.sourceId);
              const t = nodes.find(n => n.id === l.targetId);
              return (
                <div key={l.id} className="nlab-routing-node-item">
                  <span>{s?.label || '?'} ↔ {t?.label || '?'}</span>
                  <button className="btn-sm btn-danger nlab-routing-rm" onClick={() => dispatch(removeLink(l.id))}>x</button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
