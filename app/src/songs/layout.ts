// Notensatz eines Lieds, Teil 1: waagerechte Anordnung und Zeilenumbruch (ohne DOM, daher in Vitest prüfbar).
// Vorbild ist layout_system in heft/engrave.py: Notenwerte bekommen eine dehnbare Breite nach ihrer Dauer,
// Silben, Vorzeichen, Punkte und Fähnchen eine starre Mindestbreite, die nie unterschritten wird.
// Anders als im Heft wird nicht nach den "/" umbrochen, sondern nach der verfügbaren Breite: ein Takt wird
// nie getrennt, die Takte werden so auf Zeilen verteilt, dass alle Zeilen möglichst gleichmäßig gedehnt sind
// (wie beim Blocksatz eines Absatzes), und jede Zeile reicht über die volle Breite. Die letzte Zeile bleibt
// kürzer, wenn sie sonst zu luftig würde.
//
// Einheiten: 1 = ein Notenlinien-Zwischenraum (wie music/staff.ts), x nach rechts, y nach unten,
// y = 0 ist die unterste Linie, die oberste liegt bei y = −4.

import { GLYPHS, type Glyph } from "../music/bravura";
import { ITALIC_CHARS, ITALIC_WIDTHS, REGULAR_CHARS, REGULAR_WIDTHS } from "../music/garamond";
import type { Bar, BarEvent, Duration, NoteEvent, Song, TimeSig } from "./model";

/** Notenköpfe auf 82 % verkleinert wie in der Übung (frei im Zwischenraum) */
export const HEAD_SCALE = 0.82;

// ---------------------------------------------------------------- Größen

/** Größen eines Notenbilds in Pixeln bzw. Zwischenräumen */
export interface Metrics {
  /** ein Zwischenraum in CSS-Pixeln */
  sp: number;
  /** Schriftgröße des Liedtexts in Zwischenräumen */
  lyr: number;
  /** Schriftgröße der Taktnummern und Klammerziffern in Zwischenräumen */
  small: number;
}

/** kleinster und größter Zwischenraum in Pixeln (siehe metricsFor) */
export const SP_MIN = 7.5;
export const SP_MAX = 9;
/** Liedtext mindestens so groß (Pixel) */
export const LYRIC_PX_MIN = 16;

/**
 * Größe nach verfügbarer Breite: Auf dem 360-px-Handy (gut 320 px Satzbreite) ist ein Zwischenraum 7,5 px
 * (Notensystem 30 px hoch, Notenkopf gut 6 px), der Liedtext 16 px – im Verhältnis wie im Heft
 * (Zwischenraum 1,75 mm, Text 3,7 mm). So passen dort meist zwei 4/4-Takte mit Text in eine Zeile.
 * Bei mehr Breite wächst beides bis 9 px bzw. 19 px.
 */
export function metricsFor(width: number, sp?: number): Metrics {
  const s = sp ?? Math.min(SP_MAX, Math.max(SP_MIN, width / 44));
  return { sp: s, lyr: Math.max(LYRIC_PX_MIN, 2.1 * s) / s, small: Math.max(11, 1.45 * s) / s };
}

// ---------------------------------------------------------------- Textbreiten (EB Garamond)

function widthMap(chars: string, widths: number[]): Map<string, number> {
  const m = new Map<string, number>();
  [...chars].forEach((c, i) => m.set(c, widths[i]));
  return m;
}
const REGULAR = widthMap(REGULAR_CHARS, REGULAR_WIDTHS);
const ITALIC = widthMap(ITALIC_CHARS, ITALIC_WIDTHS);

/** Breite eines Texts in EB Garamond (in den Einheiten von size) */
export function textWidth(text: string, size: number, italic = false): number {
  const m = italic ? ITALIC : REGULAR;
  let w = 0;
  for (const ch of text) w += m.get(ch) ?? 500;
  return (w * size) / 1000;
}

// ---------------------------------------------------------------- Notenköpfe, Hälse, Balken

