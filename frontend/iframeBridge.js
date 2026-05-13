"use strict";
(() => {
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
          this.updateTerminalPanels(msg.components);
          break;
        case "askClaude":
          this.handleAskClaude(msg.components, msg.question);
          break;
        case "jumpToSource":
          this.jumpToSourceInEditor(msg.file, msg.line);
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
      const editor = studio.editor;
      const model = editor.getModel();
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
      editor.deltaDecorations([], decorations);
    }
    handleAskClaude(components, question) {
      console.log("askClaude", components, question);
    }
    updateTerminalPanels(components) {
      const sourcePanel = document.getElementById("terminal-source-panel");
      const infoPanel = document.getElementById("terminal-info-panel");
      if (!sourcePanel || !infoPanel) return;
      if (components.length === 0) {
        sourcePanel.innerHTML = '<p class="placeholder">Click a polygon in the viewer to inspect source</p>';
        infoPanel.innerHTML = '<p class="placeholder">Click a polygon in the viewer to inspect</p>';
        return;
      }
      const comp = components[0];
      const prov = comp.provenance || {};
      infoPanel.innerHTML = "";
      const addKV = (key, val) => {
        const row = document.createElement("div");
        row.className = "kv";
        row.innerHTML = `<span class="key">${key}</span><span class="val">${val}</span>`;
        infoPanel.appendChild(row);
      };
      addKV("layer", comp.layer || "?");
      if (prov.instance_name) addKV("instance", prov.instance_name);
      if (prov.cell) addKV("cell", prov.cell);
      if (prov.file) {
        let fileLabel = prov.file + ":" + (prov.line ?? "?");
        if (prov.array_index?.length) fileLabel += ` (array index [${prov.array_index.join(", ")}])`;
        if (prov.loop_index?.length) fileLabel += ` (loop index [${prov.loop_index.join(", ")}])`;
        addKV("file", fileLabel);
      }
      if (prov.function && prov.function !== "<module>") addKV("function", prov.function + "()");
      if (prov.class_name) addKV("class", prov.class_name);
      if (prov.file) {
        sourcePanel.innerHTML = "";
        const files = /* @__PURE__ */ new Map();
        const fp = prov.file.replace(/\\/g, "/");
        const entry = { line: typeof prov.line === "number" ? prov.line : parseInt(String(prov.line)) || 0 };
        if (prov.loop_index) entry.loop_index = prov.loop_index;
        if (prov.array_index) entry.array_index = prov.array_index;
        files.set(fp, [entry]);
        const chain = prov.call_chain || [];
        for (const cc of chain) {
          if (cc.file) {
            const cfp = cc.file.replace(/\\/g, "/");
            const cl = typeof cc.line === "number" ? cc.line : parseInt(String(cc.line)) || 0;
            if (!files.has(cfp)) files.set(cfp, []);
            const existing = files.get(cfp);
            if (!existing.some((e) => e.line === cl)) existing.push({ line: cl });
          }
        }
        for (const [file, entries] of files) {
          for (const entry2 of entries) {
            const div = document.createElement("div");
            div.className = "kv";
            let label = `@${file}:${entry2.line}`;
            if (entry2.loop_index) label += ` (loop [${entry2.loop_index.join(", ")}])`;
            if (entry2.array_index) label += ` (array [${entry2.array_index.join(", ")}])`;
            const sourceSpan = document.createElement("span");
            sourceSpan.className = "val clickable source-jump";
            sourceSpan.setAttribute("data-file", file);
            sourceSpan.setAttribute("data-line", String(entry2.line));
            sourceSpan.textContent = label;
            div.innerHTML = '<span class="key">source</span>';
            div.appendChild(sourceSpan);
            sourcePanel.appendChild(div);
          }
        }
      } else {
        sourcePanel.innerHTML = '<p class="placeholder">No provenance data in this GDS file.</p>';
      }
    }
    jumpToSourceInEditor(file, line) {
      const studio = window.studio;
      if (!studio?.editor) return;
      const editor = studio.editor;
      const model = editor.getModel?.();
      if (!model) return;
      const currentUri = model.uri?.toString() ?? "";
      const targetUri = `file:///${file.replace(/\\/g, "/")}`;
      if (currentUri === targetUri) {
        editor.revealLine?.(
          line,
          0
          /* SmoothScroll */
        );
        return;
      }
      if (typeof studio.openFile === "function") {
        studio.openFile(file);
        const timeout = setTimeout(() => {
          const newModel = editor.getModel?.();
          if (newModel?.uri?.toString() === targetUri) {
            editor.revealLine?.(line, 0);
          }
          clearTimeout(timeout);
        }, 200);
        return;
      }
      console.warn("jumpToSource: target file not open and no openFile method", file);
      editor.revealLine?.(line, 0);
    }
  };
  window.IframeBridge = IframeBridge;
})();
//# sourceMappingURL=iframeBridge.js.map
