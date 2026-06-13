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
    // Remove only log-entry children (system/stdout/stderr), preserve terminal panel divs
    const toRemove: Node[] = [];
    for (const child of Array.from(this.container.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        if (el.className === 'system' || el.className === 'stdout' || el.className === 'stderr') {
          toRemove.push(child);
        }
      }
    }
    for (const node of toRemove) {
      this.container.removeChild(node);
    }
  }
}

// Also expose globally for IIFE bundling
declare global {
  interface Window {
    TerminalRenderer: typeof TerminalRenderer;
  }
}
window.TerminalRenderer = TerminalRenderer;
