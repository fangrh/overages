#!/usr/bin/env python
"""
GDS to GeoJSON converter for superGDS Studio.

Reads a GDSII file using klayout and outputs a GeoJSON FeatureCollection
on stdout. Each polygon/path becomes a Feature with layer, datatype,
color, provenance, area, vertex count, and bounding box properties.

Called by lib/gdsParser.ts as: python python/parse_gds.py <gdsPath>
"""

import json
import os
import sys

# --- Color palette (Catppuccin Mocha-inspired) ---
DEFAULT_COLORS = {
    0: "#cdd6f4",   # Light
    1: "#89b4fa",   # Blue
    2: "#a6e3a1",   # Green
    3: "#f9e2af",   # Yellow
    4: "#fab387",   # Peach
    5: "#f38ba8",   # Red
    6: "#cba6f7",   # Mauve
    7: "#94e2d5",   # Teal
    8: "#f5c2e7",   # Pink
    9: "#89dceb",   # Sky
}
DEFAULT_COLOR = "#bac2de"

NM_TO_UM = 0.001  # klayout uses nanometers; viewer expects micrometers


def load_provenance(gds_path):
    """Load provenance sidecar JSON if it exists next to the GDS file.

    The sidecar is named <base>.provenance.json and contains entries
    keyed by 'id'. We build a dict mapping id -> entry for fast lookup.
    """
    base = gds_path
    for ext in (".gds", ".GDS", ".Gds"):
        if base.endswith(ext):
            base = base[: -len(ext)]
            break
    else:
        base = base.rstrip(".")
        if base == gds_path:
            base = gds_path + "_prov"

    prov_path = base + ".provenance.json"
    if not os.path.isfile(prov_path):
        return {}

    try:
        with open(prov_path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        print(f"[parse_gds] warning: cannot read provenance: {exc}", file=sys.stderr)
        return {}

    # The sidecar has { "version": N, "entries": [ { "id": N, ... }, ... ] }
    entries = data.get("entries", [])
    if isinstance(entries, list):
        return {str(e["id"]): e for e in entries if "id" in e}
    if isinstance(entries, dict):
        return entries
    return {}


def polygon_area_um2(coords):
    """Compute polygon area in um^2 using the shoelace formula.

    `coords` is a list of [x, y] pairs in micrometers (closed ring).
    """
    n = len(coords)
    if n < 3:
        return 0.0
    area = 0.0
    for i in range(n - 1):  # last == first, so n-1 iterations
        x0, y0 = coords[i]
        x1, y1 = coords[i + 1]
        area += x0 * y1 - x1 * y0
    return abs(area) / 2.0


def bbox_um(coords):
    """Return [xmin, ymin, xmax, ymax] in micrometers, or None if empty."""
    if not coords:
        return None
    xs = [c[0] for c in coords]
    ys = [c[1] for c in coords]
    return [min(xs), min(ys), max(xs), max(ys)]


def attach_provenance(feature, shape, provenance_map):
    """Look up provenance data from shape property 1002 and attach to feature."""
    prov_id = shape.property(1002)
    if prov_id is not None:
        prov_key = str(prov_id)
        if prov_key in provenance_map:
            feature["properties"]["provenance"] = provenance_map[prov_key]


def polygon_to_feature(polygon, layer_num, datatype, cell_name):
    """Convert a klayout SimplePolygon to a GeoJSON Feature dict.

    Returns None for degenerate polygons (fewer than 3 vertices).
    """
    pts = list(polygon.each_point())
    if len(pts) < 3:
        return None  # skip degenerate shapes

    # Convert nm -> um
    coords = [[p.x * NM_TO_UM, p.y * NM_TO_UM] for p in pts]
    # Close the ring if not already closed
    if coords[0] != coords[-1]:
        coords.append(coords[0][:])

    vertex_count = len(pts)
    area = polygon_area_um2(coords)
    bb = bbox_um(coords)
    color = DEFAULT_COLORS[layer_num % len(DEFAULT_COLORS)]

    props = {
        "layer": layer_num,
        "data_type": datatype,
        "color": color,
        "cell": cell_name,
        "area_um2": area,
        "vertex_count": vertex_count,
        "bbox": bb,
        "provenance": {},
    }

    return {
        "type": "Feature",
        "geometry": {
            "type": "Polygon",
            "coordinates": [coords],
        },
        "properties": props,
    }


def parse_gds(gds_path):
    """Parse a GDS file and return a GeoJSON FeatureCollection dict."""
    try:
        import klayout.db as kdb
    except ImportError:
        print(
            "Error: klayout Python module not found. "
            "Install with: pip install klayout",
            file=sys.stderr,
        )
        sys.exit(1)

    if not os.path.isfile(gds_path):
        print(f"Error: GDS file not found: {gds_path}", file=sys.stderr)
        sys.exit(1)

    provenance_map = load_provenance(gds_path)

    layout = kdb.Layout()
    layout.read(gds_path)

    features = []

    for cell in layout.each_cell():
        cell_name = cell.name
        for li in layout.layer_indices():
            layer_info = layout.get_info(li)
            layer_num = layer_info.layer
            datatype = layer_info.datatype

            shapes = cell.shapes(li)

            # Process simple polygons
            for shape in shapes.each(kdb.Shapes.SPolygons):
                feature = polygon_to_feature(
                    shape.simple_polygon, layer_num, datatype, cell_name,
                )
                if feature is None:
                    continue
                attach_provenance(feature, shape, provenance_map)
                features.append(feature)

            # Process paths (convert to polygon)
            for shape in shapes.each(kdb.Shapes.SPaths):
                feature = polygon_to_feature(
                    shape.path.polygon(), layer_num, datatype, cell_name,
                )
                if feature is None:
                    continue
                attach_provenance(feature, shape, provenance_map)
                features.append(feature)

    return {
        "type": "FeatureCollection",
        "features": features,
    }


def main():
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} <path_to_gds>", file=sys.stderr)
        sys.exit(1)

    gds_path = sys.argv[1]
    geojson = parse_gds(gds_path)

    # Only valid JSON goes to stdout; all diagnostics use stderr
    json.dump(geojson, sys.stdout, separators=(",", ":"))
    sys.stdout.write("\n")


if __name__ == "__main__":
    main()
