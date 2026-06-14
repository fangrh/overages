# superGDS Studio Environment Setup Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up the complete Python toolchain (conda environment, Klayout, forked gdsfactory with provenance tracking) and create the missing `python/parse_gds.py` script so superGDS Studio can generate, parse, and visualize GDS layouts end-to-end.

**Architecture:** The Node.js server calls Python scripts via `child_process.spawn`. Two critical Python scripts are needed: (1) user scripts that use gdsfactory to generate GDS files with provenance sidecars, and (2) `python/parse_gds.py` which converts GDS files to GeoJSON for the OpenLayers viewer. The forked gdsfactory (`fangrh/gdsfactory`, branch `feat/provenance-tracking`) adds a `ProvenanceTracker` that emits `.provenance.json` sidecar files when `GDS_PROVENANCE=1` is set.

**Tech Stack:** Python 3.13 (conda), gdsfactory v9.41.0 (forked), klayout 0.30.x (pip), kfactory 2.5.x (pip), Node.js/Fastify backend

---

## File Structure

| File | Status | Purpose |
|------|--------|---------|
| `python/parse_gds.py` | **Create** | GDS → GeoJSON converter, called by `lib/gdsParser.ts` |
| `requirements.txt` | **Create** | Python dependencies for the `gds` conda env |
| `tests/py/gds/` | **Exists** | Sample GDS output and provenance data |

---

### Task 1: Create the `gds` conda environment

**Files:**
- Create: (conda env, no project file)

- [ ] **Step 1: Create the conda environment with Python 3.13**

```bash
conda create -n gds python=3.13 -y
```

Expected output ends with:
```
#
# To activate this environment, use
#
#     $ conda activate gds
```

- [ ] **Step 2: Verify the environment was created**

```bash
conda env list | grep gds
```

Expected: `gds                     /home/photo/miniconda3/envs/gds`

- [ ] **Step 3: Commit (no files to commit — env is local)**

No commit needed for conda env creation.

---

### Task 2: Install Klayout Python bindings

**Files:**
- Modify: (conda env packages, no project file)

- [ ] **Step 1: Activate the environment and install klayout**

```bash
conda activate gds && pip install klayout==0.30.9
```

Expected: `Successfully installed klayout-0.30.9`

- [ ] **Step 2: Verify klayout import works**

```bash
conda activate gds && python -c "import klayout.db as kdb; print('klayout OK:', kdb.Layout().__class__.__name__)"
```

Expected: `klayout OK: Layout`

- [ ] **Step 3: No commit needed**

---

### Task 3: Install the forked gdsfactory with provenance tracking

**Files:**
- Modify: (conda env packages, no project file)

- [ ] **Step 1: Install the fork from GitHub (feat/provenance-tracking branch)**

```bash
conda activate gds && pip install "gdsfactory @ git+https://github.com/fangrh/gdsfactory@feat/provenance-tracking"
```

This pulls the provenance-tracking branch which includes `gdsfactory/provenance.py` and the modified `gdsfactory/component.py`. It also pulls all dependencies including `kfactory`, `numpy`, `scipy`, `shapely`, etc.

Expected: `Successfully installed gdsfactory-9.41.0 ...` (plus many dependencies)

> **Note:** This step takes 5-10 minutes due to many dependencies. If it fails with build errors for `kfactory`, ensure `klayout` is already installed (Task 2).

- [ ] **Step 2: Verify gdsfactory import and provenance module**

```bash
conda activate gds && python -c "
import gdsfactory as gf
from gdsfactory.provenance import ProvenanceTracker
print('gdsfactory version:', gf.__version__)
print('ProvenanceTracker available:', ProvenanceTracker is not None)
"
```

Expected:
```
gdsfactory version: 9.41.0
ProvenanceTracker available: True
```

- [ ] **Step 3: Verify the test script runs**

```bash
conda activate gds && cd /mnt/e/overages/tests/py && python suspended_superconductor_standalone.py
```

