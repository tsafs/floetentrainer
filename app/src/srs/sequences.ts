// Tonfolgen: mehrere Töne hintereinander lesen bzw. spielen (docs/app-tonfolgen.md).
// Rein rechnerisch: Auswahl der Töne, Erzeugen einer melodischen Folge, Länge innerhalb der Sitzung,
// Antwortknöpfe fürs Lesen. Zufall nur über das übergebene rng.

import { isAltSpelling, levelOf, stageIndexOfNote, unlockedNotes, type Track } from "../music/levels";
import { ALL_NOTES, note, type Note } from "../music/notes";
import type { AppData } from "../store/data";
import { confusability, isOctaveTwin, type Rng } from "./choices";

/** Ab so vielen vorgestellten Tönen einer Spur gibt es Tonfolgen. */
export const FOLGE_MIN_NOTES = 5;
/** Kürzeste Folge */
export const FOLGE_MIN_LEN = 2;
/** Größter Sprung in Halbtönen (Quinte) */
export const FOLGE_MAX_LEAP = 7;
/** So viele Antwortknöpfe beim Lesen (höchstens) */
export const FOLGE_CHOICES = 8;
/** … davon mindestens so viele, die nicht in der Folge vorkommen */
export const FOLGE_DECOYS = 2;

/** Längste Folge: 5, ab Stufe 8 der Spur 6. */
export function folgeMaxLen(level: number): number {
  return level >= 8 ? 6 : 5;
}

/**
 * Töne für Tonfolgen in einer Spur: freigeschaltet *und* in dieser Spur schon vorgestellt, ohne andere
 * Schreibweisen (Stufe 12), nach Tonhöhe geordnet. Weniger als FOLGE_MIN_NOTES → leer (keine Folgen).
 */
export function folgePool(data: AppData, track: Track): string[] {
  const unlocked = new Set(unlockedNotes(track, levelOf(track, data.stages[track])));
  const ids = data.introduced[track].filter((n) => unlocked.has(n) && !isAltSpelling(n));
  const pool = [...new Set(ids)].sort((a, b) => note(a).midi - note(b).midi);
  return pool.length >= FOLGE_MIN_NOTES ? pool : [];
}

/** Gewicht für den Schritt von a nach b (beide im Pool, Indizes in der Tonhöhen-Reihe). */
function stepWeight(pool: Note[], i: number, j: number): number {
  const a = pool[i];
  const b = pool[j];
  const semis = Math.abs(a.midi - b.midi);
  if (semis > FOLGE_MAX_LEAP) return 0;
  const d = Math.abs(i - j);
  // Nachbar in der Reihe meist, Terz (zwei Plätze) oft, größere Sprünge selten
  let w = d === 1 ? 6 : d === 2 ? 2.5 : 0.6;
  // Halbtonschritte sind schwere Griffwechsel: bevorzugen
  if (semis === 1) w *= 2;
  return w;
}

function pickWeighted<T>(items: T[], weight: (t: T) => number, rng: Rng): T | null {
  const total = items.reduce((s, t) => s + weight(t), 0);
  if (total <= 0) return null;
  let x = rng() * total;
  for (const t of items) {
    x -= weight(t);
    if (x < 0) return t;
  }
  return items[items.length - 1];
}

export interface FolgeOptions {
  /** schwache Töne (dreifach gewichtet) */
  weak?: Set<string>;
  /** Gewicht je Ton (ersetzt weak, z. B. noteWeight aus progress.ts) */
  weight?: (id: string) => number;
  /** mit diesem Ton nicht beginnen (Ton der Karte davor) */
  avoidFirst?: string | null;
  /** schon benutzte Folgen (Schlüssel von folgeKey): nicht noch einmal */
  used?: Set<string>;
  /** möglichst nicht mit diesen Tönen enden (gleich fällige Wiederholung beginnt damit) */
  avoidLast?: string[];
}

export function folgeKey(notes: string[]): string {
  return notes.join(" ");
}

/** Eine Folge erzeugen (ohne Rücksicht auf schon benutzte). */
function makeOne(pool: Note[], len: number, rng: Rng, opt: FolgeOptions): string[] {
  const weak = opt.weak ?? new Set<string>();
  const wNote = (n: Note) => (opt.weight ? opt.weight(n.id) : weak.has(n.id) ? 3 : 1);
  const idx = pool.map((_, i) => i);
  const startFrom = idx.filter((i) => pool[i].id !== opt.avoidFirst);
  let cur = pickWeighted(startFrom.length ? startFrom : idx, (i) => wNote(pool[i]), rng)!;
  const out = [cur];
  // Nie derselbe Ton zweimal direkt hintereinander (zu leicht); später in der Folge darf er wiederkommen.
  while (out.length < len) {
    const next = pickWeighted(
      idx.filter((j) => j !== cur),
      (j) => stepWeight(pool, cur, j) * wNote(pool[j]),
      rng,
    );
    if (next === null) break;
    cur = next;
    out.push(cur);
  }
  return out.map((i) => pool[i].id);
}

