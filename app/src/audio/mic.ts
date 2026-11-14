// Mikrofon und Tonhöhenerkennung (pitchy). Ein Mikrofon für die ganze App.

import { PitchDetector } from "pitchy";
import type { Frame } from "./judge";

/**
 * Messfenster: die jüngsten 1024 Samples (≈ 21 ms bei 48 kHz, 23 ms bei 44,1 kHz), früher 2048
 * (≈ 43 ms). Anlass (Rückmeldung vom 14.11.2026): Beim schnellen Wechsel g¹–a¹–h¹ überspannte das lange
 * Fenster den Tonwechsel, pitchy lieferte einen Wert dazwischen (gis¹, b¹) mit voller Klarheit. Weil
 * das Fenster jetzt kürzer ist als der Abstand der Messungen (25 ms), überlappen sich zwei Fenster nicht
 * mehr: Ein Tonwechsel kann höchstens eine Messung verfälschen. Synthetische Messung (Flötenklang mit
 * Obertönen und Rauschen, Wechsel an zufälliger Stelle zwischen zwei Messungen, je 1400 Wechsel):
 * Wechsel mit Zwischenwert 61 % → 31 %, mit zwei Zwischenwerten in Folge 2,1 % → 0 %.
 * Genauigkeit bleibt: Die Sopranflöte klingt ab 523 Hz, das sind mindestens 11 Perioden im Fenster.
 * Für c¹–d³ (523–2349 Hz) bei leichtem bis kräftigem Rauschen höchstens 1–7 Cent Fehler (2048: 1–6),
 * Klarheit mindestens 0,977 (2048: 0,979); die Klarheit fällt bei beiden Fenstern erst bei sehr starkem
 * Rauschen unter 0,9, an derselben Stelle. Die Klarheitsschwelle (0,9) bleibt daher (beim Mitspielen seit
 * dem 14.11.2026 0,85, siehe ./follow.ts).
 */
const BUF = 1024;
const MIN_RMS = 0.006;
/** Messungen alle 25 ms: unverändert (Haltedauern, Aussetzer- und Einsatzregeln rechnen damit) */
const INTERVAL_MS = 25;

type Listener = (f: Frame) => void;

export type MicError = "denied" | "unsupported" | "other";

class Mic {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private detector: PitchDetector<Float32Array> | null = null;
  /** Messfenster in Samples (BUF); für Vergleichsmessungen in Tests umstellbar (setWindow) */
  private size = BUF;
  private buf = new Float32Array(BUF);
  private timer: number | null = null;
  private listeners = new Set<Listener>();
  private starting: Promise<void> | null = null;
  /**
   * Soll das Mikrofon laufen? stop() während der Erlaubnis-Abfrage setzt es zurück; der Strom, der
   * danach noch ankommt, wird gleich wieder freigegeben (sonst bliebe das Mikrofon unbemerkt an,
   * z. B. bei schnellem Doppeltipp auf Start/Stopp).
   */
  private wanted = false;

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
    this.wanted = true;
    if (this.running) {
      if (this.ctx?.state === "suspended") this.ctx.resume().catch(() => {});
      return Promise.resolve();
    }
    if (this.starting) {
      this.ctx?.resume().catch(() => {});
      return this.starting;
    }
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctx || !navigator.mediaDevices?.getUserMedia) return Promise.reject<void>("unsupported");
    this.ctx ??= new Ctx();
    this.ctx.resume().catch(() => {});
    this.starting = (async () => {
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        });
      } catch (e) {
        const name = (e as { name?: string })?.name;
        throw name === "NotAllowedError" || name === "SecurityError" ? "denied" : "other";
      }
      if (!this.wanted) {
        // inzwischen gestoppt
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      this.stream = stream;
      const ctx = this.ctx!;
      const src = ctx.createMediaStreamSource(this.stream);
      this.analyser = ctx.createAnalyser();
      src.connect(this.analyser);
      this.setWindow(this.size);
      this.timer = window.setInterval(() => this.tick(), INTERVAL_MS);
    })().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  stop(): void {
    this.wanted = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.analyser = null;
    this.ctx?.suspend().catch(() => {});
  }

  /**
   * Messfenster umstellen (Zweierpotenz 32–32768; das AnalyserNode liefert die jüngsten n Samples).
   * Nur für Vergleichsmessungen in Tests (tests/e2e/play.spec.ts), die App nutzt immer BUF.
   */
  setWindow(n: number): void {
    this.size = n;
    this.buf = new Float32Array(n);
    this.detector = PitchDetector.forFloat32Array(n);
    this.detector.minVolumeDecibels = -45;
    if (this.analyser) this.analyser.fftSize = n;
  }

  /**
   * Angaben zum Mikrofon für die Diagnose-Aufnahme (../audio/diagnose.ts): Einstellungen der Spur,
   * deren Statistik (Chrome: MediaStreamTrack.stats mit Eingangs-Verzögerung, falls vorhanden) und die
   * gemeldeten Verzögerungen des AudioContext. Nur Messwerte, kein Ton.
   */
  info(): Record<string, unknown> {
    const track = this.stream?.getAudioTracks()[0];
    const out: Record<string, unknown> = { windowSamples: this.size, intervalMs: INTERVAL_MS, minRms: MIN_RMS };
    try {
      if (track) {
        out.trackSettings = track.getSettings();
        out.trackLabel = track.label;
        const stats = (track as unknown as { stats?: Record<string, unknown> }).stats;
        if (stats) {
          const s: Record<string, unknown> = {};
          for (const k of ["deliveredFrames", "deliveredFramesDuration", "totalFrames", "totalFramesDuration", "latency", "averageLatency", "minimumLatency", "maximumLatency"]) {
            if (k in stats) s[k] = stats[k];
          }
          out.trackStats = s;
        }
      }
      if (this.ctx) {
        out.context = { sampleRate: this.ctx.sampleRate, baseLatency: this.ctx.baseLatency, outputLatency: this.ctx.outputLatency, state: this.ctx.state };
      }
    } catch {
      /* nicht unterstützt */
    }
    return out;
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
