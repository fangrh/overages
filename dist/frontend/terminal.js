export class TerminalRenderer {
    container;
    constructor(container) {
        this.container = container;
    }
    addLine(type, text) {
        const el = document.createElement('div');
        el.className = type;
        el.textContent = text;
        this.container.appendChild(el);
        this.container.scrollTop = this.container.scrollHeight;
    }
    clear() { this.container.innerHTML = ''; }
}