/** Glyphe des Notenkopfs */
export function headGlyph(dur: Duration): Glyph {
  return dur === 1 ? GLYPHS.whole : dur === 2 ? GLYPHS.half : GLYPHS.black;
}
/** halbe Breite des (verkleinerten) Notenkopfs */
export function headHalf(dur: Duration): number {
  const g = headGlyph(dur);
  return ((g.x1 - g.x0) * HEAD_SCALE) / 2;
}
/** Glyphe einer Pause */
export function restGlyph(dur: Duration): Glyph {
  return GLYPHS[`rest${dur}`];
}
/** Glyphe des Vorzeichens vor einer Note */
export function accGlyph(a: "sharp" | "flat" | "natural"): Glyph {
  return GLYPHS[a];
}

/** Zählzeit für die Balken wie im Heft: punktierte Viertel bei 6/8, 9/8 …, sonst Viertel */
export function beamBeat(t: TimeSig): number {
  return t.den === 8 && t.num % 3 === 0 ? 1.5 : 1;
}

/**
 * Balkengruppen eines Takts wie im Heft: Achtel und Sechzehntel innerhalb derselben Zählzeit werden
 * verbunden, Pausen und Atemzeichen trennen. Anders als im Heft wird ein Auftakt vom Taktende her gezählt, damit die
 * Zählzeiten stimmen. Nur Gruppen mit mindestens zwei Noten.
 */
export function beamGroups(bar: Bar): NoteEvent[][] {
  const beat = beamBeat(bar.time);
  const shift = bar.pickup ? bar.nominal - bar.length : 0;
  const groups: NoteEvent[][] = [];
  let cur: NoteEvent[] = [];
  let curBeat = -1;
  const flush = () => {
    if (cur.length >= 2) groups.push(cur);
    cur = [];
  };
  for (const e of bar.events) {
    const b = Math.floor((e.offset + shift) / beat + 1e-6);
    if (e.kind === "note" && e.dur >= 8) {
      if (cur.length && curBeat === b) cur.push(e);
      else {
        flush();
        cur = [e];
        curBeat = b;
      }
      // Atemzeichen trennt den Balken (im Heft steht dort meist ohnehin ein Zeilenumbruch)
      if (e.breath) flush();
    } else flush();
  }
  flush();
  return groups;
}

/** Halsrichtung einer Balkengruppe wie im Heft: nach der Note, die am weitesten von der Mittellinie liegt */
export function groupStemUp(g: NoteEvent[]): boolean {
  const ps = g.map((n) => n.pitch.pos);
  const hi = Math.max(...ps);
  const lo = Math.min(...ps);
  if (Math.abs(hi - 4) === Math.abs(lo - 4)) return ps.reduce((a, b) => a + b, 0) / ps.length < 4;
  return (Math.abs(hi - 4) > Math.abs(lo - 4) ? hi : lo) < 4;
}

/** Hals und Balken einer Note */
export interface Stem {
  up: boolean;
  /** Balkengruppe, falls die Note einen Balken hat */
  group: NoteEvent[] | null;
}

/** Halsrichtung und Balkengruppe aller Noten eines Lieds (nach Kennung) */
export function stemsOf(song: Song): Map<number, Stem> {
  const out = new Map<number, Stem>();
  for (const bar of song.bars) {
    for (const g of beamGroups(bar)) {
      const up = groupStemUp(g);
      for (const n of g) out.set(n.id, { up, group: g });
    }
    for (const e of bar.events) {
      if (e.kind === "note" && !out.has(e.id)) out.set(e.id, { up: e.pitch.pos < 4, group: null });
    }
  }
  return out;
}

// ---------------------------------------------------------------- Abstände (Zwischenräume)

