// Mikrofon und Tonhöhenerkennung (pitchy bzw. ./mpm.ts). Ein Mikrofon für die ganze App.
//
// Seit dem 19.11.2026 misst ein AudioWorklet (./capture-worklet.ts) im Audio-Thread, lückenlos und mit
// der Zeit jedes Samples, in zwei Takten (./analyze.ts):
// - listen(): alle 25 ms wie bisher (Stimmgerät, Üben, Hören, Flöte einstellen, Bereit-Erkennung);
// - listenFine(): alle 256 Samples (≈ 5,3 ms) samt NSDF-Ausschnitt, fürs Mitspielen und den Abgleich der
//   Verzögerung.
// Ohne AudioWorklet (sehr alte Browser) bleibt es beim früheren Weg (setInterval + AnalyserNode); dann
// bekommt listenFine() dieselben 25-ms-Frames.
//
// Zeit der Frames: performance.now()-Uhr wie bisher. Das Worklet zählt Samples; die Seite rechnet die
// Sample-Nummer mit dem kleinsten bisher gesehenen Abstand „Ankunft − Sample-Zeit“ um (verspätet
// zugestellte Nachrichten verschieben so nichts), mit langsamem Nachführen gegen Uhrendrift.

import { PitchDetector } from "pitchy";
import workletUrl from "./capture-worklet.ts?worker&url";
import { FINE_HOP, type RawMeasure } from "./analyze";
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

/** Rohe Aufnahme (nur Testboard): Samples und Zeit des ersten Samples (performance.now-Uhr) */
export interface Recording {
  sampleRate: number;
  t0: number;
  samples: Float32Array;
}

/** höchstens so lange wird aufgenommen (≈ 23 MB bei 48 kHz) */
const MAX_REC_SEC = 120;

