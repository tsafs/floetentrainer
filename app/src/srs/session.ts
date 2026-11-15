// Ablauf einer Sitzung: Zusammensetzung, Reihenfolge, Wiederholungen nach Fehlern, Wertung.

import { levelOf, type Kind, type Track } from "../music/levels";
import { cardKey, type Answer, type AppData, type CardState } from "../store/data";
import { applyAnswer, dueCards, newCards, trackCards, type CardRef } from "./leitner";
import { checkUnlocks, noteWeight, recordAnswer, type Unlock } from "./progress";
import type { Rng } from "./choices";
import { FolgeLength, folgeKey, folgeMaxLen, folgePool, makeFolge } from "./sequences";

export const MAX_NEW = 6;
export const MAX_RETRIES = 2;
/** Eine fehlerhafte Tonfolge kommt höchstens so oft noch einmal. */
export const MAX_FOLGE_RETRIES = 1;

export type CardType = "due" | "new" | "extra";

export interface PlanItem extends CardRef {
  type: CardType;
  /** fortlaufende Nummer in der Sitzung */
  uid: number;
  /**
   * Zusatzkarte, die eine Tonfolge wird, wenn es genug vorgestellte Töne gibt (jede zweite Zusatzkarte);
   * sonst bleibt sie die Karte (note, kind).
   */
  folge?: boolean;
}

/** Eine Tonfolge in der Sitzung (keine Leitner-Karte) */
export interface Folge {
  /** Töne der Reihe nach (Kennungen, mit Wiederholungen) */
  notes: string[];
  /** fortlaufende Nummer in der Sitzung (Wiederholung: dieselbe) */
  uid: number;
}

export type Step =
  | { type: "intro"; note: string; track: Track }
  | { type: "card"; item: PlanItem; retry: boolean }
  | { type: "folge"; folge: Folge; track: Track; retry: boolean };

type Retry = { at: number } & ({ item: PlanItem; folge?: undefined } | { folge: Folge; item?: undefined });

const firstOf = (r: Retry) => (r.folge ? r.folge.notes[0] : r.item!.note);

/**
 * Was eine gewertete falsche Antwort verändert hat, damit „Vertippt“ es zurücknehmen kann: Verlauf der
 * falschen Töne, Fach der Karte, Wiederholung, „Schwierig waren“, Länge der Tonfolgen.
 */
interface Undo {
  uid: number;
  history: [string, Answer[] | undefined][];
  card?: { key: string; prev: CardState | undefined };
  difficult: string[];
  folgeLen?: { len: number; streak: number };
  /** Stufen vorher und Zahl der Meldungen: auch eine falsche Antwort kann freischalten (9 von 9 → 9 von 10) */
  stages: AppData["stages"];
  unlocks: number;
  /** Übungstag entfernen, wenn erst diese Antwort ihn eingetragen hat und nichts von ihr gewertet bleibt */
  dropDay: boolean;
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
    // Zusatzkarten: bekannte Karten und die neuen dieser Sitzung; schwache und aufhaltende Töne häufiger (noteWeight)
    const planned = new Set(plan.filter((p) => p.type === "new").map((p) => cardKey(p.note, p.kind)));
    const pool = trackCards(data, track).filter((c) => data.cards[cardKey(c.note, c.kind)] || planned.has(cardKey(c.note, c.kind)));
    const weight = noteWeight(data, track);
    while (plan.length < limit && pool.length) {
      const last = plan[plan.length - 1]?.note;
      const options = pool.filter((c) => c.note !== last);
      const from = options.length ? options : pool;
      const c = weightedPick(from, (x) => weight(x.note), rng);
      plan.push({ note: c.note, kind: c.kind, type: "extra", uid: uid++ });
    }
    // Etwa jede zweite Zusatzkarte wird eine Tonfolge (abwechselnd: die 2., 4., …)
    plan.filter((p) => p.type === "extra").forEach((p, i) => {
      if (i % 2 === 1) p.folge = true;
    });
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

/** Wird dieser Platz im Plan jetzt eine Tonfolge? (leerer Vorrat: zu wenige vorgestellte Töne) */
const isFolgeSlot = (p: PlanItem, pool: string[]) => !!p.folge && pool.length > 0;

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
  /** Länge der Tonfolgen (erst bei der ersten Folge angelegt) */
  private folgeLen: FolgeLength | null = null;
  private usedFolgen = new Set<string>();
  /** letzte gewertete falsche Antwort, solange sie noch zurückgenommen werden kann */
  private undo: Undo | null = null;
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
    this.undo = null;
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

