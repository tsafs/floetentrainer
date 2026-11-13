"""Kleiner Notensatz + Blockflöten-Griffbilder als SVG (Einheiten: mm)."""
import re, math, json, os, sys
from PIL import ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
FD = os.path.join(HERE, "fonts")
GARA = os.path.join(FD, "eb-garamond-latin-400-normal.woff2")
SANS = os.path.join(FD, "source-sans-3-latin-400-normal.woff2")
_fcache = {}


def text_w(txt, size_mm, font=GARA):
    key = font
    if key not in _fcache:
        _fcache[key] = ImageFont.truetype(font, 1000)
    return _fcache[key].getlength(txt) / 1000.0 * size_mm


# ---------------------------------------------------------------- Farben
INK = "#2b2724"
SOFT = "#8c8379"
WOOD = "#efe4cf"
WOOD_LINE = "#a58c68"
WOOD_DARK = "#cdb68f"
HOLE = "#2b2724"
HOLE_OPEN = "#fffdf8"

# ---------------------------------------------------------------- Tonhöhen
LET = "cdefgah"


def parse_pitch(tok):
    m = re.fullmatch(r"([a-h])(is|es|s)?('*)", tok)
    assert m, tok
    l, acc, octs = m.group(1), m.group(2), m.group(3)
    alt = 0
    if l == "b":
        l, alt = "h", -1
    if acc == "is":
        alt = 1
    elif acc in ("es", "s"):
        alt = -1
    octave = len(octs) + 3  # c' = C4
    step = octave * 7 + LET.index(l)
    pos = step - (4 * 7 + 2)  # E4 = 0 (unterste Linie)
    # deutscher Name
    if alt == 0:
        name = l
    elif alt == 1:
        name = l + "is"
    else:
        name = {"e": "es", "a": "as", "h": "b"}.get(l, l + "es")
    return dict(letter=l, alt=alt, oct=len(octs), pos=pos, name=name)


SUP = {1: "¹", 2: "²", 3: "³"}


def disp_name(p):
    return p["name"] + SUP[p["oct"]]


# ---------------------------------------------------------------- Griffe
FINGER_SRC = """c¹ x xxx xxxx | cis¹ x xxx xxxh | d¹ x xxx xxxo | es¹ x xxx xxho | e¹ x xxx xxoo | f¹ x xxx xoxx | fis¹ x xxx oxxo | g¹ x xxx oooo | gis¹ x xxo xxxo | a¹ x xxo oooo | b¹ x xox xooo | h¹ x xoo oooo
c² x oxo oooo | cis² o xxo oooo | d² o oxo oooo | es² o oxx xxxo | e² h xxx xxoo | f² h xxx xoxo | fis² h xxx oxoo | g² h xxx oooo | gis² h xxo xooo | a² h xxo oooo | b² h xxo xxxo | h² h xxo xxoo | c³ h xoo xxoo"""
FINGER = {}
CHART_ORDER = []
for part in FINGER_SRC.replace("\n", " | ").split("|"):
    n, t, a, b = part.split()
    FINGER[n] = t + a + b  # 8 Zeichen: Daumen, 1..7
    CHART_ORDER.append(n)

# enharmonische Verwechslungen (für Griffsuche)
ENH = {"des": "cis", "dis": "es", "ges": "fis", "as": "gis", "ais": "b"}


def fingering_for(p):
    n = ENH.get(p["name"], p["name"]) + SUP[p["oct"]]
    return FINGER[n]


# ---------------------------------------------------------------- Flöte
# Einheiten der Zeichnung: Korpus-Mitte x=0, oben y=0.
FL = dict(
    head_w=16.0, body_w=14.0, head_h=30.0, total_h=134.0,
    holes_y=[44, 55, 66, 81, 92, 103, 114], sep_y=73.5, thumb=(-13.6, 37.0),
    r=3.05, big_r=2.45, big_dx=-1.85, small_r=1.5, small_dx=3.05,
)
FL_BBOX = (-17.2, 0, 8.5, FL["total_h"])  # x0,y0,x1,y1 in Einheiten


