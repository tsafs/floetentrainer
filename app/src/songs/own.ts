// Eigene Lieder (ABC): einlesen, gespeicherten Quelltext beim Start neu lesen, hinzufügen, löschen.
// Gespeichert wird in AppData.ownSongs (src/store/data.ts) nur der Quelltext je Stück samt gewählter
// Oktavverschiebung; das Liedmodell entsteht bei jedem Start neu aus dem Text. Ein Stück, das sich
// später nicht mehr lesen lässt, bleibt gespeichert und erscheint in der Liste mit Hinweis.

import { uniqueId, type AppData, type OctaveShift, type OwnSong } from "../store/data";
import { fileHeadFields, parseAbc, type AbcProblem, type AbcTune } from "./abc";
import { SONGS } from "./library";
import type { Song } from "./model";
import { shiftOctave } from "./range";

/** Ab dieser Größe (Zeichen ≈ Bytes) weist das Einlesen auf den Speicherplatz hin. */
export const LARGE_INPUT = 200_000;
/** Größere Eingaben werden gar nicht erst gelesen (der Speicher des Browsers fasst nur wenige MB). */
export const MAX_INPUT = 2_000_000;
/** Höchstlänge des Titelteils der Kennung (damit sie samt "abc-" und "-2" kurz bleibt) */
const SLUG_MAX = 60;

// ---------------------------------------------------------------- Einlesen (vor dem Übernehmen)

/** Ein lesbares Stück der Eingabe, mit dem Quelltext, der gespeichert würde. */
export interface ImportTune {
  tune: AbcTune;
  /** Quelltext nur dieses Stücks (ohne die übrigen Stücke der Datei, samt geltenden Feldern des Dateikopfs) */
  abc: string;
  /** Stelle unter den lesbaren Stücken von abc (0, wenn das Herauslösen geklappt hat) */
  index: number;
}

export interface ImportResult {
  tunes: ImportTune[];
  errors: AbcProblem[];
  /** Größe der Eingabe in Zeichen */
  size: number;
}

/** Liest eingefügten Text bzw. Dateiinhalt. Zu große Eingaben ergeben nur eine Fehlermeldung. */
export function readImport(text: string): ImportResult {
  if (text.length > MAX_INPUT) {
    return {
      tunes: [],
      errors: [{ number: null, title: "", line: 0, message: `Die Datei ist zu groß (${kb(text.length)}). Eingelesen werden höchstens ${kb(MAX_INPUT)}.` }],
      size: text.length,
    };
  }
  const res = parseAbc(text);
  const lines = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").split("\n");
  // Felder des Dateikopfs (z. B. L:1/4 vor dem ersten X:) gelten für jedes Stück: mit speichern
  const head = fileHeadFields(lines);
  const tunes = res.tunes.map((tune, i) => {
    const part = tuneSource(lines, tune.line);
    const own = part != null && head.length ? `${head.join("\n")}\n${part}` : part;
    // Nur übernehmen, wenn der herausgelöste Text dasselbe Stück ergibt; sonst die ganze Eingabe
    // speichern und das Stück über seine Stelle wiederfinden.
    if (own != null) {
      const again = parseAbc(own).tunes;
      if (again.length === 1 && sameTune(again[0], tune)) return { tune, abc: own, index: 0 };
    }
    return { tune, abc: text, index: i };
  });
  return { tunes, errors: res.errors, size: text.length };
}

/**
 * Dateiinhalt als Text. ABC-Dateien sind meist UTF-8, ältere Sammlungen aber oft Latin-1 bzw.
 * Windows-1252 (Standard bis ABC 2.0): Ist der Inhalt kein gültiges UTF-8, wird er so gelesen, statt
 * Umlaute still durch „�“ zu ersetzen. Eine BOM am Anfang fällt weg.
 */
