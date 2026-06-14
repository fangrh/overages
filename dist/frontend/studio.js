import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
let editor;
let bridge;
let terminal;
let currentFile = null;
let workspacePath = null;
// --- Cookie persistence for studio settings ---
// Persist ONLY the selected project, the selected Python environment, and the
// open script, so a page refresh returns to that exact state. Cookies (not
// sessionStorage) are used so the state survives a full browser restart. The
// JS bundle is never cached via cookies — it revalidates on every refresh, so
// dev-mode code changes always appear.
const STUDIO_COOKIE_PREFIX = 'studio-';
const STUDIO_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year
function setStudioCookie(name, value) {
    const enc = encodeURIComponent(value);
    document.cookie = `${STUDIO_COOKIE_PREFIX}${name}=${enc}; max-age=${STUDIO_COOKIE_MAX_AGE}; path=/; SameSite=Lax`;
}
function getStudioCookie(name) {
    const key = `${STUDIO_COOKIE_PREFIX}${name}=`;
    for (const part of document.cookie.split(';')) {
        const t = part.trim();
        if (t.startsWith(key))
            return decodeURIComponent(t.slice(key.length));
    }
    return null;
}
function clearStudioCookie(name) {
    document.cookie = `${STUDIO_COOKIE_PREFIX}${name}=; max-age=0; path=/; SameSite=Lax`;
}
// xterm.js terminal — a multi-terminal panel (VS Code-style: N shells, +/× tabs)
let termPanel = null;
let activeTerminalTab = 'terminal';
let tabManager = null; // TabManager instance for bottom panel
/**
 * Update the Source panel in the bottom panel with provenance from selected components.
 */
