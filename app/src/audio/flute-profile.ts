// Eigenheiten der Flöte: Wie weit liegt jeder Ton dieser Flöte vom Stimmton daneben? (Rückmeldung vom
// 14.11.2026: günstige Sopranflöte, alle Töne etwa 30 Cent zu tief, einzelne je nach Blasdruck mehr.)
// Rein rechnerisch, ohne Mikrofon und Oberfläche – testbar.
//
// - Profil: je Ton (Kennung der Grifftabelle, z. B. "a1") die Abweichung in Cent, gemessen beim
//   „Flöte einstellen“ (FluteCalibrator) oder beim Mitspielen nachgeführt (LiveTuning). Gespeichert
//   in den Daten (../store/data.ts, AppData.flutes), mehrere Flöten möglich.
// - Für noch nicht gemessene Töne gilt der Median der gemessenen (eine Flöte, die insgesamt zu tief
//   ist, ist es meist bei allen Tönen ähnlich), ohne gemessene Töne 0.
// - Gewertet wird dann relativ zu diesem Wert: Liegt a¹ dieser Flöte bei −25 Cent, ist −25 Cent für
//   a¹ „genau“. Das Stimmgerät zeigt dagegen weiter die echte Abweichung zum Stimmton.

import { chartNoteByMidi, CHART } from "../music/notes";
import { DEFAULT_SMOOTH, pitched, Smoother, type SmoothConfig } from "./smooth";
import type { Frame } from "./judge";

/** Abweichung je Ton in Cent, Schlüssel = Kennung der Grifftabelle */
export type Offsets = Record<string, number>;

/** Größte gespeicherte Abweichung: mehr als ein halber Halbton wäre schon der Nachbarton */
export const MAX_OFFSET = 49;

export const clampOffset = (c: number) => Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, c));

/** Median einer Zahlenliste (leer: null) */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

/** Rückfall für ungemessene Töne: Median der gemessenen, sonst 0 */
export function fallbackOffset(o: Offsets): number {
  return median(Object.values(o)) ?? 0;
}

/** Abweichung des Tons mit dieser notierten MIDI-Nummer (gemessen oder Rückfall) */
export function offsetFor(o: Offsets, midi: number): number {
  const n = chartNoteByMidi(midi);
  const v = n ? o[n.id] : undefined;
  return v ?? fallbackOffset(o);
}

/** Liefert die Abweichung je notierter MIDI-Nummer */
export type OffsetOf = (midi: number) => number;

export const NO_OFFSET: OffsetOf = () => 0;

/**
 * Gebrochene notierte MIDI-Nummer m (relativ zum Stimmton) → nächster Ton *dieser Flöte*: der Ton r,
 * dessen eigene Lage (r + Abweichung) m am nächsten liegt, und der Abstand dazu in Cent. Ohne Profil
 * ist das einfach der nächste Halbton.
 */
export function correctPitch(m: number, off: OffsetOf): { midi: number; cents: number } {
  const r0 = Math.round(m);
  let best = { midi: r0, cents: (m - r0) * 100 - off(r0) };
  for (const r of [r0 - 1, r0 + 1]) {
    const c = (m - r) * 100 - off(r);
    if (Math.abs(c) < Math.abs(best.cents)) best = { midi: r, cents: c };
  }
  return best;
}

// ---------------------------------------------------------------- Nachführen beim Mitspielen

export interface LiveTuningConfig {
  /** so viele jüngste Messungen je Ton bilden den Median */
  window: number;
  /** erst ab so vielen Messungen eines Tons wird nachgeführt */
  minFrames: number;
  /** je Messung so großer Anteil des Abstands zum Median … */
  rate: number;
  /** … höchstens so viele Cent */
  maxStep: number;
  /** gemessene Töne höchstens so weit vom gespeicherten Wert weg (je Durchgang) */
  maxDrift: number;
}

/**
 * Langsam: 3 % des Abstands je Messung (alle 25 ms), höchstens 0,5 Cent – eine Viertelnote (≈ 20
 * Messungen) holt knapp die Hälfte des Abstands auf, ein einzelner schief geblasener Ton verschiebt
 * nichts dauerhaft. Gespeicherte (gemessene) Töne entfernen sich je Durchgang höchstens 15 Cent davon.
 */
