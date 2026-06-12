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

// DOM Elements
const folderInput = document.getElementById('folder-input') as HTMLInputElement;
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

  menuOpenFolder.addEventListener('click', async () => {
    menuFile.classList.remove('open');

    // Try File System Access API first (modern Chrome/Edge)
    if (typeof (window as any).showDirectoryPicker === 'function') {
      try {
        const dirHandle = await (window as any).showDirectoryPicker();
        await openWorkspaceViaHandle(dirHandle);
        return;
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          terminal.addLine('system', `Error: ${err.message}`);
        }
        return;
      }
    }

    // For Safari and other browsers, try webkitdirectory
    // It will open a native folder picker dialog
    terminal.addLine('system', `Select a folder using the dialog...`);
    folderInput.click();
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

async function handleFolderOpen(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files?.length) return;

  // Get the folder path - try File.path first (Chrome), then webkitRelativePath
  const firstFile = input.files[0] as any;
  let folderPath: string;

  if (firstFile.path) {
    // Chrome/Edge - File.path gives full path to file, extract directory
    // path is like /Users/name/project/subdir/file.py
    // we want /Users/name/project (the root that was selected)
    const fullPath = firstFile.path;
    // Find where the selected folder starts - use webkitRelativePath to determine root
    if (firstFile.webkitRelativePath) {
      const relPath = firstFile.webkitRelativePath; // e.g., "project/subdir/file.py"
      const folderName = relPath.split('/')[0]; // e.g., "project"
      // The full path contains the folder name, find its position
      const idx = fullPath.lastIndexOf(folderName);
      if (idx > 0) {
        folderPath = fullPath.substring(0, idx + folderName.length);
      } else {
        folderPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
      }
    } else {
      folderPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
    }
  } else if (firstFile.webkitRelativePath) {
    // Safari - no File.path, but we can read file contents from the FileList
    // and send them to the server (same pattern as openWorkspaceViaHandle)
    const relPath = firstFile.webkitRelativePath;
    const folderName = relPath.split('/')[0];

    terminal.addLine('system', `Reading files from "${folderName}"...`);

    const validExts = ['py', 'json', 'ts', 'js', 'md', 'txt', 'yaml', 'yml', 'toml', 'cfg', 'ini'];
    const files: { path: string; content: string }[] = [];

    for (let i = 0; i < input.files!.length; i++) {
      const file = input.files![i];
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (!validExts.includes(ext || '')) continue;

      // webkitRelativePath is like "folderName/subdir/file.py"
      // Strip the top-level folder name to get "subdir/file.py"
      const fileRelPath = file.webkitRelativePath;
      const withoutFolder = fileRelPath.substring(fileRelPath.indexOf('/') + 1);

      try {
        const content = await file.text();
        files.push({ path: withoutFolder, content });
      } catch (err) {
        console.warn(`Failed to read ${fileRelPath}:`, err);
      }
    }

    if (files.length === 0) {
      terminal.addLine('system', `No supported files found in folder.`);
      return;
    }

    terminal.addLine('system', `Sending ${files.length} files to server...`);

    const wsResp = await fetch('/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: folderName, files }),
    });

    if (!wsResp.ok) {
      terminal.addLine('system', `Error: Failed to open folder (${wsResp.status})`);
      return;
    }

    workspacePath = folderName;
    sessionStorage.setItem('supergds-workspace', folderName);
    sessionStorage.setItem('supergds-current-file', '');
    terminal.addLine('system', `Opened folder: ${folderName}`);
    await loadFileTree();
    return;
  } else {
    terminal.addLine('system', `Error: Cannot determine folder path. Please use File > Open Folder.`);
    return;
  }

  await openWorkspace(folderPath);
}

