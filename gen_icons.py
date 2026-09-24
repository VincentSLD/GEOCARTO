# -*- coding: utf-8 -*-
"""Génère les icônes PNG de la PWA GéoCarto (logo GC, fond sombre, ambre)."""
import os
from PIL import Image, ImageDraw, ImageFont

BG = (26, 26, 26, 255)       # #1a1a1a
FG = (245, 197, 24, 255)     # #f5c518
TEXT = "GC"
SS = 4                       # supersampling
OUT = os.path.join(os.path.dirname(__file__), "icons")
os.makedirs(OUT, exist_ok=True)

FONT_CANDIDATES = [
    r"C:\Windows\Fonts\arialbd.ttf",
    r"C:\Windows\Fonts\segoeuib.ttf",
    r"C:\Windows\Fonts\ariblk.ttf",
    r"C:\Windows\Fonts\calibrib.ttf",
]

def load_font(px):
    for path in FONT_CANDIDATES:
        if os.path.exists(path):
            return ImageFont.truetype(path, px)
    return ImageFont.load_default()

def fit_font(draw, target_w):
    """Trouve la taille de police pour que 'GC' occupe target_w px de large."""
    size = 10
    while True:
        f = load_font(size)
        bbox = draw.textbbox((0, 0), TEXT, font=f)
        w = bbox[2] - bbox[0]
        if w >= target_w or size > 4000:
            return f
        size += 4

def draw_text_centered(img, text_w_frac):
    d = ImageDraw.Draw(img)
    W, H = img.size
    f = fit_font(d, W * text_w_frac)
    bbox = d.textbbox((0, 0), TEXT, font=f)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (W - tw) / 2 - bbox[0]
    y = (H - th) / 2 - bbox[1]
    d.text((x, y), TEXT, font=f, fill=FG)

def make_rounded(size, radius_frac=0.1875, text_frac=0.62):
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * radius_frac), fill=BG)
    draw_text_centered(img, text_frac)
    return img.resize((size, size), Image.LANCZOS)

def make_maskable(size, text_frac=0.50):
    """Fond plein bord à bord + logo dans la zone de sécurité (~60% central)."""
    S = size * SS
    img = Image.new("RGBA", (S, S), BG)
    draw_text_centered(img, text_frac)
    return img.resize((size, size), Image.LANCZOS)

def save(img, name):
    path = os.path.join(OUT, name)
    img.save(path, "PNG")
    print("  ->", os.path.relpath(path, os.path.dirname(__file__)))

print("Génération des icônes PWA :")
save(make_rounded(192), "icon-192.png")
save(make_rounded(512), "icon-512.png")
save(make_maskable(512), "icon-512-maskable.png")
save(make_maskable(180), "apple-touch-icon.png")   # iOS applique son propre masque
save(make_rounded(32, radius_frac=0.15, text_frac=0.72), "favicon-32.png")
save(make_rounded(16, radius_frac=0.12, text_frac=0.78), "favicon-16.png")
print("Terminé.")
