import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';

// Use window-based access for classes exposed by other chunks
// These are set by their respective modules after loading

type MonacoEditor = any;

interface ComponentSelection {
  provId: string;
  layer: string;
  bbox: number[];
  provenance: {
    file?: string;
    line?: number | string;
    function?: string;
    call_chain?: Array<{ file?: string; line?: number | string; function?: string }>;
    [key: string]: unknown;
  };
}

interface FileNode {
  name: string;
  path: string;
  isFolder: boolean;
  children?: FileNode[];
}

let editor: MonacoEditor;
let bridge: any;
let terminal: any;
let currentFile: string | null = null;
let workspacePath: string | null = null;

// --- Cookie persistence for studio settings ---
// Persist ONLY the selected project, the selected Python environment, and the
// open script, so a page refresh returns to that exact state. Cookies (not
// sessionStorage) are used so the state survives a full browser restart. The
// JS bundle is never cached via cookies — it revalidates on every refresh, so
// dev-mode code changes always appear.
const STUDIO_COOKIE_PREFIX = 'studio-';
const STUDIO_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
function setStudioCookie(name: string, value: string): void {
  const enc = encodeURIComponent(value);
  document.cookie = `${STUDIO_COOKIE_PREFIX}${name}=${enc}; max-age=${STUDIO_COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
}
function getStudioCookie(name: string): string | null {
  const key = `${STUDIO_COOKIE_PREFIX}${name}=`;
  for (const part of document.cookie.split(';')) {
    const t = part.trim();
    if (t.startsWith(key)) return decodeURIComponent(t.slice(key.length));
  }
  return null;
}
function clearStudioCookie(name: string): void {
  document.cookie = `${STUDIO_COOKIE_PREFIX}${name}=; max-age=0; path=/; SameSite=Lax`;
}

// xterm.js terminal
let xterm: any = null;
let xtermFitAddon: any = null;
let xtermWs: WebSocket | null = null;
let activeTerminalTab: string = 'terminal';
let tabManager: any = null; // TabManager instance for bottom panel

/**
 * Update the Source panel in the bottom panel with provenance from selected components.
 */
function updateSourcePanel(panel: HTMLElement, components: any[]): void {
  if (!components || components.length === 0) {
    panel.innerHTML = '<p class="placeholder">Click a polygon in the GDS viewer to inspect source</p>';
    return;
  }

  let html = '';
  for (let i = 0; i < components.length; i++) {
    const comp = components[i];
    const prov = comp.provenance || {};
    if (i > 0) html += '<div style="height:1px;background:#313244;margin:6px 0;"></div>';
    html += '<div style="margin-bottom:4px;">';
    if (prov.instance_name) {
      html += `<div class="kv"><span class="key" style="color:#6c7086;min-width:90px;text-align:right;display:inline-block;margin-right:8px;">Name:</span><span style="color:#f9e2af;">${prov.instance_name}</span></div>`;
    }
    if (prov.file) {
      const shortFile = prov.file.replace(/\\/g, '/').split('/').pop() || prov.file;
      html += `<div class="kv"><span class="key" style="color:#6c7086;min-width:90px;text-align:right;display:inline-block;margin-right:8px;">File:</span><span class="source-jump" data-file="${prov.file}" data-line="${prov.line || 1}" style="color:#89b4fa;cursor:pointer;text-decoration:underline;">${shortFile}:${prov.line || '?'}</span></div>`;
    }
    if (prov.call_chain && prov.call_chain.length > 0) {
      html += `<div class="kv"><span class="key" style="color:#6c7086;min-width:90px;text-align:right;display:inline-block;margin-right:8px;">Call chain:</span><span style="color:#cba6f7;">${prov.call_chain.join(' → ')}</span></div>`;
    }
    if (prov.layer_name) {
      html += `<div class="kv"><span class="key" style="color:#6c7086;min-width:90px;text-align:right;display:inline-block;margin-right:8px;">Layer:</span><span>${prov.layer_name}</span></div>`;
    }
    html += '</div>';
  }

  panel.innerHTML = html;

  // Make file links clickable
  panel.querySelectorAll('.source-jump').forEach((el) => {
    (el as HTMLElement).addEventListener('click', () => {
      const file = (el as HTMLElement).getAttribute('data-file')!;
      const line = parseInt((el as HTMLElement).getAttribute('data-line') || '1', 10);
      const studio = (window as any).studio;
      studio?.openFile(file)?.then(() => {
        studio?.jumpToLine?.(line);
      });
    });
  });
}

class ResizeHandle {
  private handle: HTMLElement;
  private editorPane: HTMLElement;
  private viewerPane: HTMLElement;
  private dragging = false;
  private startX = 0;
  private startEditorWidth = 0;

  constructor(handleId: string, editorPaneId: string, viewerPaneId: string) {
    this.handle = document.getElementById(handleId)!;
    this.editorPane = document.getElementById(editorPaneId)!;
    this.viewerPane = document.getElementById(viewerPaneId)!;
    this.setupEvents();
    this.updateHandlePosition();
  }

  private setupEvents(): void {
    this.handle.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.startX = e.clientX;
      this.startEditorWidth = this.editorPane.getBoundingClientRect().width;
      this.handle.classList.add('dragging');
      // Disable flex transition during drag so panels track handle position in real-time
      this.editorPane.parentElement!.classList.add('no-transition');
      // Capture pointer so mouseup fires even when cursor leaves the window
      this.handle.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    });

    // With pointer capture, events route directly to the handle element
    this.handle.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.startX;
      const newWidth = this.startEditorWidth + dx;
      const containerWidth = this.editorPane.parentElement!.getBoundingClientRect().width;
      const minWidth = 200;
      const handleWidth = 5;
      // Clamp editor width so viewer always has at least minWidth
      const clamped = Math.max(minWidth, Math.min(containerWidth - minWidth - handleWidth, newWidth));
      const remainingWidth = containerWidth - clamped - handleWidth;
      this.editorPane.style.flex = 'none';
      this.editorPane.style.width = `${clamped}px`;
      this.viewerPane.style.flex = 'none';
      this.viewerPane.style.width = `${remainingWidth}px`;
      this.handle.style.left = `${clamped}px`;
      // Force iframe to recalculate its content size by triggering a reflow
      const iframe = document.getElementById('gds-viewer') as HTMLIFrameElement;
      if (iframe) {
        iframe.style.width = '99%';
        void iframe.offsetWidth;
        iframe.style.width = '';
      }
    });

    this.handle.addEventListener('pointerup', (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.handle.classList.remove('dragging');
      // Re-enable flex transition
      this.editorPane.parentElement!.classList.remove('no-transition');
      // Lock both panels at their current widths
      const remainingWidth = this.viewerPane.parentElement!.getBoundingClientRect().width - parseFloat(this.handle.style.left || '0');
      this.viewerPane.style.flex = 'none';
      this.viewerPane.style.width = `${remainingWidth}px`;
      this.handle.releasePointerCapture(e.pointerId);
      // Notify viewer iframe to update its map size
      const iframe = document.getElementById('gds-viewer') as HTMLIFrameElement;
      iframe?.contentWindow?.postMessage({ type: 'resize' }, '*');
    });

    this.handle.addEventListener('pointercancel', (e) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.handle.classList.remove('dragging');
      this.editorPane.parentElement!.classList.remove('no-transition');
      this.handle.releasePointerCapture(e.pointerId);
    });
  }

  isDragging(): boolean {
    return this.dragging;
  }

  updateHandlePosition(): void {
    const editorRect = this.editorPane.getBoundingClientRect();
    this.handle.style.left = `${editorRect.width}px`;
  }
}

/**
 * Vertical resize handle for the bottom console (#terminal).
 * Drag the handle up to grow the console, down to shrink it.
 * #panels above is flex:1, so it absorbs the space given up or taken back.
 * Monaco auto-relayouts (automaticLayout:true); xterm is refit and the
 * viewer map is notified on drag.
 */
class TerminalResizeHandle {
  private handle: HTMLElement;
  private terminal: HTMLElement;
  private container: HTMLElement;
  private dragging = false;
  private startY = 0;
  private startHeight = 0;

  constructor(handleId: string, terminalId: string, containerId: string) {
    this.handle = document.getElementById(handleId)!;
    this.terminal = document.getElementById(terminalId)!;
    this.container = document.getElementById(containerId)!;
    this.setupEvents();
  }

  private setupEvents(): void {
    this.handle.addEventListener('pointerdown', (e) => {
      this.dragging = true;
      this.startY = e.clientY;
      this.startHeight = this.terminal.getBoundingClientRect().height;
      this.handle.classList.add('dragging');
      this.handle.setPointerCapture(e.pointerId);
      e.preventDefault();
      e.stopPropagation();
    });

    this.handle.addEventListener('pointermove', (e) => {
      if (!this.dragging) return;
      // Dragging the handle UP (negative dy) grows the console.
      const dy = this.startY - e.clientY;
      const newHeight = this.startHeight + dy;
      const containerHeight = this.container.getBoundingClientRect().height;
      const minHeight = 80;             // header + a few terminal rows
      const maxHeight = containerHeight - 120; // leave room for editor/viewer
      const clamped = Math.max(minHeight, Math.min(maxHeight, newHeight));
      this.terminal.style.height = `${clamped}px`;
      // Refit xterm live so glyphs reflow during the drag
      if (xtermFitAddon && xterm) {
        try { xtermFitAddon.fit(); } catch {}
      }
    });

    const endDrag = (e: PointerEvent) => {
      if (!this.dragging) return;
      this.dragging = false;
      this.handle.classList.remove('dragging');
      this.handle.releasePointerCapture(e.pointerId);
      // Final refit + tell the pty the new terminal dimensions
      if (xtermFitAddon && xterm) {
        try {
          xtermFitAddon.fit();
          const dims = xtermFitAddon.proposeDimensions();
          if (dims && xtermWs?.readyState === WebSocket.OPEN) {
            xtermWs.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
          }
        } catch {}
      }
      // Notify the viewer iframe to relayout its map (if visible)
      const iframe = document.getElementById('gds-viewer') as HTMLIFrameElement;
      iframe?.contentWindow?.postMessage({ type: 'resize' }, '*');
    };

    this.handle.addEventListener('pointerup', endDrag);
    this.handle.addEventListener('pointercancel', endDrag);
  }

  isDragging(): boolean {
    return this.dragging;
  }
}

// DOM Elements
const runBtn = document.getElementById('run-btn') as HTMLButtonElement;
const rebuildBtn = document.getElementById('rebuild-btn') as HTMLButtonElement;
const monacoContainer = document.getElementById('monaco-editor')!;
const iframeViewer = document.getElementById('gds-viewer') as HTMLIFrameElement;
const terminalBody = document.getElementById('terminal-output')!;
const fileTree = document.getElementById('file-tree')!;
const sidebar = document.getElementById('sidebar')!;
const currentFileLabel = document.getElementById('current-file')!;
const menuFile = document.getElementById('menu-file')!;
const menuOpenFolder = document.getElementById('menu-open-folder')!;
const pythonEnvSelect = document.getElementById('python-env-select') as HTMLSelectElement;;

// Tab bar
const editorTab = document.getElementById('editor-tab');
const viewerTab = document.getElementById('viewer-tab');
const viewerTabClose = document.getElementById('viewer-tab-close');

// Layout mode
type LayoutMode = 'split' | 'editor' | 'viewer';

let layoutMode: LayoutMode = 'split';
const panelsContainer = document.getElementById('panels')!;
const viewerPane = document.getElementById('viewer-pane')!;
const collapseToggle = document.getElementById('viewer-collapse-toggle')!;
const layoutBtn = document.getElementById('btn-layout')!;
const layoutMenu = document.getElementById('layout-menu')!;

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
  // Clear inline widths when not in split mode so flex takes over
  const editorPaneEl = document.getElementById('editor-pane');
  const viewerPaneEl = document.getElementById('viewer-pane');
  const resizeHandleEl = document.getElementById('resize-handle');
  if (mode !== 'split') {
    if (editorPaneEl) {
      editorPaneEl.style.flex = '';
      editorPaneEl.style.width = '';
    }
    if (viewerPaneEl) {
      viewerPaneEl.style.flex = '';
      viewerPaneEl.style.width = '';
    }
  }
  if (resizeHandleEl) {
    resizeHandleEl.style.display = mode === 'split' ? '' : 'none';
  }
}

// Menu handling
function setupMenuBar() {
  menuFile.addEventListener('click', (e) => {
    e.stopPropagation();
    menuFile.classList.toggle('open');
  });

  document.addEventListener('click', () => {
    menuFile.classList.remove('open');
  });

  menuOpenFolder.addEventListener('click', () => {
    menuFile.classList.remove('open');
    openPathModal('open');
  });

  const menuNewProject = document.getElementById('menu-new-project');
  menuNewProject?.addEventListener('click', () => {
    menuFile.classList.remove('open');
    openPathModal('new');
  });

  // Load recent workspaces into the submenu
  loadRecentWorkspaces();
}

async function loadRecentWorkspaces(): Promise<void> {
  const list = document.getElementById('recent-workspaces-list');
  if (!list) return;

  try {
    const resp = await fetch('/api/recent-workspaces');
    const data = await resp.json();
    const recent = data.recent || [];

    list.innerHTML = '';

    if (recent.length === 0) {
      list.innerHTML = '<div class="menu-option disabled"><span>No recent projects</span></div>';
      return;
    }

    for (const entry of recent) {
      const item = document.createElement('div');
      item.className = 'recent-item';
      item.style.position = 'relative';
      item.innerHTML = `
        <span class="recent-name">${escHtml(entry.name)}</span>
        <span class="recent-path" title="${escHtml(entry.path)}">${escHtml(entry.path)}</span>
        <span class="recent-remove" title="Remove from list">×</span>
      `;

      // Click to open
      item.addEventListener('click', (e) => {
        const target = e.target as HTMLElement;
        if (target.classList.contains('recent-remove')) return;
        e.stopPropagation();
        menuFile.classList.remove('open');
        openWorkspaceByPath(entry.path);
      });

      // Remove button
      const removeBtn = item.querySelector('.recent-remove')!;
      removeBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await fetch('/api/recent-workspaces', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: entry.path }),
        });
        loadRecentWorkspaces();
      });

      list.appendChild(item);
    }
  } catch {
    list.innerHTML = '<div class="menu-option disabled"><span>Failed to load</span></div>';
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function openWorkspaceByPath(dirPath: string): Promise<void> {
  terminal.addLine('system', `Opening: ${dirPath}`);
  try {
    // Use the native filesystem path approach
    const resp = await fetch('/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: dirPath }),
    });
    if (!resp.ok) {
      terminal.addLine('stderr', `Failed to open workspace (${resp.status})`);
      return;
    }
    await loadFileTree();
    terminal.addLine('system', `Opened: ${dirPath}`);
  } catch (err: any) {
    terminal.addLine('stderr', `Error: ${err.message}`);
  }
}

// --- Server-side path picker modal (Open/New Project) ---
// VS Code-style: type an absolute server path, get autocomplete suggestions
// from /api/browse. Projects live on the server, so there is no client-side
// folder picker here.
interface BrowseEntry { name: string; path: string; }
interface BrowseResponse {
  base: string; partial: string; home: string;
  dirs: BrowseEntry[]; error?: string;
}

let pathModalEl: HTMLElement | null = null;
let pathModalInput: HTMLInputElement | null = null;
let pathModalList: HTMLElement | null = null;
let pathModalTitle: HTMLElement | null = null;
let pathModalConfirm: HTMLButtonElement | null = null;
let pathModalSuggestions: BrowseEntry[] = [];
let pathModalActiveIdx = -1;
let pathModalDebounce: ReturnType<typeof setTimeout> | null = null;
let pathModalMode: 'open' | 'new' = 'open';

function ensurePathModal(): HTMLElement {
  if (pathModalEl) return pathModalEl;

  const overlay = document.createElement('div');
  overlay.className = 'path-modal-overlay';
  overlay.style.display = 'none';

  const box = document.createElement('div');
  box.className = 'path-modal';

  pathModalTitle = document.createElement('div');
  pathModalTitle.className = 'path-modal-title';
  box.appendChild(pathModalTitle);

  pathModalInput = document.createElement('input');
  pathModalInput.className = 'path-modal-input';
  pathModalInput.type = 'text';
  pathModalInput.spellcheck = false;
  pathModalInput.placeholder = '/path/to/project';
  box.appendChild(pathModalInput);

  pathModalList = document.createElement('div');
  pathModalList.className = 'path-modal-list';
  box.appendChild(pathModalList);

  const buttons = document.createElement('div');
  buttons.className = 'path-modal-buttons';
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'path-modal-btn';
  cancelBtn.textContent = 'Cancel';
  pathModalConfirm = document.createElement('button');
  pathModalConfirm.className = 'path-modal-btn primary';
  buttons.appendChild(cancelBtn);
  buttons.appendChild(pathModalConfirm);
  box.appendChild(buttons);

  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Clicking the backdrop (not the box) closes the modal.
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePathModal();
  });
  cancelBtn.addEventListener('click', closePathModal);

  pathModalInput.addEventListener('input', () => {
    if (pathModalDebounce) clearTimeout(pathModalDebounce);
    const v = pathModalInput!.value;
    pathModalDebounce = setTimeout(() => queryPathSuggestions(v), 120);
  });

  pathModalInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { closePathModal(); e.preventDefault(); return; }
    if (e.key === 'ArrowDown') { movePathSelection(1); e.preventDefault(); return; }
    if (e.key === 'ArrowUp') { movePathSelection(-1); e.preventDefault(); return; }
    if (e.key === 'Tab' && pathModalActiveIdx >= 0 && pathModalSuggestions[pathModalActiveIdx]) {
      e.preventDefault();
      acceptPathSuggestion(pathModalSuggestions[pathModalActiveIdx]);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (pathModalActiveIdx >= 0 && pathModalSuggestions[pathModalActiveIdx]) {
        acceptPathSuggestion(pathModalSuggestions[pathModalActiveIdx]);
      } else {
        confirmPathModal();
      }
    }
  });

  pathModalConfirm.addEventListener('click', confirmPathModal);

  pathModalEl = overlay;
  return overlay;
}

function openPathModal(mode: 'open' | 'new'): void {
  ensurePathModal();
  pathModalMode = mode;
  pathModalTitle!.textContent = mode === 'open' ? 'Open Project' : 'New Project';
  pathModalConfirm!.textContent = mode === 'open' ? 'Open' : 'Create';
  pathModalList!.innerHTML = '';
  pathModalSuggestions = [];
  pathModalActiveIdx = -1;
  pathModalInput!.value = '';
  pathModalEl!.style.display = 'flex';
  // Empty query returns home + its children; prefill the input with the home path.
  queryPathSuggestions('');
  setTimeout(() => pathModalInput!.focus(), 0);
}

function closePathModal(): void {
  if (pathModalEl) pathModalEl.style.display = 'none';
  if (pathModalDebounce) { clearTimeout(pathModalDebounce); pathModalDebounce = null; }
}

async function queryPathSuggestions(q: string): Promise<void> {
  if (!pathModalList) return;
  try {
    const resp = await fetch(`/api/browse?q=${encodeURIComponent(q)}`);
    const data = (await resp.json()) as BrowseResponse;
    // Prefill the input with the home directory on first load.
    if (q === '' && data.home && pathModalInput && pathModalInput.value === '') {
      pathModalInput.value = data.home.endsWith('/') ? data.home : data.home + '/';
    }
    pathModalSuggestions = data.dirs || [];
    pathModalActiveIdx = -1;
    renderPathSuggestions();
  } catch {
    pathModalSuggestions = [];
    pathModalActiveIdx = -1;
    renderPathSuggestions();
  }
}

function renderPathSuggestions(): void {
  if (!pathModalList) return;
  pathModalList.innerHTML = '';
  if (pathModalSuggestions.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'path-modal-empty';
    empty.textContent = 'No matching folders';
    pathModalList.appendChild(empty);
    return;
  }
  pathModalSuggestions.forEach((entry, idx) => {
    const item = document.createElement('div');
    item.className = 'path-modal-item' + (idx === pathModalActiveIdx ? ' active' : '');
    const name = document.createElement('span');
    name.className = 'path-modal-item-name';
    name.textContent = entry.name;
    const sub = document.createElement('span');
    sub.className = 'path-modal-item-path';
    sub.textContent = entry.path;
    item.appendChild(name);
    item.appendChild(sub);
    item.addEventListener('click', () => acceptPathSuggestion(entry));
    item.addEventListener('mouseenter', () => {
      pathModalActiveIdx = idx;
      renderPathSuggestions();
    });
    pathModalList!.appendChild(item);
  });
}

function movePathSelection(delta: number): void {
  if (pathModalSuggestions.length === 0) return;
  pathModalActiveIdx = (pathModalActiveIdx + delta + pathModalSuggestions.length) % pathModalSuggestions.length;
  renderPathSuggestions();
  const items = pathModalList!.querySelectorAll('.path-modal-item');
  (items[pathModalActiveIdx] as HTMLElement | undefined)?.scrollIntoView({ block: 'nearest' });
}

function acceptPathSuggestion(entry: BrowseEntry): void {
  if (!pathModalInput) return;
  // Trailing slash so the next keystroke lists this folder's children.
  pathModalInput.value = entry.path.endsWith('/') ? entry.path : entry.path + '/';
  pathModalSuggestions = [];
  pathModalActiveIdx = -1;
  renderPathSuggestions();
  queryPathSuggestions(pathModalInput.value);
  pathModalInput.focus();
}

async function confirmPathModal(): Promise<void> {
  if (!pathModalInput) return;
  const p = pathModalInput.value.trim().replace(/\/+$/, '');
  if (!p) return;
  closePathModal();
  if (pathModalMode === 'new') {
    try {
      const resp = await fetch('/api/project/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: p }),
      });
      if (!resp.ok) {
        terminal.addLine('stderr', `Failed to create project (${resp.status})`);
        return;
      }
      terminal.addLine('system', `Created project: ${p}`);
    } catch (err: any) {
      terminal.addLine('stderr', `Error creating project: ${err.message}`);
      return;
    }
  }
  await openWorkspace(p);
}

// Sidebar toggle
function setupSidebar() {
  function toggleSidebar() {
    sidebar.classList.toggle('hidden');
    const isHidden = sidebar.classList.contains('hidden');

    // Update activity bar icon
    const explorerIcon = document.getElementById('activity-explorer');
    if (explorerIcon) {
      explorerIcon.classList.toggle('active', !isHidden);
    }

    // Trigger resize after sidebar animation
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
    }, 250);
  }

  // Activity bar explorer icon toggles sidebar
  const activityExplorer = document.getElementById('activity-explorer');
  if (activityExplorer) {
    activityExplorer.addEventListener('click', toggleSidebar);
  }

  // Manual explorer refresh — catches files created via terminal / external tools
  document.getElementById('refresh-file-tree')?.addEventListener('click', () => {
    loadFileTree();
  });

  // Auto-refresh when the window regains focus, so files created outside the
  // app appear without a manual action. Guarded on an open workspace so an
  // unfocused idle state doesn't flash an error.
  window.addEventListener('focus', () => {
    if (workspacePath) loadFileTree();
  });
}

// Build file tree from flat list
function buildFileTree(files: string[]): FileNode[] {
  const root: Map<string, FileNode> = new Map();

  for (const file of files.sort()) {
    const parts = file.split('/');
    let current = root;
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (isLast) {
        // It's a file
        current.set(part, {
          name: part,
          path: currentPath,
          isFolder: false
        });
      } else {
        // It's a folder
        if (!current.has(part)) {
          current.set(part, {
            name: part,
            path: currentPath,
            isFolder: true,
            children: []
          });
        }
        // Navigate into the folder for next iteration
        const node = current.get(part)!;
        if (node.children) {
          current = new Map();
          for (const child of node.children) {
            current.set(child.name, child);
          }
        }
      }
    }
  }

  // Convert Map to array and sort
  function mapToArray(map: Map<string, FileNode>): FileNode[] {
    return Array.from(map.values()).sort((a, b) => {
      if (a.isFolder && !b.isFolder) return -1;
      if (!a.isFolder && b.isFolder) return 1;
      return a.name.localeCompare(b.name);
    });
  }

  return mapToArray(root);
}

// Render file tree to DOM
function renderFileTree(nodes: FileNode[], container: HTMLElement, depth = 0) {
  container.innerHTML = '';

  for (const node of nodes) {
    const item = document.createElement('div');
    item.className = 'tree-item' + (node.isFolder ? ' folder' : ' file');
    item.style.paddingLeft = `${depth * 12 + 8}px`;

    const icon = document.createElement('span');
    icon.className = node.isFolder ? 'folder-icon' : 'file-icon';
    icon.textContent = node.isFolder ? '📁' : '📄';

    const name = document.createElement('span');
    name.className = 'item-name';
    name.textContent = node.name;
    name.title = node.path;

    item.appendChild(icon);
    item.appendChild(name);

    if (node.isFolder && node.children) {
      const toggle = document.createElement('span');
      toggle.className = 'folder-toggle';
      toggle.textContent = '▶';
      toggle.style.cssText = 'font-size:10px;margin-right:4px;color:#6c7086;';
      item.insertBefore(toggle, icon);

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        item.classList.toggle('expanded');
        toggle.textContent = item.classList.contains('expanded') ? '▼' : '▶';
        const childContainer = item.nextElementSibling as HTMLElement;
        if (childContainer) {
          childContainer.style.display = item.classList.contains('expanded') ? 'block' : 'none';
        }
      });

      const childContainer = document.createElement('div');
      childContainer.className = 'tree-children';
      childContainer.style.display = 'none';
      renderFileTree(node.children, childContainer, depth + 1);
      container.appendChild(item);
      container.appendChild(childContainer);
    } else {
      item.addEventListener('click', () => {
        openFile(node.path);
        // Update selection
        container.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
        item.classList.add('selected');
      });
      container.appendChild(item);
    }
  }
}

async function openFile(filePath: string) {
  currentFile = filePath;
  sessionStorage.setItem('supergds-current-file', filePath);
  setStudioCookie('file', filePath);
  if (workspacePath) {
    sessionStorage.setItem('supergds-workspace', workspacePath);
  }
  currentFileLabel.textContent = filePath.split('/').pop() || 'No file open';
  currentFileLabel.title = filePath;

  const res = await fetch(`/files/${filePath}`);
  if (!res.ok) {
    console.error('Failed to open file:', res.status);
    terminal.addLine('system', `Error: Failed to open ${filePath}`);
    return;
  }
  const { content } = await res.json();
  editor.setValue(content);

  // Track current file for jump-to-source
  (window as any).studio.currentFile = filePath;

  // Push open file state to server for MCP server to read
  fetch('/api/ide-state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'openFile', file: filePath }),
  }).catch(() => {});

  runBtn.disabled = false;
  rebuildBtn.disabled = false;
}

async function findFileByBasename(basename: string): Promise<string | null> {
  try {
    const res = await fetch('/api/files');
    if (!res.ok) return null;
    const { files } = await res.json();
    const match = (files as string[]).find(f => f.replace(/\\/g, '/').split('/').pop() === basename);
    return match || null;
  } catch {
    return null;
  }
}

function jumpToLine(line: number): void {
  if (!editor) return;
  const model = editor.getModel?.();
  if (!model) return;

  editor.revealLine?.(line, 0 /* SmoothScroll */);

  const monacoObj = (window as any).monaco;
  if (monacoObj) {
    editor.deltaDecorations?.([], [{
      range: new monacoObj.Range(line, 1, line, model.getLineMaxColumn(line)),
      options: {
        isWholeLine: true,
        className: 'source-highlight',
        glyphMarginClassName: 'source-glyph',
      },
    }]);
  }
}

async function openWorkspace(folderPath: string) {
  workspacePath = folderPath;
  sessionStorage.setItem('supergds-workspace', folderPath);

  const wsResp = await fetch('/workspace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace: folderPath }),
  });

  if (!wsResp.ok) {
    terminal.addLine('system', `Error: Failed to open folder (${wsResp.status})`);
    return;
  }

  terminal.addLine('system', `Opened folder: ${folderPath}`);
  setStudioCookie('project', folderPath);
  await loadFileTree();
}

async function loadPythonEnvironments() {
  if (!pythonEnvSelect) return;

  try {
    // Timeout after 10s — conda env list can hang on WSL
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const res = await fetch('/api/python-environments', { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) {
      console.error('Failed to load Python environments:', res.status);
      pythonEnvSelect.innerHTML = '<option value="">Python (default)</option>';
      return;
    }

    const { environments } = await res.json();

    // Clear and populate the dropdown
    pythonEnvSelect.innerHTML = '';
    if (environments.length === 0) {
      pythonEnvSelect.innerHTML = '<option value="">No env found — using default</option>';
      return;
    }
    for (const env of environments) {
      const option = document.createElement('option');
      option.value = env.path;
      option.textContent = env.name;
      option.title = env.path;
      if (env.isActive) {
        option.selected = true;
      }
      pythonEnvSelect.appendChild(option);
    }
  } catch (err: any) {
    console.error('Error loading Python environments:', err);
    if (pythonEnvSelect) {
      pythonEnvSelect.innerHTML = '<option value="">Python (default)</option>';
    }
  }
}

// Load Python environments, restore the previously selected env from its
// cookie, and persist any future selection change.
async function initPythonEnv() {
  await loadPythonEnvironments();
  if (!pythonEnvSelect) return;

  const saved = getStudioCookie('python-env');
  if (saved) {
    for (const opt of Array.from(pythonEnvSelect.options)) {
      if (opt.value === saved) {
        pythonEnvSelect.value = saved;
        break;
      }
    }
  }

  pythonEnvSelect.addEventListener('change', () => {
    if (pythonEnvSelect.value) {
      setStudioCookie('python-env', pythonEnvSelect.value);
    }
  });
}

async function loadFileTree() {
  // Capture currently-expanded folders so a refresh preserves the user's view
  // (otherwise re-rendering collapses every open folder).
  const expandedPaths = new Set<string>();
  fileTree.querySelectorAll('.tree-item.folder.expanded').forEach((el) => {
    const nameEl = el.querySelector('.item-name') as HTMLElement | null;
    if (nameEl) expandedPaths.add(nameEl.title);
  });
  const isRefresh = expandedPaths.size > 0;

  const res = await fetch('/api/files');
  if (!res.ok) {
    console.error('Failed to load files:', res.status);
    fileTree.innerHTML = '<div style="padding:8px;color:#f38ba8;">Could not read workspace. Try File → Open Project.</div>';
    return;
  }

  const { files } = await res.json();
  if (!files || files.length === 0) {
    fileTree.innerHTML = '<div style="padding:8px;color:#6c7086;">No files found in workspace.</div>';
    return;
  }

  // Filter to show Python files and common project files
  const displayFiles = files.filter((f: string) => {
    const ext = f.split('.').pop()?.toLowerCase();
    return ['py', 'json', 'ts', 'js', 'md', 'txt', 'yaml', 'yml', 'toml', 'cfg', 'ini'].includes(ext || '');
  });

  const tree = buildFileTree(displayFiles);
  renderFileTree(tree, fileTree);

  if (isRefresh) {
    // Restore exactly the folders the user had open (parents before children).
    const paths = Array.from(expandedPaths).sort(
      (a, b) => a.split('/').length - b.split('/').length,
    );
    for (const p of paths) expandFolderPath(p);
  } else {
    // First load: expand the top level by default.
    fileTree.querySelectorAll('.tree-item.folder').forEach(item => {
      item.classList.add('expanded');
      const toggle = item.querySelector('.folder-toggle');
      if (toggle) toggle.textContent = '▼';
      const childContainer = item.nextElementSibling as HTMLElement;
      if (childContainer) childContainer.style.display = 'block';
    });
  }
}

// Re-expand a folder in the tree by its path (used when preserving state on refresh).
function expandFolderPath(path: string): void {
  for (const item of Array.from(fileTree.querySelectorAll('.tree-item.folder'))) {
    const nameEl = item.querySelector('.item-name') as HTMLElement | null;
    if (nameEl && nameEl.title === path) {
      if (!item.classList.contains('expanded')) (item as HTMLElement).click();
      return;
    }
  }
}

async function saveCurrentFile() {
  if (!currentFile) return;
  const content = editor.getValue();
  await fetch(`/files/${currentFile}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
}

