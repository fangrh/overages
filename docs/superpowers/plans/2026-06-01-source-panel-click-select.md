# Source Panel Click-to-Select Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user clicks a source line entry in the Source panel, the corresponding polygons in the GDS viewer should be selected (highlighted), establishing two-way interaction between source code and layout geometry.

**Architecture:** The viewer already sends provenance data (file, line, call_chain) when polygons are selected. We add the reverse: clicking a source entry in the terminal Source panel sends a `selectBySource` postMessage to the viewer iframe, which finds all features matching that file+line combination and selects them. This creates a bidirectional link: click polygon → see source, click source → see polygons.

**Tech Stack:** TypeScript, OpenLayers (viewer), postMessage (iframe communication), Monaco Editor decorations

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/iframeBridge.ts` | Modify | Store current components, add `selectBySource` message handler, send message to viewer |
| `frontend/viewer/viewer.html` | Modify | Add `selectBySource` message case to select features by file+line |
| `frontend/studio.ts` | Modify | Update `.source-jump` click handler to also trigger polygon selection |
| `frontend/studio.css` | Modify | Add visual feedback for active/selected source entries |

---

### Task 1: Store current components in IframeBridge

**Files:**
- Modify: `frontend/iframeBridge.ts`

The bridge currently discards component data after rendering the terminal panels. We need to keep the last `selectComponents` data so we can map source entries back to viewer features.

- [ ] **Step 1: Add `currentComponents` field and store components on select**

In `frontend/iframeBridge.ts`, add a private field and store data in the `selectComponents` handler:

```typescript
export class IframeBridge {
  private iframe: HTMLIFrameElement;
  private ready = false;
  private currentComponents: ComponentSelection[] = [];
  private pending: Array<{
    // ... existing fields
  }> = [];
```

In the `onMessage` method's `selectComponents` case, store the components:

```typescript
      case 'selectComponents':
        this.currentComponents = msg.components || [];
        this.updateTerminalPanels(msg.components);
        break;
```

- [ ] **Step 2: Build and test**

Run: `npm run build:frontend && npm run build`
Expected: Clean build with no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/iframeBridge.ts
git commit -m "feat(iframeBridge): store currentComponents for source-to-polygon mapping"
```

---

### Task 2: Add `selectBySource` handler in viewer

**Files:**
- Modify: `frontend/viewer/viewer.html`

Add a new message handler in the viewer that selects all features matching a given file path and line number. This requires iterating over `allFeatures` (the global array of all GeoJSON features loaded into the map) and matching their provenance data.

- [ ] **Step 1: Add the `selectBySource` message case**

In `frontend/viewer/viewer.html`, inside the `window.addEventListener('message', ...)` switch block (after the existing `case 'rebuildError':` around line 1727), add:

```javascript
        case 'selectBySource':
            // Select all features matching the given file and line
            (function() {
                var targetFile = (message.file || '').replace(/\\/g, '/');
                var targetLine = message.line;
                if (!targetFile || !targetLine) return;

                var matches = allFeatures.filter(function(f) {
                    var prov = f.get('provenance') || {};
                    var fFile = (prov.file || '').replace(/\\/g, '/');
                    // Compare filenames (basename) to handle absolute vs relative paths
                    var fBase = fFile.split('/').pop() || '';
                    var tBase = targetFile.split('/').pop() || '';
                    if (fBase !== tBase && fFile !== targetFile) return false;
                    var fLine = typeof prov.line === 'number' ? prov.line : parseInt(String(prov.line), 10);
                    return fLine === targetLine;
                });

                // Also check call_chain entries
                var chainMatches = allFeatures.filter(function(f) {
                    var prov = f.get('provenance') || {};
                    var chain = prov.call_chain || [];
                    return chain.some(function(cc) {
                        var ccFile = (cc.file || '').replace(/\\/g, '/');
                        var ccBase = ccFile.split('/').pop() || '';
                        var tBase = targetFile.split('/').pop() || '';
                        if (ccBase !== tBase && ccFile !== targetFile) return false;
                        var ccLine = typeof cc.line === 'number' ? cc.line : parseInt(String(cc.line), 10);
                        return ccLine === targetLine;
                    });
                });

                // Merge, deduplicate by ol_uid
                var seen = {};
                var all = [];
                matches.concat(chainMatches).forEach(function(f) {
                    if (!seen[f.ol_uid]) {
                        seen[f.ol_uid] = true;
                        all.push(f);
                    }
                });

                if (all.length > 0) {
                    replaceSelection(all);
                    // Fit view to show selected features
                    var extent = all[0].getGeometry().getExtent().slice(0);
                    for (var i = 1; i < all.length; i++) {
                        ol.extent.extend(extent, all[i].getGeometry().getExtent());
                    }
                    map.getView().fit(extent, { padding: [60, 60, 60, 60], duration: 300 });
                }
            })();
            break;
```

- [ ] **Step 2: Build and test**

Run: `npm run build:frontend && npm run build`
Expected: Clean build. The viewer is an HTML file loaded via iframe, not compiled by tsc.

- [ ] **Step 3: Commit**

```bash
git add frontend/viewer/viewer.html
git commit -m "feat(viewer): add selectBySource message handler to select polygons by file+line"
```

---

### Task 3: Wire Source panel clicks to polygon selection

**Files:**
- Modify: `frontend/studio.ts`
- Modify: `frontend/iframeBridge.ts`

When the user clicks a `.source-jump` element in the Source panel, we already jump to the line in Monaco. Now we also need to send a `selectBySource` message to the viewer iframe to highlight the corresponding polygons.

- [ ] **Step 1: Add `sendSelectBySource` method to IframeBridge**

In `frontend/iframeBridge.ts`, add a new public method:

```typescript
  sendSelectBySource(file: string, line: number): void {
    if (!this.ready) return;
    this.iframe.contentWindow?.postMessage({
      type: 'selectBySource',
      file,
      line,
    }, '*');
  }
```

- [ ] **Step 2: Update the studio.ts source-jump click handler**

In `frontend/studio.ts`, find the existing `.source-jump` click handler (around line 901-912) and add the polygon selection call:

```typescript
  // Source jump click handler — forward to iframeBridge which calls Monaco
  document.getElementById('terminal-source-panel')?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    if (!target.classList.contains('source-jump')) return;
    const file = target.getAttribute('data-file');
    const line = target.getAttribute('data-line');
    if (!file || !line) return;

    // Forward to iframeBridge via postMessage on the parent window (iframeBridge listens here)
    console.log('[studio] jumpToSource click:', file, line);
    window.postMessage({ type: 'jumpToSource', file, line: parseInt(line, 10) }, '*');

    // Also select corresponding polygons in the viewer
    const bridge = (window as any).bridge;
    if (bridge) {
      bridge.sendSelectBySource(file, parseInt(line, 10));
    }
  });
```

- [ ] **Step 3: Verify bridge is accessible from studio.ts**

Check that the `bridge` variable is already exposed on `window`. Look in `studio.ts` for where `IframeBridge` is instantiated. If it's stored as `(window as any).bridge`, we're good. If not, ensure it's exposed.

In `studio.ts`, find the line where the bridge is created (search for `new IframeBridge` or `new window.IframeBridge`). Verify it's assigned to `window.bridge` or find the actual variable name and use it in the click handler above.

- [ ] **Step 4: Build and test**

Run: `npm run build:frontend && npm run build`
Expected: Clean build with no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/studio.ts frontend/iframeBridge.ts
git commit -m "feat(studio): wire source panel clicks to also select polygons in viewer"
```

---

### Task 4: Add visual feedback for active source entries

**Files:**
- Modify: `frontend/studio.css`

When a source entry is clicked and its polygons are selected in the viewer, give visual feedback on the source entry itself.

- [ ] **Step 1: Add CSS for active source-jump state**

In `frontend/studio.css`, after the existing `.source-jump:hover` rule (around line 725), add:

```css
.source-jump.active {
  color: #a6e3a1 !important;
  font-weight: 600;
}
```

- [ ] **Step 2: Add toggle logic in studio.ts click handler**

Update the source-jump click handler in `frontend/studio.ts` to toggle the `.active` class:

```typescript
    // Also select corresponding polygons in the viewer
    const bridge = (window as any).bridge;
    if (bridge) {
      bridge.sendSelectBySource(file, parseInt(line, 10));

      // Toggle active visual state on source entries
      document.querySelectorAll('.source-jump.active').forEach(el => el.classList.remove('active'));
      target.classList.add('active');
    }
```

- [ ] **Step 3: Clear active state when polygons are selected from viewer**

In the `selectComponents` case in `iframeBridge.ts` `onMessage`, clear all active source-jump classes since the selection now comes from the viewer side:

```typescript
      case 'selectComponents':
        this.currentComponents = msg.components || [];
        // Clear active source-jump states (selection came from viewer, not source panel)
        document.querySelectorAll('.source-jump.active').forEach(el => el.classList.remove('active'));
        this.updateTerminalPanels(msg.components);
        break;
```

- [ ] **Step 4: Build and test**

Run: `npm run build:frontend && npm run build`
Expected: Clean build with no errors.

- [ ] **Step 5: Commit**

```bash
git add frontend/studio.css frontend/studio.ts frontend/iframeBridge.ts
git commit -m "feat(ui): add visual feedback for active source entries in Source panel"
```

---

### Task 5: End-to-end manual verification

**Files:** None (testing only)

- [ ] **Step 1: Start the app in dev mode**

Run: `npm run dev`

- [ ] **Step 2: Verify forward direction (polygon → source)**

1. Open http://localhost:3000
2. Open a Python file in Monaco that has generated a GDS file
3. Load the GDS file in the viewer
4. Click a polygon in the viewer
5. Verify: Source panel shows source entries with clickable `.source-jump` links

- [ ] **Step 3: Verify reverse direction (source → polygon)**

1. With polygons still loaded and source entries visible
2. Click a source entry in the Source panel
3. Verify: The corresponding polygons in the viewer get selected (highlighted)
4. Verify: The viewer zooms to fit the selected polygons
5. Verify: Monaco scrolls to the corresponding line and highlights it
6. Verify: The clicked source entry shows a green "active" state

- [ ] **Step 4: Verify call_chain matches**

1. Click a source entry that comes from a call_chain entry
2. Verify: Polygons whose provenance.call_chain includes that file+line are also selected

- [ ] **Step 5: Verify state cleanup**

1. Click a source entry (it turns green)
2. Now click a polygon directly in the viewer
3. Verify: The green active state on the source entry is cleared
4. Verify: The Source panel updates to show the new polygon's source

---

## Summary of Data Flow After Implementation

```
Click source entry in Source panel
  ↓
studio.ts: .source-jump click handler fires
  ↓ (two parallel actions)
  ├─→ window.postMessage({type: 'jumpToSource'}) → iframeBridge → Monaco scrolls & highlights
  └─→ bridge.sendSelectBySource(file, line) → viewer iframe
        ↓
      viewer.html: selectBySource handler
        ↓
      Filter allFeatures by file+line match (direct provenance + call_chain)
        ↓
      replaceSelection(matches)
        ↓
      Fit map view to selected features
```
