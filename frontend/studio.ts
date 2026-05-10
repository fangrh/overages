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

type MonacoEditor = any;

let editor: MonacoEditor;
let bridge: any;
let terminal: any;
let currentFile: string | null = null;

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

const folderInput = document.getElementById('folder-input') as HTMLInputElement;
const openFolderBtn = document.getElementById('open-folder-btn') as HTMLButtonElement;
const runBtn = document.getElementById('run-btn') as HTMLButtonElement;
const rebuildBtn = document.getElementById('rebuild-btn') as HTMLButtonElement;
const fileSelect = document.getElementById('file-select') as HTMLSelectElement;
const monacoContainer = document.getElementById('monaco-editor')!;
const iframeViewer = document.getElementById('gds-viewer') as HTMLIFrameElement;
const terminalBody = document.getElementById('terminal-body')!;
const clearBtn = document.getElementById('clear-terminal') as HTMLButtonElement;

interface Studio {
  editor: MonacoEditor;
  bridge: IframeBridge;
  terminal: TerminalRenderer;
}

export function init() {
  // @ts-ignore - these are set by other chunks loaded via script tags
  editor = (window as any).setupMonaco(monacoContainer);
  // @ts-ignore
  terminal = new (window as any).TerminalRenderer(terminalBody);
  // @ts-ignore
  bridge = new (window as any).IframeBridge(iframeViewer);

  openFolderBtn.addEventListener('click', () => folderInput.click());
  folderInput.addEventListener('change', handleFolderOpen);
  runBtn.addEventListener('click', handleRun);
  rebuildBtn.addEventListener('click', handleRebuild);
  fileSelect.addEventListener('change', handleFileSelect);
  clearBtn.addEventListener('click', () => terminal.clear());

  (window as unknown as { studio: Studio }).studio = { editor, bridge, terminal };

  const savedWs = sessionStorage.getItem('supergds-workspace');
  if (savedWs) {
    loadFileList();
    runBtn.disabled = false;
    rebuildBtn.disabled = false;
    fileSelect.disabled = false;
  }

  new ResizeHandle('resize-handle', 'editor-pane', 'viewer-pane');
  window.addEventListener('resize', () => {
    const handle = document.getElementById('resize-handle')!;
    const editorPane = document.getElementById('editor-pane')!;
    handle.style.left = `${editorPane.getBoundingClientRect().width}px`;
  });
}

async function handleFolderOpen(e: Event) {
  const input = e.target as HTMLInputElement;
  if (!input.files?.length) return;

  // Get the actual folder path - try webkitRelativePath first, but for actual browser
  // folder selection, we need the full path. Use the path property if available (Chrome),
  // otherwise fall back to webkitRelativePath.
  const firstFile = input.files[0] as any;
  let folderPath: string;

  if (firstFile.path) {
    // Chrome/Edge - actual full path is available
    // webkitRelativePath is like "folderName/file.py", get folder from it
    folderPath = firstFile.path;
  } else if (firstFile.webkitRelativePath) {
    // Fallback - webkitRelativePath gives "folderName/file.py", get folder name
    folderPath = firstFile.webkitRelativePath.split('/')[0];
  } else {
    console.error('Cannot determine folder path - no path or webkitRelativePath');
    return;
  }

  sessionStorage.setItem('supergds-workspace', folderPath);

  await fetch('/workspace', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace: folderPath }),
  });

  runBtn.disabled = false;
  rebuildBtn.disabled = false;
  fileSelect.disabled = false;
  await loadFileList();
}

async function loadFileList() {
  const res = await fetch('/api/files');
  if (!res.ok) {
    console.error('Failed to load files:', res.status, await res.text());
    fileSelect.innerHTML = '<option>Error loading files</option>';
    return;
  }
  const { files } = await res.json();
  if (!files) {
    fileSelect.innerHTML = '<option>No files found</option>';
    return;
  }
  fileSelect.innerHTML = '';
  const pyFiles = files.filter((f: string) => f.endsWith('.py'));
  if (pyFiles.length === 0) {
    fileSelect.innerHTML = '<option>No Python files</option>';
    return;
  }
  for (const f of pyFiles) {
    const opt = document.createElement('option');
    opt.value = f;
    opt.textContent = f;
    fileSelect.appendChild(opt);
  }
  fileSelect.dispatchEvent(new Event('change'));
}

async function handleFileSelect(e: Event) {
  const select = e.target as HTMLSelectElement;
  currentFile = select.value;
  if (!currentFile) return;
  const res = await fetch(`/api/files/${currentFile}`);
  const { content } = await res.json();
  editor.setValue(content);
}

async function saveCurrentFile() {
  if (!currentFile) return;
  const content = editor.getValue();
  await fetch(`/api/files/${currentFile}`, {
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

  const es = new EventSource(`/api/run?pythonFile=${encodeURIComponent(currentFile)}`);
  es.addEventListener('start', (e: MessageEvent) => terminal.addLine('stdout', (JSON.parse(e.data)).status));
  es.addEventListener('stdout', (e: MessageEvent) => terminal.addLine('stdout', (JSON.parse(e.data)).line));
  es.addEventListener('stderr', (e: MessageEvent) => terminal.addLine('stderr', (JSON.parse(e.data)).line));
  es.addEventListener('complete', (e: MessageEvent) => {
    const data = JSON.parse(e.data);
    bridge.sendLoadGds(data);
    terminal.addLine('system', 'Done.');
    es.close();
  });
  es.addEventListener('error', (e: MessageEvent) => {
    terminal.addLine('stderr', (JSON.parse(e.data)).message || 'Error');
    es.close();
  });
}

async function handleRebuild() {
  await handleRun();
}

init();