Expected output:
```
Generated: gds/suspended_superconductor_standalone.gds
  Bounding box: [-2500.0, -2500.0] -> [2500.0, 2500.0]
```

And the file `tests/py/gds/suspended_superconductor_standalone.gds` should be regenerated.

- [ ] **Step 4: No commit needed**

---

### Task 4: Create `requirements.txt` for reproducibility

**Files:**
- Create: `requirements.txt`

- [ ] **Step 1: Freeze current environment packages**

```bash
conda activate gds && pip freeze > /mnt/e/overages/requirements.txt
```

- [ ] **Step 2: Verify the file was created**

```bash
head -5 /mnt/e/overages/requirements.txt
```

Expected: Shows package list starting with lines like `attrs==...`

- [ ] **Step 3: Commit**

```bash
cd /mnt/e/overages && git add requirements.txt && git commit -m "chore: add requirements.txt for gds conda environment"
```

---

### Task 5: Create the `python/parse_gds.py` script

**Files:**
- Create: `python/parse_gds.py`

This is the critical missing piece. `lib/gdsParser.ts` spawns `python/parse_gds.py <gdsPath>` and expects GeoJSON on stdout. The viewer (`viewer.html`) reads features with these properties:
- `properties.layer` — GDS layer number (int)
- `properties.data_type` — GDS datatype (int)
- `properties.color` — hex color string for rendering
- `properties.provenance` — provenance dict (from sidecar `.provenance.json` if present)
- `properties.area_um2` — polygon area in µm²
- `properties.vertex_count` — number of vertices
- `properties.bbox` — bounding box `[xmin, ymin, xmax, ymax]`
- `geometry.type` — `"Polygon"`
- `geometry.coordinates` — `[[[x1,y1], [x2,y2], ...]]` in µm

- [ ] **Step 1: Create the `python/` directory**

```bash
mkdir -p /mnt/e/overages/python
```

- [ ] **Step 2: Write `python/parse_gds.py`**

