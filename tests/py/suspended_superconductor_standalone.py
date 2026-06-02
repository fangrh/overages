#!/usr/bin/env python3
"""
suspended_superconductor_standalone.py
=======================================
Self-contained GDS generator for the suspended superconductor chip10 design.

Run directly:
    python suspended_superconductor_standalone.py

Dependencies:
    pip install gdsfactory

This single script replaces the gdsbuild pipeline (TOML config + generate_single.py
+ markers + electrodes + pads + holes + routing modules). All parameters are
hardcoded to match config/suspended_superconductor.toml.
"""

import os
import math
import gdsfactory as gf
from gdsfactory.component import Component

try:
    gf.gpdk.PDK.activate()
except AttributeError:
    pass


# ═══════════════════════════════════════════════════════════════════════════════
# Design Parameters (from config/suspended_superconductor.toml)
# ═══════════════════════════════════════════════════════════════════════════════

CHIP_X = 5000.0          # Chip width (um)
CHIP_Y = 5000.0          # Chip height (um)
STEP = 200.0             # Marker spacing
ROW_NUM = 10             # Markers per row
COL_NUM = 10             # Markers per column
BOUNDARY = 1.0           # Outline width
DATE = "20251114"
DATE_SIZE = 50.0
DATE_POSITION = (-20.0, 1800.0)
MARKER_SIZE = 20.0
TEXT_SIZE = 10.0

CORNER_MARKER_POS = [(1500, 1500)]
CORNER_MARKER_NO_CROSS = [(1200, 1200)]
DOUBLE_L_POS = [(1900, 1900)]

ELECTRODE_CONFIGS = [
    {"name": "Electrode_1", "x": 0, "y": 0,    "width": 2, "length": 250, "number": 8, "gap": 5, "layer": 5, "anchor": 3.5},
    {"name": "Electrode_2", "x": 0, "y": -300, "width": 2, "length": 250, "number": 8, "gap": 4, "layer": 5, "anchor": 3.5},
    {"name": "Electrode_3", "x": 0, "y": -600, "width": 2, "length": 250, "number": 8, "gap": 3, "layer": 5, "anchor": 3.5},
]

PAD_CONFIGS = [
    {"name": "Pad_Left",  "x": -1800, "y": 0, "size": (400, 400), "number": 1, "gapx": 0, "gapy": 200, "rows": 4, "layer": (6, 0), "anchor": 0, "port_width": 25},
    {"name": "Pad_Right", "x":  1800, "y": 0, "size": (400, 400), "number": 1, "gapx": 0, "gapy": 200, "rows": 4, "layer": (6, 0), "anchor": 0, "port_width": 25},
]

ELECTRODE_ROUTES = [
    {"source": "Electrode_3", "target": "Electrode_2", "source_port": "o1", "target_port": "o2",
     "width": 2.0, "layer": 5, "start_straight": [8, 16, 24, 32, 32, 24, 16, 8], "end_straight": 8.0},
    {"source": "Electrode_2", "target": "Electrode_1", "source_port": "o1", "target_port": "o2",
     "width": 2.0, "layer": 5, "start_straight": [8, 16, 24, 32, 32, 24, 16, 8], "end_straight": 8.0},
]

