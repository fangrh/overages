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
    this.handle.addEventListener('mousedown', (e) => {
      this.dragging = true;
      this.startX = e.clientX;
      this.startEditorWidth = this.editorPane.getBoundingClientRect().width;
      this.handle.classList.add('dragging');
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!this.dragging) return;
      const dx = e.clientX - this.startX;
      const newWidth = this.startEditorWidth + dx;
      const containerWidth = this.editorPane.parentElement!.getBoundingClientRect().width;
      const minWidth = 200;
      const maxWidth = containerWidth - minWidth - 5;
      const clamped = Math.max(minWidth, Math.min(maxWidth, newWidth));
      this.editorPane.style.flex = 'none';
      this.editorPane.style.width = `${clamped}px`;
    });

    window.addEventListener('mouseup', () => {
      if (this.dragging) {
        this.dragging = false;
        this.handle.classList.remove('dragging');
      }
    });
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
const terminalBody = document.getElementById('terminal-body')!;
const clearBtn = document.getElementById('clear-terminal') as HTMLButtonElement;
const fileTree = document.getElementById('file-tree')!;
const sidebar = document.getElementById('sidebar')!;
const currentFileLabel = document.getElementById('current-file')!;
const menuFile = document.getElementById('menu-file')!;
const menuOpenFolder = document.getElementById('menu-open-folder')!;

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

  runBtn.disabled = false;
  rebuildBtn.disabled = false;
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

  // Restore previously open file if any
  const savedFile = sessionStorage.getItem('supergds-current-file');
  if (savedFile) {
    openFile(savedFile).catch(() => {});
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

async function loadFileTree() {
  const res = await fetch('/api/files');
  if (!res.ok) {
    console.error('Failed to load files:', res.status);
    fileTree.innerHTML = '<div style="padding:8px;color:#f38ba8;">Error loading files</div>';
    return;
  }

  const { files } = await res.json();
  if (!files || files.length === 0) {
    fileTree.innerHTML = '<div style="padding:8px;color:#6c7086;">No files found</div>';
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
  terminal.addLine('system', `$ python ${currentFile}`);

  let completed = false;
  const es = new EventSource(`/api/run?pythonFile=${encodeURIComponent(currentFile)}`);
  es.addEventListener('start', (e: MessageEvent) => terminal.addLine('stdout', (JSON.parse(e.data)).status));
  es.addEventListener('stdout', (e: MessageEvent) => terminal.addLine('stdout', (JSON.parse(e.data)).line));
  es.addEventListener('stderr', (e: MessageEvent) => terminal.addLine('stderr', (JSON.parse(e.data)).line));
  es.addEventListener('complete', (e: MessageEvent) => {
    completed = true;
    const data = JSON.parse(e.data);
    bridge.sendLoadGds(data);
    terminal.addLine('system', 'Done.');
    es.close();
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
  });
}

async function handleRebuild() {
  await handleRun();
}

export function init() {
  // @ts-ignore - these are set by other chunks loaded via script tags
  editor = (window as any).setupMonaco(monacoContainer);
  // @ts-ignore
  terminal = new (window as any).TerminalRenderer(terminalBody);
  // @ts-ignore
  bridge = new (window as any).IframeBridge(iframeViewer);

  // Setup UI
  setupMenuBar();
  setupSidebar();

  // Event listeners
  folderInput.addEventListener('change', handleFolderOpen);
  runBtn.addEventListener('click', handleRun);
  rebuildBtn.addEventListener('click', handleRebuild);
  clearBtn.addEventListener('click', () => terminal.clear());

  // Expose studio for debugging
  (window as any).studio = { editor, bridge, terminal };

  // Restore session — re-establish workspace on server
  // Skip restore for browser-uploaded files (temp dir lost on server restart)
  const savedWs = sessionStorage.getItem('supergds-workspace');
  if (savedWs && savedWs.includes('/')) {
    // Absolute path — native filesystem workspace, safe to restore
    workspacePath = savedWs;
    openWorkspace(savedWs).catch(() => {
      sessionStorage.removeItem('supergds-workspace');
      terminal.addLine('system', 'Workspace no longer available. Please re-open folder.');
    });
  } else if (savedWs) {
    // Relative/folder-name only — was a browser upload, temp dir is gone
    sessionStorage.removeItem('supergds-workspace');
  }

  // Setup resize handle
  new ResizeHandle('resize-handle', 'editor-pane', 'viewer-pane');
  window.addEventListener('resize', () => {
    const handle = document.getElementById('resize-handle')!;
    const editorPane = document.getElementById('editor-pane')!;
    handle.style.left = `${editorPane.getBoundingClientRect().width}px`;
  });
}

init();