async function handleRun() {
  if (!currentFile) return;
  await saveCurrentFile();
  terminal.clear();
  const pythonPath = pythonEnvSelect?.value;
  const pythonPathParam = pythonPath ? `&pythonPath=${encodeURIComponent(pythonPath)}` : '';
  terminal.addLine('system', `$ python ${currentFile}`);

  let completed = false;
  const es = new EventSource(`/api/run?pythonFile=${encodeURIComponent(currentFile)}${pythonPathParam}`);
  es.addEventListener('start', (e: MessageEvent) => terminal.addLine('stdout', (JSON.parse(e.data)).status));
  es.addEventListener('stdout', (e: MessageEvent) => terminal.addLine('stdout', (JSON.parse(e.data)).line));
  es.addEventListener('stderr', (e: MessageEvent) => terminal.addLine('stderr', (JSON.parse(e.data)).line));
  es.addEventListener('complete', (e: MessageEvent) => {
    completed = true;
    const data = JSON.parse(e.data);
    bridge.sendLoadGds(data);
    // Extract source locations from geojson and display in terminal
    const geojson = data.geojson as { features?: Array<{ properties?: { provenance?: { file?: string; line?: number | string } } }> };
    if (geojson?.features) {
      const sources = new Map<string, { file: string; line: number }>();
      for (const f of geojson.features) {
        const prov = f.properties?.provenance;
        if (prov?.file && prov?.line) {
          const lineNum = typeof prov.line === 'number' ? prov.line : parseInt(String(prov.line), 10);
          if (!isNaN(lineNum)) {
            sources.set(`${prov.file}:${lineNum}`, { file: prov.file, line: lineNum });
          }
        }
      }
      if (sources.size > 0) {
        terminal.addLine('system', `Found ${sources.size} component(s) with source info:`);
        for (const [key, src] of sources) {
          terminal.addLine('stdout', `  ${src.file}:${src.line}`);
        }
      }
    }
    terminal.addLine('system', 'Done.');
    es.close();
    // Push build status to server state for MCP server to read
    fetch('/api/ide-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'build',
        status: {
          lastOutput: 'Done.',
          exitCode: 0,
          gdsPath: data.gdsPath || null,
          errors: [],
          timestamp: Date.now(),
        },
      }),
    }).catch(() => {});

    // The run may have created or modified project files; refresh the tree.
    loadFileTree();
  });
  es.addEventListener('error', (e: Event) => {
    if (completed) return;
    const msg = (e as MessageEvent).data;
    if (msg) {
      try { terminal.addLine('stderr', JSON.parse(msg).message || 'Error'); }
      catch { terminal.addLine('stderr', 'Run failed.'); }
    } else {
      terminal.addLine('stderr', 'Run failed — connection lost.');
    }
    es.close();
    // Push build error status to server state
    fetch('/api/ide-state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'build',
        status: {
          lastOutput: msg ? String(msg) : 'Run failed — connection lost.',
          exitCode: 1,
          gdsPath: null,
          errors: [msg ? String(msg) : 'Run failed'],
          timestamp: Date.now(),
        },
      }),
    }).catch(() => {});
  });
}

