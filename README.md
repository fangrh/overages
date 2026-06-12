# superGDS Studio

A visual editor for GDS layout generation with Python scripting.

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

**Fork details:** https://github.com/fangrh/gdsfactory (`feat/provenance-tracking` branch, tag `v9.41.0-prov.1`)
- Adds `ProvenanceTracker` class for per-shape source attribution
- Emits `.provenance.json` sidecar files when `GDS_PROVENANCE=1` is set
- Merges 3 files: `gdsfactory/provenance.py`, modified `gdsfactory/component.py`, `tests/test_provenance.py`

### Node.js

```bash
npm install
```

## Development

```bash
npm run dev
```

Open http://localhost:3000

## Running the Test Script

```bash
conda activate gds
cd tests/py
GDS_PROVENANCE=1 python suspended_superconductor_standalone.py
```

This generates `tests/py/gds/suspended_superconductor_standalone.gds` and its provenance sidecar.

## Python Environment Selection

The toolbar includes a Python environment selector dropdown. Select the `gds` conda environment to enable provenance tracking when running scripts. The `/api/parse` and `/api/run` endpoints accept a `pythonPath` parameter to specify which Python interpreter to use.

## Project Structure

```
python/parse_gds.py    — GDS → GeoJSON converter (called by lib/gdsParser.ts)
lib/gdsParser.ts       — Spawns parse_gds.py, returns GeoJSON
lib/pythonRunner.ts    — Runs user Python scripts with GDS_PROVENANCE=1
server/parseRoutes.ts  — /api/parse endpoint
server/runRoutes.ts    — /api/run endpoint
server/envRoutes.ts    — /api/python-environments endpoint
frontend/viewer/       — OpenLayers-based GDS viewer
frontend/studio.ts     — Monaco editor + UI
```

## References

- Overleaf: https://github.com/overleaf/overleaf
- gdsfactory: https://github.com/gdsfactory/gdsfactory
