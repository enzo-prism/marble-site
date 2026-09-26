#!/usr/bin/env python3
"""Crop the App Store compositions down to the phone screen.

The App Store set in images/app-store-<version>/ is 1320 x 2868 compositions: a
headline and a subline above a device frame. At web sizes that baked-in copy is
too small to read, so pages that pair a screenshot with their own heading use
these crops instead: the device frame only, with transparent rounded corners.

    python3 scripts/crop-screens.py images/app-store-2.5

writes screens/NN-name.png and .webp, 600 px wide, for every NN-name.png in
that folder. Pages show them at 300 CSS px or less, so 600 covers 2x screens.

Needs Pillow with WebP support. Output is deterministic for the same input.
"""

import sys
from pathlib import Path

from PIL import Image, ImageDraw

# Every composition in the set shares one frame geometry horizontally; the
# frame's top moves with the headline length, so it is measured per image.
FRAME_LEFT = 105
FRAME_RIGHT = 1215
FRAME_INSET = 3
CORNER_RADIUS = 47
BACKGROUND = 248
SUPERSAMPLE = 4
SMALL_WIDTH = 600


def is_background(pixel):
    return all(abs(channel - BACKGROUND) <= 2 for channel in pixel[:3])


def frame_rows(image):
    """First and last row of the device frame.

    The top is the first row that is solid across the frame (a caption row is
    mostly background between letters). The bottom is where the frame's drop
    shadow starts under the centre of the device.
    """
    width, height = image.size
    samples = range(FRAME_LEFT + CORNER_RADIUS + 10, FRAME_RIGHT - CORNER_RADIUS - 10, 10)

    top = next(
        (
            y
            for y in range(height // 2)
            if sum(not is_background(image.getpixel((x, y))) for x in samples) >= 0.95 * len(samples)
        ),
        None,
    )
    if top is None:
        raise ValueError("could not find the top of the device frame")

    # Walking up the centre from the bottom edge: background, then the drop
    # shadow (darkening to ~215), then the frame itself.
    x, bottom = width // 2, height - 1
    while bottom > top and image.getpixel((x, bottom))[0] >= 247:
        bottom -= 1
    while bottom > top and image.getpixel((x, bottom))[0] < 247:
        bottom -= 1
    # drop the frame's 1-2 px anti-aliased outline on every edge
    return top + FRAME_INSET + 2, bottom + 1 - FRAME_INSET


def rounded_mask(size, radius):
    width, height = size
    large = Image.new("L", (width * SUPERSAMPLE, height * SUPERSAMPLE), 0)
    ImageDraw.Draw(large).rounded_rectangle(
        (0, 0, width * SUPERSAMPLE - 1, height * SUPERSAMPLE - 1),
        radius=radius * SUPERSAMPLE,
        fill=255,
    )
    return large.resize((width, height), Image.LANCZOS)


def save(image, path):
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path.with_suffix(".png"), optimize=True)
    image.save(path.with_suffix(".webp"), quality=86, method=6)


def crop(source, out_dir):
    image = Image.open(source).convert("RGB")
    if image.size != (1320, 2868):
        raise ValueError(f"{source.name} is {image.size}, expected 1320 x 2868")

    top, bottom = frame_rows(image)
    frame = image.crop((FRAME_LEFT + FRAME_INSET, top, FRAME_RIGHT - FRAME_INSET, bottom)).convert("RGBA")
    frame.putalpha(rounded_mask(frame.size, CORNER_RADIUS))
    small = frame.resize((SMALL_WIDTH, round(frame.height * SMALL_WIDTH / frame.width)), Image.LANCZOS)
    save(small, out_dir / source.stem)
    return small.size


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    folder = Path(sys.argv[1])
    sources = sorted(folder.glob("[0-9][0-9]-*.png"))
    if not sources:
        sys.exit(f"no NN-name.png compositions in {folder}")
    for source in sources:
        width, height = crop(source, folder / "screens")
        print(f"  {source.stem}: {width} x {height}")


if __name__ == "__main__":
    main()