```python
#!/usr/bin/env python3
"""parse_gds.py — Convert a GDS file to GeoJSON for superGDS Studio.

Usage:
    python parse_gds.py <path_to_gds_file>

Outputs a GeoJSON FeatureCollection to stdout. Each polygon in the GDS
becomes a Feature with properties (layer, data_type, color, provenance,
area_um2, vertex_count, bbox).

If a .provenance.json sidecar exists next to the GDS file, provenance
data is merged into features by PROV_ID property key (1002).
"""

import sys
import json
import os

try:
    import klayout.db as kdb
except ImportError:
    print("Error: klayout not installed. Run: pip install klayout", file=sys.stderr)
    sys.exit(1)


# Default layer color palette (layer_num -> hex color)
DEFAULT_COLORS = {
    0: "#cdd6f4",   # Light — boundary
    1: "#89b4fa",   # Blue — markers / outline
    2: "#a6e3a1",   # Green
    3: "#f9e2af",   # Yellow
    4: "#fab387",   # Peach
    5: "#f38ba8",   # Red — electrodes
    6: "#cba6f7",   # Mauve — pads
    7: "#94e2d5",   # Teal — holes
    8: "#f5c2e7",   # Pink
    9: "#89dceb",   # Sky
}

DEFAULT_COLOR = "#bac2de"


def _get_color(layer_num: int, datatype: int) -> str:
    """Return a display color for the given layer/datatype pair."""
    return DEFAULT_COLORS.get(layer_num, DEFAULT_COLOR)


def _load_provenance(gds_path: str) -> dict:
    """Load .provenance.json sidecar if it exists, keyed by prov_id."""
    sidecar = os.path.splitext(gds_path)[0] + ".provenance.json"
    if not os.path.exists(sidecar):
        return {}
    try:
        with open(sidecar, "r") as f:
            data = json.load(f)
        # The sidecar is a dict with entries keyed by prov_id
        # Return the whole dict so we can look up by prov_id
        if isinstance(data, dict):
            return data
        return {}
    except (json.JSONDecodeError, OSError):
        return {}


def _extract_prov_id(shape: "kdb.Shape") -> int | None:
    """Extract PROV_ID (property key 1002) from a shape's GDS properties."""
    prop = shape.property(1002)
    if prop is not None:
        try:
            return int(prop)
        except (ValueError, TypeError):
            return None
    return None


def _polygon_to_coords(polygon: "kdb.Polygon") -> list[list[list[float]]]:
    """Convert a klayout Polygon to GeoJSON coordinate ring format."""
    # klayout Polygon has points_hull or each_point_hull
    coords = []
    pts = polygon.each_point_hull()
    ring = []
    for pt in pts:
        ring.append([pt.x * 0.001, pt.y * 0.001])  # nm -> um
    if ring:
        # Close the ring (GeoJSON requires first == last point)
        ring.append(ring[0])
        coords.append(ring)
    return coords


def _simple_polygon_to_coords(polygon: "kdb.SimplePolygon") -> list[list[list[float]]]:
    """Convert a klayout SimplePolygon to GeoJSON coordinate ring format."""
    coords = []
    ring = []
    pts = polygon.each_point()
    for pt in pts:
        ring.append([pt.x * 0.001, pt.y * 0.001])  # nm -> um
    if ring:
        ring.append(ring[0])
        coords.append(ring)
    return coords


def _path_to_coords(path: "kdb.Path") -> list[list[list[float]]]:
    """Convert a klayout Path to a polygon outline (GeoJSON coordinates)."""
    # Convert path to polygon first
    poly = path.polygon()
    return _simple_polygon_to_coords(poly)


def parse_gds(gds_path: str) -> dict:
    """Parse a GDS file and return a GeoJSON FeatureCollection."""
    if not os.path.exists(gds_path):
        raise FileNotFoundError(f"GDS file not found: {gds_path}")

    prov_data = _load_provenance(gds_path)
    layout = kdb.Layout()
    layout.read(gds_path)

    features = []

    for cell in layout.each_cell():
        for li in layout.layer_indices():
            layer_info = layout.get_info(li)
            layer_num = layer_info.layer
            datatype = layer_info.datatype
            color = _get_color(layer_num, datatype)

            for shape in cell.shapes(li).each(kdb.Shapes.SPolygons | kdb.Shapes.SPgons):
                coords = _simple_polygon_to_coords(shape.simple_polygon)
                if not coords or not coords[0]:
                    continue

                # Calculate metadata
                points = coords[0][:-1]  # Exclude closing point for count
                vertex_count = len(points)
                xs = [p[0] for p in points]
                ys = [p[1] for p in points]
                bbox = [min(xs), min(ys), max(xs), max(ys)]

                # Shoelace formula for area
                area = 0.0
                for i in range(len(points)):
                    j = (i + 1) % len(points)
                    area += points[i][0] * points[j][1]
                    area -= points[j][0] * points[i][1]
                area = abs(area) / 2.0

                # Look up provenance
                prov_id = _extract_prov_id(shape)
                provenance = {}
                if prov_id is not None and prov_data:
                    prov_entry = prov_data.get(str(prov_id), prov_data.get(prov_id, {}))
                    if isinstance(prov_entry, dict):
                        provenance = prov_entry

                feature = {
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": coords,
                    },
                    "properties": {
                        "layer": layer_num,
                        "data_type": datatype,
                        "color": color,
                        "provenance": provenance,
                        "area_um2": area,
                        "vertex_count": vertex_count,
                        "bbox": bbox,
                        "cell": cell.name,
                    },
                }
                features.append(feature)

            for shape in cell.shapes(li).each(kdb.Shapes.SPaths):
                coords = _path_to_coords(shape.path)
                if not coords or not coords[0]:
                    continue

                points = coords[0][:-1]
                vertex_count = len(points)
                xs = [p[0] for p in points]
                ys = [p[1] for p in points]
                bbox = [min(xs), min(ys), max(xs), max(ys)]

                area = 0.0
                for i in range(len(points)):
                    j = (i + 1) % len(points)
                    area += points[i][0] * points[j][1]
                    area -= points[j][0] * points[i][1]
                area = abs(area) / 2.0

                prov_id = _extract_prov_id(shape)
                provenance = {}
                if prov_id is not None and prov_data:
                    prov_entry = prov_data.get(str(prov_id), prov_data.get(prov_id, {}))
                    if isinstance(prov_entry, dict):
                        provenance = prov_entry

                feature = {
                    "type": "Feature",
                    "geometry": {
                        "type": "Polygon",
                        "coordinates": coords,
                    },
                    "properties": {
                        "layer": layer_num,
                        "data_type": datatype,
                        "color": color,
                        "provenance": provenance,
                        "area_um2": area,
                        "vertex_count": vertex_count,
                        "bbox": bbox,
                        "cell": cell.name,
                    },
                }
                features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features,
    }


def main():
    if len(sys.argv) != 2:
        print("Usage: python parse_gds.py <gds_file>", file=sys.stderr)
        sys.exit(1)

    gds_path = sys.argv[1]
    try:
        geojson = parse_gds(gds_path)
    except Exception as e:
        print(f"Error parsing GDS: {e}", file=sys.stderr)
        sys.exit(1)

    print(json.dumps(geojson))


if __name__ == "__main__":
    main()
```

