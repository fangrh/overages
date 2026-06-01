export interface ComponentSelection {
  provId: string;
  layer: string;
  bbox: number[];
  provenance: {
    file?: string;
    line?: number | string;
    function?: string;
    call_chain?: Array<{ file?: string; line?: number | string; function?: string }>;
    [key: string]: unknown;
  };
}

export class IframeBridge {
  private iframe: HTMLIFrameElement;
  private ready = false;
  private currentComponents: ComponentSelection[] = [];
  private pending: Array<{
    geojson: unknown;
    gdsPath: string;
    pythonFile: string;
    annotations: unknown[];
    mode: string;
  }> = [];

  constructor(iframe: HTMLIFrameElement) {
    this.iframe = iframe;
    window.addEventListener('message', this.onMessage.bind(this));

    // Poll for viewer ready (webviewReady comes from iframe)
    let attempts = 0;
    const checkReady = setInterval(() => {
      attempts++;
      if (this.ready || attempts > 50) {
        clearInterval(checkReady);
        return;
      }
      this.iframe.contentWindow?.postMessage({ type: 'ping' }, '*');
    }, 100);
  }

  private onMessage(e: MessageEvent): void {
    const msg = e.data;
    if (!msg || typeof msg !== 'object') return;
    console.log('[iframeBridge] message received:', msg.type, msg);
    switch (msg.type) {
      case 'webviewReady':
        this.ready = true;
        // Flush pending messages
        for (const data of this.pending) {
          this.sendLoadGds(data);
        }
        this.pending = [];
        break;
      case 'selectComponents':
        // forwardToEditor is for VS Code mode (Monaco decorations) - skip in standalone mode
        this.currentComponents = msg.components || [];
        this.updateTerminalPanels(msg.components);
        break;
      case 'askClaude':
        this.handleAskClaude(msg.components, msg.question);
        break;
      case 'jumpToSource':
        console.log('[iframeBridge] received jumpToSource:', msg.file, msg.line);
        this.jumpToSourceInEditor(msg.file, msg.line);
        break;
    }
  }

  sendLoadGds(data: {
    geojson: unknown;
    gdsPath: string;
    pythonFile: string;
    annotations: unknown[];
    mode: string;
  }): void {
    const msg = { type: 'loadGds', ...data };
    if (!this.ready) {
      this.pending.push(data);
      return;
    }
    this.iframe.contentWindow?.postMessage(msg, '*');
  }

  private forwardToEditor(components: ComponentSelection[]): void {
    // Highlight source locations in Monaco
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const studio = (window as any).studio;
    if (!studio?.editor) return;

    const editor = studio.editor as {
      getModel: () => { getLineMaxColumn: (line: number) => number } | null;
      deltaDecorations: (old: string[], newDecs: unknown[]) => string[];
    };
    const model = editor.getModel();
    if (!model) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const monacoObj = (window as any).monaco;
    if (!monacoObj) return;

    // Build list of decorations (source line highlights)
    const decorations: unknown[] = [];
    for (const comp of components) {
      const prov: Record<string, any> = comp.provenance || {};
      if (prov.file && prov.line) {
        const line = typeof prov.line === 'number' ? prov.line : parseInt(String(prov.line), 10);
        if (!isNaN(line)) {
          decorations.push({
            range: new monacoObj.Range(line, 1, line, model.getLineMaxColumn(line)),
            options: {
              isWholeLine: true,
              className: 'source-highlight',
              glyphMarginClassName: 'source-glyph',
            },
          });
        }
      }
    }

    editor.deltaDecorations([], decorations);
  }

  private handleAskClaude(components: ComponentSelection[], question: string): void {
    console.log('askClaude', components, question);
  }

