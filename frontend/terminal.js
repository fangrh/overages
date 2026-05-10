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
  window.TerminalRenderer = TerminalRenderer;
})();
//# sourceMappingURL=terminal.js.map
