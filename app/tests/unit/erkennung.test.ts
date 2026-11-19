// Prüfstand der Erkennung (Rückmeldung vom 19.11.2026: „25–30 % der Töne werden falsch erkannt, vor allem
// bei schnellen Vierteln und Achteln“): synthetische Blockflötentöne als Samples → feine Messung wie im
// AudioWorklet → Wertung beim Mitspielen. Gespielt wird jeweils alles richtig (bzw. absichtlich falsch).
// Befund: Sauberer Klang, Nachhall, gebogene Einsätze, Überblasen und ungenaues Spiel waren schon vorher
// kein Problem; die harte Kante ist hauchiger Klang (Klarheit unter 0,85 → gar nichts erkannt). Der
// Hinweis auf den erwarteten Ton (./run-smoother.ts) schiebt diese Kante weit hinaus, ohne falsche Töne
// oder Rauschen grün zu machen.
import { describe, expect, it } from "vitest";
import { BeatFollower, WaitFollower } from "../../src/audio/follow";
import { FINE_HOP } from "../../src/audio/analyze";
import { melody, pieces, render, score, timelineOf } from "./erkennung-helpers";
import { measure, renderFlute, SR } from "./flute-signal";
import { seeded } from "./helpers";

const FINE = { frameMs: (FINE_HOP / SR) * 1000 };

describe("Prüfstand: richtig gespielt wird grün", () => {
  for (const p of pieces()) {
    it(p.name, () => {
      const r = render(p);
      const s = score(p, r.frames, r.starts, FINE);
      expect(s.waitMissed, "Warte-Modus").toEqual([]);
      expect(s.beatMissed, "Takt-Modus").toEqual([]);
    });
  }
});

describe("Prüfstand: hauchiger Klang", () => {
  const notes = melody(48, 0.5, 21);
  const at = (noise: number, hintCents?: number) => {
    const p = { name: "", notes, bpm: 100, synth: () => ({ gapMs: 25 }), opts: { noise } };
    const r = render(p);
    return score(p, r.frames, r.starts, { ...FINE, ...(hintCents === undefined ? {} : { hintCents }) });
  };

  it("Rauschen 0,4 (Klarheit um 0,77): ohne Hinweis nichts erkannt, mit Hinweis auf den erwarteten Ton alles", () => {
    const without = at(0.4, 0);
    expect([without.wait, without.beat]).toEqual([0, 0]);
    const s = at(0.4);
    expect([s.wait, s.beat]).toEqual([48, 48]);
  });
});

describe("Prüfstand: nichts falsch grün", () => {
  const notes = [67, 69, 71, 72, 74, 72, 71, 69].map((midi) => ({ midi, q: 0.5 }));
  const run = (frames: ReturnType<typeof measure>, start: number) => {
    const w = new WaitFollower(timelineOf(notes), { cfg: FINE });
    for (const f of frames) w.push(f);
    const b = new BeatFollower(timelineOf(notes), { secPerQuarter: 0.6, startMs: start, cfg: { ...FINE, latencyMs: 10 } });
    for (const f of frames) b.push(f);
    b.finish(frames[frames.length - 1].t + 2000);
    return { wait: w.index, beat: b.passes[0]?.hits ?? 0 };
  };

  it("nur Atemrauschen", () => {
    const rnd = seeded(4);
    const x = new Float32Array(SR * 6).map(() => (rnd() * 2 - 1) * 0.1);
    expect(run(measure(x), 500)).toEqual({ wait: 0, beat: 0 });
  });

  for (const off of [1, 2, -1]) {
    for (const noise of [0.1, 0.3]) {
      it(`jeder Ton ${off > 0 ? "+" : ""}${off} Halbton daneben, Rauschen ${noise}`, () => {
        const p = renderFlute(notes.map((n) => ({ midi: n.midi + off, ms: 300 })), { noise });
        expect(run(measure(p.x), p.starts[0])).toEqual({ wait: 0, beat: 0 });
      });
    }
  }
});
