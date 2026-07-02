// ============================================================
// TermPanel — a VS Code-style multi-terminal panel.
//
// Manages N independent interactive shells: each terminal gets its own
// xterm.js instance + FitAddon + a fresh /api/terminal WebSocket (the server
// spawns one PTY per connection, so concurrent terminals are free).
//
// UI: a vertical list of [term ×] entries on the right (VS Code tabsLocation:
// right) with a trailing [+] to create a new terminal; × closes one (disposes
// its xterm, kills its PTY via WS close). The active terminal fills the left.
// Switching tabs shows + focuses the right xterm; the active terminal is
// refit/resized on mount, on tab switch, and when the host asks (resize drag,
// panel expand) via fitActive().
//
// Terminal + FitAddon are injected (deps), so this one module serves both the
// bundled studio.ts (which imports @xterm/xterm) and viewer.html (which loads
// xterm from a CDN). No xterm import here → small, dependency-free bundle.
// ============================================================

export interface TermPanelDeps {
  Terminal: any;   // @xterm/xterm Terminal constructor
  FitAddon: any;   // @xterm/addon-fit FitAddon constructor
  wsUrl?: string;  // override the default ws(s)://host/api/terminal
}

interface TermInstance {
  id: number;
  sessionId: string;   // tmux session id; primary terminal reuses a persisted value
  label: string;
  xterm: any;
  fit: any;
  ws: WebSocket | null;
  el: HTMLDivElement;
  dead: boolean;   // PTY exited / socket closed — show a "reopen" affordance
}

let stylesInjected = false;
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
  const s = document.createElement('style');
  s.textContent = css;
  document.head.appendChild(s);
}

const THEME = {
  background: '#11111b',
  foreground: '#cdd6f4',
  cursor: '#89b4fa',
  selectionBackground: '#45475a',
};

export class TermPanel {
  private deps: TermPanelDeps;
  private root: HTMLDivElement;
  private tabBar: HTMLDivElement;
  private view: HTMLDivElement;
  private emptyHint: HTMLDivElement;
  private terms: TermInstance[] = [];
  private activeId: number | null = null;
  private nextId = 1;

  constructor(container: HTMLElement, deps: TermPanelDeps) {
    this.deps = deps;
    injectStyles();

    container.classList.add('term-panel');
    container.innerHTML = '';

    this.root = document.createElement('div');
    this.root.className = 'term-panel';
    this.root.style.height = '100%';

    this.tabBar = document.createElement('div');
    this.tabBar.className = 'term-tabbar';

    this.view = document.createElement('div');
    this.view.className = 'term-view';

    this.emptyHint = document.createElement('div');
    this.emptyHint.className = 'term-empty';
    this.emptyHint.textContent = 'No terminals — click + to open one.';

    this.view.appendChild(this.emptyHint);
    // Row order: view (active terminal) on the left, vertical tab list on the right.
    this.root.appendChild(this.view);
    this.root.appendChild(this.tabBar);
    container.appendChild(this.root);

    // Start with one terminal.
    this.newTerminal();
  }

  private static PRIMARY_KEY = 'overgds.terminal-session';

