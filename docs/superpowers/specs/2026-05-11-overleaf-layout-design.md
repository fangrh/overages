# Overleaf-Style Layout for superGDS Studio

> **Spec Status:** Draft
> **Created:** 2026-05-11
> **Owner:** superGDS Studio

## Problem Statement

The current layout has collapsible panels but doesn't match Overleaf's interaction model. User wants the Python editor (like LaTeX) and GDS viewer (like PDF) to behave exactly like Overleaf — tabs with close buttons, collapse arrows at panel edges, draggable resize handle, and a layout toggle menu.

## Overleaf Reference

From analyzing `overleaf/overleaf` (GitHub), the key components are:

| Component | File | Purpose |
|-----------|------|---------|
| `MainLayout` | `ide-react/components/layout/main-layout.tsx` | Root layout using `react-resizable-panels` |
| `HorizontalResizeHandle` | `ide-react/components/resize/horizontal-resize-handle.tsx` | Draggable divider |
| `HorizontalToggler` | `ide-react/components/resize/horizontal-toggler.tsx` | ◀/▶ collapse arrow at panel edge |
| `ChangeLayoutButton` | `ide-react/components/toolbar/change-layout-button.tsx` | Toolbar layout menu |
| `ChangeLayoutOptions` | `ide-react/components/toolbar/change-layout-options.tsx` | Dropdown: Split / Editor Only / PDF Only / Detach |

Overleaf uses **4 modes** (via `pdfLayout: 'sideBySide' | 'flat'` and `view: 'editor' | 'pdf' | 'file' | 'history'`):
- **Split view** — editor + PDF side by side
- **Editor only** — PDF hidden (`pdfLayout: 'flat'` + `view: 'editor'`)
- **PDF only** — editor hidden (`pdfLayout: 'flat'` + `view: 'pdf'`)
- **Detach PDF** — open PDF in new tab (`window.open` + postMessage coordination)

Overleaf uses `react-resizable-panels` library. The `Panel` component has `collapsible` prop.

---

## Design

### Architecture

Three independent layout modes controlled by CSS class switching on `#panels`:

| Mode | Class on `#panels` | Editor | Viewer | Use Case |
|------|-------------------|--------|--------|----------|
| **Split** | `layout-split` | flex: 1, resizable | flex: 1, resizable | Default — both visible |
| **Editor Only** | `layout-editor-only` | flex: 1 | collapsed to 0 | Focus on editing |
| **Viewer Only** | `layout-viewer-only` | collapsed to 0 | flex: 1 | Focus on viewing GDS |

### Components

#### 1. Tab Bar (Overleaf-style, above `#panels`)

```html
<div id="tab-bar">
  <div class="tab active" id="editor-tab">
    <span class="tab-label">Editor</span>
  </div>
  <div class="tab active" id="viewer-tab">
    <span class="tab-label">PDF</span>
    <button class="tab-close" id="viewer-tab-close" title="Close Viewer">×</button>
  </div>
</div>
```

- Tabs sit between the toolbar and the `#panels` container
- Only the **viewer tab** has a close (×) button (matches Overleaf — only PDF pane has a close)
- Clicking the × on the viewer tab → switches to `layout-editor-only`
- When in `layout-editor-only` or `layout-viewer-only`, the inactive tab loses `active` class
- Tab bar persists even when panes are collapsed (like VS Code tab bar)

#### 2. Collapsible Panels (Editor + Viewer)

```html
<div id="panels" class="layout-split">
  <div id="editor-pane">...</div>
  <div id="resize-handle" class="resize-handle"></div>
  <div id="viewer-pane">
    <div id="viewer-collapse-toggle" class="collapse-toggle collapse-toggle-left">◀</div>
    <iframe id="gds-viewer">...</iframe>
  </div>
</div>
```

