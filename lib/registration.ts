import type { Correspondence, RegistrationTransform } from './overlaySchemas.js';

export type RegistrationFitType = 'similarity' | 'affine';

function assertFinitePoint(point: [number, number], label: string): void {
  if (!Number.isFinite(point[0]) || !Number.isFinite(point[1])) {
    throw new Error(`${label} must contain finite coordinates`);
  }
}

function validateCorrespondences(correspondences: Correspondence[], minPairs: number): void {
  if (correspondences.length < minPairs) {
    throw new Error(`Registration requires at least ${minPairs} correspondences`);
  }

  const seen = new Set<string>();
  for (const pair of correspondences) {
    assertFinitePoint(pair.imagePx, 'imagePx');
    assertFinitePoint(pair.gdsUm, 'gdsUm');
    const key = `${pair.imagePx[0]},${pair.imagePx[1]}`;
    if (seen.has(key)) {
      throw new Error(`Registration contains duplicate image point ${key}`);
    }
    seen.add(key);
  }
}

function hasNonCollinearImageTriangle(correspondences: Correspondence[]): boolean {
  for (let i = 0; i < correspondences.length - 2; i += 1) {
    for (let j = i + 1; j < correspondences.length - 1; j += 1) {
      for (let k = j + 1; k < correspondences.length; k += 1) {
        const a = correspondences[i].imagePx;
        const b = correspondences[j].imagePx;
        const c = correspondences[k].imagePx;
        const area2 = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (Math.abs(area2) > 1e-9) return true;
      }
    }
  }
  return false;
}

function cleanNumber(value: number): number {
  if (Math.abs(value) < 1e-12) return 0;
  return Number.isFinite(value) ? value : value;
}

export function applyAffineMatrix(matrix: [number, number, number, number, number, number], point: [number, number]): [number, number] {
  const [a, b, c, d, e, f] = matrix;
  return [
    cleanNumber(a * point[0] + b * point[1] + c),
    cleanNumber(d * point[0] + e * point[1] + f),
  ];
}

export function invertAffineMatrix(matrix: [number, number, number, number, number, number]): [number, number, number, number, number, number] {
  const [a, b, c, d, e, f] = matrix;
  const det = a * e - b * d;
  if (Math.abs(det) < 1e-12) {
    throw new Error('Registration transform is not invertible');
  }
  return [
    cleanNumber(e / det),
    cleanNumber(-b / det),
    cleanNumber((b * f - e * c) / det),
    cleanNumber(-d / det),
    cleanNumber(a / det),
    cleanNumber((d * c - a * f) / det),
  ];
}

function solve3(normal: number[][], rhs: number[]): [number, number, number] {
  const matrix = normal.map((row, i) => [...row, rhs[i]]);
  for (let col = 0; col < 3; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < 3; row += 1) {
      if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) pivot = row;
    }
    if (Math.abs(matrix[pivot][col]) < 1e-12) {
      throw new Error('Registration image points are collinear');
    }
    if (pivot !== col) {
      const tmp = matrix[col];
      matrix[col] = matrix[pivot];
      matrix[pivot] = tmp;
    }
    const divisor = matrix[col][col];
    for (let cell = col; cell < 4; cell += 1) matrix[col][cell] /= divisor;
    for (let row = 0; row < 3; row += 1) {
      if (row === col) continue;
      const factor = matrix[row][col];
      for (let cell = col; cell < 4; cell += 1) matrix[row][cell] -= factor * matrix[col][cell];
    }
  }
  return [cleanNumber(matrix[0][3]), cleanNumber(matrix[1][3]), cleanNumber(matrix[2][3])];
}

function solveAffineParams(correspondences: Correspondence[], targetIndex: 0 | 1): [number, number, number] {
  const normal = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const rhs = [0, 0, 0];

  for (const pair of correspondences) {
    const row = [pair.imagePx[0], pair.imagePx[1], 1];
    const target = pair.gdsUm[targetIndex];
    for (let r = 0; r < 3; r += 1) {
      rhs[r] += row[r] * target;
      for (let c = 0; c < 3; c += 1) {
        normal[r][c] += row[r] * row[c];
      }
    }
  }

  return solve3(normal, rhs);
}