ROUTE_PATHS = [
    {"source": "Pad_Right_3.e1", "target": "Electrode_1_4.o1",
     "path_spec": [(50, 6, 0), [(1300, 900), (1300, 600), (300, 600)], (2, 5, 0)], "taper": 20.0},
    {"source": "Pad_Right_2.e1", "target": "Electrode_1_5.o1",
     "path_spec": [(50, 6, 0), [(1300, 300), (1300, 400), (300, 400)], (2, 5, 0)], "taper": 20.0},
    {"source": "Pad_Right_1.e1", "target": "Electrode_1_6.o1",
     "path_spec": [(50, 6, 0), [(1300, -300), (1300, -200), (800, -200), (800, 200), (300, 200)], (2, 5, 0), [(250, 200), (250, 360)]], "taper": 20.0},
    {"source": "Pad_Right_0.e1", "target": "Electrode_1_7.o1",
     "path_spec": [(50, 6, 0), [(1300, -900), (1300, -600), (600, -600), (600, 0), (300, 0)], (2, 5, 0), [(200, 0), (200, 320)]], "taper": 20.0},
    {"source": "Pad_Left_3.e2", "target": "Electrode_1_3.o1",
     "path_spec": [(50, 6, 0), [(-1300, 900), (-1300, 600), (-300, 600)], (2, 5, 0)], "taper": 20.0},
    {"source": "Pad_Left_2.e2", "target": "Electrode_1_2.o1",
     "path_spec": [(50, 6, 0), [(-1300, 300), (-1300, 400), (-300, 400)], (2, 5, 0)], "taper": 20.0},
    {"source": "Pad_Left_1.e2", "target": "Electrode_1_1.o1",
     "path_spec": [(50, 6, 0), [(-1300, -300), (-1300, -200), (-800, -200), (-800, 200), (-300, 200)], (2, 5, 0), [(-250, 200), (-250, 360)]], "taper": 20.0},
    {"source": "Pad_Left_0.e2", "target": "Electrode_1_0.o1",
     "path_spec": [(50, 6, 0), [(-1300, -900), (-1300, -600), (-600, -600), (-600, 0), (-300, 0)], (2, 5, 0), [(-200, 0), (-200, 320)]], "taper": 20.0},
]

# Original y positions from TOML config
RECTANGLE_HOLES = [
    {"name": "Hole_Center1", "x": 0, "y": -550, "size": (3, 100), "layer": (7, 0), "nx": 1, "ny": 1},
    {"name": "Hole_Center2", "x": 0, "y": -250, "size": (4, 100), "layer": (7, 0), "nx": 1, "ny": 1},
    {"name": "Hole_Center3", "x": 0, "y":   50, "size": (5, 100), "layer": (7, 0), "nx": 1, "ny": 1},
]

CIRCLE_HOLES = [
    {"name": "Circle_Array1",  "x": 0, "y": -420, "diam": 3, "nx": 1, "ny": 25, "gap": 6,  "layer": (7, 0)},
    {"name": "Circle_Array2",  "x": 0, "y": -120, "diam": 4, "nx": 1, "ny": 22, "gap": 7,  "layer": (7, 0)},
    {"name": "Circle_Array3",  "x": 0, "y":  180, "diam": 5, "nx": 1, "ny": 20, "gap": 8,  "layer": (7, 0)},
]

# Horizontal grating (from fix/5-create-grid-rectangle)
GRID_COUNT = 50
GRID_WIDTH = 0.2
GRID_SPACING = 0.2
GRID_LAYER = (5, 0)
GRID_RECT = [(-37.29, -695.86), (39.59, -695.86), (39.59, -624.33), (-37.29, -624.33)]


# ═══════════════════════════════════════════════════════════════════════════════
# Generation Functions
# ═══════════════════════════════════════════════════════════════════════════════

def _make_layer(layer_spec):
    """Normalize layer spec to (layer, datatype) tuple."""
    if isinstance(layer_spec, (list, tuple)) and len(layer_spec) == 2:
        return tuple(layer_spec)
    return (int(layer_spec), 0)


# ── Markers ──────────────────────────────────────────────────────────────────

