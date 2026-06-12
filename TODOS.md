# TODOs

## P2 — Layout diff view
- **What:** Side-by-side or overlay diff of GDS layouts after code changes.
- **Why:** Debugging layout changes is a core use case — "what did my edit change?"
- **Pros:** High-value debugging feature, differentiator vs KLayout.
- **Cons:** Requires storing previous layout state, diff algorithm for polygons.
- **Effort:** M (human ~20 hours / CC ~2 hours).
- **Context:** CEO plan explicitly deferred this. Depends on provenance debugger working first for accurate source attribution of diffs.
- **Depends on:** Provenance debugger (accepted scope).

## P2 — AI agent context layer
- **What:** Terminal-launched AI agent that knows what polygon is selected, what source code is open, and what the last build output was. "Ask agent about selection" button.
- **Why:** The 10x product — no tool does context-aware AI for chip layout. The shared state model (selected polygon + source span + terminal + errors) is the real asset.
- **Pros:** Unignorable product, true Overleaf-for-chip-design vision.
- **Cons:** Depends on provenance debugger working first. LLM integration adds complexity.
- **Effort:** XL (human ~80 hours / CC ~8 hours).
- **Context:** Codex cross-model review identified this as the strongest version of the product. CEO plan deferred it to keep scope manageable.
- **Depends on:** Provenance debugger (accepted scope), stable provenance data pipeline.

## P3 — WebGL rendering for large layouts
- **What:** Switch from GeoJSON features to Deck.gl or MapLibre GL JS for >100K polygon layouts.
- **Why:** OpenLayers with GeoJSON features degrades at scale. Real PIC layouts can exceed 100K polygons.
- **Pros:** Handles millions of polygons smoothly.
- **Cons:** Significant rewrite of viewer.html, breaks existing click/hover handlers.
- **Effort:** L (human ~40 hours / CC ~4 hours).
- **Context:** Design doc notes this as Phase 2 optimization. Current GeoJSON rendering works for typical gdsfactory output.
- **Depends on:** None.
