// Töne, Griffe, Namen und Frequenzen der Sopranblockflöte in C (barocke Griffweise).

import { A4, centsBetween, shiftHz } from "./tuning";

/** Grifftabelle aus docs/app-prompt.md: Daumen · 1–3 · 4–7; x = zu, o = offen, h = halb. */
export const FINGER_SRC =
  "c¹ x xxx xxxx | cis¹ x xxx xxxh | d¹ x xxx xxxo | es¹ x xxx xxho | e¹ x xxx xxoo | f¹ x xxx xoxx | " +
  "fis¹ x xxx oxxo | g¹ x xxx oooo | gis¹ x xxo xxxo | a¹ x xxo oooo | b¹ x xox xooo | h¹ x xoo oooo | " +
  "c² x oxo oooo | cis² o xxo oooo | d² o oxo oooo | es² o oxx xxxo | e² h xxx xxoo | f² h xxx xoxo | " +
  "fis² h xxx oxoo | g² h xxx oooo | gis² h xxo xooo | a² h xxo oooo | b² h xxo xxxo | h² h xxo xxoo | " +
  "c³ h xoo xxoo";

const SUP: Record<string, number> = { "¹": 1, "²": 2, "³": 3 };
const LETTERS = "cdefgah";
const SEMI: Record<string, number> = { c: 0, d: 2, e: 4, f: 5, g: 7, a: 9, h: 11 };

export interface Note {
  /** Kennung, z. B. "cis1", "es2", "b1" */
  id: string;
  /** deutscher Name ohne Oktave, z. B. "cis", "es", "b" */
  name: string;
  /** Stammbuchstabe für die Notenzeile (b → h mit ♭) */
  letter: string;
  /** Vorzeichen: -1 ♭, 0 keins, 1 ♯ */
  alter: number;
  octave: number;
  /** Lage in halben Zwischenräumen, 0 = unterste Linie (e¹) */
  pos: number;
  /** MIDI-Nummer der *notierten* Note (c¹ = 60). Die Flöte klingt eine Oktave höher. */
  midi: number;
  /** Griff, 8 Zeichen: Daumen, Loch 1–7 */
  fingering: string;
  /** Bei anderen Schreibweisen (dis, as, ais): Kennung des Tons aus der Grifftabelle */
  partner?: string;
}

function parseName(full: string): { name: string; octave: number } {
  const octave = SUP[full.slice(-1)];
  return { name: full.slice(0, -1), octave };
}

function makeNote(name: string, octave: number, fingering: string, partner?: string): Note {
  let letter = name[0];
  let alter = 0;
  if (name === "b") {
    letter = "h";
    alter = -1;
  } else if (name.endsWith("is")) {
    alter = 1;
  } else if (name.length > 1) {
    alter = -1; // es, as
  }
  const pos = 7 * octave + LETTERS.indexOf(letter) - 9;
  const midi = 48 + 12 * octave + SEMI[letter] + alter;
  const n: Note = { id: name + octave, name, letter, alter, octave, pos, midi, fingering };
  if (partner) n.partner = partner;
  return n;
}

/** Die 25 Töne der Grifftabelle, nach Tonhöhe. */
export const CHART: Note[] = FINGER_SRC.split("|").map((part) => {
  const [full, t, a, b] = part.trim().split(/\s+/);
  const { name, octave } = parseName(full);
  return makeNote(name, octave, t + a + b);
});

/** Andere Schreibweisen (nur Lesen): Name → Partner in der Tabelle */
export const ENHARMONIC: [string, string][] = [
  ["dis1", "es1"],
  ["dis2", "es2"],
  ["as1", "gis1"],
  ["as2", "gis2"],
  ["ais1", "b1"],
  ["ais2", "b2"],
];

export const NOTES: Record<string, Note> = {};
for (const n of CHART) NOTES[n.id] = n;
for (const [id, partner] of ENHARMONIC) {
  const p = NOTES[partner];
  const name = id.slice(0, -1);
  NOTES[id] = makeNote(name, Number(id.slice(-1)), p.fingering, partner);
}

/** Alle Töne (Tabelle und andere Schreibweisen), nach Tonhöhe und dann Schreibweise. */
export const ALL_NOTES: Note[] = Object.values(NOTES).sort((a, b) => a.midi - b.midi || a.pos - b.pos);

export function note(id: string): Note {
  const n = NOTES[id];
  if (!n) throw new Error("Unbekannter Ton: " + id);
  return n;
}

/** Ton aus der Grifftabelle zu einer notierten MIDI-Nummer (Schreibweise der Tabelle). */
export function chartNoteByMidi(midi: number): Note | undefined {
  return CHART.find((n) => n.midi === midi);
}

/** Schreibweise der Grifftabelle für beliebige MIDI-Nummern (auch außerhalb c¹–c³). */
const CHART_SPELLING = ["c", "cis", "d", "es", "e", "f", "fis", "g", "gis", "a", "b", "h"];
export function spellMidi(midi: number): { name: string; octave: number } {
  const pc = ((midi % 12) + 12) % 12;
  return { name: CHART_SPELLING[pc], octave: Math.floor(midi / 12) - 4 };
}

/** Klingende Frequenz einer notierten Note auf der Sopranflöte (eine Oktave höher). */
export function soundingFreq(n: Note | number, tuning = A4): number {
  const midi = typeof n === "number" ? n : n.midi;
  return shiftHz(tuning, (midi + 12 - 69) * 100);
}

/** Gehörte Frequenz → notierte MIDI-Nummer (gebrochen). */
export function freqToWrittenMidi(freq: number, tuning = A4): number {
  return 69 - 12 + centsBetween(freq, tuning) / 100;
}

/** Zahl der verschiedenen Löcher zweier Griffe. */
export function fingeringDistance(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < 8; i++) if (a[i] !== b[i]) d++;
  return d;
}
