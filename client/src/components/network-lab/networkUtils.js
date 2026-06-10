// Network utility functions — pure simulation, no real network commands

export function ipToInt(ip) {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0;
}

export function intToIp(num) {
  return [
    (num >>> 24) & 255,
    (num >>> 16) & 255,
    (num >>> 8) & 255,
    num & 255,
  ].join('.');
}

export function prefixToMask(prefix) {
  if (prefix === 0) return 0;
  return (0xFFFFFFFF << (32 - prefix)) >>> 0;
}

export function maskToPrefix(mask) {
  let bits = 0;
  let m = mask;
  while (m & 0x80000000) {
    bits++;
    m = (m << 1) >>> 0;
  }
  return bits;
}

export function calculateSubnet(networkIp, prefix) {
  const mask = prefixToMask(prefix);
  const netInt = ipToInt(networkIp) & mask;
  const broadcast = (netInt | ~mask) >>> 0;
  const firstHost = netInt + 1;
  const lastHost = broadcast - 1;
  const totalHosts = broadcast - netInt - 1;

  return {
    networkAddress: intToIp(netInt),
    subnetMask: intToIp(mask),
    firstHost: intToIp(firstHost),
    lastHost: intToIp(lastHost),
    broadcast: intToIp(broadcast),
    totalHosts: Math.max(totalHosts, 0),
    prefix,
  };
}

const DEVICE_TYPES = ['Laptop', 'Phone', 'Smart TV', 'Printer', 'Tablet'];

export function generateDevices(networkIp, prefix, gateway, aptCount, devicesPerApt = 1) {
  const subnet = calculateSubnet(networkIp, prefix);
  const gatewayInt = ipToInt(gateway);
  const firstInt = ipToInt(subnet.firstHost);
  const lastInt = ipToInt(subnet.lastHost);
  const devices = [];
  let currentIp = firstInt;
  let globalId = 0;

  for (let apt = 1; apt <= aptCount; apt++) {
    for (let d = 0; d < devicesPerApt; d++) {
      if (currentIp === gatewayInt) currentIp++;
      if (currentIp > lastInt) return devices;

      const typeName = DEVICE_TYPES[d] || `Device-${d + 1}`;
      devices.push({
        id: ++globalId,
        apartmentNumber: apt,
        deviceType: typeName,
        deviceName: devicesPerApt > 1 ? `Apt-${apt} ${typeName}` : `Apt-${apt}`,
        ipAddress: intToIp(currentIp),
        macAddress: generateMac(globalId - 1),
      });
      currentIp++;
    }
  }
  return devices;
}

function generateMac(index) {
  const hex = (n) => n.toString(16).padStart(2, '0').toUpperCase();
  return `AA:BB:CC:00:${hex(Math.floor(index / 256))}:${hex(index % 256)}`;
}

export function isInSameSubnet(ip1, ip2, prefix) {
  const mask = prefixToMask(prefix);
  return (ipToInt(ip1) & mask) === (ipToInt(ip2) & mask);
}

export function isValidIp(ip) {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every(p => {
    const n = parseInt(p);
    return !isNaN(n) && n >= 0 && n <= 255 && String(n) === p;
  });
}

