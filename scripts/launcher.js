/**
 * launcher.js — Multi-browser CDP launcher with idempotency, auto-discovery, and background execution
 *
 * Checks if a browser with remote debugging port is already running.
 * If running, reuses the existing instance to prevent duplicate browser windows.
 * If not, launches the configured browser in the background with CDP enabled.
 *
 * 🛡️ MANDATORY BACKGROUND EXECUTION GUARANTEES:
 * - Spawns fully detached process (detached: true, stdio: 'ignore', unref()).
 * - Uses --no-startup-window when starting without explicit URL to prevent window focus stealing.
 * - Disables renderer and occluded window background throttling so background automation runs at full speed.
 * - Never interrupts the user's active workflow, typing, or multitasking.
 */

const fs = require('fs');
const path = require('path');
const http = require('http');
const os = require('os');
const { spawn } = require('child_process');

const SCRIPT_DIR = __dirname;
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');
const CONFIG_FILE = path.join(ROOT_DIR, 'browser.config.json');
const BROWSERS_FILE = path.join(SCRIPT_DIR, 'browsers.json');

const DEFAULT_CONFIG = {
  browser: 'edge',
  port: 9222,
  profileDir: '',
  customExecutable: null,
  autoLaunch: true
};

function expandPath(filePath) {
  if (!filePath) return '';
  let expanded = filePath;
  if (process.platform === 'win32') {
    expanded = expanded.replace(/%([^%]+)%/g, (_, n) => process.env[n] || '');
  } else {
    if (expanded.startsWith('~')) {
      expanded = path.join(os.homedir(), expanded.slice(1));
    }
    expanded = expanded.replace(/\$([A-Za-z0-9_]+)/g, (_, n) => process.env[n] || '');
  }
  return path.normalize(expanded);
}

function loadBrowserRegistry() {
  if (!fs.existsSync(BROWSERS_FILE)) {
    return {};
  }
  try {
    const raw = fs.readFileSync(BROWSERS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return data[process.platform] || {};
  } catch (err) {
    return {};
  }
}

function detectInstalledBrowsers() {
  const registry = loadBrowserRegistry();
  const detected = {};

  for (const [name, paths] of Object.entries(registry)) {
    for (const rawPath of paths) {
      const realPath = expandPath(rawPath);
      if (fs.existsSync(realPath)) {
        detected[name] = realPath;
        break;
      }
    }
  }
  return detected;
}

function hasConfigFile() {
  return fs.existsSync(CONFIG_FILE);
}

function readConfig() {
  let cfg = { ...DEFAULT_CONFIG };
  if (hasConfigFile()) {
    try {
      const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
      const parsed = JSON.parse(raw);
      cfg = { ...cfg, ...parsed };
    } catch (err) {
      console.warn(`[WARN] Failed to parse ${CONFIG_FILE}, using defaults: ${err.message}`);
    }
  }

  // CLI / ENV overrides
  if (process.env.CDP_BROWSER) cfg.browser = process.env.CDP_BROWSER.toLowerCase();
  if (process.env.CDP_PORT) cfg.port = parseInt(process.env.CDP_PORT, 10) || cfg.port;
  if (process.env.CDP_PROFILE_DIR) cfg.profileDir = process.env.CDP_PROFILE_DIR;

  if (!cfg.profileDir) {
    cfg.profileDir = path.join(os.tmpdir(), `agent-cdp-${cfg.browser}-profile`);
  } else {
    cfg.profileDir = expandPath(cfg.profileDir);
  }

  return cfg;
}

function saveConfig(patch) {
  let current = { ...DEFAULT_CONFIG };
  if (hasConfigFile()) {
    try {
      current = { ...current, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
    } catch (_) {}
  }
  const merged = { ...current, ...patch };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

function resolveExecutable(browserName, customPath) {
  if (customPath) {
    const exp = expandPath(customPath);
    if (fs.existsSync(exp)) return exp;
    throw new Error(`Custom executable path not found: ${customPath}`);
  }

  const installed = detectInstalledBrowsers();
  const target = (browserName || 'edge').toLowerCase();
  if (installed[target]) {
    return installed[target];
  }

  // If not found in detected, check registry paths directly
  const registry = loadBrowserRegistry();
  const candidates = registry[target] || [];
  for (const c of candidates) {
    const exp = expandPath(c);
    if (fs.existsSync(exp)) return exp;
  }

  const available = Object.keys(installed).join(', ') || 'none';
  throw new Error(`Browser "${target}" executable not found. Detected installed: [${available}]`);
}

function checkCdpStatus(port = 9222, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const req = http.get(
      {
        host: '127.0.0.1',
        port,
        path: '/json/version',
        timeout: timeoutMs
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            resolve({ running: true, data, port });
          } catch (_) {
            resolve({ running: true, port, raw: body });
          }
        });
      }
    );

    req.on('error', () => resolve({ running: false, port }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ running: false, port });
    });
  });
}

