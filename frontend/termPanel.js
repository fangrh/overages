"use strict";
(() => {
  // frontend/termPanel.ts
  var stylesInjected = false;
  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    const css = `
/* Row layout: active terminal (left) fills the space, the list of terminals
   runs as a vertical column on the right (VS Code tabsLocation:right). */
.term-panel { display:flex; flex-direction:row; width:100%; height:100%; min-width:0; min-height:0; background:#11111b; }
.term-view { position:relative; flex:1; min-height:0; }
.term-tabbar { display:flex; flex-direction:column; align-items:stretch; gap:2px; background:#181825; border-left:1px solid #313244; flex-shrink:0; width:116px; height:100%; padding:4px 0; overflow-y:auto; scrollbar-width:thin; }
.term-tabbar::-webkit-scrollbar { width:5px; }
.term-tabbar::-webkit-scrollbar-thumb { background:#45475a; border-radius:3px; }
.term-tab { display:flex; align-items:center; justify-content:space-between; gap:4px; margin:0 4px; padding:4px 8px; font-size:12px; color:#6c7086; cursor:pointer; user-select:none; border-left:2px solid transparent; border-radius:4px; white-space:nowrap; flex-shrink:0; }
.term-tab:hover { background:#313244; color:#cdd6f4; }
.term-tab.active { color:#cdd6f4; background:rgba(137,180,250,0.14); border-left:2px solid #89b4fa; }
.term-tab.dead { color:#f38ba8; }
.term-tab .term-close { background:none; border:none; color:#6c7086; cursor:pointer; font-size:14px; line-height:1; padding:0 2px; border-radius:3px; }
.term-tab .term-close:hover { background:#f38ba8; color:#cdd6f4; }
.term-add { background:none; border:none; color:#6c7086; cursor:pointer; font-size:16px; line-height:1; margin:2px 4px; padding:6px 8px; border-radius:4px; text-align:left; flex-shrink:0; }
.term-add:hover { color:#a6e3a1; background:#313244; }
.term-instance { position:absolute; inset:0; padding:2px 4px; box-sizing:border-box; }
.term-instance.hidden { display:none; }
.term-empty { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; font-size:12px; color:#585b70; font-style:italic; }
`;
    const s = document.createElement("style");
    s.textContent = css;
    document.head.appendChild(s);
  }
  var THEME = {
    background: "#11111b",
    foreground: "#cdd6f4",
    cursor: "#89b4fa",
    selectionBackground: "#45475a"
  };
  var TermPanel = class {
    deps;
    root;
    tabBar;
    view;
    emptyHint;
    terms = [];
    activeId = null;
    nextId = 1;
    constructor(container, deps) {
      this.deps = deps;
      injectStyles();
      container.classList.add("term-panel");
      container.innerHTML = "";
      this.root = document.createElement("div");
      this.root.className = "term-panel";
      this.root.style.height = "100%";
      this.tabBar = document.createElement("div");
      this.tabBar.className = "term-tabbar";
      this.view = document.createElement("div");
      this.view.className = "term-view";
      this.emptyHint = document.createElement("div");
      this.emptyHint.className = "term-empty";
      this.emptyHint.textContent = "No terminals \u2014 click + to open one.";
      this.view.appendChild(this.emptyHint);
      this.root.appendChild(this.view);
      this.root.appendChild(this.tabBar);
      container.appendChild(this.root);
      this.newTerminal();
    }
    wsUrl() {
      if (this.deps.wsUrl) return this.deps.wsUrl;
      const proto = location.protocol === "https:" ? "wss:" : "ws:";
      return `${proto}//${location.host}/api/terminal`;
    }
    newTerminal() {
      const id = this.nextId++;
      const el = document.createElement("div");
      el.className = "term-instance hidden";
      const xterm = new this.deps.Terminal({
        cursorBlink: true,
        fontSize: 13,
        fontFamily: "'Cascadia Code', 'Fira Code', monospace",
        theme: THEME
      });
      const fit = new this.deps.FitAddon();
      xterm.loadAddon(fit);
      try {
        xterm.open(el);
      } catch (e) {
        console.error("xterm open failed", e);
      }
      const inst = { id, label: `term ${id}`, xterm, fit, ws: null, el, dead: false };
      this.terms.push(inst);
      this.view.appendChild(el);
      xterm.onData((data) => {
        if (inst.ws && inst.ws.readyState === WebSocket.OPEN) inst.ws.send(data);
      });
      this.connect(inst);
      this.activate(id);
      this.renderTabs();
      setTimeout(() => this.fitActive(), 60);
    }
    connect(inst) {
      try {
        inst.ws = new WebSocket(this.wsUrl());
      } catch (e) {
        inst.xterm.write(`\r
\x1B[31mCannot open terminal: ${e.message}\x1B[0m\r
`);
        return;
      }
      inst.xterm.write("\x1B[90mConnecting...\x1B[0m\r");
      inst.ws.onopen = () => {
        inst.xterm.write("\r\x1B[K");
        this.resizeRemote(inst);
      };
      inst.ws.onmessage = (ev) => inst.xterm.write(ev.data);
      inst.ws.onclose = () => {
        inst.dead = true;
        inst.xterm.write("\r\n\x1B[90m\u2014 terminal exited (\xD7 to close, + for a new one) \u2014\x1B[0m\r\n");
        this.renderTabs();
      };
      inst.ws.onerror = () => {
        inst.xterm.write("\r\n\x1B[31mTerminal connection error\x1B[0m\r\n");
      };
    }
    activate(id) {
      const inst = this.terms.find((t) => t.id === id);
      if (!inst) return;
      this.activeId = id;
      for (const t of this.terms) t.el.classList.toggle("hidden", t.id !== id);
      this.emptyHint.style.display = "none";
      try {
        inst.xterm.focus();
      } catch {
      }
      this.fitActive();
      this.renderTabs();
    }
    close(id) {
      const idx = this.terms.findIndex((t) => t.id === id);
      if (idx < 0) return;
      const inst = this.terms[idx];
      try {
        inst.ws?.close();
      } catch {
      }
      try {
        inst.xterm.dispose();
      } catch {
      }
      inst.el.remove();
      this.terms.splice(idx, 1);
      if (this.activeId === id) {
        const next = this.terms[idx] || this.terms[idx - 1] || null;
        if (next) this.activate(next.id);
        else {
          this.activeId = null;
          this.emptyHint.style.display = "";
        }
      }
      this.renderTabs();
    }
    // Refit the active terminal to its container and tell the PTY the new size.
    fitActive() {
      const inst = this.terms.find((t) => t.id === this.activeId);
      if (!inst) return;
      try {
        inst.fit.fit();
      } catch {
      }
      this.resizeRemote(inst);
    }
    resizeRemote(inst) {
      if (!inst.ws || inst.ws.readyState !== WebSocket.OPEN) return;
      try {
        const dims = inst.fit.proposeDimensions();
        if (dims) inst.ws.send(JSON.stringify({ type: "resize", cols: dims.cols, rows: dims.rows }));
      } catch {
      }
    }
    renderTabs() {
      this.tabBar.innerHTML = "";
      for (const inst of this.terms) {
        const tab = document.createElement("div");
        tab.className = "term-tab" + (inst.id === this.activeId ? " active" : "") + (inst.dead ? " dead" : "");
        const label = document.createElement("span");
        label.textContent = inst.label;
        tab.appendChild(label);
        const close = document.createElement("button");
        close.className = "term-close";
        close.title = "Close terminal";
        close.textContent = "\xD7";
        close.addEventListener("click", (e) => {
          e.stopPropagation();
          this.close(inst.id);
        });
        tab.addEventListener("click", () => this.activate(inst.id));
        tab.appendChild(close);
        this.tabBar.appendChild(tab);
      }
      const add = document.createElement("button");
      add.className = "term-add";
      add.title = "New terminal";
      add.textContent = "+";
      add.addEventListener("click", () => this.newTerminal());
      this.tabBar.appendChild(add);
    }
    dispose() {
      for (const inst of [...this.terms]) {
        try {
          inst.ws?.close();
        } catch {
        }
        try {
          inst.xterm.dispose();
        } catch {
        }
      }
      this.terms = [];
      this.activeId = null;
      try {
        this.root.remove();
      } catch {
      }
    }
  };
  window.TermPanel = TermPanel;
})();
//# sourceMappingURL=termPanel.js.map