async function handleRebuild() {
  await handleRun();
}

// ---- xterm.js terminal ----

function initXterm(): void {
  const container = document.getElementById('terminal-xterm');
  if (!container) return;

  // xterm.js is bundled locally via esbuild (no CDN dependency)
  xterm = new Terminal({
    cursorBlink: true,
    fontSize: 13,
    fontFamily: "'Cascadia Code', 'Fira Code', monospace",
    theme: {
      background: '#11111b',
      foreground: '#cdd6f4',
      cursor: '#89b4fa',
      selectionBackground: '#45475a',
    },
  });

  xtermFitAddon = new FitAddon();
  xterm.loadAddon(xtermFitAddon);
  xterm.open(container);

  // Fit after a short delay to ensure container has dimensions
  setTimeout(() => {
    try { xtermFitAddon.fit(); } catch {}
  }, 100);

  connectTerminalWs();
}

function connectTerminalWs(): void {
  if (!xterm) return;

  const wsProtocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  xtermWs = new WebSocket(`${wsProtocol}//${location.host}/api/terminal`);

  xterm?.write('\x1b[90mConnecting...\x1b[0m\r');

  xtermWs.onopen = () => {
    // Clear the "Connecting..." message and send initial size
    xterm?.write('\r\x1b[K');
    if (xtermFitAddon && xterm) {
      const dims = xtermFitAddon.proposeDimensions();
      if (dims) {
        xtermWs?.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
      }
    }
  };

  xtermWs.onmessage = (ev) => {
    xterm?.write(ev.data);
  };

  xtermWs.onclose = () => {
    xterm?.write('\r\n\x1b[90m— connection lost, reopen tab to reconnect —\x1b[0m\r\n');
  };

  xtermWs.onerror = () => {
    xterm?.write('\r\n\x1b[31mTerminal connection error\x1b[0m\r\n');
  };

  // User input → WebSocket
  xterm.onData((data: string) => {
    if (xtermWs?.readyState === WebSocket.OPEN) {
      xtermWs.send(data);
    }
  });
}

