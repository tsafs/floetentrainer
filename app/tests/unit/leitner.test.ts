import { describe, expect, it } from "vitest";
import { applyAnswer, dueCards, dueCount, dueDay, INTERVALS, isDue, newCards, nextBox } from "../../src/srs/leitner";
import { defaultData } from "../../src/store/data";
import { addDays, daysBetween, mondayOf } from "../../src/store/dates";
import { TODAY } from "./helpers";

describe("Fächer", () => {
  it("Abstände 1 → nächste Sitzung, dann 1, 3, 7, 14, 30 Tage", () => {
    expect(INTERVALS).toEqual([0, 1, 3, 7, 14, 30]);
  });
  it("neue Karte: richtig → Fach 2, falsch → Fach 1", () => {
    expect(nextBox(undefined, true)).toBe(2);
    expect(nextBox(undefined, false)).toBe(1);
  });
  it("richtig: ein Fach höher, Fach 6 bleibt 6; falsch: Fach 1", () => {
    for (let b = 1; b <= 6; b++) {
      const c = { box: b, day: TODAY, session: 1 };
      expect(nextBox(c, true)).toBe(Math.min(b + 1, 6));
      expect(nextBox(c, false)).toBe(1);
    }
  });
  it("applyAnswer setzt Tag und Sitzung", () => {
    expect(applyAnswer({ box: 3, day: "2026-01-01", session: 2 }, true, TODAY, 7)).toEqual({ box: 4, day: TODAY, session: 7 });
  });
});

describe("Fälligkeit", () => {
  it("Fach 1: in der nächsten Sitzung, nicht in derselben", () => {
    const c = { box: 1, day: TODAY, session: 5 };
    expect(isDue(c, TODAY, 5)).toBe(false);
    expect(isDue(c, TODAY, 6)).toBe(true);
  });
  it("Fach 2: nach 1 Tag, Kalendertage", () => {
    const c = { box: 2, day: TODAY, session: 5 };
    expect(isDue(c, TODAY, 9)).toBe(false);
    expect(isDue(c, addDays(TODAY, 1), 9)).toBe(true);
  });
  it("Fach 6: nach 30 Tagen", () => {
    const c = { box: 6, day: TODAY, session: 1 };
    expect(isDue(c, addDays(TODAY, 29), 9)).toBe(false);
    expect(isDue(c, addDays(TODAY, 30), 9)).toBe(true);
    expect(dueDay(c)).toBe(addDays(TODAY, 30));
  });
  it("Monats- und Jahreswechsel, Sommerzeit", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-28", 1)).toBe("2026-03-29");
    expect(addDays("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDays("2026-10-25", 1)).toBe("2026-10-26");
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
    expect(mondayOf(TODAY)).toBe("2026-11-09");
    expect(mondayOf("2026-11-15")).toBe("2026-11-09");
    expect(mondayOf("2026-11-09")).toBe("2026-11-09");
  });
  it("die am längsten überfälligen zuerst", () => {
    const d = defaultData();
    d.cards["h1|name"] = { box: 2, day: addDays(TODAY, -2), session: 1 }; // 1 Tag über
    d.cards["a1|name"] = { box: 3, day: addDays(TODAY, -10), session: 1 }; // 7 Tage über
    d.cards["g1|name"] = { box: 4, day: addDays(TODAY, -3), session: 1 }; // noch nicht fällig
    d.cards["g1|griff"] = { box: 1, day: addDays(TODAY, -4), session: 1 }; // 4 Tage
    expect(dueCards(d, "lesen", TODAY, 2).map((c) => c.note + "|" + c.kind)).toEqual(["a1|name", "g1|griff", "h1|name"]);
  });
  it("gesperrte Töne sind nie fällig (Daten bleiben)", () => {
    const d = defaultData();
    d.cards["c2|name"] = { box: 2, day: addDays(TODAY, -5), session: 1 };
    expect(dueCount(d, "lesen", TODAY)).toBe(0);
    expect(d.cards["c2|name"]).toBeDefined();
  });
  it("neue Karten: Stufe 1 hat 9 Lesen- und 3 Spielen-Karten", () => {
    const d = defaultData();
    expect(newCards(d, "lesen")).toHaveLength(9);
    expect(newCards(d, "spielen")).toHaveLength(3);
  });
  it("andere Schreibweisen nur Note→Name und Note→Griff", () => {
    const d = defaultData();
    d.stages.lesen = "andere-schreibweisen";
    const alt = newCards(d, "lesen").filter((c) => c.note === "dis1");
    expect(alt.map((c) => c.kind).sort()).toEqual(["griff", "name"]);
  });
});
