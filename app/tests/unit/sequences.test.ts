import { describe, expect, it } from "vitest";
import { isAltSpelling, unlockedNotes } from "../../src/music/levels";
import { note } from "../../src/music/notes";
import {
  counterMotion,
  drillNotes,
  drillPair,
  pairKey,
  FOLGE_MAX_DISTINCT,
  FOLGE_MAX_LEAP,
  FolgeLength,
  folgeChoices,
  folgeKey,
  folgeMaxLen,
  folgePool,
  makeFolge,
} from "../../src/srs/sequences";
import { defaultData } from "../../src/store/data";
import { seeded } from "./helpers";

const POOL8 = ["h1", "a1", "g1", "c2", "d2", "e1", "d1", "fis1"];
const POOL_F = ["h1", "a1", "g1", "c2", "d2", "e1", "d1", "fis1", "e2", "f1", "c1", "cis2", "f2", "g2"];

function many(pool: string[], len: number, n = 400, seed = 1) {
  const rng = seeded(seed);
  return Array.from({ length: n }, () => makeFolge(pool, len, rng));
}

describe("Töne für Tonfolgen", () => {
  it("nur in dieser Spur vorgestellte und freigeschaltete Töne, nach Tonhöhe", () => {
    const d = defaultData();
    d.stages.lesen = "fis1";
    d.introduced.lesen = ["h1", "a1", "g1", "c2", "d2", "e1"];
    expect(folgePool(d, "lesen")).toEqual(["e1", "g1", "a1", "h1", "c2", "d2"]);
    // Spielen hat eigene Vorstellungen
    d.stages.spielen = "c2-d2";
    d.introduced.spielen = ["h1", "a1", "g1", "c2"];
    expect(folgePool(d, "spielen")).toEqual([]);
    d.introduced.spielen.push("d2");
    expect(folgePool(d, "spielen")).toEqual(["g1", "a1", "h1", "c2", "d2"]);
  });
  it("weniger als 5 Töne: keine Folgen; gesperrte Töne (Stufe gesenkt) zählen nicht", () => {
    const d = defaultData();
    d.introduced.lesen = ["h1", "a1", "g1", "c2", "d2"];
    expect(folgePool(d, "lesen")).toEqual([]); // Stufe 1: c² und d² gesperrt
  });
  it("keine anderen Schreibweisen (Stufe 12)", () => {
    const d = defaultData();
    d.stages.lesen = "andere-schreibweisen";
    d.introduced.lesen = unlockedNotes("lesen", 12);
    const pool = folgePool(d, "lesen");
    expect(pool.length).toBe(25);
    expect(pool.some(isAltSpelling)).toBe(false);
  });
});

describe("Erzeugen", () => {
  it("höchstens so viele verschiedene Töne wie maxDistinct, Länge bleibt, nie zweimal hintereinander", () => {
    const rng = seeded(11);
    for (const len of [4, 5, 6]) {
      for (let k = 0; k < 200; k++) {
        const f = makeFolge(POOL_F, len, rng, { maxDistinct: 4 });
        expect(f).toHaveLength(len);
        expect(new Set(f).size).toBeLessThanOrEqual(4);
        for (let i = 1; i < f.length; i++) expect(f[i]).not.toBe(f[i - 1]);
      }
    }
  });
  it("nur Töne aus dem Pool, richtige Länge", () => {
    for (const len of [2, 3, 4, 5, 6]) {
      for (const f of many(POOL_F, len, 200, len)) {
        expect(f).toHaveLength(len);
        expect(f.every((n) => POOL_F.includes(n))).toBe(true);
      }
    }
  });
  it("Sprünge höchstens eine Quinte; meist Nachbarn in der Reihe", () => {
    let steps = 0;
    let neighbour = 0;
    const sorted = POOL_F.slice().sort((a, b) => note(a).midi - note(b).midi);
    for (const f of many(POOL_F, 5)) {
      for (let i = 1; i < f.length; i++) {
        const leap = Math.abs(note(f[i]).midi - note(f[i - 1]).midi);
        expect(leap).toBeLessThanOrEqual(FOLGE_MAX_LEAP);
        if (leap === 0) continue;
        steps++;
        if (Math.abs(sorted.indexOf(f[i]) - sorted.indexOf(f[i - 1])) === 1) neighbour++;
      }
    }
    expect(neighbour / steps).toBeGreaterThan(0.5);
  });
  it("Halbtonschritte kommen vor (f¹–fis¹, fis¹–g¹ …)", () => {
    const pairs = new Set<string>();
    for (const f of many(POOL_F, 5)) {
      for (let i = 1; i < f.length; i++) {
        if (Math.abs(note(f[i]).midi - note(f[i - 1]).midi) === 1) pairs.add([f[i - 1], f[i]].sort().join("-"));
      }
    }
    expect(pairs.has("f1-fis1")).toBe(true);
    expect(pairs.has("fis1-g1")).toBe(true);
    expect(pairs.has("c2-cis2")).toBe(true);
  });
  it("nie derselbe Ton zweimal direkt hintereinander, später wieder ist erlaubt", () => {
    for (const pool of [POOL8, POOL_F]) {
      const list = many(pool, 5, 800);
      let returns = 0;
      for (const f of list) {
        for (let i = 1; i < f.length; i++) expect(f[i]).not.toBe(f[i - 1]);
        if (new Set(f).size < f.length) returns++;
      }
      // d¹ g¹ d¹ u. ä. kommt vor
      expect(returns).toBeGreaterThan(0);
    }
  });
  it("beginnt nicht mit dem Ton davor", () => {
    const rng = seeded(5);
    for (let k = 0; k < 300; k++) expect(makeFolge(POOL8, 3, rng, { avoidFirst: "a1" })[0]).not.toBe("a1");
  });
  it("schwache Töne kommen häufiger vor", () => {
    const count = (weak?: Set<string>) => {
      const rng = seeded(9);
      let n = 0;
      for (let k = 0; k < 600; k++) n += makeFolge(POOL8, 4, rng, { weak }).filter((x) => x === "fis1").length;
      return n;
    };
    expect(count(new Set(["fis1"]))).toBeGreaterThan(count() * 1.5);
  });
  it("keine Folge zweimal (soweit möglich)", () => {
    const rng = seeded(2);
    const used = new Set<string>();
    for (let k = 0; k < 40; k++) {
      const f = makeFolge(POOL8, 4, rng, { used });
      expect(used.has(folgeKey(f))).toBe(false);
      used.add(folgeKey(f));
    }
  });
  it("fester Zufall → feste Folgen", () => {
    const a = many(POOL8, 4, 5, 42);
    const b = many(POOL8, 4, 5, 42);
    expect(a).toEqual(b);
    expect(a[0]).toEqual(["a1", "g1", "h1", "c2"]);
  });
});

