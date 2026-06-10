import { createSlice } from '@reduxjs/toolkit';

/* ── Protocol-specific topology presets ── */

// RIP: Small private network — 2 routers, 3 subnets, simple hop-count routing
const RIP_PRESET = {
  protocol: 'rip',
  nodes: [
    { id: 1, type: 'router',  label: 'RIP-R1',    x: 400, y: 80,  cidr: '' },
    { id: 2, type: 'subnet',  label: 'Office-LAN', x: 160, y: 200, cidr: '192.168.1.0/24' },
    { id: 3, type: 'subnet',  label: 'Server-LAN', x: 400, y: 260, cidr: '192.168.2.0/24' },
    { id: 4, type: 'router',  label: 'RIP-R2',    x: 640, y: 80,  cidr: '' },
    { id: 5, type: 'subnet',  label: 'Guest-WLAN', x: 640, y: 260, cidr: '192.168.3.0/24' },
  ],
  links: [
    { id: 1, sourceId: 1, targetId: 2 },
    { id: 2, sourceId: 1, targetId: 3 },
    { id: 3, sourceId: 1, targetId: 4 },
    { id: 4, sourceId: 4, targetId: 5 },
  ],
  routes: [
    // R1 knows local subnets directly, reaches Guest via R2 (hop count 1)
    { id: 1, nodeId: 1, destinationCidr: '192.168.1.0/24', targetNodeId: 2 },
    { id: 2, nodeId: 1, destinationCidr: '192.168.2.0/24', targetNodeId: 3 },
    { id: 3, nodeId: 1, destinationCidr: '192.168.3.0/24', targetNodeId: 4 },
    // R2 knows Guest locally, reaches others via R1
    { id: 4, nodeId: 4, destinationCidr: '192.168.3.0/24', targetNodeId: 5 },
    { id: 5, nodeId: 4, destinationCidr: '192.168.1.0/24', targetNodeId: 1 },
    { id: 6, nodeId: 4, destinationCidr: '192.168.2.0/24', targetNodeId: 1 },
  ],
  nextId: 6, nextLinkId: 5, nextRouteId: 7,
};

// OSPF: Large enterprise — 3 routers in Area 0 backbone, 4 subnets
const OSPF_PRESET = {
  protocol: 'eigrp-ospf',
  nodes: [
    { id: 1,  type: 'router',  label: 'OSPF-ABR1 (Area 0)', x: 400, y: 50,  cidr: '' },
    { id: 2,  type: 'router',  label: 'OSPF-R2 (Area 1)',   x: 180, y: 180, cidr: '' },
    { id: 3,  type: 'router',  label: 'OSPF-R3 (Area 2)',   x: 620, y: 180, cidr: '' },
    { id: 4,  type: 'subnet',  label: 'HQ-Servers',         x: 400, y: 180, cidr: '10.0.0.0/24' },
    { id: 5,  type: 'subnet',  label: 'Branch-A',           x: 80,  y: 340, cidr: '10.0.1.0/24' },
    { id: 6,  type: 'subnet',  label: 'Branch-B',           x: 300, y: 340, cidr: '10.0.2.0/24' },
    { id: 7,  type: 'subnet',  label: 'Data-Center',        x: 520, y: 340, cidr: '10.0.3.0/24' },
    { id: 8,  type: 'subnet',  label: 'DMZ',                x: 720, y: 340, cidr: '10.0.4.0/24' },
  ],
  links: [
    { id: 1, sourceId: 1, targetId: 2 },
    { id: 2, sourceId: 1, targetId: 3 },
    { id: 3, sourceId: 1, targetId: 4 },
    { id: 4, sourceId: 2, targetId: 5 },
    { id: 5, sourceId: 2, targetId: 6 },
    { id: 6, sourceId: 3, targetId: 7 },
    { id: 7, sourceId: 3, targetId: 8 },
    // Redundant link between R2 and R3 (OSPF cost-based failover)
    { id: 8, sourceId: 2, targetId: 3 },
  ],
  routes: [
    // ABR1 — backbone, routes to all via area routers
    { id: 1,  nodeId: 1, destinationCidr: '10.0.0.0/24', targetNodeId: 4 },
    { id: 2,  nodeId: 1, destinationCidr: '10.0.1.0/24', targetNodeId: 2 },
    { id: 3,  nodeId: 1, destinationCidr: '10.0.2.0/24', targetNodeId: 2 },
    { id: 4,  nodeId: 1, destinationCidr: '10.0.3.0/24', targetNodeId: 3 },
    { id: 5,  nodeId: 1, destinationCidr: '10.0.4.0/24', targetNodeId: 3 },
    // R2 — Area 1
    { id: 6,  nodeId: 2, destinationCidr: '10.0.1.0/24', targetNodeId: 5 },
    { id: 7,  nodeId: 2, destinationCidr: '10.0.2.0/24', targetNodeId: 6 },
    { id: 8,  nodeId: 2, destinationCidr: '0.0.0.0/0',   targetNodeId: 1 },
    // R3 — Area 2
    { id: 9,  nodeId: 3, destinationCidr: '10.0.3.0/24', targetNodeId: 7 },
    { id: 10, nodeId: 3, destinationCidr: '10.0.4.0/24', targetNodeId: 8 },
    { id: 11, nodeId: 3, destinationCidr: '0.0.0.0/0',   targetNodeId: 1 },
  ],
  nextId: 9, nextLinkId: 9, nextRouteId: 12,
};

