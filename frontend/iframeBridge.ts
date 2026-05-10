export class IframeBridge {
  constructor(private iframe: HTMLIFrameElement) {
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'selectComponents') {
        console.log('component selected', e.data.components);
      }
    });
  }
  sendLoadGds(data: Record<string, unknown>): void {
    this.iframe.contentWindow?.postMessage({ type: 'loadGds', ...data }, '*');
  }
}