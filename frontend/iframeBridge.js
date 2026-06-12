"use strict";
(() => {
  // frontend/iframeBridge.ts
  var IframeBridge = class {
    iframe;
    ready = false;
    currentComponents = [];
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
      console.log("[iframeBridge] message received:", msg.type, msg);
      switch (msg.type) {
        case "webviewReady":
          this.ready = true;
          for (const data of this.pending) {
            this.sendLoadGds(data);
          }
          this.pending = [];
          break;
        case "selectComponents": {
          const components = msg.components || [];
          this.currentComponents = components;
          fetch("/api/ide-state", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: "selection", components })
          }).catch(() => {
          });
          this.forwardToEditor(components);
          window.dispatchEvent(new CustomEvent("gds-selection", { detail: components }));
          break;
        }
        case "askClaude":
          this.handleAskClaude(msg.components, msg.question);
          break;
        case "jumpToSource":
          console.log("[iframeBridge] received jumpToSource:", msg.file, msg.line);
          this.jumpToSourceInEditor(msg.file, msg.line);
          break;
        case "requestSource":
          console.log("[iframeBridge] received requestSource:", msg.file, msg.line);
          this.handleRequestSource(msg.file, msg.line);
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
    sendSelectBySource(file, line) {
      if (!this.ready) return;
      this.iframe.contentWindow?.postMessage({
        type: "selectBySource",
        file,
        line
      }, "*");
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
              range: new monacoObj.Range(line, 1, line, model.getLineMaxColumn(line)),
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
      fetch("/api/ide-state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "askClaude", components, question })
      }).catch(() => {
      });
    }
    async handleRequestSource(file, line) {
      const studio = window.studio;
      if (!studio) return;
      const targetBasename = file.replace(/\\/g, "/").split("/").pop() ?? "";
      const openBasename = studio.currentFile?.replace(/\\/g, "/").split("/").pop() ?? "";
      if (openBasename !== targetBasename) {
        try {
          const res = await fetch("/api/files");
          if (!res.ok) return;
          const { files } = await res.json();
          const match = files.find((f) => f.replace(/\\/g, "/").split("/").pop() === targetBasename);
          if (match && studio.openFile) {
            await studio.openFile(match);
          } else {
            return;
          }
        } catch {
          return;
        }
      }
      if (studio.jumpToLine) {
        studio.jumpToLine(line);
      }
    }
    jumpToSourceInEditor(file, line) {
      const studio = window.studio;
      if (!studio?.editor) return;
      const targetFile = file.replace(/\\/g, "/").split("/").pop() ?? "";
      const openFile = studio.currentFile?.replace(/\\/g, "/").split("/").pop() ?? "";
      if (openFile !== targetFile) return;
      const editor = studio.editor;
      const model = editor.getModel?.();
      if (!model) return;
      editor.revealLine?.(
        line,
        0
        /* SmoothScroll */
      );
      const monacoObj = window.monaco;
      if (monacoObj && model) {
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
  };
  window.IframeBridge = IframeBridge;
})();
//# sourceMappingURL=iframeBridge.js.map
