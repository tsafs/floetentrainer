// Verzögerung abgleichen (Takt-Modus): Wie viel später als gespielt kommt ein Ton bei der Wertung an?
// Rein rechnerisch, ohne Mikrofon und Oberfläche – testbar.
//
// Ablauf (../ui/song-follow.ts): Die App zählt vier Klicks ein und klickt dann acht Mal im ruhigen Puls
// (♩ = 80). Sie spielt zu jedem der acht Klicks einen kurzen Ton, egal welchen. Weil der Puls
// gleichmäßig ist, spielt man nach dem Einzählen *auf* den Klick (wie beim Mitspielen), nicht als
// Reaktion danach. Gemessen wird je Klick der Abstand vom Zeitpunkt, zu dem sie den Klick hört
// (Ausgabe-Verzögerung schon eingerechnet, outputClock), bis zum Einsatz, wie ihn die Wertung sieht:
// erster gültiger Frame eines Tons nach Stille (Glätter und Klick-Filter wie im Takt-Modus, Ton
// mindestens 75 ms lang). Das ist genau die Größe, die der Takt-Modus ausgleichen muss (latencyMs):
// Mikrofon-Eingang samt Puffern, Messfenster und ihr eigener kleiner Versatz.
// Auswertung: je Klick der erste Einsatz von 250 ms vor bis 450 ms nach dem Klick; Median; Werte mehr
// als 80 ms vom Median weg (verpasster Klick, Doppelton) fallen heraus; mindestens 4 der 8 müssen
// übrig bleiben. Plausibel sind 0–400 ms (knapp darunter wird 0).

import { ClickFilter, DEFAULT_FOLLOW, LATENCY_MAX, LATENCY_MIN, type FollowConfig } from "./follow";
import { median } from "./flute-profile";
import type { Frame } from "./judge";
import { pitched, Smoother } from "./smooth";

export interface LatencyConfig {
  /** Einsatz frühestens so viel vor dem Klick … */
  before: number;
  /** … und spätestens so viel danach */
  after: number;
  /** ein Ton muss so lange klingen (kein Klick, kein Knacks) */
  minToneMs: number;
  /** so lange ohne gültigen Ton = der nächste Ton ist ein neuer Einsatz */
  gapMs: number;
  /** Abweichung vom Median, ab der ein Wert als Ausreißer gilt */
  outlierMs: number;
  /** so viele gültige Werte sind nötig */
  minGood: number;
}

export const DEFAULT_LATENCY: LatencyConfig = { before: 250, after: 450, minToneMs: 75, gapMs: 50, outlierMs: 80, minGood: 4 };

/** Abgleich: vier Klicks einzählen, acht messen, Puls in Sekunden */
export const CAL_COUNT_IN = 4;
export const CAL_CLICKS = 8;
export const CAL_SPQ = 0.75;

export type LatencyResult =
  | { ok: true; ms: number; offsets: (number | null)[]; used: number }
  | { ok: false; reason: "zu-wenig" | "unplausibel"; offsets: (number | null)[] };

/** Einsätze (Zeitpunkt des ersten gültigen Frames eines Tons) aus rohen Frames */
export class OnsetDetector {
  readonly onsets: number[] = [];
  private smoother: Smoother;
  private clicks: ClickFilter;
  private cfg: FollowConfig;
  private run: { start: number; last: number; counted: boolean } | null = null;
  private gapStart: number | null = null;

  constructor(
    private lcfg: LatencyConfig = DEFAULT_LATENCY,
    cfg: Partial<FollowConfig> = {},
  ) {
    this.cfg = { ...DEFAULT_FOLLOW, ...cfg };
    this.smoother = new Smoother(this.cfg);
    this.clicks = new ClickFilter(this.cfg);
  }

  push(raw: Frame): void {
    const f = this.smoother.push(raw);
    if (f) for (const g of this.clicks.push(f)) this.take(g);
  }

  flush(): void {
    for (const f of this.smoother.flush()) for (const g of this.clicks.push(f)) this.take(g);
    for (const g of this.clicks.flush()) this.take(g);
  }

  private take(f: Frame): void {
    if (!pitched(this.cfg, f)) {
      this.gapStart ??= f.t;
      if (this.run && f.t - this.gapStart >= this.lcfg.gapMs) this.run = null;
      return;
    }
    this.gapStart = null;
    const r = (this.run ??= { start: f.t, last: f.t, counted: false });
    r.last = f.t;
    if (!r.counted && r.last - r.start + this.cfg.frameMs >= this.lcfg.minToneMs) {
      r.counted = true;
      this.onsets.push(r.start);
    }
  }
}

/** Abstand Klick → Einsatz je Klick, Median ohne Ausreißer (siehe Kopfkommentar) */
export function latencyFromOnsets(clicks: number[], onsets: number[], cfg: LatencyConfig = DEFAULT_LATENCY): LatencyResult {
  const used = new Set<number>();
  const offsets = clicks.map((c) => {
    const k = onsets.findIndex((o, i) => !used.has(i) && o >= c - cfg.before && o <= c + cfg.after);
    if (k < 0) return null;
    used.add(k);
    return onsets[k] - c;
  });
  const vals = offsets.filter((x): x is number => x !== null);
  const m0 = median(vals);
  if (m0 === null) return { ok: false, reason: "zu-wenig", offsets };
  const good = vals.filter((x) => Math.abs(x - m0) <= cfg.outlierMs);
  if (good.length < cfg.minGood) return { ok: false, reason: "zu-wenig", offsets };
  const ms = median(good)!;
  if (ms < LATENCY_MIN - 30 || ms > LATENCY_MAX) return { ok: false, reason: "unplausibel", offsets };
  return { ok: true, ms: Math.round(Math.max(LATENCY_MIN, ms)), offsets, used: good.length };
}
