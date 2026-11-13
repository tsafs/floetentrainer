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

GLYPHS = {"clef": 0xE050, "whole": 0xE0A2, "sharp": 0xE262, "flat": 0xE260}

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
