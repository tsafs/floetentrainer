import { describe, expect, it } from "vitest";
import { GLYPHS } from "../../src/music/bravura";
import { parseAbc } from "../../src/songs/abc";
import { engraveScore } from "../../src/songs/engrave";
import { barKeys, DOUBLE_GAP, durFactor, keySwitch, layoutScore } from "../../src/songs/layout";
import type { Song } from "../../src/songs/model";
import { keyInfo } from "../../src/songs/parse";
import { abc, abcFile } from "./abc-helpers";

// Notensatz der Zeichen, die nur ABC-Lieder haben: Triolen, Klammern mit mehreren Takten und
// beliebigen Nummern, Doppelstrich, Tonartwechsel, gemischte Vorzeichnung, großer Tonumfang, ::.

/** wie oft eine Glyphe in einem SVG vorkommt */
const count = (svg: string, d: string) => svg.split(`d="${d}"`).length - 1;
const all = (s: Song, width: number) =>
  engraveScore(s, { width })
    .systems.map((x) => x.svg)
    .join("");
/** Teil des SVG ohne Noten und Pausen (Zeilenkopf, Striche, Tonartwechsel …) */
const withoutNotes = (svg: string) => svg.replace(/<g class="[nr]" data-id="\d+">.*?<\/g>/g, "");
/** senkrechte Lage (translate y) aller Vorkommen einer Glyphe */
const glyphYs = (svg: string, d: string) =>
  [...svg.matchAll(new RegExp(`d="${d.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}" transform="translate\\(([-\\d.]+) ([-\\d.]+)\\)`, "g"))].map((m) => Number(m[2]));

describe("Notensatz ABC: Triolen", () => {
  it("Abstand nach der echten Dauer: Triolenachtel zwischen Sechzehntel und Achtel", () => {
    const t = abc("(3cde f g |", "M:2/4\nL:1/8\nK:C").song;
    const [a, , , d] = t.bars[0].events;
    expect(durFactor(a)).toBeGreaterThan(0.86);
    expect(durFactor(a)).toBeLessThan(1.0);
    expect(durFactor(d)).toBe(1.0);
    // Viertel-Triole (2/3 Viertel) liegt zwischen Achtel und punktierter Achtel
    const q = abc("(3c2d2e2 |", "M:2/4\nL:1/8\nK:C").song.bars[0].events[0];
    expect(durFactor(q)).toBeGreaterThan(1.0);
    expect(durFactor(q)).toBeLessThan(1.06);
    const L = layoutScore(t, { width: 1000 });
    const xs = L.systems[0].bars[0].xs;
    expect(xs[1] - xs[0]).toBeLessThan(xs[4] - xs[3]);
  });

  it("mit Balken nur die Zahl am Balken, sonst Klammer mit Zahl; Seite nach den Hälsen", () => {
    // tiefe Achteltriole: Hälse nach oben, Zahl darüber; hohe: Hälse nach unten, Zahl darunter
    const s = abc("(3EFG (3efg (3E2F2G2 |", "M:4/4\nL:1/8\nK:C").song;
    const svg = all(s, 700);
    const tups = [...svg.matchAll(/<g class="tup">(.*?)<\/g>/g)].map((m) => m[1]);
    expect(tups.length).toBe(3);
    expect(tups.map((g) => count(g, GLYPHS.tuplet3.d))).toEqual([1, 1, 1]);
    expect(tups.map((g) => g.includes('class="tupb"'))).toEqual([false, false, true]);
    const ys = glyphYs(svg, GLYPHS.tuplet3.d);
    expect(ys[0]).toBeLessThan(-4); // über den Linien
    expect(ys[1]).toBeGreaterThan(0); // unter den Linien
    expect(ys[2]).toBeLessThan(-4); // Viertel mit Hals nach oben: Klammer darüber
  });

  it("Triole mit Pause bekommt eine Klammer, andere Zahlen (5) werden auch gezeigt", () => {
    const s = abc("(3zAB (5ABcde f2 |", "M:3/4\nL:1/8\nK:C").song;
    const svg = all(s, 700);
    const tups = [...svg.matchAll(/<g class="tup">(.*?)<\/g>/g)].map((m) => m[1]);
    expect(tups[0]).toContain('class="tupb"');
    expect(count(tups[1], GLYPHS.tuplet5.d)).toBe(1);
  });
});