function setupBottomPanel(): void {
  const TabManagerClass = (window as any).TabManager;
  if (!TabManagerClass) {
    console.error('TabManager not loaded');
    return;
  }

  const xtermPanel = document.getElementById('terminal-xterm')!;
  const outputPanel = document.getElementById('terminal-output')!;
  const problemsPanel = document.getElementById('terminal-problems')!;

  // Initialize problems panel with placeholder
  problemsPanel.innerHTML = '<p class="placeholder">No problems detected.</p>';

  tabManager = new TabManagerClass('terminal-header', 'terminal-body');

  // Terminal tab — with xterm refit on activate
  tabManager.addTab('terminal', 'Terminal', xtermPanel, {
    active: true,
    onActivate: () => {
      activeTerminalTab = 'terminal';
      if (xtermFitAddon && xterm) {
        setTimeout(() => {
          try {
            xtermFitAddon.fit();
            const dims = xtermFitAddon.proposeDimensions();
            if (dims && xtermWs?.readyState === WebSocket.OPEN) {
              xtermWs.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
            }
          } catch {}
        }, 50);
      }
    },
  });

  // Output tab — build/run logs
  tabManager.addTab('output', 'Output', outputPanel, {
    onActivate: () => { activeTerminalTab = 'output'; },
  });

  // Problems tab — placeholder for future diagnostics
  tabManager.addTab('problems', 'Problems', problemsPanel, {
    onActivate: () => { activeTerminalTab = 'problems'; },
  });

  // === Available tabs (shown in "+" dropdown) ===

  // Source tab — shows provenance info from selected GDS polygons
  tabManager.addAvailableTab('source', 'Source', () => {
    const panel = document.createElement('div');
    panel.className = 'terminal-tab-panel';
    panel.style.cssText = 'padding:8px 12px;font:13px/1.5 \'Cascadia Code\',\'Fira Code\',monospace;color:#cdd6f4;';
    panel.innerHTML = '<p class="placeholder">Click a polygon in the GDS viewer to inspect source</p>';

    // Listen for selection events dispatched by iframeBridge
    const handler = (e: Event) => {
      const customEvent = e as CustomEvent;
      updateSourcePanel(panel, customEvent.detail);
    };
    window.addEventListener('gds-selection', handler);
    // Clean up when panel is removed
    (panel as any).__cleanup = () => window.removeEventListener('gds-selection', handler);

    return { el: panel };
  }, '📋');

  // Reconnect terminal when the xterm panel becomes visible
  new MutationObserver(() => {
    if (xtermPanel.style.display !== 'none' && xtermWs?.readyState !== WebSocket.OPEN) {
      connectTerminalWs();
    }
  }).observe(xtermPanel, { attributes: true, attributeFilter: ['style'] });
}