function updateSourcePanel(panel, components) {
    if (!components || components.length === 0) {
        panel.innerHTML = '<p class="placeholder">Click a polygon in the GDS viewer to inspect source</p>';
        return;
    }
    let html = '';
    for (let i = 0; i < components.length; i++) {
        const comp = components[i];
        const prov = comp.provenance || {};
        if (i > 0)
            html += '<div style="height:1px;background:#313244;margin:6px 0;"></div>';
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
        el.addEventListener('click', () => {
            const file = el.getAttribute('data-file');
            const line = parseInt(el.getAttribute('data-line') || '1', 10);
            const studio = window.studio;
            studio?.openFile(file)?.then(() => {
                studio?.jumpToLine?.(line);
            });
        });
    });
}
class ResizeHandle {
    handle;
    editorPane;
    viewerPane;
    dragging = false;
    startX = 0;
    startEditorWidth = 0;
    constructor(handleId, editorPaneId, viewerPaneId) {
        this.handle = document.getElementById(handleId);
        this.editorPane = document.getElementById(editorPaneId);
        this.viewerPane = document.getElementById(viewerPaneId);
        this.setupEvents();
        this.updateHandlePosition();
    }
    setupEvents() {
        this.handle.addEventListener('pointerdown', (e) => {
            this.dragging = true;
            this.startX = e.clientX;
            this.startEditorWidth = this.editorPane.getBoundingClientRect().width;
            this.handle.classList.add('dragging');
            // Disable flex transition during drag so panels track handle position in real-time
            this.editorPane.parentElement.classList.add('no-transition');
            // Capture pointer so mouseup fires even when cursor leaves the window
            this.handle.setPointerCapture(e.pointerId);
            e.preventDefault();
            e.stopPropagation();
        });
        // With pointer capture, events route directly to the handle element
        this.handle.addEventListener('pointermove', (e) => {
            if (!this.dragging)
                return;
            const dx = e.clientX - this.startX;
            const newWidth = this.startEditorWidth + dx;
            const containerWidth = this.editorPane.parentElement.getBoundingClientRect().width;
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
            const iframe = document.getElementById('gds-viewer');
            if (iframe) {
                iframe.style.width = '99%';
                void iframe.offsetWidth;
                iframe.style.width = '';
            }
        });
        this.handle.addEventListener('pointerup', (e) => {
            if (!this.dragging)
                return;
            this.dragging = false;
            this.handle.classList.remove('dragging');
            // Re-enable flex transition
            this.editorPane.parentElement.classList.remove('no-transition');
            // Lock both panels at their current widths
            const remainingWidth = this.viewerPane.parentElement.getBoundingClientRect().width - parseFloat(this.handle.style.left || '0');
            this.viewerPane.style.flex = 'none';
            this.viewerPane.style.width = `${remainingWidth}px`;
            this.handle.releasePointerCapture(e.pointerId);
            // Notify viewer iframe to update its map size
            const iframe = document.getElementById('gds-viewer');
            iframe?.contentWindow?.postMessage({ type: 'resize' }, '*');
        });
        this.handle.addEventListener('pointercancel', (e) => {
            if (!this.dragging)
                return;
            this.dragging = false;
            this.handle.classList.remove('dragging');
            this.editorPane.parentElement.classList.remove('no-transition');
            this.handle.releasePointerCapture(e.pointerId);
        });
    }
    isDragging() {
        return this.dragging;
    }
    updateHandlePosition() {
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
    handle;
    terminal;
    container;
    dragging = false;
    startY = 0;
    startHeight = 0;
    constructor(handleId, terminalId, containerId) {
        this.handle = document.getElementById(handleId);
        this.terminal = document.getElementById(terminalId);
        this.container = document.getElementById(containerId);
        this.setupEvents();
    }
    setupEvents() {
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
            if (!this.dragging)
                return;
            // Dragging the handle UP (negative dy) grows the console.
            const dy = this.startY - e.clientY;
            const newHeight = this.startHeight + dy;
            const containerHeight = this.container.getBoundingClientRect().height;
            const minHeight = 80; // header + a few terminal rows
            const maxHeight = containerHeight - 120; // leave room for editor/viewer
            const clamped = Math.max(minHeight, Math.min(maxHeight, newHeight));
            this.terminal.style.height = `${clamped}px`;
            // Refit the active terminal live so glyphs reflow during the drag
            termPanel?.fitActive();
        });
        const endDrag = (e) => {
            if (!this.dragging)
                return;
            this.dragging = false;
            this.handle.classList.remove('dragging');
            this.handle.releasePointerCapture(e.pointerId);
            // Final refit + tell the pty the new terminal dimensions
            termPanel?.fitActive();
            // Notify the viewer iframe to relayout its map (if visible)
            const iframe = document.getElementById('gds-viewer');
            iframe?.contentWindow?.postMessage({ type: 'resize' }, '*');
        };
        this.handle.addEventListener('pointerup', endDrag);
        this.handle.addEventListener('pointercancel', endDrag);
    }
    isDragging() {
        return this.dragging;
    }
}
// DOM Elements
const monacoContainer = document.getElementById('monaco-editor');
const iframeViewer = document.getElementById('gds-viewer');
const terminalBody = document.getElementById('terminal-output');
const fileTree = document.getElementById('file-tree');
const sidebar = document.getElementById('sidebar');
const menuFile = document.getElementById('menu-file');
const menuOpenFolder = document.getElementById('menu-open-folder');
// Per-group controls (VS Code split: each pane has its own Compile / env / popout).
const editorCompileBtn = document.getElementById('editor-compile-btn');
const viewerCompileBtn = document.getElementById('viewer-compile-btn');
const editorEnvSelect = document.getElementById('editor-env-select');
const viewerEnvSelect = document.getElementById('viewer-env-select');
const editorPopoutBtn = document.getElementById('editor-popout-btn');
const editorShowViewerBtn = document.getElementById('editor-show-viewer-btn');
const viewerPopoutBtn = document.getElementById('viewer-popout-btn');
const editorTabsBar = document.getElementById('editor-group-tabs');
const viewerTabsBar = document.getElementById('viewer-group-tabs');
// Both env selects share one selection — editor + viewer panes stay in sync.
const envSelects = [editorEnvSelect, viewerEnvSelect];
let layoutMode = 'split';
const panelsContainer = document.getElementById('panels');
const viewerPane = document.getElementById('viewer-pane');
const collapseToggle = document.getElementById('viewer-collapse-toggle');
function setLayoutMode(mode) {
    layoutMode = mode;
    // Update panel class — CSS uses full names
    const layoutClass = mode === 'editor' ? 'layout-editor-only' :
        mode === 'viewer' ? 'layout-viewer-only' : 'layout-split';
    panelsContainer.classList.remove('layout-split', 'layout-editor-only', 'layout-viewer-only');
    panelsContainer.classList.add(layoutClass);
    // (Per-group tabs are always active within their own pane; pane visibility is
    // driven entirely by the layout-* classes above, so there's no global tab
    // state to sync here.)
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
async function loadRecentWorkspaces() {
    const list = document.getElementById('recent-workspaces-list');
    if (!list)
        return;
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
                const target = e.target;
                if (target.classList.contains('recent-remove'))
                    return;
                e.stopPropagation();
                menuFile.classList.remove('open');
                openWorkspaceByPath(entry.path);
            });
            // Remove button
            const removeBtn = item.querySelector('.recent-remove');
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
    }
    catch {
        list.innerHTML = '<div class="menu-option disabled"><span>Failed to load</span></div>';
    }
}
function escHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
async function openWorkspaceByPath(dirPath) {
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
    }
    catch (err) {
        terminal.addLine('stderr', `Error: ${err.message}`);
    }
}
let pathModalEl = null;
let pathModalInput = null;
let pathModalList = null;
let pathModalTitle = null;
let pathModalConfirm = null;
let pathModalSuggestions = [];
let pathModalActiveIdx = -1;
let pathModalDebounce = null;
let pathModalMode = 'open';
function ensurePathModal() {
    if (pathModalEl)
        return pathModalEl;
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
        if (e.target === overlay)
            closePathModal();
    });
    cancelBtn.addEventListener('click', closePathModal);
    pathModalInput.addEventListener('input', () => {
        if (pathModalDebounce)
            clearTimeout(pathModalDebounce);
        const v = pathModalInput.value;
        pathModalDebounce = setTimeout(() => queryPathSuggestions(v), 120);
    });
    pathModalInput.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closePathModal();
            e.preventDefault();
            return;
        }
        if (e.key === 'ArrowDown') {
            movePathSelection(1);
            e.preventDefault();
            return;
        }
        if (e.key === 'ArrowUp') {
            movePathSelection(-1);
            e.preventDefault();
            return;
        }
        if (e.key === 'Tab' && pathModalActiveIdx >= 0 && pathModalSuggestions[pathModalActiveIdx]) {
            e.preventDefault();
            acceptPathSuggestion(pathModalSuggestions[pathModalActiveIdx]);
            return;
        }
        if (e.key === 'Enter') {
            e.preventDefault();
            if (pathModalActiveIdx >= 0 && pathModalSuggestions[pathModalActiveIdx]) {
                acceptPathSuggestion(pathModalSuggestions[pathModalActiveIdx]);
            }
            else {
                confirmPathModal();
            }
        }
    });
    pathModalConfirm.addEventListener('click', confirmPathModal);
    pathModalEl = overlay;
    return overlay;
}
function openPathModal(mode) {
    ensurePathModal();
    pathModalMode = mode;
    pathModalTitle.textContent = mode === 'open' ? 'Open Project' : 'New Project';
    pathModalConfirm.textContent = mode === 'open' ? 'Open' : 'Create';
    pathModalList.innerHTML = '';
    pathModalSuggestions = [];
    pathModalActiveIdx = -1;
    pathModalInput.value = '';
    pathModalEl.style.display = 'flex';
    // Empty query returns home + its children; prefill the input with the home path.
    queryPathSuggestions('');
    setTimeout(() => pathModalInput.focus(), 0);
}
function closePathModal() {
    if (pathModalEl)
        pathModalEl.style.display = 'none';
    if (pathModalDebounce) {
        clearTimeout(pathModalDebounce);
        pathModalDebounce = null;
    }
}
async function queryPathSuggestions(q) {
    if (!pathModalList)
        return;
    try {
        const resp = await fetch(`/api/browse?q=${encodeURIComponent(q)}`);
        const data = (await resp.json());
        // Prefill the input with the home directory on first load.
        if (q === '' && data.home && pathModalInput && pathModalInput.value === '') {
            pathModalInput.value = data.home.endsWith('/') ? data.home : data.home + '/';
        }
        pathModalSuggestions = data.dirs || [];
        pathModalActiveIdx = -1;
        renderPathSuggestions();
    }
    catch {
        pathModalSuggestions = [];
        pathModalActiveIdx = -1;
        renderPathSuggestions();
    }
}
function renderPathSuggestions() {
    if (!pathModalList)
        return;
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
        pathModalList.appendChild(item);
    });
}
function movePathSelection(delta) {
    if (pathModalSuggestions.length === 0)
        return;
    pathModalActiveIdx = (pathModalActiveIdx + delta + pathModalSuggestions.length) % pathModalSuggestions.length;
    renderPathSuggestions();
    const items = pathModalList.querySelectorAll('.path-modal-item');
    items[pathModalActiveIdx]?.scrollIntoView({ block: 'nearest' });
}
function acceptPathSuggestion(entry) {
    if (!pathModalInput)
        return;
    // Trailing slash so the next keystroke lists this folder's children.
    pathModalInput.value = entry.path.endsWith('/') ? entry.path : entry.path + '/';
    pathModalSuggestions = [];
    pathModalActiveIdx = -1;
    renderPathSuggestions();
    queryPathSuggestions(pathModalInput.value);
    pathModalInput.focus();
}
async function confirmPathModal() {
    if (!pathModalInput)
        return;
    const p = pathModalInput.value.trim().replace(/\/+$/, '');
    if (!p)
        return;
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
        }
        catch (err) {
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
        if (workspacePath)
            loadFileTree();
    });
}
// Build file tree from flat list
function buildFileTree(files) {
    const root = new Map();
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
            }
            else {
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
                const node = current.get(part);
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
    function mapToArray(map) {
        return Array.from(map.values()).sort((a, b) => {
            if (a.isFolder && !b.isFolder)
                return -1;
            if (!a.isFolder && b.isFolder)
                return 1;
            return a.name.localeCompare(b.name);
        });
    }
    return mapToArray(root);
}
// Render file tree to DOM
function renderFileTree(nodes, container, depth = 0) {
    container.innerHTML = '';
    for (const node of nodes) {
        const item = document.createElement('div');
        item.className = 'tree-item' + (node.isFolder ? ' folder' : ' file');
        item.style.paddingLeft = `${depth * 12 + 8}px`;
        const icon = document.createElement('span');
        icon.className = node.isFolder ? 'folder-icon' : 'file-icon';
        // Layout files get a distinct icon so it's clear they open in the viewer.
        icon.textContent = node.isFolder ? '📁'
            : (isLayoutFile(node.path) ? '🗺️' : '📄');
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
                const childContainer = item.nextElementSibling;
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
        }
        else {
            item.addEventListener('click', () => {
                if (isLayoutFile(node.path)) {
                    // A built layout — load it into the GDS viewer, not the text editor
                    // (a binary .gds in Monaco would render as garbage).
                    loadGdsIntoViewer(node.path);
                }
                else {
                    openFile(node.path);
                }
                // Update selection
                container.querySelectorAll('.tree-item.selected').forEach(el => el.classList.remove('selected'));
                item.classList.add('selected');
            });
            container.appendChild(item);
        }
    }
}
let editorTabs = [];
let activeEditorPath = null;
let viewerTabs = [];
let activeViewerId = null;
// The GDS file currently shown in the viewer, plus the mtime we last loaded it
// at. The mtime-poller watches this so that builds triggered OUTSIDE the
// Compile button (an LLM run_script, or a command typed in the terminal) still
// refresh the viewer — those channels write a new .gds to disk without going
// through compile(), so the only signal is the file's modification time.
let currentGdsPath = null;
let watchedGds = null;
function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function baseName(p) {
    return (p || '').replace(/\\/g, '/').split('/').pop() || (p || '');
}
// Layout (binary) outputs a compiled .py produces. These open in the GDS
// viewer, never the text editor (loading a binary .gds into Monaco is
// garbage), and must appear in the explorer so a freshly-built file is
// visible — previously the tree listed only text extensions, so a new .gds
// was generated but never shown.
const LAYOUT_EXTS = new Set(['gds', 'oas']);
function isLayoutFile(p) {
    return LAYOUT_EXTS.has((p.split('.').pop() || '').toLowerCase());
}
// Resolve a file-tree path (workspace-relative) to an absolute path. /api/parse
// requires an absolute gdsPath, and viewer tab ids are the absolute gdsPath (as
// /api/run returns), so resolving here keeps a tree-click in sync with a build
// (refreshes the same tab instead of opening a duplicate).
function resolveWorkspacePath(p) {
    if (!p)
        return p;
    if (p.startsWith('/') || /^[A-Za-z]:[\\/]/.test(p))
        return p; // already absolute
    const root = (workspacePath || '').replace(/[\\/]+$/, '');
    return root ? `${root}/${p}` : p;
}
function renderEditorTabs() {
    if (!editorTabsBar)
        return;
    editorTabsBar.innerHTML = '';
    if (editorTabs.length === 0) {
        const hint = document.createElement('div');
        hint.className = 'group-tab-empty';
        hint.textContent = 'No file open — pick one from the Explorer';
        editorTabsBar.appendChild(hint);
        return;
    }
    for (const tab of editorTabs) {
        const el = document.createElement('div');
        el.className = 'group-tab' +
            (tab.path === activeEditorPath ? ' active' : '') +
            (tab.dirty ? ' dirty' : '');
        el.title = tab.path;
        const label = document.createElement('span');
        label.className = 'group-tab-label';
        label.textContent = baseName(tab.path);
        el.appendChild(label);
        const close = document.createElement('button');
        close.className = 'tab-close';
        close.title = 'Close';
        close.textContent = '×';
        close.addEventListener('click', (e) => { e.stopPropagation(); closeEditorTab(tab.path); });
        el.addEventListener('click', () => activateEditorTab(tab.path));
        el.addEventListener('auxclick', (e) => {
            if (e.button === 1) {
                e.preventDefault();
                closeEditorTab(tab.path);
            }
        });
        el.appendChild(close);
        editorTabsBar.appendChild(el);
    }
}
function activateEditorTab(path) {
    const tab = editorTabs.find(t => t.path === path);
    if (!tab)
        return;
    activeEditorPath = path;
    currentFile = path;
    editor.setModel(tab.model);
    renderEditorTabs();
}
function closeEditorTab(path) {
    const idx = editorTabs.findIndex(t => t.path === path);
    if (idx < 0)
        return;
    const tab = editorTabs[idx];
    editorTabs.splice(idx, 1);
    try {
        tab.model.dispose();
    }
    catch (_) { }
    if (activeEditorPath === path) {
        // Activate a neighbor (prefer the one now occupying the same slot).
        const next = editorTabs[idx] || editorTabs[idx - 1] || null;
        if (next) {
            activateEditorTab(next.path);
        }
        else {
            activeEditorPath = null;
            currentFile = null;
            editor.setModel(null);
            if (editorCompileBtn)
                editorCompileBtn.disabled = true;
            if (viewerCompileBtn)
                viewerCompileBtn.disabled = true;
        }
    }
    renderEditorTabs();
}
function renderViewerTabs() {
    if (!viewerTabsBar)
        return;
    viewerTabsBar.innerHTML = '';
    if (viewerTabs.length === 0) {
        const hint = document.createElement('div');
        hint.className = 'group-tab-empty';
        hint.textContent = 'No GDS built yet — press Compile';
        viewerTabsBar.appendChild(hint);
        return;
    }
    for (const tab of viewerTabs) {
        const el = document.createElement('div');
        el.className = 'group-tab' + (tab.id === activeViewerId ? ' active' : '');
        el.title = tab.data?.gdsPath || tab.label;
        const label = document.createElement('span');
        label.className = 'group-tab-label';
        label.textContent = tab.label;
        el.appendChild(label);
        const close = document.createElement('button');
        close.className = 'tab-close';
        close.title = 'Close';
        close.textContent = '×';
        close.addEventListener('click', (e) => { e.stopPropagation(); closeViewerTab(tab.id); });
        el.addEventListener('click', () => activateViewerTab(tab.id));
        el.appendChild(close);
        viewerTabsBar.appendChild(el);
    }
}
function activateViewerTab(id) {
    const tab = viewerTabs.find(t => t.id === id);
    if (!tab)
        return;
    activeViewerId = id;
    bridge.sendLoadGds(tab.data);
    // Re-target the mtime poller at this tab's GDS (switching viewer tabs).
    if (tab.data?.gdsPath)
        seedWatchedGds(String(tab.data.gdsPath));
    renderViewerTabs();
}
function closeViewerTab(id) {
    const idx = viewerTabs.findIndex(t => t.id === id);
    if (idx < 0)
        return;
    viewerTabs.splice(idx, 1);
    if (activeViewerId === id) {
        const next = viewerTabs[idx] || viewerTabs[idx - 1] || null;
        if (next) {
            activateViewerTab(next.id);
        }
        else {
            activeViewerId = null;
            // No results left — drop back to editor-only so the empty viewer isn't shown.
            setLayoutMode('editor');
        }
    }
    renderViewerTabs();
}
// Add (or refresh) the GDS result tab for a build and bring it to the front.
function addViewerTab(data) {
    const raw = data?.gdsPath ? String(data.gdsPath) : '';
    const id = raw.replace(/\\/g, '/') || ('gds-' + (viewerTabs.length + 1));
    const label = baseName(raw) || 'GDS';
    const existing = viewerTabs.find(t => t.id === id);
    if (existing) {
        existing.data = data;
        existing.label = label;
    }
    else {
        viewerTabs.push({ id, label, data });
    }
    activeViewerId = id;
    bridge.sendLoadGds(data);
    if (data?.gdsPath)
        currentGdsPath = String(data.gdsPath);
    renderViewerTabs();
}
// (Re)seed the mtime baseline for the GDS the viewer is showing, without
// reloading. Called after every load (button compile, LLM reloadGds, terminal
// poll) so the mtime-poller doesn't re-fire for the change that just produced
// that load. Also the single place currentGdsPath is reconciled with the
// actually-on-disk file.
async function seedWatchedGds(gdsPath) {
    if (!gdsPath) {
        watchedGds = null;
        return;
    }
    currentGdsPath = gdsPath;
    try {
        const r = await fetch('/api/gds-stat?path=' + encodeURIComponent(gdsPath));
        if (!r.ok)
            return;
        const { exists, mtimeMs } = await r.json();
        watchedGds = exists ? { path: gdsPath, mtime: mtimeMs } : null;
    }
    catch { /* best-effort baseline */ }
}
// Re-parse a GDS from disk and load it into the viewer. The shared sink for the
// two "build happened outside the Compile button" channels: the LLM run_script
// channel (an explicit reloadGds command names the file just built) and the
// terminal channel (the mtime poller saw the viewed file change). Mirrors
// compile()'s 'complete' handler minus the terminal logging.
async function loadGdsIntoViewer(gdsPath) {
    if (!gdsPath)
        return;
    // Tree paths are workspace-relative; /api/parse (and tab ids) want absolute.
    const absPath = resolveWorkspacePath(gdsPath);
    const pythonPath = editorEnvSelect?.value;
    try {
        const res = await fetch('/api/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gdsPath: absPath, pythonPath }),
        });
        if (!res.ok)
            return;
        const { geojson, mode } = await res.json();
        addViewerTab({ gdsPath: absPath, geojson, mode });
        if (layoutMode === 'editor')
            setLayoutMode('split');
    }
    catch (e) {
        console.error('[loadGdsIntoViewer] failed', e);
    }
    finally {
        // Re-baseline so the poller doesn't immediately re-fire for this same load.
        seedWatchedGds(absPath);
    }
}
// Poll the viewed GDS's mtime so a build run in the terminal (or any external
// edit) still refreshes the viewer. The server can't observe PTY output, so
// file modification time is the only signal that a terminal-driven build
// finished. Polling — not fs.watch — because the workspace lives on a Windows
// NTFS drive mounted into WSL2, where inotify does not fire reliably; stat
// polling always works.
let lastMtimePoll = 0;
function pollGdsMtime() {
    const now = Date.now();
    if (now - lastMtimePoll < 2000)
        return; // self-throttle to every 2s
    lastMtimePoll = now;
    const gdsPath = currentGdsPath;
    if (!gdsPath)
        return;
    fetch('/api/gds-stat?path=' + encodeURIComponent(gdsPath))
        .then(res => res.ok ? res.json() : { exists: false, mtimeMs: 0 })
        .then(({ exists, mtimeMs }) => {
        if (!exists)
            return;
        // Path changed (tab switch / first load) — seed baseline, don't fire.
        if (!watchedGds || watchedGds.path !== gdsPath) {
            watchedGds = { path: gdsPath, mtime: mtimeMs };
            return;
        }
        if (mtimeMs > watchedGds.mtime) {
            watchedGds.mtime = mtimeMs; // optimistic — prevent re-fire before the reload re-seeds
            loadGdsIntoViewer(gdsPath);
        }
    })
        .catch(() => { });
}
async function openFile(filePath) {
    // Already open? Just activate that tab — don't reload or lose undo history.
    const existing = editorTabs.find(t => t.path === filePath);
    if (existing) {
        activateEditorTab(filePath);
        currentFile = filePath;
        infoState.file = filePath;
        renderInfoPanel();
        pushOpenFileState(filePath);
        return;
    }
    // Load content and create a dedicated Monaco model for this file.
    const res = await fetch(`/files/${filePath}`);
    if (!res.ok) {
        console.error('Failed to open file:', res.status);
        terminal.addLine('system', `Error: Failed to open ${filePath}`);
        return;
    }
    const { content } = await res.json();
    const monacoObj = window.monaco;
    const uri = monacoObj.Uri.parse('file:///' + filePath.replace(/\\/g, '/'));
    let model = monacoObj.editor.getModel(uri);
    if (!model)
        model = monacoObj.editor.createModel(content || '', 'python', uri);
    // Track dirty state from in-buffer edits; cleared again on save.
    model.onDidChangeContent(() => {
        const tab = editorTabs.find(t => t.path === filePath);
        if (tab && !tab.dirty) {
            tab.dirty = true;
            renderEditorTabs();
        }
    });
    editorTabs.push({ path: filePath, model, dirty: false });
    currentFile = filePath;
    infoState.file = filePath;
    renderInfoPanel();
    logEvent('system', 'Opened ' + filePath);
    sessionStorage.setItem('supergds-current-file', filePath);
    setStudioCookie('file', filePath);
    if (workspacePath)
        sessionStorage.setItem('supergds-workspace', workspacePath);
    activateEditorTab(filePath);
    // Track current file for jump-to-source
    window.studio.currentFile = filePath;
    pushOpenFileState(filePath);
    if (editorCompileBtn)
        editorCompileBtn.disabled = false;
    if (viewerCompileBtn)
        viewerCompileBtn.disabled = false;
}
// Push the open-file state to the server (for the MCP server / standalone pages).
function pushOpenFileState(filePath) {
    fetch('/api/ide-state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'openFile', file: filePath }),
    }).catch(() => { });
}
async function findFileByBasename(basename) {
    try {
        const res = await fetch('/api/files');
        if (!res.ok)
            return null;
        const { files } = await res.json();
        const match = files.find(f => f.replace(/\\/g, '/').split('/').pop() === basename);
        return match || null;
    }
    catch {
        return null;
    }
}
function jumpToLine(line) {
    if (!editor)
        return;
    const model = editor.getModel?.();
    if (!model)
        return;
    editor.revealLine?.(line, 0 /* SmoothScroll */);
    const monacoObj = window.monaco;
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
async function openWorkspace(folderPath) {
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
// Populate the same <option> list into every env select — the editor and
// viewer panes share one environment set.
function renderEnvOptions(envs) {
    for (const sel of envSelects) {
        sel.innerHTML = '';
        if (envs.length === 0) {
            sel.innerHTML = '<option value="">No env found — using default</option>';
            continue;
        }
        for (const env of envs) {
            const option = document.createElement('option');
            option.value = env.path;
            option.textContent = env.name;
            option.title = env.path;
            if (env.isActive)
                option.selected = true;
            sel.appendChild(option);
        }
    }
}
async function loadPythonEnvironments() {
    if (envSelects.length === 0)
        return;
    try {
        // Timeout after 10s — conda env list can hang on WSL
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const res = await fetch('/api/python-environments', { signal: controller.signal });
        clearTimeout(timeout);
        if (!res.ok) {
            console.error('Failed to load Python environments:', res.status);
            for (const sel of envSelects)
                sel.innerHTML = '<option value="">Python (default)</option>';
            return;
        }
        const { environments } = await res.json();
        renderEnvOptions(environments);
    }
    catch (err) {
        console.error('Error loading Python environments:', err);
        for (const sel of envSelects)
            sel.innerHTML = '<option value="">Python (default)</option>';
    }
}
// Load Python environments, restore the previously selected env from its
// cookie, and keep both selects (editor + viewer) mirrored + persisted.
async function initPythonEnv() {
    await loadPythonEnvironments();
    const saved = getStudioCookie('python-env');
    if (saved) {
        for (const sel of envSelects) {
            for (const opt of Array.from(sel.options)) {
                if (opt.value === saved) {
                    sel.value = saved;
                    break;
                }
            }
        }
    }
    for (const sel of envSelects) {
        sel.addEventListener('change', () => {
            if (sel.value)
                setStudioCookie('python-env', sel.value);
            // Mirror the selection into the other select so both panes agree.
            for (const other of envSelects) {
                if (other !== sel)
                    other.value = sel.value;
            }
            renderInfoPanel();
            logEvent('system', `Python env → ${sel.selectedOptions[0]?.textContent?.trim() || sel.value || 'default'}`);
        });
    }
}
async function loadFileTree() {
    // Capture currently-expanded folders so a refresh preserves the user's view
    // (otherwise re-rendering collapses every open folder).
    const expandedPaths = new Set();
    fileTree.querySelectorAll('.tree-item.folder.expanded').forEach((el) => {
        const nameEl = el.querySelector('.item-name');
        if (nameEl)
            expandedPaths.add(nameEl.title);
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
    // Filter to show Python files, common project files, and built layouts.
    const displayFiles = files.filter((f) => {
        const ext = f.split('.').pop()?.toLowerCase();
        return ['py', 'json', 'ts', 'js', 'md', 'txt', 'yaml', 'yml', 'toml', 'cfg', 'ini'].includes(ext || '')
            || isLayoutFile(f);
    });
    const tree = buildFileTree(displayFiles);
    renderFileTree(tree, fileTree);
    if (isRefresh) {
        // Restore exactly the folders the user had open (parents before children).
        const paths = Array.from(expandedPaths).sort((a, b) => a.split('/').length - b.split('/').length);
        for (const p of paths)
            expandFolderPath(p);
    }
    else {
        // First load: expand the top level by default.
        fileTree.querySelectorAll('.tree-item.folder').forEach(item => {
            item.classList.add('expanded');
            const toggle = item.querySelector('.folder-toggle');
            if (toggle)
                toggle.textContent = '▼';
            const childContainer = item.nextElementSibling;
            if (childContainer)
                childContainer.style.display = 'block';
        });
    }
}
// Re-expand a folder in the tree by its path (used when preserving state on refresh).
function expandFolderPath(path) {
    for (const item of Array.from(fileTree.querySelectorAll('.tree-item.folder'))) {
        const nameEl = item.querySelector('.item-name');
        if (nameEl && nameEl.title === path) {
            if (!item.classList.contains('expanded'))
                item.click();
            return;
        }
    }
}
async function saveCurrentFile() {
    if (!currentFile)
        return;
    const tab = editorTabs.find(t => t.path === currentFile);
    const content = tab ? tab.model.getValue() : editor.getValue();
    await fetch(`/files/${currentFile}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
    });
    if (tab) {
        tab.dirty = false;
        renderEditorTabs();
    }
}
async function compile() {
    if (!currentFile)
        return;
    await saveCurrentFile();
    terminal.clear();
    const pythonPath = editorEnvSelect?.value;
    const pythonPathParam = pythonPath ? `&pythonPath=${encodeURIComponent(pythonPath)}` : '';
    const envLabel = editorEnvSelect?.selectedOptions[0]?.textContent?.trim() || 'default';
    terminal.addLine('system', `$ python (${envLabel}) ${currentFile}`);
    setInfoStatus('building…', '—', null);
    logEvent('system', `Compile: ${currentFile} (${envLabel})`);
    let completed = false;
    const es = new EventSource(`/api/run?pythonFile=${encodeURIComponent(currentFile)}${pythonPathParam}`);
    es.addEventListener('start', (e) => terminal.addLine('stdout', (JSON.parse(e.data)).status));
    es.addEventListener('stdout', (e) => terminal.addLine('stdout', (JSON.parse(e.data)).line));
    es.addEventListener('stderr', (e) => terminal.addLine('stderr', (JSON.parse(e.data)).line));
    es.addEventListener('complete', (e) => {
        completed = true;
        const data = JSON.parse(e.data);
        // Add (or refresh) a GDS result tab for this build and show it; pop the
        // viewer pane out if we're in editor-only so the result is immediately visible.
        addViewerTab(data);
        // Baseline the just-written file so the mtime poller doesn't immediately
        // re-fire a redundant reload for this same (button-driven) build.
        seedWatchedGds(data.gdsPath || null);
        if (layoutMode === 'editor')
            setLayoutMode('split');
        // Extract source locations from geojson and display in terminal
        const geojson = data.geojson;
        if (geojson?.features) {
            const sources = new Map();
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
                terminal.addLine('system', `Provenance captured — ${sources.size} component(s) with source info:`);
                for (const [key, src] of sources) {
                    terminal.addLine('stdout', `  ${src.file}:${src.line}`);
                }
            }
            else if (data.mode !== 'full') {
                // Provenance sidecar wasn't generated. Two distinct causes: (1) the run
                // used a Python env without the provenance-enabled gdsfactory fork, or
                // (2) the 'gds' env WAS used but the script builds geometry through a
                // path the fork doesn't yet instrument. Tell the user which one it is
                // instead of silently presenting a build with no source attribution.
                terminal.addLine('stderr', '⚠ Provenance not captured for this build.');
                const usedGds = /gds[\\/]/.test(pythonPath) || envLabel === 'gds';
                if (usedGds) {
                    terminal.addLine('stderr', '   The "gds" env was used, but this script may build geometry through a path the');
                    terminal.addLine('stderr', '   provenance fork does not yet instrument (e.g. raw klayout calls). Use gdsfactory');
                    terminal.addLine('stderr', '   primitives (gf.Component/add_polygon, gf.boolean) for source attribution.');
                }
                else {
                    terminal.addLine('stderr', `   Ran with env "${envLabel}", which lacks the provenance-enabled gdsfactory.`);
                    terminal.addLine('stderr', '   Select "gds" in the Python Environment dropdown (toolbar) and re-run.');
                }
            }
        }
        terminal.addLine('system', 'Done.');
        const gdsName = data.gdsPath ? String(data.gdsPath).split(/[/\\]/).pop() : null;
        setInfoStatus('OK', gdsName || '—', geojson?.features?.length ?? null);
        logEvent('stdout', `Build OK — ${gdsName || 'no GDS'} (${geojson?.features?.length ?? 0} features)`);
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
        }).catch(() => { });
        // The run may have created or modified project files; refresh the tree.
        loadFileTree();
    });
    es.addEventListener('error', (e) => {
        if (completed)
            return;
        const msg = e.data;
        if (msg) {
            try {
                terminal.addLine('stderr', JSON.parse(msg).message || 'Error');
            }
            catch {
                terminal.addLine('stderr', 'Run failed.');
            }
        }
        else {
            terminal.addLine('stderr', 'Run failed — connection lost.');
        }
        setInfoStatus('failed', '—', null);
        logEvent('stderr', 'Build failed');
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
        }).catch(() => { });
    });
}
// ---- xterm.js terminal (multi-terminal panel) ----
function initTermPanel() {
    const container = document.getElementById('terminal-xterm');
    if (!container)
        return;
    // Terminal + FitAddon bundle into this chunk; TermPanel is a sibling chunk
    // exposed on window.TermPanel (loaded before studio.js). esbuild's IIFE
    // multi-entry build can't wire a value import from a sibling entry — it
    // emits `void 0` — so reach it via window like every other cross-chunk class.
    termPanel = new window.TermPanel(container, { Terminal, FitAddon });
}
function setupBottomPanel() {
    const TabManagerClass = window.TabManager;
    if (!TabManagerClass) {
        console.error('TabManager not loaded');
        return;
    }
    const xtermPanel = document.getElementById('terminal-xterm');
    const outputPanel = document.getElementById('terminal-output');
    const problemsPanel = document.getElementById('terminal-problems');
    // Initialize problems panel with placeholder
    problemsPanel.innerHTML = '<p class="placeholder">No problems detected.</p>';
    tabManager = new TabManagerClass('terminal-header', 'terminal-body');
    // Terminal tab — with xterm refit on activate
    tabManager.addTab('terminal', 'Terminal', xtermPanel, {
        active: true,
        onActivate: () => {
            activeTerminalTab = 'terminal';
            // Refit the active terminal now that its panel is visible again
            setTimeout(() => termPanel?.fitActive(), 50);
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
    // Info tab — live IDE/build status (file, env, last build result).
    const infoPanel = document.getElementById('terminal-info');
    tabManager.addTab('info', 'Info', infoPanel, {
        onActivate: () => { activeTerminalTab = 'info'; },
    });
    // Log tab — timestamped event feed (compiles, opens, errors).
    const logPanel = document.getElementById('terminal-log');
    tabManager.addTab('log', 'Log', logPanel, {
        onActivate: () => { activeTerminalTab = 'log'; },
    });
    // === Available tabs (shown in "+" dropdown) ===
    // Source tab — shows provenance info from selected GDS polygons
    tabManager.addAvailableTab('source', 'Source', () => {
        const panel = document.createElement('div');
        panel.className = 'terminal-tab-panel';
        panel.style.cssText = 'padding:8px 12px;font:13px/1.5 \'Cascadia Code\',\'Fira Code\',monospace;color:#cdd6f4;';
        panel.innerHTML = '<p class="placeholder">Click a polygon in the GDS viewer to inspect source</p>';
        // Listen for selection events dispatched by iframeBridge
        const handler = (e) => {
            const customEvent = e;
            updateSourcePanel(panel, customEvent.detail);
        };
        window.addEventListener('gds-selection', handler);
        // Clean up when panel is removed
        panel.__cleanup = () => window.removeEventListener('gds-selection', handler);
        return { el: panel };
    }, '📋');
    // Help tab — keyboard shortcuts reference (mirrors the viewer's Help tab).
    tabManager.addAvailableTab('help', 'Help', () => {
        const panel = document.createElement('div');
        panel.className = 'terminal-tab-panel';
        panel.style.cssText = 'padding:12px 16px;font:12px/1.6 \'Cascadia Code\',\'Fira Code\',monospace;color:#cdd6f4;overflow-y:auto;';
        panel.innerHTML = [
            '<div style="color:#89b4fa;font-weight:600;font-size:13px;margin-bottom:8px;">Keyboard Shortcuts</div>',
            '<div style="display:grid;grid-template-columns:120px 1fr;gap:4px 12px;">',
            '<span style="color:#f9e2af;">Ctrl+S</span><span>Save current file</span>',
            '<span style="color:#f9e2af;">Ctrl+Enter</span><span>Compile (run the active script)</span>',
            '<span style="color:#f9e2af;">Ctrl+\\</span><span>Toggle the viewer pane</span>',
            '<span style="color:#f9e2af;">⧉</span><span>Open a pane in a new window</span>',
            '</div>',
        ].join('\n');
        return { el: panel };
    }, '❓');
    // Seed the Info + Log panels with placeholders and render an initial Info row.
    initInfoLogPanels();
    renderInfoPanel();
}
// ---- Info + Log tabs (main IDE bottom panel) ----
// Info shows live IDE/build status; Log is an append-only timestamped event
// feed. Both write directly to their panel elements regardless of which tab is
// active, so events are captured even when the user isn't viewing them.
let infoState = {};
function renderInfoPanel() {
    const panel = document.getElementById('terminal-info');
    if (!panel)
        return;
    const envLabel = editorEnvSelect?.selectedOptions[0]?.textContent?.trim() || 'default';
    const rows = [
        ['File', infoState.file || '—'],
        ['Env', envLabel],
        ['Status', infoState.status || 'idle', infoState.status === 'OK'],
        ['GDS', infoState.gds || '—'],
        ['Components', infoState.components != null ? String(infoState.components) : '—'],
    ];
    panel.innerHTML = rows
        .map(([k, v, hl]) => `<div class="kv"><span class="key">${k}</span><span class="val${hl ? ' hl' : ''}">${escapeHtml(v)}</span></div>`)
        .join('');
}
function setInfoStatus(status, gds, components) {
    infoState.status = status;
    if (gds !== undefined)
        infoState.gds = gds;
    if (components !== undefined)
        infoState.components = components;
    renderInfoPanel();
}
function logEvent(level, msg) {
    const panel = document.getElementById('terminal-log');
    if (!panel)
        return;
    const ph = panel.querySelector('.placeholder');
    if (ph)
        panel.innerHTML = '';
    const line = document.createElement('div');
    line.className = level; // .system / .stdout / .stderr are styled in studio.css
    const ts = new Date().toLocaleTimeString();
    line.innerHTML = `<span class="timestamp">[${ts}]</span> ${escapeHtml(msg)}`;
    panel.appendChild(line);
    panel.scrollTop = panel.scrollHeight;
}
function initInfoLogPanels() {
    const info = document.getElementById('terminal-info');
    const log = document.getElementById('terminal-log');
    if (info)
        info.innerHTML = '<p class="placeholder">Build status will appear here</p>';
    if (log) {
        // Styling lives in studio.css (#terminal-log). Do NOT set log.style.cssText
        // here — cssText replaces ALL inline styles, which would wipe the
        // display:none that TabManager sets when this tab is inactive, causing the
        // Log panel to render stacked under the Terminal panel.
        log.innerHTML = '<p class="placeholder">Events will appear here</p>';
    }
}
// Poll for pending commands from MCP server (highlight source, select by source)
let lastCommandPoll = 0;
function pollMcpCommands() {
    // Poll every 1 second — commands are rare, this is lightweight
    const now = Date.now();
    if (now - lastCommandPoll < 1000)
        return;
    lastCommandPoll = now;
    fetch('/api/ide-state/commands')
        .then(res => res.ok ? res.json() : { commands: [] })
        .then(({ commands }) => {
        for (const cmd of commands) {
            if (cmd.type === 'highlightSource') {
                // Highlight source line in Monaco
                jumpToLine(cmd.line);
            }
            else if (cmd.type === 'selectBySource') {
                // Select polygons in viewer corresponding to source location
                bridge?.sendSelectBySource(cmd.file, cmd.line);
            }
            else if (cmd.type === 'reloadGds' && cmd.gdsPath) {
                // LLM run_script built a GDS — reload it into the viewer (the LLM
                // build channel; run_script consumes the /api/run SSE itself, so
                // compile() never sees it).
                loadGdsIntoViewer(cmd.gdsPath);
            }
        }
    })
        .catch(() => { });
}
// Collapse/expand the bottom console — mirrors the GDS viewer's toggleConsole().
function toggleTerminal() {
    const term = document.getElementById('terminal');
    const icon = document.getElementById('terminal-collapse');
    const collapsed = term.classList.toggle('collapsed');
    if (icon)
        icon.textContent = collapsed ? '▶' : '▼';
    // Hide the drag-resize handle while collapsed (nothing to resize)
    const handle = document.getElementById('terminal-resize-handle');
    if (handle)
        handle.style.display = collapsed ? 'none' : '';
    // Refit the active terminal to the restored height when expanding
    if (!collapsed) {
        setTimeout(() => termPanel?.fitActive(), 50);
    }
}
export function init() {
    // @ts-ignore - these are set by other chunks loaded via script tags
    editor = window.setupMonaco(monacoContainer);
    // @ts-ignore
    terminal = new window.TerminalRenderer(terminalBody);
    // @ts-ignore
    bridge = new window.IframeBridge(iframeViewer);
    // Initialize the multi-terminal panel (non-fatal — app works without it)
    try {
        initTermPanel();
    }
    catch (e) {
        console.error('terminal panel init failed:', e);
    }
    setupBottomPanel();
    // Setup UI
    setupMenuBar();
    setupSidebar();
    // Event listeners — per-group Compile + popout buttons
    editorCompileBtn?.addEventListener('click', compile);
    viewerCompileBtn?.addEventListener('click', compile);
    editorPopoutBtn?.addEventListener('click', () => {
        // The standalone editor page. ?file= is a fallback used only until the
        // popupReady handshake delivers the full open-tabs state.
        const f = currentFile ? encodeURIComponent(currentFile) : '';
        window.open('/editor/editor.html' + (f ? '?file=' + f : ''), '_blank');
    });
    viewerPopoutBtn?.addEventListener('click', () => {
        window.open('/viewer/viewer.html?popout=1', '_blank');
    });
    editorShowViewerBtn?.addEventListener('click', () => {
        // Reveal the GDS viewer pane (editor-only → split). Counterpart to the
        // viewer pane's ◀ collapse toggle.
        setLayoutMode('split');
    });
    // Expose studio for debugging
    window.studio = { editor, bridge, terminal, currentFile: null, openFile, jumpToLine };
    // Restore project + open file from cookies (falls back to server state)
    restoreWorkspace();
    // Load Python environments and restore the saved selection
    initPythonEnv();
    // Start polling for MCP commands (highlight, select) from Claude Code
    setInterval(pollMcpCommands, 1000);
    // Watch the viewed GDS's mtime so terminal / external builds refresh the viewer.
    setInterval(pollGdsMtime, 1000);
    // Restore layout mode from sessionStorage
    const savedLayout = sessionStorage.getItem('supergds-layout');
    setLayoutMode(savedLayout || 'split');
    // Render the (initially empty) editor + viewer tab bars so the placeholder
    // hints show before any file is opened / GDS is built.
    renderEditorTabs();
    renderViewerTabs();
    // Overleaf-style collapse arrow — toggles between split and editor-only
    if (collapseToggle) {
        collapseToggle.addEventListener('click', () => {
            if (layoutMode === 'split') {
                setLayoutMode('editor');
            }
            else {
                setLayoutMode('split');
            }
        });
    }
    // Bottom-console collapse — mirrors the GDS viewer's toggleConsole()
    const terminalCollapse = document.getElementById('terminal-collapse');
    if (terminalCollapse) {
        terminalCollapse.addEventListener('click', () => toggleTerminal());
    }
    // Keyboard shortcuts — Ctrl+\ (toggle), Ctrl+← (editor), Ctrl+→ (viewer), Ctrl+↓ (split)
    document.addEventListener('keydown', (e) => {
        if (!e.ctrlKey)
            return;
        if (e.key === '\\') {
            e.preventDefault();
            if (layoutMode === 'split')
                setLayoutMode('editor');
            else
                setLayoutMode('split');
        }
        else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            setLayoutMode('editor');
        }
        else if (e.key === 'ArrowRight') {
            e.preventDefault();
            setLayoutMode('viewer');
        }
        else if (e.key === 'ArrowDown') {
            e.preventDefault();
            setLayoutMode('split');
        }
    });
    // Listen for messages from popped-out standalone windows (editor.html /
    // viewer.html opened via a pane's ⧉ button). popupReady is the handshake by
    // which a freshly-opened popout asks for the current state (so it doesn't
    // have to recompile / reopen files from scratch); dockBack returns the window
    // to the main split; standaloneResult mirrors a compile run made standalone.
    window.addEventListener('message', (e) => {
        const msg = (e.data || {});
        if (msg.type === 'popupReady') {
            const payload = { type: 'popupState', pane: msg.pane };
            if (msg.pane === 'editor') {
                payload.editorState = {
                    openTabs: editorTabs.map(t => ({ path: t.path, content: t.model.getValue(), dirty: t.dirty })),
                    activePath: activeEditorPath,
                    env: editorEnvSelect?.value || '',
                };
            }
            else {
                payload.viewerState = {
                    tabs: viewerTabs.map(t => ({ id: t.id, label: t.label, data: t.data })),
                    activeId: activeViewerId,
                    env: viewerEnvSelect?.value || '',
                };
            }
            e.source?.postMessage(payload, '*');
            return;
        }
        if (msg.type === 'dockBack') {
            setLayoutMode('split');
            // Pick up any edits the user made in the standalone editor window.
            if (msg.pane === 'editor' && currentFile)
                openFile(currentFile);
        }
        else if (msg.type === 'standaloneResult' && msg.data) {
            // A compile run in a standalone editor produced a GDS — mirror it here.
            addViewerTab(msg.data);
            if (layoutMode === 'editor')
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
            if (project)
                setStudioCookie('project', project);
        }
        catch {
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
    }
    catch {
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
        }
        catch {
            clearStudioCookie('file');
        }
    }
}
init();
