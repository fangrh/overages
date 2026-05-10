import * as monaco from 'monaco-editor';
export function setupMonaco(container) {
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