- [ ] **Step 3: Test parse_gds.py against the sample GDS file**

```bash
conda activate gds && python /mnt/e/overages/python/parse_gds.py /mnt/e/overages/tests/py/gds/suspended_superconductor_standalone.gds | python -c "import sys,json; d=json.load(sys.stdin); print(f'Type: {d[\"type\"]}'); print(f'Features: {len(d[\"features\"])}'); f=d['features'][0]; print(f'First feature layer: {f[\"properties\"][\"layer\"]}'); print(f'First feature geometry type: {f[\"geometry\"][\"type\"]}')"
```

Expected:
```
Type: FeatureCollection
Features: <N>
First feature layer: 1
First feature geometry type: Polygon
```

Where `<N>` is a positive number (the sample GDS has hundreds of polygons).

- [ ] **Step 4: Verify provenance merge works**

```bash
conda activate gds && python /mnt/e/overages/python/parse_gds.py /mnt/e/overages/tests/py/gds/suspended_superconductor_standalone.gds | python -c "import sys,json; d=json.load(sys.stdin); prov=[f for f in d['features'] if f['properties'].get('provenance')]; print(f'Features with provenance: {len(prov)}/{len(d[\"features\"])}')"
```

Expected: `Features with provenance: 0/<N>` (the existing GDS may not have provenance data embedded — that's OK, provenance will be populated when scripts are run with `GDS_PROVENANCE=1`).

- [ ] **Step 5: Commit**

```bash
cd /mnt/e/overages && git add python/parse_gds.py && git commit -m "feat: add python/parse_gds.py — GDS to GeoJSON converter for viewer"
```

---

### Task 6: End-to-end verification — run test script and parse the output

**Files:**
- No new files

- [ ] **Step 1: Run the test script with provenance enabled**

```bash
conda activate gds && cd /mnt/e/overages/tests/py && GDS_PROVENANCE=1 python suspended_superconductor_standalone.py
```

Expected:
```
Generated: gds/suspended_superconductor_standalone.gds
  Bounding box: [-2500.0, -2500.0] -> [2500.0, 2500.0]
```

- [ ] **Step 2: Check that provenance sidecar was generated**

```bash
ls -la /mnt/e/overages/tests/py/gds/suspended_superconductor_standalone.provenance.json
```

Expected: File exists with non-zero size.

- [ ] **Step 3: Parse the provenance-enabled GDS and verify provenance data**

```bash
conda activate gds && python /mnt/e/overages/python/parse_gds.py /mnt/e/overages/tests/py/gds/suspended_superconductor_standalone.gds | python -c "import sys,json; d=json.load(sys.stdin); prov=[f for f in d['features'] if f['properties'].get('provenance')]; print(f'Total features: {len(d[\"features\"])}'); print(f'Features with provenance: {len(prov)}'); print(f'Sample provenance keys: {list(prov[0][\"properties\"][\"provenance\"].keys())[:5] if prov else \"none\"}')"
```

Expected: Shows `Features with provenance: <N>` with N > 0, and provenance keys like `file`, `line`, `function`, etc.

- [ ] **Step 4: No commit needed**

---

### Task 7: Verify the Node.js dev server picks up the Python environment

**Files:**
- No new files

- [ ] **Step 1: Ensure Node.js dependencies are installed**

```bash
cd /mnt/e/overages && npm install
```

Expected: `added N packages in Xs` or `up to date`

- [ ] **Step 2: Start the dev server and check Python env detection**

```bash
cd /mnt/e/overages && npm run dev &
sleep 5
curl -s http://localhost:3000/api/python-environments | python3 -m json.tool | grep -E "name|path|isActive"
kill %1 2>/dev/null
```

Expected: Shows `gds` conda environment in the list:
```
"name": "gds",
"path": "/home/photo/miniconda3/envs/gds/bin/python",
"isActive": ...
```

- [ ] **Step 3: Test the parse endpoint**

```bash
cd /mnt/e/overages && npm run dev &
sleep 5
curl -s -X POST http://localhost:3000/api/parse -H "Content-Type: application/json" -d '{"gdsPath":"/mnt/e/overages/tests/py/gds/suspended_superconductor_standalone.gds"}' | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Mode: {d.get(\"mode\",\"N/A\")}'); print(f'Features: {len(d.get(\"geojson\",{}).get(\"features\",[]))}')" 
kill %1 2>/dev/null
```

Expected:
```
Mode: full
Features: <N>
```

Where `<N>` matches the feature count from Task 5.

- [ ] **Step 4: No commit needed**

---

### Task 8: Update README with setup instructions

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update README.md with the new setup instructions**

Replace the existing `## Dependencies` section and update the local path references to be platform-agnostic:

```markdown
## Dependencies

### Python Environment (gds conda env)

This project requires a conda environment with gdsfactory (fork with provenance tracking) and klayout.

**One-time setup:**
```bash
# 1. Create conda environment
conda create -n gds python=3.13 -y
conda activate gds

# 2. Install klayout (GDS parsing library)
pip install klayout==0.30.9

# 3. Install forked gdsfactory with provenance tracking
pip install "gdsfactory @ git+https://github.com/fangrh/gdsfactory@feat/provenance-tracking"

# 4. Verify installation
python -c "import gdsfactory as gf; from gdsfactory.provenance import ProvenanceTracker; print('OK')"
```

**Fork details:** https://github.com/fangrh/gdsfactory (`feat/provenance-tracking` branch)
- Adds `ProvenanceTracker` class for per-shape source attribution
- Emits `.provenance.json` sidecar files when `GDS_PROVENANCE=1` is set
- Tag: `v9.41.0-prov.1`

### Running the test script

```bash
conda activate gds
cd tests/py
GDS_PROVENANCE=1 python suspended_superconductor_standalone.py
```
```

- [ ] **Step 2: Commit**

```bash
cd /mnt/e/overages && git add README.md && git commit -m "docs: update README with conda env setup instructions"
```

---

## Summary

| Task | What | Time est. |
|------|------|-----------|
| 1 | Create `gds` conda env (Python 3.13) | 2 min |
| 2 | Install klayout Python bindings | 2 min |
| 3 | Install forked gdsfactory + dependencies | 5-10 min |
| 4 | Freeze `requirements.txt` | 1 min |
| 5 | Create `python/parse_gds.py` | 5 min |
| 6 | End-to-end verification | 3 min |
| 7 | Verify Node.js server integration | 3 min |
| 8 | Update README | 3 min |
| **Total** | | **~25-35 min** |
