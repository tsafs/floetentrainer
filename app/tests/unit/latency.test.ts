// Verzögerung abgleichen: Einsätze erkennen, Abstand zu den Klicks, Median ohne Ausreißer.
import { describe, expect, it } from "vitest";
import { CLICK_ACCENT_FREQ } from "../../src/audio/flute-synth";
import type { Frame } from "../../src/audio/judge";
import { autoLatency, CAL_CLICKS, CAL_SPQ, latencyFromOnsets, OnsetDetector, ReadyGate } from "../../src/audio/latency";
import { soundingFreq } from "../../src/music/notes";
import { seeded } from "./helpers";

const STEP = 25;
const T0 = 2000;
const clicks = Array.from({ length: CAL_CLICKS }, (_, k) => T0 + k * CAL_SPQ * 1000);

describe("Abgleich: Auswertung der Einsätze", () => {
  it("Töne 140 ms nach den Klicks (±15 ms Streuung): 140 ms", () => {
    const r = seeded(4);
    const onsets = clicks.map((c) => c + 140 + (r() * 2 - 1) * 15);
    const res = latencyFromOnsets(clicks, onsets);
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(Math.abs(res.ms - 140)).toBeLessThanOrEqual(10);
      expect(res.used).toBe(8);
    }
  });

  it("Ausreißer (verpasster Klick, Doppelton, viel zu spät) fallen heraus", () => {
    const onsets = clicks.flatMap((c, k) => (k === 2 ? [] : k === 5 ? [c + 140, c + 330] : k === 6 ? [c + 420] : [c + 140 + k]));
    const res = latencyFromOnsets(clicks, onsets);
    expect(res.ok && res.ms).toBeGreaterThanOrEqual(140);
    expect(res.ok && res.ms).toBeLessThanOrEqual(145);
    expect(res.offsets[2]).toBeNull();
    expect(res.ok && res.used).toBe(6);
  });

  it("zu wenige passende Töne: kein Ergebnis", () => {
    expect(latencyFromOnsets(clicks, [clicks[0] + 100, clicks[3] + 120, clicks[6] + 110])).toMatchObject({ ok: false, reason: "zu-wenig" });
    expect(latencyFromOnsets(clicks, [])).toMatchObject({ ok: false, reason: "zu-wenig" });
  });

  it("Plausibilität 0–400 ms: knapp zu früh wird 0, deutlich zu früh ist unplausibel", () => {
    expect(latencyFromOnsets(clicks, clicks.map((c) => c - 20))).toMatchObject({ ok: true, ms: 0 });
    expect(latencyFromOnsets(clicks, clicks.map((c) => c - 200))).toMatchObject({ ok: false, reason: "unplausibel" });
  });
});

describe("Abgleich: Einsätze aus den Messungen", () => {
  /** Frames: zu jedem Klick ein kurzer Ton (beliebig) ab Klick + delay, 200 ms; der Klick selbst ist im Mikrofon zu hören */
  const play = (delay: number, withClick: boolean) => {
    const notes = [67, 72, 69, 74, 71, 67, 76, 72];
    const fs: Frame[] = [];
    for (let t = T0 - 3000; t < T0 + CAL_CLICKS * CAL_SPQ * 1000 + 600; t += STEP) {
      const k = clicks.findIndex((c) => t >= c + delay && t < c + delay + 200);
      const click = withClick && clicks.some((c) => t >= c + 30 && t < c + 30 + 2 * STEP);
      if (k >= 0) fs.push({ t, freq: soundingFreq(notes[k]), clarity: 0.96, rms: 0.1 });
      else if (click) fs.push({ t, freq: CLICK_ACCENT_FREQ, clarity: 0.99, rms: 0.03 });
      else fs.push({ t, freq: null, clarity: 0, rms: 0.002 });
    }
    return fs;
  };

  it("Einsatz = erster gültiger Frame eines Tons; Klicks aus dem Lautsprecher zählen nicht", () => {
    const det = new OnsetDetector();
    play(150, true).forEach((f) => det.push(f));
    det.flush();
    expect(det.onsets.length).toBe(8);
    const res = latencyFromOnsets(clicks, det.onsets);
    expect(res.ok).toBe(true);
    if (res.ok) expect(Math.abs(res.ms - 150)).toBeLessThanOrEqual(25);
  });

  it("ohne Klick-Filter hielte der Abgleich einen Klick direkt vor dem Ton für den Einsatz", () => {
    // Klick im Mikrofon 50–100 ms nach dem Klick, ihr Ton gleich danach ab 100 ms
    const run = (clickFreqs?: number[]) => {
      const det = new OnsetDetector(undefined, clickFreqs ? { clickFreqs } : {});
      play(100, true).forEach((f) => det.push(f));
      det.flush();
      return latencyFromOnsets(clicks, det.onsets);
    };
    expect(run()).toMatchObject({ ok: true, ms: 100 });
    expect(run([])).toMatchObject({ ok: true, ms: 50 });
  });
});

