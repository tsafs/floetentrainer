import { describe, expect, it } from "vitest";
import { DATA_VERSION, defaultData, normalizeData } from "../../src/store/data";
import { loadData, parseBackup, saveData, STORAGE_KEY } from "../../src/store/storage";
import { TODAY } from "./helpers";

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
  clear() {
    this.m.clear();
  }
  key() {
    return null;
  }
  get length() {
    return this.m.size;
  }
}
const mem = () => new MemStorage() as unknown as Storage;

describe("Speichern", () => {
  it("leerer Speicher: Standardwerte", () => {
    const r = loadData(mem());
    expect(r.ok && r.fresh).toBe(true);
  });
  it("speichern und laden ergibt dasselbe", () => {
    const s = mem();
    const d = defaultData();
    d.cards["h1|name"] = { box: 3, day: TODAY, session: 2 };
    d.history.lesen.h1 = [[1, TODAY, 5]];
    d.days = [TODAY];
    saveData(d, s);
    const r = loadData(s);
    expect(r.ok && r.data).toEqual(d);
  });
  it("beschädigte Daten: Fehler, nichts wird gelöscht", () => {
    const s = mem();
    s.setItem(STORAGE_KEY, "{kaputt");
    const r = loadData(s);
    expect(r.ok).toBe(false);
    expect(s.getItem(STORAGE_KEY)).toBe("{kaputt");
  });
  it("Daten einer neueren Version werden nicht überschrieben", () => {
    const s = mem();
    s.setItem(STORAGE_KEY, JSON.stringify({ ...defaultData(), version: DATA_VERSION + 1 }));
    const r = loadData(s);
    expect(r.ok).toBe(false);
  });
});

describe("Umwandlung und Prüfung", () => {
  it("Version 0 (ohne Versionsnummer, Stufen als Zahlen) wird umgewandelt", () => {
    const d = normalizeData({ level: { lesen: 3, spielen: 5 }, cards: { "h1|name": { box: 2, day: TODAY } } });
    expect(d.version).toBe(DATA_VERSION);
    expect(d.stages).toEqual({ lesen: "e1-d1", spielen: "e1-d1" }); // Spielen ≤ Lesen
    expect(d.cards["h1|name"]).toEqual({ box: 2, day: TODAY, session: 0 });
  });
  it("Stufen werden über Kennungen gespeichert, unbekannte fallen auf 1", () => {
    expect(normalizeData({ version: 1, stages: { lesen: "hoch-stamm", spielen: "gibt-es-nicht" } }).stages).toEqual({
      lesen: "hoch-stamm",
      spielen: "erste-toene",
    });
  });
  it("Einstellungen werden auf sinnvolle Grenzen gebracht", () => {
    const d = normalizeData({ version: 1, settings: { toleranceCents: 500, tuningHz: 442 } });
    expect(d.settings.toleranceCents).toBe(50);
    expect(d.settings.tuningHz).toBe(442);
    expect(d.settings.sessionCards).toBe(20);
  });
  it("Antworten: höchstens 20 je Ton", () => {
    const list = Array.from({ length: 30 }, (_, i) => [1, TODAY, i]);
    expect(normalizeData({ version: 1, history: { lesen: { h1: list } } }).history.lesen.h1).toHaveLength(20);
  });
  it("fehlerhafte Sicherungen werden abgelehnt", () => {
    expect(() => parseBackup("nicht json")).toThrow(/JSON/);
    expect(() => parseBackup(JSON.stringify({ app: "etwas-anderes" }))).toThrow(/keine Sicherung/);
    expect(() => parseBackup(JSON.stringify({ app: "floetentrainer", version: 1, cards: { "h1|name": { box: "x" } } }))).toThrow();
    expect(() => parseBackup(JSON.stringify({ app: "floetentrainer", version: 1, history: { lesen: { h1: [[2, TODAY, 1]] } } }))).toThrow();
  });
  it("gültige Sicherung wird eingelesen", () => {
    const d = defaultData();
    d.stages.lesen = "c1";
    d.days = [TODAY];
    const back = parseBackup(JSON.stringify({ ...d, savedAt: "x" }));
    expect(back.stages.lesen).toBe("c1");
    expect(back.days).toEqual([TODAY]);
  });
});
