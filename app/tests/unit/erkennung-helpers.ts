// Prüfstand der Erkennung: synthetisch gespielte Tonfolgen (./flute-signal.ts) → Messung → Wertung beim
// Mitspielen, gezählt wird, wie viele Noten grün werden. Alles richtig gespielt: Jede rote Note ist ein
// Fehler der Erkennung.
import { BeatFollower, WaitFollower, type FollowConfig } from "../../src/audio/follow";
import type { Frame } from "../../src/audio/judge";
import type { Timeline, Tone } from "../../src/songs/timeline";
import { measure, measurePolled, renderFlute, type SynthNote, type SynthOptions } from "./flute-signal";
import { seeded } from "./helpers";

/** Zeitplan aus Notenwerten (Viertel) und Höhen, im 4/4 */
export function timelineOf(notes: { midi: number; q: number }[]): Timeline {
  const tones: Tone[] = [];
  let g = 0;
  notes.forEach((n, i) => {
    tones.push({ start: g, dur: n.q, midi: n.midi, ids: [i], bar: Math.floor(g / 4), breathAfter: false });
    g += n.q;
  });
  const bars = Array.from({ length: Math.ceil(g / 4) }, (_, i) => ({ index: i, start: 4 * i, dur: 4, beats: [0, 1, 2, 3] }));
  return { tones, bars, total: g, countIn: [0, 1, 2, 3], countInDur: 4, countInBeats: 4 };
}

export interface Piece {
  name: string;
  notes: { midi: number; q: number }[];
  /** Viertel je Minute */
  bpm: number;
  synth?: (n: { midi: number; q: number }, i: number, prev: number | null) => Partial<SynthNote>;
  opts?: SynthOptions;
}

/** Zufallsmelodie in Tonschritten und kleinen Sprüngen über g¹ a¹ h¹ c² d² e² (und e¹ f¹) */
export function melody(n: number, q: number, seed: number, scale = [64, 65, 67, 69, 71, 72, 74, 76]): { midi: number; q: number }[] {
  const rnd = seeded(seed);
  let k = Math.floor(scale.length / 2);
  const out: { midi: number; q: number }[] = [];
  for (let i = 0; i < n; i++) {
    const step = [-2, -1, -1, 1, 1, 2][Math.floor(rnd() * 6)];
    k = Math.min(scale.length - 1, Math.max(0, k + step));
    if (out.length && scale[k] === out[out.length - 1].midi) k = k > 0 ? k - 1 : k + 1;
    out.push({ midi: scale[k], q });
  }
  return out;
}

export function render(p: Piece): { frames: Frame[]; coarse: Frame[]; polled: Frame[]; starts: number[] } {
  const msPerQ = 60000 / p.bpm;
  const synth: SynthNote[] = p.notes.map((n, i) => ({ midi: n.midi, ms: n.q * msPerQ, ...p.synth?.(n, i, i ? p.notes[i - 1].midi : null) }));
  const { x, sr, starts } = renderFlute(synth, p.opts);
  return { frames: measure(x, sr, "fein"), coarse: measure(x, sr, "grob"), polled: measurePolled(x, sr, { jitterMs: 8, stall: 0.03, stallMs: 80 }), starts };
}

export interface Score {
  wait: number;
  beat: number;
  total: number;
  /** Indizes der roten bzw. nicht erreichten Noten */
  waitMissed: number[];
  beatMissed: number[];
}

/** Wertet in beiden Arten; frames: die Messungen (fein oder grob), cfg: Einstellungen der Wertung */
export function score(p: Piece, frames: Frame[], starts: number[], cfg: Partial<FollowConfig> = {}): Score {
  const tl = timelineOf(p.notes);
  const waitOk: boolean[] = [];
  const wf = new WaitFollower(tl, { cfg, onNote: (i, r) => (waitOk[i] = r.ok) });
  for (const f of frames) wf.push(f);
  const beatOk: boolean[] = [];
  // Synthese ohne Verzögerung: nur das halbe Messfenster (≈ 10 ms) ausgleichen
  const bf = new BeatFollower(tl, { secPerQuarter: 60 / p.bpm, startMs: starts[0], cfg: { latencyMs: 10, ...cfg }, onNote: (i, r) => (beatOk[i] = r.ok) });
  for (const f of frames) bf.push(f);
  bf.finish(frames[frames.length - 1].t + 2000);
  const n = p.notes.length;
  const idx = [...Array(n).keys()];
  return {
    wait: idx.filter((i) => waitOk[i]).length,
    beat: idx.filter((i) => beatOk[i]).length,
    total: n,
    waitMissed: idx.filter((i) => !waitOk[i]),
    beatMissed: idx.filter((i) => !beatOk[i]),
  };
}

