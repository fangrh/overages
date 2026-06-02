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
      case 'selectComponents': {
        const components = msg.components || [];
        this.currentComponents = components;
        break;
      }
      case 'askClaude':
        this.handleAskClaude(msg.components, msg.question);
        break;
      case 'jumpToSource':
        console.log('[iframeBridge] received jumpToSource:', msg.file, msg.line);
        this.jumpToSourceInEditor(msg.file, msg.line);
        break;
      case 'requestSource':
        // From viewer's source panel — open file in Monaco and jump to line
        console.log('[iframeBridge] received requestSource:', msg.file, msg.line);
        this.handleRequestSource(msg.file, msg.line);
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

  sendSelectBySource(file: string, line: number): void {
    if (!this.ready) return;
    this.iframe.contentWindow?.postMessage({
      type: 'selectBySource',
      file,
      line,
    }, '*');
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

  private async handleRequestSource(file: string, line: number): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const studio = (window as any).studio;
    if (!studio) return;

    const targetBasename = file.replace(/\\/g, '/').split('/').pop() ?? '';
    const openBasename = studio.currentFile?.replace(/\\/g, '/').split('/').pop() ?? '';

    if (openBasename !== targetBasename) {
      // Find the file in workspace and open it
      try {
        const res = await fetch('/api/files');
        if (!res.ok) return;
        const { files } = await res.json();
        const match = (files as string[]).find((f: string) => f.replace(/\\/g, '/').split('/').pop() === targetBasename);
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
