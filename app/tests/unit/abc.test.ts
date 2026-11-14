import { describe, expect, it } from "vitest";
import { abcText, lyricTokens, parseAbc } from "../../src/songs/abc";
import { baseTempo, secPerQuarter } from "../../src/songs/tempo";
import { buildTimeline, playOrder } from "../../src/songs/timeline";
import { abc, abcError, bars, events, syllables } from "./abc-helpers";

describe("ABC: Stücke und Kopffelder", () => {
  it("X: trennt Stücke; Leerzeilen beenden ein Stück, Text vor dem ersten X: wird übergangen", () => {
    const r = parseAbc("% Sammlung\nZ:Dateikopf\n\nX:1\nT:Eins\nK:C\nCDEF|\n\nX:7\nT:Zwei\nK:G\nGABc|\n");
    expect(r.errors).toEqual([]);
    expect(r.tunes.map((t) => [t.number, t.title, t.line])).toEqual([
      [1, "Eins", 4],
      [7, "Zwei", 9],
    ]);
  });

  it("L:, M: und Q: im Dateikopf gelten für alle Stücke; eigene Felder des Stücks gehen vor", () => {
    const r = parseAbc("%abc-2.1\nL:1/4\nM:3/4\nQ:1/4=80\n\nX:1\nT:Eins\nK:G\nG A B|c2 B|]\n\nX:2\nT:Zwei\nL:1/8\nK:G\nG2 A2 B2|]\n");
    expect(r.errors).toEqual([]);
    const [a, b] = r.tunes;
    expect(a.song.time).toEqual({ num: 3, den: 4 });
    expect(bars(a.song)).toEqual(["g1:1 a1:1 h1:1", "c2:2 h1:1"]);
    expect(a.song.tempo).toEqual({ beat: 1, bpm: 80 });
    expect(a.hints).toEqual([]);
    expect(bars(b.song)).toEqual(["g1:1 a1:1 h1:1"]);
  });

  it("freier Text zwischen %%begintext und %%endtext ist keine Musik", () => {
    const t = abc("C D E F|\n%%begintext\nDies ist ein Text, frei geschrieben.\n%%endtext\nG A B c|]");
    expect(bars(t.song)).toEqual(["c1:1 d1:1 e1:1 f1:1", "g1:1 a1:1 h1:1 c2:1"]);
    expect(t.omitted).toEqual([]);
  });

  it("ohne X: ist der ganze Text ein Stück, Leerzeilen darin stören nicht", () => {
    const r = parseAbc("T:Eingefügt\nM:2/4\nL:1/8\nK:D\nDEFG|\n\nABcd|]\n");
    expect(r.tunes.length).toBe(1);
    expect(bars(r.tunes[0].song)).toEqual(["d1:0.5 e1:0.5 fis1:0.5 g1:0.5", "a1:0.5 h1:0.5 cis2:0.5 d2:0.5"]);
  });

  it("nur Noten ohne Kopf: C-Dur und 4/4 angenommen, mit Hinweis", () => {
    const t = parseAbc("CDEF|GABc|").tunes[0];
    expect(t.title).toBe("Ohne Titel");
    expect(t.song.key.name).toBe("C");
    expect(t.song.time).toEqual({ num: 4, den: 4 });
    expect(t.hints).toContain("Keine Tonart (K:) angegeben – C-Dur angenommen");
    expect(t.hints).toContain("Keine Taktart (M:) angegeben – 4/4 angenommen");
  });

  it("Text nach der Leerzeile, der zu keinem Stück gehört, wird gemeldet", () => {
    const t = parseAbc("X:1\nT:A\nK:C\nCDEF|\n\nGABc|\n").tunes[0];
    expect(t.hints).toContain("Zeilen nach der Leerzeile (ab Zeile 6) gehören zu keinem Stück und wurden nicht gelesen");
  });

  it("T: Titel und Untertitel, Umlaut-Schreibweisen; ohne T: „Stück n“", () => {
    const t = abc("C4|", "T:Fr\\\"uhling, &Auml;pfel\nM:4/4\nK:C");
    expect(t.song.title).toBe("Test");
    expect(t.song.subtitle).toBe("Frühling, Äpfel");
    expect(parseAbc("X:3\nK:C\nC4|").tunes[0].title).toBe("Stück 3");
    expect(abcText("\\ss \\'e \\`a \\oa \\u00e9 &szlig; 100\\%")).toBe("ß é à å é ß 100%");
  });

  it("C:, O: und S: werden zur Quellenangabe; andere Felder werden übergangen", () => {
    const t = abc("C4|", "C:Trad.\nO:Irland\nS:aus einer Sammlung\nR:reel\nZ:abc\nN:Notiz\nH:Geschichte\nB:Buch\nD:Platte\nI:linebreak $\nM:4/4\nK:C");
    expect(t.song.credit).toBe("Trad., Irland, aus einer Sammlung");
    expect(t.omitted).toEqual([]);
  });

  it("M: 3/4, 6/8, C (4/4), C| (2/2), 2+3/8; ungültig mit Zeilenangabe", () => {
    expect(abc("CDE|", "M:3/4\nL:1/4\nK:C").song.time).toEqual({ num: 3, den: 4 });
    expect(abc("CDEF|", "M:C\nL:1/4\nK:C").song.time).toEqual({ num: 4, den: 4 });
    expect(abc("C2D2|", "M:C|\nL:1/4\nK:C").song.time).toEqual({ num: 2, den: 2 });
    expect(abc("CDEFG|", "M:2+3/8\nL:1/8\nK:C").song.time).toEqual({ num: 5, den: 8 });
    expect(abcError("CDE|", "M:3/5\nK:C")).toBe("Zeile 3: Ungültige Taktart „M:3/5“ (Beispiele: 3/4, 6/8, C)");
    const free = abc("CDEFGA|", "M:none\nL:1/4\nK:C");
    expect(free.hints).toContain("Ohne Taktart (M:none) – als 4/4 gelesen");
  });

  it("L: fehlt → nach ABC-Regel: unter 3/4 Sechzehntel, sonst Achtel", () => {
    expect(events(abc("CDEF CDEF|", "M:2/4\nK:C").song)[0]).toBe("c1:0.25");
    expect(events(abc("CDE FGA|", "M:3/4\nK:C").song)[0]).toBe("c1:0.5");
    expect(events(abc("CDE FGA|", "M:6/8\nK:C").song)[0]).toBe("c1:0.5");
    expect(events(abc("CDEF GABc|", "K:C").song)[0]).toBe("c1:0.5"); // ohne M:
    expect(events(abc("CDEF|", "M:4/4\nL:1/4\nK:C").song)[0]).toBe("c1:1");
    expect(abcError("C|", "L:1/3\nK:C")).toBe("Zeile 3: Ungültige Grundnotenlänge „L:1/3“ (Beispiel: L:1/8)");
  });

  it("K: Dur-Tonarten mit Kreuzen und Be", () => {
    const k = (v: string) => abc("C|", `K:${v}`).song;
    expect([k("G").key.name, k("G").keyName, k("G").key.fifths]).toEqual(["G", "G-Dur", 1]);
    expect([k("Bb").key.name, k("Bb").keyName, k("Bb").key.fifths]).toEqual(["B", "B-Dur", -2]);
    expect([k("F#").key.name, k("F#").keyName, k("F#").key.fifths]).toEqual(["Fis", "Fis-Dur", 6]);
    expect([k("Eb").key.name, k("Ebmaj").keyName, k("Eb major").key.fifths]).toEqual(["Es", "Es-Dur", -3]);
    expect(k("Cb").key.fifths).toBe(-7);
    expect(k("D").key.alter).toEqual({ f: 1, c: 1 });
    expect(k("D").key.mode).toBe("major");
  });

  it("K: Moll in allen Schreibweisen", () => {
    for (const v of ["Am", "Amin", "A minor", "Amoll".slice(0, 2), "A aeolian", "AAeo"]) {
      const s = abc("C|", `K:${v}`).song;
      expect([s.key.name, s.key.minor, s.key.fifths, s.keyName, s.key.mode, s.key.tonic]).toEqual(["a", true, 0, "a-Moll", "minor", "a"]);
    }
    expect(abc("C|", "K:F#m").song.keyName).toBe("fis-Moll");
    expect(abc("C|", "K:Ebm").song.key).toMatchObject({ name: "es", fifths: -6 });
  });

  it("K: Kirchentonarten wie im Heft: Vorzeichnung der Dur-Tonart, Name mit Modus", () => {
    const k = (v: string) => abc("C|", `K:${v}`).song;
    expect([k("Ador").key.name, k("Ador").keyName, k("Ador").key.minor, k("Ador").key.mode]).toEqual(["G", "a-Moll (dorisch)", false, "dorian"]);
    expect([k("D Dorian").key.name, k("D Dorian").keyName]).toEqual(["C", "d-Moll (dorisch)"]);
    expect([k("Edor").key.name, k("EDor").keyName]).toEqual(["D", "e-Moll (dorisch)"]);
    expect([k("Gmix").key.name, k("G Mixolydian").keyName]).toEqual(["C", "G-Dur (mixolydisch)"]);
    expect([k("Ephr").key.name, k("E phrygian").keyName]).toEqual(["C", "e-Moll (phrygisch)"]);
    expect([k("Flyd").key.name, k("F Lydian").keyName]).toEqual(["C", "F-Dur (lydisch)"]);
    expect([k("Bloc").key.name, k("B locrian").keyName]).toEqual(["C", "h-Moll (lokrisch)"]);
    expect(k("Amix").key.fifths).toBe(2);
    expect(k("Bdor").key.tonic).toBe("h");
  });

  it("K: none, leer, mit Schlüssel und eigenen Vorzeichen", () => {
    expect(abc("C|", "K:none").song.key.fifths).toBe(0);
    expect(abc("C|", "K:").song.key.fifths).toBe(0);
    expect(abc("C|", "K:G clef=treble").song.key.name).toBe("G");
    expect(abc("C|", "K:G treble").song.key.name).toBe("G");
    const ex = abc("FcB|", "K:D =c _B");
    expect(ex.song.key.alter).toEqual({ f: 1, h: -1 });
    expect(ex.song.key.signature).toEqual([
      { accidental: "sharp", pos: 8 },
      { accidental: "flat", pos: 4 },
    ]);
    expect(events(ex.song)).toEqual(["fis1:0.5", "c2:0.5", "b1:0.5"]);
    expect(ex.song.keyName).toBe("D-Dur mit eigenen Vorzeichen");
    expect(events(abc("FB|", "K:D exp _B").song)).toEqual(["f1:0.5", "b1:0.5"]);
  });

  it("K: unbekannt oder mit zu vielen Vorzeichen → Fehler mit Zeile", () => {
    expect(abcError("C|", "K:Xyz")).toBe("Zeile 3: Unbekannte Tonart „K:Xyz“ (Beispiele: G, Em, A dorian, D mix)");
    expect(abcError("C|", "K:Gfoo")).toBe("Zeile 3: Unbekannte Tonart „K:Gfoo“ (Beispiele: G, Em, A dorian, D mix)");
    expect(abcError("C|", "K:A#")).toBe("Zeile 3: Tonart „K:A#“ hat mehr als sieben Vorzeichen");
    expect(abcError("C|", "K:HP")).toBe("Zeile 3: Dudelsack-Tonart „K:HP“ wird nicht unterstützt");
  });

  it("Q: Tempo, auch mit Text, Summe und alter Form; ohne Zahl kein Tempo", () => {
    expect(abc("C|", "Q:1/4=100\nK:C").song.tempo).toEqual({ beat: 1, bpm: 100 });
    expect(abc("C|", "Q:3/8=60\nK:C").song.tempo).toEqual({ beat: 1.5, bpm: 60 });
    expect(abc("C|", 'Q:"Allegro" 1/2=80\nK:C').song.tempo).toEqual({ beat: 2, bpm: 80 });
    expect(abc("C|", "Q:1/8 3/8=40\nK:C").song.tempo).toEqual({ beat: 2, bpm: 40 });
    expect(abc("C|", "L:1/8\nQ:200\nK:C").song.tempo).toEqual({ beat: 0.5, bpm: 200 }); // alte Form: L-Noten pro Minute
    expect(abc("C|", 'Q:"Andante"\nK:C').song.tempo).toBeUndefined();
  });

  it("Q: bestimmt das Grundtempo, umgerechnet in die Zählzeit der Taktart", () => {
    const s = abc("CDE FGA|", "M:6/8\nL:1/8\nQ:1/8=180\nK:C").song;
    expect(baseTempo(s)).toEqual({ bpm: 60, beat: 1.5, quartersPerMin: 90 });
    expect(secPerQuarter(s)).toBeCloseTo(60 / 90);
    // ohne Q: wie bei den Heft-Liedern nach Taktart
    expect(baseTempo(abc("CDE FGA|", "M:6/8\nL:1/8\nK:C").song).bpm).toBe(60);
  });

  it("Q: mitten im Stück wird weggelassen und gemeldet", () => {
    const t = abc("CDEF|[Q:1/4=140]GABc|", "Q:1/4=90\nK:C");
    expect(t.song.tempo).toEqual({ beat: 1, bpm: 90 });
    expect(t.omitted).toEqual(["Tempowechsel im Stück (1)"]);
  });

  it("Kennung, Kapitel und Lied-Grundwerte", () => {
    const s = abc("CDEF|");
    expect(s.song.id).toBe("abc-test");
    expect(s.song.chapter).toBe("Eigene Lieder");
    expect(s.song.stanzaCols).toBeNull();
    expect(s.song.hasLyrics).toBe(false);
  });
});

