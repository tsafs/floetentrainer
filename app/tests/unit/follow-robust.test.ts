// Robustere Regeln beim Mitspielen (Befund am echten Gerät vom 14.11.2026: Flöte etwa 30 Cent zu tief,
// „Im Takt“ fast alles rot, „Wartet auf mich“ oft rot): nächster Halbton, Flötenprofil und Nachführen,
// weniger empfindliches „falsch“ im Warte-Modus, großzügigere Wertung und Verzögerung im Takt-Modus,
// Metronom-Klicks.
import { describe, expect, it } from "vitest";
import { correctPitch, LiveTuning, offsetFor } from "../../src/audio/flute-profile";
import { CLICK_ACCENT_FREQ, CLICK_FREQ } from "../../src/audio/flute-synth";
import {
  BeatFollower,
  ClickFilter,
  DEFAULT_FOLLOW,
  DEFAULT_HEADPHONE_LATENCY,
  DEFAULT_INPUT_LATENCY,
  followConfig,
  inputLatency,
  WaitFollower,
  type JudgedFrame,
} from "../../src/audio/follow";
import type { Frame } from "../../src/audio/judge";
import { soundingFreq } from "../../src/music/notes";
import { buildTimeline, type Timeline } from "../../src/songs/timeline";
import { seeded } from "./helpers";
import { song } from "./songs-helpers";

const STEP = 25;
const hz = (midi: number, cents = 0) => soundingFreq(midi) * Math.pow(2, cents / 1200);
const G = 67;
const A = 69;
const H = 71;
const C2 = 72;
const E1 = 64;
const ES1 = 63;
const feed = (fl: { push(f: Frame): unknown }, fs: Frame[]) => fs.forEach((f) => fl.push(f));

/** Stücke [notierte Höhe | null, ms, Cent, Klarheit] → Frames alle 25 ms ab t0 */
function frames(pieces: [number | null, number, number?, number?][], t0 = 0): Frame[] {
  const out: Frame[] = [];
  let t = t0;
  for (const [m, ms, c = 0, cl = 0.97] of pieces) {
    for (let k = 0; k < Math.round(ms / STEP); k++, t += STEP) {
      out.push(m === null ? { t, freq: null, clarity: 0, rms: 0.001 } : { t, freq: hz(m, c), clarity: cl, rms: 0.1 });
    }
  }
  return out;
}

// ---------------------------------------------------------------- nächster Halbton und Flötenprofil

describe("Toleranz = nächster Halbton, relativ zur Flöte", () => {
  it("correctPitch: nächster Halbton ohne Profil, mit Profil der nächste Ton *dieser* Flöte", () => {
    expect(correctPitch(69.45, () => 0)).toEqual({ midi: 69, cents: expect.closeTo(45, 5) });
    expect(correctPitch(69.55, () => 0).midi).toBe(70);
    // e¹ dieser Flöte liegt 45 Cent tief: 63,55 ist ihr e¹ (nicht es¹)
    const off = (m: number) => (m === E1 ? -45 : 0);
    const r = correctPitch(63.55, off);
    expect(r.midi).toBe(E1);
    expect(r.cents).toBeCloseTo(0, 5);
  });

  it("Warte-Modus: 49 Cent daneben ist der Zielton; 55 Cent weder richtig noch falsch; 70 Cent nach 250 ms falsch", () => {
    const tl = buildTimeline(song("g'4 a'4 ||"));
    const fixed = () => new LiveTuning({}, { rate: 0 });
    const w = new WaitFollower(tl, { tuning: fixed() });
    feed(w, frames([[G, 300, -49]]));
    expect(w.index).toBe(1);
    const edge = new WaitFollower(tl, { tuning: fixed() });
    feed(edge, frames([[G, 1000, 55]]));
    expect(edge.index).toBe(0);
    expect(edge.wrongMidi).toBeNull();
    const wrong = new WaitFollower(tl, { tuning: fixed() });
    feed(wrong, frames([[G, 225, 70]]));
    expect(wrong.wrongMidi).toBeNull();
    feed(wrong, frames([[G, 100, 70]], 225));
    expect(wrong.wrongMidi).toBe(G + 1);
  });

  it("ungemessene Töne liegen beim Stimmton der Flöte (0) – der frühere Rückfall „Median der gemessenen“ entfällt", () => {
    expect(offsetFor({ a1: -20, g1: -30, h1: -40 }, C2)).toBe(0);
    expect(offsetFor({ a1: -20, g1: -30, h1: -40 }, A)).toBe(-20);
    expect(offsetFor({}, C2)).toBe(0);
    expect(offsetFor({ a1: -20 }, C2, -7)).toBe(-7);
  });

  it("e¹ bei −45 Cent: mit Profil sicher der Zielton, ohne Profil am Rand (teils als es¹ gehört)", () => {
    const tl = buildTimeline(song("e'2 g'2 ||"));
    // −45 Cent mit Wackeln ±10 (Blasdruck)
    const play = (): Frame[] => frames([[null, 100]]).concat(
      Array.from({ length: 24 }, (_, k): Frame => ({ t: 100 + k * STEP, freq: hz(E1, -45 + 10 * Math.sin(k / 2)), clarity: 0.97, rms: 0.1 })),
    );
    const cls = (tuning: LiveTuning) => {
      const seen: JudgedFrame[] = [];
      const w = new WaitFollower(tl, { tuning, onFrame: (j) => seen.push(j) });
      feed(w, play());
      return { w, seen: seen.filter((j) => j.cls) };
    };
    const withProfile = cls(new LiveTuning({ e1: -45 }));
    expect(withProfile.w.results[0]).toMatchObject({ ok: true });
    expect(withProfile.seen.filter((j) => j.cls === "ziel").length).toBeGreaterThanOrEqual(5);
    expect(withProfile.seen.some((j) => j.cls === "anders" || j.midi === ES1)).toBe(false);
    expect(Math.max(...withProfile.seen.filter((j) => j.cents !== undefined).map((j) => Math.abs(j.cents!)))).toBeLessThanOrEqual(11);
    const without = cls(new LiveTuning({}, { rate: 0 }));
    expect(without.seen.some((j) => j.midi === ES1)).toBe(true);
  });
});

