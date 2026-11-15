import { describe, expect, it } from "vitest";
import { kindsForNote, levelOf, stagesOf, unlockedNotes } from "../../src/music/levels";
import { dueCards, dueDay, newCards } from "../../src/srs/leitner";
import { checkUnlocks, countedNotes, level, readyForNext, setLevel, startLevel } from "../../src/srs/progress";
import { buildPlan } from "../../src/srs/session";
import {
  ASSUMED_BOX,
  chooseStart,
  currentMilestone,
  knownNotes,
  milestone,
  milestoneAllowed,
  milestoneLevel,
  addedNotes,
  nextNotes,
  MILESTONES,
  needsWelcome,
  STAGGER_PER_DAY,
} from "../../src/srs/startpoint";
import { cardKey, defaultData, normalizeData } from "../../src/store/data";
import { addDays } from "../../src/store/dates";
import { answers, master, seeded, TODAY } from "./helpers";

const NOW = 5_000_000;
const ms = (id: string) => milestone(id)!;

describe("Meilensteine", () => {
  it("passen zu den Stufen, aufsteigend, beginnen bei Stufe 1", () => {
    expect(MILESTONES.map((m) => milestoneLevel(m, "lesen"))).toEqual([1, 3, 7, 9, 12]);
    for (const m of MILESTONES) expect(stagesOf("lesen").some((s) => s.id === m.stage)).toBe(true);
    expect(milestoneLevel(ms("alle-toene"), "spielen")).toBe(11);
  });
  it("enthaltene und neue Töne", () => {
    expect(knownNotes(ms("von-vorn"))).toEqual([]);
    expect(knownNotes(ms("linke-hand"))).toEqual(["h1", "a1", "g1", "c2", "d2"]);
    expect(addedNotes(ms("erste-oktave"))).toEqual(["e1", "d1", "fis1", "e2", "f1", "c1"]);
    expect(addedNotes(ms("hohe-toene"))).toEqual(["cis2", "f2", "g2", "a2", "h2", "c3"]);
    expect(addedNotes(ms("alle-toene"))).toHaveLength(8);
    expect(knownNotes(ms("alle-toene"))).toEqual(unlockedNotes("spielen", 11));
    expect(MILESTONES.map((m) => knownNotes(m).length)).toEqual([0, 5, 11, 17, 25]);
    expect(nextNotes(ms("hohe-toene"))).toEqual(["b1", "es1"]);
  });
});

describe("Willkommensseite", () => {
  it("nur beim allerersten Start", () => {
    const d = defaultData();
    expect(needsWelcome(d)).toBe(true);
    chooseStart(d, ms("von-vorn"), "beide", NOW, TODAY);
    expect(needsWelcome(d)).toBe(false);
    expect(d.start).toEqual({ lesen: "erste-toene", spielen: "erste-toene" });
  });
  it("wer schon geübt hat, sieht sie nicht", () => {
    const d = defaultData();
    d.sessions = 3;
    expect(needsWelcome(d)).toBe(false);
  });
  it("„Von vorn“ auf frischen Daten ändert nichts am Lernstand", () => {
    const d = defaultData();
    chooseStart(d, ms("von-vorn"), "beide", NOW, TODAY);
    expect(d.cards).toEqual({});
    expect(d.introduced).toEqual({ lesen: [], spielen: [] });
    expect(level(d, "lesen")).toBe(1);
    expect(d.countFrom).toEqual({ lesen: 0, spielen: 0 });
  });
});