// BGP: Multi-AS internet topology — 3 autonomous systems with peering
const BGP_PRESET = {
  protocol: 'bgp',
  nodes: [
    { id: 1,  type: 'internet-gateway', label: 'Internet',     x: 400, y: 30,  cidr: '0.0.0.0/0' },
    { id: 2,  type: 'router',  label: 'ISP-A (AS 65001)',      x: 200, y: 140, cidr: '' },
    { id: 3,  type: 'router',  label: 'ISP-B (AS 65002)',      x: 600, y: 140, cidr: '' },
    { id: 4,  type: 'peering', label: 'IXP Peering',           x: 400, y: 140, cidr: '' },
    { id: 5,  type: 'router',  label: 'Corp-Edge (AS 65010)',  x: 400, y: 280, cidr: '' },
    { id: 6,  type: 'subnet',  label: 'Public-Net',            x: 200, y: 400, cidr: '203.0.113.0/24' },
    { id: 7,  type: 'subnet',  label: 'Private-Net',           x: 400, y: 400, cidr: '10.0.0.0/16' },
    { id: 8,  type: 'subnet',  label: 'ISP-B Customers',       x: 650, y: 300, cidr: '198.51.100.0/24' },
  ],
  links: [
    { id: 1, sourceId: 1, targetId: 2 },
    { id: 2, sourceId: 1, targetId: 3 },
    { id: 3, sourceId: 2, targetId: 4 },
    { id: 4, sourceId: 3, targetId: 4 },
    // Multi-homed: Corp has links to both ISPs
    { id: 5, sourceId: 2, targetId: 5 },
    { id: 6, sourceId: 3, targetId: 5 },
    { id: 7, sourceId: 5, targetId: 6 },
    { id: 8, sourceId: 5, targetId: 7 },
    { id: 9, sourceId: 3, targetId: 8 },
  ],
  routes: [
    // ISP-A
    { id: 1,  nodeId: 2, destinationCidr: '0.0.0.0/0',       targetNodeId: 1 },
    { id: 2,  nodeId: 2, destinationCidr: '203.0.113.0/24',   targetNodeId: 5 },
    { id: 3,  nodeId: 2, destinationCidr: '198.51.100.0/24',  targetNodeId: 4 },
    // ISP-B
    { id: 4,  nodeId: 3, destinationCidr: '0.0.0.0/0',       targetNodeId: 1 },
    { id: 5,  nodeId: 3, destinationCidr: '198.51.100.0/24',  targetNodeId: 8 },
    { id: 6,  nodeId: 3, destinationCidr: '203.0.113.0/24',   targetNodeId: 5 },
    // Corp-Edge — primary via ISP-A, backup via ISP-B
    { id: 7,  nodeId: 5, destinationCidr: '203.0.113.0/24',   targetNodeId: 6 },
    { id: 8,  nodeId: 5, destinationCidr: '10.0.0.0/16',      targetNodeId: 7 },
    { id: 9,  nodeId: 5, destinationCidr: '0.0.0.0/0',        targetNodeId: 2 },
  ],
  nextId: 9, nextLinkId: 10, nextRouteId: 10,
};

