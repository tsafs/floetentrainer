// Stimmton je Flöte (Wunsch vom 14.11.2026): Hz/Cent-Rechnung, Umwandlung alter Daten, Einstellen mit
// unbekanntem und bekanntem Stimmton, Umschalten, Stimmgerät, Vorspielen, Sicherung.
import { describe, expect, it } from "vitest";
import { FluteCalibrator, LiveTuning, offsetFor, type CalibrateState } from "../../src/audio/flute-profile";
import { followConfig, WaitFollower } from "../../src/audio/follow";
import { toneFreq } from "../../src/audio/flute-synth";
import type { Frame } from "../../src/audio/judge";
import { PlayJudge } from "../../src/audio/judge";
import { freqToWrittenMidi, note, soundingFreq } from "../../src/music/notes";
import {
  A4,
  absoluteCents,
  centsBetween,
  calibrationReference,
  fromLegacy,
  offsetFromReference,
  hzText,
  measuredHz,
  recenter,
  retune,
  roundHalfHz,
  setKnownTuning,
  setUnknownTuning,
  shiftHz,
  tuningShort,
  type Tuned,
} from "../../src/music/tuning";
import { buildTimeline } from "../../src/songs/timeline";
import { activeFlute, defaultData, newFlute, normalizeData, tuningHz } from "../../src/store/data";
import { backupJson, parseBackup } from "../../src/store/storage";
import { song } from "./songs-helpers";

const STEP = 25;
/** klingende Frequenz der notierten Note bei Stimmton a, um cents verstimmt */
const hz = (midi: number, cents = 0, a = A4) => shiftHz(soundingFreq(midi, a), cents);

/** gehaltener Ton (ms) nach 100 ms Stille, Frames alle 25 ms */
function tone(freq: number, ms: number, t0 = 0): Frame[] {
  const out: Frame[] = [];
  let t = t0;
  for (let k = 0; k < 4; k++, t += STEP) out.push({ t, freq: null, clarity: 0, rms: 0.001 });
  for (let k = 0; k < ms / STEP; k++, t += STEP) out.push({ t, freq, clarity: 0.97, rms: 0.1 });
  return out;
}
const feed = (x: { push(f: Frame): unknown }, fs: Frame[]) => fs.forEach((f) => x.push(f));

/** absolute Lagen gleich (auf 0,05 Cent, Werte sind auf 0,01 gespeichert) */
function sameAbsolute(a: Record<string, number>, b: Record<string, number>) {
  expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
  for (const k of Object.keys(a)) expect(Math.abs(a[k] - b[k])).toBeLessThanOrEqual(0.051);
}

describe("Hz und Cent (an einer Stelle)", () => {
  it("Abstand und Verschiebung", () => {
    expect(centsBetween(880, 440)).toBeCloseTo(1200, 9);
    expect(centsBetween(442, 440)).toBeCloseTo(7.85, 2);
    expect(shiftHz(440, -30)).toBeCloseTo(432.44, 2);
    expect(centsBetween(shiftHz(437, 17.3), 437)).toBeCloseTo(17.3, 9);
  });

  it("Frequenzen der Flöte folgen dem Stimmton, hin und zurück", () => {
    expect(soundingFreq(69, 440)).toBeCloseTo(880, 9);
    expect(soundingFreq(69, 442)).toBeCloseTo(884, 9);
    for (const a of [415, 432.4, 440, 442, 466]) {
      expect(freqToWrittenMidi(soundingFreq(note("e1"), a), a)).toBeCloseTo(64, 9);
    }
    // 442 Hz klingt gegen 440 knapp 8 Cent hoch
    expect((freqToWrittenMidi(soundingFreq(69, 442), 440) - 69) * 100).toBeCloseTo(7.85, 2);
  });

  it("Text: bekannt genau, ermittelt auf 0,5 Hz gerundet", () => {
    expect(hzText({ hz: 442, known: true })).toBe("442 Hz");
    expect(hzText({ hz: 432.45, known: false })).toBe("432,5 Hz");
    expect(hzText({ hz: 431.96, known: false })).toBe("432 Hz");
    expect(roundHalfHz(442.3)).toBe(442.5);
    expect(tuningShort({ tuning: { hz: 440, known: false }, offsets: {} })).toBeNull();
    expect(tuningShort({ tuning: { hz: 432.45, known: false }, offsets: { a1: 0 } })).toBe("etwa 432,5 Hz");
    expect(tuningShort({ tuning: { hz: 442, known: true }, offsets: {} })).toBe("442 Hz");
  });
});

