// Tonhöhe nach McLeod (MPM), wie pitchy sie misst, aber mit Zugriff auf die NSDF-Kurve.
//
// Warum nicht einfach pitchy.findPitch? Die Messung ist dieselbe (pitchys Autokorrelation per FFT, dieselbe
// Wahl des ersten Schlüssel-Maximums über k · Höchstwert, dieselbe Parabel; tests/unit/mpm.test.ts prüft,
// dass Frequenz und Klarheit übereinstimmen). Zusätzlich bleibt hier die normierte Kurve (NSDF) für die
// kurzen Verschiebungen (Lags) erhalten, die für Flötentöne in Frage kommen. Damit lässt sich für einen
// *erwarteten* Ton nachsehen, wie gut das Messfenster zu ihm passt (scoreAt), auch wenn MPM selbst
// einen anderen Gipfel gewählt hat (Unterton) oder die Klarheit knapp unter der Schwelle liegt. Das ist
// der Kern der notengestützten Erkennung (Recherche vom 19.11.2026, docs/erkennung.md): Gesangs- und
// Lern-Apps prüfen, ob der erwartete Ton klingt, statt frei unter allen Tönen zu raten.
//
// Läuft im AudioWorklet (./capture-worklet.ts) und in Tests; kein DOM.

import { Autocorrelator } from "pitchy";

export interface MpmFrame {
  /** Frequenz in Hz, 0 ohne Ergebnis */
  freq: number;
  /** Klarheit (Höhe des gewählten Gipfels, 0–1) */
  clarity: number;
  /** Effektivwert des Fensters */
  rms: number;
}

/** k aus dem MPM-Aufsatz (pitchy: clarityThreshold, Standard 0,9) */
const K = 0.9;

export class Mpm {
  private ac: Autocorrelator<Float32Array>;
  /** NSDF über alle Lags des Fensters */
  readonly nsdf: Float32Array;
  private minAbs: number;

  /**
   * size: Fenster in Samples; minVolumeDecibels wie bei pitchy (darunter kein Ergebnis).
   */
  constructor(
    readonly size: number,
    readonly sampleRate: number,
    minVolumeDecibels = -45,
  ) {
    this.ac = Autocorrelator.forFloat32Array(size);
    this.nsdf = new Float32Array(size);
    // pitchy: maxInputAmplitude · 10^(dB/10)
    this.minAbs = Math.pow(10, minVolumeDecibels / 10);
  }

  /** Misst das Fenster x (Länge size). Die NSDF bleibt bis zum nächsten Aufruf in this.nsdf. */
  analyze(x: Float32Array): MpmFrame {
    let sq = 0;
    for (let i = 0; i < x.length; i++) sq += x[i] * x[i];
    const rms = Math.sqrt(sq / x.length);
    const n = this.nsdf;
    if (rms < this.minAbs) {
      n.fill(0);
      return { freq: 0, clarity: 0, rms };
    }
    this.ac.autocorrelate(x, n);
    // m'(τ) schrittweise wie bei pitchy
    let m = 2 * n[0];
    let i = 0;
    for (; i < n.length && m > 0; i++) {
      n[i] = (2 * n[i]) / m;
      m -= x[i] * x[i] + x[x.length - i - 1] * x[x.length - i - 1];
    }
    for (; i < n.length; i++) n[i] = 0;
    // Schlüssel-Maxima (zwischen positivem und negativem Nulldurchgang)
    const keys: number[] = [];
    let looking = false;
    let max = -Infinity;
    let maxIndex = -1;
    for (let j = 1; j < n.length - 1; j++) {
      if (n[j - 1] <= 0 && n[j] > 0) {
        looking = true;
        maxIndex = j;
        max = n[j];
      } else if (n[j - 1] > 0 && n[j] <= 0) {
        looking = false;
        if (maxIndex !== -1) keys.push(maxIndex);
      } else if (looking && n[j] > max) {
        max = n[j];
        maxIndex = j;
      }
    }
    if (!keys.length) return { freq: 0, clarity: 0, rms };
    let nMax = -Infinity;
    for (const k of keys) nMax = Math.max(nMax, n[k]);
    const idx = keys.find((k) => n[k] >= K * nMax)!;
    const [lag, val] = parabola(n, idx);
    return { freq: this.sampleRate / lag, clarity: Math.min(val, 1), rms };
  }
}

/** Gipfel der Parabel durch n[i−1], n[i], n[i+1]: [Lag, Wert] (wie pitchy refineResultIndex) */
export function parabola(n: ArrayLike<number>, i: number): [number, number] {
  const y0 = n[i - 1];
  const y1 = n[i];
  const y2 = n[i + 1];
  const a = y0 / 2 - y1 + y2 / 2;
  if (a >= 0) return [i, y1];
  const b = (y2 - y0) / 2;
  const d = -b / (2 * a);
  return [i + d, y1 + (b * d) / 2];
}

/**
 * Wie gut passt das Fenster zur Frequenz freq? Höchster Wert der NSDF nahe ihrem Lag (± spread, als
 * Anteil, Standard ±3 % ≈ ±50 Cent), parabolisch verfeinert. Gibt Wert (≈ Klarheit, wenn dort der Ton
 * liegt) und die zugehörige Frequenz zurück. Die NSDF-Ausschnitte im Frame (nsdf, lag0) kommen vom
 * Worklet; Lag lag0 + j steht in nsdf[j].
 */
export function scoreAt(nsdf: ArrayLike<number>, lag0: number, sampleRate: number, freq: number, spread = 0.03): { score: number; freq: number } {
  const L = sampleRate / freq;
  const lo = Math.max(1, Math.floor(L * (1 - spread)) - lag0);
  const hi = Math.min(nsdf.length - 2, Math.ceil(L * (1 + spread)) - lag0);
  let best = -1;
  for (let j = lo; j <= hi; j++) if (best < 0 || nsdf[j] > nsdf[best]) best = j;
  if (best < 1) return { score: 0, freq: 0 };
  // Rand des Suchbereichs ohne echten Gipfel: kein Treffer (der Ton liegt woanders)
  if (nsdf[best - 1] > nsdf[best] || nsdf[best + 1] > nsdf[best]) return { score: 0, freq: 0 };
  const [lag, val] = parabola(nsdf, best);
  return { score: Math.min(1, val), freq: sampleRate / (lag + lag0) };
}
