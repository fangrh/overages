import { setupMonaco } from './monacoSetup.js';
import { TerminalRenderer } from './terminal.js';
import { IframeBridge } from './iframeBridge.js';
let editor;
let bridge;
let terminal;
let currentFile = null;
const folderInput = document.getElementById('folder-input');
const openFolderBtn = document.getElementById('open-folder-btn');
const runBtn = document.getElementById('run-btn');
const rebuildBtn = document.getElementById('rebuild-btn');
const fileSelect = document.getElementById('file-select');
const monacoContainer = document.getElementById('monaco-editor');
const iframeViewer = document.getElementById('gds-viewer');
const terminalBody = document.getElementById('terminal-body');
const clearBtn = document.getElementById('clear-terminal');
export function init() {
    editor = setupMonaco(monacoContainer);
    terminal = new TerminalRenderer(terminalBody);
    bridge = new IframeBridge(iframeViewer);
    openFolderBtn.addEventListener('click', () => folderInput.click());
    folderInput.addEventListener('change', handleFolderOpen);
    runBtn.addEventListener('click', handleRun);
    rebuildBtn.addEventListener('click', handleRebuild);
    fileSelect.addEventListener('change', handleFileSelect);
    clearBtn.addEventListener('click', () => terminal.clear());
    window.studio = { editor, bridge, terminal };
    const savedWs = sessionStorage.getItem('supergds-workspace');
    if (savedWs) {
        loadFileList();
        runBtn.disabled = false;
        rebuildBtn.disabled = false;
        fileSelect.disabled = false;
    }
}
async function handleFolderOpen(e) {
    const input = e.target;
    if (!input.files?.length)
        return;
    const path = input.files[0].webkitRelativePath.split('/')[0];
    sessionStorage.setItem('supergds-workspace', path);
    await fetch('/api/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ workspace: path }),
    });
    runBtn.disabled = false;
    rebuildBtn.disabled = false;
    fileSelect.disabled = false;
    await loadFileList();
}
async function loadFileList() {
    const res = await fetch('/api/files');
    const { files } = await res.json();
    fileSelect.innerHTML = '';
    const pyFiles = files.filter((f) => f.endsWith('.py'));
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
async function handleFileSelect(e) {
    const select = e.target;
    currentFile = select.value;
    if (!currentFile)
        return;
    const res = await fetch(`/api/files/${currentFile}`);
    const { content } = await res.json();
    editor.setValue(content);
}
async function saveCurrentFile() {
    if (!currentFile)
        return;
    const content = editor.getValue();
    await fetch(`/api/files/${currentFile}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
    });
}
async function handleRun() {
    if (!currentFile)
        return;
    await saveCurrentFile();
    terminal.clear();
    terminal.addLine('system', `$ python ${currentFile}`);
    const es = new EventSource(`/api/run?pythonFile=${encodeURIComponent(currentFile)}`);
    es.addEventListener('start', (e) => terminal.addLine('stdout', (JSON.parse(e.data)).status));
    es.addEventListener('stdout', (e) => terminal.addLine('stdout', (JSON.parse(e.data)).line));
    es.addEventListener('stderr', (e) => terminal.addLine('stderr', (JSON.parse(e.data)).line));
    es.addEventListener('complete', (e) => {
        const data = JSON.parse(e.data);
        bridge.sendLoadGds(data);
        terminal.addLine('system', 'Done.');
        es.close();
    });
    es.addEventListener('error', (e) => {
        terminal.addLine('stderr', (JSON.parse(e.data)).message || 'Error');
        es.close();
    });
}
async function handleRebuild() {
    await handleRun();
}
init();
