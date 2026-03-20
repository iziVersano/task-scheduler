const path = require('path');

// ── Known commands and their metadata ────────────────────────────────────────
const COMMAND_DB = [
  // Networking
  { cmd: 'ping', category: 'Networking', concept: 'ICMP connectivity testing', usage: ['ping google.com', 'ping -c 4 google.com'] },
  { cmd: 'traceroute', category: 'Networking', concept: 'Network path tracing', usage: ['traceroute google.com'] },
  { cmd: 'tracepath', category: 'Networking', concept: 'Network path tracing', usage: ['tracepath google.com'] },
  { cmd: 'dig', category: 'Networking', concept: 'DNS lookup', usage: ['dig google.com', 'dig google.com MX'] },
  { cmd: 'nslookup', category: 'Networking', concept: 'DNS query', usage: ['nslookup google.com'] },
  { cmd: 'ip a', category: 'Networking', concept: 'Network interface configuration', usage: ['ip a', 'ip addr show'] },
  { cmd: 'ip route', category: 'Networking', concept: 'Routing table inspection', usage: ['ip route', 'ip route show'] },
  { cmd: 'ifconfig', category: 'Networking', concept: 'Network interface configuration (legacy)', usage: ['ifconfig'] },
  { cmd: 'arp', category: 'Networking', concept: 'ARP table inspection', usage: ['arp -a', 'arp -n'] },
  { cmd: 'netstat', category: 'Networking', concept: 'Network connections and ports', usage: ['netstat -tulpn', 'netstat -an'] },
  { cmd: 'ss', category: 'Networking', concept: 'Socket statistics', usage: ['ss -tulpn', 'ss -an'] },
  { cmd: 'curl', category: 'Networking', concept: 'HTTP requests from terminal', usage: ['curl https://example.com', 'curl -I https://example.com'] },
  { cmd: 'wget', category: 'Networking', concept: 'File download from web', usage: ['wget https://example.com/file'] },
  { cmd: 'dhclient', category: 'Networking', concept: 'DHCP client - request IP address', usage: ['dhclient -r', 'dhclient'] },
  { cmd: 'tcpdump', category: 'Networking', concept: 'Packet capture and analysis', usage: ['tcpdump -i eth0', 'tcpdump -i any port 80'] },
  { cmd: 'nmap', category: 'Security', concept: 'Network scanning and discovery', usage: ['nmap -sP 192.168.1.0/24', 'nmap -sV localhost'] },
  { cmd: 'ssh', category: 'Security', concept: 'Secure remote shell access', usage: ['ssh user@host'] },
  { cmd: 'scp', category: 'Security', concept: 'Secure file copy', usage: ['scp file.txt user@host:/path/'] },

  // Linux
  { cmd: 'ls', category: 'Linux', concept: 'List directory contents', usage: ['ls -la', 'ls -lh'] },
  { cmd: 'cd', category: 'Linux', concept: 'Change directory', usage: ['cd /path/to/dir'] },
  { cmd: 'cat', category: 'Linux', concept: 'Display file contents', usage: ['cat /etc/hosts'] },
  { cmd: 'grep', category: 'Linux', concept: 'Text pattern search', usage: ['grep pattern file', 'grep -r pattern /path/'] },
  { cmd: 'find', category: 'Linux', concept: 'File search', usage: ['find / -name "*.conf"', 'find . -type f'] },
  { cmd: 'chmod', category: 'Linux', concept: 'File permissions', usage: ['chmod 755 file', 'chmod +x script.sh'] },
  { cmd: 'chown', category: 'Linux', concept: 'File ownership', usage: ['chown user:group file'] },
  { cmd: 'systemctl', category: 'Linux', concept: 'Service management', usage: ['systemctl status nginx', 'systemctl restart sshd'] },
  { cmd: 'ps', category: 'Linux', concept: 'Process listing', usage: ['ps aux', 'ps -ef'] },
  { cmd: 'top', category: 'Linux', concept: 'System resource monitor', usage: ['top'] },
  { cmd: 'htop', category: 'Linux', concept: 'Interactive process viewer', usage: ['htop'] },
  { cmd: 'nano', category: 'Linux', concept: 'Terminal text editor', usage: ['nano /etc/hosts'] },
  { cmd: 'vim', category: 'Linux', concept: 'Advanced text editor', usage: ['vim file.txt'] },
  { cmd: 'apt', category: 'Linux', concept: 'Package management', usage: ['apt update', 'apt install package'] },
  { cmd: 'dpkg', category: 'Linux', concept: 'Debian package manager', usage: ['dpkg -l', 'dpkg -i package.deb'] },
  { cmd: 'ufw', category: 'Security', concept: 'Firewall configuration', usage: ['ufw status', 'ufw allow 22'] },
  { cmd: 'iptables', category: 'Security', concept: 'Firewall rules', usage: ['iptables -L', 'iptables -A INPUT -p tcp --dport 80 -j ACCEPT'] },

  // Scripting
  { cmd: 'bash', category: 'Scripting', concept: 'Bash shell scripting', usage: ['bash script.sh'] },
  { cmd: 'python', category: 'Scripting', concept: 'Python scripting', usage: ['python3 script.py'] },
  { cmd: 'cron', category: 'Scripting', concept: 'Task scheduling', usage: ['crontab -e', 'crontab -l'] },
];

