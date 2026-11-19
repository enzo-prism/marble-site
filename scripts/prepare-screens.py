#!/usr/bin/env python3
"""Turn raw simulator captures into web screens for the site.

The 2.7 set in images/app-store-2.7/raw/ holds full-screen PNGs captured by
the app's own XCUITest screenshot suite (real UI, fixture data, 9:41 status
bar). This writes, for every raw/NN-name.png:

    screens/NN-name.png   720 px wide, rounded display corners, transparent
    screens/NN-name.webp  the same, WebP

    python3 scripts/prepare-screens.py images/app-store-2.7

Pages show a screen at 360 CSS px or less, so 720 covers 2x displays. The
corner radius matches an iPhone display, so the screen sits flush inside the
CSS bezel. Needs Pillow with WebP support. Output is deterministic.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

WIDTH = 720
# iPhone display corner radius as a share of the screen width
CORNER_RATIO = 0.135
SUPERSAMPLE = 4


def rounded_mask(size):
    width, height = size
    big = Image.new("L", (width * SUPERSAMPLE, height * SUPERSAMPLE), 0)
    radius = round(width * CORNER_RATIO * SUPERSAMPLE)
    ImageDraw.Draw(big).rounded_rectangle(
        (0, 0, big.width - 1, big.height - 1), radius=radius, fill=255
    )
    return big.resize(size, Image.LANCZOS)


def main(folder):
    folder = Path(folder)
    raw = folder / "raw"
    out = folder / "screens"
    out.mkdir(exist_ok=True)
    for source in sorted(raw.glob("*.png")):
        image = Image.open(source).convert("RGB")
        height = round(image.height * WIDTH / image.width)
        small = image.resize((WIDTH, height), Image.LANCZOS)
        rgba = small.convert("RGBA")
        rgba.putalpha(rounded_mask(small.size))
        rgba.save(out / source.name, optimize=True)
        rgba.save(out / f"{source.stem}.webp", quality=86, method=6)
        print(f"{source.name} -> screens/ ({WIDTH}x{height})")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit("usage: prepare-screens.py images/app-store-<version>")
    main(sys.argv[1])
