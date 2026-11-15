import { describe, expect, it } from "vitest";
import { stagesOf, unlockedNotes } from "../../src/music/levels";
import { playability } from "../../src/songs/playable";
import { excerptTimeline, SNIPPET_MAX, SNIPPET_MAX_BARS, SNIPPET_MIN, songExcerpt, songSnippets } from "../../src/songs/snippets";
import { note } from "../../src/music/notes";
import { chapterOf, chaptersOf, snippetSong, stageSong, STAGE_SONG_TITLES } from "../../src/srs/chapters";
import { SONGS } from "../../src/songs/library";

describe("Kapitel", () => {
  it("vier Kapitel auf Stufengrenzen der Meilensteine; Lesen bis 12, Spielen bis 11", () => {
    expect(chaptersOf("lesen").map((c) => [c.from, c.to])).toEqual([
      [1, 2],
      [3, 6],
      [7, 8],
      [9, 12],
    ]);
    expect(chaptersOf("spielen").at(-1)!.to).toBe(11);
    expect(chapterOf("spielen", 3).no).toBe(2);
    expect(chapterOf("lesen", 12).no).toBe(4);
    expect(chapterOf("lesen", 1).milestone.id).toBe("linke-hand");
  });
});

describe("Stufenlieder", () => {
  it("jedes Stufenlied gibt es im Heft und wird genau auf seiner Stufe spielbar", () => {
    for (const [id, title] of Object.entries(STAGE_SONG_TITLES)) {
      const lv = stagesOf("spielen").findIndex((s) => s.id === id) + 1;
      expect(lv).toBeGreaterThan(0);
      const song = SONGS.find((s) => s.title === title);
      expect(song, title).toBeDefined();
      expect(playability(song!, unlockedNotes("spielen", lv)).playable, title).toBe(true);
      expect(playability(song!, unlockedNotes("spielen", lv - 1)).playable, title).toBe(false);
      expect(stageSong("spielen", lv)?.title).toBe(title);
    }
    expect(stageSong("spielen", 1)?.title).toBe("Übung 1");
    expect(stageSong("spielen", 8)).toBeUndefined();
  });
  it("Lied für Abschnitte: Stufenlied, sonst das der Stufe davor", () => {
    expect(snippetSong("spielen", 1)?.title).toBe("Übung 1");
    expect(snippetSong("spielen", 2)?.title).toBe("Hänschen klein");
    expect(snippetSong("spielen", 8)?.title).toBe("Alle Jahre wieder");
  });
  it("Abschnitte: höchstens 2 Takte, 3 bis 10 Töne, Töne passen zum Zeitplan des Ausschnitts, ohne Doppelte", () => {
    for (const title of Object.values(STAGE_SONG_TITLES)) {
      const song = SONGS.find((s) => s.title === title)!;
      const sn = songSnippets(song);
      expect(sn.length, title).toBeGreaterThanOrEqual(2);
      for (const p of sn) {
        expect(p.to - p.from).toBeLessThan(SNIPPET_MAX_BARS);
        expect(p.notes.length).toBeGreaterThanOrEqual(SNIPPET_MIN);
        expect(p.notes.length).toBeLessThanOrEqual(SNIPPET_MAX);
        const ex = songExcerpt(song, p.from, p.to);
        expect(ex.bars.map((b) => b.index)).toEqual(ex.bars.map((_, k) => k));
        expect(ex.notes.every((n) => ex.bars[n.bar].events.includes(n))).toBe(true);
        expect(p.notes.map((n) => note(n).midi)).toEqual(excerptTimeline(ex).tones.map((t) => t.midi));
      }
      expect(new Set(sn.map((p) => p.notes.join(" "))).size).toBe(sn.length);
    }
    const h = songSnippets(SONGS.find((s) => s.title === "Hänschen klein")!);
    expect(h[0].notes.slice(0, 3)).toEqual(["d2", "h1", "h1"]);
    expect(h[0].from).toBe(0);
  });
  it("Ausschnitt lässt das Lied unverändert", () => {
    const song = SONGS.find((s) => s.title === "Hänschen klein")!;
    const before = JSON.stringify(song);
    songExcerpt(song, 1, 2);
    expect(JSON.stringify(song)).toBe(before);
  });
});
