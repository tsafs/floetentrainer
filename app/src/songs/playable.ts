// Kann sie ein Lied schon spielen? Maßgeblich sind die in der Lesen-Spur freigeschalteten Töne.
// Andere Schreibweisen zählen als ihr Partner aus der Grifftabelle (dis¹ = es¹, as¹ = gis¹ …),
// deshalb wird über die notierte MIDI-Höhe verglichen.

import { unlockedNotes } from "../music/levels";
import { midiNameHtml } from "../music/names";
import { chartNoteByMidi, NOTES, spellMidi } from "../music/notes";
import { level } from "../srs/progress";
import type { AppData } from "../store/data";
import type { Song } from "./model";

/** Ein Ton, der zum Spielen noch fehlt, in der Schreibweise der Grifftabelle. */
export interface MissingNote {
  /** Kennung wie in der App, z. B. "fis1"; außerhalb der Tabelle z. B. "d3" oder "h0" */
  id: string;
  /** Name ohne Oktave, z. B. "fis" */
  name: string;
  /** Oktave, 1 = eingestrichen; 0 = kleine Oktave */
  octave: number;
  /** notierte MIDI-Höhe */
  midi: number;
  /** false: Den Ton kennt die App gar nicht (außerhalb c¹–c³). */
  inChart: boolean;
}

export interface Playability {
  /** alle Töne des Lieds sind freigeschaltet */
  playable: boolean;
  /** fehlende Töne, nach Tonhöhe sortiert, ohne Doppelte */
  missing: MissingNote[];
}

/** Notierte MIDI-Höhen aller Töne des Lieds, aufsteigend, ohne Doppelte. */
export function songMidis(song: Song): number[] {
  return [...new Set(song.notes.map((n) => n.pitch.midi))].sort((a, b) => a - b);
}

/** Spielbarkeit bei den freigeschalteten Tönen `unlocked` (Kennungen wie "fis1", auch "dis1"). */
export function playability(song: Song, unlocked: Iterable<string>): Playability {
  const have = new Set<number>();
  for (const id of unlocked) {
    const n = NOTES[id];
    if (n) have.add(n.midi);
  }
  const missing: MissingNote[] = [];
  for (const midi of songMidis(song)) {
    if (have.has(midi)) continue;
    const chart = chartNoteByMidi(midi);
    const { name, octave } = chart ? { name: chart.name, octave: chart.octave } : spellMidi(midi);
    missing.push({ id: chart ? chart.id : name + octave, name, octave, midi, inChart: !!chart });
  }
  return { playable: missing.length === 0, missing };
}

/** Freigeschaltete Töne der Lesen-Spur */
export function readingNotes(data: AppData): string[] {
  return unlockedNotes("lesen", level(data, "lesen"));
}

/** Spielbarkeit nach dem Stand der Lesen-Spur */
export function playabilityFor(song: Song, data: AppData): Playability {
  return playability(song, readingNotes(data));
}

/** "fis¹, c²" als HTML mit Hochzahl-Element (wie nameHtml), für „Fehlt noch: …“ */
export function missingHtml(missing: MissingNote[]): string {
  return missing.map((m) => midiNameHtml(m.midi)).join(", ");
}
