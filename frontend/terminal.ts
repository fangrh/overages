export class TerminalRenderer {
  private container: HTMLElement;
  private autoScroll = true;

  constructor(container: HTMLElement) {
    this.container = container;
    container.parentElement?.addEventListener('scroll', () => {
      const { scrollTop, scrollHeight, clientHeight } = container.parentElement!;
      this.autoScroll = scrollHeight - scrollTop - clientHeight < 50;
    });
  }

  addLine(type: 'stdout' | 'stderr' | 'system', text: string): void {
    const el = document.createElement('div');
    el.className = type;
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    const ts = document.createElement('span');
    ts.className = 'timestamp';
    ts.textContent = `[${time}] `;
    ts.style.color = '#6c7086';
    el.appendChild(ts);
    const textNode = document.createElement('span');
    textNode.textContent = text;
    el.appendChild(textNode);
    this.container.appendChild(el);
    if (this.autoScroll) {
      this.container.parentElement!.scrollTop = this.container.parentElement!.scrollHeight;
    }
  }

  clear(): void {
    this.container.innerHTML = '';
  }
}

// Also expose globally for IIFE bundling
declare global {
  interface Window {
    TerminalRenderer: typeof TerminalRenderer;
  }
}
window.TerminalRenderer = TerminalRenderer;
