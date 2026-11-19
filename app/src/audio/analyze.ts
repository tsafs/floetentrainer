// Aus einem Strom von Samples werden Messungen (Frames): je Schritt (hop) die Tonhöhe des jüngsten
// Fensters. Rein rechnerisch – läuft im AudioWorklet (./capture-worklet.ts), in den Tests mit
// synthetischen Flötentönen (tests/unit/flute-signal.ts) und im Auswerte-Skript für Aufnahmen des
// Testboards (scripts/replay.ts).
//
// Zwei Takte (Recherche vom 19.11.2026, docs/erkennung.md):
// - fein: alle 256 Samples (≈ 5,3 ms bei 48 kHz). So messen bewährte Programme (aubio 256, Performous 200,
//   pYIN/Essentia 256 Samples). Beim Mitspielen kommen damit auf eine Achtel 40–60 Messungen statt 10–12,
//   ein einzelner schlechter Wert entscheidet nicht mehr. Die Frames bringen den Ausschnitt der NSDF für
//   die Lags der Flötentöne mit (nsdf, lag0, sr), damit die Wertung den *erwarteten* Ton prüfen kann
//   (scoreAt in ./mpm.ts).
// - grob: alle 25 ms wie bisher, für Stimmgerät, Üben, Hören und Flöte einstellen, deren Regeln in
//   Frames zu 25 ms rechnen. Anders als früher (setInterval + AnalyserNode) lückenlos nach Samples
//   gezählt, also gleichmäßig auch bei ruckelndem Hauptthread.
// Messfenster in beiden Fällen 1024 Samples (≈ 21 ms; Begründung in ./mic.ts).

import { Mpm } from "./mpm";

export const WINDOW = 1024;
export const FINE_HOP = 256;
export const COARSE_MS = 25;
/** darunter gilt ein Fenster als Stille (wie bisher in ./mic.ts) */
export const MIN_RMS = 0.006;
/** NSDF-Ausschnitt: Lags für 2700 Hz bis 400 Hz (Flötentöne 523–2349 Hz samt Spielraum) */
const NSDF_MAX_HZ = 2700;
const NSDF_MIN_HZ = 400;

/** Eine Messung, wie sie aus dem Worklet kommt (Zeit als Sample-Nummer des Fensterendes) */
export interface RawMeasure {
  /** Sample-Nummer direkt hinter dem Fenster (Uhr des AudioContext) */
  end: number;
  freq: number;
  clarity: number;
  rms: number;
  nsdf?: Float32Array;
  lag0?: number;
}

export class FrameMaker {
  private ring: Float32Array;
  private pos = 0;
  private filled = 0;
  private since = 0;
  private mpm: Mpm;
  private win: Float32Array;
  private lag0: number;
  private lag1: number;

  /**
   * hop: Schritt in Samples; withNsdf: NSDF-Ausschnitt mitgeben (nur im feinen Takt nötig).
   * Bei nicht ganzzahligem hop (25 ms bei 44,1 kHz) wird abwechselnd gerundet, im Mittel stimmt er.
   */
  constructor(
    readonly sampleRate: number,
    readonly hop: number,
    private withNsdf: boolean,
    readonly size = WINDOW,
  ) {
    this.ring = new Float32Array(size);
    this.win = new Float32Array(size);
    this.mpm = new Mpm(size, sampleRate);
    this.lag0 = Math.max(1, Math.floor(sampleRate / NSDF_MAX_HZ) - 1);
    this.lag1 = Math.min(size - 1, Math.ceil(sampleRate / NSDF_MIN_HZ) + 2);
  }

  /** Samples ab Sample-Nummer start; gibt die dabei fälligen Messungen zurück */
  push(x: Float32Array, start: number): RawMeasure[] {
    const out: RawMeasure[] = [];
    const n = this.size;
    for (let i = 0; i < x.length; i++) {
      this.ring[this.pos] = x[i];
      this.pos = (this.pos + 1) % n;
      if (this.filled < n) {
        // erste Messung, sobald das Fenster voll ist
        if (++this.filled === n) this.since = this.hop;
      } else this.since++;
      if (this.filled === n && this.since >= this.hop) {
        this.since -= this.hop;
        out.push(this.measure(start + i + 1));
      }
    }
    return out;
  }

  private measure(end: number): RawMeasure {
    const n = this.size;
    // Fenster in zeitlicher Reihenfolge
    const tail = n - this.pos;
    this.win.set(this.ring.subarray(this.pos), 0);
    this.win.set(this.ring.subarray(0, this.pos), tail);
    const r = this.mpm.analyze(this.win);
    const m: RawMeasure = { end, freq: 0, clarity: 0, rms: r.rms };
    if (r.rms >= MIN_RMS && r.freq > 0) {
      m.freq = r.freq;
      m.clarity = r.clarity;
      if (this.withNsdf) {
        m.nsdf = this.mpm.nsdf.slice(this.lag0, this.lag1 + 1);
        m.lag0 = this.lag0;
      }
    }
    return m;
  }
}
