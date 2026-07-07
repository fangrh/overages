# File Download (VS Code Remote–style)

**Date:** 2026-07-07
**Status:** Design — pending implementation plan
**Scope:** Download workspace files/folders from the server-side workspace to the browser client.

## Problem

The workspace lives server-side (WSL/disk, `server/workspace.ts` singleton); the browser is
the client. There is currently **no way to get a file out** — no route sets `Content-Disposition`,
and no frontend code creates a Blob or `<a download>` (confirmed by grep across `server/*.ts` and
`frontend/*`). The built GDS layout (`.gds`/`.oas`) — the deliverable of the whole tool — can be
viewed but not saved locally. Users have to drop to the terminal/WSL to copy a file out.

## Goal

A VS Code Remote Development–style download: **right-click a file or folder in the Explorer →
"Download"**. A file downloads directly; a folder downloads as a ZIP. Works for every file type
in the tree (`.gds`, `.oas`, `.py`, `.json`, `.png`, …).

## Non-goals

- **Upload** (the reverse direction) — separate feature.
- **Multi-select** download — the menu acts on the single right-clicked node.
- **Editor/viewer-tab download button** — the Explorer context menu already covers GDS files;
  a redundant button is dropped (YAGNI).
- **Rename/delete/other context-menu actions** — the menu is built extensibly but ships with
  only "Download".
- **Resumable / ranged downloads** — files are local-sized; not needed.

## Approach

One server route, `GET /api/download?path=<…>`, that stats the resolved path and branches:
file → raw bytes with attachment headers; folder → streaming ZIP. The frontend adds a
right-click context menu to the Explorer tree whose single item triggers that route via a hidden
`<a download>`. Path safety reuses the existing `resolveWorkspacePath()` guard — no new security
surface.

ZIP via **`archiver`** (streaming, memory-safe, cross-platform), chosen over shell-out-to-`zip`
(no `zip` binary on native Windows) and `adm-zip` (loads everything into memory).

## Design

### Server — new `server/downloadRoutes.ts`

`GET /api/download?path=<workspace-relative or absolute>`:

1. `resolveWorkspacePath(path)` (reuse the chokepoint at `workspace.ts:103`) → throws on
   traversal → catch → `403`. No workspace set → throws a different error → `400`.
2. `fs.stat` the resolved path:
   - **missing** → `404`.
   - **file** → `fs.readFile` (no encoding → Buffer); set `Content-Type` by extension (small map:
     `gds`/`oas`/default → `application/octet-stream`, `png`→`image/png`, `json`→`application/json`,
     …); set `Content-Disposition: attachment; filename="<ascii-fallback>"; filename*=UTF-8''<percent-encoded basename>`
     (RFC 5987, so non-ASCII names survive); `reply.send(buffer)`.
   - **directory** → stream a ZIP: `archiver('zip')`, recurse the dir excluding `node_modules`,
     `.git`, `__pycache__`, and dotfiles (same visibility rules as the `/api/files` walk — you can
     only download what the tree shows); pipe into `reply.raw` so it streams without buffering;
     `Content-Type: application/zip`; `Content-Disposition: attachment; filename="<folder>.zip"`.
3. Registered in `server/index.ts` alongside the other route files.

### Frontend — `frontend/studio.ts`

- In `renderFileTree()` (`studio.ts:789`), attach a `contextmenu` listener to each rendered file
  **and** folder row (`event.preventDefault()`, position the menu at `pageX/pageY`).
- A small **context-menu** helper (absolute-positioned `<div>`, one `"Download"` item, click-away
  / Escape to dismiss). Built to be reused by future rename/delete actions.
- Download click → create a hidden `<a href="/api/download?path=<encodeURIComponent(node.path)>" download>`,
  click it, remove it. No `fetch`/Blob needed — the browser handles the save dialog from the
  attachment headers.
- Branching is automatic: `node.isFolder` → server zips; file → server streams bytes. No
  client-side branch needed.

### Edge cases

- **Empty folder** → ZIP with zero entries is valid; downloads an (empty) `.zip`.
- **Large folder / many GDS files** → archiver streams; memory stays flat. (No size cap in v1;
  the workspace is local.)
- **Binary `.gds`** → served as `application/octet-stream`; never utf-8-decoded.
- **Non-ASCII filenames** → RFC 5987 `filename*` percent-encoding (above).
- **Path traversal** (`../../etc/passwd`) → `resolveWorkspacePath` throws → `403`.
- **Symlink inside the workspace pointing outside** → pre-existing behavior of
  `resolveWorkspacePath` (it uses `path.relative`, no `realpath`); same exposure as today's
  `/files/*` read. Not a new risk; noted, not addressed here.
- **Path is the workspace root itself** → zips the whole workspace; allowed (matches "download folder").

## Testing

- **Manual (acceptance):** right-click a `.gds` → downloads the binary, opens in an external GDS
  viewer. Right-click a `.py` → downloads text. Right-click a folder → downloads `<name>.zip`,
  unzip, confirm contents and that `__pycache__`/`.git` are excluded. A non-ASCII filename
  downloads with the correct name.
- **Playwright e2e (new):** trigger the context-menu Download on a known fixture file; assert the
  response carries `Content-Disposition: attachment` with the expected filename (Playwright's
  download event).
- **Server unit (`tests/unit`):** the file-vs-folder branch; the guard rejects `../` with `403`;
  ZIP excludes `__pycache__`; missing path → `404`; no-workspace → `400`.

## Files touched (expected)

- `server/downloadRoutes.ts` — **new**; the route + archiver wiring.
- `server/index.ts` — register the route.
- `frontend/studio.ts` — `contextmenu` listener in `renderFileTree()` + context-menu helper +
  download trigger.
- `package.json` — add `archiver` (+ `@types/archiver` devDep).
- `tests/e2e/` + `tests/unit/` — new tests above.

## Decisions (resolved 2026-07-07)

1. **Folder → ZIP is in scope** (matches the VS Code Remote model the user asked for); single
   file → direct bytes.
2. **ZIP library: `archiver`** — streaming/cross-platform; rejected shell-out (no `zip` on
   Windows) and `adm-zip` (in-memory).
3. **One route branches on `stat`** (`GET /api/download?path=…`) rather than separate
   `/download/file` / `/download/folder` endpoints — single UI action, single endpoint.
4. **No viewer-tab download button** — Explorer context menu covers GDS; redundant button dropped.
5. **Exclusions** while zipping match `/api/files` visibility: `node_modules`, `.git`,
   `__pycache__`, dotfiles.
