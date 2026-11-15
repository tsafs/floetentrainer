// Abschnitte eines Lieds als kurze Tonfolgen (docs/app-uebungen.md, Abschnitt 3): Beim Spielen ist etwa
// jede vierte Folge ein Abschnitt des Stufenlieds – mit echtem Rhythmus, als kleiner Ausschnitt des
// Notenbilds. Rein rechnerisch und testbar.

import { chartNoteByMidi } from "../music/notes";
import type { BarEvent, NoteEvent, Song } from "./model";
import { timelineOfBars, type Timeline } from "./timeline";

/** Höchstens so viele Takte je Abschnitt (passt auf einem Handy in eine Zeile) */
export const SNIPPET_MAX_BARS = 2;
/** Höchstens so viele Töne je Abschnitt */
export const SNIPPET_MAX = 10;
/** Kürzere Abschnitte werden weggelassen */
export const SNIPPET_MIN = 3;

export interface Snippet {
  /** erster und letzter Takt (Indizes in Song.bars, Notenbild-Reihenfolge) */
  from: number;
  to: number;
  /** Töne der Reihe nach als Kennungen der Grifftabelle (gehaltene Noten einmal) */
  notes: string[];
}

/**
 * Ausschnitt eines Lieds als eigenes kleines Lied (Takte from–to, ohne Wiederholungen und Klammern), zum
 * Setzen mit renderScore und für den Zeitplan. Takte und Ereignisse sind Kopien (neu gezählte Takt-Indizes);
 * die Kennungen der Noten bleiben, Haltebögen und Bindebögen über den Rand hinaus fallen weg.
 */
export function songExcerpt(song: Song, from: number, to: number): Song {
  const src = song.bars.slice(from, to + 1);
  const bars = src.map((b, k) => ({
    ...b,
    index: k,
    pickup: from === 0 && k === 0 ? b.pickup : false,
    repeatStart: false,
    barline: k === src.length - 1 ? ("final" as const) : ("single" as const),
    volta: null,
    voltaNumbers: undefined,
    voltaStart: false,
    timeChange: k === 0 ? false : b.timeChange,
    events: [] as BarEvent[],
  }));
  const notes: NoteEvent[] = [];
  src.forEach((b, k) => {
    for (const e of b.events) {
      const c = { ...e, bar: k } as BarEvent;
      bars[k].events.push(c);
      if (c.kind === "note") notes.push(c);
    }
  });
  // Bögen nur innerhalb des Ausschnitts
  notes.forEach((n, i) => {
    if (i === 0) n.tiedFromPrev = false;
    if (i === notes.length - 1) n.tie = false;
    n.slurStart = false;
    n.slurEnd = false;
  });
  return { ...song, time: bars[0]?.time ?? song.time, bars, notes };
}

/** Zeitplan eines Ausschnitts (alle Takte der Reihe nach) */
export function excerptTimeline(ex: Song): Timeline {
  return timelineOfBars(ex, ex.bars.map((b) => b.index));
}

/**
 * Abschnitte eines Lieds: Phrasen (geteilt an Atemzeichen und Pausen) als Taktbereiche; längere in Stücke
 * von höchstens SNIPPET_MAX_BARS Takten. Ohne Abschnitte mit weniger als SNIPPET_MIN oder mehr als SNIPPET_MAX
 * Tönen, mit einem Ton außerhalb der Grifftabelle und ohne doppelte (gleiche Töne).
 */
export function songSnippets(song: Song): Snippet[] {
  // Phrasen als Taktbereiche
  const spans: [number, number][] = [];
  let start: number | null = null;
  let lastBar = 0;
  const end = () => {
    if (start !== null) spans.push([start, lastBar]);
    start = null;
  };
  for (const bar of song.bars) {
    for (const e of bar.events) {
      if (e.kind === "rest") {
        end();
        continue;
      }
      start ??= bar.index;
      lastBar = bar.index;
      if (e.breath) end();
    }
  }
  end();
  const out: Snippet[] = [];
  const seen = new Set<string>();
  const add = (from: number, to: number) => {
    const ex = songExcerpt(song, from, to);
    const ids = excerptTimeline(ex).tones.map((t) => chartNoteByMidi(t.midi)?.id ?? null);
    if (ids.length < SNIPPET_MIN || ids.length > SNIPPET_MAX || ids.some((x) => x === null)) return;
    const key = ids.join(" ");
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ from, to, notes: ids as string[] });
  };
  for (const [a, b] of spans) {
    for (let f = a; f <= b; f += SNIPPET_MAX_BARS) add(f, Math.min(b, f + SNIPPET_MAX_BARS - 1));
  }
  return out;
}