// Poll for pending commands from MCP server (highlight source, select by source)
let lastCommandPoll = 0;
function pollMcpCommands() {
  // Poll every 1 second — commands are rare, this is lightweight
  const now = Date.now();
  if (now - lastCommandPoll < 1000) return;
  lastCommandPoll = now;

  fetch('/api/ide-state/commands')
    .then(res => res.ok ? res.json() : { commands: [] })
    .then(({ commands }: { commands: Array<{ type: string; file: string; line: number }> }) => {
      for (const cmd of commands) {
        if (cmd.type === 'highlightSource') {
          // Highlight source line in Monaco
          jumpToLine(cmd.line);
        } else if (cmd.type === 'selectBySource') {
          // Select polygons in viewer corresponding to source location
          bridge?.sendSelectBySource(cmd.file, cmd.line);
        }
      }
    })
    .catch(() => {});
}

// Collapse/expand the bottom console — mirrors the GDS viewer's toggleConsole().
function toggleTerminal(): void {
  const term = document.getElementById('terminal')!;
  const icon = document.getElementById('terminal-collapse');
  const collapsed = term.classList.toggle('collapsed');
  if (icon) icon.textContent = collapsed ? '▶' : '▼';
  // Hide the drag-resize handle while collapsed (nothing to resize)
  const handle = document.getElementById('terminal-resize-handle');
  if (handle) handle.style.display = collapsed ? 'none' : '';
  // Refit xterm to the restored height when expanding
  if (!collapsed && xtermFitAddon && xterm) {
    setTimeout(() => { try { xtermFitAddon.fit(); } catch {} }, 50);
  }
}