describe("ABC: Noten", () => {
  it("Oktavlage: C = c¹ (MIDI 60), c = c², c' = c³, C, = c (kleine Oktave)", () => {
    const s = abc("C c c' C, | C,, c'' B, B |", "L:1/8\nK:C").song;
    expect(s.notes.map((n) => [n.pitch.id, n.pitch.midi])).toEqual([
      ["c1", 60],
      ["c2", 72],
      ["c3", 84],
      ["c0", 48],
      ["c-1", 36],
      ["c4", 96],
      ["h0", 59],
      ["h1", 71],
    ]);
    expect(s.notes.map((n) => n.pitch.pos)).toEqual([-2, 5, 12, -9, -16, 19, -3, 4]);
  });

  it("Vorzeichen ^ _ = gelten bis zum Taktende, nur in derselben Oktave", () => {
    const s = abc("^F F f _B | F B =B B |", "L:1/8\nK:C").song;
    expect(events(s)).toEqual(["fis1:0.5", "fis1:0.5", "f2:0.5", "b1:0.5", "f1:0.5", "h1:0.5", "h1:0.5", "h1:0.5"]);
    expect(s.notes.map((n) => n.accidental)).toEqual(["sharp", null, null, "flat", null, null, null, null]);
  });

  it("Tonart gilt, Auflösungszeichen = hebt sie bis zum Taktende auf", () => {
    const s = abc("F =F F ^F | F G |", "L:1/4\nK:G").song;
    expect(events(s)).toEqual(["fis1:1", "f1:1", "f1:1", "fis1:1", "fis1:1", "g1:1"]);
    expect(s.notes.map((n) => n.accidental)).toEqual([null, "natural", null, "sharp", null, null]);
    expect(abc("B =B _B B|", "K:F").song.notes.map((n) => [n.pitch.id, n.accidental])).toEqual([
      ["b1", null],
      ["h1", "natural"],
      ["b1", "flat"],
      ["b1", null],
    ]);
  });

  it("Doppelkreuz und Doppel-Be werden als einfacher Ton geschrieben (mit Hinweis)", () => {
    const t = abc("^^C D __E E|", "L:1/4\nK:C");
    expect(events(t.song)).toEqual(["d1:1", "d1:1", "d1:1", "d1:1"]);
    expect(t.hints).toContain("Doppelkreuze und Doppel-Be als einfacher Ton geschrieben (3)");
  });

  it("eis, his, ces, fes behalten ihre Schreibweise", () => {
    expect(abc("^E ^B _C _F|", "K:C").song.notes.map((n) => [n.pitch.name, n.pitch.midi])).toEqual([
      ["eis", 65],
      ["his", 72],
      ["ces", 59],
      ["fes", 64],
    ]);
  });

  it("Längen: 2, /2, /, //, 3/2, 3/, 4 (L:1/8)", () => {
    const s = abc("C2 C/2 C/ C3/2 C3/ C4 C3 C6|", "M:none\nL:1/8\nK:C").song;
    expect(s.notes.map((n) => [n.q, n.dur, n.dots])).toEqual([
      [1, 4, 0],
      [0.25, 16, 0],
      [0.25, 16, 0],
      [0.75, 8, 1],
      [0.75, 8, 1],
      [2, 2, 0],
      [1.5, 4, 1],
      [3, 2, 1],
    ]);
    expect(abc("C// C/4 C3/4|", "M:none\nL:1/4\nK:C").song.notes.map((n) => [n.q, n.dur, n.dots])).toEqual([
      [0.25, 16, 0],
      [0.25, 16, 0],
      [0.75, 8, 1],
    ]);
  });

  it("Längen ohne eigene Note werden als gebundene Noten geschrieben; Pausen als mehrere Pausen", () => {
    const t = abc("C5 z5 |", "M:5/4\nL:1/8\nK:C");
    expect(events(t.song)).toEqual(["c1:2~", "c1:0.5", "r:2", "r:0.5"]);
    expect(t.song.notes[1].tiedFromPrev).toBe(true);
    expect(t.hints).toContain("Längen, die es als einzelne Note nicht gibt, aufgeteilt (gebundene Noten bzw. mehrere Pausen) (2)");
    expect(buildTimeline(t.song).tones.map((x) => [x.start, x.dur])).toEqual([[0, 2.5]]);
  });

  it("Längen kürzer als ein Sechzehntel → Fehler mit Zeile", () => {
    expect(abcError("C/4 D|", "L:1/8\nK:C")).toBe("Zeile 5: Notenlänge kürzer als ein Sechzehntel wird nicht unterstützt");
  });

  it("gebrochene Rhythmen > < >> <<", () => {
    expect(events(abc("C>D E<F|", "M:2/4\nL:1/8\nK:C").song)).toEqual(["c1:0.75", "d1:0.25", "e1:0.25", "f1:0.75"]);
    expect(events(abc("C>>D E<<F|", "L:1/4\nK:C").song)).toEqual(["c1:1.5~", "c1:0.25", "d1:0.25", "e1:0.25", "f1:1.5~", "f1:0.25"]);
    const s = abc("C>D|", "M:1/4\nL:1/8\nK:C").song;
    expect(s.notes.map((n) => [n.dur, n.dots])).toEqual([
      [8, 1],
      [16, 0],
    ]);
  });

  it("Pausen z, x (unsichtbar → Pause), Z (ganzer Takt), Z3 (drei Takte)", () => {
    const s = abc("z C x2 | Z | Z3 | C4 |", "M:4/4\nL:1/4\nK:C").song;
    expect(bars(s)).toEqual(["r:1 c1:1 r:2", "r:4", "r:4", "r:4", "r:4", "c1:4"]);
    expect(abc("Z|C3|", "M:3/4\nL:1/4\nK:C").song.bars[0].events[0]).toMatchObject({ kind: "rest", dur: 2, dots: 1, q: 3 });
  });

  it("Taktstriche | || |] [|: || mitten im Stück doppelt, am Ende Schluss", () => {
    const s = abc("[| CDEF | GABc || cBAG |] FEDC || EDCC |]", "K:C").song;
    expect(s.bars.map((b) => [b.barline, !!b.double])).toEqual([
      ["single", false],
      ["single", true],
      ["final", false],
      ["single", true],
      ["final", false],
    ]);
    expect(abc("CDEF || GABc ||").song.bars.map((b) => b.barline)).toEqual(["single", "final"]);
    expect(abc("CDEF | GABc").song.bars[1].barline).toBe("none");
    expect(abc("CDEF [|] GABc |]").song.bars.map((b) => [b.barline, !!b.double])).toEqual([["single", false], ["final", false]]);
  });

  it("Zeilenumbrüche, Zeilenfortsetzung \\ und Kommentare %", () => {
    const s = abc("CDEF | GA \\ % weiter in der nächsten Zeile\nBc | % Kommentar\n% ganze Zeile Kommentar\n%%MIDI program 74\ncBAG |", "L:1/4\nK:C").song;
    expect(bars(s)).toEqual(["c1:1 d1:1 e1:1 f1:1", "g1:1 a1:1 h1:1 c2:1", "c2:1 h1:1 a1:1 g1:1"]);
    expect(s.bars.map((b) => [b.line, b.breakAfter])).toEqual([
      [0, false],
      [0, true],
      [1, true],
    ]);
    // Umbruch mitten im Takt
    const t = abc("CD\nEF|", "K:C").song;
    expect(t.bars[0].breakInside).toBe(1);
  });

  it("Halte­bogen -: auch über den Taktstrich, behält das Vorzeichen; im Zeitplan ein Ton", () => {
    const s = abc("C2 ^F2- | F2 F2 |", "L:1/4\nK:C").song;
    expect(events(s)).toEqual(["c1:2", "fis1:2~", "fis1:2", "fis1:2"]);
    expect(s.notes.map((n) => n.tiedFromPrev)).toEqual([false, false, true, false]);
    expect(s.notes.map((n) => n.accidental)).toEqual([null, "sharp", "sharp", null]);
    expect(buildTimeline(s).tones.map((t) => [t.start, t.dur, t.midi])).toEqual([
      [0, 2, 60],
      [2, 4, 66],
      [6, 2, 66],
    ]);
  });

  it("Haltebogen zu einem anderen Ton oder vor einer Pause wird weggelassen (Hinweis)", () => {
    const t = abc("C2- D2 | E2- z2 |");
    expect(t.song.notes.map((n) => n.tie)).toEqual([false, false, false]);
    expect(t.hints).toEqual(["Haltebogen zwischen verschiedenen Tönen weggelassen (1)", "Haltebogen vor einer Pause weggelassen (1)"]);
  });

  it("Bindebögen ( ): Anfang und Ende; ineinander nur der äußere; über einer Note keiner", () => {
    const s = abc("(CDE) F | ((GA)B) (c) |");
    expect(s.song.notes.map((n) => (n.slurStart ? "(" : "") + n.pitch.id + (n.slurEnd ? ")" : ""))).toEqual(["(c1", "d1", "e1)", "f1", "(g1", "a1", "h1)", "c2"]);
    expect(s.hints).toEqual(["Bindebögen ineinander: nur der äußere (1)"]);
    expect(abc(".(CD) EF|").song.notes[0].slurStart).toBe(true);
  });

  it("Triolen (3: drei Noten in der Zeit von zwei, Klammer-Angaben am Modell", () => {
    const s = abc("(3CDE F2 (3GAB c2|", "M:4/4\nL:1/8\nK:C").song;
    expect(s.bars[0].length).toBe(4);
    const tri = s.notes.slice(0, 3);
    expect(tri.map((n) => [n.dur, n.dots])).toEqual([
      [8, 0],
      [8, 0],
      [8, 0],
    ]);
    expect(tri.map((n) => +n.q.toFixed(4))).toEqual([0.3333, 0.3333, 0.3333]);
    expect(tri.map((n) => n.tuplet)).toEqual([
      { p: 3, q: 2, start: true, end: false },
      { p: 3, q: 2, start: false, end: false },
      { p: 3, q: 2, start: false, end: true },
    ]);
    expect(s.notes[3].tuplet).toBeUndefined();
    expect(s.notes[3].offset).toBeCloseTo(1);
    const tl = buildTimeline(s);
    expect(tl.tones.map((t) => +t.start.toFixed(4))).toEqual([0, 0.3333, 0.6667, 1, 2, 2.3333, 2.6667, 3]);
    expect(tl.total).toBeCloseTo(4);
  });

  it("Triolen allgemein: (3:2:2 mit Pause, (2 in 6/8, (5 in 4/4", () => {
    const a = abc("(3:2:2C2 z | D2|", "M:2/4\nL:1/8\nK:C").song;
    expect(a.bars[0].events.map((e) => [e.kind, +e.q.toFixed(4), e.tuplet?.end])).toEqual([
      ["note", 0.6667, false],
      ["rest", 0.3333, true],
    ]);
    expect(a.bars[0].length).toBeCloseTo(1);
    // in 6/8: (2 = zwei Noten in der Zeit von drei
    expect(abc("(2CD E|", "M:3/8\nL:1/8\nK:C").song.bars[0].events.map((e) => e.q)).toEqual([0.75, 0.75, 0.5]);
    expect(abc("(5CDEFG A2 B2|", "M:3/4\nL:1/8\nK:C").song.bars[0].length).toBeCloseTo(3);
  });

  it("Tonwechsel im Stück: [K:…] mit neuer Vorzeichnung, [M:…] als Taktwechsel, [L:…]", () => {
    const s = abc("F G A B | [K:D] F C D E | [M:3/4] F G A | [L:1/8] FG AB cd |", "M:4/4\nL:1/4\nK:C").song;
    expect(events(s).slice(4, 6)).toEqual(["fis1:1", "cis1:1"]);
    expect(s.bars[1].keyChange?.name).toBe("D");
    expect(s.bars[0].keyChange).toBeUndefined();
    expect([s.bars[2].timeChange, s.bars[2].time]).toEqual([true, { num: 3, den: 4 }]);
    expect(s.bars[3].events.map((e) => e.q)).toEqual([0.5, 0.5, 0.5, 0.5, 0.5, 0.5]);
    // Feldzeilen im Stück wirken genauso
    const t = abc("CDEF|\nM:3/4\nK:G\nFGA|", "K:C").song;
    expect([t.bars[1].timeChange, t.bars[1].keyChange?.name, t.notes[4].pitch.id]).toEqual([true, "G", "fis1"]);
    // vor der ersten Note gilt das Feld als Tonart des Stücks
    const u = abc("[K:Edor]F G|", "K:C").song;
    expect([u.key.name, u.keyName, u.bars[0].keyChange, u.notes[0].pitch.id]).toEqual(["D", "e-Moll (dorisch)", undefined, "fis1"]);
  });
});

