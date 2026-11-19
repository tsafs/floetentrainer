// Notenband (docs/app-notenband.md), Teil Notenbild: ein wachsendes „Lied“ aus Abschnitten. Erzeugte
// Abschnitte bekommen Notenwerte aus kleinen Taktmustern, Liedstücke werden mit ihren Takten übernommen.
// Rein rechnerisch (ohne DOM), in Vitest prüfbar. Zeiten in Vierteln wie in ./model.ts.

import { note } from "../music/notes";
import type { Rng } from "../srs/choices";
import type { Accidental, Bar, BarEvent, Duration, KeyInfo, NoteEvent, RestEvent, Song, SongPitch, TimeSig } from "./model";
import { barQuarters, keyInfo } from "./parse";
import { timelineOfBars, type Timeline } from "./timeline";

const EPS = 1e-6;

/** Taktmuster je Taktart: mitten im Abschnitt und für den letzten Takt (endet mit einem langen Ton) */
interface Patterns {
  mid: [number[], number][];
  end: number[][];
  /** Takte je Abschnitt */
  bars: number;
}

const PATTERNS: Record<string, Patterns> = {
  "4/4": {
    mid: [
      [[1, 1, 1, 1], 5],
      [[2, 1, 1], 3],
      [[1, 1, 2], 3],
      [[0.5, 0.5, 1, 1, 1], 2],
      [[1, 1, 0.5, 0.5, 1], 2],
      [[1, 0.5, 0.5, 2], 1.5],
      [[1.5, 0.5, 1, 1], 1],
      [[2, 2], 1],
    ],
    end: [[1, 1, 2], [2, 2], [4], [1, 3]],
    bars: 2,
  },
  "3/4": {
    mid: [
      [[1, 1, 1], 5],
      [[2, 1], 3],
      [[0.5, 0.5, 1, 1], 2],
      [[1, 0.5, 0.5, 1], 1.5],
      [[1.5, 0.5, 1], 1],
    ],
    end: [[3], [1, 2]],
    bars: 2,
  },
  "2/4": {
    mid: [
      [[1, 1], 5],
      [[0.5, 0.5, 1], 2.5],
      [[1, 0.5, 0.5], 2],
      [[0.5, 0.5, 0.5, 0.5], 1],
    ],
    end: [[2], [1, 1]],
    bars: 4,
  },
  "6/8": {
    mid: [
      [[1, 0.5, 1, 0.5], 4],
      [[1.5, 1, 0.5], 2],
      [[0.5, 0.5, 0.5, 1.5], 2],
      [[1.5, 1.5], 1.5],
    ],
    end: [[3], [1.5, 1.5]],
    bars: 2,
  },
};
PATTERNS["2/2"] = PATTERNS["4/4"];

const meterKey = (t: TimeSig) => `${t.num}/${t.den}`;

/** Taktart, die das Band kann (sonst 4/4) */
export function bandMeter(t: TimeSig | undefined): TimeSig {
  return t && PATTERNS[meterKey(t)] ? t : { num: 4, den: 4 };
}

function pick<T>(list: [T, number][], rng: Rng): T {
  const total = list.reduce((s, [, w]) => s + w, 0);
  let x = rng() * total;
  for (const [t, w] of list) {
    x -= w;
    if (x < 0) return t;
  }
  return list[list.length - 1][0];
}

/** Notenwerte, die ein einzelner Ton haben kann (in Vierteln) */
const SINGLE = [4, 3, 2, 1.5, 1, 0.5];

/** Schlusstakt mit nur `total` Vierteln (vor einem Auftakt): langer Ton am Ende */
function shortEnd(total: number): number[] {
  if (total < 0.5 - EPS) return [];
  const last = SINGLE.find((v) => v <= total + EPS && Number.isInteger((total - v) * 2 + EPS) && v >= 1) ?? 0.5;
  const out: number[] = [];
  let rest = total - last;
  while (rest >= 1 - EPS) {
    out.push(1);
    rest -= 1;
  }
  if (rest > EPS) out.push(0.5);
  return [...out, last];
}

