import { describe, expect, it } from "vitest";
import { readHeftSongs, songErrors } from "../../scripts/heft-songs-plugin";
import raw from "virtual:heft-songs";
import { chapters, SONGS, songById } from "../../src/songs/library";
import type { NoteEvent, RawSong } from "../../src/songs/model";
import { keyInfo, parsePitch, slugify, SongError } from "../../src/songs/parse";
import { song } from "./songs-helpers";


function errorOf(music: string, extra: Partial<RawSong> = {}): SongError {
  try {
    song(music, extra);
  } catch (e) {
    expect(e).toBeInstanceOf(SongError);
    return e as SongError;
  }
  throw new Error("kein Fehler");
}

interface RefEvent {
  kind: "note" | "rest";
  name?: string;
  oct?: number;
  letter?: string;
  alt?: number;
  pos?: number;
  q: number;
  tie?: boolean;
  slurStart?: boolean;
  slurEnd?: boolean;
  breath?: boolean;
  syl?: string | null;
  hy?: boolean;
}

describe("Heft-Lieder", () => {
  it("das virtuelle Modul liefert alle Lieder aus heft/songs.py", () => {
    expect(raw.length).toBeGreaterThanOrEqual(30);
    expect(SONGS.length).toBe(raw.length);
    expect(songErrors(raw)).toEqual([]);
  });

  it("Kapitel gelten bis zum nächsten Kapitel", () => {
    const ch = chapters();
    expect(ch.map((c) => c.chapter)).toEqual(["Kinder- und Weihnachtslieder", "Alte Lieder und Tänze", "Schöne Melodien"]);
    expect(songById("haenschen-klein")!.chapter).toBe("Kinder- und Weihnachtslieder");
    expect(songById("musette")!.chapter).toBe("Schöne Melodien");
    expect(ch.reduce((n, c) => n + c.songs.length, 0)).toBe(SONGS.length);
  });

  it("Kennungen sind eindeutig und lesbar", () => {
    expect(new Set(SONGS.map((s) => s.id)).size).toBe(SONGS.length);
    for (const s of SONGS) expect(s.id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(songById("ronde-pour-quoy")!.title).toBe("Ronde „Pour quoy“");
  });

  for (const s of SONGS) {
    describe(s.title, () => {
      it("Taktlängen stimmen (nur erster und letzter Takt dürfen abweichen)", () => {
        s.bars.forEach((b, i) => {
          const sum = b.events.reduce((t, e) => t + e.q, 0);
          expect(sum).toBeCloseTo(b.length, 9);
          if (i > 0 && i < s.bars.length - 1 && Math.abs(b.length - b.nominal) > 1e-6) {
            // nur an Wiederholungen geteilte Takte
            const next = s.bars[i + 1];
            const prev = s.bars[i - 1];
            const split = (b.barline === "repeatEnd" && (next.pickup || b.volta === 1)) || b.pickup || prev.barline === "repeatEnd";
            expect(split, `Takt ${i + 1}`).toBe(true);
          }
        });
      });

      it("Silbenzahl stimmt", () => {
        const syl = (s.hasLyrics ? raw.find((r) => r.title === s.title)!.lyrics! : "").split(/[\s-]+/).filter(Boolean);
        expect(s.notes.filter((n) => n.syllable).length).toBe(syl.length);
      });

      it("jede Note hat eine eindeutige Kennung", () => {
        const ids = s.bars.flatMap((b) => b.events.map((e) => e.id));
        expect(new Set(ids).size).toBe(ids.length);
      });
    });
  }
});

describe("Kreuzprüfung gegen heft/engrave.py (parse_music, check_and_assign)", () => {
  const ref = readHeftSongs(true);
  for (const r of ref) {
    it(r.title, () => {
      const s = SONGS.find((x) => x.title === r.title)!;
      const { events, msgs } = r.ref as { events: RefEvent[]; msgs: string[] };
      expect(msgs.filter((m) => m.includes("!!!"))).toEqual([]);
      const mine = s.bars.flatMap((b) => b.events).map((e): RefEvent => {
        if (e.kind === "rest") return { kind: "rest", q: e.q };
        const p = e.pitch;
        return {
          kind: "note",
          name: p.name,
          oct: p.octave,
          letter: p.letter,
          alt: p.alter,
          pos: p.pos,
          q: e.q,
          tie: e.tie,
          slurStart: e.slurStart,
          slurEnd: e.slurEnd,
          breath: e.breath,
          syl: e.syllable?.text ?? null,
          hy: e.syllable?.hyphen ?? false,
        };
      });
      expect(mine).toEqual(events);
    });
  }
});

describe("Leser", () => {
  it("Töne wie parse_pitch im Heft", () => {
    expect(parsePitch("c'")).toMatchObject({ letter: "c", alter: 0, octave: 1, midi: 60, pos: -2, id: "c1" });
    expect(parsePitch("fis'")).toMatchObject({ letter: "f", alter: 1, name: "fis", midi: 66, id: "fis1" });
    expect(parsePitch("b'")).toMatchObject({ letter: "h", alter: -1, name: "b", midi: 70 });
    expect(parsePitch("es''")).toMatchObject({ letter: "e", alter: -1, name: "es", midi: 75 });
    expect(parsePitch("as'")).toMatchObject({ letter: "a", alter: -1, name: "as", midi: 68 });
    expect(parsePitch("dis''")).toMatchObject({ name: "dis", id: "dis2", midi: 75 });
    expect(parsePitch("c'''")).toMatchObject({ midi: 84, pos: 12 });
    expect(parsePitch("x'")).toBeNull();
  });

  it("Dauern, Punkte, Pausen, Taktstriche und Schlussstrich", () => {
    const s = song("c'4. d'8 e'2 | r4 g'8 g'16 g'16 r2 ||");
    expect(s.bars.length).toBe(2);
    const [a, b] = s.bars;
    expect(a.events.map((e) => [e.kind, e.dur, e.dots, e.q, e.offset])).toEqual([
      ["note", 4, 1, 1.5, 0],
      ["note", 8, 0, 0.5, 1.5],
      ["note", 2, 0, 2, 2],
    ]);
    expect(a.barline).toBe("single");
    expect(b.events[0].kind).toBe("rest");
    expect(b.barline).toBe("final");
    expect(b.length).toBe(4);
  });

  it("Haltebögen, Bindebögen und Atemzeichen", () => {
    const s = song("c'2 d'2~ | d'4 (e'8 f'8) g'2 , | c''1 ||");
    const [c, d1, d2, e, f, g] = s.notes;
    expect([c.tie, d1.tie, d2.tie]).toEqual([false, true, false]);
    expect(d2.tiedFromPrev).toBe(true);
    expect([e.slurStart, e.slurEnd, f.slurStart, f.slurEnd]).toEqual([true, false, false, true]);
    expect(g.breath).toBe(true);
    expect(f.breath).toBe(false);
  });

  it("Atemzeichen vor dem Taktstrich gehört zur letzten Note", () => {
    const s = song("c'1 , | d'1 ||");
    expect(s.notes[0].breath).toBe(true);
  });

  it("Zeilenumbrüche werden gemerkt, auch mitten im Takt", () => {
    const s = song("c'1 | / d'2 e'4 / f'4 | g'1 ||");
    expect(s.bars[0].breakAfter).toBe(true);
    expect(s.bars[1].breakInside).toBe(1);
    expect(s.bars.map((b) => b.line)).toEqual([0, 1, 2]);
  });

  it("Taktwechsel", () => {
    const s = song("c'4 d'4 e'4 f'4 | T3/4 g'2. | T6/8 a'4. h'4. | T4/4 c''1 ||");
    expect(s.bars.map((b) => `${b.time.num}/${b.time.den}`)).toEqual(["4/4", "3/4", "6/8", "4/4"]);
    expect(s.bars.map((b) => b.nominal)).toEqual([4, 3, 3, 4]);
    expect(s.bars.map((b) => b.timeChange)).toEqual([false, true, true, true]);
  });

  it("Wiederholungen und Klammern", () => {
    const s = song("|: c'1 | d'1 | [1 e'1 :| [2 f'1 || ");
    expect(s.bars.map((b) => [b.repeatStart, b.barline, b.volta, b.voltaStart])).toEqual([
      [true, "single", null, false],
      [false, "single", null, false],
      [false, "repeatEnd", 1, true],
      [false, "final", 2, true],
    ]);
  });

  it("1. Klammer über mehrere Takte, 2. Klammer genau ein Takt", () => {
    const s = song("c'1 | [1 d'1 | e'1 :| [2 f'1 | g'1 ||");
    expect(s.bars.map((b) => b.volta)).toEqual([null, 1, 1, 2, null]);
  });

  it("Auftakt und geteilter Takt an der Wiederholung", () => {
    const s = song("|: g'4 | c''1 | h'2. :| / |: d''4 | e''1 | c''2. :|");
    expect(s.bars.map((b) => [b.length, b.pickup])).toEqual([
      [1, true],
      [4, false],
      [3, false],
      [1, true],
      [4, false],
      [3, false],
    ]);
  });

  it("Tonart: Vorzeichnung und Moll", () => {
    expect(keyInfo("G")).toMatchObject({ fifths: 1, minor: false, alter: { f: 1 }, signature: [{ accidental: "sharp", pos: 8 }] });
    expect(keyInfo("D")!.signature.map((x) => x.pos)).toEqual([8, 5]);
    expect(keyInfo("F")).toMatchObject({ fifths: -1, alter: { h: -1 }, signature: [{ accidental: "flat", pos: 4 }] });
    expect(keyInfo("e")).toMatchObject({ fifths: 1, minor: true, alter: { f: 1 } });
    expect(keyInfo("d")).toMatchObject({ fifths: -1, minor: true });
    expect(keyInfo("C")!.signature).toEqual([]);
    expect(keyInfo("X")).toBeNull();
    expect(songById("tourdion")!.key).toMatchObject({ name: "e", minor: true });
  });

  it("Vorzeichen im Notenbild wie im Heft", () => {
    const acc = (music: string, key: string) =>
      song(music, { key }).notes.map((n: NoteEvent) => n.accidental);
    // G-Dur: fis ohne eigenes ♯, f mit ♮, danach fis wieder mit ♯; neuer Takt: wieder nach Tonart
    expect(acc("fis'4 f'4 fis'4 fis'4 | f'4 fis'4 g'2 ||", "G")).toEqual([null, "natural", "sharp", null, "natural", "sharp", null]);
    // C-Dur: cis mit ♯, im selben Takt nicht noch einmal; andere Oktave eigenes Vorzeichen
    expect(acc("cis''4 cis''4 cis'4 c''4 | cis''1 ||", "C")).toEqual(["sharp", null, "sharp", "natural", "sharp"]);
    // F-Dur: b aus der Tonart, h mit ♮
    expect(acc("b'4 h'4 b'4 a'4 ||", "F")).toEqual([null, "natural", "flat", null]);
    // gehaltene Note nach dem Taktstrich: wie im Heft neu beurteilt
    expect(acc("g'2 gis'2~ | gis'1 ||", "C")).toEqual([null, "sharp", "sharp"]);
  });

  it("Silben: Melisma bei Bindebogen und Haltebogen, Trennstriche", () => {
    const s = song("c'4 (d'8 e'8) f'4 g'4~ | g'4 a'4 h'2 ||", { lyrics: "Al-le mei-ne Ent-chen" });
    const syl = s.notes.map((n) => n.syllable && [n.syllable.text, n.syllable.hyphen]);
    expect(syl).toEqual([["Al", true], ["le", false], null, ["mei", true], ["ne", false], null, ["Ent", true], ["chen", false]]);
    // Wortende über einem Bogen: Melisma-Linie bis zur letzten Note ohne Silbe
    expect(s.notes[1].syllable!.extendTo).toBe(s.notes[2].id);
    expect(s.notes[4].syllable!.extendTo).toBe(s.notes[5].id);
    expect(s.notes[0].syllable!.extendTo).toBeNull();
    expect(s.hasLyrics).toBe(true);
  });

  it("Lied ohne Text", () => {
    const s = song("c'1 ||");
    expect(s.hasLyrics).toBe(false);
    expect(s.notes[0].syllable).toBeNull();
  });

  it("Strophen, Quelle und Kennung", () => {
    const s = song("c'1 ||", { title: "Kuckuck, Kuckuck, ruft’s aus dem Wald", stanzas: ["Eins / zwei", "drei / vier"], credit: "Volksweise", stanza_cols: 3 });
    expect(s.id).toBe("kuckuck-kuckuck-rufts-aus-dem-wald");
    expect(s.stanzas).toEqual([["Eins", "zwei"], ["drei", "vier"]]);
    expect(s.credit).toBe("Volksweise");
    expect(s.stanzaCols).toBe(3);
    expect(slugify("Noël nouvelet")).toBe("noel-nouvelet");
    expect(slugify("Branle de l’Official")).toBe("branle-de-lofficial");
    expect(slugify("Hänschen klein")).toBe("haenschen-klein");
  });
});

describe("Leser: klare Fehlermeldungen", () => {
  it("falsche Taktlänge mitten im Lied: Titel, Takt und Grund", () => {
    const e = errorOf("c'1 | d'2 e'4 | f'1 | g'1 ||", { title: "Probe" });
    expect(e.title).toBe("Probe");
    expect(e.where).toBe("Takt 2");
    expect(e.message).toBe("Lied „Probe“, Takt 2: 3 statt 4 Viertel (4/4-Takt)");
  });
  it("Auftakt und Schlusstakt dürfen kürzer sein", () => {
    expect(() => song("g'4 | c''1 | h'2. ||")).not.toThrow();
  });
  it("unbekanntes Zeichen", () => {
    expect(errorOf("c'4 d'4 x'4 e'4 ||").message).toContain("Takt 1, Zeichen 3 „x'4“: unbekanntes Zeichen");
  });
  it("Notenwert, den es nicht gibt", () => {
    expect(errorOf("c'3 ||").reason).toContain("Notenwert 3");
  });
  it("Silbenzahl falsch", () => {
    expect(errorOf("c'2 d'2 ||", { lyrics: "eins zwei drei" }).reason).toBe("3 Silben, aber 2 Noten bekommen eine Silbe");
  });
  it("Bindebogen nicht geschlossen", () => {
    expect(errorOf("(c'2 d'2 ||").reason).toContain("Bindebogen");
  });
  it("Haltebogen zu einem anderen Ton", () => {
    expect(errorOf("c'2~ d'2 ||").reason).toContain("Haltebogen");
  });
  it("Klammer nicht nach einem Taktstrich", () => {
    expect(errorOf("c'1 [1 d'1 :|").reason).toContain("Klammer");
  });
  it("1. Klammer ohne :|", () => {
    expect(errorOf("c'1 | [1 d'1 ||").reason).toContain(":|");
  });
  it("unbekannte Tonart", () => {
    expect(errorOf("c'1 ||", { key: "Q" }).reason).toContain("Tonart");
  });
  it("die Prüfung beim Bauen sammelt alle Fehler mit Liedtitel", () => {
    const bad: RawSong = { chapter: null, title: "Kaputt", key: "C", keyname: "", time: [3, 4], music: "c'4 | d'4 | e'2. ||" };
    const errs = songErrors([...raw, bad]);
    expect(errs).toEqual(["Lied „Kaputt“, Takt 2: 1 statt 3 Viertel (3/4-Takt)"]);
  });
});

describe("Leser: Randfälle", () => {
  it("Haltebogen über eine Pause ist ein Fehler, auch über den Taktstrich", () => {
    expect(errorOf("c'2~ r2 | c'1 ||").reason).toBe("Haltebogen über eine Pause");
  });
  it("Taktstrich ganz am Anfang wird übergangen, :| || ergibt nur einen Strich", () => {
    const s = song("| c'1 :| ||");
    expect(s.bars.length).toBe(1);
    expect(s.bars[0].barline).toBe("repeatEnd");
  });
  it("leerer Takt mitten im Lied ist ein Fehler", () => {
    expect(errorOf("c'1 | | d'1 ||").reason).toContain("leerer Takt");
  });
});
