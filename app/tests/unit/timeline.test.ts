import { describe, expect, it } from "vitest";
import { SONGS, songById } from "../../src/songs/library";
import { buildTimeline, fromBarTimeline, playOrder, sectionTimeline } from "../../src/songs/timeline";
import { song } from "./songs-helpers";

const tones = (music: string, extra = {}) => buildTimeline(song(music, extra)).tones.map((t) => [t.start, t.dur, t.midi]);

describe("Zeitplan", () => {
  it("Dauern und Punkte", () => {
    expect(tones("c'4. d'8 e'2 | f'16 g'16 a'8 h'4 c''2 ||")).toEqual([
      [0, 1.5, 60],
      [1.5, 0.5, 62],
      [2, 2, 64],
      [4, 0.25, 65],
      [4.25, 0.25, 67],
      [4.5, 0.5, 69],
      [5, 1, 71],
      [6, 2, 72],
    ]);
  });

  it("Pausen erzeugen keinen Ton, die Zeit läuft weiter", () => {
    const tl = buildTimeline(song("r4 c'4 r2 | d'2. r4 ||"));
    expect(tl.tones.map((t) => [t.start, t.dur, t.midi])).toEqual([
      [1, 1, 60],
      [4, 3, 62],
    ]);
    expect(tl.total).toBe(8);
  });

  it("Haltebögen werden zusammengefasst, auch über den Taktstrich", () => {
    const s = song("c'2 d'2~ | d'4~ d'4 e'2 , ||");
    const tl = buildTimeline(s);
    expect(tl.tones.map((t) => [t.start, t.dur, t.midi, t.bar])).toEqual([
      [0, 2, 60, 0],
      [2, 4, 62, 0],
      [6, 2, 64, 1],
    ]);
    expect(tl.tones[1].ids).toEqual([s.notes[1].id, s.notes[2].id, s.notes[3].id]);
    expect(tl.tones.map((t) => t.breathAfter)).toEqual([false, false, true]);
  });

  it("Tonwiederholung ohne Haltebogen bleibt getrennt; Bindebogen ändert nichts am Zeitplan", () => {
    expect(tones("c'4 c'4 (d'4 e'4) ||")).toEqual([
      [0, 1, 60],
      [1, 1, 60],
      [2, 1, 62],
      [3, 1, 64],
    ]);
  });

  it("Atemzeichen nach dem letzten Ton eines Haltebogens", () => {
    const tl = buildTimeline(song("c'2~ c'2 , | d'1 ||"));
    expect(tl.tones.map((t) => t.breathAfter)).toEqual([true, false]);
  });

  it("6/8: Zählzeiten und Einzähltakt", () => {
    const tl = buildTimeline(song("g'4 a'8 h'4. | c''2. ||", { time: [6, 8] }));
    expect(tl.bars.map((b) => [b.start, b.dur, b.beats])).toEqual([
      [0, 3, [0, 1.5]],
      [3, 3, [0, 1.5]],
    ]);
    expect(tl.countIn).toEqual([0, 1.5]);
    expect(tl.countInDur).toBe(3);
    expect(tl.tones.map((t) => [t.start, t.dur])).toEqual([
      [0, 1],
      [1, 0.5],
      [1.5, 1.5],
      [3, 3],
    ]);
  });

  it("Zählzeiten anderer Taktarten", () => {
    const beats = (time: [number, number], m: string) => buildTimeline(song(m, { time })).bars[0].beats;
    expect(beats([3, 4], "c'2. ||")).toEqual([0, 1, 2]);
    expect(beats([2, 4], "c'2 ||")).toEqual([0, 1]);
    expect(beats([4, 4], "c'1 ||")).toEqual([0, 1, 2, 3]);
    expect(beats([2, 2], "c'1 ||")).toEqual([0, 2]);
    expect(beats([3, 8], "c'4. ||")).toEqual([0, 0.5, 1]);
    expect(beats([12, 8], "c'1. ||")).toEqual([0, 1.5, 3, 4.5]);
  });

  it("Taktwechsel: Takte und Zählzeiten folgen der neuen Taktart", () => {
    const tl = buildTimeline(song("c'1 | T3/4 d'2. | T6/8 e'4. f'4. | T2/4 g'2 ||"));
    expect(tl.bars.map((b) => [b.start, b.dur, b.beats])).toEqual([
      [0, 4, [0, 1, 2, 3]],
      [4, 3, [0, 1, 2]],
      [7, 3, [0, 1.5]],
      [10, 2, [0, 1]],
    ]);
    expect(tl.tones.map((t) => t.start)).toEqual([0, 4, 7, 8.5, 10]);
    expect(tl.total).toBe(12);
    expect(tl.countIn).toEqual([0, 1, 2, 3]);
  });

  it("Auftakt: kürzerer Takt, nur die Zählzeiten, die in ihn fallen; Einzählen bis zur Zählzeit des Auftakts", () => {
    const tl = buildTimeline(song("g'4 | c''2 h'4 | a'2. ||", { time: [3, 4] }));
    expect(tl.bars.map((b) => [b.start, b.dur, b.beats, b.pickup])).toEqual([
      [0, 1, [0], true],
      [1, 3, [0, 1, 2], false],
      [4, 3, [0, 1, 2], false],
    ]);
    // ein voller Takt, dann 1 2 – der Auftakt fällt auf die 3
    expect(tl.countIn).toEqual([0, 1, 2, 3, 4]);
    expect(tl.countInDur).toBe(5);
    expect(tl.countInBeats).toBe(3);
    // Achtel-Auftakt im 4/4-Takt: Einzählen 1 2 3 4 1 2 3 4, Auftakt auf „4 und“
    const e = buildTimeline(song("d'8 | g'1 | g'2. g'4 ||"));
    expect(e.countIn).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(e.countInDur).toBe(7.5);
    // ohne Auftakt: genau ein Takt
    expect(buildTimeline(song("c'1 | d'1 ||")).countInDur).toBe(4);
    // Achtel-Auftakt im 4/4-Takt: keine Zählzeit darin
    expect(buildTimeline(song("d'8 | g'1 ||")).bars[0].beats).toEqual([]);
    // Schlusstakt, der kürzer ist: Zählzeiten von vorn
    expect(buildTimeline(song("g'4 | c''1 | h'2. ||")).bars[2].beats).toEqual([0, 1, 2]);
  });

  it("Wiederholung wird ausgeschrieben", () => {
    const s = song("|: c'1 | d'1 :| e'1 ||");
    expect(playOrder(s)).toEqual([0, 1, 0, 1, 2]);
    const tl = buildTimeline(s);
    expect(tl.tones.map((t) => [t.start, t.midi, t.bar])).toEqual([
      [0, 60, 0],
      [4, 62, 1],
      [8, 60, 0],
      [12, 62, 1],
      [16, 64, 2],
    ]);
    expect(tl.bars.map((b) => b.index)).toEqual([0, 1, 0, 1, 2]);
    expect(tl.total).toBe(20);
  });

  it("Wiederholung ohne |: springt zum Anfang, zwei Teile nacheinander", () => {
    expect(playOrder(song("c'1 | d'1 :| e'1 | f'1 :|"))).toEqual([0, 1, 0, 1, 2, 3, 2, 3]);
    expect(playOrder(song("|: c'1 :| |: d'1 :|"))).toEqual([0, 0, 1, 1]);
  });

  it("1. und 2. Klammer", () => {
    const s = song("|: c'1 | [1 d'1 | e'1 :| [2 f'1 | g'1 ||");
    expect(playOrder(s)).toEqual([0, 1, 2, 0, 3, 4]);
    expect(buildTimeline(s).tones.map((t) => t.midi)).toEqual([60, 62, 64, 60, 65, 67]);
  });

  it("Auftakt in der Wiederholung: geteilter Takt ergibt zusammen einen ganzen", () => {
    const s = song("|: g'4 | c''1 | h'2. :|");
    const tl = buildTimeline(s);
    expect(tl.bars.map((b) => [b.index, b.start, b.dur, b.beats])).toEqual([
      [0, 0, 1, [0]],
      [1, 1, 4, [0, 1, 2, 3]],
      [2, 5, 3, [0, 1, 2]],
      [0, 8, 1, [0]],
      [1, 9, 4, [0, 1, 2, 3]],
      [2, 13, 3, [0, 1, 2]],
    ]);
    expect(tl.total).toBe(16);
  });

  it("Heft-Lieder: Gesamtlänge = Summe der gespielten Takte, Töne lückenlos geordnet", () => {
    for (const s of SONGS) {
      const tl = buildTimeline(s);
      const sum = tl.bars.reduce((t, b) => t + b.dur, 0);
      expect(tl.total).toBeCloseTo(sum, 9);
      for (let i = 1; i < tl.tones.length; i++) {
        expect(tl.tones[i].start).toBeGreaterThanOrEqual(tl.tones[i - 1].start + tl.tones[i - 1].dur - 1e-9);
      }
      // jede Note des Notenbilds kommt mindestens einmal vor
      const ids = new Set(tl.tones.flatMap((t) => t.ids));
      for (const n of s.notes) expect(ids.has(n.id), `${s.title}: Note ${n.id}`).toBe(true);
    }
  });

  it("Heft: Doen Daphne – 1. Klammer beim zweiten Mal übersprungen", () => {
    const s = songById("doen-daphne-dover-schoone-maeght")!;
    const order = playOrder(s);
    const v1 = s.bars.findIndex((b) => b.volta === 1);
    const v2 = s.bars.findIndex((b) => b.volta === 2);
    expect(order.slice(0, v1 + 1)).toEqual([...Array(v1 + 1).keys()]);
    expect(order.slice(v1 + 1, 2 * v1 + 1)).toEqual([...Array(v1).keys()]);
    expect(order[2 * v1 + 1]).toBe(v2);
    expect(order.filter((i) => i === v1).length).toBe(1);
  });

  it("Heft: Stille Nacht (6/8) – Haltebogen-freie Bindebögen klingen als einzelne Töne", () => {
    const s = songById("stille-nacht-heilige-nacht")!;
    const tl = buildTimeline(s);
    expect(tl.countIn).toEqual([0, 1.5]);
    expect(tl.tones.length).toBe(s.notes.length);
    expect(tl.total).toBe(s.bars.length * 3);
  });
});