// Use File System Access API for modern directory selection
async function openWorkspaceWithPicker() {
  // Check if File System Access API is available
  if (!('showDirectoryPicker' in window)) {
    terminal.addLine('system', `Your browser doesn't support folder selection. Please use Chrome or Edge.`);
    return;
  }

  try {
    const dirHandle = await (window as any).showDirectoryPicker();
    // With File System Access API, we get a DirectoryHandle
    // We need to iterate files and send them to the server
    // For now, use the name as workspace identifier
    const folderPath = dirHandle.name;
    await openWorkspace(folderPath);
  } catch (err: any) {
    if (err.name !== 'AbortError') {
      terminal.addLine('system', `Error opening folder: ${err.message}`);
    }
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
  await loadFileTree();
}

// File System Access API - read files from DirectoryHandle and send to server
async function openWorkspaceViaHandle(dirHandle: FileSystemDirectoryHandle) {
  // Build file tree by iterating directory recursively
  const files: { path: string; content: string }[] = [];

  async function traverseDir(handle: FileSystemDirectoryHandle, basePath: string = '') {
    for await (const entry of handle.values()) {
      const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;

      if (entry.kind === 'directory') {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) {
          continue; // Skip these directories
        }
        const subDir = await handle.getDirectoryHandle(entry.name);
        await traverseDir(subDir, entryPath);
      } else if (entry.kind === 'file') {
        // Check extension - only include useful files
        const ext = entry.name.split('.').pop()?.toLowerCase();
        if (['py', 'json', 'ts', 'js', 'md', 'txt', 'yaml', 'yml', 'toml', 'cfg', 'ini'].includes(ext || '')) {
          try {
            const fileHandle = await handle.getFileHandle(entry.name);
            const file = await fileHandle.getFile();
            const content = await file.text();
            files.push({ path: entryPath, content });
          } catch (err) {
            console.warn(`Failed to read file ${entryPath}:`, err);
          }
        }
      }
    }
  }

  try {
    await traverseDir(dirHandle);
  } catch (err) {
    terminal.addLine('system', `Error reading directory: ${err}`);
    return;
  }

  // Send all files to server in one request
  terminal.addLine('system', `Sending ${files.length} files to server...`);

  const wsResp = await fetch('/workspace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      workspace: dirHandle.name,
      files: files
    }),
  });

  if (!wsResp.ok) {
    terminal.addLine('system', `Error: Failed to open folder (${wsResp.status})`);
    return;
  }

  workspacePath = dirHandle.name;
  sessionStorage.setItem('supergds-workspace', dirHandle.name);

  // Restore previously open file if any
  const savedFile = sessionStorage.getItem('supergds-current-file');
  if (savedFile) {
    openFile(savedFile).catch(() => {});
  }

  terminal.addLine('system', `Opened folder: ${dirHandle.name}`);
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

