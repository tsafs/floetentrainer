import { PitchDetector } from "pitchy";
import { describe, expect, it } from "vitest";
import { FINE_HOP, FrameMaker } from "../../src/audio/analyze";
import { Mpm, scoreAt } from "../../src/audio/mpm";
import { soundingFreq } from "../../src/music/notes";
import { measure, renderFlute, SR } from "./flute-signal";
import { seeded } from "./helpers";

describe("Mpm misst wie pitchy", () => {
  it("gleiche Frequenz und Klarheit auf Flötenklang mit Rauschen, Wechseln und Stille", () => {
    const rnd = seeded(11);
    const notes = Array.from({ length: 30 }, () => ({ midi: 60 + Math.floor(rnd() * 15), ms: 80 + rnd() * 200, gapMs: rnd() < 0.5 ? 0 : 25 }));
    const { x } = renderFlute(notes, { noise: 0.08 });
    const mpm = new Mpm(1024, SR);
    const ref = PitchDetector.forFloat32Array(1024);
    ref.minVolumeDecibels = -45;
    let n = 0;
    for (let i = 0; i + 1024 <= x.length; i += 997) {
      const w = x.slice(i, i + 1024);
      const a = mpm.analyze(w);
      const [f, c] = ref.findPitch(w, SR);
      expect(a.freq).toBeCloseTo(f, 3);
      expect(a.clarity).toBeCloseTo(c, 4);
      n++;
    }
    expect(n).toBeGreaterThan(50);
  });
});

describe("FrameMaker", () => {
  it("fein: alle 256 Samples eine Messung, Zeit = Fensterende, mit NSDF-Ausschnitt", () => {
    const { x } = renderFlute([{ midi: 69, ms: 500 }], { padMs: 0 });
    const fm = new FrameMaker(SR, FINE_HOP, true);
    const ends: number[] = [];
    for (let i = 0; i < x.length; i += 128) for (const m of fm.push(x.subarray(i, i + 128), i)) ends.push(m.end);
    expect(ends[0]).toBe(1024);
    expect(ends[1] - ends[0]).toBe(256);
    expect(ends.length).toBe(Math.floor((x.length - 1024) / 256) + 1);
  });

  it("grob bei 44,1 kHz: im Mittel 25 ms Abstand (abwechselnd gerundet)", () => {
    const sr = 44100;
    const { x } = renderFlute([{ midi: 69, ms: 2000 }], { padMs: 0, sr });
    const fm = new FrameMaker(sr, sr * 0.025, false);
    const ends: number[] = [];
    for (let i = 0; i < x.length; i += 128) for (const m of fm.push(x.subarray(i, i + 128), i)) ends.push(m.end);
    const avg = (ends[ends.length - 1] - ends[0]) / (ends.length - 1);
    expect(avg).toBeCloseTo(1102.5, 0);
  });

  it("scoreAt: hoch am gespielten Ton, niedrig am Nachbarton; trifft auch den Grundton, wenn MPM die Oktave wählt", () => {
    const frames = measure(renderFlute([{ midi: 67, ms: 400 }], { padMs: 0 }).x);
    const f = frames[20];
    expect(f.freq).not.toBeNull();
    const own = scoreAt(f.nsdf!, f.lag0!, SR, soundingFreq(67));
    const next = scoreAt(f.nsdf!, f.lag0!, SR, soundingFreq(69));
    expect(own.score).toBeGreaterThan(0.95);
    expect(Math.abs(1200 * Math.log2(own.freq / soundingFreq(67)))).toBeLessThan(5);
    expect(next.score).toBe(0);
  });
});
