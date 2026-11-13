import { describe, expect, it } from "vitest";
import { ALL_NOTES, CHART, chartNoteByMidi, fingeringDistance, freqToWrittenMidi, note, NOTES, soundingFreq, spellMidi } from "../../src/music/notes";
import { nameHtml, nameText } from "../../src/music/names";

// Grifftabelle aus docs/app-prompt.md, hier bewusst noch einmal unabhängig abgeschrieben.
const EXPECTED: Record<string, string> = {
  c1: "x xxx xxxx",
  cis1: "x xxx xxxh",
  d1: "x xxx xxxo",
  es1: "x xxx xxho",
  e1: "x xxx xxoo",
  f1: "x xxx xoxx",
  fis1: "x xxx oxxo",
  g1: "x xxx oooo",
  gis1: "x xxo xxxo",
  a1: "x xxo oooo",
  b1: "x xox xooo",
  h1: "x xoo oooo",
  c2: "x oxo oooo",
  cis2: "o xxo oooo",
  d2: "o oxo oooo",
  es2: "o oxx xxxo",
  e2: "h xxx xxoo",
  f2: "h xxx xoxo",
  fis2: "h xxx oxoo",
  g2: "h xxx oooo",
  gis2: "h xxo xooo",
  a2: "h xxo oooo",
  b2: "h xxo xxxo",
  h2: "h xxo xxoo",
  c3: "h xoo xxoo",
};

describe("Grifftabelle", () => {
  it("hat genau die 25 Töne von c¹ bis c³", () => {
    expect(CHART.map((n) => n.id)).toEqual(Object.keys(EXPECTED));
  });
  for (const [id, f] of Object.entries(EXPECTED)) {
    it(`Griff ${id}`, () => {
      expect(note(id).fingering).toBe(f.replace(/ /g, ""));
    });
  }
  it("chromatisch aufsteigend, ein Halbton Abstand", () => {
    CHART.forEach((n, i) => expect(n.midi).toBe(60 + i));
  });
  it("alle Griffe der Tabelle sind verschieden", () => {
    expect(new Set(CHART.map((n) => n.fingering)).size).toBe(25);
  });
});

describe("Namen und Lage", () => {
  it("deutsche Namen mit Oktave", () => {
    expect(CHART.map((n) => n.name + n.octave).join(" ")).toBe(
      "c1 cis1 d1 es1 e1 f1 fis1 g1 gis1 a1 b1 h1 c2 cis2 d2 es2 e2 f2 fis2 g2 gis2 a2 b2 h2 c3",
    );
  });
  it("Schreibweise in der Notenzeile folgt dem Namen", () => {
    expect(note("es1")).toMatchObject({ letter: "e", alter: -1 });
    expect(note("cis1")).toMatchObject({ letter: "c", alter: 1 });
    expect(note("b1")).toMatchObject({ letter: "h", alter: -1 });
    expect(note("b2")).toMatchObject({ letter: "h", alter: -1 });
    expect(note("gis2")).toMatchObject({ letter: "g", alter: 1 });
  });
  it("Lage: c¹ unter, e¹ auf der untersten Linie, c³ ganz oben", () => {
    expect(note("c1").pos).toBe(-2);
    expect(note("d1").pos).toBe(-1);
    expect(note("e1").pos).toBe(0);
    expect(note("c2").pos).toBe(5);
    expect(note("f2").pos).toBe(8);
    expect(note("a2").pos).toBe(10);
    expect(note("c3").pos).toBe(12);
  });
  it("Namen als HTML mit eigener Hochzahl, nicht mit ¹", () => {
    expect(nameHtml("fis1")).toBe('<span class="nn">fis<span class="o">1</span></span>');
    expect(nameHtml("c3")).not.toContain("³");
    expect(nameText("c3")).toBe("c³");
  });
  it("gehörte Töne in der Schreibweise der Grifftabelle", () => {
    expect([61, 63, 66, 68, 70].map((m) => spellMidi(m).name)).toEqual(["cis", "es", "fis", "gis", "b"]);
    expect(spellMidi(84)).toEqual({ name: "c", octave: 3 });
    expect(chartNoteByMidi(70)?.id).toBe("b1");
  });
});

describe("Andere Schreibweisen", () => {
  const pairs: [string, string][] = [
    ["dis1", "es1"],
    ["dis2", "es2"],
    ["as1", "gis1"],
    ["as2", "gis2"],
    ["ais1", "b1"],
    ["ais2", "b2"],
  ];
  for (const [alt, p] of pairs) {
    it(`${alt} hat den Griff von ${p} und klingt gleich`, () => {
      expect(note(alt).fingering).toBe(note(p).fingering);
      expect(note(alt).midi).toBe(note(p).midi);
      expect(note(alt).partner).toBe(p);
    });
  }
  it("Schreibweise: dis mit ♯ auf d, as mit ♭ auf a, ais mit ♯ auf a", () => {
    expect(note("dis1")).toMatchObject({ letter: "d", alter: 1, pos: -1 });
    expect(note("as1")).toMatchObject({ letter: "a", alter: -1, pos: 3 });
    expect(note("ais2")).toMatchObject({ letter: "a", alter: 1, pos: 10 });
  });
  it("keine des und ges", () => {
    expect(NOTES.des1).toBeUndefined();
    expect(NOTES.ges1).toBeUndefined();
    expect(ALL_NOTES).toHaveLength(31);
  });
});

describe("Frequenzen", () => {
  it("Sopranflöte klingt eine Oktave höher: c¹ ≈ 523,25 Hz", () => {
    expect(soundingFreq(note("c1"))).toBeCloseTo(523.25, 2);
    expect(soundingFreq(note("a1"))).toBeCloseTo(880, 6);
    expect(soundingFreq(note("c3"))).toBeCloseTo(2093.0, 1);
  });
  it("Stimmton verschiebt alles", () => {
    expect(soundingFreq(note("a1"), 442)).toBeCloseTo(884, 6);
  });
  it("Rückrechnung Frequenz → notierte Note", () => {
    for (const n of CHART) expect(freqToWrittenMidi(soundingFreq(n))).toBeCloseTo(n.midi, 6);
  });
  it("alle Töne im Erkennungsbereich 480–2300 Hz", () => {
    for (const n of CHART) {
      expect(soundingFreq(n)).toBeGreaterThan(480);
      expect(soundingFreq(n)).toBeLessThan(2300);
    }
  });
  it("Griffabstand zählt verschiedene Löcher", () => {
    expect(fingeringDistance(note("g1").fingering, note("a1").fingering)).toBe(1);
    expect(fingeringDistance(note("g1").fingering, note("g2").fingering)).toBe(1);
  });
});