async function loadFileTree() {
  const res = await fetch('/api/files');
  if (!res.ok) {
    console.error('Failed to load files:', res.status);
    fileTree.innerHTML = '<div style="padding:8px;color:#f38ba8;">Could not read workspace. Try File → Open Folder.</div>';
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

  // Expand first level by default
  fileTree.querySelectorAll('.tree-item.folder').forEach(item => {
    item.classList.add('expanded');
    const toggle = item.querySelector('.folder-toggle');
    if (toggle) toggle.textContent = '▼';
    const childContainer = item.nextElementSibling as HTMLElement;
    if (childContainer) childContainer.style.display = 'block';
  });
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
          terminal.addLine('stdout', `  ${src.file}:${src.line}`, { file: src.file, line: src.line });
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

  // Dynamically import xterm from the CDN-loaded global (or bundled)
  // xterm is loaded via CDN in index.html
  const xtermLib = (window as any).xtermLib;
  if (!xtermLib || typeof xtermLib.Terminal !== 'function') return;

  xterm = new xtermLib.Terminal({
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

  xtermFitAddon = new xtermLib.FitAddon();
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

  xtermWs.onopen = () => {
    // Send initial size
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
    xterm?.write('\r\n\x1b[90m— connection lost —\x1b[0m\r\n');
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

  // Claude tab — ask questions about the layout
  tabManager.addAvailableTab('claude', 'Claude', () => {
    const panel = document.createElement('div');
    panel.className = 'terminal-tab-panel';
    panel.style.cssText = 'display:flex;flex-direction:column;height:100%;font:13px/1.5 \'Cascadia Code\',\'Fira Code\',monospace;color:#cdd6f4;';

    const messages = document.createElement('div');
    messages.style.cssText = 'flex:1;overflow-y:auto;padding:4px 0;';
    messages.innerHTML = '<p class="placeholder" style="color:#585b70;font-style:italic;padding:20px 0;text-align:center;">Ask about the GDS layout...</p>';
    panel.appendChild(messages);

    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;gap:4px;padding-top:4px;border-top:1px solid #313244;';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Ask about the layout...';
    input.style.cssText = 'flex:1;background:#11111b;border:1px solid #313244;color:#cdd6f4;padding:4px 8px;border-radius:3px;font:12px/1.4 \'Cascadia Code\',\'Fira Code\',monospace;outline:none;';

    const sendBtn = document.createElement('button');
    sendBtn.textContent = 'Send';
    sendBtn.style.cssText = 'background:#89b4fa;color:#1e1e2e;border:none;padding:4px 10px;border-radius:3px;cursor:pointer;font-size:11px;font-weight:600;';

    const sendQuestion = () => {
      const q = input.value.trim();
      if (!q) return;
      // Add user message
      const userMsg = document.createElement('div');
      userMsg.style.cssText = 'padding:4px 8px;margin:2px 0;color:#cdd6f4;';
      userMsg.textContent = '> ' + q;
      messages.appendChild(userMsg);
      input.value = '';

      // Forward to viewer's askClaude endpoint
      fetch('/api/ask-claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      }).then(r => r.json()).then(data => {
        const resp = document.createElement('div');
        resp.style.cssText = 'padding:4px 8px;margin:2px 0;color:#89b4fa;white-space:pre-wrap;';
        resp.textContent = data.answer || data.error || 'No response';
        messages.appendChild(resp);
        messages.scrollTop = messages.scrollHeight;
      }).catch(() => {
        const err = document.createElement('div');
        err.style.cssText = 'padding:4px 8px;margin:2px 0;color:#f38ba8;';
        err.textContent = 'Failed to get response';
        messages.appendChild(err);
      });
      messages.scrollTop = messages.scrollHeight;
    };

    sendBtn.addEventListener('click', sendQuestion);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') sendQuestion(); });

    inputRow.appendChild(input);
    inputRow.appendChild(sendBtn);
    panel.appendChild(inputRow);

    return { el: panel };
  }, '🤖');

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

export function init() {
  // @ts-ignore - these are set by other chunks loaded via script tags
  editor = (window as any).setupMonaco(monacoContainer);
  // @ts-ignore
  terminal = new (window as any).TerminalRenderer(terminalBody);
  terminal.sourceInfoMode = sourceInfoMode;
  // @ts-ignore
  bridge = new (window as any).IframeBridge(iframeViewer);

  // Initialize xterm.js terminal (non-fatal — app works without it)
  try { initXterm(); } catch (e) { console.error('xterm init failed:', e); }
  setupBottomPanel();

  // Setup UI
  setupMenuBar();
  setupSidebar();

  // Event listeners
  folderInput.addEventListener('change', handleFolderOpen);
  runBtn.addEventListener('click', handleRun);
  rebuildBtn.addEventListener('click', handleRebuild);

  // Expose studio for debugging
  (window as any).studio = { editor, bridge, terminal, currentFile: null, openFile, jumpToLine };

  // Restore workspace from server-persisted state
  restoreWorkspace();

  // Load Python environments
  loadPythonEnvironments();

  // Initialize terminal settings
  initSettings();

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
  window.addEventListener('resize', () => {
    const handle = document.getElementById('resize-handle');
    const editorPane = document.getElementById('editor-pane');
    if (handle && editorPane && !resizeHandle.isDragging()) {
      handle.style.left = `${editorPane.getBoundingClientRect().width}px`;
    }
  });
}

async function restoreWorkspace() {
  try {
    const res = await fetch('/api/workspace');
    const data = await res.json();
    if (data.workspace) {
      workspacePath = data.workspace;
      sessionStorage.setItem('supergds-workspace', data.workspace);
      try {
        await openWorkspace(data.workspace);
      } catch {
        // Workspace path no longer exists (e.g. deleted temp dir) — clear it
        console.warn('Restored workspace not found, clearing:', data.workspace);
        workspacePath = null;
        sessionStorage.removeItem('supergds-workspace');
        await fetch('/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ workspace: '' }),
        }).catch(() => {});
        fileTree.innerHTML = '<div style="padding:8px;color:#6c7086;">Open a folder to get started (File → Open Folder)</div>';
      }
    }
  } catch {
    // No persisted workspace — user will open one manually
    fileTree.innerHTML = '<div style="padding:8px;color:#6c7086;">Open a folder to get started (File → Open Folder)</div>';
  }
}

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

init();