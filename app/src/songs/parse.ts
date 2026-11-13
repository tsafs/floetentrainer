// Leser für die Melodie-Notation des Hefts (heft/songs.py), nach dem Vorbild von parse_music und
// check_and_assign in heft/engrave.py: Töne, Dauern, Punkte, Pausen, Taktstriche, Schlussstrich,
// Wiederholungen |: :| mit Klammern [1 [2, Haltebögen ~, Bindebögen ( ), Atemzeichen ",",
// Zeilenumbrüche "/" und Taktwechsel T…. Prüft Taktlängen und Silbenzahl wie das Heft.
// Wird auch beim Bauen benutzt (scripts/heft-songs-plugin.ts), deshalb ohne Browser-Abhängigkeiten.

import type {
  Accidental,
  Alter,
  Bar,
  BarEvent,
  Barline,
  Duration,
  KeyInfo,
  Letter,
  NoteEvent,
  RawSong,
  Song,
  SongPitch,
  TimeSig,
} from "./model";

/** Fehler beim Lesen eines Lieds: Liedtitel, Stelle und Grund. */
export class SongError extends Error {
  constructor(
    readonly title: string,
    readonly where: string,
    readonly reason: string,
  ) {
    super(`Lied „${title}“${where ? ", " + where : ""}: ${reason}`);
    this.name = "SongError";
  }
}

const LETTERS: Letter[] = ["c", "d", "e", "f", "g", "a", "h"];
const SEMI: Record<Letter, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, h: 11 };
const DURATIONS: Duration[] = [1, 2, 4, 8, 16];
const EPS = 1e-6;