describe("Umwandlung alter Daten (settings.tuningHz für alle, Werte relativ dazu)", () => {
  it("440 ohne Werte: Flöte unbekannt mit 440 Hz", () => {
    const d = normalizeData({ version: 2, settings: { tuningHz: 440 }, flutes: [{ id: "floete-1", name: "Meine Flöte", offsets: {} }], activeFlute: "floete-1" });
    expect(activeFlute(d).tuning).toEqual({ hz: 440, known: false });
    expect(activeFlute(d).offsets).toEqual({});
  });

  it("440 mit Werten: Stimmton = Median der absoluten Lagen, Werte = absolut − Stimmton", () => {
    const old = { a1: -25, e1: -35, g1: -30, h1: -26 };
    const d = normalizeData({ version: 2, settings: { tuningHz: 440 }, flutes: [{ id: "floete-1", name: "Kinderflöte", offsets: old }], activeFlute: "floete-1" });
    const f = activeFlute(d);
    expect(f.tuning.known).toBe(false);
    expect(f.tuning.hz).toBeCloseTo(shiftHz(440, -28), 6); // Median von −35, −30, −26, −25
    expect(f.offsets).toEqual({ a1: 3, e1: -7, g1: -2, h1: 2 });
    sameAbsolute(absoluteCents(f), old);
  });

  it("anderer Stimmton (436) ohne Werte: aktive Flöte unbekannt mit 436, weitere Flöten ohne Werte 440", () => {
    const d = normalizeData({
      version: 2,
      settings: { tuningHz: 436 },
      flutes: [
        { id: "floete-1", name: "Eins", offsets: {} },
        { id: "floete-2", name: "Zwei", offsets: {} },
      ],
      activeFlute: "floete-2",
    });
    expect(d.flutes[1].tuning).toEqual({ hz: 436, known: false });
    expect(d.flutes[0].tuning).toEqual({ hz: 440, known: false });
  });

  it("442 mit Werten, auch bei einer nicht aktiven Flöte: absolute Lagen bleiben (442 + Wert)", () => {
    const vals = { c1: 10, d1: -4, a1: 2.5 };
    const d = normalizeData({
      version: 2,
      settings: { tuningHz: 442 },
      flutes: [
        { id: "floete-1", name: "Eins", offsets: vals },
        { id: "floete-2", name: "Zwei", offsets: {} },
      ],
      activeFlute: "floete-2",
    });
    const f = d.flutes[0];
    expect(f.tuning.known).toBe(false);
    expect(f.tuning.hz).toBeCloseTo(shiftHz(442, 2.5), 6);
    const base = centsBetween(442, 440);
    sameAbsolute(absoluteCents(f), { c1: base + 10, d1: base - 4, a1: base + 2.5 });
    // die aktive Flöte ohne Werte übernimmt den alten Stimmton
    expect(d.flutes[1].tuning).toEqual({ hz: 442, known: false });
  });

  it("ganz alte Daten ohne Flöten: Standard-Flöte übernimmt den alten Stimmton; neue Daten behalten ihren", () => {
    expect(activeFlute(normalizeData({ version: 1, settings: { tuningHz: 445 } })).tuning).toEqual({ hz: 445, known: false });
    expect(activeFlute(normalizeData({ version: 0 })).tuning).toEqual({ hz: 440, known: false });
    // neue Daten: ein (fremdes) settings.tuningHz zählt nicht
    const n = normalizeData({ version: 2, settings: { tuningHz: 430 }, flutes: [{ id: "floete-1", name: "X", tuning: { hz: 442, known: true }, offsets: { a1: -3 } }] });
    expect(activeFlute(n).tuning).toEqual({ hz: 442, known: true });
    expect(activeFlute(n).offsets).toEqual({ a1: -3 });
  });

  it("alte Sicherung (settings.tuningHz, Flöte ohne tuning) lässt sich einlesen und neu sichern", () => {
    const old = JSON.stringify({
      ...defaultData(),
      settings: { ...defaultData().settings, tuningHz: 438 },
      flutes: [{ id: "floete-1", name: "Alt", offsets: { g1: -10, a1: -20, h1: -30 }, updated: 3 }],
    });
    const d = parseBackup(old);
    const f = activeFlute(d);
    expect(f.tuning.known).toBe(false);
    expect(f.tuning.hz).toBeCloseTo(shiftHz(438, -20), 6);
    expect(f.offsets).toEqual({ g1: 10, a1: 0, h1: -10 });
    const again = JSON.parse(backupJson(d));
    expect(again.settings.tuningHz).toBeUndefined();
    expect(parseBackup(JSON.stringify(again)).flutes).toEqual(d.flutes);
  });

  it("fromLegacy: Grenzen des Stimmtons (sehr tiefe Flöte bei 415), absolute Lagen bleiben", () => {
    const f = fromLegacy({ a1: -30, g1: -28 }, 415);
    expect(f.tuning.hz).toBe(415);
    sameAbsolute(absoluteCents(f), { a1: centsBetween(415, 440) - 30, g1: centsBetween(415, 440) - 28 });
  });
});