/** dehnbare Breite je Notenwert wie DUR_F im Heft (Faktor zur Grundbreite BASE) */
const DUR_F: Record<string, number> = {
  "16": 0.86, "16.": 0.9, "8": 1.0, "8.": 1.06, "4": 1.16, "4.": 1.28, "2": 1.42, "2.": 1.58, "1": 1.75, "1.": 1.9,
};
/** Grundbreite einer Achtel bei Dehnung 1 */
const BASE = 3.9;
/** Schlüssel: Lage und Platz */
export const CLEF_X = 0.4;
const CLEF_ADV = 3.3;
/** Abstand der Vorzeichen der Tonart */
export const KEY_STEP = 1.05;
const KEY_PAD = 0.5;
const TIME_PAD = 0.7;
/** Platz für Wiederholungspunkte und dicken Strich */
export const REP_W = 1.5;
/** Taktstrich → erste Notenmitte: starrer und dehnbarer Teil */
const L_FIX = 1.15;
const L_EL = 0.55;
/** Anteil der dehnbaren Breite der letzten Note bis zum Taktstrich */
const R_F = 0.78;
/** Abstand zwischen Vorzeichen und Notenkopf */
const ACC_GAP = 0.22;
/** Überstand der Hilfslinien über den Notenkopf */
export const LEDGER_OVER = 0.36;

/** Abstand vom Notenkopf zum Vorzeichen; bei Hilfslinien steht es links von ihnen */
export function accGap(pos: number): number {
  return pos <= -2 || pos >= 10 ? LEDGER_OVER + 0.14 : ACC_GAP;
}
/** Abstand Notenkopf → Punkt */
export const DOT_GAP = 0.3;
/** mindestens so viel Luft zwischen zwei Silben (mit Trennstrich mehr) */
const SYL_GAP = 0.75;
const SYL_GAP_HYPHEN = 1.35;
/** stärkste zulässige Stauchung */
const S_MIN = 0.55;
/** Strichstärke eines Taktstrichs */
export const BAR_W = 0.16;

/** Breite einer Taktangabe (die breitere der beiden Ziffernfolgen) */
export function timeSigWidth(t: TimeSig): number {
  const w = (n: number) => [...String(n)].reduce((a, c) => a + GLYPHS[`time${c}`].adv, 0);
  return Math.max(w(t.num), w(t.den));
}

/** Kopfbreite links der Note (mit Vorzeichen) */
function leftExt(e: BarEvent): number {
  if (e.kind === "rest") {
    const g = restGlyph(e.dur);
    return (g.x1 - g.x0) / 2;
  }
  const h = headHalf(e.dur);
  if (!e.accidental) return h;
  const a = accGlyph(e.accidental);
  return h + accGap(e.pitch.pos) + (a.x1 - a.x0);
}

/** Breite rechts der Notenmitte (Kopf, Punkt, Fähnchen) */
function rightExt(e: BarEvent, stems: Map<number, Stem>): number {
  if (e.kind === "rest") {
    const g = restGlyph(e.dur);
    return (g.x1 - g.x0) / 2 + (e.dots ? DOT_GAP + 0.45 : 0);
  }
  let r = headHalf(e.dur) + (e.dots ? DOT_GAP + 0.45 : 0);
  const st = stems.get(e.id);
  if (e.dur >= 8 && st && !st.group && st.up) r = Math.max(r, headHalf(e.dur) + 0.95);
  return r;
}

function sylWidth(e: BarEvent | undefined, m: Metrics): number {
  return e && e.kind === "note" && e.syllable ? textWidth(e.syllable.text, m.lyr) : 0;
}

/** Mindestabstand zweier aufeinanderfolgender Ereignismitten wegen der Silben */
function sylNeed(a: BarEvent, b: BarEvent, m: Metrics): number {
  const wa = sylWidth(a, m);
  const wb = sylWidth(b, m);
  if (!wa) return 0;
  const hy = a.kind === "note" && a.syllable?.hyphen;
  return (wa + wb) / 2 + (hy ? SYL_GAP_HYPHEN : wb ? SYL_GAP : 0.3);
}

