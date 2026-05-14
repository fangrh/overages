"use strict";
(() => {
  // frontend/terminal.ts
  var TerminalRenderer = class {
    container;
    autoScroll = true;
    sourceInfoMode = "off";
    constructor(container) {
      this.container = container;
      container.parentElement?.addEventListener("scroll", () => {
        const { scrollTop, scrollHeight, clientHeight } = container.parentElement;
        this.autoScroll = scrollHeight - scrollTop - clientHeight < 50;
      });
    }
    addLine(type, text, sourceInfo) {
      const el = document.createElement("div");
      el.className = type;
      const time = (/* @__PURE__ */ new Date()).toLocaleTimeString("en-US", { hour12: false });
      const ts = document.createElement("span");
      ts.className = "timestamp";
      ts.textContent = `[${time}] `;
      ts.style.color = "#6c7086";
      el.appendChild(ts);
      if (sourceInfo && this.sourceInfoMode !== "off") {
        const src = document.createElement("span");
        src.className = "source-info";
        src.textContent = ` ${sourceInfo.file}:${sourceInfo.line}`;
        src.style.color = "#89b4fa";
        src.style.fontSize = "11px";
        src.style.marginRight = "8px";
        el.appendChild(src);
        if (this.sourceInfoMode === "clipboard") {
          navigator.clipboard.writeText(`${sourceInfo.file}:${sourceInfo.line}`).catch(() => {
          });
        }
      }
      const textNode = document.createElement("span");
      textNode.textContent = text;
      el.appendChild(textNode);
      this.container.appendChild(el);
      if (this.autoScroll) {
        this.container.parentElement.scrollTop = this.container.parentElement.scrollHeight;
      }
    }
    clear() {
      const toRemove = [];
      for (const child of Array.from(this.container.childNodes)) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const el = child;
          if (el.className === "system" || el.className === "stdout" || el.className === "stderr") {
            toRemove.push(child);
          }
        }
      }
      for (const node of toRemove) {
        this.container.removeChild(node);
      }
    }
  };
  window.TerminalRenderer = TerminalRenderer;
})();
//# sourceMappingURL=terminal.js.map
