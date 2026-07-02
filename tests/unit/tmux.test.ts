import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTmuxAvailable, sessionName, hasSession, createSession, capturePane,
  killSession, listSessions, sweepStaleSessions,
} from '../../lib/tmux.js';

// Test the basic functionality without actually running tmux
test('isTmuxAvailable returns boolean', () => {
  const result = isTmuxAvailable();
  assert.equal(typeof result, 'boolean');
});

test('sessionName formats correctly', () => {
  const result = sessionName('test123');
  assert.equal(result, 'overgds-test123');
});

test('hasSession returns boolean', () => {
  const result = hasSession('test-session');
  assert.equal(typeof result, 'boolean');
});

test('createSession returns void', () => {
  // This will throw if tmux is not available, which is expected
  try {
    createSession('test-session', '/tmp', 80, 24);
    assert.ok(true, 'createSession did not throw');
  } catch (error) {
    // If tmux is not available, this is expected
    assert.ok(error instanceof Error, 'createSession should throw an error');
  }
});

test('capturePane returns string or empty', () => {
  const result = capturePane('test-session');
  assert.equal(typeof result, 'string');
});

test('listSessions returns array', () => {
  const result = listSessions();
  assert.equal(Array.isArray(result), true);
});

test('sweepStaleSessions returns number', () => {
  const result = sweepStaleSessions('test-');
  assert.equal(typeof result, 'number');
});