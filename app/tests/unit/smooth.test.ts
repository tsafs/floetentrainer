import { describe, expect, it } from "vitest";
import { DEFAULT_FOLLOW } from "../../src/audio/follow";
import { DEFAULT_JUDGE, type Frame } from "../../src/audio/judge";
import { DEFAULT_SMOOTH, NameHold, pitched, Smoother, TUNER_SMOOTH, type SmoothConfig } from "../../src/audio/smooth";
import { freqToWrittenMidi, soundingFreq } from "../../src/music/notes";
import { seeded } from "./helpers";

const STEP = 25;
/** klingende Frequenz zu einer notierten MIDI-Nummer, ggf. mit Cent-Abweichung */
const hz = (midi: number, cents = 0) => soundingFreq(midi) * Math.pow(2, cents / 1200);
const FIS1 = 66;
const G1 = 67;
const A1 = 69;

/**
 * Gehaltener Ton von t0 bis t1: Abweichung in Cent je Zeitpunkt (Vibrato, Rauschen, Ausreißer).
 * Klarheit 0,95, Lautstärke 0,1.
 */
function held(midi: number, t0: number, t1: number, cents: (t: number, k: number) => number = () => 0): Frame[] {
  const out: Frame[] = [];
  for (let t = t0, k = 0; t < t1; t += STEP, k++) out.push({ t, freq: hz(midi, cents(t, k)), clarity: 0.95, rms: 0.1 });
  return out;
}
const silent = (t0: number, t1: number): Frame[] => {
  const out: Frame[] = [];
  for (let t = t0; t < t1; t += STEP) out.push({ t, freq: null, clarity: 0, rms: 0.001 });
  return out;
};

/** Alle Frames durch einen Glätter schicken (samt flush am Ende); Ausgabe mit dem Index des Eingangs-Frames, bei dem sie herauskam */
function run(fs: Frame[], cfg: Partial<SmoothConfig> = {}): { f: Frame; at: number }[] {
  const s = new Smoother(cfg);
  const out: { f: Frame; at: number }[] = [];
  fs.forEach((f, i) => {
    const o = s.push(f);
    if (o) out.push({ f: o, at: i });
  });
  for (const f of s.flush()) out.push({ f, at: fs.length });
  return out;
}

/** Abweichung in Cent vom Ton midi (null ohne Ton) */
const centsOf = (f: Frame, midi: number) => (f.freq === null ? null : (freqToWrittenMidi(f.freq) - midi) * 100);
const spread = (xs: number[]) => {
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length);
};

