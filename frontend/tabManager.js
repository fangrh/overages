"use strict";
(() => {
  // frontend/tabManager.ts
  var TabManager = class {
    headerEl;
    bodyEl;
    tabContainer;
    tabs = /* @__PURE__ */ new Map();
    availableTabs = /* @__PURE__ */ new Map();
    addBtn = null;
    addDropdown = null;
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
      if (opts?.icon) {
        const iconSpan = document.createElement("span");
        iconSpan.textContent = opts.icon;
        iconSpan.style.cssText = "font-size:13px;line-height:1;";
        btn.appendChild(iconSpan);
      }
      const labelSpan = document.createElement("span");
      labelSpan.textContent = label;
      btn.appendChild(labelSpan);
      const closeBtn = document.createElement("span");
      closeBtn.className = "panel-tab-close";
      closeBtn.textContent = "\xD7";
      closeBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (opts?.onClose) {
          opts.onClose();
        } else {
          this.removeTab(id);
          if (!this.availableTabs.has(id)) {
            this.availableTabs.set(id, {
              id,
              label,
              icon: opts?.icon,
              factory: () => ({ el: contentEl })
            });
          }
          this.refreshAddMenu();
        }
      });
      btn.appendChild(closeBtn);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.switchTo(id);
      });
      if (this.addBtn && this.addBtn.parentNode === this.tabContainer) {
        this.tabContainer.insertBefore(btn, this.addBtn);
      } else {
        this.tabContainer.appendChild(btn);
      }
      const entry = {
        id,
        label,
        contentEl,
        onActivate: opts?.onActivate,
        onClose: opts?.onClose,
        icon: opts?.icon,
        btnEl: btn
      };
      this.tabs.set(id, entry);
      contentEl.style.display = "none";
      if (opts?.active) {
        this.switchTo(id);
      }
      this.refreshAddMenu();
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
      if (this.availableTabs.has(id)) {
        entry.contentEl.remove();
      }
      this.tabs.delete(id);
      if (this.activeTabId === id) {
        const first = this.tabs.values().next().value;
        if (first) {
          this.switchTo(first.id);
        } else {
          this.activeTabId = null;
        }
      }
      this.refreshAddMenu();
    }
    /**
     * Get the active tab id.
     */
    getActive() {
      return this.activeTabId;
    }
    /**
     * Register a tab as "available" — it will show in the "+" dropdown
     * and can be dynamically added by the user.
     */
    addAvailableTab(id, label, factory, icon) {
      this.availableTabs.set(id, { id, label, icon, factory });
      this.setupAddButton();
      this.refreshAddMenu();
    }
    /**
     * Create the "+" button and dropdown if not already created.
     */
    setupAddButton() {
      if (this.addBtn) return;
      this.addBtn = document.createElement("span");
      this.addBtn.className = "panel-tab-add-btn";
      this.addBtn.textContent = "+";
      this.addBtn.title = "Add tab";
      this.addBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        this.toggleAddDropdown();
      });
      this.tabContainer.appendChild(this.addBtn);
      document.addEventListener("click", (e) => {
        if (this.addDropdown && !this.addDropdown.contains(e.target) && e.target !== this.addBtn) {
          this.hideAddDropdown();
        }
      });
    }
    toggleAddDropdown() {
      if (this.addDropdown && this.addDropdown.style.display !== "none") {
        this.hideAddDropdown();
      } else {
        this.showAddDropdown();
      }
    }
    showAddDropdown() {
      if (!this.addDropdown) {
        this.addDropdown = document.createElement("div");
        this.addDropdown.className = "panel-tab-add-dropdown";
        document.body.appendChild(this.addDropdown);
      }
      this.refreshAddMenu();
      if (this.addBtn) {
        const rect = this.addBtn.getBoundingClientRect();
        this.addDropdown.style.position = "fixed";
        this.addDropdown.style.top = `${rect.bottom + 2}px`;
        this.addDropdown.style.left = `${rect.left}px`;
      }
      this.addDropdown.style.display = "block";
    }
    hideAddDropdown() {
      if (this.addDropdown) {
        this.addDropdown.style.display = "none";
      }
    }
    /**
     * Rebuild the dropdown menu items based on currently available tabs.
     */
    refreshAddMenu() {
      if (!this.addDropdown) return;
      const items = [];
      for (const [id, tab] of this.availableTabs) {
        if (!this.tabs.has(id)) {
          items.push(tab);
        }
      }
      this.addDropdown.innerHTML = "";
      if (items.length === 0) {
        const empty = document.createElement("div");
        empty.className = "panel-tab-add-empty";
        empty.textContent = "All tabs added";
        this.addDropdown.appendChild(empty);
        if (this.addBtn) this.addBtn.style.display = "none";
        return;
      }
      if (this.addBtn) this.addBtn.style.display = "";
      for (const item of items) {
        const opt = document.createElement("div");
        opt.className = "panel-tab-add-option";
        const label = document.createElement("span");
        if (item.icon) {
          const iconSpan = document.createElement("span");
          iconSpan.textContent = item.icon + " ";
          iconSpan.style.cssText = "font-size:12px;";
          label.appendChild(iconSpan);
        }
        const textSpan = document.createElement("span");
        textSpan.textContent = item.label;
        label.appendChild(textSpan);
        opt.appendChild(label);
        opt.addEventListener("click", (e) => {
          e.stopPropagation();
          this.addAvailableTabAsActive(item.id);
          this.hideAddDropdown();
        });
        this.addDropdown.appendChild(opt);
      }
    }
    /**
     * Instantiate an available tab and add it as active.
     */
    addAvailableTabAsActive(id) {
      const available = this.availableTabs.get(id);
      if (!available) return;
      const { el, onActivate, onClose } = available.factory();
      this.bodyEl.appendChild(el);
      this.addTab(id, available.label, el, {
        active: true,
        onActivate,
        onClose: onClose || (() => {
          this.removeTab(id);
          this.refreshAddMenu();
        }),
        icon: available.icon
      });
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