/**
 * Melodische Folge aus dem Pool (folgePool): meist Nachbarn in der Tonhöhen-Reihe, oft eine Terz, selten
 * ein größerer Sprung (höchstens eine Quinte), Halbtonschritte bevorzugt, schwache Töne dreifach. Nie
 * derselbe Ton zweimal direkt hintereinander (wohl aber später wieder: d¹ g¹ d¹). Möglichst keine schon benutzte
 * Folge (opt.used); gelingt das nicht, trotzdem eine.
 */
export function makeFolge(poolIds: string[], len: number, rng: Rng, opt: FolgeOptions = {}): string[] {
  const pool = poolIds.map(note).sort((a, b) => a.midi - b.midi);
  let f: string[] = [];
  let fallback: string[] | null = null;
  for (let k = 0; k < 30; k++) {
    f = makeOne(pool, len, rng, opt);
    if (opt.used?.has(folgeKey(f))) continue;
    if (!opt.avoidLast?.includes(f[f.length - 1])) return f;
    fallback ??= f;
  }
  return fallback ?? f;
}

/**
 * Länge der Folgen innerhalb einer Sitzung (wird nicht gespeichert): Beginn mit 3 (bei genau 5 Tönen 2
 * oder 3), nach zwei fehlerfreien Folgen in Reihe +1, nach einer fehlerhaften −1; 2 bis folgeMaxLen.
 */
export class FolgeLength {
  len: number;
  private streak = 0;

  constructor(
    poolSize: number,
    readonly max: number,
    rng: Rng,
  ) {
    this.len = poolSize <= FOLGE_MIN_NOTES ? (rng() < 0.5 ? 2 : 3) : 3;
    this.len = Math.min(this.len, max);
  }

  /** Stand merken (für „Vertippt“) … */
  snapshot(): { len: number; streak: number } {
    return { len: this.len, streak: this.streak };
  }

  /** … und wiederherstellen */
  restore(st: { len: number; streak: number }): void {
    this.len = st.len;
    this.streak = st.streak;
  }

  /** Ergebnis einer gewerteten Folge */
  update(ok: boolean): void {
    if (ok) {
      this.streak++;
      if (this.streak >= 2) {
        this.len = Math.min(this.max, this.len + 1);
        this.streak = 0;
      }
    } else {
      this.streak = 0;
      this.len = Math.max(FOLGE_MIN_LEN, this.len - 1);
    }
  }
}

/** Nie zwei Töne mit demselben Griff oder derselben Tonhöhe nebeneinander als Knöpfe. */
function compatible(c: Note, chosen: Note[]): boolean {
  return chosen.every((x) => x.fingering !== c.fingering && x.midi !== c.midi);
}

/**
 * Antwortknöpfe fürs Lesen einer Folge, nach Tonhöhe: alle verschiedenen Töne der Folge plus
 * verwechselbare dazu, insgesamt bis zu 8 (gibt es weniger freigeschaltete Töne, entsprechend weniger),
 * mindestens 2 nicht aus der Folge. Reichen die freigeschalteten dafür nicht, kommen Töne aus späteren
 * Stufen dazu (wie bei makeChoices). Keine anderen Schreibweisen.
 */
export function folgeChoices(notes: string[], unlocked: string[], rng: Rng): string[] {
  const distinct = [...new Set(notes)].map(note);
  // kein Ton der Folge in anderer Oktave als falsche Möglichkeit (d¹ in der Folge → kein d² dazu)
  const usable = (n: Note) => !isAltSpelling(n.id) && !distinct.some((d) => d.id === n.id || isOctaveTwin(d, n));
  const unlockedSet = new Set(unlocked.filter((n) => !isAltSpelling(n)));
  const want = Math.min(FOLGE_CHOICES, Math.max(unlockedSet.size, distinct.length + FOLGE_DECOYS));
  const score = (c: Note) => Math.max(...distinct.map((t) => confusability(t, c, "name"))) + rng() * 1.5;
  const ranked = (list: Note[]) =>
    list
      .map((n) => ({ n, s: score(n) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.n);
  const chosen: Note[] = distinct.slice();
  const take = (list: Note[], limit: number) => {
    for (const c of list) {
      if (chosen.length >= limit) break;
      if (compatible(c, chosen)) chosen.push(c);
    }
  };
  take(ranked(ALL_NOTES.filter((n) => usable(n) && unlockedSet.has(n.id))), want);
  if (chosen.length < distinct.length + FOLGE_DECOYS) {
    const later = ALL_NOTES.filter((n) => usable(n) && !unlockedSet.has(n.id));
    const stages = [...new Set(later.map((n) => stageIndexOfNote(n.id)))].sort((a, b) => a - b);
    for (const s of stages) {
      take(
        ranked(later.filter((n) => stageIndexOfNote(n.id) === s)),
        distinct.length + FOLGE_DECOYS,
      );
      if (chosen.length >= distinct.length + FOLGE_DECOYS) break;
    }
  }
  return chosen.map((n) => n.id).sort((a, b) => note(a).midi - note(b).midi || note(a).pos - note(b).pos);
}
