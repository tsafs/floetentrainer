"""Liederheft v2: Grifftabelle vorn, danach nur Noten (ohne Griffbilder und Namen)."""
import os, sys, math, html
from engrave import *
from build import page, doc, W, OUT, grifftabelle
from build_bw import bw
from songs import SONGS, EXERCISES

PAGE_AVAIL = 297 - 17 - 21  # nutzbare Höhe in mm
KICKER = '<div class="kicker">Sopranblockflöte in C · barocke Griffweise</div>'


def split_systems(items):
    systems, cur = [], []
    for it in items:
        if it["kind"] == "break":
            systems.append(cur)
            cur = []
        else:
            cur.append(it)
    if cur:
        systems.append(cur)
    return [[e for k, e in enumerate(sy) if not (k == 0 and e["kind"] == "bar" and not e.get("rep_start"))]
            for sy in systems]


def render_systems(items, key, time, sp=1.75, base=6.4, lyrics=True, gap=4.5, top=5.0):
    systems = split_systems(items)
    ext = extents([e for sy in systems for e in sy])
    meter = time
    svgs, total = [], 0.0
    for k, sy in enumerate(systems):
        open_end = sy[-1]["kind"] != "bar"
        svg, h = render_staff_system(sy, sp, W, key, time_sig=time if k == 0 else None, meter=meter,
                                     base=base, show_diagrams=False, show_names=False,
                                     show_lyrics=lyrics, lyr_size=3.7, stretch_max=1.7,
                                     trailing_open=open_end, ext=ext, justify=True)
        for e in sy:
            if e["kind"] == "time":
                meter = (e["num"], e["den"])
        svgs.append(svg)
        total += h
    body = "".join(f'<div style="margin-top:{(top if k == 0 else gap)}mm">{v}</div>' for k, v in enumerate(svgs))
    return body, total + 5.0 + gap * (len(svgs) - 1)


def stanza_block(s):
    st = s.get("stanzas") or []
    if not st:
        return "", 0.0
    lines = [x.split(" / ") for x in st]
    maxlen = max(len(l) for x in lines for l in x)
    cols = 3 if maxlen <= 30 else (2 if maxlen <= 48 else 1)
    if len(st) == 1:
        cols = 1
    if len(st) == 2 and cols == 3:
        cols = 2
    if s.get("stanza_cols"):
        cols = s["stanza_cols"]
    LH = 4.75
    rows = [lines[i:i + cols] for i in range(0, len(lines), cols)]
    h = sum(max(len(x) for x in r) * LH + 3.5 for r in rows) + 5.0
    items = []
    for n, x in enumerate(lines):
        items.append(f'<div class="stz"><span class="stn">{n + 2}.</span>'
                     + "<br>".join(html.escape(l) for l in x) + "</div>")
    note = ""
    if s.get("stanza_note"):
        note = f'<div class="credit" style="margin:0 0 2mm 0">{html.escape(s["stanza_note"])}</div>'
        h += 5.5
    return (f'<div style="margin-top:4.5mm; padding-left:9mm">{note}<div class="stanzas" '
            f'style="grid-template-columns: repeat({cols}, 1fr)">{"".join(items)}</div></div>'), h


def song_block(i, s):
    items, msgs = check_and_assign(s)
    assert not any("!!!" in m for m in msgs), (s["title"], msgs)
    ps = [it["p"] for it in items if it["kind"] == "note"]
    lo = min(ps, key=lambda p: p["pos"])
    hi = max(ps, key=lambda p: p["pos"])
    body, h_sys = render_systems(items, s["key"], s["time"], lyrics=bool(s.get("lyrics")))
    stz, h_stz = stanza_block(s)
    sub = f' <span style="font-style:italic; font-size:12pt">· {s["subtitle"]}</span>' if s.get("subtitle") else ""
    head = (f'<div class="num">{i:02d}</div><h2>{html.escape(s["title"])}{sub}</h2>'
            f'<div class="meta">{s["keyname"]} · {s["time"][0]}/{s["time"][1]}-Takt · Töne {disp_name(lo)} – {disp_name(hi)}</div>'
            f'<div class="credit">{html.escape(s["credit"])}</div>')
    return f'<div class="song">{head}{body}{stz}</div>', 21.0 + h_sys + h_stz, (lo, hi)


