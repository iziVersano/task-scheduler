import { useRef, useState, useCallback } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { moveNode } from '../../../store/simulatorSlice';

const NODE_COLORS = {
  'subnet':           { fill: '#6366f1', stroke: '#818cf8' },
  'router':           { fill: '#f59e0b', stroke: '#fbbf24' },
  'internet-gateway': { fill: '#10b981', stroke: '#34d399' },
  'peering':          { fill: '#ec4899', stroke: '#f472b6' },
};

const NODE_SHAPES = {
  'subnet': (x, y, w, h) => (
    <rect x={x - w/2} y={y - h/2} width={w} height={h} rx={6} />
  ),
  'router': (x, y, w, h) => (
    <rect x={x - w/2} y={y - h/2} width={w} height={h} rx={16} />
  ),
  'internet-gateway': (x, y, w, h) => (
    <ellipse cx={x} cy={y} rx={w/2} ry={h/2} />
  ),
  'peering': (x, y, w) => {
    const s = w / 2;
    return <polygon points={`${x},${y - s} ${x + s},${y} ${x},${y + s} ${x - s},${y}`} />;
  },
};

export default function NetworkCanvas() {
  const dispatch = useDispatch();
  const nodes = useSelector(s => s.simulator.nodes);
  const links = useSelector(s => s.simulator.links);
  const packet = useSelector(s => s.simulator.packet);
  const svgRef = useRef(null);
  const [dragging, setDragging] = useState(null);

  const getNodePos = useCallback((id) => {
    const n = nodes.find(n => n.id === id);
    return n ? { x: n.x, y: n.y } : { x: 0, y: 0 };
  }, [nodes]);

  const handleMouseDown = (e, nodeId) => {
    e.preventDefault();
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
    const node = nodes.find(n => n.id === nodeId);
    setDragging({ id: nodeId, offsetX: svgPt.x - node.x, offsetY: svgPt.y - node.y });
  };

  const handleMouseMove = (e) => {
    if (!dragging) return;
    const svg = svgRef.current;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const svgPt = pt.matrixTransform(svg.getScreenCTM().inverse());
    dispatch(moveNode({
      id: dragging.id,
      x: Math.round(svgPt.x - dragging.offsetX),
      y: Math.round(svgPt.y - dragging.offsetY),
    }));
  };

  const handleMouseUp = () => setDragging(null);

  const isOnPath = (nodeId) => packet.path.includes(nodeId);
  const isCurrent = (nodeId) => packet.path[packet.currentStep] === nodeId;
  const isLinkOnPath = (link) => {
    for (let i = 0; i < packet.path.length - 1; i++) {
      const a = packet.path[i], b = packet.path[i + 1];
      if ((link.sourceId === a && link.targetId === b) || (link.sourceId === b && link.targetId === a)) {
        return i <= packet.currentStep;
      }
    }
    return false;
  };

  return (
    <svg
      ref={svgRef}
      className="nlab-routing-canvas"
      viewBox="0 0 800 500"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <defs>
        <filter id="glow">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      {/* Links */}
      {links.map(link => {
        const s = getNodePos(link.sourceId);
        const t = getNodePos(link.targetId);
        const active = isLinkOnPath(link);
        return (
          <line
            key={link.id}
            x1={s.x} y1={s.y} x2={t.x} y2={t.y}
            className={`nlab-routing-link ${active ? 'nlab-routing-link-active' : ''}`}
          />
        );
      })}

      {/* Nodes */}
      {nodes.map(node => {
        const colors = NODE_COLORS[node.type] || NODE_COLORS.subnet;
        const shape = NODE_SHAPES[node.type] || NODE_SHAPES.subnet;
        const w = node.type === 'internet-gateway' ? 100 : 110;
        const h = node.type === 'peering' ? 50 : 44;
        const onPath = isOnPath(node.id);
        const current = isCurrent(node.id);

        return (
          <g
            key={node.id}
            className={`nlab-routing-node ${current ? 'nlab-routing-node-current' : ''}`}
            style={{ cursor: dragging?.id === node.id ? 'grabbing' : 'grab' }}
            onMouseDown={(e) => handleMouseDown(e, node.id)}
            filter={onPath ? 'url(#glow)' : undefined}
          >
            <g fill={colors.fill + '33'} stroke={onPath ? colors.stroke : colors.fill + '88'} strokeWidth={onPath ? 2.5 : 1.5}>
              {shape(node.x, node.y, w, h)}
            </g>
            <text x={node.x} y={node.y - 2} textAnchor="middle" className="nlab-routing-node-label" fill={colors.stroke}>
              {node.label}
            </text>
            {node.cidr && (
              <text x={node.x} y={node.y + 14} textAnchor="middle" className="nlab-routing-node-cidr" fill="#64748b">
                {node.cidr}
              </text>
            )}
            {current && (
              <circle cx={node.x} cy={node.y} r={6} fill={colors.stroke} className="nlab-routing-packet-dot" />
            )}
          </g>
        );
      })}
    </svg>
  );
}
