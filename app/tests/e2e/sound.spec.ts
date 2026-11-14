// Klang des Vorspielens, offline gerendert (OfflineAudioContext in Chromium): Pegel und Knackser.
//
// Der echte Abspieler (die Klasse von __lied.player) spielt in einen OfflineAudioContext. Damit seine
// Vorausschau-Schleife wie in Echtzeit läuft, hält das Rendern alle 25 ms an (suspend), die Uhr
// (currentTime) wird weitergestellt und Schleife und Bild-Rückruf laufen einmal – so wird auch wie
// sonst erst kurz vorher eingeplant und am Ende der Ausgang abgehängt.
// Geprüft wird die fertige Wellenform: Spitzenpegel (Begrenzer) und Sprünge. Sprünge findet ein steiler
// Hochpass (4 × 2. Ordnung bei 14 kHz): Flötentöne haben dort fast nichts, ein Sprung in der
// Wellenform dagegen viel. Das Anblasgeräusch ist für diese Messung stumm geschaltet (Rauschen hat
// selbst Anteile dort), Klicks ebenfalls (ihr Einsatz ist absichtlich steil).
import { expect, test } from "@playwright/test";
import { sampleData } from "./seed";
import { seed } from "./util";

interface Result {
  peak: number;
  rms: number;
  /** größter Hochpass-Ausschlag ±1 ms um jedes Tonende (Anhalten der Knoten) bzw. insgesamt */
  hfAtStops: number;
  hf: number;
  stops: number;
}

async function render(page: import("@playwright/test").Page, song: string, o: { spq: number; metronome: boolean; noise: boolean; seconds: number }) {
  await seed(page, sampleData());
  await page.goto(`./#/lied/${song}`);
  await expect(page.locator(".score svg.sys").first()).toBeVisible();
  return page.evaluate(async (o): Promise<Result> => {
    type P = { play(tl: unknown, opts: unknown): void };
    const lied = (window as unknown as { __lied: { player: object; full: unknown } }).__lied;
    const tl = lied.full;
    const sr = 48000;
    const off = new OfflineAudioContext(1, Math.ceil(sr * o.seconds), sr);
    let now = 0;
    const stops: number[] = [];
    const wrap = <T extends AudioScheduledSourceNode>(n: T, mute: boolean, flute: () => boolean): T => {
      const st = n.start.bind(n) as (t?: number, ...a: number[]) => void;
      const sp = n.stop.bind(n);
      const cn = n.connect.bind(n) as (d: AudioNode) => AudioNode;
      (n as unknown as { start: unknown }).start = (t = 0, ...a: number[]) => st(t, ...a);
      (n as unknown as { stop: unknown }).stop = (t = 0) => {
        if (flute()) stops.push(t);
        sp(t);
      };
      (n as unknown as { connect: unknown }).connect = (d: AudioNode) => (mute ? d : cn(d));
      return n;
    };
    const ctx = new Proxy(off, {
      get(t, k) {
        if (k === "currentTime") return now;
        if (k === "state") return "running";
        if (k === "resume" || k === "suspend") return () => Promise.resolve();
        if (k === "outputLatency" || k === "baseLatency") return 0;
        if (k === "getOutputTimestamp") return undefined;
        if (k === "createBufferSource") return () => wrap(t.createBufferSource(), !o.noise, () => false);
        if (k === "createOscillator")
          return () => {
            const osc = t.createOscillator();
            const sw = osc.setPeriodicWave.bind(osc);
            let flute = false;
            osc.setPeriodicWave = (w: PeriodicWave) => {
              flute = true;
              sw(w);
            };
            return wrap(osc, false, () => flute);
          };
        const v = Reflect.get(t, k, t);
        return typeof v === "function" ? v.bind(t) : v;
      },
    }) as unknown as AudioContext;
    let iv: (() => void)[] = [];
    let fr: (() => void)[] = [];
    const timers = {
      every(_ms: number, fn: () => void) {
        iv.push(fn);
        return () => (iv = iv.filter((f) => f !== fn));
      },
      frame(fn: () => void) {
        fr.push(fn);
        return () => (fr = fr.filter((f) => f !== fn));
      },
    };
    const Player = lied.player.constructor as new (env: unknown) => P;
    const p = new Player({ createContext: () => ctx, timers });
    // ohne Metronom auch ohne Einzählen: dann gar keine Klicks
    p.play(tl, { secPerQuarter: o.spq, metronome: o.metronome, countIn: o.metronome });
    const STEP = 0.025;
    for (let k = 1; k < o.seconds / STEP - 1; k++) {
      off.suspend(k * STEP).then(() => {
        now = k * STEP;
        for (const f of [...iv]) f();
        const fs = fr;
        fr = [];
        for (const f of fs) f();
        off.resume();
      });
    }
    const x = (await off.startRendering()).getChannelData(0);
    let peak = 0;
    let sq = 0;
    let n = 0;
    for (const v of x) {
      peak = Math.max(peak, Math.abs(v));
      if (Math.abs(v) > 1e-3) {
        sq += v * v;
        n++;
      }
    }
    // Hochpass 4 × 2. Ordnung bei 14 kHz
    let h = x;
    for (let s = 0; s < 4; s++) {
      const w = (2 * Math.PI * 14000) / sr;
      const al = Math.sin(w) / (2 * Math.SQRT1_2);
      const c = Math.cos(w);
      const [b0, b1, b2, a0, a1, a2] = [(1 + c) / 2, -(1 + c), (1 + c) / 2, 1 + al, -2 * c, 1 - al];
      const y = new Float32Array(h.length);
      let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
      for (let i = 0; i < h.length; i++) {
        const v = (b0 * h[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
        x2 = x1;
        x1 = h[i];
        y2 = y1;
        y1 = v;
        y[i] = v;
      }
      h = y;
    }
    let hf = 0;
    for (const v of h) hf = Math.max(hf, Math.abs(v));
    // Begrenzer: alles kommt 6 ms später heraus
    let hfAtStops = 0;
    const ends = stops.filter((t) => t < o.seconds - 0.05);
    for (const t of ends) {
      for (let i = Math.round((t + 0.006 - 0.001) * sr); i < Math.round((t + 0.006 + 0.001) * sr); i++) hfAtStops = Math.max(hfAtStops, Math.abs(h[i] ?? 0));
    }
    return { peak, rms: Math.sqrt(sq / Math.max(1, n)), hfAtStops, hf, stops: ends.length };
  }, o);
}

test("Offline gerendert: kräftiger Pegel, Spitze unter 0,95 auch bei schnellen Noten mit Metronom", async ({ page }) => {
  const r = await render(page, "the-fairie-round", { spq: 0.12, metronome: true, noise: true, seconds: 14 });
  expect(r.peak).toBeLessThan(0.95);
  expect(r.peak).toBeGreaterThan(0.45);
  expect(r.rms).toBeGreaterThan(0.25); // vorher (Runde 3) etwa 0,16
});

test("Offline gerendert: kein Sprung am Ende der Töne (Knoten halten erst bei Lautstärke 0 an)", async ({ page }) => {
  const r = await render(page, "alle-meine-entchen", { spq: 0.5, metronome: false, noise: false, seconds: 9 });
  expect(r.stops).toBeGreaterThan(8);
  // vorher an jedem Tonende etwa 1e-4 (der größte Ausschlag überhaupt), jetzt nichts Messbares
  expect(r.hfAtStops).toBeLessThan(3e-5);
  expect(r.hfAtStops).toBeLessThan(r.hf / 3);
});
