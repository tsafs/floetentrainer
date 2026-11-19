// AudioWorklet des Mikrofons: misst im Audio-Thread, lückenlos und mit der genauen Zeit jedes Samples.
// Früher fragte die App alle 25 ms per setInterval den AnalyserNode ab: zwischen zwei Abfragen gingen
// Samples verloren (Fenster 21 ms, Abstand 25 ms), und wenn der Hauptthread ruckelte (Zeichnen, Android),
// kamen Messungen verspätet oder gar nicht. Hier entstehen die Messungen nach Sample-Zählung
// (./analyze.ts) und gehen gesammelt etwa alle 11 ms an die Seite; ruckelt dort etwas, kommen sie
// später an, bleiben aber vollständig und behalten ihre Zeit.
//
// Nachrichten an die Seite: { fine, coarse, end, audio? } – Messungen (RawMeasure) und die Sample-Nummer
// hinter dem letzten verarbeiteten Block (für die Uhr). Mit { type: "record", on } schickt das Worklet
// zusätzlich die rohen Samples mit (nur für das Testboard: Diagnose samt Ton).

import { COARSE_MS, FINE_HOP, FrameMaker, type RawMeasure } from "./analyze";

declare const sampleRate: number;
declare const currentFrame: number;
declare function registerProcessor(name: string, ctor: unknown): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

/** so viele 128er-Blöcke sammeln, dann senden (≈ 10,7 ms bei 48 kHz) */
const BATCH = 4;

class Capture extends AudioWorkletProcessor {
  private fine = new FrameMaker(sampleRate, FINE_HOP, true);
  private coarse = new FrameMaker(sampleRate, (sampleRate * COARSE_MS) / 1000, false);
  private pendFine: RawMeasure[] = [];
  private pendCoarse: RawMeasure[] = [];
  private rec: Float32Array[] | null = null;
  private recStart = 0;
  private blocks = 0;

  constructor() {
    super();
    this.port.onmessage = (e: MessageEvent) => {
      const d = e.data as { type?: string; on?: boolean };
      if (d?.type === "record") this.rec = d.on ? [] : null;
    };
  }

  process(inputs: Float32Array[][]): boolean {
    const ch = inputs[0]?.[0];
    if (ch && ch.length) {
      const start = currentFrame;
      for (const m of this.fine.push(ch, start)) this.pendFine.push(m);
      for (const m of this.coarse.push(ch, start)) this.pendCoarse.push(m);
      if (this.rec) {
        if (!this.rec.length) this.recStart = start;
        this.rec.push(ch.slice());
      }
    }
    if (++this.blocks >= BATCH) {
      this.blocks = 0;
      const msg: Record<string, unknown> = { fine: this.pendFine, coarse: this.pendCoarse, end: currentFrame + 128, sr: sampleRate };
      const transfer: ArrayBuffer[] = [];
      for (const m of this.pendFine) if (m.nsdf) transfer.push(m.nsdf.buffer as ArrayBuffer);
      if (this.rec && this.rec.length) {
        const n = this.rec.reduce((s, b) => s + b.length, 0);
        const a = new Float32Array(n);
        let o = 0;
        for (const b of this.rec) {
          a.set(b, o);
          o += b.length;
        }
        msg.audio = a;
        msg.audioStart = this.recStart;
        transfer.push(a.buffer);
        this.rec = [];
      }
      this.port.postMessage(msg, transfer);
      this.pendFine = [];
      this.pendCoarse = [];
    }
    return true;
  }
}

registerProcessor("floete-capture", Capture);
