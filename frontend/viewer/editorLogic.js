(function(global) {
  'use strict';

  function selectionOpFromEvent(event) {
    var e = event || {};
    if (e.altKey) return 'subtract';
    if ((e.ctrlKey || e.metaKey) && e.shiftKey) return 'subtract';
    if (e.ctrlKey || e.metaKey) return 'toggle';
    if (e.shiftKey) return 'add';
    return 'replace';
  }

  function pushUnique(target, item) {
    if (target.indexOf(item) === -1) target.push(item);
  }

  function applySelectionOperation(current, candidates, op) {
    var result = [];
    (current || []).forEach(function(item) { pushUnique(result, item); });
    var incoming = candidates || [];

    if (op === 'replace') {
      result = [];
      incoming.forEach(function(item) { pushUnique(result, item); });
      return result;
    }

    if (op === 'add') {
      incoming.forEach(function(item) { pushUnique(result, item); });
      return result;
    }

    if (op === 'toggle') {
      incoming.forEach(function(item) {
        var idx = result.indexOf(item);
        if (idx === -1) result.push(item);
        else result.splice(idx, 1);
      });
      return result;
    }

    if (op === 'subtract') {
      return result.filter(function(item) { return incoming.indexOf(item) === -1; });
    }

    return result;
  }

  function extentContains(container, candidate) {
    return container && candidate &&
      candidate[0] >= container[0] &&
      candidate[1] >= container[1] &&
      candidate[2] <= container[2] &&
      candidate[3] <= container[3];
  }

  function viewportActionForSelection(viewportExtent, selectionExtent) {
    if (!viewportExtent || !selectionExtent) return 'fit';
    return extentContains(viewportExtent, selectionExtent) ? 'preserve' : 'fit';
  }

  function shouldStartBoxSelect(state, event) {
    return Boolean(state && state.activeTool === 'select' && event && event.shiftKey);
  }

  function emptyClickCycleState() {
    return { candidateKey: '', pixel: null, index: -1 };
  }

  function candidateId(candidate, index) {
    if (candidate && candidate.__viewerCycleUid !== undefined && candidate.__viewerCycleUid !== null) return 'cycle:' + candidate.__viewerCycleUid;
    if (candidate && candidate.ol_uid !== undefined && candidate.ol_uid !== null) return 'ol:' + candidate.ol_uid;
    if (candidate && typeof candidate.getId === 'function') {
      var id = candidate.getId();
      if (id !== undefined && id !== null) return 'id:' + id;
    }
    return 'idx:' + index;
  }

  function candidateKey(candidates) {
    return (candidates || []).map(candidateId).join('|');
  }

  function nearPixel(a, b, tolerance) {
    if (!a || !b) return false;
    var dx = (a[0] || 0) - (b[0] || 0);
    var dy = (a[1] || 0) - (b[1] || 0);
    return Math.sqrt(dx * dx + dy * dy) <= tolerance;
  }

  function nextClickCycle(state, candidates, pixel) {
    var list = (candidates || []).filter(Boolean);
    if (list.length === 0) {
      return { state: emptyClickCycleState(), feature: null, index: -1, count: 0, isOverlap: false };
    }

    var currentState = state || emptyClickCycleState();
    var key = candidateKey(list);
    var sameHitArea = currentState.candidateKey === key && nearPixel(currentState.pixel, pixel, 6);
    var previousIndex = typeof currentState.index === 'number' ? currentState.index : -1;
    var nextIndex = sameHitArea ? (previousIndex + 1) % list.length : 0;

    return {
      state: {
        candidateKey: key,
        pixel: pixel ? [pixel[0], pixel[1]] : null,
        index: nextIndex
      },
      feature: list[nextIndex],
      index: nextIndex,
      count: list.length,
      isOverlap: list.length > 1
    };
  }

  function statusForEditorState(state) {
    var s = state || {};
    var selectedCount = s.selectedCount || 0;
    if (s.activeTool && s.activeTool !== 'select') {
      var label = s.activeTool.charAt(0).toUpperCase() + s.activeTool.slice(1);
      if (s.gestureState === 'drawing') return label + ': drawing, Esc cancels current sketch';
      return label + ': draw multiple shapes, Esc exits';
    }

    var op = s.selectionOp || 'replace';
    var opText = {
      replace: 'click replace',
      add: 'Shift add',
      toggle: 'Ctrl/Meta toggle',
      subtract: 'Alt subtract'
    }[op] || 'click replace';
    var suffix = selectedCount > 0 ? ' | ' + selectedCount + ' selected | Ctrl+A: same element -> all instances -> clear' : '';
    return 'Select: Shift-drag box selects, ' + opText + suffix;
  }

  global.ViewerEditorLogic = {
    selectionOpFromEvent: selectionOpFromEvent,
    applySelectionOperation: applySelectionOperation,
    emptyClickCycleState: emptyClickCycleState,
    nextClickCycle: nextClickCycle,
    viewportActionForSelection: viewportActionForSelection,
    shouldStartBoxSelect: shouldStartBoxSelect,
    statusForEditorState: statusForEditorState
  };
})(typeof window !== 'undefined' ? window : globalThis);
