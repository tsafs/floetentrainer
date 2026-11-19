// Synthetischer Blockflötenklang als Samples, für Tests der Messung (../../src/audio/analyze.ts) und der
// Wertung auf echten Messwerten statt erfundener Frames. Klang wie die Mikrofon-Attrappe der Browser-Tests
// (tests/e2e/util.ts, flute()): Grundton mit schwachen Obertönen, dazu Rauschen (Atem).
//
// Je Ton einstellbar:
// - Einsatz mit der Zunge: kurze Lücke davor (gapMs) und ein Einschwingen (attackMs) mit Rauschstoß;
// - legato (gapMs 0): Fingerwechsel als kurze Überblendung (xfadeMs);
// - Überblasen am Anfang (overblowMs): die ersten ms klingt die Oktave darüber – so klingt ein tiefer Ton,
//   wenn noch mit dem Luftdruck des hohen Tons davor geblasen wird;
// - cents: Abweichung, vibrato (Cent, 5 Hz).
import { COARSE_MS, FINE_HOP, FrameMaker, MIN_RMS } from "../../src/audio/analyze";
import { Mpm } from "../../src/audio/mpm";
import type { Frame } from "../../src/audio/judge";
import { soundingFreq } from "../../src/music/notes";
import { seeded } from "./helpers";

export const SR = 48000;
const HARM = [1, 0.1, 0.06, 0.02, 0.01];

export interface SynthNote {
  /** notierte MIDI-Nummer oder null für Pause */
  midi: number | null;
  ms: number;
  cents?: number;
  vibrato?: number;
  /** Lücke vor dem Ton (Zungenstoß), Standard 25 ms; 0 = gebunden */
  gapMs?: number;
  attackMs?: number;
  overblowMs?: number;
  /** Lautstärke (Amplitude des Grundtons), Standard 0,2 */
  amp?: number;
  /** Tonhöhe beim Einsatz um so viele Cent daneben, gleitet in bendMs auf den Ton (Standard 0 / 40 ms) */
  bendCents?: number;
  bendMs?: number;
  /** Einsatz so viele ms früher (−) oder später (+) als im Zeitplan (Spielerin ungenau) */
  shiftMs?: number;
}

export interface SynthOptions {
  sr?: number;
  /** Effektivwert des Rauschens relativ zur Amplitude, Standard 0,03 */
  noise?: number;
  xfadeMs?: number;
  seed?: number;
  /** Stille am Anfang und Ende */
  padMs?: number;
  /** Nachhall des Raums: Anteil (0–1) und Nachhallzeit RT60 in ms */
  reverb?: number;
  rt60?: number;
  /** stärkere Obertöne (tiefe Töne einer günstigen Flöte): Faktor auf die Obertöne */
  harmonics?: number;
}

/** Rendert die Töne; gibt Samples und die Sollzeiten (ms) je Ton zurück. */
export function renderFlute(notes: SynthNote[], o: SynthOptions = {}): { x: Float32Array; sr: number; starts: number[] } {
  const sr = o.sr ?? SR;
  const pad = o.padMs ?? 300;
  const rnd = seeded(o.seed ?? 3);
  const total = pad * 2 + notes.reduce((s, n) => s + n.ms, 0);
  const x = new Float32Array(Math.ceil((total / 1000) * sr));
  const xfade = ((o.xfadeMs ?? 12) / 1000) * sr;
  const noise = o.noise ?? 0.03;
  const starts: number[] = [];
  let t = pad;
  let phase = 0;
  for (let k = 0; k < notes.length; k++) {
    const n = notes[k];
    starts.push(t);
    const shift = n.shiftMs ?? 0;
    const nextShift = notes[k + 1]?.shiftMs ?? 0;
    const i0 = Math.round(((t + shift) / 1000) * sr);
    const i1 = Math.round(((t + n.ms + nextShift) / 1000) * sr);
    t += n.ms;
    if (n.midi === null) continue;
    const gap = ((n.gapMs ?? 25) / 1000) * sr;
    const att = ((n.attackMs ?? 15) / 1000) * sr;
    const ob = ((n.overblowMs ?? 0) / 1000) * sr;
    const amp = n.amp ?? 0.2;
    const f0 = soundingFreq(n.midi) * Math.pow(2, (n.cents ?? 0) / 1200);
    const prev = notes[k - 1];
    const legato = gap === 0 && prev && prev.midi !== null;
    const fPrev = legato ? soundingFreq(prev.midi!) * Math.pow(2, (prev.cents ?? 0) / 1200) : f0;
    for (let i = i0; i < i1 && i < x.length; i++) {
      const j = i - i0;
      let env: number;
      if (legato) env = 1;
      else if (j < gap) env = 0;
      else env = Math.min(1, (j - gap) / Math.max(1, att));
      // Ausklingen am Ende nur, wenn danach eine Lücke kommt (sonst übernimmt der nächste Ton)
      let f = j < gap + ob ? 2 * f0 : f0;
      if (legato && j < xfade) f = fPrev * Math.pow(f0 / fPrev, j / xfade);
      const bendLen = ((n.bendMs ?? 40) / 1000) * sr;
      if (n.bendCents && j < gap + bendLen) f *= Math.pow(2, (n.bendCents * (1 - Math.max(0, j - gap) / bendLen)) / 1200);
      if (n.vibrato) f *= Math.pow(2, (n.vibrato * Math.sin((2 * Math.PI * 5 * i) / sr)) / 1200);
      phase += (2 * Math.PI * f) / sr;
      let s = 0;
      const hf = o.harmonics ?? 1;
      for (let h = 0; h < HARM.length; h++) s += (h ? hf : 1) * HARM[h] * Math.sin((h + 1) * phase);
      // Rauschstoß beim Einschwingen („Chiff“)
      const chiff = !legato && j >= gap && j < gap + att ? 4 : 1;
      s = amp * env * s + (env > 0 ? amp * noise * chiff * (rnd() * 2 - 1) * Math.sqrt(3) : 0);
      x[i] = s;
    }
  }
  if (o.reverb) addReverb(x, sr, o.reverb, o.rt60 ?? 400, rnd);
  return { x, sr, starts };
}

