/**
 * cdp-bridge.js — Multi-browser CDP Bridge for AI Agents
 *
 * Attaches to user's running browser window (Edge, Chrome, Brave, Arc, Vivaldi, etc.)
 * via Chrome DevTools Protocol (CDP) on port 9222.
 * Reuses existing window/tabs without opening new windows.
 *
 * Commands:
 *   node cdp-bridge.js list-installed            List Chromium browsers detected on this system
 *   node cdp-bridge.js get-browser               Show active browser config and CDP status
 *   node cdp-bridge.js set-browser <name>        Set default browser (edge, chrome, brave, etc.)
 *   node cdp-bridge.js launch [url]              Ensure configured browser is launched with CDP
 *
 * Web Navigation & Actions:
 *   node cdp-bridge.js open <url>                Navigate in current active tab
 *   node cdp-bridge.js newtab <url>              Open URL in a new tab (same window)
 *   node cdp-bridge.js click <selector>          Click element by CSS selector
 *   node cdp-bridge.js clicktext "<text>"        Click element by visible text
 *   node cdp-bridge.js fill <sel> "value"        Fill input field
 *   node cdp-bridge.js shot [label]              Take viewport screenshot
 *   node cdp-bridge.js snap                      Dump accessibility tree
 *   node cdp-bridge.js eval "<js>"               Execute JS in active tab
 *   node cdp-bridge.js title                     Print page title
 *   node cdp-bridge.js url                       Print current URL
 *   node cdp-bridge.js tabs                      List all open tabs
 *   node cdp-bridge.js goto-tab <index>          Switch active tab by index
 *   node cdp-bridge.js focus <url-substring>     Focus tab matching URL substring
 *   node cdp-bridge.js find <url-substring>      Find tab index by URL substring
 *   node cdp-bridge.js close-tabs <url-sub>      Close all tabs matching URL substring
 *   node cdp-bridge.js close-other               Close all tabs except active one
 *
 * Multi-command (chained via :: in one connection):
 *   node cdp-bridge.js focus github.com :: title :: shot github-check
 */

let _chromium = null;
function getChromium() {
  if (_chromium) return _chromium;

  // 1. Try local require('playwright')
  try {
    const pw = require('playwright');
    _chromium = pw.chromium || pw;
    return _chromium;
  } catch (_) {}

  // 2. Try playwright-core
  try {
    const pw = require('playwright-core');
    _chromium = pw.chromium || pw;
    return _chromium;
  } catch (_) {}

  // 3. Try nearby skill node_modules (fallback for agent environment)
  const homeDir = process.env.USERPROFILE || process.env.HOME || '';
  const fallbackCandidates = [
    path.join(SCRIPT_DIR, 'node_modules', 'playwright'),
    path.join(ROOT_DIR, 'node_modules', 'playwright'),
    path.join(homeDir, '.agents', 'skills', 'edge-browser-default', 'scripts', 'node_modules', 'playwright'),
    path.join(homeDir, '.agents', 'skills', 'browser-cdp-skill', 'scripts', 'node_modules', 'playwright')
  ];

  for (const candidate of fallbackCandidates) {
    try {
      if (fs.existsSync(candidate)) {
        const pw = require(candidate);
        _chromium = pw.chromium || pw;
        return _chromium;
      }
    } catch (_) {}
  }

  throw new Error(
    'Playwright is required for browser automation. Please install it by running:\n' +
    `  cd "${SCRIPT_DIR}" && npm install`
  );
}
const fs = require('fs');
const path = require('path');
const readline = require('readline');
const launcher = require('./launcher');

