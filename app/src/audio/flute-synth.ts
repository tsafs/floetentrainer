// Flötenstimme und Metronom-Klick, im Browser mit Web Audio erzeugt.
//
// Ein Ton: ein Oszillator mit wenigen, leisen Obertönen (PeriodicWave), kurzer Einsatz (ATTACK, so dass
// der Ton „auf dem Schlag“ gehört wird und nicht hinter dem Klick) mit einem kleinen, schnellen
// Anschleifen der Tonhöhe, dazu ein Hauch gefiltertes Rauschen (Anblasgeräusch), das im Einsatz kurz
// deutlicher ist – wie das „d“ der Zunge beim Absetzen. Ausklingen: von der aktuellen Lautstärke linear
// in RELEASE Sekunden genau auf 0, erst danach hält der Knoten an. (Früher klang der Ton mit
// setTargetAtTime aus und wurde nach sechs Zeitkonstanten gestoppt – bei noch etwa 0,1 % Pegel. Dieser
// kleine Sprung am Ende jedes Tons war im Offline-Rendern als Knackser an jedem Tonende zu sehen.)
// Gebundene Töne (Bindebogen): derselbe Klang läuft weiter, nur die Tonhöhe gleitet in GLIDE
// Sekunden zur neuen (Voice.glide) – kein neuer Einsatz, kein neues Anblasgeräusch.
// Ein Klick: ein sehr kurzer Sinus-Pieks, die betonte Eins lauter und höher; endet ebenfalls auf 0.
//
// Hinweis: Die Attrappen (tests/e2e/fake-audio.ts, tests/unit/audio-fake.ts) erkennen Flötentöne am
// Wellentyp "custom" und Klicks am Typ "sine"; einen gebundenen Tonwechsel an setValueAtTime gefolgt
// von exponentialRampToValueAtTime auf osc.frequency; das Ausklingen an setValueAtTime gefolgt von
// linearRampToValueAtTime auf 0 an der Hüllkurve. Bei Änderungen dort mitziehen.

import { soundingFreq } from "../music/notes";

/** Lautstärke eines Tons (Spitze), mehrere Töne überlappen höchstens kurz beim Übergang */
const PEAK = 0.5;
/** Haltepegel relativ zur Spitze */
const SUSTAIN = 0.82;
/** Einschwingzeit in s: kurz, damit der Ton auf dem Schlag kommt, aber ohne Knacks */
export const ATTACK = 0.012;
/** Zeitkonstante, mit der der Ton nach dem Einsatz auf den Haltepegel sinkt */
const DECAY_TAU = 0.1;
/** Ausklingen in s (linear auf 0) */
export const RELEASE = 0.03;
/** so lange nach dem Beginn des Ausklingens laufen die Knoten noch */
export const RELEASE_TAIL = RELEASE + 0.01;
/** Anblasgeräusch: Spitze kurz nach dem Einsatz, Abklingen, danach (relativ zu 1) */
const NOISE_ATTACK = 0.045;
const NOISE_PEAK_AT = 0.004;
const NOISE_TAU = 0.02;
const NOISE_SUSTAIN = 0.0025;
/** Anschleifen: Beginn so viele Cent zu tief, in SCOOP_TIME s auf der Höhe */
const SCOOP_CENTS = -6;
const SCOOP_TIME = 0.02;
/** Gleiten der Tonhöhe beim gebundenen Tonwechsel in s: schnell, aber ohne Knacken */
export const GLIDE = 0.02;
/** Obertöne (Amplituden ab Grundton), wenig wie bei der Blockflöte */
const HARMONICS = [1, 0.1, 0.06, 0.02, 0.01];

const CLICK_FREQ = 1250;
const CLICK_ACCENT_FREQ = 1900;
const CLICK_GAIN = 0.13;
const CLICK_ACCENT_GAIN = 0.24;
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
    const len = Math.max(1, Math.round(ctx.sampleRate * 2));
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
    osc.detune.linearRampToValueAtTime(0, at + SCOOP_TIME);
    const env = ctx.createGain();
    env.gain.value = 0;
    env.gain.setValueAtTime(0, at);
    env.gain.linearRampToValueAtTime(PEAK, attackEnd);
    env.gain.setTargetAtTime(PEAK * SUSTAIN, attackEnd, DECAY_TAU);
    osc.connect(env).connect(this.out);
    /** Lautstärke der Hüllkurve zur Zeit t (nach dem Einsatz, vor dem Ausklingen) */
    const level = (t: number) => PEAK * SUSTAIN + PEAK * (1 - SUSTAIN) * Math.exp(-(t - attackEnd) / DECAY_TAU);

    // Anblasgeräusch: Rauschen, um die Tonhöhe herum gefiltert, sehr leise; im Einsatz kurz deutlicher
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = Math.min(freq * 2, 9000);
    band.Q.value = 1.2;
    const ng = ctx.createGain();
    const noisePeak = at + NOISE_PEAK_AT;
    ng.gain.value = 0;
    ng.gain.setValueAtTime(0, at);
    ng.gain.linearRampToValueAtTime(NOISE_ATTACK, noisePeak);
    ng.gain.setTargetAtTime(NOISE_SUSTAIN, noisePeak, NOISE_TAU);
    const noiseLevel = (t: number) => NOISE_SUSTAIN + (NOISE_ATTACK - NOISE_SUSTAIN) * Math.exp(-(t - noisePeak) / NOISE_TAU);
    src.connect(band).connect(ng).connect(this.out);

    osc.start(at);
    src.start(at, Math.random() * 1.8);

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
        // vom aktuellen Pegel aus (stetig) linear genau auf 0, dann erst anhalten: kein Sprung am Ende
        env.gain.setValueAtTime(level(u), u);
        env.gain.linearRampToValueAtTime(0, u + RELEASE);
        ng.gain.setValueAtTime(noiseLevel(u), u);
        ng.gain.linearRampToValueAtTime(0, u + RELEASE * 0.7);
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
    g.gain.exponentialRampToValueAtTime(0.0005, at + CLICK_LEN);
    g.gain.linearRampToValueAtTime(0, at + CLICK_LEN + 0.004); // genau auf 0 vor dem Anhalten
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
