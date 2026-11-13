import os, sys, html
from engrave import *
from songs import SONGS

OUT = os.path.join(HERE, "out")
os.makedirs(OUT, exist_ok=True)

CSS = """
@font-face { font-family: 'Bravura'; src: url('../fonts/bravura.otf'); }
@font-face { font-family: 'EB Garamond'; font-weight: 400; src: url('../fonts/eb-garamond-latin-400-normal.woff2'); }
@font-face { font-family: 'EB Garamond'; font-weight: 400; font-style: italic; src: url('../fonts/eb-garamond-latin-400-italic.woff2'); }
@font-face { font-family: 'EB Garamond'; font-weight: 500; src: url('../fonts/eb-garamond-latin-500-normal.woff2'); }
@font-face { font-family: 'Source Sans 3'; font-weight: 400; src: url('../fonts/source-sans-3-latin-400-normal.woff2'); }
@font-face { font-family: 'Source Sans 3'; font-weight: 600; src: url('../fonts/source-sans-3-latin-600-normal.woff2'); }
@page { size: A4; margin: 0; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: #fff; }
body { font-family: 'EB Garamond', serif; color: #2b2724; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.page { width: 210mm; height: 297mm; padding: 17mm 18mm 0 18mm; position: relative; overflow: hidden; page-break-after: always; break-after: page; }
.page:last-child { page-break-after: auto; break-after: auto; }
.folio { position: absolute; bottom: 11mm; left: 0; right: 0; text-align: center; font-family: 'Source Sans 3'; font-size: 7.5pt; letter-spacing: 0.12em; color: #a39a90; }
.kicker { font-family: 'Source Sans 3'; font-size: 7.5pt; letter-spacing: 0.22em; text-transform: uppercase; color: #9c8462; }
h1 { font-weight: 400; font-size: 30pt; letter-spacing: 0.02em; margin: 1.5mm 0 0 0; line-height: 1.1; }
h2 { font-weight: 400; font-size: 17pt; margin: 0; line-height: 1.15; }
.rule { width: 22mm; height: 0; border-top: 0.35mm solid #cdb68f; margin: 5mm 0 0 0; }
.meta { font-family: 'Source Sans 3'; font-size: 7.3pt; letter-spacing: 0.14em; text-transform: uppercase; color: #9c8462; margin-top: 1.6mm; }
.credit { font-style: italic; font-size: 9.5pt; color: #8c8379; margin-top: 0.8mm; }
.num { font-family: 'Source Sans 3'; font-size: 7.5pt; letter-spacing: 0.16em; color: #b8a27e; margin-bottom: 0.8mm; }
svg { display: block; overflow: visible; }
.small { font-size: 10.5pt; line-height: 1.45; }
.sans { font-family: 'Source Sans 3'; }
"""


def page(content, folio=None):
    f = f'<div class="folio">{folio}</div>' if folio else ""
    return f'<div class="page">{content}{f}</div>'


def doc(title, pages):
    return (f'<!doctype html><html lang="de"><head><meta charset="utf-8"><title>{title}</title>'
            f'<style>{CSS}</style></head><body>{"".join(pages)}</body></html>')


W = 174.0  # Satzspiegel-Breite in mm


def chart_events(names):
    ev = []
    for n in names:
        base = n[:-1]
        o = {"¹": "'", "²": "''", "³": "'''"}[n[-1]]
        ev.append(dict(kind="note", dur=1, dot=False, q=4, tie=False, slur_start=False, slur_end=False,
                       p=parse_pitch(base + o)))
    return ev


