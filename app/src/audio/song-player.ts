// Spielt einen Zeitplan (Timeline) mit der Flötenstimme vor.
//
// Genaues Timing: Alle Töne und Klicks werden im Voraus auf der Uhr des Audiosystems
// (AudioContext.currentTime) eingeplant. Eine Vorausschau-Schleife prüft alle 25 ms und plant ein,
// was in den nächsten ~0,15 s (plus Platz für die Artikulations-Lücken) beginnt oder endet.
// Die Timer bestimmen also nur, *wann eingeplant* wird, nie, wann etwas klingt.
//
// Zeitachse: Der Abspieler zählt in „Spielvierteln“ g. Der Einzähltakt liegt bei g ∈ [0, C),
// Durchgang k (Schleife) bei g ∈ [C + k·L, C + (k+1)·L), L = Länge des gespielten Bereichs.
// Die Umrechnung in Sekunden ist stückweise linear (Anker); eine Tempoänderung setzt einen neuen
// Anker an der Stelle, bis zu der schon eingeplant ist – so springt nichts.
//
// Artikulation: Normale Noten werden abgesetzt wie mit der Zunge gespielt – jede Note setzt neu ein,
// und vor dem nächsten Ton liegt eine kurze Lücke (gapSeconds: ARTIC_SHARE der Dauer, zwischen
// ARTIC_MIN und ARTIC_MAX). Am Atemzeichen ist die Lücke größer. Vor einer Pause und am Ende klingt
// der Ton voll aus.
// Bindebogen (Tone.slurToNext): Der gebundene Ton bekommt kein „off“, der nächste ein „on“ mit
// legato – dieselbe Stimme läuft weiter und gleitet zur neuen Höhe (Voice.glide). Bei gleicher Höhe
// unter dem Bogen wird wie bei jeder Tonwiederholung kurz abgesetzt und neu angestoßen.
//
// Ausgang: Klicks und Töne laufen über denselben Regler je Abspielen (bus) und einen gemeinsamen
// sanften Begrenzer (DynamicsCompressorNode als Limiter), damit schnelle Noten mit Klicks nicht
// übersteuern. Klicks und Töne haben also dieselbe Zeitbasis und denselben Weg zum Lautsprecher.
//
// Positionsmeldungen für die Oberfläche kommen aus requestAnimationFrame. Die Stelle, die gerade zu
// hören ist, kommt aus AudioContext.getOutputTimestamp() (zusammengehörige Audio- und
// Bildschirm-Uhrzeit, also samt aller Ausgabe-Verzögerung), mit Rückfall auf currentTime minus
// baseLatency und outputLatency (outputClock). Dazu kommt, dass ein in requestAnimationFrame
// gezeichnetes Bild erst etwa ein Bild später auf dem Schirm steht (FRAME_LEAD).
// AudioContext und Zeitgeber lassen sich für Tests austauschen (PlayerEnv).

import type { Timeline } from "../songs/timeline";
import { FluteSynth, RELEASE_TAIL, type Click, type Voice } from "./flute-synth";

/** Abstand der Vorausschau-Schleife in ms */
export const TICK_MS = 25;
/** so weit voraus (s) wird eingeplant */
export const LOOKAHEAD = 0.15;
/** im Hintergrund (gedrosselte Timer) weiter voraus */
const LOOKAHEAD_HIDDEN = 1.2;
/** Abstand vom Abspielen bis zum ersten Ereignis (s) */
export const START_DELAY = 0.08;
/** Lücke am Atemzeichen (s), höchstens 40 % des Tons */
export const BREATH_GAP = 0.18;
export const BREATH_MAX_SHARE = 0.4;
/** Absetzen (normale Noten): Lücke vor dem nächsten Ton als Anteil der Dauer, mit Unter- und Obergrenze (s) */
export const ARTIC_SHARE = 0.12;
export const ARTIC_MIN = 0.035;
export const ARTIC_MAX = 0.09;
/** bei sehr kurzen Noten höchstens dieser Anteil */
export const ARTIC_MAX_SHARE = 0.4;
const MAX_GAP = BREATH_GAP;
/** Ausblenden beim Stopp (s) */
export const FADE = 0.04;
/** Lautstärke am Ausgang (vor dem Begrenzer) */
export const OUT_GAIN = 0.87;
/**
 * Begrenzer am Ausgang: setzt erst kurz unter Vollaussteuerung ein (einzelne Töne bleiben unberührt),
 * schnell im Ansprechen, sanft im Loslassen. Chromium/WebKit/Gecko verstärken mit einem Compressor
 * zusätzlich automatisch (Ausgleich nach Schwelle und Verhältnis); die Pegel sind darum offline
 * nachgemessen (Spitze unter 0,95).
 */