/** Ton wie parse_pitch im Heft: "fis'", "b'", "es''", "c'''" (Apostrophe = Oktave). */
export function parsePitch(tok: string): SongPitch | null {
  const m = /^([a-h])(is|es|s)?('*)$/.exec(tok);
  if (!m) return null;
  let letter = m[1] as Letter | "b";
  let alter: Alter = 0;
  if (letter === "b") {
    letter = "h";
    alter = -1;
  }
  if (m[2] === "is") alter = 1;
  else if (m[2] === "es" || m[2] === "s") alter = -1;
  const octave = m[3].length;
  let name: string;
  if (alter === 0) name = letter;
  else if (alter === 1) name = letter + "is";
  else name = ({ e: "es", a: "as", h: "b" } as Record<string, string>)[letter] ?? letter + "es";
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

// ---------------------------------------------------------------- Tonarten

const MAJOR: Record<string, number> = {
  C: 0, G: 1, D: 2, A: 3, E: 4, H: 5, Fis: 6, Cis: 7,
  F: -1, B: -2, Es: -3, As: -4, Des: -5, Ges: -6, Ces: -7,
};
const MINOR: Record<string, number> = {
  a: 0, e: 1, h: 2, fis: 3, cis: 4, gis: 5, dis: 6, ais: 7,
  d: -1, g: -2, c: -3, f: -4, b: -5, es: -6, as: -7,
};
// Reihenfolge der Vorzeichen und ihre Lage im Violinschlüssel (wie KEYSIG im Heft)
const SHARPS: [Letter, number][] = [["f", 8], ["c", 5], ["g", 9], ["d", 6], ["a", 3], ["e", 7], ["h", 4]];
const FLATS: [Letter, number][] = [["h", 4], ["e", 7], ["a", 3], ["d", 6], ["g", 2], ["c", 5], ["f", 1]];

/** Tonart aus der Heft-Schreibweise ("G", "e", "F" …); null, wenn unbekannt. */
export function keyInfo(name: string): KeyInfo | null {
  const minor = name in MINOR;
  const fifths = minor ? MINOR[name] : MAJOR[name];
  if (fifths === undefined) return null;
  const list = (fifths >= 0 ? SHARPS : FLATS).slice(0, Math.abs(fifths));
  const alter: Partial<Record<Letter, Alter>> = {};
  for (const [l] of list) alter[l] = fifths > 0 ? 1 : -1;
  return {
    name,
    minor,
    fifths,
    alter,
    signature: list.map(([, pos]) => ({ accidental: fifths > 0 ? "sharp" : "flat", pos })),
  };
}

// ---------------------------------------------------------------- Hilfen

/** Stabile Kennung aus dem Titel: Kleinbuchstaben, Umlaute ausgeschrieben, Rest durch "-". */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’'‘`´]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** "Al-le mei-ne" → [["Al", true], ["le", false], …] (true = Trennstrich folgt), wie split_lyrics. */
export function splitLyrics(txt: string): [string, boolean][] {
  const out: [string, boolean][] = [];
  for (const w of txt.split(/\s+/).filter(Boolean)) {
    const parts = w.split("-");
    parts.forEach((s, i) => out.push([s, i < parts.length - 1]));
  }
  return out;
}

/** Schläge je Takt in Vierteln, wie sie gezählt werden: 3/4 → [0,1,2], 6/8 → [0,1.5], 2/2 → [0,2]. */
export function beatsOf(t: TimeSig): number[] {
  const compound = t.den === 8 && t.num % 3 === 0 && t.num > 3;
  const step = compound ? 1.5 : 4 / t.den;
  const n = compound ? t.num / 3 : t.num;
  return Array.from({ length: n }, (_, i) => i * step);
}

/** Taktlänge in Vierteln */
export function barQuarters(t: TimeSig): number {
  return (t.num * 4) / t.den;
}

const fmt = (x: number) => String(Math.round(x * 1000) / 1000).replace(".", ",");

// ---------------------------------------------------------------- Leser

const TOK = /^(\()?([a-h](?:is|es|s)?'*|r)(\d+)(\.?)(~)?(\))?$/;

interface Draft {
  events: BarEvent[];
  time: TimeSig;
  timeChange: boolean;
  repeatStart: boolean;
  volta: 1 | 2 | null;
  voltaStart: boolean;
  line: number;
  breakInside: number | null;
}

/** Liest ein Lied. Wirft SongError mit Titel, Stelle und Grund, wenn es sich nicht lesen lässt. */
export function parseSong(raw: RawSong): Song {
  const title = String(raw.title ?? "?");
  function fail(where: string, reason: string): never {
    throw new SongError(title, where, reason);
  }
  if (typeof raw.music !== "string" || !raw.music.trim()) fail("", "keine Melodie (music)");
  const key = keyInfo(String(raw.key));
  if (!key) fail("", `unbekannte Tonart key="${raw.key}"`);
  const t0 = raw.time;
  if (!Array.isArray(t0) || t0.length !== 2 || !validTime(t0[0], t0[1])) fail("", `ungültige Taktart time=${JSON.stringify(t0)}`);

  const bars: Bar[] = [];
  const notes: NoteEvent[] = [];
  let time: TimeSig = { num: t0[0], den: t0[1] };
  let nextId = 1;
  let line = 0;
  let pendingRepeat = false;
  let pendingVolta: 1 | 2 | null = null;
  let inVolta1 = false;
  let lastVolta1End = -2; // Index des Takts, mit dem zuletzt eine 1. Klammer endete
  let openSlur: NoteEvent | null = null;
  let prevTok = "";

  const newDraft = (): Draft => ({
    events: [],
    time,
    timeChange: false,
    repeatStart: false,
    volta: null,
    voltaStart: false,
    line,
    breakInside: null,
  });
  let cur = newDraft();
  const tokens = raw.music.split(/\s+/).filter(Boolean);
  const where = (i: number) => `Takt ${bars.length + 1}, Zeichen ${i + 1} „${tokens[i]}“`;

  const startEvent = (i: number) => {
    // Beim ersten Ereignis eines Takts gelten die vorher gesammelten Angaben (|:, [1, [2, Taktart).
    if (cur.events.length) return;
    cur.repeatStart = pendingRepeat;
    cur.line = line;
    cur.time = time;
    if (pendingVolta) {
      if (pendingVolta === 2 && lastVolta1End !== bars.length - 1) fail(where(i), "2. Klammer muss direkt nach der 1. Klammer kommen");
      cur.volta = pendingVolta;
      cur.voltaStart = true;
      if (pendingVolta === 1) inVolta1 = true;
    } else if (inVolta1) cur.volta = 1;
    pendingRepeat = false;
    pendingVolta = null;
  };

  const closeBar = (barline: Barline) => {
    const d = cur;
    let length = 0;
    for (const e of d.events) {
      e.offset = length;
      length += e.q;
    }
    const bar: Bar = {
      index: bars.length,
      events: d.events,
      time: d.time,
      timeChange: d.timeChange && bars.length > 0,
      nominal: barQuarters(d.time),
      length,
      pickup: false,
      repeatStart: d.repeatStart,
      barline,
      volta: d.volta,
      voltaStart: d.voltaStart,
      line: d.line,
      breakAfter: false,
      breakInside: d.breakInside,
    };
    for (const e of bar.events) e.bar = bar.index;
    bars.push(bar);
    if (bar.volta === 1 && barline === "repeatEnd") {
      inVolta1 = false;
      lastVolta1End = bar.index;
    }
    // die 2. Klammer umfasst wie im Heft genau einen Takt
    cur = newDraft();
  };

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    const isBar = tok === "|" || tok === "||" || tok === ":|" || tok === "|:";
    if (isBar) {
      if (cur.events.length === 0) {
        if (tok === "|:") pendingRepeat = true;
        else if (prevTok === ":|" && tok === "||") {
          // :| ||  – nur ein Strich
        } else if (bars.length || tok !== "|") fail(where(i), "leerer Takt (zwei Taktstriche ohne Noten dazwischen)");
      } else {
        const bl: Barline = tok === "||" ? "final" : tok === ":|" ? "repeatEnd" : "single";
        if (tok === ":|" && cur.volta === 2) fail(where(i), ":| in der 2. Klammer");
        closeBar(bl);
        if (tok === "|:") pendingRepeat = true;
      }
    } else if (tok === "[1" || tok === "[2") {
      if (!(prevTok === "|" || prevTok === "||" || prevTok === ":|" || prevTok === "|:")) {
        fail(where(i), "Klammer muss direkt nach einem Taktstrich stehen");
      }
      if (pendingVolta) fail(where(i), "zwei Klammern hintereinander");
      if (tok === "[1" && inVolta1) fail(where(i), "neue 1. Klammer, bevor die vorige mit :| endet");
      pendingVolta = tok === "[1" ? 1 : 2;
    } else if (tok === "/") {
      if (cur.events.length) cur.breakInside = cur.events.length - 1;
      else if (bars.length) bars[bars.length - 1].breakAfter = true;
      line++;
    } else if (tok === ",") {
      if (!notes.length) fail(where(i), "Atemzeichen ohne Note davor");
      notes[notes.length - 1].breath = true;
    } else if (tok.startsWith("T")) {
      const m = /^T(\d+)\/(\d+)$/.exec(tok);
      if (!m || !validTime(Number(m[1]), Number(m[2]))) fail(where(i), "ungültiger Taktwechsel (Beispiel: T3/4)");
      if (cur.events.length) fail(where(i), "Taktwechsel mitten im Takt");
      time = { num: Number(m![1]), den: Number(m![2]) };
      cur.time = time;
      cur.timeChange = true;
    } else {
      const m = TOK.exec(tok);
      if (!m) fail(where(i), "unbekanntes Zeichen");
      const [, sl0, p, ds, dot, tie, sl1] = m!;
      const dur = Number(ds) as Duration;
      if (!DURATIONS.includes(dur)) fail(where(i), `Notenwert ${ds} gibt es nicht (1, 2, 4, 8 oder 16)`);
      const q = (4 / dur) * (dot ? 1.5 : 1);
      startEvent(i);
      const base = { id: nextId++, bar: bars.length, dur, dots: (dot ? 1 : 0) as 0 | 1, q, offset: 0 };
      if (p === "r") {
        if (sl0 || sl1 || tie) fail(where(i), "Pause mit Bogen");
        if (notes.length && notes[notes.length - 1].tie) fail(where(i), "Haltebogen über eine Pause");
        cur.events.push({ kind: "rest", ...base });
      } else {
        const pitch = parsePitch(p)!;
        const prev = notes[notes.length - 1];
        const tiedFromPrev = !!prev?.tie;
        if (prev?.tie && prev.pitch.midi !== pitch.midi) fail(where(i), "Haltebogen zu einem anderen Ton (dafür ist der Bindebogen ( ) da)");
        const n: NoteEvent = {
          kind: "note",
          ...base,
          pitch,
          accidental: null,
          tie: !!tie,
          tiedFromPrev,
          slurStart: !!sl0,
          slurEnd: !!sl1,
          breath: false,
          syllable: null,
        };
        if (sl0) {
          if (openSlur) fail(where(i), "Bindebogen beginnt, bevor der vorige endet");
          openSlur = n;
        }
        if (sl1) {
          if (!openSlur) fail(where(i), "Bindebogen endet, ohne begonnen zu haben");
          openSlur = null;
        }
        cur.events.push(n);
        notes.push(n);
      }
    }
    prevTok = tok;
  }
  if (cur.events.length) closeBar("none");
  if (!bars.length || !notes.length) fail("", "keine Noten");
  if (openSlur) fail(`Takt ${openSlur.bar + 1}`, "Bindebogen wird nicht geschlossen");
  if (notes[notes.length - 1].tie) fail(`Takt ${bars.length}`, "Haltebogen an der letzten Note");
  if (inVolta1) fail(`Takt ${bars.length}`, "1. Klammer ohne Wiederholungszeichen :|");
  if (pendingVolta) fail(`Takt ${bars.length}`, "Klammer ohne Takt");

  checkBars(raw, bars, fail);
  markPickups(bars);
  assignAccidentals(bars, key!);
  assignLyrics(raw, notes, fail);

  let low = notes[0].pitch;
  let high = notes[0].pitch;
  for (const n of notes) {
    if (n.pitch.midi < low.midi) low = n.pitch;
    if (n.pitch.midi > high.midi) high = n.pitch;
  }
  return {
    id: slugify(title),
    title,
    subtitle: raw.subtitle ? String(raw.subtitle) : null,
    chapter: raw.chapter ? String(raw.chapter) : "Lieder",
    key: key!,
    keyName: String(raw.keyname ?? ""),
    time: { num: t0[0], den: t0[1] },
    credit: String(raw.credit ?? ""),
    hasLyrics: notes.some((n) => n.syllable),
    stanzas: (raw.stanzas ?? []).map((s) => String(s).split(/\s+\/\s+/).map((l) => l.trim())),
    stanzaCols: typeof raw.stanza_cols === "number" ? raw.stanza_cols : null,
    bars,
    notes,
    range: { low, high },
  };
}

function validTime(num: unknown, den: unknown): boolean {
  return Number.isInteger(num) && (num as number) > 0 && (num as number) <= 16 && [1, 2, 4, 8, 16].includes(den as number);
}

/**
 * Taktlängen prüfen wie check_and_assign: Jeder Takt muss voll sein, außer dem ersten und letzten
 * (Auftakt, Schlusstakt). Ein an einer Wiederholung geteilter Takt (Rest vor :|, Auftakt nach |:
 * bzw. 1. Klammer + Auftakt des Teils) zählt als ganz.
 */
function checkBars(raw: RawSong, bars: Bar[], fail: (w: string, r: string) => never): void {
  const eff = bars.map((b) => b.length);
  let pickup: number | null = null;
  let segStart = true;
  bars.forEach((b, i) => {
    if (b.repeatStart) segStart = true;
    if (segStart) {
      pickup = b.length < b.nominal - EPS ? b.length : 0;
      segStart = false;
    }
    if (b.volta === 1 && b.barline === "repeatEnd" && b.length < b.nominal - EPS && pickup && Math.abs(b.length + pickup - b.nominal) < EPS) {
      eff[i] = b.nominal;
    }
  });
  for (let i = 0; i < bars.length - 1; i++) {
    const a = bars[i];
    if (a.barline === "repeatEnd" && eff[i] < a.nominal - EPS && Math.abs(eff[i] + eff[i + 1] - a.nominal) < EPS) {
      eff[i] = a.nominal;
      eff[i + 1] = bars[i + 1].nominal;
    }
  }
  eff.forEach((len, i) => {
    const b = bars[i];
    if (Math.abs(len - b.nominal) > EPS && i !== 0 && i !== bars.length - 1) {
      fail(`Takt ${i + 1}`, `${fmt(b.length)} statt ${fmt(b.nominal)} Viertel (${b.time.num}/${b.time.den}-Takt)`);
    }
  });
  if (raw.pickup != null && bars.length > 1) {
    const last = bars[bars.length - 1];
    const tot = bars[0].length + last.length;
    if (Math.abs(tot - last.nominal) > EPS) fail("Auftakt und Schlusstakt", `zusammen ${fmt(tot)} statt ${fmt(last.nominal)} Viertel`);
  }
}

/** Auftakte markieren: kurzer Takt am Liedanfang, nach |: oder als Rest eines vor :| geteilten Takts. */
function markPickups(bars: Bar[]): void {
  bars.forEach((b, i) => {
    if (b.length >= b.nominal - EPS) return;
    const prev = bars[i - 1];
    b.pickup = i === 0 || b.repeatStart || (prev.barline === "repeatEnd" && prev.length < prev.nominal - EPS && b.volta !== 2);
  });
}

/** Vorzeichen im Notenbild wie render_staff_system: Tonart gilt, Abweichungen bis zum Taktende. */
function assignAccidentals(bars: Bar[], key: KeyInfo): void {
  const sign: Record<number, Accidental> = { 1: "sharp", [-1]: "flat", 0: "natural" };
  for (const bar of bars) {
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
}

/** Silben zuordnen wie check_and_assign: keine Silbe nach einem Haltebogen und innerhalb eines Bindebogens. */
function assignLyrics(raw: RawSong, notes: NoteEvent[], fail: (w: string, r: string) => never): void {
  const syl = splitLyrics(String(raw.lyrics ?? ""));
  let k = 0;
  let inSlur = false;
  let prevTie = false;
  for (const n of notes) {
    let gets = !prevTie && !inSlur;
    if (n.slurStart) {
      inSlur = true;
      gets = !prevTie;
    }
    if (gets) {
      if (k < syl.length) n.syllable = { text: syl[k][0], hyphen: syl[k][1], extendTo: null };
      k++;
    }
    if (n.slurEnd) inSlur = false;
    prevTie = n.tie;
  }
  if (syl.length && k !== syl.length) {
    fail("Liedtext", `${syl.length} Silben, aber ${k} Noten bekommen eine Silbe`);
  }
  // Melisma-Linie wie im Heft: Wortende, danach Noten ohne Silbe bis zur nächsten Silbe
  notes.forEach((n, i) => {
    if (!n.syllable || n.syllable.hyphen) return;
    let last: NoteEvent | null = null;
    for (const m of notes.slice(i + 1)) {
      if (m.syllable) break;
      last = m;
    }
    if (last) n.syllable.extendTo = last.id;
  });
}

/** Ereignis (Note oder Pause) zu einer Kennung. */
export function findEvent(song: Song, id: number): BarEvent | undefined {
  for (const b of song.bars) for (const e of b.events) if (e.id === id) return e;
  return undefined;
}