# ------------------------------------------------------------- Grundlagen
def notevalues_svg():
    sp = 1.9
    width = W
    n = 8
    step = width / n
    y0 = 14.0  # unterste Linie

    def Y(p):
        return y0 - p * sp / 2

    parts = []
    for r in range(5):
        parts.append(f'<line x1="0" y1="{Y(2 * r):.2f}" x2="{width:.2f}" y2="{Y(2 * r):.2f}" stroke="{INK}" stroke-width="{0.13 * sp:.3f}"/>')
    items = [("whole", 0, "Ganze", "4 Schläge"), ("half", 0, "Halbe", "2 Schläge"),
             ("black", 0, "Viertel", "1 Schlag"), ("black", 8, "Achtel", "½ Schlag"),
             ("beam", 0, "2 Achtel", "zusammen 1 Schlag"), ("black", 16, "Sechzehntel", "¼ Schlag"),
             ("half", "dot", "punktierte|Halbe", "3 Schläge"), ("black", "dot", "punktierte|Viertel", "1½ Schläge")]
    pos = 3  # a'
    for k, (hd, extra, name, cnt) in enumerate(items):
        cx = step * (k + 0.5)
        y = Y(pos)
        hw = (1.688 if hd == "whole" else 1.18) * sp
        if hd == "beam":
            xs = [cx - 2.2, cx + 2.2]
            for xx in xs:
                parts.append(glyph(G["black"], xx - 1.18 * sp / 2, y, sp))
            sx = [xx - 1.18 * sp / 2 + 1.12 * sp for xx in xs]
            top = y - 3.5 * sp
            for xx in sx:
                parts.append(f'<line x1="{xx:.2f}" y1="{y - 0.17 * sp:.2f}" x2="{xx:.2f}" y2="{top:.2f}" stroke="{INK}" stroke-width="{0.12 * sp:.3f}"/>')
            parts.append(f'<rect x="{sx[0] - 0.06 * sp:.2f}" y="{top:.2f}" width="{sx[1] - sx[0] + 0.12 * sp:.2f}" height="{0.5 * sp:.2f}" fill="{INK}"/>')
        else:
            parts.append(glyph(G[hd], cx - hw / 2, y, sp))
            if hd != "whole":
                sx = cx - hw / 2 + 1.12 * sp
                top = y - 3.5 * sp
                parts.append(f'<line x1="{sx:.2f}" y1="{y - 0.17 * sp:.2f}" x2="{sx:.2f}" y2="{top:.2f}" stroke="{INK}" stroke-width="{0.12 * sp:.3f}"/>')
                if extra in (8, 16):
                    parts.append(glyph(G["f%du" % extra], sx - 0.06 * sp, top, sp))
            if extra == "dot":
                parts.append(glyph(G["dot"], cx + hw / 2 + 0.35 * sp, Y(pos), sp))
        nl = name.split("|")
        for j, t in enumerate(nl):
            parts.append(f'<text x="{cx:.2f}" y="{y0 + 6.2 + j * 3.9:.2f}" text-anchor="middle" font-family="EB Garamond" font-size="3.5" fill="{INK}">{t}</text>')
        parts.append(f'<text x="{cx:.2f}" y="{y0 + 10.0 + 3.9:.2f}" text-anchor="middle" font-family="&apos;Source Sans 3&apos;" font-size="2.6" fill="{INK}">{cnt}</text>')
    h = y0 + 15.5
    return f'<svg width="{width}mm" height="{h}mm" viewBox="0 0 {width} {h}">' + "".join(parts) + "</svg>"