export function simulatePing(sourceIp, destIp, gateway, prefix, devices) {
  const steps = [];
  const allIps = [gateway, ...devices.map(d => d.ipAddress)];
  const sourceExists = allIps.includes(sourceIp);
  const destExists = allIps.includes(destIp);

  if (!sourceExists) {
    return { success: false, steps: [{ type: 'error', message: `Source ${sourceIp} not found in network` }] };
  }
  if (!destExists) {
    return { success: false, steps: [{ type: 'error', message: `Destination ${destIp} not reachable — host unknown` }] };
  }
  if (sourceIp === destIp) {
    return { success: true, steps: [{ type: 'info', message: `Ping to self (loopback) — 0.01ms` }] };
  }

  const sameSubnet = isInSameSubnet(sourceIp, destIp, prefix);

  if (sameSubnet) {
    steps.push({ type: 'send', from: sourceIp, to: destIp, message: `ARP: Who has ${destIp}? Tell ${sourceIp}` });
    steps.push({ type: 'reply', from: destIp, to: sourceIp, message: `ARP Reply: ${destIp} is at ${devices.find(d => d.ipAddress === destIp)?.macAddress || 'FF:FF:FF:FF:FF:FF'}` });
    steps.push({ type: 'send', from: sourceIp, to: destIp, message: `ICMP Echo Request → ${destIp}` });
    steps.push({ type: 'reply', from: destIp, to: sourceIp, message: `ICMP Echo Reply ← ${destIp} (1.2ms)` });
    steps.push({ type: 'success', message: `Reply from ${destIp}: bytes=64 time=1.2ms TTL=64` });
  } else {
    steps.push({ type: 'send', from: sourceIp, to: gateway, message: `Different subnet — forwarding to gateway ${gateway}` });
    steps.push({ type: 'route', from: gateway, to: destIp, message: `Gateway routing packet to ${destIp}` });
    steps.push({ type: 'send', from: gateway, to: destIp, message: `ICMP Echo Request → ${destIp} (via gateway)` });
    steps.push({ type: 'reply', from: destIp, to: gateway, message: `ICMP Echo Reply ← ${destIp}` });
    steps.push({ type: 'reply', from: gateway, to: sourceIp, message: `Forwarding reply back to ${sourceIp}` });
    steps.push({ type: 'success', message: `Reply from ${destIp}: bytes=64 time=3.8ms TTL=63` });
  }

  return { success: true, steps };
}

export function ipToBinary(ip) {
  return ip.split('.').map(o => parseInt(o).toString(2).padStart(8, '0'));
}

export function binaryToIp(binStr) {
  const clean = binStr.replace(/[^01]/g, '');
  if (clean.length !== 32) return null;
  return [
    parseInt(clean.slice(0, 8), 2),
    parseInt(clean.slice(8, 16), 2),
    parseInt(clean.slice(16, 24), 2),
    parseInt(clean.slice(24, 32), 2),
  ].join('.');
}

export function maskToBinary(prefix) {
  return '1'.repeat(prefix) + '0'.repeat(32 - prefix);
}

export function getNetworkHostParts(ip, prefix) {
  const bits = ipToBinary(ip).join('');
  return {
    networkBits: bits.slice(0, prefix),
    hostBits: bits.slice(prefix),
  };
}

export const PRIVATE_RANGES = [
  { range: '10.0.0.0/8', from: '10.0.0.0', to: '10.255.255.255', classLabel: 'Class A', hosts: '16,777,214', description: 'Large networks (cloud, enterprise)' },
  { range: '172.16.0.0/12', from: '172.16.0.0', to: '172.31.255.255', classLabel: 'Class B', hosts: '1,048,574', description: 'Medium networks' },
  { range: '192.168.0.0/16', from: '192.168.0.0', to: '192.168.255.255', classLabel: 'Class C', hosts: '65,534', description: 'Home/small office (Fritzbox, etc.)' },
];

export const SPECIAL_ADDRESSES = [
  { address: '127.0.0.1', name: 'Loopback', description: 'Local machine only, never routed externally' },
  { address: '0.0.0.0', name: 'Default Route', description: 'Matches any address (used in routing tables)' },
  { address: '255.255.255.255', name: 'Limited Broadcast', description: 'Broadcast to all hosts on local network' },
];

export const COMMON_PREFIXES = [
  { prefix: 24, label: '/24 — 254 hosts', mask: '255.255.255.0' },
  { prefix: 25, label: '/25 — 126 hosts', mask: '255.255.255.128' },
  { prefix: 26, label: '/26 — 62 hosts', mask: '255.255.255.192' },
  { prefix: 27, label: '/27 — 30 hosts', mask: '255.255.255.224' },
  { prefix: 28, label: '/28 — 14 hosts', mask: '255.255.255.240' },
  { prefix: 16, label: '/16 — 65534 hosts', mask: '255.255.0.0' },
];
