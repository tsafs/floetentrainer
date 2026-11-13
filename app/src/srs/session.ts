// Ablauf einer Sitzung: Zusammensetzung, Reihenfolge, Wiederholungen nach Fehlern, Wertung.

import type { Kind, Track } from "../music/levels";
import { cardKey, type AppData } from "../store/data";
import { applyAnswer, dueCards, newCards, trackCards, type CardRef } from "./leitner";
import { checkUnlocks, isWeak, noteAccuracy, recordAnswer, type Unlock } from "./progress";
import type { Rng } from "./choices";

export const MAX_NEW = 6;
export const MAX_RETRIES = 2;

export type CardType = "due" | "new" | "extra";

export interface PlanItem extends CardRef {
  type: CardType;
  /** fortlaufende Nummer in der Sitzung */
  uid: number;
}

export type Step =
  | { type: "intro"; note: string; track: Track }
  | { type: "card"; item: PlanItem; retry: boolean };

interface Retry {
  item: PlanItem;
  at: number;
}

export interface SessionResult {
  graded: number;
  correct: number;
  /** Töne mit mindestens einem Fehler, in der Reihenfolge des ersten Fehlers */
  difficult: string[];
  unlocks: Unlock[];
}

/** Neue Karten auswählen: nach Stufen, die Übungsarten reihum (erst alle Note→Name usw.). */
function pickNew(cards: CardRef[], max: number): CardRef[] {
  const order: Kind[] = ["name", "griff", "note", "spiel"];
  const notes: string[] = [];
  for (const c of cards) if (!notes.includes(c.note)) notes.push(c.note);
  const out: CardRef[] = [];
  for (const k of order) {
    for (const n of notes) {
      const c = cards.find((x) => x.note === n && x.kind === k);
      if (c && out.length < max) out.push(c);
    }
  }
  return out;
}

export function weightedPick<T>(items: T[], weight: (t: T) => number, rng: Rng): T {
  const total = items.reduce((s, t) => s + weight(t), 0);
  let x = rng() * total;
  for (const t of items) {
    x -= weight(t);
    if (x < 0) return t;
  }
  return items[items.length - 1];
}

/** Plan einer Sitzung: fällige Karten, dann neue (höchstens 6), dann Zusatzkarten. */
export function buildPlan(data: AppData, track: Track, today: string, sessionNo: number, limit: number, rng: Rng): PlanItem[] {
  let uid = 0;
  const plan: PlanItem[] = [];
  for (const c of dueCards(data, track, today, sessionNo)) {
    if (plan.length >= limit) break;
    plan.push({ ...c, type: "due", uid: uid++ });
  }
  if (plan.length < limit) {
    for (const c of pickNew(newCards(data, track), Math.min(MAX_NEW, limit - plan.length))) {
      plan.push({ ...c, type: "new", uid: uid++ });
    }
  }
  if (plan.length < limit) {
    // Zusatzkarten: bekannte Karten und die neuen dieser Sitzung; schwache Töne dreifach
    const planned = new Set(plan.filter((p) => p.type === "new").map((p) => cardKey(p.note, p.kind)));
    const pool = trackCards(data, track).filter((c) => data.cards[cardKey(c.note, c.kind)] || planned.has(cardKey(c.note, c.kind)));
    const weak = new Set(pool.map((c) => c.note).filter((n) => isWeak(noteAccuracy(data, track, n))));
    while (plan.length < limit && pool.length) {
      const last = plan[plan.length - 1]?.note;
      const options = pool.filter((c) => c.note !== last);
      const from = options.length ? options : pool;
      const c = weightedPick(from, (x) => (weak.has(x.note) ? 3 : 1), rng);
      plan.push({ note: c.note, kind: c.kind, type: "extra", uid: uid++ });
    }
  }
  return plan;
}

export interface SessionOptions {
  track: Track;
  today: string;
  rng: Rng;
  now: () => number;
  /** Grenze in Karten und Millisekunden */
  limitCards: number;
  limitMs: number;
}

export class Session {
  readonly track: Track;
  readonly sessionNo: number;
  readonly plan: PlanItem[];
  readonly total: number;
  private remaining: PlanItem[];
  private retries: Retry[] = [];
  private retryCount = new Map<number, number>();
  private lastNote: string | null = null;
  private shown = 0;
  private startedAt: number;
  private pendingIntro: Step | null = null;
  private introducedNow = new Set<string>();
  current: Step | null = null;
  graded = 0;
  correct = 0;
  difficult: string[] = [];
  unlocks: Unlock[] = [];
  /** Wird aufgerufen, wenn sich gespeicherte Daten geändert haben. */
  onChange: () => void = () => {};

  constructor(
    private data: AppData,
    private opt: SessionOptions,
  ) {
    this.track = opt.track;
    data.sessions += 1;
    this.sessionNo = data.sessions;
    this.plan = buildPlan(data, opt.track, opt.today, this.sessionNo, opt.limitCards, opt.rng);
    this.remaining = this.plan.slice();
    this.total = this.plan.length;
    this.startedAt = opt.now();
  }

  get isNothingDueOrNew(): boolean {
    return this.plan.every((p) => p.type === "extra");
  }

