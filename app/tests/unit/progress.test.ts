import { describe, expect, it } from "vitest";
import { maxLevel, unlockedNotes } from "../../src/music/levels";
import {
  accuracy,
  checkUnlocks,
  isWeak,
  level,
  noteMastered,
  readyForNext,
  recordAnswer,
  setLevel,
  streak,
  weekDots,
} from "../../src/srs/progress";
import { defaultData } from "../../src/store/data";
import { addDays } from "../../src/store/dates";
import { answers, master, TODAY } from "./helpers";

const Y = addDays(TODAY, -1);

describe("Stufen", () => {
  it("Lesen 12 Stufen, Spielen 11", () => {
    expect(maxLevel("lesen")).toBe(12);
    expect(maxLevel("spielen")).toBe(11);
  });
  it("Reihenfolge der Töne", () => {
    expect(unlockedNotes("lesen", 7)).toEqual(["h1", "a1", "g1", "c2", "d2", "e1", "d1", "fis1", "e2", "f1", "c1", "cis2", "f2", "g2"]);
    expect(unlockedNotes("lesen", 11)).toHaveLength(25);
    expect(unlockedNotes("lesen", 12)).toHaveLength(31);
    expect(unlockedNotes("spielen", 11)).toHaveLength(25);
  });
});

describe("Trefferquote", () => {
  it("letzte 20 Antworten", () => {
    const l = answers(25, 5, [TODAY]); // die ersten 5 falsch, fallen heraus
    expect(accuracy(l)).toEqual({ n: 20, correct: 20, ratio: 1 });
  });
  it("rot: mindestens 5 Antworten und unter 80 %", () => {
    expect(isWeak(accuracy(answers(4, 4, [TODAY])))).toBe(false);
    expect(isWeak(accuracy(answers(5, 2, [TODAY])))).toBe(true);
    expect(isWeak(accuracy(answers(5, 1, [TODAY])))).toBe(false); // 80 % ist nicht unter 80 %
  });
  it("recordAnswer hält nur 20 und merkt den Tag", () => {
    const d = defaultData();
    for (let i = 0; i < 25; i++) recordAnswer(d, "lesen", "h1", true, i, TODAY);
    expect(d.history.lesen.h1).toHaveLength(20);
    expect(d.days).toEqual([TODAY]);
  });
});

describe("Freischalten", () => {
  it("10 Antworten, 90 %", () => {
    expect(noteMastered(answers(10, 1, [Y, TODAY]), 0)).toBe(true); // 9 von 10
    expect(noteMastered(answers(20, 2, [Y, TODAY]), 0)).toBe(true); // 18 von 20
    expect(noteMastered(answers(20, 3, [Y, TODAY]), 0)).toBe(false); // 17 von 20
    expect(noteMastered(answers(9, 0, [Y, TODAY]), 0)).toBe(false); // zu wenige
    expect(noteMastered(answers(10, 2, [Y, TODAY]), 0)).toBe(false); // 80 %
  });
  it("alles an einem Tag reicht: fleißiges Üben wird nicht ausgebremst", () => {
    expect(noteMastered(answers(10, 1, [TODAY]), 0)).toBe(true);
    expect(noteMastered(answers(20, 0, [TODAY]), 0)).toBe(true);
  });
  it("es zählen nur die letzten 20: ältere Fehler fallen heraus", () => {
    const l = [...answers(5, 5, [Y]), ...answers(20, 0, [TODAY], 5000)];
    expect(noteMastered(l, 0)).toBe(true);
    const l2 = [...answers(5, 5, [Y]), ...answers(17, 0, [TODAY], 5000)]; // 3 Fehler noch drin: 17 von 20
    expect(noteMastered(l2, 0)).toBe(false);
  });
  it("jeder freigeschaltete Ton muss es erfüllen", () => {
    const d = defaultData();
    master(d, "lesen", ["h1", "a1"]);
    expect(readyForNext(d, "lesen")).toBe(false);
    master(d, "lesen", ["g1"]);
    expect(readyForNext(d, "lesen")).toBe(true);
    const u = checkUnlocks(d);
    expect(u).toEqual([{ track: "lesen", level: 2, notes: ["c2", "d2"] }]);
    expect(d.stages.lesen).toBe("c2-d2");
    // neue Töne haben noch keine Antworten: keine weitere Stufe
    expect(checkUnlocks(d)).toEqual([]);
  });
  it("Spielen kann Lesen nie überholen", () => {
    const d = defaultData();
    master(d, "spielen", ["h1", "a1", "g1"]);
    expect(readyForNext(d, "spielen")).toBe(false);
    expect(checkUnlocks(d)).toEqual([]);
    master(d, "lesen", ["h1", "a1", "g1"]);
    const u = checkUnlocks(d);
    expect(u.map((x) => x.track)).toEqual(["lesen", "spielen"]);
    expect(level(d, "spielen")).toBe(2);
  });
  it("Stufe 12 ist die letzte (Lesen), Spielen endet bei 11", () => {
    const d = defaultData();
    d.stages.lesen = "andere-schreibweisen";
    master(d, "lesen", unlockedNotes("lesen", 12));
    expect(readyForNext(d, "lesen")).toBe(false);
    d.stages.spielen = "hohe-griffe";
    master(d, "spielen", unlockedNotes("spielen", 11));
    expect(readyForNext(d, "spielen")).toBe(false);
  });
});

