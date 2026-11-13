import { describe, expect, it } from "vitest";
import { GLYPHS } from "../../src/music/bravura";
import { engraveScore } from "../../src/songs/engrave";
import { beamGroups, layoutScore, metricsFor, textWidth } from "../../src/songs/layout";
import { SONGS, songById } from "../../src/songs/library";
import type { Song } from "../../src/songs/model";
import { song } from "./songs-helpers";

const WIDTHS = [260, 328, 412, 668, 1000];

/** wie oft eine Glyphe in einem SVG vorkommt */
const count = (svg: string, d: string) => svg.split(`d="${d}"`).length - 1;
/** Inhalt der Notengruppen eines SVG nach Kennung */
function groups(svg: string): Map<number, string> {
  const m = new Map<number, string>();
  for (const g of svg.matchAll(/<g class="[nr]" data-id="(\d+)">(.*?)<\/g>/g)) {
    expect(m.has(Number(g[1]))).toBe(false);
    m.set(Number(g[1]), g[2]);
  }
  return m;
}

/** Probelied mit Taktwechsel, Halte- und Bindebogen, Vorzeichen, Pausen und Text */
const probe = () =>
  song(
    "d'8 e'8 fis'16 g'16 a'8 h'4. c'''8 | (d''4 c''4) h'2~ | h'2 r4 a'4 , | T3/4 g'4. f'8 e'4 | r8. d'16 r2 | d'2. ||",
    {
      key: "D",
      keyname: "D-Dur",
      lyrics: "Hier steht ein lan-ger Text-teil zum Pro-bie-ren der Zei-le, so.",
    },
  );

describe("Notensatz: Umbruch", () => {
  it("jeder Takt steht genau einmal, in Reihenfolge, nie getrennt", () => {
    for (const s of [...SONGS, probe()]) {
      for (const width of WIDTHS) {
        const L = layoutScore(s, { width });
        const bars = L.systems.flatMap((sy) => sy.bars.map((b) => b.index));
        expect(bars).toEqual(s.bars.map((b) => b.index));
        for (const sy of L.systems) {
          for (const b of sy.bars) expect(b.xs.length).toBe(s.bars[b.index].events.length);
        }
      }
    }
  });

  it("die Breite wird nie überschritten", () => {
    for (const s of SONGS) {
      for (const width of WIDTHS) {
        const L = layoutScore(s, { width });
        for (const sy of L.systems) {
          const right = Math.max(...sy.bars.map((b) => b.x1)) * sy.scale;
          expect(right).toBeLessThanOrEqual(L.width + 1e-6);
        }
        const eng = engraveScore(s, { width });
        for (const sy of eng.systems) expect(sy.width).toBeLessThanOrEqual(width + 1e-6);
      }
    }
  });

  it("Blocksatz: alle Zeilen außer der letzten reichen bis zum rechten Rand", () => {
    for (const s of SONGS) {
      const L = layoutScore(s, { width: 328 });
      L.systems.slice(0, -1).forEach((sy) => {
        expect(sy.justified).toBe(true);
        expect(sy.bars[sy.bars.length - 1].x1).toBeCloseTo(L.width - 0.08, 3);
      });
    }
  });

  it("schmaler → mehr Zeilen", () => {
    let narrow = 0;
    let wide = 0;
    for (const s of SONGS) {
      const n = layoutScore(s, { width: 328 }).systems.length;
      const w = layoutScore(s, { width: 668 }).systems.length;
      expect(n).toBeGreaterThanOrEqual(w);
      narrow += n;
      wide += w;
    }
    expect(narrow).toBeGreaterThan(wide * 1.5);
  });

  it("Silben überlappen sich nicht und bleiben in der Breite", () => {
    for (const s of SONGS.filter((x) => x.hasLyrics)) {
      for (const width of WIDTHS) {
        const L = layoutScore(s, { width });
        const lyr = L.metrics.lyr;
        for (const sy of L.systems) {
          const syl: { x: number; w: number }[] = [];
          for (const b of sy.bars) {
            s.bars[b.index].events.forEach((e, q) => {
              if (e.kind === "note" && e.syllable) syl.push({ x: b.xs[q], w: textWidth(e.syllable.text, lyr) });
            });
          }
          for (let i = 1; i < syl.length; i++) {
            expect(syl[i].x - syl[i].w / 2).toBeGreaterThan(syl[i - 1].x + syl[i - 1].w / 2 + 0.3);
          }
          const last = syl[syl.length - 1];
          if (last && sy.scale === 1) expect(last.x + last.w / 2).toBeLessThanOrEqual(L.width);
        }
      }
    }
  });

  it("Größe: auf dem Handy Liedtext mindestens 16 px, Zwischenraum 7,5 bis 9 px", () => {
    expect(metricsFor(328).sp).toBe(7.5);
    expect(metricsFor(328).lyr * 7.5).toBeGreaterThanOrEqual(16);
    expect(metricsFor(1200).sp).toBe(9);
  });

  it("ist schnell genug zum Neu-Umbrechen beim Drehen", () => {
    const long = [...SONGS].sort((a, b) => b.notes.length - a.notes.length)[0];
    engraveScore(long, { width: 328 });
    const t0 = performance.now();
    for (let i = 0; i < 5; i++) engraveScore(long, { width: 328 + i });
    expect((performance.now() - t0) / 5).toBeLessThan(30);
  });
});