describe("Sicherung hin und zurück", () => {
  it("Stimmton je Flöte (bekannt und ermittelt) kommt mit", () => {
    const d = defaultData();
    d.flutes = [newFlute("floete-1", "Kinderflöte", { hz: 432.45, known: false }), newFlute("floete-2", "Neue", { hz: 442, known: true })];
    d.flutes[0].offsets = { e1: -15, a1: 12.3 };
    d.activeFlute = "floete-2";
    const back = parseBackup(backupJson(d));
    expect(back.flutes).toEqual(d.flutes);
    expect(tuningHz(back)).toBe(442);
  });
});

/** Flöte einstellen wie in ../../src/ui/flute.ts: messen gegen den aktuellen Stimmton, speichern, recenter */
function calibrate(f: Tuned, plan: [string, number][], a = A4) {
  let t = 0;
  for (const [id, cents] of plan) {
    const ref = calibrationReference(f);
    const c = new FluteCalibrator(note(id).midi, ref);
    let s: CalibrateState = c.state;
    for (const fr of tone(hz(note(id).midi, cents, a), 2000, t)) s = c.push(fr);
    t += 3000;
    expect(s.phase).toBe("done");
    if (s.phase === "done") f.offsets[id] = offsetFromReference(f, s.cents, ref);
    recenter(f);
  }
}

describe("Flöte einstellen mit unbekanntem und bekanntem Stimmton", () => {
  // Töne um −30 ± 15 Cent (gegen 440)
  const plan: [string, number][] = [
    ["d1", -45],
    ["e1", -15],
    ["fis1", -38],
    ["g1", -30],
    ["a1", -22],
    ["h1", -35],
    ["c2", -25],
  ];

  it("unbekannt: Stimmton ≈ 432,4 Hz (Median), Werte ± 15 um ihn", () => {
    const f = newFlute("floete-1", "Kinderflöte");
    calibrate(f, plan);
    expect(f.tuning.known).toBe(false);
    expect(f.tuning.hz).toBeCloseTo(432.4, 0);
    expect(Math.abs(f.tuning.hz - shiftHz(440, -30))).toBeLessThan(0.15);
    expect(tuningShort(f)).toBe("etwa 432,5 Hz");
    for (const [id, c] of plan) expect(f.offsets[id]).toBeCloseTo(c + 30, -0.3); // ±1 Cent
    expect(Math.max(...Object.values(f.offsets).map(Math.abs))).toBeLessThanOrEqual(16);
  });

  it("bekannt (442, real 442,5 mit Eigenheiten): Werte relativ zur Angabe, Stimmton bleibt; gemessen etwa 442,5", () => {
    const f = newFlute("floete-2", "Neue", { hz: 442, known: true });
    const real = centsBetween(442.5, 442);
    const own: [string, number][] = [["g1", 12], ["a1", -10], ["h1", 4], ["c2", -18], ["d2", 0]];
    calibrate(f, own.map(([id, c]): [string, number] => [id, c + real]), 442);
    expect(f.tuning).toEqual({ hz: 442, known: true });
    for (const [id, c] of own) expect(Math.abs(f.offsets[id] - (c + real))).toBeLessThanOrEqual(1);
    expect(roundHalfHz(measuredHz(f)!)).toBe(442.5);
  });

  it("bekannt 442, Flöte klingt aber bei etwa 432: Einstellen misst an der gemessenen Mitte, kein „anderer Ton“", () => {
    const f = newFlute("floete-2", "Falsch beschriftet", { hz: 442, known: true });
    // gegen 442: −38 ± 15 (einzelne Töne über −50)
    const own: [string, number][] = [["g1", -36], ["a1", -53], ["h1", -24], ["c2", -40], ["d2", -50]];
    calibrate(f, own, 442);
    expect(f.tuning).toEqual({ hz: 442, known: true });
    for (const [id, c] of own) expect(Math.abs(f.offsets[id] - c)).toBeLessThanOrEqual(1);
    expect(Math.abs(centsBetween(measuredHz(f)!, 442) + 40)).toBeLessThanOrEqual(1); // Median −40
  });

  it("bekannt 442, deutlich tiefer gemessen: gemessenen Wert übernehmen erhält die absoluten Lagen", () => {
    const f = newFlute("floete-2", "Neue", { hz: 442, known: true });
    f.offsets = { g1: -20, a1: -25, h1: -14 };
    const before = absoluteCents(f);
    const meas = measuredHz(f)!;
    expect(Math.abs(centsBetween(meas, 442))).toBeGreaterThan(10);
    setKnownTuning(f, roundHalfHz(meas));
    expect(f.tuning).toEqual({ hz: roundHalfHz(meas), known: true });
    sameAbsolute(absoluteCents(f), before);
  });
});