  /** Nummer der aktuellen Karte für „7 von 20“. */
  get position(): number {
    return Math.min(this.graded + 1, this.total);
  }

  private timeUp(): boolean {
    return this.opt.now() - this.startedAt >= this.opt.limitMs;
  }

  /** Ist die Sitzung zu Ende (Kartengrenze, Zeit oder nichts mehr übrig)? */
  isOver(): boolean {
    if (this.graded >= this.total) return true;
    if (this.graded > 0 && this.timeUp()) return true;
    return this.remaining.length === 0 && this.retries.length === 0;
  }

  /** Nächster Schritt oder null, wenn die Sitzung endet. */
  next(): Step | null {
    if (this.pendingIntro) {
      // Nach der Vorstellung kommt die zugehörige Karte
      const s = this.pendingIntro;
      this.pendingIntro = null;
      this.current = s;
      return s;
    }
    if (this.isOver()) {
      this.current = null;
      return null;
    }
    const step = this.pick();
    if (!step) {
      this.current = null;
      return null;
    }
    if (step.type === "card" && !step.retry && step.item.type === "new") {
      const n = step.item.note;
      if (!this.data.introduced[this.track].includes(n) && !this.introducedNow.has(n)) {
        this.introducedNow.add(n);
        this.pendingIntro = step;
        this.current = { type: "intro", note: n, track: this.track };
        return this.current;
      }
    }
    this.current = step;
    return step;
  }

  private pick(): Step | null {
    const last = this.lastNote;
    // Eine Wiederholung nicht vorziehen, wenn danach nur noch Karten desselben Tons übrig wären.
    const blocks = (n: string) => this.remaining.length > 0 && this.remaining.every((p) => p.note === n);
    const ready = this.retries.filter((r) => r.at <= this.shown && r.item.note !== last && !blocks(r.item.note));
    const take = (s: Step) => {
      if (s.type === "card") {
        this.lastNote = s.item.note;
        this.shown += 1;
      }
      return s;
    };
    if (ready.length) {
      const r = ready[0];
      this.retries.splice(this.retries.indexOf(r), 1);
      return take({ type: "card", item: r.item, retry: true });
    }
    let i = this.remaining.findIndex((p) => p.note !== last);
    if (i >= 0) {
      const [item] = this.remaining.splice(i, 1);
      return take({ type: "card", item, retry: false });
    }
    // Hauptliste hat nur noch denselben Ton: eine Wiederholung mit anderem Ton vorziehen
    const other = this.retries.find((r) => r.item.note !== last);
    if (other) {
      this.retries.splice(this.retries.indexOf(other), 1);
      return take({ type: "card", item: other.item, retry: true });
    }
    if (this.remaining.length) {
      let [item] = this.remaining.splice(0, 1);
      if (item.type === "extra") {
        // Zusatzkarte durch eine andere Karte mit anderem Ton ersetzen
        const alt = trackCards(this.data, this.track).filter((c) => c.note !== last && this.data.cards[cardKey(c.note, c.kind)]);
        if (alt.length) {
          const c = alt[Math.floor(this.opt.rng() * alt.length)];
          item = { ...item, note: c.note, kind: c.kind };
        }
      }
      return take({ type: "card", item, retry: false });
    }
    if (this.retries.length) {
      const r = this.retries.shift()!;
      return take({ type: "card", item: r.item, retry: true });
    }
    return null;
  }

  /** Vorstellung abgeschlossen (zählt nicht als Antwort). */
  introDone(note: string): void {
    if (!this.data.introduced[this.track].includes(note)) {
      this.data.introduced[this.track].push(note);
      this.onChange();
    }
  }

  /** Antwort auf die aktuelle Karte. */
  answer(ok: boolean): void {
    const step = this.current;
    if (!step || step.type !== "card") return;
    const { item, retry } = step;
    if (!retry) {
      this.graded += 1;
      if (ok) this.correct += 1;
      const now = this.opt.now();
      recordAnswer(this.data, this.track, item.note, ok, now, this.opt.today);
      if (item.type !== "extra") {
        const key = cardKey(item.note, item.kind);
        this.data.cards[key] = applyAnswer(this.data.cards[key], ok, this.opt.today, this.sessionNo);
      }
      this.unlocks.push(...checkUnlocks(this.data));
      this.onChange();
    }
    if (!ok) {
      if (!this.difficult.includes(item.note)) this.difficult.push(item.note);
      const n = this.retryCount.get(item.uid) ?? 0;
      if (n < MAX_RETRIES) {
        this.retryCount.set(item.uid, n + 1);
        const gap = this.opt.rng() < 0.5 ? 2 : 3;
        this.retries.push({ item, at: this.shown + gap });
      }
    }
  }

  result(): SessionResult {
    return { graded: this.graded, correct: this.correct, difficult: this.difficult, unlocks: this.unlocks };
  }
}

/** Gibt es in einer Spur etwas Fälliges oder Neues? */
export function hasWork(data: AppData, track: Track, today: string): boolean {
  return dueCards(data, track, today, data.sessions + 1).length > 0 || newCards(data, track).length > 0;
}

