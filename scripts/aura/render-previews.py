#!/usr/bin/env python3
"""
AURA design preview renderer.

IMPORTANT — these are DESIGN PREVIEWS, not application screenshots.

This sandbox has no Android emulator and no headless browser (the Playwright CDN
is unreachable), so a real runtime capture is impossible. Rather than fake one,
this renderer draws faithful 1:1-at-390pt compositions from the *live design
tokens read out of the repository*, so accuracy is mechanical rather than
hand-copied: if a token changes, the preview changes with it.

Every image carries a permanent "NOT A SCREENSHOT" rule so it can never be
mistaken for device output in review.
"""
import re
import subprocess
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path("/home/user/aura")
OUT = ROOT / "docs/aura/preview"
OUT.mkdir(parents=True, exist_ok=True)

INTER = ROOT / "node_modules/@expo-google-fonts/inter"
SERIF_TTF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif.ttf"
SERIF_BOLD_TTF = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"

# 390 x 844 = iPhone 14 / Pixel 7 logical size. 2x for retina-crisp review.
W, H, SCALE = 390, 844, 2


# ── token extraction ────────────────────────────────────────────────────────
def read(path: str) -> str:
    return (ROOT / path).read_text()


def palette(scheme: str) -> dict:
    """Parse the semantic palette object straight out of palettes.ts."""
    src = read("theme/palettes.ts")
    start = src.index(f"export const {scheme}Theme: SemanticTheme = {{")
    body = src[start : src.index("\n};", start)]
    out = {}
    for m in re.finditer(r"^\s{2}([A-Za-z]+):\s*'([^']+)',", body, re.M):
        out[m.group(1)] = m.group(2)
    return out


def num(path: str, name: str) -> int:
    m = re.search(rf"export const {name} = (\d+);", read(path))
    return int(m.group(1))


FONTS = {
    "regular": f"{INTER}/400Regular/Inter_400Regular.ttf",
    "medium": f"{INTER}/500Medium/Inter_500Medium.ttf",
    "semibold": f"{INTER}/600SemiBold/Inter_600SemiBold.ttf",
    "bold": f"{INTER}/700Bold/Inter_700Bold.ttf",
    "serif": SERIF_TTF,
    "serifBold": SERIF_BOLD_TTF,
}


def font(face: str, size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONTS[face], int(size * SCALE))


def rgb(hex_or_rgba: str, on: str = "#000000") -> tuple:
    """Resolve #rrggbb / rgba() over a background, because these previews are
    flattened images and must show the composited colour."""
    s = hex_or_rgba.strip()
    if s.startswith("rgba"):
        parts = [p.strip() for p in s[s.index("(") + 1 : s.rindex(")")].split(",")]
        r, g, b = (int(float(parts[i])) for i in range(3))
        a = float(parts[3])
        br, bg, bb = rgb(on)
        return (
            int(r * a + br * (1 - a)),
            int(g * a + bg * (1 - a)),
            int(b * a + bb * (1 - a)),
        )
    s = s.lstrip("#")
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))


