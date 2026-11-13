// Flötenstimme und Metronom-Klick, im Browser mit Web Audio erzeugt.
//
// Ein Ton: ein Oszillator mit wenigen, leisen Obertönen (PeriodicWave), weicher Einsatz mit einem
// kleinen Anschleifen der Tonhöhe, dazu ein Hauch gefiltertes Rauschen (Anblasgeräusch), das im
// Einsatz etwas deutlicher ist. Ausklingen mit setTargetAtTime, damit nichts knackst.
// Gebundene Töne (Bindebogen): derselbe Klang läuft weiter, nur die Tonhöhe gleitet in GLIDE
// Sekunden zur neuen (Voice.glide) – kein neuer Einsatz, kein neues Anblasgeräusch.
// Ein Klick: ein sehr kurzer Sinus-Pieks, die betonte Eins lauter und höher.
//
// Hinweis: Die Attrappen (tests/e2e/fake-audio.ts, tests/unit/audio-fake.ts) erkennen Flötentöne am
// Wellentyp "custom" und Klicks am Typ "sine"; einen gebundenen Tonwechsel an setValueAtTime gefolgt
// von exponentialRampToValueAtTime auf osc.frequency. Bei Änderungen dort mitziehen.

import { soundingFreq } from "../music/notes";

/** Lautstärke eines Tons (Spitze), mehrere Töne überlappen höchstens kurz beim Übergang */
const PEAK = 0.3;
/** Haltepegel relativ zur Spitze */
const SUSTAIN = 0.82;
/** Einschwingzeit in s (weicher Einsatz) */
export const ATTACK = 0.035;
/** Zeitkonstante des Ausklingens in s */
const RELEASE_TAU = 0.03;
/** so lange nach dem Tonende laufen die Knoten noch (Ausklingen) */
export const RELEASE_TAIL = RELEASE_TAU * 6;
/** Anblasgeräusch: im Einsatz und danach (relativ zu 1) */
const NOISE_ATTACK = 0.022;
const NOISE_SUSTAIN = 0.004;
/** Anschleifen: Beginn so viele Cent zu tief */
const SCOOP_CENTS = -14;
/** Gleiten der Tonhöhe beim gebundenen Tonwechsel in s: schnell, aber ohne Knacken */
export const GLIDE = 0.02;
/** Obertöne (Amplituden ab Grundton), wenig wie bei der Blockflöte */
const HARMONICS = [1, 0.1, 0.06, 0.02, 0.01];

const CLICK_FREQ = 1250;
const CLICK_ACCENT_FREQ = 1900;
const CLICK_GAIN = 0.07;
const CLICK_ACCENT_GAIN = 0.13;
const CLICK_LEN = 0.04;

/** Ein klingender (oder schon eingeplanter) Ton. */
export interface Voice {
  /** Beginn auf der Uhr des Audiosystems */
  readonly start: number;
  /** frühester erlaubter Zeitpunkt für das Ende (nach dem Einschwingen) */
  readonly minEnd: number;
  /**
   * Gebundener Wechsel zur notierten Höhe `midi` ab `at` (Bindebogen): kein neuer Einsatz, die
   * Tonhöhe gleitet in GLIDE Sekunden zur neuen. Nach release oder cut ohne Wirkung.
   */
  glide(midi: number, at: number, a4?: number): void;
  /** Ende einplanen: ab `at` klingt der Ton aus. */
  release(at: number): void;
  /** Knoten zum Zeitpunkt `at` hart beenden (beim Stopp, die Lautstärke regelt dann der Ausgang). */
  cut(at: number): void;
}

/** Ein eingeplanter Klick. */
export interface Click {
  readonly start: number;
  cut(at: number): void;
}

interface Shared {
  wave: PeriodicWave;
  noise: AudioBuffer;
}

const shared = new WeakMap<BaseAudioContext, Shared>();

function sharedFor(ctx: BaseAudioContext): Shared {
  let s = shared.get(ctx);
  if (!s) {
    const real = new Float32Array(HARMONICS.length + 1);
    const imag = new Float32Array(HARMONICS.length + 1);
    HARMONICS.forEach((a, i) => (imag[i + 1] = a));
    const wave = ctx.createPeriodicWave(real, imag);
    const len = Math.max(1, Math.round(ctx.sampleRate));
    const noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    s = { wave, noise };
    shared.set(ctx, s);
  }
  return s;
}

