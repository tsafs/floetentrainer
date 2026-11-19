// Notenband beim Spielen (docs/app-notenband.md): Ablauf und Wertung. Neue Töne werden vorher einzeln
// vorgestellt, danach läuft ein durchgehendes Band aus Abschnitten (erzeugt, Liedstücke, ein Wechsel). Die
// Oberfläche (ui/band.ts) holt mit fill() neue Abschnitte, sobald die Noten rechts knapp werden, und meldet
// jeden fertigen Abschnitt mit phraseDone(). Zufall nur über das übergebene rng.

import { isAltSpelling, levelOf, unlockedNotes } from "../music/levels";
import { note } from "../music/notes";
import { BandScore, drillRhythm, phraseRhythm, toneCount, triadNotes, type PartSpan } from "../songs/band-score";
import type { Song } from "../songs/model";
import { songExcerpt, songSnippets, type Snippet } from "../songs/snippets";
import { cardKey, type AppData } from "../store/data";
import { snippetSong } from "./chapters";
import type { Rng } from "./choices";
import { applyAnswer, dueCards, newCards } from "./leitner";
import { checkUnlocks, noteWeight, recordAnswer, type Unlock } from "./progress";
import { recordPairs, MAX_NEW, type SessionResult } from "./session";
import { drillNotes, drillPair, folgeKey, makeFolge, nearTo } from "./sequences";

/** So viele Töne soll das Band rechts der aktuellen Note mindestens vorrätig haben */
export const BAND_AHEAD = 10;
/** Nach je so vielen erzeugten Abschnitten ein Liedstück */
export const SONG_EVERY = 3;
/** Abschnitt, der der Wechsel wird (einmal je Band) */
export const DRILL_AT = 3;

export type PhraseKind = "melody" | "song" | "drill";

export interface BandPhrase {
  /** fortlaufend (Wiederholung: eigene Nummer, gleiche Töne) */
  uid: number;
  kind: PhraseKind;
  /** Töne der Reihe nach (Kennungen der Grifftabelle, Haltebögen einmal) */
  notes: string[];
  /** Leitner-Karten (Spielen), die mit diesem Abschnitt gewertet werden */
  carry: string[];
  /** Titel über dem Abschnitt (Lied, „Wechsel“, „noch einmal“) oder null */
  label: string | null;
  /** Wiederholung nach einem Fehler: zählt nicht */
  retry: boolean;
  /** Lage im Band */
  span: PartSpan;
  /** zum Wiederholen: was angehängt wurde */
  part: Parameters<BandScore["append"]>[0];
}

export interface BandOptions {
  today: string;
  rng: Rng;
  now: () => number;
  /** Ende nach so vielen Millisekunden … */
  limitMs: number;
  /** … oder so vielen Tönen (am Ende des laufenden Abschnitts) */
  limitNotes: number;
}

export interface BandResult extends SessionResult {
  /** Ergebnis in Tönen (nicht Karten) */
  unit: "toene";
}

/** Töne fürs Band: freigeschaltet und beim Spielen vorgestellt, ohne andere Schreibweisen, nach Tonhöhe */
export function bandPool(data: AppData): string[] {
  const unlocked = new Set(unlockedNotes("spielen", levelOf("spielen", data.stages.spielen)));
  const ids = data.introduced.spielen.filter((n) => unlocked.has(n) && !isAltSpelling(n));
  return [...new Set(ids)].sort((a, b) => note(a).midi - note(b).midi);
}

export class BandSession {
  readonly sessionNo: number;
  /** neue Töne, die vor dem Band vorgestellt werden */
  readonly intros: string[];
  readonly score: BandScore;
  readonly phrases: BandPhrase[] = [];
  /** Stufenlied, aus dem die Liedstücke kommen (oder keins) */
  readonly song: Song | undefined;
  private snippets: Snippet[];
  private snippetNo = 0;
  private nextSnippet: Snippet | null = null;
  /** Abschnitte ohne Wiederholungen (für Liedstücke und den Wechsel) */
  private count = 0;
  private drilled = false;
  /** Karten, deren Ton noch in einem Abschnitt vorkommen soll (fällig bzw. neu) */
  private pendingCarry: string[];
  private retries: BandPhrase[] = [];
  private used = new Set<string>();
  private startedAt: number;
  private stopped = false;
  private uid = 0;
  played = 0;
  right = 0;
  difficult: string[] = [];
  unlocks: Unlock[] = [];
  onChange: () => void = () => {};

