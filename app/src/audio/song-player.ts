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
// Positionsmeldungen für die Oberfläche kommen aus requestAnimationFrame, abgeleitet aus currentTime.
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
/** Trennung zwischen Tonwiederholungen (s), höchstens 30 % des Tons */
export const REPEAT_GAP = 0.06;
export const REPEAT_MAX_SHARE = 0.3;
const MAX_GAP = BREATH_GAP;
/** Ausblenden beim Stopp (s) */
export const FADE = 0.04;
/** Lautstärke am Ausgang */
const OUT_GAIN = 0.9;
const EPS = 1e-6;

/** Zeitgeber, austauschbar für Tests. Beide geben eine Abbruch-Funktion zurück. */
export interface PlayerTimers {
  /** fn alle `ms` Millisekunden aufrufen */
  every(ms: number, fn: () => void): () => void;
  /** fn einmal beim nächsten Bild aufrufen (requestAnimationFrame) */
  frame(fn: () => void): () => void;
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
  /** beim Einzählen die Zählzeit (1, 2, …), sonst null */
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
  /** wird aufgerufen, wenn sich Ton, Takt, Zählzeit oder Durchgang ändern */
  onPosition?: (p: PlayerPosition) => void;
  /** am Ende (nicht bei Schleife und nicht nach stop) */
  onEnd?: () => void;
}

type Gap = "none" | "repeat" | "breath";

/** Ereignis in einem Abschnitt (Einzähltakt oder Durchgang), g relativ zum Abschnittsbeginn */
type Ev =
  | { kind: "off"; g: number; id: number; gap: Gap }
  | { kind: "click"; g: number; accent: boolean; metro: boolean }
  | { kind: "on"; g: number; id: number; midi: number };

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
  return new Ctx();
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
  if (gap === "repeat") return Math.min(REPEAT_GAP, REPEAT_MAX_SHARE * durSec);
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
  idx.forEach((ti, j) => {
    const t = tl.tones[ti];
    const end = Math.min(t.start + t.dur, L);
    let next: { start: number; midi: number } | null = null;
    if (j + 1 < idx.length) next = tl.tones[idx[j + 1]];
    else if (wrap && idx.length) next = { start: tl.tones[idx[0]].start + L, midi: tl.tones[idx[0]].midi };
    let gap: Gap = "none";
    if (t.breathAfter) gap = "breath";
    else if (next && Math.abs(next.start - end) < EPS && next.midi === t.midi) gap = "repeat";
    evs.push({ kind: "on", g: t.start, id: j, midi: t.midi });
    evs.push({ kind: "off", g: end, id: j, gap });
  });
  tl.bars.forEach((b, bi) => {
    const pickup = bi === 0 && b.dur < tl.countInDur - EPS;
    b.beats.forEach((beat, k) => {
      const q = b.start + beat;
      if (q < L - EPS) evs.push({ kind: "click", g: q, accent: k === 0 && !pickup, metro: true });
    });
  });
  return sortEvents(evs);
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
  synth: FluteSynth;
  /** Länge eines Durchgangs in Vierteln */
  L: number;
  /** Länge des Einzähltakts (0 ohne Einzählen) */
  C: number;
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
  voices: Map<string, Voice>;
  live: { voice: Voice; until: number }[];
  clicks: { click: Click; metro: boolean }[];
  last: PlayerPosition | null;
  cancelFrame: (() => void) | null;
}

export class SongPlayer {
  private ctx: AudioContext | null = null;
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
    bus.connect(ctx.destination);
    const countEvs: Ev[] = withCount
      ? tl.countIn.map((g, k) => ({ kind: "click", g, accent: k === 0, metro: false }) as Ev)
      : [];
    const run: Run = {
      tl,
      opts,
      a4: opts.a4 ?? 440,
      bus,
      synth: new FluteSynth(ctx, bus),
      L,
      C: withCount ? tl.countInDur : 0,
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
    for (const v of run.voices.values()) v.cut(end + 0.01);
    for (const { voice } of run.live) voice.cut(end + 0.01);
    for (const { click } of run.clicks) click.cut(end + 0.01);
    this.fading.push({ bus: run.bus, until: end + 0.05 });
    this.ensureTick();
  }

  /** Tempo ändern, auch während des Spielens (ohne Sprung). */
  setTempo(secPerQuarter: number): void {
    if (!(secPerQuarter > 0)) return;
    this.spq = secPerQuarter;
    const run = this.run;
    if (!run || !this.ctx) return;
    const now = this.ctx.currentTime;
    const gA = Math.max(run.scheduledG, this.gAt(run, now));
    const last = run.anchors[run.anchors.length - 1];
    if (Math.abs(gA - last.g) < EPS) {
      last.spq = secPerQuarter;
      return;
    }
    run.anchors.push({ t: this.timeOf(run, gA), g: gA, spq: secPerQuarter });
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
    const k = lastAtOrBefore(run.anchors, now, (a) => a.t);
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
      run.voices.set(key, run.synth.tone(ev.midi, t, run.a4));
    } else if (ev.kind === "off") {
      const voice = run.voices.get(key);
      if (!voice) return;
      run.voices.delete(key);
      const end = this.timeOf(run, g);
      const u = Math.max(end - gapSeconds(ev.gap, end - voice.start), voice.minEnd, now);
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

  /** Zeit, zu der man gerade hört (Ausgabeverzögerung abgezogen) */
  private listenTime(): number {
    const ctx = this.ctx!;
    return ctx.currentTime - (ctx.outputLatency || 0);
  }

  private positionAt(run: Run, t: number): PlayerPosition {
    const g = this.gAt(run, t);
    const { tl, C, L } = run;
    if (g < C) {
      const k = lastAtOrBefore(run.countEvs, g, (e) => e.g);
      return { tone: null, bar: null, countIn: k >= 0 ? k + 1 : null, pass: 0, quarter: g - C };
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
    if (run.last === null && this.gAt(run, t) < 0) return; // noch nicht angefangen
    const p = this.positionAt(run, t);
    const l = run.last;
    if (l && l.tone === p.tone && l.bar === p.bar && l.countIn === p.countIn && l.pass === p.pass) return;
    run.last = p;
    run.opts.onPosition?.(p);
  }
}

/** Der Abspieler der App (ein AudioContext für alles Vorspielen). */
export const songPlayer = new SongPlayer();