describe("Bekannter Stimmton 442: ungemessene Töne werden dort erwartet", () => {
  it("Übung: a¹ genau bei 442 ist ±0, nicht +8; Mitspielen: 45 Cent über 442 ist der Zielton", () => {
    const f = newFlute("floete-2", "Neue", { hz: 442, known: true });
    const j = new PlayJudge({ tuning: f.tuning.hz }, (m) => offsetFor(f.offsets, m));
    j.newCard(69, 0);
    let heard: number | null = null;
    let ok = false;
    for (const fr of tone(hz(69, 0, 442), 800, 500)) {
      const o = j.push(fr);
      if (o.heard) heard = o.heard.cents;
      if (o.event === "correct") ok = true;
    }
    expect(heard).toBe(0);
    expect(ok).toBe(true);

    const tl = buildTimeline(song("g'2 a'2 h'2 ||"));
    const play = () => [67, 69, 71].flatMap((m, i) => tone(hz(m, 45, 442), 400, i * 600));
    const w442 = new WaitFollower(tl, { cfg: followConfig({ headphones: false, inputLatencyMs: { speaker: null, headphones: null } }, f.tuning.hz), tuning: new LiveTuning(f.offsets, {}, true) });
    feed(w442, play());
    expect(w442.results.map((r) => r?.ok)).toEqual([true, true, true]);
    // gegen 440 lägen diese Töne über der Halbton-Grenze (≈ 53 Cent): kein Treffer
    const w440 = new WaitFollower(tl, { cfg: followConfig({ headphones: false, inputLatencyMs: { speaker: null, headphones: null } }, 440), tuning: new LiveTuning({}, { rate: 0 }, true) });
    feed(w440, play());
    expect(w440.results.filter((r) => r?.ok).length).toBe(0);
  });
});

describe("Umschalten bekannt/unbekannt", () => {
  it("erhält die absoluten Lagen; unbekannt ermittelt sofort den Median", () => {
    const f = newFlute("floete-1", "Kinderflöte", { hz: 432.45, known: false });
    f.offsets = { e1: -15, a1: 10, g1: 0, h1: 4 };
    const abs0 = absoluteCents(f);
    setKnownTuning(f, 442);
    expect(f.tuning).toEqual({ hz: 442, known: true });
    sameAbsolute(absoluteCents(f), abs0);
    expect(f.offsets.g1).toBeCloseTo(centsBetween(432.45, 442), 1);
    setKnownTuning(f, 440);
    sameAbsolute(absoluteCents(f), abs0);
    setUnknownTuning(f);
    expect(f.tuning.known).toBe(false);
    sameAbsolute(absoluteCents(f), abs0);
    expect(f.tuning.hz).toBeCloseTo(shiftHz(432.45, 2), 1); // Median von −15, 0, 4, 10
    // ohne Werte bleibt der Stimmton beim Umschalten
    const g = newFlute("floete-2", "Leer", { hz: 442, known: true });
    setUnknownTuning(g);
    expect(g.tuning).toEqual({ hz: 442, known: false });
  });

  it("retune begrenzt Stimmton und Werte", () => {
    const f: Tuned = { tuning: { hz: 440, known: true }, offsets: { a1: -40 } };
    retune(f, 500);
    expect(f.tuning.hz).toBe(466);
    expect(f.offsets.a1).toBe(-120);
  });
});

describe("Stimmgerät und Vorspielen folgen der aktiven Flöte", () => {
  it("Cent relativ zum Stimmton der aktiven Flöte; Flöte wechseln ändert den Bezug", () => {
    const d = defaultData();
    d.flutes = [newFlute("floete-1", "Neue", { hz: 442, known: true }), newFlute("floete-2", "Kinderflöte", { hz: shiftHz(440, -30), known: false })];
    d.flutes[1].offsets = { a1: 0 };
    const played = hz(69, 0, 442);
    const cents = () => {
      const m = freqToWrittenMidi(played, tuningHz(d));
      return Math.round((m - Math.round(m)) * 100);
    };
    d.activeFlute = "floete-1";
    expect(cents()).toBe(0);
    d.activeFlute = "floete-2";
    expect(cents()).toBe(38);
  });

  it("Synth: Frequenz folgt dem Stimmton der aktiven Flöte", () => {
    const d = defaultData();
    d.flutes.push(newFlute("floete-2", "Neue", { hz: 442, known: true }));
    expect(toneFreq(69, tuningHz(d))).toBeCloseTo(880, 6);
    d.activeFlute = "floete-2";
    expect(toneFreq(69, tuningHz(d))).toBeCloseTo(884, 6);
  });
});
