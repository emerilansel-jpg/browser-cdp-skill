# browser-cdp-skill

[![AI Agent Ready](https://img.shields.io/badge/AI%20Agent-Ready-blue.svg)](https://github.com/emerilansel-jpg/browser-cdp-skill)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Browsers](https://img.shields.io/badge/Browsers-Edge%20%7C%20Chrome%20%7C%20Brave%20%7C%20Arc%20%7C%20Vivaldi%20%7C%20Opera-purple.svg)](scripts/browsers.json)

Universal browser automation skill for AI agents (Claude Code, ZCode, Codex, Cursor) via Chrome DevTools Protocol (CDP).

Connects directly to your real, running browser on port 9222. Automates web navigation, tab management, screenshots, and form interactions inside a single browser window without spawning duplicate or isolated browser instances.

---

## Why browser-cdp-skill?

Standard automation tools (such as Playwright `launch()` or Selenium) spawn a brand-new, isolated browser window for every single command or task. This causes window clutter, loses existing login sessions, and disrupts the user's workspace.

browser-cdp-skill solves this problem:
- Single Window Architecture: Attaches to your existing browser window via Chrome DevTools Protocol (CDP).
- 100% Non-Intrusive Background Execution: Operates strictly via internal CDP and DOM virtual events. Never hijacks or touches the user's physical mouse cursor or hardware keyboard.
- Multi-Browser Support: Supports Microsoft Edge, Google Chrome, Brave, Arc, Vivaldi, and Opera on Windows, macOS, and Linux.
- Interactive First-Run Onboarding: Detects installed browsers on your system and lets you choose your preferred default.
- Flexible Browser Switching: Switch defaults on the fly via CLI, config file, or natural language prompts.
- Fast & Lightweight: Uses persistent connections with chaining (`::`) to execute multi-step automations in a single session.

---

## 🛡️ 100% Non-Intrusive Background Execution

Unlike desktop automation tools that take over your entire computer, **browser-cdp-skill is strictly non-intrusive**:

### 🚫 No Physical Mouse or Keyboard Hijacking
- **Never moves your hardware mouse pointer**: The operating system mouse cursor stays right where you are using it.
- **Never sends OS hardware keystrokes**: No `SendInput` (Windows), `CGEventPost` (macOS), or `xdotool` (Linux).
- **Zero workflow disruption**: You can freely type in your code editor, chat on messaging apps, game, or browse other sites while the AI agent navigates, clicks, and fills forms simultaneously.

### 🌐 Technical Difference: CDP vs Desktop GUI Automation
Traditional tools like **PyAutoGUI**, **RobotJS**, **nut.js**, or AutoHotkey hook into the operating system's global event queue. They require the browser window to be focused in the foreground, and any accidental movement of your mouse or keystroke will break the automation or mess up your current active window.

In contrast, **browser-cdp-skill** communicates exclusively via a local TCP WebSocket (`http://127.0.0.1:9222`) directly with Chromium's internal engine:

| Metric | Desktop GUI Automation (PyAutoGUI, RobotJS) | browser-cdp-skill (CDP) |
|---|---|---|
| **Control Layer** | OS Hardware Event Queue (`SendInput`, etc.) | Chromium DevTools Protocol (CDP WebSocket) |
| **Mouse Cursor** | Moves physical pointer across screen | **Zero movement**; virtual coordinates inside renderer |
| **Keyboard Input** | Types into whichever window has OS focus | **Targeted DOM dispatch**; isolated to specific element |
| **Window State** | Must be focused, active, and visible | **Background safe**, minimized, or behind other windows |
| **User Interference** | Clashes immediately if user types or clicks | **100% safe**: User works concurrently without interruption |
| **Window Focus** | Constant focus stealing required | **Zero focus stealing**; background sessions via `Target` domain |

---

## Quick Start & Installation

Clone directly into your agent skills directory:

```bash
git clone https://github.com/emerilansel-jpg/browser-cdp-skill ~/.agents/skills/browser-cdp-skill
cd ~/.agents/skills/browser-cdp-skill/scripts && npm install
```

For ZCode or Windows custom setups:

```bash
git clone https://github.com/emerilansel-jpg/browser-cdp-skill "C:/Users/%USERNAME%/.agents/skills/browser-cdp-skill"
cd "C:/Users/%USERNAME%/.agents/skills/browser-cdp-skill/scripts" && npm install
```

---

## First-Run Experience

When an AI agent runs browser automation for the first time, or when you initialize the skill, it automatically detects which Chromium browsers exist on your machine:

1. System scans for installed executables:
   ```bash
   node scripts/cdp-bridge.js list-installed
   ```
2. In interactive mode, a prompt appears:
   ```text
   === BROWSER CDP SETUP (FIRST-RUN) ===
   No default browser configured yet.
   Installed browsers detected:
     [1] edge (C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe)
     [2] chrome (C:\Program Files\Google\Chrome\Application\chrome.exe)
     [3] brave (C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe)

   Select browser [edge/chrome/brave] (default: edge):
   ```
3. In AI Agent mode, the agent queries installed browsers, asks the user for their preference, and saves the configuration:
   ```bash
   node scripts/cdp-bridge.js set-browser chrome
   ```
4. Configuration is stored in `browser.config.json`.

---

## How to Switch Browsers Later

You can change the active browser at any time using any of the following three methods:

### Method 1: Direct CLI Command

Run from the `scripts/` directory:

```bash
# Switch to Google Chrome
node cdp-bridge.js set-browser chrome

# Switch to Brave Browser
node cdp-bridge.js set-browser brave

# Switch to Microsoft Edge
node cdp-bridge.js set-browser edge

# Switch to Arc or Vivaldi
node cdp-bridge.js set-browser arc
node cdp-bridge.js set-browser vivaldi
```

### Method 2: Natural Language with AI Agent

Simply instruct your agent:
> "Ganti browser ke Chrome" or "Switch my default browser to Brave"

The agent will execute `node scripts/cdp-bridge.js set-browser <browser>` and confirm the update.

### Method 3: Edit Configuration File

Edit `browser.config.json` in the project root:

```json
{
  "browser": "chrome",
  "port": 9222,
  "profileDir": "",
  "customExecutable": null,
  "autoLaunch": true
}
```

---

## Command Reference

All commands are executed via `node cdp-bridge.js <command> [args]`:

### Configuration & Discovery

| Command | Description |
|---|---|
| `node cdp-bridge.js list-installed` | List all Chromium browsers installed on the host OS |
| `node cdp-bridge.js get-browser` | Show active browser configuration and CDP port status |
| `node cdp-bridge.js set-browser <name>` | Save preferred default browser (`edge`, `chrome`, `brave`, etc.) |
| `node cdp-bridge.js launch [url]` | Launch the configured browser with CDP enabled if not running |

### Navigation & Page Actions

| Command | Description |
|---|---|
| `node cdp-bridge.js open <url>` | Navigate to URL in the active tab |
| `node cdp-bridge.js newtab <url>` | Open URL in a new tab within the same browser window |
| `node cdp-bridge.js click <selector>` | Click element matching CSS selector |
| `node cdp-bridge.js clicktext "<text>"` | Click element matching visible text |
| `node cdp-bridge.js fill <selector> "value"` | Fill input field matching CSS selector |
| `node cdp-bridge.js shot [label]` | Capture viewport screenshot to `screenshots/` |
| `node cdp-bridge.js snap` | Output accessibility snapshot (semantic DOM tree) |
| `node cdp-bridge.js eval "<javascript>"` | Execute JavaScript in page context and print result |
| `node cdp-bridge.js title` | Print active page document title |
| `node cdp-bridge.js url` | Print active page URL |

### Tab Management

| Command | Description |
|---|---|
| `node cdp-bridge.js tabs` | List all open tabs with indexes and URLs |
| `node cdp-bridge.js goto-tab <index>` | Switch active tab focus by numerical index |
| `node cdp-bridge.js focus <url-substring>` | Bring tab matching URL substring to front |
| `node cdp-bridge.js find <url-substring>` | Find tab index matching URL substring |
| `node cdp-bridge.js close-tabs <url-sub>` | Close all open tabs matching URL substring |
| `node cdp-bridge.js close-other` | Close all tabs except the currently active tab |

### Multi-Command Chaining

Use `::` to run multiple actions in sequence over a single CDP connection without reconnect overhead:

```bash
# Navigate, get title, and take screenshot in one command
node cdp-bridge.js open https://news.ycombinator.com :: title :: shot hn-frontpage

# Focus existing tab, execute JavaScript, and take screenshot
node cdp-bridge.js focus github.com :: eval "document.title" :: shot github-status
```

---

## Programmatic API

You can import `cdp-bridge.js` directly into your Node.js scripts:

```javascript
const bridge = require('./scripts/cdp-bridge');

async function run() {
  await bridge.ensureReady();
  await bridge.connect();

  const page = await bridge.newTab('https://github.com');
  await bridge.fill('input[name="q"]', 'browser-cdp-skill');
  await bridge.screenshot('search-result');

  // Disconnects CDP session only; the user's browser stays open
  await page.context().browser().close();
}

run().catch(console.error);
```

---

## Architecture & CDP Protocol

```
+-------------------------------------------------------------+
|                     User Browser Window                     |
|           (Edge / Chrome / Brave / Arc / Vivaldi)           |
|                Running with --remote-debugging-port=9222    |
+------------------------------^------------------------------+
                               |
                               | Chrome DevTools Protocol (CDP)
                               |
+------------------------------v------------------------------+
|                        cdp-bridge.js                        |
|   - checks port 9222 status (http://127.0.0.1:9222/json)   |
|   - attaches via Playwright chromium.connectOverCDP()       |
|   - controls tabs, clicks, inputs, screenshots              |
+------------------------------^------------------------------+
                               |
+------------------------------v------------------------------+
|                         launcher.js                         |
|   - reads browser.config.json & scripts/browsers.json       |
|   - detects installed browsers                              |
|   - auto-starts browser with CDP flag only if not running   |
+-------------------------------------------------------------+
```

1. Non-Disruptive: Does not close or kill existing browser sessions.
2. Idempotent: If port 9222 is active, connects immediately without launching a new process.
3. Isolated Profiles: Uses a dedicated agent profile directory so normal user browsing is unaffected.

---

## License

MIT License. Copyright (c) 2026 emerilansel-jpg. See [LICENSE](LICENSE) for details.
