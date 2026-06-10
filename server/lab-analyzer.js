const path = require('path');

// ── Speech-to-text corrections (German transcript → English terms) ──────────
const STT_CORRECTIONS = {
  'wireschar': 'wireshark', 'wiresha': 'wireshark', 'wire shark': 'wireshark',
  'dcp': 'dhcp', 'der cp': 'dhcp', 'dezibel quest': 'dhcp request',
  'dcpi': 'tcp/ip', 'tcp heißt': 'tcp/ip',
  'pcb modell': 'tcp/ip model', 'osimodell': 'osi model', 'osi modell': 'osi model',
  'packagrace': 'packet tracer', 'package tracer': 'packet tracer',
  'paket racer': 'packet tracer', 'packet racer': 'packet tracer',
  'mecker-adresse': 'mac address', 'mac-adresse': 'mac address',
  'mac-adressen': 'mac addresses', 'ip-adresse': 'ip address',
  'ip-adressen': 'ip addresses', 'internet adressen': 'ip addresses',
  'mit ipa': 'with ip a', 'netzwerk': 'network', 'netzwerke': 'networks',
  'broadcast adresse': 'broadcast address', 'broadcast-adresse': 'broadcast address',
  'fritz!box': 'fritzbox router', 'fritzbox': 'fritzbox router',
  'subnetzmaske': 'subnet mask', 'subnetz': 'subnet', 'subnetze': 'subnets',
  'netzanteil': 'network portion', 'hostanteil': 'host portion',
  'netzadresse': 'network address', 'hostbits': 'host bits',
  'hosbits': 'host bits', 'hospiz': 'host bits', 'aus bits': 'host bits',
  'aus blitz': 'host bits', 'blockgröße': 'block size',
  'firewall': 'firewall', 'loadbalancer': 'load balancer',
  'notbalancer': 'load balancer', 'bastian-haus': 'bastion host',
  'bestienhaus': 'bastion host', 'reverse proxy': 'reverse proxy',
  'virtuelle maschine': 'virtual machine', 'virtuellen maschine': 'virtual machine',
  'öffentliche ip': 'public ip', 'public ip': 'public ip',
  'private ip': 'private ip', 'link local': 'link-local',
  'availability zone': 'availability zone', 'valability zons': 'availability zones',
  'willability sounds': 'availability zones',
  'brandschutzabschnitt': 'fire compartment / availability zone',
  'rechenzentrums': 'data center', 'rechenzentrum': 'data center',
  'ressourcengruppe': 'resource group', 'hetzner cloud': 'hetzner cloud',
  'sshire': 'ssh', 'ipcalc': 'ipcalc', 'ifconfig': 'ifconfig',
};