export const LIMITER = { threshold: -4, knee: 3, ratio: 12, attack: 0.002, release: 0.15 };
/** Vorlauf des Compressors (in allen Browsern fest 6 ms): um so viel später ist alles zu hören */
export const LIMITER_DELAY = 0.006;
/** Ein in requestAnimationFrame gezeichnetes Bild steht etwa so viel später auf dem Schirm (s) */
export const FRAME_LEAD = 0.02;
/** Ausgabe-Verzögerung (s), wenn der Browser weder getOutputTimestamp noch outputLatency liefert */
export const OUTPUT_FALLBACK = 0.03;
const EPS = 1e-6;

/** Zeitgeber, austauschbar für Tests. Beide geben eine Abbruch-Funktion zurück. */
export interface PlayerTimers {
  /** fn alle `ms` Millisekunden aufrufen */
  every(ms: number, fn: () => void): () => void;
  /** fn einmal beim nächsten Bild aufrufen (requestAnimationFrame) */
  frame(fn: () => void): () => void;
  /** Bildschirm-Uhr in ms (Standard performance.now), passend zu getOutputTimestamp().performanceTime */
  now?(): number;
}

export interface PlayerEnv {
  /** legt den AudioContext an (erst beim ersten Abspielen aufgerufen) */
  createContext?: () => AudioContext;
  timers?: PlayerTimers;
}

/** Was gerade klingt – für die Markierung in der Oberfläche. */
export interface PlayerPosition {
  /** Index in timeline.tones; null in Pausen, beim Einzählen und nach dem Ende */
  tone: number | null;
  /** Index in timeline.bars (Spielreihenfolge); null beim Einzählen und nach dem Ende */
  bar: number | null;
  /** beim Einzählen die Zählzeit im Takt (1, 2, …; nach einem vollen Takt wieder ab 1), sonst null */
  countIn: number | null;
  /** Durchgang (0 = erster), zählt bei der Schleife hoch */
  pass: number;
  /** Stelle im Zeitplan in Vierteln (beim Einzählen negativ) */
  quarter: number;
}

export interface PlayOptions {
  /** Sekunden je Viertel; während des Spielens mit setTempo änderbar */
  secPerQuarter: number;
  /** Stimmton a in Hz (Einstellung tuningHz), Standard 440 */
  a4?: number;
  /** vorher ein Takt Einzählen (Standard: ja) */
  countIn?: boolean;
  /** Klicks während des ganzen Lieds (Standard: nein); live mit setMetronome */
  metronome?: boolean;
  /** Bereich endlos wiederholen (Standard: nein); live mit setLoop. Eingezählt wird nur einmal. */
  loop?: boolean;
  /**
   * Melodie (Standard: true = volle Lautstärke). false: keine Töne, nur Einzählen und Klicks – für das
   * Mitspielen mit Mikrofon, das sonst das Handy mithören würde. Eine Zahl (0–1): die Melodie leiser,
   * Klicks unverändert (Mitspielen mit Kopfhörern). Markierung und onEnd laufen in jedem Fall.
   */
  melody?: boolean | number;
  /** wird aufgerufen, wenn sich Ton, Takt, Zählzeit oder Durchgang ändern */
  onPosition?: (p: PlayerPosition) => void;
  /**
   * in jedem Bild (requestAnimationFrame) mit der Stelle, die zu hören ist, wenn das Bild auf dem
   * Schirm steht – für den mitlaufenden Balken (quarter ändert sich stetig). Kommt nach onPosition.
   */
  onFrame?: (p: PlayerPosition) => void;
  /** am Ende (nicht bei Schleife und nicht nach stop) */
  onEnd?: () => void;
}

