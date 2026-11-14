// Leser für eigene Lieder im ABC-Format (Standard 2.1, abcnotation.com), für einstimmige Melodien.
// Ergebnis ist dasselbe Liedmodell wie bei den Heft-Liedern (./model.ts), damit Notensatz, Zeitplan
// und Vorspielen unverändert damit arbeiten.
//
// Verstanden wird: Kopffelder X: T: M: L: K: Q: (C: O: S: als Quellenangabe, W: als weitere Strophen),
// Noten mit Oktavlage, Vorzeichen (gelten bis zum Taktende), Längen, punktierte und gebrochene
// Rhythmen > <, Pausen z x Z, Taktstriche, Wiederholungen |: :| :: mit Klammern [1 |2 …, Triolen (3,
// Halte- und Bindebögen, Liedtext aus w:-Zeilen, Feldwechsel im Stück ([K:…] [M:…] [L:…]).
// Vereinfacht: Akkorde → nur der oberste Ton; Verzierungen, Vorschläge, Begleitakkorde, weitere
// Stimmen werden weggelassen und gezählt (AbcTune.omitted). Was sich gar nicht lesen lässt, wird mit
// Zeilenangabe gemeldet (AbcProblem), statt still zu fehlen.

import type {
  Accidental,
  Alter,
  Bar,
  BarEvent,
  Barline,
  Duration,
  KeyInfo,
  KeyMode,
  Letter,
  NoteEvent,
  Song,
  SongPitch,
  TimeSig,
  Tuplet,
} from "./model";
import { barQuarters, keyInfo, slugify } from "./parse";
import { checkRange, type RangeCheck } from "./range";

// ---------------------------------------------------------------- Ergebnis

/** Ein gelesenes Stück aus einer ABC-Datei. */
export interface AbcTune {
  /** Nummer aus X: (null, wenn das Stück keine hat) */
  number: number | null;
  title: string;
  /** Zeile, in der das Stück beginnt (1-basiert) */
  line: number;
  song: Song;
  /** Was weggelassen oder vereinfacht wurde, für die Nutzerin, z. B. "Begleitakkorde (12)" */
  omitted: string[];
  /** Weitere Hinweise, z. B. ungleiche Taktlängen oder angenommene Tonart */
  hints: string[];
  /** Tonumfang der Sopranflöte (c¹–d³); bei shift lässt sich das Lied mit shiftOctave verschieben */
  range: RangeCheck;
}

/** Ein Stück, das sich nicht lesen ließ. */
export interface AbcProblem {
  number: number | null;
  title: string;
  /** Zeile des Fehlers (1-basiert, 0 = ohne Zeile) */
  line: number;
  /** Meldung auf Deutsch, mit Zeilenangabe */
  message: string;
}

export interface AbcResult {
  /** lesbare Stücke in Datei-Reihenfolge (mehrere → zur Auswahl anbieten) */
  tunes: AbcTune[];
  /** nicht lesbare Stücke */
  errors: AbcProblem[];
}

/** Fehler beim Lesen: Zeile und Grund. */
export class AbcError extends Error {
  constructor(
    readonly line: number,
    readonly reason: string,
  ) {
    super(line > 0 ? `Zeile ${line}: ${reason}` : reason);
    this.name = "AbcError";
  }
}

/** Kapitel der eingelesenen Lieder in der Liederliste */
export const ABC_CHAPTER = "Eigene Lieder";

// ---------------------------------------------------------------- Brüche (Längen in ganzen Noten)

