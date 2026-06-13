import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

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

interface BuildStatus {
  lastOutput: string;
  exitCode: number | null;
  gdsPath: string | null;
  errors: string[];
  timestamp: number;
}

interface PendingCommand {
  type: 'highlightSource' | 'selectBySource';
  file: string;
  line: number;
  id: number;
}

interface IdeState {
  selectedComponents: ComponentSelection[];
  openFile: string | null;
  cursorPosition: { line: number; column: number } | null;
  buildStatus: BuildStatus | null;
  pendingQuestion: { components: ComponentSelection[]; question: string } | null;
  pendingCommands: PendingCommand[];
}

let commandId = 0;

// In-memory IDE state — ephemeral, lives for the server's lifetime
const ideState: IdeState = {
  selectedComponents: [],
  openFile: null,
  cursorPosition: null,
  buildStatus: null,
  pendingQuestion: null,
  pendingCommands: [],
};

export async function registerStateRoutes(app: FastifyInstance) {
  // GET /api/ide-state — read current IDE state (used by MCP server)
  app.get('/api/ide-state', async () => {
    return {
      selectedComponents: ideState.selectedComponents,
      openFile: ideState.openFile,
      cursorPosition: ideState.cursorPosition,
      buildStatus: ideState.buildStatus,
      pendingQuestion: ideState.pendingQuestion,
    };
  });

  // GET /api/ide-state/commands — fetch and clear pending commands (polled by frontend)
  app.get('/api/ide-state/commands', async () => {
    const commands = ideState.pendingCommands;
    ideState.pendingCommands = [];
    return { commands };
  });

  // POST /api/ide-state — update IDE state (from frontend or MCP server)
  app.post('/api/ide-state', async (req: FastifyRequest, reply: FastifyReply) => {
    const body = req.body as {
      type: string;
      components?: ComponentSelection[];
      file?: string;
      cursor?: { line: number; column: number };
      status?: BuildStatus;
      question?: string;
      line?: number;
    };

    switch (body.type) {
      case 'selection':
        if (body.components) {
          ideState.selectedComponents = body.components;
        }
        break;
      case 'openFile':
        ideState.openFile = body.file ?? null;
        break;
      case 'cursor':
        ideState.cursorPosition = body.cursor ?? null;
        break;
      case 'build':
        if (body.status) {
          ideState.buildStatus = body.status;
        }
        break;
      case 'askClaude':
        if (body.components && body.question) {
          ideState.pendingQuestion = {
            components: body.components,
            question: body.question,
          };
        }
        break;
      case 'highlightSource':
      case 'selectBySource':
        if (body.file && body.line) {
          ideState.pendingCommands.push({
            type: body.type,
            file: body.file,
            line: body.line,
            id: ++commandId,
          });
        }
        break;
      default:
        reply.code(400).send({ error: `Unknown state type: ${body.type}` });
        return;
    }

    reply.send({ ok: true });
  });
}