// ── Speech-to-text fuzzy corrections ─────────────────────────────────────────
const STT_CORRECTIONS = {
  'wireschar': 'wireshark',
  'wiresha': 'wireshark',
  'wire shark': 'wireshark',
  'dcp': 'dhcp',
  'der cp': 'dhcp',
  'dezibel quest': 'dhcp request',
  'dcpi': 'tcp/ip',
  'tcp heißt': 'tcp/ip',
  'pcb modell': 'tcp/ip model',
  'osimodell': 'osi model',
  'osi modell': 'osi model',
  'u7 modell': 'osi model',
  'packagrace': 'packet tracer',
  'package tracer': 'packet tracer',
  'paket racer': 'packet tracer',
  'packet racer': 'packet tracer',
  'mecker-adresse': 'mac address',
  'mac-adresse': 'mac address',
  'mac-adressen': 'mac addresses',
  'ip-adresse': 'ip address',
  'ip-adressen': 'ip addresses',
  'internet adressen': 'ip addresses',
  'mit ipa': 'with ip a',
  'netzwerk': 'network',
  'broadcast adresse': 'broadcast address',
  'fritz!box': 'fritzbox router',
  'fritzbox': 'fritzbox router',
};

// ── Concept keywords for topic detection ─────────────────────────────────────
const CONCEPT_KEYWORDS = {
  Networking: [
    'osi', 'tcp/ip', 'tcp', 'udp', 'ip', 'dhcp', 'dns', 'arp', 'icmp',
    'mac address', 'ip address', 'subnet', 'broadcast', 'gateway', 'router',
    'switch', 'firewall', 'port', 'packet', 'frame', 'layer', 'protocol',
    'network', 'ethernet', 'wifi', 'wlan', 'bandwidth', 'latency',
    'wireshark', 'traceroute', 'ping', 'nslookup', 'dig',
  ],
  Linux: [
    'terminal', 'shell', 'bash', 'command line', 'cli', 'directory',
    'file system', 'permissions', 'process', 'service', 'daemon',
    'package', 'kernel', 'systemd', 'cron',
  ],
  Security: [
    'firewall', 'encryption', 'ssl', 'tls', 'ssh', 'authentication',
    'vulnerability', 'scan', 'nmap', 'penetration', 'exploit',
    'password', 'hash', 'certificate',
  ],
  Cloud: [
    'aws', 'azure', 'gcp', 'docker', 'container', 'kubernetes',
    'cloud', 'virtual', 'vm', 'instance', 'deployment',
  ],
  Scripting: [
    'script', 'automation', 'bash script', 'python', 'cron job',
    'loop', 'variable', 'function', 'regex',
  ],
};

