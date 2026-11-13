// Eigene Lieder: Einlesen, Speichern als Quelltext, neu Lesen beim Start, Kennungen, Sicherung.
import { describe, expect, it } from "vitest";
import { DataError, defaultData, normalizeData, type OwnSong } from "../../src/store/data";
import { backupJson, loadData, parseBackup, saveData } from "../../src/store/storage";
import { addOwnSongs, ownEntries, ownEntryById, readImport, readOwn, removeOwnSong } from "../../src/songs/own";
import { SONGS } from "../../src/songs/library";
import { abcFile } from "./abc-helpers";

class MemStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? this.m.get(k)! : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
const mem = () => new MemStorage() as unknown as Storage;

const own = (o: Partial<OwnSong> & { abc: string }): OwnSong => ({ id: "abc-test", title: "Test", number: 1, index: 0, shift: 0, added: 1, ...o });

describe("Einlesen", () => {
  it("Sammlung: jedes Stück bekommt nur seinen eigenen Quelltext", () => {
    const r = readImport(abcFile("sammlung.abc"));
    expect(r.errors).toEqual([]);
    expect(r.tunes.map((t) => t.tune.title)).toEqual(["Bruder Jakob", "Kuckuck, Kuckuck, ruft’s aus dem Wald", "Greensleeves"]);
    const [jakob, , green] = r.tunes;
    expect(jakob.abc.startsWith("X:1\nT:Bruder Jakob")).toBe(true);
    expect(jakob.abc).not.toContain("Kuckuck");
    expect(jakob.abc).not.toContain("%abc-2.1"); // Dateikopf gehört zu keinem Stück
    expect(green.abc).toContain("T:Greensleeves");
    expect(green.abc).not.toContain("Jakob");
    expect(r.tunes.every((t) => t.index === 0)).toBe(true);
    // der herausgelöste Text ergibt dasselbe Stück
    const again = readOwn(own({ abc: green.abc, number: 3 }));
    expect(again.song!.notes.length).toBe(green.tune.song.notes.length);
    expect(again.tune!.omitted).toEqual(green.tune.omitted);
  });
  it("Stück mit Dateikopf (Hänschen klein, X:2 in Zeile 3) und Text ohne X:", () => {
    const h = readImport(abcFile("haenschen-klein.abc")).tunes[0];
    expect(h.abc.startsWith("X:2")).toBe(true);
    const plain = "T:Ohne Nummer\nM:3/4\nL:1/4\nK:F\nF G A | B2 A |\n\nG2 F |]\n";
    const r = readImport(plain);
    expect(r.tunes).toHaveLength(1);
    expect(r.tunes[0].abc).toBe(plain); // ohne X: bleibt alles beisammen
  });
  it("Fehlerhaftes Stück wird gemeldet, das lesbare bleibt", () => {
    const r = readImport(abcFile("mit-fehler.abc"));
    expect(r.tunes.map((t) => t.tune.title)).toEqual(["Lesbares Stück"]);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]).toMatchObject({ number: 2, title: "Kaputtes Stück", line: 12 });
    expect(r.errors[0].message).toMatch(/Zeile 12/);
  });
  it("zu große Eingaben werden nicht gelesen, große bekommen ihre Größe mit", () => {
    const r = readImport("%".repeat(2_000_001));
    expect(r.tunes).toEqual([]);
    expect(r.errors[0].message).toMatch(/zu groß/);
    expect(readImport(abcFile("sammlung.abc")).size).toBeGreaterThan(500);
  });
});

describe("Übernehmen, Kennungen, Löschen", () => {
  it("Kennung aus dem Titel; doppelte bekommen -2, -3", () => {
    const d = defaultData();
    const t = readImport(abcFile("alle-meine-entchen.abc")).tunes[0];
    addOwnSongs(d, [{ item: t, shift: 0 }], 5);
    addOwnSongs(d, [{ item: t, shift: 0 }, { item: t, shift: 0 }], 6);
    expect(d.ownSongs.map((o) => o.id)).toEqual(["abc-alle-meine-entchen", "abc-alle-meine-entchen-2", "abc-alle-meine-entchen-3"]);
    expect(d.ownSongs[0]).toMatchObject({ title: "Alle meine Entchen", number: 1, index: 0, shift: 0, added: 5 });
    // gelesen tragen die Lieder ihre gespeicherte Kennung und stehen im Kapitel „Eigene Lieder“
    const e = ownEntries(d);
    expect(e.map((x) => x.song!.id)).toEqual(d.ownSongs.map((o) => o.id));
    expect(e[0].song!.chapter).toBe("Eigene Lieder");
    // nie gleich einer Kennung aus dem Heft
    const heftIds = new Set(SONGS.map((s) => s.id));
    expect(d.ownSongs.some((o) => heftIds.has(o.id))).toBe(false);
  });
  it("lange Titel ergeben kurze Kennungen, die die Prüfung beim Laden bestehen", () => {
    const d = defaultData();
    const t = readImport(`X:1\nT:${"Sehr langer Titel ".repeat(10)}\nK:C\nCDEF|]\n`).tunes[0];
    addOwnSongs(d, [{ item: t, shift: 0 }]);
    addOwnSongs(d, [{ item: t, shift: 0 }]);
    const back = normalizeData(JSON.parse(JSON.stringify(d)));
    expect(back.ownSongs.map((o) => o.id)).toEqual(d.ownSongs.map((o) => o.id));
  });
  it("Oktavverschiebung wird gespeichert und beim Lesen angewandt", () => {
    const d = defaultData();
    const t = readImport("X:1\nT:Tief\nM:4/4\nL:1/4\nK:C\nC, D, E, F, | G, A, B, C |]\n").tunes[0];
    expect(t.tune.range).toMatchObject({ ok: false, shift: 12 });
    addOwnSongs(d, [{ item: t, shift: 12 }]);
    const s = ownEntryById(d, "abc-tief")!.song!;
    expect(s.notes[0].pitch.midi).toBe(60);
    expect(s.range.low.midi).toBe(60);
    expect(t.tune.song.notes[0].pitch.midi).toBe(48); // das Original bleibt unverändert
  });
  it("Löschen entfernt das Lied samt gemerktem Tempo", () => {
    const d = defaultData();
    addOwnSongs(d, [{ item: readImport(abcFile("drunken-sailor.abc")).tunes[0], shift: 0 }]);
    d.songs["abc-drunken-sailor"] = { tempo: 80 };
    d.songs["jingle-bells"] = { tempo: 90 };
    expect(removeOwnSong(d, "abc-drunken-sailor")).toBe(true);
    expect(d.ownSongs).toEqual([]);
    expect(d.songs).toEqual({ "jingle-bells": { tempo: 90 } });
    expect(removeOwnSong(d, "abc-drunken-sailor")).toBe(false);
  });
});