function residualsForMatrix(
  matrix: [number, number, number, number, number, number],
  correspondences: Correspondence[],
): { residualRmsUm: number; maxResidualUm: number } {
  let sumSq = 0;
  let maxResidualUm = 0;
  for (const pair of correspondences) {
    const predicted = applyAffineMatrix(matrix, pair.imagePx);
    const dx = predicted[0] - pair.gdsUm[0];
    const dy = predicted[1] - pair.gdsUm[1];
    const distance = Math.sqrt(dx * dx + dy * dy);
    sumSq += distance * distance;
    maxResidualUm = Math.max(maxResidualUm, distance);
  }
  return {
    residualRmsUm: cleanNumber(Math.sqrt(sumSq / correspondences.length)),
    maxResidualUm: cleanNumber(maxResidualUm),
  };
}

function confidenceForResiduals(residualRmsUm: number, maxResidualUm: number): 'high' | 'medium' | 'low' {
  if (residualRmsUm <= 2 && maxResidualUm <= 5) return 'high';
  if (residualRmsUm <= 10 && maxResidualUm <= 25) return 'medium';
  return 'low';
}

function resultForMatrix(
  type: RegistrationFitType,
  matrix: [number, number, number, number, number, number],
  correspondences: Correspondence[],
): RegistrationTransform {
  const residuals = residualsForMatrix(matrix, correspondences);
  return {
    type,
    matrix,
    inverseMatrix: invertAffineMatrix(matrix),
    residualRmsUm: residuals.residualRmsUm,
    maxResidualUm: residuals.maxResidualUm,
    pairCount: correspondences.length,
    confidence: confidenceForResiduals(residuals.residualRmsUm, residuals.maxResidualUm),
    correspondences,
  };
}

export function fitAffineTransform(correspondences: Correspondence[]): RegistrationTransform {
  validateCorrespondences(correspondences, 3);
  if (!hasNonCollinearImageTriangle(correspondences)) {
    throw new Error('Registration image points are collinear');
  }
  const [a, b, c] = solveAffineParams(correspondences, 0);
  const [d, e, f] = solveAffineParams(correspondences, 1);
  return resultForMatrix('affine', [a, b, c, d, e, f], correspondences);
}

export function fitSimilarityTransform(correspondences: Correspondence[]): RegistrationTransform {
  validateCorrespondences(correspondences, 2);

  const imageCentroid = correspondences.reduce<[number, number]>((acc, pair) => [
    acc[0] + pair.imagePx[0] / correspondences.length,
    acc[1] + pair.imagePx[1] / correspondences.length,
  ], [0, 0]);
  const gdsCentroid = correspondences.reduce<[number, number]>((acc, pair) => [
    acc[0] + pair.gdsUm[0] / correspondences.length,
    acc[1] + pair.gdsUm[1] / correspondences.length,
  ], [0, 0]);

  let dot = 0;
  let cross = 0;
  let denom = 0;
  for (const pair of correspondences) {
    const ix = pair.imagePx[0] - imageCentroid[0];
    const iy = pair.imagePx[1] - imageCentroid[1];
    const gx = pair.gdsUm[0] - gdsCentroid[0];
    const gy = pair.gdsUm[1] - gdsCentroid[1];
    dot += ix * gx + iy * gy;
    cross += ix * gy - iy * gx;
    denom += ix * ix + iy * iy;
  }
  if (Math.abs(denom) < 1e-12) {
    throw new Error('Registration contains duplicate image points');
  }

  const a = cleanNumber(dot / denom);
  const rotScaleY = cleanNumber(cross / denom);
  const tx = cleanNumber(gdsCentroid[0] - a * imageCentroid[0] + rotScaleY * imageCentroid[1]);
  const ty = cleanNumber(gdsCentroid[1] - rotScaleY * imageCentroid[0] - a * imageCentroid[1]);
  return resultForMatrix('similarity', [a, -rotScaleY, tx, rotScaleY, a, ty], correspondences);
}
