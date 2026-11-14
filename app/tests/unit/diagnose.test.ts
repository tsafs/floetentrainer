// Diagnose-Aufnahme (nur Messwerte) und ihr Auswerte-Skript app/scripts/diagnose.mjs.
import { describe, expect, it } from "vitest";
import { DIAG_INFO, DIAG_MAX_FRAMES, DiagRecorder, diagFileName } from "../../src/audio/diagnose";
import { BeatFollower, DEFAULT_INPUT_LATENCY } from "../../src/audio/follow";
import type { Frame } from "../../src/audio/judge";
import { soundingFreq } from "../../src/music/notes";
import { buildTimeline } from "../../src/songs/timeline";
import { formatSummary, midiName, summarizeDiag } from "../../scripts/diagnose.mjs";
import { song } from "./songs-helpers";

const STEP = 25;
const START = 1000;

describe("Diagnose-Aufnahme", () => {
  it("hält Messungen, Einordnung und Ereignisse eines Durchgangs; nur Zahlen, kein Ton", () => {
    const d = new DiagRecorder();
    expect(d.available).toBe(false);
    d.begin("warten", 500, { tuningHz: 440 });
    d.frame({ t: 525, freq: 783.99, clarity: 0.97123, rms: 0.1 });
    d.judged({ t: 525, freq: 784, midi: 67, cents: 0, note: 0, cls: "ziel", filled: true });
    d.event(560, "note", { i: 0, ok: true });
    expect(d.available).toBe(false); // läuft noch
    d.end({ done: true });
    expect(d.available).toBe(true);
    const f = JSON.parse(d.json());
    expect(f.info).toBe(DIAG_INFO);
    expect(f.info).toContain("kein Ton und keine Aufnahme");
    expect(f.frames).toEqual([{ t: 25, f: 784, c: 0.971, r: 0.1, sf: 784, m: 67, ct: 0, n: 0, k: "ziel", fl: "überbrückt" }]);
    expect(f.events).toEqual([{ t: 60, type: "note", i: 0, ok: true }]);
    expect(f.end).toEqual({ done: true });
    // ein neuer Durchgang ersetzt den alten
    d.begin("takt", 0, {});
    d.end();
    expect(JSON.parse(d.json()).kind).toBe("takt");
    expect(diagFileName(new Date(2026, 10, 14, 9, 5))).toBe("floetentrainer-diagnose-2026-11-14-0905.json");
  });

  it("begrenzt die Zahl der Messungen", () => {
    const d = new DiagRecorder();
    d.begin("takt", 0, {});
    for (let k = 0; k < DIAG_MAX_FRAMES + 50; k++) d.frame({ t: k * STEP, freq: null, clarity: 0 });
    d.end();
    expect(d.content!.frames.length).toBe(DIAG_MAX_FRAMES);
  });
});

describe("Auswerte-Skript", () => {
  /** Ein Durchgang im Takt mit Aufnahme: Note 1 falsch (c²), alles 80 ms zu spät, Flöte −20 Cent */
  function record() {
    const tl = buildTimeline(song("g'4 a'4 h'4 g'4 ||"));
    const spq = 0.5;
    const d = new DiagRecorder();
    d.begin("takt", START - 500, {
      tuningHz: 440,
      latencyMs: DEFAULT_INPUT_LATENCY,
      latencyCalibrated: false,
      minClarity: 0.85,
      tones: tl.tones.map((n) => ({ midi: n.midi, start: n.start, dur: n.dur })),
      flute: { name: "Meine Flöte", offsets: {} },
    });
    const b = new BeatFollower(tl, {
      secPerQuarter: spq,
      startMs: START,
      onFrame: (j) => d.judged(j),
      onNote: (i, r) => d.event(START, "note", { i, midi: tl.tones[i].midi, ...r }),
    });
    for (let t = START - 400; t < START + 2600; t += STEP) {
      const g = (t - START - DEFAULT_INPUT_LATENCY - 80) / (spq * 1000);
      const i = tl.tones.findIndex((n) => g >= n.start && g < n.start + n.dur - 0.1);
      // je Ton die ersten 25 ms unklar (Einsatz)
      const f: Frame =
        i < 0
          ? { t, freq: null, clarity: 0, rms: 0.001 }
          : (g - tl.tones[i].start) * 500 < 25
            ? { t, freq: 900, clarity: 0.5, rms: 0.06 }
            : { t, freq: soundingFreq(i === 1 ? 72 : tl.tones[i].midi) * Math.pow(2, -20 / 1200), clarity: 0.95, rms: 0.1 };
      d.frame(f);
      b.push(f);
    }
    b.finish(START + 4000);
    d.end();
    return JSON.parse(d.json());
  }

  it("je Note erwartet/erkannt, Cent, Einsatz-Versatz und Grund für Rot; Median des Versatzes; Anteil unklarer Messungen", () => {
    const s = summarizeDiag(record());
    expect(s.notes.map((n) => [n.expected, n.heard, n.ok])).toEqual([
      [67, 67, true],
      [69, 72, false],
      [71, 71, true],
      [67, 67, true],
    ]);
    expect(s.notes[1]).toMatchObject({ reason: "anderer-ton", wrongMidi: 72 });
    expect(s.notes[0].cents).toBe(-20);
    expect(s.medianOnsetMs).toBeGreaterThanOrEqual(80);
    expect(s.medianOnsetMs).toBeLessThanOrEqual(130);
    expect(s.unclearShare).toBeGreaterThan(0.05);
    expect(s.unclearShare).toBeLessThan(0.25);
    expect(s.hits).toBe(3);
  });

  it("Text: Tabelle mit Namen und Grund", () => {
    const d = record();
    const text = formatSummary(d);
    expect(text).toContain("Im Takt");
    expect(text).toMatch(/2 {2}a¹ +c² +rot .*anderer Ton \(c²\)/);
    expect(text).toContain("Getroffen: 3 von 4");
    expect(midiName(69)).toBe("a¹");
    expect(midiName(75)).toBe("es²");
    expect(() => summarizeDiag({})).toThrow();
  });

  it("Abgleich: Versatz je Klick und Ergebnis", () => {
    const d = new DiagRecorder();
    d.begin("abgleich", 0, {});
    d.event(9000, "ergebnis", { ok: true, ms: 140, offsets: [130, 140, null, 150], used: 3 });
    d.end();
    const s = summarizeDiag(JSON.parse(d.json()));
    expect(s.latency).toEqual({ ok: true, ms: 140, offsets: [130, 140, null, 150], reason: null });
    expect(formatSummary(JSON.parse(d.json()))).toContain("Abgleich: 140 ms");
  });
});