  /** Neue Tonfolge für einen Platz im Plan erzeugen. */
  private makeFolge(p: PlanItem, pool: string[], avoidLast: string[]): Folge {
    const rng = this.opt.rng;
    this.folgeLen ??= new FolgeLength(pool.length, folgeMaxLen(levelOf(this.track, this.data.stages[this.track])), rng);
    const weight = noteWeight(this.data, this.track);
    const notes = makeFolge(pool, this.folgeLen.len, rng, { weight, avoidFirst: this.lastNote, used: this.usedFolgen, avoidLast });
    this.usedFolgen.add(folgeKey(notes));
    return { notes, uid: p.uid };
  }

  private pick(): Step | null {
    const last = this.lastNote;
    const pool = folgePool(this.data, this.track);
    // Eine Tonfolge kann jeden Ton vermeiden (sie beginnt nie mit dem letzten Ton): zählt als „anderer Ton“.
    const noteOf = (p: PlanItem) => (isFolgeSlot(p, pool) ? "" : p.note);
    // Eine Wiederholung nicht vorziehen, wenn danach nur noch Karten desselben Tons übrig wären.
    const blocks = (n: string) => this.remaining.length > 0 && this.remaining.every((p) => noteOf(p) === n);
    const ready = this.retries.filter((r) => r.at <= this.shown && firstOf(r) !== last && !blocks(firstOf(r)));
    const take = (s: Step) => {
      if (s.type === "card") this.lastNote = s.item.note;
      else if (s.type === "folge") this.lastNote = s.folge.notes[s.folge.notes.length - 1];
      this.shown += 1;
      return s;
    };
    const fromRetry = (r: Retry): Step =>
      r.folge ? { type: "folge", folge: r.folge, track: this.track, retry: true } : { type: "card", item: r.item!, retry: true };
    // Möglichst keinen Ton wählen, dessen Wiederholung jetzt oder gleich dran ist –
    // sonst müsste sie wegen „nie zweimal hintereinander“ warten.
    const soon = this.retries.filter((r) => r.at <= this.shown + 1).map(firstOf);
    const fromPlan = (item: PlanItem): Step =>
      isFolgeSlot(item, pool)
        ? { type: "folge", folge: this.makeFolge(item, pool, soon), track: this.track, retry: false }
        : { type: "card", item, retry: false };
    if (ready.length) {
      const r = ready[0];
      this.retries.splice(this.retries.indexOf(r), 1);
      return take(fromRetry(r));
    }
    // Tonfolgen und Zusatzkarten abwechselnd: nach einer Folge möglichst eine Karte, nach einer Karte
    // (im Bereich der Zusatzkarten) möglichst eine Folge – sonst schöbe eine Karte, die gerade nicht
    // passt, die Folgen nach hinten und sie häuften sich am Ende.
    const afterFolge = this.current?.type === "folge";
    const fits = (p: PlanItem) => noteOf(p) !== last && !soon.includes(noteOf(p));
    const inExtras = this.remaining[0]?.type === "extra";
    let i = -1;
    if (afterFolge) i = this.remaining.findIndex((p) => fits(p) && !isFolgeSlot(p, pool));
    else if (inExtras && this.current?.type === "card") i = this.remaining.findIndex((p) => fits(p) && isFolgeSlot(p, pool));
    if (i < 0) i = this.remaining.findIndex(fits);
    if (i < 0) i = this.remaining.findIndex((p) => noteOf(p) !== last);
    if (i >= 0) {
      const [item] = this.remaining.splice(i, 1);
      return take(fromPlan(item));
    }
    // Hauptliste hat nur noch denselben Ton: eine Wiederholung mit anderem Ton vorziehen
    const other = this.retries.find((r) => firstOf(r) !== last);
    if (other) {
      this.retries.splice(this.retries.indexOf(other), 1);
      return take(fromRetry(other));
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
      return take(fromPlan(item));
    }
    if (this.retries.length) {
      const r = this.retries.shift()!;
      return take(fromRetry(r));
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

  /**
   * Antwort auf die aktuelle Karte. typed: die Antwort wurde getippt (nicht „Weiß nicht“, nicht gespielt) –
   * nur dann lässt sich ein Fehler als „Vertippt“ zurücknehmen.
   */
  answer(ok: boolean, typed = false): void {
    const step = this.current;
    if (!step || step.type !== "card") return;
    const { item, retry } = step;
    this.undo = null;
    if (!retry && !ok && typed && this.track === "lesen") {
      this.undo = this.snapshot(item.uid, [item.note], true, item.type !== "extra" ? cardKey(item.note, item.kind) : undefined);
    }
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

  /**
   * Ergebnis der aktuellen Tonfolge: ok[i] gehört zu folge.notes[i]. Je *verschiedenem* Ton einmal
   * gewertet (richtig nur, wenn er an allen Stellen richtig war); keine Fächer und Termine. Im Ergebnis
   * zählt die Folge als eine Position, richtig nur ganz fehlerfrei. Bei einem Fehler kommt sie einmal
   * wieder (ungewertet). typed wie bei answer: alle Antworten getippt (nicht „Weiß nicht“, nicht gespielt).
   */
  answerFolge(ok: boolean[], typed = false): void {
    const step = this.current;
    if (!step || step.type !== "folge") return;
    const { folge, retry } = step;
    const per = new Map<string, boolean>();
    folge.notes.forEach((n, i) => per.set(n, (per.get(n) ?? true) && !!ok[i]));
    const all = [...per.values()].every(Boolean);
    this.undo = null;
    if (!retry && !all && typed && this.track === "lesen") {
      const wrong = [...per].filter(([, good]) => !good).map(([n]) => n);
      this.undo = this.snapshot(folge.uid, wrong, wrong.length === per.size);
    }
    if (!retry) {
      this.graded += 1;
      if (all) this.correct += 1;
      const now = this.opt.now();
      for (const [n, good] of per) recordAnswer(this.data, this.track, n, good, now, this.opt.today);
      this.folgeLen?.update(all);
      this.unlocks.push(...checkUnlocks(this.data));
      this.onChange();
    }
    folge.notes.forEach((n, i) => {
      if (!ok[i] && !this.difficult.includes(n)) this.difficult.push(n);
    });
    if (!all && !retry) {
      const n = this.retryCount.get(folge.uid) ?? 0;
      if (n < MAX_FOLGE_RETRIES) {
        this.retryCount.set(folge.uid, n + 1);
        const gap = this.opt.rng() < 0.5 ? 2 : 3;
        this.retries.push({ folge, at: this.shown + gap });
      }
    }
  }

  /** Stand vor einer gewerteten falschen Antwort. notes: die falschen Töne; allWrong: nichts davon bleibt gewertet. */
  private snapshot(uid: number, notes: string[], allWrong: boolean, key?: string): Undo {
    const h = this.data.history[this.track];
    return {
      uid,
      history: notes.map((n) => [n, h[n]?.slice()]),
      card: key ? { key, prev: this.data.cards[key] && { ...this.data.cards[key] } } : undefined,
      difficult: this.difficult.slice(),
      folgeLen: this.current?.type === "folge" ? this.folgeLen?.snapshot() : undefined,
      stages: { ...this.data.stages },
      unlocks: this.unlocks.length,
      dropDay: allWrong && !this.data.days.includes(this.opt.today),
    };
  }

  /** Lässt sich die letzte Antwort als „Vertippt“ zurücknehmen? (gewertet und falsch, noch auf derselben Karte) */
  get canUndo(): boolean {
    return this.undo !== null;
  }

  /**
   * „Vertippt“: die falsche Antwort zählt nicht. Der Fehler verschwindet aus dem Verlauf (Trefferquote,
   * Freischalten), das Fach der Karte bleibt wie vorher (sie bleibt also fällig), die Wiederholung entfällt.
   * Bei einer Tonfolge nur die falsch getippten Töne; die richtigen bleiben gewertet. Im Ergebnis der
   * Sitzung („7 von 20“, „18 richtig“) zählt der Schritt als richtig.
   */
  undoLast(): void {
    const u = this.undo;
    if (!u) return;
    this.undo = null;
    const h = this.data.history[this.track];
    for (const [n, list] of u.history) {
      if (list) h[n] = list;
      else delete h[n];
    }
    if (u.card) {
      if (u.card.prev) this.data.cards[u.card.key] = u.card.prev;
      else delete this.data.cards[u.card.key];
    }
    if (u.dropDay) this.data.days = this.data.days.filter((x) => x !== this.opt.today);
    // Hat erst diese Antwort freigeschaltet, gilt das nicht mehr; was ohne sie gilt, prüft checkUnlocks unten
    this.data.stages = u.stages;
    this.unlocks.length = u.unlocks;
    this.difficult = u.difficult;
    this.retries = this.retries.filter((r) => (r.folge ? r.folge.uid : r.item!.uid) !== u.uid);
    this.retryCount.delete(u.uid);
    // Im Ergebnis der Sitzung zählt der Schritt als richtig (sie wusste es ja)
    this.correct += 1;
    if (u.folgeLen && this.folgeLen) {
      this.folgeLen.restore(u.folgeLen);
      this.folgeLen.update(true);
    }
    // Ohne den Fehler kann die Bedingung jetzt erfüllt sein
    this.unlocks.push(...checkUnlocks(this.data));
    this.onChange();
  }

  result(): SessionResult {
    return { graded: this.graded, correct: this.correct, difficult: this.difficult, unlocks: this.unlocks };
  }
}

/** Gibt es in einer Spur etwas Fälliges oder Neues? */
export function hasWork(data: AppData, track: Track, today: string): boolean {
  return dueCards(data, track, today, data.sessions + 1).length > 0 || newCards(data, track).length > 0;
}

