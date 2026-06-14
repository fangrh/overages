import path from 'path';
import os from 'os';
import fs from 'fs';
import { mkdir, writeFile } from 'fs/promises';
// Singleton workspace path — set once per server instance (one user per launch)
let workspacePath = null;
// In-memory file store for files sent via File System Access API
const fileStore = new Map();
const STATE_FILE = path.join(process.cwd(), '.supergds-state.json');
const RECENT_FILE = path.join(os.homedir(), '.supergds-recent.json');
const MAX_RECENT = 10;
// --- Recent workspaces management ---
function loadRecent() {
    try {
        const raw = fs.readFileSync(RECENT_FILE, 'utf-8');
        return JSON.parse(raw);
    }
    catch {
        return [];
    }
}
function saveRecent(entries) {
    fs.writeFileSync(RECENT_FILE, JSON.stringify(entries, null, 2), 'utf-8');
}
export function addRecentWorkspace(wsPath) {
    const entries = loadRecent();
    const name = path.basename(wsPath);
    const filtered = entries.filter(e => e.path !== wsPath);
    filtered.unshift({ path: wsPath, name, lastOpened: new Date().toISOString() });
    saveRecent(filtered.slice(0, MAX_RECENT));
}
export function getRecentWorkspaces() {
    const entries = loadRecent();
    // Filter out paths that no longer exist
    return entries.filter(e => {
        try {
            fs.accessSync(e.path);
            return true;
        }
        catch {
            return false;
        }
    });
}
export function removeRecentWorkspace(wsPath) {
    const entries = loadRecent().filter(e => e.path !== wsPath);
    saveRecent(entries);
}
// Synchronous initial load — blocks until state is read
try {
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');
    const state = JSON.parse(raw);
    if (state.workspacePath) {
        workspacePath = state.workspacePath;
        console.log('[workspace] restored workspace:', workspacePath);
        // Add restored workspace to recent list
        addRecentWorkspace(workspacePath);
    }
}
catch {
    // No state file yet — nothing to restore
}
async function saveState(state) {
    await writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}
export async function setWorkspacePath(p, currentFile) {
    workspacePath = p;
    await saveState({ workspacePath: p, currentFile: currentFile ?? null });
    addRecentWorkspace(p);
}
export function getWorkspacePath() {
    if (!workspacePath) {
        throw new Error('No workspace set. POST /workspace first.');
    }
    return workspacePath;
}
export function isWithinWorkspace(requestedPath) {
    const ws = getWorkspacePath();
    const resolved = path.resolve(ws, requestedPath);
    return resolved.startsWith(ws);
}
// Get file from store (for File System Access API files)
export function getStoredFile(filePath) {
    return fileStore.get(filePath);
}
// Check if using in-memory file store
export function hasFileStore() {
    return fileStore.size > 0;
}
// Store files from File System Access API
export async function storeFiles(files, workspaceName) {
    // Create a temp directory for these files
    const tempDir = path.join(os.tmpdir(), `supergds-${workspaceName}-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    // Write each file to the temp directory
    for (const file of files) {
        const fullPath = path.join(tempDir, file.path);
        await mkdir(path.dirname(fullPath), { recursive: true });
        await writeFile(fullPath, file.content, 'utf-8');
        // Also store in memory for quick access
        fileStore.set(file.path, fullPath);
    }
    // Set the temp directory as workspace
    workspacePath = tempDir;
}
