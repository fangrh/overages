# Overleaf-Style Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match Overleaf's editor/PDF layout — collapsible panels, drag-resizable split, layout menu, × to close viewer, collapse arrow on pane edge.

**Architecture:** CSS class switching on `#panels` controls three layout modes (split/editor-only/viewer-only). Tab bar above panels. Toolbar layout menu. Both iframe and Monaco stay initialized when hidden.

**Tech Stack:** Vanilla TypeScript + CSS. No framework dependencies.

---

## File Map

| File | Change | Responsibility |
|------|--------|----------------|
| `frontend/index.html` | Modify | Tab bar, toolbar with layout menu, viewer collapse toggle |
| `frontend/studio.css` | Modify | Tab bar styles, layout modes, collapse arrow, resize handle |
| `frontend/studio.ts` | Modify | Wire tab close, layout menu, collapse toggle, keyboard shortcuts |

---

## Task 1: Fix HTML — tab bar and toolbar

**Files:** Modify `frontend/index.html`

- [ ] **Step 1: Remove × close button from Editor tab, keep only on Viewer tab**

In `#tab-bar`, change the editor-tab to NOT have a close button, keep only the viewer-tab close button:

```html
<div id="tab-bar">
  <div id="editor-tab" class="tab active">
    <span class="tab-label">Editor</span>
  </div>
  <div id="viewer-tab" class="tab active">
    <span class="tab-label">PDF</span>
    <button class="tab-close" id="viewer-tab-close" title="Close Viewer">×</button>
  </div>
</div>
```

- [ ] **Step 2: Add Layout dropdown menu to toolbar**

In `#toolbar`, before `<button id="run-btn">`, add:

```html
<div id="layout-group">
  <button id="btn-layout" class="layout-btn" title="Layout">
    <span id="layout-icon">⬚</span>
  </button>
  <div id="layout-menu" class="layout-menu hidden">
    <div class="layout-menu-header">Layout Options</div>
    <div class="layout-option" data-mode="split">
      <span class="layout-icon-text">◫</span> Split View
    </div>
    <div class="layout-option" data-mode="editor">
      <span class="layout-icon-text">◧</span> Editor Only
    </div>
    <div class="layout-option" data-mode="viewer">
      <span class="layout-icon-text">◨</span> Viewer Only
    </div>
    <div class="layout-menu-divider"></div>
    <div class="layout-option" id="open-viewer-new-tab">
      <span class="layout-icon-text">⧉</span> Open Viewer in New Tab
    </div>
  </div>
</div>
```

- [ ] **Step 3: Verify build compiles**

Run: `npm run build 2>&1`
Expected: TypeScript compiles with no errors.

---

## Task 2: Fix CSS — tab bar, layout menu, collapse arrow

**Files:** Modify `frontend/studio.css`

- [ ] **Step 1: Add layout menu header and divider styles**

Add after the `.layout-icon-text` block (around line 519):

```css
/* Layout menu header */
.layout-menu-header {
  padding: 8px 14px 4px;
  font-size: 11px;
  font-weight: 600;
  color: #6c7086;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.layout-menu-divider {
  height: 1px;
  background: #313244;
  margin: 4px 0;
}
```

- [ ] **Step 2: Make collapse arrow visible/hidden based on layout mode**

The `#panels.layout-editor-only .collapse-toggle-left` rule currently only rotates the arrow. Add to it:

```css
/* In layout-editor-only, show the expand arrow on the viewer pane edge */
#panels.layout-editor-only .collapse-toggle-left {
  opacity: 1;
  transform: translateY(-50%) rotate(180deg);
}

/* In split mode, show the collapse arrow */
#panels.layout-split .collapse-toggle-left {
  opacity: 1;
  transform: translateY(-50%) rotate(0deg);
}

/* In viewer-only, hide the collapse toggle */
#panels.layout-viewer-only .collapse-toggle-left {
  opacity: 0;
  pointer-events: none;
}
```

Also update the base `.collapse-toggle` rule to add `opacity: 1` by default:

```css
.collapse-toggle {
  /* ... existing properties ... */
  opacity: 1;
}
```

- [ ] **Step 3: Verify CSS by checking rendered appearance**

Run dev server and visually inspect:
- Split view: ◀ arrow visible on viewer pane edge
- Editor Only: ▶ arrow visible on viewer pane edge (collapsed, but arrow shows it can expand)
- Viewer Only: no arrow visible

---

## Task 3: Wire up all layout logic in studio.ts

**Files:** Modify `frontend/studio.ts`

- [ ] **Step 1: Add DOM element references for tab bar elements**

After the existing DOM element declarations (around line 95), add:

```typescript
// Tab bar
const editorTab = document.getElementById('editor-tab');
const viewerTab = document.getElementById('viewer-tab');
const viewerTabClose = document.getElementById('viewer-tab-close');
```

Also update the layout mode DOM references to remove the non-existent ones. Remove `layoutBtn` and `layoutMenu` from the non-null assertions since they're inside `#layout-group` which now exists in the HTML.

- [ ] **Step 2: Fix setLayoutMode to update tab active states**

Replace the `setLayoutMode` function with this updated version that also updates tab `active` classes:

```typescript
function setLayoutMode(mode: LayoutMode) {
  layoutMode = mode;
  // Update panel class — CSS uses full names
  const layoutClass = mode === 'editor' ? 'layout-editor-only' :
                      mode === 'viewer' ? 'layout-viewer-only' : 'layout-split';
  panelsContainer.classList.remove('layout-split', 'layout-editor-only', 'layout-viewer-only');
  panelsContainer.classList.add(layoutClass);
  // Update tab active states
  if (editorTab && viewerTab) {
    const editorActive = mode !== 'viewer';
    editorTab.classList.toggle('active', editorActive);
    viewerTab.classList.toggle('active', mode !== 'editor');
  }
  // Update menu active state
  if (layoutMenu) {
    layoutMenu.querySelectorAll('.layout-option').forEach(el => {
      el.classList.toggle('active', el.getAttribute('data-mode') === mode);
    });
  }
  // Persist
  sessionStorage.setItem('supergds-layout', mode);
}
```

- [ ] **Step 3: Wire up viewer tab × close button**

Add after the collapse toggle event listener setup in `init()`:

```typescript
// Viewer tab × button — closes viewer (switch to editor-only)
if (viewerTabClose) {
  viewerTabClose.addEventListener('click', (e) => {
    e.stopPropagation();
    setLayoutMode('editor');
  });
}
```

- [ ] **Step 4: Wire up layout menu options (split/editor/viewer)**

The existing layout menu wiring at lines 633-641 uses `layoutMenu.querySelectorAll('.layout-option')` but the `data-mode` attributes are on `.layout-option` divs — this should already work. Verify and add "Open Viewer in New Tab" handler.

Add after the existing `.layout-option` click handlers:

```typescript
// Open viewer in new tab
const openNewTabOption = document.getElementById('open-viewer-new-tab');
if (openNewTabOption) {
  openNewTabOption.addEventListener('click', () => {
    window.open('/viewer/viewer.html', '_blank');
    layoutMenu?.classList.add('hidden');
  });
}
```

- [ ] **Step 5: Update keyboard shortcuts**

Replace the existing keyboard shortcut handler with:

```typescript
// Keyboard shortcuts — Ctrl+\ (toggle), Ctrl+← (editor), Ctrl+→ (viewer), Ctrl+↓ (split)
document.addEventListener('keydown', (e) => {
  if (!e.ctrlKey) return;
  if (e.key === '\\') {
    e.preventDefault();
    if (layoutMode === 'split') setLayoutMode('editor');
    else setLayoutMode('split');
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    setLayoutMode('editor');
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    setLayoutMode('viewer');
  } else if (e.key === 'ArrowDown') {
    e.preventDefault();
    setLayoutMode('split');
  }
});
```

- [ ] **Step 6: Fix ResizeHandle to work in split mode only**

Update the ResizeHandle's `updateHandlePosition` to only show/resize in split mode. Add to the init() after creating the ResizeHandle:

```typescript
// Only show resize handle in split mode
const resizeHandleEl = document.getElementById('resize-handle');
if (resizeHandleEl) {
  resizeHandleEl.style.display = layoutMode === 'split' ? '' : 'none';
}
```

Wrap the ResizeHandle creation in a check to only create it when in split mode, and call this display update on layout mode changes.

- [ ] **Step 7: Verify build compiles**

Run: `npm run build 2>&1`
Expected: TypeScript compiles with no errors.

---

## Task 4: End-to-end verification

**Files:** `tests/e2e/run-e2e.test.ts`

- [ ] **Step 1: Run the existing E2E test**

Run: `npx playwright test tests/e2e/run-e2e.test.ts --reporter=line`
Expected: PASS — layout changes don't break the core Run workflow.

---

## Task 5: Commit

```bash
git add frontend/index.html frontend/studio.css frontend/studio.ts
git commit -m "feat: Overleaf-style layout — tab bar with viewer close, layout menu, collapsible panels, keyboard shortcuts

- Tab bar with Editor and PDF tabs; only PDF tab has × close button
- Toolbar layout dropdown: Split / Editor Only / Viewer Only / Open Viewer in New Tab
- Collapse toggle arrow on viewer pane edge (◀ to hide, ▶ to show)
- Draggable resize handle between editor and viewer (VS Code-style)
- Keyboard shortcuts: Ctrl+\ (toggle), Ctrl+← (editor), Ctrl+→ (viewer), Ctrl+↓ (split)
- Layout mode persists in sessionStorage
- Collapse arrow visibility and rotation updated per layout mode

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"
```

---

## Design Decisions

- **No × on Editor tab** — matches Overleaf (only PDF pane has close). Editor can be hidden via layout menu or ◀ arrow.
- **Viewer × button → editor-only mode** — doesn't destroy the viewer, just hides it.
- **Monaco and iframe stay initialized** when hidden — no destroy/recreate on toggle.
- **ResizeHandle hidden in non-split modes** — only shown when both panes are visible.
- **"Open Viewer in New Tab"** — `window.open('/viewer/viewer.html', '_blank')` with no postMessage coordination in v1 (data would not sync in the new tab).