# ── drawing helpers ────────────────────────────────────────────────────────
class Canvas:
    def __init__(self, bg: str):
        self.img = Image.new("RGB", (W * SCALE, H * SCALE), rgb(bg))
        self.d = ImageDraw.Draw(self.img)
        self.bg = bg

    def rect(self, box, fill, radius=0, outline=None, width=1):
        x0, y0, x1, y1 = [v * SCALE for v in box]
        self.d.rounded_rectangle(
            [x0, y0, x1, y1],
            radius=int(radius * SCALE),
            fill=rgb(fill, self.bg) if fill else None,
            outline=rgb(outline, self.bg) if outline else None,
            width=int(width * SCALE),
        )

    def text(self, xy, s, face, size, color, anchor="la", tracking=0.0):
        f = font(face, size)
        x, y = xy[0] * SCALE, xy[1] * SCALE
        if tracking:
            # Manual letter-spacing. Anchor must be honoured or centred/right
            # labels overflow their column (this clipped a Side B label).
            widths = [self.d.textlength(ch, font=f) for ch in s]
            total = sum(widths) + tracking * SCALE * max(len(s) - 1, 0)
            if anchor[0] == 'm':
                cx = x - total / 2
            elif anchor[0] == 'r':
                cx = x - total
            else:
                cx = x
            for ch, w in zip(s, widths):
                self.d.text((cx, y), ch, font=f, fill=rgb(color, self.bg), anchor='l' + anchor[1])
                cx += w + tracking * SCALE
            return
        self.d.text((x, y), s, font=f, fill=rgb(color, self.bg), anchor=anchor)

    def wrap(self, xy, s, face, size, color, max_w, leading):
        f = font(face, size)
        words, line, y = s.split(), "", xy[1]
        x = xy[0]
        for w in words:
            trial = f"{line} {w}".strip()
            if self.d.textlength(trial, font=f) > max_w * SCALE and line:
                self.d.text((x * SCALE, y * SCALE), line, font=f, fill=rgb(color, self.bg))
                line, y = w, y + leading
            else:
                line = trial
        if line:
            self.d.text((x * SCALE, y * SCALE), line, font=f, fill=rgb(color, self.bg))
        return y + leading

    def save(self, name: str, note: str):
        self._watermark(note)
        path = OUT / name
        self.img.resize((W, H), Image.LANCZOS).save(path, optimize=True)
        print(f"  wrote {path.relative_to(ROOT)}  ({note})")

    def _watermark(self, note: str):
        """Permanent, unmissable provenance strip. These are not screenshots."""
        bar_h = 26 * SCALE
        self.d.rectangle([0, 0, W * SCALE, bar_h], fill=rgb("#000000"))
        self.d.text(
            (8 * SCALE, bar_h / 2),
            "DESIGN PREVIEW  ·  rendered from repo tokens  ·  NOT A SCREENSHOT",
            font=font("semibold", 9),
            fill=rgb("#FFFFFF"),
            anchor="lm",
        )
        self.d.text(
            (W * SCALE - 8 * SCALE, bar_h / 2),
            note,
            font=font("medium", 8),
            fill=rgb("#9A9A9A"),
            anchor="rm",
        )


def device_frame(c: Canvas, p: dict):
    """Status + safe-area top so compositions are judged at real proportions."""
    c.text((20, 44), "9:41", "semibold", 13, p["textPrimary"])
    c.text((W - 20, 44), "5G  ▮", "medium", 11, p["textMuted"], anchor="ra")


# ── screens ────────────────────────────────────────────────────────────────
def vault_home(scheme: str):
    p = palette(scheme)
    c = Canvas(p["background"])
    device_frame(c, p)
    y = 86

    # masthead — kicker + editorial serif + accent rule
    c.text((20, y), "THE VAULT", "semibold", 10, p["textMuted"], tracking=1.4)
    y += 20
    c.text((20, y), "Enter their world", "serifBold", 25, p["textPrimary"])
    y += 40
    c.rect((20, y, 46, y + 2), p["brand"], radius=1)
    y += 26

    # scope control
    c.rect((20, y, W - 20, y + 34), p["surfaceSunken"], radius=10)
    c.text((W / 2, y + 17), "Discover    Following    Mine", "medium", 12, p["textSecondary"], anchor="mm")
    y += 52

    # featured creator world — the one hero moment
    c.rect((20, y, W - 20, y + 196), p["surface"], radius=16, outline=p["border"])
    c.rect((21, y + 1, W - 21, y + 120), p["brandSoft"], radius=15)
    c.text((36, y + 30), "FEATURED WORLD", "semibold", 9, p["brand"], tracking=1.3)
    c.text((36, y + 48), "Mara Okonjo", "serifBold", 22, p["textPrimary"])
    c.text((36, y + 78), "Sound design & field recording", "regular", 12, p["textSecondary"])
    c.rect((36, y + 140, 138, y + 170), p["pill"], radius=15)
    c.text((87, y + 155), "Enter world", "semibold", 11, p["pillText"], anchor="mm")
    c.text((W - 36, y + 155), "12 drops", "medium", 11, p["textMuted"], anchor="rm")
    y += 216

    # row header
    c.text((20, y), "TODAY", "semibold", 9, p["textMuted"], tracking=1.3)
    y += 18
    c.text((20, y), "New this morning", "serifBold", 18, p["textPrimary"])
    c.text((W - 20, y + 4), "See all", "medium", 11, p["textSecondary"], anchor="ra")
    y += 34

    # two editorial cards, different compositions (not identical tiles)
    for i, (title, meta) in enumerate(
        [("The quiet between tracks", "Mara Okonjo · 8 min"), ("Hood acoustics, recorded", "Ito Lab · field notes")]
    ):
        h = 92
        c.rect((20, y, W - 20, y + h), p["surface"], radius=14, outline=p["border"])
        c.rect((34, y + 18, 96, y + 74), p["surfaceSunken"], radius=8)
        c.text((110, y + 22), title, "semibold", 14, p["textPrimary"])
        c.wrap((110, y + 44), "A short piece on the space a record leaves behind.", "regular", 11, p["textMuted"], 220, 15)
        c.text((110, y + 74), meta, "medium", 9, p["textSecondary"], tracking=0.2)
        y += h + 12

    dock(c, p, active="Drops", vault=True)
    c.save(f"vault-home-{scheme}.png", scheme)


