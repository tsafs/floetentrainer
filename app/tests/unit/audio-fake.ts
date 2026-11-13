// Gefälschter AudioContext und gefälschte Zeitgeber für die Tests des Abspielers.
// Der Kontext merkt sich jeden Knoten und jede Automatisierung; die Uhr läuft nur, wenn der Test sie
// mit `advance` weiterstellt. Dabei laufen auch die Vorausschau-Schleife und die Bild-Rückrufe.

import type { PlayerTimers } from "../../src/audio/song-player";

export interface ParamEvent {
  type: "set" | "linear" | "exp" | "target";
  value: number;
  time: number;
}

export class FakeParam {
  events: ParamEvent[] = [];
  constructor(public value = 0) {}
  setValueAtTime(value: number, time: number) {
    this.events.push({ type: "set", value, time });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number) {
    this.events.push({ type: "linear", value, time });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number) {
    if (value <= 0) throw new RangeError("exponentialRamp braucht einen Wert > 0");
    this.events.push({ type: "exp", value, time });
    return this;
  }
  setTargetAtTime(value: number, time: number, _tau: number) {
    this.events.push({ type: "target", value, time });
    return this;
  }
  cancelScheduledValues(time: number) {
    this.events = this.events.filter((e) => e.time < time);
    return this;
  }
}

export class FakeNode {
  outs: FakeNode[] = [];
  disconnected = false;
  constructor(public ctx: FakeAudioContext) {}
  connect<T>(n: T): T {
    this.outs.push(n as unknown as FakeNode);
    return n;
  }
  disconnect() {
    this.disconnected = true;
    this.outs = [];
  }
}

export class FakeGain extends FakeNode {
  gain = new FakeParam(1);
}

export class FakeFilter extends FakeNode {
  type = "lowpass";
  frequency = new FakeParam(350);
  Q = new FakeParam(1);
}

class FakeSource extends FakeNode {
  startAt: number | null = null;
  stopAt: number | null = null;
  start(t = 0) {
    if (this.startAt !== null) throw new Error("start zweimal");
    if (t < 0) throw new RangeError("negative Zeit");
    this.startAt = t;
  }
  stop(t = 0) {
    if (this.startAt === null) throw new Error("stop vor start");
    this.stopAt = t;
  }
}

export class FakeOsc extends FakeSource {
  type = "sine";
  frequency = new FakeParam(440);
  detune = new FakeParam(0);
  setPeriodicWave() {
    this.type = "custom";
  }
}

export class FakeBufferSource extends FakeSource {
  buffer: unknown = null;
  loop = false;
}

export class FakeAudioContext {
  currentTime = 0;
  state: "running" | "suspended" | "closed" = "suspended";
  sampleRate = 8000;
  destination = new FakeNode(this);
  oscs: FakeOsc[] = [];
  gains: FakeGain[] = [];
  resumes = 0;
  suspends = 0;

  resume() {
    this.resumes++;
    this.state = "running";
    return Promise.resolve();
  }
  suspend() {
    this.suspends++;
    this.state = "suspended";
    return Promise.resolve();
  }
  createGain() {
    const g = new FakeGain(this);
    this.gains.push(g);
    return g;
  }
  createOscillator() {
    const o = new FakeOsc(this);
    this.oscs.push(o);
    return o;
  }
  createBiquadFilter() {
    return new FakeFilter(this);
  }
  createBufferSource() {
    return new FakeBufferSource(this);
  }
  createBuffer(_ch: number, len: number) {
    const data = new Float32Array(len);
    return { getChannelData: () => data };
  }
  createPeriodicWave() {
    return {};
  }

  /** Flötentöne (eigene Wellenform) mit Beginn, Ende (Beginn des Ausklingens) und Frequenz */
  tones() {
    return this.oscs
      .filter((o) => o.type === "custom")
      .map((o) => {
        const env = o.outs[0] as FakeGain;
        const rel = env.gain.events.find((e) => e.type === "target" && e.value === 0);
        return { freq: o.frequency.value, start: o.startAt!, end: rel ? rel.time : null, stop: o.stopAt };
      });
  }

  /** Klicks (Sinus) mit Beginn und Frequenz */
  clicks() {
    return this.oscs.filter((o) => o.type === "sine").map((o) => ({ freq: o.frequency.value, start: o.startAt!, stop: o.stopAt! }));
  }
}

/** Zeitgeber, die nur auf Befehl laufen. */
export class FakeTimers implements PlayerTimers {
  private intervals = new Map<number, { fn: () => void; ms: number }>();
  private frames = new Map<number, () => void>();
  private nextId = 1;

  every(ms: number, fn: () => void) {
    const id = this.nextId++;
    this.intervals.set(id, { fn, ms });
    return () => this.intervals.delete(id);
  }
  frame(fn: () => void) {
    const id = this.nextId++;
    this.frames.set(id, fn);
    return () => this.frames.delete(id);
  }
  get active() {
    return this.intervals.size;
  }
  runInterval() {
    for (const { fn } of [...this.intervals.values()]) fn();
  }
  runFrames() {
    const fs = [...this.frames.values()];
    this.frames.clear();
    for (const f of fs) f();
  }
}

/** Kontext und Zeitgeber zusammen: `advance` stellt die Audio-Uhr in 25-ms-Schritten weiter. */
export class Harness {
  ctx = new FakeAudioContext();
  timers = new FakeTimers();
  created = 0;
  env = {
    createContext: () => {
      this.created++;
      return this.ctx as unknown as AudioContext;
    },
    timers: this.timers,
  };
  advance(sec: number, stepMs = 25) {
    const end = this.ctx.currentTime + sec;
    while (this.ctx.currentTime < end - 1e-9) {
      this.ctx.currentTime = Math.min(end, this.ctx.currentTime + stepMs / 1000);
      this.timers.runInterval();
      this.timers.runFrames();
    }
  }
}