def flute(fing, cx, top, height, detail=True):
    """Griffbild: fing = 8 Zeichen (x/o/h). cx = Mitte Korpus, top = Oberkante (mm)."""
    k = height / FL["total_h"]
    sw = 0.85 * k  # Konturstärke
    hw = 0.8 * k

    def X(u):
        return cx + u * k

    def Y(v):
        return top + v * k

    out = []
    hh, bw, th = FL["head_w"] / 2, FL["body_w"] / 2, FL["total_h"]
    # Korpus (unter dem Kopf), unten abgerundet
    rb = 5.5
    body = (f"M{X(-bw):.3f},{Y(26):.3f} L{X(-bw):.3f},{Y(th - rb):.3f} "
            f"Q{X(-bw):.3f},{Y(th):.3f} {X(-bw + rb):.3f},{Y(th):.3f} "
            f"L{X(bw - rb):.3f},{Y(th):.3f} Q{X(bw):.3f},{Y(th):.3f} {X(bw):.3f},{Y(th - rb):.3f} "
            f"L{X(bw):.3f},{Y(26):.3f} Z")
    out.append(f'<path d="{body}" fill="{WOOD}" stroke="{WOOD_LINE}" stroke-width="{sw:.3f}" stroke-linejoin="round"/>')
    # Kopf: oben gerundet (Schnabel), unten gerade
    hb = FL["head_h"]
    head = (f"M{X(-hh):.3f},{Y(hb):.3f} L{X(-hh):.3f},{Y(9):.3f} "
            f"C{X(-hh):.3f},{Y(2.2):.3f} {X(-hh + 3.5):.3f},{Y(0):.3f} {X(0):.3f},{Y(0):.3f} "
            f"C{X(hh - 3.5):.3f},{Y(0):.3f} {X(hh):.3f},{Y(2.2):.3f} {X(hh):.3f},{Y(9):.3f} "
            f"L{X(hh):.3f},{Y(hb):.3f} Z")
    out.append(f'<path d="{head}" fill="{WOOD}" stroke="{WOOD_LINE}" stroke-width="{sw:.3f}" stroke-linejoin="round"/>')
    # Fenster / Labium
    out.append(f'<rect x="{X(-3.4):.3f}" y="{Y(13.5):.3f}" width="{6.8 * k:.3f}" height="{4.6 * k:.3f}" '
               f'rx="{0.9 * k:.3f}" fill="{WOOD_DARK}" stroke="{WOOD_LINE}" stroke-width="{sw * 0.8:.3f}"/>')
    # Fuß-Ring
    out.append(f'<line x1="{X(-bw):.3f}" y1="{Y(123.5):.3f}" x2="{X(bw):.3f}" y2="{Y(123.5):.3f}" '
               f'stroke="{WOOD_LINE}" stroke-width="{sw * 0.7:.3f}" opacity="0.7"/>')
    # feiner Trennstrich zwischen den Händen
    out.append(f'<line x1="{X(-3.6):.3f}" y1="{Y(FL["sep_y"]):.3f}" x2="{X(3.6):.3f}" y2="{Y(FL["sep_y"]):.3f}" '
               f'stroke="{WOOD_LINE}" stroke-width="{sw * 0.75:.3f}"/>')

    def hole(x, y, r, state):
        if state == "x":
            return f'<circle cx="{x:.3f}" cy="{y:.3f}" r="{r:.3f}" fill="{HOLE}" stroke="{HOLE}" stroke-width="{hw:.3f}"/>'
        if state == "o":
            return f'<circle cx="{x:.3f}" cy="{y:.3f}" r="{r:.3f}" fill="{HOLE_OPEN}" stroke="{HOLE}" stroke-width="{hw:.3f}"/>'
        # halb: linke Hälfte gefüllt
        return (f'<circle cx="{x:.3f}" cy="{y:.3f}" r="{r:.3f}" fill="{HOLE_OPEN}"/>'
                f'<path d="M{x:.3f},{y - r:.3f} A{r:.3f},{r:.3f} 0 0 0 {x:.3f},{y + r:.3f} Z" fill="{HOLE}"/>'
                f'<circle cx="{x:.3f}" cy="{y:.3f}" r="{r:.3f}" fill="none" stroke="{HOLE}" stroke-width="{hw:.3f}"/>')

    tx, ty = FL["thumb"]
    out.append(hole(X(tx), Y(ty), FL["r"] * k, fing[0]))
    for i in range(7):
        st = fing[i + 1]
        y = Y(FL["holes_y"][i])
        if i < 5:
            out.append(hole(X(0), y, FL["r"] * k, st))
        else:
            big = "x" if st in "xh" else "o"
            small = "x" if st == "x" else "o"
            out.append(hole(X(FL["big_dx"]), y, FL["big_r"] * k, big))
            out.append(hole(X(FL["small_dx"]), y, FL["small_r"] * k, small))
    return "\n".join(out)


