#!/usr/bin/env node
/**
 * supergds-mcp — MCP server that exposes superGDS Studio IDE state to Claude Code.
 *
 * Runs as a stdio transport (Claude Code launches it as a child process).
 * Reads IDE state from the Express server's /api/ide-state endpoint.
 *
 * Usage:
 *   claude mcp add supergds -- npx tsx mcp/supergds-mcp.ts
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const IDE_STATE_URL = process.env.SUPERGDS_STATE_URL || 'http://localhost:3000/api/ide-state';

// --- Helpers ---

interface IdeState {
  selectedComponents: ComponentSelection[];
  openFile: string | null;
  cursorPosition: { line: number; column: number } | null;
  buildStatus: {
    lastOutput: string;
    exitCode: number | null;
    gdsPath: string | null;
    errors: string[];
    timestamp: number;
  } | null;
  pendingQuestion: { components: ComponentSelection[]; question: string } | null;
}

interface ComponentSelection {
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

async function getIdeState(): Promise<IdeState> {
  const res = await fetch(IDE_STATE_URL);
  if (!res.ok) throw new Error(`Failed to fetch IDE state: ${res.status}`);
  return res.json() as Promise<IdeState>;
}

async function postIdeState(data: Record<string, unknown>): Promise<void> {
  await fetch(IDE_STATE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

function text(content: string) {
  return { content: [{ type: 'text' as const, text: content }] };
}

function formatComponents(components: ComponentSelection[]): string {
  if (components.length === 0) return 'No components selected.';

  return components.map((c, i) => {
    const prov = c.provenance;
    const lines: string[] = [];
    lines.push(`Component ${i + 1}:`);
    lines.push(`  Layer: ${c.layer}`);
    lines.push(`  BBox: [${c.bbox.join(', ')}]`);
    if (prov.function) lines.push(`  Function: ${prov.function}`);
    if (prov.file && prov.line) lines.push(`  Source: ${prov.file}:${prov.line}`);
    if (prov.call_chain && prov.call_chain.length > 0) {
      lines.push(`  Call chain:`);
      for (const step of prov.call_chain) {
        lines.push(`    ${step.function || 'unknown'} at ${step.file || '?'}:${step.line || '?'}`);
      }
    }
    // Include any extra provenance keys
    const knownKeys = new Set(['file', 'line', 'function', 'call_chain']);
    const extra = Object.entries(prov).filter(([k]) => !knownKeys.has(k));
    if (extra.length > 0) {
      lines.push(`  Extra: ${extra.map(([k, v]) => `${k}=${v}`).join(', ')}`);
    }
    return lines.join('\n');
  }).join('\n\n');
}

// --- MCP Server ---

const server = new McpServer({
  name: 'supergds',
  version: '0.1.0',
});

// Tool: get_selected_components
server.tool(
  'get_selected_components',
  'Get the currently selected GDS components with full provenance data (file, line, function, call chain, layer, bbox). Use this when the user asks about what they are looking at or points to in the layout.',
  {},
  async () => {
    const state = await getIdeState();
    return text(formatComponents(state.selectedComponents));
  }
);

// Tool: get_open_file
server.tool(
  'get_open_file',
  'Get the file currently open in the Monaco editor and the cursor position. Use this to understand what code the user is looking at.',
  {},
  async () => {
    const state = await getIdeState();
    const file = state.openFile || 'No file open';
    const cursor = state.cursorPosition
      ? ` (cursor at line ${state.cursorPosition.line}, column ${state.cursorPosition.column})`
      : '';
    return text(`${file}${cursor}`);
  }
);

// Tool: get_build_status
server.tool(
  'get_build_status',
  'Get the status of the last GDS build — output, exit code, generated GDS path, and any errors. Use this to check if a script ran successfully.',
  {},
  async () => {
    const state = await getIdeState();
    if (!state.buildStatus) return text('No build has been run yet.');
    const s = state.buildStatus;
    const lines: string[] = [];
    lines.push(`Exit code: ${s.exitCode}`);
    lines.push(`GDS path: ${s.gdsPath || 'none'}`);
    if (s.errors.length > 0) {
      lines.push(`Errors:\n${s.errors.map(e => `  - ${e}`).join('\n')}`);
    }
    lines.push(`Output: ${s.lastOutput}`);
    lines.push(`Built at: ${new Date(s.timestamp).toISOString()}`);
    return text(lines.join('\n'));
  }
);

// Tool: run_script
server.tool(
  'run_script',
  'Run a Python script with GDS_PROVENANCE=1 to generate a GDS layout. Returns build result with generated GDS path. The viewer will update automatically.',
  {
    path: z.string().describe('Path to the Python script relative to workspace (e.g. "suspended_superconductor_standalone.py")'),
  },
  async ({ path }) => {
    // Trigger run via the Express server's SSE endpoint
    const pythonPath = process.env.SUPERGDS_PYTHON_PATH || '';
    const params = new URLSearchParams({ pythonFile: path });
    if (pythonPath) params.set('pythonPath', pythonPath);

    try {
      const res = await fetch(`http://localhost:3000/api/run?${params.toString()}`);
      if (!res.ok) return text(`Failed to start run: ${res.status}`);

      // Read the SSE stream until we get a complete or error event
      const reader = res.body?.getReader();
      if (!reader) return text('Failed to read run response');

      const decoder = new TextDecoder();
      let buffer = '';
      let result = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Parse SSE events
        const parts = buffer.split('\n\n');
        for (let i = 0; i < parts.length - 1; i++) {
          const eventBlock = parts[i];
          const eventType = eventBlock.match(/^event: (\w+)/m)?.[1];
          const dataMatch = eventBlock.match(/^data: (.+)$/m);
          if (!dataMatch) continue;

          const data = JSON.parse(dataMatch[1]);

          if (eventType === 'complete') {
            result = `Build complete.\nGDS: ${data.gdsPath || 'unknown'}\nMode: ${data.mode || 'unknown'}`;
            // Update IDE state
            await postIdeState({
              type: 'build',
              status: {
                lastOutput: 'Build complete.',
                exitCode: 0,
                gdsPath: data.gdsPath || null,
                errors: [],
                timestamp: Date.now(),
              },
            });
            // Tell the frontend to reload the freshly-built GDS into the viewer.
            // run_script consumes the /api/run SSE itself, so studio.ts never sees
            // the 'complete' event — without this push the viewer would stay stale
            // after an LLM-driven build. The frontend polls /api/ide-state/commands
            // and calls loadGdsIntoViewer(gdsPath) when it sees this.
            if (data.gdsPath) {
              await postIdeState({ type: 'reloadGds', gdsPath: data.gdsPath });
            }
          } else if (eventType === 'error') {
            result = `Build failed: ${data.message || 'unknown error'}`;
            await postIdeState({
              type: 'build',
              status: {
                lastOutput: data.message || 'Build failed',
                exitCode: 1,
                gdsPath: null,
                errors: [data.message || 'Build failed'],
                timestamp: Date.now(),
              },
            });
          }
        }
        buffer = parts[parts.length - 1];
      }

      return text(result || 'Run completed but no result received.');
    } catch (err: any) {
      return text(`Run failed: ${err.message}`);
    }
  }
);

// Tool: highlight_source
server.tool(
  'highlight_source',
  'Highlight a source code line in the Monaco editor. Use this after modifying code to show the user what changed.',
  {
    file: z.string().describe('File name or path (e.g. "suspended_superconductor_standalone.py")'),
    line: z.number().describe('Line number to highlight'),
  },
  async ({ file, line }) => {
    // The iframeBridge's sendSelectBySource sends a message to the viewer.
    // For highlight_source, we use the command endpoint to trigger forwardToEditor.
    // This works by posting to IDE state, which the frontend polls or reacts to.
    await postIdeState({
      type: 'highlightSource',
      file,
      line,
    });
    return text(`Highlighted ${file}:${line} in the editor.`);
  }
);

// Tool: select_by_source
server.tool(
  'select_by_source',
  'Select/highlight polygons in the GDS viewer that correspond to a source code location. Use this to show which layout elements a specific line of code generates.',
  {
    file: z.string().describe('File name or path'),
    line: z.number().describe('Line number in the source file'),
  },
  async ({ file, line }) => {
    await postIdeState({
      type: 'selectBySource',
      file,
      line,
    });
    return text(`Selected polygons from ${file}:${line} in the viewer.`);
  }
);

// Tool: get_pending_question
server.tool(
  'get_pending_question',
  'Get a pending question from the superGDS viewer UI (submitted via the "Ask Claude" panel). Returns the question and selected components.',
  {},
  async () => {
    const state = await getIdeState();
    if (!state.pendingQuestion) return text('No pending question.');

    const q = state.pendingQuestion;
    const lines: string[] = [];
    lines.push(`Question: ${q.question}`);
    lines.push(`\nSelected components:\n${formatComponents(q.components)}`);
    return text(lines.join('\n'));
  }
);

// --- Start ---

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so it doesn't interfere with stdio transport
  process.stderr.write('supergds-mcp: connected via stdio\n');
}

main().catch((err) => {
  process.stderr.write(`supergds-mcp: fatal: ${err.message}\n`);
  process.exit(1);
});
