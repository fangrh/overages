# Floating Panels (Overleaf-Style) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Editor-only, Viewer-only, and Split-view layout modes — exactly like Overleaf's four layout modes (Editor only, PDF only, Split view, Separate tab). Panels can be hidden/shown via toggle controls.

**Architecture:** The sidebar stays visible. The main content area has three layout modes controlled by a Layout button in the toolbar:
- **Editor Only** — full-width editor, viewer hidden
- **Viewer Only** — full-width viewer, editor hidden
- **Split View** — editor and viewer side-by-side (current behavior)

A toggle arrow in the viewer pane (Overleaf-style) hides the viewer to reveal full-width editor. Panel state persists in sessionStorage.

**Tech Stack:** Vanilla TypeScript + CSS. No framework dependencies.

---

## Overleaf UI Reference

From Overleaf docs, the four layout modes are:
1. **Split view** (default) — editor left, PDF right, both visible
2. **Editor only** — PDF hidden, full-width editor
3. **PDF only** — editor hidden, full-width PDF
4. **Separate tab** — open PDF in a new browser tab

Toggling between modes is done via:
- Small arrow button at the edge of each panel (Overleaf's collapse/expand)
- Layout menu in the toolbar (top-right area)
- The sidebar file list also collapses via thin divider bars

---

## File Map

| File | Change | Responsibility |
|------|--------|----------------|
| `frontend/index.html` | Modify | Add layout controls (button group in toolbar) |
| `frontend/studio.css` | Modify | Add layout modes, panel collapse/expand animations, toggle arrow |
| `frontend/studio.ts` | Modify | `setLayoutMode(mode)`, wire toolbar buttons, toggle arrows, sessionStorage |

---

## Task 1: Add layout toggle to toolbar

**Files:**
- Modify: `frontend/index.html` — toolbar section

- [ ] **Step 1: Add layout mode button group to toolbar, after the run/rebuild buttons**

In `#toolbar`, after `rebuild-btn`, add:

```html
    <div id="toolbar">
      <span id="current-file" class="current-file-label">No file open</span>
      <div style="flex: 1;"></div>
      <div id="layout-group">
        <button id="btn-layout" title="Layout (L)" class="layout-btn">
          <span id="layout-icon">⬚</span>
        </button>
        <div id="layout-menu" class="layout-menu hidden">
          <div class="layout-option active" data-mode="split">
            <span class="layout-icon-text">◫</span> Split View
          </div>
          <div class="layout-option" data-mode="editor">
            <span class="layout-icon-text">◧</span> Editor Only
          </div>
          <div class="layout-option" data-mode="viewer">
            <span class="layout-icon-text">◨</span> Viewer Only
          </div>
        </div>
      </div>
      <button id="run-btn" disabled>▶ Run</button>
      <button id="rebuild-btn" disabled>⟳ Rebuild</button>
    </div>
```

- [ ] **Step 2: Add a collapse toggle arrow to the viewer pane edge**

In `frontend/index.html`, inside `#viewer-pane`, add a collapse arrow as the first child:

```html
      <div id="viewer-pane">
        <!-- Overleaf-style collapse toggle -->
        <div id="viewer-collapse-toggle" class="collapse-toggle collapse-toggle-left" title="Hide Viewer (Ctrl+\)">
          <span>◀</span>
        </div>
        <iframe id="gds-viewer" src="/viewer/viewer.html"></iframe>
      </div>
```

- [ ] **Step 3: Verify build compiles**

Run: `npm run build 2>&1`
Expected: TypeScript compiles with no errors.

---

## Task 2: Add layout mode CSS

**Files:**
- Modify: `frontend/studio.css`

- [ ] **Step 1: Add layout mode system**

Replace the entire `#panels`, `#editor-pane`, `#viewer-pane`, `.resize-handle` CSS block with this new layout system:

```css
/* ============================================
   Layout Modes — Split / Editor-Only / Viewer-Only
   ============================================ */

#panels {
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

#editor-pane {
  flex: 1;
  min-width: 200px;
  display: flex;
  flex-direction: column;
  transition: flex 0.2s;
}

#viewer-pane {
  flex: 1;
  min-width: 200px;
  border-left: none;
  position: relative;
  transition: flex 0.2s, opacity 0.2s;
}

/* Viewer-only mode: editor pane collapses to 0 */
#panels.layout-editor-only #editor-pane {
  flex: 0;
  min-width: 0;
  overflow: hidden;
  opacity: 0;
}

/* Editor-only mode: viewer pane collapses to 0 */
#panels.layout-viewer-only #viewer-pane {
  flex: 0;
  min-width: 0;
  overflow: hidden;
  opacity: 0;
}

/* Collapse toggle arrow (Overleaf-style) */
.collapse-toggle {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 48px;
  background: #181825;
  border: 1px solid #313244;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  font-size: 10px;
  color: #6c7086;
  transition: background 0.15s, color 0.15s;
  user-select: none;
}

.collapse-toggle:hover {
  background: #313244;
  color: #cdd6f4;
}

.collapse-toggle-left {
  left: 0;
  border-radius: 0 4px 4px 0;
  border-left: none;
}

.collapse-toggle-right {
  right: 0;
  border-radius: 4px 0 0 4px;
  border-right: none;
}

/* Arrow rotates based on viewer visibility */
#panels.layout-editor-only .collapse-toggle-left span {
  transform: rotate(180deg);
  display: inline-block;
}
```

- [ ] **Step 2: Add layout button and menu CSS**

Add after `.resize-handle` styles (now deleted):

```css
/* Layout Button */
#layout-group {
  position: relative;
}

.layout-btn {
  background: #45475a;
  border: 1px solid #585b70;
  border-radius: 4px;
  color: #cdd6f4;
  cursor: pointer;
  padding: 4px 8px;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 4px;
}

.layout-btn:hover {
  background: #585b70;
}

#layout-menu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  background: #1e1e2e;
  border: 1px solid #313244;
  border-radius: 6px;
  padding: 4px 0;
  min-width: 180px;
  z-index: 200;
  box-shadow: 0 4px 16px rgba(0,0,0,0.4);
}

#layout-menu.hidden {
  display: none;
}

.layout-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 14px;
  font-size: 13px;
  cursor: pointer;
  color: #cdd6f4;
}

.layout-option:hover {
  background: #313244;
}

.layout-option.active {
  color: #89b4fa;
  background: rgba(137, 180, 250, 0.1);
}

.layout-icon-text {
  font-size: 14px;
  width: 16px;
  text-align: center;
}
```

- [ ] **Step 3: Delete old `.resize-handle` CSS**

Remove the `.resize-handle` rule block from studio.css (lines ~300-314). It is no longer needed.

- [ ] **Step 4: Run dev server and verify panels render correctly**

Three modes should work:
1. Split view — editor and viewer side by side
2. Editor Only — viewer pane width = 0, editor fills full width
3. Viewer Only — editor pane width = 0, viewer fills full width

---

## Task 3: Wire up layout mode logic in studio.ts

**Files:**
- Modify: `frontend/studio.ts`

- [ ] **Step 1: Add layout mode constants and state variables**

At the top of the file (after existing state variables, around line 30), add:

```typescript
type LayoutMode = 'split' | 'editor' | 'viewer';

let layoutMode: LayoutMode = 'split';
const panelsContainer = document.getElementById('panels')!;
const viewerPane = document.getElementById('viewer-pane')!;
const collapseToggle = document.getElementById('viewer-collapse-toggle')!;
const layoutBtn = document.getElementById('btn-layout')!;
const layoutMenu = document.getElementById('layout-menu')!;

function setLayoutMode(mode: LayoutMode) {
  layoutMode = mode;
  // Update panel class
  panelsContainer.classList.remove('layout-split', 'layout-editor-only', 'layout-viewer-only');
  panelsContainer.classList.add(`layout-${mode}`);
  // Update menu active state
  layoutMenu.querySelectorAll('.layout-option').forEach(el => {
    el.classList.toggle('active', el.getAttribute('data-mode') === mode);
  });
  // Persist
  sessionStorage.setItem('supergds-layout', mode);
}
```

- [ ] **Step 2: Restore layout mode from sessionStorage on load**

At the end of `init()`, after the workspace restore, add:

```typescript
  // Restore layout mode from sessionStorage
  const savedLayout = sessionStorage.getItem('supergds-layout') as LayoutMode | null;
  setLayoutMode(savedLayout || 'split');
```

- [ ] **Step 3: Wire up layout menu click handler**

In `init()`, after the event listener setup, add:

```typescript
  // Layout mode menu
  layoutBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    layoutMenu.classList.toggle('hidden');
  });

  document.addEventListener('click', () => {
    layoutMenu.classList.add('hidden');
  });

  layoutMenu.querySelectorAll('.layout-option').forEach(el => {
    el.addEventListener('click', () => {
      const mode = el.getAttribute('data-mode') as LayoutMode;
      setLayoutMode(mode);
      layoutMenu.classList.add('hidden');
    });
  });
```

- [ ] **Step 4: Wire up collapse toggle arrow**

Add after the layout menu setup:

```typescript
  // Overleaf-style collapse arrow — toggles between split and editor-only
  collapseToggle.addEventListener('click', () => {
    if (layoutMode === 'split') {
      setLayoutMode('editor');
    } else {
      setLayoutMode('split');
    }
  });
```

- [ ] **Step 5: Keyboard shortcut Ctrl+\ toggles viewer**

Add after the collapse toggle wiring:

```typescript
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === '\\') {
      e.preventDefault();
      if (layoutMode === 'split') setLayoutMode('editor');
      else setLayoutMode('split');
    }
  });
```

- [ ] **Step 6: Verify build compiles without errors**

Run: `npm run build 2>&1`
Expected: TypeScript compiles with no errors.

---

## Task 4: Verify end-to-end

**Files:**
- Test: `tests/e2e/run-e2e.test.ts`

- [ ] **Step 1: Run the existing E2E test**

Run: `npx playwright test tests/e2e/run-e2e.test.ts --reporter=line`
Expected: PASS — the floating panel architecture doesn't break the core Run workflow.

---

## Task 5: Commit

```bash
git add frontend/index.html frontend/studio.css frontend/studio.ts
git commit -m "feat: Overleaf-style layout modes — editor/viewer toggle, split/editor-only/viewer-only

- Add layout menu button to toolbar (Split / Editor Only / Viewer Only)
- Overleaf-style collapse arrow on viewer pane edge (toggles viewer visibility)
- Keyboard shortcut Ctrl+\ toggles between split and editor-only
- Layout mode persists in sessionStorage across page refreshes
- Remove split-pane ResizeHandle (no longer needed)
- Refactor panels CSS for layout-mode class switching

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Design Decisions

- **"Separate tab" mode not implemented in v1** — requires `window.open()` with postMessage coordination; can be added later
- **No floating/draggable windows** — Overleaf actually uses collapsible panes, not floating windows. The panels stay docked, just resize between 0 and full width
- **Terminal stays fixed** — not affected by layout mode, consistent with Overleaf's terminal behavior
- **iframe and Monaco stay initialized** when hidden — no destruction/recreation on toggle
