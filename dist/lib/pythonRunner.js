import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
export async function runPythonScript(opts, onStdout, onStderr) {
    return new Promise((resolve, reject) => {
        const python = spawn('python', [opts.pythonFile], {
            cwd: opts.cwd,
        });
        let stderrData = '';
        python.stdout.on('data', (data) => {
            const text = data.toString();
            for (const line of text.split('\n')) {
                if (line.trim())
                    onStdout(line);
            }
        });
        python.stderr.on('data', (data) => {
            const text = data.toString();
            stderrData += text;
            for (const line of text.split('\n')) {
                if (line.trim())
                    onStderr(line);
            }
        });
        python.on('close', async (code) => {
            if (code !== 0) {
                return reject(new Error(`Python exited ${code}: ${stderrData}`));
            }
            const gdsPath = await findGdsOutput(opts.cwd, opts.gdsOutputDir);
            if (!gdsPath)
                return reject(new Error('No .gds file found after build'));
            const { parseGdsFile } = await import('./gdsParser.js');
            const geojson = await parseGdsFile(gdsPath);
            resolve({ gdsPath, geojson, annotations: [], mode: 'full' });
        });
    });
}
async function findGdsOutput(cwd, outputDir) {
    const dir = outputDir ? path.join(cwd, outputDir) : cwd;
    try {
        const files = await fs.readdir(dir);
        const gdsFiles = files.filter((f) => f.endsWith('.gds'));
        if (gdsFiles.length === 0)
            return null;
        // Sort by mtime descending
        const withTimes = await Promise.all(gdsFiles.map(async (f) => ({
            f,
            mtime: (await fs.stat(path.join(dir, f))).mtimeMs,
        })));
        withTimes.sort((a, b) => b.mtime - a.mtime);
        return path.join(dir, withTimes[0].f);
    }
    catch {
        return null;
    }
}