# =========================================================== Grifftabelle
def legend_svg():
    H = 64.0
    w = 96.0
    parts = []
    cx = 26.0
    top = 2.0
    parts.append(flute("xxxxoooo", cx, top, H))
    k = H / FL["total_h"]
    tx = cx + FL["thumb"][0] * k
    ty = top + FL["thumb"][1] * k
    lab = 'font-family="&apos;Source Sans 3&apos;" font-size="2.55" fill="#8c8379" letter-spacing="0.05"'
    lab2 = 'font-family="EB Garamond" font-size="3.6" fill="#2b2724"'
    # Daumen-Beschriftung links
    parts.append(f'<line x1="{tx - 1.6:.2f}" y1="{ty:.2f}" x2="{tx - 6:.2f}" y2="{ty:.2f}" stroke="#bfb3a5" stroke-width="0.2"/>')
    parts.append(f'<text x="{tx - 6.8:.2f}" y="{ty + 0.9:.2f}" text-anchor="end" {lab}>Daumen</text>')
    parts.append(f'<text x="{tx - 6.8:.2f}" y="{ty + 4.0:.2f}" text-anchor="end" {lab}>(hinten)</text>')
    # Lochnummern rechts
    rx = cx + 8.5 * k + 2.0
    for i, hy in enumerate(FL["holes_y"]):
        y = top + hy * k
        parts.append(f'<text x="{rx:.2f}" y="{y + 0.9:.2f}" {lab}>{i + 1}</text>')
    # Klammern
    def brace(y1, y2, text1, text2):
        x = rx + 4.0
        parts.append(f'<path d="M{x:.2f},{y1:.2f} h1.2 V{y2:.2f} h-1.2" fill="none" stroke="#bfb3a5" stroke-width="0.22"/>')
        ym = (y1 + y2) / 2
        parts.append(f'<text x="{x + 3:.2f}" y="{ym - 0.4:.2f}" {lab2}>{text1}</text>')
        parts.append(f'<text x="{x + 3:.2f}" y="{ym + 3.6:.2f}" {lab}>{text2}</text>')
    brace(top + (FL["holes_y"][0] - 4) * k, top + (FL["holes_y"][2] + 4) * k, "linke Hand", "Löcher 1 – 3")
    brace(top + (FL["holes_y"][3] - 4) * k, top + (FL["holes_y"][6] + 4) * k, "rechte Hand", "Löcher 4 – 7, davon 6 und 7 doppelt")
    return f'<svg width="{w}mm" height="{H + 4}mm" viewBox="0 0 {w} {H + 4}">' + "".join(parts) + "</svg>"


def symbol_key_svg():
    rows = [("x", "geschlossen"), ("o", "offen"), ("h", "halb")]
    parts = []
    r = 1.55
    y = 3
    for st, t in rows:
        x = 3
        if st == "x":
            parts.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{HOLE}" stroke="{HOLE}" stroke-width="0.25"/>')
        elif st == "o":
            parts.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{HOLE_OPEN}" stroke="{HOLE}" stroke-width="0.25"/>')
        else:
            parts.append(f'<path d="M{x},{y - r} A{r},{r} 0 0 0 {x},{y + r} Z" fill="{HOLE}"/>'
                         f'<circle cx="{x}" cy="{y}" r="{r}" fill="none" stroke="{HOLE}" stroke-width="0.25"/>')
        parts.append(f'<text x="{x + 4.2}" y="{y + 1.25}" font-family="EB Garamond" font-size="3.7" fill="{INK}">{t}</text>')
        y += 7.2
    return f'<svg width="40mm" height="{y - 2.5}mm" viewBox="0 0 40 {y - 2.5}">' + "".join(parts) + "</svg>"


