// Zeitplan eines Lieds fürs Vorspielen: Wiederholungen ausgeschrieben (mit 1./2. Klammer),
// Haltebögen zu einem Ton zusammengefasst (auch über Taktstriche), Pausen ohne Ton.
// Bindebögen bleiben einzelne Töne, aber mit slurToNext: Der Abspieler bindet sie legato.
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
  /**
   * Bindebogen zum nächsten Ton im Zeitplan: Er schließt ohne Lücke an und ist auch im Notenbild der
   * Nachfolger (nicht an einer Sprungstelle der Wiederholung), kein Atemzeichen dazwischen. Der
   * Abspieler setzt dann nicht neu an, nur die Tonhöhe wechselt (bei gleicher Höhe trennt er kurz).
   * Fehlt das Feld, ist der Ton nicht gebunden.
   */
  slurToNext?: boolean;
}
/** Ein Takt im Zeitplan (Wiederholungen ausgeschrieben, also in Spielreihenfolge). */
export interface TimelineBar {
  index: number; // Index des Takts im Notenbild
  start: number; // Beginn in Vierteln
  dur: number; // tatsächliche Länge in Vierteln (Auftakt kann kürzer sein)
  beats: number[]; // Zählzeiten (für Metronom-Klicks) in Vierteln relativ zum Taktbeginn,
  // z. B. 3/4 → [0,1,2]; 6/8 → [0,1.5]; 2/2 → [0,2]
  pickup?: boolean; // Auftakt: die erste Zählzeit darin ist nicht die betonte Eins
}
export interface Timeline {
  tones: Tone[];
  bars: TimelineBar[];
  total: number; // Gesamtlänge in Vierteln
  countIn: number[]; // Klicks des Einzählens in Vierteln: ein voller Takt in der Taktart des ersten
  // Takts, z. B. 6/8 → [0,1.5]. Beginnt der Zeitplan mit einem Auftakt, folgen die Zählzeiten des
  // Auftakt-Takts vor dessen erster Note, damit der Auftakt auf seine Zählzeit fällt (3/4 mit
  // Viertel-Auftakt: 1 2 3 1 2, Auftakt auf 3). Jeder countInBeats-te Klick ist eine betonte Eins.
  countInDur: number; // Länge des Einzählens in Vierteln (bis zum Beginn des Zeitplans)
  countInBeats: number; // Zählzeiten je Takt beim Einzählen (z. B. 3/4 → 3, 6/8 → 2)
}

const EPS = 1e-6;

/** Durchgänge, in denen ein Takt einer Klammer gespielt wird (ABC: voltaNumbers, Heft: 1. oder 2.); sonst null. */
function voltaPasses(b: Bar): number[] | null {
  if (b.voltaNumbers?.length) return b.voltaNumbers;
  return b.volta ? [b.volta] : null;
}

/** Zahl der Durchgänge eines Abschnitts, der mit dem :| in Takt i endet: höchste Klammernummer, mindestens 2. */
function sectionPasses(bars: Bar[], i: number): number {
  if (!voltaPasses(bars[i])) return 2;
  let a = i;
  let b = i;
  while (a > 0 && voltaPasses(bars[a - 1])) a--;
  while (b < bars.length - 1 && voltaPasses(bars[b + 1])) b++;
  let n = 2;
  for (let k = a; k <= b; k++) n = Math.max(n, ...voltaPasses(bars[k])!);
  return n;
}

/**
 * Takte in Spielreihenfolge (Indizes in song.bars). Ein :| springt zurück zum letzten |:
 * (ohne |: zum Liedanfang bzw. zum Takt nach der vorigen Wiederholung). Klammern werden nur im
 * passenden Durchgang gespielt: Heft 1./2. Klammer, ABC auch 3. Klammer oder „1.–2.“ (dann wird so
 * oft wiederholt, wie die höchste Klammernummer sagt). Nach der letzten Klammer ist der Abschnitt fertig.
 */