/** Klingende Frequenz einer notierten MIDI-Nummer bei Stimmton a4 (Sopranflöte: eine Oktave höher). */
export function toneFreq(midi: number, a4 = 440): number {
  return soundingFreq(midi, a4);
}

/** Erzeugt Flötentöne und Klicks in einem AudioContext, alles geht an `out`. */
export class FluteSynth {
  constructor(
    private readonly ctx: BaseAudioContext,
    private readonly out: AudioNode,
  ) {}

  /** Plant einen Ton der notierten Höhe `midi` ab `at` ein. Das Ende kommt mit `release`. */
  tone(midi: number, at: number, a4 = 440): Voice {
    const { ctx } = this;
    const { wave, noise } = sharedFor(ctx);
    const freq = toneFreq(midi, a4);
    const attackEnd = at + ATTACK;

    const osc = ctx.createOscillator();
    osc.setPeriodicWave(wave);
    osc.frequency.value = freq;
    osc.detune.setValueAtTime(SCOOP_CENTS, at);
    osc.detune.linearRampToValueAtTime(0, at + ATTACK * 1.4);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(PEAK, attackEnd);
    env.gain.setTargetAtTime(PEAK * SUSTAIN, attackEnd, 0.12);
    osc.connect(env).connect(this.out);

    // Anblasgeräusch: Rauschen, um die Tonhöhe herum gefiltert, sehr leise
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = Math.min(freq * 2, 9000);
    band.Q.value = 0.9;
    const ng = ctx.createGain();
    ng.gain.value = 0;
    ng.gain.setValueAtTime(0, at);
    ng.gain.linearRampToValueAtTime(NOISE_ATTACK, at + ATTACK * 0.6);
    ng.gain.setTargetAtTime(NOISE_SUSTAIN, at + ATTACK * 0.6, 0.05);
    src.connect(band).connect(ng).connect(this.out);

    osc.start(at);
    src.start(at, Math.random() * 0.9);

    let released = false;
    let stopAt = Infinity;
    let curFreq = freq;
    let glideEnd = at; // Ende des letzten Gleitens (Wechsel nie davor einplanen)
    const stop = (t: number) => {
      if (t >= stopAt) return;
      stopAt = t;
      osc.stop(t);
      src.stop(t);
    };
    return {
      start: at,
      minEnd: attackEnd + 0.005,
      glide(m: number, t: number, a4b = a4) {
        if (released || stopAt < Infinity) return;
        const f = toneFreq(m, a4b);
        const u = Math.max(t, glideEnd);
        glideEnd = u + GLIDE;
        // von der bisherigen Höhe aus gleiten (exponentiell = gleichmäßig in Cent)
        osc.frequency.setValueAtTime(curFreq, u);
        osc.frequency.exponentialRampToValueAtTime(f, glideEnd);
        band.frequency.setValueAtTime(Math.min(curFreq * 2, 9000), u);
        band.frequency.exponentialRampToValueAtTime(Math.min(f * 2, 9000), glideEnd);
        curFreq = f;
      },
      release(t: number) {
        if (released || stopAt < Infinity) return;
        released = true;
        const u = Math.max(t, attackEnd + 0.005);
        env.gain.setTargetAtTime(0, u, RELEASE_TAU);
        ng.gain.setTargetAtTime(0, u, RELEASE_TAU * 0.6);
        stop(u + RELEASE_TAIL);
      },
      cut(t: number) {
        stop(Math.max(t, at));
      },
    };
  }

  /** Plant einen Metronom-Klick ein; `accent` = betonte Eins (lauter, höher). */
  click(at: number, accent: boolean): Click {
    const { ctx } = this;
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = accent ? CLICK_ACCENT_FREQ : CLICK_FREQ;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(accent ? CLICK_ACCENT_GAIN : CLICK_GAIN, at + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0003, at + CLICK_LEN);
    osc.connect(g).connect(this.out);
    osc.start(at);
    osc.stop(at + CLICK_LEN + 0.01);
    let stopAt = at + CLICK_LEN + 0.01;
    return {
      start: at,
      cut(t: number) {
        if (t >= stopAt) return;
        stopAt = Math.max(t, at);
        osc.stop(stopAt);
      },
    };
  }
}