describe("ABC: Wiederholungen und Klammern", () => {
  const order = (body: string, head = "M:4/4\nL:1/4\nK:C") => playOrder(abc(body, head).song);

  it("|: :| wird ausgeschrieben; ohne |: zurück zum Anfang", () => {
    expect(order("C4 |: D4 | E4 :| F4 |]")).toEqual([0, 1, 2, 1, 2, 3]);
    expect(order("C4 | D4 :| E4 |]")).toEqual([0, 1, 0, 1, 2]);
  });

  it(":: und :|: beenden eine Wiederholung und beginnen die nächste", () => {
    expect(order("|: C4 :: D4 :|")).toEqual([0, 0, 1, 1]);
    expect(order("|: C4 :|: D4 :|")).toEqual([0, 0, 1, 1]);
    expect(order("|: C4 :||: D4 :|")).toEqual([0, 0, 1, 1]);
  });

  it("Klammern in allen Schreibweisen: [1 |1 :|2 [2 |[1 :|[2", () => {
    const want = [0, 1, 0, 2, 3];
    expect(order("|: C4 |1 D4 :|2 E4 | F4 |]")).toEqual(want);
    expect(order("|: C4 | [1 D4 :| [2 E4 | F4 |]")).toEqual(want);
    expect(order("|: C4 |[1 D4 :|[2 E4 | F4 |]")).toEqual(want);
    const s = abc("|: C4 |1 D4 :|2 E4 | F4 |]").song;
    expect(s.bars.map((b) => [b.volta, b.voltaStart, b.voltaNumbers ?? null])).toEqual([
      [null, false, null],
      [1, true, [1]],
      [2, true, [2]],
      [2, false, [2]],
    ]);
  });

  it("die letzte Klammer reicht bis zum nächsten Doppelstrich oder Wiederholungszeichen", () => {
    const s = abc("|: C4 |1 D4 | E4 :|2 F4 | G4 || A4 | B4 |]").song;
    expect(s.bars.map((b) => b.volta)).toEqual([null, 1, 1, 2, 2, null, null]);
    expect(playOrder(s)).toEqual([0, 1, 2, 0, 3, 4, 5, 6]);
  });

  it("drei Klammern und „1.–2.“: so oft wiederholt, wie die höchste Nummer sagt", () => {
    expect(order("|: C4 |1 D4 :|2 E4 :|3 F4 |]")).toEqual([0, 1, 0, 2, 0, 3]);
    expect(order("|: C4 |1-2 D4 :|3 E4 |]")).toEqual([0, 1, 0, 1, 0, 2]);
    expect(order("|: C4 |1,3 D4 :|2 E4 :|4 F4 |]")).toEqual([0, 1, 0, 2, 0, 1, 0, 3]);
    expect(abc("|: C4 |1-2 D4 :|3 E4 |]").song.bars[1].voltaNumbers).toEqual([1, 2]);
  });

  it("nur eine 1. Klammer: beim zweiten Mal übersprungen", () => {
    expect(order("|: C4 |1 D4 :| E4 |]")).toEqual([0, 1, 0, 2]);
  });

  it("Wiederholung mit Auftakt: Auftakt und geteilter Schlusstakt ergeben keinen Hinweis", () => {
    const t = abc("|: G | c3 B | A3 :|", "M:4/4\nL:1/4\nK:C");
    expect(t.hints).toEqual([]);
    expect(t.song.bars.map((b) => b.pickup)).toEqual([true, false, false]);
    expect(buildTimeline(t.song).tones.map((x) => x.start)).toEqual([0, 1, 4, 5, 8, 9, 12, 13]);
  });

  it("Fehler: Klammer ohne :|, Klammer mitten im Takt", () => {
    expect(abcError("|: C4 |1 D4 |2 E4 |]")).toBe("Zeile 6: Die Klammer „1.“ endet nicht mit einem Wiederholungszeichen :|");
    expect(abcError("C2 [1 D2 :|")).toBe("Zeile 6: Klammer mitten im Takt (sie muss direkt nach einem Taktstrich stehen)");
  });
});

