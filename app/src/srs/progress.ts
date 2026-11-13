// Trefferquote, Freischalten der Stufen, Serie der Übungstage.

import { levelOf, maxLevel, stageId, stagesOf, unlockedNotes, type Track } from "../music/levels";
import { HISTORY_LEN, type Answer, type AppData } from "../store/data";
import { addDays, mondayOf } from "../store/dates";

export const UNLOCK_MIN_ANSWERS = 10;
export const UNLOCK_RATIO = 0.9;
export const UNLOCK_MIN_DAYS = 2;
export const WEAK_MIN_ANSWERS = 5;
export const WEAK_RATIO = 0.8;

export interface Accuracy {
  n: number;
  correct: number;
  ratio: number;
}

export function accuracy(list: Answer[] | undefined): Accuracy {
  const l = (list ?? []).slice(-HISTORY_LEN);
  const correct = l.filter((a) => a[0] === 1).length;
  return { n: l.length, correct, ratio: l.length ? correct / l.length : 0 };
}

export function noteAccuracy(data: AppData, track: Track, note: string): Accuracy {
  return accuracy(data.history[track][note]);
}

/** Schwach (rot): mindestens 5 Antworten und unter 80 % richtig. */
export function isWeak(acc: Accuracy): boolean {
  return acc.n >= WEAK_MIN_ANSWERS && acc.ratio < WEAK_RATIO;
}

/** Gewertete Antwort festhalten: letzte 20 je Ton und Spur, Übungstag merken. */
export function recordAnswer(data: AppData, track: Track, note: string, ok: boolean, now: number, today: string): void {
  const list = (data.history[track][note] ??= []);
  list.push([ok ? 1 : 0, today, now]);
  if (list.length > HISTORY_LEN) list.splice(0, list.length - HISTORY_LEN);
  if (!data.days.includes(today)) {
    data.days.push(today);
    data.days.sort();
  }
}

/** Erfüllt ein Ton die Freischalt-Bedingung? Es zählen nur Antworten ab countFrom. */
export function noteMastered(list: Answer[] | undefined, countFrom: number): boolean {
  const l = (list ?? []).slice(-HISTORY_LEN).filter((a) => a[2] >= countFrom);
  if (l.length < UNLOCK_MIN_ANSWERS) return false;
  const correct = l.filter((a) => a[0] === 1).length;
  if (correct / l.length < UNLOCK_RATIO - 1e-9) return false;
  return new Set(l.map((a) => a[1])).size >= UNLOCK_MIN_DAYS;
}

export function level(data: AppData, track: Track): number {
  return levelOf(track, data.stages[track]);
}

/** Höchste erlaubte Stufe einer Spur (Spielen höchstens so hoch wie Lesen). */
export function levelCap(data: AppData, track: Track): number {
  if (track === "lesen") return maxLevel("lesen");
  return Math.min(maxLevel("spielen"), level(data, "lesen"));
}

export function readyForNext(data: AppData, track: Track): boolean {
  const lv = level(data, track);
  if (lv >= levelCap(data, track)) return false;
  return unlockedNotes(track, lv).every((n) => noteMastered(data.history[track][n], data.countFrom[track]));
}

export interface Unlock {
  track: Track;
  level: number;
  notes: string[];
}

/** Nach jeder Antwort: nächste Stufe freischalten, wo die Bedingung erfüllt ist. */
export function checkUnlocks(data: AppData): Unlock[] {
  const out: Unlock[] = [];
  for (const track of ["lesen", "spielen"] as Track[]) {
    if (readyForNext(data, track)) {
      const lv = level(data, track) + 1;
      data.stages[track] = stageId(track, lv);
      out.push({ track, level: lv, notes: stagesOf(track)[lv - 1].notes });
    }
  }
  return out;
}

/** Stufe von Hand setzen. Senken: Zählung für das Freischalten beginnt neu. */
export function setLevel(data: AppData, track: Track, target: number, now: number): void {
  const cap = track === "lesen" ? maxLevel("lesen") : levelCap(data, "spielen");
  const lv = Math.max(1, Math.min(target, cap));
  const before = level(data, track);
  data.stages[track] = stageId(track, lv);
  if (lv < before) data.countFrom[track] = now;
  if (track === "lesen") {
    const sp = level(data, "spielen");
    const spCap = Math.min(maxLevel("spielen"), lv);
    if (sp > spCap) {
      data.stages.spielen = stageId("spielen", spCap);
      data.countFrom.spielen = now;
    }
  }
}

/** Tage in Folge mit mindestens einer gewerteten Antwort. Ohne Übung heute zählt sie bis gestern. */
export function streak(days: string[], today: string): number {
  const set = new Set(days);
  let d = set.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (set.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export interface WeekDot {
  label: string;
  day: string;
  on: boolean;
  today: boolean;
}

/** Wochenpunkte Mo–So der laufenden Woche. */
export function weekDots(days: string[], today: string): WeekDot[] {
  const set = new Set(days);
  const mo = mondayOf(today);
  return ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"].map((label, i) => {
    const day = addDays(mo, i);
    return { label, day, on: set.has(day), today: day === today };
  });
}
