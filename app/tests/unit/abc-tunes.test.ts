import { describe, expect, it } from "vitest";
import { type AbcTune, parseAbc } from "../../src/songs/abc";
import { SONGS } from "../../src/songs/library";
import type { Song } from "../../src/songs/model";
import { checkRange, pitchText, shiftOctave } from "../../src/songs/range";
import { secPerQuarter } from "../../src/songs/tempo";
import { buildTimeline, playOrder } from "../../src/songs/timeline";
import { abc, abcFile, bars, syllables } from "./abc-helpers";

/** alle Stücke einer Beispiel-Datei; die Datei muss fehlerfrei sein */
function file(name: string): AbcTune[] {
  const r = parseAbc(abcFile(name));
  expect(r.errors).toEqual([]);
  return r.tunes;
}

/** Vergleichbare Form eines Lieds: je Takt Länge, Auftakt und die Ereignisse mit allem, was klingt oder darunter steht */
function shape(s: Song) {
  return s.bars.map((b) => ({
    length: b.length,
    pickup: b.pickup,
    events: b.events.map((e) =>
      e.kind === "rest"
        ? { rest: e.q }
        : {
            midi: e.pitch.midi,
            name: e.pitch.name,
            q: e.q,
            dur: e.dur,
            dots: e.dots,
            tie: e.tie,
            slur: [e.slurStart, e.slurEnd],
            breath: e.breath,
            acc: e.accidental,
            syl: e.syllable && [e.syllable.text, e.syllable.hyphen],
          },
    ),
  }));
}

const heft = (title: string) => SONGS.find((s) => s.title === title)!;

describe("ABC: Volkslieder wie im Heft", () => {
  it("Alle meine Entchen: dieselben Noten, Atemzeichen und Silben wie im Heft", () => {
    const [t] = file("alle-meine-entchen.abc");
    expect(t.hints).toEqual([]);
    expect(t.omitted).toEqual([]);
    expect(t.range).toEqual({ ok: true, outside: [] });
    expect(shape(t.song)).toEqual(shape(heft("Alle meine Entchen")));
    expect([t.song.keyName, t.song.key.name, t.song.time]).toEqual(["G-Dur", "G", { num: 2, den: 4 }]);
    expect(t.song.credit).toBe("Volksweise");
    expect(buildTimeline(t.song).total).toBe(20);
  });

  it("Hänschen klein: Text unter den Noten wie im Heft, W: als weitere Strophen, Tempo aus Q:", () => {
    const [t] = file("haenschen-klein.abc");
    expect(t.title).toBe("Hänschen klein");
    expect(t.hints).toEqual([]);
    expect(shape(t.song)).toEqual(shape(heft("Hänschen klein")));
    expect(syllables(t.song).slice(0, 13).join(" ")).toBe("Häns- chen klein ging al- lein in die wei- te Welt hin- ein.");
    expect(t.song.notes.length).toBe(49);
    expect(t.song.notes.every((n) => n.syllable)).toBe(true);
    expect(t.song.stanzas).toEqual([
      ["Viele Jahr, trüb und klar,", "Hänschen in der Fremde war."],
      ["Eins, zwei, drei gehn vorbei,", "wissen nicht, wer das wohl sei."],
    ]);
    expect(t.song.credit).toBe("Text: Franz Wiedemann, Melodie: Volksweise");
    expect(t.song.tempo).toEqual({ beat: 1, bpm: 96 });
    expect(secPerQuarter(t.song)).toBeCloseTo(60 / 96);
    expect(t.song.bars.every((b) => b.length === 4)).toBe(true);
  });

  it("Kuckuck: Text nach zwei Notenzeilen mit +: fortgesetzt, typografischer Apostroph", () => {
    const t = file("sammlung.abc")[1];
    expect(t.title).toBe("Kuckuck, Kuckuck, ruft’s aus dem Wald");
    expect(t.hints).toEqual([]);
    expect(shape(t.song)).toEqual(shape(heft("Kuckuck, Kuckuck, ruft’s aus dem Wald")));
    expect(t.song.credit).toBe("Text: Hoffmann von Fallersleben, Melodie: Volksweise");
  });

  it("Greensleeves (A-Dorisch, 6/8): gleiche Noten wie im Heft, obwohl Akkorde und Verzierungen dazwischenstehen", () => {
    const t = file("sammlung.abc")[2];
    expect(shape(t.song)).toEqual(shape(heft("Greensleeves")));
    expect([t.song.keyName, t.song.key.name]).toEqual(["a-Moll (dorisch)", heft("Greensleeves").key.name]);
    expect(t.omitted).toEqual(["Begleitakkorde (18)", "Verzierungen und Vortragszeichen (2)", "Vorschläge (1)"]);
    expect(t.hints).toEqual([]);
    const tl = buildTimeline(t.song);
    expect(tl.total).toBe(48);
    expect(tl.bars[1].beats).toEqual([0, 1.5]);
    expect(tl.bars[0].beats).toEqual([]); // Auftakt: eine Achtel vor der Eins
    expect(tl.countIn).toEqual([0, 1.5]);
  });
});

