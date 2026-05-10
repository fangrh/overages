export class TerminalRenderer {
  constructor(private container: HTMLElement) {}
  addLine(type: 'stdout' | 'stderr' | 'system', text: string): void {
    const el = document.createElement('div');
    el.className = type;
    el.textContent = text;
    this.container.appendChild(el);
    this.container.scrollTop = this.container.scrollHeight;
  }
  clear(): void { this.container.innerHTML = ''; }
}