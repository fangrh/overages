import test from 'node:test';
import assert from 'node:assert/strict';

import { applyAffineMatrix, fitAffineTransform, fitSimilarityTransform } from '../../lib/registration.js';

test('fitAffineTransform recovers scale and translation in GDS um', () => {
  const fit = fitAffineTransform([
    { imagePx: [0, 0], gdsUm: [10, -5], source: 'manual' },
    { imagePx: [10, 0], gdsUm: [30, -5], source: 'manual' },
    { imagePx: [0, 10], gdsUm: [10, 25], source: 'manual' },
    { imagePx: [10, 10], gdsUm: [30, 25], source: 'manual' },
  ]);

  assert.equal(fit.type, 'affine');
  assert.equal(fit.confidence, 'high');
  assert.deepEqual(fit.matrix.map((v) => Math.round(v * 1e9) / 1e9), [2, 0, 10, 0, 3, -5]);
  assert.deepEqual(applyAffineMatrix(fit.matrix, [4, 6]), [18, 13]);
  assert.equal(fit.pairCount, 4);
  assert.equal(fit.residualRmsUm, 0);
});

test('fitSimilarityTransform recovers rotation scale and translation', () => {
  const fit = fitSimilarityTransform([
    { imagePx: [0, 0], gdsUm: [5, -2], source: 'manual' },
    { imagePx: [10, 0], gdsUm: [5, 18], source: 'manual' },
    { imagePx: [0, 10], gdsUm: [-15, -2], source: 'manual' },
  ]);

  assert.equal(fit.type, 'similarity');
  assert.equal(fit.confidence, 'high');
  assert.deepEqual(applyAffineMatrix(fit.matrix, [3, 4]).map((v) => Math.round(v * 1e9) / 1e9), [-3, 4]);
});

test('fitAffineTransform rejects insufficient duplicate or collinear point sets', () => {
  assert.throws(() => fitAffineTransform([
    { imagePx: [0, 0], gdsUm: [0, 0], source: 'manual' },
    { imagePx: [1, 1], gdsUm: [1, 1], source: 'manual' },
  ]), /at least 3/i);

  assert.throws(() => fitAffineTransform([
    { imagePx: [0, 0], gdsUm: [0, 0], source: 'manual' },
    { imagePx: [0, 0], gdsUm: [1, 1], source: 'manual' },
    { imagePx: [1, 0], gdsUm: [2, 1], source: 'manual' },
  ]), /duplicate/i);

  assert.throws(() => fitAffineTransform([
    { imagePx: [0, 0], gdsUm: [0, 0], source: 'manual' },
    { imagePx: [1, 1], gdsUm: [1, 1], source: 'manual' },
    { imagePx: [2, 2], gdsUm: [2, 2], source: 'manual' },
  ]), /collinear/i);
});