def flute_width(height):
    k = height / FL["total_h"]
    return (FL_BBOX[2] - FL_BBOX[0]) * k, -FL_BBOX[0] * k  # Breite, Abstand links vom Korpus-Mittelpunkt


# ---------------------------------------------------------------- Bravura
G = dict(clef="", whole="", half="", black="",
         sharp="", flat="", natural="", dot="",
         f8u="", f8d="", f16u="", f16d="",
         r1="", r2="", r4="", r8="", r16="")


def ts_digit(n):
    return "".join(chr(0xE080 + int(c)) for c in str(n))


def glyph(ch, x, y, sp, color=INK):
    return f'<text x="{x:.3f}" y="{y:.3f}" font-family="Bravura" font-size="{4 * sp:.3f}" fill="{color}">{ch}</text>'


KEYSIG = {  # Positionen (0 = unterste Linie)
    "C": [], "a": [],
    "G": [("sharp", 8)], "e": [("sharp", 8)],
    "D": [("sharp", 8), ("sharp", 5)],
    "F": [("flat", 4)], "d": [("flat", 4)],
}
KEY_ALT = {  # Vorzeichen je Stammton
    "C": {}, "a": {}, "G": {"f": 1}, "e": {"f": 1}, "D": {"f": 1, "c": 1},
    "F": {"h": -1}, "d": {"h": -1},
}


# ---------------------------------------------------------------- Lied-Parser
TOK = re.compile(r"^(\()?([a-h](?:is|es|s)?'*|r)(\d+)(\.?)(~)?(\))?$")


def parse_music(src):
    """Gibt Liste von Items: dict(kind=note/rest/bar/break)."""
    items = []
    for t in src.split():
        if t == "|":
            items.append(dict(kind="bar"))
        elif t == "||":
            items.append(dict(kind="bar", final=True))
        elif t == "/":
            items.append(dict(kind="break"))
        elif t == ",":
            nl = [it for it in items if it["kind"] == "note"]
            nl[-1]["breath"] = True
        elif t.startswith("T"):
            n, d = t[1:].split("/")
            items.append(dict(kind="time", num=int(n), den=int(d)))
        else:
            m = TOK.match(t)
            assert m, f"Token? {t}"
            sl0, p, d, dot, tie, sl1 = m.groups()
            d = int(d)
            q = 4.0 / d * (1.5 if dot else 1.0)
            it = dict(kind="rest" if p == "r" else "note", dur=d, dot=bool(dot), q=q,
                      tie=bool(tie), slur_start=bool(sl0), slur_end=bool(sl1))
            if p != "r":
                it["p"] = parse_pitch(p)
            items.append(it)
    return items


def split_lyrics(txt):
    """'Al-le mei-ne' -> [('Al',True),('le',False),...] (True = Bindestrich folgt)."""
    out = []
    for w in txt.split():
        parts = w.split("-")
        for i, s in enumerate(parts):
            out.append((s, i < len(parts) - 1))
    return out


def check_and_assign(song):
    items = parse_music(song["music"])
    num, den = song["time"]
    bar_q = num * 4.0 / den
    # Taktprüfung
    acc, bars, idx = 0.0, [], 0
    for it in items:
        if it["kind"] in ("note", "rest"):
            acc += it["q"]
        elif it["kind"] == "bar":
            bars.append((acc, bar_q))
            acc = 0.0
        elif it["kind"] == "time":
            bar_q = it["num"] * 4.0 / it["den"]
    msgs = []
    for i, (b, bar_q) in enumerate(bars):
        if abs(b - bar_q) > 1e-6:
            first_or_last = (i == 0 or i == len(bars) - 1)
            msgs.append(f"Takt {i + 1}: {b} statt {bar_q}" + (" (Auftakt/Schluss)" if first_or_last else " !!!"))
    if song.get("pickup") is not None and len(bars) > 1:
        tot = bars[0][0] + bars[-1][0]
        if abs(tot - bar_q) > 1e-6:
            msgs.append(f"Auftakt+Schluss = {tot} statt {bar_q} !!!")
    # Silben zuordnen
    syl = split_lyrics(song.get("lyrics", ""))
    k = 0
    in_slur = False
    prev_tie = False
    for it in items:
        if it["kind"] != "note":
            continue
        gets = not prev_tie and not in_slur
        if it["slur_start"]:
            in_slur = True
            gets = not prev_tie
        if gets:
            if k < len(syl):
                it["syl"], it["hy"] = syl[k]
            k += 1
        if it["slur_end"]:
            in_slur = False
        prev_tie = it["tie"]
    if syl and k != len(syl):
        msgs.append(f"Silben: {len(syl)} Silben, {k} Noten mit Silbe !!!")
    return items, msgs


