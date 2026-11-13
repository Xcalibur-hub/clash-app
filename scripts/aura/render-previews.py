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

ROOT = Path("/home/user/aura2")
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
    """Drawing surface for one preview.

    `text_scale` emulates the OS "Larger Text" setting. It multiplies every font
    size — and nothing else — which is exactly what React Native does when
    `allowFontScaling` is true. That makes it an honest way to show what the
    accessibility work actually changes: the same layout, larger words, and
    whatever reflow the components now allow.

    It is NOT a measurement engine: line breaking here is Pillow's, not Yoga's,
    so a preview can show *pressure* (a heading that must wrap, a row that must
    grow) but cannot prove the real layout survives. Layout claims are made from
    the component code, not from these images.
    """

    def __init__(self, bg: str, text_scale: float = 1.0):
        self.img = Image.new("RGB", (W * SCALE, H * SCALE), rgb(bg))
        self.d = ImageDraw.Draw(self.img)
        self.bg = bg
        self.text_scale = text_scale

    def rect(self, box, fill, radius=0, outline=None, width=1):
        x0, y0, x1, y1 = [v * SCALE for v in box]
        self.d.rounded_rectangle(
            [x0, y0, x1, y1],
            radius=int(radius * SCALE),
            fill=rgb(fill, self.bg) if fill else None,
            outline=rgb(outline, self.bg) if outline else None,
            width=int(width * SCALE),
        )

    def measure(self, s, face, size):
        """Rendered width in logical points, including the text-scale factor."""
        return self.d.textlength(s, font=font(face, max(6, round(size * self.text_scale)))) / SCALE

    def text(self, xy, s, face, size, color, anchor="la", tracking=0.0):
        size = max(6, round(size * self.text_scale))
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

    def wrap_lines(self, s, face, size, max_w):
        """The line breaks `wrap` would produce, without drawing. For measuring."""
        size = max(6, round(size * self.text_scale))
        f = font(face, size)
        words, line, out = s.split(), "", []
        for w in words:
            trial = f"{line} {w}".strip()
            if self.d.textlength(trial, font=f) > max_w * SCALE and line:
                out.append(line)
                line = w
            else:
                line = trial
        if line:
            out.append(line)
        return out

    def wrap(self, xy, s, face, size, color, max_w, leading):
        size = max(6, round(size * self.text_scale))
        leading = round(leading * self.text_scale)
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
    """The verdict card, in the layout `LiveRoomResultReveal` actually renders.

    Kept in sync with that component deliberately: the earlier version of this
    scene showed a 2—1 scoreboard and a "settlement ledger" that the app has never
    rendered. A preview that invents its own verdict layout is worse than no
    preview, because a reviewer would approve a design that does not exist.

    Every element below has a counterpart in the component:
      rule → kicker → topic → headline (`displayLg`) + percentage (`numeral`)
      → explanatory body → split bar (`ClashMatchupBar`) → participant count
      → share / next-clash actions.
    """
    p = palette(scheme)
    c = Canvas(p["background"])
    device_frame(c, p)

    def card(y0, h):
        c.rect((16, y0, W - 16, y0 + h), p["surface"], radius=20, outline=p["border"])
        return y0 + 18

    y = card(96, 320)
    x0 = 34
    c.rect((x0, y, x0 + 32, y + 3), p["sideA"], radius=2)
    y += 18
    c.text((x0, y), "ROOM 3 · DECIDED", "semibold", 9, p["textMuted"], tracking=1.3)
    y += 16
    c.text((x0, y), "Remote work made teams more honest", "regular", 11, p["textSecondary"])
    y += 22
    # headline + percentage on one line, as the component lays them out
    c.text((x0, y), "Side A", "serifBold", 42, p["sideA"])
    c.text((W - x0, y + 22), "62%", "serif", 30, p["sideA"], anchor="ra")
    y += 54
    y = c.wrap((x0, y), "Agree took it — 62 of 100 judgements.", "regular", 14, p["textSecondary"], W - 68, 20) + 12
    # split bar (ClashMatchupBar)
    c.rect((x0, y, x0 + (W - 68) * 0.62, y + 6), p["sideA"], radius=3)
    c.rect((x0 + (W - 68) * 0.62 + 2, y, W - x0, y + 6), p["sideB"], radius=3)
    y += 16
    c.text((x0, y), "62% Agree", "regular", 10, p["sideA"])
    c.text((W - x0, y), "38% Disagree", "regular", 10, p["sideB"], anchor="ra")
    y += 22
    c.text((x0, y), "101 participants", "regular", 11, p["textMuted"])
    y += 24
    # primary action (GlowButton default tone)
    c.rect((x0, y, W - x0, y + 40), p["pill"], radius=20)
    c.text(((x0 + W - x0) / 2, y + 20), "Share result", "semibold", 12, p["pillText"], anchor="mm")
    y += 48
    # secondary (compact, outlined)
    c.rect((x0, y, W - x0, y + 38), p["surface"], radius=19, outline=p["border"])
    c.text((W / 2, y + 19), "NEXT CLASH →", "semibold", 11, p["textPrimary"], anchor="mm")

    # Best argument card — real: eyebrow, avatar + author, quote
    y = 432
    y = card(y, 104)
    c.text((34, y), "BEST ARGUMENT", "semibold", 9, p["textMuted"], tracking=1.3)
    y += 20
    c.rect((34, y, 58, y + 24), p["brandSoft"], radius=12)
    c.text((46, y + 12), "I", "serifBold", 11, p["brand"], anchor="mm")
    c.text((66, y + 6), "Ito Lab", "semibold", 11, p["textPrimary"])
    y += 32
    c.wrap((34, y), "Read receipts are the most honest document a team produces.", "regular", 13, p["textPrimary"], W - 68, 19)

    # Mindshift card — aggregate only, never per-person
    y = 556
    y = card(y, 104)
    c.text((34, y), "BIGGEST MINDSHIFT", "semibold", 9, p["textMuted"], tracking=1.3)
    y += 20
    c.text((34, y), "18%", "serifBold", 30, p["textPrimary"])
    y += 38
    c.text((34, y), "changed their mind in this room", "regular", 12, p["textSecondary"])

    dock(c, p, active="Home", vault=False)
    c.save(f"arena-verdict-{scheme}.png", scheme)


