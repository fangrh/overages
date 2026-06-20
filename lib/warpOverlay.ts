import { spawn } from 'child_process';
import path from 'path';

import type { ImageOverlay } from './overlaySchemas.js';
import { resolveOverlayAssetPath } from './overlays.js';
import { applyAffineMatrix } from './registration.js';

export interface RegisteredWarpResult {
  registeredAssetPath: string;
  registeredBoundsUm: [number, number, number, number];
  registeredImageSize: { widthPx: number; heightPx: number };
}

function clean(value: number): number {
  if (Math.abs(value) < 1e-12) return 0;
  return Math.round(value * 1e9) / 1e9;
}

export function registeredBoundsForOverlay(overlay: Pick<ImageOverlay, 'imageSize' | 'transform'>): [number, number, number, number] {
  if (!overlay.imageSize) {
    throw new Error('Overlay image size is unknown; cannot warp registered raster');
  }
  if (!overlay.transform) {
    throw new Error('Overlay has no registration transform');
  }

  const { widthPx, heightPx } = overlay.imageSize;
  const corners: Array<[number, number]> = [
    [0, 0],
    [widthPx, 0],
    [0, heightPx],
    [widthPx, heightPx],
  ];
  const mapped = corners.map((corner) => applyAffineMatrix(overlay.transform!.matrix, corner));
  const xs = mapped.map((point) => point[0]);
  const ys = mapped.map((point) => point[1]);
  return [
    clean(Math.min(...xs)),
    clean(Math.min(...ys)),
    clean(Math.max(...xs)),
    clean(Math.max(...ys)),
  ];
}

function runWarpPython(payload: unknown, pythonPath: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(pythonPath, ['python/warp_overlay.py'], {
      cwd: process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      proc.kill('SIGKILL');
      reject(new Error(`warp_overlay.py timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    proc.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(stderr.trim() || `warp_overlay.py failed with exit code ${code}`));
        return;
      }
      try {
        JSON.parse(stdout);
        resolve();
      } catch {
        reject(new Error('warp_overlay.py returned invalid JSON'));
      }
    });
    proc.stdin.end(JSON.stringify(payload));
  });
}

export async function warpOverlayToRegisteredAsset(
  workspacePath: string,
  overlay: ImageOverlay,
  options: { pythonPath?: string; timeoutMs?: number } = {},
): Promise<RegisteredWarpResult> {
  if (!overlay.transform) {
    throw new Error('Overlay has no registration transform');
  }
  if (!overlay.imageSize) {
    throw new Error('Overlay image size is unknown; cannot warp registered raster');
  }

  const registeredAssetPath = `.overgds-overlays/registered/${overlay.id}.png`;
  const outputPath = path.resolve(workspacePath, registeredAssetPath);
  const registeredBoundsUm = registeredBoundsForOverlay(overlay);
  const registeredImageSize = {
    widthPx: overlay.imageSize.widthPx,
    heightPx: overlay.imageSize.heightPx,
  };
  await runWarpPython({
    imagePath: resolveOverlayAssetPath(workspacePath, overlay),
    outputPath,
    matrix: overlay.transform.matrix,
    boundsUm: registeredBoundsUm,
    outputSizePx: [registeredImageSize.widthPx, registeredImageSize.heightPx],
  }, options.pythonPath || process.env.PYTHON || 'python3', options.timeoutMs ?? 30_000);

  return {
    registeredAssetPath,
    registeredBoundsUm,
    registeredImageSize,
  };
}
