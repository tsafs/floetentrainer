// Kapitel und Stufenlieder (docs/app-uebungen.md, Abschnitt 3).
//
// Kapitel: Die Meilensteine des Startpunkts (./startpoint.ts) teilen die Stufen in vier Kapitel. Die
// Stufen bleiben die Lernschritte (wenige neue Töne auf einmal), die Kapitel geben den Überblick.
// Stufenlieder: je Stufe, wo es eins gibt, ein Heft-Lied, das mit den Tönen dieser Stufe spielbar wird.
// Beim Spielen kommen seine Abschnitte als Folgen vor; beim Freischalten der nächsten Stufe der Hinweis,
// es jetzt ganz zu spielen.

import { levelOf, maxLevel, stageId, stagesOf, unlockedNotes, type Track } from "../music/levels";
import { SONGS } from "../songs/library";
import type { Song } from "../songs/model";
import { playability } from "../songs/playable";
import { MILESTONES, type Milestone } from "./startpoint";

export interface Chapter {
  /** 1 bis 4 */
  no: number;
  /** Meilenstein, der das Kapitel abschließt (Titel mit Platzhaltern, Oberfläche: milestoneTitle) */
  milestone: Milestone;
  /** erste und letzte Stufe (1-basiert) in dieser Spur */
  from: number;
  to: number;
}

/** Die Kapitel einer Spur (das letzte reicht bis zur obersten Stufe, beim Lesen also bis 12). */
export function chaptersOf(track: Track): Chapter[] {
  const starts = MILESTONES.map((m) => levelOf("lesen", m.stage)); // 1, 3, 7, 9, 12
  const out: Chapter[] = [];
  for (let i = 1; i < MILESTONES.length; i++) {
    const last = i === MILESTONES.length - 1;
    out.push({ no: i, milestone: MILESTONES[i], from: starts[i - 1], to: last ? maxLevel(track) : starts[i] - 1 });
  }
  return out;
}

/** Kapitel, zu dem eine Stufe gehört */
export function chapterOf(track: Track, level: number): Chapter {
  const list = chaptersOf(track);
  return list.find((c) => level >= c.from && level <= c.to) ?? list[list.length - 1];
}

/**
 * Stufenlied je Stufe (Titel wie im Heft). Gewählt das bekannteste und einfachste unter den Liedern, die
 * mit dieser Stufe spielbar werden (Stand 15.11.2026). Stufe 1 und 8 haben keins.
 */
export const STAGE_SONG_TITLES: Record<string, string> = {
  "c2-d2": "Hänschen klein",
  "e1-d1": "Es tanzt ein Bi-Ba-Butzemann",
  fis1: "Alle Vögel sind schon da",
  "e2-f1": "Alle meine Entchen",
  c1: "Kling, Glöckchen",
  "cis2-f2-g2": "Alle Jahre wieder",
  "b-toene": "Innsbruck, ich muss dich lassen",
  "kreuz-toene": "Greensleeves",
  "hohe-griffe": "Musette",
};

/** Stufenlied genau dieser Stufe (oder keins) */
export function stageSong(track: Track, level: number): Song | undefined {
  const title = STAGE_SONG_TITLES[stageId(track, level)];
  return title ? SONGS.find((s) => s.title === title) : undefined;
}

/**
 * Lied für Abschnitte auf dieser Stufe: das Stufenlied, sonst das der nächsttieferen Stufe mit Lied (aus
 * dem Kapitel bzw. davor). Nur, wenn es mit den freigeschalteten Tönen spielbar ist.
 */
export function snippetSong(track: Track, level: number): Song | undefined {
  const unlocked = unlockedNotes(track, level);
  for (let l = Math.min(level, stagesOf(track).length); l >= 1; l--) {
    const s = stageSong(track, l);
    if (s && playability(s, unlocked).playable) return s;
  }
  return undefined;
}