export function playOrder(song: Song): number[] {
  const bars = song.bars;
  const order: number[] = [];
  let start = 0; // Ziel des nächsten Rücksprungs
  let pass = 1; // Durchgang durch den aktuellen Abschnitt
  let inEndings = false; // in diesem Durchgang schon bei den Klammern angekommen
  let i = 0;
  while (i < bars.length && order.length < 100000) {
    const b = bars[i];
    const nums = voltaPasses(b);
    if (!nums && inEndings) {
      // die Klammern liegen hinter uns: Abschnitt fertig
      pass = 1;
      start = i;
      inEndings = false;
    }
    if (b.repeatStart && pass === 1) start = i;
    if (nums) {
      inEndings = true;
      if (!nums.includes(pass)) {
        i++;
        continue;
      }
    }
    order.push(i);
    if (b.barline === "repeatEnd") {
      inEndings = false;
      if (pass < sectionPasses(bars, i)) {
        pass++;
        i = start;
        continue;
      }
      pass = 1;
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

/**
 * Bindebögen im Notenbild: Kennung einer Note → Kennung der im Notenbild folgenden Note, falls ein
 * Bindebogen von der einen zur anderen reicht (auch über den Taktstrich).
 */
function slurSuccessors(song: Song): Map<number, number> {
  const next = new Map<number, number>();
  let inSlur = false;
  song.notes.forEach((n, i) => {
    if (n.slurStart) inSlur = true;
    if (n.slurEnd) inSlur = false;
    if (inSlur && i + 1 < song.notes.length) next.set(n.id, song.notes[i + 1].id);
  });
  return next;
}

/** Zeitplan aus einer Folge von Takt-Indizes (in Spielreihenfolge). */
export function timelineOfBars(song: Song, order: number[]): Timeline {
  const tones: Tone[] = [];
  const bars: TimelineBar[] = [];
  const slurNext = slurSuccessors(song);
  let t = 0;
  let open: Tone | null = null; // Ton, dessen letzte Note einen Haltebogen hat
  let openMidi = -1;
  let prev: Tone | null = null; // zuletzt angefangener Ton (für den Bindebogen zum nächsten)
  for (const idx of order) {
    const bar = song.bars[idx];
    bars.push({ index: idx, start: t, dur: bar.length, beats: barBeats(bar), pickup: bar.pickup });
    for (const e of bar.events) {
      const start = t + e.offset;
      if (e.kind === "rest") {
        open = null;
        prev = null;
        continue;
      }
      if (open && openMidi === e.pitch.midi && Math.abs(open.start + open.dur - start) < EPS) {
        open.dur += e.q;
        open.ids.push(e.id);
        open.breathAfter = e.breath;
      } else {
        open = { start, dur: e.q, midi: e.pitch.midi, ids: [e.id], bar: idx, breathAfter: e.breath };
        // Bindebogen vom vorigen Ton hierher: nur, wenn diese Note im Notenbild wirklich folgt (nach
        // einem Rücksprung der Wiederholung ist das nicht so) und der Ton lückenlos anschließt
        if (
          prev &&
          !prev.breathAfter &&
          slurNext.get(prev.ids[prev.ids.length - 1]) === e.id &&
          Math.abs(prev.start + prev.dur - start) < EPS
        ) {
          prev.slurToNext = true;
        }
        tones.push(open);
        prev = open;
      }
      openMidi = e.pitch.midi;
      if (!e.tie) open = null;
    }
    t += bar.length;
  }
  const first = order.length ? song.bars[order[0]] : song.bars[0];
  const beats = beatsOf(first.time);
  const barDur = barQuarters(first.time);
  let countIn = beats;
  let countInDur = barDur;
  if (first.pickup) {
    // Auftakt: ein voller Takt, dann weiterzählen bis zur ersten Note, sonst stimmt der Takt nicht
    const shift = first.nominal - first.length;
    countIn = [...beats, ...beats.filter((b) => b < shift - EPS).map((b) => b + barDur)];
    countInDur = barDur + shift;
  }
  return {
    tones,
    bars,
    total: t,
    countIn,
    countInDur,
    countInBeats: beats.length,
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

/**
 * Zeitplan ab einem Takt bis zum Liedende, Start bei 0 („ab hier“ beim Anhören). bar ist der Index im
 * Notenbild; es gilt sein erstes Vorkommen in Spielreihenfolge (Wiederholungen danach werden wie sonst
 * ausgeschrieben). Kommt der Takt in der Spielreihenfolge nicht vor, beginnt der Zeitplan beim nächsten
 * Takt, der vorkommt. Eingezählt wird in der Taktart dieses Takts.
 */
export function fromBarTimeline(song: Song, bar: number): Timeline {
  const n = song.bars.length;
  const b = Math.max(0, Math.min(n - 1, Math.round(bar)));
  const order = playOrder(song);
  let i0 = order.indexOf(b);
  if (i0 < 0) i0 = order.findIndex((i) => i >= b);
  return timelineOfBars(song, i0 < 0 ? order : order.slice(i0));
}