describe("ABC: ganze Stücke", () => {
  it("The Irish Washerwoman: Jig in 6/8 mit Auftakten, Wiederholungen und 1./2. Klammer", () => {
    const [t] = file("irish-washerwoman.abc");
    const s = t.song;
    expect(t.hints).toEqual([]);
    expect(t.range.ok).toBe(true);
    expect(s.credit).toBe("Irland");
    expect(s.bars.length).toBe(19);
    expect(s.bars.map((b) => b.length)).toEqual([1, 3, 3, 3, 3, 3, 3, 3, 2, 2, 1, 3, 3, 3, 3, 3, 3, 3, 2]);
    expect(s.bars.filter((b) => b.pickup).map((b) => b.index)).toEqual([0, 10]);
    expect(s.bars.filter((b) => b.repeatStart).map((b) => b.index)).toEqual([0, 10]);
    expect(s.bars.map((b) => b.volta)).toEqual([null, null, null, null, null, null, null, null, 1, 2, null, null, null, null, null, null, null, null, null]);
    expect(s.bars[9].barline).toBe("single");
    expect(s.bars[9].double).toBe(true);
    expect(s.bars[17].events.map((e) => (e.kind === "note" ? e.pitch.id : "r"))).toEqual(["c3", "h2", "a2", "g2", "fis2", "e2"]);
    // Spielreihenfolge: A-Teil zweimal (mit Auftakt), beim zweiten Mal 2. Klammer, dann B-Teil zweimal
    expect(playOrder(s)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 0, 1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 10, 11, 12, 13, 14, 15, 16, 17, 18]);
    const tl = buildTimeline(s);
    expect(tl.total).toBe(96); // 32 Takte zu drei Vierteln
    expect(tl.tones.length).toBe(2 * (2 + 7 * 6 + 4) + 2 * (2 + 7 * 6 + 4));
    expect(tl.tones.every((x) => x.dur === 0.5)).toBe(true);
    // der Rücksprung landet wieder auf dem Auftakt d c
    expect(tl.tones.slice(46, 50).map((x) => [x.start, x.midi])).toEqual([
      [23, 67],
      [23.5, 67],
      [24, 74],
      [24.5, 72],
    ]);
    expect(tl.countIn).toEqual([0, 1.5]);
  });

  it("Drunken Sailor: D-Dorisch, Text in vier Zeilen, Tempo aus Q:", () => {
    const [t] = file("drunken-sailor.abc");
    const s = t.song;
    expect(t.hints).toEqual([]);
    expect([s.keyName, s.key.name, s.key.signature, s.key.mode, s.key.tonic]).toEqual(["d-Moll (dorisch)", "C", [], "dorian", "d"]);
    expect(s.bars.length).toBe(16);
    expect(s.bars.every((b) => b.length === 4)).toBe(true);
    expect(s.bars.map((b) => b.barline).slice(6, 8)).toEqual(["single", "single"]);
    expect(s.bars[7].double).toBe(true);
    expect(s.bars[15].barline).toBe("final");
    expect(s.notes.every((n) => n.syllable)).toBe(true);
    expect(syllables(s).slice(0, 10).join(" ")).toBe("What shall we do with the drun- ken sai- lor,");
    expect(syllables(s).slice(-6).join(" ")).toBe("ear- ly in the mor- ning!");
    expect(s.range.low.id).toBe("c1");
    expect(s.range.high.id).toBe("d2");
    expect(t.range.ok).toBe(true);
    expect(secPerQuarter(s)).toBeCloseTo(0.5);
    expect(secPerQuarter(s, 50)).toBeCloseTo(1);
    const tl = buildTimeline(s);
    expect(tl.total).toBe(64);
    expect(tl.tones.slice(0, 3).map((x) => [x.start, x.dur])).toEqual([
      [0, 1],
      [1, 0.5],
      [1.5, 0.5],
    ]);
  });

  it("Bruder Jakob: Untertitel, Quellenangabe aus C: und O:, Begleitakkorde gemeldet", () => {
    const t = file("sammlung.abc")[0];
    expect([t.number, t.title, t.song.subtitle]).toEqual([1, "Bruder Jakob", "Frère Jacques"]);
    expect(t.song.credit).toBe("Volksweise, Frankreich");
    expect(t.omitted).toEqual(["Begleitakkorde (8)"]);
    expect(bars(t.song)[4]).toBe("d2:0.5 e2:0.5 d2:0.5 c2:0.5 h1:1 g1:1");
    expect(syllables(t.song).slice(-6).join(" ")).toBe("Ding, dang, dong! Ding, dang, dong!");
    expect(t.song.tempo).toEqual({ beat: 1, bpm: 92 });
  });

  it("Sammlung: drei Stücke zur Auswahl", () => {
    expect(file("sammlung.abc").map((t) => [t.number, t.title, t.song.keyName, `${t.song.time.num}/${t.song.time.den}`])).toEqual([
      [1, "Bruder Jakob", "G-Dur", "4/4"],
      [2, "Kuckuck, Kuckuck, ruft’s aus dem Wald", "G-Dur", "3/4"],
      [3, "Greensleeves", "a-Moll (dorisch)", "6/8"],
    ]);
  });

  it("Datei mit einem kaputten Stück: das lesbare kommt durch, das andere wird mit Zeile gemeldet", () => {
    const r = parseAbc(abcFile("mit-fehler.abc"));
    expect(r.tunes.map((t) => t.title)).toEqual(["Lesbares Stück"]);
    expect(r.tunes[0].song.keyName).toBe("F-Dur");
    expect(bars(r.tunes[0].song)[1]).toBe("b1:2 a1:1");
    expect(r.errors).toEqual([
      { number: 2, title: "Kaputtes Stück", line: 12, message: "Zeile 12: Unbekannte Tonart „K:Xyz“ (Beispiele: G, Em, A dorian, D mix)" },
    ]);
  });

  it("alle Beispiel-Dateien: Zeitplan passt zu den Takten in Spielreihenfolge", () => {
    for (const name of ["alle-meine-entchen.abc", "haenschen-klein.abc", "irish-washerwoman.abc", "drunken-sailor.abc", "sammlung.abc"]) {
      for (const t of file(name)) {
        const tl = buildTimeline(t.song);
        const sum = playOrder(t.song).reduce((a, i) => a + t.song.bars[i].length, 0);
        expect(tl.total).toBeCloseTo(sum);
        for (const x of tl.tones) expect(x.dur).toBeGreaterThan(0);
        // jede Note kommt im Zeitplan vor
        const ids = new Set(tl.tones.flatMap((x) => x.ids));
        expect(t.song.notes.every((n) => ids.has(n.id))).toBe(true);
      }
    }
  });
});

