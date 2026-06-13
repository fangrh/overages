# gdsfactory fork patches

Patches for the **provenance-enabled gdsfactory fork** (installed in the `gds`
conda env). These fix gaps where geometry built through certain code paths was
not captured by provenance tracking, so it got no `PROV_ID` and no
`.provenance.json` sidecar — i.e. the overGDS viewer showed "no source
attribution" for those polygons.

## gdsfactory-boolean-provenance.patch

**Symptom:** scripts that build geometry with `gf.boolean(...)` produced a GDS
with **no provenance**, even with the `gds` env selected and `GDS_PROVENANCE=1`
set. The fork only attached provenance in `Component.add_polygon()`, but
`gf.boolean` inserted its result polygons via the low-level
`c.shapes(layer).insert(region)` call, bypassing the tracker entirely. With no
tracked entries, `Component.write_gds` skipped the sidecar.

**Fix:** route the boolean result region through the provenance tracker
(mirroring `add_polygon`) — insert each polygon individually and tag it with a
`PROV_ID` (property 1002). `capture()` walks the stack past gdsfactory frames,
so the result is attributed to the user's `gf.boolean(...)` call site.

### Apply / re-apply

The fork lives in the `gds` conda env's site-packages. From that package's
root:

```bash
GDS_SITE=$(/home/photo/miniconda3/envs/gds/bin/python -c "import gdsfactory, os; print(os.path.dirname(gdsfactory.__file__))")
cd "$(dirname "$GDS_SITE")"   # …/site-packages
patch -p1 < /mnt/e/overages/patches/gdsfactory-boolean-provenance.patch
```

(Re-run after any `pip install` / reinstall of the fork, which overwrites
`boolean.py`.)
