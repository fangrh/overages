"use strict";
(() => {
  // frontend/studio.ts
  var editor;
  var bridge;
  var terminal;
  var currentFile = null;
  var ResizeHandle = class {
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
      this.handle.addEventListener("mousedown", (e) => {
        this.dragging = true;
        this.startX = e.clientX;
        this.startEditorWidth = this.editorPane.getBoundingClientRect().width;
        this.handle.classList.add("dragging");
        e.preventDefault();
      });
      window.addEventListener("mousemove", (e) => {
        if (!this.dragging) return;
        const dx = e.clientX - this.startX;
        const newWidth = this.startEditorWidth + dx;
        const containerWidth = this.editorPane.parentElement.getBoundingClientRect().width;
        const minWidth = 200;
        const maxWidth = containerWidth - minWidth - 5;
        const clamped = Math.max(minWidth, Math.min(maxWidth, newWidth));
        this.editorPane.style.flex = "none";
        this.editorPane.style.width = `${clamped}px`;
      });
      window.addEventListener("mouseup", () => {
        if (this.dragging) {
          this.dragging = false;
          this.handle.classList.remove("dragging");
        }
      });
    }
    updateHandlePosition() {
      const editorRect = this.editorPane.getBoundingClientRect();
      this.handle.style.left = `${editorRect.width}px`;
    }
  };
  var folderInput = document.getElementById("folder-input");
  var openFolderBtn = document.getElementById("open-folder-btn");
  var runBtn = document.getElementById("run-btn");
  var rebuildBtn = document.getElementById("rebuild-btn");
  var fileSelect = document.getElementById("file-select");
  var monacoContainer = document.getElementById("monaco-editor");
  var iframeViewer = document.getElementById("gds-viewer");
  var terminalBody = document.getElementById("terminal-body");
  var clearBtn = document.getElementById("clear-terminal");
  function init() {
    editor = window.setupMonaco(monacoContainer);
    terminal = new window.TerminalRenderer(terminalBody);
    bridge = new window.IframeBridge(iframeViewer);
    openFolderBtn.addEventListener("click", () => folderInput.click());
    folderInput.addEventListener("change", handleFolderOpen);
    runBtn.addEventListener("click", handleRun);
    rebuildBtn.addEventListener("click", handleRebuild);
    fileSelect.addEventListener("change", handleFileSelect);
    clearBtn.addEventListener("click", () => terminal.clear());
    window.studio = { editor, bridge, terminal };
    const savedWs = sessionStorage.getItem("supergds-workspace");
    if (savedWs) {
      loadFileList();
      runBtn.disabled = false;
      rebuildBtn.disabled = false;
      fileSelect.disabled = false;
    }
    new ResizeHandle("resize-handle", "editor-pane", "viewer-pane");
    window.addEventListener("resize", () => {
      const handle = document.getElementById("resize-handle");
      const editorPane = document.getElementById("editor-pane");
      handle.style.left = `${editorPane.getBoundingClientRect().width}px`;
    });
  }
  async function handleFolderOpen(e) {
    const input = e.target;
    if (!input.files?.length) return;
    const firstFile = input.files[0];
    let folderPath;
    if (firstFile.path) {
      folderPath = firstFile.path;
    } else if (firstFile.webkitRelativePath) {
      folderPath = firstFile.webkitRelativePath.split("/")[0];
    } else {
      console.error("Cannot determine folder path - no path or webkitRelativePath");
      return;
    }
    sessionStorage.setItem("supergds-workspace", folderPath);
    await fetch("/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: folderPath })
    });
    runBtn.disabled = false;
    rebuildBtn.disabled = false;
    fileSelect.disabled = false;
    await loadFileList();
  }
  async function loadFileList() {
    const res = await fetch("/api/files");
    if (!res.ok) {
      console.error("Failed to load files:", res.status, await res.text());
      fileSelect.innerHTML = "<option>Error loading files</option>";
      return;
    }
    const { files } = await res.json();
    if (!files) {
      fileSelect.innerHTML = "<option>No files found</option>";
      return;
    }
    fileSelect.innerHTML = "";
    const pyFiles = files.filter((f) => f.endsWith(".py"));
    if (pyFiles.length === 0) {
      fileSelect.innerHTML = "<option>No Python files</option>";
      return;
    }
    for (const f of pyFiles) {
      const opt = document.createElement("option");
      opt.value = f;
      opt.textContent = f;
      fileSelect.appendChild(opt);
    }
    fileSelect.dispatchEvent(new Event("change"));
  }
  async function handleFileSelect(e) {
    const select = e.target;
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
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
  }
  async function handleRun() {
    if (!currentFile) return;
    await saveCurrentFile();
    terminal.clear();
    terminal.addLine("system", `$ python ${currentFile}`);
    const es = new EventSource(`/api/run?pythonFile=${encodeURIComponent(currentFile)}`);
    es.addEventListener("start", (e) => terminal.addLine("stdout", JSON.parse(e.data).status));
    es.addEventListener("stdout", (e) => terminal.addLine("stdout", JSON.parse(e.data).line));
    es.addEventListener("stderr", (e) => terminal.addLine("stderr", JSON.parse(e.data).line));
    es.addEventListener("complete", (e) => {
      const data = JSON.parse(e.data);
      bridge.sendLoadGds(data);
      terminal.addLine("system", "Done.");
      es.close();
    });
    es.addEventListener("error", (e) => {
      terminal.addLine("stderr", JSON.parse(e.data).message || "Error");
      es.close();
    });
  }
  async function handleRebuild() {
    await handleRun();
  }
  init();
})();
//# sourceMappingURL=studio.js.map