describe("Abschnitt wiederholen", () => {
  it("einfacher Abschnitt beginnt bei 0", () => {
    const s = song("c'1 | d'2 e'2 | f'1 | g'1 ||");
    const tl = sectionTimeline(s, 1, 2);
    expect(tl.bars.map((b) => [b.index, b.start])).toEqual([
      [1, 0],
      [2, 4],
    ]);
    expect(tl.tones.map((t) => [t.start, t.midi])).toEqual([
      [0, 62],
      [2, 64],
      [4, 65],
    ]);
    expect(tl.total).toBe(8);
  });

  it("Endtakt vor Anfangstakt wird vertauscht; ein Takt allein geht auch", () => {
    const s = song("c'1 | d'1 | e'1 ||");
    expect(sectionTimeline(s, 2, 1).bars.map((b) => b.index)).toEqual([1, 2]);
    expect(sectionTimeline(s, 1, 1).bars.map((b) => b.index)).toEqual([1]);
  });

  it("Einzähltakt in der Taktart des Anfangstakts", () => {
    const s = song("c'1 | T3/4 d'2. | e'2. ||");
    const tl = sectionTimeline(s, 1, 2);
    expect(tl.countIn).toEqual([0, 1, 2]);
    expect(tl.countInDur).toBe(3);
  });

  it("Haltebogen ins Abschnittsende hinein wird abgeschnitten, aus dem Abschnittsanfang heraus neu begonnen", () => {
    const s = song("c'1~ | c'2 d'2~ | d'1 ||");
    expect(sectionTimeline(s, 1, 1).tones.map((t) => [t.start, t.dur, t.midi])).toEqual([
      [0, 2, 60],
      [2, 2, 62],
    ]);
  });

  it("bei Wiederholungen: ab dem ersten Vorkommen des Anfangstakts bis zum nächsten Vorkommen des Endtakts", () => {
    const s = song("|: c'1 | d'1 | e'1 | f'1 :| g'1 | a'1 ||");
    // innerhalb der Wiederholung: nur einmal
    expect(sectionTimeline(s, 0, 3).bars.map((b) => b.index)).toEqual([0, 1, 2, 3]);
    // über das :| hinaus: mit Rücksprung
    expect(sectionTimeline(s, 2, 5).bars.map((b) => b.index)).toEqual([2, 3, 0, 1, 2, 3, 4, 5]);
  });

  it("mit Klammern", () => {
    const s = song("|: c'1 | [1 d'1 :| [2 e'1 | f'1 ||");
    expect(sectionTimeline(s, 0, 1).bars.map((b) => b.index)).toEqual([0, 1]);
    expect(sectionTimeline(s, 1, 2).bars.map((b) => b.index)).toEqual([1, 0, 2]);
    expect(sectionTimeline(s, 2, 3).bars.map((b) => b.index)).toEqual([2, 3]);
  });
});

