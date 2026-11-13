#!/usr/bin/env python3
"""
Before/after sheet for Project AURA Phase 2.

"Before" images are Phase 1's committed previews, pulled straight out of commit
`820f5df7` — not re-drawn, so they cannot be flattered. "After" images are
rendered by the current renderer from the current tokens.

Honesty notes
-------------
* Phase 1's verdict preview showed a 2—1 scoreboard and a settlement ledger that
  the app never rendered. It is kept here *as the before*, because a reviewer
  should see the gap between preview and product closing, not just a prettier
  picture.
* Both sides are design previews, not screenshots. Neither was captured from a
  device — this environment has no emulator and no headless browser.
"""
import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path("/home/user/aura2")
OUT = ROOT / "docs/aura/preview"
BEFORE_SHA = "820f5df7d0c01c2acc21216f7d63f42c60723b5a"
SCALE = 2

INTER = ROOT / "node_modules/@expo-google-fonts/inter"
FONT_DISPLAY = f"{INTER}/600SemiBold/Inter_600SemiBold.ttf"
FONT_UI = f"{INTER}/400Regular/Inter_400Regular.ttf"
FONT_LABEL = f"{INTER}/500Medium/Inter_500Medium.ttf"

# (produced filename, page title, page subtitle)
PAIRS = [
    (
        "arena-verdict-dark",
        "Verdict card",
        "Phase 1's preview invented a 2—1 scoreboard and a settlement ledger the app never rendered. "
        "The right-hand image is the component's real layout.",
    ),
    (
        "clash-spectator-settled-dark",
        "The settled room, end to end",
        "Phase 1 had no room preview at all — only a card. The result now arrives inside the room it belongs to.",
    ),
    ("profile-dark", "Profile identity", "Unchanged layout; type and contrast came from the token fixes."),
]

BG = (11, 10, 9)
INK = (245, 245, 245)
MUTED = (138, 138, 147)


def git_png(name: str, ref: str) -> Image.Image:
    """A committed PNG, read out of the git object store."""
    try:
        raw = subprocess.check_output(
            ["git", "-C", str(ROOT), "show", f"{ref}:docs/aura/preview/{name}.png"],
            stderr=subprocess.DEVNULL,
        )
    except subprocess.CalledProcessError:
        return None
    tmp = Path(f"/tmp/ba-{ref[:7]}-{name}.png")
    tmp.write_bytes(raw)
    return Image.open(tmp).convert("RGB")


def fitted(img: Image.Image, width_px: int) -> Image.Image:
    h = round(img.height * (width_px / img.width))
    return img.resize((width_px, h), Image.LANCZOS)


def sheet() -> None:
    tw = 260 * SCALE  # tile width in pixels
    gutter = 16 * SCALE
    label_h = 34 * SCALE
    row_h = round(844 * tw / 390)
    head_h = 108 * SCALE

    cols = 2
    cw = gutter + cols * (tw + gutter) + 170 * SCALE  # room for the caption column
    ch = head_h + len(PAIRS) * (row_h + label_h + gutter) + gutter

    img = Image.new("RGB", (cw, ch), BG)
    d = ImageDraw.Draw(img)

    def f(path, size):
        return ImageFont.truetype(path, size * SCALE)

    d.text((gutter, 20 * SCALE), "AURA PHASE 2 · BEFORE / AFTER", font=f(FONT_DISPLAY, 19), fill=INK)
    d.text(
        (gutter, 48 * SCALE),
        "LEFT = Phase 1 committed preview (820f5df7).   RIGHT = current renderer, current tokens.",
        font=f(FONT_UI, 10),
        fill=MUTED,
    )
    d.text(
        (gutter, 64 * SCALE),
        "Design previews rendered from repo tokens — NOT device screenshots. No emulator was available.",
        font=f(FONT_UI, 10),
        fill=(196, 108, 78),
    )

    def col_headings(y):
        d.text((gutter, y), "BEFORE · Phase 1", font=f(FONT_LABEL, 9), fill=MUTED)
        d.text((gutter + tw + gutter, y), "AFTER · Phase 2", font=f(FONT_LABEL, 9), fill=(224, 136, 94))
        return y + 16 * SCALE

    y = head_h
    for name, title, sub in PAIRS:
        y = col_headings(y)
        before = git_png(name, BEFORE_SHA)
        after_path = OUT / f"{name}.png"
        after = Image.open(after_path).convert("RGB") if after_path.exists() else None

        for col, tile in enumerate([before, after]):
            x = gutter + col * (tw + gutter)
            if tile is None:
                d.text(
                    (x, y + 20 * SCALE),
                    "no preview existed",
                    font=f(FONT_UI, 10),
                    fill=(150, 90, 70),
                )
                continue
            img.paste(fitted(tile, tw), (x, y))

        # caption to the right of the pair
        cap_x = gutter + cols * (tw + gutter) + 8 * SCALE
        cap_w = cw - cap_x - gutter
        d.text((cap_x, y + 4 * SCALE), title.upper(), font=f(FONT_LABEL, 10), fill=INK)
        words, line, cy = sub.split(), "", y + 24 * SCALE
        for w in words:
            trial = f"{line} {w}".strip()
            if d.textlength(trial, font=f(FONT_UI, 10)) > cap_w and line:
                d.text((cap_x, cy), line, font=f(FONT_UI, 10), fill=MUTED)
                cy += 14 * SCALE
                line = w
            else:
                line = trial
        if line:
            d.text((cap_x, cy), line, font=f(FONT_UI, 10), fill=MUTED)

        y += row_h + label_h + gutter

    img.save(OUT / "before-after.png")
    print(f"wrote docs/aura/preview/before-after.png  ({img.width}x{img.height})")


if __name__ == "__main__":
    sheet()