export function decodeAbc(bytes: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** „12 kB“ */
export function kb(chars: number): string {
  return `${Math.max(1, Math.round(chars / 1000))} kB`;
}

/**
 * Quelltext des Stücks, das in Zeile `line` (1-basiert) beginnt: von X: bis zur nächsten Leerzeile,
 * wie der Leser die Stücke trennt. Ohne X: gehört die ganze Eingabe zu einem Stück (null = ganze Eingabe).
 */
function tuneSource(lines: string[], line: number): string | null {
  if (!lines.some((l) => /^X:/.test(l))) return null;
  const from = line - 1;
  if (!/^X:/.test(lines[from] ?? "")) return null;
  let to = from + 1;
  while (to < lines.length && lines[to].trim()) to++;
  return lines.slice(from, to).join("\n") + "\n";
}

function sameTune(a: AbcTune, b: AbcTune): boolean {
  const len = (t: AbcTune) => t.song.notes.map((n) => n.q).join(",");
  return a.title === b.title && a.song.bars.length === b.song.bars.length && len(a) === len(b);
}

// ---------------------------------------------------------------- Gespeicherte Lieder lesen

/** Ein gespeichertes eigenes Lied, frisch gelesen. */
export interface OwnEntry {
  stored: OwnSong;
  /** gelesenes Lied (Oktavverschiebung angewandt, Kennung = stored.id); null, wenn nicht mehr lesbar */
  song: Song | null;
  /** das gelesene Stück (für Hinweise und Weggelassenes); null, wenn nicht lesbar */
  tune: AbcTune | null;
  /** Grund, wenn das Stück sich nicht lesen lässt */
  error: string | null;
}

/** Gelesene Lieder, nach Quelltext und Einstellungen gemerkt: jedes Stück wird nur einmal gelesen. */
const cache = new Map<string, OwnEntry>();

function cacheKey(o: OwnSong): string {
  return `${o.id}\u0000${o.shift}\u0000${o.number}\u0000${o.index}\u0000${o.abc}`;
}

/** Liest ein gespeichertes Lied (ohne Zwischenspeicher). */
export function readOwn(o: OwnSong): OwnEntry {
  let res;
  try {
    res = parseAbc(o.abc);
  } catch {
    return { stored: o, song: null, tune: null, error: "Der Leser ist an diesem Stück gescheitert." };
  }
  const byNumber = o.number != null ? res.tunes.filter((t) => t.number === o.number) : [];
  const tune = byNumber.length === 1 ? byNumber[0] : (res.tunes[o.index] ?? (res.tunes.length === 1 && !res.errors.length ? res.tunes[0] : undefined));
  if (!tune) {
    const err = res.errors.find((e) => o.number == null || e.number === o.number) ?? res.errors[0];
    return { stored: o, song: null, tune: null, error: err ? err.message : "Das Stück ist im gespeicherten Text nicht mehr zu finden." };
  }
  const song = o.shift ? shiftOctave(tune.song, o.shift) : tune.song;
  song.id = o.id;
  return { stored: o, song, tune, error: null };
}

/** Alle eigenen Lieder in der gespeicherten Reihenfolge, gelesen. */
export function ownEntries(data: AppData): OwnEntry[] {
  return data.ownSongs.map((o) => {
    const k = cacheKey(o);
    let e = cache.get(k);
    if (!e) {
      e = readOwn(o);
      cache.set(k, e);
    }
    // Der Eintrag kann nach dem Einlesen einer Sicherung ein anderes, gleich aussehendes Objekt sein
    return e.stored === o ? e : { ...e, stored: o };
  });
}

/** Eigenes Lied zu einer Kennung */
export function ownEntryById(data: AppData, id: string): OwnEntry | undefined {
  return ownEntries(data).find((e) => e.stored.id === id);
}

// ---------------------------------------------------------------- Übernehmen und löschen

/** Kennung für ein neues eigenes Lied: "abc-" + Titel, eindeutig gegenüber Heft und eigenen Liedern. */
export function newOwnId(data: AppData, song: Song, taken: Set<string> = takenIds(data)): string {
  const slug = song.id.replace(/^abc-/, "").slice(0, SLUG_MAX).replace(/-+$/, "") || "stueck";
  return uniqueId(`abc-${slug}`, taken);
}

function takenIds(data: AppData): Set<string> {
  return new Set([...SONGS.map((s) => s.id), ...data.ownSongs.map((o) => o.id)]);
}

/** Übernimmt gewählte Stücke (mit Oktavverschiebung je Stück). Gibt die neuen Einträge zurück. */
export function addOwnSongs(data: AppData, picks: { item: ImportTune; shift: OctaveShift }[], now = Date.now()): OwnSong[] {
  const taken = takenIds(data);
  const added: OwnSong[] = [];
  for (const { item, shift } of picks) {
    const id = newOwnId(data, item.tune.song, taken);
    taken.add(id);
    const o: OwnSong = { id, title: item.tune.title, abc: item.abc, number: item.tune.number, index: item.index, shift, added: now };
    data.ownSongs.push(o);
    added.push(o);
  }
  return added;
}

/** Löscht ein eigenes Lied samt gemerktem Tempo. */
export function removeOwnSong(data: AppData, id: string): boolean {
  const i = data.ownSongs.findIndex((o) => o.id === id);
  if (i < 0) return false;
  data.ownSongs.splice(i, 1);
  delete data.songs[id];
  return true;
}

/** Ungefährer Platzbedarf der eigenen Lieder im Speicher (Zeichen) */
export function ownSize(data: AppData): number {
  return data.ownSongs.reduce((n, o) => n + o.abc.length + 120, 0);
}
