// Schnelle Tonwechsel mit Übergangswerten, wie sie das Messfenster von pitchy beim Wechsel liefert
// (Rückmeldung vom 14.11.2026: „wenn ich G, A und H schnell im Wechsel spiele, wird oft GIS erkannt“).
import type { Frame } from "../../src/audio/judge";
import { soundingFreq } from "../../src/music/notes";
import { seeded } from "./helpers";

export const STEP = 25;
export const G = 67;
export const A = 69;
export const H = 71;

/** klingende Frequenz zu einer gebrochenen notierten MIDI-Nummer */
export const hzOf = (m: number) => soundingFreq(m);

/** g¹ a¹ h¹ a¹ g¹ a¹ h¹ … (aufwärts und abwärts) */
export const UP_DOWN = [G, A, H, A];

export interface Played {
  frames: Frame[];
  /** Zeitpunkt des ersten echten (nicht Übergangs-)Frames je Ton, mit dem Ton */
  onsets: { t: number; midi: number }[];
  /** Zeitpunkte der Übergangs-Frames */
  transitions: number[];
}

/**
 * Frames alle 25 ms von t0 bis t1: ab start `count` Töne aus `order` (zyklisch), `perSecond` Töne je
 * Sekunde, legato (ohne Lücke); davor und danach Stille. Der erste Frame nach jedem Tonwechsel ist ein
 * Übergangswert: Das Messfenster enthielt beide Töne, gemessen wird ein Wert dazwischen (zufällig
 * 30–70 % des Abstands, also bei g¹→a¹ 60 bis 140 Cent über g¹ – gerundet meist gis¹), mit voller
 * Klarheit. cents: zusätzliche Abweichung je Zeitpunkt (Vibrato). Klarheit 0,95, Lautstärke 0,1.
 */
export function fastChanges(
  order: number[],
  perSecond: number,
  o: { t0?: number; t1?: number; start?: number; count?: number; seed?: number; cents?: (t: number) => number } = {},
): Played {
  const t0 = o.t0 ?? 0;
  const start = o.start ?? t0;
  const count = o.count ?? Infinity;
  const t1 = o.t1 ?? (count < Infinity ? start + (count * 1000) / perSecond + 200 : t0 + 3000);
  const rnd = seeded(o.seed ?? 5);
  const dur = 1000 / perSecond;
  const at = (t: number): number | null => {
    const k = Math.floor((t - start) / dur);
    return t < start || k >= count ? null : order[k % order.length];
  };
  const out: Played = { frames: [], onsets: [], transitions: [] };
  for (let t = t0; t < t1; t += STEP) {
    const cur = at(t);
    if (cur === null) {
      out.frames.push({ t, freq: null, clarity: 0, rms: 0.001 });
      continue;
    }
    const prev = at(t - STEP);
    const vib = (o.cents?.(t) ?? 0) / 100;
    let m = cur + vib;
    if (prev !== null && prev !== cur) {
      m = prev + (0.3 + 0.4 * rnd()) * (cur - prev) + vib;
      out.transitions.push(t);
    } else if (prev === null || out.onsets.at(-1)?.midi !== cur) {
      out.onsets.push({ t, midi: cur }); // erster echter Frame eines Tons (aufeinanderfolgende Töne sind verschieden)
    }
    out.frames.push({ t, freq: hzOf(m), clarity: 0.95, rms: 0.1 });
  }
  return out;
}