describe("Verzögerung nebenbei nachstellen", () => {
  it("zu wenige Einsätze oder kleine Abweichung: nichts", () => {
    expect(autoLatency(120, [40, 40, 40, 40, 40])).toBeNull();
    expect(autoLatency(120, [10, -5, 8, 12, 3, 9, 0, 11])).toBeNull();
    expect(autoLatency(120, [null, null, null, null, null, null, 50])).toBeNull();
  });
  it("um die Hälfte des Medians, auf 5 ms gerundet, Ausreißer zählen nicht, innerhalb der Grenzen", () => {
    expect(autoLatency(120, [60, 62, 58, 61, 59, 60, 400])).toBe(150);
    expect(autoLatency(200, [-40, -42, -38, -41, -39, -40])).toBe(180);
    expect(autoLatency(390, [60, 60, 60, 60, 60, 60])).toBe(400);
    expect(autoLatency(400, [60, 60, 60, 60, 60, 60])).toBeNull();
  });
});

describe("Start durch Spielen (ReadyGate)", () => {
  const tone = (t: number) => ({ t, freq: 880, clarity: 0.97, rms: 0.2 }) as Frame; // a¹ klingt eine Oktave höher
  const quiet = (t: number) => ({ t, freq: null, clarity: 0, rms: 0 }) as Frame;
  const feed = (g: ReadyGate, frames: Frame[]) => frames.findIndex((f) => g.push(f));
  it("Ton von 300 ms, dann 250 ms Stille: bereit", () => {
    const fr = [...Array.from({ length: 14 }, (_, i) => tone(i * 25)), ...Array.from({ length: 12 }, (_, i) => quiet(350 + i * 25))];
    const g = new ReadyGate();
    const k = feed(g, fr);
    expect(k).toBeGreaterThan(0);
    expect(fr[k].t - 325).toBeGreaterThanOrEqual(250);
    expect(g.push(quiet(2000))).toBe(false); // nur einmal
  });
  it("zu kurzer Ton oder Ton ohne Pause danach: nicht bereit", () => {
    expect(feed(new ReadyGate(), [...Array.from({ length: 6 }, (_, i) => tone(i * 25)), ...Array.from({ length: 20 }, (_, i) => quiet(200 + i * 25))])).toBe(-1);
    expect(feed(new ReadyGate(), Array.from({ length: 60 }, (_, i) => tone(i * 25)))).toBe(-1);
  });
  it("kurze Aussetzer im Ton zählen nicht als Ende", () => {
    const fr: Frame[] = [];
    for (let i = 0; i < 16; i++) fr.push(i === 6 ? quiet(i * 25) : tone(i * 25));
    for (let i = 0; i < 12; i++) fr.push(quiet(400 + i * 25));
    expect(feed(new ReadyGate(), fr)).toBeGreaterThan(16);
  });
});
