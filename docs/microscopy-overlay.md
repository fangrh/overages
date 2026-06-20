# Microscopy Overlay Registration

This is the P1 workflow for aligning a microscope image to the loaded GDS view.

## Quickstart

1. Install the normal project dependencies from `README.md`.
2. Install the Python image dependencies in the same environment used by overGDS:

```bash
pip install -r requirements.txt
```

3. Start the app:

```bash
npm run build:frontend
PORT=4173 node node_modules/tsx/dist/cli.mjs watch server/index.ts
```

4. Open `http://localhost:4173`, open a workspace, and load a marker GDS.
5. In the viewer rail, choose `Insert Image`.
6. Click a marker/reference point in the image preview, then click the matching point in the GDS map.
7. Add at least 2 pairs for similarity or 3 pairs for affine.
8. Click `Fit`.
9. Verify confidence, residuals, registered image bounds, and opacity before drawing electrodes or pads.

P1 only covers image import, correspondence picking, transform fitting, server-side raster warp, transparent overlay display, stale state, and dogfood evidence. Contours, route suggestion, and agent handoff are P2.

## Fixture Policy

Use synthetic fixtures for CI. Real microscope images may be kept local or stored under a private project artifact path if they expose lab data. When using a real fixture, record the dogfood artifact described in `docs/microscopy-overlay-dogfood.md`.

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|--------------|-----|
| Image import fails | Unsupported MIME type or corrupt image bytes | Re-export as PNG/JPEG/TIFF and retry `Insert Image`. |
| Image size is unknown | Server could not parse dimensions | Use PNG/JPEG for the first pass, or inspect the file with Pillow/tifffile. |
| Fit button is disabled | Not enough valid pairs | Add 2 pairs for similarity or 3 non-collinear pairs for affine. |
| Registration fails as duplicate | Two image points share the same pixel coordinate | Delete/recreate the bad correspondence. |
| Registration fails as collinear | Affine point set has no area | Pick markers spanning a triangle around the flake. |
| Low confidence | RMS or max residual exceeds P1 thresholds | Inspect residuals, remove bad pairs, then refit. Accept low confidence only for preview. |
| Warp timeout or Python error | Missing Pillow dependency or stuck image warp | Run `pip install -r requirements.txt`, then retry. Check server stderr for the Python message. |
| Overlay appears stale | GDS/image fingerprint changed after registration | Refit against the current GDS/image before trusted drawing. |

## Verification Commands

```bash
node --import tsx/esm --test tests/unit/*.test.ts tests/unit/*.test.mjs
node node_modules/typescript/bin/tsc --noEmit
npm run build:frontend
PORT=4173 node node_modules/@playwright/test/cli.js test tests/e2e/microscopy-overlay-ui.test.ts
```