  constructor(
    private data: AppData,
    private opt: BandOptions,
  ) {
    data.sessions += 1;
    this.sessionNo = data.sessions;
    const due = dueCards(data, "spielen", opt.today, this.sessionNo).map((c) => c.note);
    const fresh = newCards(data, "spielen").map((c) => c.note);
    this.intros = fresh.filter((n) => !data.introduced.spielen.includes(n)).slice(0, MAX_NEW);
    // neue Karten, deren Ton schon vorgestellt ist (z. B. nach dem Startpunkt), zählen wie fällige
    const newKnown = fresh.filter((n) => data.introduced.spielen.includes(n));
    this.pendingCarry = [...new Set([...due, ...this.intros, ...newKnown])];
    const level = levelOf("spielen", data.stages.spielen);
    this.song = snippetSong("spielen", level);
    this.snippets = this.song ? songSnippets(this.song) : [];
    const meter = this.song?.time ?? { num: 4, den: 4 };
    this.score = new BandScore(meter, !!this.song?.hasLyrics && this.snippets.length > 0);
    // Liedstücke nur, wenn das Lied dieselbe Taktart hat wie das Band
    if (this.score.meter.num !== meter.num || this.score.meter.den !== meter.den) this.snippets = [];
    this.startedAt = opt.now();
  }

  /** Vorstellung eines neuen Tons abgeschlossen */
  introDone(n: string): void {
    if (!this.data.introduced.spielen.includes(n)) {
      this.data.introduced.spielen.push(n);
      this.onChange();
    }
  }

  /** Das Band beginnt (nach den Vorstellungen): ab hier läuft die Zeit */
  start(): void {
    this.startedAt = this.opt.now();
  }

  get elapsed(): number {
    return this.opt.now() - this.startedAt;
  }

  /** Fortschritt 0–1 (Zeit oder Töne, was weiter ist) */
  get progress(): number {
    return Math.min(1, Math.max(this.elapsed / this.opt.limitMs, this.played / this.opt.limitNotes));
  }

  /** Kommt nichts mehr dazu? (Zeit um oder genug Töne erzeugt) */
  get closed(): boolean {
    return this.stopped;
  }

  private get generated(): number {
    return this.score.timeline().tones.length;
  }

  /**
   * Abschnitte anhängen, bis mindestens BAND_AHEAD Töne nach Ton `at` vorrätig sind – solange Zeit und
   * Tonzahl es erlauben; danach wird das Band mit einem Schlussstrich geschlossen. true: etwas kam dazu.
   */
  fill(at: number): boolean {
    if (this.stopped) return false;
    let added = false;
    while (this.generated < at + 1 + BAND_AHEAD) {
      // die Vorgabe im Kopf: so viel spielen, wie insgesamt Töne erlaubt sind; die Zeit zählt ab dem Start
      const enough = this.generated >= this.opt.limitNotes || (this.phrases.length > 0 && this.elapsed >= this.opt.limitMs);
      if (enough && !this.nextSnippet) {
        this.score.close();
        this.stopped = true;
        return true;
      }
      this.phrases.push(this.makePhrase());
      added = true;
    }
    return added;
  }

  /** letzter Ton des Bands bisher */
  private get lastNote(): string | null {
    const p = this.phrases[this.phrases.length - 1];
    return p ? p.notes[p.notes.length - 1] : null;
  }

  private addPhrase(kind: PhraseKind, part: BandPhrase["part"], notes: string[], label: string | null, retry = false): BandPhrase {
    const span = this.score.append(part);
    const carry = retry ? [] : this.pendingCarry.filter((n) => notes.includes(n));
    this.pendingCarry = this.pendingCarry.filter((n) => !carry.includes(n));
    return { uid: this.uid++, kind, notes, carry, label, retry, span, part };
  }