def profile(scheme: str):
    p = palette(scheme)
    c = Canvas(p["background"])
    device_frame(c, p)
    y = 84

    # avatar + overflow
    c.rect((20, y, 108, y + 88), p["brandSoft"], radius=44)
    c.text((64, y + 44), "MO", "serifBold", 30, p["brand"], anchor="mm")
    c.text((W - 20, y + 6), "•••", "semibold", 15, p["textMuted"], anchor="ra")
    y += 108

    c.text((20, y), "Mara Okonjo", "serifBold", 29, p["textPrimary"])
    y += 42
    c.text((20, y), "@maraok", "regular", 14, p["textMuted"])
    y += 30
    c.wrap((20, y), "Sound designer. Recording the quiet parts of cities. Building in the Vault.", "regular", 14, p["textPrimary"], 330, 21)
    y += 64

    # follow CTA
    c.rect((20, y, 132, y + 36), p["pill"], radius=18)
    c.text((76, y + 18), "Following", "semibold", 12, p["pillText"], anchor="mm")
    c.text((150, y + 18), "Message", "medium", 12, p["textSecondary"], anchor="lm")
    y += 60

    # editorial stats — numerals, not a cramped meta line
    cols = [("1.2k", "FOLLOWERS"), ("84", "FOLLOWING"), ("2,940", "REPUTATION")]
    x = 20
    for i, (v, l) in enumerate(cols):
        c.text((x, y), v, "serifBold", 24, p["gold"] if l == "REPUTATION" else p["textPrimary"])
        c.text((x, y + 32), l, "semibold", 8, p["textMuted"], tracking=1.2)
        x += 118
        if i < 2:
            c.rect((x - 24, y + 4, x - 23, y + 44), p["divider"])
    y += 66
    c.rect((20, y, W - 20, y + 1), p["divider"])
    y += 22

    # tabs
    for i, t in enumerate(["Takes", "Replies", "Clashes"]):
        xx = 20 + i * 78
        active = i == 0
        c.text((xx, y), t, "semibold" if active else "medium", 13, p["textPrimary"] if active else p["textMuted"])
        if active:
            c.rect((xx, y + 24, xx + 26, y + 26), p["brand"], radius=1)
    y += 48

    # take cards
    for title, meta in [("Cities are louder than we admit", "182 reactions · 24 replies"), ("What a room does to a chord", "96 reactions · 11 replies")]:
        c.rect((20, y, W - 20, y + 76), p["surface"], radius=12, outline=p["border"])
        c.text((34, y + 18), title, "semibold", 13, p["textPrimary"])
        c.text((34, y + 42), meta, "regular", 10, p["textMuted"])
        y += 88

    dock(c, p, active="Profile", vault=False)
    c.save(f"profile-{scheme}.png", scheme)