async function waitForCdp(port = 9222, maxWaitSec = 15) {
  const start = Date.now();
  const deadline = start + maxWaitSec * 1000;

  while (Date.now() < deadline) {
    const status = await checkCdpStatus(port, 1000);
    if (status.running) return status;
    await new Promise((r) => setTimeout(r, 600));
  }
  return { running: false, port };
}

async function launch(options = {}) {
  const config = readConfig();
  const targetBrowser = (options.browser || config.browser || 'edge').toLowerCase();
  const port = options.port || config.port || 9222;
  const initialUrl = options.url || null;

  // 1. Idempotency Check: Don't launch if already alive
  const cdpCheck = await checkCdpStatus(port, 1500);
  if (cdpCheck.running) {
    return {
      status: 'already_running',
      port,
      browser: targetBrowser,
      data: cdpCheck.data
    };
  }

  // 2. Resolve executable
  const exePath = resolveExecutable(targetBrowser, options.customExecutable || config.customExecutable);

  // 3. Prepare isolated profile directory
  const profileDir = options.profileDir || config.profileDir || path.join(os.tmpdir(), `agent-cdp-${targetBrowser}-profile`);
  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  // 4. Launch flags — strictly configured for silent background execution & zero focus stealing
  const args = [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-features=CalculateNativeWinOcclusion'
  ];

  if (initialUrl) {
    args.push(initialUrl);
  } else {
    // Launch completely silently in background without popping a blank/default window
    args.push('--no-startup-window');
  }

  const child = spawn(exePath, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true
  });
  child.unref();

  // 5. Wait for CDP ready
  const ready = await waitForCdp(port, 15);
  if (!ready.running) {
    throw new Error(`Timed out waiting for ${targetBrowser} to initialize CDP on port ${port}.`);
  }

  return {
    status: 'launched',
    browser: targetBrowser,
    port,
    profileDir,
    exePath,
    data: ready.data
  };
}

module.exports = {
  CONFIG_FILE,
  hasConfigFile,
  readConfig,
  saveConfig,
  detectInstalledBrowsers,
  resolveExecutable,
  checkCdpStatus,
  waitForCdp,
  launch
};

if (require.main === module) {
  const cmd = process.argv[2] || 'check';
  const rest = process.argv.slice(3);

  (async () => {
    switch (cmd) {
      case 'list': {
        const detected = detectInstalledBrowsers();
        console.log('Detected installed browsers:');
        for (const [k, v] of Object.entries(detected)) {
          console.log(`  - ${k}: ${v}`);
        }
        break;
      }
      case 'check': {
        const cfg = readConfig();
        const status = await checkCdpStatus(cfg.port);
        console.log(`Configured browser: ${cfg.browser}`);
        console.log(`CDP Port ${cfg.port}: ${status.running ? 'RUNNING (ready to connect)' : 'NOT RUNNING'}`);
        if (status.data && status.data.Browser) {
          console.log(`Connected Browser: ${status.data.Browser}`);
        }
        break;
      }
      case 'set': {
        const b = rest[0];
        if (!b) {
          console.error('Usage: node launcher.js set <edge|chrome|brave|arc|vivaldi|opera>');
          process.exit(1);
        }
        const updated = saveConfig({ browser: b.toLowerCase() });
        console.log(`Default browser set to: ${updated.browser}`);
        break;
      }
      case 'launch': {
        const b = rest[0];
        const u = rest[1];
        const res = await launch({ browser: b, url: u });
        if (res.status === 'already_running') {
          console.log(`CDP already active on port ${res.port} (${res.data ? res.data.Browser : 'Chromium'}). Reusing existing instance.`);
        } else {
          console.log(`Successfully launched ${res.browser} in background with CDP on port ${res.port}.`);
        }
        break;
      }
      default:
        console.log('Usage: node launcher.js [list | check | set <browser> | launch [browser] [url]]');
    }
  })().catch((err) => {
    console.error('ERROR:', err.message);
    process.exit(1);
  });
}