/**
 * Rhythmus eines erzeugten Abschnitts: Takte mit Notenwerten. lastBar: Länge des letzten Takts, wenn ein
 * Auftakt folgt (sonst ein voller Takt). Der letzte Takt endet mit einem langen Ton.
 */
export function phraseRhythm(meter: TimeSig, rng: Rng, lastBar?: number): number[][] {
  const p = PATTERNS[meterKey(bandMeter(meter))];
  const nominal = barQuarters(bandMeter(meter));
  const out: number[][] = [];
  for (let b = 0; b < p.bars - 1; b++) out.push(pick(p.mid, rng));
  if (lastBar !== undefined && Math.abs(lastBar - nominal) > EPS) out.push(shortEnd(lastBar));
  else out.push(p.end[Math.floor(rng() * p.end.length)]);
  return out;
}

/** Wechsel: gleichmäßige Zählzeiten, am Ende ein langer Ton */
export function drillRhythm(meter: TimeSig): number[][] {
  const m = bandMeter(meter);
  const p = PATTERNS[meterKey(m)];
  const nominal = barQuarters(m);
  const beat = m.den === 8 ? 1.5 : 1;
  const full = Array.from({ length: Math.round(nominal / beat) }, () => beat);
  const out: number[][] = [];
  for (let b = 0; b < p.bars - 1; b++) out.push(full);
  out.push(full.length >= 2 ? [...full.slice(0, -2), beat * 2] : full);
  return out;
}

/** Zahl der Töne eines Rhythmus */
export const toneCount = (r: number[][]) => r.reduce((s, b) => s + b.length, 0);

/** Notenwert aus Vierteln */
function durOf(q: number): { dur: Duration; dots: 0 | 1 } {
  const map: [number, Duration, 0 | 1][] = [
    [4, 1, 0],
    [3, 2, 1],
    [2, 2, 0],
    [1.5, 4, 1],
    [1, 4, 0],
    [0.75, 8, 1],
    [0.5, 8, 0],
    [0.25, 16, 0],
  ];
  const m = map.find(([v]) => Math.abs(v - q) < EPS);
  if (!m) throw new Error(`Notenwert ${q}`);
  return { dur: m[1], dots: m[2] };
}

/** Pausen für eine Lücke von q Vierteln (größte zuerst) */
function restsFor(q: number): number[] {
  const out: number[] = [];
  let r = q;
  for (const v of [4, 2, 1, 0.5, 0.25]) {
    while (r >= v - EPS) {
      out.push(v);
      r -= v;
    }
  }
  return out;
}

function pitchOf(id: string): SongPitch {
  const n = note(id);
  return { letter: n.letter as SongPitch["letter"], alter: n.alter as SongPitch["alter"], octave: n.octave, name: n.name, id: n.id, midi: n.midi, pos: n.pos };
}

/** Grundton und Tongeschlecht aus dem Tonartnamen („a-Moll (dorisch)“, „G-Dur“) bzw. der Tonart */
function tonicOf(keyName: string, key: KeyInfo): { pc: number; minor: boolean } {
  const SEMI: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, h: 11, b: 10 };
  const m = /^([A-Ha-h])(is|es|s)?-(Dur|Moll)/.exec(keyName);
  const name = m ? m[1] + (m[2] ?? "") : key.name;
  const minor = m ? m[3] === "Moll" : key.minor;
  const l = name[0].toLowerCase();
  let pc = SEMI[l] ?? 0;
  const rest = name.slice(1);
  if (rest === "is") pc += 1;
  else if (rest === "es" || rest === "s") pc -= 1;
  return { pc: (pc + 12) % 12, minor };
}

/** Töne des Grundakkords (Grundton, Terz, Quinte) unter den gegebenen */
export function triadNotes(pool: string[], keyName: string, key: KeyInfo): string[] {
  const { pc, minor } = tonicOf(keyName, key);
  const set = new Set([pc, (pc + (minor ? 3 : 4)) % 12, (pc + 7) % 12]);
  return pool.filter((id) => set.has(note(id).midi % 12));
}