/** Lücke vor dem Tonende: keine (vor Pause/Ende), Absetzen (nächster Ton schließt an), Atemzeichen */
type Gap = "none" | "artic" | "breath";

/** Ereignis in einem Abschnitt (Einzähltakt oder Durchgang), g relativ zum Abschnittsbeginn */
type Ev =
  | { kind: "off"; g: number; id: number; gap: Gap }
  | { kind: "click"; g: number; accent: boolean; metro: boolean }
  | { kind: "on"; g: number; id: number; midi: number; legato: boolean };

const ORDER = { off: 0, click: 1, on: 2 } as const;

interface Anchor {
  t: number;
  g: number;
  spq: number;
}

function defaultContext(): AudioContext {
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctx = w.AudioContext ?? w.webkitAudioContext;
  if (!Ctx) throw new Error("Web Audio wird nicht unterstützt");
  // „playback“: größere Puffer. Für das Vorspielen zählt keine kurze Reaktionszeit (alles ist im
  // Voraus eingeplant, die Markierung rechnet die Verzögerung heraus), aber Aussetzer im Puffer
  // (Knacksen) auf langsameren Handys werden seltener.
  try {
    return new Ctx({ latencyHint: "playback" });
  } catch {
    return new Ctx();
  }
}

type ClockCtx = Pick<AudioContext, "currentTime"> &
  Partial<Pick<AudioContext, "outputLatency" | "baseLatency" | "getOutputTimestamp">>;

/**
 * Zusammengehörige Uhrzeiten: Die Audiozeit `audio` (Uhr des AudioContext) ist zur Zeit `perf`
 * (performance.now, ms) aus dem Lautsprecher zu hören. Aus getOutputTimestamp, wenn der Browser es
 * liefert (enthält jede Ausgabe-Verzögerung, auch Bluetooth, und springt nicht mit den Audio-Blöcken
 * wie currentTime), sonst aus currentTime minus baseLatency und outputLatency. Der Vorlauf des
 * Begrenzers am Ausgang (LIMITER_DELAY) ist eingerechnet.
 */
export function outputClock(ctx: ClockCtx, perf = performance.now()): { audio: number; perf: number } {
  const ts = typeof ctx.getOutputTimestamp === "function" ? ctx.getOutputTimestamp() : null;
  const ct = ts?.contextTime;
  const pt = ts?.performanceTime;
  // (vor dem ersten hörbaren Block melden Browser contextTime 0: dann der Rückfall)
  if (ct != null && pt != null && pt > 0 && ct > 0) {
    const audio = ct + (perf - pt) / 1000;
    // Plausibel? (zu hören ist nie, was noch nicht berechnet ist, und nicht mehr als 1 s zurück)
    if (audio <= ctx.currentTime + 0.005 && audio > ctx.currentTime - 1) return { audio: audio - LIMITER_DELAY, perf };
  }
  const out = (ctx.outputLatency ?? 0) > 0 ? ctx.outputLatency! : OUTPUT_FALLBACK;
  return { audio: ctx.currentTime - (ctx.baseLatency || 0) - out - LIMITER_DELAY, perf };
}

/** Zeitpunkt (performance.now, ms), zu dem die Audiozeit t zu hören ist */
export function heardAtPerf(ctx: ClockCtx, t: number, perf = performance.now()): number {
  const c = outputClock(ctx, perf);
  return c.perf + (t - c.audio) * 1000;
}

export const defaultTimers: PlayerTimers = {
  every(ms, fn) {
    const id = setInterval(fn, ms);
    return () => clearInterval(id);
  },
  frame(fn) {
    if (typeof requestAnimationFrame === "function") {
      const id = requestAnimationFrame(() => fn());
      return () => cancelAnimationFrame(id);
    }
    const id = setTimeout(fn, 16);
    return () => clearTimeout(id);
  },
};