describe("Startpunkt wählen", () => {
  it("Hohe Töne bis c³: Stufe 9 in beiden Spuren, Töne davor bekannt", () => {
    const d = defaultData();
    chooseStart(d, ms("hohe-toene"), "beide", NOW, TODAY);
    expect(level(d, "lesen")).toBe(9);
    expect(level(d, "spielen")).toBe(9);
    const known = unlockedNotes("lesen", 8);
    expect(d.introduced.lesen.sort()).toEqual(known.slice().sort());
    expect(d.introduced.spielen.sort()).toEqual(known.slice().sort());
    for (const n of known) {
      for (const k of [...kindsForNote("lesen", n), "spiel" as const]) expect(d.cards[cardKey(n, k)]?.box).toBe(ASSUMED_BOX);
    }
    // neu sind nur b¹ und es¹
    expect(new Set(newCards(d, "lesen").map((c) => c.note))).toEqual(new Set(["b1", "es1"]));
    expect(newCards(d, "spielen").map((c) => c.note)).toEqual(["b1", "es1"]);
  });

  it("die angenommenen Karten werden gestaffelt fällig, höchstens 3 je Spur und Tag, ab morgen", () => {
    const d = defaultData();
    chooseStart(d, ms("hohe-toene"), "beide", NOW, TODAY);
    for (const t of ["lesen", "spielen"] as const) {
      const per = new Map<string, number>();
      for (const n of unlockedNotes(t, 8)) {
        for (const k of kindsForNote(t, n)) {
          const day = dueDay(d.cards[cardKey(n, k)]);
          per.set(day, (per.get(day) ?? 0) + 1);
        }
      }
      expect(Math.max(...per.values())).toBeLessThanOrEqual(STAGGER_PER_DAY);
      expect([...per.keys()].sort()[0]).toBe(addDays(TODAY, 1));
      // heute ist nichts fällig
      expect(dueCards(d, t, TODAY, 1)).toEqual([]);
    }
    // morgen genau 3 je Spur, zuerst die Töne nahe am Startpunkt
    expect(dueCards(d, "lesen", addDays(TODAY, 1), 1)).toHaveLength(3);
    expect(dueCards(d, "lesen", addDays(TODAY, 1), 1).map((c) => c.note).sort()).toEqual(["a2", "c3", "h2"]);
  });

  it("die erste Sitzung: keine Vorstellung bekannter Töne, die neuen Töne kommen sofort", () => {
    const d = defaultData();
    chooseStart(d, ms("erste-oktave"), "beide", NOW, TODAY);
    const plan = buildPlan(d, "lesen", TODAY, 1, 20, seeded(3));
    const fresh = plan.filter((p) => p.type === "new").map((p) => p.note);
    expect(fresh.length).toBe(6);
    expect(new Set(fresh)).toEqual(new Set(["cis2", "f2", "g2"]));
    expect(plan.some((p) => p.type === "due")).toBe(false);
  });

  it("Freischalten zählt nur die Töne ab dem Startpunkt", () => {
    const d = defaultData();
    chooseStart(d, ms("hohe-toene"), "beide", NOW, TODAY);
    expect(countedNotes(d, "lesen")).toEqual(["b1", "es1"]);
    master(d, "lesen", ["b1"]);
    expect(readyForNext(d, "lesen")).toBe(false);
    master(d, "lesen", ["es1"]);
    expect(checkUnlocks(d).map((u) => [u.track, u.level])).toEqual([["lesen", 10]]);
    // nach dem Aufstieg zählen Stufe 9 und 10
    expect(countedNotes(d, "lesen")).toEqual(["b1", "es1", "cis1", "gis1", "fis2"]);
  });

  it("ohne Startpunkt (ältere Daten) zählen alle Töne wie bisher", () => {
    const d = defaultData();
    d.stages.lesen = "c2-d2";
    expect(startLevel(d, "lesen")).toBe(1);
    master(d, "lesen", ["c2", "d2"]);
    expect(readyForNext(d, "lesen")).toBe(false);
    master(d, "lesen", ["h1", "a1", "g1"]);
    expect(readyForNext(d, "lesen")).toBe(true);
  });

  it("geübte Töne behalten ihre Karten", () => {
    const d = defaultData();
    d.history.lesen.h1 = answers(10, 0, [TODAY]);
    d.cards["h1|name"] = { box: 5, day: TODAY, session: 2 };
    chooseStart(d, ms("linke-hand"), "beide", NOW, TODAY);
    expect(d.cards["h1|name"]).toEqual({ box: 5, day: TODAY, session: 2 });
    expect(d.cards["h1|griff"].box).toBe(ASSUMED_BOX);
  });

  it("nur Lesen: Spielen bleibt; nur Spielen: höchstens bis zur Lesen-Stufe", () => {
    const d = defaultData();
    chooseStart(d, ms("erste-oktave"), "lesen", NOW, TODAY);
    expect([level(d, "lesen"), level(d, "spielen")]).toEqual([7, 1]);
    expect(d.introduced.spielen).toEqual([]);
    expect(milestoneAllowed(d, ms("hohe-toene"), "spielen")).toBe(false);
    expect(milestoneAllowed(d, ms("erste-oktave"), "spielen")).toBe(true);
    // nicht erlaubt, aber falls doch: begrenzt auf die Lesen-Stufe
    chooseStart(d, ms("hohe-toene"), "spielen", NOW, TODAY);
    expect(level(d, "spielen")).toBe(7);
    chooseStart(d, ms("linke-hand"), "spielen", NOW, TODAY);
    expect([level(d, "lesen"), level(d, "spielen")]).toEqual([7, 3]);
  });

  it("Lesen zurück unter Spielen: Spielen geht mit", () => {
    const d = defaultData();
    chooseStart(d, ms("hohe-toene"), "beide", NOW, TODAY);
    chooseStart(d, ms("linke-hand"), "lesen", NOW + 1, TODAY);
    expect([level(d, "lesen"), level(d, "spielen")]).toEqual([3, 3]);
    expect(d.start).toEqual({ lesen: "e1-d1", spielen: "e1-d1" });
  });

  it("Alle Töne: Lesen bei den anderen Schreibweisen, Spielen ganz oben und alles bekannt", () => {
    const d = defaultData();
    chooseStart(d, ms("alle-toene"), "beide", NOW, TODAY);
    expect([level(d, "lesen"), level(d, "spielen")]).toEqual([12, 11]);
    expect(newCards(d, "spielen")).toEqual([]);
    expect(d.introduced.spielen).toHaveLength(25);
    expect(new Set(newCards(d, "lesen").map((c) => c.note))).toEqual(new Set(["dis1", "dis2", "as1", "as2", "ais1", "ais2"]));
    expect(currentMilestone(d, "spielen").id).toBe("alle-toene");
  });

  it("aktueller Meilenstein", () => {
    const d = defaultData();
    expect(currentMilestone(d, "lesen").id).toBe("von-vorn");
    chooseStart(d, ms("hohe-toene"), "beide", NOW, TODAY);
    expect(currentMilestone(d, "lesen").id).toBe("hohe-toene");
    master(d, "lesen", ["b1", "es1"]);
    checkUnlocks(d);
    expect(currentMilestone(d, "lesen").id).toBe("hohe-toene");
  });
});