// ---------------------------------------------------------------- Nachführen

describe("Flötenprofil beim Mitspielen nachführen", () => {
  it("langsam und begrenzt: gemessene Töne höchstens 15 Cent je Durchgang, ungemessene schrittweise", () => {
    const t = new LiveTuning({ a1: -10 });
    for (let k = 0; k < 400; k++) t.observe(A, -40);
    expect(t.values.a1).toBe(-25);
    const u = new LiveTuning();
    for (let k = 0; k < 4; k++) u.observe(G, -35);
    expect(u.values.g1).toBeUndefined(); // erst ab 5 Messungen
    for (let k = 0; k < 16; k++) u.observe(G, -35);
    expect(u.values.g1).toBeLessThan(0);
    expect(u.values.g1).toBeGreaterThan(-35 * 0.5); // knapp die Hälfte nach einer Viertelnote (20 Messungen)
    // höchstens 0,5 Cent je Messung
    const before = u.values.g1!;
    u.observe(G, 40);
    expect(Math.abs(u.values.g1! - before)).toBeLessThanOrEqual(0.5);
    // gespeichert wird nur, was genug Messungen hat
    expect(u.changes()).toEqual({ g1: Math.round(u.values.g1!) });
    expect(new LiveTuning().changes()).toEqual({});
  });

  it("unbekannter Stimmton: ungemessene Töne folgen beim Nachführen dem Median aller Werte (der Stimmton wandert mit)", () => {
    const t = new LiveTuning({ g1: -30, a1: -30 });
    expect(t.offsetOf(C2)).toBe(-30);
    for (let k = 0; k < 200; k++) t.observe(H, -30);
    expect(t.values.h1).toBeCloseTo(-30, 0);
    // nie eingestellte Flöte: nach einem nachgeführten Ton liegen auch die übrigen dort
    const u = new LiveTuning();
    for (let k = 0; k < 200; k++) u.observe(G, -30);
    expect(u.offsetOf(C2)).toBeCloseTo(u.values.g1!, 6);
    expect(u.offsetOf(C2)).toBeLessThan(-20);
  });

  it("bekannter Stimmton: ungemessene Töne bleiben beim Stimmton (0), gemessene werden nachgeführt", () => {
    const t = new LiveTuning({ g1: -30, a1: -30 }, {}, true);
    expect(t.offsetOf(C2)).toBe(0);
    for (let k = 0; k < 200; k++) t.observe(G, -20);
    expect(t.values.g1).toBeGreaterThan(-30);
    expect(t.offsetOf(H)).toBe(0);
  });
});

// ---------------------------------------------------------------- Flöte 30 Cent tief

