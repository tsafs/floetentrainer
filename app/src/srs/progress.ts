// Trefferquote, Sicherheit (Punkte) und Freischalten der Stufen, Serie der Übungstage.

import { levelOf, maxLevel, stageId, stagesOf, unlockedNotes, type Track } from "../music/levels";
import { HISTORY_LEN, POINTS_MAX, type Answer, type AppData } from "../store/data";
import { addDays, mondayOf } from "../store/dates";

export { POINTS_MAX };
/** Punkte, ab denen ein Ton fürs Freischalten sitzt */
export const POINTS_UNLOCK = 8;
/** Punkte für eine richtige bzw. Abzug für eine falsche Antwort */
export const POINTS_RIGHT = 1;
export const POINTS_WRONG = 2;
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

/** Neue Sicherheit nach einer Antwort: richtig +1, falsch −2, zwischen 0 und POINTS_MAX. */
export function stepPoints(points: number, ok: boolean): number {
  return Math.max(0, Math.min(POINTS_MAX, points + (ok ? POINTS_RIGHT : -POINTS_WRONG)));
}

/** Sicherheit aus gespeicherten Antworten nachrechnen (ab 0, nur Antworten ab countFrom). */
export function pointsFromHistory(list: Answer[] | undefined, countFrom: number): number {
  return (list ?? []).filter((a) => a[2] >= countFrom).reduce((p, a) => stepPoints(p, a[0] === 1), 0);
}

/**
 * Sicherheit eines Tons in einer Spur (0–10). Gespeichert und nach jeder gewerteten Antwort fortgeschrieben;
 * fehlt der Wert, wird er aus den Antworten nachgerechnet.
 */
export function notePoints(data: AppData, track: Track, note: string): number {
  return data.points?.[track]?.[note] ?? pointsFromHistory(data.history[track][note], data.countFrom[track]);
}

/** So viele richtige Antworten (ohne Fehler) fehlen dem Ton noch, bis er sitzt. */
export function pointsMissing(data: AppData, track: Track, note: string): number {
  return Math.max(0, POINTS_UNLOCK - notePoints(data, track, note));
}

/** Zählung fürs Freischalten neu beginnen (nach dem Senken einer Stufe): alle Töne der Spur wieder bei 0. */
export function resetCount(data: AppData, track: Track, now: number): void {
  data.countFrom[track] = now;
  data.points ??= { lesen: {}, spielen: {} };
  data.points[track] = {};
}

/** Gewertete Antwort festhalten: letzte 20 je Ton und Spur, Sicherheit fortschreiben, Übungstag merken. */
export function recordAnswer(data: AppData, track: Track, note: string, ok: boolean, now: number, today: string): void {
  const before = notePoints(data, track, note);
  data.points ??= { lesen: {}, spielen: {} };
  (data.points[track] ??= {})[note] = stepPoints(before, ok);
  const list = (data.history[track][note] ??= []);
  list.push([ok ? 1 : 0, today, now]);
  if (list.length > HISTORY_LEN) list.splice(0, list.length - HISTORY_LEN);
  if (!data.days.includes(today)) {
    data.days.push(today);
    data.days.sort();
  }
}

/**
 * Sitzt ein Ton fürs Freischalten? Mindestens POINTS_UNLOCK Punkte Sicherheit. Bis 15.11.2026 galten
 * „mindestens 10 der letzten 20 Antworten, davon 90 % richtig“ – dort kostete ein Fehler je nach seiner
 * Lage in den letzten 20 nichts oder bis zu 18 weitere richtige Antworten. Jetzt höchstens zwei.
 * Keine Bedingung an die Zahl der Tage: Wer an einem Tag viel übt, soll weiterkommen.
 * Dass die Töne auch am nächsten Tag sitzen, prüfen die fälligen Karten (Leitner).
 */
export function noteMastered(data: AppData, track: Track, note: string): boolean {
  return notePoints(data, track, note) >= POINTS_UNLOCK;
}

export function level(data: AppData, track: Track): number {
  return levelOf(track, data.stages[track]);
}

/** Höchste erlaubte Stufe einer Spur (Spielen höchstens so hoch wie Lesen). */
export function levelCap(data: AppData, track: Track): number {
  if (track === "lesen") return maxLevel("lesen");
  return Math.min(maxLevel("spielen"), level(data, "lesen"));
}

/** Stufe des Startpunkts (ohne Wahl: 1), höchstens die aktuelle Stufe. */
export function startLevel(data: AppData, track: Track): number {
  return Math.min(data.start ? levelOf(track, data.start[track]) : 1, level(data, track));
}

/** Töne, die fürs Freischalten zählen: die freigeschalteten ab dem Startpunkt (davor gelten sie als bekannt). */
export function countedNotes(data: AppData, track: Track): string[] {
  return unlockedNotes(track, level(data, track)).slice(unlockedNotes(track, startLevel(data, track) - 1).length);
}

export function readyForNext(data: AppData, track: Track): boolean {
  const lv = level(data, track);
  if (lv >= levelCap(data, track)) return false;
  return countedNotes(data, track).every((n) => noteMastered(data, track, n));
}

/**
 * Töne, die gerade das Freischalten der nächsten Stufe aufhalten (zählen fürs Freischalten, sitzen
 * noch nicht). Leer, wenn die Spur an ihrer Grenze steht. Sie kommen wie schwache Töne häufiger dran,
 * damit ein einzelner fehlender Ton nicht viele Sitzungen braucht.
 */
export function blockingNotes(data: AppData, track: Track): string[] {
  if (level(data, track) >= levelCap(data, track)) return [];
  return countedNotes(data, track).filter((n) => !noteMastered(data, track, n));
}

/**
 * Gewicht eines Tons in Zusatzkarten und Tonfolgen: 1, schwach +2, aufhaltend +2. Ein Ton, der beides ist,
 * kommt also fünffach – so bleibt ein schwacher Ton vorn, auch wenn (etwa auf Stufe 1 oder nach dem
 * Senken einer Stufe) alle Töne aufhalten.
 */
export function noteWeight(data: AppData, track: Track): (note: string) => number {
  const blocking = new Set(blockingNotes(data, track));
  const cache = new Map<string, number>();
  return (n) => {
    let w = cache.get(n);
    if (w === undefined) {
      w = 1 + (blocking.has(n) ? 2 : 0) + (isWeak(noteAccuracy(data, track, n)) ? 2 : 0);
      cache.set(n, w);
    }
    return w;
  };
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

/** Senken unter den Startpunkt zieht ihn mit (sonst zählte nach dem Wiederaufstieg nur die oberste Stufe). */
function clampStart(data: AppData, track: Track): void {
  if (data.start) data.start[track] = stageId(track, startLevel(data, track));
}

/** Stufe von Hand setzen. Senken: Zählung für das Freischalten beginnt neu. */
export function setLevel(data: AppData, track: Track, target: number, now: number): void {
  const cap = track === "lesen" ? maxLevel("lesen") : levelCap(data, "spielen");
  const lv = Math.max(1, Math.min(target, cap));
  const before = level(data, track);
  data.stages[track] = stageId(track, lv);
  if (lv < before) {
    resetCount(data, track, now);
    clampStart(data, track);
  }
  if (track === "lesen") {
    const sp = level(data, "spielen");
    const spCap = Math.min(maxLevel("spielen"), lv);
    if (sp > spCap) {
      data.stages.spielen = stageId("spielen", spCap);
      resetCount(data, "spielen", now);
      clampStart(data, "spielen");
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