describe("ABC: Liedtext aus w:", () => {
  it("Silben mit -, Wörter mit Leerzeichen; Pausen bekommen keine Silbe", () => {
    const s = abc("C D z E | F4 |\nw: Al-le mei-ne", "K:C").song;
    expect(syllables(s)).toEqual(["Al-", "le", "mei-", "ne"]);
    expect(s.hasLyrics).toBe(true);
  });

  it("_ hält die Silbe (Melisma-Linie bis zur letzten Note), * überspringt eine Note", () => {
    const s = abc("C D E F | G A B c |\nw: Hal-lo _ _ du * Welt", "K:C").song;
    expect(syllables(s)).toEqual(["Hal-", "lo", "·", "·", "du", "·", "Welt", "·"]);
    expect(s.notes[1].syllable!.extendTo).toBe(s.notes[3].id);
    expect(s.notes[4].syllable!.extendTo).toBeNull();
  });

  it("| springt zum nächsten Takt", () => {
    const s = abc("C D E F | G A B c |\nw: eins zwei | drei", "K:C").song;
    expect(syllables(s)).toEqual(["eins", "zwei", "·", "·", "drei", "·", "·", "·"]);
  });

  it("~ verbindet Wörter unter einer Note, \\- ist ein Bindestrich, -- überspringt eine Note", () => {
    const s = abc("C D E F | G A B c |\nw: Bi\\-Ba Wo~ist~er Ach--ja", "K:C").song;
    expect(syllables(s)).toEqual(["Bi-Ba", "Wo ist er", "Ach-", "·", "ja", "·", "·", "·"]);
    expect(lyricTokens("a -b")).toEqual([
      { kind: "syl", text: "a", hyphen: true },
      { kind: "skip" },
      { kind: "syl", text: "b", hyphen: false },
    ]);
  });

  it("Haltebogen und Bindebogen: wie in ABC bekommt jede Note eine Silbe (oder _)", () => {
    const s = abc("C2- C2 | (DE) F2 |\nw: lang _ Bo-_ gen", "K:C").song;
    expect(syllables(s)).toEqual(["lang", "·", "Bo-", "·", "gen"]);
    expect(s.notes[0].syllable!.extendTo).toBe(s.notes[1].id);
  });

  it("aufgeteilte Längen: die Silbe steht an der ersten Note", () => {
    const s = abc("C5 D3 |\nw: la le", "L:1/8\nK:C").song;
    expect(syllables(s)).toEqual(["la", "·", "le"]);
  });

  it("w: nach jeder Zeile oder einmal nach mehreren Zeilen; +: setzt die w:-Zeile fort", () => {
    const a = abc("CDEF|\nw: a b c d\nGABc|\nw: e f g h", "K:C").song;
    const b = abc("CDEF|\nGABc|\nw: a b c d\n+: e f g h", "K:C").song;
    expect(syllables(a)).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(syllables(b)).toEqual(syllables(a));
  });

  it("weitere w:-Zeilen unter derselben Notenzeile werden zu weiteren Strophen", () => {
    const s = abc("CDEF|\nw: Al-le mei-ne\nw: Köpf-chen in das\nw: drit-te Stro-phe\nGABc|\nw: Ent-chen schwim-men\nw: Was-ser, Schwänz-chen", "K:C").song;
    expect(syllables(s)).toEqual(["Al-", "le", "mei-", "ne", "Ent-", "chen", "schwim-", "men"]);
    expect(s.stanzas).toEqual([["Köpfchen in das", "Wasser, Schwänzchen"], ["dritte Strophe"]]);
  });

  it("W: ergibt weitere Strophen (Leerzeile oder Nummer trennt)", () => {
    const s = abc("CDEF|\nW:1. Erste Zeile\nW:zweite Zeile\nW:\nW:Dritte\nW:2. Vierte", "K:C").song;
    expect(s.stanzas).toEqual([["Erste Zeile", "zweite Zeile"], ["Dritte"], ["Vierte"]]);
  });

  it("mehr Silben als Noten → Hinweis mit Zeile", () => {
    const t = abc("CD|\nw: eins zwei drei vier", "K:C");
    expect(t.hints).toContain("Liedtext (Zeile 5): 2 Silben mehr als Noten");
  });
});

