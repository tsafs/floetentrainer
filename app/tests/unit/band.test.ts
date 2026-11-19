import { describe, expect, it } from "vitest";
import { BandScore, drillRhythm, phraseRhythm, toneCount, triadNotes } from "../../src/songs/band-score";
import { engraveScore } from "../../src/songs/engrave";
import { songById } from "../../src/songs/library";
import { songExcerpt } from "../../src/songs/snippets";
import { keyInfo } from "../../src/songs/parse";
import { BAND_AHEAD, BandSession, bandPool } from "../../src/srs/band";
import { unlockedNotes } from "../../src/music/levels";
import { note } from "../../src/music/notes";
import { cardKey, defaultData, type AppData } from "../../src/store/data";
import { seeded, TODAY } from "./helpers";

const sum = (a: number[]) => a.reduce((s, x) => s + x, 0);

function mk(d: AppData, opt: { seed?: number; clock?: { t: number }; limitNotes?: number; limitMs?: number } = {}) {
  const clock = opt.clock ?? { t: 1_000_000 };
  return new BandSession(d, {
    today: TODAY,
    rng: seeded(opt.seed ?? 5),
    now: () => clock.t,
    limitMs: opt.limitMs ?? 3 * 60_000,
    limitNotes: opt.limitNotes ?? 50,
  });
}

/** Daten auf einer Spielen-Stufe, alle Töne vorgestellt und beantwortet */
function at(stage: string): AppData {
  const d = defaultData();
  d.stages.lesen = stage;
  d.stages.spielen = stage;
  const notes = unlockedNotes("spielen", ["erste-toene", "c2-d2", "e1-d1", "fis1", "e2-f1", "c1"].indexOf(stage) + 1);
  d.introduced.spielen = notes.slice();
  d.introduced.lesen = notes.slice();
  for (const n of notes) d.cards[cardKey(n, "spiel")] = { box: 3, day: TODAY, session: 0 };
  return d;
}

/** Spielt das ganze Band durch: ok(note) entscheidet */
function playAll(s: BandSession, ok: (n: string) => boolean = () => true) {
  for (const n of s.intros) s.introDone(n);
  s.start();
  let at = 0;
  let k = 0;
  s.fill(at);
  while (k < s.phrases.length) {
    const p = s.phrases[k++];
    at = p.span.to - 1;
    s.fill(at);
    s.phraseDone(p, p.notes.map(ok));
    if (k > 200) throw new Error("Endlosschleife");
  }
}

describe("Rhythmus", () => {
  it("Takte sind voll, der letzte endet lang", () => {
    for (const t of [{ num: 4, den: 4 }, { num: 3, den: 4 }, { num: 2, den: 4 }, { num: 6, den: 8 }]) {
      for (let k = 0; k < 30; k++) {
        const r = phraseRhythm(t, seeded(k));
        const len = (t.num * 4) / t.den;
        for (const b of r) expect(sum(b)).toBeCloseTo(len);
        expect(r[r.length - 1].at(-1)).toBeGreaterThanOrEqual(1);
      }
      for (const b of drillRhythm(t)) expect(sum(b)).toBeCloseTo((t.num * 4) / t.den);
    }
  });
  it("kurzer letzter Takt vor einem Auftakt", () => {
    const r = phraseRhythm({ num: 4, den: 4 }, seeded(1), 3);
    expect(sum(r[r.length - 1])).toBeCloseTo(3);
  });
});

describe("BandScore", () => {
  it("hängt Abschnitte an, Lage früherer Takte bleibt beim Setzen gleich", () => {
    const b = new BandScore({ num: 4, den: 4 }, false);
    const s1 = b.append({ kind: "tones", notes: ["g1", "a1", "h1", "a1", "g1", "a1", "h1"], rhythm: [[1, 1, 1, 1], [1, 1, 2]] });
    expect(s1).toEqual({ bar: 0, from: 0, to: 7 });
    const band = { stretch: 1.3, top: -8, bottom: 2.4 };
    const e1 = engraveScore(b.song(), { width: 300, sp: 10, band });
    const x1 = e1.layout.systems[0].bars[1].xs.slice();
    b.append({ kind: "tones", notes: ["c2", "h1", "c2", "d2"], rhythm: [[2, 2], [2, 2]] });
    const e2 = engraveScore(b.song(), { width: 300, sp: 10, band });
    expect(e2.layout.systems).toHaveLength(1);
    expect(e2.layout.systems[0].bars[1].xs).toEqual(x1);
    expect(e2.systems[0].yTop).toBe(e1.systems[0].yTop);
    // Vorzeichen bis zum Taktende
    b.append({ kind: "tones", notes: ["fis1", "g1", "fis1", "g1"], rhythm: [[1, 1, 1, 1]] });
    const bar = b.bars[b.bars.length - 1];
    expect(bar.events.map((e) => (e.kind === "note" ? e.accidental : null))).toEqual(["sharp", null, null, null]);
  });

  it("Auftakt eines Liedstücks schließt an den offenen Takt an", () => {
    // Alle Vögel sind schon da beginnt ohne Auftakt; „Kling, Glöckchen“ auch – nimm ein Lied mit Auftakt
    const song = ["alle-jahre-wieder", "greensleeves", "es-tanzt-ein-bi-ba-butzemann"].map(songById).find((s) => s?.bars[0].pickup);
    if (!song) return;
    const b = new BandScore(song.time, true);
    const pick = song.bars[0].length;
    const nominal = song.bars[0].nominal;
    const rhythm = phraseRhythm(song.time, seeded(2), nominal - pick);
    b.append({ kind: "tones", notes: Array.from({ length: toneCount(rhythm) }, (_, i) => (i % 2 ? "a1" : "g1")), rhythm });
    expect(b.openBar).toBeCloseTo(nominal - pick);
    b.append({ kind: "song", excerpt: songExcerpt(song, 0, 1) });
    for (const bar of b.bars) expect(bar.length).toBeCloseTo(nominal);
  });

  it("Grundakkord", () => {
    expect(triadNotes(["g1", "a1", "h1", "c2", "d2"], "G-Dur", keyInfo("G")!)).toEqual(["g1", "h1", "d2"]);
    expect(triadNotes(["g1", "a1", "h1", "c2", "e2"], "a-Moll (dorisch)", keyInfo("G")!)).toEqual(["a1", "c2", "e2"]);
  });
});