def generate_markers(comp):
    """Add alignment markers, corner crosses, double-Ls, outline, date label."""
    dx, dy = STEP, STEP
    rect = gf.components.rectangle(size=(MARKER_SIZE, MARKER_SIZE), layer=(1, 2))
    ref = comp.add_ref(rect, columns=COL_NUM, rows=ROW_NUM, column_pitch=dx, row_pitch=dy)
    ref.dxmin = -ref.dxsize / 2
    ref.dymin = -ref.dysize / 2

    # Coordinate labels
    for i in range(ROW_NUM):
        for j in range(COL_NUM):
            idx_i = i - ROW_NUM // 2 + 1
            idx_j = j - COL_NUM // 2 + 1
            lx = j * dx + ref.dxmin
            ly = i * dy + ref.dymin
            label = comp << gf.components.text(
                text=f"{idx_j},{idx_i}", size=TEXT_SIZE, justify="right", layer=(1, 2))
            label.dxmin = lx + MARKER_SIZE
            label.dymax = ly - MARKER_SIZE

    def _align_cross(x, y, layer, cross=True):
        m = comp << gf.components.rectangle(size=(20, 20), layer=layer)
        m.dmove((x - 10, y - 10))
        if not cross:
            return
        cl, gap = 390, 100
        for (ox, oy, w, h) in [(gap, 5, cl, 10), (-gap - cl, 5, cl, 10),
                                 (5, gap, 10, cl), (5, -gap - cl, 10, cl)]:
            r = comp << gf.components.rectangle(size=(w, h), layer=layer)
            r.dmove((x + ox, y + oy))

    def _double_l(x, y, layer):
        cw, cl = 3, 25
        L1 = comp << gf.components.L(width=cw, size=(cl, cl), layer=layer)
        L1.dmove((x + cw / 2, y + cw / 2))
        L2 = comp << gf.components.L(width=cw, size=(cl, cl), layer=layer)
        L2.drotate(180, (0, 0))
        L2.dmove((x - cw / 2, y - cw / 2))
        ty = comp << gf.components.text(text=f"{y / 1000:.1f}", size=8, justify="right", layer=layer)
        ty.dmove((L1.dxmax, L1.dymax - 8))
        tx = comp << gf.components.text(text=f"{x / 1000:.1f}", size=8, justify="left", layer=layer)
        tx.dmove((L2.dxmin - 0.8, L2.dymin))

    for pos in CORNER_MARKER_POS:
        for sx in (pos[0], -pos[0]):
            for sy in (pos[1], -pos[1]):
                _align_cross(sx, sy, (1, 1), cross=True)

    for pos in CORNER_MARKER_NO_CROSS:
        for sx in (pos[0], -pos[0]):
            for sy in (pos[1], -pos[1]):
                _align_cross(sx, sy, (1, 2), cross=False)

    for pos in DOUBLE_L_POS:
        for sx in (1, -1):
            for sy in (1, -1):
                _double_l(sx * pos[0], sy * pos[1], (1, 3))

    # Chip outline — 1um frame centered at origin
    hw, hh = CHIP_X / 2, CHIP_Y / 2
    b = BOUNDARY
    # Top edge
    comp.add_polygon([(-hw, hh - b), (hw, hh - b), (hw, hh), (-hw, hh)], layer=(1, 0))
    # Bottom edge
    comp.add_polygon([(-hw, -hh), (hw, -hh), (hw, -hh + b), (-hw, -hh + b)], layer=(1, 0))
    # Left edge
    comp.add_polygon([(-hw, -hh + b), (-hw + b, -hh + b), (-hw + b, hh - b), (-hw, hh - b)], layer=(1, 0))
    # Right edge
    comp.add_polygon([(hw - b, -hh + b), (hw, -hh + b), (hw, hh - b), (hw - b, hh - b)], layer=(1, 0))

    # Date label
    note = comp << gf.components.text(text=DATE, size=DATE_SIZE, layer=(1, 2))
    note.dmove(DATE_POSITION)


# ── Electrodes ───────────────────────────────────────────────────────────────

def generate_electrodes(comp, config, electrode_data):
    """Generate a single electrode array and register ports."""
    name = config["name"]
    w = config["width"]
    length = config["length"]
    num = config["number"]
    gap = config["gap"]
    layer = config["layer"]
    anchor = config["anchor"]
    pos_x = config["x"]
    pos_y = config["y"]

    total_w = num * w + (num - 1) * gap
    positions = []
    for i in range(num):
        positions.append(-total_w / 2 + w / 2 + i * (w + gap))

    if anchor != int(anchor):
        lo, hi = int(anchor), int(anchor) + 1
        anchor_x = (positions[lo] + positions[hi]) / 2 if hi < num else positions[lo]
    else:
        anchor_x = positions[int(anchor)] if int(anchor) < num else 0
    x_offset = -anchor_x

    ports = {}
    for i in range(num):
        xc = positions[i] + x_offset + pos_x
        y_base = pos_y

        elec = gf.Component(f"{name}_{i}")
        elec.add_polygon([
            (xc - w / 2, y_base),
            (xc + w / 2, y_base),
            (xc + w / 2, y_base + length),
            (xc - w / 2, y_base + length),
        ], layer=(layer, 0))
        elec.add_port(name="o1", center=(xc, y_base + length), width=w, orientation=90, layer=(layer, 0))
        elec.add_port(name="o2", center=(xc, y_base), width=w, orientation=-90, layer=(layer, 0))
        comp << elec
        for p in elec.ports:
            ports[f"{i}_{p.name}"] = (p.dx, p.dy)

    electrode_data[name] = {"position": (pos_x, pos_y), "ports": ports, "number": num}


