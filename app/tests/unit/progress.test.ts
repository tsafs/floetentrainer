import { describe, expect, it } from "vitest";
import { maxLevel, unlockedNotes } from "../../src/music/levels";
import {
  accuracy,
  blockingNotes,
  checkUnlocks,
  isWeak,
  level,
  noteMastered,
  notePoints,
  pointsFromHistory,
  pointsMissing,
  readyForNext,
  recordAnswer,
  setLevel,
  stepPoints,
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
  it("Sicherheit: richtig +1, falsch −2, zwischen 0 und 10", () => {
    expect(stepPoints(0, true)).toBe(1);
    expect(stepPoints(10, true)).toBe(10);
    expect(stepPoints(10, false)).toBe(8);
    expect(stepPoints(1, false)).toBe(0);
    // aus Antworten nachgerechnet (ab 0, in ihrer Reihenfolge)
    expect(pointsFromHistory(answers(8, 0, [TODAY]), 0)).toBe(8);
    expect(pointsFromHistory(answers(20, 3, [TODAY]), 0)).toBe(10); // Fehler am Anfang: kosten nichts
    expect(pointsFromHistory([...answers(10, 0, [TODAY]), [0, TODAY, 9000]], 0)).toBe(8);
    expect(pointsFromHistory([...answers(10, 0, [TODAY]), [0, TODAY, 9000]], 5000)).toBe(0); // vor countFrom zählt nicht
  });
  it("sitzt ab 8 Punkten: 8 richtige reichen, ein Fehler kostet zwei weitere", () => {
    const d = defaultData();
    for (let i = 0; i < 7; i++) recordAnswer(d, "lesen", "h1", true, i, TODAY);
    expect(noteMastered(d, "lesen", "h1")).toBe(false);
    expect(pointsMissing(d, "lesen", "h1")).toBe(1);
    recordAnswer(d, "lesen", "h1", false, 7, TODAY); // 7 → 5
    expect(pointsMissing(d, "lesen", "h1")).toBe(3);
    for (let i = 0; i < 3; i++) recordAnswer(d, "lesen", "h1", true, 8 + i, TODAY);
    expect(noteMastered(d, "lesen", "h1")).toBe(true);
  });
  it("ein Ausrutscher bei vollem Ton hält nicht auf – egal, wie lange er zurückliegt", () => {
    const d = defaultData();
    for (let i = 0; i < 19; i++) recordAnswer(d, "lesen", "d2", true, i, TODAY);
    recordAnswer(d, "lesen", "d2", false, 19, TODAY);
    expect(notePoints(d, "lesen", "d2")).toBe(8);
    expect(noteMastered(d, "lesen", "d2")).toBe(true);
    recordAnswer(d, "lesen", "d2", false, 20, TODAY); // zweiter Fehler: 6, zwei richtige holen ihn zurück
    expect(pointsMissing(d, "lesen", "d2")).toBe(2);
    recordAnswer(d, "lesen", "d2", true, 21, TODAY);
    recordAnswer(d, "lesen", "d2", true, 22, TODAY);
    expect(noteMastered(d, "lesen", "d2")).toBe(true);
  });
  it("jede richtige Antwort bringt einen Punkt (anders als die letzten 20, wo 17 von 20 stehen blieb)", () => {
    const d = defaultData();
    // 5 richtig, 3 falsch, dann richtig: kein Fenster, das alte Antworten verdrängt
    [1, 1, 1, 1, 1, 0, 0, 0].forEach((a, i) => recordAnswer(d, "lesen", "d2", a === 1, i, TODAY));
    let p = notePoints(d, "lesen", "d2");
    for (let i = 0; i < 6; i++) {
      recordAnswer(d, "lesen", "d2", true, 100 + i, TODAY);
      expect(notePoints(d, "lesen", "d2")).toBe(Math.min(10, p + 1));
      p = notePoints(d, "lesen", "d2");
    }
  });
  it("gespeicherte Sicherheit gilt vor den Antworten; Senken einer Stufe setzt sie zurück", () => {
    const d = defaultData();
    d.stages.lesen = "c2-d2";
    master(d, "lesen", ["h1"]);
    expect(notePoints(d, "lesen", "h1")).toBe(10); // nachgerechnet
    d.points = { lesen: { h1: 3 }, spielen: {} };
    expect(notePoints(d, "lesen", "h1")).toBe(3);
    setLevel(d, "lesen", 1, 99999);
    expect(notePoints(d, "lesen", "h1")).toBe(0);
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

describe("Aufhaltende Töne", () => {
  it("die Töne der Stufe, die die Bedingung noch nicht erfüllen", () => {
    const d = defaultData();
    expect(blockingNotes(d, "lesen")).toEqual(["h1", "a1", "g1"]);
    master(d, "lesen", ["h1", "g1"]);
    d.history.lesen.a1 = [...answers(10, 0, [TODAY]), ...answers(3, 3, [TODAY], 5000)]; // 10, dann 3 Fehler: 4 Punkte
    expect(blockingNotes(d, "lesen")).toEqual(["a1"]);
  });
  it("an der Grenze der Spur hält nichts auf", () => {
    const d = defaultData();
    // Spielen steht an der Lesen-Stufe
    expect(blockingNotes(d, "spielen")).toEqual([]);
    d.stages.lesen = "andere-schreibweisen";
    expect(blockingNotes(d, "lesen")).toEqual([]);
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
    d.points = { lesen: { h1: 9 }, spielen: { h1: 9 } };
    setLevel(d, "lesen", 3, 5000);
    expect(level(d, "spielen")).toBe(3);
    expect(d.countFrom).toEqual({ lesen: 5000, spielen: 5000 });
    expect(d.points).toEqual({ lesen: {}, spielen: {} }); // Sicherheit beider Spuren zurückgesetzt
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