/** Ein Abschnitt im Band, wie ihn das Notenbild braucht */
export type BandPart =
  /** erzeugt: Töne und ihre Notenwerte je Takt (gleich viele) */
  | { kind: "tones"; notes: string[]; rhythm: number[][] }
  /** Takte eines Lieds (Ausschnitt mit songExcerpt, Takte ab 0) */
  | { kind: "song"; excerpt: Song };

/** Lage eines Abschnitts im Band */
export interface PartSpan {
  /** erster Takt (Index in bars) */
  bar: number;
  /** Töne im Zeitplan: von (eingeschlossen) bis (ausgeschlossen) */
  from: number;
  to: number;
}

/**
 * Das wachsende Notenband. append hängt einen Abschnitt an; song() liefert das „Lied“ zum Setzen,
 * timeline() den Zeitplan aller Töne (Tonwiederholungen einzeln, Haltebögen zusammengefasst).
 */
export class BandScore {
  readonly meter: TimeSig;
  readonly nominal: number;
  readonly key: KeyInfo = keyInfo("C")!;
  readonly bars: Bar[] = [];
  readonly notes: NoteEvent[] = [];
  private nextId = 1;
  private tl: Timeline | null = null;

  constructor(
    meter: TimeSig,
    readonly hasLyrics: boolean,
  ) {
    this.meter = bandMeter(meter);
    this.nominal = barQuarters(this.meter);
  }

  /** Länge des letzten Takts, wenn er noch offen ist (kürzer als ein Takt), sonst null */
  get openBar(): number | null {
    const b = this.bars[this.bars.length - 1];
    return b && b.length < this.nominal - EPS ? b.length : null;
  }

  private newBar(): Bar {
    const b: Bar = {
      index: this.bars.length,
      events: [],
      time: this.meter,
      timeChange: false,
      nominal: this.nominal,
      length: 0,
      pickup: false,
      repeatStart: false,
      barline: "single",
      volta: null,
      voltaStart: false,
      line: 0,
      breakAfter: false,
      breakInside: null,
    };
    this.bars.push(b);
    return b;
  }

  /** Ereignis an den Takt hängen (Kennung, Takt und Lage werden gesetzt) */
  private push(bar: Bar, e: Omit<NoteEvent, "id" | "bar" | "offset"> | Omit<RestEvent, "id" | "bar" | "offset">): BarEvent {
    const ev = { ...e, id: this.nextId++, bar: bar.index, offset: bar.length } as BarEvent;
    bar.events.push(ev);
    bar.length += ev.q;
    if (ev.kind === "note") this.notes.push(ev);
    return ev;
  }

  private rest(bar: Bar, q: number): void {
    for (const v of restsFor(q)) this.push(bar, { kind: "rest", ...durOf(v), q: v });
  }

  private tone(bar: Bar, id: string, q: number): NoteEvent {
    return this.push(bar, {
      kind: "note",
      ...durOf(q),
      q,
      pitch: pitchOf(id),
      accidental: null,
      tie: false,
      tiedFromPrev: false,
      slurStart: false,
      slurEnd: false,
      breath: false,
      syllable: null,
    }) as NoteEvent;
  }

  /** Takt, in den das Nächste kommt: der offene letzte oder ein neuer */
  private barFor(): Bar {
    return this.openBar !== null ? this.bars[this.bars.length - 1] : this.newBar();
  }