/** Jede Note um −30 Cent mit eigener Streuung ±20 (je nach Blasdruck), seeded */
const spread = (n: number, seed = 3) => {
  const r = seeded(seed);
  return Array.from({ length: n }, () => -30 + (r() * 2 - 1) * 19);
};

describe("Flöte etwa 30 Cent zu tief, Streuung ±20 Cent", () => {
  const tl = () => buildTimeline(song("g'4 a'4 h'4 c''4 | d''4 c''4 h'4 a'4 | g'4 a'4 h'4 a'4 | g'1 ||"));

  it("Warte-Modus: alles grün – auch ohne Profil (Nachführen), früher (±40 Cent, ohne Angleichen) nicht", () => {
    const t = tl();
    const dev = spread(t.tones.length);
    const pieces = t.tones.flatMap((n, i): [number | null, number, number?][] => [[n.midi, 300, dev[i]], [null, 75]]);
    const w = new WaitFollower(t);
    feed(w, frames(pieces));
    expect(w.results.map((r) => r?.ok)).toEqual(Array(t.tones.length).fill(true));
    // die nachgeführten Werte liegen nahe −30
    expect(Object.values(w.tuning.changes()).every((v) => v < -10 && v > -45)).toBe(true);
    const old = new WaitFollower(t, { cfg: { toleranceCents: 40 }, tuning: new LiveTuning({}, { rate: 0 }) });
    feed(old, frames(pieces));
    expect(old.done).toBe(false);
  });

  it("Takt-Modus: alles grün; mit eingestellter Flöte (−30 überall) ebenso", () => {
    const t = tl();
    const dev = spread(t.tones.length, 9);
    const spq = 0.6;
    const fs = beatFrames(t, { spq, cents: (i) => dev[i] });
    const b = new BeatFollower(t, { secPerQuarter: spq, startMs: START });
    feed(b, fs);
    expect(b.passResults[0].map((r) => r?.ok)).toEqual(Array(t.tones.length).fill(true));
    const prof = new BeatFollower(t, { secPerQuarter: spq, startMs: START, tuning: new LiveTuning({ g1: -30, a1: -30, h1: -30, c2: -30, d2: -30 }) });
    feed(prof, fs);
    expect(prof.passes[0].hits).toBe(t.tones.length);
  });
});

// ---------------------------------------------------------------- Warte-Modus: weniger „falsch“

describe("Warte-Modus: rot nur bei einem deutlich anderen, neu eingesetzten und lange stabilen Ton", () => {
  const tl = () => buildTimeline(song("g'4 a'4 h'4 c''4 ||"));

  it("Übergangsklänge beim Fingerwechsel und kurze falsche Töne (bis 200 ms) färben nicht rot", () => {
    const wrongs: number[] = [];
    const w = new WaitFollower(tl(), { onWrong: (i) => wrongs.push(i) });
    // g¹, dann beim Wechsel zu a¹ 50 ms ein Zwischenklang (gis¹), dann 200 ms h¹ (Fehlgriff), dann a¹ …
    feed(w, frames([[G, 300], [G + 1, 50], [H, 200], [A, 300], [null, 60], [H, 300], [C2 + 2, 75], [C2, 300]]));
    expect(wrongs).toEqual([]);
    expect(w.results.map((r) => r?.ok)).toEqual([true, true, true, true]);
  });

  it("ein neu eingesetzter falscher Ton von 300 ms färbt rot (die Note wartet weiter)", () => {
    const wrongs: [number, number][] = [];
    const w = new WaitFollower(tl(), { onWrong: (i, m) => wrongs.push([i, m]) });
    feed(w, frames([[G, 300], [null, 60], [C2, 300], [null, 60], [A, 300]]));
    expect(wrongs).toEqual([[1, C2]]);
    expect(w.results[1]).toMatchObject({ ok: false, wrongMidi: C2 });
  });

  it("der nach dem Treffer weitergehaltene alte Ton zählt nie, auch sehr lange nicht", () => {
    const wrongs: number[] = [];
    const w = new WaitFollower(tl(), { onWrong: (i) => wrongs.push(i) });
    feed(w, frames([[G, 2000], [null, 60], [A, 300]]));
    expect(wrongs).toEqual([]);
    expect(w.results.map((r) => r?.ok)).toEqual([true, true]);
  });

  it("Haltedauer für „richtig“ bleibt kurz (120 ms), für „falsch“ 250 ms", () => {
    expect(DEFAULT_FOLLOW.holdMs).toBe(120);
    expect(DEFAULT_FOLLOW.wrongHoldMs).toBe(250);
  });
});

