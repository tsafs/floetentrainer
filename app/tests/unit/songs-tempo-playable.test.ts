import { describe, expect, it } from "vitest";
import { stageId, unlockedNotes } from "../../src/music/levels";
import { SONGS, songById } from "../../src/songs/library";
import { missingHtml, playability, playabilityFor, readingNotes } from "../../src/songs/playable";
import { BASE_TEMPO, baseTempo, beatUnit, clampPercent, defaultTempo, secPerQuarter } from "../../src/songs/tempo";
import { defaultData } from "../../src/store/data";
import { song } from "./songs-helpers";

describe("Grundtempo", () => {
  it("jedes Heft-Lied steht in der Tabelle, und kein Eintrag ist verwaist", () => {
    for (const s of SONGS) expect(BASE_TEMPO[s.title], s.title).toBeDefined();
    for (const t of Object.keys(BASE_TEMPO)) expect(SONGS.some((s) => s.title === t), t).toBe(true);
  });

  it("Heft-Lieder: ruhig genug für Anfängerinnen (40–110 Viertel pro Minute)", () => {
    for (const s of SONGS) {
      const q = baseTempo(s).quartersPerMin;
      expect(q, s.title).toBeGreaterThanOrEqual(40);
      expect(q, s.title).toBeLessThanOrEqual(110);
    }
    // Stille Nacht ruhiger als ein Tanz
    expect(baseTempo(songById("stille-nacht-heilige-nacht")!).bpm).toBeLessThan(baseTempo(songById("the-fairie-round")!).bpm);
  });

  it("ohne Tabelleneintrag nach Taktart", () => {
    expect(defaultTempo({ num: 4, den: 4 })).toBe(90);
    expect(defaultTempo({ num: 2, den: 4 })).toBe(90);
    expect(defaultTempo({ num: 3, den: 4 })).toBe(100);
    expect(defaultTempo({ num: 6, den: 8 })).toBe(60);
    expect(beatUnit({ num: 6, den: 8 })).toBe(1.5);
    expect(beatUnit({ num: 2, den: 2 })).toBe(2);
    expect(beatUnit({ num: 3, den: 8 })).toBe(0.5);
    expect(baseTempo(song("c'1 ||", { title: "Unbekannt" })).quartersPerMin).toBe(90);
    expect(baseTempo(song("c'2. ||", { title: "Unbekannt", time: [3, 4] })).quartersPerMin).toBe(100);
    // 6/8: 60 punktierte Viertel = 90 Viertel
    const s68 = song("c'2. ||", { title: "Unbekannt", time: [6, 8] });
    expect(baseTempo(s68)).toEqual({ bpm: 60, beat: 1.5, quartersPerMin: 90 });
    expect(secPerQuarter(s68)).toBeCloseTo(60 / 90, 9);
  });

  it("secPerQuarter folgt dem Prozentwert, begrenzt auf 50–120 %", () => {
    const s = song("c'1 ||", { title: "Unbekannt" }); // 90 Viertel/min
    expect(secPerQuarter(s, 100)).toBeCloseTo(60 / 90, 9);
    expect(secPerQuarter(s, 50)).toBeCloseTo(60 / 45, 9);
    expect(secPerQuarter(s, 120)).toBeCloseTo(60 / 108, 9);
    expect(secPerQuarter(s, 10)).toBeCloseTo(secPerQuarter(s, 50), 9);
    expect(secPerQuarter(s, 300)).toBeCloseTo(secPerQuarter(s, 120), 9);
    expect(clampPercent(NaN)).toBe(100);
    // Tabellenwert: Stille Nacht 46 punktierte Viertel
    expect(secPerQuarter(songById("stille-nacht-heilige-nacht")!)).toBeCloseTo(60 / (46 * 1.5), 9);
  });
});

describe("Spielbarkeit", () => {
  const ids = (p: { missing: { id: string }[] }) => p.missing.map((m) => m.id);

  it("spielbar, wenn alle Töne freigeschaltet sind", () => {
    const s = song("g'4 a'4 h'2 | a'4 g'4 a'2 ||");
    expect(playability(s, ["h1", "a1", "g1"])).toEqual({ playable: true, missing: [] });
  });

  it("fehlende Töne nach Tonhöhe sortiert und ohne Doppelte", () => {
    const s = song("fis'4 c''4 c'4 fis'4 | g'1 ||");
    const p = playability(s, ["g1"]);
    expect(p.playable).toBe(false);
    expect(ids(p)).toEqual(["c1", "fis1", "c2"]);
    expect(missingHtml(p.missing)).toBe(
      '<span class="nn">c<span class="o">1</span></span>, <span class="nn">fis<span class="o">1</span></span>, <span class="nn">c<span class="o">2</span></span>',
    );
  });

  it("andere Schreibweisen zählen als ihr Partner aus der Grifftabelle", () => {
    // dis'' im Lied, es² freigeschaltet → spielbar
    expect(playability(song("dis''2 e''2 ||"), ["es2", "e2"]).playable).toBe(true);
    // as' im Lied fehlt → genannt als gis¹
    expect(ids(playability(song("as'2 g'2 ||"), ["g1"]))).toEqual(["gis1"]);
    // ais' → b¹, des'' → cis², ges' → fis¹
    expect(ids(playability(song("ais'4 des''4 ges'4 g'4 ||"), ["g1"]))).toEqual(["fis1", "b1", "cis2"]);
    // freigeschaltete andere Schreibweise gilt auch für den Partner
    expect(playability(song("es'1 ||"), ["dis1"]).playable).toBe(true);
  });

  it("Töne außerhalb c¹–c³ fehlen immer", () => {
    const p = playability(song("h4 c'4 d'''2 ||"), unlockedNotes("lesen", 12));
    expect(p.missing).toEqual([
      { id: "h0", name: "h", octave: 0, midi: 59, inChart: false },
      { id: "d3", name: "d", octave: 3, midi: 86, inChart: false },
    ]);
    expect(missingHtml(p.missing)).toBe('<span class="nn">h</span>, <span class="nn">d<span class="o">3</span></span>');
  });

  it("nach dem Stand der Lesen-Spur", () => {
    const d = defaultData();
    d.stages.lesen = stageId("lesen", 1);
    expect(readingNotes(d)).toEqual(["h1", "a1", "g1"]);
    const entchen = songById("alle-meine-entchen")!;
    expect(ids(playabilityFor(entchen, d))).toEqual(["c2", "d2", "e2"]);
    d.stages.lesen = stageId("lesen", 5); // bis e² und f¹
    expect(playabilityFor(entchen, d).playable).toBe(true);
    // Hänschen klein braucht nur g¹ bis d²
    d.stages.lesen = stageId("lesen", 2);
    expect(playabilityFor(songById("haenschen-klein")!, d).playable).toBe(true);
    // Spielen-Stufe spielt keine Rolle
    d.stages.spielen = stageId("spielen", 11);
    d.stages.lesen = stageId("lesen", 1);
    expect(playabilityFor(songById("haenschen-klein")!, d).playable).toBe(false);
  });

  it("alle Heft-Lieder sind mit allen Stufen spielbar", () => {
    const all = unlockedNotes("lesen", 12);
    for (const s of SONGS) expect(playability(s, all).missing, s.title).toEqual([]);
  });
});