export function init() {
  // @ts-ignore - these are set by other chunks loaded via script tags
  editor = (window as any).setupMonaco(monacoContainer);
  // @ts-ignore
  terminal = new (window as any).TerminalRenderer(terminalBody);
  // @ts-ignore
  bridge = new (window as any).IframeBridge(iframeViewer);

  // Initialize xterm.js terminal (non-fatal — app works without it)
  try { initXterm(); } catch (e) { console.error('xterm init failed:', e); }
  setupBottomPanel();

  // Setup UI
  setupMenuBar();
  setupSidebar();

  // Event listeners
  runBtn.addEventListener('click', handleRun);
  rebuildBtn.addEventListener('click', handleRebuild);

  // Expose studio for debugging
  (window as any).studio = { editor, bridge, terminal, currentFile: null, openFile, jumpToLine };

  // Restore project + open file from cookies (falls back to server state)
  restoreWorkspace();

  // Load Python environments and restore the saved selection
  initPythonEnv();

  // Start polling for MCP commands (highlight, select) from Claude Code
  setInterval(pollMcpCommands, 1000);

  // Restore layout mode from sessionStorage
  const savedLayout = sessionStorage.getItem('supergds-layout') as LayoutMode | null;
  setLayoutMode(savedLayout || 'split');

  // Layout mode menu
  if (layoutBtn) {
    layoutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      layoutMenu?.classList.toggle('hidden');
    });
  }

  document.addEventListener('click', () => {
    layoutMenu.classList.add('hidden');
  });

  if (layoutMenu) {
    layoutMenu.querySelectorAll('.layout-option').forEach(el => {
      el.addEventListener('click', () => {
        const mode = el.getAttribute('data-mode') as LayoutMode;
        setLayoutMode(mode);
        layoutMenu.classList.add('hidden');
      });
    });
  }

  // Overleaf-style collapse arrow — toggles between split and editor-only
  if (collapseToggle) {
    collapseToggle.addEventListener('click', () => {
      if (layoutMode === 'split') {
        setLayoutMode('editor');
      } else {
        setLayoutMode('split');
      }
    });
  }

  // Bottom-console collapse — mirrors the GDS viewer's toggleConsole()
  const terminalCollapse = document.getElementById('terminal-collapse');
  if (terminalCollapse) {
    terminalCollapse.addEventListener('click', () => toggleTerminal());
  }

  // Viewer tab × button — closes viewer (switch to editor-only)
  if (viewerTabClose) {
    viewerTabClose.addEventListener('click', (e) => {
      e.stopPropagation();
      setLayoutMode('editor');
    });
  }

  // Open Viewer in New Tab
  const openNewTabOption = document.getElementById('open-viewer-new-tab');
  if (openNewTabOption) {
    openNewTabOption.addEventListener('click', () => {
      window.open('/viewer/viewer.html', '_blank');
      layoutMenu?.classList.add('hidden');
    });
  }

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

  // Setup resize handle (only in split mode)
  const resizeHandle = new ResizeHandle('resize-handle', 'editor-pane', 'viewer-pane');
  // Vertical resize handle for the bottom console panel
  new TerminalResizeHandle('terminal-resize-handle', 'terminal', 'main-content');
  window.addEventListener('resize', () => {
    const handle = document.getElementById('resize-handle');
    const editorPane = document.getElementById('editor-pane');
    if (handle && editorPane && !resizeHandle.isDragging()) {
      handle.style.left = `${editorPane.getBoundingClientRect().width}px`;
    }
  });
}

async function restoreWorkspace() {
  // Source of truth: the cookie. Fall back to server-persisted state (so a
  // project opened before this feature still restores), then migrate it to a
  // cookie for next time.
  let project = getStudioCookie('project');
  if (!project) {
    try {
      const res = await fetch('/api/workspace');
      const data = await res.json();
      project = data.workspace || null;
      if (project) setStudioCookie('project', project);
    } catch {
      project = null;
    }
  }

  const emptyMsg = '<div style="padding:8px;color:#6c7086;">Open a project to get started (File → Open Project)</div>';
  if (!project) {
    fileTree.innerHTML = emptyMsg;
    return;
  }

  try {
    await openWorkspace(project);
  } catch {
    // Project path no longer accessible — clear it and let the user reopen.
    console.warn('Restored project not found, clearing:', project);
    workspacePath = null;
    clearStudioCookie('project');
    clearStudioCookie('file');
    fileTree.innerHTML = emptyMsg;
    return;
  }

  // Reopen the last open script (cookie), if it still exists.
  const file = getStudioCookie('file');
  if (file) {
    try {
      await openFile(file);
    } catch {
      clearStudioCookie('file');
    }
  }
}

init();