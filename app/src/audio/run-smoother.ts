// Lauf-Glätter für das Mitspielen (../audio/follow.ts) und den Abgleich der Verzögerung (./latency.ts).
// Rein rechnerisch, ohne Mikrofon – testbar. Seit dem 19.11.2026 statt des Median-Glätters (./smooth.ts),
// der für Stimmgerät, Üben und Flöte einstellen bleibt.
//
// Anlass (Rückmeldung vom 19.11.2026): „Immer noch 25–30 % der Töne falsch erkannt, vor allem bei
// schnellen Vierteln und Achteln, und es stockt besonders von einem hohen zu einem tieferen Ton.“
// Recherche (docs/erkennung.md): Bewährte Programme messen alle 3–6 ms und werten nach Zeit; Lern-Apps
// prüfen den *erwarteten* Ton. Der Prüfstand (tests/unit/erkennung.test.ts) zeigt eine harte Kante:
// Bei hauchigem Klang (starkes Atemrauschen) fällt die Klarheit unter die Schwelle (0,85) und es wird gar
// nichts mehr erkannt – leise, tiefe Töne liegen näher an dieser Kante als hohe.
//
// Verfahren, alles in ms statt in Frames (funktioniert mit den feinen Messungen alle ≈ 5 ms wie mit den
// groben alle 25 ms):
// 1. Gültig ist ein Frame mit Klarheit ≥ minClarity und Frequenz im Bereich.
// 2. Notengestützt („Hinweis“): Die Wertung nennt die Töne, die gerade erwartet werden (expect). Ein
//    Frame mit geringerer Klarheit (ab hintClarity) zählt trotzdem, wenn er höchstens hintCents neben
//    einem erwarteten Ton liegt. So wird ein hauchiger, aber richtiger Ton nicht verworfen; ein falscher
//    Ton wird dadurch nie „richtig“ (nur Frames nahe am erwarteten Ton werden gerettet), Rauschen bildet
//    keine stetigen Läufe (3.). Mit NSDF-Ausschnitt (feine Messung) muss die Kurve beim erwarteten Ton
//    selbst einen Gipfel von mindestens hintClarity haben (scoreAt, ./mpm.ts).
// 3. Läufe statt Median: Aufeinanderfolgende gültige Frames, die höchstens joinCents vom Lauf abweichen,
//    bilden einen Lauf. Ein Lauf zählt erst ab minRunMs Dauer; kürzere (Übergangswerte beim Tonwechsel,
//    das Messfenster überspannt beide Töne; einzelne Oktavsprünge; kurze Rauschspitzen) kommen als
//    unstet heraus („kein Ton“). Das ersetzt Median und Nachbarprüfung, unabhängig vom Messtakt.
// 4. Lücken überbrücken: Frames ohne gültigen Ton zwischen zwei Teilen desselben Laufs (Lücke kürzer als
//    bridgeMs, gemessen vom ersten ungültigen bis zum nächsten gültigen Frame) bekommen den Ton des Laufs
//    (`filled`, Klarheit der Nachbarn, eigene Lautstärke).
// 5. Ausgegebene Frequenz: Median des Laufs in ±medianMs um den Frame (Ausreißer am Rand des Laufs
//    verschieben den Ton nicht).
// Ein Frame kommt heraus, sobald über ihn entschieden ist (sein Lauf hat minRunMs erreicht oder ist zu
// Ende, die Lücke ist geschlossen); spätestens nach max(minRunMs, bridgeMs, medianMs). Er behält seinen
// Zeitpunkt t: Tonwechsel stehen an der richtigen Stelle, der Takt-Modus braucht keinen Ausgleich.

import { scoreAt } from "./mpm";
import type { Frame } from "./judge";
import type { SmoothedFrame } from "./smooth";

export interface RunConfig {
  minClarity: number;
  minFreq: number;
  maxFreq: number;
  /** Klarheit, ab der ein Frame nahe einem erwarteten Ton noch zählt */
  hintClarity: number;
  /** … und so nah (Cent) muss er an ihm liegen */
  hintCents: number;
  /** Lauf zählt ab dieser Dauer (ms) */
  minRunMs: number;
  /** ein Frame gehört zum Lauf, wenn er höchstens so weit (Cent) von dessen Ton liegt */
  joinCents: number;
  /** Lücken bis knapp darunter (ms) innerhalb eines Laufs werden überbrückt */
  bridgeMs: number;
  /** Median über ± so viele ms des Laufs */
  medianMs: number;
}