def rests_svg():
    sp = 1.9
    width = W
    n = 8
    step = width / n
    y0 = 9.5

    def Y(p):
        return y0 - p * sp / 2

    parts = []
    span = step * 5
    for r in range(5):
        parts.append(f'<line x1="0" y1="{Y(2 * r):.2f}" x2="{span:.2f}" y2="{Y(2 * r):.2f}" stroke="{INK}" stroke-width="{0.13 * sp:.3f}"/>')
    items = [("r1", 6, 1.128, "Ganze Pause", "4 Schläge"), ("r2", 4, 1.128, "Halbe Pause", "2 Schläge"),
             ("r4", 4, 1.08, "Viertelpause", "1 Schlag"), ("r8", 4, 0.988, "Achtelpause", "½ Schlag"),
             ("r16", 4, 1.28, "Sechzehntelpause", "¼ Schlag")]
    for k, (g, p, gw, name, cnt) in enumerate(items):
        cx = step * (k + 0.5)
        parts.append(glyph(G[g], cx - gw * sp / 2, Y(p), sp))
        nl = name.split("|")
        for j, t in enumerate(nl):
            parts.append(f'<text x="{cx:.2f}" y="{y0 + 6.2 + j * 3.9:.2f}" text-anchor="middle" font-family="EB Garamond" font-size="3.5" fill="{INK}">{t}</text>')
        parts.append(f'<text x="{cx:.2f}" y="{y0 + 10.0 + 3.9:.2f}" text-anchor="middle" font-family="&apos;Source Sans 3&apos;" font-size="2.6" fill="{INK}">{cnt}</text>')
    h = y0 + 15.5
    return f'<svg width="{width}mm" height="{h}mm" viewBox="0 0 {width} {h}">' + "".join(parts) + "</svg>"


def mini(src, key="C", time=None, width=40.0):
    ev = [e for e in parse_music(src) if e["kind"] != "break"]
    open_end = ev[-1]["kind"] != "bar"
    svg, h = render_staff_system(ev, 1.6, width, key, time_sig=time, base=6.6, show_diagrams=False,
                                 show_names=False, show_lyrics=False, stretch_max=2.2, trailing_open=open_end)
    return svg


def grundlagen_page(folio):
    signs = [
        (mini("g'2 , a'2 |"), "Atemzeichen", "Das kleine Komma über den Noten: Hier holst du Luft – möglichst nur dort."),
        (mini("g'2~ | g'2 |"), "Haltebogen", "Verbindet zwei gleiche Töne. Nur einmal anstoßen und durchklingen lassen."),
        (mini("(g'4 a'4) h'2 |"), "Bindebogen", "Verbindet verschiedene Töne. Nur den ersten anstoßen, dann weich weiterblasen."),
        (mini("fis'2 g'2 |", key="G"), "Ein Kreuz (♯)", "Ein Kreuz am Zeilenanfang gilt für das ganze Lied: Jedes f wird zu fis (G-Dur). "
                                                       "Bei zwei Kreuzen wird zusätzlich jedes c zu cis (D-Dur)."),
        (mini("b'2 a'2 |", key="F"), "Ein b (♭)", "Ein b am Zeilenanfang: Jedes h wird zu b (F-Dur, d-Moll)."),
        (mini("g'4 a'4 h'4 |", time=(3, 4)), "Taktangabe", "3/4: drei Viertel pro Takt, 4/4: vier, 2/4: zwei, "
                                                          "6/8: sechs Achtel (zweimal drei)."),
        (mini("d'4 | g'4 a'4 h'4 |", time=(4, 4)), "Auftakt", "Manche Lieder beginnen mit einem unvollständigen Takt. "
                                                              "Was dort fehlt, fehlt dafür im letzten Takt."),
        (mini("|: g'4 a'4 | [1 h'2 :| [2 c''2 ||"), "Wiederholung",
         "Alles zwischen den Zeichen zweimal spielen. Mit Klammern: beim zweiten Mal Klammer 2 statt Klammer 1."),
    ]
    rows = "".join(
        f'<div style="display:flex; gap:7mm; align-items:center; margin-top:2.6mm">'
        f'<div style="flex:0 0 40mm">{svg}</div>'
        f'<div style="flex:1"><div style="font-size:12pt">{t}</div><div class="small">{d}</div></div></div>'
        for svg, t, d in signs)
    content = (KICKER + '<h1>Noten lesen</h1><div class="rule"></div>'
               '<div class="kicker" style="margin-top:9mm">Notenwerte</div>'
               f'<div style="margin-top:3mm">{notevalues_svg()}</div>'
               '<div class="kicker" style="margin-top:7mm">Pausen</div>'
               f'<div style="margin-top:3mm">{rests_svg()}</div>'
               '<div class="kicker" style="margin-top:7mm">Zeichen</div>'
               f'{rows}')
    return page(content, folio)


