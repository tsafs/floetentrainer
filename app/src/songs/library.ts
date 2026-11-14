// Die Lieder des Hefts als Liedmodelle, in Heft-Reihenfolge. Die Rohdaten kommen beim Bauen aus
// heft/songs.py (scripts/heft-songs-plugin.ts); dort wird auch schon geprüft, dass jedes Lied lesbar ist.

import raw from "virtual:heft-songs";
import type { Song } from "./model";
import { parseSong } from "./parse";

export const SONGS: Song[] = withUniqueIds(raw.map(parseSong));

/** Lied zu einer Kennung */
export function songById(id: string): Song | undefined {
  return SONGS.find((s) => s.id === id);
}

/** Lieder nach Kapiteln, in Heft-Reihenfolge */
export function chapters(songs: Song[] = SONGS): { chapter: string; songs: Song[] }[] {
  const out: { chapter: string; songs: Song[] }[] = [];
  for (const s of songs) {
    const last = out[out.length - 1];
    if (last && last.chapter === s.chapter) last.songs.push(s);
    else out.push({ chapter: s.chapter, songs: [s] });
  }
  return out;
}

/** Gleiche Titel bekommen "-2", "-3" … angehängt, damit jede Kennung eindeutig ist. */
export function withUniqueIds(songs: Song[]): Song[] {
  const seen = new Map<string, number>();
  for (const s of songs) {
    const n = (seen.get(s.id) ?? 0) + 1;
    seen.set(s.id, n);
    if (n > 1) s.id = `${s.id}-${n}`;
  }
  return songs;
}
