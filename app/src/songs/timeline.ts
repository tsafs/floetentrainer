// Zeitplan eines Lieds fürs Vorspielen: Wiederholungen ausgeschrieben (mit 1./2. Klammer),
// Haltebögen zu einem Ton zusammengefasst (auch über Taktstriche), Pausen ohne Ton.
// Zeiten in Vierteln; der Abspieler rechnet sie mit secPerQuarter (./tempo.ts) in Sekunden um.

import type { Bar, Song } from "./model";
import { barQuarters, beatsOf } from "./parse";

/** Ein klingender Ton im Zeitplan. Zeiten in Vierteln (1 = eine Viertelnote) ab Beginn des Zeitplans. */
export interface Tone {
  start: number; // Beginn in Vierteln
  dur: number; // Dauer in Vierteln (Haltebögen bereits zusammengefasst)
  midi: number; // NOTIERTE Tonhöhe, c' (c¹) = 60. Die Flöte klingt eine Oktave höher.
  ids: number[]; // Kennungen der Noten im Notenbild (bei Haltebogen mehrere), für die Markierung
  bar: number; // Index des Takts im Notenbild (0-basiert), in dem der Ton beginnt
  breathAfter: boolean; // Atemzeichen nach diesem Ton
}
/** Ein Takt im Zeitplan (Wiederholungen ausgeschrieben, also in Spielreihenfolge). */
export interface TimelineBar {
  index: number; // Index des Takts im Notenbild
  start: number; // Beginn in Vierteln
  dur: number; // tatsächliche Länge in Vierteln (Auftakt kann kürzer sein)
  beats: number[]; // Zählzeiten (für Metronom-Klicks) in Vierteln relativ zum Taktbeginn,
  // z. B. 3/4 → [0,1,2]; 6/8 → [0,1.5]; 2/2 → [0,2]
}
export interface Timeline {
  tones: Tone[];
  bars: TimelineBar[];
  total: number; // Gesamtlänge in Vierteln
  countIn: number[]; // Zählzeiten eines vollen Einzähltakts in Vierteln (Taktart des ersten Takts),
  // erster Eintrag ist die betonte Eins; z. B. 6/8 → [0,1.5], Länge = countInDur
  countInDur: number; // Länge des Einzähltakts in Vierteln
}

const EPS = 1e-6;

/**
 * Takte in Spielreihenfolge (Indizes in song.bars). Ein :| springt einmal zurück zum letzten |:
 * (ohne |: zum Liedanfang bzw. zum Takt nach der vorigen Wiederholung). Beim zweiten Durchgang
 * wird die 1. Klammer übersprungen und mit der 2. Klammer weitergespielt.
 */
export function playOrder(song: Song): number[] {
  const bars = song.bars;
  const order: number[] = [];
  let start = 0;
  let second = false;
  let i = 0;
  while (i < bars.length) {
    const b = bars[i];
    if (b.repeatStart && !second) start = i;
    if (second && b.volta === 1) {
      if (b.barline === "repeatEnd") {
        second = false;
        start = i + 1;
      }
      i++;
      continue;
    }
    order.push(i);
    if (b.barline === "repeatEnd") {
      if (!second) {
        second = true;
        i = start;
        continue;
      }
      second = false;
      start = i + 1;
    }
    i++;
  }
  return order;
}

/** Zählzeiten eines Takts relativ zu seinem Beginn; beim Auftakt nur die, die in ihn fallen. */
export function barBeats(bar: Bar): number[] {
  const full = beatsOf(bar.time);
  if (bar.pickup) {
    const shift = bar.nominal - bar.length;
    return full.filter((b) => b >= shift - EPS).map((b) => b - shift);
  }
  return full.filter((b) => b < bar.length - EPS);
}

/** Zeitplan aus einer Folge von Takt-Indizes (in Spielreihenfolge). */
export function timelineOfBars(song: Song, order: number[]): Timeline {
  const tones: Tone[] = [];
  const bars: TimelineBar[] = [];
  let t = 0;
  let open: Tone | null = null; // Ton, dessen letzte Note einen Haltebogen hat
  let openMidi = -1;
  for (const idx of order) {
    const bar = song.bars[idx];
    bars.push({ index: idx, start: t, dur: bar.length, beats: barBeats(bar) });
    for (const e of bar.events) {
      const start = t + e.offset;
      if (e.kind === "rest") {
        open = null;
        continue;
      }
      if (open && openMidi === e.pitch.midi && Math.abs(open.start + open.dur - start) < EPS) {
        open.dur += e.q;
        open.ids.push(e.id);
        open.breathAfter = e.breath;
      } else {
        open = { start, dur: e.q, midi: e.pitch.midi, ids: [e.id], bar: idx, breathAfter: e.breath };
        tones.push(open);
      }
      openMidi = e.pitch.midi;
      if (!e.tie) open = null;
    }
    t += bar.length;
  }
  const first = order.length ? song.bars[order[0]] : song.bars[0];
  return {
    tones,
    bars,
    total: t,
    countIn: beatsOf(first.time),
    countInDur: barQuarters(first.time),
  };
}

/** Zeitplan des ganzen Lieds */
export function buildTimeline(song: Song): Timeline {
  return timelineOfBars(song, playOrder(song));
}

/**
 * Zeitplan eines Abschnitts zum Wiederholen, Start bei 0. fromBar und toBar sind Takt-Indizes im
 * Notenbild (beide eingeschlossen; steht der Endtakt vor dem Anfangstakt, werden sie vertauscht).
 * Bei Wiederholungen gilt: ab dem ersten Vorkommen des Anfangstakts in Spielreihenfolge bis zum
 * nächsten Vorkommen des Endtakts danach. Ein Abschnitt über ein :| enthält also den Rücksprung,
 * die 1. Klammer zählt mit, wenn sie im Bereich liegt. Kommt der Endtakt danach nicht mehr vor,
 * reicht der Abschnitt bis zum Liedende. Ein Haltebogen über das Abschnittsende hinaus wird
 * abgeschnitten. Eingezählt wird in der Taktart des Anfangstakts.
 */
export function sectionTimeline(song: Song, fromBar: number, toBar: number): Timeline {
  const n = song.bars.length;
  let a = Math.max(0, Math.min(n - 1, Math.round(fromBar)));
  let b = Math.max(0, Math.min(n - 1, Math.round(toBar)));
  if (b < a) [a, b] = [b, a];
  const order = playOrder(song);
  const i0 = order.indexOf(a);
  if (i0 < 0) return timelineOfBars(song, Array.from({ length: b - a + 1 }, (_, k) => a + k));
  let i1 = order.indexOf(b, i0);
  if (i1 < 0) i1 = order.length - 1;
  return timelineOfBars(song, order.slice(i0, i1 + 1));
}
