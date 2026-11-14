import { readFileSync } from "node:fs";
import { expect } from "vitest";
import { type AbcTune, parseAbc } from "../../src/songs/abc";
import type { NoteEvent, Song } from "../../src/songs/model";

/** Beispiel-Datei aus tests/unit/abc/ */
export function abcFile(name: string): string {
  return readFileSync(new URL(`./abc/${name}`, import.meta.url), "utf8");
}

/** Kleines Stück: Kopf (Standard 4/4, L:1/4, C-Dur) und Notenzeilen; muss sich lesen lassen. */
export function abc(body: string, head = "M:4/4\nL:1/4\nK:C"): AbcTune {
  const r = parseAbc(`X:1\nT:Test\n${head}\n${body}\n`);
  expect(r.errors).toEqual([]);
  expect(r.tunes.length).toBe(1);
  return r.tunes[0];
}

/** Fehlermeldung eines Stücks, das sich nicht lesen lässt */
export function abcError(body: string, head = "M:4/4\nL:1/4\nK:C"): string {
  const r = parseAbc(`X:1\nT:Test\n${head}\n${body}\n`);
  expect(r.tunes).toEqual([]);
  expect(r.errors.length).toBe(1);
  return r.errors[0].message;
}

/** Ereignisse kurz: "c1:1" (Kennung:Viertel), Pause "r:1", Haltebogen "~" */
export function events(song: Song): string[] {
  return song.bars.flatMap((b) => b.events.map((e) => (e.kind === "rest" ? "r" : e.pitch.id) + ":" + +e.q.toFixed(4) + (e.kind === "note" && e.tie ? "~" : "")));
}

/** Takte kurz: Ereignisse je Takt mit Leerzeichen getrennt */
export function bars(song: Song): string[] {
  return song.bars.map((b) => b.events.map((e) => (e.kind === "rest" ? "r" : e.pitch.id) + ":" + +e.q.toFixed(4)).join(" "));
}

/** Silben je Note: "Al-" (mit Trennstrich), "le", "·" ohne Silbe */
export function syllables(song: Song): string[] {
  return song.notes.map((n: NoteEvent) => (n.syllable ? n.syllable.text + (n.syllable.hyphen ? "-" : "") : "·"));
}