describe("Anhören ab einem Takt (fromBarTimeline)", () => {
  it("vom ersten Vorkommen des Takts bis zum Liedende, Start bei 0, Wiederholungen ausgeschrieben", () => {
    const s = song("|: c'1 | d'1 | e'1 | f'1 :| g'1 | a'1 ||");
    const tl = fromBarTimeline(s, 2);
    expect(tl.bars.map((b) => b.index)).toEqual([2, 3, 0, 1, 2, 3, 4, 5]);
    expect(tl.bars[0].start).toBe(0);
    expect(tl.tones[0]).toMatchObject({ start: 0, midi: 64, bar: 2 });
    expect(tl.total).toBe(8 * 4);
    expect(fromBarTimeline(s, 5).bars.map((b) => b.index)).toEqual([5]);
    expect(fromBarTimeline(s, 0).bars.map((b) => b.index)).toEqual(playOrder(s));
  });

  it("Takt der 2. Klammer; Werte außerhalb werden begrenzt", () => {
    const s = song("|: c'1 | [1 d'1 :| [2 e'1 | f'1 ||");
    expect(fromBarTimeline(s, 2).bars.map((b) => b.index)).toEqual([2, 3]);
    expect(fromBarTimeline(s, 99).bars.map((b) => b.index)).toEqual([3]);
    expect(fromBarTimeline(s, -3).bars.map((b) => b.index)).toEqual(playOrder(s));
  });

  it("Heft-Lied: erster Ton ist der erste Ton des Takts im ganzen Zeitplan", () => {
    const j = songById("jingle-bells")!;
    const full = buildTimeline(j);
    const tl = fromBarTimeline(j, 4);
    const first = full.tones.find((t) => t.bar === 4)!;
    expect(tl.tones[0].midi).toBe(first.midi);
    expect(tl.tones[0].ids).toEqual(first.ids);
    expect(tl.tones.length).toBe(full.tones.length - full.tones.indexOf(first));
  });
});

