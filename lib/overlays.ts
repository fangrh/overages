import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

import {
  ImageOverlaySchema,
  type ImageOverlay,
  type OverlayPatch,
  normalizeOverlayPatch,
} from './overlaySchemas.js';

const OVERLAY_DIR = '.overgds-overlays';
const ASSET_DIR = 'assets';
const METADATA_DIR = 'metadata';

export interface CreateImageOverlayOptions {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

function toPosixPath(value: string): string {
  return value.split(path.sep).join('/');
}

function ensureInsideWorkspace(workspacePath: string, requestedPath: string): string {
  const workspace = path.resolve(workspacePath);
  const resolved = path.resolve(workspace, requestedPath);
  const relative = path.relative(workspace, resolved);
  const inside = relative === '' || (!!relative && !relative.startsWith('..') && !path.isAbsolute(relative));
  if (!inside) {
    throw new Error('Access denied: overlay path outside workspace');
  }
  return resolved;
}

function extensionForFile(fileName: string, mimeType: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (/^\.[a-z0-9]+$/.test(ext)) return ext;
  if (mimeType === 'image/png') return '.png';
  if (mimeType === 'image/jpeg') return '.jpg';
  if (mimeType === 'image/tiff') return '.tif';
  return '.img';
}

function overlayMetadataPath(workspacePath: string, overlayId: string): string {
  return ensureInsideWorkspace(workspacePath, path.join(OVERLAY_DIR, METADATA_DIR, `${overlayId}.json`));
}

function detectPngSize(buffer: Buffer): { widthPx: number; heightPx: number } | null {
  const signature = '89504e470d0a1a0a';
  if (buffer.length < 24 || buffer.subarray(0, 8).toString('hex') !== signature) return null;
  return {
    widthPx: buffer.readUInt32BE(16),
    heightPx: buffer.readUInt32BE(20),
  };
}

function detectJpegSize(buffer: Buffer): { widthPx: number; heightPx: number } | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) return null;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (length < 2) return null;
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) {
      return {
        heightPx: buffer.readUInt16BE(offset + 5),
        widthPx: buffer.readUInt16BE(offset + 7),
      };
    }
    offset += 2 + length;
  }
  return null;
}

export function detectImageSize(buffer: Buffer): { widthPx: number; heightPx: number } | null {
  return detectPngSize(buffer) ?? detectJpegSize(buffer);
}

export function resolveOverlayAssetPath(workspacePath: string, overlay: Pick<ImageOverlay, 'assetPath'>): string {
  return ensureInsideWorkspace(workspacePath, overlay.assetPath);
}

async function writeOverlay(workspacePath: string, overlay: ImageOverlay): Promise<ImageOverlay> {
  const parsed = ImageOverlaySchema.parse(overlay);
  const metadataPath = overlayMetadataPath(workspacePath, parsed.id);
  await fs.mkdir(path.dirname(metadataPath), { recursive: true });
  await fs.writeFile(metadataPath, JSON.stringify(parsed, null, 2), 'utf-8');
  return parsed;
}

export async function createImageOverlayFromBuffer(
  workspacePath: string,
  options: CreateImageOverlayOptions,
): Promise<ImageOverlay> {
  if (!options.mimeType.startsWith('image/')) {
    throw new Error(`Unsupported overlay MIME type: ${options.mimeType}`);
  }
  const id = `ov_${crypto.randomUUID().replace(/-/g, '')}`;
  const ext = extensionForFile(options.fileName, options.mimeType);
  const assetPath = toPosixPath(path.join(OVERLAY_DIR, ASSET_DIR, `${id}${ext}`));
  const absoluteAssetPath = resolveOverlayAssetPath(workspacePath, { assetPath });
  await fs.mkdir(path.dirname(absoluteAssetPath), { recursive: true });
  await fs.writeFile(absoluteAssetPath, options.buffer);

  const now = new Date().toISOString();
  return writeOverlay(workspacePath, {
    id,
    fileName: path.basename(options.fileName),
    assetPath,
    mimeType: options.mimeType,
    imageSize: detectImageSize(options.buffer),
    registeredAssetPath: null,
    registeredBoundsUm: null,
    registeredImageSize: null,
    opacity: 0.5,
    visible: true,
    transform: null,
    stale: { status: 'unknown', reasons: [] },
    createdAt: now,
    updatedAt: now,
  });
}

export async function loadImageOverlay(workspacePath: string, overlayId: string): Promise<ImageOverlay> {
  const raw = await fs.readFile(overlayMetadataPath(workspacePath, overlayId), 'utf-8');
  return ImageOverlaySchema.parse(JSON.parse(raw));
}

export async function listImageOverlays(workspacePath: string): Promise<ImageOverlay[]> {
  const dir = ensureInsideWorkspace(workspacePath, path.join(OVERLAY_DIR, METADATA_DIR));
  let entries: string[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return [];
  }
  const overlays = await Promise.all(
    entries
      .filter((entry) => entry.endsWith('.json'))
      .map((entry) => loadImageOverlay(workspacePath, path.basename(entry, '.json'))),
  );
  return overlays.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export async function patchImageOverlay(
  workspacePath: string,
  overlayId: string,
  patchInput: unknown,
): Promise<ImageOverlay> {
  const patch: OverlayPatch = normalizeOverlayPatch(patchInput);
  const existing = await loadImageOverlay(workspacePath, overlayId);
  let updatedAt = new Date();
  const previousUpdatedAt = new Date(existing.updatedAt);
  if (updatedAt <= previousUpdatedAt) {
    updatedAt = new Date(previousUpdatedAt.getTime() + 1);
  }
  return writeOverlay(workspacePath, {
    ...existing,
    ...patch,
    updatedAt: updatedAt.toISOString(),
  });
}