// ── Topic detectors — each returns a lab if the transcript mentions it ──────
const TOPIC_DETECTORS = [
  {
    id: 'subnet-calculation',
    patterns: [/subnet/i, /subnetz/i, /cidr/i, /\/2[4-8]/i, /\/2[0-2]/i, /netzmaske/i, /subnet\s*mask/i, /host\s*bits/i, /blockgröße/i, /block\s*size/i],
    minMatches: 2,
    build: (text) => ({
      title: 'Subnet Calculation',
      category: 'Networking',
      concept: 'Calculate network address, broadcast, and host range from CIDR notation',
      difficulty: 3,
      commands: ['ipcalc 192.168.10.0/26', 'ipcalc 10.0.0.0/20', 'ipcalc 172.16.0.70/26'],
      instructions: [
        'Given the network 192.168.10.0/26, calculate by hand: network address, broadcast, first host, last host, number of usable hosts',
        'Run: ipcalc 192.168.10.0/26',
        'Verify your calculation matches the output',
        'Formula: host bits = 32 - prefix, usable hosts = 2^(host bits) - 2',
        'Now try with /20: calculate 10.0.0.0/20 — how many usable hosts?',
        'Run: ipcalc 10.0.0.0/20',
        'Compare: /26 gives 62 hosts, /20 gives 4094 hosts',
      ],
      expectedOutput: '/26 → 62 usable hosts, network .0, broadcast .63\n/20 → 4094 usable hosts',
      explanation: 'The subnet mask determines how many bits are used for the network vs host portion. Subtract prefix from 32 to get host bits, then 2^(host bits) - 2 = usable hosts (minus network and broadcast addresses).',
    }),
  },
  {
    id: 'binary-conversion',
    patterns: [/binär/i, /binary/i, /2\s*hoch/i, /basis\s*2/i, /dezimal.*binär/i, /128.*64.*32/i, /nullen.*einsen/i],
    minMatches: 2,
    build: () => ({
      title: 'Binary to Decimal Conversion',
      category: 'Networking',
      concept: 'Convert between binary and decimal — essential for understanding IP addresses and subnet masks',
      difficulty: 1,
      commands: ['echo "obase=2;200" | bc', 'echo "ibase=2;11001000" | bc', 'python3 -c "print(bin(200), int(\'11001000\',2))"'],
      instructions: [
        'Convert 200 to binary by hand: does 128 fit? (yes→1) 200-128=72. Does 64 fit? (yes→1) 72-64=8. Does 32 fit? (no→0). Does 16 fit? (no→0). Does 8 fit? (yes→1). 4? (no→0). 2? (no→0). 1? (no→0). Result: 11001000',
        'Run: echo "obase=2;200" | bc',
        'Verify your answer matches',
        'Now convert binary 11000000 to decimal: 128+64 = 192',
        'Run: echo "ibase=2;11000000" | bc',
        'Practice: What is 255 in binary? What is 11111111 in decimal?',
      ],
      expectedOutput: '200 decimal = 11001000 binary\n255 decimal = 11111111 binary',
      explanation: 'Binary uses base 2. Each position represents a power of 2 (128, 64, 32, 16, 8, 4, 2, 1). An octet (8 bits) can represent values 0-255. Understanding binary is key to reading subnet masks.',
    }),
  },
  {
    id: 'ip-interface-inspection',
    patterns: [/\bip\s*a\b/i, /\bip\s*addr/i, /\bifconfig\b/i, /interface/i, /loopback/i, /netzwerk\s*interface/i],
    minMatches: 2,
    build: () => ({
      title: 'Network Interface Inspection',
      category: 'Networking',
      concept: 'View and understand network interfaces, IP addresses, and link state on a Linux machine',
      difficulty: 1,
      commands: ['ip a', 'ip addr show', 'ifconfig', 'ip link show'],
      instructions: [
        'Run: ip a',
        'Identify the loopback interface (lo) — what IP does it have?',
        'Find your main network interface (eth0, ens*, or enp*)',
        'Note the IPv4 address and its prefix length (e.g., /24)',
        'Note the MAC address (link/ether line)',
        'Run: ip link show — observe which interfaces are UP vs DOWN',
        'Run: ifconfig — compare the output format to ip a',
      ],
      expectedOutput: 'lo: 127.0.0.1/8 (loopback)\neth0: 10.0.0.4/24 with broadcast 10.0.0.255',
      explanation: 'Every Linux machine has at least a loopback interface (127.0.0.1). Physical or virtual interfaces get IP addresses from DHCP or static config. The prefix shows the subnet size.',
    }),
  },
  {
    id: 'routing-table',
    patterns: [/\bip\s*route\b/i, /routing/i, /\brouten\b/i, /default.*gateway/i, /vorrute/i, /vortroute/i, /gateway.*konfiguriert/i],
    minMatches: 1,
    build: () => ({
      title: 'Routing Table Analysis',
      category: 'Networking',
      concept: 'Inspect the routing table to understand how packets are forwarded to different networks',
      difficulty: 2,
      commands: ['ip route', 'ip route show', 'ip route get 8.8.8.8'],
      instructions: [
        'Run: ip route',
        'Find the default route — what is the gateway IP?',
        'Identify any directly connected networks (no "via" keyword)',
        'Run: ip route get 8.8.8.8 — which interface and gateway does it use?',
        'Look for link-local routes (169.254.0.0/16) — what are they for?',
        'Note: the default route is where all traffic goes if no specific route matches',
      ],
      expectedOutput: 'default via 10.0.0.1 dev eth0\n10.0.0.0/24 dev eth0 proto kernel',
      explanation: 'The routing table tells the kernel where to send packets. The default route (0.0.0.0/0) handles all traffic without a more specific match. Directly connected subnets appear as kernel routes.',
    }),
  },
  {
    id: 'broadcast-network-address',
    patterns: [/broadcast/i, /netzadresse/i, /network\s*address/i, /niedrigst.*adresse/i, /höchste.*adresse/i, /alle\s*host.*bits.*null/i, /alle\s*host.*bits.*eins/i],
    minMatches: 2,
    build: () => ({
      title: 'Network and Broadcast Addresses',
      category: 'Networking',
      concept: 'Understand the special role of network address (all host bits = 0) and broadcast address (all host bits = 1)',
      difficulty: 2,
      commands: ['ipcalc 192.168.10.0/24', 'ipcalc 192.168.10.0/26', 'ping -c 1 -b 192.168.10.255'],
      instructions: [
        'Run: ipcalc 192.168.10.0/24',
        'Identify: network address = .0, broadcast = .255',
        'Run: ipcalc 192.168.10.0/26',
        'Now the broadcast is .63 (not .255!) — why?',
        'Calculate: /26 means 6 host bits → block size = 64 → first block is .0-.63',
        'The network address has all host bits set to 0',
        'The broadcast address has all host bits set to 1',
        'Neither can be assigned to a device — that is why we subtract 2 from usable hosts',
      ],
      expectedOutput: '/24: network=.0, broadcast=.255, hosts=254\n/26: network=.0, broadcast=.63, hosts=62',
      explanation: 'Network address = lowest IP in a subnet (all host bits 0). Broadcast = highest IP (all host bits 1). These two are reserved and cannot be assigned to hosts, which is why usable hosts = 2^(host bits) - 2.',
    }),
  },
  {
    id: 'cloud-vm-setup',
    patterns: [/azure/i, /hetzner/i, /virtuelle.*maschine/i, /virtual.*machine/i, /vm.*anlegen/i, /subscription/i, /ressourcengruppe/i, /resource\s*group/i],
    minMatches: 2,
    build: () => ({
      title: 'Cloud VM Setup Basics',
      category: 'Cloud',
      concept: 'Understand the steps to create a virtual machine in a cloud environment (Azure/Hetzner)',
      difficulty: 2,
      commands: ['ssh user@<public-ip>', 'sudo apt update && sudo apt upgrade -y', 'sudo reboot', 'id'],
      instructions: [
        'When creating a cloud VM, you need: a subscription, a resource group, and a virtual network',
        'After creation, note the public IP address assigned to the VM',
        'Connect via SSH: ssh user@<public-ip>',
        'Check your user groups: id (look for group 27 = sudo)',
        'First thing on any new VM: sudo apt update && sudo apt upgrade -y',
        'If libc gets updated, reboot the machine: sudo reboot',
        'Reconnect and verify the system is up to date',
      ],
      expectedOutput: 'uid=1000(azureuser) gid=1000(azureuser) groups=...,27(sudo)',
      explanation: 'Cloud VMs are accessed via SSH using the public IP. Always update packages first. Security groups control inbound/outbound traffic (port 22 for SSH must be open). The VM costs money while running.',
    }),
  },
  {
    id: 'cloud-networking',
    patterns: [/virtuell.*netzwerk/i, /virtual.*network/i, /security.*group/i, /inbound/i, /public.*ip/i, /öffentliche.*ip/i, /load\s*balancer/i, /bastion/i, /reverse.*proxy/i, /availability.*zone/i],
    minMatches: 3,
    build: () => ({
      title: 'Cloud Networking Concepts',
      category: 'Cloud',
      concept: 'Virtual networks, security groups, load balancers, and bastion hosts in cloud environments',
      difficulty: 3,
      commands: ['ip a', 'ip route', 'ping -c 4 8.8.8.8', 'tracepath -m 15 8.8.8.8'],
      instructions: [
        'On a cloud VM, run: ip a — observe the private IP (e.g., 10.0.0.4)',
        'Run: ip route — find the default gateway for the virtual network',
        'The VM has a private IP internally but a public IP for external access',
        'Security groups act as a firewall: inbound rules control what traffic reaches the VM',
        'A bastion host is a gateway that accepts all incoming connections and forwards them securely inside',
        'A load balancer distributes traffic across multiple VMs for high availability',
        'Availability zones are separate fire compartments in a data center with independent power and cooling',
        'Draw a diagram: Internet → Load Balancer → Bastion Host → Internal VMs',
      ],
      expectedOutput: 'Private IP from virtual network, default route via cloud gateway',
      explanation: 'Cloud providers create virtual networks with private IPs. Public IPs are mapped via NAT. Never expose a web server directly — use a reverse proxy, load balancer, or bastion host in front.',
    }),
  },
  {
    id: 'link-local-addresses',
    patterns: [/link.?local/i, /169\.254/i, /apipa/i, /keine.*ip.*adresse/i, /wenn.*keine.*adresse/i],
    minMatches: 1,
    build: () => ({
      title: 'Link-Local Addresses (169.254.x.x)',
      category: 'Networking',
      concept: 'Understand link-local addressing — automatic IPs assigned when DHCP is unavailable',
      difficulty: 1,
      commands: ['ip a', 'ip route'],
      instructions: [
        'Run: ip a — look for any 169.254.x.x addresses',
        'Run: ip route — check if there is a link-local route',
        'Link-local addresses (169.254.0.0/16) are automatically assigned when no DHCP server responds',
        'They only work for communication on the same local network segment',
        'They cannot be routed to the internet',
        'Question: If your machine gets a 169.254.x.x address, what is likely wrong?',
      ],
      expectedOutput: 'Link-local route in routing table; possibly a 169.254.x.x address on an interface',
      explanation: 'Link-local (APIPA) addresses are a fallback when DHCP fails. If you see 169.254.x.x on your interface, it means the device could not reach a DHCP server. Fix the DHCP configuration or assign a static IP.',
    }),
  },
  {
    id: 'sudo-user-management',
    patterns: [/sudo/i, /\bid\b.*grupp/i, /\bid\b.*group/i, /root.*anmeld/i, /user.*recht/i, /sudo.*recht/i],
    minMatches: 2,
    build: () => ({
      title: 'User Permissions and Sudo',
      category: 'Linux',
      concept: 'Check user groups and sudo permissions on a Linux system',
      difficulty: 1,
      commands: ['id', 'groups', 'sudo whoami', 'cat /etc/group | grep sudo'],
      instructions: [
        'Run: id — note your uid, gid, and group memberships',
        'Look for group 27 (sudo) — this means you can use sudo',
        'Run: groups — shorter output of your group memberships',
        'Run: sudo whoami — should print "root" if you have sudo rights',
        'Run: cat /etc/group | grep sudo — see which users are in the sudo group',
        'Note: on cloud VMs you typically log in as a regular user with sudo, not as root directly',
      ],
      expectedOutput: 'uid=1000(user) gid=1000(user) groups=...,27(sudo)\nroot',
      explanation: 'The sudo group (group 27 on Debian/Ubuntu) grants a user permission to execute commands as root. Always use sudo instead of logging in as root directly — it provides an audit trail and limits damage from mistakes.',
    }),
  },
  {
    id: 'system-update',
    patterns: [/apt\s*update/i, /apt\s*upgrade/i, /reboot/i, /neue.*vm/i, /neue.*maschine/i, /neuesten.*stand/i, /libc.*update/i, /lipse.*abge/i],
    minMatches: 2,
    build: () => ({
      title: 'System Update Workflow',
      category: 'Linux',
      concept: 'Update and upgrade packages on a new or existing Linux system',
      difficulty: 1,
      commands: ['sudo apt update', 'sudo apt upgrade -y', 'sudo reboot'],
      instructions: [
        'First thing on any new VM: sudo apt update (refresh package lists)',
        'Then: sudo apt upgrade -y (install all available updates)',
        'Watch the output — note which packages get updated (ssh, libc, etc.)',
        'If libc (the C library) is updated, you MUST reboot: sudo reboot',
        'Why? Because libc is used by almost every process — a reboot ensures all processes use the new version',
        'After reboot, reconnect via SSH and verify: apt list --upgradable',
      ],
      expectedOutput: 'Reading package lists... Done\n0 upgraded, 0 newly installed after reboot',
      explanation: 'Package updates fix security vulnerabilities and bugs. Always update a new VM immediately. A reboot is required when core libraries (libc) or the kernel are updated, since running processes still use the old version in memory.',
    }),
  },
  {
    id: 'ssh-config',
    patterns: [/ssh/i, /sshd/i, /konfigurationsdatei/i, /port\s*22/i, /ssh.*konfigur/i, /ssh.*version/i],
    minMatches: 2,
    build: () => ({
      title: 'SSH Configuration',
      category: 'Security',
      concept: 'Understand SSH server configuration and how to handle config file changes during updates',
      difficulty: 2,
      commands: ['ssh user@host', 'cat /etc/ssh/sshd_config', 'sudo systemctl status sshd'],
      instructions: [
        'Connect to a remote machine: ssh user@<ip-address>',
        'View the SSH server configuration: cat /etc/ssh/sshd_config',
        'Check SSH service status: sudo systemctl status sshd',
        'During updates, you may see a dialog asking about config differences',
        'Options: keep local version (recommended if cloud-configured), install new version, or view the diff',
        'Key settings to know: Port, PermitRootLogin, PasswordAuthentication, ClientAliveInterval',
      ],
      expectedOutput: 'Active: active (running) for sshd.service',
      explanation: 'SSH is the standard way to access remote Linux servers securely. When packages update, new config versions may conflict with local changes. On cloud VMs, keep the local version since it is tuned for the cloud environment.',
    }),
  },
  {
    id: 'ping-tracepath',
    patterns: [/\bping\b/i, /traceroute/i, /tracepath/i, /\bhops\b/i, /anpink/i, /verlust/i, /packet\s*loss/i],
    minMatches: 2,
    build: () => ({
      title: 'Ping and Tracepath',
      category: 'Networking',
      concept: 'Test connectivity with ping and trace the network path with tracepath',
      difficulty: 1,
      commands: ['ping -c 4 8.8.8.8', 'ping -c 4 google.com', 'tracepath -m 15 8.8.8.8'],
      instructions: [
        'Run: ping -c 4 8.8.8.8 — sends 4 ICMP echo requests to Google DNS',
        'Check: packets transmitted, received, and packet loss percentage',
        'Note the round-trip time (min/avg/max)',
        'Run: tracepath -m 15 8.8.8.8 — trace the path packets take',
        'Count the hops — more hops generally means more latency',
        'Look for high latency hops or "no reply" entries',
        'Compare: ping a local host vs a remote host — notice the RTT difference',
      ],
      expectedOutput: '4 packets transmitted, 4 received, 0% loss, avg ~20ms\nTracepath shows 5-15 hops depending on location',
      explanation: 'Ping tests basic connectivity using ICMP. Tracepath shows every router (hop) between you and the destination. High packet loss or no reply at a hop indicates a network issue at that point.',
    }),
  },
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

function cleanTranscript(text) {
  return text
    .split('\n')
    .filter(l => !l.trim().startsWith('*** ALERT'))
    .filter(l => !l.trim().startsWith('--- Caption'))
    .filter(l => !l.trim().startsWith('--- Meeting'))
    .join('\n');
}

function applySTTCorrections(text) {
  let corrected = text.toLowerCase();
  for (const [wrong, right] of Object.entries(STT_CORRECTIONS)) {
    corrected = corrected.replace(new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), right);
  }
  return corrected;
}

