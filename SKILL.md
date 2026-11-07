---
name: browser-cdp-skill
description: Universal browser automation via Chrome DevTools Protocol (CDP). Controls the user's real browser window (Microsoft Edge, Google Chrome, Brave, Arc, Vivaldi) without opening duplicate windows.
---

# Universal Browser CDP Skill

Use this skill whenever a user asks to **open, navigate, inspect, click, fill forms, or automate websites**.

This skill attaches to the user's real browser window via **Chrome DevTools Protocol (CDP)** on port `9222`. It ensures all interactions happen in a single, existing browser window instead of spawning annoying isolated browser instances.

---

## 🛑 MANDATORY DIRECTIVE: WORK IN THE BACKGROUND

**ALL browser automation MUST execute completely and silently in the background.**

1. **Silent Background Execution**: Browser automation MUST execute silently in the background without opening disruptive popup windows or interrupting the user.
2. **ZERO Focus Stealing**: The AI Agent MUST NOT bring browser windows to the foreground, activate the OS window, or steal focus from what the user is currently doing.
3. **Detached Background Process**: The browser process runs detached (`detached: true`, `stdio: 'ignore'`, `unref()`) with `--no-startup-window` on startup so that no window pops over the user's workspace.
4. **Uninterrupted Multitasking**: The user must be able to continue typing, coding, reading, or gaming without having their cursor, keyboard focus, or active screen hijacked.
5. **Background Tab Management**: All tab operations use background tab management (`context.newPage()` via CDP `Target.createTarget`) without forced OS window activation.
6. **Pure Virtual CDP Actions**: All clicks, keystrokes, and navigations are synthetic CDP events (`Page.*`, `Runtime.*`, `DOM.*`, `Input.*`) operating directly inside browser memory.

---

## ⚡ Key Principles & Anti-Window Spam Rule

1. **Re-use Existing Window**: Never launch a new browser instance if one is already running with CDP.
2. **100% Non-Intrusive Background Execution**: Never touch or hijack the user's physical mouse cursor or hardware keyboard. All automation runs inside the browser virtual context via CDP.
3. **Chromium Universal**: Supports Microsoft Edge, Google Chrome, Brave, Arc, and Vivaldi out of the box.
4. **Transparent to User**: The user can observe actions live without having their window focus stolen.
5. **Idempotent Connection**: Scripts automatically detect port `9222` and auto-launch the configured browser only when necessary.

---

## 🛡️ MANDATORY: 100% Non-Intrusive Background Execution (Zero User Hardware Interference)

**CRITICAL GUARANTEE**: This skill operates **entirely in the background** without ever hijacking or intercepting the user's hardware input.

### 1. Zero Physical Hardware Interference
- **NEVER move the operating system mouse cursor**: The real mouse pointer on screen remains 100% under the user's control.
- **NEVER send OS-level hardware keystrokes**: No `SendInput` (Windows), `CGEventPost` (macOS), or `xdotool` (Linux).
- **Work Uninterrupted**: The user can freely type in their code editor, chat, play games, or use any other application while the AI agent automates the browser simultaneously.

### 2. Pure Virtual CDP & Synthetic DOM Events
- All interactions (`click`, `fill`, `eval`, `open`, `newtab`) are dispatched exclusively via WebSocket JSON-RPC over the Chrome DevTools Protocol (`Page.*`, `Runtime.*`, `DOM.*`, `Input.*`).
- Clicks and text inputs are synthetic events delivered directly into Chromium's internal rendering pipeline for the target web page. They exist solely inside the browser engine memory.

### 3. Background Tab Management & No Focus Stealing
- Tabs are opened and managed via background CDP targets (`Target.createTarget`).
- Automated tasks do NOT force-focus or pull the browser window over the user's current foreground application.
- The browser can remain minimized, partially occluded, or on a secondary virtual desktop without affecting automation reliability.

### 4. Technical Distinction: CDP vs Desktop GUI Automation
| Feature | Desktop GUI (PyAutoGUI, RobotJS, nut.js) | browser-cdp-skill (CDP) |
|---|---|---|
| **Mechanism** | OS-level mouse/keyboard event injection | Local WebSocket JSON-RPC to browser engine |
| **Physical Mouse** | Hijacks & moves user's actual cursor | **Zero movement**; virtual coordinates in memory |
| **Hardware Keyboard**| Types into whatever window has OS focus | **Zero OS keystrokes**; targeted DOM input dispatch |
| **User Multitasking** | Completely blocks user (hands-off required) | **100% usable**; user works concurrently without clash |
| **Window State** | Window must be in foreground & visible | Works in background, minimized, or behind windows |