# ---------------------------------------------------------------- Satz eines Systems
DUR_F = {(16, False): 0.86, (8, False): 1.0, (16, True): 0.9, (8, True): 1.06, (4, False): 1.16,
         (4, True): 1.28, (2, False): 1.42, (2, True): 1.58, (1, False): 1.75}


class Sys:
    pass


def layout_system(events, sp, width, base, key, time_sig=None, first=True, lyr_size=3.5,
                  name_size=2.25, stretch_max=1.4, final_bar=False, ends_with_bar=True, min_note=0.0):
    """events: Items dieses Systems (note/rest/bar). Liefert x-Positionen."""
    x = 0.4 * sp
    clef_x = x
    x += 3.1 * sp
    ks = KEYSIG[key]
    ks_x = x
    x += len(ks) * 1.05 * sp + (0.6 * sp if ks else 0)
    ts_x = None
    if time_sig:
        ts_x = x
        x += 2.3 * sp
    x += 0.9 * sp
    start = x
    # Minimalbreiten
    notes = [e for e in events]
    w = []
    for i, e in enumerate(notes):
        if e["kind"] in ("bar", "time"):
            w.append(None)
            continue
        f = DUR_F.get((e["dur"], e["dot"]), 1.2)
        w.append(base * f)
    # Mindestabstände (Silben, Griffbilder) – werden nie gestaucht
    def lw(e):
        if e["kind"] != "note" or "syl" not in e:
            return 0.0
        return text_w(e["syl"], lyr_size)

    BAR_GAP = 0.6 * base
    need = [0.0] * len(notes)
    note_idx = [i for i, e in enumerate(notes) if e["kind"] in ("note", "rest")]
    nt = sum(1 for e in notes if e["kind"] == "time")
    for a, b in zip(note_idx, note_idx[1:]):
        nd = (lw(notes[a]) + lw(notes[b])) / 2 + (2.1 if notes[a].get("hy") else 1.4)
        nd = max(nd, min_note)
        if any(notes[j]["kind"] == "bar" for j in range(a + 1, b)):
            nd -= 0.35 * base
        need[a] = nd
    nb = sum(1 for e in notes if e["kind"] == "bar")
    avail_w = width - start - 0.5 * sp

    def total(s):
        t = sum(max(w[i] * s, need[i]) for i in note_idx) + nb * max(BAR_GAP * s, 0.35 * base) + nt * 2.6 * sp
        return t

    lo_s, hi_s = 0.3, stretch_max
    if total(hi_s) <= avail_w:
        s = hi_s
    else:
        for _ in range(60):
            mid = (lo_s + hi_s) / 2
            if total(mid) > avail_w:
                hi_s = mid
            else:
                lo_s = mid
        s = lo_s
        if total(0.3) > avail_w + 0.01:
            print("WARNUNG: Zeile zu voll", file=sys.stderr)
    xs = []
    x = start
    for i, e in enumerate(notes):
        if e["kind"] == "bar":
            bg = max(BAR_GAP * s, 0.35 * base)
            xs.append(x + bg * 0.22)
            x += bg
        elif e["kind"] == "time":
            xs.append(x - 0.1 * sp)
            x += 2.6 * sp
        else:
            xs.append(x + base * 0.4)  # Notenkopf-Mitte
            x += max(w[i] * s, need[i])
    for i, e in enumerate(notes):
        if e["kind"] == "bar" and i == 0:
            xs[i] = start - 0.4 * sp
    sy = Sys()
    sy.clef_x, sy.ks_x, sy.ts_x, sy.xs, sy.start = clef_x, ks_x, ts_x, xs, start
    sy.end = x
    return sy


def extents(events, whole_heads=False):
    hi, lo = 8, 0
    for e in events:
        if e["kind"] != "note":
            continue
        p = e["p"]["pos"]
        hi, lo = max(hi, p + 1), min(lo, p - 1)
        if not whole_heads and e["dur"] >= 2:
            if p < 4:
                hi = max(hi, p + 7.5)
            else:
                lo = min(lo, p - 7.5)
    return hi, lo