# ── Pads ─────────────────────────────────────────────────────────────────────

def generate_pads_standalone(comp, config, pad_data):
    """Generate a pad array and register ports."""
    name = config["name"]
    pw, ph = config["size"]
    num = config["number"]
    gapx = config["gapx"]
    gapy = config["gapy"]
    rows = config["rows"]
    layer = _make_layer(config["layer"])
    anchor = config["anchor"]
    port_w = config["port_width"]
    px, py = config["x"], config["y"]

    total_w = num * pw + (num - 1) * gapx
    total_h = rows * ph + (rows - 1) * gapy
    x_positions = [-total_w / 2 + pw / 2 + i * (pw + gapx) for i in range(num)]
    y_positions = [-total_h / 2 + ph / 2 + j * (ph + gapy) for j in range(rows)]

    a_idx = int(anchor)
    anchor_x = x_positions[a_idx] if a_idx < num else 0
    x_offset = -anchor_x

    ports = {}
    p_idx = 0
    for row in range(rows):
        for col in range(num):
            xc = x_positions[col] + x_offset + px
            yc = y_positions[row] + py
            pad = gf.Component(f"{name}_{p_idx}")
            pad.add_polygon([
                (xc - pw / 2, yc - ph / 2), (xc + pw / 2, yc - ph / 2),
                (xc + pw / 2, yc + ph / 2), (xc - pw / 2, yc + ph / 2),
            ], layer=layer)
            pad.add_port(name="o1", center=(xc, yc + ph / 2), width=port_w, orientation=90, layer=layer)
            pad.add_port(name="o2", center=(xc, yc - ph / 2), width=port_w, orientation=-90, layer=layer)
            pad.add_port(name="e1", center=(xc - pw / 2, yc), width=port_w, orientation=180, layer=layer)
            pad.add_port(name="e2", center=(xc + pw / 2, yc), width=port_w, orientation=0, layer=layer)
            comp << pad
            for p in pad.ports:
                ports[f"{p_idx}_{p.name}"] = (p.dx, p.dy)
            p_idx += 1

    pad_data[name] = {"position": (px, py), "ports": ports, "number": num * rows}


# ── Routing ──────────────────────────────────────────────────────────────────

def _route_manhattan(comp, start, end, width, layer, start_straight=0, end_straight=0, rid=0):
    """Create a Manhattan (L-shaped) route between two points."""
    from gdsfactory import Path
    from gdsfactory.cross_section import cross_section

    x1, y1 = start
    x2, y2 = end
    pts = [(x1, y1)]
    if start_straight > 0:
        y1 += start_straight
        pts.append((x1, y1))
    mid_y = y2 - end_straight
    if abs(x1 - x2) > 0.001:
        pts.append((x2, pts[-1][1]))
    if abs(pts[-1][1] - mid_y) > 0.001:
        pts.append((x2, mid_y))
    if end_straight > 0:
        pts.append((x2, y2))
    elif abs(pts[-1][1] - y2) > 0.001:
        pts.append((x2, y2))
    if len(pts) < 2:
        return
    path = Path(pts)
    xs = cross_section(width=width, layer=(layer, 0))
    comp << path.extrude(xs)