describe("Länge", () => {
  it("Beginn mit 3, bei genau 5 Tönen 2 oder 3", () => {
    expect(new FolgeLength(8, 5, seeded(1)).len).toBe(3);
    const at5 = new Set(Array.from({ length: 40 }, (_, i) => new FolgeLength(5, 5, seeded(i)).len));
    expect([...at5].sort()).toEqual([2, 3]);
  });
  it("Lesen beginnt mit 4 (bei genau 5 Tönen 3 oder 4)", () => {
    expect(new FolgeLength(8, 8, seeded(1), 4).len).toBe(4);
    const at5 = new Set(Array.from({ length: 40 }, (_, i) => new FolgeLength(5, 6, seeded(i), 4).len));
    expect([...at5].sort()).toEqual([3, 4]);
  });
  it("nach zwei fehlerfreien +1, nach einer fehlerhaften −1, Bereich 2 bis max (Lesen 6, ab Stufe 3: 8)", () => {
    expect(folgeMaxLen(2)).toBe(6);
    expect(folgeMaxLen(3)).toBe(8);
    const l = new FolgeLength(8, 5, seeded(1));
    l.update(true);
    expect(l.len).toBe(3);
    l.update(true);
    expect(l.len).toBe(4);
    l.update(true);
    l.update(false); // Fehler unterbricht die Reihe
    expect(l.len).toBe(3);
    l.update(true);
    expect(l.len).toBe(3);
    for (let i = 0; i < 20; i++) l.update(true);
    expect(l.len).toBe(5);
    for (let i = 0; i < 20; i++) l.update(false);
    expect(l.len).toBe(2);
    const l8 = new FolgeLength(14, folgeMaxLen(8), seeded(1));
    for (let i = 0; i < 20; i++) l8.update(true);
    expect(l8.len).toBe(8);
  });
});

