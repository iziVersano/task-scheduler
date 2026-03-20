const { execFile } = require('child_process');

// ── Sandbox Configuration ────────────────────────────────────────────────────

const DOCKER_IMAGE = 'lab-sandbox';
const TIMEOUT_MS = 10_000;   // 10 seconds max per command
const MEMORY_LIMIT = '64m';
const CPU_LIMIT = '0.5';

// ── Command Whitelist ────────────────────────────────────────────────────────
// Each executable lab declares its own allowedCommands.
// This registry is the backend-enforced source of truth.

const EXECUTABLE_LABS = {
  'network-interface-configuration': {
    allowedCommands: ['ip a', 'ip addr show'],
  },
  'icmp-connectivity-testing': {
    allowedCommands: ['ping -c 4 8.8.8.8', 'ping -c 4 google.com'],
    network: 'bridge',  // needs outbound connectivity
  },
};

// ── Docker availability check ────────────────────────────────────────────────

let _dockerAvailable = null;

function checkDocker() {
  if (_dockerAvailable !== null) return Promise.resolve(_dockerAvailable);
  return new Promise((resolve) => {
    execFile('docker', ['info'], { timeout: 5000 }, (err) => {
      _dockerAvailable = !err;
      resolve(_dockerAvailable);
    });
  });
}

// ── Check if sandbox image exists ────────────────────────────────────────────

function checkImage() {
  return new Promise((resolve) => {
    execFile('docker', ['image', 'inspect', DOCKER_IMAGE], { timeout: 5000 }, (err) => {
      resolve(!err);
    });
  });
}

// ── Core execution ───────────────────────────────────────────────────────────

/**
 * Validate and execute a command in a Docker sandbox.
 *
 * @param {string} labId  - must match a key in EXECUTABLE_LABS
 * @param {string} command - must exactly match an allowedCommands entry
 * @returns {Promise<{stdout, stderr, exitCode, durationMs}>}
 */
async function executeInSandbox(labId, command) {
  // 1. Validate lab (use prefix match, since IDs have source date appended)
  const labConfig = getLabConfig(labId);
  if (!labConfig) {
    throw Object.assign(new Error(`Lab "${labId}" is not executable`), { status: 403 });
  }

  // 2. Validate command against whitelist (exact match only)
  if (!labConfig.allowedCommands.includes(command)) {
    throw Object.assign(
      new Error(`Command "${command}" is not allowed for this lab`),
      { status: 403 }
    );
  }

  // 3. Check Docker
  const dockerOk = await checkDocker();
  if (!dockerOk) {
    throw Object.assign(
      new Error('Docker is not available. Run: sudo apt install docker.io && sudo usermod -aG docker $USER'),
      { status: 503 }
    );
  }

  const imageOk = await checkImage();
  if (!imageOk) {
    throw Object.assign(
      new Error('Sandbox image not built. Run: cd server/sandbox && ./build.sh'),
      { status: 503 }
    );
  }

  // 4. Build docker run args
  const containerName = `lab-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const network = labConfig.network || 'none';
  const args = [
    'run',
    '--rm',                          // auto-remove on exit
    '--name', containerName,
    '--network', network,
    '--memory', MEMORY_LIMIT,
    '--cpus', CPU_LIMIT,
    '--read-only',                   // read-only filesystem
    '--security-opt', 'no-new-privileges:true',
    DOCKER_IMAGE,
    'sh', '-c', command,
  ];

  // 5. Execute with timeout
  const start = Date.now();

  return new Promise((resolve) => {
    const proc = execFile('docker', args, {
      timeout: TIMEOUT_MS,
      maxBuffer: 1024 * 256, // 256KB
    }, (err, stdout, stderr) => {
      const durationMs = Date.now() - start;

      if (err && err.killed) {
        // Timeout — force-remove container just in case
        execFile('docker', ['rm', '-f', containerName], () => {});
        resolve({
          stdout: stdout || '',
          stderr: 'Command timed out after ' + (TIMEOUT_MS / 1000) + ' seconds',
          exitCode: 124,
          durationMs,
          timedOut: true,
        });
        return;
      }

      resolve({
        stdout: stdout || '',
        stderr: stderr || '',
        exitCode: err ? (err.code || 1) : 0,
        durationMs,
        timedOut: false,
      });
    });

    // Safety: kill after timeout + grace period
    setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch {}
      execFile('docker', ['rm', '-f', containerName], () => {});
    }, TIMEOUT_MS + 2000);
  });
}

/**
 * Check if a lab ID is executable.
 */
function isExecutableLab(labId) {
  // Match by the base slug portion of the lab id
  // Lab IDs in DB are like "network-interface-configuration-2026-03-12-am"
  // We match if the ID starts with a known executable lab key
  for (const key of Object.keys(EXECUTABLE_LABS)) {
    if (labId.startsWith(key)) return true;
  }
  return false;
}

/**
 * Get the executable config for a lab, matching by prefix.
 */
function getLabConfig(labId) {
  for (const [key, config] of Object.entries(EXECUTABLE_LABS)) {
    if (labId.startsWith(key)) return config;
  }
  return null;
}

/**
 * Get the sandbox status (Docker + image availability).
 */
async function getSandboxStatus() {
  const dockerOk = await checkDocker();
  const imageOk = dockerOk ? await checkImage() : false;
  return { docker: dockerOk, image: imageOk, ready: dockerOk && imageOk };
}

module.exports = {
  executeInSandbox,
  isExecutableLab,
  getLabConfig,
  getSandboxStatus,
  EXECUTABLE_LABS,
};
