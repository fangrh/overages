# superGDS Studio

A visual editor for GDS layout generation with Python scripting.

## Dependencies

### gdsfactory (Fork with Provenance Tracking)

This project uses a custom fork of gdsfactory that adds provenance tracking capabilities:

**Fork URL:** https://github.com/fangrh/gdsfactory

**Local fork location:** `/Users/fangruihuan/Desktop/aalto/superGDS/gdsfactory`

The fork includes:
- `ProvenanceTracker` class for tracking component origins
- GDS_PROVENANCE=1 environment variable support
- Sidecar `.provenance.json` file generation

To install the fork locally:
```bash
cd /Users/fangruihuan/Desktop/aalto/superGDS/gdsfactory
pip install -e .
```

## Development

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Python Environment Selection

The toolbar includes a Python environment selector dropdown. Select the conda environment that has gdsfactory installed (e.g., the `gds` environment) to enable provenance tracking when running scripts.

## References

- Overleaf: https://github.com/overleaf/overleaf