// ---------------------------------------------------------------- Takt-Modus

const START = 1000;

/**
 * Spielt einen Zeitplan im Takt: zum Zeitpunkt t erklingt der Ton, dessen Fenster (um `late` ms
 * verschoben) t enthält, bis `gap` ms vor seinem Ende; die ersten `chiff` ms jedes Tons sind unklar
 * (Einschwingen). Gemessen wird `device` ms später (Verzögerung des Geräts).
 */
function beatFrames(
  tl: Timeline,
  o: { spq?: number; late?: number; gap?: number; device?: number; chiff?: number; wrong?: Record<number, number>; cents?: (i: number) => number } = {},
): Frame[] {
  const spq = (o.spq ?? 0.5) * 1000;
  const late = o.late ?? 0;
  const gap = o.gap ?? 40;
  const device = o.device ?? DEFAULT_INPUT_LATENCY;
  const out: Frame[] = [];
  for (let t = START - 400; t < START + tl.total * spq + late + device + 400; t += STEP) {
    const s = t - device - late - START;
    const g = s / spq;
    const i = tl.tones.findIndex((n) => g >= n.start && (g - n.start) * spq < n.dur * spq - gap);
    if (i < 0) out.push({ t, freq: null, clarity: 0, rms: 0.001 });
    else if ((g - tl.tones[i].start) * spq < (o.chiff ?? 0)) out.push({ t, freq: 700 + 400 * Math.sin(t), clarity: 0.6, rms: 0.08 });
    else out.push({ t, freq: hz(o.wrong?.[i] ?? tl.tones[i].midi, o.cents?.(i) ?? 0), clarity: 0.95, rms: 0.1 });
  }
  return out;
}

describe("Takt-Modus: großzügigere Wertung und Verzögerung", () => {
  const melody = () => buildTimeline(song("g'8 a'8 h'8 c''8 d''4 c''4 | h'8 a'8 g'8 a'8 h'2 ||"));
  const run = (tl: Timeline, fs: Frame[], spq: number, cfg = {}) => {
    const b = new BeatFollower(tl, { secPerQuarter: spq, startMs: START, cfg });
    feed(b, fs);
    b.finish(START + tl.total * spq * 1000 + 3000);
    return b.passResults[0];
  };

  it("Standard-Verzögerung 120 ms (ohne Kopfhörer), 200 ms mit Kopfhörern; abgeglichene Werte je Zustand", () => {
    expect(DEFAULT_FOLLOW.latencyMs).toBe(120);
    const s = { headphones: false, inputLatencyMs: { speaker: null, headphones: null } };
    expect(inputLatency(s)).toEqual({ ms: DEFAULT_INPUT_LATENCY, calibrated: false });
    expect(inputLatency({ ...s, headphones: true })).toEqual({ ms: DEFAULT_HEADPHONE_LATENCY, calibrated: false });
    const cal = { ...s, inputLatencyMs: { speaker: 140, headphones: 260 } };
    expect(followConfig(cal, 440).latencyMs).toBe(140);
    expect(followConfig({ ...cal, headphones: true }, 440).latencyMs).toBe(260);
  });

  it("Spielerin 150 ms zu spät bei Standard-Verzögerung: alles grün (♩ = 100, Achtel)", () => {
    const tl = melody();
    const r = run(tl, beatFrames(tl, { spq: 0.6, late: 150 }), 0.6);
    expect(r.map((x) => x?.ok)).toEqual(Array(tl.tones.length).fill(true));
  });

  it("Gerät verzögert 250 ms mehr: ohne Abgleich rot, nach Abgleich (370 ms) grün", () => {
    const tl = melody();
    const fs = beatFrames(tl, { spq: 0.6, device: DEFAULT_INPUT_LATENCY + 250 });
    const before = run(tl, fs, 0.6);
    expect(before.filter((x) => !x?.ok).length).toBeGreaterThan(3);
    const after = run(tl, fs, 0.6, { latencyMs: DEFAULT_INPUT_LATENCY + 250 });
    expect(after.map((x) => x?.ok)).toEqual(Array(tl.tones.length).fill(true));
  });

  it("unklare Einschwing-Frames (70 ms) zählen nicht gegen die Note: alles grün", () => {
    const tl = melody();
    const r = run(tl, beatFrames(tl, { spq: 0.6, chiff: 70 }), 0.6);
    expect(r.map((x) => x?.ok)).toEqual(Array(tl.tones.length).fill(true));
  });

  it("wirklich falscher Ton: rot mit Grund „anderer Ton“; gar nichts gespielt: rot mit Grund „nichts“", () => {
    const tl = melody();
    // Note 6 (h¹, Viertel 4–4,5) nicht gespielt
    const from = START + DEFAULT_INPUT_LATENCY + 4 * 600;
    const fs = beatFrames(tl, { spq: 0.6, wrong: { 1: C2, 4: G } }).map((f) =>
      f.t >= from && f.t < from + 300 ? { t: f.t, freq: null, clarity: 0, rms: 0.001 } : f,
    );
    const r = run(tl, fs, 0.6);
    expect(r[1]).toMatchObject({ ok: false, reason: "anderer-ton", otherMidi: C2 });
    expect(r[4]).toMatchObject({ ok: false, reason: "anderer-ton", otherMidi: G });
    expect(r[6]).toMatchObject({ ok: false, reason: "nichts" });
    expect(r.filter((x) => !x?.ok).length).toBe(3);
  });

  it("Ergebnis je Note nennt Einsatz-Versatz und mittlere Abweichung (für die Diagnose)", () => {
    const tl = melody();
    const r = run(tl, beatFrames(tl, { spq: 0.6, late: 60, cents: () => -20 }), 0.6);
    for (const x of r) {
      expect(x!.onsetMs).toBeGreaterThanOrEqual(50);
      expect(x!.onsetMs).toBeLessThanOrEqual(90);
      expect(x!.cents).toBe(-20);
    }
  });
});

