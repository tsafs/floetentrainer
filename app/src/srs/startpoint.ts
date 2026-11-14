// Startpunkt im Lernplan: benannte Meilensteine, Wählen, Zurückgehen (docs/app-startpunkt.md).
//
// Wer bei einem Meilenstein beginnt, für den gelten die Töne der Stufen davor als bekannt: keine
// Vorstellung, ihre Karten liegen in Fach 3 (gestaffelt fällig, höchstens STAGGER_PER_DAY je Spur und
// Tag), und fürs Freischalten zählen nur die Töne ab dem Startpunkt (countedNotes in ./progress.ts).

import { kindsForNote, levelOf, maxLevel, stageId, stagesOf, unlockedNotes, type Track } from "../music/levels";
import { cardKey, type AppData } from "../store/data";
import { addDays } from "../store/dates";
import { INTERVALS } from "./leitner";
import { level, startLevel } from "./progress";

export interface Milestone {
  /** feste Kennung */
  id: string;
  /** Name als HTML-freier Text mit Platzhaltern {d1} für Notennamen (siehe milestoneTitle in der Oberfläche) */
  title: string;
  /** Kennung der Stufe, bei der der Meilenstein beginnt */
  stage: string;
}

export const MILESTONES: Milestone[] = [
  { id: "erste-toene", title: "Erste Töne", stage: "erste-toene" },
  { id: "bis-d1", title: "Hinunter bis {d1}", stage: "e1-d1" },
  { id: "tiefes-c1", title: "Das tiefe {c1}", stage: "c1" },
  { id: "hohe-toene", title: "Hohe Töne", stage: "cis2-f2-g2" },
  { id: "vorzeichen", title: "Vorzeichen", stage: "b-toene" },
  { id: "hohe-griffe", title: "Schwierige hohe Griffe", stage: "hohe-griffe" },
];

/** Fach der als bekannt angenommenen Karten */
export const ASSUMED_BOX = 3;
/** Höchstens so viele angenommene Karten werden je Spur am selben Tag fällig */
export const STAGGER_PER_DAY = 3;

export function milestone(id: string): Milestone | undefined {
  return MILESTONES.find((m) => m.id === id);
}

/** Stufe, bei der ein Meilenstein in einer Spur beginnt */
export function milestoneLevel(m: Milestone, track: Track): number {
  return Math.min(levelOf("lesen", m.stage), maxLevel(track));
}

/** Töne, die bei diesem Meilenstein als bekannt gelten (Lesen-Zählung) */
export function knownNotes(m: Milestone): string[] {
  return unlockedNotes("lesen", milestoneLevel(m, "lesen") - 1);
}

/** Töne der Stufen des Meilensteins bis zum nächsten Meilenstein (für „Neu dort“) */
export function milestoneNotes(m: Milestone): string[] {
  const i = MILESTONES.indexOf(m);
  const from = milestoneLevel(m, "spielen");
  const next = MILESTONES[i + 1];
  const to = next ? milestoneLevel(next, "spielen") - 1 : maxLevel("spielen");
  return stagesOf("spielen")
    .slice(from - 1, to)
    .flatMap((s) => s.notes);
}

/** Der Meilenstein, bei dem die Spur gerade „steht“: der höchste, der nicht über dem Startpunkt liegt */
export function currentMilestone(data: AppData, track: Track): Milestone {
  const st = startLevel(data, track);
  let out = MILESTONES[0];
  for (const m of MILESTONES) if (milestoneLevel(m, track) <= st) out = m;
  return out;
}

/** Hat sie schon einen Startpunkt gewählt bzw. die App schon benutzt? Sonst kommt die Willkommensseite. */
export function needsWelcome(data: AppData): boolean {
  return !data.start && data.sessions === 0 && data.days.length === 0 && Object.keys(data.cards).length === 0;
}