describe("Zurückgehen", () => {
  it("angenommene, nie beantwortete Töne werden wieder neu; geübte bleiben; Zählung beginnt neu", () => {
    const d = defaultData();
    chooseStart(d, ms("hohe-toene"), "beide", NOW, TODAY);
    // e² wurde einmal wirklich beantwortet (z. B. als fällige Karte)
    d.history.lesen.e2 = answers(1, 0, [TODAY]);
    d.cards["e2|name"] = { box: 4, day: TODAY, session: 3 };
    d.points = { lesen: { e2: 9 }, spielen: {} };
    chooseStart(d, ms("linke-hand"), "beide", NOW + 10, TODAY);
    expect(level(d, "lesen")).toBe(3);
    expect(d.countFrom.lesen).toBe(NOW + 10);
    expect(d.points.lesen).toEqual({}); // Zurückgehen: Sicherheit beginnt neu
    // e¹, d¹: nie beantwortet → neu, mit Vorstellung
    expect(d.cards["e1|name"]).toBeUndefined();
    expect(d.introduced.lesen).not.toContain("e1");
    expect(d.introduced.spielen).not.toContain("e1");
    // e²: geübt → bleibt
    expect(d.cards["e2|name"]).toEqual({ box: 4, day: TODAY, session: 3 });
    expect(d.introduced.lesen).toContain("e2");
    // davor weiter bekannt
    expect(d.cards["h1|name"].box).toBe(ASSUMED_BOX);
    expect(new Set(newCards(d, "lesen").map((c) => c.note))).toEqual(new Set(["e1", "d1"]));
  });

  it("ganz von vorn: alles Angenommene wird neu, Antworten bleiben", () => {
    const d = defaultData();
    chooseStart(d, ms("erste-oktave"), "beide", NOW, TODAY);
    d.history.lesen.cis2 = answers(5, 1, [TODAY]);
    d.cards["cis2|name"] = { box: 2, day: TODAY, session: 1 };
    d.introduced.lesen.push("cis2");
    chooseStart(d, ms("von-vorn"), "beide", NOW + 10, TODAY);
    expect(level(d, "lesen")).toBe(1);
    expect(Object.keys(d.cards)).toEqual(["cis2|name"]);
    expect(d.introduced.lesen).toEqual(["cis2"]);
    expect(d.introduced.spielen).toEqual([]);
    expect(d.history.lesen.cis2).toHaveLength(5);
  });

  it("Senken von Hand unter den Startpunkt zieht ihn mit", () => {
    const d = defaultData();
    chooseStart(d, ms("hohe-toene"), "beide", NOW, TODAY);
    setLevel(d, "lesen", 5, NOW + 1);
    expect(d.start).toEqual({ lesen: "e2-f1", spielen: "e2-f1" });
    expect(levelOf("lesen", d.start!.lesen)).toBe(5);
    // Erhöhen von Hand lässt den Startpunkt stehen
    setLevel(d, "lesen", 6, NOW + 2);
    expect(startLevel(d, "lesen")).toBe(5);
  });
});

describe("Daten", () => {
  it("start übersteht Speichern und Einlesen", () => {
    const d = defaultData();
    chooseStart(d, ms("erste-oktave"), "beide", NOW, TODAY);
    const back = normalizeData(JSON.parse(JSON.stringify(d)));
    expect(back.start).toEqual({ lesen: "cis2-f2-g2", spielen: "cis2-f2-g2" });
    expect(back.cards).toEqual(d.cards);
  });
  it("fehlt start, bleibt es weg; Fehlerhaftes und zu Hohes wird begrenzt", () => {
    expect(normalizeData({ version: 2 }).start).toBeUndefined();
    const d = normalizeData({ version: 2, stages: { lesen: "c1", spielen: "e1-d1" }, start: { lesen: "hoch-stamm", spielen: 7 } });
    expect(d.start).toEqual({ lesen: "c1", spielen: "erste-toene" });
  });
});