/** Maße eines Takts für den Umbruch */
interface BarMeasure {
  bar: Bar;
  /** dehnbare Breite je Ereignis (Mitte → nächste Mitte) */
  e: number[];
  /** starre Mindestbreite je Ereignis; beim letzten bis zum Taktstrich, wenn die Zeile weitergeht */
  m: number[];
  /** starre Mindestbreite des letzten Ereignisses, wenn der Takt die Zeile beschließt */
  mEnd: number;
  /** starrer Teil vom linken Taktstrich bis zur ersten Notenmitte */
  lFix: number;
  /** zusätzliche Breite einer Taktangabe mitten in der Zeile */
  timeW: number;
}

function measureBars(song: Song, m: Metrics, stems: Map<number, Stem>): BarMeasure[] {
  const ms: BarMeasure[] = song.bars.map((bar) => {
    const ev = bar.events;
    const e = ev.map((x) => BASE * (DUR_F[`${x.dur}${x.dots ? "." : ""}`] ?? 1.2));
    const mm = ev.map((x, i) => {
      const nx = ev[i + 1];
      if (!nx) return 0;
      let need = rightExt(x, stems) + 0.45 + leftExt(nx);
      if (x.kind === "note" && x.breath) need += 0.5;
      return Math.max(need, sylNeed(x, nx, m));
    });
    const first = ev[0];
    let lFix = first ? Math.max(L_FIX, leftExt(first) + 0.55) : L_FIX;
    if (bar.repeatStart) lFix += REP_W;
    return {
      bar,
      e,
      m: mm,
      mEnd: 0,
      lFix,
      timeW: bar.timeChange ? timeSigWidth(bar.time) + TIME_PAD + 0.3 : 0,
    };
  });
  // letzte Note eines Takts: bis zum Taktstrich, innerhalb der Zeile und am Zeilenende
  ms.forEach((b, i) => {
    const ev = b.bar.events;
    const last = ev[ev.length - 1];
    if (!last) {
      b.m.push(1);
      b.e.push(2);
      b.mEnd = 1;
      return;
    }
    let base = rightExt(last, stems) + 0.5;
    if (last.kind === "note" && last.breath) base += 0.6;
    if (b.bar.barline === "repeatEnd") base += REP_W;
    if (b.bar.barline === "final") base += 0.6;
    const next = ms[i + 1];
    const nextFirst = next?.bar.events[0];
    let inLine = base;
    if (next && nextFirst) inLine = Math.max(inLine, sylNeed(last, nextFirst, m) - next.lFix);
    const wl = sylWidth(last, m);
    const hy = last.kind === "note" && last.syllable?.hyphen;
    const atEnd = Math.max(base, wl / 2 + (hy ? 1.3 : 0.15));
    b.m[b.m.length - 1] = inLine;
    b.mEnd = atEnd;
  });
  return ms;
}

/** Breite eines Takts (linker Taktstrich bzw. Kopfende → rechter Taktstrich) bei Dehnung s */
function barWidth(b: BarMeasure, s: number, lineStart: boolean, lineEnd: boolean): number {
  let w = b.lFix + L_EL * s + (lineStart ? 0 : b.timeW);
  const n = b.e.length;
  for (let i = 0; i < n - 1; i++) w += Math.max(b.e[i] * s, b.m[i]);
  w += Math.max(b.e[n - 1] * s * R_F, lineEnd ? b.mEnd : b.m[n - 1]);
  return w;
}

// ---------------------------------------------------------------- Zeilen

/** ein Takt in einer Zeile */
export interface BarLayout {
  /** Index in Song.bars */
  index: number;
  /** linker Taktstrich (beim ersten Takt der Zeile: Ende des Zeilenkopfs) */
  x0: number;
  /** rechter Taktstrich */
  x1: number;
  /** Mitte jedes Ereignisses (Notenkopf bzw. Pause), in der Reihenfolge von Bar.events */
  xs: number[];
  /** Taktangabe mitten in der Zeile (linker Rand der Ziffern), sonst null */
  timeX: number | null;
}

