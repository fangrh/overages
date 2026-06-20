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

## P2 — Microscopy contour roles and route suggestion
- **What:** Add typed microscopy contours (`target`, `keepout`, `reference`, `ignored`) and Manhattan route suggestion after registered image overlay ships.
- **Why:** The first microscopy slice deliberately stops at image import, manual registration, residual/confidence, and transparent overlay. Contour roles and route JSON are still the real microscope-to-route workflow, but they should build on a proven registration contract.
- **Pros:** Turns registered flake geometry into route-aware design intent and gives the agent editable Manhattan waypoints instead of asking it to infer geometry from pixels.
- **Cons:** Depends on real registration fixtures and adds contour extraction, routing heuristics, clearance handling, and agent handoff schema.
- **Effort:** M/L (human ~24 hours / CC ~3 hours).
- **Context:** `/plan-eng-review` on 2026-06-20 reduced the first implementation to the registration/overlay slice. Codex outside voice agreed that contours/routes should not remain in the first implementation plan.
- **Entry criteria:** At least two microscope/GDS fixtures register at medium-or-better confidence, bad-pair recovery works in the UI, and register+warp latency is recorded in the dogfood artifact before P2 route/contour work starts.
- **Depends on:** Microscopy overlay registration slice, saved transform/residual metadata, real fixture dogfood evidence.

## P3 — overGDS design token contract
- **What:** Create a small `DESIGN.md` or equivalent token contract for viewer/workbench UI: colors, typography, spacing, icon use, touch targets, status severity, and no-card layout rules.
- **Why:** `/plan-design-review` on 2026-06-20 found no design system file, so new viewer features risk copying ad hoc inline styles and turning the workbench into stacked controls.
- **Pros:** Gives future UI work a stable vocabulary and makes microscopy overlay controls feel like one CAD instrument instead of unrelated panels.
- **Cons:** Requires a short pass over existing viewer/studio styles and may expose cleanup work that should not block the current slice.
- **Effort:** S (human ~4 hours / CC ~30 minutes).
- **Context:** The microscopy overlay slice can ship with a local design contract, but a repo-level design file would prevent the same ambiguity in later contour and route UI.
- **Depends on:** None.

## P3 — WebGL rendering for large layouts
- **What:** Switch from GeoJSON features to Deck.gl or MapLibre GL JS for >100K polygon layouts.
- **Why:** OpenLayers with GeoJSON features degrades at scale. Real PIC layouts can exceed 100K polygons.
- **Pros:** Handles millions of polygons smoothly.
- **Cons:** Significant rewrite of viewer.html, breaks existing click/hover handlers.
- **Effort:** L (human ~40 hours / CC ~4 hours).
- **Context:** Design doc notes this as Phase 2 optimization. Current GeoJSON rendering works for typical gdsfactory output.
- **Depends on:** None.