def glyph(c, cx, cy, kind, color, size=8.0, width=1.8):
    """Minimal stroked iconography, matched to the Lucide set the app uses.

    Drawn as strokes rather than filled blocks: a filled square reads as a
    placeholder and immediately cheapens an otherwise considered composition.
    """
    d, S = c.d, SCALE
    r = size * S
    col = rgb(color, c.bg)
    w = max(int(width * S), 1)

    def line(x1, y1, x2, y2):
        d.line([(cx * S + x1, cy * S + y1), (cx * S + x2, cy * S + y2)], fill=col, width=w)

    if kind == 'home':
        line(-r, r * 0.15, 0, -r * 0.85)
        line(0, -r * 0.85, r, r * 0.15)
        line(-r * 0.55, r * 0.1, -r * 0.55, r * 0.85)
        line(r * 0.55, r * 0.1, r * 0.55, r * 0.85)
        line(-r * 0.55, r * 0.85, r * 0.55, r * 0.85)
    elif kind == 'explore':
        d.ellipse([cx * S - r, cy * S - r, cx * S + r, cy * S + r], outline=col, width=w)
        line(-r * 0.35, r * 0.35, r * 0.45, -r * 0.45)
        line(r * 0.45, -r * 0.45, r * 0.1, r * 0.1)
    elif kind == 'activity':
        d.rounded_rectangle([cx * S - r * 0.75, cy * S - r, cx * S + r * 0.75, cy * S + r * 0.5],
                            radius=int(r * 0.35), outline=col, width=w)
        line(-r * 0.3, r * 0.5, -r * 0.5, r * 0.95)
        line(-r * 0.3, r * 0.5, r * 0.1, r * 0.5)
    elif kind == 'profile':
        d.ellipse([cx * S - r * 0.42, cy * S - r, cx * S + r * 0.42, cy * S - r * 0.16], outline=col, width=w)
        d.arc([cx * S - r * 0.9, cy * S - r * 0.1, cx * S + r * 0.9, cy * S + r * 1.5], 200, 340, fill=col, width=w)
    elif kind == 'drops':
        line(0, -r, 0, r * 0.55)
        d.arc([cx * S - r * 0.7, cy * S + r * 0.35, cx * S + r * 0.7, cy * S + r * 0.95], 0, 180, fill=col, width=w)
    elif kind == 'collections':
        d.rectangle([cx * S - r * 0.8, cy * S - r * 0.8, cx * S + r * 0.8, cy * S + r * 0.8], outline=col, width=w)
        line(-r * 0.8, 0, r * 0.8, 0)
        line(0, -r * 0.8, 0, r * 0.8)
    elif kind == 'plus':
        line(-r * 0.8, 0, r * 0.8, 0)
        line(0, -r * 0.8, 0, r * 0.8)
    elif kind == 'switch':
        d.ellipse([cx * S - r * 0.8, cy * S - r * 0.8, cx * S + r * 0.8, cy * S + r * 0.8], outline=col, width=w)
        line(-r * 0.4, 0, r * 0.4, 0)
        line(0, -r * 0.4, 0, r * 0.4)


def dock(c: Canvas, p: dict, active: str, vault: bool):
    """Mirrors RealmTabBar: active plate, glyph-only siblings, raised Create disc."""
    h = 56
    top = H - 34 - h
    c.rect((20, top, W - 20, top + h), p["surface"], radius=24, outline=p["border"])

    if vault:
        items = [("drops", "Drops"), ("", ""), ("collections", "Collections"), ("", ""), ("profile", "Profile")]
    else:
        items = [("home", "Home"), ("explore", "Explore"), ("", ""), ("activity", "Activity"), ("profile", "Profile")]
    slot_w = (W - 40) / (len(items) + 1)
    for i, (kind, lab) in enumerate(items):
        cx = 20 + slot_w * (i + 0.5)
        cy = top + h / 2
        if kind == "":
            # Create: raised solid disc, the one action the product is named after.
            c.rect((cx - 17, cy - 17, cx + 17, cy + 17), p["textPrimary"], radius=17)
            glyph(c, cx, cy, "plus", p["background"], size=8.5, width=2.2)
            continue
        is_active = lab == active
        if is_active:
            c.rect((cx - 23, cy - 16, cx + 23, cy + 16), p["brandSoft"], radius=8, outline=p["border"])
        glyph(c, cx, cy, kind, p["textPrimary"] if is_active else p["textMuted"],
              size=8.0, width=2.0 if is_active else 1.7)
    # realm seam + switch affordance
    c.rect((W - 46, top + 18, W - 45, top + h - 18), p["divider"])
    glyph(c, W - 33, top + h / 2, "switch", p["textMuted"], size=7.0, width=1.6)


