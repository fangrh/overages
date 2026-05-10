import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
// superGDS root is the parent of the overgds project directory
const SUPERGDS_ROOT = path.resolve(__dirname, '..');
export async function parseGdsFile(gdsPath) {
    return new Promise((resolve, reject) => {
        const parseScript = path.join(SUPERGDS_ROOT, 'python/parse_gds.py');
        const proc = spawn('python', [parseScript, gdsPath], {
            cwd: SUPERGDS_ROOT,
        });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => (stdout += d.toString()));
        proc.stderr.on('data', (d) => (stderr += d.toString()));
        proc.on('close', (code) => {
            if (code !== 0)
                return reject(new Error(stderr || `parse_gds.py failed ${code}`));
            try {
                resolve(JSON.parse(stdout));
            }
            catch {
                reject(new Error('parse_gds.py output invalid JSON'));
            }
        });
    });
}