  private updateTerminalPanels(components: ComponentSelection[]): void {
    // Update terminal source-panel and info-panel with component data
    const sourcePanel = document.getElementById('terminal-source-panel');
    const infoPanel = document.getElementById('terminal-info-panel');
    if (!sourcePanel || !infoPanel) return;

    if (components.length === 0) {
      sourcePanel.innerHTML = '<p class="placeholder">Click a polygon in the viewer to inspect source</p>';
      infoPanel.innerHTML = '<p class="placeholder">Click a polygon in the viewer to inspect</p>';
      return;
    }

    // Info panel: show key-value info for first component
    const comp = components[0];
    const prov: Record<string, any> = comp.provenance || {};
    infoPanel.innerHTML = '';

    const addKV = (key: string, val: string) => {
      const row = document.createElement('div');
      row.className = 'kv';
      row.innerHTML = `<span class="key">${key}</span><span class="val">${val}</span>`;
      infoPanel.appendChild(row);
    };

    addKV('layer', comp.layer || '?');
    if (prov.instance_name) addKV('instance', prov.instance_name);
    if (prov.cell) addKV('cell', prov.cell);
    if (prov.file) {
      let fileLabel = prov.file + ':' + (prov.line ?? '?');
      if (prov.array_index?.length) fileLabel += ` (array index [${prov.array_index.join(', ')}])`;
      if (prov.loop_index?.length) fileLabel += ` (loop index [${prov.loop_index.join(', ')}])`;
      addKV('file', fileLabel);
    }
    if (prov.function && prov.function !== '<module>') addKV('function', prov.function + '()');
    if (prov.class_name) addKV('class', prov.class_name);

    // Source panel: show source locations
    if (prov.file) {
      sourcePanel.innerHTML = '';
      const files = new Map<string, { line: number; loop_index?: number[]; array_index?: number[] }[]>();
      const fp = prov.file.replace(/\\/g, '/');
      const entry: { line: number; loop_index?: number[]; array_index?: number[] } = { line: typeof prov.line === 'number' ? prov.line : parseInt(String(prov.line)) || 0 };
      if (prov.loop_index) entry.loop_index = prov.loop_index;
      if (prov.array_index) entry.array_index = prov.array_index;
      files.set(fp, [entry]);

      // Add call chain files
      const chain = prov.call_chain || [];
      for (const cc of chain) {
        if (cc.file) {
          const cfp = cc.file.replace(/\\/g, '/');
          const cl = typeof cc.line === 'number' ? cc.line : parseInt(String(cc.line)) || 0;
          if (!files.has(cfp)) files.set(cfp, []);
          const existing = files.get(cfp)!;
          if (!existing.some(e => e.line === cl)) existing.push({ line: cl });
        }
      }

      // Render file entries
      for (const [file, entries] of files) {
        for (const entry of entries) {
          const div = document.createElement('div');
          div.className = 'kv';
          let label = `@${file}:${entry.line}`;
          if (entry.loop_index) label += ` (loop [${entry.loop_index.join(', ')}])`;
          if (entry.array_index) label += ` (array [${entry.array_index.join(', ')}])`;
          const sourceSpan = document.createElement('span');
          sourceSpan.className = 'val clickable source-jump';
          sourceSpan.setAttribute('data-file', file);
          sourceSpan.setAttribute('data-line', String(entry.line));
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

  private jumpToSourceInEditor(file: string, line: number): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const studio = (window as any).studio;
  if (!studio?.editor) return;

  // Compare file names — provenance may be absolute path, studio.currentFile may be relative
  const targetFile = file.replace(/\\/g, '/').split('/').pop() ?? '';
  const openFile = studio.currentFile?.replace(/\\/g, '/').split('/').pop() ?? '';
  if (openFile !== targetFile) return; // file not open — silent no-op

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editor = studio.editor as any;
  const model = editor.getModel?.();
  if (!model) return;

  // File is open — reveal line and highlight it
  editor.revealLine?.(line, 0 /* SmoothScroll */);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monacoObj = (window as any).monaco;
  if (monacoObj && model) {
    editor.deltaDecorations?.([], [{
      range: new monacoObj.Range(line, 1, line, model.getLineMaxColumn(line)),
      options: {
        isWholeLine: true,
        className: 'source-highlight',
        glyphMarginClassName: 'source-glyph',
      },
    }]);
  }
}
}

// Expose globally for IIFE bundling
declare global {
  interface Window {
    IframeBridge: typeof IframeBridge;
  }
}
window.IframeBridge = IframeBridge;
