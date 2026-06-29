import { spawn } from 'child_process';
import path from 'path';

// Project root — npm scripts (dev/start) run from the overgds directory,
// consistent with server/index.ts. This keeps the app self-contained when
// cloned standalone (python/parse_gds.py ships inside this repo).
const PROJECT_ROOT = process.cwd();

export async function parseGdsFile(gdsPath: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const parseScript = path.join(PROJECT_ROOT, 'python/parse_gds.py');
    const proc = spawn('python', [parseScript, gdsPath], {
      cwd: PROJECT_ROOT,
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    proc.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr || `parse_gds.py failed ${code}`));
      try {
        resolve(JSON.parse(stdout));
      } catch {
        reject(new Error('parse_gds.py output invalid JSON'));
      }
    });
  });
}