def grifftabelle(scale_names=True, as_pages=False, folios=("1", "2")):
    sp = 1.85
    names1 = CHART_ORDER[:12]
    names2 = CHART_ORDER[12:]
    r1, h1 = render_staff_system(chart_events(names1), sp, W, "C", base=12.4, diag_h=34.0,
                                 whole_heads=True, show_lyrics=False, name_size=3.0, stretch_max=3,
                                 trailing_open=True)
    r2, h2 = render_staff_system(chart_events(names2), sp, W, "C", base=11.4, diag_h=34.0,
                                 whole_heads=True, show_lyrics=False, name_size=3.0, stretch_max=3,
                                 trailing_open=True)
    head = ('<div class="kicker">Sopranblockflöte in C · barocke Griffweise</div>'
            '<h1>Grifftabelle</h1><div class="rule"></div>')
    rows = (f'<div style="margin-top:11mm">{r1}</div>'
            f'<div style="margin-top:9mm">{r2}</div>')
    legend = f"""
    <div style="display:flex; gap:6mm; margin-top:13mm; align-items:flex-start">
      <div style="flex:0 0 96mm; margin-left:-1mm">{legend_svg()}</div>
      <div style="flex:1; padding-top:2mm">
        <div class="kicker" style="margin-bottom:3mm">Zeichen</div>
        {symbol_key_svg()}
        <div class="small" style="margin-top:2mm; color:#5d554d">Halb: Daumen einen Spalt öffnen,<br>bei 6 und 7 nur das große Loch zu.</div>
        <div class="kicker" style="margin:8mm 0 3mm 0">Drei Tipps</div>
        <div class="small">Zuerst h¹, a¹ und g¹ lernen,<br>die tiefen Töne zuletzt.</div>
        <div class="small" style="margin-top:2mm">Weich anblasen, als würdest du „dü“ sagen.</div>
        <div class="small" style="margin-top:2mm">Quietscht es, ist meist ein Loch<br>nicht ganz zu.</div>
      </div>
    </div>"""
    p1 = page(head + rows + legend, folios[0])

    # Tonleitern
    SCALES = [
        ("G-Dur", "G", "g' a' h' c'' d'' e'' fis'' g''", "Ab e² bleibt der Daumen einen Spalt offen."),
        ("C-Dur", "C", "c' d' e' f' g' a' h' c''", "Das tiefe c¹ braucht ganz dichte Löcher und wenig Luft."),
        ("F-Dur", "F", "f' g' a' b' c'' d'' e'' f''", "b¹ ist ein Gabelgriff: 1 und 3 zu, 2 offen, dazu 4."),
        ("D-Dur", "D", "d' e' fis' g' a' h' cis'' d''", "cis² greifst du ohne Daumen, nur mit 1 und 2."),
        ("a-Moll", "a", "a' h' c'' d'' e'' f'' g'' a''", "Natürliches Moll, ganz ohne Vorzeichen."),
        ("d-Moll", "d", "d' e' f' g' a' b' c'' d''", "Natürliches Moll, mit b¹."),
    ]
    blocks = []
    for title, key, notes, hint in SCALES:
        up = notes.split()
        seq = up + up[-2::-1]
        ev = [dict(kind="note", dur=1, dot=False, q=4, tie=False, slur_start=False, slur_end=False,
                   p=parse_pitch(n)) for n in seq]
        svg, h = render_staff_system(ev, 1.75, W, key, base=9.4, show_diagrams=False, whole_heads=True,
                                     show_lyrics=False, show_names=scale_names, name_size=2.75, stretch_max=3, trailing_open=True,
                                     justify=as_pages)
        blocks.append(f'<div style="margin-top:8.5mm"><div style="display:flex; align-items:baseline; gap:4mm">'
                      f'<h2 style="font-size:14.5pt">{title}</h2>'
                      f'<span class="credit" style="margin:0">{hint}</span></div>'
                      f'<div style="margin-top:0.5mm">{svg}</div></div>')
    head2 = ('<div class="kicker">Sopranblockflöte in C · barocke Griffweise</div>'
             '<h1>Übe-Tonleitern</h1><div class="rule"></div>'
             '<div class="small" style="margin-top:5mm; color:#5d554d">Langsam spielen, jeden Ton gleich lang. '
             'Erst aufwärts, dann abwärts.</div>')
    p2 = page(head2 + "".join(blocks), folios[1])
    if as_pages:
        return p1, p2
    return doc("Grifftabelle Blockflöte", [p1, p2])


# =========================================================== Liederheft
def song_block(i, s, sp=1.6, diag_h=19.5, base=8.1):
    items, msgs = check_and_assign(s)
    assert not any("!!!" in m for m in msgs), (s["title"], msgs)
    systems, cur = [], []
    for it in items:
        if it["kind"] == "break":
            systems.append(cur)
            cur = []
        else:
            cur.append(it)
    if cur:
        systems.append(cur)
    # Bar am Systemanfang entfernen
    systems = [[e for k, e in enumerate(sy) if not (k == 0 and e["kind"] == "bar")] for sy in systems]
    ps = [it["p"] for it in items if it["kind"] == "note"]
    lo = min(ps, key=lambda p: p["pos"])
    hi = max(ps, key=lambda p: p["pos"])
    svgs, total = [], 0.0
    ext = extents([e for sy in systems for e in sy])
    for k, sy in enumerate(systems):
        open_end = sy[-1]["kind"] != "bar"
        svg, h = render_staff_system(sy, sp, W, s["key"], time_sig=s["time"] if k == 0 else None,
                                     base=base, diag_h=diag_h, lyr_size=3.55, name_size=2.2,
                                     stretch_max=1.6, trailing_open=open_end, ext=ext)
        svgs.append(svg)
        total += h
    gap = 5.5
    total += gap * (len(svgs) - 1)
    sub = f' <span style="font-style:italic; color:#8c8379; font-size:12pt">· {s["subtitle"]}</span>' if s.get("subtitle") else ""
    head = (f'<div class="num">{i:02d}</div><h2>{html.escape(s["title"])}{sub}</h2>'
            f'<div class="meta">{s["keyname"]} · {s["time"][0]}/{s["time"][1]}-Takt · Töne {disp_name(lo)} – {disp_name(hi)}</div>'
            f'<div class="credit">{html.escape(s["credit"])}</div>')
    head_h = 23.0
    body = "".join(f'<div style="margin-top:{(6.5 if k == 0 else gap)}mm">{v}</div>' for k, v in enumerate(svgs))
    return f'<div class="song">{head}{body}</div>', head_h + 6.5 + total, (lo, hi)


