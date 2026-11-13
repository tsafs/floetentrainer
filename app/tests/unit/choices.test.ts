import { describe, expect, it } from "vitest";
import { isAltSpelling, kindsForNote, unlockedNotes, type Kind } from "../../src/music/levels";
import { note } from "../../src/music/notes";
import { choiceCount, makeChoices } from "../../src/srs/choices";
import { errorHint, introSentence, positionPhrase } from "../../src/srs/hints";
import { seeded } from "./helpers";

function check(ids: string[], target: string) {
  expect(ids).toContain(target);
  expect(new Set(ids).size).toBe(ids.length);
  const fings = ids.map((i) => note(i).fingering);
  expect(new Set(fings).size).toBe(ids.length); // nie zwei mit demselben Griff
  const pitches = ids.map((i) => note(i).midi);
  expect(new Set(pitches).size).toBe(ids.length); // nie zwei Schreibweisen desselben Tons
}

describe("Antwortmöglichkeiten", () => {
  it("für alle Stufen, Töne und Arten gültig", () => {
    const rng = seeded(7);
    for (let lv = 1; lv <= 12; lv++) {
      const un = unlockedNotes("lesen", lv);
      for (const t of un) {
        for (const kind of kindsForNote("lesen", t)) {
          for (const box of [1, 3]) {
            const want = choiceCount(kind, box);
            const ids = makeChoices(t, kind, want, un, rng);
            check(ids, t);
            expect(ids.length).toBeGreaterThanOrEqual(4);
            expect(ids.length).toBeLessThanOrEqual(want);
            if (kind === "note") expect(ids.some(isAltSpelling)).toBe(false);
          }
        }
      }
    }
  });
  it("Stufe 1: 4 Möglichkeiten, Töne aus späteren Stufen ergänzen", () => {
    const ids = makeChoices("a1", "name", 4, ["h1", "a1", "g1"], seeded(1));
    expect(ids).toHaveLength(4);
    expect(ids).toEqual(expect.arrayContaining(["h1", "a1", "g1"]));
  });
  it("8 Namen ab Fach 3, nur freigeschaltete, sonst weniger (mindestens 4)", () => {
    expect(choiceCount("name", 2)).toBe(4);
    expect(choiceCount("name", 3)).toBe(8);
    expect(choiceCount("griff", 5)).toBe(4);
    const un5 = unlockedNotes("lesen", 3); // 7 Töne
    const ids = makeChoices("c2", "name", 8, un5, seeded(2));
    expect(ids).toHaveLength(7);
    expect(ids.every((i) => un5.includes(i))).toBe(true);
    const un10 = unlockedNotes("lesen", 6);
    expect(makeChoices("c2", "name", 8, un10, seeded(2))).toHaveLength(8);
  });
  it("Namen nach Tonhöhe geordnet", () => {
    const ids = makeChoices("f1", "name", 8, unlockedNotes("lesen", 8), seeded(3));
    const m = ids.map((i) => note(i).midi);
    expect(m).toEqual([...m].sort((a, b) => a - b));
  });
  it("verwechselbar: Nachbartöne werden bevorzugt", () => {
    let neighbor = 0;
    for (let s = 1; s <= 30; s++) {
      const ids = makeChoices("e1", "name", 4, unlockedNotes("lesen", 11), seeded(s));
      if (ids.includes("d1") || ids.includes("f1") || ids.includes("es1") || ids.includes("e2")) neighbor++;
    }
    expect(neighbor).toBe(30);
  });
  it("andere Schreibweise und Partner nie zusammen", () => {
    const un = unlockedNotes("lesen", 12);
    for (let s = 1; s <= 40; s++) {
      for (const k of ["name", "griff"] as Kind[]) {
        check(makeChoices("dis1", k, 8, un, seeded(s)), "dis1");
        check(makeChoices("es1", k, 8, un, seeded(s)), "es1");
      }
    }
  });
});

describe("Texte", () => {
  it("Lage auf den Linien", () => {
    expect(positionPhrase(note("c1"))).toBe("hat eine eigene Hilfslinie unter den Linien");
    expect(positionPhrase(note("d1"))).toBe("hängt unter der untersten Linie");
    expect(positionPhrase(note("c2"))).toBe("liegt im dritten Zwischenraum");
    expect(positionPhrase(note("h1"))).toBe("liegt auf der dritten Linie");
    expect(positionPhrase(note("c3"))).toBe("hat zwei Hilfslinien über den Linien");
  });
  it("Beispielhinweis aus den Entscheidungen", () => {
    const h = errorHint("c1", "d1", "name").replace(/<[^>]+>/g, "");
    expect(h).toBe("Du hast d1 gewählt. c1 hat eine eigene Hilfslinie unter den Linien, d1 hängt unter der untersten Linie.");
  });
  it("Vorzeichen-Verwechslung", () => {
    expect(errorHint("fis1", "f1", "name")).toContain("Achte auf das Vorzeichen");
  });
  it("Oktave beim Griff: Daumen", () => {
    expect(errorHint("e2", "e1", "griff")).toContain("Daumen");
  });
  it("Hinweise beschreiben nie einzelne Löcher", () => {
    for (const t of unlockedNotes("lesen", 11)) {
      for (const c of ["c1", "e2", "fis1", "b1"]) {
        if (c === t) continue;
        for (const k of ["name", "griff", "note", "spiel"] as Kind[]) expect(errorHint(t, c, k)).not.toMatch(/Loch/);
      }
    }
  });
  it("Vorstellung nennt die Lage", () => {
    expect(introSentence("c2").replace(/<[^>]+>/g, "")).toBe("c2 liegt im dritten Zwischenraum.");
  });
});
