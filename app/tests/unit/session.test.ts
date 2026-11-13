import { describe, expect, it } from "vitest";
import { buildPlan, MAX_NEW, Session, type Step } from "../../src/srs/session";
import { cardKey, defaultData, type AppData } from "../../src/store/data";
import { addDays } from "../../src/store/dates";
import { seeded, TODAY } from "./helpers";

function mkSession(d: AppData, track: "lesen" | "spielen" = "lesen", opts: { limitCards?: number; limitMs?: number; seed?: number; clock?: { t: number } } = {}) {
  const clock = opts.clock ?? { t: 1_000_000 };
  return new Session(d, {
    track,
    today: TODAY,
    rng: seeded(opts.seed ?? 3),
    now: () => clock.t,
    limitCards: opts.limitCards ?? 20,
    limitMs: opts.limitMs ?? 5 * 60_000,
  });
}

/** Spielt eine Sitzung durch; answerFn entscheidet richtig/falsch. Gibt alle Schritte zurück. */
function run(s: Session, answerFn: (step: Extract<Step, { type: "card" }>, i: number) => boolean = () => true) {
  const steps: Step[] = [];
  let i = 0;
  for (let st = s.next(); st; st = s.next()) {
    steps.push(st);
    if (st.type === "intro") s.introDone(st.note);
    else s.answer(answerFn(st, i++));
    if (steps.length > 500) throw new Error("Endlosschleife");
  }
  return steps;
}

function stageLesen(d: AppData, id: string) {
  d.stages.lesen = id;
}

describe("Zusammensetzung", () => {
  it("erste Sitzung: höchstens 6 neue Karten, Rest Zusatzkarten, insgesamt 20", () => {
    const d = defaultData();
    const plan = buildPlan(d, "lesen", TODAY, 1, 20, seeded(1));
    expect(plan).toHaveLength(20);
    expect(plan.filter((p) => p.type === "new")).toHaveLength(MAX_NEW);
    expect(plan.slice(0, 6).every((p) => p.type === "new")).toBe(true);
    expect(plan.slice(6).every((p) => p.type === "extra")).toBe(true);
    // neue Karten: alle drei Töne als Note→Name, dann Note→Griff
    expect(plan.slice(0, 6).map((p) => p.kind)).toEqual(["name", "name", "name", "griff", "griff", "griff"]);
  });
  it("fällige zuerst (am längsten überfällig vorn), dann neue, dann Zusatzkarten", () => {
    const d = defaultData();
    stageLesen(d, "c2-d2");
    d.cards["h1|name"] = { box: 2, day: addDays(TODAY, -2), session: 1 };
    d.cards["a1|name"] = { box: 2, day: addDays(TODAY, -6), session: 1 };
    d.cards["g1|name"] = { box: 5, day: TODAY, session: 1 }; // nicht fällig
    const plan = buildPlan(d, "lesen", TODAY, 2, 20, seeded(1));
    expect(plan.slice(0, 2).map((p) => [p.note, p.type])).toEqual([
      ["a1", "due"],
      ["h1", "due"],
    ]);
    expect(plan.slice(2, 8).every((p) => p.type === "new")).toBe(true);
    expect(plan.slice(8).every((p) => p.type === "extra")).toBe(true);
  });
  it("viele fällige Karten: Sitzung nur aus fälligen", () => {
    const d = defaultData();
    stageLesen(d, "hohe-griffe");
    for (const n of ["h1", "a1", "g1", "c2", "d2", "e1", "d1", "fis1"]) {
      for (const k of ["name", "griff", "note"]) d.cards[`${n}|${k}`] = { box: 2, day: addDays(TODAY, -3), session: 1 };
    }
    const plan = buildPlan(d, "lesen", TODAY, 2, 20, seeded(1));
    expect(plan.every((p) => p.type === "due")).toBe(true);
  });
  it("nichts fällig, nichts neu: nur Zusatzkarten", () => {
    const d = defaultData();
    for (const n of ["h1", "a1", "g1"]) for (const k of ["name", "griff", "note"]) d.cards[`${n}|${k}`] = { box: 4, day: TODAY, session: 1 };
    const s = mkSession(d);
    expect(s.isNothingDueOrNew).toBe(true);
    expect(s.plan).toHaveLength(20);
  });
  it("Spielen: nur Spielen-Karten", () => {
    const d = defaultData();
    const plan = buildPlan(d, "spielen", TODAY, 1, 20, seeded(1));
    expect(plan.every((p) => p.kind === "spiel")).toBe(true);
    expect(plan.filter((p) => p.type === "new")).toHaveLength(3);
  });
  it("Zusatzkarten: schwache Töne dreifach gewichtet", () => {
    const d = defaultData();
    for (const n of ["h1", "a1", "g1"]) for (const k of ["name", "griff", "note"]) d.cards[`${n}|${k}`] = { box: 4, day: TODAY, session: 1 };
    d.history.lesen.g1 = Array.from({ length: 10 }, (_, i) => [i < 5 ? 0 : 1, TODAY, i] as [0 | 1, string, number]);
    let g = 0;
    let total = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const plan = buildPlan(d, "lesen", TODAY, 2, 20, seeded(seed));
      g += plan.filter((p) => p.note === "g1").length;
      total += plan.length;
    }
    // ohne Gewicht wäre g1 ein Drittel; mit Gewicht 3 deutlich mehr (wegen „nie zweimal hintereinander“ höchstens die Hälfte)
    expect(g / total).toBeGreaterThan(0.4);
  });
});