/** Lücke vor dem Tonende in Sekunden, abhängig von der klingenden Dauer. */
export function gapSeconds(gap: Gap, durSec: number): number {
  if (gap === "breath") return Math.min(BREATH_GAP, BREATH_MAX_SHARE * durSec);
  if (gap === "artic") return Math.min(Math.max(ARTIC_MIN, Math.min(ARTIC_MAX, ARTIC_SHARE * durSec)), ARTIC_MAX_SHARE * durSec);
  return 0;
}

/** Ereignisse eines Durchgangs; `wrap`: danach folgt wieder der Anfang (Schleife). */
function passEvents(tl: Timeline, wrap: boolean): Ev[] {
  const L = tl.total;
  const idx: number[] = [];
  tl.tones.forEach((t, i) => {
    if (t.start < L - EPS) idx.push(i);
  });
  const evs: Ev[] = [];
  let legato = false; // der aktuelle Ton schließt gebunden an den vorigen an
  idx.forEach((ti, j) => {
    const t = tl.tones[ti];
    const end = Math.min(t.start + t.dur, L);
    let next: { start: number; midi: number } | null = null;
    if (j + 1 < idx.length) next = tl.tones[idx[j + 1]];
    else if (wrap && idx.length) next = { start: tl.tones[idx[0]].start + L, midi: tl.tones[idx[0]].midi };
    const adjacent = !!next && Math.abs(next.start - end) < EPS;
    // gebunden nur innerhalb des Durchgangs (nicht über die Schleifengrenze) und zu einer anderen Höhe
    const slur = !!t.slurToNext && !t.breathAfter && j + 1 < idx.length && adjacent && next!.midi !== t.midi;
    let gap: Gap = "none";
    if (t.breathAfter) gap = "breath";
    else if (adjacent) gap = "artic"; // abgesetzt (auch Tonwiederholung unter dem Bogen)
    evs.push({ kind: "on", g: t.start, id: j, midi: t.midi, legato });
    if (!slur) evs.push({ kind: "off", g: end, id: j, gap });
    legato = slur;
  });
  tl.bars.forEach((b) => {
    b.beats.forEach((beat, k) => {
      const q = b.start + beat;
      if (q < L - EPS) evs.push({ kind: "click", g: q, accent: k === 0 && !b.pickup, metro: true });
    });
  });
  return sortEvents(evs);
}

/** Zählzeiten je Takt beim Einzählen */
function perBar(tl: Timeline): number {
  return Math.max(1, tl.countInBeats || tl.countIn.length);
}

function sortEvents(evs: Ev[]): Ev[] {
  return evs.sort((a, b) => a.g - b.g || ORDER[a.kind] - ORDER[b.kind]);
}