def _route_along_points(comp, start, end, path_spec, taper_length=20.0, route_index=None):
    """Create a variable-width route along waypoints with tapers."""
    from gdsfactory import Path
    from gdsfactory.cross_section import cross_section
    _gds_provenance_loop_index = route_index

    # Parse segments from path_spec
    segments = []
    cur_spec = None
    cur_pts = []

    for item in path_spec:
        if isinstance(item, (tuple, list)) and len(item) == 3 and all(
            isinstance(x, (int, float)) and not isinstance(x, bool) for x in item
        ):
            if cur_spec is not None:
                segments.append((cur_spec[0], cur_spec[1], cur_spec[2], cur_pts))
            cur_spec = (float(item[0]), int(item[1]), int(item[2]))
            cur_pts = []
        elif isinstance(item, list):
            cur_pts = [tuple(pt) for pt in item]
    if cur_spec is not None:
        segments.append((cur_spec[0], cur_spec[1], cur_spec[2], cur_pts))
    if not segments:
        return

    cur_pos = start
    for seg_idx, (w, layer_num, dtype, waypoints) in enumerate(segments):
        pts = [cur_pos]
        for wp in waypoints:
            pts.append(wp)
        if seg_idx == len(segments) - 1:
            pts.append(end)

        # Manhattanize
        mpts = [pts[0]]
        for i in range(1, len(pts)):
            prev, curr = mpts[-1], pts[i]
            if abs(prev[0] - curr[0]) > 0.001 and abs(prev[1] - curr[1]) > 0.001:
                mpts.append((curr[0], prev[1]))
            mpts.append(curr)

        if len(mpts) >= 2:
            path = Path(mpts)
            xs = cross_section(width=w, layer=(layer_num, dtype))
            comp << path.extrude(xs)

        # Taper between segments
        if seg_idx < len(segments) - 1:
            nw = segments[seg_idx + 1][0]
            if abs(w - nw) > 0.001:
                taper_dir = _get_direction(mpts)
                if taper_dir[0] == "horizontal":
                    rot = 0 if taper_dir[1] > 0 else 180
                else:
                    rot = 90 if taper_dir[1] > 0 else -90
                taper = comp << gf.components.taper(
                    length=taper_length, width1=w, width2=nw, layer=(layer_num, dtype))
                taper.drotate(rot)
                taper.dmove(mpts[-1])

        cur_pos = mpts[-1]


def _get_direction(pts):
    if len(pts) < 2:
        return ("horizontal", 1)
    dx = pts[-1][0] - pts[-2][0]
    dy = pts[-1][1] - pts[-2][1]
    if abs(dx) > abs(dy):
        return ("horizontal", 1 if dx > 0 else -1)
    return ("vertical", 1 if dy > 0 else -1)


def _parse_port(electrode_data, pad_data, spec):
    """Parse 'Pad_Right_3.e1' or 'Electrode_1_4.o1' into (x, y)."""
    # Try pad first
    for prefix, data in pad_data.items():
        if spec.startswith(prefix + "_"):
            rest = spec[len(prefix) + 1:]
            idx_str, port = rest.split(".")
            key = f"{idx_str}_{port}"
            if key in data["ports"]:
                return data["ports"][key]
    # Try electrode
    for prefix, data in electrode_data.items():
        if spec.startswith(prefix + "_"):
            rest = spec[len(prefix) + 1:]
            idx_str, port = rest.split(".")
            key = f"{idx_str}_{port}"
            if key in data["ports"]:
                return data["ports"][key]
    raise ValueError(f"Cannot resolve port: {spec}")


# ── Holes ────────────────────────────────────────────────────────────────────

def add_rectangular_holes(comp):
    """Add rectangular hole arrays."""
    for h in RECTANGLE_HOLES:
        w, ht = h["size"]
        layer = _make_layer(h["layer"])
        hole = gf.Component(h["name"])
        hole.add_polygon([
            (-w / 2, -ht / 2), (w / 2, -ht / 2),
            (w / 2, ht / 2), (-w / 2, ht / 2),
        ], layer=layer)
        ref = comp << hole
        ref.dmove((h["x"], h["y"]))


def add_circle_holes(comp):
    """Add circular hole arrays."""
    for ch in CIRCLE_HOLES:
        diam = ch["diam"]
        ny = ch["ny"]
        gap = ch["gap"]
        layer = _make_layer(ch["layer"])
        total_h = (ny - 1) * gap
        for i in range(ny):
            yc = ch["y"] - total_h / 2 + i * gap
            circle = gf.components.circle(radius=diam / 2, layer=layer)
            ref = comp << circle
            ref.dmove((ch["x"], yc))