def arena_verdict(scheme: str):
    """The signature moment: a verdict reveal. This is where AURA has to earn it."""
    p = palette(scheme)
    c = Canvas(p["background"])
    device_frame(c, p)

    c.text((20, 74), "VERDICT", "semibold", 9, p["textMuted"], tracking=1.5)
    y = 106
    c.text((20, y), "Side A edged it", "serifBold", 30, p["textPrimary"])
    y += 44
    c.wrap((20, y), "One juror crossed. The closing argument carried the other two.", "regular", 13, p["textSecondary"], 320, 20)
    y += 56

    # the score — one giant editorial numeral pair, the hero
    c.rect((20, y, W - 20, y + 146), p["surface"], radius=18, outline=p["border"])
    c.text((60, y + 56), "2", "serifBold", 64, p["sideA"], anchor="mm")
    c.text((W / 2, y + 50), "—", "serif", 30, p["textMuted"], anchor="mm")
    c.text((W - 60, y + 56), "1", "serifBold", 64, p["sideB"], anchor="mm")
    # Two short lines instead of one long tracked line: the previous single
    # label overflowed the card at 390pt, which is exactly the kind of thing a
    # real device check would catch and a mockup hides.
    c.text((60, y + 102), "SIDE A", "semibold", 9, p["sideA"], anchor="mm", tracking=1.3)
    c.text((60, y + 118), "Agree", "regular", 11, p["sideA"], anchor="mm")
    c.text((W - 60, y + 102), "SIDE B", "semibold", 9, p["sideB"], anchor="mm", tracking=1.3)
    c.text((W - 60, y + 118), "Disagree", "regular", 11, p["sideB"], anchor="mm")
    c.text((W / 2, y + 136), "SPLIT DECISION · 3 JURORS", "medium", 9, p["textMuted"], anchor="mm", tracking=0.8)
    y += 172

    # reward ledger, stated plainly
    c.text((20, y), "SETTLEMENT", "semibold", 9, p["textMuted"], tracking=1.4)
    y += 20
    rows = [
        ("Mara Okonjo", "+40", "winner", p["gold"]),
        ("Ito Lab", "+15", "participation", p["textSecondary"]),
        ("Juror 1", "+120", "agreed", p["gold"]),
    ]
    for name, delta, note, tone in rows:
        c.rect((20, y, W - 20, y + 52), p["surfaceSunken"], radius=10)
        c.rect((34, y + 12, 62, y + 40), p["brandSoft"], radius=14)
        c.text((48, y + 26), name[0], "serifBold", 14, p["brand"], anchor="mm")
        c.text((76, y + 15), name, "semibold", 12, p["textPrimary"])
        c.text((76, y + 31), note, "regular", 9, p["textMuted"])
        c.text((W - 34, y + 26), delta, "serifBold", 17, tone, anchor="rm")
        y += 60

    # Every result screen needs a forward action: the journey is
    # discover -> participate -> follow outcome -> *return*.
    c.text((20, y), "What happens next", "kicker" and "semibold", 9, p["textMuted"], tracking=1.4)
    y += 20
    for label, primary in [("Share the verdict", True), ("Take the next clash", False)]:
        if primary:
            c.rect((20, y, W - 20, y + 44), p["pill"], radius=22)
            c.text((W / 2, y + 22), label, "semibold", 12, p["pillText"], anchor="mm")
        else:
            c.rect((20, y, W - 20, y + 44), p["surface"], radius=22, outline=p["border"])
            c.text((W / 2, y + 22), label, "semibold", 12, p["textPrimary"], anchor="mm")
        y += 54

    dock(c, p, active="Home", vault=False)
    c.save(f"arena-verdict-{scheme}.png", scheme)


