import path from 'path';
// Singleton workspace path — set once per server instance (one user per launch)
let workspacePath = null;
export function setWorkspacePath(p) {
    workspacePath = p;
}
export function getWorkspacePath() {
    if (!workspacePath) {
        throw new Error('No workspace set. POST /api/workspace first.');
    }
    return workspacePath;
}
export function isWithinWorkspace(requestedPath) {
    const ws = getWorkspacePath();
    const resolved = path.resolve(ws, requestedPath);
    return resolved.startsWith(ws);
}
