// Abschnitte eines Lieds als kurze Tonfolgen (docs/app-uebungen.md, Abschnitt 3): Beim Spielen ist etwa
// jede vierte Folge ein Abschnitt des Stufenlieds. Rein rechnerisch und testbar.

import { chartNoteByMidi } from "../music/notes";
import type { Song } from "./model";

/** Höchstens so viele Töne je Abschnitt (passt als Notenzeile auf ein Handy) */
export const SNIPPET_MAX = 8;
/** Kürzere Abschnitte werden weggelassen */
export const SNIPPET_MIN = 3;

/**
 * Abschnitte eines Lieds: in Notenbild-Reihenfolge (Wiederholungen nicht ausgeschrieben), geteilt an
 * Atemzeichen und Pausen; zu lange an Taktgrenzen in Stücke von höchstens SNIPPET_MAX Tönen. Gehaltene
 * Noten (Haltebogen) zählen einmal. Töne als Kennungen der Grifftabelle (notierte Höhe). Abschnitte mit
 * einem Ton außerhalb der Tabelle fallen weg, ebenso doppelte.
 */
export function songSnippets(song: Song): string[][] {
  type Tone = { id: string | null; bar: number };
  const phrases: Tone[][] = [];
  let cur: Tone[] = [];
  const end = () => {
    if (cur.length) phrases.push(cur);
    cur = [];
  };
  for (const bar of song.bars) {
    for (const e of bar.events) {
      if (e.kind === "rest") {
        end();
        continue;
      }
      if (e.tiedFromPrev) continue;
      cur.push({ id: chartNoteByMidi(e.pitch.midi)?.id ?? null, bar: bar.index });
      if (e.breath) end();
    }
  }
  end();
  const out: string[][] = [];
  const seen = new Set<string>();
  const add = (p: Tone[]) => {
    if (p.length < SNIPPET_MIN || p.some((t) => t.id === null)) return;
    const ids = p.map((t) => t.id!);
    const key = ids.join(" ");
    if (seen.has(key)) return;
    seen.add(key);
    out.push(ids);
  };
  for (const p of phrases) {
    if (p.length <= SNIPPET_MAX) {
      add(p);
      continue;
    }
    // an Taktgrenzen teilen: Takte sammeln, solange es höchstens SNIPPET_MAX Töne bleiben
    let chunk: Tone[] = [];
    const bars = [...new Set(p.map((t) => t.bar))];
    for (const b of bars) {
      const tones = p.filter((t) => t.bar === b);
      if (chunk.length && chunk.length + tones.length > SNIPPET_MAX) {
        add(chunk);
        chunk = [];
      }
      chunk.push(...tones);
      while (chunk.length > SNIPPET_MAX) {
        add(chunk.slice(0, SNIPPET_MAX));
        chunk = chunk.slice(SNIPPET_MAX);
      }
    }
    add(chunk);
  }
  return out;
}
