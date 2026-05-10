import fs from 'fs/promises';
import path from 'path';

const ANNOTATIONS_DIR = '.supergds-annotations';

export interface Annotation {
  jsonPath: string;
  shape: DrawnShapePayload;
  layer: string;
}

export interface DrawnShapePayload {
  geometry: { type: string; coordinates: number[] };
  layer: string;
}

export async function loadAnnotations(pythonFile: string): Promise<Annotation[]> {
  const jsonPath = getAnnotationPath(pythonFile);
  try {
    const data = await fs.readFile(jsonPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return [];
  }
}

export async function saveAnnotation(pythonFile: string, annotation: Annotation): Promise<void> {
  const jsonPath = getAnnotationPath(pythonFile);
  const existing = await loadAnnotations(pythonFile);
  const updated = existing.filter((a) => a.jsonPath !== annotation.jsonPath);
  updated.push(annotation);
  const dir = path.dirname(jsonPath);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(jsonPath, JSON.stringify(updated, null, 2));
}

export async function deleteAnnotation(pythonFile: string, jsonPath: string): Promise<void> {
  const p = getAnnotationPath(pythonFile);
  const existing = await loadAnnotations(pythonFile);
  const updated = existing.filter((a) => a.jsonPath !== jsonPath);
  await fs.writeFile(p, JSON.stringify(updated, null, 2));
}

function getAnnotationPath(pythonFile: string): string {
  const baseDir = path.dirname(pythonFile);
  return path.join(baseDir, ANNOTATIONS_DIR, `${path.basename(pythonFile, '.py')}.json`);
}