const SCRIPT_DIR = __dirname;
const ROOT_DIR = path.resolve(SCRIPT_DIR, '..');
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || path.join(ROOT_DIR, 'screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

let browser = null;
let _activeIndex = 0;

async function promptFirstRun() {
  const installed = launcher.detectInstalledBrowsers();
  const names = Object.keys(installed);

  if (names.length === 0) {
    throw new Error('No Chromium-based browsers (Edge, Chrome, Brave, Arc, Vivaldi) detected on your system.');
  }

  // If interactive terminal, prompt user
  if (process.stdin.isTTY) {
    console.log('\n=== BROWSER CDP SETUP (FIRST-RUN) ===');
    console.log('No default browser configured yet.');
    console.log('Installed browsers detected:');
    names.forEach((name, i) => console.log(`  [${i + 1}] ${name} (${installed[name]})`));

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await new Promise((res) => {
      rl.question(`\nSelect browser [${names.join('/')}] (default: ${names[0]}): `, (ans) => {
        rl.close();
        res(ans.trim().toLowerCase());
      });
    });

    let chosen = names[0];
    if (answer) {
      const idx = parseInt(answer, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= names.length) {
        chosen = names[idx - 1];
      } else if (names.includes(answer)) {
        chosen = answer;
      }
    }

    launcher.saveConfig({ browser: chosen });
    console.log(`[CONFIG] Saved default browser: ${chosen}`);
    console.log(`[INFO] You can change this anytime with: node cdp-bridge.js set-browser <name>\n`);
    return chosen;
  }

  // Non-interactive (Agent mode): output structured message and auto-select best fallback
  const fallback = names.includes('edge') ? 'edge' : (names.includes('chrome') ? 'chrome' : names[0]);
  console.log(`[FIRST_RUN_INFO] No configuration found. Auto-selecting "${fallback}" from detected: [${names.join(', ')}].`);
  console.log(`[INFO] To switch browser, run: node cdp-bridge.js set-browser <name>`);
  launcher.saveConfig({ browser: fallback });
  return fallback;
}

async function ensureReady() {
  if (!launcher.hasConfigFile() && !process.env.CDP_BROWSER) {
    await promptFirstRun();
  }

  const config = launcher.readConfig();
  const cdpCheck = await launcher.checkCdpStatus(config.port, 1500);

  if (!cdpCheck.running) {
    if (config.autoLaunch !== false) {
      console.log(`[CDP] Starting ${config.browser} on port ${config.port}...`);
      await launcher.launch({ browser: config.browser, port: config.port });
    } else {
      throw new Error(`CDP is not running on port ${config.port} and autoLaunch is disabled.`);
    }
  }
}

async function connect(customUrl) {
  const config = launcher.readConfig();
  const url = customUrl || process.env.CDP_URL || `http://127.0.0.1:${config.port}`;
  const chromium = getChromium();
  browser = await chromium.connectOverCDP(url);
  return browser;
}

function defaultContext() {
  if (!browser) throw new Error('Not connected to browser. Call connect() first.');
  const ctxs = browser.contexts();
  if (!ctxs.length) throw new Error('No browser context found. Verify remote debugging port.');
  return ctxs[0];
}

async function activePage(createIfMissing = true) {
  const ctx = defaultContext();
  const pages = ctx.pages();
  if (!pages.length) {
    if (createIfMissing) {
      const p = await ctx.newPage();
      _activeIndex = 0;
      return p;
    }
    throw new Error('No open tabs.');
  }
  _activeIndex = Math.min(_activeIndex, pages.length - 1);
  return pages[_activeIndex];
}

async function open(url) {
  const page = await activePage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  return page;
}

async function newTab(url) {
  const ctx = defaultContext();
  const page = await ctx.newPage();
  if (url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  }
  const pages = ctx.pages();
  _activeIndex = pages.length - 1;
  return page;
}

async function click(selector, opts = {}) {
  const page = await activePage();
  const timeout = opts.timeout || 15000;
  await page.waitForSelector(selector, { timeout });
  await page.click(selector, { timeout });
}

async function clickText(text, opts = {}) {
  const page = await activePage();
  const timeout = opts.timeout || 15000;
  try {
    await page.click(`text=${text}`, { timeout });
  } catch {
    await page.getByText(text, { exact: false }).first().click({ timeout });
  }
}

async function fill(selector, value, opts = {}) {
  const page = await activePage();
  const timeout = opts.timeout || 15000;
  await page.waitForSelector(selector, { timeout });
  await page.fill(selector, value, { timeout });
}

async function screenshot(label) {
  const page = await activePage();
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `cdp-${label || stamp}.png`;
  const file = path.join(SCREENSHOT_DIR, filename);
  await page.screenshot({ path: file, fullPage: false });
  console.log('Screenshot saved:', file);
  return file;
}

async function snapshot() {
  const page = await activePage();
  const acc = await page.accessibility.snapshot();
  function walk(node, depth = 0) {
    if (!node) return;
    const indent = '  '.repeat(depth);
    const label = [node.role, node.name].filter(Boolean).join(': ');
    if (label) console.log(indent + label);
    (node.children || []).forEach((c) => walk(c, depth + 1));
  }
  walk(acc);
}

async function evalJS(js) {
  const page = await activePage();
  const result = await page.evaluate(js);
  console.log(JSON.stringify(result, null, 2));
  return result;
}

async function title() {
  const page = await activePage();
  const t = await page.title();
  console.log(t);
  return t;
}

async function url() {
  const page = await activePage();
  const u = page.url();
  console.log(u);
  return u;
}

async function listTabs() {
  const ctx = defaultContext();
  const pages = ctx.pages();
  pages.forEach((p, i) => console.log(`[${i}] ${p.url()}`));
}

async function gotoTab(index) {
  const ctx = defaultContext();
  const pages = ctx.pages();
  if (index < 0 || index >= pages.length) {
    throw new Error(`Tab index ${index} out of range (0..${pages.length - 1})`);
  }
  _activeIndex = index;
  await pages[index].bringToFront();
  return pages[index];
}

async function findTabByURL(substr) {
  const ctx = defaultContext();
  const pages = ctx.pages();
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].url().includes(substr)) return i;
  }
  return -1;
}