def gallery(scheme: str):
    """Mobile-readable contact sheet: 2 columns, big enough to judge at 390pt."""
    p = palette(scheme)
    names = ["vault-home", "profile", "arena-verdict"]
    tiles = [Image.open(OUT / f"{n}-{scheme}.png") for n in names]

    gut, label_h, head_h = 12, 24, 78
    tw, th = 300, 649  # 390x844 scaled to 300 wide
    cols = 2
    rows = (len(tiles) + cols - 1) // cols
    cw = gut + cols * (tw + gut)
    ch = head_h + rows * (th + label_h + gut) + gut

    sheet = Image.new("RGB", (cw, ch), rgb(p["background"]))
    d = ImageDraw.Draw(sheet)
    tfont = ImageFont.truetype(FONTS["serifBold"], 24)
    d.text((gut, 26), f"AURA · {scheme.upper()}", font=tfont, fill=rgb(p["textPrimary"]))
    sfont = ImageFont.truetype(FONTS["regular"], 10)
    sub = "design previews · not screenshots"
    d.text((gut, 32 + tfont.getbbox("A")[3]), sub, font=sfont, fill=rgb(p["textMuted"]))

    titles = {"vault-home": "Vault home", "profile": "Profile / creator identity", "arena-verdict": "Arena verdict"}
    for i, (img, n) in enumerate(zip(tiles, names)):
        r, col = divmod(i, cols)
        x = gut + col * (tw + gut)
        y = head_h + r * (th + label_h + gut)
        sheet.paste(img.resize((tw, int(th))), (x, y))
        d.rectangle([x, y, x + tw, y + th], outline=rgb(p["border"], p["background"]))
        d.text((x, y + th + 7), titles[n], font=ImageFont.truetype(FONTS["semibold"], 12), fill=rgb(p["textPrimary"]))

    path = OUT / f"gallery-{scheme}.png"
    sheet.save(path, optimize=True)
    print(f"  wrote {path.relative_to(ROOT)}  ({cw}x{ch})")