  private makePhrase(): BandPhrase {
    const rng = this.opt.rng;
    const last = this.lastNote;
    // Liedstück, auf das der Abschnitt davor schon zuläuft
    if (this.nextSnippet) {
      const sn = this.nextSnippet;
      this.nextSnippet = null;
      return this.addPhrase("song", { kind: "song", excerpt: songExcerpt(this.song!, sn.from, sn.to) }, sn.notes, this.song!.title);
    }
    // Wiederholung eines Abschnitts mit Fehler (nicht mit dem Ton davor beginnend)
    const r = this.retries.findIndex((p) => p.notes[0] !== last);
    if (r >= 0) {
      const [p] = this.retries.splice(r, 1);
      return this.addPhrase(p.kind, p.part, p.notes, "noch einmal", true);
    }
    const pool = bandPool(this.data);
    const n = this.count++;
    // Wechsel (einmal): zwei Töne im Wechsel
    if (n === DRILL_AT && !this.drilled && pool.length >= 2) {
      const pair = drillPair(pool, this.data.pairs, rng);
      if (pair) {
        this.drilled = true;
        const rhythm = drillRhythm(this.score.meter);
        const two = drillNotes(pair, rng, last);
        const notes = Array.from({ length: toneCount(rhythm) }, (_, i) => two[i % 2]);
        return this.addPhrase("drill", { kind: "tones", notes, rhythm }, notes, "Wechsel");
      }
    }
    // Liedstück als nächstes? Dann läuft dieser Abschnitt darauf zu.
    let toward: string | undefined;
    let pickup: number | undefined;
    if ((n + 2) % SONG_EVERY === 0 && n + 1 !== DRILL_AT) {
      const sn = this.chooseSnippet(pool);
      if (sn) {
        this.nextSnippet = sn;
        toward = sn.notes[0];
        const first = this.song!.bars[sn.from];
        if (first.length < first.nominal - 1e-6) pickup = this.score.nominal - first.length;
      }
    }
    const rhythm = phraseRhythm(this.score.meter, rng, pickup);
    const len = toneCount(rhythm);
    const must = this.pendingCarry.find((c) => pool.includes(c) && c !== last);
    let notes: string[];
    if (pool.length < 2) {
      notes = Array.from({ length: len }, () => pool[0] ?? "a1");
    } else {
      const triad = this.song ? triadNotes(pool, this.song.keyName, this.song.key) : [];
      notes = makeFolge(pool, len, rng, {
        weight: noteWeight(this.data, "spielen"),
        from: last ?? undefined,
        avoidFirst: last,
        toward,
        endOn: toward ? undefined : triad,
        must,
        used: this.used,
        contour: true,
      });
      // kurze Folge (zu wenige Töne erreichbar): mit dem Wechsel der letzten beiden auffüllen
      while (notes.length < len) notes.push(notes[notes.length - 2] ?? notes[0]);
    }
    this.used.add(folgeKey(notes));
    return this.addPhrase("melody", { kind: "tones", notes, rhythm }, notes, null);
  }

  /** nächstes Liedstück der Reihe nach, das mit den Tönen spielbar ist und nicht mit dem Ton davor beginnt */
  private chooseSnippet(pool: string[]): Snippet | null {
    const ok = this.snippets.filter((s) => s.notes.every((x) => pool.includes(x)));
    if (!ok.length) return null;
    const sn = ok[this.snippetNo++ % ok.length];
    // Der Übergang braucht einen Ton nahe beim ersten Ton des Liedstücks
    return pool.some((x) => nearTo(x, sn.notes[0])) ? sn : null;
  }

  /**
   * Abschnitt fertig gespielt: ok[i] gehört zu phrase.notes[i]. Je verschiedenem Ton einmal gewertet
   * (richtig nur, wenn er überall richtig war), Karten der getragenen Töne im Leitner-System, Griffwechsel.
   * Wiederholungen zählen nur für die Anzeige der Töne. judged: so viele Töne von vorn wurden gespielt.
   */
  phraseDone(p: BandPhrase, ok: boolean[], judged = ok.length): void {
    this.played += judged;
    this.right += ok.slice(0, judged).filter(Boolean).length;
    ok.forEach((good, i) => {
      if (i < judged && !good && !this.difficult.includes(p.notes[i])) this.difficult.push(p.notes[i]);
    });
    if (p.retry) return;
    const per = new Map<string, boolean>();
    p.notes.slice(0, judged).forEach((n, i) => per.set(n, (per.get(n) ?? true) && ok[i]));
    const now = this.opt.now();
    for (const [n, good] of per) recordAnswer(this.data, "spielen", n, good, now, this.opt.today);
    for (const c of p.carry) {
      if (!per.has(c)) continue;
      const key = cardKey(c, "spiel");
      this.data.cards[key] = applyAnswer(this.data.cards[key], per.get(c)!, this.opt.today, this.sessionNo);
    }
    recordPairs(this.data, p.notes.slice(0, judged), ok.slice(0, judged));
    this.unlocks.push(...checkUnlocks(this.data));
    if ([...per.values()].some((g) => !g) && judged === p.notes.length) this.retries.push(p);
    this.onChange();
  }

  result(): BandResult {
    return { graded: this.played, correct: this.right, difficult: this.difficult, unlocks: this.unlocks, unit: "toene" };
  }
}
