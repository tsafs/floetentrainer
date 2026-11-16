// Stand eines einzelnen Tons für Startseite (Karte unter der Tonleiter) und Tonseite: Zustand, Punkte,
// was bis zur nächsten Stufe fehlt, Fälligkeit, Lieder.

import { isAltSpelling, kindsForNote, maxLevel, stageIndexOfNote, stagesOf, unlockedNotes, type Track } from "../music/levels";
import { nameHtml } from "../music/names";
import { note } from "../music/notes";
import { dueDay, isDue } from "../srs/leitner";
import {
  blockingNotes,
  isWeak,
  level,
  levelCap,
  noteAccuracy,
  noteMastered,
  notePoints,
  POINTS_MAX,
  POINTS_UNLOCK,
  pointsMissing,
  startLevel,
} from "../srs/progress";
import { playability, songMidis } from "../songs/playable";
import { SONGS } from "../songs/library";
import { daysBetween } from "../store/dates";
import { cardKey, type AppData } from "../store/data";

export type NoteState = "learned" | "weak" | "next" | "wait";

/** Ist der Ton in der Spur freigeschaltet? */
export function hasNote(data: AppData, track: Track, id: string): boolean {
  if (track === "spielen" && isAltSpelling(id)) return false;
  return stageIndexOfNote(id) <= level(data, track);
}

/** Schwach (rot) wie auf der Fortschrittsseite bisher: schwache Trefferquote und noch nicht sitzend */
export function isWeakNote(data: AppData, track: Track, id: string): boolean {
  return isWeak(noteAccuracy(data, track, id)) && !noteMastered(data, track, id);
}

/** Zustand eines Tons in der Lesen-Spur (Farbe auf der Tonleiter) */
export function noteState(data: AppData, id: string): NoteState {
  if (hasNote(data, "lesen", id)) return isWeakNote(data, "lesen", id) ? "weak" : "learned";
  return stageIndexOfNote(id) === level(data, "lesen") + 1 ? "next" : "wait";
}

/** Gilt der Ton als bekannt, weil er vor dem gewählten Startpunkt liegt? */
function beforeStart(data: AppData, track: Track, id: string): boolean {
  return stageIndexOfNote(id) < startLevel(data, track);
}

/**
 * Eine Zeile „Lesen ▬▬▬|▬ 6 von 10“ (Strich bei 8 = sitzt). Ohne Antworten: „gilt als bekannt“ (vor dem
 * Startpunkt) bzw. „noch nicht geübt“.
 */
export function pointsRow(data: AppData, track: Track, id: string): string {
  const label = track === "lesen" ? "Lesen" : "Spielen";
  if (!hasNote(data, track, id)) {
    const why = track === "spielen" && isAltSpelling(id) ? "nur beim Lesen" : `ab Stufe ${stageIndexOfNote(id)}`;
    return `<i>${label}</i><span class="none">${why}</span>`;
  }
  const p = notePoints(data, track, id);
  const answered = noteAccuracy(data, track, id).n > 0;
  if (!answered && p === 0) {
    return `<i>${label}</i><span class="none">${beforeStart(data, track, id) ? "gilt als bekannt" : "noch nicht geübt"}</span>`;
  }
  const cls = track === "spielen" ? "play" : isWeakNote(data, track, id) ? "weak" : "";
  return (
    `<i>${label}</i><span class="pbar ${cls}" style="--tick:${(POINTS_UNLOCK / POINTS_MAX) * 100}%"><b style="width:${(p / POINTS_MAX) * 100}%"></b></span>` +
    `<em data-testid="pts-${track}">${p} von ${POINTS_MAX}</em>`
  );
}

const WORDS = ["", "einer", "zwei", "drei", "vier", "fünf", "sechs", "sieben", "acht", "neun", "zehn", "elf"];

/** Was bis zur nächsten Lesen-Stufe fehlt: „e¹ 3 richtige, f¹ 6 richtige“ (HTML) oder null, wenn alle sitzen */
export function missingForNext(data: AppData, track: Track = "lesen"): string | null {
  const list = blockingNotes(data, track);
  if (!list.length) return null;
  return joinParts(list.map((n) => `${nameHtml(n)} ${pointsMissing(data, track, n)} richtige`));
}

export function joinParts(parts: string[]): string {
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} und ${parts[parts.length - 1]}` : parts[0];
}

/** Satz für einen noch nicht freigeschalteten Ton (Lesen) */
export function waitingText(data: AppData, id: string): string {
  const st = stageIndexOfNote(id);
  const lv = level(data, "lesen");
  const only = isAltSpelling(id) ? " Nur beim Lesen." : "";
  if (st === lv + 1) {
    const miss = missingForNext(data);
    return miss
      ? `Kommt mit der nächsten Stufe. Dafür noch: <em data-testid="missing">${miss}</em>.${only}`
      : `Kommt mit der nächsten Stufe, sobald du wieder richtig antwortest – alle Töne sitzen.${only}`;
  }
  const gap = st - lv;
  return `Kommt in Stufe ${st}, also in ${WORDS[gap] ?? gap} Stufen.${only}`;
}

/** Spielen steht an der Grenze von Lesen (und könnte sonst weiter) */
export function playWaitsForReading(data: AppData): boolean {
  const lv = level(data, "spielen");
  return lv >= levelCap(data, "spielen") && lv < maxLevel("spielen");
}

/** „heute fällig“, „morgen fällig“, „in 4 Tagen fällig“ – frühester Termin der Karten des Tons in der Spur */
export function dueText(data: AppData, track: Track, id: string, today: string): string | null {
  if (!hasNote(data, track, id)) return null;
  const states = kindsForNote(track, id)
    .map((k) => data.cards[cardKey(id, k)])
    .filter((c) => !!c);
  if (!states.length) return null;
  if (states.some((c) => isDue(c, today, data.sessions + 1))) return "jetzt fällig";
  const next = states.map(dueDay).sort()[0];
  const d = daysBetween(today, next);
  return d <= 1 ? "morgen fällig" : `in ${d} Tagen fällig`;
}

/** Zahl der Heft-Lieder, in denen der Ton (gleiche Höhe) vorkommt */
export function songsWithNote(id: string): number {
  const midi = note(id).midi;
  return SONGS.filter((s) => songMidis(s).includes(midi)).length;
}

/** Zahl der Heft-Lieder, die mit der nächsten Lesen-Stufe dazu spielbar werden */
export function songsWithNextStage(data: AppData): number {
  const lv = level(data, "lesen");
  const next = stagesOf("lesen")[lv];
  if (!next) return 0;
  const now = unlockedNotes("lesen", lv);
  const later = [...now, ...next.notes];
  return SONGS.filter((s) => !playability(s, now).playable && playability(s, later).playable).length;
}