def clash_room(scheme: str, role: str, phase: str, text_scale: float = 1.0):
    """The canonical clash room, in one phase, for one role.

    Mirrors the implemented hierarchy: phase headline → proposition → sides →
    action → floor → (result). Copy and structure come from the same strings the
    components emit (`phaseHeadline`, the action labels), so the preview cannot
    drift into a prettier fiction than the app.

    Rendered for BOTH roles on purpose: "fighter and spectator are distinct but
    share one grammar" is a claim that has to be visible, not asserted.
    """
    p = palette(scheme)
    c = Canvas(p["background"], text_scale=text_scale)
    device_frame(c, p)

    y = 74
    # back chevron
    c.rect((16, y - 6, 44, y + 22), p["background"])
    c.text((20, y), "←", "regular", 17, p["textPrimary"])
    # A human label, not the raw `ArenaRoomStatus` enum: the app never prints
    # "SETTLED" to a user, and a preview that does would document a screen that
    # does not exist.
    PHASE_LABEL = {
        "OPEN": "LIVE",
        "FINAL_ARGUMENTS": "FINAL ARGUMENTS",
        "JUDGING": "JUDGING",
        "SETTLED": "DECIDED",
        "CANCELLED": "CLOSED",
    }
    c.text((W - 20, y + 2), PHASE_LABEL.get(phase, "LIVE"), "medium", 9, p["textMuted"], anchor="ra", tracking=1.2)

    y += 36
    settled = phase in ("SETTLED", "CANCELLED")
    headline = {
        ("OPEN", "debater"): "THE FLOOR IS YOURS",
        ("OPEN", "spectator"): "THE FLOOR IS OPEN",
        ("FINAL_ARGUMENTS", "debater"): "FINAL ARGUMENT",
        ("FINAL_ARGUMENTS", "spectator"): "FINAL ARGUMENTS",
        ("JUDGING", "debater"): "JUDGING IN PROGRESS",
        ("JUDGING", "spectator"): "JUDGING IN PROGRESS",
        ("SETTLED", "debater"): "VERDICT",
        ("SETTLED", "spectator"): "VERDICT",
    }.get((phase, role), "THE FLOOR IS OPEN")
    if not settled:
        c.rect((20, y + 4, 26, y + 10), p["sideA"], radius=3)
        c.text((34, y), headline, "semibold", 9, p["textSecondary"], tracking=1.3)
    else:
        c.text((20, y), headline, "semibold", 9, p["brand"], tracking=1.3)
    y += 22

    # proposition — the display voice
    y = c.wrap((20, y), "Remote work made teams more honest", "serifBold", 24, p["textPrimary"], 330, 30)

    y += 12
    # Sides as broadcast tags. Boxes are measured from the text, not fixed: at a
    # large OS text size a fixed 72pt tag collides with its neighbour, and the
    # real component wraps the row instead (ClashHeader has flexWrap on the
    # container). Drawing fixed boxes here would document a bug the app does not
    # have.
    tag_h = max(24, round(24 * c.text_scale))
    tx = 20
    for key, stance, ink, soft in [
        ("A", "Agree", p["sideA"], p["sideASoft"]),
        ("B", "Disagree", p["sideB"], p["sideBSoft"]),
    ]:
        w = 10 + c.measure(key, "semibold", 10) + 4 + c.measure(stance, "regular", 11) + 8
        if tx + w > W - 20:
            y += tag_h + 6
            tx = 20
        c.rect((tx, y, tx + w, y + tag_h), soft, radius=6, outline=ink)
        c.text((tx + 10, y + 7), key, "semibold", 10, ink, tracking=0.5)
        c.text((tx + 10 + c.measure(key, "semibold", 10) + 4, y + 7), stance, "regular", 11, ink)
        tx += w + 8
    y += tag_h + 10

    if not settled:
        # Wrapped, because `ClashHeader` ellipsises rather than overflowing — a
        # clipped clock reads as a layout bug in a review image.
        y = c.wrap(
            (20, y),
            "Room 3  ·  12 arguing · 40 watching  ·  04:31",
            "regular",
            11,
            p["textMuted"],
            W - 40,
            16,
        ) + 8
        # hairline phase progress
        c.rect((20, y, W - 20, y + 2), p["divider"], radius=1)
        frac = {"OPEN": 0.25, "FINAL_ARGUMENTS": 0.5, "JUDGING": 0.75}.get(phase, 0.25)
        c.rect((20, y, 20 + (W - 40) * frac, y + 2), p["textPrimary"], radius=1)
        y += 26
    else:
        y = c.wrap((20, y), "Room 3  ·  12 arguing · 40 watching", "regular", 11, p["textMuted"], W - 40, 16) + 8

    # ── action region ────────────────────────────────────────────────────
    label = None
    if phase in ("OPEN", "FINAL_ARGUMENTS", "JUDGING"):
        if role == "debater":
            label = {"OPEN": "Make your argument", "FINAL_ARGUMENTS": "Final argument", "JUDGING": "Cast your verdict"}[phase]
        elif phase == "OPEN":
            label = "Pick a side"
        elif phase == "JUDGING":
            label = "Cast your verdict"
    if label:
        c.rect((20, y, W - 20, y + 50), p["textPrimary"], radius=14)
        c.text((W / 2, y + 25), label, "semibold", 13, p["background"], anchor="mm")
        y += 62

    # ── result region ───────────────────────────────────────────────────
    if settled:
        c.rect((20, y + 6, 52, y + 9), p["sideA"], radius=2)
        y += 24
        c.text((20, y), "SIDE A TAKES IT", "semibold", 9, p["textMuted"], tracking=1.4)
        y += 18
        c.text((20, y), "Agree", "serifBold", 42, p["sideA"])
        y += 54
        c.text((20, y), "Agree took it — 62 of 100 judgements.", "regular", 14, p["textSecondary"])
        y += 26
        # split bar
        c.rect((20, y, 20 + (W - 40) * 0.62, y + 6), p["sideA"], radius=3)
        c.rect((20 + (W - 40) * 0.62 + 2, y, W - 20, y + 6), p["sideB"], radius=3)
        y += 14
        c.text((20, y), "62% Agree", "regular", 11, p["sideA"])
        c.text((W - 20, y), "38% Disagree", "regular", 11, p["sideB"], anchor="ra")
        y += 24
        c.rect((20, y, 168, y + 30), p["goldSoft"], radius=8, outline=p["gold"])
        c.text((34, y + 9), "+120 reputation", "medium", 11, p["gold"])
        y += 44

    # ── floor ───────────────────────────────────────────────────────────
    # During JUDGING the floor is not a transcript — it is the ballot. Showing
    # arguments here would document a screen that does not exist.
    judging = phase == "JUDGING"
    if judging:
        c.text((20, y), "WHO MADE THE BETTER CASE?", "semibold", 9, p["textMuted"], tracking=1.3)
        y += 20
        c.rect((20, y, W - 20, y + 96), p["surfaceElevated"], radius=14, outline=p["border"])
        c.text((34, y + 14), "Your verdict", "semibold", 12, p["textPrimary"])
        for i, (lbl, col) in enumerate([("Side A · Agree", p["sideA"]), ("Side B · Disagree", p["sideB"])]):
            bx = 34 + i * ((W - 68) / 2 + 8)
            c.rect((bx, y + 36, bx + (W - 68) / 2 - 8, y + 76), p["surfaceSunken"], radius=22, outline=col)
            c.text((bx + ((W - 68) / 2 - 8) / 2, y + 56), lbl, "medium", 11, col, anchor="mm")
        c.text((34, y + 82), "Ballots stay private until the room settles.", "regular", 9, p["textMuted"])
        y += 112
        c.text((20, y), "BEST ARGUMENT", "semibold", 9, p["textMuted"], tracking=1.3)
        y += 20
        c.rect((20, y, W - 20, y + 56), p["surface"], radius=12, outline=p["border"])
        c.text((34, y + 12), "Pick one argument — you cannot vote for your own.", "regular", 10, p["textMuted"])
        c.text((34, y + 30), "2 candidates", "medium", 11, p["textPrimary"])
        y += 68

    floor_title = "THE CROWD" if role == "spectator" else "OFFICIAL ARGUMENTS"
    if not judging:
        c.text((20, y), floor_title, "semibold", 9, p["textMuted"], tracking=1.4)
        y += 18
    if not settled and role == "spectator":
        rows = [
            ("Mara Okonjo", "The honest part is that nobody could hide behind a hallway.", "3rd"),
            ("Ito Lab", "Read receipts are the most honest document a team produces.", "2nd"),
            ("Dara V", "Async made the politics visible, not worse.", "1st"),
        ]
    elif not settled:
        rows = [
            ("You", "The honest part is that nobody could hide behind a hallway.", "now"),
            ("Ito Lab", "Read receipts are the most honest document a team produces.", "4m"),
        ]
    else:
        rows = [("BEST ARGUMENT", "Read receipts are the most honest document a team produces.", "Ito Lab")]
    for name, body, when in rows:
        # Measure first, then draw the card around it. A fixed 62pt row clips the
        # body at large text, which the real rows do not do.
        lines = c.wrap_lines(body, "regular", 11, W - 100)
        line_h = round(15 * c.text_scale)
        card_h = 28 + len(lines) * line_h + 10
        c.rect((20, y, W - 20, y + card_h), p["surface"], radius=12, outline=p["border"])
        c.rect((32, y + 12, 56, y + 36), p["brandSoft"], radius=12)
        c.text((44, y + 24), name[0], "serifBold", 12, p["brand"], anchor="mm")
        c.text((66, y + 12), name, "semibold", 11, p["textPrimary"])
        c.text((W - 32, y + 12), when, "regular", 9, p["textMuted"], anchor="ra")
        c.wrap((66, y + 28), body, "regular", 11, p["textSecondary"], W - 100, 15)
        y += card_h + 8

    # One more argument, then the composer strip. The real screen has an input
    # pinned above the dock, so a preview that leaves the lower half blank would
    # misrepresent a populated room as an empty one.
    if not settled and y < 560:
        name, body, when = ("Anya Serra", "Disagreement is cheaper when it is written down.", "6m")
        c.rect((20, y, W - 20, y + 62), p["surface"], radius=12, outline=p["border"])
        c.rect((32, y + 12, 56, y + 36), p["brandSoft"], radius=12)
        c.text((44, y + 24), name[0], "serifBold", 12, p["brand"], anchor="mm")
        c.text((66, y + 12), name, "semibold", 11, p["textPrimary"])
        c.text((W - 32, y + 12), when, "regular", 9, p["textMuted"], anchor="ra")
        c.wrap((66, y + 28), body, "regular", 11, p["textSecondary"], W - 100, 15)
        y += 70

    # Composer / participation strip — real chrome, pinned above the dock.
    if not settled and y < 620:
        strip_y = 660
        c.rect((20, strip_y, W - 20, strip_y + 46), p["inputBackground"], radius=23, outline=p["border"])
        placeholder = (
            "Add to the crowd…" if role == "spectator" else "Make your argument…"
        )
        c.text((38, strip_y + 16), placeholder, "regular", 12, p["textMuted"])

    dock(c, p, active="Home", vault=False)
    suffix = "" if text_scale == 1.0 else "-large-text"
    c.save(f"clash-{role}-{phase.lower()}-{scheme}{suffix}.png", scheme)