describe("ABC: Vereinfachungen und Meldungen", () => {
  it("Akkorde: nur der oberste Ton zählt, Länge von der ersten Note bzw. dahinter", () => {
    const t = abc("[CEG] [C2E2]2 [GBd]- [GBd] | [^FA]2 F2 |", "L:1/4\nK:C");
    expect(events(t.song)).toEqual(["g1:1", "e1:4", "d2:1~", "d2:1", "a1:2", "fis1:2"]);
    expect(t.omitted).toEqual(["Akkorde: nur oberster Ton (5)"]);
  });

  it("Begleitakkorde, Textanmerkungen, Verzierungen, Vorschläge werden weggelassen und gezählt", () => {
    const t = abc('"G"G "^schnell"A ~B .c | T!trill!d {ef}e +fermata+ !p!f Hg | !D.C.! u v C|', "L:1/4\nK:C");
    expect(events(t.song)).toEqual(["g1:1", "a1:1", "h1:1", "c2:1", "d2:1", "e2:1", "f2:1", "g2:1", "c1:1"]);
    expect(t.omitted).toEqual([
      "Begleitakkorde (1)",
      "Textanmerkungen über oder unter den Noten (1)",
      "Verzierungen und Vortragszeichen (9)",
      "Sprungzeichen wie D.C., Segno oder Fine (nicht ausgeschrieben) (1)",
      "Vorschläge (1)",
    ]);
  });

  it("!breath! wird zum Atemzeichen nach der Note davor; U: kann ein Kürzel dafür festlegen", () => {
    const s = abc("C D !breath! E F |", "K:C").song;
    expect(s.notes.map((n) => n.breath)).toEqual([false, true, false, false]);
    const u = abc("C D W E F|", "U:W=!breath!\nK:C").song;
    expect(u.notes.map((n) => n.breath)).toEqual([false, true, false, false]);
    expect(buildTimeline(s).tones[1].breathAfter).toBe(true);
  });

  it("mehrere Stimmen: nur die erste wird gelesen", () => {
    const t = abc("V:1\nCDEF|GABc|\nw: a b c d e f g h\nV:2\nC,D,E,F,|G,A,B,C|\nw: x x x x\nV:1\ncBAG|", "L:1/4\nV:1 name=Melodie\nV:2 name=Bass\nK:C");
    expect(bars(t.song)).toEqual(["c1:1 d1:1 e1:1 f1:1", "g1:1 a1:1 h1:1 c2:1", "c2:1 h1:1 a1:1 g1:1"]);
    expect(syllables(t.song).slice(0, 8)).toEqual(["a", "b", "c", "d", "e", "f", "g", "h"]);
    expect(t.omitted).toEqual(["weitere Stimmen (1)"]);
    const inline = abc("[V:1]CDEF|[V:2]C,D,E,F,|\n[V:1]GABc|", "L:1/4\nK:C");
    expect(bars(inline.song)).toEqual(["c1:1 d1:1 e1:1 f1:1", "g1:1 a1:1 h1:1 c2:1"]);
  });

  it("& (zweite Stimme im Takt), P: (Teilfolge) und unbekannte Zeichen werden gemeldet", () => {
    const t = abc("CDEF & C,D,E,F, | G # A @ Bc |", "L:1/4\nP:AABB\nK:C");
    expect(events(t.song)).toEqual(["c1:1", "d1:1", "e1:1", "f1:1", "g1:1", "a1:1", "h1:1", "c2:1"]);
    expect(t.omitted).toEqual(["zweite Stimme im Takt (&) (1)", "Teilfolge P: (Teile werden der Reihe nach gespielt) (1)", "unbekannte Zeichen: „#“, „@“"]);
  });

  it("Leerzeichen, Abstandhalter y, ` und $ ändern nichts", () => {
    expect(events(abc("C`D y E$F|", "L:1/8\nM:2/4\nK:C").song)).toEqual(["c1:0.5", "d1:0.5", "e1:0.5", "f1:0.5"]);
  });

  it("ungleiche Taktlängen sind kein Fehler, sondern ein Hinweis mit Takt und Zeile", () => {
    const t = abc("CDEF | GAB | cdef g | c4 |");
    expect(t.hints).toEqual(["Takt 2 (Zeile 6) ist zu kurz: 3 statt 4 Viertel", "Takt 3 (Zeile 6) ist zu lang: 5 statt 4 Viertel"]);
  });

  it("Auftakt am Anfang und kurzer Schlusstakt sind in Ordnung", () => {
    const t = abc("G | c B A G | F3 |]");
    expect(t.hints).toEqual([]);
    expect(t.song.bars[0].pickup).toBe(true);
    expect(t.song.bars[2].pickup).toBe(false);
  });
});