describe("Bindebögen im Zeitplan (slurToNext)", () => {
  const slurs = (m: string, extra = {}) => buildTimeline(song(m, extra)).tones.map((t) => !!t.slurToNext);

  it("Töne unter dem Bogen sind an den nächsten gebunden, der letzte nicht", () => {
    expect(slurs("(c'4 d'4 e'4) f'4 ||")).toEqual([true, true, false, false]);
    // ohne Bogen: das Feld fehlt ganz
    expect(buildTimeline(song("c'4 d'4 e'4 f'4 ||")).tones.every((t) => !("slurToNext" in t))).toBe(true);
  });

  it("auch über den Taktstrich und mit Haltebogen im Bogen", () => {
    expect(slurs("c'2 (d'2 | e'2) f'2 ||")).toEqual([false, true, false, false]);
    const tl = buildTimeline(song("(c'2~ c'4 d'4) e'1 ||"));
    expect(tl.tones.map((t) => [t.dur, t.midi, !!t.slurToNext])).toEqual([
      [3, 60, true],
      [1, 62, false],
      [4, 64, false],
    ]);
  });

  it("Atemzeichen im Bogen trennt; Tonwiederholung im Bogen bleibt als Bindung vermerkt", () => {
    expect(slurs("(c'4 , d'4 e'4) f'4 ||")).toEqual([false, true, false, false]);
    expect(slurs("(g'4 g'4 a'4) r4 ||")).toEqual([true, true, false]);
  });

  it("Wiederholung: am Rücksprung nicht gebunden, beim zweiten Mal zum notierten Nachfolger schon", () => {
    const s = song("|: (c'2 d'2 :| e'1) ||");
    expect(playOrder(s)).toEqual([0, 0, 1]);
    const tl = buildTimeline(s);
    expect(tl.tones.map((t) => [t.midi, !!t.slurToNext])).toEqual([
      [60, true],
      [62, false], // danach kommt wieder c' (Rücksprung), nicht das notierte e'
      [60, true],
      [62, true],
      [64, false],
    ]);
  });

  it("2. Klammer: der Bogen in die 1. Klammer gilt nicht für den Sprung in die 2.", () => {
    const tl = buildTimeline(song("|: c'2 (d'2 | [1 e'1) :| [2 f'1 ||"));
    expect(tl.tones.map((t) => [t.midi, !!t.slurToNext])).toEqual([
      [60, false],
      [62, true],
      [64, false],
      [60, false],
      [62, false], // nächster gespielter Ton ist f' (2. Klammer), notiert folgt e'
      [65, false],
    ]);
  });

  it("Abschnitt: der Bogen über das Abschnittsende hinaus wird nicht gebunden", () => {
    const s = song("(c'2 d'2 | e'1) ||");
    expect(sectionTimeline(s, 0, 0).tones.map((t) => !!t.slurToNext)).toEqual([true, false]);
    expect(sectionTimeline(s, 0, 1).tones.map((t) => !!t.slurToNext)).toEqual([true, true, false]);
  });

  it("Heft: Stille Nacht – drei Bindebögen, je ein gebundener Übergang (auch über den Taktstrich)", () => {
    const s = songById("stille-nacht-heilige-nacht")!;
    const tl = buildTimeline(s);
    const bound = tl.tones.flatMap((t, i) => (t.slurToNext ? [i] : []));
    expect(bound.map((i) => [tl.tones[i].midi, tl.tones[i + 1].midi])).toEqual([
      [67, 69], // (g'4. a'8)
      [72, 76], // (c''2. | e''2.)
      [62, 60], // (d'4 | c'2.)
    ]);
    // gebundene Töne schließen lückenlos an
    for (const i of bound) expect(tl.tones[i + 1].start).toBeCloseTo(tl.tones[i].start + tl.tones[i].dur, 9);
  });
});
