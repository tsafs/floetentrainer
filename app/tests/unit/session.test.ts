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
function run(
  s: Session,
  answerFn: (step: Extract<Step, { type: "card" }>, i: number) => boolean = () => true,
  folgeFn: (step: Extract<Step, { type: "folge" }>) => boolean[] = (st) => st.folge.notes.map(() => true),
) {
  const steps: Step[] = [];
  let i = 0;
  for (let st = s.next(); st; st = s.next()) {
    steps.push(st);
    if (st.type === "intro") s.introDone(st.note);
    else if (st.type === "folge") s.answerFolge(folgeFn(st));
    else s.answer(answerFn(st, i++));
    if (steps.length > 500) throw new Error("Endlosschleife");
  }
  return steps;
}

function firstNote(st: Step): string {
  return st.type === "folge" ? st.folge.notes[0] : st.type === "card" ? st.item.note : st.note;
}
function lastNote(st: Step): string {
  return st.type === "folge" ? st.folge.notes[st.folge.notes.length - 1] : st.type === "card" ? st.item.note : st.note;
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
      // auch über die Grenze Folge/Karte: letzter Ton des einen Schritts ≠ erster des nächsten
      const asked = steps.filter((x) => x.type !== "intro");
      for (let i = 1; i < asked.length; i++) expect(firstNote(asked[i])).not.toBe(lastNote(asked[i - 1]));
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
  it("Wiederholung nach 2–3 Karten auch mit nur drei Tönen (erste Sitzung)", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const d = defaultData();
      const s = mkSession(d, "lesen", { seed });
      let firstWrong: number | null = null;
      const cards: { uid: number; retry: boolean }[] = [];
      for (let st = s.next(); st; st = s.next()) {
        if (st.type === "intro") {
          s.introDone(st.note);
          continue;
        }
        if (st.type !== "card") throw new Error("keine Tonfolgen bei 3 Tönen");
        cards.push({ uid: st.item.uid, retry: st.retry });
        const wrong = firstWrong === null && cards.length === 3;
        if (wrong) firstWrong = st.item.uid;
        s.answer(!wrong);
      }
      const i0 = cards.findIndex((c) => c.uid === firstWrong && !c.retry);
      const i1 = cards.findIndex((c) => c.uid === firstWrong && c.retry);
      expect(i1 - i0 - 1).toBeGreaterThanOrEqual(2);
      expect(i1 - i0 - 1).toBeLessThanOrEqual(3);
    }
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

describe("Tonfolgen", () => {
  /** Lesen auf Stufe 4 (8 Töne), alles vorgestellt, nichts fällig: „Weiter üben“ */
  function onlyExtras(track: "lesen" | "spielen" = "lesen") {
    const d = defaultData();
    d.stages.lesen = "fis1";
    d.stages.spielen = "fis1";
    const notes = ["h1", "a1", "g1", "c2", "d2", "e1", "d1", "fis1"];
    for (const n of notes) {
      for (const k of track === "lesen" ? ["name", "griff", "note"] : ["spiel"]) d.cards[`${n}|${k}`] = { box: 4, day: TODAY, session: 1 };
    }
    d.introduced[track] = notes.slice();
    return d;
  }
  it("etwa jede zweite Zusatzkarte wird eine Tonfolge, abwechselnd", () => {
    let adjacent = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const s = mkSession(onlyExtras(), "lesen", { seed });
      const rnd = seeded(seed);
      const steps = run(s, () => rnd() < 0.8, (st) => st.folge.notes.map(() => rnd() < 0.9));
      const kinds = steps.filter((x) => !(x.type !== "intro" && x.retry)).map((x) => x.type);
      expect(kinds).toHaveLength(20);
      expect(kinds.filter((k) => k === "folge")).toHaveLength(10);
      const seq = steps.filter((x) => x.type !== "intro");
      const plain = (x: Step) => x.type === "folge" && !x.retry;
      for (let i = 1; i < seq.length; i++) if (plain(seq[i]) && plain(seq[i - 1])) adjacent++;
      expect(s.graded).toBe(20);
    }
    // kaum gehäuft: selten zwei Folgen direkt nacheinander (100 Sitzungen mit je 10 Folgen; Wiederholungen
    // nach Fehlern kommen nach 2–3 Schritten, auch nach einer Folge)
    expect(adjacent).toBeLessThan(50);
  });
  it("fällige und neue Karten bleiben Karten", () => {
    const d = onlyExtras();
    d.cards["h1|name"] = { box: 2, day: addDays(TODAY, -3), session: 1 };
    const plan = buildPlan(d, "lesen", TODAY, 2, 20, seeded(1));
    expect(plan[0]).toMatchObject({ type: "due" });
    expect(plan[0].folge).toBeUndefined();
    expect(plan.filter((p) => p.folge).every((p) => p.type === "extra")).toBe(true);
  });
  it("Spielen auch", () => {
    const s = mkSession(onlyExtras("spielen"), "spielen");
    const steps = run(s);
    expect(steps.filter((x) => x.type === "folge").length).toBe(10);
    expect(steps.every((x) => x.type !== "folge" || x.track === "spielen")).toBe(true);
  });
  it("unter 5 vorgestellten Tönen keine Folgen", () => {
    const d = onlyExtras();
    d.introduced.lesen = ["h1", "a1", "g1", "c2"];
    const steps = run(mkSession(d));
    expect(steps.some((x) => x.type === "folge")).toBe(false);
  });
  it("nur vorgestellte Töne: die neuen Töne dieser Sitzung erst nach ihrer Vorstellung", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const d = defaultData();
      d.stages.lesen = "fis1";
      for (const n of ["h1", "a1", "g1", "c2", "d2"]) for (const k of ["name", "griff", "note"]) d.cards[`${n}|${k}`] = { box: 4, day: TODAY, session: 1 };
      d.introduced.lesen = ["h1", "a1", "g1", "c2", "d2"];
      const s = mkSession(d, "lesen", { seed });
      const introduced = new Set(d.introduced.lesen);
      for (let st = s.next(); st; st = s.next()) {
        if (st.type === "intro") {
          introduced.add(st.note);
          s.introDone(st.note);
        } else if (st.type === "folge") {
          for (const n of st.folge.notes) expect(introduced.has(n)).toBe(true);
          s.answerFolge(st.folge.notes.map(() => true));
        } else s.answer(true);
      }
    }
  });
  it("jeder Ton höchstens einmal je Folge gewertet, richtig nur an allen Stellen; Fächer unverändert", () => {
    const d = onlyExtras();
    const cardsBefore = JSON.stringify(d.cards);
    const s = mkSession(d);
    let st = s.next();
    while (st && st.type !== "folge") {
      if (st.type === "intro") s.introDone(st.note);
      else s.answer(true);
      st = s.next();
    }
    expect(st?.type).toBe("folge");
    if (st?.type !== "folge") return;
    // Folge mit Wiederholung von Hand setzen
    st.folge.notes = ["g1", "a1", "a1", "h1"];
    const len = (n: string) => d.history.lesen[n]?.length ?? 0;
    const before = { g1: len("g1"), a1: len("a1"), h1: len("h1") };
    const graded = s.graded;
    s.answerFolge([true, true, false, true]); // a¹ einmal falsch
    expect(len("g1")).toBe(before.g1 + 1);
    expect(len("a1")).toBe(before.a1 + 1);
    expect(len("h1")).toBe(before.h1 + 1);
    expect(d.history.lesen.a1.at(-1)![0]).toBe(0);
    expect(d.history.lesen.g1.at(-1)![0]).toBe(1);
    expect(s.graded).toBe(graded + 1);
    expect(s.difficult).toContain("a1");
    expect(s.difficult).not.toContain("g1");
    expect(JSON.stringify(d.cards)).toBe(cardsBefore);
  });
  it("nach einem Fehler kommt dieselbe Folge nach 2–3 Schritten einmal wieder, ungewertet", () => {
    for (let seed = 1; seed <= 60; seed++) {
      const d = onlyExtras();
      const s = mkSession(d, "lesen", { seed });
      const seen: Step[] = [];
      let failed: number | null = null;
      for (let st = s.next(); st; st = s.next()) {
        seen.push(st);
        if (st.type === "folge") {
          const fail = failed === null;
          if (fail) failed = st.folge.uid;
          s.answerFolge(st.folge.notes.map((_, i) => !(fail || (st.retry && i === 0))));
        } else if (st.type === "card") s.answer(true);
      }
      const i0 = seen.findIndex((x) => x.type === "folge" && x.folge.uid === failed && !x.retry);
      const rep = seen.filter((x) => x.type === "folge" && x.folge.uid === failed && x.retry);
      const i1 = seen.findIndex((x) => x.type === "folge" && x.folge.uid === failed && x.retry);
      // auch wenn die Wiederholung wieder falsch ist: höchstens einmal
      expect(rep.length).toBeLessThanOrEqual(1);
      if (i1 < 0) continue; // am Sitzungsende entfallen
      expect(i1 - i0 - 1).toBeGreaterThanOrEqual(2);
      expect(i1 - i0 - 1).toBeLessThanOrEqual(3);
      const a = seen[i0] as Extract<Step, { type: "folge" }>;
      const b = seen[i1] as Extract<Step, { type: "folge" }>;
      expect(b.folge.notes).toEqual(a.folge.notes);
    }
  });
  it("Wiederholung zählt nicht", () => {
    const d = onlyExtras();
    const s = mkSession(d, "lesen", { seed: 7 });
    let count = 0;
    const histLen = () => Object.values(d.history.lesen).reduce((a, l) => a + l.length, 0);
    for (let st = s.next(); st; st = s.next()) {
      if (st.type === "folge" && st.retry) {
        const h = histLen();
        const g = s.graded;
        s.answerFolge(st.folge.notes.map(() => true));
        expect(histLen()).toBe(h);
        expect(s.graded).toBe(g);
        count++;
      } else if (st.type === "folge") s.answerFolge(st.folge.notes.map((_, i) => i !== 0));
      else if (st.type === "card") s.answer(true);
    }
    expect(count).toBeGreaterThan(0);
  });
  it("Länge passt sich an: fehlerfrei länger, mit Fehler kürzer", () => {
    const d = onlyExtras();
    const s = mkSession(d, "lesen", { limitCards: 40 });
    const lens: number[] = [];
    for (let st = s.next(); st; st = s.next()) {
      if (st.type === "folge") {
        if (!st.retry) lens.push(st.folge.notes.length);
        s.answerFolge(st.folge.notes.map(() => true));
      } else if (st.type === "card") s.answer(true);
    }
    expect(lens[0]).toBe(3);
    expect(lens[2]).toBe(4);
    expect(Math.max(...lens)).toBe(5);
  });
  it("keine Folge zweimal in einer Sitzung", () => {
    const s = mkSession(onlyExtras(), "lesen", { limitCards: 40 });
    const keys: string[] = [];
    run(s, () => true, (st) => {
      if (!st.retry) keys.push(st.folge.notes.join(" "));
      return st.folge.notes.map(() => true);
    });
    expect(new Set(keys).size).toBe(keys.length);
  });
  it("„x von y richtig“: Folge zählt als eine Position", () => {
    const s = mkSession(onlyExtras());
    run(s, () => true, (st) => st.folge.notes.map((_, i) => i !== 1));
    const r = s.result();
    expect(r.graded).toBe(20);
    expect(r.correct).toBe(10);
  });
});
