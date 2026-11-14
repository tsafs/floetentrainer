import { describe, expect, it } from "vitest";
import { PlayJudge, type JudgeOutput } from "../../src/audio/judge";
import { note, soundingFreq } from "../../src/music/notes";
import { A, fastChanges, G, H, hzOf, STEP as T_STEP, UP_DOWN } from "./transition-helpers";

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
  describe("wackelnder Ton (Glättung)", () => {
    /** g¹ mit Vibrato ±30 Cent (5 Hz), jeder 6. Frame ein Ausreißer (Oktave bzw. Nachbarton) */
    const wobbly = (t0: number, t1: number, outlier = f("g2")) => {
      const out: JudgeOutput[] = [];
      return (j: PlayJudge) => {
        for (let t = t0, k = 0; t < t1; t += STEP, k++) {
          const freq = k % 6 === 5 ? outlier : f("g1", 30 * Math.sin((2 * Math.PI * 5 * t) / 1000));
          out.push(j.push({ t, freq, clarity: 0.95 }));
        }
        return out;
      };
    };
    it("±30 Cent mit einzelnen Oktav-Ausreißern: richtig, kein Fehler", () => {
      const j = new PlayJudge();
      j.newCard(note("g1").midi, 0);
      const o = wobbly(500, 1500)(j);
      expect(events(o)).toEqual(["correct"]);
      // ungefähr nach der Haltedauer (300 ms) plus Ausgabe des Medians (50 ms)
      const at = o.findIndex((x) => x.event === "correct") * STEP + 500;
      expect(at).toBeLessThan(900);
      // Anzeige bleibt beim gesuchten Ton
      expect(o.filter((x) => x.heard).every((x) => x.heard!.midi === note("g1").midi)).toBe(true);
    });
    it("Ausreißer auf den Nachbarton: weiterhin richtig, kein Fehler", () => {
      const j = new PlayJudge();
      j.newCard(note("g1").midi, 0);
      expect(events(wobbly(500, 1500, f("a1"))(j))).toEqual(["correct"]);
    });
    it("Einzelaussetzer (jeder 6. Frame unklar, zu leise oder über 2300 Hz) starten die Haltedauer nicht neu", () => {
      const gappy = (id: string, n: number) => (j: PlayJudge) => {
        const out: JudgeOutput[] = [];
        for (let t = 500, k = 0; t < 1500; t += STEP, k++) {
          const gap = k % 6 >= 6 - n;
          const freq = gap ? [f(id), null, 2400][Math.floor(k / 6) % 3] : f(id);
          out.push(j.push({ t, freq, clarity: gap && freq !== null && freq < 2300 ? 0.6 : 0.95 }));
        }
        return out;
      };
      const j = new PlayJudge();
      j.newCard(note("d2").midi, 0);
      const o = gappy("d2", 1)(j);
      expect(events(o)).toEqual(["correct"]);
      expect(o.findIndex((x) => x.event === "correct") * STEP + 500).toBeLessThan(900);
      // zwei Aussetzer in Folge (50 ms) sind weiterhin eine Lücke: die Haltedauer beginnt neu
      const j2 = new PlayJudge();
      j2.newCard(note("d2").midi, 0);
      expect(events(gappy("d2", 2)(j2))).toEqual([]);
    });
    it("ohne Glättung hätte jeder Ausreißer die Haltedauer neu beginnen lassen", () => {
      const j = new PlayJudge({ medianFrames: 1 });
      j.newCard(note("g1").midi, 0);
      expect(events(wobbly(500, 1500)(j))).toEqual([]);
    });
    it("Nachklang der vorigen Karte, dann direkt der wackelnde richtige Ton: richtig, kein Fehler", () => {
      const j = new PlayJudge();
      j.newCard(note("a1").midi, 0);
      const o = [...play(j, f("a1"), 0, 800)];
      expect(events(o)).toEqual(["correct"]);
      j.newCard(note("g1").midi, 800);
      // a¹ klingt nach (mit Ausreißern), dann direkt g¹
      const rest = [...play(j, f("a1"), 800, 1300), ...wobbly(1300, 2000)(j)];
      expect(events(rest)).toEqual(["correct"]);
    });
  });
  it("Anzeige: gehörter Ton und Cent (geglättet, kommt um den halben Median später)", () => {
    const j = new PlayJudge();
    const o = play(j, f("fis1", -12), 0, 100);
    // Median über 5 Frames: der erste Frame kommt mit dem dritten heraus
    expect(o.slice(0, 2).every((x) => x.heard === null)).toBe(true);
    expect(o[2].heard?.midi).toBe(note("fis1").midi);
    expect(o[2].heard?.cents).toBe(-12);
  });
  describe("schneller Tonwechsel mit Übergangswerten (Rückmeldung: „GIS zwischen G und A“)", () => {
    /** 1,5 s schnell g¹–a¹–h¹–a¹ (rate Töne je Sekunde, mit Übergangswerten), danach a¹ gehalten */
    const passage = (rate: number, seed = 1) => {
      const p = fastChanges(UP_DOWN, rate, { t0: 500, t1: 2000, seed });
      const last = Math.round(12 * Math.log2(p.frames[p.frames.length - 1].freq! / 440) + 57);
      const rest = [];
      for (let t = 2000; t < 2600; t += T_STEP) {
        // erster Frame nach dem Wechsel zu a¹: Übergangswert
        const m = t === 2000 && last !== A ? (last + A) / 2 : A;
        rest.push({ t, freq: hzOf(m), clarity: 0.95, rms: 0.1 });
      }
      return [...p.frames, ...rest];
    };
    it("Übung: schnelles Umspielen vor dem gesuchten Ton – kein Fehler, kein gis¹/b¹ in der Anzeige, dann richtig", () => {
      for (const rate of [6, 7, 8, 9, 10]) {
        const j = new PlayJudge();
        j.newCard(A, 0);
        const o = passage(rate).map((fr) => j.push(fr));
        expect(events(o), `${rate} Töne/s`).toEqual(["correct"]);
        expect(o.filter((x) => x.heard && ![G, A, H].includes(x.heard.midi)), `${rate} Töne/s`).toEqual([]);
      }
    });
    it("Übung: gesuchter Ton kommt in der Passage nicht vor – trotzdem kein Fehler durch Übergangswerte", () => {
      for (const rate of [6, 8, 10]) {
        const j = new PlayJudge();
        j.newCard(note("c2").midi, 0);
        expect(events(fastChanges(UP_DOWN, rate, { t0: 500, t1: 2500 }).frames.map((fr) => j.push(fr))), `${rate} Töne/s`).toEqual([]);
        expect(j.wrongCounted).toBe(false);
      }
    });
  });
});
