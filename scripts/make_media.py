"""Turn the captures from web/scripts/media.mjs into the images the README uses.

    uv run --with pillow python scripts/make_media.py <capture-dir>

Writes docs/assets/*.webp (stills, plus the animated demo) and docs/assets/social-preview.png.
"""

from __future__ import annotations

import re
import shutil
import sys
from pathlib import Path

from PIL import Image

ASSETS = Path(__file__).resolve().parent.parent / "docs" / "assets"
STILLS = (
    "hero-signed-out",
    "lens",
    "now-playing",
    "search",
    "wrapped",
    "atlas",
    "home-light",
    "mobile",
)
DEMO_WIDTH = 960
DEMO_FPS = 12


def stills(src: Path) -> None:
    for name in STILLS:
        image = Image.open(src / f"{name}.png").convert("RGB")
        image.save(ASSETS / f"{name}.webp", quality=86, method=6)


def demo(src: Path) -> None:
    """Resample the screencast (frames arrive only when the page changes) to a steady frame rate."""
    stamped = sorted(
        (int(m.group(1)), path)
        for path in (src / "frames").glob("*.jpg")
        if (m := re.search(r"-(\d+)\.jpg$", path.name))
    )
    if not stamped:
        raise SystemExit("no frames captured")
    start, end = stamped[0][0], stamped[-1][0] + 600
    step = 1000 // DEMO_FPS
    frames: list[Path] = []
    cursor = 0
    for t in range(start, end, step):
        while cursor + 1 < len(stamped) and stamped[cursor + 1][0] <= t:
            cursor += 1
        frames.append(stamped[cursor][1])
    # Load each distinct source frame once.
    cache: dict[Path, Image.Image] = {}
    images = []
    for path in frames:
        if path not in cache:
            image = Image.open(path).convert("RGB")
            height = round(image.height * DEMO_WIDTH / image.width)
            cache[path] = image.resize((DEMO_WIDTH, height), Image.Resampling.LANCZOS)
        images.append(cache[path])
    images[0].save(
        ASSETS / "demo.webp",
        save_all=True,
        append_images=images[1:],
        duration=step,
        loop=0,
        quality=72,
        method=6,
    )


def main() -> None:
    src = Path(sys.argv[1])
    ASSETS.mkdir(parents=True, exist_ok=True)
    stills(src)
    demo(src)
    shutil.copyfile(src / "social-preview.png", ASSETS / "social-preview.png")
    for path in sorted(ASSETS.iterdir()):
        print(f"{path.name:24} {path.stat().st_size / 1024:8.0f} KB")


if __name__ == "__main__":
    main()
