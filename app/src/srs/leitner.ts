// Leitner-System mit sechs Fächern.

import { kindsForNote, levelOf, unlockedNotes, type Track } from "../music/levels";
import { cardKey, type AppData, type CardState } from "../store/data";
import { addDays } from "../store/dates";

/** Abstand in Tagen je Fach; Fach 1 heißt „in der nächsten Sitzung“. */
export const INTERVALS = [0, 1, 3, 7, 14, 30];

/** Tag, ab dem die Karte fällig ist. Bei Fach 1 der Tag der letzten Antwort. */
export function dueDay(c: CardState): string {
  return c.box <= 1 ? c.day : addDays(c.day, INTERVALS[c.box - 1]);
}

/** Ist die Karte in der Sitzung mit dieser Nummer fällig? */
export function isDue(c: CardState, today: string, sessionNo: number): boolean {
  if (c.box <= 1) return c.session < sessionNo;
  return dueDay(c) <= today;
}

/** Neues Fach nach einer gewerteten Antwort. Neue Karten: richtig → Fach 2, falsch → Fach 1. */
export function nextBox(prev: CardState | undefined, ok: boolean): number {
  if (!prev) return ok ? 2 : 1;
  return ok ? Math.min(prev.box + 1, 6) : 1;
}

export function applyAnswer(prev: CardState | undefined, ok: boolean, today: string, sessionNo: number): CardState {
  return { box: nextBox(prev, ok), day: today, session: sessionNo };
}

export interface CardRef {
  note: string;
  kind: import("../music/levels").Kind;
}

/** Alle Karten der freigeschalteten Töne einer Spur. */
export function trackCards(data: AppData, track: Track): CardRef[] {
  const level = levelOf(track, data.stages[track]);
  return unlockedNotes(track, level).flatMap((note) => kindsForNote(track, note).map((kind) => ({ note, kind })));
}

/** Fällige Karten, die am längsten überfälligen zuerst. */
export function dueCards(data: AppData, track: Track, today: string, sessionNo: number): CardRef[] {
  return trackCards(data, track)
    .filter((c) => {
      const st = data.cards[cardKey(c.note, c.kind)];
      return st && isDue(st, today, sessionNo);
    })
    .map((c) => ({ c, d: dueDay(data.cards[cardKey(c.note, c.kind)]) }))
    .sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : 0))
    .map((x) => x.c);
}

/** Karten ohne Fach (noch nie beantwortet). */
export function newCards(data: AppData, track: Track): CardRef[] {
  return trackCards(data, track).filter((c) => !data.cards[cardKey(c.note, c.kind)]);
}

/** Zahl der fälligen Karten für die Startseite (die nächste Sitzung hat die Nummer sessions + 1). */
export function dueCount(data: AppData, track: Track, today: string): number {
  return dueCards(data, track, today, data.sessions + 1).length;
}
