import type { RawSong } from "../../src/songs/model";
import { parseSong } from "../../src/songs/parse";

/** Kleines handgeschriebenes Lied in Heft-Notation (Standard: C-Dur, 4/4) */
export function song(music: string, extra: Partial<RawSong> = {}) {
  return parseSong({ chapter: null, title: "Test", key: "C", keyname: "C-Dur", time: [4, 4], music, ...extra });
}
