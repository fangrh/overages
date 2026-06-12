/**
 * TabManager — generic, reusable tab panel system.
 *
 * Both the main studio bottom panel and the GDS viewer console
 * instantiate a TabManager to get consistent tab behaviour:
 *   • addTab(id, label, contentEl, options?)
 *   • switchTo(id)
 *   • removeTab(id)
 *   • getActive() → tab id
 *
 * Usage (main panel):
 *   const tm = new TabManager('terminal-header', 'terminal-body');
 *   tm.addTab('terminal', 'Terminal', xtermPanel, { active: true });
 *   tm.addTab('output',   'Output',   outputPanel);
 *
 * Usage (viewer console):
 *   const tm = new TabManager('console-header', 'console-body');
 *   tm.addTab('source', 'Source', sourcePanel, { active: true });
 *   tm.addTab('info',   'Info',   infoPanel);
 */

export interface TabOptions {
  /** Start as the active tab (only one should be true) */
  active?: boolean;
  /** Optional callback when this tab becomes visible */
  onActivate?: () => void;
  /** Optional close handler — if provided, tab gets an × button */
  onClose?: () => void;
}

interface TabEntry {
  id: string;
  label: string;
  contentEl: HTMLElement;
  onActivate?: () => void;
  onClose?: () => void;
  btnEl: HTMLElement;
}

export class TabManager {
  private headerEl: HTMLElement;
  private bodyEl: HTMLElement;
  private tabContainer: HTMLElement;
  private tabs = new Map<string, TabEntry>();
  private activeTabId: string | null = null;

  constructor(headerId: string, bodyId: string) {
    this.headerEl = document.getElementById(headerId)!;
    this.bodyEl = document.getElementById(bodyId)!;

    // Find or create the tab-button container span inside the header
    this.tabContainer = this.headerEl.querySelector('.tab-bar') as HTMLElement;
    if (!this.tabContainer) {
      this.tabContainer = document.createElement('span');
      this.tabContainer.className = 'tab-bar';
      this.tabContainer.style.cssText = 'display:flex;align-items:center;gap:2px;';
      // Insert as first child of header
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
  addTab(id: string, label: string, contentEl: HTMLElement, opts?: TabOptions): void {
    if (this.tabs.has(id)) {
      console.warn(`TabManager: tab "${id}" already exists, skipping`);
      return;
    }

    // Create tab button
    const btn = document.createElement('span');
    btn.className = 'panel-tab-btn';
    btn.setAttribute('data-tab', id);
    btn.textContent = label;

    // Close button
    if (opts?.onClose) {
      const closeBtn = document.createElement('span');
      closeBtn.className = 'panel-tab-close';
      closeBtn.textContent = '×';
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        opts.onClose!();
      });
      btn.appendChild(closeBtn);
    }

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.switchTo(id);
    });

    this.tabContainer.appendChild(btn);

    const entry: TabEntry = {
      id,
      label,
      contentEl,
      onActivate: opts?.onActivate,
      onClose: opts?.onClose,
      btnEl: btn,
    };
    this.tabs.set(id, entry);

    // Hide all panels initially, unless it's the active tab
    contentEl.style.display = 'none';

    if (opts?.active) {
      this.switchTo(id);
    }
  }

  /**
   * Switch to a tab by id.
   */
  switchTo(id: string): void {
    const target = this.tabs.get(id);
    if (!target) return;

    this.activeTabId = id;

    for (const [tabId, entry] of this.tabs) {
      const isActive = tabId === id;
      entry.btnEl.classList.toggle('active', isActive);
      entry.contentEl.style.display = isActive ? '' : 'none';
    }

    target.onActivate?.();
  }

  /**
   * Remove a tab by id.
   */
  removeTab(id: string): void {
    const entry = this.tabs.get(id);
    if (!entry) return;

    entry.btnEl.remove();
    entry.contentEl.style.display = 'none';

    this.tabs.delete(id);

    // If we removed the active tab, switch to the first remaining one
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
  getActive(): string | null {
    return this.activeTabId;
  }

  /**
   * Get the TabManager's header element (for positioning controls like settings).
   */
  getHeader(): HTMLElement {
    return this.headerEl;
  }

  /**
   * Get the tab container element (for inserting elements after the tabs).
   */
  getTabBar(): HTMLElement {
    return this.tabContainer;
  }
}

// Expose globally for IIFE bundling
declare global {
  interface Window {
    TabManager: typeof TabManager;
  }
}
window.TabManager = TabManager;
