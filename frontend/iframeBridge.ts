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
        this.forwardToEditor(msg.components);
        break;
      case 'askClaude':
        this.handleAskClaude(msg.components, msg.question);
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
      getModel: () => { getLineMaxLength: (line: number) => number } | null;
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
      const prov = comp.provenance || {};
      if (prov.file && prov.line) {
        const line = typeof prov.line === 'number' ? prov.line : parseInt(String(prov.line), 10);
        if (!isNaN(line)) {
          decorations.push({
            range: new monacoObj.Range(line, 1, line, model.getLineMaxLength(line)),
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
}