/** letzter Index i mit key(arr[i]) ≤ x, sonst -1 */
function lastAtOrBefore<T>(arr: T[], x: number, key: (v: T) => number): number {
  let lo = 0;
  let hi = arr.length - 1;
  let res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (key(arr[mid]) <= x + EPS) {
      res = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return res;
}

interface Fading {
  bus: GainNode;
  until: number;
}

interface Run {
  tl: Timeline;
  opts: PlayOptions;
  a4: number;
  bus: GainNode;
  /** Klicks direkt an bus */
  synth: FluteSynth;
  /** Flötentöne über einen eigenen Regler (Lautstärke der Melodie); null = keine Melodie */
  toneSynth: FluteSynth | null;
  /** Länge eines Durchgangs in Vierteln */
  L: number;
  /** Länge des Einzähltakts (0 ohne Einzählen) */
  C: number;
  /** Audiozeit des Zeitplan-Beginns (nach dem Einzählen), im Tempo beim Start */
  startT: number;
  countEvs: Ev[];
  passOnce: Ev[];
  passWrap: Ev[];
  anchors: Anchor[];
  /** Abschnitt: -1 Einzählen, sonst Durchgang */
  seg: number;
  segEvs: Ev[];
  i: number;
  /** größtes schon eingeplantes g */
  scheduledG: number;
  /** alles eingeplant; Ende der Musik bei endG */
  done: boolean;
  endG: number;
  /** klingende Stimmen je Ton (`at`: Beginn des aktuellen Tons, bei Bindebogen später als voice.start) */
  voices: Map<string, { voice: Voice; at: number }>;
  live: { voice: Voice; until: number }[];
  clicks: { click: Click; metro: boolean }[];
  last: PlayerPosition | null;
  cancelFrame: (() => void) | null;
}

export class SongPlayer {
  private ctx: AudioContext | null = null;
  /** Begrenzer am Ausgang (einer je AudioContext) */
  private limiter: AudioNode | null = null;
  private readonly createContext: () => AudioContext;
  private readonly timers: PlayerTimers;
  private run: Run | null = null;
  private fading: Fading[] = [];
  private cancelTick: (() => void) | null = null;
  private spq = 0.6;
  private metronome = false;
  private loop = false;

  constructor(env: PlayerEnv = {}) {
    this.createContext = env.createContext ?? defaultContext;
    this.timers = env.timers ?? defaultTimers;
  }

  get playing(): boolean {
    return this.run !== null;
  }

  /** aktuelles Tempo in Sekunden je Viertel */
  get secPerQuarter(): number {
    return this.spq;
  }

  /** Der AudioContext (erst nach dem ersten play vorhanden). */
  get context(): AudioContext | null {
    return this.ctx;
  }

  /**
   * AudioContext anlegen und fortsetzen, ohne etwas zu spielen. Direkt aus einem Tippen heraus aufrufen,
   * wenn das eigentliche play erst später kommt (Mitspielen: erst nach der Mikrofon-Erlaubnis).
   */
  prepare(): void {
    const ctx = (this.ctx ??= this.createContext());
    if (ctx.state !== "running") ctx.resume().catch(() => {});
  }

  /**
   * Gegenstück zu prepare: Spielt nichts und klingt nichts mehr aus, wird der AudioContext angehalten
   * (sonst liefe er nach einem prepare ohne play – Mikrofon verweigert, Warte-Modus ohne falschen Ton –
   * unbemerkt weiter). Während des Spielens oder Ausblendens tut es nichts; dort hält tick ihn an.
   */
  idle(): void {
    if (this.run || this.cancelTick) return;
    this.ctx?.suspend().catch(() => {});
  }

  /**
   * Audiozeit (s, Uhr des AudioContext), zu der der Zeitplan beginnt, also nach dem Einzählen; null,
   * wenn nichts spielt. Gilt für das Tempo beim Start; spätere Tempowechsel meldet setTempo. Fürs
   * Mitspielen im Takt (die Umrechnung auf die Uhr des Mikrofons macht der Aufrufer).
   */
  get timelineStart(): number | null {
    return this.run ? this.run.startT : null;
  }

  /**
   * Spielt den Zeitplan. Muss beim ersten Mal direkt aus einem Tippen heraus aufgerufen werden
   * (dann darf der AudioContext anlaufen). Ein laufendes Vorspielen wird vorher beendet.
   */
  play(tl: Timeline, opts: PlayOptions): void {
    if (this.run) this.stop();
    const ctx = (this.ctx ??= this.createContext());
    if (ctx.state !== "running") ctx.resume().catch(() => {});
    this.spq = opts.secPerQuarter;
    this.metronome = opts.metronome ?? false;
    // (Abschnitt wiederholen: die Oberfläche übergibt dafür sectionTimeline aus songs/timeline.ts)
    const L = Math.max(0, tl.total);
    this.loop = (opts.loop ?? false) && L > EPS;
    const withCount = (opts.countIn ?? true) && tl.countIn.length > 0;
    const bus = ctx.createGain();
    bus.gain.value = OUT_GAIN;
    bus.connect(this.output(ctx));
    const melody = opts.melody ?? true;
    let toneSynth: FluteSynth | null = null;
    if (melody === true) toneSynth = new FluteSynth(ctx, bus);
    else if (typeof melody === "number" && melody > 0) {
      const mel = ctx.createGain();
      mel.gain.value = Math.min(1, melody);
      mel.connect(bus);
      toneSynth = new FluteSynth(ctx, mel);
    }
    const countEvs: Ev[] = withCount
      ? tl.countIn.map((g, k) => ({ kind: "click", g, accent: k % perBar(tl) === 0, metro: false }) as Ev)
      : [];
    const run: Run = {
      tl,
      opts,
      a4: opts.a4 ?? 440,
      bus,
      synth: new FluteSynth(ctx, bus),
      toneSynth,
      L,
      C: withCount ? tl.countInDur : 0,
      startT: ctx.currentTime + START_DELAY + (withCount ? tl.countInDur : 0) * this.spq,
      countEvs,
      passOnce: passEvents(tl, false),
      passWrap: passEvents(tl, true),
      anchors: [{ t: ctx.currentTime + START_DELAY, g: 0, spq: this.spq }],
      seg: withCount ? -1 : 0,
      segEvs: [],
      i: 0,
      scheduledG: -Infinity,
      done: false,
      endG: Infinity,
      voices: new Map(),
      live: [],
      clicks: [],
      last: null,
      cancelFrame: null,
    };
    run.segEvs = withCount ? countEvs : this.loop ? run.passWrap : run.passOnce;
    this.run = run;
    this.ensureTick();
    this.tick();
    const frame = () => {
      if (this.run !== run) return;
      // (report kann über onPosition/onFrame ein neues play oder stop auslösen)
      this.report(run);
      if (this.run === run) run.cancelFrame = this.timers.frame(frame);
    };
    run.cancelFrame = this.timers.frame(frame);
  }

  /** Sofort aufhören: eingeplante Töne abbrechen, kurz ausblenden. Danach keine Rückrufe mehr. */
  stop(): void {
    const run = this.run;
    if (!run || !this.ctx) return;
    this.run = null;
    run.cancelFrame?.();
    const now = this.ctx.currentTime;
    const end = now + FADE;
    run.bus.gain.cancelScheduledValues(now);
    run.bus.gain.setValueAtTime(OUT_GAIN, now);
    run.bus.gain.linearRampToValueAtTime(0, end);
    for (const { voice } of run.voices.values()) voice.cut(end + 0.01);
    for (const { voice } of run.live) voice.cut(end + 0.01);
    for (const { click } of run.clicks) click.cut(end + 0.01);
    this.fading.push({ bus: run.bus, until: end + 0.05 });
    this.ensureTick();
  }

  /**
   * Tempo ändern, auch während des Spielens (ohne Sprung). Gibt die Audiozeit zurück, ab der das neue
   * Tempo gilt (Eingeplantes bleibt im alten Tempo), oder null, wenn nichts spielt.
   */
  setTempo(secPerQuarter: number): number | null {
    if (!(secPerQuarter > 0)) return null;
    this.spq = secPerQuarter;
    const run = this.run;
    if (!run || !this.ctx) return null;
    const now = this.ctx.currentTime;
    const gA = Math.max(run.scheduledG, this.gAt(run, now));
    const last = run.anchors[run.anchors.length - 1];
    if (Math.abs(gA - last.g) < EPS) {
      last.spq = secPerQuarter;
      return last.t;
    }
    const t = this.timeOf(run, gA);
    run.anchors.push({ t, g: gA, spq: secPerQuarter });
    return t;
  }

  /** Metronom-Klicks während des Lieds an/aus, auch während des Spielens. */
  setMetronome(on: boolean): void {
    this.metronome = on;
    const run = this.run;
    if (on || !run || !this.ctx) return;
    const now = this.ctx.currentTime;
    for (const c of run.clicks) if (c.metro && c.click.start > now) c.click.cut(now);
  }

  /** Schleife an/aus, auch während des Spielens (wirkt am Ende des laufenden Durchgangs). */
  setLoop(on: boolean): void {
    const run = this.run;
    this.loop = on && (!run || run.L > EPS);
    if (!run || !this.ctx || !this.loop || !run.done) return;
    // schon alles eingeplant, aber noch nicht zu Ende: einfach weitermachen
    if (this.ctx.currentTime < this.timeOf(run, run.endG)) {
      run.done = false;
      run.endG = Infinity;
      run.seg += 1;
      run.segEvs = run.passWrap;
      run.i = 0;
    }
  }

  /** aktuelle Stelle (null, wenn nichts spielt) */
  position(): PlayerPosition | null {
    return this.run ? this.positionAt(this.run, this.listenTime()) : null;
  }

  // ------------------------------------------------------------ intern

  /** Eingang des Begrenzers am Ausgang (beim ersten Mal angelegt) */
  private output(ctx: AudioContext): AudioNode {
    if (!this.limiter) {
      const lim = ctx.createDynamicsCompressor();
      lim.threshold.value = LIMITER.threshold;
      lim.knee.value = LIMITER.knee;
      lim.ratio.value = LIMITER.ratio;
      lim.attack.value = LIMITER.attack;
      lim.release.value = LIMITER.release;
      lim.connect(ctx.destination);
      this.limiter = lim;
    }
    return this.limiter;
  }

  private ensureTick(): void {
    if (!this.cancelTick) this.cancelTick = this.timers.every(TICK_MS, () => this.tick());
  }

  private lookahead(): number {
    const hidden = typeof document !== "undefined" && document.hidden;
    return hidden ? LOOKAHEAD_HIDDEN : LOOKAHEAD;
  }

  /** Sekunden für Spielviertel g (nach dem neuesten Anker; gilt für alles noch nicht Eingeplante) */
  private timeOf(run: Run, g: number): number {
    const a = run.anchors[run.anchors.length - 1];
    return a.t + (g - a.g) * a.spq;
  }

  /** Spielviertel zur Audiozeit t */
  private gAt(run: Run, t: number): number {
    const k = Math.max(0, lastAtOrBefore(run.anchors, t, (a) => a.t));
    const a = run.anchors[k];
    return a.g + (t - a.t) / a.spq;
  }

  private segStart(run: Run, seg: number): number {
    return seg < 0 ? 0 : run.C + seg * run.L;
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const run = this.run;
    if (run) {
      this.schedule(run, now);
      if (run.done && now >= this.timeOf(run, run.endG) + RELEASE_TAIL) {
        this.finish(run);
      }
    }
    this.fading = this.fading.filter((f) => {
      if (now < f.until) return true;
      f.bus.disconnect();
      return false;
    });
    if (!this.run && !this.fading.length && this.cancelTick) {
      this.cancelTick();
      this.cancelTick = null;
      ctx.suspend().catch(() => {});
    }
  }

  private schedule(run: Run, now: number): void {
    const horizon = now + this.lookahead() + MAX_GAP;
    while (!run.done) {
      if (run.i >= run.segEvs.length) {
        // Schleife: der nächste Durchgang beginnt erst hinter dem Horizont → beim nächsten Mal weiter.
        // Sonst liefe ein Durchgang ohne Ereignisse (nur Pausen ohne Zählzeiten) hier endlos durch.
        if (this.loop && run.seg >= 0 && this.timeOf(run, this.segStart(run, run.seg + 1)) >= horizon) break;
        this.nextSegment(run);
        continue;
      }
      const ev = run.segEvs[run.i];
      const g = this.segStart(run, run.seg) + ev.g;
      if (this.timeOf(run, g) >= horizon) break;
      this.scheduleEvent(run, ev, g, now);
      run.scheduledG = Math.max(run.scheduledG, g);
      run.i++;
    }
    // Aufräumen: Verklungenes vergessen
    run.live = run.live.filter((l) => l.until > now);
    run.clicks = run.clicks.filter((c) => c.click.start > now - 1);
    // (Anker erst lange nach dem Hören vergessen: die Markierung fragt nach Zeiten vor currentTime)
    const k = lastAtOrBefore(run.anchors, now - 2, (a) => a.t);
    if (k > 0) run.anchors.splice(0, k);
  }

  private nextSegment(run: Run): void {
    if (run.seg >= 0 && !this.loop) {
      run.done = true;
      run.endG = this.segStart(run, run.seg) + run.L;
      return;
    }
    run.seg += 1;
    run.i = 0;
    run.segEvs = this.loop ? run.passWrap : run.passOnce;
  }

  private scheduleEvent(run: Run, ev: Ev, g: number, now: number): void {
    const t = Math.max(this.timeOf(run, g), now);
    const key = `${run.seg}:${"id" in ev ? ev.id : ""}`;
    if (ev.kind === "on") {
      if (!run.toneSynth) return; // ohne Melodie: nur Klicks
      const prevKey = `${run.seg}:${ev.id - 1}`;
      const bound = ev.legato ? run.voices.get(prevKey) : undefined;
      if (bound) {
        // Bindebogen: dieselbe Stimme klingt weiter, nur die Tonhöhe wechselt
        run.voices.delete(prevKey);
        bound.voice.glide(ev.midi, t, run.a4);
        run.voices.set(key, { voice: bound.voice, at: t });
      } else {
        run.voices.set(key, { voice: run.toneSynth.tone(ev.midi, t, run.a4), at: t });
      }
    } else if (ev.kind === "off") {
      const entry = run.voices.get(key);
      if (!entry) return;
      run.voices.delete(key);
      const { voice } = entry;
      const end = this.timeOf(run, g);
      const u = Math.max(end - gapSeconds(ev.gap, end - entry.at), voice.minEnd, now);
      voice.release(u);
      run.live.push({ voice, until: u + RELEASE_TAIL });
    } else if (!ev.metro || this.metronome) {
      run.clicks.push({ click: run.synth.click(t, ev.accent), metro: ev.metro });
    }
  }

  private finish(run: Run): void {
    this.run = null;
    run.cancelFrame?.();
    this.fading.push({ bus: run.bus, until: 0 });
    run.opts.onEnd?.();
  }

  /** Audiozeit, die zu hören ist, wenn das gerade gezeichnete Bild auf dem Schirm steht */
  private listenTime(): number {
    const c = outputClock(this.ctx!, this.timers.now?.() ?? performance.now());
    return c.audio + FRAME_LEAD;
  }

  private positionAt(run: Run, t: number): PlayerPosition {
    const g = this.gAt(run, t);
    const { tl, C, L } = run;
    if (g < C) {
      const k = lastAtOrBefore(run.countEvs, g, (e) => e.g);
      return { tone: null, bar: null, countIn: k >= 0 ? (k % perBar(tl)) + 1 : null, pass: 0, quarter: g - C };
    }
    if (g >= run.endG - EPS || L <= EPS) {
      return { tone: null, bar: null, countIn: null, pass: Math.max(0, run.seg), quarter: L };
    }
    const pass = Math.floor((g - C) / L + EPS);
    const q = Math.max(0, g - C - pass * L);
    const ti = lastAtOrBefore(tl.tones, q, (x) => x.start);
    const tn = ti >= 0 ? tl.tones[ti] : null;
    const tone = tn && q < tn.start + tn.dur - EPS ? ti : null;
    const bi = lastAtOrBefore(tl.bars, q, (b) => b.start);
    const bar = bi >= 0 && q < tl.bars[bi].start + tl.bars[bi].dur - EPS ? bi : null;
    return { tone, bar, countIn: null, pass, quarter: q };
  }

  private report(run: Run): void {
    const t = this.listenTime();
    const p = this.positionAt(run, t);
    const l = run.last;
    const started = l !== null || this.gAt(run, t) >= 0;
    if (started && !(l && l.tone === p.tone && l.bar === p.bar && l.countIn === p.countIn && l.pass === p.pass)) {
      run.last = p;
      run.opts.onPosition?.(p);
    }
    if (this.run === run) run.opts.onFrame?.(p);
  }
}

/** Der Abspieler der App (ein AudioContext für alles Vorspielen). */
export const songPlayer = new SongPlayer();
