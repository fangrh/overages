import { spawn } from 'child_process';
import path from 'path';
export async function registerEnvRoutes(app) {
    app.get('/api/python-environments', async (req, reply) => {
        const envs = [];
        // Get current active Python
        const activePython = process.env.PYTHON_PATH || process.execPath.replace(/[/\\][^/\\]+$/, '').replace(/[/\\]node$/, 'python3').replace(/[/\\]node.exe$/, 'python.exe');
        // Try conda first
        try {
            const condaResult = await runCommand('conda', ['env', 'list', '--json']);
            const condaData = JSON.parse(condaResult);
            for (const envInfo of condaData.envs || []) {
                const envName = path.basename(envInfo);
                const pythonPath = path.join(envInfo, 'bin', 'python');
                // On Windows, use Scripts\python.exe
                const pythonPathWin = path.join(envInfo, 'Scripts', 'python.exe');
                const resolvedPath = await resolvePythonPath(pythonPath, pythonPathWin, envInfo);
                if (resolvedPath) {
                    envs.push({
                        name: envName,
                        path: resolvedPath,
                        isActive: envName === 'base' || envName === 'Python 3.12',
                    });
                }
            }
        }
        catch {
            // Conda not available
        }
        // Also get system python
        const systemPython = await findSystemPython();
        if (systemPython && !envs.find(e => e.path === systemPython)) {
            envs.push({
                name: 'System Python',
                path: systemPython,
                isActive: envs.length === 0,
            });
        }
        // If no envs found, provide a default
        if (envs.length === 0) {
            envs.push({
                name: 'Python',
                path: 'python',
                isActive: true,
            });
        }
        // Mark the currently active one
        const currentPython = findCurrentPython();
        for (const env of envs) {
            env.isActive = env.path === currentPython || env.name === 'base' || env.name === 'Python 3.12';
        }
        return reply.send({ environments: envs });
    });
    app.post('/api/python-environments/select', async (req, reply) => {
        const { path: pythonPath } = req.body;
        // Store in memory (in production, would use session or persistent storage)
        process.env.SELECTED_PYTHON_PATH = pythonPath;
        return reply.send({ success: true, path: pythonPath });
    });
}
function findCurrentPython() {
    // Check for selected python first
    const selected = process.env.SELECTED_PYTHON_PATH;
    if (selected)
        return selected;
    // Try to find from conda
    try {
        const result = runCommandSync('conda', ['info', '--base']);
        const baseEnv = result.trim();
        return path.join(baseEnv, 'bin', 'python');
    }
    catch {
        return 'python';
    }
}
async function resolvePythonPath(unixPath, winPath, envPath) {
    const fs = await import('fs/promises');
    try {
        await fs.access(unixPath);
        return unixPath;
    }
    catch {
        try {
            await fs.access(winPath);
            return winPath;
        }
        catch {
            // Try python.exe directly in env
            try {
                const pythonExe = path.join(envPath, 'python.exe');
                await fs.access(pythonExe);
                return pythonExe;
            }
            catch {
                // Try python directly
                try {
                    const pythonBin = path.join(envPath, 'bin', 'python');
                    await fs.access(pythonBin);
                    return pythonBin;
                }
                catch {
                    return null;
                }
            }
        }
    }
}
async function findSystemPython() {
    const fs = await import('fs/promises');
    const possibles = ['python3', 'python', '/usr/bin/python3', '/usr/local/bin/python3'];
    for (const p of possibles) {
        try {
            await fs.access(p);
            return p;
        }
        catch {
            continue;
        }
    }
    return null;
}
function runCommand(cmd, args) {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { shell: true });
        let stdout = '';
        let stderr = '';
        proc.stdout.on('data', (d) => { stdout += d.toString(); });
        proc.stderr.on('data', (d) => { stderr += d.toString(); });
        proc.on('close', (code) => {
            if (code === 0)
                resolve(stdout);
            else
                reject(new Error(stderr || `Exit code ${code}`));
        });
        proc.on('error', (err) => reject(err));
    });
}
function runCommandSync(cmd, args) {
    const { execSync } = require('child_process');
    return execSync(`${cmd} ${args.join(' ')}`, { encoding: 'utf8' });
}
