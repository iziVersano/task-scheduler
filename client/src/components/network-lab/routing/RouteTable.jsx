import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { addRoute, removeRoute } from '../../../store/simulatorSlice';
import { isValidCidr } from './routingUtils';

export default function RouteTable() {
  const dispatch = useDispatch();
  const nodes = useSelector(s => s.simulator.nodes);
  const routes = useSelector(s => s.simulator.routes);
  const packet = useSelector(s => s.simulator.packet);

  const [newRouteNode, setNewRouteNode] = useState('');
  const [newRouteCidr, setNewRouteCidr] = useState('');
  const [newRouteTarget, setNewRouteTarget] = useState('');
  const [error, setError] = useState('');

  const routers = nodes.filter(n => n.type === 'router');

  const handleAdd = () => {
    if (!newRouteNode || !newRouteCidr || !newRouteTarget) {
      setError('All fields required');
      return;
    }
    if (!isValidCidr(newRouteCidr)) {
      setError('Invalid CIDR format');
      return;
    }
    dispatch(addRoute({
      nodeId: parseInt(newRouteNode),
      destinationCidr: newRouteCidr,
      targetNodeId: parseInt(newRouteTarget),
    }));
    setNewRouteCidr('');
    setNewRouteTarget('');
    setError('');
  };

  // Check if a route was matched during packet sim
  const isRouteMatched = (route) => {
    if (packet.status === 'idle') return false;
    return packet.log.some(l => l.includes(route.destinationCidr) && l.includes('longest prefix'));
  };

  return (
    <div className="nlab-routing-routes">
      <h4>Route Tables</h4>
      {error && <div className="nlab-error" style={{ marginBottom: '0.5rem' }}>{error}</div>}

      {routers.length === 0 && (
        <p className="muted" style={{ fontSize: '0.82rem' }}>Add a router to define routes.</p>
      )}

      {routers.map(router => {
        const routerRoutes = routes.filter(r => r.nodeId === router.id);
        return (
          <div key={router.id} className="nlab-routing-router-block">
            <div className="nlab-routing-router-label">{router.label}</div>
            {routerRoutes.length === 0 ? (
              <p className="muted" style={{ fontSize: '0.78rem', padding: '0.3rem 0' }}>No routes</p>
            ) : (
              <table className="nlab-routing-route-table">
                <thead>
                  <tr><th>Destination</th><th>Target</th><th></th></tr>
                </thead>
                <tbody>
                  {routerRoutes.map(r => {
                    const target = nodes.find(n => n.id === r.targetNodeId);
                    const matched = isRouteMatched(r);
                    return (
                      <tr key={r.id} className={matched ? 'nlab-routing-route-matched' : ''}>
                        <td><code>{r.destinationCidr}</code></td>
                        <td>{target?.label || '?'}</td>
                        <td>
                          <button className="btn-sm btn-danger nlab-routing-rm" onClick={() => dispatch(removeRoute(r.id))}>x</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );
      })}

      {/* Add route */}
      {routers.length > 0 && (
        <div className="nlab-routing-section" style={{ marginTop: '0.6rem' }}>
          <label className="nlab-routing-label">Add Route</label>
          <select className="nlab-select nlab-sm" value={newRouteNode} onChange={e => setNewRouteNode(e.target.value)}>
            <option value="">Router...</option>
            {routers.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
          <input className="nlab-inline-input nlab-sm" placeholder="CIDR (e.g. 10.0.2.0/24)" value={newRouteCidr} onChange={e => setNewRouteCidr(e.target.value)} />
          <select className="nlab-select nlab-sm" value={newRouteTarget} onChange={e => setNewRouteTarget(e.target.value)}>
            <option value="">Target...</option>
            {nodes.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
          </select>
          <button className="btn-sm btn-ok" onClick={handleAdd}>Add</button>
        </div>
      )}
    </div>
  );
}