---

## 🛠️ First-Run Onboarding Flow

Before executing the very first browser action in a new workspace or environment:

### Step 1: Check if configuration exists
Run:
```bash
node scripts/cdp-bridge.js get-browser
```
Or check if `browser.config.json` exists.

### Step 2: If NOT configured (First-Run)
1. Run `node scripts/cdp-bridge.js list-installed` to see which browsers exist on the machine.
2. **Ask the user** which browser they prefer:
   > *"Browser skill is not configured yet. The following browsers were detected on your system: [Edge, Chrome, Brave]. Which browser would you like to use for automation?"*
3. Once the user replies, save their choice:
   ```bash
   node scripts/cdp-bridge.js set-browser <edge|chrome|brave|arc|vivaldi>
   ```
4. Inform the user:
   > *"Default browser has been set to `<choice>`. You can change it at any time by running `node scripts/cdp-bridge.js set-browser <name>` or simply asking me."*

---

## 🔄 How to Switch Browsers Later

The user can change their preferred browser at any time via:

1. **Agent Natural Language**: User says *"Switch browser to Chrome"* -> Agent runs:
   ```bash
   node scripts/cdp-bridge.js set-browser chrome
   ```
2. **Direct CLI Command**:
   ```bash
   node scripts/cdp-bridge.js set-browser brave
   node scripts/cdp-bridge.js set-browser edge
   ```
3. **Editing Configuration**:
   Change `"browser": "<name>"` inside `browser.config.json`.

---

## 🚀 Navigation & Automation Commands

All commands are run from the skill's `scripts/` directory:

### Basic Commands
| Action | Command |
|---|---|
| Open URL in active tab | `node cdp-bridge.js open <url>` |
| Open URL in a new tab | `node cdp-bridge.js newtab <url>` |
| Click element (CSS) | `node cdp-bridge.js click <css-selector>` |
| Click element by text | `node cdp-bridge.js clicktext "<visible-text>"` |
| Fill input field | `node cdp-bridge.js fill <selector> "value"` |
| Screenshot page | `node cdp-bridge.js shot [label]` |
| Accessibility snapshot | `node cdp-bridge.js snap` |
| Execute JavaScript | `node cdp-bridge.js eval "<javascript>"` |
| Get page title | `node cdp-bridge.js title` |
| Get current URL | `node cdp-bridge.js url` |

### Tab Management
| Action | Command |
|---|---|
| List all open tabs | `node cdp-bridge.js tabs` |
| Switch tab by index | `node cdp-bridge.js goto-tab <index>` |
| Focus tab by URL substring | `node cdp-bridge.js focus <url-substring>` |
| Find tab index by URL | `node cdp-bridge.js find <url-substring>` |
| Close matching tabs | `node cdp-bridge.js close-tabs <url-substring>` |
| Close all except active tab | `node cdp-bridge.js close-other` |

### Multi-Command Chaining (Single Connection)
Use `::` to run multiple commands in a single connection session without resetting the active tab context:

```bash
# Focus tab, print title, and take screenshot
node cdp-bridge.js focus github.com :: title :: shot github-overview

# Switch tab, navigate, and take screenshot
node cdp-bridge.js goto-tab 1 :: open https://example.com :: shot example-page
```

---

## 🧩 Programmatic Node.js API

You can also import `cdp-bridge.js` in custom scripts:

```javascript
const b = require('./cdp-bridge');

async function run() {
  await b.ensureReady();
  await b.connect();
  
  const page = await b.newTab('https://example.com');
  await b.fill('#search', 'AI agent');
  await b.click('button[type="submit"]');
  await b.screenshot('search-results');
  
  // Closes connection only — browser window remains open
  await page.context().browser().close();
}

run();
```

---

## 🛡️ Security & Privacy Guardrails

1. **Authentication & Credentials**:
   - Never auto-fill passwords or payment details without explicit confirmation.
   - Never log or display plain passwords in responses.
2. **CAPTCHA & 2FA**:
   - If a CAPTCHA or Two-Factor Authentication prompt appears, **stop immediately** and notify the user to solve it in their browser window.
	3. **Visual Verification**:
	   - The AI Agent cannot see screenshots directly. Always provide the saved screenshot path (`screenshots/cdp-xxx.png`) for user inspection. Never force-bring the browser window to the foreground unless the user explicitly requests to view it.
