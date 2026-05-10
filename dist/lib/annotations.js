import fs from 'fs/promises';
import path from 'path';
const ANNOTATIONS_DIR = '.supergds-annotations';
export async function loadAnnotations(pythonFile) {
    const jsonPath = getAnnotationPath(pythonFile);
    try {
        const data = await fs.readFile(jsonPath, 'utf-8');
        return JSON.parse(data);
    }
    catch {
        return [];
    }
}
export async function saveAnnotation(pythonFile, annotation) {
    const jsonPath = getAnnotationPath(pythonFile);
    const existing = await loadAnnotations(pythonFile);
    const updated = existing.filter((a) => a.jsonPath !== annotation.jsonPath);
    updated.push(annotation);
    const dir = path.dirname(jsonPath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(jsonPath, JSON.stringify(updated, null, 2));
}
export async function deleteAnnotation(pythonFile, jsonPath) {
    const p = getAnnotationPath(pythonFile);
    const existing = await loadAnnotations(pythonFile);
    const updated = existing.filter((a) => a.jsonPath !== jsonPath);
    await fs.writeFile(p, JSON.stringify(updated, null, 2));
}
function getAnnotationPath(pythonFile) {
    const baseDir = path.dirname(pythonFile);
    return path.join(baseDir, ANNOTATIONS_DIR, `${path.basename(pythonFile, '.py')}.json`);
}
