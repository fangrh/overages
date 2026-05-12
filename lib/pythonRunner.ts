import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';

export interface RunOptions {
  pythonFile: string;
  cwd: string;
  gdsOutputDir?: string;
  pythonPath?: string; // Optional specific Python path to use
}

export interface BuildResult {
  gdsPath: string;
  geojson: unknown;
  annotations: unknown[];
  mode: 'full' | 'partial';
}

export async function runPythonScript(
  opts: RunOptions,
  onStdout: (line: string) => void,
  onStderr: (line: string) => void
): Promise<BuildResult> {
  return new Promise((resolve, reject) => {
    // Run with GDS_PROVENANCE=1 to capture provenance data
    const env = { ...process.env, GDS_PROVENANCE: '1' };
    // Use selected Python path if provided, otherwise default to 'python'
    const pythonExecutable = opts.pythonPath || 'python';
    const python = spawn(pythonExecutable, [opts.pythonFile], {
      cwd: opts.cwd,
      env,
    });

    let stderrData = '';

    python.stdout.on('data', (data) => {
      const text = data.toString();
      for (const line of text.split('\n')) {
        if (line.trim()) onStdout(line);
      }
    });

    python.stderr.on('data', (data) => {
      const text = data.toString();
      stderrData += text;
      for (const line of text.split('\n')) {
        if (line.trim()) onStderr(line);
      }
    });

    python.on('close', async (code) => {
      if (code !== 0) {
        return reject(new Error(`Python exited ${code}: ${stderrData}`));
      }

      const gdsPath = await findGdsOutput(opts.cwd, opts.gdsOutputDir);
      if (!gdsPath) return reject(new Error('No .gds file found after build'));

      const { parseGdsFile } = await import('./gdsParser.js');
      const geojson = await parseGdsFile(gdsPath);

      // Check if provenance sidecar exists
      const sidecarPath = gdsPath.replace(/\.gds$/i, '.provenance.json');
      let mode: 'full' | 'partial' = 'partial';
      try {
        await fs.access(sidecarPath);
        mode = 'full';
      } catch {
        // No sidecar - provenance not captured
      }

      resolve({ gdsPath, geojson, annotations: [], mode });
    });
  });
}

async function findGdsOutput(cwd: string, outputDir?: string): Promise<string | null> {
  const dir = outputDir ? path.join(cwd, outputDir) : cwd;

  // Recursively find all .gds files
  async function findGdsRecursive(searchDir: string): Promise<string[]> {
    let results: string[] = [];
    try {
      const entries = await fs.readdir(searchDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(searchDir, entry.name);
        if (entry.isDirectory()) {
          results = results.concat(await findGdsRecursive(fullPath));
        } else if (entry.name.endsWith('.gds')) {
          results.push(fullPath);
        }
      }
    } catch { /* skip unreadable dirs */ }
    return results;
  }

  const gdsFiles = await findGdsRecursive(dir);
  if (gdsFiles.length === 0) return null;

  // Sort by mtime descending — return the most recently modified
  const withTimes = await Promise.all(
    gdsFiles.map(async (f) => ({
      f,
      mtime: (await fs.stat(f)).mtimeMs,
    }))
  );
  withTimes.sort((a, b) => b.mtime - a.mtime);
  return withTimes[0].f;
}