type Frac = readonly [number, number];
const gcd = (a: number, b: number): number => (b ? gcd(b, a % b) : Math.abs(a));
function fr(n: number, d = 1): Frac {
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d) || 1;
  return [n / g, d / g];
}
const mul = (a: Frac, b: Frac) => fr(a[0] * b[0], a[1] * b[1]);
const add = (a: Frac, b: Frac) => fr(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const sub = (a: Frac, b: Frac) => fr(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
const cmp = (a: Frac, b: Frac) => a[0] * b[1] - b[0] * a[1];
const ZERO: Frac = [0, 1];
/** ganze Noten → Viertel */
const quarters = (a: Frac) => (4 * a[0]) / a[1];
const fmt = (x: number) => String(Math.round(x * 1000) / 1000).replace(".", ",");

/** Darstellbare Einzelnoten des Modells (Notenwert, Punkt), längste zuerst. */
const PIECES: { dur: Duration; dots: 0 | 1; f: Frac }[] = ([1, 2, 4, 8, 16] as Duration[])
  .flatMap((dur) => [
    { dur, dots: 1 as const, f: fr(3, 2 * dur) },
    { dur, dots: 0 as const, f: fr(1, dur) },
  ])
  .sort((a, b) => cmp(b.f, a.f));

/** Länge als Folge darstellbarer Noten (für Haltebögen), oder null, wenn kürzer als ein Sechzehntel übrig bleibt. */
function decompose(f: Frac): { dur: Duration; dots: 0 | 1; f: Frac }[] | null {
  const out: { dur: Duration; dots: 0 | 1; f: Frac }[] = [];
  let rest = f;
  while (rest[0] > 0) {
    const p = PIECES.find((x) => cmp(x.f, rest) <= 0);
    if (!p || out.length >= 32) return null;
    out.push(p);
    rest = sub(rest, p.f);
  }
  return out;
}

// ---------------------------------------------------------------- Tonhöhen und Tonarten

const LETTERS: Letter[] = ["c", "d", "e", "f", "g", "a", "h"];
const SEMI: Record<Letter, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, h: 11 };
const ABC_LETTER: Record<string, Letter> = { C: "c", D: "d", E: "e", F: "f", G: "g", A: "a", B: "h" };
const ACC: Record<string, number> = { "^^": 2, "^": 1, "=": 0, _: -1, __: -2 };

/** Deutscher Name ohne Oktave: fis, b, es, as, ces, his … */
function germanName(letter: Letter, alter: number): string {
  if (alter === 0) return letter;
  if (alter === 1) return letter + "is";
  return ({ e: "es", a: "as", h: "b" } as Record<string, string>)[letter] ?? letter + "es";
}

function makePitch(letter: Letter, alter: Alter, octave: number): SongPitch {
  const name = germanName(letter, alter);
  return {
    letter,
    alter,
    octave,
    name,
    id: name + octave,
    midi: 48 + 12 * octave + SEMI[letter] + alter,
    pos: 7 * octave + LETTERS.indexOf(letter) - 9,
  };
}

const SHARP_SPELL: [Letter, Alter][] = [["c", 0], ["c", 1], ["d", 0], ["d", 1], ["e", 0], ["f", 0], ["f", 1], ["g", 0], ["g", 1], ["a", 0], ["a", 1], ["h", 0]];
const FLAT_SPELL: [Letter, Alter][] = [["c", 0], ["d", -1], ["d", 0], ["e", -1], ["e", 0], ["f", 0], ["g", -1], ["g", 0], ["a", -1], ["a", 0], ["h", -1], ["h", 0]];

/** Tonhöhe zu einer MIDI-Nummer, mit Kreuz- oder Be-Schreibweise (für Doppelkreuze und Doppel-Be). */
function spell(midi: number, sharp: boolean): SongPitch {
  const pc = ((midi % 12) + 12) % 12;
  const [letter, alter] = (sharp ? SHARP_SPELL : FLAT_SPELL)[pc];
  return makePitch(letter, alter, Math.floor(midi / 12) - 4);
}

const MAJ = ["Ces", "Ges", "Des", "As", "Es", "B", "F", "C", "G", "D", "A", "E", "H", "Fis", "Cis"];
const MIN = ["as", "es", "b", "f", "c", "g", "d", "a", "e", "h", "fis", "cis", "gis", "dis", "ais"];
const LETTER_FIFTHS: Record<string, number> = { F: -1, C: 0, G: 1, D: 2, A: 3, E: 4, B: 5 };
const MODES: [string, KeyMode, number, string][] = [
  // Kürzel (erste drei Buchstaben), Modus, Quinten gegenüber Dur, Name im Tonartnamen
  ["maj", "major", 0, ""],
  ["ion", "major", 0, ""],
  ["min", "minor", -3, ""],
  ["aeo", "minor", -3, ""],
  ["m", "minor", -3, ""],
  ["dor", "dorian", -2, "dorisch"],
  ["phr", "phrygian", -4, "phrygisch"],
  ["lyd", "lydian", 1, "lydisch"],
  ["mix", "mixolydian", -1, "mixolydisch"],
  ["loc", "locrian", -5, "lokrisch"],
];
// Reihenfolge und Lage der Vorzeichen im Violinschlüssel (wie in ./parse.ts)
const SHARP_POS: [Letter, number][] = [["f", 8], ["c", 5], ["g", 9], ["d", 6], ["a", 3], ["e", 7], ["h", 4]];
const FLAT_POS: [Letter, number][] = [["h", 4], ["e", 7], ["a", 3], ["d", 6], ["g", 2], ["c", 5], ["f", 1]];
const CLEF_WORDS = new Set(["treble", "bass", "alto", "tenor", "baritone", "perc", "none", "bass3", "alto1", "alto2", "tenor", "soprano", "mezzosoprano"]);

interface KeyRead {
  key: KeyInfo;
  keyName: string;
  /** Oktavverschiebung aus octave=… */
  octave: number;
  /** eigene Vorzeichen in K: angegeben */
  explicit: boolean;
}

/** K:-Feld lesen: "G", "Am", "A dorian", "Ador", "F#m", "Bb mix", "D exp ^f ^c", "none", "G clef=treble". */
function readKey(value: string, line: number): KeyRead {
  const v = value.trim();
  if (/^H[pP]$/.test(v)) throw new AbcError(line, `Dudelsack-Tonart „K:${v}“ wird nicht unterstützt`);
  const m = /^([A-G])([#b]?)(.*)$/.exec(v);
  let fifths = 0;
  let mode: KeyMode = "major";
  let modeName = "";
  let tonicDe = "c";
  let rest = v;
  if (m) {
    const [, l, acc] = m;
    rest = m[3];
    fifths = LETTER_FIFTHS[l] + (acc === "#" ? 7 : acc === "b" ? -7 : 0);
    tonicDe = germanName(ABC_LETTER[l], acc === "#" ? 1 : acc === "b" ? -1 : 0);
    const w = /^\s*([A-Za-z]+)(?=\s|$)/.exec(rest);
    if (w && !CLEF_WORDS.has(w[1].toLowerCase()) && w[1].toLowerCase() !== "exp") {
      const word = w[1].toLowerCase();
      const found = MODES.find(([k]) => (k === "m" ? word === "m" : word.startsWith(k)));
      if (!found) throw new AbcError(line, `Unbekannte Tonart „K:${v}“ (Beispiele: G, Em, A dorian, D mix)`);
      [, mode, , modeName] = found;
      fifths += found[2];
      rest = rest.slice(w[0].length);
    }
  } else if (v && !/^none\b/i.test(v) && !/^[a-z]+=/i.test(v) && !/^(\^|_|=|exp\b)/.test(v)) {
    throw new AbcError(line, `Unbekannte Tonart „K:${v}“ (Beispiele: G, Em, A dorian, D mix)`);
  } else rest = v.replace(/^none\b/i, "");
  if (Math.abs(fifths) > 7) throw new AbcError(line, `Tonart „K:${v}“ hat mehr als sieben Vorzeichen`);

  const minorLike = mode === "minor";
  const base = keyInfo(minorLike ? MIN[fifths + 7] : MAJ[fifths + 7])!;
  const key: KeyInfo = { ...base, alter: { ...base.alter }, mode, tonic: tonicDe };
  let octave = 0;
  let explicit = false;
  for (const tok of rest.trim().split(/\s+/).filter(Boolean)) {
    const acc = /^(\^\^|\^|__|_|=)([A-Ga-g])$/.exec(tok);
    const kv = /^([a-zA-Z-]+)=(.*)$/.exec(tok);
    if (tok.toLowerCase() === "exp") {
      key.alter = {};
      explicit = true;
    } else if (acc) {
      const a = ACC[acc[1]];
      if (Math.abs(a) > 1) throw new AbcError(line, `Doppelte Vorzeichen in der Tonart „K:${v}“ werden nicht unterstützt`);
      const l = ABC_LETTER[acc[2].toUpperCase()];
      if (a === 0) delete key.alter[l];
      else key.alter[l] = a as Alter;
      explicit = true;
    } else if (kv) {
      if (kv[1].toLowerCase() === "octave" && /^-?\d$/.test(kv[2])) octave = Number(kv[2]);
      // clef=, middle=, transpose= … ändern die notierten Töne nicht und werden übergangen
    } else if (!CLEF_WORDS.has(tok.toLowerCase())) {
      throw new AbcError(line, `Unbekannte Angabe „${tok}“ in der Tonart „K:${v}“`);
    }
  }
  if (explicit) {
    const sharps = SHARP_POS.filter(([l]) => key.alter[l] === 1);
    const flats = FLAT_POS.filter(([l]) => key.alter[l] === -1);
    key.signature = [
      ...sharps.map(([, pos]) => ({ accidental: "sharp" as const, pos })),
      ...flats.map(([, pos]) => ({ accidental: "flat" as const, pos })),
    ];
    key.fifths = flats.length ? (sharps.length ? 0 : -flats.length) : sharps.length;
  }
  let keyName: string;
  const cap = (s: string) => s[0].toUpperCase() + s.slice(1);
  if (mode === "major") keyName = `${cap(tonicDe)}-Dur`;
  else if (mode === "minor") keyName = `${tonicDe}-Moll`;
  else if (mode === "lydian" || mode === "mixolydian") keyName = `${cap(tonicDe)}-Dur (${modeName})`;
  else keyName = `${tonicDe}-Moll (${modeName})`;
  if (explicit) keyName += " mit eigenen Vorzeichen";
  return { key, keyName, octave, explicit };
}

// ---------------------------------------------------------------- Kopffelder

/** M:-Feld: "3/4", "6/8", "C" (4/4), "C|" (2/2), "2+3/8"; null bei "none". */
function readMeter(value: string, line: number): TimeSig | null {
  const v = value.trim();
  if (v === "C") return { num: 4, den: 4 };
  if (v === "C|") return { num: 2, den: 2 };
  if (/^none$/i.test(v) || v === "") return null;
  const m = /^\(?\s*(\d+(?:\s*\+\s*\d+)*)\s*\)?\s*\/\s*(\d+)$/.exec(v);
  if (m) {
    const num = m[1].split("+").reduce((s, x) => s + Number(x), 0);
    const den = Number(m[2]);
    if (num > 0 && num <= 32 && [1, 2, 4, 8, 16].includes(den)) return { num, den };
  }
  throw new AbcError(line, `Ungültige Taktart „M:${v}“ (Beispiele: 3/4, 6/8, C)`);
}

/** L:-Feld: "1/8", "1/4", "1/16", "1" */
function readUnit(value: string, line: number): Frac {
  const m = /^\s*(\d+)\s*(?:\/\s*(\d+))?\s*$/.exec(value);
  if (m) {
    const n = Number(m[1]);
    const d = m[2] ? Number(m[2]) : 1;
    if (n > 0 && d > 0 && (d & (d - 1)) === 0) return fr(n, d);
  }
  throw new AbcError(line, `Ungültige Grundnotenlänge „L:${value.trim()}“ (Beispiel: L:1/8)`);
}

/**
 * Q:-Feld: "1/4=100", "3/8=60", "\"Allegro\" 1/4=120", "1/8 3/8=40" (Summe). Alte Form "Q:100":
 * Schläge der Grundnotenlänge L pro Minute (so steht es im Standard). Ohne Zahl (nur Text) → null.
 */
function readTempo(value: string, unit: Frac): { beat: number; bpm: number } | null {
  const v = value.replace(/"[^"]*"/g, " ").trim();
  const m = /^((?:\d+\/\d+\s*)+)=\s*(\d+(?:\.\d+)?)/.exec(v);
  if (m) {
    const beat = m[1].trim().split(/\s+/).reduce((s, x) => {
      const [a, b] = x.split("/").map(Number);
      return s + (4 * a) / b;
    }, 0);
    const bpm = Number(m[2]);
    return beat > 0 && bpm > 0 ? { beat, bpm } : null;
  }
  const old = /^(\d+(?:\.\d+)?)$/.exec(v);
  if (old && Number(old[1]) > 0) return { beat: quarters(unit), bpm: Number(old[1]) };
  return null;
}

// Textzeichen der ABC-Schreibweise: \"u → ü, \ss → ß, &auml; → ä, \u00fc → ü
const MARKS: Record<string, string> = { '"': "\u0308", "'": "\u0301", "`": "\u0300", "^": "\u0302", "~": "\u0303", ",": "\u0327", o: "\u030a", "=": "\u0304", ".": "\u0307", c: "\u030c", u: "\u0306" };
const ENT: Record<string, string> = { uml: "\u0308", acute: "\u0301", grave: "\u0300", circ: "\u0302", tilde: "\u0303", cedil: "\u0327", ring: "\u030a" };
const NAMED: Record<string, string> = { szlig: "ß", amp: "&", quot: '"', lt: "<", gt: ">", nbsp: " ", apos: "'", aelig: "æ", AElig: "Æ", oelig: "œ", OElig: "Œ", oslash: "ø", Oslash: "Ø" };

/** ABC-Text in normalen Text: Umlaut-Schreibweisen und HTML-Namen auflösen, \% → %. */
export function abcText(s: string): string {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\ss/g, "ß")
    .replace(/\\(AE|ae|OE|oe)/g, (_, x: string) => ({ AE: "Æ", ae: "æ", OE: "Œ", oe: "œ" })[x]!)
    .replace(/\\(["'`^~,o=.cu])([A-Za-z])/g, (_, k: string, l: string) => (l + MARKS[k]).normalize("NFC"))
    .replace(/&([A-Za-z])(uml|acute|grave|circ|tilde|cedil|ring);/g, (_, l: string, k: string) => (l + ENT[k]).normalize("NFC"))
    .replace(/&([A-Za-z]+);/g, (all, n: string) => NAMED[n] ?? all)
    .replace(/\\%/g, "%");
}

/** Kommentar ab % entfernen (\% bleibt stehen). */
function stripComment(line: string): string {
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "%" && line[i - 1] !== "\\") return line.slice(0, i);
  }
  return line;
}

// ---------------------------------------------------------------- Stücke trennen

interface SrcLine {
  text: string;
  no: number;
}
interface Chunk {
  lines: SrcLine[];
  /** erste Zeile mit Text nach der Leerzeile, die das Stück beendet (gehört zu keinem Stück) */
  trailing: number | null;
}

/** Felder im Dateikopf (vor dem ersten X:), die nach dem Standard für alle Stücke gelten und das Lesen der Noten ändern */
const FILE_HEAD_RE = /^[LMQU]:/;

/**
 * Zeilen des Dateikopfs, die für alle Stücke gelten (L: M: Q: U: vor dem ersten X:). Die Stücke
 * können sie mit eigenen Feldern überschreiben. Ohne X: gibt es keinen Dateikopf (alles ist ein Stück).
 */
export function fileHeadFields(lines: string[]): string[] {
  const first = lines.findIndex((l) => /^X:/.test(l));
  return first < 0 ? [] : lines.slice(0, first).filter((l) => FILE_HEAD_RE.test(l)).map((l) => stripComment(l).trimEnd());
}

/** Datei in Stücke teilen: jedes beginnt mit X: und endet an einer Leerzeile; ohne X: ist alles ein Stück. */
function splitTunes(lines: string[]): Chunk[] {
  if (!lines.some((l) => /^X:/.test(l))) {
    return [{ lines: lines.map((text, i) => ({ text, no: i + 1 })), trailing: null }];
  }
  // Dateikopf: gilt für jedes Stück, steht dort gleich nach X: (eigene Felder des Stücks folgen danach)
  const head: SrcLine[] = [];
  for (let i = 0; i < lines.length && !/^X:/.test(lines[i]); i++) if (FILE_HEAD_RE.test(lines[i])) head.push({ text: lines[i], no: i + 1 });
  const out: Chunk[] = [];
  let cur: (Chunk & { ended: boolean }) | null = null;
  lines.forEach((text, i) => {
    if (/^X:/.test(text)) {
      cur = { lines: [{ text, no: i + 1 }, ...head.map((h) => ({ ...h }))], trailing: null, ended: false };
      out.push(cur);
      return;
    }
    if (!cur) return; // Dateikopf vor dem ersten Stück
    if (cur.ended) {
      const t = stripComment(text).trim();
      if (t && cur.trailing == null) cur.trailing = i + 1;
      return;
    }
    if (!text.trim()) {
      cur.ended = true;
      return;
    }
    cur.lines.push({ text, no: i + 1 });
  });
  return out;
}

// ---------------------------------------------------------------- Elemente (1. Schritt)

interface TimedBase {
  /** tatsächliche Länge in ganzen Noten (Triole eingerechnet) */
  len: Frac;
  /** geschriebene Länge (ohne Triolen-Verkürzung) */
  written: Frac;
  tuplet?: Tuplet;
  src: number;
  mline: number;
}
interface NoteEl extends TimedBase {
  t: "note";
  /** Stammton und Oktave im ABC-Sinn (für Vorzeichen bis zum Taktende) */
  abcLetter: string;
  abcOctave: number;
  /** Halbtöne gegenüber dem Stammton (−2 … 2) */
  semis: number;
  pitch: SongPitch;
  tie: boolean;
  slurStart: boolean;
  slurEnd: boolean;
  breath: boolean;
  syllable: { text: string; hyphen: boolean } | null;
  /** Melisma (_) bis zu dieser Note */
  extendTo: NoteEl | null;
  /** Kennungen der Noten im Modell (bei aufgeteilten Längen mehrere) */
  ids: number[];
}
interface RestEl extends TimedBase {
  t: "rest";
}
interface BarEl {
  t: "bar";
  /** Wiederholung endet hier (:| bzw. ::) */
  end: boolean;
  /** Wiederholung beginnt danach (|: bzw. ::) */
  start: boolean;
  /** Art des Strichs ohne Doppelpunkte */
  style: "single" | "double" | "final" | "thick";
  src: number;
}
interface VoltaEl {
  t: "volta";
  nums: number[];
  src: number;
}
interface MeterEl {
  t: "meter";
  time: TimeSig;
  src: number;
}
interface KeyEl {
  t: "key";
  key: KeyInfo;
  src: number;
}
interface EolEl {
  t: "eol";
}
type El = NoteEl | RestEl | BarEl | VoltaEl | MeterEl | KeyEl | EolEl;

// Verzierungen mit eigener Bedeutung (Kürzel nach dem Standard; U: kann sie umdefinieren)
const SHORTCUTS: Record<string, string> = {
  "~": "roll", ".": "staccato", H: "fermata", L: "accent", M: "lowermordent", O: "coda", P: "uppermordent",
  S: "segno", T: "trill", u: "upbow", v: "downbow",
};
const JUMPS = new Set(["segno", "coda", "fine", "D.C.", "D.S.", "dacapo", "dacoda", "D.C.alcoda", "D.C.alfine", "D.S.alcoda", "D.S.alfine"]);

// Weggelassen-Kategorien (Reihenfolge der Ausgabe)
const OMIT = {
  chords: "Begleitakkorde",
  text: "Textanmerkungen über oder unter den Noten",
  deco: "Verzierungen und Vortragszeichen",
  jumps: "Sprungzeichen wie D.C., Segno oder Fine (nicht ausgeschrieben)",
  grace: "Vorschläge",
  chordNotes: "Akkorde: nur oberster Ton",
  voices: "weitere Stimmen",
  overlay: "zweite Stimme im Takt (&)",
  parts: "Teilfolge P: (Teile werden der Reihe nach gespielt)",
  tempo: "Tempowechsel im Stück",
  unknown: "unbekannte Zeichen",
} as const;

// ---------------------------------------------------------------- Ein Stück lesen

/** Feldfortsetzungen zusammenfügen: "+:" hängt an das vorige Feld an, ebenso ein Feld, das mit "\" endet. */
function mergeContinuations(lines: SrcLine[]): SrcLine[] {
  const out: SrcLine[] = [];
  let prevField: SrcLine | null = null;
  let open = false; // voriges Feld endet mit "\"
  for (const l of lines) {
    const t = stripComment(l.text).trimEnd();
    const plus = /^\+:(.*)$/.exec(t);
    const sameField = open && prevField && t.slice(0, 2) === prevField.text.slice(0, 2);
    if (prevField && (plus || sameField)) {
      const add = plus ? plus[1] : t.slice(2);
      prevField.text = prevField.text.replace(/\\$/, "").trimEnd() + " " + add.trim();
      open = /\\$/.test(add.trimEnd());
      continue;
    }
    if (/^[A-Za-z]:(?!\|)/.test(t)) {
      prevField = { text: t, no: l.no };
      out.push(prevField);
      open = /\\$/.test(t);
    } else {
      if (t.trim() && !/^%/.test(l.text)) prevField = null;
      out.push(l);
      open = false;
    }
  }
  return out;
}

function readTune(src: Chunk): AbcTune {
  const chunk: Chunk = { lines: mergeContinuations(src.lines), trailing: src.trailing };
  const omitted = new Map<string, number>();
  const unknownChars = new Set<string>();
  const hintList: string[] = [];
  const counted = new Map<string, number>(); // gezählte Hinweise
  const omit = (k: string, n = 1) => omitted.set(k, (omitted.get(k) ?? 0) + n);
  const hintCount = (k: string) => counted.set(k, (counted.get(k) ?? 0) + 1);

  let number: number | null = null;
  const titles: string[] = [];
  const credit: string[] = [];
  const stanzaLines: string[] = []; // W:-Zeilen
  let meter: TimeSig | null = null;
  let meterGiven = false;
  let unit: Frac | null = null;
  let tempoField: { value: string; line: number } | null = null;
  let keyRead: KeyRead | null = null;
  const userDeco: Record<string, string> = {};
  let melodyVoice: string | null = null;
  let voice: string | null = null;
  let firstLine = chunk.lines[0]?.no ?? 0;

  // --- Kopf
  let i = 0;
  const fieldRe = /^([A-Za-z]):(?!\|)(.*)$/;
  for (; i < chunk.lines.length; i++) {
    const { text, no } = chunk.lines[i];
    const raw = stripComment(text);
    if (/^%%/.test(text) || !raw.trim()) continue;
    const f = fieldRe.exec(raw);
    if (!f) break; // Noten ohne K: davor
    const name = f[1];
    const value = f[2].trim();
    if (name === "X") {
      number = /^\d+/.test(value) ? Number(/^\d+/.exec(value)![0]) : null;
      firstLine = no;
    } else if (name === "T") {
      if (value) titles.push(abcText(value));
    } else if (name === "M") {
      meter = readMeter(value, no);
      meterGiven = true;
    } else if (name === "L") unit = readUnit(value, no);
    else if (name === "Q") tempoField = { value, line: no };
    else if (name === "C" || name === "O" || name === "S") {
      if (value) credit.push(abcText(value));
    } else if (name === "W") stanzaLines.push(abcText(value));
    else if (name === "P") {
      if (/[A-Za-z].*[A-Za-z]|\d/.test(value)) omit(OMIT.parts);
    } else if (name === "V") {
      const id = value.split(/\s+/)[0];
      if (id && melodyVoice == null) melodyVoice = id;
    } else if (name === "U") readUserDeco(value, userDeco);
    else if (name === "K") {
      keyRead = readKey(value, no);
      i++;
      break;
    }
    // andere Felder (Z: N: R: B: D: H: G: I: …) werden übergangen
  }
  if (!keyRead) {
    keyRead = readKey("C", 0);
    hintList.push("Keine Tonart (K:) angegeben – C-Dur angenommen");
  }
  if (!meterGiven) hintList.push("Keine Taktart (M:) angegeben – 4/4 angenommen");
  else if (!meter) hintList.push("Ohne Taktart (M:none) – als 4/4 gelesen");
  // Grundnotenlänge nach dem Standard: unter 3/4 → Sechzehntel, sonst Achtel
  if (!unit) unit = meter && meter.num / meter.den < 0.75 ? fr(1, 16) : fr(1, 8);
  const title = titles[0] ?? (number != null ? `Stück ${number}` : "Ohne Titel");
  const time0: TimeSig = meter ?? { num: 4, den: 4 };
  let tempo = tempoField ? readTempo(tempoField.value, unit) : null;
  if (keyRead.explicit) hintList.push("Die Tonart hat eigene Vorzeichen (K: mit ^ oder _)");

  // --- Melodie (1. Schritt: Elemente)
  const els: El[] = [];
  let key = keyRead.key;
  let curMeter = time0;
  let octShift = keyRead.octave;
  let accState = new Map<string, number>(); // Vorzeichen bis zum Taktende: "C1" → Halbtöne
  let mline = 0;
  let lastTimed: NoteEl | RestEl | null = null;
  let lastNote: NoteEl | null = null;
  let pendingBroken: Frac | null = null;
  let tup: { p: number; q: number; left: number; first: boolean } | null = null;
  let slurDepth = 0;
  let slurPending = false;
  let slurOpen: NoteEl | null = null;
  let anyTimed = false;
  // Liedtext: Noten und Taktstriche seit dem letzten w:-Block
  let lyricItems: (NoteEl | "bar")[] = [];
  let lyricBlock: { items: (NoteEl | "bar")[]; verse: number } | null = null;
  const extraVerses: string[][] = []; // weitere Strophen aus der 2., 3. … w:-Zeile
  let musicSinceWords = false;

  const fail = (line: number, reason: string): never => {
    throw new AbcError(line, reason);
  };

  const pushTimed = (el: NoteEl | RestEl) => {
    if (pendingBroken) {
      el.len = mul(el.len, pendingBroken);
      el.written = mul(el.written, pendingBroken);
      pendingBroken = null;
    }
    if (tup) {
      el.len = mul(el.len, fr(tup.q, tup.p));
      el.tuplet = { p: tup.p, q: tup.q, start: tup.first, end: tup.left === 1 };
      tup.first = false;
      if (--tup.left === 0) tup = null;
    }
    els.push(el);
    lastTimed = el;
    anyTimed = true;
    musicSinceWords = true;
    if (el.t === "note") {
      lastNote = el;
      lyricItems.push(el);
      if (slurPending) {
        el.slurStart = true;
        slurOpen = el;
        slurPending = false;
      }
    }
  };

  /** Längenangabe hinter Note oder Pause: "", "2", "/2", "/", "//", "3/2", "3/" → Faktor */
  const multOf = (s: string, line: number): Frac => {
    if (!s) return fr(1);
    const m = /^(\d*)(\/*)(\d*)$/.exec(s)!;
    const n = m[1] ? Number(m[1]) : 1;
    let d = 1;
    if (m[2]) d = m[3] ? Number(m[3]) * 2 ** (m[2].length - 1) : 2 ** m[2].length;
    if (n === 0 || d === 0) fail(line, `Notenlänge „${s}“ ist null`);
    return fr(n, d);
  };
  /** Länge in ganzen Noten: Vielfaches der Grundnotenlänge L */
  const lengthOf = (s: string, line: number): Frac => mul(unit!, multOf(s, line));

  /** Tonhöhe einer Note nach Tonart und Vorzeichen im Takt; setzt die Vorzeichen bis zum Taktende. */
  const pitchOf = (acc: string | undefined, l: string, marks: string): { semis: number; abcLetter: string; abcOctave: number; pitch: SongPitch } => {
    const letter = ABC_LETTER[l.toUpperCase()];
    let octave = (l === l.toUpperCase() ? 1 : 2) + octShift;
    for (const c of marks) octave += c === "'" ? 1 : -1;
    const k = letter + octave;
    let semis: number;
    if (acc !== undefined) {
      semis = ACC[acc];
      accState.set(k, semis);
    } else if (lastNote?.tie && lastNote.abcLetter === letter && lastNote.abcOctave === octave) {
      semis = lastNote.semis; // gehaltene Note behält ihr Vorzeichen, auch über den Taktstrich
      accState.set(k, semis);
    } else semis = accState.get(k) ?? key.alter[letter] ?? 0;
    let pitch: SongPitch;
    if (Math.abs(semis) === 2) {
      pitch = spell(48 + 12 * octave + SEMI[letter] + semis, semis > 0);
      hintCount("Doppelkreuze und Doppel-Be als einfacher Ton geschrieben");
    } else pitch = makePitch(letter, semis as Alter, octave);
    return { semis, abcLetter: letter, abcOctave: octave, pitch };
  };

  const decoration = (name: string) => {
    if (name === "breath") {
      if (lastNote) lastNote.breath = true;
    } else if (JUMPS.has(name)) omit(OMIT.jumps);
    else omit(OMIT.deco);
  };

  const field = (name: string, value: string, line: number) => {
    if (name === "K") {
      const k = readKey(value, line);
      key = k.key;
      octShift = k.octave;
      if (!anyTimed) keyRead = k; // vor der ersten Note: gilt als Tonart des Stücks
      else els.push({ t: "key", key, src: line });
    } else if (name === "M") {
      const m = readMeter(value, line);
      if (m) {
        els.push({ t: "meter", time: m, src: line });
        curMeter = m;
      }
      else hintCount("Wechsel zu M:none übergangen");
    } else if (name === "L") unit = readUnit(value, line);
    else if (name === "Q") {
      if (!anyTimed && !tempo) tempo = readTempo(value, unit!);
      else omit(OMIT.tempo);
    } else if (name === "V") {
      const id = value.trim().split(/\s+/)[0];
      if (melodyVoice == null) melodyVoice = id;
      voice = id;
    } else if (name === "U") readUserDeco(value, userDeco);
    // T: (Abschnittstitel), P: (Teilbezeichnung), I:, r:, N: … werden übergangen
  };

  const voiceSkipped = () => voice != null && melodyVoice != null && voice !== melodyVoice;

  /** eine Notenzeile in Elemente zerlegen */
  const music = (s: string, line: number) => {
    let p = 0;
    let skippedVoice = false;
    const at = (re: RegExp) => {
      re.lastIndex = p;
      return re.exec(s);
    };
    while (p < s.length) {
      if (voiceSkipped()) {
        // andere Stimme: nur auf [V:…] achten
        skippedVoice = true;
        const j = s.indexOf("[V:", p);
        if (j < 0) break;
        p = j;
      }
      const c = s[p];
      const n1 = s[p + 1];
      if (c === " " || c === "\t" || c === "`" || c === "$" || c === "\r") {
        p++;
        continue;
      }
      if (c === "\\") {
        if (!s.slice(p + 1).trim()) return true; // Zeile geht weiter
        unknownChars.add(c);
        p++;
        continue;
      }
      if (c === '"') {
        const j = s.indexOf('"', p + 1);
        if (j < 0) fail(line, "Anführungszeichen „\"“ wird nicht geschlossen");
        omit(/^[\^_<>@]/.test(s.slice(p + 1, j)) ? OMIT.text : OMIT.chords);
        p = j + 1;
        continue;
      }
      if (c === "!" || c === "+") {
        const j = s.indexOf(c, p + 1);
        if (j < 0) {
          if (c === "!") {
            p++; // altes Zeilenende-Zeichen
            continue;
          }
          fail(line, "Verzierung „+…+“ wird nicht geschlossen");
        }
        decoration(s.slice(p + 1, j));
        p = j + 1;
        continue;
      }
      if (c === "{") {
        const j = s.indexOf("}", p + 1);
        if (j < 0) fail(line, "Vorschlag „{“ wird nicht geschlossen");
        omit(OMIT.grace);
        p = j + 1;
        continue;
      }
      if (c === "(") {
        const t = at(/\((\d+)(?::(\d*))?(?::(\d*))?/y);
        if (t) {
          const pp = Number(t[1]);
          if (pp < 2 || pp > 9) fail(line, `Triole „${t[0]}“: erlaubt sind (2 bis (9`);
          const comp = curMeter.den === 8 && curMeter.num % 3 === 0 && curMeter.num > 3;
          const dq = ({ 2: 3, 3: 2, 4: 3, 6: 2, 8: 3 } as Record<number, number>)[pp] ?? (comp ? 3 : 2);
          const qq = t[2] ? Number(t[2]) : dq;
          const rr = t[3] ? Number(t[3]) : pp;
          if (!qq || !rr) fail(line, `Triole „${t[0]}“ ist unvollständig`);
          tup = { p: pp, q: qq, left: rr, first: true };
          p += t[0].length;
          continue;
        }
        if (slurDepth === 0) slurPending = true;
        else hintCount("Bindebögen ineinander: nur der äußere");
        slurDepth++;
        p++;
        continue;
      }
      if (c === ")") {
        if (slurDepth === 0) hintCount("Bindebogen-Ende ohne Anfang übergangen");
        else if (--slurDepth === 0) {
          if (slurPending) slurPending = false;
          else if (slurOpen && lastNote && lastNote !== slurOpen) lastNote.slurEnd = true;
          else if (slurOpen) slurOpen.slurStart = false; // Bogen über nur einer Note
          slurOpen = null;
        }
        p++;
        continue;
      }
      if (c === "." && (n1 === "(" || n1 === "-" || n1 === "|")) {
        p++; // gepunkteter Bogen bzw. Strich: wie der normale
        continue;
      }
      if (c === "-") {
        if (lastTimed && lastTimed.t === "note" && els[els.length - 1] === lastTimed) lastTimed.tie = true;
        else hintCount("Haltebogen ohne Note davor übergangen");
        p++;
        continue;
      }
      if (c === ">" || c === "<") {
        const t = at(/>+|<+/y)!;
        const k = 2 ** t[0].length;
        const shortF = fr(1, k);
        const longF = fr(2 * k - 1, k);
        p += t[0].length;
        if (!lastTimed || els[els.length - 1] !== lastTimed) {
          hintCount(`Rhythmuszeichen ${c} ohne Note direkt davor übergangen`);
          continue;
        }
        const prev: NoteEl | RestEl = lastTimed;
        const fPrev = c === ">" ? longF : shortF;
        prev.len = mul(prev.len, fPrev);
        prev.written = mul(prev.written, fPrev);
        pendingBroken = c === ">" ? shortF : longF;
        continue;
      }
      if (c === "&") {
        // zweite Stimme im selben Takt: bis zum nächsten Taktstrich überspringen
        omit(OMIT.overlay);
        const j = s.indexOf("|", p);
        p = j < 0 ? s.length : j;
        continue;
      }
      if (c === "y") {
        p += at(/y\d*/y)![0].length; // Abstandhalter
        continue;
      }
      // Taktstriche (auch mit Klammer: |1  :|2  |[2)
      if (c === "|" || (c === ":" && (n1 === "|" || n1 === ":" || (n1 === "[" && s[p + 2] === "|"))) || (c === "[" && n1 === "|")) {
        const t = at(/[:|\[\]]*/y)!;
        let tok = t[0];
        // "[" am Ende gehört zur Klammer oder zu einem Feld (|[1, |[K:…])
        while (tok.endsWith("[")) tok = tok.slice(0, -1);
        p += tok.length;
        barline(tok, line);
        const v = at(/\[?(\d+(?:[-,]\d+)*)/y);
        if (v && (v[0].startsWith("[") || !tok.endsWith(":"))) {
          volta(v[1], line);
          p += v[0].length;
        }
        continue;
      }
      if (c === "[") {
        const f = at(/\[([A-Za-z]):([^\]]*)\]/y);
        if (f) {
          field(f[1], f[2], line);
          p += f[0].length;
          continue;
        }
        const v = at(/\[(\d+(?:[-,]\d+)*)/y);
        if (v) {
          volta(v[1], line);
          p += v[0].length;
          continue;
        }
        p = chord(s, p, line);
        continue;
      }
      const nm = at(/(\^\^|\^|__|_|=)?([A-Ga-g])([',]*)(\d*\/*\d*)/y);
      if (nm) {
        note(nm, line);
        p += nm[0].length;
        continue;
      }
      const rm = at(/([zx])(\d*\/*\d*)/y);
      if (rm) {
        const len = lengthOf(rm[2], line);
        pushTimed({ t: "rest", len, written: len, src: line, mline });
        p += rm[0].length;
        continue;
      }
      const mm = at(/([ZX])(\d*)/y);
      if (mm) {
        multiRest(mm[2] ? Number(mm[2]) : 1, line);
        p += mm[0].length;
        continue;
      }
      if (/[H-Wh-w~.]/.test(c)) {
        decoration(userDeco[c] ?? SHORTCUTS[c] ?? "?");
        p++;
        continue;
      }
      unknownChars.add(c);
      p++;
    }
    if (skippedVoice) omit(OMIT.voices);
    return false;
  };

  const note = (nm: RegExpExecArray, line: number) => {
    const [, acc, l, marks, ls] = nm;
    const pi = pitchOf(acc, l, marks);
    const len = lengthOf(ls, line);
    pushTimed({
      t: "note",
      ...pi,
      len,
      written: len,
      tie: false,
      slurStart: false,
      slurEnd: false,
      breath: false,
      syllable: null,
      extendTo: null,
      ids: [],
      src: line,
      mline,
    });
  };

  /** Akkord [CEG]2: es zählt nur der oberste Ton, die Länge kommt von der ersten Note. */
  const chord = (s: string, p0: number, line: number): number => {
    const end = s.indexOf("]", p0);
    if (end < 0) fail(line, "Akkord „[“ wird nicht geschlossen");
    const inner = s.slice(p0 + 1, end);
    const re = /(\^\^|\^|__|_|=)?([A-Ga-g])([',]*)(\d*\/*\d*)(-?)/g;
    let best: ReturnType<typeof pitchOf> | null = null;
    let bestTie = false;
    let first: Frac | null = null;
    let count = 0;
    for (const m of inner.replace(/"[^"]*"|![^!]*!/g, " ").matchAll(re)) {
      const pi = pitchOf(m[1], m[2], m[3]);
      if (!first) first = lengthOf(m[4], line);
      count++;
      if (!best || pi.pitch.midi > best.pitch.midi) {
        best = pi;
        bestTie = !!m[5];
      }
    }
    if (!best) fail(line, `Akkord „[${inner}]“ enthält keine Note`);
    if (count > 1) omit(OMIT.chordNotes);
    const after = /(\d*\/*\d*)/y;
    after.lastIndex = end + 1;
    const lm = after.exec(s)!;
    const len = mul(first!, multOf(lm[1], line));
    pushTimed({
      t: "note",
      ...best!,
      len,
      written: len,
      tie: bestTie,
      slurStart: false,
      slurEnd: false,
      breath: false,
      syllable: null,
      extendTo: null,
      ids: [],
      src: line,
      mline,
    });
    return end + 1 + lm[1].length;
  };

  /** Z4: vier ganze Takte Pause */
  const multiRest = (n: number, line: number) => {
    const len = fr(curMeter.num, curMeter.den);
    for (let k = 0; k < n; k++) {
      if (k > 0) els.push({ t: "bar", end: false, start: false, style: "single", src: line });
      pushTimed({ t: "rest", len, written: len, src: line, mline });
    }
  };

  const barline = (tok: string, line: number) => {
    const core = tok.replace(/^:+|:+$/g, "");
    let style: BarEl["style"] = "single";
    if (core === "[|]") style = "single"; // unsichtbarer Strich
    else if (core === "||") style = "double";
    else if (core.includes("]")) style = "final";
    else if (core.includes("[")) style = "thick";
    else if (core.length > 1) style = "double";
    const start = tok.endsWith(":");
    const end = tok.startsWith(":");
    els.push({ t: "bar", end, start, style, src: line });
    accState = new Map();
    lastTimed = null;
    lyricItems.push("bar");
  };

  const volta = (spec: string, line: number) => {
    const nums: number[] = [];
    for (const part of spec.split(",")) {
      const [a, b] = part.split("-").map(Number);
      for (let k = a; k <= (b ?? a); k++) nums.push(k);
    }
    if (nums.some((x) => x < 1 || x > 9)) fail(line, `Klammer „${spec}“: erlaubt sind die Nummern 1 bis 9`);
    els.push({ t: "volta", nums, src: line });
  };

  /** w:-Zeile: Silben den Noten seit dem letzten w:-Block zuordnen */
  const words = (value: string, line: number) => {
    if (musicSinceWords || !lyricBlock) {
      lyricBlock = { items: lyricItems, verse: 0 };
      lyricItems = [];
      musicSinceWords = false;
    } else lyricBlock.verse++;
    assignWords(lyricBlock.items, lyricBlock.verse, abcText(value), line);
  };

  const assignWords = (items: (NoteEl | "bar")[], verse: number, text: string, line: number) => {
    const toks = lyricTokens(text);
    let k = 0;
    let lastSyl: NoteEl | null = null;
    const verseWords: string[] = [];
    let overflow = 0;
    const nextNote = (): NoteEl | null => {
      while (k < items.length && items[k] === "bar") k++;
      return k < items.length ? (items[k++] as NoteEl) : null;
    };
    for (const t of toks) {
      if (t.kind === "bar") {
        while (k < items.length && items[k] !== "bar") k++;
        if (k < items.length) k++;
        continue;
      }
      const n = nextNote();
      if (!n) {
        if (t.kind === "syl") overflow++;
        if (t.kind === "syl" && verse > 0) verseWords.push(t.text + (t.hyphen ? "" : " "));
        continue;
      }
      if (t.kind === "syl") {
        if (verse === 0) {
          n.syllable = { text: t.text, hyphen: t.hyphen };
          lastSyl = n;
        } else verseWords.push(t.text + (t.hyphen ? "" : " "));
      } else if (t.kind === "hold" && verse === 0 && lastSyl && !lastSyl.syllable!.hyphen) {
        lastSyl.extendTo = n;
      }
    }
    if (overflow) hintList.push(`Liedtext (Zeile ${line}): ${overflow} Silbe${overflow > 1 ? "n" : ""} mehr als Noten`);
    if (verse > 0) {
      while (extraVerses.length < verse) extraVerses.push([]);
      const txt = verseWords.join("").replace(/\s+/g, " ").trim();
      if (txt) extraVerses[verse - 1].push(txt);
    }
  };

  // Notenzeilen und Felder im Stück
  let continued = false;
  for (; i < chunk.lines.length; i++) {
    const { text, no } = chunk.lines[i];
    if (/^%%/.test(text)) continue;
    const raw = stripComment(text);
    if (!raw.trim()) continue;
    const f = fieldRe.exec(raw);
    if (f) {
      const [, name, value] = f;
      if (voiceSkipped() && (name === "w" || name === "W")) continue;
      if (name === "w") words(value, no);
      else if (name === "W") stanzaLines.push(abcText(value.trim()));
      else if (name === "X") break;
      else field(name, value, no);
      continue;
    }
    continued = music(raw, no);
    if (!continued && !voiceSkipped()) {
      els.push({ t: "eol" });
      mline++;
    }
  }
  const unclosed = slurOpen as NoteEl | null;
  if (slurDepth > 0 && unclosed) {
    unclosed.slurStart = false;
    hintCount("Bindebogen ohne Ende übergangen");
  }
  if (tup as unknown) hintCount("Triole mit zu wenigen Noten");

  // --- 2. Schritt: Takte bauen
  const built = buildBars(els, time0, keyRead.key, fail, hintCount, hintList);
  const { bars, notes } = built;
  if (!notes.length) fail(firstLine, "Das Stück enthält keine Noten");

  // Silben an die erste Note (bei aufgeteilten Längen); Melisma-Linie bis zur letzten Note unter dem _
  const byId = new Map(notes.map((n) => [n.id, n]));
  for (const n of els) {
    if (n.t !== "note" || !n.syllable) continue;
    const first = byId.get(n.ids[0])!;
    first.syllable = { text: n.syllable.text, hyphen: n.syllable.hyphen, extendTo: n.extendTo ? n.extendTo.ids[n.extendTo.ids.length - 1] : null };
  }

  if (chunk.trailing != null) hintList.push(`Zeilen nach der Leerzeile (ab Zeile ${chunk.trailing}) gehören zu keinem Stück und wurden nicht gelesen`);
  for (const [k, n] of counted) hintList.push(`${k} (${n})`);
  if (unknownChars.size) omitted.set(`${OMIT.unknown}: ${[...unknownChars].map((c) => `„${c}“`).join(", ")}`, 0);

  let low = notes[0].pitch;
  let high = notes[0].pitch;
  for (const n of notes) {
    if (n.pitch.midi < low.midi) low = n.pitch;
    if (n.pitch.midi > high.midi) high = n.pitch;
  }
  const song: Song = {
    id: "abc-" + (slugify(title) || "stueck"),
    title,
    subtitle: titles[1] ?? null,
    chapter: ABC_CHAPTER,
    key: keyRead.key,
    keyName: keyRead.keyName,
    time: bars[0].time,
    credit: credit.join(", "),
    hasLyrics: notes.some((n) => n.syllable),
    stanzas: [...extraVerses.filter((v) => v.length), ...stanzasOf(stanzaLines)],
    stanzaCols: null,
    bars,
    notes,
    range: { low, high },
  };
  if (tempo) song.tempo = tempo;
  const order = Object.values(OMIT) as string[];
  const omittedList = [...omitted]
    .sort(([a], [b]) => idx(order, a) - idx(order, b))
    .map(([k, n]) => (n ? `${k} (${n})` : k));
  return { number, title, line: firstLine, song, omitted: omittedList, hints: hintList, range: checkRange(song) };
}

const idx = (order: string[], k: string) => {
  const j = order.findIndex((o) => k.startsWith(o));
  return j < 0 ? order.length : j;
};

/** U:T=!trill! – eigene Kürzel für Verzierungen (nur die Bedeutung zählt, z. B. !breath!) */
function readUserDeco(value: string, map: Record<string, string>): void {
  const m = /^\s*(\S)\s*=\s*[!+]?([^!+]*)[!+]?\s*$/.exec(value);
  if (m) map[m[1]] = m[2].trim();
}

/** W:-Zeilen zu Strophen: Leerzeile oder Nummer „2.“ beginnt eine neue Strophe. */
function stanzasOf(lines: string[]): string[][] {
  const out: string[][] = [];
  let cur: string[] = [];
  for (const raw of lines) {
    const l = raw.trim();
    const numbered = /^\d+\.\s*/.exec(l);
    if (!l || (numbered && cur.length)) {
      if (cur.length) out.push(cur);
      cur = [];
    }
    const t = numbered ? l.slice(numbered[0].length) : l;
    if (t) cur.push(t);
  }
  if (cur.length) out.push(cur);
  return out;
}

type LyricTok = { kind: "syl"; text: string; hyphen: boolean } | { kind: "hold" } | { kind: "skip" } | { kind: "bar" };

/**
 * Liedtext einer w:-Zeile in Silben: Leerzeichen trennt Wörter, "-" Silben, "_" hält die vorige Silbe
 * eine Note länger, "*" überspringt eine Note, "|" springt zum nächsten Takt, "~" verbindet Wörter
 * unter einer Note, "\-" ist ein Bindestrich im Text. Ein "-" nach Leerzeichen oder "-" überspringt eine Note.
 */
export function lyricTokens(text: string): LyricTok[] {
  const out: LyricTok[] = [];
  let buf = "";
  const flush = (hyphen: boolean) => {
    if (!buf) return false;
    out.push({ kind: "syl", text: buf, hyphen });
    buf = "";
    return true;
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "\\" && i + 1 < text.length) {
      buf += text[++i];
    } else if (c === "~") buf += " ";
    else if (c === " " || c === "\t") flush(false);
    else if (c === "-") {
      if (!flush(true)) {
        const last = out[out.length - 1];
        if (last && last.kind === "syl") last.hyphen = true;
        out.push({ kind: "skip" });
      }
    } else if (c === "_") {
      flush(false);
      out.push({ kind: "hold" });
    } else if (c === "*") {
      flush(false);
      out.push({ kind: "skip" });
    } else if (c === "|") {
      flush(false);
      out.push({ kind: "bar" });
    } else buf += c;
  }
  flush(false);
  return out;
}

// ---------------------------------------------------------------- 2. Schritt: Takte

interface Draft {
  events: BarEvent[];
  pos: Frac;
  time: TimeSig;
  timeChange: boolean;
  keyChange: KeyInfo | null;
  key: KeyInfo;
  repeatStart: boolean;
  voltaNumbers: number[] | null;
  voltaStart: boolean;
  line: number;
  src: number;
  breakInside: number | null;
}

function buildBars(
  els: El[],
  time0: TimeSig,
  key0: KeyInfo,
  fail: (line: number, reason: string) => never,
  hintCount: (k: string) => void,
  hints: string[],
): { bars: Bar[]; notes: NoteEvent[] } {
  const bars: Bar[] = [];
  const notes: NoteEvent[] = [];
  const barKeys: KeyInfo[] = [];
  const barEnd: (BarEl | null)[] = [];
  const barSrc: number[] = [];
  let time = time0;
  let key = key0;
  let timeChanged = false;
  let keyChanged: KeyInfo | null = null;
  let pendingRepeat = false;
  let pendingVolta: { nums: number[]; src: number } | null = null;
  let ending: number[] | null = null;
  let mline = 0;
  let nextId = 1;
  let prevNote: NoteEvent | null = null;

  const fresh = (): Draft => ({
    events: [],
    pos: ZERO,
    time,
    timeChange: false,
    keyChange: null,
    key,
    repeatStart: false,
    voltaNumbers: null,
    voltaStart: false,
    line: mline,
    src: 0,
    breakInside: null,
  });
  let cur = fresh();

  const startBar = (src: number) => {
    if (cur.events.length) return;
    cur.time = time;
    cur.key = key;
    cur.timeChange = timeChanged && bars.length > 0;
    cur.keyChange = bars.length > 0 ? keyChanged : null;
    timeChanged = false;
    keyChanged = null;
    cur.repeatStart = pendingRepeat;
    pendingRepeat = false;
    cur.line = mline;
    cur.src = src;
    if (pendingVolta) {
      cur.voltaNumbers = pendingVolta.nums;
      cur.voltaStart = true;
      ending = pendingVolta.nums;
      pendingVolta = null;
    } else if (ending) cur.voltaNumbers = ending;
  };

  const closeBar = (b: BarEl | null) => {
    const d = cur;
    let barline: Barline = "none";
    if (b) barline = b.end ? "repeatEnd" : b.style === "final" ? "final" : "single";
    const bar: Bar = {
      index: bars.length,
      events: d.events,
      time: d.time,
      timeChange: d.timeChange,
      nominal: barQuarters(d.time),
      length: quarters(d.pos),
      pickup: false,
      repeatStart: d.repeatStart,
      barline,
      volta: null,
      voltaStart: d.voltaStart,
      line: d.line,
      breakAfter: false,
      breakInside: d.breakInside,
    };
    if (d.voltaNumbers) bar.voltaNumbers = d.voltaNumbers;
    if (b && !b.end && (b.style === "double" || b.style === "thick")) bar.double = true;
    if (d.keyChange) bar.keyChange = d.keyChange;
    for (const e of bar.events) e.bar = bar.index;
    bars.push(bar);
    barKeys.push(d.key);
    barEnd.push(b);
    barSrc.push(d.src);
    // eine Klammer endet an jedem Strich außer dem einfachen
    if (ending && b && (b.end || b.start || b.style !== "single")) ending = null;
    cur = fresh();
  };

  const emit = (el: NoteEl | RestEl) => {
    startBar(el.src);
    let pieces: { dur: Duration; dots: 0 | 1; f: Frac }[] | null;
    if (el.tuplet) {
      const one = PIECES.find((x) => cmp(x.f, el.written) === 0);
      if (!one) fail(el.src, "Notenlänge in einer Triole lässt sich nicht als einzelne Note schreiben");
      pieces = [one];
    } else {
      pieces = decompose(el.len);
      if (!pieces) fail(el.src, "Notenlänge kürzer als ein Sechzehntel wird nicht unterstützt");
      if (pieces.length > 1) hintCount("Längen, die es als einzelne Note nicht gibt, aufgeteilt (gebundene Noten bzw. mehrere Pausen)");
    }
    pieces.forEach((pc, k) => {
      const f = el.tuplet ? el.len : pc.f;
      const base = { id: nextId++, bar: bars.length, dur: pc.dur, dots: pc.dots, q: quarters(f), offset: quarters(cur.pos) };
      cur.pos = add(cur.pos, f);
      const last = k === pieces!.length - 1;
      if (el.t === "rest") {
        const r: BarEvent = { kind: "rest", ...base };
        if (el.tuplet) r.tuplet = el.tuplet;
        cur.events.push(r);
        if (prevNote?.tie) {
          prevNote.tie = false;
          hintCount("Haltebogen vor einer Pause weggelassen");
        }
        prevNote = null;
        return;
      }
      const tiedFromPrev = k > 0 || !!prevNote?.tie;
      const n: NoteEvent = {
        kind: "note",
        ...base,
        pitch: el.pitch,
        accidental: null,
        tie: last ? el.tie : true,
        tiedFromPrev,
        slurStart: k === 0 && el.slurStart,
        slurEnd: last && el.slurEnd,
        breath: last && el.breath,
        syllable: null,
        ...(el.tuplet ? { tuplet: el.tuplet } : {}),
      };
      if (k === 0 && prevNote?.tie && prevNote.pitch.midi !== el.pitch.midi) {
        // Haltebogen zu einem anderen Ton: in ABC eigentlich ein Fehler – Bogen weglassen
        prevNote.tie = false;
        n.tiedFromPrev = false;
        hintCount("Haltebogen zwischen verschiedenen Tönen weggelassen");
      }
      cur.events.push(n);
      notes.push(n);
      el.ids.push(n.id);
      prevNote = n;
    });
  };

  for (const el of els) {
    switch (el.t) {
      case "note":
      case "rest":
        emit(el);
        break;
      case "bar":
        if (cur.events.length) closeBar(el);
        else {
          // Strich ohne Noten davor: Wiederholungszeichen auf den vorigen Takt bzw. den nächsten übertragen
          const prev = bars[bars.length - 1];
          if (el.end && prev && prev.barline !== "repeatEnd") {
            prev.barline = "repeatEnd";
            barEnd[bars.length - 1] = el;
            if (ending) ending = null;
          } else if (prev && el.style === "final" && prev.barline === "single") prev.barline = "final";
          else if (prev && el.style !== "single" && !el.end && prev.barline === "single") prev.double = true;
          if (ending && (el.start || el.style !== "single")) ending = null;
        }
        if (el.start) pendingRepeat = true;
        break;
      case "volta":
        if (cur.events.length) fail(el.src, "Klammer mitten im Takt (sie muss direkt nach einem Taktstrich stehen)");
        if (pendingVolta) fail(el.src, "zwei Klammern hintereinander");
        pendingVolta = { nums: el.nums, src: el.src };
        break;
      case "meter":
        time = el.time;
        timeChanged = true;
        if (cur.events.length) hintCount("Taktwechsel mitten im Takt erst ab dem nächsten Takt");
        break;
      case "key":
        key = el.key;
        keyChanged = el.key;
        break;
      case "eol":
        if (cur.events.length) cur.breakInside = cur.events.length - 1;
        else if (bars.length) bars[bars.length - 1].breakAfter = true;
        mline++;
        break;
    }
  }
  if (cur.events.length) closeBar(null);
  const open = pendingVolta as { src: number } | null;
  if (open) fail(open.src, "Klammer ohne Noten danach");
  const lastEv = cur.events.length ? null : bars[bars.length - 1]?.events.at(-1);
  if (lastEv?.kind === "note") lastEv.tie = false; // Haltebogen ins Leere
  if (!bars.length) return { bars, notes };
  // ein Schlussstrich am Ende: || gilt dort als Schluss
  const lastBar = bars[bars.length - 1];
  if (lastBar.double && lastBar.barline === "single") {
    lastBar.barline = "final";
    delete lastBar.double;
  }

  checkEndings(bars, barSrc, fail);
  checkBarLengths(bars, barEnd, barSrc, hints);
  markPickups(bars, barEnd);
  assignAccidentals(bars, barKeys);
  return { bars, notes };
}

/** Klammern: volta setzen (1 = endet mit :|, 2 = letzte Klammer) und prüfen, dass vor der letzten jede mit :| endet. */
function checkEndings(bars: Bar[], src: number[], fail: (line: number, reason: string) => never): void {
  let i = 0;
  while (i < bars.length) {
    if (!bars[i].voltaNumbers) {
      i++;
      continue;
    }
    // eine Gruppe aufeinanderfolgender Klammern
    const group: [number, number][] = [];
    while (i < bars.length && bars[i].voltaNumbers) {
      const a = i;
      i++;
      while (i < bars.length && bars[i].voltaNumbers && !bars[i].voltaStart) i++;
      group.push([a, i - 1]);
    }
    group.forEach(([a, b], g) => {
      const endsRepeat = bars[b].barline === "repeatEnd";
      if (!endsRepeat && g < group.length - 1) {
        fail(src[a], `Die Klammer „${bars[a].voltaNumbers!.join(", ")}.“ endet nicht mit einem Wiederholungszeichen :|`);
      }
      for (let k = a; k <= b; k++) bars[k].volta = endsRepeat ? 1 : 2;
    });
  }
}

const EPS = 1e-6;

/**
 * Taktlängen prüfen (nur Hinweise, ABC-Dateien sind oft nachlässig): Jeder Takt soll voll sein,
 * außer am Anfang und Ende des Stücks und an Abschnittsgrenzen (Auftakt nach |: oder ||, geteilter
 * Takt vor :| oder ||, Klammern).
 */
function checkBarLengths(bars: Bar[], ends: (BarEl | null)[], src: number[], hints: string[]): void {
  const sectionEnd = (i: number) => {
    const e = ends[i];
    return !!e && (e.end || e.start || e.style !== "single");
  };
  let segPickup = 0;
  bars.forEach((b, i) => {
    const segStart = i === 0 || b.repeatStart || sectionEnd(i - 1) || b.voltaStart;
    if (segStart && !b.voltaStart) segPickup = b.length < b.nominal - EPS ? b.length : 0;
    if (Math.abs(b.length - b.nominal) < EPS) return;
    if (b.length < b.nominal) {
      if (i === 0 || i === bars.length - 1) return;
      if (segStart && !b.voltaStart) return; // Auftakt eines Abschnitts
      if (sectionEnd(i) || b.voltaStart || (i + 1 < bars.length && bars[i + 1].voltaStart)) {
        const next = bars[i + 1];
        if (Math.abs(b.length + segPickup - b.nominal) < EPS) return;
        if (next && Math.abs(b.length + next.length - b.nominal) < EPS) return;
      }
    }
    const what = b.length < b.nominal ? "zu kurz" : "zu lang";
    hints.push(`Takt ${i + 1} (Zeile ${src[i]}) ist ${what}: ${fmt(b.length)} statt ${fmt(b.nominal)} Viertel`);
  });
}

/** Auftakte: kurzer Takt am Anfang oder am Beginn eines Abschnitts (nicht bei Klammern). */
function markPickups(bars: Bar[], ends: (BarEl | null)[]): void {
  bars.forEach((b, i) => {
    if (b.length >= b.nominal - EPS || (i === bars.length - 1 && i > 0) || b.voltaNumbers) return;
    const e = ends[i - 1];
    b.pickup = i === 0 || b.repeatStart || (!!e && (e.end || e.style !== "single"));
  });
}

/** Vorzeichen im Notenbild wie im Heft: Tonart gilt, Abweichungen bis zum Taktende (je Takt dessen Tonart). */
function assignAccidentals(bars: Bar[], keys: KeyInfo[]): void {
  const sign: Record<number, Accidental> = { 1: "sharp", [-1]: "flat", 0: "natural" };
  bars.forEach((bar, i) => {
    const key = keys[i];
    const state = new Map<string, number>();
    for (const e of bar.events) {
      if (e.kind !== "note") continue;
      const p = e.pitch;
      const k = p.letter + p.octave;
      const have = state.get(k) ?? key.alter[p.letter] ?? 0;
      state.set(k, p.alter);
      e.accidental = p.alter !== have ? sign[p.alter] : null;
    }
  });
}

// ---------------------------------------------------------------- Einstieg

/** Liest eine ABC-Datei (oder eingefügten ABC-Text) mit einem oder mehreren Stücken. */
export function parseAbc(text: string): AbcResult {
  // Freier Text zwischen %%begintext und %%endtext ist keine Musik: wie Kommentarzeilen behandeln
  // (nicht als Leerzeile, die ein Stück beenden würde; die Zeilennummern bleiben gleich)
  let inText = false;
  const lines = text
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => {
      if (/^%%begintext\b/.test(l)) inText = true;
      else if (/^%%endtext\b/.test(l)) inText = false;
      else if (inText) return "%";
      return l;
    });
  const tunes: AbcTune[] = [];
  const errors: AbcProblem[] = [];
  for (const chunk of splitTunes(lines)) {
    if (!chunk.lines.some((l) => stripComment(l.text).trim() && !/^%%/.test(l.text))) continue;
    try {
      tunes.push(readTune(chunk));
    } catch (e) {
      if (!(e instanceof AbcError)) throw e;
      const x = chunk.lines.find((l) => /^X:/.test(l.text));
      const t = chunk.lines.find((l) => /^T:/.test(l.text));
      const num = x && /^X:\s*(\d+)/.exec(x.text);
      errors.push({
        number: num ? Number(num[1]) : null,
        title: t ? abcText(stripComment(t.text).slice(2).trim()) : "",
        line: e.line,
        message: e.message,
      });
    }
  }
  if (!tunes.length && !errors.length) {
    errors.push({ number: null, title: "", line: 0, message: "Keine ABC-Noten gefunden. Ein Stück beginnt mit X:, T: und K: und hat danach Notenzeilen." });
  }
  return { tunes, errors };
}
