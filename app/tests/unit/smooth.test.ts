import { describe, expect, it } from "vitest";
import { DEFAULT_FOLLOW } from "../../src/audio/follow";
import { DEFAULT_JUDGE, type Frame } from "../../src/audio/judge";
import { DEFAULT_SMOOTH, NameHold, pitched, Smoother, TUNER_SMOOTH, type SmoothConfig, type SmoothedFrame } from "../../src/audio/smooth";
import { freqToWrittenMidi, soundingFreq } from "../../src/music/notes";
import { seeded } from "./helpers";
import { A, fastChanges, G, H, UP_DOWN, type Played } from "./transition-helpers";

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

  it("wechselt knapp an der Mitte nach 100 ms, bei einem klaren Wechsel (über 60 Cent) nach drei Frames", () => {
    const n = new NameHold();
    expect(n.push(FIS1 + 0.1, 0)).toBe(FIS1);
    // 55 Cent über fis¹ = g¹ −45 Cent: erst nach 100 ms
    let t = 25;
    for (; t < 125; t += STEP) expect(n.push(FIS1 + 0.55, t)).toBe(FIS1);
    expect(n.push(FIS1 + 0.55, t)).toBe(G1);
    // zurück: 65 Cent unter g¹ ist mehr als 60 → nach 50 ms (drei Frames), nicht mehr sofort
    t += STEP;
    expect(n.push(G1 - 0.65, t)).toBe(G1);
    expect(n.pending).toBe(true);
    expect(n.push(G1 - 0.65, t + 25)).toBe(G1);
    expect(n.push(G1 - 0.65, t + 50)).toBe(FIS1);
    expect(n.pending).toBe(false);
    // ein klarer Tonwechsel ebenso: der erste und zweite Frame auf a¹ lassen fis¹ stehen, der dritte gilt
    t += 75;
    expect(n.push(A1, t)).toBe(FIS1);
    expect(n.push(A1, t + 25)).toBe(FIS1);
    expect(n.push(A1, t + 50)).toBe(A1);
    // ein einzelner Zwischenwert (auch zwei verschiedene in Folge) setzt sich nie durch
    expect(n.push(A1 + 1.1, t + 75)).toBe(A1);
    expect(n.push(A1 + 1.6, t + 100)).toBe(A1);
    expect(n.push(A1, t + 125)).toBe(A1);
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

describe("schneller Tonwechsel mit Übergangswerten (Rückmeldung: „GIS zwischen G und A“)", () => {
  /** Wie das Stimmgerät (../../src/ui/tuner.ts): angezeigter Name und Cent je Frame (ohne die abgewarteten) */
  function tuner(fs: Frame[], smooth: Partial<SmoothConfig> = TUNER_SMOOTH, hold = {}) {
    const s = new Smoother(smooth);
    const names = new NameHold(hold);
    const shown: { t: number; midi: number; cents: number }[] = [];
    const take = (f: Frame) => {
      const m = pitched(s.cfg, f) ? freqToWrittenMidi(f.freq) : null;
      const midi = names.push(m, f.t);
      if (m === null || midi === null || names.pending) return;
      shown.push({ t: f.t, midi, cents: (m - midi) * 100 });
    };
    fs.forEach((f) => {
      const o = s.push(f);
      if (o) take(o);
    });
    s.flush().forEach(take);
    return shown;
  }
  /** Folge der angezeigten Namen (aufeinanderfolgende gleiche zusammengefasst) */
  const sequence = (xs: { midi: number }[]) => xs.map((x) => x.midi).filter((m, i, a) => i === 0 || m !== a[i - 1]);
  const played = (p: Played) => p.onsets.map((o) => o.midi);

  it("Stimmgerät: g¹–a¹–h¹–a¹–g¹ bei 6–10 Tönen je Sekunde zeigt nur g¹, a¹, h¹ – in der gespielten Reihenfolge", () => {
    for (const rate of [6, 7, 8, 9, 10]) {
      for (const seed of [1, 2, 3]) {
        const p = fastChanges(UP_DOWN, rate, { seed });
        const shown = tuner(p.frames);
        expect(new Set(shown.map((x) => x.midi)), `${rate} Töne/s`).toEqual(new Set([G, A, H]));
        // jeder gespielte Ton erscheint, keiner dazwischen
        expect(sequence(shown), `${rate} Töne/s`).toEqual(played(p));
        // Zeiger und Cent werden nicht von Übergangswerten gezogen
        expect(Math.max(...shown.map((x) => Math.abs(x.cents))), `${rate} Töne/s`).toBeLessThan(1);
      }
    }
  });

  it("Stimmgerät: auch abwärts (h¹–a¹–g¹) und mit Vibrato ±30 Cent keine Zwischennamen", () => {
    const vib = (t: number) => 30 * Math.sin((2 * Math.PI * 5 * t) / 1000);
    for (const rate of [6, 8, 10]) {
      const down = fastChanges([H, A, G], rate);
      expect(sequence(tuner(down.frames))).toEqual(played(down));
      const p = fastChanges(UP_DOWN, rate, { cents: vib });
      const shown = tuner(p.frames);
      expect(sequence(shown), `${rate} Töne/s`).toEqual(played(p));
      // Zeiger nur im Bereich des Vibratos (geglättet)
      expect(Math.max(...shown.map((x) => Math.abs(x.cents)))).toBeLessThan(31);
    }
  });

  it("früher (ohne Stabilitätsprüfung, Name sofort bei über 60 Cent) erschienen gis¹ und b¹", () => {
    const p = fastChanges(UP_DOWN, 8);
    const old = tuner(p.frames, { ...TUNER_SMOOTH, stableCents: 0 }, { switchMs: 0 });
    const names = new Set(old.map((x) => x.midi));
    expect(names.has(G + 1) || names.has(A + 1)).toBe(true);
    // Die Namensregel allein reicht nicht: Die Zeitkonstante zieht den Wert vom Übergangswert nur
    // langsam zum neuen Ton, so liegt er mehrere Frames auf gis¹. Die Stabilitätsprüfung allein schon.
    expect(new Set(tuner(p.frames, { ...TUNER_SMOOTH, stableCents: 0 }).map((x) => x.midi)).has(G + 1)).toBe(true);
    expect(new Set(tuner(p.frames, TUNER_SMOOTH, { switchMs: 0 }).map((x) => x.midi))).toEqual(new Set([G, A, H]));
  });

  it("Übergangswerte kommen aus dem Glätter als „kein Ton“; echte Töne behalten Zeitpunkt und Verzögerung", () => {
    for (const cfg of [DEFAULT_FOLLOW, {}, TUNER_SMOOTH]) {
      const p = fastChanges(UP_DOWN, 8);
      const out = run(p.frames, cfg);
      const at = new Map(out.map((o) => [o.f.t, o]));
      for (const t of p.transitions) {
        expect(at.get(t)!.f.freq).toBeNull();
        expect((at.get(t)!.f as SmoothedFrame).unstable).toBe(true);
      }
      // jeder echte Ton ist ab seinem ersten Frame da, mit seinem eigenen Zeitpunkt; Ausgabe nur um den
      // halben Median später (wie ohne Übergangswerte, kein zusätzlicher Frame)
      const lag = new Smoother(cfg).lag;
      for (const o of p.onsets) {
        const x = at.get(o.t)!;
        expect(Math.round(freqToWrittenMidi(x.f.freq!))).toBe(o.midi);
        expect(p.frames[x.at].t - o.t).toBe(lag * STEP);
      }
      // alle übrigen Frames tragen genau ihren Ton
      const tr = new Set(p.transitions);
      expect(out.filter((o) => !tr.has(o.f.t)).every((o) => o.f.freq !== null && Math.abs(centsOf(o.f, Math.round(freqToWrittenMidi(o.f.freq)))!) < 1)).toBe(true);
    }
  });

  it("Stimmgerät: ein echter Tonwechsel erscheint zwei Frames nach seinem ersten Frame", () => {
    const p = fastChanges(UP_DOWN, 8);
    const shown = tuner(p.frames);
    for (const o of p.onsets.slice(1)) {
      const first = shown.find((x) => x.t >= o.t && x.midi === o.midi)!;
      expect(first.t - o.t).toBe(2 * STEP);
    }
  });

  it("Vibrato ±30 Cent (5 Hz) besteht die Stabilitätsprüfung: kein Frame fällt heraus", () => {
    const fs = held(A1, 0, 3000, (t) => 30 * Math.sin((2 * Math.PI * 5 * t) / 1000));
    for (const cfg of [DEFAULT_FOLLOW, {}, TUNER_SMOOTH]) {
      const out = run(fs, cfg).map((o) => o.f as SmoothedFrame);
      expect(out.every((f) => f.freq !== null && !f.unstable && !f.filled)).toBe(true);
    }
    // ein einzelner Oktav-Ausreißer ist unstet und wird überbrückt (wie ein Aussetzer)
    const one = held(A1, 0, 500, (_t, k) => (k === 10 ? 1200 : 0));
    const f = run(one, DEFAULT_FOLLOW).find((o) => o.f.t === 250)!.f;
    expect(f.filled).toBe(true);
    expect(Math.abs(centsOf(f, A1)!)).toBeLessThan(1);
  });
});
