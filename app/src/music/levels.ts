// Lernstufen mit festen Kennungen. Lesen hat 12 Stufen, Spielen 11 (Stufe 12 ist nur Lesen).

export type Track = "lesen" | "spielen";
export type Kind = "name" | "griff" | "note" | "spiel";

export interface Stage {
  id: string;
  notes: string[];
  /** nur in der Lesen-Spur */
  readOnly?: boolean;
  note?: string;
}

export const STAGES: Stage[] = [
  { id: "erste-toene", notes: ["h1", "a1", "g1"] },
  { id: "c2-d2", notes: ["c2", "d2"] },
  { id: "e1-d1", notes: ["e1", "d1"] },
  { id: "fis1", notes: ["fis1"] },
  { id: "e2-f1", notes: ["e2", "f1"] },
  { id: "c1", notes: ["c1"] },
  { id: "cis2-f2-g2", notes: ["cis2", "f2", "g2"] },
  { id: "hoch-stamm", notes: ["a2", "h2", "c3"], note: "hohe Stammtöne" },
  { id: "b-toene", notes: ["b1", "es1"], note: "häufigste ♭-Töne" },
  { id: "kreuz-toene", notes: ["cis1", "gis1", "fis2"], note: "♯-Töne" },
  { id: "hohe-griffe", notes: ["es2", "gis2", "b2"], note: "schwierige hohe Griffe" },
  {
    id: "andere-schreibweisen",
    notes: ["dis1", "dis2", "as1", "as2", "ais1", "ais2"],
    readOnly: true,
    note: "andere Schreibweisen, nur Lesen",
  },
];

export const TRACKS: Track[] = ["lesen", "spielen"];
export const TRACK_LABEL: Record<Track, string> = { lesen: "Lesen", spielen: "Spielen" };

export function stagesOf(track: Track): Stage[] {
  return track === "lesen" ? STAGES : STAGES.filter((s) => !s.readOnly);
}

export function maxLevel(track: Track): number {
  return stagesOf(track).length;
}

/** Stufennummer (1-basiert) zu einer Kennung; unbekannte Kennungen → 1. */
export function levelOf(track: Track, id: string | undefined): number {
  const i = stagesOf(track).findIndex((s) => s.id === id);
  return i < 0 ? 1 : i + 1;
}

export function stageId(track: Track, level: number): string {
  const st = stagesOf(track);
  return st[Math.max(1, Math.min(level, st.length)) - 1].id;
}

/** Freigeschaltete Töne einer Spur bei einer Stufe, in Stufenreihenfolge. */
export function unlockedNotes(track: Track, level: number): string[] {
  return stagesOf(track)
    .slice(0, level)
    .flatMap((s) => s.notes);
}

/** Stufe, in der ein Ton dazukommt (1-basiert, Lesen-Zählung). */
export function stageIndexOfNote(id: string): number {
  return STAGES.findIndex((s) => s.notes.includes(id)) + 1;
}

export function isAltSpelling(id: string): boolean {
  return STAGES[STAGES.length - 1].notes.includes(id);
}

export const TRACK_KINDS: Record<Track, Kind[]> = {
  lesen: ["name", "griff", "note"],
  spielen: ["spiel"],
};

export function trackOfKind(kind: Kind): Track {
  return kind === "spiel" ? "spielen" : "lesen";
}

/** Übungsarten eines Tons in einer Spur (andere Schreibweisen: nur Note→Name und Note→Griff). */
export function kindsForNote(track: Track, id: string): Kind[] {
  if (track === "spielen") return isAltSpelling(id) ? [] : ["spiel"];
  return isAltSpelling(id) ? ["name", "griff"] : ["name", "griff", "note"];
}