- Draggable `resize-handle` between editor and viewer (always present in split mode)
- `viewer-collapse-toggle` arrow at the LEFT edge of viewer pane (same position as Overleaf's ◀ arrow)
- Clicking ◀ → switches to `layout-editor-only` (hides viewer, shows full-width editor)
- Clicking ▶ (shown when viewer is hidden) → switches back to `layout-split`
- The `collapse-toggle` arrow is hidden in non-split modes (editor-only, viewer-only)

#### 3. Toolbar Layout Menu

```
┌──────────────────────────────────────────────────────────────┐
│ [current file]                    [Layout ▾] [▶ Run] [⟳]  │
└──────────────────────────────────────────────────────────────┘
```

The **Layout button** in the toolbar opens a dropdown menu with 4 options (replaces the `#btn-layout` button already in the toolbar from previous work):

```
┌─────────────────────────┐
│ Layout Options          │
├─────────────────────────┤
│ ◫  Split View      ⌃↓  │
│ ◧  Editor Only     ⌃←  │
│ ◨  Viewer Only     ⌃→  │
├─────────────────────────┤
│ ⧉  Open Viewer in New Tab  │
└─────────────────────────┘
```

- **Split View** — both panes, drag-resizable
- **Editor Only** — full-width editor, viewer hidden
- **Viewer Only** — full-width viewer, editor hidden
- **Open Viewer in New Tab** — `window.open('/viewer/viewer.html')` with `postMessage` coordination

#### 4. CSS Layout System

```css
/* Split mode — both panes equal width, drag-resizable */
#panels.layout-split #editor-pane { flex: 1; min-width: 200px; }
#panels.layout-split #viewer-pane { flex: 1; min-width: 200px; }

/* Editor-only — viewer collapses to 0 */
#panels.layout-editor-only #viewer-pane { flex: 0; min-width: 0; overflow: hidden; opacity: 0; }
#panels.layout-editor-only #editor-pane { flex: 1; }
#panels.layout-editor-only .resize-handle { display: none; }
#panels.layout-editor-only .collapse-toggle { display: none; }

/* Viewer-only — editor collapses to 0 */
#panels.layout-viewer-only #editor-pane { flex: 0; min-width: 0; overflow: hidden; opacity: 0; }
#panels.layout-viewer-only #viewer-pane { flex: 1; }
#panels.layout-viewer-only .resize-handle { display: none; }
#panels.layout-viewer-only .collapse-toggle { display: none; }
```

#### 5. ResizeHandle (restored from previous work)

The existing `ResizeHandle` class in `studio.ts` controls panel widths via mouse drag. It sets `width` on `#editor-pane` and positions `#resize-handle` via `left`. When not in split mode, the resize handle is hidden.

#### 6. Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+\` | Toggle split ↔ editor-only |
| `Ctrl+←` | Editor only |
| `Ctrl+→` | Viewer only |
| `Ctrl+↓` | Split view |

---

## Interaction Flows

### Hide Viewer (close PDF)
1. User clicks × on viewer tab **OR** ◀ collapse arrow on viewer pane edge
2. `setLayoutMode('editor')` → `layout-editor-only`
3. Viewer pane collapses to `flex: 0`, `opacity: 0`
4. Tab bar: editor tab stays `active`, viewer tab loses `active`
5. Collapse toggle arrow hidden

### Show Viewer (reopen PDF)
1. User clicks ▶ on the viewer pane edge **OR** uses Layout menu → Split View
2. `setLayoutMode('split')` → `layout-split`
3. Both panes restore to `flex: 1`
4. Tab bar: both tabs `active`
5. Collapse toggle arrow shows ◀ (viewer is open)

### Drag Resize (VS Code-style)
1. User drags `resize-handle` (the 5px divider between panes)
2. `ResizeHandle` updates `width` on `#editor-pane` and `left` on `#resize-handle`
3. Viewer pane continues to fill remaining space via `flex: 1`
4. Works only in `layout-split` mode

---

## Files to Modify

| File | Changes |
|------|---------|
| `frontend/index.html` | Add `#tab-bar`, remove old `#layout-group`, add viewer-tab-close button, keep collapse toggle |
| `frontend/studio.css` | Add tab bar styles, restore `.resize-handle`, adjust layout-mode CSS, collapse arrow visibility |
| `frontend/studio.ts` | Wire up tab close handler, fix `setLayoutMode` to add full class names (`layout-editor-only`, etc.), restore ResizeHandle init, add keyboard shortcuts, remove old layout menu button code |

---

## Constraints

- Monaco editor and GDS viewer iframe stay **initialized** when hidden — no destroy/recreate on toggle
- Panel state persists in `sessionStorage` (`supergds-layout`)
- Terminal stays visible at bottom, unaffected by layout mode
- No floating windows — all panes stay docked, just resize between 0 and full width

---

## Status

Draft — pending user review.