/**
 * Standard. minRunMs 35: deutlich länger als ein Übergangswert (das Messfenster überspannt den Wechsel
 * etwa 21 ms lang), deutlich kürzer als eine Sechzehntel bei ♩ = 120 (125 ms); bei groben Frames heißt
 * das wie früher: mindestens zwei passende Frames in Folge. joinCents 60 (zum Median der jüngsten sieben Frames des Laufs): Vibrato und Schwanken eines
 * gehaltenen Tons (±25–30 Cent) bleiben ein Lauf, ein Halbton (100 Cent) nicht. bridgeMs 50: wie
 * resetMs des Median-Glätters (bei groben Frames: ein einzelner Aussetzer). hintClarity 0,7 und
 * hintCents 50 siehe Kopfkommentar; gemessen im Prüfstand: Atemrauschen allein bildet auch so keinen Lauf.
 */
export const DEFAULT_RUN: RunConfig = {
  minClarity: 0.85,
  minFreq: 480,
  maxFreq: 2300,
  hintClarity: 0.7,
  hintCents: 50,
  minRunMs: 35,
  joinCents: 60,
  bridgeMs: 50,
  medianMs: 15,
};

/** Frame nach dem Lauf-Glätter: zusätzlich markiert, wenn er nur dank Hinweis zählt */
export type RunFrame = SmoothedFrame & { hinted?: boolean };

interface Entry {
  f: Frame;
  /** gebrochene MIDI-Nummer (klingend), null ohne gültigen Ton */
  p: number | null;
  hinted: boolean;
  /** gültig: sein Lauf; ungültig: der Lauf, der davor lief (Kandidat fürs Überbrücken) */
  run: Run | null;
  /** gültig gemessen, aber als kurzer Ausreißer in einem anderen Lauf verworfen */
  foreign?: boolean;
}

interface Run {
  start: number;
  last: number;
  /** jüngste Tonhöhen des Laufs (Bezug fürs Anschließen) */
  recent: number[];
  /** Einträge der jüngsten Zeit (für Median und Überbrücken; ältere fallen heraus) */
  entries: Entry[];
  closed: boolean;
}

const toPitch = (freq: number) => 69 + 12 * Math.log2(freq / 440);

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  return s[(s.length - 1) >> 1];
}

/** so lange (ms) behält ein Lauf seine Einträge für Median und Überbrücken */
const KEEP_MS = 250;

export class RunSmoother {
  readonly cfg: RunConfig;
  private queue: Entry[] = [];
  private run: Run | null = null;
  /** Lauf vor dem laufenden, solange dieser noch unbestätigt ist (kurzer Ausreißer mitten im Ton) */
  private prev: Run | null = null;
  /** erster ungültiger Frame seit dem letzten gültigen (Lücke im Lauf) */
  private gapStart: number | null = null;
  private expected: number[] = [];
  /** übliches Frame-Intervall (für die Dauer eines Laufs: letzter − erster Frame + ein Intervall) */
  private dt: number | null = null;
  private lastT: number | null = null;

  constructor(cfg: Partial<RunConfig> = {}) {
    this.cfg = { ...DEFAULT_RUN, ...cfg };
  }

  /** Erwartete Töne als klingende Frequenzen (Hz); leer = keine Hinweise */
  expect(freqs: number[]): void {
    this.expected = freqs;
  }

  push(f: Frame): RunFrame[] {
    if (this.lastT !== null) {
      const d = f.t - this.lastT;
      if (d > 0) this.dt = this.dt === null ? d : 0.9 * this.dt + 0.1 * d;
      // lange keine Frames (Seite im Hintergrund, ruckelnder Hauptthread): laufender Lauf endet
      if (d > 2 * this.cfg.bridgeMs) {
        this.close();
        this.dropPrev();
      }
    }
    this.lastT = f.t;
    const e = this.classify(f);
    this.queue.push(e);
    if (e.p !== null) {
      const r = this.run;
      const gapOk = this.gapStart === null || f.t - this.gapStart < this.cfg.bridgeMs;
      const fits = (x: Run) => Math.abs(e.p! - median(x.recent)) * 100 <= this.cfg.joinCents;
      const pv = this.prev;
      if (r && gapOk && fits(r)) {
        this.join(r, e);
      } else if (r && pv && !this.confirmed(r) && fits(pv) && f.t - r.start < this.cfg.bridgeMs) {
        // kurzer Ausreißer (z. B. ein Oktavsprung) mitten im Ton: er wird zur Lücke, der Ton läuft weiter
        r.closed = true;
        for (const x of r.entries) {
          x.p = null;
          x.foreign = true;
          x.run = pv;
        }
        pv.closed = false;
        this.prev = null;
        this.run = pv;
        this.join(pv, e);
      } else {
        // der vorige bleibt kurz als Rückkehr-Ziel, falls der neue nur ein Ausreißer ist
        this.prev = r && gapOk ? r : null;
        this.close();
        this.run = e.run = { start: f.t, last: f.t, recent: [e.p], entries: [e], closed: false };
      }
      if (this.prev && this.run && this.confirmed(this.run)) {
        this.prev.closed = true;
        this.prev = null;
      }
      this.gapStart = null;
    } else {
      this.gapStart ??= f.t;
      if (this.run && f.t - this.gapStart >= this.cfg.bridgeMs) {
        this.close();
        this.dropPrev();
      }
      e.run = this.run;
    }
    return this.emit(false);
  }

