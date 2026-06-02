# Source Info in Terminal + Settings Dropdown Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show source file/line provenance info in terminal output, with a settings dropdown to control destination (auto/clipboard/off, default off). Remove the clear button.

**Architecture:** Add source info display to terminal lines, add settings button in bottom-left corner of terminal header.

**Tech Stack:** TypeScript, vanilla DOM manipulation, CSS

---

## File Structure

- Modify: `frontend/studio.ts` — add settings state and UI, remove clear button listener
- Modify: `frontend/terminal.ts` — add `setSourceInfo()` method and display in terminal
- Modify: `frontend/studio.css` — style settings button and dropdown
- Modify: `frontend/index.html` — remove clear button, add settings button

---

## Tasks

### Task 1: Remove clear button from HTML

**Files:**
- Modify: `frontend/index.html:107-111`

- [ ] **Step 1: Edit index.html to remove clear button**

```html
<!-- Before -->
<div id="terminal-header">
  <span>Terminal</span>
  <div style="flex: 1;"></div>
  <button id="clear-terminal">clear</button>
</div>

<!-- After -->
<div id="terminal-header">
  <span>Terminal</span>
  <div style="flex: 1;"></div>
  <span id="terminal-settings" class="terminal-settings-btn" title="Terminal Settings">⚙</span>
</div>
```

---

### Task 2: Add settings button CSS

**Files:**
- Modify: `frontend/studio.css:600-625` (after terminal-header styles)

- [ ] **Step 1: Add CSS for settings button and dropdown**

```css
/* Settings button in terminal header */
.terminal-settings-btn {
  font-size: 12px;
  cursor: pointer;
  color: #6c7086;
  padding: 2px 6px;
  border-radius: 3px;
  user-select: none;
}

.terminal-settings-btn:hover {
  color: #cdd6f4;
  background: #313244;
}

/* Settings dropdown */
#terminal-settings-dropdown {
  position: absolute;
  bottom: 28px;
  right: 8px;
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 4px;
  padding: 4px 0;
  min-width: 140px;
  z-index: 100;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}

#terminal-settings-dropdown.hidden {
  display: none;
}

.terminal-settings-option {
  padding: 6px 12px;
  font-size: 12px;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #cdd6f4;
}

.terminal-settings-option:hover {
  background: #313244;
}

.terminal-settings-option.active {
  color: #89b4fa;
}

.terminal-settings-option .check {
  width: 14px;
}
```

---

### Task 3: Add settings state and UI in studio.ts

**Files:**
- Modify: `frontend/studio.ts:134` — remove clearBtn declaration
- Modify: `frontend/studio.ts:708` — remove clearBtn listener
- Modify: `frontend/studio.ts:680-690` — add initSettings call in init()

- [ ] **Step 1: Remove clearBtn from DOM Elements section**

```typescript
// Remove this line:
// const clearBtn = document.getElementById('clear-terminal') as HTMLButtonElement;
```

- [ ] **Step 2: Remove clearBtn listener in init()**

```typescript
// Remove this line:
// clearBtn.addEventListener('click', () => terminal.clear());
```

- [ ] **Step 3: Add settings state and UI after init() function definition**

Add this code block after line ~800 (before the final init() call):

```typescript
// Terminal settings
type SourceInfoMode = 'off' | 'auto' | 'clipboard';
let sourceInfoMode: SourceInfoMode = 'off';

function initSettings() {
  const settingsBtn = document.getElementById('terminal-settings');
  const dropdown = document.getElementById('terminal-settings-dropdown');

  if (!settingsBtn || !dropdown) return;

  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    dropdown.classList.add('hidden');
  });

  dropdown.querySelectorAll('.terminal-settings-option').forEach(el => {
    el.addEventListener('click', () => {
      const mode = el.getAttribute('data-mode') as SourceInfoMode;
      sourceInfoMode = mode;
      // Update active states
      dropdown.querySelectorAll('.terminal-settings-option').forEach(opt => {
        opt.classList.toggle('active', opt.getAttribute('data-mode') === mode);
      });
      dropdown.classList.add('hidden');
      // Persist preference
      localStorage.setItem('supergds-source-info', mode);
    });
  });

  // Load saved preference
  const saved = localStorage.getItem('supergds-source-info') as SourceInfoMode | null;
  if (saved) {
    sourceInfoMode = saved;
    dropdown.querySelectorAll('.terminal-settings-option').forEach(opt => {
      opt.classList.toggle('active', opt.getAttribute('data-mode') === saved);
    });
  }
}
```

