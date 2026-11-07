---
name: browser-cdp-skill
description: Universal browser automation via Chrome DevTools Protocol (CDP). Controls the user's real browser window (Microsoft Edge, Google Chrome, Brave, Arc, Vivaldi) without opening duplicate windows.
---

# Universal Browser CDP Skill

Use this skill whenever a user asks to **open, navigate, inspect, click, fill forms, or automate websites**.

This skill attaches to the user's real browser window via **Chrome DevTools Protocol (CDP)** on port `9222`. It ensures all interactions happen in a single, existing browser window instead of spawning annoying isolated browser instances.

---

## ⚡ Key Principles & Anti-Window Spam Rule

1. **Re-use Existing Window**: Never launch a new browser instance if one is already running with CDP.
2. **Chromium Universal**: Supports Microsoft Edge, Google Chrome, Brave, Arc, and Vivaldi out of the box.
3. **Transparent to User**: The user sees the actions live in their browser.
4. **Idempotent Connection**: Scripts automatically detect port `9222` and auto-launch the configured browser only when necessary.

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
   > *"Skill browser belum dikonfigurasi. Terdeteksi browser berikut di sistem: [Edge, Chrome, Brave]. Kamu mau pakai browser yang mana untuk otomatisasi?"*
3. Once the user replies, save their choice:
   ```bash
   node scripts/cdp-bridge.js set-browser <edge|chrome|brave|arc|vivaldi>
   ```
4. Inform the user:
   > *"Browser default telah disetel ke `<choice>`. Kamu bisa ganti kapan saja dengan menjalankan `node scripts/cdp-bridge.js set-browser <nama>` atau bilang ke saya."*

---

## 🔄 How to Switch Browsers Later

The user can change their preferred browser at any time via:

1. **Agent Natural Language**: User says *"Ganti browser ke Chrome"* -> Agent runs:
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
   - The AI Agent cannot see screenshots directly. Always provide the saved screenshot path or bring the browser tab to the front for the user to verify.