const REAL: SynthOptions = { reverb: 0.25, rt60: 450, noise: 0.08, harmonics: 2 };

/** Einsatz gebogen: zufällig 30–60 Cent zu tief oder zu hoch, gleitet in 40 ms auf den Ton */
function bent(seed: number) {
  const rnd = seeded(seed);
  return () => ({ gapMs: 25, bendCents: (rnd() < 0.5 ? -1 : 1) * (30 + 30 * rnd()) });
}

function shifted(seed: number) {
  const rnd = seeded(seed);
  return () => ({ gapMs: 25, shiftMs: (rnd() * 2 - 1) * 40 });
}

/** Wohnzimmer mit Handy: gebogene Einsätze, ungenaues Spiel, abwärts manchmal überblasen, teils gebunden */
function real(seed: number) {
  const rnd = seeded(seed);
  return (n: { midi: number }, _i: number, prev: number | null) => ({
    gapMs: rnd() < 0.25 ? 0 : 15 + 20 * rnd(),
    bendCents: (rnd() < 0.5 ? -1 : 1) * 40 * rnd(),
    shiftMs: (rnd() * 2 - 1) * 30,
    overblowMs: prev !== null && n.midi < prev && rnd() < 0.4 ? 20 + 30 * rnd() : 0,
    vibrato: 10 * rnd(),
    amp: 0.1 + 0.15 * rnd(),
  });
}

/** Testfolgen des Prüfstands (dieselben Ideen wie im Testboard der App) */
export function pieces(): Piece[] {
  const tongue = () => ({ gapMs: 25 });
  return [
    { name: "Viertel ♩=100, gestoßen", notes: melody(40, 1, 1), bpm: 100, synth: tongue },
    { name: "Achtel ♩=100, gestoßen", notes: melody(48, 0.5, 2), bpm: 100, synth: tongue },
    { name: "Achtel ♩=120, gestoßen", notes: melody(48, 0.5, 3), bpm: 120, synth: tongue },
    { name: "Achtel ♩=100, gebunden", notes: melody(48, 0.5, 4), bpm: 100, synth: () => ({ gapMs: 0 }) },
    {
      name: "Achtel ♩=100, abwärts überblasen (40 ms)",
      notes: melody(48, 0.5, 5),
      bpm: 100,
      synth: (n, _i, prev) => ({ gapMs: 25, overblowMs: prev !== null && n.midi < prev ? 40 : 0 }),
    },
    { name: "Achtel ♩=100, hauchig (Rauschen 0,12)", notes: melody(48, 0.5, 6), bpm: 100, synth: tongue, opts: { noise: 0.12 } },
    { name: "Achtel ♩=100, Zunge kurz (10 ms)", notes: melody(48, 0.5, 7), bpm: 100, synth: () => ({ gapMs: 10, attackMs: 25 }) },
    { name: "Achtel ♩=100, Nachhall 30 %", notes: melody(48, 0.5, 8), bpm: 100, synth: tongue, opts: { reverb: 0.3, rt60: 500 } },
    { name: "Achtel ♩=100, Einsatz ±50 Cent gebogen", notes: melody(48, 0.5, 9), bpm: 100, synth: bent(9) },
    { name: "Achtel ♩=100, ungenau ±40 ms", notes: melody(48, 0.5, 10), bpm: 100, synth: shifted(10) },
    { name: "Wohnzimmer: alles zusammen, Achtel ♩=100", notes: melody(48, 0.5, 11), bpm: 100, synth: real(11), opts: REAL },
    { name: "Wohnzimmer: alles zusammen, Viertel ♩=100", notes: melody(40, 1, 12), bpm: 100, synth: real(12), opts: REAL },
  ];
}
