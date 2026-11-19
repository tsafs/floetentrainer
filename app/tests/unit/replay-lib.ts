// Nachrechnen einer Diagnose mit Ton (Testboard, ../../src/audio/diagnose.ts): Der aufgenommene Ton wird
// wie im AudioWorklet gemessen und durch die *jetzige* Wertung geschickt. Ergebnis je Note: live in der
// App (Ereignis „note“) und nachgerechnet, dazu, was in ihrem Zeitfenster zu hören war.
// Aufruf: REPLAY=<datei.json> npx vitest run tests/unit/replay.test.ts
import { COARSE_MS, FINE_HOP, FrameMaker } from "../../src/audio/analyze";
import { base64Pcm16, type DiagFile } from "../../src/audio/diagnose";
import { LiveTuning } from "../../src/audio/flute-profile";
import { BeatFollower, DEFAULT_FOLLOW, WaitFollower, type FollowConfig } from "../../src/audio/follow";
import type { Frame } from "../../src/audio/judge";
import { freqToWrittenMidi } from "../../src/music/notes";
import type { Timeline, Tone } from "../../src/songs/timeline";

export interface ReplayNote {
  i: number;
  midi: number;
  live: boolean | null;
  replay: boolean | null;
  /** gehörte Töne im Fenster der Note (Takt) bzw. bis zum Treffer (Warten): MIDI → ms */
  heard: Record<number, number>;
  /** Anteil der Messungen mit Klarheit unter 0,85 im Fenster */
  unclear: number;
}

export function framesOf(file: DiagFile, kind: "fein" | "grob" = "fein"): Frame[] {
  const a = file.audio;
  if (!a) throw new Error("Die Diagnose enthält keinen Ton (nur Testboard-Folgen nehmen ihn auf).");
  const x = base64Pcm16(a.data);
  const fm = kind === "fein" ? new FrameMaker(a.sampleRate, FINE_HOP, true) : new FrameMaker(a.sampleRate, (a.sampleRate * COARSE_MS) / 1000, false);
  const out: Frame[] = [];
  for (let i = 0; i < x.length; i += 128) {
    for (const m of fm.push(x.subarray(i, Math.min(x.length, i + 128)), i)) {
      const t = a.t0 + (m.end / a.sampleRate) * 1000;
      out.push(m.freq > 0 ? { t, freq: m.freq, clarity: m.clarity, rms: m.rms, nsdf: m.nsdf, lag0: m.lag0, sr: a.sampleRate } : { t, freq: null, clarity: 0, rms: m.rms });
    }
  }
  return out;
}

function timeline(file: DiagFile): Timeline {
  const tones = (file.meta.tones as { midi: number; start: number; dur: number }[]).map(
    (n, i): Tone => ({ start: n.start, dur: n.dur, midi: n.midi, ids: [i], bar: 0, breathAfter: false }),
  );
  const total = tones.length ? tones[tones.length - 1].start + tones[tones.length - 1].dur : 0;
  return { tones, bars: [], total, countIn: [], countInDur: 0, countInBeats: 4 };
}

export function replay(file: DiagFile, cfg: Partial<FollowConfig> = {}): { notes: ReplayNote[]; live: number; replayed: number; total: number } {
  const m = file.meta as Record<string, unknown>;
  const tl = timeline(file);
  const fl = m.flute as { offsets: Record<string, number>; tuning: { known: boolean } } | undefined;
  const tuning = new LiveTuning(fl?.offsets ?? {}, {}, fl?.tuning.known ?? false);
  const base: Partial<FollowConfig> = { tuning: (m.tuningHz as number) ?? 440, latencyMs: (m.latencyMs as number) ?? DEFAULT_FOLLOW.latencyMs, frameMs: (FINE_HOP / file.audio!.sampleRate) * 1000, ...cfg };
  const frames = framesOf(file);
  // Die Aufnahme endet mit dem letzten Treffer (die App hört dann auf); etwas Stille danach, damit der
  // Glätter auch die letzten Frames entscheidet
  const end = frames.length ? frames[frames.length - 1].t : 0;
  for (let k = 1; k <= 20; k++) frames.push({ t: end + k * base.frameMs!, freq: null, clarity: 0, rms: 0 });
  const res: (boolean | null)[] = tl.tones.map(() => null);
  const hitAt: (number | null)[] = tl.tones.map(() => null);
  if (file.kind === "warten") {
    const w = new WaitFollower(tl, { cfg: base, tuning, onNote: (i, r) => ((res[i] = r.ok), (hitAt[i] = lastT)) });
    let lastT = 0;
    w.arm(0);
    for (const f of frames) {
      lastT = f.t;
      w.push(f);
    }
  } else {
    const b = new BeatFollower(tl, { secPerQuarter: m.spq as number, startMs: m.startMs as number, cfg: base, tuning, onNote: (i, r) => (res[i] = r.ok) });
    for (const f of frames) b.push(f);
    b.finish(frames[frames.length - 1].t + 1);
  }
  const live: (boolean | null)[] = tl.tones.map(() => null);
  for (const e of file.events) if (e.type === "note" && typeof e.i === "number") live[e.i] = !!e.ok;
  // Fenster je Note: Takt nach Zeitplan (mit Verzögerung), Warten vom vorigen Treffer bis zum eigenen
  const lat = base.latencyMs!;
  const tones = m.tones as { fromMs?: number; toMs?: number }[];
  const notes: ReplayNote[] = tl.tones.map((n, i) => {
    const from = file.kind === "takt" ? tones[i].fromMs! + lat : (hitAt[i - 1] ?? 0);
    const to = file.kind === "takt" ? tones[i].toMs! + lat : (hitAt[i] ?? from + 2000);
    const inWin = frames.filter((f) => f.t >= from && f.t < to);
    const heard: Record<number, number> = {};
    let unclear = 0;
    for (const f of inWin) {
      if (f.freq === null) continue;
      if (f.clarity < 0.85) unclear++;
      const k = Math.round(freqToWrittenMidi(f.freq, base.tuning));
      heard[k] = Math.round((heard[k] ?? 0) + base.frameMs!);
    }
    return { i, midi: n.midi, live: live[i], replay: res[i], heard, unclear: inWin.length ? unclear / inWin.length : 0 };
  });
  const count = (xs: (boolean | null)[]) => xs.filter((x) => x === true).length;
  return { notes, live: count(live), replayed: count(res), total: tl.tones.length };
}