export const DEFAULT_LIVE: LiveTuningConfig = { window: 40, minFrames: 5, rate: 0.03, maxStep: 0.5, maxDrift: 15 };

/**
 * Abweichungen während eines Mitspiel-Durchgangs: beginnt mit dem gespeicherten Profil und führt jeden
 * Ton mit den Messungen nach, die als dieser Ton gewertet wurden (observe). Noch nicht gemessene Töne
 * beginnen beim Rückfall (Median der übrigen, auch der schon nachgeführten) – so gleicht sich eine
 * insgesamt zu tiefe Flöte auch ohne „Flöte einstellen“ nach wenigen Noten an.
 */
export class LiveTuning {
  readonly cfg: LiveTuningConfig;
  /** aktuelle Werte (gespeichert + nachgeführt) */
  readonly values: Offsets;
  private readonly stored: Offsets;
  private recent = new Map<string, number[]>();
  private count = new Map<string, number>();

  constructor(stored: Offsets = {}, cfg: Partial<LiveTuningConfig> = {}) {
    this.cfg = { ...DEFAULT_LIVE, ...cfg };
    this.stored = { ...stored };
    this.values = { ...stored };
  }

  /** Abweichung je notierter MIDI-Nummer (für die Wertung) */
  readonly offsetOf: OffsetOf = (midi) => offsetFor(this.values, midi);

  /** Messung: Ton midi klang mit cents Abweichung vom Stimmton (nicht vom Profil) */
  observe(midi: number, cents: number): void {
    const n = chartNoteByMidi(midi);
    if (!n) return;
    const cfg = this.cfg;
    const list = this.recent.get(n.id) ?? [];
    list.push(cents);
    if (list.length > cfg.window) list.shift();
    this.recent.set(n.id, list);
    this.count.set(n.id, (this.count.get(n.id) ?? 0) + 1);
    if (list.length < cfg.minFrames) return;
    const cur = this.values[n.id] ?? fallbackOffset(this.values);
    const med = median(list)!;
    const step = Math.max(-cfg.maxStep, Math.min(cfg.maxStep, cfg.rate * (med - cur)));
    let v = clampOffset(cur + step);
    const s = this.stored[n.id];
    if (s !== undefined) v = Math.max(s - cfg.maxDrift, Math.min(s + cfg.maxDrift, v));
    this.values[n.id] = v;
  }

  /** Nachgeführte Werte mit genug Messungen (mindestens minCount), gerundet – zum Speichern */
  changes(minCount = 10): Offsets {
    const out: Offsets = {};
    for (const [id, c] of this.count) {
      const v = this.values[id];
      if (c >= minCount && v !== undefined) out[id] = Math.round(v);
    }
    return out;
  }
}

// ---------------------------------------------------------------- Flöte einstellen (je Ton)

export interface CalibrateConfig {
  /** Anfang eines Tons (Einschwingen) nicht mitmessen */
  skipMs: number;
  /** so lange stabil = fertig gemessen */
  measureMs: number;
  /** bricht der Ton früher ab, zählt die Messung ab so viel stabiler Zeit trotzdem */
  minMs: number;
  /** Messungen weiter als so viele Cent vom laufenden Median weg zählen nicht (Wackler) */
  outlierCents: number;
  /** größte zulässige Abweichung vom Zielton (sonst „ein anderer Ton“) */
  maxCents: number;
  smooth: Partial<SmoothConfig>;
}

/**
 * „Spiel diesen Ton ruhig etwa 2 Sekunden“: 150 ms Einschwingen werden übersprungen, gemessen wird
 * 1,5 s stabile Phase (bricht der Ton früher ab, reicht 1 s). Glättung wie bei der Übung (Median über
 * 5 Messungen, Stabilitätsprüfung), Klarheit mindestens 0,9: hier zählt Genauigkeit, nicht Tempo.
 */
export const DEFAULT_CALIBRATE: CalibrateConfig = {
  skipMs: 150,
  measureMs: 1500,
  minMs: 1000,
  outlierCents: 40,
  maxCents: 50,
  smooth: {},
};

