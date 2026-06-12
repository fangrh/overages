"use strict";
(() => {
  // frontend/tabManager.ts
  var TabManager = class {
    headerEl;
    bodyEl;
    tabContainer;
    tabs = /* @__PURE__ */ new Map();
    activeTabId = null;
    constructor(headerId, bodyId) {
      this.headerEl = document.getElementById(headerId);
      this.bodyEl = document.getElementById(bodyId);
      this.tabContainer = this.headerEl.querySelector(".tab-bar");
      if (!this.tabContainer) {
        this.tabContainer = document.createElement("span");
        this.tabContainer.className = "tab-bar";
        this.tabContainer.style.cssText = "display:flex;align-items:center;gap:2px;";
        this.headerEl.insertBefore(this.tabContainer, this.headerEl.firstChild);
      }
    }
    /**
     * Register a new tab.
     * @param id        Unique tab identifier (used as data-tab attribute)
     * @param label     Human-readable label shown on the tab button
     * @param contentEl The DOM element shown when this tab is active
     * @param opts      Optional: active, onActivate, onClose
     */
    addTab(id, label, contentEl, opts) {
      if (this.tabs.has(id)) {
        console.warn(`TabManager: tab "${id}" already exists, skipping`);
        return;
      }
      const btn = document.createElement("span");
      btn.className = "panel-tab-btn";
      btn.setAttribute("data-tab", id);
      btn.textContent = label;
      if (opts?.onClose) {
        const closeBtn = document.createElement("span");
        closeBtn.className = "panel-tab-close";
        closeBtn.textContent = "\xD7";
        closeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          opts.onClose();
        });
        btn.appendChild(closeBtn);
      }
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.switchTo(id);
      });
      this.tabContainer.appendChild(btn);
      const entry = {
        id,
        label,
        contentEl,
        onActivate: opts?.onActivate,
        onClose: opts?.onClose,
        btnEl: btn
      };
      this.tabs.set(id, entry);
      contentEl.style.display = "none";
      if (opts?.active) {
        this.switchTo(id);
      }
    }
    /**
     * Switch to a tab by id.
     */
    switchTo(id) {
      const target = this.tabs.get(id);
      if (!target) return;
      this.activeTabId = id;
      for (const [tabId, entry] of this.tabs) {
        const isActive = tabId === id;
        entry.btnEl.classList.toggle("active", isActive);
        entry.contentEl.style.display = isActive ? "" : "none";
      }
      target.onActivate?.();
    }
    /**
     * Remove a tab by id.
     */
    removeTab(id) {
      const entry = this.tabs.get(id);
      if (!entry) return;
      entry.btnEl.remove();
      entry.contentEl.style.display = "none";
      this.tabs.delete(id);
      if (this.activeTabId === id) {
        const first = this.tabs.values().next().value;
        if (first) {
          this.switchTo(first.id);
        } else {
          this.activeTabId = null;
        }
      }
    }
    /**
     * Get the active tab id.
     */
    getActive() {
      return this.activeTabId;
    }
    /**
     * Get the TabManager's header element (for positioning controls like settings).
     */
    getHeader() {
      return this.headerEl;
    }
    /**
     * Get the tab container element (for inserting elements after the tabs).
     */
    getTabBar() {
      return this.tabContainer;
    }
  };
  window.TabManager = TabManager;
})();
//# sourceMappingURL=tabManager.js.map
