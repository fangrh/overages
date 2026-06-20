import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tempRoots: string[] = [];

after(async () => {
  await Promise.all(tempRoots.map((root) => rm(root, { recursive: true, force: true })));
});

function tinyPngBuffer(): Buffer {
  return Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  );
}

test('warp_overlay.py writes a registered PNG and JSON metadata for an identity transform', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'overgds-warp-'));
  tempRoots.push(root);
  const inputPath = path.join(root, 'input.png');
  const outputPath = path.join(root, 'registered.png');
  await writeFile(inputPath, tinyPngBuffer());

  const request = {
    imagePath: inputPath,
    outputPath,
    matrix: [1, 0, 0, 0, 1, 0],
    boundsUm: [0, 0, 1, 1],
    outputSizePx: [1, 1],
  };

  const result = spawnSync(process.env.PYTHON || 'python3', ['python/warp_overlay.py'], {
    cwd: process.cwd(),
    input: JSON.stringify(request),
    encoding: 'utf-8',
  });

  assert.equal(result.status, 0, result.stderr);
  const response = JSON.parse(result.stdout);
  assert.equal(response.outputPath, outputPath);
  assert.deepEqual(response.sizePx, [1, 1]);
  assert.equal(fs.existsSync(outputPath), true);
});