describe("Stufe von Hand", () => {
  it("Spielen bleibt auf die Lesen-Stufe begrenzt", () => {
    const d = defaultData();
    setLevel(d, "spielen", 5, 100);
    expect(level(d, "spielen")).toBe(1);
    setLevel(d, "lesen", 6, 100);
    setLevel(d, "spielen", 9, 100);
    expect(level(d, "spielen")).toBe(6);
  });
  it("Lesen unter Spielen senken: Spielen sinkt mit", () => {
    const d = defaultData();
    setLevel(d, "lesen", 8, 100);
    setLevel(d, "spielen", 8, 100);
    setLevel(d, "lesen", 3, 5000);
    expect(level(d, "spielen")).toBe(3);
    expect(d.countFrom).toEqual({ lesen: 5000, spielen: 5000 });
  });
  it("nach dem Senken zählen nur neue Antworten", () => {
    const d = defaultData();
    setLevel(d, "lesen", 2, 0);
    master(d, "lesen", ["h1", "a1", "g1", "c2", "d2"]); // Zeitpunkte 1000–1009
    setLevel(d, "lesen", 1, 2000);
    expect(readyForNext(d, "lesen")).toBe(false);
    expect(level(d, "lesen")).toBe(1);
    for (const n of ["h1", "a1", "g1"]) d.history.lesen[n].push(...answers(10, 0, [Y, TODAY], 3000));
    expect(readyForNext(d, "lesen")).toBe(true);
  });
  it("Daten gesperrter Töne bleiben erhalten", () => {
    const d = defaultData();
    setLevel(d, "lesen", 3, 0);
    d.history.lesen.e1 = answers(5, 0, [TODAY]);
    d.cards["e1|name"] = { box: 3, day: TODAY, session: 1 };
    setLevel(d, "lesen", 1, 10);
    expect(d.history.lesen.e1).toHaveLength(5);
    expect(d.cards["e1|name"]).toBeDefined();
  });
});

describe("Serie", () => {
  it("zählt Tage in Folge, heute offen zählt bis gestern", () => {
    const days = [addDays(TODAY, -3), addDays(TODAY, -2), Y];
    expect(streak(days, TODAY)).toBe(3);
    expect(streak([...days, TODAY], TODAY)).toBe(4);
    expect(streak([addDays(TODAY, -2)], TODAY)).toBe(0);
    expect(streak([], TODAY)).toBe(0);
  });
  it("Wochenpunkte Mo–So der laufenden Woche", () => {
    const w = weekDots(["2026-11-09", "2026-11-12", "2026-11-08"], TODAY);
    expect(w.map((x) => x.label)).toEqual(["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"]);
    expect(w.map((x) => x.on)).toEqual([true, false, false, true, false, false, false]);
    expect(w.findIndex((x) => x.today)).toBe(4);
  });
});
