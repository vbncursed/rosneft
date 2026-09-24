"""Render icon 2e (Site Icon.dc.html) into every format the web app and the
desktop bundle ship, and the link-preview card (OG Card.dc.html, 1a). Run from anywhere:  python3 frontend/icons/render.py
Needs Python Playwright (Chromium), Pillow, and macOS iconutil for .icns."""
import math
import subprocess
import tempfile
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw
from playwright.sync_api import sync_playwright

HERE = Path(__file__).resolve().parent
PUBLIC = HERE.parent / "public"
DESKTOP = HERE.parents[1] / "desktop" / "src-tauri" / "icons"
SRC = {k: (HERE / f).read_text() for k, f in
       {"main": "icon.svg", "maskable": "icon-maskable.svg", "small": "icon-small.svg"}.items()}


def rounded(svg: str, rx: float) -> str:
    """The ground rect with corners, so the tile's corners turn transparent."""
    return svg.replace('<rect width="32" height="32"', f'<rect width="32" height="32" rx="{rx}"', 1)


def render(page, svg: str, px: int) -> Image.Image:
    page.set_viewport_size({"width": px, "height": px})
    page.set_content(
        f'<html><body style="margin:0;background:transparent">'
        f'{svg.replace("<svg ", f"<svg width=\"{px}\" height=\"{px}\" ", 1)}</body></html>'
    )
    return Image.open(BytesIO(page.screenshot(omit_background=True))).convert("RGBA")


def save_ico(frames: list[Image.Image], path: Path) -> None:
    """Pillow drops every size larger than the image it saves from and embeds a
    provided frame only where one matches a size, so save from the largest and
    hand it the rest: each size keeps its own cut instead of a downscale."""
    frames = sorted(frames, key=lambda f: f.width)
    frames[-1].save(path, sizes=[f.size for f in frames], append_images=frames[:-1])


def superellipse(size: int, n: float = 5.0, ss: int = 4) -> Image.Image:
    big, pts = size * ss, []
    r = big / 2.0
    for i in range(2048):
        t = 2 * math.pi * i / 2048
        ct, st = math.cos(t), math.sin(t)
        pts.append((r + math.copysign(abs(ct) ** (2 / n), ct) * r,
                    r + math.copysign(abs(st) ** (2 / n), st) * r))
    m = Image.new("L", (big, big), 0)
    ImageDraw.Draw(m).polygon(pts, fill=255)
    return m.resize((size, size), Image.LANCZOS)


def og_card(page) -> None:
    """A file:// load, so the card's relative @font-face reaches node_modules."""
    page.set_viewport_size({"width": 1200, "height": 630})
    page.goto((HERE / "og-card.html").as_uri())
    page.evaluate("document.fonts.ready")
    card = Image.open(BytesIO(page.screenshot())).convert("RGB")
    card.save(PUBLIC / "og-card.png", optimize=True)


def main() -> None:
    fav = 6                  # rx on the 32 grid: 3 px at 16, as the mock's tab
    win = 32 * 4 / 24        # 4 px at 24, as the mock's taskbar tile
    (PUBLIC / "favicon.svg").write_text(rounded(SRC["small"], fav))
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(device_scale_factor=1)

        def png(key: str, px: int, rx: float | None = None) -> Image.Image:
            return render(page, rounded(SRC[key], rx) if rx else SRC[key], px)

        # Web: favicon.ico (16 small, 32/48 main, rounded), PWA and iOS squares.
        save_ico([png("small", 16, fav), png("main", 32, fav), png("main", 48, fav)], PUBLIC / "favicon.ico")
        png("main", 180).save(PUBLIC / "apple-touch-icon.png")
        png("main", 192).save(PUBLIC / "icon-192.png")
        png("main", 512).save(PUBLIC / "icon-512.png")
        png("maskable", 512).save(PUBLIC / "icon-maskable-512.png")

        # Desktop: square PNGs (Linux, window icon), rounded .ico (Windows).
        for name, px in [("32x32.png", 32), ("128x128.png", 128), ("128x128@2x.png", 256), ("icon.png", 512)]:
            png("main", px).save(DESKTOP / name)
        save_ico([png("small" if s == 16 else "main", s, win) for s in (16, 24, 32, 48, 64, 128, 256)],
                 DESKTOP / "icon.ico")

        # macOS: superellipse, 824 of artwork on a 1024 canvas (Apple grid).
        body = png("main", 824)
        og_card(page)
        browser.close()
    body.putalpha(superellipse(824))
    master = Image.new("RGBA", (1024, 1024), (0, 0, 0, 0))
    master.paste(body, (100, 100), body)
    with tempfile.TemporaryDirectory() as tmp:
        iconset = Path(tmp) / "icon.iconset"
        iconset.mkdir()
        for s in (16, 32, 128, 256, 512):
            master.resize((s, s), Image.LANCZOS).save(iconset / f"icon_{s}x{s}.png")
            master.resize((s * 2, s * 2), Image.LANCZOS).save(iconset / f"icon_{s}x{s}@2x.png")
        subprocess.run(["iconutil", "-c", "icns", str(iconset), "-o", str(DESKTOP / "icon.icns")], check=True)


if __name__ == "__main__":
    main()
