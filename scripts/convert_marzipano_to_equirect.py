#!/usr/bin/env python3
"""
Convert a Marzipano tile-bundle (cubemap, 6 faces, multi-level) into one
equirectangular JPG per scene — the format our viewer expects.

Layout assumed (matches WELL-PAD_SF-46_3D-TOUR):
  <tiles_dir>/<scene-id>/<level>/<face>/<row>/<col>.jpg
    face ∈ {b, d, f, l, r, u}   (back, down, front, left, right, up)
    level is an integer, highest = best resolution

For each scene:
  1. Pick the highest level present.
  2. Stitch the 4×4 tile grid for each face into a single face image.
  3. Feed the 6 faces into py360convert.c2e → equirect 4096×2048 JPG.
  4. Write to <out_dir>/<scene-slug>.jpg

Usage:
  python3 convert_marzipano_to_equirect.py <tiles_dir> <out_dir> [--size 4096]
"""

import argparse
import sys
from pathlib import Path

import numpy as np
import py360convert
from PIL import Image


FACE_ORDER = ["f", "r", "b", "l", "u", "d"]  # py360convert order


def stitch_face(face_dir: Path) -> Image.Image:
    """Stitch a row/col grid of square tiles into one square face image."""
    rows = sorted(int(p.name) for p in face_dir.iterdir() if p.is_dir())
    if not rows:
        raise RuntimeError(f"no rows under {face_dir}")
    grid: list[list[Image.Image]] = []
    for r in rows:
        row_dir = face_dir / str(r)
        cols = sorted(int(p.stem) for p in row_dir.glob("*.jpg"))
        if not cols:
            raise RuntimeError(f"no tiles in {row_dir}")
        grid.append([Image.open(row_dir / f"{c}.jpg") for c in cols])
    tile_w, tile_h = grid[0][0].size
    if tile_w != tile_h:
        raise RuntimeError(f"non-square tile {tile_w}x{tile_h}")
    side = tile_w * len(grid)
    out = Image.new("RGB", (side, side))
    for r_idx, row in enumerate(grid):
        for c_idx, tile in enumerate(row):
            out.paste(tile, (c_idx * tile_w, r_idx * tile_h))
    return out


def scene_to_equirect(scene_dir: Path, out_width: int) -> Image.Image:
    levels = sorted(
        (int(p.name) for p in scene_dir.iterdir() if p.is_dir() and p.name.isdigit()),
        reverse=True,
    )
    if not levels:
        raise RuntimeError(f"no levels under {scene_dir}")
    top_level = scene_dir / str(levels[0])
    faces = {}
    for face in FACE_ORDER:
        face_dir = top_level / face
        if not face_dir.is_dir():
            raise RuntimeError(f"missing face {face} in {top_level}")
        faces[face] = np.array(stitch_face(face_dir))
    # py360convert.c2e in "list" mode wants a Python list of 6 ndarrays
    # in F, R, B, L, U, D order — NOT a stacked 4-D array.
    cube = [faces[f] for f in FACE_ORDER]
    equirect = py360convert.c2e(
        cube,
        h=out_width // 2,
        w=out_width,
        mode="bilinear",
        cube_format="list",
    )
    return Image.fromarray(equirect.astype("uint8"))


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("tiles_dir", type=Path)
    p.add_argument("out_dir", type=Path)
    p.add_argument("--size", type=int, default=4096,
                   help="equirect width (height = size/2). Default 4096.")
    p.add_argument("--quality", type=int, default=88)
    args = p.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    scenes = sorted(p for p in args.tiles_dir.iterdir() if p.is_dir())
    if not scenes:
        print(f"no scenes found in {args.tiles_dir}", file=sys.stderr)
        return 1

    for scene in scenes:
        out_path = args.out_dir / f"{scene.name}.jpg"
        if out_path.exists():
            print(f"skip {scene.name} (exists)")
            continue
        try:
            print(f"converting {scene.name} …", flush=True)
            img = scene_to_equirect(scene, args.size)
            img.save(out_path, "JPEG", quality=args.quality, optimize=True)
            print(f"  → {out_path} ({out_path.stat().st_size // 1024} KiB)")
        except Exception as e:
            print(f"  FAIL: {e}", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