export interface SystemLayout {
  bars: BarLayout[];
  /** Lage des ersten Vorzeichens der Tonart */
  keyX: number;
  /** Taktangabe im Zeilenkopf (am Liedanfang und bei Taktwechsel am Zeilenanfang), sonst null */
  time: TimeSig | null;
  /** linker Rand der Taktangabe im Zeilenkopf */
  timeX: number;
  /** Ende des Zeilenkopfs (Schlüssel, Tonart, Taktangabe) */
  headerEnd: number;
  /** Dehnung der Zeile (1 = Grundabstände) */
  stretch: number;
  /** Zeile reicht bis zum rechten Rand */
  justified: boolean;
  /** natürliche Breite der Zeile (rechter Taktstrich des letzten Takts) */
  right: number;
  /** Verkleinerung, falls ein einzelner Takt nicht in die Breite passt (sonst 1) */
  scale: number;
}

export interface ScoreLayout {
  metrics: Metrics;
  /** verfügbare Breite in Zwischenräumen */
  width: number;
  systems: SystemLayout[];
  stems: Map<number, Stem>;
}

/** Breite des Zeilenkopfs */
function headerWidth(song: Song, withTime: TimeSig | null): { keyX: number; timeX: number; end: number } {
  let x = CLEF_X + CLEF_ADV;
  const keyX = x;
  const n = song.key.signature.length;
  x += n * KEY_STEP + (n ? KEY_PAD : 0);
  const timeX = x;
  if (withTime) x += timeSigWidth(withTime) + TIME_PAD;
  return { keyX, timeX, end: x + 0.2 };
}

/** Taktangabe im Kopf einer Zeile, die mit Takt `first` beginnt */
function headerTime(song: Song, first: number): TimeSig | null {
  if (first === 0) return song.bars[0]?.time ?? song.time;
  return song.bars[first].timeChange ? song.bars[first].time : null;
}

/** Gesamtbreite der Takte i … j−1 als eine Zeile bei Dehnung s */
function lineWidth(song: Song, ms: BarMeasure[], i: number, j: number, s: number): number {
  let w = headerWidth(song, headerTime(song, i)).end;
  for (let k = i; k < j; k++) w += barWidth(ms[k], s, k === i, k === j - 1);
  return w;
}

/** Dehnung, bei der die Zeile genau die Breite avail füllt (nach oben begrenzt) */
function solveStretch(song: Song, ms: BarMeasure[], i: number, j: number, avail: number): number {
  let lo = S_MIN;
  let hi = 12;
  if (lineWidth(song, ms, i, j, hi) <= avail) return hi;
  for (let k = 0; k < 40; k++) {
    const mid = (lo + hi) / 2;
    if (lineWidth(song, ms, i, j, mid) > avail) hi = mid;
    else lo = mid;
  }
  return lo;
}

/** Unschönheit einer Zeile: zu luftig wiegt weniger als zu eng */
function badness(s: number): number {
  return s >= 1 ? (s - 1) ** 2 * 10 : (1 - s) ** 2 * 20;
}
/** Kosten je Zeile (bevorzugt bei Gleichstand weniger Zeilen) */
const LINE_COST = 1;
/** Bis zu dieser Dehnung wird auch die letzte Zeile auf volle Breite gebracht. */
const LAST_MAX = 1.45;