describe("Notensatz: Zeichen", () => {
  it("jede Note und Pause hat genau ein Element mit data-id, jeder Takt ein Tipp-Rechteck", () => {
    for (const s of [...SONGS, probe()]) {
      const eng = engraveScore(s, { width: 360 });
      const all = new Map<number, string>();
      const bars: number[] = [];
      for (const sy of eng.systems) {
        for (const [id, g] of groups(sy.svg)) {
          expect(all.has(id)).toBe(false);
          all.set(id, g);
        }
        for (const m of sy.svg.matchAll(/data-bar="(\d+)"/g)) bars.push(Number(m[1]));
      }
      const ids = s.bars.flatMap((b) => b.events.map((e) => e.id));
      expect([...all.keys()].sort((a, b) => a - b)).toEqual(ids.sort((a, b) => a - b));
      expect(bars).toEqual(s.bars.map((b) => b.index));
    }
  });

  it("Vorzeichen genau wie im Modell (mit Auflösungszeichen)", () => {
    let seen = 0;
    for (const s of [...SONGS, probe()]) {
      const eng = engraveScore(s, { width: 360 });
      for (const sy of eng.systems) {
        for (const [id, g] of groups(sy.svg)) {
          const n = s.notes.find((x) => x.id === id);
          for (const a of ["sharp", "flat", "natural"] as const) {
            expect(count(g, GLYPHS[a].d)).toBe(n?.accidental === a ? 1 : 0);
          }
          if (n?.accidental) seen++;
        }
      }
    }
    expect(seen).toBeGreaterThan(20);
    // Probelied: c''' und c'' in D-Dur bekommen ♮, ebenso f'
    const p = probe();
    expect(p.notes.filter((n) => n.accidental === "natural").map((n) => n.pitch.id)).toEqual(["c3", "c2", "f1"]);
  });

  it("Tonart am Anfang jeder Zeile", () => {
    for (const s of [songById("alle-voegel-sind-schon-da")!, songById("innsbruck-ich-muss-dich-lassen")!, songById("tourdion")!]) {
      const eng = engraveScore(s, { width: 328 });
      expect(eng.systems.length).toBeGreaterThan(3);
      eng.systems.forEach((sy) => {
        const notes = [...groups(sy.svg).values()].join("");
        for (const a of ["sharp", "flat"] as const) {
          const inKey = s.key.signature.filter((k) => k.accidental === a).length;
          expect(count(sy.svg, GLYPHS[a].d) - count(notes, GLYPHS[a].d)).toBe(inKey);
        }
        expect(count(sy.svg, GLYPHS.clef.d)).toBe(1);
      });
    }
  });

  it("Taktangabe am Anfang und beim Taktwechsel, sonst nicht", () => {
    const digits = (svg: string) =>
      Array.from({ length: 10 }, (_, d) => count(svg, GLYPHS[`time${d}`].d)).reduce((a, b) => a + b, 0);
    for (const s of SONGS) {
      const eng = engraveScore(s, { width: 328 });
      expect(digits(eng.systems[0].svg)).toBe(2);
      for (const sy of eng.systems.slice(1)) expect(digits(sy.svg)).toBe(0);
    }
    // Taktwechsel mitten in der Zeile und am Zeilenanfang
    const p = probe();
    expect(p.bars[3].timeChange).toBe(true);
    for (const width of [328, 1000]) {
      const eng = engraveScore(p, { width });
      const all = eng.systems.map((sy) => sy.svg).join("");
      expect(count(all, GLYPHS.time4.d)).toBe(3); // 4/4 und 3/4
      expect(count(all, GLYPHS.time3.d)).toBe(1);
      const sys3 = eng.systems.findIndex((sy) => sy.bars.includes(3));
      expect(count(eng.systems[sys3].svg, GLYPHS.time3.d)).toBe(1);
    }
  });

  it("Wiederholungen, Klammern, Atemzeichen, Bögen, Liedtext erscheinen", () => {
    const d = engraveScore(songById("doen-daphne-dover-schoone-maeght")!, { width: 360 });
    const svg = d.systems.map((s) => s.svg).join("");
    expect(svg.match(/class="vno"[^>]*>1\.</g)?.length).toBe(1);
    expect(svg.match(/class="vno"[^>]*>2\.</g)?.length).toBe(1);
    expect(svg).toContain("<circle");
    const p = engraveScore(probe(), { width: 328 });
    const ps = p.systems.map((s) => s.svg).join("");
    expect(count(ps, GLYPHS.breath.d)).toBe(1);
    expect(ps).toContain('class="tie"');
    expect(ps).toContain('class="slur"');
    expect(ps.match(/class="syl"/g)?.length).toBe(probe().notes.filter((n) => n.syllable).length);
    expect(ps).toContain('class="mel"');
    expect(ps).toContain('class="hy"');
  });

  it("Balken nach Zählzeiten wie im Heft (6/8 in punktierten Vierteln, Auftakt vom Taktende)", () => {
    const sizes = (s: Song, bar: number) => beamGroups(s.bars[bar]).map((g) => g.length);
    expect(sizes(song("c'8 d'8 e'8 f'8 g'8 a'8 h'8 c''8 |"), 0)).toEqual([2, 2, 2, 2]);
    expect(sizes(song("c'8 d'8 e'8 f'8 g'8 a'8 |", { time: [6, 8] }), 0)).toEqual([3, 3]);
    expect(sizes(song("c'8 r8 e'8 f'8 g'4 a'4 |"), 0)).toEqual([2]);
    expect(sizes(song("c'8 , d'8 e'8 f'8 g'2 |"), 0)).toEqual([2]);
    // Auftakt aus drei Achteln: erste allein, dann zwei zusammen
    expect(sizes(song("c'8 d'8 e'8 | f'1 | g'2 a'8 ||", { pickup: 1.5 }), 0)).toEqual([2]);
    const gs = beamGroups(song("c'8 d'8 e'8 | f'1 | g'2 a'8 ||", { pickup: 1.5 }).bars[0]);
    expect(gs[0].map((n) => n.pitch.name)).toEqual(["d", "e"]);
  });
});