/** Hat der Ton in der Spur echte Antworten? */
function practised(data: AppData, track: Track, note: string): boolean {
  return (data.history[track][note]?.length ?? 0) > 0;
}

/**
 * Spur auf eine Stufe als Startpunkt setzen.
 * - Töne davor ohne Karte: als bekannt annehmen (vorgestellt, Karten in Fach 3, gestaffelt ab morgen).
 * - Töne ab dem Startpunkt, die nie wirklich beantwortet wurden: wieder ganz neu (Karten und Vorstellung
 *   weg). Wer zurückgeht, tut das, weil sie nicht sitzen.
 * - Geübte Töne behalten Karten und Antworten.
 * - Beim Zurückgehen zählen fürs Freischalten nur Antworten ab jetzt (wie beim Senken von Hand).
 */
function applyTrack(data: AppData, track: Track, target: number, now: number, today: string): void {
  const before = level(data, track);
  data.stages[track] = stageId(track, target);
  data.start = data.start ?? { lesen: stageId("lesen", 1), spielen: stageId("spielen", 1) };
  data.start[track] = stageId(track, target);
  if (target < before) data.countFrom[track] = now;

  const intro = data.introduced[track];
  const known = unlockedNotes(track, target - 1);
  const rest = stagesOf(track)
    .slice(target - 1)
    .flatMap((s) => s.notes);
  for (const n of rest) {
    if (practised(data, track, n)) continue;
    for (const k of kindsForNote(track, n)) delete data.cards[cardKey(n, k)];
    const i = intro.indexOf(n);
    if (i >= 0) intro.splice(i, 1);
  }

  // Die Töne nahe am Startpunkt zuerst prüfen (sie sitzen am wenigsten), die Übungsarten reihum
  const seed: string[] = [];
  const order = known.slice().reverse();
  const kinds = order.map((n) => kindsForNote(track, n));
  for (let r = 0; r < 3; r++) {
    order.forEach((n, i) => {
      const k = kinds[i][r];
      if (k && !data.cards[cardKey(n, k)]) seed.push(cardKey(n, k));
    });
  }
  seed.forEach((key, i) => {
    const due = addDays(today, 1 + Math.floor(i / STAGGER_PER_DAY));
    // „Tag der letzten Antwort“ so zurückgerechnet, dass die Karte am Tag due fällig ist
    data.cards[key] = { box: ASSUMED_BOX, day: addDays(due, -INTERVALS[ASSUMED_BOX - 1]), session: 0 };
  });
  for (const n of known) if (!intro.includes(n)) intro.push(n);
}

export type StartTracks = "beide" | Track;

/**
 * Startpunkt wählen. Spielen bleibt höchstens so hoch wie Lesen: Bei „nur Spielen“ wird auf die
 * Lesen-Stufe begrenzt; sinkt Lesen unter Spielen, beginnt Spielen bei der neuen Lesen-Stufe.
 */
export function chooseStart(data: AppData, m: Milestone, tracks: StartTracks, now: number, today: string): void {
  if (tracks !== "spielen") applyTrack(data, "lesen", milestoneLevel(m, "lesen"), now, today);
  const lesen = level(data, "lesen");
  const sp = level(data, "spielen");
  if (tracks !== "lesen") {
    applyTrack(data, "spielen", Math.min(milestoneLevel(m, "spielen"), lesen, maxLevel("spielen")), now, today);
  } else if (sp > lesen) {
    applyTrack(data, "spielen", Math.min(lesen, maxLevel("spielen")), now, today);
  }
  if (!data.start) data.start = { lesen: stageId("lesen", 1), spielen: stageId("spielen", 1) };
}

/** Darf der Meilenstein für diese Wahl genommen werden? (nur Spielen: nicht über der Lesen-Stufe) */
export function milestoneAllowed(data: AppData, m: Milestone, tracks: StartTracks): boolean {
  return tracks !== "spielen" || milestoneLevel(m, "spielen") <= level(data, "lesen");
}
