import { describe, expect, it } from "vitest";
import { PlayJudge, type JudgeOutput } from "../../src/audio/judge";
import { note, soundingFreq } from "../../src/music/notes";

const STEP = 25;
const f = (id: string, cents = 0, tuning = 440) => soundingFreq(note(id), tuning) * Math.pow(2, cents / 1200);

/** Spielt einen Ton von t0 bis t1 (ms) mit Klarheit c und liefert alle Ereignisse. */
function play(j: PlayJudge, freq: number | null, t0: number, t1: number, clarity = 0.98): JudgeOutput[] {
  const out: JudgeOutput[] = [];
  for (let t = t0; t < t1; t += STEP) out.push(j.push({ t, freq, clarity: freq ? clarity : 0 }));
  return out;
}
const events = (o: JudgeOutput[]) => o.filter((x) => x.event).map((x) => x.event);

describe("Spielen werten", () => {
  it("richtig: 0,3 s stabil in der Toleranz", () => {
    const j = new PlayJudge();
    j.newCard(note("g1").midi, 0);
    const o = play(j, f("g1", 15), 500, 1200);
    expect(events(o)).toEqual(["correct"]);
    const at = o.findIndex((x) => x.event === "correct") * STEP + 500;
    expect(at).toBeGreaterThanOrEqual(800);
    expect(at).toBeLessThan(900);
  });
  it("zu kurz gehalten zählt nicht", () => {
    const j = new PlayJudge();
    j.newCard(note("g1").midi, 0);
    expect(events([...play(j, f("g1"), 500, 750), ...play(j, null, 750, 1000)])).toEqual([]);
  });
  it("außerhalb der Toleranz (±40 Cent) weder richtig noch falsch", () => {
    const j = new PlayJudge();
    j.newCard(note("g1").midi, 0);
    expect(events(play(j, f("g1", 45), 500, 1500))).toEqual([]);
  });
  it("Toleranz ist einstellbar", () => {
    const j = new PlayJudge({ toleranceCents: 20 });
    j.newCard(note("g1").midi, 0);
    expect(events(play(j, f("g1", 30), 500, 1500))).toEqual([]);
  });
  it("Stimmton ist einstellbar", () => {
    const j = new PlayJudge({ tuning: 415 });
    j.newCard(note("a1").midi, 0);
    expect(events(play(j, f("a1", 0, 415), 500, 1000))).toEqual(["correct"]);
  });
  it("falsch: anderer Ton 0,3 s stabil, nur einmal je Karte", () => {
    const j = new PlayJudge();
    j.newCard(note("g1").midi, 0);
    const o = [...play(j, f("a1"), 500, 1500), ...play(j, null, 1500, 1700), ...play(j, f("h1"), 1700, 2500)];
    expect(events(o)).toEqual(["wrong"]);
    expect(o.find((x) => x.event)?.wrongMidi).toBe(note("a1").midi);
  });
  it("erst falsch, dann richtig", () => {
    const j = new PlayJudge();
    j.newCard(note("g1").midi, 0);
    const o = [...play(j, f("a1"), 500, 1000), ...play(j, f("g1"), 1000, 1500)];
    expect(events(o)).toEqual(["wrong", "correct"]);
  });
  it("Nachklang der vorigen Karte zählt nicht", () => {
    const j = new PlayJudge();
    j.newCard(note("a1").midi, 0);
    expect(events(play(j, f("a1"), 0, 800))).toEqual(["correct"]);
    // nächste Karte wird angezeigt, a¹ klingt weiter
    j.newCard(note("g1").midi, 800);
    expect(events(play(j, f("a1"), 800, 2000))).toEqual([]);
    // Pause, dann der richtige Ton
    expect(events([...play(j, null, 2000, 2200), ...play(j, f("g1"), 2200, 2700)])).toEqual(["correct"]);
  });
  it("Nachklang, der genau der neuen Note entspricht, zählt erst nach neuem Einsatz", () => {
    const j = new PlayJudge();
    j.newCard(note("a1").midi, 0);
    play(j, f("g1"), 0, 300);
    j.newCard(note("g1").midi, 300);
    expect(events(play(j, f("g1"), 300, 1500))).toEqual([]);
    expect(events([...play(j, null, 1500, 1650), ...play(j, f("g1"), 1650, 2100)])).toEqual(["correct"]);
  });
  it("Tonwechsel nach der Anzeige ist ein neuer Einsatz", () => {
    const j = new PlayJudge();
    j.newCard(note("a1").midi, 0);
    play(j, f("h1"), 0, 300);
    j.newCard(note("g1").midi, 300);
    // h¹ klingt nach (zählt nicht), dann direkter Wechsel zu g¹
    expect(events([...play(j, f("h1"), 300, 900), ...play(j, f("g1"), 900, 1400)])).toEqual(["correct"]);
  });
  it("frühestens 400 ms nach der Anzeige", () => {
    const j = new PlayJudge();
    j.newCard(note("g1").midi, 0);
    const o = play(j, f("a1"), 50, 1000);
    const at = o.findIndex((x) => x.event === "wrong") * STEP + 50;
    expect(at).toBeGreaterThanOrEqual(700); // 400 ms + 300 ms halten
  });
  it("unklare oder leise Töne zählen nicht", () => {
    const j = new PlayJudge();
    j.newCard(note("g1").midi, 0);
    expect(events(play(j, f("a1"), 500, 1500, 0.8))).toEqual([]);
  });
  it("nur Frequenzen 480–2300 Hz", () => {
    const j = new PlayJudge();
    j.newCard(note("g1").midi, 0);
    expect(events(play(j, 440, 500, 1500))).toEqual([]);
    expect(events(play(j, 2500, 1600, 2600))).toEqual([]);
  });
  it("Oktavfehler nur bei besonders hoher Klarheit", () => {
    const j = new PlayJudge();
    j.newCard(note("g1").midi, 0);
    expect(events(play(j, f("g2"), 500, 1500, 0.94))).toEqual([]);
    expect(events([...play(j, null, 1500, 1700), ...play(j, f("g2"), 1700, 2500, 0.99)])).toEqual(["wrong"]);
  });
  it("„Weiß nicht“: danach kein Fehler mehr, richtiger Ton beendet die Karte", () => {
    const j = new PlayJudge();
    j.newCard(note("g1").midi, 0);
    j.markWrong();
    expect(events([...play(j, f("a1"), 500, 1200), ...play(j, f("g1"), 1200, 1700)])).toEqual(["correct"]);
  });
  it("Anzeige: gehörter Ton und Cent", () => {
    const j = new PlayJudge();
    const o = play(j, f("fis1", -12), 0, 100);
    expect(o[0].heard?.midi).toBe(note("fis1").midi);
    expect(o[0].heard?.cents).toBe(-12);
  });
});
