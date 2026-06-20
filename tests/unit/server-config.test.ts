import test from 'node:test';
import assert from 'node:assert/strict';

import { getServerPort } from '../../server/config.js';

test('getServerPort defaults to 3000', () => {
  assert.equal(getServerPort({}), 3000);
});

test('getServerPort uses PORT when provided', () => {
  assert.equal(getServerPort({ PORT: '4173' }), 4173);
});