- [ ] **Step 4: Call initSettings() in init() after terminal setup**

```typescript
// Add this after line ~693 (after loadPythonEnvironments()):
initSettings();
```

- [ ] **Step 5: Remove clear button from DOM elements**

The line `const clearBtn = document.getElementById('clear-terminal') as HTMLButtonElement;` should be removed.

---

### Task 4: Modify TerminalRenderer to accept and display source info

**Files:**
- Modify: `frontend/terminal.ts:13-29`

- [ ] **Step 1: Update addLine signature to accept optional source info**

```typescript
addLine(type: 'stdout' | 'stderr' | 'system', text: string, sourceInfo?: { file: string; line: number }): void {
  const el = document.createElement('div');
  el.className = type;
  const time = new Date().toLocaleTimeString('en-US', { hour12: false });
  const ts = document.createElement('span');
  ts.className = 'timestamp';
  ts.textContent = `[${time}] `;
  ts.style.color = '#6c7086';
  el.appendChild(ts);

  // Add source info if provided and mode is not 'off'
  if (sourceInfo && sourceInfoMode !== 'off') {
    const src = document.createElement('span');
    src.className = 'source-info';
    src.textContent = ` ${sourceInfo.file}:${sourceInfo.line}`;
    src.style.color = '#89b4fa';
    src.style.fontSize = '11px';
    src.style.marginRight = '8px';
    el.appendChild(src);

    if (sourceInfoMode === 'clipboard') {
      navigator.clipboard.writeText(`${sourceInfo.file}:${sourceInfo.line}`).catch(() => {});
    }
  }

  const textNode = document.createElement('span');
  textNode.textContent = text;
  el.appendChild(textNode);
  this.container.appendChild(el);
  if (this.autoScroll) {
    this.container.parentElement!.scrollTop = this.container.parentElement!.scrollHeight;
  }
}
```

- [ ] **Step 2: Add sourceInfoMode to class and constructor**

```typescript
export class TerminalRenderer {
  private container: HTMLElement;
  private autoScroll = true;
  public sourceInfoMode: 'off' | 'auto' | 'clipboard' = 'off';

  constructor(container: HTMLElement) {
    this.container = container;
    container.parentElement?.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = container.parentElement!;
      this.autoScroll = scrollHeight - scrollTop - clientHeight < 50;
    });
  }
```

---

### Task 5: Add settings HTML in index.html

**Files:**
- Modify: `frontend/index.html:107-112`

- [ ] **Step 1: Add settings dropdown to terminal header**

```html
<div id="terminal-header">
  <span>Terminal</span>
  <div style="flex: 1;"></div>
  <span id="terminal-settings" class="terminal-settings-btn" title="Terminal Settings">⚙</span>
  <div id="terminal-settings-dropdown" class="hidden">
    <div class="terminal-settings-option" data-mode="off">
      <span class="check">○</span> Off
    </div>
    <div class="terminal-settings-option" data-mode="auto">
      <span class="check">○</span> Auto
    </div>
    <div class="terminal-settings-option" data-mode="clipboard">
      <span class="check">○</span> Clipboard
    </div>
  </div>
</div>
```

---

### Task 6: Build and verify

- [ ] **Step 1: Build frontend**

Run: `cd /Users/fangruihuan/Desktop/aalto/superGDS/overgds && npm run build:frontend`

Expected: No errors, frontend/studio.js updated

- [ ] **Step 2: Test in browser**

Navigate to http://localhost:3000, open terminal, verify:
- No "clear" button visible
- Settings button (⚙) visible in terminal header
- Click settings shows dropdown with Off/Auto/Clipboard options
- Default is Off (empty localStorage or check initial state)

---

## Verification Checklist

- [ ] Clear button removed from terminal header
- [ ] Settings button (⚙) appears in terminal header bottom-right
- [ ] Settings dropdown shows three options: Off, Auto, Clipboard
- [ ] Clicking options closes dropdown and updates active state
- [ ] Source info not shown when mode is "off"
- [ ] Source info shown in terminal when mode is "auto" (future integration with run output)
- [ ] Clipboard copy works when mode is "clipboard"
- [ ] Preference persists across page reloads (localStorage)