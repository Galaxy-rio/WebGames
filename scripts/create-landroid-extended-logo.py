"""Outline the local AOSP font so SVG image rendering never substitutes fonts."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path('.cache/font-tools').resolve()))
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

font = TTFont('public/fonts/landroid-extended-mono.ttf')
glyphs = font.getGlyphSet()
cmap = font.getBestCmap()
units = font['head'].unitsPerEm
paths = []
for text, size, spacing, baseline, color in [
    ('LANDROID', 80, 6, 85, '#eeeeff'),
    ('extended', 26, 12, 150, '#c6ff00'),
]:
    x = 3
    scale = size / units
    for char in text:
        glyph = glyphs[cmap[ord(char)]]
        pen = SVGPathPen(glyphs)
        glyph.draw(TransformPen(pen, (scale, 0, 0, -scale, x, baseline)))
        paths.append(f'<path fill="{color}" d="{pen.getCommands()}"/>')
        x += glyph.width * scale + spacing
svg = '<svg xmlns="http://www.w3.org/2000/svg" width="465" height="177" viewBox="0 0 465 177">\n'
svg += '<!-- Glyph outlines from AOSP DroidSansMono, Apache-2.0. See /licenses/landroid-extended.txt. -->\n'
svg += '\n'.join(paths) + '\n</svg>\n'
Path('public/images/landroid-extended-logo.svg').write_text(svg, encoding='utf-8')
print('Created portable vector lettering for Landroid extended.')