def uebungen_page(folio):
    blocks = []
    for title, hint, key, time, src in EXERCISES:
        items = parse_music(src)
        body, h = render_systems(items, key, time, sp=1.6, lyrics=False, gap=1.5, top=1.5)
        blocks.append(f'<div style="margin-top:4.5mm"><div style="display:flex; align-items:baseline; gap:4mm">'
                      f'<h2 style="font-size:14.5pt">{title}</h2><span class="credit" style="margin:0">{hint}</span></div>'
                      f'{body}</div>')
    intro = ('<div class="small" style="margin-top:5mm">Hier stehen nur Noten – die Namen und Griffe findest du in der Grifftabelle. '
             'Erst die Zeile lesen und die Töne laut sagen, dann ohne Blasen greifen, dann langsam spielen. '
             'Das Komma über den Noten heißt: hier atmen.</div>')
    return page(KICKER + '<h1>Erste Übungen</h1><div class="rule"></div>' + intro + "".join(blocks), folio)


EXTRA_CSS = """
.stanzas { display: grid; column-gap: 8mm; row-gap: 3.5mm; }
.stz { font-size: 10.5pt; line-height: 1.32; position: relative; }
.stn { position: absolute; left: -6mm; font-family: 'Source Sans 3'; font-size: 8pt; top: 0.6mm; }
.chapter { margin-bottom: 6mm; }
table.toc { border-collapse: collapse; width: 100%; margin-top: 3mm; }
table.toc td { padding: 0.45mm 0; font-size: 11pt; border-bottom: 0.2mm solid #efe7da; }
table.toc td.n { font-family: 'Source Sans 3'; font-size: 7.5pt; letter-spacing: .14em; color: #b8a27e; width: 10mm; }
table.toc td.k { font-family: 'Source Sans 3'; font-size: 7.5pt; letter-spacing: .08em; color: #9c8462; text-align: right; padding-right: 7mm; }
table.toc td.p { font-family: 'Source Sans 3'; font-size: 8pt; color: #8c8379; text-align: right; width: 8mm; }
"""


MEASURED = {}


