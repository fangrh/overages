"use strict";
(() => {
  // frontend/studio.ts
  var editor;
  var bridge;
  var terminal;
  var currentFile = null;
  var workspacePath = null;
  var xterm = null;
  var xtermFitAddon = null;
  var xtermWs = null;
  var activeTerminalTab = "terminal";
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
      this.handle.addEventListener("pointerdown", (e) => {
        this.dragging = true;
        this.startX = e.clientX;
        this.startEditorWidth = this.editorPane.getBoundingClientRect().width;
        this.handle.classList.add("dragging");
        this.editorPane.parentElement.classList.add("no-transition");
        this.handle.setPointerCapture(e.pointerId);
        e.preventDefault();
        e.stopPropagation();
      });
      this.handle.addEventListener("pointermove", (e) => {
        if (!this.dragging) return;
        const dx = e.clientX - this.startX;
        const newWidth = this.startEditorWidth + dx;
        const containerWidth = this.editorPane.parentElement.getBoundingClientRect().width;
        const minWidth = 200;
        const handleWidth = 5;
        const clamped = Math.max(minWidth, Math.min(containerWidth - minWidth - handleWidth, newWidth));
        const remainingWidth = containerWidth - clamped - handleWidth;
        this.editorPane.style.flex = "none";
        this.editorPane.style.width = `${clamped}px`;
        this.viewerPane.style.flex = "none";
        this.viewerPane.style.width = `${remainingWidth}px`;
        this.handle.style.left = `${clamped}px`;
        const iframe = document.getElementById("gds-viewer");
        if (iframe) {
          iframe.style.width = "99%";
          void iframe.offsetWidth;
          iframe.style.width = "";
        }
      });
      this.handle.addEventListener("pointerup", (e) => {
        if (!this.dragging) return;
        this.dragging = false;
        this.handle.classList.remove("dragging");
        this.editorPane.parentElement.classList.remove("no-transition");
        const remainingWidth = this.viewerPane.parentElement.getBoundingClientRect().width - parseFloat(this.handle.style.left || "0");
        this.viewerPane.style.flex = "none";
        this.viewerPane.style.width = `${remainingWidth}px`;
        this.handle.releasePointerCapture(e.pointerId);
        const iframe = document.getElementById("gds-viewer");
        iframe?.contentWindow?.postMessage({ type: "resize" }, "*");
      });
      this.handle.addEventListener("pointercancel", (e) => {
        if (!this.dragging) return;
        this.dragging = false;
        this.handle.classList.remove("dragging");
        this.editorPane.parentElement.classList.remove("no-transition");
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
  };
  var folderInput = document.getElementById("folder-input");
  var runBtn = document.getElementById("run-btn");
  var rebuildBtn = document.getElementById("rebuild-btn");
  var monacoContainer = document.getElementById("monaco-editor");
  var iframeViewer = document.getElementById("gds-viewer");
  var terminalBody = document.getElementById("terminal-output");
  var fileTree = document.getElementById("file-tree");
  var sidebar = document.getElementById("sidebar");
  var currentFileLabel = document.getElementById("current-file");
  var menuFile = document.getElementById("menu-file");
  var menuOpenFolder = document.getElementById("menu-open-folder");
  var pythonEnvSelect = document.getElementById("python-env-select");
  var editorTab = document.getElementById("editor-tab");
  var viewerTab = document.getElementById("viewer-tab");
  var viewerTabClose = document.getElementById("viewer-tab-close");
  var layoutMode = "split";
  var panelsContainer = document.getElementById("panels");
  var viewerPane = document.getElementById("viewer-pane");
  var collapseToggle = document.getElementById("viewer-collapse-toggle");
  var layoutBtn = document.getElementById("btn-layout");
  var layoutMenu = document.getElementById("layout-menu");
  function setLayoutMode(mode) {
    layoutMode = mode;
    const layoutClass = mode === "editor" ? "layout-editor-only" : mode === "viewer" ? "layout-viewer-only" : "layout-split";
    panelsContainer.classList.remove("layout-split", "layout-editor-only", "layout-viewer-only");
    panelsContainer.classList.add(layoutClass);
    if (editorTab && viewerTab) {
      const editorActive = mode !== "viewer";
      editorTab.classList.toggle("active", editorActive);
      viewerTab.classList.toggle("active", mode !== "editor");
    }
    if (layoutMenu) {
      layoutMenu.querySelectorAll(".layout-option").forEach((el) => {
        el.classList.toggle("active", el.getAttribute("data-mode") === mode);
      });
    }
    sessionStorage.setItem("supergds-layout", mode);
    const editorPaneEl = document.getElementById("editor-pane");
    const viewerPaneEl = document.getElementById("viewer-pane");
    const resizeHandleEl = document.getElementById("resize-handle");
    if (mode !== "split") {
      if (editorPaneEl) {
        editorPaneEl.style.flex = "";
        editorPaneEl.style.width = "";
      }
      if (viewerPaneEl) {
        viewerPaneEl.style.flex = "";
        viewerPaneEl.style.width = "";
      }
    }
    if (resizeHandleEl) {
      resizeHandleEl.style.display = mode === "split" ? "" : "none";
    }
  }
  function setupMenuBar() {
    menuFile.addEventListener("click", (e) => {
      e.stopPropagation();
      menuFile.classList.toggle("open");
    });
    document.addEventListener("click", () => {
      menuFile.classList.remove("open");
    });
    menuOpenFolder.addEventListener("click", async () => {
      menuFile.classList.remove("open");
      if (typeof window.showDirectoryPicker === "function") {
        try {
          const dirHandle = await window.showDirectoryPicker();
          await openWorkspaceViaHandle(dirHandle);
          return;
        } catch (err) {
          if (err.name !== "AbortError") {
            terminal.addLine("system", `Error: ${err.message}`);
          }
          return;
        }
      }
      terminal.addLine("system", `Select a folder using the dialog...`);
      folderInput.click();
    });
  }
  function setupSidebar() {
    function toggleSidebar() {
      sidebar.classList.toggle("hidden");
      const isHidden = sidebar.classList.contains("hidden");
      const explorerIcon = document.getElementById("activity-explorer");
      if (explorerIcon) {
        explorerIcon.classList.toggle("active", !isHidden);
      }
      setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 250);
    }
    const activityExplorer = document.getElementById("activity-explorer");
    if (activityExplorer) {
      activityExplorer.addEventListener("click", toggleSidebar);
    }
  }
  function buildFileTree(files) {
    const root = /* @__PURE__ */ new Map();
    for (const file of files.sort()) {
      const parts = file.split("/");
      let current = root;
      let currentPath = "";
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const isLast = i === parts.length - 1;
        currentPath = currentPath ? `${currentPath}/${part}` : part;
        if (isLast) {
          current.set(part, {
            name: part,
            path: currentPath,
            isFolder: false
          });
        } else {
          if (!current.has(part)) {
            current.set(part, {
              name: part,
              path: currentPath,
              isFolder: true,
              children: []
            });
          }
          const node = current.get(part);
          if (node.children) {
            current = /* @__PURE__ */ new Map();
            for (const child of node.children) {
              current.set(child.name, child);
            }
          }
        }
      }
    }
    function mapToArray(map) {
      return Array.from(map.values()).sort((a, b) => {
        if (a.isFolder && !b.isFolder) return -1;
        if (!a.isFolder && b.isFolder) return 1;
        return a.name.localeCompare(b.name);
      });
    }
    return mapToArray(root);
  }
  function renderFileTree(nodes, container, depth = 0) {
    container.innerHTML = "";
    for (const node of nodes) {
      const item = document.createElement("div");
      item.className = "tree-item" + (node.isFolder ? " folder" : " file");
      item.style.paddingLeft = `${depth * 12 + 8}px`;
      const icon = document.createElement("span");
      icon.className = node.isFolder ? "folder-icon" : "file-icon";
      icon.textContent = node.isFolder ? "\u{1F4C1}" : "\u{1F4C4}";
      const name = document.createElement("span");
      name.className = "item-name";
      name.textContent = node.name;
      name.title = node.path;
      item.appendChild(icon);
      item.appendChild(name);
      if (node.isFolder && node.children) {
        const toggle = document.createElement("span");
        toggle.className = "folder-toggle";
        toggle.textContent = "\u25B6";
        toggle.style.cssText = "font-size:10px;margin-right:4px;color:#6c7086;";
        item.insertBefore(toggle, icon);
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          item.classList.toggle("expanded");
          toggle.textContent = item.classList.contains("expanded") ? "\u25BC" : "\u25B6";
          const childContainer2 = item.nextElementSibling;
          if (childContainer2) {
            childContainer2.style.display = item.classList.contains("expanded") ? "block" : "none";
          }
        });
        const childContainer = document.createElement("div");
        childContainer.className = "tree-children";
        childContainer.style.display = "none";
        renderFileTree(node.children, childContainer, depth + 1);
        container.appendChild(item);
        container.appendChild(childContainer);
      } else {
        item.addEventListener("click", () => {
          openFile(node.path);
          container.querySelectorAll(".tree-item.selected").forEach((el) => el.classList.remove("selected"));
          item.classList.add("selected");
        });
        container.appendChild(item);
      }
    }
  }
  async function openFile(filePath) {
    currentFile = filePath;
    sessionStorage.setItem("supergds-current-file", filePath);
    if (workspacePath) {
      sessionStorage.setItem("supergds-workspace", workspacePath);
    }
    currentFileLabel.textContent = filePath.split("/").pop() || "No file open";
    currentFileLabel.title = filePath;
    const res = await fetch(`/files/${filePath}`);
    if (!res.ok) {
      console.error("Failed to open file:", res.status);
      terminal.addLine("system", `Error: Failed to open ${filePath}`);
      return;
    }
    const { content } = await res.json();
    editor.setValue(content);
    window.studio.currentFile = filePath;
    fetch("/api/ide-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "openFile", file: filePath })
    }).catch(() => {
    });
    runBtn.disabled = false;
    rebuildBtn.disabled = false;
  }
  function jumpToLine(line) {
    if (!editor) return;
    const model = editor.getModel?.();
    if (!model) return;
    editor.revealLine?.(
      line,
      0
      /* SmoothScroll */
    );
    const monacoObj = window.monaco;
    if (monacoObj) {
      editor.deltaDecorations?.([], [{
        range: new monacoObj.Range(line, 1, line, model.getLineMaxColumn(line)),
        options: {
          isWholeLine: true,
          className: "source-highlight",
          glyphMarginClassName: "source-glyph"
        }
      }]);
    }
  }
  async function handleFolderOpen(e) {
    const input = e.target;
    if (!input.files?.length) return;
    const firstFile = input.files[0];
    let folderPath;
    if (firstFile.path) {
      const fullPath = firstFile.path;
      if (firstFile.webkitRelativePath) {
        const relPath = firstFile.webkitRelativePath;
        const folderName = relPath.split("/")[0];
        const idx = fullPath.lastIndexOf(folderName);
        if (idx > 0) {
          folderPath = fullPath.substring(0, idx + folderName.length);
        } else {
          folderPath = fullPath.substring(0, fullPath.lastIndexOf("/"));
        }
      } else {
        folderPath = fullPath.substring(0, fullPath.lastIndexOf("/"));
      }
    } else if (firstFile.webkitRelativePath) {
      const relPath = firstFile.webkitRelativePath;
      const folderName = relPath.split("/")[0];
      terminal.addLine("system", `Reading files from "${folderName}"...`);
      const validExts = ["py", "json", "ts", "js", "md", "txt", "yaml", "yml", "toml", "cfg", "ini"];
      const files = [];
      for (let i = 0; i < input.files.length; i++) {
        const file = input.files[i];
        const ext = file.name.split(".").pop()?.toLowerCase();
        if (!validExts.includes(ext || "")) continue;
        const fileRelPath = file.webkitRelativePath;
        const withoutFolder = fileRelPath.substring(fileRelPath.indexOf("/") + 1);
        try {
          const content = await file.text();
          files.push({ path: withoutFolder, content });
        } catch (err) {
          console.warn(`Failed to read ${fileRelPath}:`, err);
        }
      }
      if (files.length === 0) {
        terminal.addLine("system", `No supported files found in folder.`);
        return;
      }
      terminal.addLine("system", `Sending ${files.length} files to server...`);
      const wsResp = await fetch("/workspace", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspace: folderName, files })
      });
      if (!wsResp.ok) {
        terminal.addLine("system", `Error: Failed to open folder (${wsResp.status})`);
        return;
      }
      workspacePath = folderName;
      sessionStorage.setItem("supergds-workspace", folderName);
      sessionStorage.setItem("supergds-current-file", "");
      terminal.addLine("system", `Opened folder: ${folderName}`);
      await loadFileTree();
      return;
    } else {
      terminal.addLine("system", `Error: Cannot determine folder path. Please use File > Open Folder.`);
      return;
    }
    await openWorkspace(folderPath);
  }
  async function openWorkspace(folderPath) {
    workspacePath = folderPath;
    sessionStorage.setItem("supergds-workspace", folderPath);
    const wsResp = await fetch("/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspace: folderPath })
    });
    if (!wsResp.ok) {
      terminal.addLine("system", `Error: Failed to open folder (${wsResp.status})`);
      return;
    }
    terminal.addLine("system", `Opened folder: ${folderPath}`);
    await loadFileTree();
  }
  async function openWorkspaceViaHandle(dirHandle) {
    const files = [];
    async function traverseDir(handle, basePath = "") {
      for await (const entry of handle.values()) {
        const entryPath = basePath ? `${basePath}/${entry.name}` : entry.name;
        if (entry.kind === "directory") {
          if (entry.name === "node_modules" || entry.name.startsWith(".")) {
            continue;
          }
          const subDir = await handle.getDirectoryHandle(entry.name);
          await traverseDir(subDir, entryPath);
        } else if (entry.kind === "file") {
          const ext = entry.name.split(".").pop()?.toLowerCase();
          if (["py", "json", "ts", "js", "md", "txt", "yaml", "yml", "toml", "cfg", "ini"].includes(ext || "")) {
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
      terminal.addLine("system", `Error reading directory: ${err}`);
      return;
    }
    terminal.addLine("system", `Sending ${files.length} files to server...`);
    const wsResp = await fetch("/workspace", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        workspace: dirHandle.name,
        files
      })
    });
    if (!wsResp.ok) {
      terminal.addLine("system", `Error: Failed to open folder (${wsResp.status})`);
      return;
    }
    workspacePath = dirHandle.name;
    sessionStorage.setItem("supergds-workspace", dirHandle.name);
    const savedFile = sessionStorage.getItem("supergds-current-file");
    if (savedFile) {
      openFile(savedFile).catch(() => {
      });
    }
    terminal.addLine("system", `Opened folder: ${dirHandle.name}`);
    await loadFileTree();
  }
  async function loadPythonEnvironments() {
    if (!pythonEnvSelect) return;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 1e4);
      const res = await fetch("/api/python-environments", { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) {
        console.error("Failed to load Python environments:", res.status);
        pythonEnvSelect.innerHTML = '<option value="">Python (default)</option>';
        return;
      }
      const { environments } = await res.json();
      pythonEnvSelect.innerHTML = "";
      if (environments.length === 0) {
        pythonEnvSelect.innerHTML = '<option value="">No env found \u2014 using default</option>';
        return;
      }
      for (const env of environments) {
        const option = document.createElement("option");
        option.value = env.path;
        option.textContent = env.name;
        option.title = env.path;
        if (env.isActive) {
          option.selected = true;
        }
        pythonEnvSelect.appendChild(option);
      }
    } catch (err) {
      console.error("Error loading Python environments:", err);
      if (pythonEnvSelect) {
        pythonEnvSelect.innerHTML = '<option value="">Python (default)</option>';
      }
    }
  }
  async function loadFileTree() {
    const res = await fetch("/api/files");
    if (!res.ok) {
      console.error("Failed to load files:", res.status);
      fileTree.innerHTML = '<div style="padding:8px;color:#f38ba8;">Could not read workspace. Try File \u2192 Open Folder.</div>';
      return;
    }
    const { files } = await res.json();
    if (!files || files.length === 0) {
      fileTree.innerHTML = '<div style="padding:8px;color:#6c7086;">No files found in workspace.</div>';
      return;
    }
    const displayFiles = files.filter((f) => {
      const ext = f.split(".").pop()?.toLowerCase();
      return ["py", "json", "ts", "js", "md", "txt", "yaml", "yml", "toml", "cfg", "ini"].includes(ext || "");
    });
    const tree = buildFileTree(displayFiles);
    renderFileTree(tree, fileTree);
    fileTree.querySelectorAll(".tree-item.folder").forEach((item) => {
      item.classList.add("expanded");
      const toggle = item.querySelector(".folder-toggle");
      if (toggle) toggle.textContent = "\u25BC";
      const childContainer = item.nextElementSibling;
      if (childContainer) childContainer.style.display = "block";
    });
  }
  async function saveCurrentFile() {
    if (!currentFile) return;
    const content = editor.getValue();
    await fetch(`/files/${currentFile}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
  }
  async function handleRun() {
    if (!currentFile) return;
    await saveCurrentFile();
    terminal.clear();
    const pythonPath = pythonEnvSelect?.value;
    const pythonPathParam = pythonPath ? `&pythonPath=${encodeURIComponent(pythonPath)}` : "";
    terminal.addLine("system", `$ python ${currentFile}`);
    let completed = false;
    const es = new EventSource(`/api/run?pythonFile=${encodeURIComponent(currentFile)}${pythonPathParam}`);
    es.addEventListener("start", (e) => terminal.addLine("stdout", JSON.parse(e.data).status));
    es.addEventListener("stdout", (e) => terminal.addLine("stdout", JSON.parse(e.data).line));
    es.addEventListener("stderr", (e) => terminal.addLine("stderr", JSON.parse(e.data).line));
    es.addEventListener("complete", (e) => {
      completed = true;
      const data = JSON.parse(e.data);
      bridge.sendLoadGds(data);
      const geojson = data.geojson;
      if (geojson?.features) {
        const sources = /* @__PURE__ */ new Map();
        for (const f of geojson.features) {
          const prov = f.properties?.provenance;
          if (prov?.file && prov?.line) {
            const lineNum = typeof prov.line === "number" ? prov.line : parseInt(String(prov.line), 10);
            if (!isNaN(lineNum)) {
              sources.set(`${prov.file}:${lineNum}`, { file: prov.file, line: lineNum });
            }
          }
        }
        if (sources.size > 0) {
          terminal.addLine("system", `Found ${sources.size} component(s) with source info:`);
          for (const [key, src] of sources) {
            terminal.addLine("stdout", `  ${src.file}:${src.line}`, { file: src.file, line: src.line });
          }
        }
      }
      terminal.addLine("system", "Done.");
      es.close();
      fetch("/api/ide-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "build",
          status: {
            lastOutput: "Done.",
            exitCode: 0,
            gdsPath: data.gdsPath || null,
            errors: [],
            timestamp: Date.now()
          }
        })
      }).catch(() => {
      });
    });
    es.addEventListener("error", (e) => {
      if (completed) return;
      const msg = e.data;
      if (msg) {
        try {
          terminal.addLine("stderr", JSON.parse(msg).message || "Error");
        } catch {
          terminal.addLine("stderr", "Run failed.");
        }
      } else {
        terminal.addLine("stderr", "Run failed \u2014 connection lost.");
      }
      es.close();
      fetch("/api/ide-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "build",
          status: {
            lastOutput: msg ? String(msg) : "Run failed \u2014 connection lost.",
            exitCode: 1,
            gdsPath: null,
            errors: [msg ? String(msg) : "Run failed"],
            timestamp: Date.now()
          }
        })
      }).catch(() => {
      });
    });
  }
  async function handleRebuild() {
    await handleRun();
  }
  function initXterm() {
    const container = document.getElementById("terminal-xterm");
    if (!container) return;
    const xtermLib = window.xtermLib;
    if (!xtermLib) return;
    xterm = new xtermLib.Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', monospace",
      theme: {
        background: "#11111b",
        foreground: "#cdd6f4",
        cursor: "#89b4fa",
        selectionBackground: "#45475a"
      }
    });
    xtermFitAddon = new xtermLib.FitAddon();
    xterm.loadAddon(xtermFitAddon);
    xterm.open(container);
    setTimeout(() => {
      try {
        xtermFitAddon.fit();
      } catch {
      }
    }, 100);
    connectTerminalWs();
  }
  function connectTerminalWs() {
    if (!xterm) return;
    const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
    xtermWs = new WebSocket(`${wsProtocol}//${location.host}/api/terminal`);
    xtermWs.onopen = () => {
      if (xtermFitAddon && xterm) {
        const dims = xtermFitAddon.proposeDimensions();
        if (dims) {
          xtermWs?.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
        }
      }
    };
    xtermWs.onmessage = (ev) => {
      xterm?.write(ev.data);
    };
    xtermWs.onclose = () => {
      xterm?.write("\r\n\x1B[90m\u2014 connection lost \u2014\x1B[0m\r\n");
    };
    xtermWs.onerror = () => {
      xterm?.write("\r\n\x1B[31mTerminal connection error\x1B[0m\r\n");
    };
    xterm.onData((data) => {
      if (xtermWs?.readyState === WebSocket.OPEN) {
        xtermWs.send(data);
      }
    });
  }
  function setupTerminalTabs() {
    const tabBtns = document.querySelectorAll(".terminal-tab-btn");
    const xtermPanel = document.getElementById("terminal-xterm");
    const outputPanel = document.getElementById("terminal-output");
    tabBtns.forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const tab = btn.getAttribute("data-tab");
        activeTerminalTab = tab;
        tabBtns.forEach((b) => b.classList.toggle("active", b === btn));
        if (xtermPanel) xtermPanel.style.display = tab === "terminal" ? "" : "none";
        if (outputPanel) outputPanel.style.display = tab === "output" ? "" : "none";
        if (tab === "terminal" && xtermFitAddon && xterm) {
          setTimeout(() => {
            try {
              xtermFitAddon.fit();
              const dims = xtermFitAddon.proposeDimensions();
              if (dims && xtermWs?.readyState === WebSocket.OPEN) {
                xtermWs.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
              }
            } catch {
            }
          }, 50);
        }
      });
    });
    if (xtermPanel) {
      new MutationObserver(() => {
        if (xtermPanel.style.display !== "none" && xtermWs?.readyState !== WebSocket.OPEN) {
          connectTerminalWs();
        }
      }).observe(xtermPanel, { attributes: true, attributeFilter: ["style"] });
    }
  }
  var lastCommandPoll = 0;
  function pollMcpCommands() {
    const now = Date.now();
    if (now - lastCommandPoll < 1e3) return;
    lastCommandPoll = now;
    fetch("/api/ide-state/commands").then((res) => res.ok ? res.json() : { commands: [] }).then(({ commands }) => {
      for (const cmd of commands) {
        if (cmd.type === "highlightSource") {
          jumpToLine(cmd.line);
        } else if (cmd.type === "selectBySource") {
          bridge?.sendSelectBySource(cmd.file, cmd.line);
        }
      }
    }).catch(() => {
    });
  }
  function init() {
    editor = window.setupMonaco(monacoContainer);
    terminal = new window.TerminalRenderer(terminalBody);
    terminal.sourceInfoMode = sourceInfoMode;
    bridge = new window.IframeBridge(iframeViewer);
    initXterm();
    setupTerminalTabs();
    setupMenuBar();
    setupSidebar();
    folderInput.addEventListener("change", handleFolderOpen);
    runBtn.addEventListener("click", handleRun);
    rebuildBtn.addEventListener("click", handleRebuild);
    window.studio = { editor, bridge, terminal, currentFile: null, openFile, jumpToLine };
    restoreWorkspace();
    loadPythonEnvironments();
    initSettings();
    setInterval(pollMcpCommands, 1e3);
    const savedLayout = sessionStorage.getItem("supergds-layout");
    setLayoutMode(savedLayout || "split");
    if (layoutBtn) {
      layoutBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        layoutMenu?.classList.toggle("hidden");
      });
    }
    document.addEventListener("click", () => {
      layoutMenu.classList.add("hidden");
    });
    if (layoutMenu) {
      layoutMenu.querySelectorAll(".layout-option").forEach((el) => {
        el.addEventListener("click", () => {
          const mode = el.getAttribute("data-mode");
          setLayoutMode(mode);
          layoutMenu.classList.add("hidden");
        });
      });
    }
    if (collapseToggle) {
      collapseToggle.addEventListener("click", () => {
        if (layoutMode === "split") {
          setLayoutMode("editor");
        } else {
          setLayoutMode("split");
        }
      });
    }
    if (viewerTabClose) {
      viewerTabClose.addEventListener("click", (e) => {
        e.stopPropagation();
        setLayoutMode("editor");
      });
    }
    const openNewTabOption = document.getElementById("open-viewer-new-tab");
    if (openNewTabOption) {
      openNewTabOption.addEventListener("click", () => {
        window.open("/viewer/viewer.html", "_blank");
        layoutMenu?.classList.add("hidden");
      });
    }
    document.addEventListener("keydown", (e) => {
      if (!e.ctrlKey) return;
      if (e.key === "\\") {
        e.preventDefault();
        if (layoutMode === "split") setLayoutMode("editor");
        else setLayoutMode("split");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setLayoutMode("editor");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setLayoutMode("viewer");
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        setLayoutMode("split");
      }
    });
    const resizeHandle = new ResizeHandle("resize-handle", "editor-pane", "viewer-pane");
    window.addEventListener("resize", () => {
      const handle = document.getElementById("resize-handle");
      const editorPane = document.getElementById("editor-pane");
      if (handle && editorPane && !resizeHandle.isDragging()) {
        handle.style.left = `${editorPane.getBoundingClientRect().width}px`;
      }
    });
  }
  async function restoreWorkspace() {
    try {
      const res = await fetch("/api/workspace");
      const data = await res.json();
      if (data.workspace) {
        workspacePath = data.workspace;
        sessionStorage.setItem("supergds-workspace", data.workspace);
        try {
          await openWorkspace(data.workspace);
        } catch {
          console.warn("Restored workspace not found, clearing:", data.workspace);
          workspacePath = null;
          sessionStorage.removeItem("supergds-workspace");
          await fetch("/workspace", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspace: "" })
          }).catch(() => {
          });
          fileTree.innerHTML = '<div style="padding:8px;color:#6c7086;">Open a folder to get started (File \u2192 Open Folder)</div>';
        }
      }
    } catch {
      fileTree.innerHTML = '<div style="padding:8px;color:#6c7086;">Open a folder to get started (File \u2192 Open Folder)</div>';
    }
  }
  var sourceInfoMode = "off";
  function initSettings() {
    const settingsBtn = document.getElementById("terminal-settings");
    const dropdown = document.getElementById("terminal-settings-dropdown");
    if (!settingsBtn || !dropdown) return;
    settingsBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.classList.toggle("hidden");
    });
    document.addEventListener("click", () => {
      dropdown.classList.add("hidden");
    });
    dropdown.querySelectorAll(".terminal-settings-option").forEach((el) => {
      el.addEventListener("click", () => {
        const mode = el.getAttribute("data-mode");
        sourceInfoMode = mode;
        dropdown.querySelectorAll(".terminal-settings-option").forEach((opt) => {
          opt.classList.toggle("active", opt.getAttribute("data-mode") === mode);
        });
        dropdown.classList.add("hidden");
        localStorage.setItem("supergds-source-info", mode);
      });
    });
    const saved = localStorage.getItem("supergds-source-info");
    if (saved) {
      sourceInfoMode = saved;
      dropdown.querySelectorAll(".terminal-settings-option").forEach((opt) => {
        opt.classList.toggle("active", opt.getAttribute("data-mode") === saved);
      });
    }
  }
  init();
})();
//# sourceMappingURL=studio.js.map
