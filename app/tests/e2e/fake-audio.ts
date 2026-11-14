// Audio-Attrappe für Browser-Tests des Vorspielens.
//
// Als Init-Skript eingesetzt (`page.addInitScript(FAKE_AUDIO)`), ersetzt sie window.AudioContext durch
// eine Unterklasse des echten AudioContext mit vorgetäuschter Uhr:
// - `currentTime` folgt performance.now() (Standard; zusammen mit `page.clock` voll steuerbar) oder,
//   mit `{ clock: "manual" }`, nur `window.__fakeAudio.advance(s)` bzw. `.set(s)`.
//   Während `suspend()` steht die Uhr wie beim echten Kontext.
// - Jeder gestartete Oszillator und jede Rauschquelle wird in `window.__audioLog` protokolliert:
//   { kind: "tone" | "click" | "noise", freq, start, stop } (Zeiten auf der vorgetäuschten Uhr).
//   `stop` ist das Ende des Knotens: bei Tönen Tonende + Ausklingen (RELEASE_TAIL = 0,04 s).
// - getOutputTimestamp passt zur vorgetäuschten Uhr: contextTime = currentTime minus outputLatency und
//   baseLatency (beide hier 0; ein Test kann outputLatency in einer Unterklasse überschreiben),
//   performanceTime = performance.now().
// - Begrenzer (DynamicsCompressorNode) und alle übrigen Knoten sind echte Knoten; angelegte Begrenzer
//   stehen mit ihren Einstellungen in `window.__audioLimiters`.
//   Flötentöne erkennt sie an der eigenen Wellenform ("custom"), Klicks am Sinus (siehe flute-synth.ts).
// - Gebundene Töne (Bindebogen) laufen auf demselben Oszillator weiter, nur die Tonhöhe gleitet
//   (setValueAtTime + exponentialRampToValueAtTime auf `frequency`, siehe Voice.glide). Jeder solche
//   Wechsel wird als eigener Ton protokolliert: { kind: "tone", freq: Zielhöhe, start: Beginn des
//   Gleitens, legato: true }. Der Ton davor bekommt als `stop` diesen Beginn; der letzte das Knotenende.
//   Wechsel, die erst nach einem harten Stopp kämen, bekommen stop = start (wie abgesagte Töne).
// Die Knoten selbst bleiben echte Web-Audio-Knoten (headless harmlos), damit ein echtes Mikrofon bzw.
// FAKE_MIC daneben weiter funktioniert. Der echte Kontext bleibt als `window.__RealAudioContext`.
import type { Page } from "@playwright/test";

export interface AudioLogEntry {
  kind: "tone" | "click" | "noise";
  freq: number | null;
  start: number;
  stop: number | null;
  /** gebundener Tonwechsel auf einem schon klingenden Oszillator (Bindebogen) */
  legato?: boolean;
}