def liederheft():
    AVAIL = 297 - 17 - 21
    SONG_GAP = 12.0
    blocks = [song_block(i + 1, s) for i, s in enumerate(SONGS)]
    pages_c, cur, cur_h = [], [], 0.0
    page_of = []
    for b, h, _ in blocks:
        need = h + (SONG_GAP if cur else 0)
        if cur and cur_h + need > AVAIL:
            pages_c.append(cur)
            cur, cur_h = [], 0.0
            need = h
        if h > AVAIL:
            print("ZU HOCH:", h, file=sys.stderr)
        cur.append(b)
        cur_h += need
        page_of.append(len(pages_c) + 2)
    if cur:
        pages_c.append(cur)
    # Titelseite mit Inhalt
    rows = []
    for i, (s, pg) in enumerate(zip(SONGS, page_of)):
        lo, hi = blocks[i][2]
        rows.append(f'<tr><td class="n">{i + 1:02d}</td><td>{html.escape(s["title"])}</td>'
                    f'<td class="k">{s["keyname"]} · {disp_name(lo)}–{disp_name(hi)}</td><td class="p">{pg}</td></tr>')
    toc = f"""
    <style>
      table.toc {{ border-collapse: collapse; width: 100%; margin-top: 4mm; }}
      table.toc td {{ padding: 1.55mm 0; font-size: 12pt; border-bottom: 0.2mm solid #efe7da; }}
      table.toc td.n {{ font-family: 'Source Sans 3'; font-size: 7.5pt; letter-spacing: .14em; color: #b8a27e; width: 10mm; }}
      table.toc td.k {{ font-family: 'Source Sans 3'; font-size: 7.5pt; letter-spacing: .08em; color: #9c8462; text-align: right; padding-right: 7mm; }}
      table.toc td.p {{ font-family: 'Source Sans 3'; font-size: 8pt; color: #8c8379; text-align: right; width: 8mm; }}
    </style>"""
    demo = flute("xxxxoooo", 9, 1, 32)
    cover = f"""{toc}
    <div class="kicker">Sopranblockflöte in C · barocke Griffweise</div>
    <h1>Liederheft</h1>
    <div class="credit" style="font-size:12pt; margin-top:1.5mm">Kinder- und Weihnachtslieder, von leicht nach schwer</div>
    <div class="rule"></div>
    <div style="display:flex; gap:7mm; margin-top:9mm; align-items:center">
      <svg width="18mm" height="34mm" viewBox="0 0 18 34">{demo}</svg>
      <div class="small" style="color:#5d554d; max-width:120mm">
        Über jeder Note steht ihr Griff: <svg style="display:inline-block; vertical-align:-0.45mm" width="3.2mm" height="3.2mm" viewBox="0 0 3.2 3.2"><circle cx="1.6" cy="1.6" r="1.3" fill="#2b2724" stroke="#2b2724" stroke-width="0.25"/></svg> zu, <svg style="display:inline-block; vertical-align:-0.45mm" width="3.2mm" height="3.2mm" viewBox="0 0 3.2 3.2"><circle cx="1.6" cy="1.6" r="1.3" fill="#fffdf8" stroke="#2b2724" stroke-width="0.25"/></svg> offen, <svg style="display:inline-block; vertical-align:-0.45mm" width="3.2mm" height="3.2mm" viewBox="0 0 3.2 3.2"><path d="M1.6,0.30000000000000004 A1.3,1.3 0 0 0 1.6,2.9000000000000004 Z" fill="#2b2724"/><circle cx="1.6" cy="1.6" r="1.3" fill="none" stroke="#2b2724" stroke-width="0.25"/></svg> halb.
        Links das Daumenloch auf der Rückseite, dann die Löcher 1–3 der linken
        und 4–7 der rechten Hand. Unter der Note stehen ihr Name und die Silbe zum Mitsingen.
      </div>
    </div>
    <div class="kicker" style="margin-top:12mm">Inhalt</div>
    <table class="toc">{''.join(rows)}</table>"""
    pages = [page(cover)]
    for n, pc in enumerate(pages_c):
        inner = f'<div style="height:{12.0}mm"></div>'.join(pc)
        pages.append(page(inner, str(n + 2)))
    return doc("Liederheft Blockflöte", pages)


if __name__ == "__main__":
    open(os.path.join(OUT, "grifftabelle.html"), "w").write(grifftabelle())
    open(os.path.join(OUT, "liederheft.html"), "w").write(liederheft())
    print("ok")