  /** Alles noch Offene ausgeben (am Ende eines Durchgangs) */
  flush(): RunFrame[] {
    this.close();
    this.dropPrev();
    return this.emit(true);
  }

  private classify(f: Frame): Entry {
    const cfg = this.cfg;
    const e: Entry = { f, p: null, hinted: false, run: null };
    if (f.freq === null || f.freq < cfg.minFreq || f.freq > cfg.maxFreq) return e;
    if (f.clarity >= cfg.minClarity) {
      e.p = toPitch(f.freq);
      return e;
    }
    if (f.clarity < cfg.hintClarity || !this.expected.length) return e;
    for (const x of this.expected) {
      if (Math.abs(1200 * Math.log2(f.freq / x)) > cfg.hintCents) continue;
      if (f.nsdf && f.lag0 !== undefined && f.sr) {
        // Gipfel der NSDF beim erwarteten Ton selbst (Suchbereich ±hintCents)
        const s = scoreAt(f.nsdf, f.lag0, f.sr, x, Math.pow(2, cfg.hintCents / 1200) - 1);
        if (s.score < cfg.hintClarity) continue;
      }
      e.p = toPitch(f.freq);
      e.hinted = true;
      return e;
    }
    return e;
  }

  private join(r: Run, e: Entry): void {
    r.last = e.f.t;
    r.recent.push(e.p!);
    if (r.recent.length > 7) r.recent.shift();
    r.entries.push(e);
    while (r.entries.length > 2 && r.entries[0].f.t < e.f.t - KEEP_MS) r.entries.shift();
    e.run = r;
  }

  private dropPrev(): void {
    if (this.prev) this.prev.closed = true;
    this.prev = null;
  }

  private confirmed(r: Run): boolean {
    return r.last - r.start + Math.min(this.dt ?? 25, 30) >= this.cfg.minRunMs;
  }

  private close(): void {
    if (this.run) this.run.closed = true;
    this.run = null;
  }

  /** Ausgeben, was entschieden ist, in Reihenfolge */
  private emit(all: boolean): RunFrame[] {
    const out: RunFrame[] = [];
    while (this.queue.length) {
      const e = this.queue[0];
      const res = e.p !== null ? this.valued(e, all) : this.gapValue(e, all);
      if (res === null) break;
      this.queue.shift();
      out.push(res);
    }
    return out;
  }

  /** Gültiger Frame: null, solange noch nicht entschieden */
  private valued(e: Entry, all: boolean): RunFrame | null {
    const r = e.run!;
    const ok = this.confirmed(r);
    if (!ok && !r.closed && !all) return null;
    if (!ok) return { ...e.f, freq: null, unstable: true };
    // Median braucht die Frames bis medianMs danach (oder das Laufende)
    if (!r.closed && !all && (this.lastT ?? 0) < e.f.t + this.cfg.medianMs) return null;
    const out: RunFrame = { ...e.f, freq: this.medianFreq(r, e.f.t) };
    if (e.hinted) out.hinted = true;
    return out;
  }

  /** Frame ohne gültigen Ton: überbrücken, wenn derselbe Lauf danach weitergeht */
  private gapValue(e: Entry, all: boolean): RunFrame | null {
    const r = e.run;
    const raw: RunFrame = e.foreign ? { ...e.f, freq: null, unstable: true } : e.f;
    if (!r) return raw;
    const after = r.entries.find((x) => x.f.t > e.f.t);
    if (after) {
      if (!this.confirmed(r)) {
        if (!r.closed && !all) return null;
        return raw;
      }
      let before: Entry | undefined;
      for (const x of r.entries) if (x.f.t < e.f.t) before = x;
      const clarity = Math.min(before?.f.clarity ?? after.f.clarity, after.f.clarity);
      return { ...e.f, freq: this.medianFreq(r, e.f.t), clarity, filled: true };
    }
    if ((r.closed && r !== this.prev) || all) return raw;
    return null; // Lücke noch offen: kann sich schließen
  }

  private medianFreq(r: Run, t: number): number {
    const near = r.entries.filter((x) => Math.abs(x.f.t - t) <= this.cfg.medianMs);
    const list = near.length ? near : r.entries;
    const sorted = [...list].sort((a, b) => a.p! - b.p!);
    return sorted[(sorted.length - 1) >> 1].f.freq!;
  }
}