describe("Glätter", () => {
  it("Klarheit und Bereich wie beim Spielen", () => {
    expect([DEFAULT_SMOOTH.minClarity, DEFAULT_SMOOTH.minFreq, DEFAULT_SMOOTH.maxFreq]).toEqual([
      DEFAULT_JUDGE.minClarity,
      DEFAULT_JUDGE.minFreq,
      DEFAULT_JUDGE.maxFreq,
    ]);
    expect(DEFAULT_JUDGE.medianFrames).toBe(5);
    expect(DEFAULT_FOLLOW.medianFrames).toBe(3);
    expect(DEFAULT_FOLLOW.tauMs).toBe(0);
  });

  it("Vibrato und Rauschen (±25 Cent): Anzeige deutlich ruhiger", () => {
    const rnd = seeded(3);
    // Vibrato 5 Hz ±15 Cent und Rauschen ±10 Cent, zusammen bis ±25 Cent
    const fs = held(A1, 0, 4000, (t) => 15 * Math.sin((2 * Math.PI * 5 * t) / 1000) + (rnd() * 2 - 1) * 10);
    const raw = fs.map((f) => centsOf(f, A1)!).slice(20);
    const tuner = run(fs, TUNER_SMOOTH).map((o) => centsOf(o.f, A1)!).slice(20);
    const knapp = run(fs, { medianFrames: 3 }).map((o) => centsOf(o.f, A1)!).slice(20);
    expect(Math.max(...raw.map(Math.abs))).toBeGreaterThan(20);
    // Stimmgerät: Streuung auf unter ein Viertel, nie mehr als 10 Cent daneben
    expect(spread(tuner)).toBeLessThan(spread(raw) / 4);
    expect(Math.max(...tuner.map(Math.abs))).toBeLessThan(10);
    // knapp (nur Median über 3): etwas ruhiger, aber nicht verschliffen
    expect(spread(knapp)).toBeLessThan(spread(raw));
  });

  it("Vibrato 5 Hz ±30 Cent: im Stimmgerät nur noch etwa ±5 Cent", () => {
    const fs = held(A1, 0, 3000, (t) => 30 * Math.sin((2 * Math.PI * 5 * t) / 1000));
    const out = run(fs, TUNER_SMOOTH).map((o) => centsOf(o.f, A1)!).slice(40);
    expect(Math.max(...out.map(Math.abs))).toBeLessThan(8);
  });

  it("einzelne Oktav-Ausreißer verschwinden (statt gemittelt zu werden)", () => {
    // jeder 10. Frame eine Oktave höher, dazu einmal zwei in Folge
    const fs = held(G1, 0, 2000, (_t, k) => (k % 10 === 3 || k === 47 || k === 48 ? 1200 : 0));
    for (const cfg of [{ medianFrames: 3 }, {}, TUNER_SMOOTH]) {
      const out = run(fs, cfg);
      const off = out.filter((o) => Math.abs(centsOf(o.f, G1)!) > 1);
      // Median über 3 lässt nur das Paar durch, Median über 5 auch das nicht
      if (cfg.medianFrames === 3) expect(off.map((o) => o.f.t)).toEqual([1175, 1200]);
      else expect(off).toEqual([]);
    }
  });

  it("Tonwechsel wird schnell übernommen und bleibt an seiner Stelle", () => {
    const fs = [...held(G1, 0, 500), ...held(A1, 500, 1000)];
    // knapp: der erste a¹-Frame kommt 25 ms später heraus, mit seinem eigenen Zeitpunkt
    const knapp = run(fs, DEFAULT_FOLLOW);
    const first = knapp.find((o) => Math.round(freqToWrittenMidi(o.f.freq!)) === A1)!;
    expect(first.f.t).toBe(500);
    expect(fs[first.at].t - 500).toBeLessThan(80);
    expect(fs[first.at].t - 500).toBe(25);
    // alle Frames vor dem Wechsel bleiben g¹
    expect(knapp.filter((o) => o.f.t < 500).every((o) => Math.round(freqToWrittenMidi(o.f.freq!)) === G1)).toBe(true);
    // Stimmgerät: springt trotz Zeitkonstante sofort ganz auf a¹ (kein Gleiten), 50 ms später
    const tuner = run(fs, TUNER_SMOOTH);
    const at = tuner.find((o) => o.f.t === 500)!;
    expect(Math.abs(centsOf(at.f, A1)!)).toBeLessThan(0.5);
    expect(fs[at.at].t - 500).toBe(50);
  });

  it("Stille setzt zurück: kein Gleiten vom vorigen Ton, kein Median über die Pause", () => {
    // a¹, 50 ms Stille, a¹ +60 Cent (unter der Sprungschwelle von 70 Cent)
    const fs = [...held(A1, 0, 500), ...silent(500, 550), ...held(A1, 550, 900, () => 60)];
    const out = run(fs, TUNER_SMOOTH);
    const after = out.find((o) => o.f.t === 550)!;
    expect(centsOf(after.f, A1)).toBeCloseTo(60, 6);
    // ohne Stille gleitet derselbe Wechsel (Zeitkonstante)
    const glide = run([...held(A1, 0, 500), ...held(A1, 500, 900, () => 60)], TUNER_SMOOTH);
    expect(centsOf(glide.find((o) => o.f.t === 500)!.f, A1)).toBeLessThan(30);
    // ein einzelner Aussetzer (25 ms) ist kein Neubeginn
    const one = run([...held(A1, 0, 500), ...silent(500, 525), ...held(A1, 525, 900, () => 60)], TUNER_SMOOTH);
    expect(centsOf(one.find((o) => o.f.t === 525)!.f, A1)).toBeLessThan(30);
    // Median greift nicht über die Pause: g¹, Stille, ein a¹-Frame zwischen lauter g¹ danach bleibt nicht hängen
    const m = run([...held(A1, 0, 300), ...silent(300, 350), ...held(G1, 350, 600)], DEFAULT_SMOOTH);
    expect(m.filter((o) => o.f.t >= 350).every((o) => Math.round(freqToWrittenMidi(o.f.freq!)) === G1)).toBe(true);
  });

  it("Stille, unklare Frames und Lautstärke gehen unverändert und in derselben Reihenfolge durch", () => {
    const fs: Frame[] = [
      ...held(G1, 0, 200),
      { t: 200, freq: hz(G1), clarity: 0.6, rms: 0.05 }, // unklar: bleibt „kein Ton“
      { t: 225, freq: null, clarity: 0, rms: 0.002 },
      ...held(G1, 250, 400).map((f, i) => ({ ...f, rms: 0.02 + i * 0.01 })),
      { t: 400, freq: 300, clarity: 0.99, rms: 0.1 }, // außerhalb des Bereichs
    ];
    const out = run(fs).map((o) => o.f);
    expect(out.map((f) => f.t)).toEqual(fs.map((f) => f.t));
    expect(out.map((f) => f.rms)).toEqual(fs.map((f) => f.rms));
    expect(out.map((f) => f.clarity)).toEqual(fs.map((f) => f.clarity));
    expect(out[8]).toEqual(fs[8]);
    expect(out[9]).toEqual(fs[9]);
    expect(out[out.length - 1]).toEqual(fs[fs.length - 1]);
    expect(out.filter((f) => pitched(DEFAULT_SMOOTH, f)).length).toBe(fs.filter((f) => pitched(DEFAULT_SMOOTH, f)).length);
  });

  describe("Einzelaussetzer überbrücken", () => {
    /** g¹ mit jedem 6. Frame ohne gültigen Ton (unklar, zu leise, über 2300 Hz – abwechselnd) */
    const gappy = (n = 2, midi = G1) =>
      held(midi, 0, 1500).map((f, k) => {
        if (k % 6 < 6 - n) return f;
        const kind = Math.floor(k / 6) % 3;
        return kind === 0 ? { ...f, clarity: 0.6 } : kind === 1 ? { ...f, freq: null, clarity: 0, rms: 0.004 } : { ...f, freq: 2400 };
      });

    it("ein einzelner unklarer, zu leiser oder zu hoher Frame bekommt den Ton der Nachbarn", () => {
      for (const cfg of [DEFAULT_FOLLOW, {}, TUNER_SMOOTH]) {
        const fs = gappy(1);
        const out = run(fs, cfg).map((o) => o.f);
        // alle bis auf den letzten (dem fehlt der Nachfolger) mit Ton
        expect(out.slice(0, -1).every((f) => pitched(DEFAULT_SMOOTH, f))).toBe(true);
        const filled = out.filter((f) => f.filled);
        expect(filled.length).toBe(Math.floor(fs.length / 6) - 1);
        expect(filled.every((f) => Math.abs(centsOf(f, G1)!) < 1 && f.clarity === 0.95)).toBe(true);
        // Zeitpunkt und Lautstärke bleiben die des Aussetzers
        expect(out.map((f) => [f.t, f.rms])).toEqual(fs.map((f) => [f.t, f.rms]));
      }
    });

    it("zwei Aussetzer in Folge (≥ 50 ms) bleiben Stille", () => {
      for (const cfg of [DEFAULT_FOLLOW, {}, TUNER_SMOOTH]) {
        const out = run(gappy(2), cfg).map((o) => o.f);
        expect(out.some((f) => f.filled)).toBe(false);
        expect(out.filter((f) => !pitched(DEFAULT_SMOOTH, f)).length).toBe(2 * Math.floor(out.length / 6));
      }
    });

    it("kein Überbrücken bei einem Tonwechsel in der Lücke oder ohne Median", () => {
      const fs = [...held(G1, 0, 200), { t: 200, freq: null, clarity: 0 }, ...held(A1, 225, 400)];
      expect(run(fs, DEFAULT_FOLLOW).find((o) => o.f.t === 200)!.f).toEqual(fs[8]);
      const one = [...held(G1, 0, 200), { t: 200, freq: null, clarity: 0 }, ...held(G1, 225, 400)];
      expect(run(one, { medianFrames: 1 }).find((o) => o.f.t === 200)!.f).toEqual(one[8]);
    });
  });

  it("Ausgabe um den halben Median verzögert; ohne Median und Zeitkonstante unverändert", () => {
    expect(new Smoother({ medianFrames: 5 }).lag).toBe(2);
    expect(new Smoother({ medianFrames: 3 }).lag).toBe(1);
    const fs = held(G1, 0, 300, (_t, k) => (k % 2 ? 20 : -20));
    expect(run(fs, { medianFrames: 1 }).map((o) => o.f)).toEqual(fs);
  });
});