export const PROTOCOL_PRESETS = { rip: RIP_PRESET, 'eigrp-ospf': OSPF_PRESET, bgp: BGP_PRESET };

const DEFAULT_PRESET = RIP_PRESET;

const initialState = {
  ...DEFAULT_PRESET,
  packet: {
    sourceNodeId: null,
    destinationIp: '',
    path: [],
    currentStep: -1,
    status: 'idle',
    log: [],
  },
};

const simulatorSlice = createSlice({
  name: 'simulator',
  initialState,
  reducers: {
    addNode(state, action) {
      const { type, label, cidr } = action.payload;
      state.nodes.push({
        id: state.nextId,
        type,
        label: label || `${type}-${state.nextId}`,
        x: 200 + Math.random() * 300,
        y: 100 + Math.random() * 300,
        cidr: cidr || '',
      });
      state.nextId++;
    },
    removeNode(state, action) {
      const id = action.payload;
      state.nodes = state.nodes.filter(n => n.id !== id);
      state.links = state.links.filter(l => l.sourceId !== id && l.targetId !== id);
      state.routes = state.routes.filter(r => r.nodeId !== id && r.targetNodeId !== id);
    },
    moveNode(state, action) {
      const { id, x, y } = action.payload;
      const node = state.nodes.find(n => n.id === id);
      if (node) { node.x = x; node.y = y; }
    },
    addLink(state, action) {
      const { sourceId, targetId } = action.payload;
      if (sourceId === targetId) return;
      const exists = state.links.some(l =>
        (l.sourceId === sourceId && l.targetId === targetId) ||
        (l.sourceId === targetId && l.targetId === sourceId)
      );
      if (exists) return;
      state.links.push({ id: state.nextLinkId++, sourceId, targetId });
    },
    removeLink(state, action) {
      state.links = state.links.filter(l => l.id !== action.payload);
    },
    addRoute(state, action) {
      const { nodeId, destinationCidr, targetNodeId } = action.payload;
      state.routes.push({ id: state.nextRouteId++, nodeId, destinationCidr, targetNodeId });
    },
    removeRoute(state, action) {
      state.routes = state.routes.filter(r => r.id !== action.payload);
    },
    setPacketPath(state, action) {
      const { path, log, status } = action.payload;
      state.packet.path = path;
      state.packet.log = log;
      state.packet.status = status;
      state.packet.currentStep = 0;
    },
    advancePacket(state) {
      if (state.packet.currentStep < state.packet.path.length - 1) {
        state.packet.currentStep++;
      }
    },
    resetPacket(state) {
      state.packet = { ...initialState.packet };
    },
    startPacket(state, action) {
      const { sourceNodeId, destinationIp } = action.payload;
      state.packet.sourceNodeId = sourceNodeId;
      state.packet.destinationIp = destinationIp;
      state.packet.status = 'running';
      state.packet.currentStep = -1;
      state.packet.path = [];
      state.packet.log = [];
    },
    loadPreset(state) {
      return { ...initialState };
    },
    loadProtocol(state, action) {
      const preset = PROTOCOL_PRESETS[action.payload];
      if (!preset) return state;
      return {
        ...preset,
        packet: { sourceNodeId: null, destinationIp: '', path: [], currentStep: -1, status: 'idle', log: [] },
      };
    },
  },
});

export const {
  addNode, removeNode, moveNode,
  addLink, removeLink,
  addRoute, removeRoute,
  setPacketPath, advancePacket, resetPacket, startPacket,
  loadPreset, loadProtocol,
} = simulatorSlice.actions;

export default simulatorSlice.reducer;
