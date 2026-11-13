// Antwortmöglichkeiten: falsche Antworten möglichst verwechselbar.

import { isAltSpelling, stageIndexOfNote, type Kind } from "../music/levels";
import { ALL_NOTES, fingeringDistance, note, type Note } from "../music/notes";

export type Rng = () => number;

/** Wie leicht lässt sich c mit t verwechseln? Höher = verwechselbarer. */
export function confusability(t: Note, c: Note, kind: Kind): number {
  const dp = Math.abs(t.pos - c.pos);
  const dm = Math.abs(t.midi - c.midi);
  const fd = fingeringDistance(t.fingering, c.fingering);
  let s = 0;
  if (dp === 1) s += 5; // Nachbarnote (Linie/Zwischenraum)
  if (dp === 0) s += 5; // gleiche Stelle, anderes Vorzeichen
  if (dm === 12 && t.name === c.name) s += 4; // andere Oktave
  if (dp === 2) s += 2;
  if (dm <= 2) s += 1;
  const fingerWeight = kind === "griff" || kind === "spiel" ? 2 : 1;
  if (fd <= 1) s += 3 * fingerWeight;
  else if (fd <= 2) s += 2 * fingerWeight;
  else if (fd <= 3) s += 1 * fingerWeight;
  return s;
}

function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Darf c zusammen mit den schon gewählten Tönen stehen? Nie gleicher Griff, nie gleicher Ton. */
function compatible(c: Note, chosen: Note[]): boolean {
  return chosen.every((x) => x.fingering !== c.fingering && x.midi !== c.midi);
}

/** Wie viele Möglichkeiten: Note→Name ab Fach 3 acht, sonst vier. */
export function choiceCount(kind: Kind, box: number | undefined): number {
  return kind === "name" && (box ?? 0) >= 3 ? 8 : 4;
}

/**
 * Antwortmöglichkeiten (inklusive der richtigen) für eine Karte.
 * unlocked: freigeschaltete Töne der Lesen-Spur. Reichen sie nicht für 4, kommen Töne aus späteren
 * Stufen dazu (die selbst nie abgefragt werden). Bei 8 Möglichkeiten nur freigeschaltete Töne,
 * entsprechend weniger, mindestens 4.
 */
export function makeChoices(targetId: string, kind: Kind, wanted: number, unlocked: string[], rng: Rng): string[] {
  const t = note(targetId);
  const allowAlt = kind !== "note"; // Griff→Note: keine anderen Schreibweisen
  const usable = (n: Note) => n.id !== t.id && (allowAlt || !isAltSpelling(n.id));
  const unlockedSet = new Set(unlocked);
  const ranked = (list: Note[]) =>
    list
      .map((n) => ({ n, s: confusability(t, n, kind) + rng() * 1.5 }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.n);

  const chosen: Note[] = [t];
  const take = (list: Note[], limit: number) => {
    for (const c of list) {
      if (chosen.length >= limit) break;
      if (compatible(c, chosen)) chosen.push(c);
    }
  };
  const inPool = ALL_NOTES.filter((n) => usable(n) && unlockedSet.has(n.id));
  take(ranked(inPool), wanted);
  if (chosen.length < 4) {
    // spätere Stufen, die näheren zuerst
    const later = ALL_NOTES.filter((n) => usable(n) && !unlockedSet.has(n.id));
    const byStage = new Map<number, Note[]>();
    for (const n of later) {
      const s = stageIndexOfNote(n.id);
      byStage.set(s, [...(byStage.get(s) ?? []), n]);
    }
    for (const s of [...byStage.keys()].sort((a, b) => a - b)) {
      take(ranked(byStage.get(s)!), 4);
      if (chosen.length >= 4) break;
    }
  }
  const ids = chosen.map((n) => n.id);
  if (kind === "name") {
    return ids.sort((a, b) => note(a).midi - note(b).midi || note(a).pos - note(b).pos);
  }
  return shuffle(ids, rng);
}
