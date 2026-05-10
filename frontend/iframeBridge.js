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
  };
  window.IframeBridge = IframeBridge;
})();
//# sourceMappingURL=iframeBridge.js.map
