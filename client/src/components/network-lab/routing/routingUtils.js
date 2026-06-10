import { ipToInt, prefixToMask, isValidIp } from '../networkUtils.js';

export function parseCidr(cidr) {
  const parts = cidr.split('/');
  if (parts.length !== 2) return null;
  const ip = parts[0];
  const prefix = parseInt(parts[1], 10);
  if (!isValidIp(ip) || isNaN(prefix) || prefix < 0 || prefix > 32) return null;
  const mask = prefixToMask(prefix);
  return { networkInt: ipToInt(ip) & mask, prefix, mask };
}

export function ipMatchesCidr(ip, cidr) {
  const parsed = parseCidr(cidr);
  if (!parsed) return false;
  const ipInt = ipToInt(ip);
  return (ipInt & parsed.mask) === parsed.networkInt;
}

export function longestPrefixMatch(destinationIp, routes) {
  let bestRoute = null;
  let bestPrefix = -1;

  for (const route of routes) {
    const parsed = parseCidr(route.destinationCidr);
    if (!parsed) continue;
    if (ipMatchesCidr(destinationIp, route.destinationCidr)) {
      if (parsed.prefix > bestPrefix) {
        bestPrefix = parsed.prefix;
        bestRoute = route;
      }
    }
  }
  return bestRoute;
}

export function computePacketPath(sourceNodeId, destinationIp, nodes, links, routes) {
  const path = [];
  const log = [];
  const visited = new Set();

  let currentId = sourceNodeId;
  const maxHops = 20;

  for (let hop = 0; hop < maxHops; hop++) {
    if (visited.has(currentId)) {
      log.push(`Loop detected at node ${getLabel(currentId, nodes)} — packet dropped`);
      return { path, log, success: false };
    }
    visited.add(currentId);
    path.push(currentId);

    const node = nodes.find(n => n.id === currentId);
    if (!node) {
      log.push(`Node ${currentId} not found — packet dropped`);
      return { path, log, success: false };
    }

    log.push(`Packet at ${node.label} (${node.type})`);

    // Check if destination is in this subnet
    if (node.type === 'subnet' && node.cidr && ipMatchesCidr(destinationIp, node.cidr)) {
      log.push(`Destination ${destinationIp} is in ${node.label} (${node.cidr}) — delivered!`);
      return { path, log, success: true };
    }

    // Internet gateway = exit point
    if (node.type === 'internet-gateway') {
      log.push(`Packet forwarded to Internet via ${node.label}`);
      return { path, log, success: true };
    }

    // For routers: look up route table
    if (node.type === 'router') {
      const nodeRoutes = routes.filter(r => r.nodeId === currentId);
      const matched = longestPrefixMatch(destinationIp, nodeRoutes);

      if (!matched) {
        log.push(`No matching route for ${destinationIp} at ${node.label} — packet dropped`);
        return { path, log, success: false };
      }

      const targetNode = nodes.find(n => n.id === matched.targetNodeId);
      log.push(`Matched route: ${matched.destinationCidr} → ${targetNode?.label || matched.targetNodeId} (longest prefix match)`);

      // Check link exists
      const linkExists = links.some(l =>
        (l.sourceId === currentId && l.targetId === matched.targetNodeId) ||
        (l.sourceId === matched.targetNodeId && l.targetId === currentId)
      );
      if (!linkExists) {
        log.push(`No link between ${node.label} and ${targetNode?.label} — packet dropped`);
        return { path, log, success: false };
      }

      log.push(`Forwarding to ${targetNode?.label}...`);
      currentId = matched.targetNodeId;
      continue;
    }

    // For subnets that don't contain the destination: find connected router
    if (node.type === 'subnet') {
      const connectedLinks = links.filter(l => l.sourceId === currentId || l.targetId === currentId);
      const routerLink = connectedLinks.find(l => {
        const otherId = l.sourceId === currentId ? l.targetId : l.sourceId;
        const other = nodes.find(n => n.id === otherId);
        return other && other.type === 'router';
      });

      if (!routerLink) {
        log.push(`No router connected to ${node.label} — packet dropped`);
        return { path, log, success: false };
      }

      const routerId = routerLink.sourceId === currentId ? routerLink.targetId : routerLink.sourceId;
      const router = nodes.find(n => n.id === routerId);
      log.push(`Forwarding to default gateway ${router?.label}...`);
      currentId = routerId;
      continue;
    }

    // Peering or unknown: try connected router
    const connectedLinks = links.filter(l => l.sourceId === currentId || l.targetId === currentId);
    if (connectedLinks.length > 0) {
      const nextId = connectedLinks[0].sourceId === currentId ? connectedLinks[0].targetId : connectedLinks[0].sourceId;
      log.push(`Forwarding via peering to next hop...`);
      currentId = nextId;
    } else {
      log.push(`Dead end at ${node.label} — packet dropped`);
      return { path, log, success: false };
    }
  }

  log.push('Maximum hop count exceeded — packet dropped');
  return { path, log, success: false };
}

function getLabel(id, nodes) {
  const node = nodes.find(n => n.id === id);
  return node ? node.label : `#${id}`;
}

export function isValidCidr(cidr) {
  return parseCidr(cidr) !== null;
}