describe("Notensatz ABC: Wiederholungsklammern", () => {
  const labels = (svg: string) => [...svg.matchAll(/class="vno"[^>]*>([^<]*)</g)].map((m) => m[1]);

  it("Beschriftung aus voltaNumbers: 1., 2., 3. und „1., 2.“", () => {
    const s = abc("|: D E F G |1 A4 :|2 B4 :|3 c4 |] |: d c B A |1,2 G F E D :|3 D4 |]").song;
    expect(labels(all(s, 1000))).toEqual(["1.", "2.", "3.", "1., 2.", "3."]);
  });

  it("eine Klammer über mehrere Takte, auch über den Zeilenumbruch (Ziffer nur am Anfang)", () => {
    const s = abc("|: A4 | B4 |1 c4 | d4 | e4 | f4 :|2 g4 | f4 | e4 | d4 |]").song;
    for (const width of [260, 360, 700]) {
      const eng = engraveScore(s, { width });
      // jede Zeile, die einen Takt der 1. Klammer (Takte 2–5) enthält, hat ein Stück Klammer
      const rows = eng.systems.filter((sy) => sy.bars.some((b) => b >= 2 && b <= 5));
      const pieces = rows.map((sy) => (sy.svg.match(/class="volta"/g) ?? []).length);
      expect(pieces.every((n) => n >= 1)).toBe(true);
      const svg = eng.systems.map((x) => x.svg).join("");
      expect(labels(svg)).toEqual(["1.", "2."]);
      // genau ein Haken am Ende (am :| der 1. Klammer)
      const volta = [...svg.matchAll(/class="volta" d="([^"]*)"/g)].map((m) => m[1].split("L").length);
      expect(volta.filter((n) => n === 4).length).toBe(1);
    }
    expect(engraveScore(s, { width: 260 }).systems.length).toBeGreaterThan(2);
  });

  it("die Ziffer stößt nicht an hohe Noten darunter", () => {
    const s = abc("|: c4 :|2 g'4 |]", "M:4/4\nL:1/4\nK:C").song;
    const svg = all(s, 700);
    const y = Number(/class="vno"[^>]*y="([-\d.]+)"/.exec(svg)![1]);
    // g³ liegt bei Lage 16 → Kopf oben bei −8,5; die Schrift (Grundlinie y) bleibt darüber
    expect(y).toBeLessThan(-8.5 - 0.2);
  });
});

describe("Notensatz ABC: Taktstriche, Tonart, Taktart", () => {
  it("Doppelstrich mitten im Stück: zwei dünne Striche", () => {
    const s = abc("C D E F || G A B c | d4 |]").song;
    expect(s.bars[0].double).toBe(true);
    const svg = all(s, 700);
    const L = layoutScore(s, { width: 700 });
    const x1 = L.systems[0].bars[0].x1;
    const xs = [...svg.matchAll(/<line class="bl" x1="([-\d.]+)"/g)].map((m) => Number(m[1]));
    expect(xs.some((x) => Math.abs(x - x1) < 1e-3)).toBe(true);
    expect(xs.some((x) => Math.abs(x - (x1 - DOUBLE_GAP)) < 1e-3)).toBe(true);
  });

  it("Tonartwechsel: Auflösungszeichen nur für Vorzeichen, die wegfallen", () => {
    const G = keyInfo("G")!;
    const F = keyInfo("F")!;
    const D = keyInfo("D")!;
    const C = keyInfo("C")!;
    expect(keySwitch(G, F)).toEqual({ cancel: [8], sig: F.signature });
    expect(keySwitch(D, C)).toEqual({ cancel: [8, 5], sig: [] });
    expect(keySwitch(G, D)).toEqual({ cancel: [], sig: D.signature });
    expect(keySwitch(D, keyInfo("h")!)).toBe(null); // gleiche Vorzeichnung
    expect(keySwitch(keyInfo("Es")!, keyInfo("A")!)!.cancel).toEqual([4, 7, 3]);
  });

  it("Tonartwechsel mitten in der Zeile und danach jede Zeile in der neuen Tonart", () => {
    const s = abc("G A B c | d e f g || [K:F] F G A B | c4 | A B c d | e f g a | f4 | c4 | F4 |]", "M:4/4\nL:1/4\nK:G").song;
    expect(barKeys(s).map((k) => k.name)).toEqual(["G", "G", "F", "F", "F", "F", "F", "F", "F"]);
    const eng = engraveScore(s, { width: 700 });
    const L = eng.layout;
    expect(L.systems[0].bars.length).toBeGreaterThan(2); // Wechsel mitten in der ersten Zeile
    const head = withoutNotes(eng.systems[0].svg);
    const change = /<g class="key">(.*?)<\/g>/.exec(head)![1];
    expect([count(change, GLYPHS.natural.d), count(change, GLYPHS.flat.d), count(change, GLYPHS.sharp.d)]).toEqual([1, 1, 0]);
    for (const sy of eng.systems.slice(1)) {
      const h = withoutNotes(sy.svg);
      expect([count(h, GLYPHS.flat.d), count(h, GLYPHS.sharp.d)]).toEqual([1, 0]);
    }
  });

  it("Tonartwechsel am Zeilenanfang: Ankündigung am Ende der Zeile davor", () => {
    const s = abc("A B c d | e f g a |\nK:Ab\nA B c d | e f g a |]", "M:4/4\nL:1/4\nK:A").song;
    for (const width of [360, 700]) {
      // so breit, dass genau nach Takt 2 umbrochen wird, gibt es nicht immer – suchen
      const eng = engraveScore(s, { width });
      const k = eng.systems.findIndex((sy) => sy.bars[0] === 2);
      if (k < 1) continue;
      const prev = withoutNotes(eng.systems[k - 1].svg);
      const ann = /<g class="key">(.*?)<\/g>/.exec(prev)![1];
      expect([count(ann, GLYPHS.natural.d), count(ann, GLYPHS.flat.d)]).toEqual([3, 4]);
      const head = withoutNotes(eng.systems[k].svg);
      expect(head).not.toContain('class="key"');
      expect([count(head, GLYPHS.flat.d), count(head, GLYPHS.sharp.d)]).toEqual([4, 0]);
      // die Ankündigung bleibt in der Breite
      expect(eng.layout.systems[k - 1].courtesy!.x).toBeLessThan(eng.layout.width - 2);
    }
    expect(engraveScore(s, { width: 360 }).systems.findIndex((sy) => sy.bars[0] === 2)).toBe(1);
  });

  it("gemischte Vorzeichnung (K: … exp ^f _b) im Zeilenkopf", () => {
    const s = abc("D E F | G A B |]", "M:3/4\nL:1/4\nK:D exp ^f _b").song;
    const head = withoutNotes(all(s, 700));
    expect([count(head, GLYPHS.sharp.d), count(head, GLYPHS.flat.d)]).toEqual([1, 1]);
  });

  it("Taktwechsel mitten in der Zeile, zusammen mit Tonartwechsel: erst Tonart, dann Taktangabe", () => {
    const s = abc("C D E F | [M:3/4] [K:D] D E F | G A B |]").song;
    const L = layoutScore(s, { width: 1000 });
    const b = L.systems[0].bars[1];
    expect(b.keyChange).not.toBe(null);
    expect(b.timeX!).toBeGreaterThan(b.keyChange!.x + 1.5);
    expect(b.xs[0]).toBeGreaterThan(b.timeX!);
  });

  it(":: mitten in der Zeile: ein gemeinsames Zeichen (ein dicker Strich, vier Punkte)", () => {
    const s = abc("|: G A B c :: d e f g :|", "M:4/4\nL:1/4\nK:C").song;
    expect([s.bars[0].barline, s.bars[1].repeatStart]).toEqual(["repeatEnd", true]);
    const svg = withoutNotes(all(s, 1000));
    // Anfang |:, Mitte :|:, Ende :|  → 3 dicke Striche, 2 + 4 + 2 Punkte
    expect((svg.match(/<circle/g) ?? []).length).toBe(8);
    expect((svg.match(/<rect x=/g) ?? []).length).toBe(3);
  });

  it("Schlussstrich mitten im Stück vor |: wird nicht doppelt gezeichnet", () => {
    const s = abc("C D E F |] |: G A B c :|").song;
    const svg = withoutNotes(all(s, 1000));
    expect((svg.match(/<rect x=/g) ?? []).length).toBe(2); // |: und :|
  });
});

