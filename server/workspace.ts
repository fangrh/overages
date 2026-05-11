import path from 'path';
import os from 'os';
import fs from 'fs/promises';

// Singleton workspace path — set once per server instance (one user per launch)
let workspacePath: string | null = null;
// In-memory file store for files sent via File System Access API
const fileStore: Map<string, string> = new Map();

const STATE_FILE = path.join(process.cwd(), '.supergds-state.json');

interface WorkspaceState {
  workspacePath: string | null;
  currentFile: string | null;
}

async function loadState(): Promise<WorkspaceState> {
  try {
    const raw = await fs.readFile(STATE_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { workspacePath: null, currentFile: null };
  }
}

async function saveState(state: WorkspaceState): Promise<void> {
  await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

// Load persisted state on startup
loadState().then(state => {
  if (state.workspacePath) {
    workspacePath = state.workspacePath;
    console.log('[workspace] restored workspace:', workspacePath);
  }
}).catch(() => {});

export async function setWorkspacePath(p: string, currentFile?: string | null): Promise<void> {
  workspacePath = p;
  await saveState({ workspacePath: p, currentFile: currentFile ?? null });
}

export function getWorkspacePath(): string {
  if (!workspacePath) {
    throw new Error('No workspace set. POST /workspace first.');
  }
  return workspacePath;
}

export function isWithinWorkspace(requestedPath: string): boolean {
  const ws = getWorkspacePath();
  const resolved = path.resolve(ws, requestedPath);
  return resolved.startsWith(ws);
}

// Get file from store (for File System Access API files)
export function getStoredFile(filePath: string): string | undefined {
  return fileStore.get(filePath);
}

// Check if using in-memory file store
export function hasFileStore(): boolean {
  return fileStore.size > 0;
}

// Store files from File System Access API
export async function storeFiles(
  files: Array<{ path: string; content: string }>,
  workspaceName: string
): Promise<void> {
  // Create a temp directory for these files
  const tempDir = path.join(os.tmpdir(), `supergds-${workspaceName}-${Date.now()}`);
  await fs.mkdir(tempDir, { recursive: true });

  // Write each file to the temp directory
  for (const file of files) {
    const fullPath = path.join(tempDir, file.path);
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, file.content, 'utf-8');
    // Also store in memory for quick access
    fileStore.set(file.path, fullPath);
  }

  // Set the temp directory as workspace
  workspacePath = tempDir;
}