/** Takte auf Zeilen verteilen und waagerecht anordnen. width in CSS-Pixeln. */
export function layoutScore(song: Song, opts: { width: number; sp?: number }): ScoreLayout {
  const metrics = metricsFor(opts.width, opts.sp);
  const width = opts.width / metrics.sp;
  const avail = width - BAR_W / 2;
  const stems = stemsOf(song);
  const ms = measureBars(song, metrics, stems);
  const n = ms.length;
  // Umbruch wie bei einem Absatz im Blocksatz: kleinste Summe der Unschönheiten über alle Zeilen
  const best = new Array<number>(n + 1).fill(Infinity);
  const from = new Array<number>(n + 1).fill(0);
  best[0] = 0;
  for (let i = 0; i < n; i++) {
    if (best[i] === Infinity) continue;
    for (let j = i + 1; j <= n; j++) {
      const fits = lineWidth(song, ms, i, j, S_MIN) <= avail;
      if (!fits && j > i + 1) break;
      let cost: number;
      if (!fits) cost = 1e6; // einzelner Takt zu breit: wird verkleinert
      else if (j === n && lineWidth(song, ms, i, j, 1) <= avail) {
        // letzte Zeile darf kürzer sein, aber kein einzelner Takt ganz allein, wenn es sich vermeiden lässt
        cost = j - i === 1 && n > 1 && lineWidth(song, ms, i, j, 1) < avail * 0.4 ? 1.5 : 0;
      }
      else cost = badness(solveStretch(song, ms, i, j, avail));
      cost += LINE_COST + best[i];
      if (cost < best[j]) {
        best[j] = cost;
        from[j] = i;
      }
    }
  }
  const ranges: [number, number][] = [];
  for (let j = n; j > 0; j = from[j]) ranges.unshift([from[j], j]);
  // Dehnung je Zeile
  const stretches = ranges.map(([i, j]) => solveStretch(song, ms, i, j, avail));
  const systems = ranges.map(([i, j], k): SystemLayout => {
    let s = stretches[k];
    let justified = true;
    let scale = 1;
    if (lineWidth(song, ms, i, j, S_MIN) > avail) {
      s = S_MIN;
      scale = avail / lineWidth(song, ms, i, j, S_MIN);
    } else if (j === n && s > LAST_MAX) {
      // letzte Zeile: nicht übermäßig dehnen, sondern so dicht wie die übrigen Zeilen setzen
      const others = stretches.slice(0, -1).sort((a, b) => a - b);
      const typical = others.length ? others[Math.floor(others.length / 2)] : 1;
      s = Math.min(s, Math.max(1, Math.min(typical, LAST_MAX)));
      justified = false;
    }
    return placeSystem(song, ms, i, j, s, justified, scale, avail);
  });
  return { metrics, width, systems, stems };
}

function placeSystem(
  song: Song,
  ms: BarMeasure[],
  i: number,
  j: number,
  s: number,
  justified: boolean,
  scale: number,
  avail: number,
): SystemLayout {
  const time = headerTime(song, i);
  const head = headerWidth(song, time);
  let x = head.end;
  const bars: BarLayout[] = [];
  for (let k = i; k < j; k++) {
    const b = ms[k];
    const lineStart = k === i;
    const lineEnd = k === j - 1;
    const x0 = x;
    let timeX: number | null = null;
    if (b.timeW && !lineStart) {
      timeX = x + 0.55 + (b.bar.repeatStart ? REP_W : 0);
      x += b.timeW;
    }
    x += b.lFix + L_EL * s;
    const xs: number[] = [];
    const n = b.e.length;
    for (let q = 0; q < n; q++) {
      xs.push(x);
      if (q < n - 1) x += Math.max(b.e[q] * s, b.m[q]);
    }
    x += Math.max(b.e[n - 1] * s * R_F, lineEnd ? b.mEnd : b.m[n - 1]);
    // ganze Pause allein im Takt: mittig
    const ev = b.bar.events;
    if (ev.length === 1 && ev[0].kind === "rest" && ev[0].dur === 1) xs[0] = (x0 + L_FIX + x) / 2;
    bars.push({ index: b.bar.index, x0, x1: x, xs, timeX });
  }
  // Rundungsfehler der Dehnungssuche: Blocksatz genau bis zum Rand
  const right = x;
  if (justified && scale === 1 && right > head.end && right !== avail) {
    const f = (avail - head.end) / (right - head.end);
    const sx = (v: number) => head.end + (v - head.end) * f;
    for (const b of bars) {
      b.x0 = sx(b.x0);
      b.x1 = sx(b.x1);
      b.xs = b.xs.map(sx);
      if (b.timeX != null) b.timeX = sx(b.timeX);
    }
  }
  return {
    bars,
    keyX: head.keyX,
    time,
    timeX: head.timeX,
    headerEnd: head.end,
    stretch: s,
    justified,
    right: bars[bars.length - 1].x1,
    scale,
  };
}
