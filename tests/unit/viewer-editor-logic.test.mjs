import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';

async function loadLogic() {
  const source = await readFile(new URL('../../frontend/viewer/editorLogic.js', import.meta.url), 'utf8');
  const sandbox = { console };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox);
  return sandbox.ViewerEditorLogic;
}

test('derives selection operation from the pointer event that caused the selection', async () => {
  const logic = await loadLogic();

  assert.equal(logic.selectionOpFromEvent({}), 'replace');
  assert.equal(logic.selectionOpFromEvent({ shiftKey: true }), 'add');
  assert.equal(logic.selectionOpFromEvent({ ctrlKey: true }), 'toggle');
  assert.equal(logic.selectionOpFromEvent({ metaKey: true }), 'toggle');
  assert.equal(logic.selectionOpFromEvent({ altKey: true }), 'subtract');
  assert.equal(logic.selectionOpFromEvent({ ctrlKey: true, shiftKey: true }), 'subtract');
});

test('applies replace add toggle and subtract selection operations without mutating inputs', async () => {
  const logic = await loadLogic();
  const current = ['a', 'b'];
  const candidates = ['b', 'c'];

  assert.deepEqual([...logic.applySelectionOperation(current, candidates, 'replace')], ['b', 'c']);
  assert.deepEqual([...logic.applySelectionOperation(current, candidates, 'add')], ['a', 'b', 'c']);
  assert.deepEqual([...logic.applySelectionOperation(current, candidates, 'toggle')], ['a', 'c']);
  assert.deepEqual([...logic.applySelectionOperation(current, candidates, 'subtract')], ['a']);
  assert.deepEqual(current, ['a', 'b']);
  assert.deepEqual(candidates, ['b', 'c']);
});

test('reports whether source selection should preserve zoom or fit selection', async () => {
  const logic = await loadLogic();
  const viewport = [0, 0, 100, 100];

  assert.equal(logic.viewportActionForSelection(viewport, [10, 10, 20, 20]), 'preserve');
  assert.equal(logic.viewportActionForSelection(viewport, [-10, 10, 20, 20]), 'fit');
  assert.equal(logic.viewportActionForSelection(viewport, [10, 10, 120, 20]), 'fit');
});

test('builds stable status text for tool and modifier state', async () => {
  const logic = await loadLogic();

  assert.match(logic.statusForEditorState({ activeTool: 'rectangle', gestureState: 'idle' }), /draw multiple shapes/i);
  assert.match(logic.statusForEditorState({ activeTool: 'select', selectionOp: 'toggle', selectedCount: 2 }), /Ctrl\/Meta toggle/i);
  assert.match(logic.statusForEditorState({ activeTool: 'select', selectionOp: 'subtract', selectedCount: 1 }), /subtract/i);
});

test('cycles through the same overlapping click candidates and resets on a new hit area', async () => {
  const logic = await loadLogic();
  const a = { ol_uid: 'a' };
  const b = { ol_uid: 'b' };

  const first = logic.nextClickCycle(null, [a, b], [100, 100]);
  assert.equal(first.feature, a);
  assert.equal(first.index, 0);
  assert.equal(first.count, 2);

  const second = logic.nextClickCycle(first.state, [a, b], [102, 101]);
  assert.equal(second.feature, b);
  assert.equal(second.index, 1);
  assert.equal(second.count, 2);

  const reset = logic.nextClickCycle(second.state, [a, b], [140, 140]);
  assert.equal(reset.feature, a);
  assert.equal(reset.index, 0);
});