describe("Notenname mit Hysterese", () => {
  it("ein Ton genau zwischen zwei Halbtönen flackert nicht", () => {
    const n = new NameHold();
    const shown = new Set<number | null>();
    // fis¹ +50 Cent mit ±8 Cent Schwankung, Frame für Frame hin und her
    for (let t = 0, k = 0; t < 2000; t += STEP, k++) shown.add(n.push(FIS1 + 0.5 + (k % 2 ? 0.08 : -0.08), t));
    expect(shown.size).toBe(1);
  });

  it("wechselt nach 100 ms am neuen Ton oder sofort über 60 Cent", () => {
    const n = new NameHold();
    expect(n.push(FIS1 + 0.1, 0)).toBe(FIS1);
    // 55 Cent über fis¹ = g¹ −45 Cent: erst nach 100 ms
    let t = 25;
    for (; t < 125; t += STEP) expect(n.push(FIS1 + 0.55, t)).toBe(FIS1);
    expect(n.push(FIS1 + 0.55, t)).toBe(G1);
    // zurück: 65 Cent unter g¹ ist mehr als 60 → sofort
    expect(n.push(G1 - 0.65, t + 25)).toBe(FIS1);
    // ein klarer Tonwechsel gilt sofort
    expect(n.push(A1, t + 50)).toBe(A1);
  });

  it("das Abwarten beginnt neu, wenn der Ton zwischendurch zurückkommt", () => {
    const n = new NameHold();
    n.push(FIS1, 0);
    for (let t = 25; t < 1000; t += STEP) {
      // 75 ms knapp über der Mitte, 25 ms darunter
      expect(n.push(FIS1 + ((t / STEP) % 4 === 0 ? 0.45 : 0.55), t)).toBe(FIS1);
    }
  });

  it("nach Stille gilt der nächste Ton sofort (Stille gemessen bis zum nächsten Ton)", () => {
    const n = new NameHold();
    n.push(FIS1, 0);
    n.push(null, 25);
    expect(n.push(FIS1 + 0.55, 50)).toBe(FIS1); // ein Aussetzer: Hysterese bleibt
    n.push(null, 75);
    n.push(null, 100);
    n.push(null, 125);
    expect(n.midi).toBeNull();
    expect(n.push(FIS1 + 0.55, 150)).toBe(G1);
    // zwei Aussetzer (25 + 25 ms bis zum nächsten Ton) reichen auch
    const n2 = new NameHold();
    n2.push(FIS1, 0);
    n2.push(null, 25);
    n2.push(null, 50);
    expect(n2.push(FIS1 + 0.55, 75)).toBe(G1);
  });

  it("Stimmgerät: Einzelaussetzer lassen den Namen stehen, erst Stille ab 50 ms setzt ihn zurück", () => {
    // fis¹ +55 Cent (Name hängt an der Hysterese), jeder 6. Frame unklar
    const fs = held(FIS1, 0, 2000, () => 55).map((f, k) => (k % 6 === 5 ? { ...f, clarity: 0.5 } : f));
    const names = new NameHold();
    names.push(FIS1, -25); // bisher angezeigt: fis¹
    const shown = new Set<number | null>();
    for (const { f } of run(fs, TUNER_SMOOTH)) shown.add(names.push(pitched(DEFAULT_SMOOTH, f) ? freqToWrittenMidi(f.freq!) : null, f.t));
    // die Hysterese läuft durch, nach 100 ms gilt g¹ – und bleibt dann stehen
    expect([...shown]).toEqual([FIS1, G1]);
    // zwei Aussetzer in Folge (50 ms) sind Stille: danach gilt der neue Ton sofort, ohne Hysterese
    const gaps = held(FIS1, 0, 2000, () => 55).map((f, k) => (k % 6 >= 4 ? { ...f, clarity: 0.5 } : f));
    const n2 = new NameHold();
    n2.push(FIS1, -25);
    const at = new Map<number, number | null>();
    for (const { f } of run(gaps, TUNER_SMOOTH)) at.set(f.t, n2.push(pitched(DEFAULT_SMOOTH, f) ? freqToWrittenMidi(f.freq!) : null, f.t));
    expect(at.get(75)).toBe(FIS1); // vor der Lücke: Hysterese hält fis¹ (erst 75 ms g¹)
    expect(at.get(150)).toBe(G1); // erster Ton nach der Lücke: sofort
  });

  it("Stimmgerät: wackelnder Ton mit Ausreißern lässt den Namen nicht flackern", () => {
    const rnd = seeded(11);
    // fis¹ +20 Cent, Vibrato ±30 Cent (Spitzen bei +50), dazu Rauschen und einzelne Oktav-Ausreißer
    const fs = held(FIS1, 0, 3000, (t, k) =>
      k % 9 === 4 ? 1200 : 20 + 30 * Math.sin((2 * Math.PI * 5 * t) / 1000) + (rnd() * 2 - 1) * 8,
    );
    const names = new NameHold();
    const shown = new Set<number | null>();
    for (const { f } of run(fs, TUNER_SMOOTH)) shown.add(names.push(freqToWrittenMidi(f.freq!), f.t));
    expect([...shown]).toEqual([FIS1]);
    // roh (ohne Glättung und Hysterese) sprang die Anzeige zwischen fis¹, g¹ und fis²
    const rawNames = new Set(fs.map((f) => Math.round(freqToWrittenMidi(f.freq!))));
    expect(rawNames.size).toBe(3);
  });
});