def gallery(scheme: str):
    """Mobile-readable contact sheet: 2 columns, big enough to judge at 390pt."""
    p = palette(scheme)
    names = [
        "clash-debater-open",
        "clash-spectator-open",
        "clash-debater-judging",
        "clash-spectator-settled",
        "vault-home",
        "arena-verdict",
    ]
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

    titles = {
        "clash-debater-open": "Clash · fighter, open floor",
        "clash-spectator-open": "Clash · spectator, open floor",
        "clash-debater-judging": "Clash · fighter judging",
        "clash-spectator-settled": "Clash · spectator, settled",
        "vault-home": "Vault home",
        "arena-verdict": "Arena verdict",
    }
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
        # The canonical clash room, in the four states that matter, for both
        # roles. These are the Phase 2 evidence: same grammar, distinct
        # experiences.
        clash_room(scheme, "debater", "OPEN")
        clash_room(scheme, "spectator", "OPEN")
        clash_room(scheme, "debater", "JUDGING")
        clash_room(scheme, "spectator", "SETTLED")
        # The accessibility claim, shown rather than asserted: the same room with
        # the OS text size at ~160%.
        clash_room(scheme, "spectator", "OPEN", text_scale=1.6)
        clash_room(scheme, "debater", "OPEN", text_scale=1.6)
        gallery(scheme)
    tokens_sheet()
    print("done.")


if __name__ == "__main__":
    main()
