import { describe, expect, it } from "vitest";
import { activeFlute, DATA_VERSION, defaultData, newFluteId, normalizeData } from "../../src/store/data";
import { backupJson, keepDeviceSettings, loadData, parseBackup, saveData, STORAGE_KEY } from "../../src/store/storage";
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
    // der alte Stimmton für alle wird zum (unbekannten) Stimmton der Flöte
    expect(activeFlute(d).tuning).toEqual({ hz: 442, known: false });
    expect("tuningHz" in d.settings).toBe(false);
    expect(d.settings.sessionCards).toBe(20);
  });
  it("Darstellung: auto, hell oder dunkel; Unbekanntes fällt auf auto zurück", () => {
    expect(normalizeData({ version: 1 }).settings.theme).toBe("auto");
    expect(normalizeData({ version: 1, settings: { theme: "light" } }).settings.theme).toBe("light");
    expect(normalizeData({ version: 1, settings: { theme: "dark" } }).settings.theme).toBe("dark");
    expect(normalizeData({ version: 1, settings: { theme: "lila" } }).settings.theme).toBe("auto");
    expect(normalizeData({ version: 1, settings: { theme: 3 } }).settings.theme).toBe("auto");
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

describe("Einstellungen je Lied", () => {
  it("ältere Daten ohne Feld: leer, ohne Versionssprung", () => {
    const d = normalizeData({ version: 1, app: "floetentrainer" });
    expect(d.version).toBe(DATA_VERSION);
    expect(d.songs).toEqual({});
  });
  it("Tempo wird begrenzt, Fehlerhaftes still übergangen, kommt mit in die Sicherung", () => {
    const d = normalizeData({
      version: 1,
      songs: { "jingle-bells": { tempo: 80 }, "stille-nacht": { tempo: 300 }, kaputt: 5, "Böse Kennung": { tempo: 90 }, x: { tempo: "schnell" } },
    });
    expect(d.songs).toEqual({ "jingle-bells": { tempo: 80 }, "stille-nacht": { tempo: 120 } });
    const back = parseBackup(JSON.stringify({ ...d, savedAt: "x" }));
    expect(back.songs["jingle-bells"].tempo).toBe(80);
  });
});

describe("Mitspielen: Einstellungen; alte Bestwerte werden still verworfen", () => {
  it("Standard: keine Kopfhörer, Warte-Modus; ältere Daten ohne die Felder bekommen den Standard (ohne Versionssprung)", () => {
    expect(defaultData().settings).toMatchObject({ headphones: false, followMode: "wait" });
    const d = normalizeData({ version: 2, app: "floetentrainer", settings: { tuningHz: 442 } });
    expect(d.version).toBe(DATA_VERSION);
    expect(DATA_VERSION).toBe(2);
    expect(d.settings).toMatchObject({ headphones: false, followMode: "wait" });
    expect(activeFlute(d).tuning.hz).toBe(442);
  });

  it("Kopfhörer und Art werden übernommen, Fehlerhaftes fällt still auf den Standard zurück", () => {
    const ok = normalizeData({ ...defaultData(), settings: { ...defaultData().settings, headphones: true, followMode: "beat" } });
    expect(ok.settings).toMatchObject({ headphones: true, followMode: "beat" });
    const bad = normalizeData({ ...defaultData(), settings: { ...defaultData().settings, headphones: "ja", followMode: "schnell" } });
    expect(bad.settings).toMatchObject({ headphones: false, followMode: "wait" });
  });

  it("Bestwerte aus älteren Daten sind kein Fehler, werden aber nicht übernommen; das Tempo bleibt", () => {
    const d = normalizeData({
      ...defaultData(),
      songs: {
        a: { tempo: 90, best: { wait: { hits: 45, total: 48, at: 5 }, beat: { hits: 50, total: 48 } } },
        b: { best: { beat: { hits: 3.4, total: 7 }, wait: "gut" } },
        e: { best: [1, 2] },
      },
    });
    expect(d.version).toBe(DATA_VERSION);
    expect(d.songs).toEqual({ a: { tempo: 90 } });
  });

  it("Sicherung mit alten Bestwerten lässt sich einlesen; Kopfhörer kommen mit, Bestwerte nicht", () => {
    const d = defaultData();
    d.settings.headphones = true;
    d.settings.followMode = "beat";
    const old = { ...JSON.parse(backupJson(d)), songs: { "jingle-bells": { tempo: 80, best: { beat: { hits: 40, total: 48, at: 123 } } } } };
    const back = parseBackup(JSON.stringify(old));
    expect(back.settings).toMatchObject({ headphones: true, followMode: "beat" });
    expect(back.songs["jingle-bells"]).toEqual({ tempo: 80 });
    expect(JSON.parse(backupJson(back)).songs["jingle-bells"].best).toBeUndefined();
  });
});

describe("Flöten und Verzögerung (ohne Versionssprung)", () => {
  it("Standard: eine Flöte „Meine Flöte“ ohne Werte; ältere Daten ohne Feld bekommen sie", () => {
    const d = defaultData();
    expect(d.flutes).toEqual([{ id: "floete-1", name: "Meine Flöte", tuning: { hz: 440, known: false }, offsets: {}, updated: 0 }]);
    expect(d.activeFlute).toBe("floete-1");
    expect(d.settings.inputLatencyMs).toEqual({ speaker: null, headphones: null });
    const old = normalizeData({ version: 2, settings: { tuningHz: 442 } });
    expect(old.flutes.length).toBe(1);
    expect(activeFlute(old).name).toBe("Meine Flöte");
    expect(old.settings.inputLatencyMs).toEqual({ speaker: null, headphones: null });
    expect(DATA_VERSION).toBe(2);
  });

  it("Flöten hin und zurück über die Sicherung; Fehlerhaftes fällt still weg, Werte begrenzt", () => {
    const d = defaultData();
    d.flutes = [
      { id: "floete-1", name: "Meine Flöte", tuning: { hz: 432.4, known: false }, offsets: { a1: -2.5, e1: 12 }, updated: 5 },
      { id: "floete-2", name: "Holzflöte", tuning: { hz: 442, known: true }, offsets: {}, updated: 0 },
    ];
    d.activeFlute = "floete-2";
    const back = parseBackup(backupJson(d));
    expect(back.flutes).toEqual(d.flutes);
    expect(back.activeFlute).toBe("floete-2");
    const messy = normalizeData({
      version: 2,
      flutes: [
        { id: "floete-1", name: "  ", tuning: { hz: 500, known: "ja" }, offsets: { a1: -300, xx: 3, dis1: 4, h1: "a" } },
        { id: "floete-1", name: "doppelt" },
        { id: "boese id", name: "x" },
        "kaputt",
      ],
      activeFlute: "floete-9",
    });
    expect(messy.flutes).toEqual([{ id: "floete-1", name: "Meine Flöte", tuning: { hz: 466, known: false }, offsets: { a1: -120 }, updated: 0 }]);
    expect(messy.activeFlute).toBe("floete-1");
    expect(newFluteId(back.flutes)).toBe("floete-3");
  });

  it("Verzögerung je Kopfhörer-Zustand gehört zum Gerät: nicht in der Sicherung, beim Einlesen bleibt der Wert des Geräts", () => {
    const d = defaultData();
    d.settings.inputLatencyMs = { speaker: 140, headphones: 260 };
    const json = backupJson(d);
    expect(JSON.parse(json).settings.inputLatencyMs).toBeUndefined();
    const other = defaultData();
    other.settings.inputLatencyMs = { speaker: 90, headphones: null };
    const incoming = parseBackup(json);
    expect(incoming.settings.inputLatencyMs).toEqual({ speaker: null, headphones: null });
    expect(keepDeviceSettings(incoming, other).settings.inputLatencyMs).toEqual({ speaker: 90, headphones: null });
    // im Speicher des Geräts bleibt sie erhalten (begrenzt auf 0–400 ms)
    const s = mem();
    saveData(d, s);
    const r = loadData(s);
    expect(r.ok && r.data.settings.inputLatencyMs).toEqual({ speaker: 140, headphones: 260 });
    expect(normalizeData({ version: 2, settings: { inputLatencyMs: { speaker: 900, headphones: "x" } } }).settings.inputLatencyMs).toEqual({ speaker: 400, headphones: null });
  });
});