def render_staff_system(events, sp, width, key, time_sig=None, base=9.0, show_diagrams=True,
                        diag_h=23.0, lyr_size=3.5, name_size=2.25, stretch_max=1.4,
                        whole_heads=False, show_names=True, show_lyrics=True, lead_bar=False,
                        trailing_open=False, ext=None, meter=None):
    sy = layout_system(events, sp, width, base, key, time_sig, lyr_size=lyr_size,
                       name_size=name_size, stretch_max=stretch_max,
                       min_note=(flute_width(diag_h)[0] + 1.3) if show_diagrams else 0.0)
    parts = []
    # vertikale Geometrie
    hi_ext, lo_ext = ext if ext else extents(events, whole_heads)
    if show_diagrams:
        top_pad = 0.6 + diag_h + max(1.9 * sp, (hi_ext - 8) * sp / 2 + 1.3 * sp)
    else:
        top_pad = max(1.2 * sp, (hi_ext - 8) * sp / 2 + 0.8 * sp)
    staff_top = top_pad
    y0 = staff_top + 4 * sp  # unterste Linie

    def Y(pos):
        return y0 - pos * sp / 2

    names_y = y0 + max(0, -lo_ext) * sp / 2 + name_size * 0.75 + 1.4
    lyr_y = names_y + lyr_size * 1.4 if show_names else y0 + max(0, -lo_ext) * sp / 2 + lyr_size * 0.85 + 1.6
    total_h = (lyr_y + 1.4 if show_lyrics else names_y + 1.2)
    if not show_names and not show_lyrics:
        total_h = y0 + 3.0 * sp
    line_end = sy.end if trailing_open else None
    # Linien
    x_last_bar = max([sy.xs[i] for i, e in enumerate(events) if e["kind"] == "bar"] + [sy.start])
    staff_right = x_last_bar if not trailing_open else sy.end - 0.2 * sp
    for i in range(5):
        parts.append(f'<line x1="0" y1="{Y(2 * i):.3f}" x2="{staff_right:.3f}" y2="{Y(2 * i):.3f}" '
                     f'stroke="{INK}" stroke-width="{0.13 * sp:.3f}"/>')
    # Schlüssel
    parts.append(glyph(G["clef"], sy.clef_x, Y(2), sp))
    for j, (a, pos) in enumerate(KEYSIG[key]):
        parts.append(glyph(G[a], sy.ks_x + j * 1.05 * sp, Y(pos), sp))
    if time_sig:
        n, d = time_sig
        for txt, pos in ((ts_digit(n), 6), (ts_digit(d), 2)):
            wdt = 1.75 * sp * len(txt)
            parts.append(glyph(txt, sy.ts_x + (1.9 * sp - wdt) / 2 + 0.1 * sp, Y(pos), sp))
    # Taktstriche
    for i, e in enumerate(events):
        if e["kind"] == "bar":
            x = sy.xs[i]
            if e.get("final"):
                parts.append(f'<line x1="{x - 0.75 * sp:.3f}" y1="{Y(8):.3f}" x2="{x - 0.75 * sp:.3f}" y2="{Y(0):.3f}" stroke="{INK}" stroke-width="{0.16 * sp:.3f}"/>')
                parts.append(f'<rect x="{x - 0.5 * sp:.3f}" y="{Y(8) - 0.065 * sp:.3f}" width="{0.5 * sp:.3f}" height="{4.13 * sp:.3f}" fill="{INK}"/>')
            else:
                parts.append(f'<line x1="{x:.3f}" y1="{Y(8) - 0.065 * sp:.3f}" x2="{x:.3f}" y2="{Y(0) + 0.065 * sp:.3f}" stroke="{INK}" stroke-width="{0.16 * sp:.3f}"/>')

    for i, e in enumerate(events):
        if e["kind"] == "time":
            for txt, pos in ((ts_digit(e["num"]), 6), (ts_digit(e["den"]), 2)):
                parts.append(glyph(txt, sy.xs[i] + 0.35 * sp, Y(pos), sp))
        if e.get("breath"):
            nxt = [j for j in range(i + 1, len(events)) if events[j]["kind"] in ("note", "rest", "bar", "time")]
            xn = sy.xs[nxt[0]] if nxt else sy.end
            xb = sy.xs[i] + 0.62 * (xn - sy.xs[i])
            parts.append(glyph("\ue4ce", xb - 0.3 * sp, Y(10.2), sp))
    # Noten
    key_alt = KEY_ALT[key]
    head_w = {1: 1.688, 2: 1.18, 4: 1.18, 8: 1.18, 16: 1.18}
    nev = [(i, e) for i, e in enumerate(events) if e["kind"] in ("note", "rest")]
    # Balkengruppen bilden
    num, den = meter or time_sig or (4, 4)
    beat = 1.5 if (den == 8 and num % 3 == 0) else 1.0
    pos_q = 0.0
    groups, cur, cur_beat = [], [], None
    for i, e in enumerate(events):
        if e["kind"] == "bar":
            if cur:
                groups.append(cur)
            cur, cur_beat = [], None
            pos_q = 0.0
            continue
        if e["kind"] == "break":
            continue
        if e["kind"] == "time":
            if cur:
                groups.append(cur)
            cur, cur_beat = [], None
            beat = 1.5 if (e["den"] == 8 and e["num"] % 3 == 0) else 1.0
            continue
        b = math.floor(pos_q / beat + 1e-6)
        if e["kind"] == "note" and e["dur"] >= 8:
            if cur and cur_beat == b:
                cur.append(i)
            else:
                if cur:
                    groups.append(cur)
                cur, cur_beat = [i], b
        else:
            if cur:
                groups.append(cur)
            cur, cur_beat = [], None
        pos_q += e["q"]
    if cur:
        groups.append(cur)
    # Taktposition kann bei Auftakt verrutschen: Auftakt-Takt rechtsbündig behandeln
    beamed = {}
    for g in groups:
        if len(g) >= 2:
            for i in g:
                beamed[i] = g

    stem_info = {}  # i -> (x, y_end, up)

    def head_left(i):
        e = events[i]
        hw = head_w[e["dur"]] if not whole_heads else 1.688
        return sy.xs[i] - hw * sp / 2

    for gi, g in enumerate(groups):
        if len(g) < 2:
            continue
        ps = [events[i]["p"]["pos"] for i in g]
        far = max(ps, key=lambda p: abs(p - 4))
        up = (sum(ps) / len(ps)) < 4 if abs(max(ps) - 4) == abs(min(ps) - 4) else far < 4
        xsx = []
        for i in g:
            hl = head_left(i)
            xsx.append(hl + (1.18 - 0.06) * sp if up else hl + 0.06 * sp)
        ys = [Y(events[i]["p"]["pos"]) for i in g]
        dy = (ys[-1] - ys[0])
        dx = xsx[-1] - xsx[0]
        rise = max(-1.0 * sp, min(1.0 * sp, dy * 0.5))
        slope = rise / dx if dx else 0
        if up:
            b0 = min(ys[k] - 3.25 * sp - slope * (xsx[k] - xsx[0]) for k in range(len(g)))
            b0 = min(b0, Y(4) - 0.0 * sp) if min(ps) < -4 else b0
        else:
            b0 = max(ys[k] + 3.25 * sp - slope * (xsx[k] - xsx[0]) for k in range(len(g)))
        th = 0.5 * sp
        bl = lambda xx: b0 + slope * (xx - xsx[0])
        # Hauptbalken
        x1, x2 = xsx[0] - 0.06 * sp, xsx[-1] + 0.06 * sp
        sgn = 1 if up else -1
        parts.append(f'<path d="M{x1:.3f},{bl(x1):.3f} L{x2:.3f},{bl(x2):.3f} L{x2:.3f},{bl(x2) + sgn * th:.3f} L{x1:.3f},{bl(x1) + sgn * th:.3f} Z" fill="{INK}"/>')
        # 16tel
        off = sgn * 0.75 * sp
        for k, i in enumerate(g):
            if events[i]["dur"] != 16:
                continue
            nxt = g[k + 1] if k + 1 < len(g) and events[g[k + 1]]["dur"] == 16 else None
            prv = g[k - 1] if k > 0 and events[g[k - 1]]["dur"] == 16 else None
            if nxt is not None:
                xa, xb = xsx[k] - 0.06 * sp, xsx[k + 1] + 0.06 * sp
            elif prv is not None:
                continue
            else:
                if k > 0:
                    xa, xb = xsx[k] - 1.15 * sp, xsx[k] + 0.06 * sp
                else:
                    xa, xb = xsx[k] - 0.06 * sp, xsx[k] + 1.15 * sp
            parts.append(f'<path d="M{xa:.3f},{bl(xa) + off:.3f} L{xb:.3f},{bl(xb) + off:.3f} L{xb:.3f},{bl(xb) + off + sgn * th:.3f} L{xa:.3f},{bl(xa) + off + sgn * th:.3f} Z" fill="{INK}"/>')
        for k, i in enumerate(g):
            stem_info[i] = (xsx[k], bl(xsx[k]), up)

    note_items = []
    for i, e in nev:
        x = sy.xs[i]
        if e["kind"] == "rest":
            rg = {1: "r1", 2: "r2", 4: "r4", 8: "r8", 16: "r16"}[e["dur"]]
            rp = 6 if e["dur"] == 1 else 4
            gw = {1: 1.128, 2: 1.128, 4: 1.08, 8: 0.988, 16: 1.28}[e["dur"]]
            parts.append(glyph(G[rg], x - gw * sp / 2, Y(rp), sp))
            if e["dot"]:
                parts.append(glyph(G["dot"], x + gw * sp / 2 + 0.3 * sp, Y(5), sp))
            continue
        p = e["p"]
        pos = p["pos"]
        y = Y(pos)
        d = 1 if whole_heads else e["dur"]
        hg = G["whole"] if d == 1 else (G["half"] if d == 2 else G["black"])
        hw = head_w[d] * sp
        hl = x - hw / 2
        # Hilfslinien
        if pos <= -2:
            for q in range(-2, pos - 1, -2):
                parts.append(f'<line x1="{hl - 0.4 * sp:.3f}" y1="{Y(q):.3f}" x2="{hl + hw + 0.4 * sp:.3f}" y2="{Y(q):.3f}" stroke="{INK}" stroke-width="{0.16 * sp:.3f}"/>')
        if pos >= 10:
            for q in range(10, pos + 1, 2):
                parts.append(f'<line x1="{hl - 0.4 * sp:.3f}" y1="{Y(q):.3f}" x2="{hl + hw + 0.4 * sp:.3f}" y2="{Y(q):.3f}" stroke="{INK}" stroke-width="{0.16 * sp:.3f}"/>')
        # Vorzeichen
        want = p["alt"]
        have = key_alt.get(p["letter"], 0)
        if want != have:
            a = {1: "sharp", -1: "flat", 0: "natural"}[want]
            aw = {"sharp": 0.996, "flat": 0.904, "natural": 0.672}[a]
            parts.append(glyph(G[a], hl - 0.28 * sp - aw * sp, y, sp))
        parts.append(glyph(hg, hl, y, sp))
        if e["dot"]:
            dpos = pos if pos % 2 == 1 else pos + 1
            parts.append(glyph(G["dot"], hl + hw + 0.32 * sp, Y(dpos), sp))
        # Hals
        if d >= 2:
            if i in stem_info:
                sx, ye, up = stem_info[i]
            else:
                up = pos < 4
                ln = max(3.5 * sp, abs(pos - 4) * sp / 2)
                sx = hl + (1.18 - 0.06) * sp if up else hl + 0.06 * sp
                ye = y - ln if up else y + ln
                if d >= 8:
                    fg = G[("f%du" if up else "f%dd") % d]
                    parts.append(glyph(fg, sx - 0.06 * sp, ye, sp))
            y_start = y - 0.168 * sp if up else y + 0.168 * sp
            parts.append(f'<line x1="{sx:.3f}" y1="{y_start:.3f}" x2="{sx:.3f}" y2="{ye:.3f}" stroke="{INK}" stroke-width="{0.12 * sp:.3f}"/>')
            stem_info[i] = (sx, ye, up)
        note_items.append(i)

    # Haltebögen & Bindebögen
    def arc(xa, xb, yb, up_side, h):
        # gefüllte Sichel
        t1 = 0.22 * sp
        sgn = -1 if up_side else 1
        mx = (xa + xb) / 2
        return (f'<path d="M{xa:.3f},{yb:.3f} Q{mx:.3f},{yb + sgn * h * 2:.3f} {xb:.3f},{yb:.3f} '
                f'Q{mx:.3f},{yb + sgn * (h * 2 - t1 * 2):.3f} {xa:.3f},{yb:.3f} Z" fill="{INK}"/>')

    seq = [i for i in note_items]
    for k, i in enumerate(seq):
        e = events[i]
        if e["tie"] and k + 1 < len(seq):
            j = seq[k + 1]
            up = stem_info.get(i, (0, 0, e["p"]["pos"] < 4))[2]
            yb = Y(e["p"]["pos"]) + (0.75 * sp if up else -0.75 * sp)
            parts.append(arc(sy.xs[i] + 0.55 * sp, sy.xs[j] - 0.55 * sp, yb, not up, 0.55 * sp))
        if e["slur_start"]:
            # Ende suchen
            m = k
            while m < len(seq) and not events[seq[m]]["slur_end"]:
                m += 1
            if m >= len(seq):
                continue
            j = seq[m]
            ups = [stem_info.get(q, (0, 0, events[q]["p"]["pos"] < 4))[2] for q in seq[k:m + 1]]
            below = all(ups)
            ya, yb2 = Y(e["p"]["pos"]), Y(events[j]["p"]["pos"])
            if below:
                yy = max(ya, yb2) + 0.9 * sp
            else:
                yy = min(ya, yb2) - 0.9 * sp
                if not any(ups):
                    yy = min(ya, yb2) - 0.9 * sp
            parts.append(arc(sy.xs[i] + 0.1 * sp, sy.xs[j] - 0.1 * sp, yy, not below, 0.6 * sp))

    # Griffbilder, Namen, Silben
    fw, fl = flute_width(diag_h)
    dtop = 0.6
    for idx, i in enumerate(note_items):
        e = events[i]
        x = sy.xs[i]
        if show_diagrams:
            parts.append(flute(fingering_for(e["p"]), x + 0.55, dtop, diag_h))
        if show_names:
            parts.append(f'<text x="{x:.3f}" y="{names_y:.3f}" text-anchor="middle" font-family="&apos;Source Sans 3&apos;" '
                         f'font-size="{name_size:.3f}" fill="{SOFT}">{e["p"]["name"]}<tspan dx="{name_size*0.06:.3f}" dy="{-name_size*0.38:.3f}" font-size="{name_size*0.62:.3f}">{e["p"]["oct"]}</tspan></text>')
        if show_lyrics and e.get("syl"):
            parts.append(f'<text x="{x:.3f}" y="{lyr_y:.3f}" text-anchor="middle" font-family="EB Garamond" '
                         f'font-size="{lyr_size:.3f}" fill="{INK}">{e["syl"]}</text>')
    # Bindestriche und Melisma-Linien
    if show_lyrics:
        syl_notes = [i for i in note_items if events[i].get("syl")]
        for a, b in zip(syl_notes, syl_notes[1:]):
            ea = events[a]
            wa = text_w(ea["syl"], lyr_size) / 2
            wb = text_w(events[b]["syl"], lyr_size) / 2
            xa, xb = sy.xs[a] + wa, sy.xs[b] - wb
            if ea.get("hy"):
                mx = (xa + xb) / 2
                hl = min(1.1, max(0.5, (xb - xa) * 0.4))
                parts.append(f'<line x1="{mx - hl / 2:.3f}" y1="{lyr_y - lyr_size * 0.27:.3f}" x2="{mx + hl / 2:.3f}" '
                             f'y2="{lyr_y - lyr_size * 0.27:.3f}" stroke="{INK}" stroke-width="0.17"/>')
        # Melisma-Linie, wenn Wortende über Bogen/Haltebogen
        for k, i in enumerate(note_items):
            e = events[i]
            if e.get("syl") and not e.get("hy"):
                # folgende Noten ohne Silbe, bis zur nächsten Silbe
                last = None
                for j in note_items[k + 1:]:
                    if events[j].get("syl"):
                        break
                    last = j
                if last is not None:
                    xa = sy.xs[i] + text_w(e["syl"], lyr_size) / 2 + 0.4
                    xb = sy.xs[last] + 0.7 * sp
                    if xb > xa + 0.5:
                        parts.append(f'<line x1="{xa:.3f}" y1="{lyr_y + 0.35:.3f}" x2="{xb:.3f}" y2="{lyr_y + 0.35:.3f}" stroke="{INK}" stroke-width="0.16"/>')
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}mm" height="{total_h:.2f}mm" '
           f'viewBox="0 0 {width} {total_h:.3f}">' + "\n".join(parts) + "</svg>")
    return svg, total_h