def liederheft2():
    p1, p_scales = grifftabelle(scale_names=False, as_pages=True, folios=("2", "5"))
    p_scales = p_scales.replace("Erst aufwärts, dann abwärts.",
                                "Erst aufwärts, dann abwärts. Die Namen der Töne stehen in der Grifftabelle.")
    pages = [p1, grundlagen_page("3"), uebungen_page("4"), p_scales]  # Seite 1 = Inhalt (wird zuletzt erzeugt)
    pageno = 6
    toc = []
    SONG_GAP = 13.0
    chapters = []
    for i, s in enumerate(SONGS):
        if s.get("chapter"):
            chapters.append((s["chapter"], []))
        chapters[-1][1].append((i + 1, s))
    num = 0
    for ch_title, songs in chapters:
        toc.append(("chapter", ch_title))
        # Höhen (gemessen, Schlüssel = ursprüngliche Nummer)
        hs = {}
        for n, s in songs:
            b, h, _ = song_block(n, s)
            BLOCKS[str(n)] = b
            hs[n] = MEASURED.get(str(n), h)
        queue = list(songs)
        first = True
        while queue:
            cur_h = 30.0 if first else -SONG_GAP
            placed = []
            # nächstes Lied immer nehmen, danach bis zu 2 Lieder vorausschauen
            k = 0
            while k < len(queue) and k <= 2 + len(placed):
                n, s = queue[k]
                need = hs[n] + SONG_GAP
                if cur_h + need <= PAGE_AVAIL or not placed:
                    placed.append(queue.pop(k))
                    cur_h += need
                else:
                    k += 1
            parts = []
            if first:
                parts.append(f'<div class="chapter">{KICKER.replace("Sopranblockflöte in C · barocke Griffweise", "Kapitel")}'
                             f'<h1>{html.escape(ch_title)}</h1><div class="rule"></div></div>')
            for j, (n, s) in enumerate(placed):
                num += 1
                b, h, (lo, hi) = song_block(num, s)
                if j > 0 or first:
                    b = f'<div style="margin-top:{SONG_GAP if j > 0 else 0}mm">{b}</div>'
                parts.append(b)
                toc.append(("song", num, s, lo, hi, pageno))
            pages.append(page("".join(parts), str(pageno)))
            pageno += 1
            first = False
    # Inhalt
    rows = ['<tr><td class="n"></td><td>Grifftabelle</td><td class="k"></td><td class="p">2</td></tr>',
            '<tr><td class="n"></td><td>Noten lesen</td><td class="k"></td><td class="p">3</td></tr>',
            '<tr><td class="n"></td><td>Erste Übungen</td><td class="k"></td><td class="p">4</td></tr>',
            '<tr><td class="n"></td><td>Übe-Tonleitern</td><td class="k"></td><td class="p">5</td></tr>']
    for t in toc:
        if t[0] == "chapter":
            rows.append(f'<tr><td colspan="4" style="border:none; padding-top:3.5mm"><span class="kicker">{html.escape(t[1])}</span></td></tr>')
        else:
            _, n, s, lo, hi, pg = t
            rows.append(f'<tr><td class="n">{n:02d}</td><td>{html.escape(s["title"])}</td>'
                        f'<td class="k">{s["keyname"]} · {disp_name(lo)}–{disp_name(hi)}</td><td class="p">{pg}</td></tr>')
    pages.insert(0, page(KICKER + '<h1>Inhalt</h1><div class="rule"></div>'
                         f'<table class="toc">{"".join(rows)}</table>', "1"))
    h = doc("Liederheft Blockflöte", pages)
    h = h.replace("</style>", EXTRA_CSS + "</style>")
    return h


BLOCKS = {}


def measure_html():
    liederheft2()
    body = "".join(f'<div class="mb" data-id="{k}" style="width:{W}mm; display:flow-root">{v}</div>' for k, v in BLOCKS.items())
    h = doc("m", [f'<div style="padding:0 18mm">{body}</div>'])
    return h.replace("</style>", EXTRA_CSS + "</style>")


if __name__ == "__main__":
    import json, subprocess
    open(os.path.join(OUT, "measure.html"), "w").write(measure_html())
    r = subprocess.run(["node", os.path.join(HERE, "measure2.js")], capture_output=True, text=True, cwd=HERE)
    MEASURED.update(json.loads(r.stdout))
    print("gemessen", MEASURED)
    h = liederheft2()
    open(os.path.join(OUT, "liederheft2.html"), "w").write(h)
    open(os.path.join(OUT, "liederheft2-sw.html"), "w").write(bw(h))
    print("ok")