// ---------------------------------------------------------------- Metronom-Klicks

describe("Metronom-Klicks aus dem Lautsprecher zählen nicht als Ton", () => {
  it("ClickFilter: höchstens zwei Frames auf Klick-Höhe → unklar; ein längerer Ton dort geht durch", () => {
    const f = new ClickFilter(DEFAULT_FOLLOW);
    const fr = (t: number, freq: number | null): Frame => ({ t, freq, clarity: freq ? 0.99 : 0, rms: 0.05 });
    const out = [fr(0, null), fr(25, CLICK_FREQ), fr(50, CLICK_FREQ), fr(75, null)].flatMap((x) => f.push(x));
    expect(out.map((x) => x.freq)).toEqual([null, null, null, null]);
    expect(out.filter((x) => (x as { click?: boolean }).click).length).toBe(2);
    const long = [25, 50, 75, 100].map((t) => fr(t, hz(75))).flatMap((x) => f.push(x)); // es² der Flöte, 100 ms
    expect(long.map((x) => x.freq)).toEqual([hz(75), hz(75), hz(75), hz(75)]);
  });

  it("Takt-Modus: Klicks auf jedem Schlag in Pausen machen eine es²-Note nicht grün; gespielt wird sie grün", () => {
    const tl = buildTimeline(song("g'4 es''4 g'4 r4 ||"));
    const spq = 0.5;
    const clicks = (fs: Frame[]) =>
      fs.map((f) => {
        const s = (f.t - START - DEFAULT_INPUT_LATENCY) % (spq * 1000);
        const onBeat = f.t >= START && s >= 0 && s < 50;
        if (!onBeat || f.freq !== null) return f;
        const beat = Math.round((f.t - START - DEFAULT_INPUT_LATENCY) / (spq * 1000));
        return { ...f, freq: beat % 4 === 0 ? CLICK_ACCENT_FREQ : CLICK_FREQ, clarity: 0.99, rms: 0.05 };
      });
    const silentEs = beatFrames(tl, { spq }).map((f) => (f.freq !== null && Math.abs(f.freq - hz(75)) < 5 ? { ...f, freq: null, clarity: 0, rms: 0.001 } : f));
    const b = new BeatFollower(tl, { secPerQuarter: spq, startMs: START });
    feed(b, clicks(silentEs));
    b.finish(START + 4000);
    expect(b.passResults[0].map((r) => r?.ok)).toEqual([true, false, true]);
    const played = new BeatFollower(tl, { secPerQuarter: spq, startMs: START });
    feed(played, clicks(beatFrames(tl, { spq })));
    played.finish(START + 4000);
    expect(played.passResults[0].map((r) => r?.ok)).toEqual([true, true, true]);
  });
});
