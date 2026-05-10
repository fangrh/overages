"use strict";
(() => {
  // frontend/terminal.ts
  var TerminalRenderer = class {
    container;
    autoScroll = true;
    constructor(container) {
      this.container = container;
      container.parentElement?.addEventListener("scroll", () => {
        const { scrollTop, scrollHeight, clientHeight } = container.parentElement;
        this.autoScroll = scrollHeight - scrollTop - clientHeight < 50;
      });
    }
    addLine(type, text) {
      const el = document.createElement("div");
      el.className = type;
      const time = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", { hour12: false });
      const ts = document.createElement("span");
      ts.className = "timestamp";
      ts.textContent = `[${time}] `;
      ts.style.color = "#6c7086";
      el.appendChild(ts);
      const textNode = document.createElement("span");
      textNode.textContent = text;
      el.appendChild(textNode);
      this.container.appendChild(el);
      if (this.autoScroll) {
        this.container.parentElement.scrollTop = this.container.parentElement.scrollHeight;
      }
    }
    clear() {
      this.container.innerHTML = "";
    }
  };

  // frontend/iframeBridge.ts
  var IframeBridge = class {
    iframe;
    ready = false;
    pending = [];
    constructor(iframe) {
      this.iframe = iframe;
      window.addEventListener("message", this.onMessage.bind(this));
      let attempts = 0;
      const checkReady = setInterval(() => {
        attempts++;
        if (this.ready || attempts > 50) {
          clearInterval(checkReady);
          return;
        }
        this.iframe.contentWindow?.postMessage({ type: "ping" }, "*");
      }, 100);
    }
    onMessage(e) {
      const msg = e.data;
      if (!msg || typeof msg !== "object") return;
      switch (msg.type) {
        case "webviewReady":
          this.ready = true;
          for (const data of this.pending) {
            this.sendLoadGds(data);
          }
          this.pending = [];
          break;
        case "selectComponents":
          this.forwardToEditor(msg.components);
          break;
        case "askClaude":
          this.handleAskClaude(msg.components, msg.question);
          break;
      }
    }
    sendLoadGds(data) {
      const msg = { type: "loadGds", ...data };
      if (!this.ready) {
        this.pending.push(data);
        return;
      }
      this.iframe.contentWindow?.postMessage(msg, "*");
    }
    forwardToEditor(components) {
      const studio = window.studio;
      if (!studio?.editor) return;
      const editor2 = studio.editor;
      const model = editor2.getModel();
      if (!model) return;
      const monacoObj = window.monaco;
      if (!monacoObj) return;
      const decorations = [];
      for (const comp of components) {
        const prov = comp.provenance || {};
        if (prov.file && prov.line) {
          const line = typeof prov.line === "number" ? prov.line : parseInt(String(prov.line), 10);
          if (!isNaN(line)) {
            decorations.push({
              range: new monacoObj.Range(line, 1, line, model.getLineMaxLength(line)),
              options: {
                isWholeLine: true,
                className: "source-highlight",
                glyphMarginClassName: "source-glyph"
              }
            });
          }
        }
      }
      editor2.deltaDecorations([], decorations);
    }
    handleAskClaude(components, question) {
      console.log("askClaude", components, question);
    }
  };

  // frontend/monacoSetup.ts
  var monaco = window.monaco;
  function setupMonaco(container) {
    if (!monaco) {
      console.error("Monaco not loaded - window.monaco is undefined");
      return null;
    }
    monaco.languages.register({ id: "python" });
    monaco.languages.setLanguageConfiguration("python", {
      comments: { lineComment: "#", blockComment: ["'''", "'''"] },
      brackets: [["{", "}"], ["(", ")"], ["[", "]"]],
      autoClosingPairs: [
        { open: "{", close: "}" },
        { open: "(", close: ")" },
        { open: "[", close: "]" },
        { open: '"', close: '"' },
        { open: "'", close: "'" }
      ]
    });
    const editor2 = monaco.editor.create(container, {
      value: "# Open a Python file to begin\n",
      language: "python",
      theme: "vs-dark",
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
      minimap: { enabled: false },
      lineNumbers: "on",
      scrollBeyondLastLine: false,
      automaticLayout: true,
      wordWrap: "on"
    });
    return editor2;
  }

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
    editor = setupMonaco(monacoContainer);
    terminal = new TerminalRenderer(terminalBody);
    bridge = new IframeBridge(iframeViewer);
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
    const path = input.files[0].webkitRelativePath.split("/")[0];
    sessionStorage.setItem("supergds-workspace", path);
    await fetch("/api/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: path })
    });
    runBtn.disabled = false;
    rebuildBtn.disabled = false;
    fileSelect.disabled = false;
    await loadFileList();
  }
  async function loadFileList() {
    const res = await fetch("/api/files");
    const { files } = await res.json();
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