describe("Antwortknöpfe fürs Lesen", () => {
  it("alle Töne der Folge, mindestens 1 anderer, insgesamt bis 5 (eine Zeile), nach Tonhöhe", () => {
    const rng = seeded(3);
    for (let k = 0; k < 200; k++) {
      const f = makeFolge(POOL_F, 5, rng, { maxDistinct: FOLGE_MAX_DISTINCT });
      const c = folgeChoices(f, POOL_F, rng);
      expect(c.length).toBe(5);
      for (const n of f) expect(c).toContain(n);
      expect(c.filter((x) => !f.includes(x)).length).toBeGreaterThanOrEqual(1);
      const midis = c.map((x) => note(x).midi);
      expect(midis).toEqual(midis.slice().sort((a, b) => a - b));
      expect(new Set(midis).size).toBe(c.length);
    }
  });
  it("wenige Töne: entsprechend weniger, aber immer einer nicht aus der Folge", () => {
    const pool5 = ["h1", "a1", "g1", "c2", "d2"];
    const c = folgeChoices(["g1", "a1", "h1", "c2"], pool5, seeded(1));
    expect(c).toEqual(["g1", "a1", "h1", "c2", "d2"]);
    expect(folgeChoices(["g1", "a1"], pool5, seeded(1))).toHaveLength(5);
    // fehlt ein Ton zum Ablenken, kommt einer aus einer späteren Stufe dazu
    const c3 = folgeChoices(["g1", "a1", "h1"], ["h1", "a1", "g1"], seeded(1));
    expect(c3).toHaveLength(4);
  });
  it("Griffe: verwechselbar nach Griff, gemischt, alle Töne der Folge, bis 5", () => {
    const rng = seeded(8);
    let unsorted = 0;
    for (let k = 0; k < 200; k++) {
      const f = makeFolge(POOL_F, 4, rng, { maxDistinct: FOLGE_MAX_DISTINCT });
      const c = folgeChoices(f, POOL_F, rng, "griff");
      expect(c.length).toBe(5);
      for (const n of f) expect(c).toContain(n);
      expect(new Set(c.map((x) => note(x).fingering)).size).toBe(c.length);
      const midis = c.map((x) => note(x).midi);
      if (midis.join() !== midis.slice().sort((a, b) => a - b).join()) unsorted++;
    }
    expect(unsorted).toBeGreaterThan(150);
  });
  it("kein Ton der Folge in anderer Oktave als falsche Möglichkeit", () => {
    const rng = seeded(5);
    for (let k = 0; k < 200; k++) {
      const f = makeFolge(POOL_F, 5, rng);
      const c = folgeChoices(f, POOL_F, rng);
      for (const x of c.filter((x) => !f.includes(x))) {
        expect(f.some((n) => note(n).name === note(x).name)).toBe(false);
      }
    }
  });
  it("keine anderen Schreibweisen", () => {
    const all = unlockedNotes("lesen", 12);
    const c = folgeChoices(["es1", "f1", "g1"], all, seeded(4));
    expect(c.some(isAltSpelling)).toBe(false);
  });
});

describe("Pflichtton und Wechsel-Drills", () => {
  it("must: der Ton kommt vor, an verschiedenen Stellen, nicht vorn, wenn er der Ton davor war", () => {
    const rng = seeded(21);
    const at = new Set<number>();
    for (let k = 0; k < 300; k++) {
      const f = makeFolge(POOL8, 4, rng, { must: "e1" });
      expect(f).toHaveLength(4);
      expect(f).toContain("e1");
      at.add(f.indexOf("e1"));
      for (let i = 1; i < f.length; i++) expect(f[i]).not.toBe(f[i - 1]);
      const g = makeFolge(POOL8, 4, rng, { must: "a1", avoidFirst: "a1" });
      expect(g).toContain("a1");
      expect(g[0]).not.toBe("a1");
    }
    expect(at.size).toBe(4);
  });
  it("Gegenbewegung: h¹ → c² ja, g¹ → a¹ nein", () => {
    expect(counterMotion("h1", "c2")).toBe(true);
    expect(counterMotion("c2", "h1")).toBe(true);
    expect(counterMotion("g1", "a1")).toBe(false);
    expect(pairKey("c2", "h1")).toBe("h1-c2");
  });
  it("Drill-Paar: schwierige Paare zuerst, sonst Gegenbewegung; Nachbarn höchstens eine große Terz", () => {
    const rng = seeded(5);
    for (let k = 0; k < 100; k++) {
      const p = drillPair(POOL8, undefined, rng)!;
      expect(Math.abs(note(p[0]).midi - note(p[1]).midi)).toBeLessThanOrEqual(4);
      expect(counterMotion(...p)).toBe(true);
    }
    const pairs = { "g1-a1": [1, 0, 1, 0, 1] as (0 | 1)[], "h1-c2": [1, 1, 1] as (0 | 1)[] };
    for (let k = 0; k < 20; k++) expect(drillPair(POOL8, pairs, rng)!.slice().sort()).toEqual(["a1", "g1"]);
  });
  it("Drill: zwei Töne im Wechsel, beginnt nicht mit dem Ton davor", () => {
    const rng = seeded(2);
    for (let k = 0; k < 50; k++) {
      const f = drillNotes(["h1", "c2"], rng, "h1");
      expect(f).toEqual(["c2", "h1", "c2", "h1", "c2", "h1"]);
    }
  });
});

describe("Nur Schritte (Hören zu Beginn)", () => {
  it("stepsOnly: jeder Schritt geht zum Nachbarton in der Tonhöhen-Reihe", () => {
    const rng = seeded(31);
    const sorted = POOL8.slice().sort((a, b) => note(a).midi - note(b).midi);
    for (let k = 0; k < 200; k++) {
      const f = makeFolge(POOL8, 3, rng, { stepsOnly: true });
      expect(f).toHaveLength(3);
      for (let i = 1; i < f.length; i++) expect(Math.abs(sorted.indexOf(f[i]) - sorted.indexOf(f[i - 1]))).toBe(1);
    }
  });
});