def tokens_sheet():
    """Design-system overview: both schemes side by side, real values."""
    L, D = palette("light"), palette("dark")
    Wt, Ht = 1000, 1180
    sheet = Image.new("RGB", (Wt, Ht), rgb(L["background"]))
    d = ImageDraw.Draw(sheet)

    def F(face, s):
        return ImageFont.truetype(FONTS[face], s)

    d.text((40, 34), "CLASH · AURA", font=F("semibold", 13), fill=rgb(L["brand"]))
    d.text((40, 56), "Design system", font=F("serifBold", 40), fill=rgb(L["textPrimary"]))
    d.text((40, 108), "Editorial serif voice · warm/cool duel pair · one brand accent · hairline depth", font=F("regular", 14), fill=rgb(L["textMuted"]))

    # splits: light | dark
    mid = 500
    for idx, (p, x0, label) in enumerate([(L, 0, "LIGHT"), (D, mid, "DARK")]):
        d.rectangle([x0, 150, x0 + mid, Ht], fill=rgb(p["background"]))
        d.text((x0 + 40, 170), label, font=F("semibold", 11), fill=rgb(p["textMuted"]))
        y = 200

        # type specimens
        d.text((x0 + 40, y), "Aa", font=F("serifBold", 62), fill=rgb(p["textPrimary"]))
        d.text((x0 + 128, y + 12), "Display — platform serif", font=F("regular", 13), fill=rgb(p["textSecondary"]))
        d.text((x0 + 128, y + 32), "33 / 39 · −0.7", font=F("medium", 11), fill=rgb(p["textMuted"]))
        y += 92
        d.text((x0 + 40, y), "Aa", font=F("semibold", 34), fill=rgb(p["textPrimary"]))
        d.text((x0 + 108, y + 6), "UI — Inter", font=F("regular", 13), fill=rgb(p["textSecondary"]))
        y += 62
        d.text((x0 + 40, y), "THE VAULT · 1.4 tracking", font=F("semibold", 10), fill=rgb(p["textMuted"]))
        y += 40

        # swatches
        d.text((x0 + 40, y), "SEMANTIC", font=F("semibold", 9), fill=rgb(p["textMuted"]))
        y += 20
        sw = [
            ("brand", p["brand"]), ("signature", p["signature"]), ("gold", p["gold"]),
            ("sideA", p["sideA"]), ("sideB", p["sideB"]), ("danger", p["danger"]),
        ]
        for i, (name, col) in enumerate(sw):
            cx = x0 + 40 + (i % 3) * 92
            cy = y + (i // 3) * 74
            d.rounded_rectangle([cx, cy, cx + 78, cy + 38], radius=8, fill=rgb(col, p["background"]))
            d.text((cx, cy + 44), name, font=F("medium", 9), fill=rgb(p["textSecondary"]))
        y += 168

        # surfaces
        d.text((x0 + 40, y), "SURFACES", font=F("semibold", 9), fill=rgb(p["textMuted"]))
        y += 20
        for name, col in [("background", p["background"]), ("surface", p["surface"]), ("elevated", p["surfaceElevated"]), ("sunken", p["surfaceSunken"])]:
            d.rounded_rectangle([x0 + 40, y, x0 + 180, y + 30], radius=7, fill=rgb(col, p["background"]), outline=rgb(p["border"], p["background"]))
            d.text((x0 + 192, y + 9), name, font=F("medium", 10), fill=rgb(p["textSecondary"]))
            y += 38

        # ── lower band: spacing, radius, elevation, motion ──────────────────
        ly = 800
        d.text((x0 + 40, ly), "SPACING  ·  4 / 8 / 12 / 16 / 20 / 24 / 32 / 40", font=F("semibold", 9), fill=rgb(p["textMuted"]))
        ly += 22
        bx = x0 + 40
        for sp in [4, 8, 12, 16, 20, 24, 32, 40]:
            d.rectangle([bx, ly, bx + sp * 2, ly + 10], fill=rgb(p["brand"], p["background"]))
            d.text((bx, ly + 16), str(sp), font=F("medium", 8), fill=rgb(p["textMuted"]))
            bx += sp * 2 + 12

        ly += 56
        d.text((x0 + 40, ly), "RADIUS  ·  8 / 10 / 12 / 16 / 18 / 24 / pill", font=F("semibold", 9), fill=rgb(p["textMuted"]))
        ly += 22
        bx = x0 + 40
        for rad in [8, 10, 12, 16, 18, 24]:
            d.rounded_rectangle([bx, ly, bx + 40, ly + 40], radius=rad, outline=rgb(p["borderStrong"], p["background"]), width=1,
                                fill=rgb(p["surface"], p["background"]))
            bx += 50

        ly += 66
        d.text((x0 + 40, ly), "DEPTH  ·  hairline + one tone step (no glow, no blur)", font=F("semibold", 9), fill=rgb(p["textMuted"]))
        ly += 22
        for i, nm in enumerate(["flat", "raised", "overlay"]):
            d.rounded_rectangle([x0 + 40 + i * 96, ly, x0 + 40 + i * 96 + 84, ly + 40], radius=12,
                                fill=rgb(p["surfaceElevated"], p["background"]), outline=rgb(p["border"], p["background"]))
            d.text((x0 + 40 + i * 96, ly + 46), nm, font=F("medium", 9), fill=rgb(p["textSecondary"]))

        ly += 76
        d.text((x0 + 40, ly), "MOTION  ·  enter 240ms · exit 160ms · overlay 280ms", font=F("semibold", 9), fill=rgb(p["textMuted"]))
        ly += 20
        d.text((x0 + 40, ly), "every value gated by useReducedMotion()", font=F("regular", 10), fill=rgb(p["textMuted"]))

    sheet.save(OUT / "design-system.png", optimize=True)
    print(f"  wrote docs/aura/preview/design-system.png")


def main():
    print("Rendering AURA design previews (NOT screenshots)…")
    for scheme in ("dark", "light"):
        vault_home(scheme)
        profile(scheme)
        arena_verdict(scheme)
        gallery(scheme)
    tokens_sheet()
    print("done.")


if __name__ == "__main__":
    main()