describe("ABC: Fehler mit Zeilenangabe", () => {
  it("nicht geschlossene Zeichen", () => {
    expect(abcError('C "G D|')).toBe("Zeile 6: Anführungszeichen „\"“ wird nicht geschlossen");
    expect(abcError("C [CEG D|")).toBe("Zeile 6: Akkord „[“ wird nicht geschlossen");
    expect(abcError("C {ga D|")).toBe("Zeile 6: Vorschlag „{“ wird nicht geschlossen");
  });

  it("Stück ohne Noten; leerer Text", () => {
    expect(abcError('"G" !trill! |')).toBe("Zeile 1: Das Stück enthält keine Noten");
    expect(parseAbc("").errors[0].message).toMatch(/^Keine ABC-Noten gefunden/);
    expect(parseAbc("% nur ein Kommentar\n").errors.length).toBe(1);
  });

  it("ein kaputtes Stück verhindert die anderen nicht", () => {
    const r = parseAbc("X:1\nT:Gut\nK:C\nCDEF|\n\nX:2\nT:Schlecht\nK:C\nC (3:0 D|\n\nX:3\nT:Auch gut\nK:G\nGABc|\n");
    expect(r.tunes.map((t) => t.title)).toEqual(["Gut", "Auch gut"]);
    expect(r.errors).toEqual([{ number: 2, title: "Schlecht", line: 9, message: "Zeile 9: Triole „(3:0“ ist unvollständig" }]);
  });
});
