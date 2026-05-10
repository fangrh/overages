export class IframeBridge {
    iframe;
    constructor(iframe) {
        this.iframe = iframe;
        window.addEventListener('message', (e) => {
            if (e.data?.type === 'selectComponents') {
                console.log('component selected', e.data.components);
            }
        });
    }
    sendLoadGds(data) {
        this.iframe.contentWindow?.postMessage({ type: 'loadGds', ...data }, '*');
    }
}