export type CalibrateState =
  | { phase: "wait" }
  | { phase: "measure"; progress: number; cents: number }
  | { phase: "done"; cents: number }
  | { phase: "wrong"; heardMidi: number };

/**
 * Misst die Abweichung eines Tons: Median der Cent-Abweichung (relativ zum Stimmton) über die stabile
 * Phase eines ruhig gehaltenen Tons. Ein Toneinsatz beginnt nach Stille bzw. bei einem Tonwechsel (über
 * 70 Cent, wie im Glätter); nur klare, stabile Messungen zählen. Liegt der Median 50 Cent oder mehr vom
 * Zielton weg, war es wohl ein anderer Ton („wrong“, mit dem gehörten Ton).
 */
export class FluteCalibrator {
  readonly cfg: CalibrateConfig;
  state: CalibrateState = { phase: "wait" };
  private smoother: Smoother;
  private run: { start: number; last: number; devs: number[]; t: number[] } | null = null;
  private gapStart: number | null = null;

  constructor(
    readonly targetMidi: number,
    readonly tuning = 440,
    cfg: Partial<CalibrateConfig> = {},
  ) {
    this.cfg = { ...DEFAULT_CALIBRATE, ...cfg };
    this.smoother = new Smoother({ ...DEFAULT_SMOOTH, ...this.cfg.smooth });
  }

  /** Roher Frame vom Mikrofon; gibt den neuen Zustand zurück */
  push(raw: Frame): CalibrateState {
    if (this.state.phase === "done" || this.state.phase === "wrong") return this.state;
    const f = this.smoother.push(raw);
    if (!f) return this.state;
    const cfg = this.cfg;
    if (!pitched(this.smoother.cfg, f)) {
      this.gapStart ??= f.t;
      if (this.run && f.t - this.gapStart >= DEFAULT_SMOOTH.resetMs) this.endRun();
      return this.state;
    }
    this.gapStart = null;
    const m = 69 + 12 * Math.log2(f.freq / this.tuning) - 12;
    const dev = (m - this.targetMidi) * 100;
    const r = this.run;
    if (!r || (r.devs.length >= 3 && Math.abs(dev - median(r.devs)!) > 70)) {
      if (r) this.endRun();
      if (this.state.phase !== "wait" && this.state.phase !== "measure") return this.state;
      this.run = { start: f.t, last: f.t, devs: [], t: [] };
    }
    const run = this.run!;
    run.last = f.t;
    if (f.t - run.start < cfg.skipMs) return this.state;
    const med = median(run.devs);
    if (med === null || Math.abs(dev - med) <= cfg.outlierCents) {
      run.devs.push(dev);
      run.t.push(f.t);
    }
    const span = run.t[run.t.length - 1] - run.t[0];
    if (span >= cfg.measureMs) return this.finish(run);
    this.state = { phase: "measure", progress: Math.min(1, span / cfg.measureMs), cents: median(run.devs)! };
    return this.state;
  }

  /** Neu messen (gleicher Ton) */
  reset(): void {
    this.state = { phase: "wait" };
    this.run = null;
    this.gapStart = null;
  }

  private endRun(): void {
    const r = this.run;
    this.run = null;
    if (!r || this.state.phase !== "measure") return;
    if (r.t.length && r.t[r.t.length - 1] - r.t[0] >= this.cfg.minMs) this.finish(r);
    else this.state = { phase: "wait" };
  }

  private finish(r: { devs: number[] }): CalibrateState {
    const c = median(r.devs)!;
    if (Math.abs(c) >= this.cfg.maxCents) {
      this.state = { phase: "wrong", heardMidi: Math.round(this.targetMidi + c / 100) };
    } else {
      this.state = { phase: "done", cents: Math.round(c) };
    }
    return this.state;
  }
}

/** Töne zum Einstellen: die freigeschalteten (Kennungen), als Töne der Grifftabelle nach Tonhöhe */
export function calibrationNotes(ids: string[]): string[] {
  const set = new Set(ids);
  return CHART.filter((n) => set.has(n.id)).map((n) => n.id);
}
