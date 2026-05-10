// Access Monaco from window (loaded via CDN require script in index.html)
const monaco = (window as any).monaco;

export function setupMonaco(container: HTMLElement): any {
  if (!monaco) {
    console.error('Monaco not loaded - window.monaco is undefined');
    return null;
  }

  monaco.languages.register({ id: 'python' });

  monaco.languages.setLanguageConfiguration('python', {
    comments: { lineComment: '#', blockComment: ["'''", "'''"] },
    brackets: [['{', '}'], ['(', ')'], ['[', ']']],
    autoClosingPairs: [
      { open: '{', close: '}' }, { open: '(', close: ')' }, { open: '[', close: ']' },
      { open: '"', close: '"' }, { open: "'", close: "'" },
    ],
  });

  const editor = monaco.editor.create(container, {
    value: '# Open a Python file to begin\n',
    language: 'python',
    theme: 'vs-dark',
    fontSize: 14,
    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
    minimap: { enabled: false },
    lineNumbers: 'on',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    wordWrap: 'on',
  });

  return editor;
}

// Expose globally for IIFE bundling
declare global {
  interface Window {
    setupMonaco: typeof setupMonaco;
  }
}
window.setupMonaco = setupMonaco;