describe("Ablauf", () => {
  it("derselbe Ton nie zweimal direkt hintereinander, auch mit Wiederholungen", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const d = defaultData();
      const stage = ["erste-toene", "e1-d1", "c1", "andere-schreibweisen"][seed % 4];
      stageLesen(d, stage);
      d.stages.spielen = stage === "andere-schreibweisen" ? "hohe-griffe" : stage;
      const s = mkSession(d, seed % 3 === 0 ? "spielen" : "lesen", { seed });
      const rnd = seeded(seed + 100);
      const steps = run(s, () => rnd() < 0.6);
      const cards = steps.filter((x): x is Extract<Step, { type: "card" }> => x.type === "card");
      for (let i = 1; i < cards.length; i++) expect(cards[i].item.note).not.toBe(cards[i - 1].item.note);
    }
  });
  it("Vorstellung vor der ersten Karte eines neuen Tons, nur einmal", () => {
    const d = defaultData();
    const s = mkSession(d);
    const steps = run(s);
    const intros = steps.filter((x) => x.type === "intro").map((x) => (x as { note: string }).note);
    expect(intros.sort()).toEqual(["a1", "g1", "h1"]);
    steps.forEach((st, i) => {
      if (st.type === "intro") {
        const nx = steps[i + 1];
        expect(nx.type === "card" && nx.item.note === st.note).toBe(true);
      }
    });
    expect(d.introduced.lesen.sort()).toEqual(["a1", "g1", "h1"]);
    // nächste Sitzung: keine Vorstellung mehr
    const s2 = mkSession(d);
    expect(run(s2).some((x) => x.type === "intro")).toBe(false);
  });
  it("Vorstellung zählt nicht als Antwort", () => {
    const d = defaultData();
    const s = mkSession(d);
    const st = s.next()!;
    expect(st.type).toBe("intro");
    s.introDone((st as { note: string }).note);
    expect(s.graded).toBe(0);
    expect(Object.keys(d.cards)).toHaveLength(0);
  });
  it("richtig/falsch verändert Fächer, Zusatzkarten nicht", () => {
    const d = defaultData();
    const s = mkSession(d);
    run(s, (st) => st.item.type !== "extra" || st.item.note !== "h1");
    // die 6 neuen Karten wurden richtig beantwortet → Fach 2
    expect(Object.values(d.cards).map((c) => c.box)).toEqual([2, 2, 2, 2, 2, 2]);
    expect(Object.keys(d.cards)).not.toContain("h1|note");
  });
  it("Zusatzkarten zählen für die Trefferquote", () => {
    const d = defaultData();
    const s = mkSession(d);
    run(s);
    const n = Object.values(d.history.lesen).reduce((a, l) => a + l.length, 0);
    expect(n).toBe(20);
    expect(d.days).toEqual([TODAY]);
  });
  it("falsche Karte kommt nach 2–3 anderen Karten nochmal, höchstens zweimal", () => {
    const d = defaultData();
    stageLesen(d, "e1-d1");
    for (const n of ["h1", "a1", "g1", "c2", "d2", "e1", "d1"]) for (const k of ["name", "griff", "note"]) d.cards[`${n}|${k}`] = { box: 3, day: addDays(TODAY, -5), session: 1 };
    const s = mkSession(d);
    const first = s.plan[0];
    const steps = run(s, (st) => st.item.uid !== first.uid); // diese Karte immer falsch
    const cards = steps.filter((x): x is Extract<Step, { type: "card" }> => x.type === "card");
    const idx = cards.map((c, i) => (c.item.uid === first.uid ? i : -1)).filter((i) => i >= 0);
    expect(idx).toHaveLength(3); // Original + 2 Wiederholungen
    expect(cards[idx[1]].retry).toBe(true);
    for (let k = 1; k < idx.length; k++) {
      const gap = idx[k] - idx[k - 1] - 1;
      expect(gap).toBeGreaterThanOrEqual(2);
      expect(gap).toBeLessThanOrEqual(3);
    }
  });
  it("Wiederholungen zählen nicht zur Grenze, nicht zur Quote, ändern das Fach nicht", () => {
    const d = defaultData();
    stageLesen(d, "e1-d1");
    for (const n of ["h1", "a1", "g1", "c2", "d2", "e1", "d1"]) for (const k of ["name", "griff", "note"]) d.cards[`${n}|${k}`] = { box: 3, day: addDays(TODAY, -5), session: 1 };
    const s = mkSession(d);
    const first = s.plan[0];
    const steps = run(s, (st) => !(st.item.uid === first.uid && !st.retry) && true);
    const cards = steps.filter((x): x is Extract<Step, { type: "card" }> => x.type === "card");
    expect(cards.filter((c) => !c.retry)).toHaveLength(20);
    expect(cards.filter((c) => c.retry)).toHaveLength(1);
    expect(s.graded).toBe(20);
    expect(s.correct).toBe(19);
    // Fach 1 nach dem Fehler, die richtige Wiederholung hebt es nicht
    expect(d.cards[cardKey(first.note, first.kind)].box).toBe(1);
    const total = Object.values(d.history.lesen).reduce((a, l) => a + l.length, 0);
    expect(total).toBe(20);
  });
  it("ausstehende Wiederholung am Sitzungsende entfällt", () => {
    const d = defaultData();
    const s = mkSession(d, "lesen", { limitCards: 20 });
    const steps = run(s, (_st, i) => i !== 19); // die letzte gewertete Karte falsch
    const cards = steps.filter((x) => x.type === "card");
    expect(cards).toHaveLength(20);
    expect(s.isOver()).toBe(true);
  });
  it("Zeitgrenze: angefangene Karte wird zu Ende gespielt, dann Schluss", () => {
    const d = defaultData();
    const clock = { t: 0 };
    const s = mkSession(d, "lesen", { clock, limitMs: 60_000 });
    let st = s.next();
    while (st && st.type === "intro") {
      s.introDone(st.note);
      st = s.next();
    }
    clock.t = 70_000; // Zeit abgelaufen, während die Karte gezeigt wird
    s.answer(true);
    expect(s.graded).toBe(1);
    expect(s.next()).toBeNull();
  });
  it("Abbrechen: beantwortete Karten bleiben gewertet", () => {
    const d = defaultData();
    const s = mkSession(d);
    let n = 0;
    for (let st = s.next(); st && n < 3; st = s.next()) {
      if (st.type === "intro") s.introDone(st.note);
      else {
        s.answer(true);
        n++;
      }
    }
    // Sitzung wird hier verlassen
    expect(Object.keys(d.cards)).toHaveLength(3);
    expect(d.sessions).toBe(1);
  });
  it("Freischalten während der Sitzung wird gemeldet, Plan bleibt", () => {
    const d = defaultData();
    for (const n of ["h1", "a1", "g1"]) {
      for (const k of ["name", "griff", "note"]) d.cards[`${n}|${k}`] = { box: 4, day: TODAY, session: 1 };
      d.history.lesen[n] = Array.from({ length: 9 }, (_, i) => [1, addDays(TODAY, -1), i] as [0 | 1, string, number]);
    }
    const s = mkSession(d);
    const before = s.plan.map((p) => p.note);
    run(s);
    expect(s.unlocks.map((u) => u.notes)).toEqual([["c2", "d2"]]);
    expect(d.stages.lesen).toBe("c2-d2");
    expect(before.every((n) => ["h1", "a1", "g1"].includes(n))).toBe(true);
  });
});
