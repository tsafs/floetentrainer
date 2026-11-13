// Tonumfang der Sopranflöte: Passt ein Lied, und wenn nicht, passt es eine Oktave verschoben?
// Gebraucht beim Einlesen eigener Lieder (ABC), gilt aber für jedes Liedmodell.

import type { Song, SongPitch } from "./model";

/** tiefster notierter Ton der Sopranflöte: c¹ */
export const FLUTE_LOW = 60;
/** höchster notierter Ton, den die App Anfängerinnen zumutet: d³ */
export const FLUTE_HIGH = 86;

/** Ein Ton außerhalb des Umfangs, in der Schreibweise des Lieds. */
export interface OutsideNote {
  midi: number;
  /** Kennung wie in der App, z. B. "e3", "h0" */
  id: string;
  /** Name ohne Oktave, z. B. "fis" */
  name: string;
  octave: number;
  /** Klartext mit Oktave wie in der App: "d³", "c¹"; kleine Oktave "h", große Oktave "H" */
  text: string;
}

export interface RangeCheck {
  /** alle Töne liegen in c¹–d³ */
  ok: boolean;
  /** Das Lied passt, wenn es um so viele Halbtöne (eine Oktave) verschoben wird (siehe shiftOctave). */
  shift?: 12 | -12;
  /** Töne außerhalb, nach Tonhöhe, ohne Doppelte (leer, wenn ok) */
  outside: OutsideNote[];
}

const SUP = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶"];
const SUB = ["", "₁", "₂", "₃"];

/** Deutscher Name mit Oktave: c¹, d³; kleine Oktave ohne Zeichen (h), große groß (H), Kontra H₁. */
export function pitchText(name: string, octave: number): string {
  if (octave >= 1) return name + (SUP[octave] ?? `^${octave}`);
  if (octave === 0) return name;
  const big = name[0].toUpperCase() + name.slice(1);
  return big + (SUB[-1 - octave] ?? "");
}

/** Liegt das Lied im Umfang der Sopranflöte? Sonst: passt es eine Oktave höher oder tiefer? */
export function checkRange(song: Song): RangeCheck {
  const byMidi = new Map<number, SongPitch>();
  for (const n of song.notes) if (!byMidi.has(n.pitch.midi)) byMidi.set(n.pitch.midi, n.pitch);
  const midis = [...byMidi.keys()].sort((a, b) => a - b);
  const fits = (d: number) => midis.every((m) => m + d >= FLUTE_LOW && m + d <= FLUTE_HIGH);
  if (fits(0)) return { ok: true, outside: [] };
  const outside = midis
    .filter((m) => m < FLUTE_LOW || m > FLUTE_HIGH)
    .map((m) => {
      const p = byMidi.get(m)!;
      return { midi: m, id: p.id, name: p.name, octave: p.octave, text: pitchText(p.name, p.octave) };
    });
  const res: RangeCheck = { ok: false, outside };
  if (fits(12)) res.shift = 12;
  else if (fits(-12)) res.shift = -12;
  return res;
}

/** Kopie des Lieds, eine Oktave höher (12) oder tiefer (−12) notiert. Das Original bleibt unverändert. */
export function shiftOctave(song: Song, shift: 12 | -12): Song {
  const copy = structuredClone(song); // erhält, dass notes und bars dieselben Objekte enthalten
  const d = shift / 12;
  const seen = new Set<SongPitch>();
  for (const n of copy.notes) {
    const p = n.pitch;
    if (seen.has(p)) continue;
    seen.add(p);
    p.octave += d;
    p.midi += shift;
    p.pos += 7 * d;
    p.id = p.name + p.octave;
  }
  let low = copy.notes[0].pitch;
  let high = low;
  for (const n of copy.notes) {
    if (n.pitch.midi < low.midi) low = n.pitch;
    if (n.pitch.midi > high.midi) high = n.pitch;
  }
  copy.range = { low, high };
  return copy;
}