async function focusTab(substr) {
  const idx = await findTabByURL(substr);
  if (idx === -1) throw new Error(`Tab with URL containing "${substr}" not found.`);
  return await gotoTab(idx);
}

async function closeTabs(substr) {
  const ctx = defaultContext();
  const pages = ctx.pages();
  let closed = 0;
  for (let i = pages.length - 1; i >= 0; i--) {
    if (pages[i].url().includes(substr)) {
      await pages[i].close();
      closed++;
    }
  }
  _activeIndex = 0;
  console.log(`Closed ${closed} tab(s) matching "${substr}"`);
}

async function closeOtherTabs() {
  const ctx = defaultContext();
  const pages = ctx.pages();
  const keep = Math.min(_activeIndex, pages.length - 1);
  let closed = 0;
  for (let i = pages.length - 1; i >= 0; i--) {
    if (i !== keep) {
      await pages[i].close();
      closed++;
    }
  }
  _activeIndex = 0;
  console.log(`Closed ${closed} tab(s), kept active [${keep}]`);
}

async function runCommand(cmd, rest) {
  switch (cmd) {
    case 'open':         await open(rest[0]); break;
    case 'newtab':       await newTab(rest[0]); break;
    case 'click':        await click(rest[0]); break;
    case 'clicktext':    await clickText(rest.join(' ')); break;
    case 'fill':         await fill(rest[0], rest[1]); break;
    case 'shot':         await screenshot(rest[0]); break;
    case 'snap':         await snapshot(); break;
    case 'eval':         await evalJS(rest.join(' ')); break;
    case 'title':        await title(); break;
    case 'url':          await url(); break;
    case 'tabs':         await listTabs(); break;
    case 'goto-tab':     await gotoTab(parseInt(rest[0], 10)); break;
    case 'focus':        await focusTab(rest[0]); break;
    case 'find':         { const i = await findTabByURL(rest[0]); console.log(i === -1 ? 'NOT FOUND' : `Found at [${i}]`); break; }
    case 'close-tabs':   await closeTabs(rest[0]); break;
    case 'close-other':  await closeOtherTabs(); break;
    default: console.log('Unknown command:', cmd);
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = (argv[0] || '').toLowerCase();
  const rest = argv.slice(1);

  // Administrative / Configuration commands (no browser connection needed)
  if (cmd === 'list-installed') {
    const installed = launcher.detectInstalledBrowsers();
    console.log('Installed Chromium Browsers:');
    for (const [k, v] of Object.entries(installed)) {
      console.log(`  - ${k}: ${v}`);
    }
    return;
  }

  if (cmd === 'get-browser') {
    const cfg = launcher.readConfig();
    const status = await launcher.checkCdpStatus(cfg.port, 1500);
    console.log(`Active Browser: ${cfg.browser}`);
    console.log(`CDP Port: ${cfg.port}`);
    console.log(`Profile Dir: ${cfg.profileDir}`);
    console.log(`CDP Status: ${status.running ? 'RUNNING (connected)' : 'NOT RUNNING'}`);
    if (status.data && status.data.Browser) {
      console.log(`Instance: ${status.data.Browser}`);
    }
    return;
  }

  if (cmd === 'set-browser') {
    const target = (rest[0] || '').toLowerCase();
    if (!target) {
      console.error('Usage: node cdp-bridge.js set-browser <edge|chrome|brave|arc|vivaldi|opera>');
      process.exit(1);
    }
    const installed = launcher.detectInstalledBrowsers();
    if (!installed[target]) {
      console.warn(`[WARN] Browser "${target}" executable not automatically found on your system.`);
    }
    launcher.saveConfig({ browser: target });
    console.log(`[SUCCESS] Default browser changed to: ${target}`);
    console.log(`Next commands will use ${target}.`);
    return;
  }

  if (cmd === 'launch') {
    await ensureReady();
    console.log('[READY] Browser is running with CDP.');
    return;
  }

  if (!argv.length) {
    console.log('Usage: node cdp-bridge.js <command> [args]');
    console.log('Config:');
    console.log('  list-installed              List detected browsers');
    console.log('  get-browser                 Show active browser & CDP status');
    console.log('  set-browser <name>          Set default browser');
    console.log('Web Actions:');
    console.log('  open <url>                  Open URL in current tab');
    console.log('  newtab <url>                Open URL in new tab');
    console.log('  click <sel> | clicktext <t> Click element');
    console.log('  fill <sel> <val>            Fill input');
    console.log('  shot [label]                Screenshot');
    console.log('  tabs | goto-tab <i> | focus Switch tabs');
    console.log('Chaining:');
    console.log('  node cdp-bridge.js open https://example.com :: title :: shot example');
    process.exit(1);
  }

  // Ensure browser is ready before connecting
  await ensureReady();
  await connect();

  // Multi-command parsing via ::
  const fullCmdString = argv.join(' ');
  const commandList = fullCmdString.split('::').map((s) => s.trim()).filter(Boolean);

  try {
    for (const cmdStr of commandList) {
      const parts = cmdStr.split(/\s+/);
      await runCommand(parts[0].toLowerCase(), parts.slice(1));
    }
  } finally {
    // Disconnect CDP session only — keeps user's browser open!
    if (browser) {
      await browser.close();
    }
  }
}

module.exports = {
  getChromium,
  connect, defaultContext, activePage,
  open, newTab, click, clickText, fill,
  screenshot, snapshot, evalJS, title, url,
  listTabs, gotoTab, findTabByURL, focusTab,
  closeTabs, closeOtherTabs, runCommand,
  ensureReady, promptFirstRun
};

if (require.main === module) {
  main().catch((err) => {
    console.error('ERROR:', err.message);
    process.exit(1);
  });
}