function stripSpeakerName(text) {
  // Remove "Stefan Koehler: " or any "Name: " prefix
  return text.replace(/^\s*[A-Za-zÄÖÜäöüß]+\s+[A-Za-zÄÖÜäöüß]+:\s*/gm, '');
}

function extractTimeTopics(text) {
  // Extract [HH:MM] timestamps and the text blocks between them
  const blocks = [];
  const regex = /\[(\d{2}:\d{2})\]\n([\s\S]*?)(?=\n\[\d{2}:\d{2}\]|$)/g;
  let m;
  while ((m = regex.exec(text)) !== null) {
    blocks.push({ time: m[1], text: m[2].trim() });
  }
  return blocks;
}

// ── Day Summary ──────────────────────────────────────────────────────────────

function generateDaySummary(text, detectedLabs) {
  const topics = detectedLabs.map(l => l.title);
  const categories = [...new Set(detectedLabs.map(l => l.category))];
  const timeBlocks = extractTimeTopics(text);
  const startTime = timeBlocks.length > 0 ? timeBlocks[0].time : 'N/A';
  const endTime = timeBlocks.length > 0 ? timeBlocks[timeBlocks.length - 1].time : 'N/A';

  return {
    date: new Date().toISOString().split('T')[0],
    timeRange: `${startTime} - ${endTime}`,
    categories,
    topicsCovered: topics,
    labCount: detectedLabs.length,
    difficultyRange: detectedLabs.length > 0
      ? `Level ${Math.min(...detectedLabs.map(l => l.difficulty))} - ${Math.max(...detectedLabs.map(l => l.difficulty))}`
      : 'N/A',
  };
}

// ── Main analysis ────────────────────────────────────────────────────────────

function analyzeTranscript(text, sourceId) {
  const cleaned = cleanTranscript(text);
  const stripped = stripSpeakerName(cleaned);
  const normalized = applySTTCorrections(stripped);

  const labs = [];

  for (const detector of TOPIC_DETECTORS) {
    // Count how many patterns match
    let matchCount = 0;
    for (const pattern of detector.patterns) {
      if (pattern.test(normalized)) matchCount++;
    }

    if (matchCount >= detector.minMatches) {
      const lab = detector.build(normalized);
      labs.push({
        id: slugify(lab.title),
        title: lab.title,
        category: lab.category,
        concept: lab.concept,
        difficulty: lab.difficulty,
        description: lab.explanation,
        instructions: lab.instructions,
        commands: lab.commands,
        expectedOutput: lab.expectedOutput || '',
        explanation: lab.explanation,
        sourceTranscript: sourceId,
      });
    }
  }

  // Attach summary
  const summary = generateDaySummary(text, labs);

  return { summary, labs };
}

module.exports = { analyzeTranscript };
