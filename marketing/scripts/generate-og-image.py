#!/usr/bin/env python3
"""Generate the 1200x630 social share (Open Graph / Twitter) image.

Run from the marketing/ directory:  python3 scripts/generate-og-image.py
Output: public/og-image.png

This produces a static, brand-consistent card so link previews on
Twitter/X, LinkedIn, Facebook, WhatsApp and Slack render correctly.
"""
import os
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG_TOP = (12, 12, 19)        # #0c0c13
BG_BOTTOM = (9, 9, 11)       # #09090b  (brand --background)
ACCENT_LIGHT = (175, 200, 240)  # #afc8f0
ACCENT_DARK = (121, 165, 234)   # #79a5ea
WHITE = (245, 246, 250)
MUTED = (150, 156, 170)

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
LOGO_PATH = os.path.join(ROOT, "src", "assets", "kourti-logo.png")
OUT_PATH = os.path.join(ROOT, "public", "og-image.png")

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/Library/Fonts/Arial.ttf",
    "/System/Library/Fonts/SFNS.ttf",
]
FONT_REG_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/SFNS.ttf",
]


def load_font(candidates, size):
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                continue
    return ImageFont.load_default()


def vertical_gradient(w, h, top, bottom):
    base = Image.new("RGB", (w, h), top)
    draw = ImageDraw.Draw(base)
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        draw.line([(0, y), (w, y)], fill=(r, g, b))
    return base


def radial_glow(w, h, center, radius, color, max_alpha=110):
    glow = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    cx, cy = center
    steps = 60
    for i in range(steps, 0, -1):
        rr = int(radius * i / steps)
        a = int(max_alpha * (1 - i / steps))
        gd.ellipse([cx - rr, cy - rr, cx + rr, cy + rr], fill=color + (a,))
    return glow


def main():
    img = vertical_gradient(W, H, BG_TOP, BG_BOTTOM).convert("RGBA")

    # Soft brand glow, upper-left
    img = Image.alpha_composite(img, radial_glow(W, H, (210, 150), 520, ACCENT_DARK, 70))
    img = Image.alpha_composite(img, radial_glow(W, H, (1080, 560), 460, ACCENT_LIGHT, 45))

    draw = ImageDraw.Draw(img)

    margin = 90

    # Logo (scaled to ~64px tall)
    try:
        logo = Image.open(LOGO_PATH).convert("RGBA")
        target_h = 70
        ratio = target_h / logo.height
        logo = logo.resize((int(logo.width * ratio), target_h), Image.LANCZOS)
        img.alpha_composite(logo, (margin, 92))
    except Exception as e:
        print("logo skipped:", e)

    # Headline
    f_head = load_font(FONT_CANDIDATES, 72)
    f_sub = load_font(FONT_REG_CANDIDATES, 34)
    f_small = load_font(FONT_REG_CANDIDATES, 28)

    line1 = "Run your law practice"
    line2 = "on AI."
    y = 250
    draw.text((margin, y), line1, font=f_head, fill=WHITE)
    bbox = draw.textbbox((margin, y), line1, font=f_head)
    y2 = bbox[3] + 6
    draw.text((margin, y2), line2, font=f_head, fill=ACCENT_LIGHT)

    # Subtitle
    sub = "Matters · Contracts · Deadlines · Document AI"
    sb = draw.textbbox((margin, y2), line2, font=f_head)
    draw.text((margin, sb[3] + 28), sub, font=f_sub, fill=MUTED)

    # Accent underline bar
    draw.rounded_rectangle([margin, 215, margin + 120, 223], radius=4, fill=ACCENT_DARK)

    # URL bottom-right
    url = "kourti.com"
    ub = draw.textbbox((0, 0), url, font=f_small)
    draw.text((W - margin - (ub[2] - ub[0]), H - 70), url, font=f_small, fill=ACCENT_LIGHT)

    img.convert("RGB").save(OUT_PATH, "PNG", optimize=True)
    print("wrote", OUT_PATH, img.size)


if __name__ == "__main__":
    main()