describe("BandSession", () => {
  it("neue Töne zuerst vorstellen, dann alle Töne aus dem Pool", () => {
    const d = defaultData();
    const s = mk(d);
    expect(s.intros.sort()).toEqual(["a1", "g1", "h1"]);
    playAll(s);
    for (const p of s.phrases) for (const n of p.notes) expect(["g1", "a1", "h1"]).toContain(n);
    // neue Karten sind gewertet
    for (const n of ["g1", "a1", "h1"]) expect(d.cards[cardKey(n, "spiel")]).toBeTruthy();
  });

  it("nie zweimal derselbe Ton direkt hintereinander, außer in Liedstücken", () => {
    for (const seed of [1, 2, 3, 4]) {
      const s = mk(at("e2-f1"), { seed });
      playAll(s);
      let prev: string | null = null;
      for (const p of s.phrases) {
        p.notes.forEach((n, i) => {
          if (p.kind !== "song" || i === 0) expect(n).not.toBe(prev);
          prev = n;
        });
      }
    }
  });

  it("endet nach etwa limitNotes Tönen, mit Schlussstrich", () => {
    const s = mk(at("e2-f1"), { limitNotes: 50 });
    playAll(s);
    expect(s.played).toBeGreaterThanOrEqual(50);
    expect(s.played).toBeLessThan(50 + 25);
    expect(s.score.bars.at(-1)!.barline).toBe("final");
    expect(s.closed).toBe(true);
  });

  it("endet nach der Zeit", () => {
    const clock = { t: 0 };
    const s = mk(at("e2-f1"), { clock, limitNotes: 1000, limitMs: 60_000 });
    s.start();
    s.fill(0);
    clock.t = 61_000;
    let k = 0;
    while (k < s.phrases.length && k < 20) s.fill(s.phrases[k++].span.to);
    expect(s.closed).toBe(true);
    expect(s.score.timeline().tones.length).toBeLessThan(40);
  });

  it("Liedstücke mit melodischem Übergang, ein Wechsel", () => {
    const s = mk(at("e2-f1"), { limitNotes: 120, seed: 7 });
    playAll(s);
    const songs = s.phrases.filter((p) => p.kind === "song");
    expect(songs.length).toBeGreaterThan(1);
    for (const p of songs) {
      const before = s.phrases[s.phrases.indexOf(p) - 1];
      const a = before.notes.at(-1)!;
      expect(a).not.toBe(p.notes[0]);
      expect(Math.abs(note(a).midi - note(p.notes[0]).midi)).toBeLessThanOrEqual(4);
      expect(p.label).toBe(s.song!.title);
    }
    expect(s.phrases.filter((p) => p.kind === "drill")).toHaveLength(1);
  });

  it("Fehler: Abschnitt kommt einmal wieder, zählt nicht; Ton gilt als falsch", () => {
    const d = at("e2-f1");
    const s = mk(d, { seed: 3 });
    for (const n of s.intros) s.introDone(n);
    s.start();
    s.fill(0);
    const p = s.phrases[0];
    const bad = p.notes[1];
    s.phraseDone(p, p.notes.map((n) => n !== bad));
    expect(d.history.spielen[bad].at(-1)![0]).toBe(0);
    expect(s.difficult).toEqual([bad]);
    for (let k = 0; k < 4; k++) s.fill(s.score.timeline().tones.length);
    const again = s.phrases.find((x) => x.retry);
    expect(again?.notes).toEqual(p.notes);
    expect(again?.label).toBe("noch einmal");
  });

  it("Pool ohne andere Schreibweisen", () => {
    const d = at("c1");
    d.introduced.spielen.push("dis1");
    expect(bandPool(d)).not.toContain("dis1");
    expect(BAND_AHEAD).toBeGreaterThan(4);
  });
});