  // The primary terminal's session id is persisted so a browser refresh
  // reconnects to the surviving tmux session (where claude/etc. still run).
  private primarySessionId(): string {
    try {
      const existing = localStorage.getItem(TermPanel.PRIMARY_KEY);
      const id = existing || ((crypto as any).randomUUID?.() || `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);
      if (!existing) localStorage.setItem(TermPanel.PRIMARY_KEY, id);
      return id;
    } catch {
      return 'default';
    }
  }

  private freshSessionId(): string {
    return (crypto as any).randomUUID?.() || `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  private wsUrl(sessionId: string): string {
    const base = this.deps.wsUrl && !this.deps.wsUrl.includes('?')
      ? this.deps.wsUrl
      : (() => {
          const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
          return `${proto}//${location.host}/api/terminal`;
        })();
    return `${base}?session=${encodeURIComponent(sessionId)}`;
  }

  newTerminal(sessionId?: string): void {
    // First terminal (constructor) reuses the persisted primary id so refresh
    // reattaches; later terminals (+ button) get a fresh ephemeral id.
    const sid = sessionId ?? (this.terms.length === 0 ? this.primarySessionId() : this.freshSessionId());
    const id = this.nextId++;
    const el = document.createElement('div');
    el.className = 'term-instance hidden';

    const xterm = new this.deps.Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'Cascadia Code', 'Fira Code', monospace",
      theme: THEME,
    });
    const fit = new this.deps.FitAddon();
    xterm.loadAddon(fit);
    try { xterm.open(el); } catch (e) { console.error('xterm open failed', e); }

    const inst: TermInstance = { id, sessionId: sid, label: `term ${id}`, xterm, fit, ws: null, el, dead: false };
    this.terms.push(inst);
    this.view.appendChild(el);

    xterm.onData((data: string) => {
      if (inst.ws && inst.ws.readyState === WebSocket.OPEN) inst.ws.send(data);
    });

    this.connect(inst);
    this.activate(id);
    this.renderTabs();
    // Fit once mounted + visible.
    setTimeout(() => this.fitActive(), 60);
  }

  private connect(inst: TermInstance): void {
    try {
      inst.ws = new WebSocket(this.wsUrl(inst.sessionId));
    } catch (e) {
      inst.xterm.write(`\r\n\x1b[31mCannot open terminal: ${(e as Error).message}\x1b[0m\r\n`);
      return;
    }
    inst.xterm.write('\x1b[90mConnecting...\x1b[0m\r');
    inst.ws.onopen = () => {
      inst.xterm.write('\r\x1b[K');
      this.resizeRemote(inst);
    };
    inst.ws.onmessage = (ev: MessageEvent) => inst.xterm.write(ev.data);
    inst.ws.onclose = () => {
      inst.dead = true;
      inst.xterm.write('\r\n\x1b[90m— terminal exited (× to close, + for a new one) —\x1b[0m\r\n');
      this.renderTabs();
    };
    inst.ws.onerror = () => {
      inst.xterm.write('\r\n\x1b[31mTerminal connection error\x1b[0m\r\n');
    };
  }

  activate(id: number): void {
    const inst = this.terms.find(t => t.id === id);
    if (!inst) return;
    this.activeId = id;
    for (const t of this.terms) t.el.classList.toggle('hidden', t.id !== id);
    this.emptyHint.style.display = 'none';
    try { inst.xterm.focus(); } catch {}
    this.fitActive();
    this.renderTabs();
  }

  close(id: number): void {
    const idx = this.terms.findIndex(t => t.id === id);
    if (idx < 0) return;
    const inst = this.terms[idx];
    // Non-primary ("+"-button) terminals own an ephemeral tmux session that the
    // server keeps alive after WS close (that's the refresh-resilience feature).
    // Without explicit cleanup it would leak until server reboot, so fire a
    // best-effort DELETE before disposing. The primary terminal is intentionally
    // left alive — it's the resilient one a refresh reattaches to.
    if (inst.sessionId !== this.primarySessionId()) {
      try {
        fetch(`/api/terminal?session=${encodeURIComponent(inst.sessionId)}`, { method: 'DELETE' })
          .catch(() => { /* best-effort: session may already be gone */ });
      } catch { /* fetch unavailable or blocked — ignore */ }
    }
    try { inst.ws?.close(); } catch {}
    try { inst.xterm.dispose(); } catch {}
    inst.el.remove();
    this.terms.splice(idx, 1);
    if (this.activeId === id) {
      const next = this.terms[idx] || this.terms[idx - 1] || null;
      if (next) this.activate(next.id);
      else {
        this.activeId = null;
        this.emptyHint.style.display = '';
      }
    }
    this.renderTabs();
  }

  // Refit the active terminal to its container and tell the PTY the new size.
  fitActive(): void {
    const inst = this.terms.find(t => t.id === this.activeId);
    if (!inst) return;
    try {
      inst.fit.fit();
    } catch {}
    this.resizeRemote(inst);
  }

  private resizeRemote(inst: TermInstance): void {
    if (!inst.ws || inst.ws.readyState !== WebSocket.OPEN) return;
    try {
      const dims = inst.fit.proposeDimensions();
      if (dims) inst.ws.send(JSON.stringify({ type: 'resize', cols: dims.cols, rows: dims.rows }));
    } catch {}
  }

  private renderTabs(): void {
    this.tabBar.innerHTML = '';
    for (const inst of this.terms) {
      const tab = document.createElement('div');
      tab.className = 'term-tab'
        + (inst.id === this.activeId ? ' active' : '')
        + (inst.dead ? ' dead' : '');
      const label = document.createElement('span');
      label.textContent = inst.label;
      tab.appendChild(label);
      const close = document.createElement('button');
      close.className = 'term-close';
      close.title = 'Close terminal';
      close.textContent = '×';
      close.addEventListener('click', (e) => { e.stopPropagation(); this.close(inst.id); });
      tab.addEventListener('click', () => this.activate(inst.id));
      tab.appendChild(close);
      this.tabBar.appendChild(tab);
    }
    const add = document.createElement('button');
    add.className = 'term-add';
    add.title = 'New terminal';
    add.textContent = '+';
    add.addEventListener('click', () => this.newTerminal());
    this.tabBar.appendChild(add);
  }

  dispose(): void {
    for (const inst of [...this.terms]) {
      try { inst.ws?.close(); } catch {}
      try { inst.xterm.dispose(); } catch {}
    }
    this.terms = [];
    this.activeId = null;
    try { this.root.remove(); } catch {}
  }
}

declare global {
  interface Window {
    TermPanel: typeof TermPanel;
  }
}
window.TermPanel = TermPanel;