export const FAKE_AUDIO = (opts?: { clock?: "manual" | "performance" }) => {
  type Entry = { kind: string; freq: number | null; start: number; stop: number | null; legato?: boolean };
  const w = window as unknown as Record<string, unknown>;
  const Real = w.AudioContext as typeof AudioContext | undefined;
  if (!Real || w.__RealAudioContext) return;
  w.__RealAudioContext = Real;
  const log: Entry[] = [];
  w.__audioLog = log;
  w.__audioLimiters = [];
  const manual = opts?.clock === "manual";
  let manualTime = 0;
  const clock = () => (manual ? manualTime : performance.now() / 1000);
  w.__fakeAudio = {
    advance(sec: number) {
      manualTime += sec;
    },
    set(sec: number) {
      manualTime = sec;
    },
  };

  type Src = AudioScheduledSourceNode & { start(when?: number, offset?: number): void };
  /** Protokoll eines Knotens; gibt die Liste seiner Einträge zurück (mehrere bei gebundenen Tönen) */
  const track = (node: Src, kind: () => string, freq: () => number | null) => {
    const start = node.start.bind(node);
    const stop = node.stop.bind(node);
    const entries: Entry[] = [];
    node.start = (when = 0, offset?: number) => {
      const entry = { kind: kind(), freq: freq(), start: when, stop: null };
      entries.push(entry);
      log.push(entry);
      if (offset === undefined) start(when);
      else start(when, offset);
    };
    node.stop = (when = 0) => {
      entries.forEach((e, k) => {
        if (k === 0 || e.start < when) {
          if (e.stop === null || e.stop > when) e.stop = when;
        } else e.stop = e.start; // kommt erst nach dem Ende: erklingt nicht
      });
      stop(when);
    };
    return entries;
  };

  /** Gebundene Tonwechsel auf der Frequenz eines Flötentons mitschreiben (Voice.glide) */
  const trackGlides = (o: OscillatorNode, entries: Entry[]) => {
    const f = o.frequency;
    const set = f.setValueAtTime.bind(f);
    const ramp = f.exponentialRampToValueAtTime.bind(f);
    let setAt: number | null = null;
    f.setValueAtTime = (value: number, time: number) => {
      setAt = time;
      return set(value, time);
    };
    f.exponentialRampToValueAtTime = (value: number, time: number) => {
      const prev = entries[entries.length - 1];
      if (prev && o.type === "custom" && setAt !== null) {
        if (prev.stop === null || prev.stop > setAt) prev.stop = setAt;
        const entry: Entry = { kind: "tone", freq: value, start: setAt, stop: null, legato: true };
        entries.push(entry);
        log.push(entry);
      }
      setAt = null;
      return ramp(value, time);
    };
  };

  class FakeAudioContext extends Real {
    fakeAcc: number;
    fakeSince: number | null;
    constructor(o?: AudioContextOptions) {
      super(o);
      this.fakeAcc = 0;
      this.fakeSince = clock();
    }
    resume() {
      if (this.fakeSince === null) this.fakeSince = clock();
      return super.resume().catch(() => {});
    }
    suspend() {
      if (this.fakeSince !== null) this.fakeAcc += clock() - this.fakeSince;
      this.fakeSince = null;
      return super.suspend().catch(() => {});
    }
    createOscillator() {
      const o = super.createOscillator();
      const entries = track(o as Src, () => (o.type === "custom" ? "tone" : "click"), () => o.frequency.value);
      trackGlides(o, entries);
      return o;
    }
    createBufferSource() {
      const s = super.createBufferSource();
      track(s as Src, () => "noise", () => null);
      return s;
    }
    createDynamicsCompressor() {
      const c = super.createDynamicsCompressor();
      (w.__audioLimiters as DynamicsCompressorNode[]).push(c);
      return c;
    }
    getOutputTimestamp(): AudioTimestamp {
      const t = this.currentTime - (this.outputLatency || 0) - (this.baseLatency || 0);
      return { contextTime: Math.max(0, t), performanceTime: performance.now() };
    }
  }
  // currentTime & Co. sind im echten Kontext Getter auf dem Prototyp; hier überdecken
  Object.defineProperty(FakeAudioContext.prototype, "currentTime", {
    get(this: FakeAudioContext) {
      return this.fakeAcc + (this.fakeSince === null ? 0 : clock() - this.fakeSince);
    },
  });
  for (const k of ["outputLatency", "baseLatency"]) Object.defineProperty(FakeAudioContext.prototype, k, { get: () => 0 });
  w.AudioContext = FakeAudioContext;
  w.webkitAudioContext = FakeAudioContext;
};

/** Protokoll der eingeplanten Töne/Klicks (ohne Rauschen) */
export async function audioLog(page: Page, kind?: "tone" | "click"): Promise<AudioLogEntry[]> {
  const all = await page.evaluate(() => (window as unknown as { __audioLog: AudioLogEntry[] }).__audioLog);
  return all.filter((e) => (kind ? e.kind === kind : e.kind !== "noise"));
}

/** Vorgetäuschte Audio-Uhr weiterstellen (nur mit `{ clock: "manual" }`) */
export async function advanceAudio(page: Page, sec: number): Promise<void> {
  await page.evaluate((s) => (window as unknown as { __fakeAudio: { advance(s: number): void } }).__fakeAudio.advance(s), sec);
}
