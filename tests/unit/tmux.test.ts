import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isTmuxAvailable, sessionName, hasSession, createSession, capturePane,
  killSession, listSessions, sweepStaleSessions, resizeWindow,
} from '../../lib/tmux.js';

// Unique prefix per test run so we never collide with real overgds- sessions.
const PREFIX = `overgds-test-${process.pid}-`;
const NAME = `${PREFIX}one`;
const CWD = process.cwd();

before(() => {
  sweepStaleSessions(PREFIX); // clean slate
});

after(() => {
  sweepStaleSessions(PREFIX); // don't leak test sessions
});

test('isTmuxAvailable is true in this environment', () => {
  assert.equal(isTmuxAvailable(), true);
});

test('sessionName namespaces the id', () => {
  assert.equal(sessionName('abc'), 'overgds-abc');
});

test('createSession + hasSession lifecycle', () => {
  assert.equal(hasSession(NAME), false);
  createSession(NAME, CWD, 80, 24);
  assert.equal(hasSession(NAME), true);
  killSession(NAME);
  assert.equal(hasSession(NAME), false);
});

test('capturePane returns a string for a live session', () => {
  createSession(NAME, CWD, 80, 24);
  const text = capturePane(NAME);
  assert.equal(typeof text, 'string');
  killSession(NAME);
});

test('listSessions includes our session', () => {
  createSession(NAME, CWD, 80, 24);
  const names = listSessions();
  assert.ok(names.includes(NAME), `expected ${NAME} in ${JSON.stringify(names)}`);
  killSession(NAME);
});

test('sweepStaleSessions kills only matching prefix and returns count', () => {
  createSession(NAME, CWD, 80, 24);
  const killed = sweepStaleSessions(PREFIX);
  assert.ok(killed >= 1, `expected at least 1 killed, got ${killed}`);
  assert.equal(hasSession(NAME), false);
});

test('resizeWindow does not throw on a live session', () => {
  const name = `${PREFIX}resize`;
  createSession(name, CWD, 80, 24);
  assert.doesNotThrow(() => resizeWindow(name, 100, 40));
  killSession(name);
});
