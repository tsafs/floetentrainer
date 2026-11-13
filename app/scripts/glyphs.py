"""Liest die benötigten Zeichen aus Bravura (heft/fonts/bravura.otf) und schreibt sie als SVG-Pfade
nach src/music/bravura.ts. Einheiten: Zwischenraum = 1, y nach unten (wie SVG).

Aufruf (aus app/):  python3 scripts/glyphs.py   (braucht fontTools: pip install fonttools)
"""
import os
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.boundsPen import BoundsPen
from fontTools.pens.transformPen import TransformPen

HERE = os.path.dirname(os.path.abspath(__file__))
FONT = os.path.join(HERE, "..", "..", "heft", "fonts", "bravura.otf")
OUT = os.path.join(HERE, "..", "src", "music", "bravura.ts")

GLYPHS = {"clef": 0xE050, "whole": 0xE0A2, "sharp": 0xE262, "flat": 0xE260,
          # für den Notensatz der Lieder (src/songs/engrave.ts)
          "half": 0xE0A3, "black": 0xE0A4, "natural": 0xE261, "dot": 0xE1E7,
          "flag8Up": 0xE240, "flag8Down": 0xE241, "flag16Up": 0xE242, "flag16Down": 0xE243,
          "rest1": 0xE4E3, "rest2": 0xE4E4, "rest4": 0xE4E5, "rest8": 0xE4E6, "rest16": 0xE4E7,
          "breath": 0xE4CE}
GLYPHS.update({f"time{n}": 0xE080 + n for n in range(10)})  # Ziffern der Taktangabe
GLYPHS.update({f"tuplet{n}": 0xE880 + n for n in range(10)})  # Ziffern der Triolen (ABC-Lieder)

font = TTFont(FONT)
upem = font["head"].unitsPerEm
sp = upem / 4  # ein Zwischenraum
cmap = font.getBestCmap()
gs = font.getGlyphSet()


def fmt(v):
    s = f"{v:.3f}".rstrip("0").rstrip(".")
    return "0" if s in ("-0", "") else s


lines = [
    "// Automatisch erzeugt von scripts/glyphs.py aus Bravura (SIL Open Font License 1.1,",
    "// siehe public/fonts/OFL-Bravura.txt). Einheiten: 1 = ein Notenlinien-Zwischenraum, y nach unten.",
    "export interface Glyph { d: string; x0: number; y0: number; x1: number; y1: number; adv: number }",
    "export const GLYPHS: Record<string, Glyph> = {",
]
for key, cp in GLYPHS.items():
    name = cmap[cp]
    g = gs[name]
    pen = SVGPathPen(gs, fmt)
    # Skalieren auf Zwischenräume und y umdrehen
    g.draw(TransformPen(pen, (1 / sp, 0, 0, -1 / sp, 0, 0)))
    d = pen.getCommands()
    bp = BoundsPen(gs)
    g.draw(bp)
    x0, y0, x1, y1 = bp.bounds
    lines.append(
        f'  {key}: {{ d: "{d}", x0: {fmt(x0 / sp)}, y0: {fmt(-y1 / sp)}, x1: {fmt(x1 / sp)}, '
        f"y1: {fmt(-y0 / sp)}, adv: {fmt(g.width / sp)} }},"
    )
lines.append("};")
with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(lines) + "\n")
print("geschrieben:", OUT)

# ---------------------------------------------------------------- Laufweiten EB Garamond
# Für den Notensatz der Lieder: Silbenbreiten ohne DOM berechnen (Umbruch im Voraus, auch in Vitest).
# Kerning wird nicht berücksichtigt (macht bei Silben nur Bruchteile eines Pixels aus).
TEXT_OUT = os.path.join(HERE, "..", "src", "music", "garamond.ts")
FONTS = os.path.join(HERE, "..", "src", "fonts")


def widths(fname):
    f = TTFont(os.path.join(FONTS, fname))
    em = f["head"].unitsPerEm
    cm = f.getBestCmap()
    hm = f["hmtx"]
    chars = [c for c in sorted(cm) if c >= 0x20 and c != 0xFFFD]
    return "".join(chr(c) for c in chars), [round(hm[cm[c]][0] * 1000 / em) for c in chars]


def js_str(s):
    return "".join(ch if ch.isprintable() and ch not in '"\\' else f"\\u{ord(ch):04x}" for ch in s)


tl = [
    "// Automatisch erzeugt von scripts/glyphs.py aus den EB-Garamond-Schnitten in src/fonts",
    "// (SIL Open Font License 1.1, siehe public/fonts/OFL-EB-Garamond.txt).",
    "// Laufweiten in Tausendstel der Schriftgröße, je Zeichen in derselben Reihenfolge wie die Zeichenkette.",
]
for key, fname in (("regular", "eb-garamond-latin-400-normal.woff2"), ("italic", "eb-garamond-latin-400-italic.woff2")):
    chars, ws = widths(fname)
    tl.append(f'export const {key.upper()}_CHARS = "{js_str(chars)}";')
    tl.append(f"export const {key.upper()}_WIDTHS = [{','.join(map(str, ws))}];")
with open(TEXT_OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(tl) + "\n")
print("geschrieben:", TEXT_OUT)
