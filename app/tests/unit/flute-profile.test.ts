// Flöte einstellen: Messung je Ton (Median über die stabile Phase, Plausibilität, falscher Ton).
import { describe, expect, it } from "vitest";
import { calibrationNotes, FluteCalibrator, median, type CalibrateState } from "../../src/audio/flute-profile";
import { PlayJudge } from "../../src/audio/judge";
import type { Frame } from "../../src/audio/judge";
import { soundingFreq } from "../../src/music/notes";

const STEP = 25;
const A = 69;
const H = 71;
const E1 = 64;
const hz = (m: number, c = 0, tuning = 440) => soundingFreq(m, tuning) * Math.pow(2, c / 1200);

/** Ton ms lang mit Abweichung cents(k) je Frame, davor 100 ms Stille */
function tone(midi: number, ms: number, cents: (k: number) => number, o: { t0?: number; tuning?: number; clarity?: number } = {}): Frame[] {
  const out: Frame[] = [];
  let t = o.t0 ?? 0;
  for (let k = 0; k < 4; k++, t += STEP) out.push({ t, freq: null, clarity: 0, rms: 0.001 });
  for (let k = 0; k < ms / STEP; k++, t += STEP) out.push({ t, freq: hz(midi, cents(k), o.tuning), clarity: o.clarity ?? 0.97, rms: 0.1 });
  return out;
}
const run = (c: FluteCalibrator, fs: Frame[]): CalibrateState => {
  let s: CalibrateState = c.state;
  for (const f of fs) s = c.push(f);
  return s;
};
const silence = (t0: number, ms = 200): Frame[] => Array.from({ length: ms / STEP }, (_, k) => ({ t: t0 + k * STEP, freq: null, clarity: 0, rms: 0.001 }));

describe("Flöte einstellen: Messung je Ton", () => {
  it("Median über die stabile Phase: −25 Cent mit Wackeln ±8 und schiefem Einsatz", () => {
    const c = new FluteCalibrator(A);
    // die ersten 100 ms deutlich zu tief (Einsatz), dann −25 ± 8
    const s = run(c, tone(A, 2000, (k) => (k < 4 ? -45 : -25 + 8 * Math.sin(k))));
    expect(s).toEqual({ phase: "done", cents: -25 });
  });

  it("relativ zum Stimmton der Einstellungen", () => {
    const c = new FluteCalibrator(A, 442);
    expect(run(c, tone(A, 2000, () => -10, { tuning: 442 }))).toEqual({ phase: "done", cents: -10 });
  });

  it("Fortschritt während der Messung, fertig nach 1,5 s stabiler Phase", () => {
    const c = new FluteCalibrator(E1);
    const fs = tone(E1, 2000, () => -40);
    const states = fs.map((f) => ({ t: f.t, s: c.push(f) }));
    const measuring = states.filter((x) => x.s.phase === "measure");
    expect(measuring.length).toBeGreaterThan(30);
    expect((measuring.at(-1)!.s as { progress: number }).progress).toBeGreaterThan(0.9);
    const done = states.find((x) => x.s.phase === "done")!;
    // 100 ms Stille + 150 ms Einschwingen + 1,5 s + Glättung (50 ms)
    expect(done.t).toBeGreaterThan(1700);
    expect(done.t).toBeLessThan(1900);
    expect(done.s).toEqual({ phase: "done", cents: -40 });
  });

  it("ein anderer Ton (50 Cent oder mehr daneben): „wrong“ mit dem gehörten Ton", () => {
    const c = new FluteCalibrator(A);
    expect(run(c, tone(H, 2000, () => 0))).toEqual({ phase: "wrong", heardMidi: H });
    const edge = new FluteCalibrator(A);
    expect(run(edge, tone(A, 2000, () => 55))).toEqual({ phase: "wrong", heardMidi: A + 1 });
    // nach reset nochmal, diesmal richtig
    edge.reset();
    expect(run(edge, tone(A, 2000, () => 20, { t0: 3000 }))).toEqual({ phase: "done", cents: 20 });
  });

  it("bricht der Ton ab: ab 1 s stabil zählt die Messung, kürzer beginnt sie neu", () => {
    const c = new FluteCalibrator(A);
    expect(run(c, [...tone(A, 1300, () => -15), ...silence(1400)])).toEqual({ phase: "done", cents: -15 });
    const short = new FluteCalibrator(A);
    expect(run(short, [...tone(A, 600, () => -15), ...silence(700)])).toEqual({ phase: "wait" });
  });

  it("nur klare, stabile Frames zählen: unklare Messungen ändern nichts, einzelne Ausreißer auch nicht", () => {
    const c = new FluteCalibrator(A);
    const fs = tone(A, 2400, (k) => (k % 7 === 3 ? 60 : -20)).map((f, k) => (k % 9 === 5 ? { ...f, clarity: 0.6, freq: hz(A, 300) } : f));
    expect(run(c, fs)).toEqual({ phase: "done", cents: -20 });
  });

  it("Töne zum Einstellen: freigeschaltete, Schreibweise der Grifftabelle, nach Tonhöhe", () => {
    expect(calibrationNotes(["h1", "a1", "g1", "c2", "d2", "dis1"])).toEqual(["g1", "a1", "h1", "c2", "d2"]);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([])).toBeNull();
  });
});

describe("Übung (Spielen-Karten) mit Flötenprofil", () => {
  /** Frames eines Tons nach der Kartenanzeige */
  const card = (j: PlayJudge, midi: number, cents: number) => {
    j.newCard(midi, 0);
    const out: string[] = [];
    for (let t = 450; t < 1400; t += STEP) {
      const o = j.push({ t, freq: hz(midi, cents + 6 * Math.sin(t / 30)), clarity: 0.97 });
      if (o.event) out.push(o.event);
    }
    return out;
  };

  it("e¹ bei −45 Cent: mit Profil (e¹ −45) richtig, ohne Profil (±40 Cent) nicht", () => {
    expect(card(new PlayJudge({}, (m) => (m === E1 ? -45 : 0)), E1, -45)).toEqual(["correct"]);
    expect(card(new PlayJudge(), E1, -45)).not.toContain("correct");
  });

  it("die Anzeige („Ich höre“) zeigt die Abweichung zur Lage des Tons auf ihrer Flöte", () => {
    const j = new PlayJudge({}, () => -30);
    j.newCard(A, 0);
    let last = null;
    for (let t = 0; t < 400; t += STEP) last = j.push({ t, freq: hz(A, -30), clarity: 0.97 }).heard ?? last;
    expect(last).toMatchObject({ midi: A, cents: 0 });
  });
});
