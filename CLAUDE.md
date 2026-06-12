<!-- gitnexus:start -->
# GitNexus — Code Intelligence

This project is indexed by GitNexus as **overages** (844 symbols, 1149 relationships, 22 execution flows). Use the GitNexus MCP tools to understand code, assess impact, and navigate safely.

> If any GitNexus tool warns the index is stale, run `npx gitnexus analyze` in terminal first.

## Always Do

- **MUST run impact analysis before editing any symbol.** Before modifying a function, class, or method, run `gitnexus_impact({target: "symbolName", direction: "upstream"})` and report the blast radius (direct callers, affected processes, risk level) to the user.
- **MUST run `gitnexus_detect_changes()` before committing** to verify your changes only affect expected symbols and execution flows.
- **MUST warn the user** if impact analysis returns HIGH or CRITICAL risk before proceeding with edits.
- When exploring unfamiliar code, use `gitnexus_query({query: "concept"})` to find execution flows instead of grepping. It returns process-grouped results ranked by relevance.
- When you need full context on a specific symbol — callers, callees, which execution flows it participates in — use `gitnexus_context({name: "symbolName"})`.

## Never Do

- NEVER edit a function, class, or method without first running `gitnexus_impact` on it.
- NEVER ignore HIGH or CRITICAL risk warnings from impact analysis.
- NEVER rename symbols with find-and-replace — use `gitnexus_rename` which understands the call graph.
- NEVER commit changes without running `gitnexus_detect_changes()` to check affected scope.

## Resources

| Resource | Use for |
|----------|---------|
| `gitnexus://repo/overages/context` | Codebase overview, check index freshness |
| `gitnexus://repo/overages/clusters` | All functional areas |
| `gitnexus://repo/overages/processes` | All execution flows |
| `gitnexus://repo/overages/process/{name}` | Step-by-step execution trace |

## CLI

| Task | Read this skill file |
|------|---------------------|
| Understand architecture / "How does X work?" | `.claude/skills/gitnexus/gitnexus-exploring/SKILL.md` |
| Blast radius / "What breaks if I change X?" | `.claude/skills/gitnexus/gitnexus-impact-analysis/SKILL.md` |
| Trace bugs / "Why is X failing?" | `.claude/skills/gitnexus/gitnexus-debugging/SKILL.md` |
| Rename / extract / split / refactor | `.claude/skills/gitnexus/gitnexus-refactoring/SKILL.md` |
| Tools, resources, schema reference | `.claude/skills/gitnexus/gitnexus-guide/SKILL.md` |
| Index, status, clean, wiki CLI commands | `.claude/skills/gitnexus/gitnexus-cli/SKILL.md` |

<!-- gitnexus:end -->

## superGDS MCP — AI Agent Context

When the user asks about a GDS layout component, what they are looking at, or wants to modify the layout:

1. **Call `get_selected_components`** to get provenance data (file, line, function, call chain) for whatever polygon they clicked.
2. **Call `get_open_file`** to see what code is currently open in the editor.
3. **Call `get_build_status`** to check the last run's output and any errors.
4. Use provenance to understand which code generated the component they're asking about — then edit the Python script at that exact location.

When modifying a layout:
1. Use provenance from `get_selected_components` to find the exact code location.
2. Edit the Python script.
3. **Call `run_script`** to rebuild the layout with provenance tracking.
4. **Call `highlight_source`** to show the user which line changed in the editor.
5. **Call `select_by_source`** to highlight the affected polygons in the viewer.

The viewer has an "Ask Claude" panel that submits questions via `askClaude`. When the user seems to be asking about the layout, check `get_pending_question` for viewer-submitted questions.

### MCP Server Setup

The MCP server connects Claude Code to the superGDS Studio IDE state:

```bash
# One-time setup — add the MCP server to Claude Code
claude mcp add supergds -- node --import tsx/esm mcp/supergds-mcp.ts

# Or use the npm script
claude mcp add supergds -- npm run mcp
```

The server reads IDE state from `http://localhost:3000/api/ide-state` (the Express server must be running).