class Mic {
  private ctx: AudioContext | null = null;
  private node: AudioWorkletNode | null = null;
  private sink: GainNode | null = null;
  private fineListeners = new Set<Listener>();
  /** Abstand performance.now() − Sample-Zeit (ms), siehe Kopfkommentar */
  private offset: number | null = null;
  private lastMsg = 0;
  private rec: { chunks: Float32Array[]; n: number; start: number | null } | null = null;
  /** Messtakt von listenFine() in ms */
  fineMs = 25;
  /** misst das AudioWorklet (sonst der frühere Weg)? */
  worklet = false;
  private stream: MediaStream | null = null;
  private analyser: AnalyserNode | null = null;
  private detector: PitchDetector<Float32Array> | null = null;
  /** Messfenster in Samples (BUF); für Vergleichsmessungen in Tests umstellbar (setWindow) */
  private size = BUF;
  private buf = new Float32Array(BUF);
  private timer: number | null = null;
  private listeners = new Set<Listener>();
  private starting: Promise<void> | null = null;
  /** handOver(): das nächste stop() überspringen */
  private keepOnce = false;
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
      if (await this.startWorklet(ctx, src)) {
        // läuft: running prüft timer; hier ein Platzhalter, damit stop() und running gleich bleiben
        this.timer = window.setInterval(() => this.watch(), 1000);
        return;
      }
      this.analyser = ctx.createAnalyser();
      src.connect(this.analyser);
      this.setWindow(this.size);
      this.fineMs = INTERVAL_MS;
      this.timer = window.setInterval(() => this.tick(), INTERVAL_MS);
    })().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  /**
   * Seitenwechsel, bei dem die neue Seite das laufende (oder startende) Mikrofon übernimmt (Menü →
   * Stimmgerät): Das nächste stop() – die Aufräumfunktion der alten Seite – lässt es weiterlaufen.
   * endHandOver() nimmt das zurück, falls die alte Seite gar nicht stoppt.
   */
  handOver(): void {
    if (this.running || this.starting) this.keepOnce = true;
  }

  endHandOver(): void {
    this.keepOnce = false;
  }

  stop(): void {
    if (this.keepOnce) {
      this.keepOnce = false;
      return;
    }
    this.wanted = false;
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.analyser = null;
    this.node?.disconnect();
    this.node = null;
    this.sink?.disconnect();
    this.sink = null;
    this.worklet = false;
    this.rec = null;
    this.ctx?.suspend().catch(() => {});
  }

  /** Worklet anlegen; false, wenn es nicht geht (dann der frühere Weg) */
  private async startWorklet(ctx: AudioContext, src: MediaStreamAudioSourceNode): Promise<boolean> {
    if (!ctx.audioWorklet || typeof AudioWorkletNode === "undefined" || (window as unknown as { __noWorklet?: boolean }).__noWorklet) return false;
    try {
      await ctx.audioWorklet.addModule(workletUrl);
      if (!this.wanted || this.stream === null) return false;
      const node = new AudioWorkletNode(ctx, "floete-capture", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: "explicit" });
      node.port.onmessage = (e) => this.onMessage(e.data);
      src.connect(node);
      // ohne Verbindung zum Ausgang rechnen manche Browser den Knoten nicht; stumm angeschlossen
      const sink = ctx.createGain();
      sink.gain.value = 0;
      node.connect(sink).connect(ctx.destination);
      this.node = node;
      this.sink = sink;
      this.offset = null;
      this.worklet = true;
      this.fineMs = (FINE_HOP / ctx.sampleRate) * 1000;
      return true;
    } catch {
      return false;
    }
  }

  /** Worklet-Nachricht: Uhr nachführen, Frames verteilen, Aufnahme sammeln */
  private onMessage(d: { fine: RawMeasure[]; coarse: RawMeasure[]; end: number; sr: number; audio?: Float32Array; audioStart?: number }): void {
    const now = performance.now();
    const cand = now - (d.end / d.sr) * 1000;
    // kleinster Abstand; langsam (1 ms je Sekunde) nachgeben, falls die Uhren auseinanderlaufen
    if (this.offset === null) this.offset = cand;
    else this.offset = Math.min(cand, this.offset + (now - this.lastMsg) * 0.001);
    this.lastMsg = now;
    const at = (end: number) => this.offset! + (end / d.sr) * 1000;
    const frame = (m: RawMeasure, fine: boolean): Frame => {
      const t = at(m.end);
      if (!(m.freq > 0)) return { t, freq: null, clarity: 0, rms: m.rms };
      const f: Frame = { t, freq: m.freq, clarity: m.clarity, rms: m.rms };
      if (fine && m.nsdf) {
        f.nsdf = m.nsdf;
        f.lag0 = m.lag0;
        f.sr = d.sr;
      }
      return f;
    };
    for (const m of d.coarse) {
      const f = frame(m, false);
      for (const l of this.listeners) l(f);
    }
    for (const m of d.fine) {
      const f = frame(m, true);
      for (const l of this.fineListeners) l(f);
    }
    if (d.audio && this.rec) {
      this.rec.start ??= at(d.audioStart ?? 0);
      if (this.rec.n < MAX_REC_SEC * d.sr) {
        this.rec.chunks.push(d.audio);
        this.rec.n += d.audio.length;
      }
    }
  }

  /** Läuft das Worklet noch? (Kontext von Android angehalten: fortsetzen) */
  private watch(): void {
    if (this.ctx?.state === "suspended" && this.wanted) this.ctx.resume().catch(() => {});
  }

  /** Feine Messungen (≈ 5 ms, ohne Worklet 25 ms) */
  listenFine(fn: Listener): () => void {
    this.fineListeners.add(fn);
    return () => this.fineListeners.delete(fn);
  }

  /** Rohe Aufnahme beginnen (nur mit Worklet; Testboard). false, wenn nicht möglich. */
  startRecording(): boolean {
    if (!this.node) return false;
    this.rec = { chunks: [], n: 0, start: null };
    this.node.port.postMessage({ type: "record", on: true });
    return true;
  }

  /** Aufnahme beenden und zurückgeben (null ohne Aufnahme) */
  stopRecording(): Recording | null {
    const r = this.rec;
    this.rec = null;
    this.node?.port.postMessage({ type: "record", on: false });
    if (!r || !this.ctx || r.start === null) return null;
    const samples = new Float32Array(r.n);
    let o = 0;
    for (const c of r.chunks) {
      samples.set(c.subarray(0, Math.min(c.length, r.n - o)), o);
      o += c.length;
      if (o >= r.n) break;
    }
    return { sampleRate: this.ctx.sampleRate, t0: r.start, samples };
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
    const out: Record<string, unknown> = { windowSamples: this.size, intervalMs: INTERVAL_MS, minRms: MIN_RMS, worklet: this.worklet, fineMs: this.fineMs };
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
    // ohne Worklet: dieselben Frames für beide Takte
    const fine = this.fineListeners;
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
    for (const l of fine) l(frame);
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