describe("ABC: Tonumfang der Sopranflöte", () => {
  it("eine Oktave zu tief: Vorschlag +12 und Verschieben", () => {
    const t = abc("C,D,E,F,|G,A,B,C|");
    expect(t.range.ok).toBe(false);
    expect(t.range.shift).toBe(12);
    expect(t.range.outside.map((o) => o.text)).toEqual(["c", "d", "e", "f", "g", "a", "h"]);
    const up = shiftOctave(t.song, 12);
    expect(checkRange(up)).toEqual({ ok: true, outside: [] });
    expect(up.notes.map((n) => n.pitch.id)).toEqual(["c1", "d1", "e1", "f1", "g1", "a1", "h1", "c2"]);
    expect(up.notes[0].pitch.pos).toBe(t.song.notes[0].pitch.pos + 7);
    expect(up.bars[0].events[0]).toBe(up.notes[0]);
    expect([up.range.low.id, up.range.high.id]).toEqual(["c1", "c2"]);
    // das Original bleibt
    expect(t.song.notes[0].pitch.id).toBe("c0");
    expect(buildTimeline(up).tones.map((x) => x.midi)).toEqual([60, 62, 64, 65, 67, 69, 71, 72]);
  });

  it("zu hoch: Vorschlag −12; d³ passt noch", () => {
    const t = abc("c'd'e'f'|");
    expect(t.range).toMatchObject({ ok: false, shift: -12 });
    expect(t.range.outside.map((o) => [o.id, o.text])).toEqual([
      ["e3", "e³"],
      ["f3", "f³"],
    ]);
    expect(checkRange(shiftOctave(t.song, -12)).ok).toBe(true);
    expect(abc("c'd'|").range.ok).toBe(true);
  });

  it("zu weit für jede Oktave: nur die Liste der Töne außerhalb", () => {
    const t = abc("C, ^F c e'|");
    expect(t.range.ok).toBe(false);
    expect(t.range.shift).toBeUndefined();
    expect(t.range.outside.map((o) => o.text)).toEqual(["c", "e³"]);
  });

  it("deutsche Namen: kleine Oktave klein, große Oktave groß, Kontra mit Index", () => {
    expect([pitchText("h", 0), pitchText("h", -1), pitchText("c", -2), pitchText("fis", 1), pitchText("d", 3)]).toEqual(["h", "H", "C₁", "fis¹", "d³"]);
    expect(abc("B,,4|").range.outside.map((o) => o.text)).toEqual(["H"]);
  });

  it("die Heft-Lieder liegen alle im Umfang (Kontrolle der Grenzen)", () => {
    for (const s of SONGS) expect(checkRange(s).outside).toEqual([]);
  });
});
