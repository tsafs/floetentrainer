// Mikrofon und Tonhöhenerkennung (pitchy). Ein Mikrofon für die ganze App.

import { PitchDetector } from "pitchy";
import type { Frame } from "./judge";

const BUF = 2048;
const MIN_RMS = 0.006;
const INTERVAL_MS = 25;

type Listener = (f: Frame) => void;

export type MicError = "denied" | "unsupported" | "other";

class Mic {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private detector: PitchDetector<Float32Array> | null = null;
  private buf = new Float32Array(BUF);
  private timer: number | null = null;
  private listeners = new Set<Listener>();
  private starting: Promise<void> | null = null;

  get running(): boolean {
    return this.timer !== null;
  }

  /**
   * Muss direkt aus einem Tippen heraus aufgerufen werden: der AudioContext wird sofort angelegt
   * und fortgesetzt, danach wird das Mikrofon angefragt.
   */
  /** Läuft gerade ein Start (Erlaubnis-Abfrage)? */
  get pending(): Promise<void> | null {
    return this.starting;
  }

  start(): Promise<void> {
    if (this.running) {
      if (this.ctx?.state === "suspended") this.ctx.resume().catch(() => {});
      return Promise.resolve();
    }
    if (this.starting) return this.starting;
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx || !navigator.mediaDevices?.getUserMedia) return Promise.reject<void>("unsupported");
    this.ctx ??= new Ctx();
    this.ctx.resume().catch(() => {});
    this.starting = (async () => {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (e) {
        const name = (e as { name?: string })?.name;
        throw name === "NotAllowedError" || name === "SecurityError" ? "denied" : "other";
      }
      const ctx = this.ctx!;
      const src = ctx.createMediaStreamSource(this.stream);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = BUF;
      src.connect(this.analyser);
      this.detector = PitchDetector.forFloat32Array(BUF);
      this.detector.minVolumeDecibels = -45;
      this.timer = window.setInterval(() => this.tick(), INTERVAL_MS);
    })().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.analyser = null;
    this.ctx?.suspend().catch(() => {});
  }

  listen(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private tick(): void {
    if (!this.analyser || !this.detector || !this.ctx) return;
    this.analyser.getFloatTimeDomainData(this.buf);
    let sum = 0;
    for (let i = 0; i < this.buf.length; i++) sum += this.buf[i] * this.buf[i];
    const rms = Math.sqrt(sum / this.buf.length);
    const t = performance.now();
    let frame: Frame = { t, freq: null, clarity: 0, rms };
    if (rms >= MIN_RMS) {
      const [pitch, clarity] = this.detector.findPitch(this.buf, this.ctx.sampleRate);
      if (pitch > 0) frame = { t, freq: pitch, clarity, rms };
    }
    for (const l of this.listeners) l(frame);
  }
}

export const mic = new Mic();

// ---------------------------------------------------------------- Bildschirm wachhalten

let wakeLock: WakeLockSentinel | null = null;
let wantWake = false;

async function requestWake(): Promise<void> {
  try {
    if (!wantWake || wakeLock || !("wakeLock" in navigator)) return;
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => {
      wakeLock = null;
    });
  } catch {
    /* nicht erlaubt oder nicht unterstützt */
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") requestWake();
});

export function keepAwake(on: boolean): void {
  wantWake = on;
  if (on) requestWake();
  else {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  }
}
