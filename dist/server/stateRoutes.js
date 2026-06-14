let commandId = 0;
// In-memory IDE state — ephemeral, lives for the server's lifetime
const ideState = {
    selectedComponents: [],
    openFile: null,
    cursorPosition: null,
    buildStatus: null,
    pendingQuestion: null,
    pendingCommands: [],
};
export async function registerStateRoutes(app) {
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
    app.post('/api/ide-state', async (req, reply) => {
        const body = req.body;
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
            // MCP run_script posts this after a successful build so the viewer
            // reloads the freshly-generated GDS — the LLM build channel. (Terminal
            // builds are caught by the frontend's mtime poller instead, since the
            // server can't observe PTY command output.)
            case 'reloadGds':
                if (body.gdsPath) {
                    ideState.pendingCommands.push({
                        type: 'reloadGds',
                        gdsPath: body.gdsPath,
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