def add_horizontal_grating(comp):
    """Add horizontal grating lines in rectangle area (from fix/5-create-grid-rectangle)."""
    xs = [p[0] for p in GRID_RECT]
    ys = [p[1] for p in GRID_RECT]
    x_min, x_max = min(xs), max(xs)
    y_min, y_max = min(ys), max(ys)
    rect_w = x_max - x_min
    cx = (x_min + x_max) / 2
    cy = (y_min + y_max) / 2
    total_h = GRID_COUNT * GRID_WIDTH + (GRID_COUNT - 1) * GRID_SPACING
    start_y = cy - total_h / 2 + GRID_WIDTH / 2

    for i in range(GRID_COUNT):
        y = start_y + i * (GRID_WIDTH + GRID_SPACING)
        x0, y0 = cx - rect_w / 2, y - GRID_WIDTH / 2
        x1, y1 = cx + rect_w / 2, y + GRID_WIDTH / 2
        comp.add_polygon([(x0, y0), (x1, y0), (x1, y1), (x0, y1)], layer=GRID_LAYER)


# ═══════════════════════════════════════════════════════════════════════════════
# Main Assembly
# ═══════════════════════════════════════════════════════════════════════════════

def suspended_superconductor():
    """Generate the full suspended superconductor chip10 layout."""
    c = gf.Component("suspended_superconductor")

    # 1. Markers
    generate_markers(c)

    # 2. Electrodes
    electrode_data = {}
    for ec in ELECTRODE_CONFIGS:
        generate_electrodes(c, ec, electrode_data)

    # 3. Pads
    pad_data = {}
    for pc in PAD_CONFIGS:
        generate_pads_standalone(c, pc, pad_data)

    # 4. Inter-electrode Manhattan routing
    for route_cfg in ELECTRODE_ROUTES:
        src = route_cfg["source"]
        tgt = route_cfg["target"]
        sp = route_cfg["source_port"]
        tp = route_cfg["target_port"]
        w = route_cfg["width"]
        layer = route_cfg["layer"]
        num = electrode_data[src]["number"]
        for i in range(num):
            s_key = f"{src}_{i}.{sp}"
            t_key = f"{tgt}_{i}.{tp}"
            ss = route_cfg["start_straight"]
            es = route_cfg["end_straight"]
            s_start = ss[i] if isinstance(ss, list) else ss
            s_end = es[i] if isinstance(es, list) else es
            start_pos = _parse_port(electrode_data, pad_data, s_key)
            end_pos = _parse_port(electrode_data, pad_data, t_key)
            _route_manhattan(c, start_pos, end_pos, w, layer, s_start, s_end, i)

    # 5. Pad-to-electrode route paths (with tapers)
    for route_idx, rp in enumerate(ROUTE_PATHS):
        start_pos = _parse_port(electrode_data, pad_data, rp["source"])
        end_pos = _parse_port(electrode_data, pad_data, rp["target"])
        _route_along_points(
            c, start_pos, end_pos, rp["path_spec"], rp["taper"], route_idx
        )

    # 6. Rectangular holes
    add_rectangular_holes(c)

    # 7. Circular hole arrays
    add_circle_holes(c)

    # 8. Horizontal grating in rectangle
    add_horizontal_grating(c)

    return c


def main():
    output_dir = "gds"
    os.makedirs(output_dir, exist_ok=True)
    output_path = os.path.join(output_dir, "suspended_superconductor_standalone.gds")
    c = suspended_superconductor()
    c.write_gds(output_path)

    # Strip annotation layer (255/255) added by gdsfactory
    import klayout.db as kdb
    layout = kdb.Layout()
    layout.read(output_path)
    li = layout.layer(255, 255)
    if li is not None:
        for cell in layout.each_cell():
            cell.shapes(li).clear()
    layout.write(output_path)

    bbox = layout.top_cell().dbbox()
    print(f"Generated: {output_path}")
    print(f"  Bounding box: [{bbox.left:.1f}, {bbox.bottom:.1f}] -> [{bbox.right:.1f}, {bbox.top:.1f}]")
    return c


if __name__ == "__main__":
    main()