// ── Tool/application names ───────────────────────────────────────────────────
const TOOL_NAMES = [
  'wireshark', 'packet tracer', 'cisco', 'nmap', 'tcpdump',
  'putty', 'virtualbox', 'vmware', 'docker', 'git',
];

// ── Helpers ──────────────────────────────────────────────────────────────────
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function isCommandSafe(cmd) {
  return /^[a-zA-Z0-9.\-\s\/:_=]+$/.test(cmd);
}

function cleanTranscript(text) {
  // Remove ALERT duplicate lines
  const lines = text.split('\n').filter(l => !l.trim().startsWith('*** ALERT'));
  return lines.join('\n');
}

function applySTTCorrections(text) {
  let corrected = text.toLowerCase();
  for (const [wrong, right] of Object.entries(STT_CORRECTIONS)) {
    corrected = corrected.replace(new RegExp(wrong.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), right);
  }
  return corrected;
}

// ── PASS 1: Context Extraction ───────────────────────────────────────────────
function extractContext(text) {
  const normalizedText = applySTTCorrections(text);

  // Detect commands mentioned
  const detectedCommands = [];
  for (const entry of COMMAND_DB) {
    // Match command name as a word boundary
    const pattern = new RegExp(`\\b${entry.cmd.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (pattern.test(normalizedText)) {
      detectedCommands.push(entry);
    }
  }

  // Detect tools
  const detectedTools = TOOL_NAMES.filter(tool => {
    const pattern = new RegExp(`\\b${tool.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    return pattern.test(normalizedText);
  });

  // Score categories by keyword density
  const categoryScores = {};
  for (const [category, keywords] of Object.entries(CONCEPT_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      const matches = normalizedText.match(new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi'));
      if (matches) score += matches.length;
    }
    categoryScores[category] = score;
  }

  // Primary category = highest scoring
  const primaryCategory = Object.entries(categoryScores)
    .sort((a, b) => b[1] - a[1])
    .filter(([, score]) => score > 0)
    .map(([cat]) => cat)[0] || 'Networking';

  // Detect concepts mentioned
  const detectedConcepts = [];
  const conceptPatterns = [
    { pattern: /\bping\b|\bicmp\b/i, concept: 'ICMP connectivity testing' },
    { pattern: /\bdhcp\b/i, concept: 'DHCP - Dynamic Host Configuration Protocol' },
    { pattern: /\bdns\b/i, concept: 'DNS - Domain Name System' },
    { pattern: /\barp\b/i, concept: 'ARP - Address Resolution Protocol' },
    { pattern: /\bosi\s*model/i, concept: 'OSI Model - 7 Layer Network Model' },
    { pattern: /\btcp\/ip/i, concept: 'TCP/IP Model' },
    { pattern: /\bbroadcast\b/i, concept: 'Network Broadcasting' },
    { pattern: /\bsubnet/i, concept: 'Subnetting' },
    { pattern: /\bgateway\b/i, concept: 'Network Gateway' },
    { pattern: /\bfirewall\b/i, concept: 'Firewall' },
    { pattern: /\bmac\s*address/i, concept: 'MAC Addressing' },
    { pattern: /\bip\s*address/i, concept: 'IP Addressing' },
    { pattern: /\bwireshark\b/i, concept: 'Packet Analysis with Wireshark' },
    { pattern: /\bpacket\s*tracer\b/i, concept: 'Network Simulation with Packet Tracer' },
  ];

  for (const { pattern, concept } of conceptPatterns) {
    if (pattern.test(normalizedText)) {
      detectedConcepts.push(concept);
    }
  }

  return {
    commands: detectedCommands,
    tools: detectedTools,
    primaryCategory,
    categoryScores,
    concepts: detectedConcepts,
  };
}

// ── PASS 2: Lab Detection ────────────────────────────────────────────────────
function detectLabs(context) {
  const labs = [];
  const usedCommands = new Set();

  // Group commands by category and concept to form labs
  // First, create labs for each unique concept area detected
  const conceptGroups = {};

  for (const entry of context.commands) {
    const key = entry.concept;
    if (!conceptGroups[key]) {
      conceptGroups[key] = {
        commands: [],
        category: entry.category,
        concept: entry.concept,
      };
    }
    if (!usedCommands.has(entry.cmd)) {
      conceptGroups[key].commands.push(entry);
      usedCommands.add(entry.cmd);
    }
  }

  // Convert groups to lab candidates
  for (const [concept, group] of Object.entries(conceptGroups)) {
    const title = concept;
    const id = slugify(title);

    labs.push({
      id,
      title,
      category: group.category,
      concept: group.concept,
      commands: group.commands,
    });
  }

  // Create labs for detected tools that aren't already covered
  for (const tool of context.tools) {
    const toolName = tool.charAt(0).toUpperCase() + tool.slice(1);
    const exists = labs.some(l => l.title.toLowerCase().includes(tool));
    if (!exists) {
      labs.push({
        id: slugify(`${tool}-exploration`),
        title: `${toolName} Exploration`,
        category: context.primaryCategory,
        concept: `Hands-on practice with ${toolName}`,
        commands: [],
      });
    }
  }

  // Create concept-based labs for major topics detected
  for (const concept of context.concepts) {
    const exists = labs.some(l =>
      l.concept.toLowerCase().includes(concept.split(' - ')[0].toLowerCase())
    );
    if (!exists) {
      labs.push({
        id: slugify(concept.split(' - ')[0]),
        title: concept.split(' - ')[0] + ' Lab',
        category: context.primaryCategory,
        concept,
        commands: [],
      });
    }
  }

  return labs;
}

// ── PASS 3: Instruction Generation ───────────────────────────────────────────
function generateInstructions(labs, sourceId) {
  return labs.map(lab => {
    const instructions = [];
    const commands = [];

    // Opening instruction
    instructions.push('Open a terminal on your Linux machine');

    // Add command-specific instructions
    for (const cmdEntry of lab.commands) {
      for (const usage of cmdEntry.usage) {
        if (isCommandSafe(usage)) {
          commands.push(usage);
          instructions.push(`Run: ${usage}`);
          instructions.push(`Observe the output and note what information is displayed`);
        }
      }
    }

    // If no commands, add concept-based generic instructions
    if (commands.length === 0) {
      instructions.push(`Research the concept: ${lab.concept}`);
      instructions.push('Try to find related commands and tools');
      instructions.push('Document your findings');
    }

    // Closing instructions
    instructions.push('Compare the results with what was discussed in the lecture');
    instructions.push('Take notes on any differences or new observations');

    return {
      id: lab.id,
      title: lab.title,
      category: lab.category,
      concept: lab.concept,
      instructions,
      commands: commands.filter(isCommandSafe),
      sourceTranscript: sourceId,
    };
  });
}

// ── Main export ──────────────────────────────────────────────────────────────
function analyzeTranscript(text, sourceId) {
  // Clean and normalize
  const cleaned = cleanTranscript(text);

  // PASS 1: Extract context
  const context = extractContext(cleaned);

  // PASS 2: Detect labs
  const labCandidates = detectLabs(context);

  // PASS 3: Generate instructions
  const labs = generateInstructions(labCandidates, sourceId);

  // Deduplicate by id
  const seen = new Set();
  const unique = [];
  for (const lab of labs) {
    if (!seen.has(lab.id)) {
      seen.add(lab.id);
      unique.push(lab);
    }
  }

  return unique;
}

module.exports = { analyzeTranscript };