describe("Notensatz ABC: Tonumfang", () => {
  it("von g (kleine Oktave) bis a³ mit Hilfslinien, nichts ragt aus dem Bild", () => {
    const s = abc("G,A,B,C a'g'f'e' | G,4 a'4 |]", "M:4/4\nL:1/8\nK:C").song;
    expect([s.range.low.id, s.range.high.id]).toEqual(["g0", "a3"]);
    for (const width of [360, 700]) {
      const eng = engraveScore(s, { width });
      for (const sy of eng.systems) {
        const vb = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(sy.svg)!.slice(1).map(Number);
        // g (Lage −5): Kopf unten bei 3; a³ (Lage 17): Kopf oben bei −9
        expect(vb[1]).toBeLessThan(-9);
        expect(vb[1] + vb[3]).toBeGreaterThan(3);
      }
      // Hilfslinien je Note: g 2, a 2, h 1, c¹ 1, a³ 4, g³ 4, f³ 3, e³ 3; dann g 2, a³ 4
      expect((all(s, width).match(/class="ll"/g) ?? []).length).toBe(26);
    }
  });
});

describe("Notensatz ABC: Beispiele", () => {
  it("alle Beispiel-Lieder lassen sich setzen; jede Note genau einmal", () => {
    for (const f of ["alle-meine-entchen.abc", "drunken-sailor.abc", "haenschen-klein.abc", "irish-washerwoman.abc", "sammlung.abc"]) {
      for (const t of parseAbc(abcFile(f)).tunes) {
        for (const width of [328, 668]) {
          const svg = all(t.song, width);
          const ids = [...svg.matchAll(/<g class="[nr]" data-id="(\d+)">/g)].map((m) => Number(m[1]));
          expect(ids.length).toBe(t.song.bars.reduce((a, b) => a + b.events.length, 0));
        }
      }
    }
  });
});