/** Nachhall: vier parallele Kammfilter mit Rückkopplung (Schroeder), Abklingen nach RT60 */
function addReverb(x: Float32Array, sr: number, wet: number, rt60: number, _rnd: () => number): void {
  const dry = x.slice();
  const delays = [29.7, 37.1, 41.1, 43.7].map((ms) => Math.round((ms / 1000) * sr));
  for (const d of delays) {
    const g = Math.pow(10, (-3 * d) / ((rt60 / 1000) * sr));
    const y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) y[i] = dry[i] + (i >= d ? g * y[i - d] : 0);
    for (let i = 0; i < x.length; i++) x[i] += (wet / delays.length) * (y[i] - dry[i]) * 2;
  }
}

/**
 * Misst wie früher die App (setInterval alle 25 ms + AnalyserNode): Der Zeitgeber kommt ungleichmäßig
 * (jitterMs), manchmal hängt der Hauptthread (stall: Wahrscheinlichkeit je Messung, Dauer stallMs);
 * gemessen wird das jüngste Fenster bis zum letzten fertigen 128er-Block, Zeit = Aufrufzeit.
 */
export function measurePolled(x: Float32Array, sr = SR, o: { jitterMs?: number; stall?: number; stallMs?: number; seed?: number } = {}): Frame[] {
  const rnd = seeded(o.seed ?? 9);
  const mpm = new Mpm(1024, sr);
  const out: Frame[] = [];
  let due = (1024 / sr) * 1000 + 3;
  const endMs = (x.length / sr) * 1000;
  while (due < endMs) {
    let at = due + rnd() * (o.jitterMs ?? 0);
    if (rnd() < (o.stall ?? 0)) at += (o.stallMs ?? 80) * (0.5 + rnd());
    const block = Math.floor(((at / 1000) * sr) / 128) * 128;
    if (block >= 1024 && block <= x.length) {
      const r = mpm.analyze(x.slice(block - 1024, block));
      out.push(r.rms >= MIN_RMS && r.freq > 0 ? { t: at, freq: r.freq, clarity: r.clarity, rms: r.rms } : { t: at, freq: null, clarity: 0, rms: r.rms });
    }
    // setInterval holt verpasste Aufrufe nicht nach: nächster Termin im festen Raster nach dem Aufruf
    due += 25 * Math.max(1, Math.ceil((at - due + 0.001) / 25));
  }
  return out;
}

/** Misst die Samples wie das Worklet: fein (mit NSDF) oder grob (25 ms). Blöcke zu 128 Samples. */
export function measure(x: Float32Array, sr = SR, kind: "fein" | "grob" = "fein"): Frame[] {
  const fm = kind === "fein" ? new FrameMaker(sr, FINE_HOP, true) : new FrameMaker(sr, (sr * COARSE_MS) / 1000, false);
  const out: Frame[] = [];
  for (let i = 0; i < x.length; i += 128) {
    for (const m of fm.push(x.subarray(i, Math.min(x.length, i + 128)), i)) {
      const t = (m.end / sr) * 1000;
      out.push(
        m.freq > 0
          ? { t, freq: m.freq, clarity: m.clarity, rms: m.rms, nsdf: m.nsdf, lag0: m.lag0, sr }
          : { t, freq: null, clarity: 0, rms: m.rms },
      );
    }
  }
  return out;
}