  /** Einen Abschnitt anhängen. Gibt seine Lage zurück. */
  append(part: BandPart): PartSpan {
    const before = this.timeline().tones.length;
    const firstBar = this.openBar !== null ? this.bars.length - 1 : this.bars.length;
    const touched = new Set<Bar>();
    if (part.kind === "tones") {
      let k = 0;
      let last: NoteEvent | null = null;
      for (const bq of part.rhythm) {
        const bar = this.barFor();
        touched.add(bar);
        for (const q of bq) last = this.tone(bar, part.notes[k++], q);
      }
      // Atemzeichen am Abschnittsende (wie im Heft am Phrasenende)
      if (last) last.breath = true;
    } else {
      const ex = part.excerpt;
      const idMap = new Map<number, number>();
      const syls: NoteEvent[] = [];
      ex.bars.forEach((src, k) => {
        let bar: Bar;
        if (k === 0 && src.length < src.nominal - EPS) {
          // Auftakt: an den offenen Takt davor anschließen, sonst mit Pausen davor zu einem ganzen Takt
          const open = this.openBar;
          if (open !== null && Math.abs(open + src.length - this.nominal) < EPS) bar = this.bars[this.bars.length - 1];
          else {
            if (open !== null) this.rest(this.bars[this.bars.length - 1], this.nominal - open);
            bar = this.newBar();
            this.rest(bar, this.nominal - src.length);
          }
        } else {
          if (this.openBar !== null) this.rest(this.bars[this.bars.length - 1], this.nominal - this.openBar!);
          bar = this.newBar();
        }
        touched.add(bar);
        for (const e of src.events) {
          const { id: _id, bar: _bar, offset: _off, ...rest } = e;
          const ev = this.push(bar, rest as never);
          idMap.set(e.id, ev.id);
          if (ev.kind === "note" && ev.syllable) syls.push(ev);
        }
        // kurzer Schlusstakt: mit einer Pause auffüllen
        if (k === ex.bars.length - 1 && bar.length < this.nominal - EPS) this.rest(bar, this.nominal - bar.length);
      });
      for (const n of syls) {
        if (n.syllable!.extendTo != null) n.syllable = { ...n.syllable!, extendTo: idMap.get(n.syllable!.extendTo) ?? null };
      }
      const lastNote = this.notes[this.notes.length - 1];
      if (lastNote) lastNote.breath = true;
    }
    for (const b of touched) assignAccidentals(b, this.key);
    this.tl = null;
    return { bar: firstBar, from: before, to: this.timeline().tones.length };
  }

  /** Letzten Takt mit Schlussstrich abschließen (offenen Takt mit Pause füllen) */
  close(): void {
    const b = this.bars[this.bars.length - 1];
    if (!b) return;
    if (b.length < this.nominal - EPS) this.rest(b, this.nominal - b.length);
    b.barline = "final";
    this.tl = null;
  }

  /** Zeitplan aller Töne bisher */
  timeline(): Timeline {
    this.tl ??= this.bars.length
      ? timelineOfBars(this.song(), this.bars.map((b) => b.index))
      : { tones: [], bars: [], total: 0, countIn: [], countInDur: 0, countInBeats: 0 };
    return this.tl;
  }

  /** Das Band als Lied zum Setzen (renderScore mit band-Option) */
  song(): Song {
    const midis = this.notes.map((n) => n.pitch);
    const low = midis.reduce((a, b) => (b.midi < a.midi ? b : a), midis[0] ?? pitchOf("g1"));
    const high = midis.reduce((a, b) => (b.midi > a.midi ? b : a), midis[0] ?? pitchOf("g1"));
    return {
      id: "notenband",
      title: "Notenband",
      subtitle: null,
      chapter: "",
      key: this.key,
      keyName: "C-Dur",
      time: this.meter,
      credit: "",
      hasLyrics: this.hasLyrics,
      stanzas: [],
      stanzaCols: null,
      bars: this.bars,
      notes: this.notes,
      range: { low, high },
    };
  }
}

/** Vorzeichen im Notenbild: ohne Vorzeichnung, Abweichungen gelten bis zum Taktende (wie in parse.ts) */
function assignAccidentals(bar: Bar, key: KeyInfo): void {
  const sign: Record<number, Accidental> = { 1: "sharp", [-1]: "flat", 0: "natural" };
  const state = new Map<string, number>();
  for (const e of bar.events) {
    if (e.kind !== "note") continue;
    const p = e.pitch;
    const k = p.letter + p.octave;
    const have = state.get(k) ?? key.alter[p.letter] ?? 0;
    state.set(k, p.alter);
    e.accidental = p.alter !== have ? sign[p.alter] : null;
  }
}