describe("Speichern und neu Lesen", () => {
  it("gespeichert wird der Quelltext; beim Laden entsteht das Lied neu", () => {
    const s = mem();
    const d = defaultData();
    addOwnSongs(d, [{ item: readImport(abcFile("irish-washerwoman.abc")).tunes[0], shift: 0 }]);
    saveData(d, s);
    const raw = JSON.parse(s.getItem("floetentrainer")!);
    expect(raw.ownSongs[0].abc).toContain("T:The Irish Washerwoman");
    expect(raw.ownSongs[0].song).toBeUndefined(); // kein Liedmodell im Speicher
    const r = loadData(s);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const e = ownEntries(r.data)[0];
    expect(e.song!.title).toBe("The Irish Washerwoman");
    expect(e.song!.bars.some((b) => b.repeatStart)).toBe(true);
  });
  it("ein Stück, das sich nicht mehr lesen lässt, bleibt erhalten und meldet den Grund", () => {
    const s = mem();
    const d = defaultData();
    d.ownSongs.push(own({ id: "abc-kaputt", title: "Kaputt", abc: "X:1\nT:Kaputt\nK:Xyz\nC D E|\n" }));
    saveData(d, s);
    const r = loadData(s);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.ownSongs).toHaveLength(1);
    const e = ownEntries(r.data)[0];
    expect(e.song).toBeNull();
    expect(e.error).toMatch(/Tonart/);
  });
  it("mehrere Stücke im gespeicherten Text: über die Nummer, sonst die Stelle", () => {
    const text = abcFile("sammlung.abc");
    expect(readOwn(own({ abc: text, number: 3, index: 0 })).song!.title).toBe("Greensleeves");
    expect(readOwn(own({ abc: text, number: null, index: 1 })).song!.title).toMatch(/^Kuckuck/);
    expect(readOwn(own({ abc: text, number: 9, index: 7 })).song).toBeNull();
  });
});

describe("Datenformat Version 2 und Sicherung", () => {
  it("Version 1 wird umgewandelt: leere eigene Lieder, alles andere bleibt", () => {
    const d = normalizeData({ version: 1, app: "floetentrainer", songs: { "jingle-bells": { tempo: 80 } }, sessions: 4 });
    expect(d.version).toBe(2);
    expect(d.ownSongs).toEqual([]);
    expect(d.songs).toEqual({ "jingle-bells": { tempo: 80 } });
    expect(d.sessions).toBe(4);
  });
  it("Prüfung: fehlender Quelltext macht die Daten fehlerhaft, Nebensächliches wird ergänzt", () => {
    expect(() => normalizeData({ version: 2, ownSongs: {} })).toThrow(DataError);
    expect(() => normalizeData({ version: 2, ownSongs: [{ id: "abc-x", title: "X" }] })).toThrow(/Eigenes Lied Nr. 1/);
    expect(() => normalizeData({ version: 2, ownSongs: [5] })).toThrow(DataError);
    const d = normalizeData({
      version: 2,
      ownSongs: [
        { id: "abc-a", abc: "X:1\nK:C\nC|\n", shift: 7, number: "x", index: -1 },
        { id: "abc-a", abc: "X:1\nK:C\nD|\n", shift: -12, added: 9 },
        { id: "Böse Kennung", abc: "X:1\nK:C\nE|\n", shift: 12 },
      ],
    });
    expect(d.ownSongs.map((o) => [o.id, o.shift, o.number, o.index, o.title])).toEqual([
      ["abc-a", 0, null, 0, ""],
      ["abc-a-2", -12, null, 0, ""],
      ["abc-lied-3", 12, null, 0, ""],
    ]);
    expect(d.ownSongs[1].added).toBe(9);
  });
  it("Daten der Version 3 werden abgelehnt (nichts überschreiben)", () => {
    expect(() => normalizeData({ version: 3, app: "floetentrainer" })).toThrow(/neueren Version/);
  });
  it("eigene Lieder kommen in die Sicherung und wieder heraus", () => {
    const d = defaultData();
    const r = readImport(abcFile("sammlung.abc"));
    addOwnSongs(d, [
      { item: r.tunes[0], shift: 0 },
      { item: r.tunes[2], shift: 0 },
    ]);
    d.songs["abc-greensleeves"] = { tempo: 70 };
    const back = parseBackup(backupJson(d));
    expect(back.ownSongs).toEqual(d.ownSongs);
    expect(back.songs["abc-greensleeves"]).toEqual({ tempo: 70 });
    expect(ownEntries(back).map((e) => e.song!.title)).toEqual(["Bruder Jakob", "Greensleeves"]);
  });
});
