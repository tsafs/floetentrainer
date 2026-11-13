import { describe, expect, it } from "vitest";
import type { Frame } from "../../src/audio/judge";
import {
  BeatFollower,
  DEFAULT_FOLLOW,
  followConfig,
  isBetter,
  summarize,
  WaitFollower,
  type BeatNoteResult,
  type FollowSummary,
} from "../../src/audio/follow";
import { soundingFreq } from "../../src/music/notes";
import { songById } from "../../src/songs/library";
import { buildTimeline, sectionTimeline, type Timeline } from "../../src/songs/timeline";
import { song } from "./songs-helpers";

const STEP = 25;
/** klingende Frequenz zu einer notierten MIDI-Nummer, ggf. mit Cent-Abweichung */
const hz = (midi: number, cents = 0, tuning = 440) => soundingFreq(midi, tuning) * Math.pow(2, cents / 1200);
const G = 67;
const A = 69;
const H = 71;
const C2 = 72;
const D2 = 74;

/** Ein Stück Spiel: Frequenz (null = Stille) für ms Millisekunden */
interface Piece {
  freq: number | null;
  ms: number;
  clarity?: number;
  rms?: number;
}
const tone = (midi: number, ms: number, more: Partial<Piece> = {}): Piece => ({ freq: hz(midi), ms, ...more });
const rest = (ms: number): Piece => ({ freq: null, ms });

/** Frames alle 25 ms aus einer Folge von Stücken, ab t0 */
function frames(pieces: Piece[], t0 = 0): Frame[] {
  const out: Frame[] = [];
  let t = t0;
  for (const p of pieces) {
    for (let k = 0; k < Math.round(p.ms / STEP); k++, t += STEP) {
      const f: Frame = { t, freq: p.freq, clarity: p.freq === null ? 0 : (p.clarity ?? 0.98) };
      if (p.rms !== undefined) f.rms = p.rms;
      out.push(f);
    }
  }
  return out;
}
const feed = (fl: { push(f: Frame): unknown }, fs: Frame[]) => fs.forEach((f) => fl.push(f));

/** Jeden Ton des Zeitplans spielen: ms lang, danach eine Lücke (wie beim Anstoßen mit der Zunge) */
const playAll = (tl: Timeline, ms = 200, gap = 60, wrong: Record<number, number> = {}): Piece[] =>
  tl.tones.flatMap((n, i) => [...(i in wrong ? [tone(wrong[i], 200), rest(60)] : []), tone(n.midi, ms), rest(gap)]);

// ---------------------------------------------------------------- Warte-Modus

describe("Mitspielen: Warte-Modus", () => {
  const melody = () => buildTimeline(song("g'4 a'4 h'4 c''4 | d''1 ||"));

  it("richtig gespielt: jede Note wird grün, Index läuft bis zum Ende", () => {
    const tl = melody();
    const seen: number[] = [];
    let summary: FollowSummary | null = null;
    const w = new WaitFollower(tl, { onNote: (i) => seen.push(i), onPass: (s) => (summary = s) });
    feed(w, frames(playAll(tl)));
    expect(seen).toEqual([0, 1, 2, 3, 4]);
    expect(w.results.map((r) => r?.ok)).toEqual([true, true, true, true, true]);
    expect(w.done).toBe(true);
    expect(w.index).toBe(5);
    expect(summary).toMatchObject({ hits: 5, total: 5, complete: true, hardestBars: [] });
  });

  it("die Note bleibt stehen, bis sie getroffen ist; kurze Haltedauer (≈ 0,12 s)", () => {
    const tl = melody();
    const w = new WaitFollower(tl);
    feed(w, frames([rest(500), tone(G, 100)]));
    expect(w.index).toBe(0); // 100 ms reichen nicht
    feed(w, frames([tone(G, 75)], 600));
    expect(w.index).toBe(1);
    expect(DEFAULT_FOLLOW.holdMs).toBeGreaterThanOrEqual(100);
    expect(DEFAULT_FOLLOW.holdMs).toBeLessThanOrEqual(150);
  });

  it("legato zum nächsten Ton (ohne Lücke) reicht bei verschiedenen Tönen", () => {
    const tl = melody();
    const w = new WaitFollower(tl);
    feed(w, frames([G, A, H, C2, D2].map((m) => tone(m, 200))));
    expect(w.done).toBe(true);
    expect(w.summary().hits).toBe(5);
  });

  it("falscher Ton vorher: Note wird rot, geht aber weiter", () => {
    const tl = melody();
    const wrongs: [number, number][] = [];
    const w = new WaitFollower(tl, { onWrong: (i, m) => wrongs.push([i, m]) });
    feed(w, frames(playAll(tl, 200, 60, { 1: H, 3: A })));
    expect(w.done).toBe(true);
    expect(w.results.map((r) => r?.ok)).toEqual([true, false, true, false, true]);
    expect(w.results[1]).toEqual({ ok: false, wrongMidi: H });
    expect(wrongs).toEqual([
      [1, H],
      [3, A],
    ]);
    expect(w.summary()).toMatchObject({ hits: 3, total: 5 });
  });

  it("kurzer Übergangston (unter der Haltedauer) zählt nicht als falsch", () => {
    const tl = melody();
    const w = new WaitFollower(tl);
    feed(w, frames([tone(G, 200), tone(C2, 75), tone(A, 200)]));
    expect(w.results.map((r) => r?.ok)).toEqual([true, true]);
  });

  it("Nachklang: Weiterhalten der getroffenen Note ist nicht falsch für die nächste", () => {
    const tl = melody();
    const w = new WaitFollower(tl);
    feed(w, frames([tone(G, 1000), rest(100), tone(A, 200)]));
    expect(w.results.map((r) => r?.ok)).toEqual([true, true]);
  });

  it("Ton knapp außerhalb der Toleranz: weder richtig noch falsch; Toleranz und Stimmton aus den Einstellungen", () => {
    const tl = melody();
    const w = new WaitFollower(tl);
    feed(w, frames([{ freq: hz(G, 45), ms: 1000 }]));
    expect(w.index).toBe(0);
    expect(w.wrongMidi).toBeNull();

    const cfg = followConfig({ tuningHz: 415, toleranceCents: 20 });
    expect(cfg).toEqual({ tuning: 415, toleranceCents: 20 });
    const w2 = new WaitFollower(tl, { cfg });
    feed(w2, frames([{ freq: hz(G, 30, 415), ms: 500 }]));
    expect(w2.index).toBe(0);
    feed(w2, frames([{ freq: hz(G, 10, 415), ms: 500 }], 500));
    expect(w2.index).toBe(1);
  });

  it("Oktavfehler mit niedriger Klarheit zählt nicht als falsch, mit hoher schon", () => {
    const tl = melody();
    const w = new WaitFollower(tl);
    feed(w, frames([tone(G + 12, 500, { clarity: 0.93 }), rest(60), tone(G, 200)]));
    expect(w.results[0]).toEqual({ ok: true });

    const w2 = new WaitFollower(tl);
    feed(w2, frames([tone(G + 12, 500, { clarity: 0.99 }), rest(60), tone(G, 200)]));
    expect(w2.results[0]).toEqual({ ok: false, wrongMidi: G + 12 });
  });

  it("Rauschen und niedrige Klarheit: nichts wird gewertet", () => {
    const tl = melody();
    const w = new WaitFollower(tl);
    let x = 7;
    const noise: Frame[] = [];
    for (let t = 0; t < 2000; t += STEP) {
      x = (x * 1103515245 + 12345) % 2147483648;
      noise.push({ t, freq: 500 + (x % 1500), clarity: 0.3 + (x % 50) / 100 });
    }
    feed(w, noise);
    feed(w, frames([tone(G, 1000, { clarity: 0.85 })], 2000)); // richtiger Ton, aber zu unklar
    feed(w, frames([{ freq: 200, ms: 500 }], 3000)); // außerhalb des Bereichs
    expect(w.index).toBe(0);
    expect(w.wrongMidi).toBeNull();
  });

  it("Pausen werden übersprungen", () => {
    const tl = buildTimeline(song("r4 g'4 r4 a'4 | r2 h'2 ||"));
    expect(tl.tones.length).toBe(3);
    const w = new WaitFollower(tl);
    feed(w, frames([tone(G, 200), tone(A, 200), tone(H, 200)]));
    expect(w.done).toBe(true);
  });

  it("Haltebogen ist eine Note: ein Einsatz reicht", () => {
    const tl = buildTimeline(song("g'2 a'2~ | a'2 h'2 ||"));
    expect(tl.tones.map((n) => n.midi)).toEqual([G, A, H]);
    const w = new WaitFollower(tl);
    feed(w, frames([tone(G, 200), tone(A, 200), tone(H, 200)]));
    expect(w.done).toBe(true);
  });

  describe("Tonwiederholung braucht einen neuen Einsatz", () => {
    const rep = () => buildTimeline(song("g'4 g'4 a'2 ||"));

    it("einfach weitergehalten: bleibt auf der zweiten Note stehen", () => {
      const w = new WaitFollower(rep());
      feed(w, frames([tone(G, 2000)]));
      expect(w.index).toBe(1);
    });

    it("ein einzelner Aussetzer (25 ms) ist kein neuer Einsatz", () => {
      const w = new WaitFollower(rep());
      feed(w, frames([tone(G, 300), rest(25), tone(G, 500)]));
      expect(w.index).toBe(1);
    });

    it("ein kurzer Ausreißer auf einen anderen Ton ist kein neuer Einsatz und nicht falsch", () => {
      const w = new WaitFollower(rep());
      feed(w, frames([tone(G, 300), tone(H, 25), tone(G, 500)]));
      expect(w.index).toBe(1);
      expect(w.wrongMidi).toBeNull();
    });

    it("Stille ab 40 ms (zwei Frames) ist ein neuer Einsatz", () => {
      const w = new WaitFollower(rep());
      feed(w, frames([tone(G, 300), rest(50), tone(G, 200), rest(50), tone(A, 200)]));
      expect(w.done).toBe(true);
      expect(w.results.map((r) => r?.ok)).toEqual([true, true, true]);
    });

    it("kurz unklar (Klarheit bricht ein) ist ebenfalls ein neuer Einsatz", () => {
      const w = new WaitFollower(rep());
      feed(w, frames([tone(G, 300), tone(G, 50, { clarity: 0.5 }), tone(G, 200)]));
      expect(w.index).toBe(2);
    });

    it("Lautstärke-Einbruch und neuer Anstoß bei durchgehend erkanntem Ton", () => {
      const w = new WaitFollower(rep());
      feed(w, frames([tone(G, 300, { rms: 0.1 }), tone(G, 25, { rms: 0.04 }), tone(G, 200, { rms: 0.09 })]));
      expect(w.index).toBe(2);
    });

    it("bloßes Leiserwerden ohne neuen Anstoß zählt nicht", () => {
      const w = new WaitFollower(rep());
      feed(w, frames([tone(G, 300, { rms: 0.1 }), tone(G, 200, { rms: 0.045 }), tone(G, 500, { rms: 0.05 })]));
      expect(w.index).toBe(1);
    });
  });

  it("Schleife: Bewertung je Durchgang, die erste Note braucht nach gleicher letzter einen neuen Einsatz", () => {
    const tl = buildTimeline(song("g'2 a'2 | g'1 ||"));
    const passes: FollowSummary[] = [];
    const w = new WaitFollower(tl, { loop: true, onPass: (s) => passes.push(s) });
    feed(w, frames([tone(G, 200), tone(A, 200), tone(G, 600)]));
    expect(w.pass).toBe(1);
    expect(w.index).toBe(0); // g' weitergehalten: kein Einsatz für den neuen Durchgang
    feed(w, frames([rest(60), tone(G, 200), tone(H, 200), tone(A, 200), tone(G, 200)], 1000));
    expect(passes.map((s) => [s.hits, s.total])).toEqual([
      [3, 3],
      [2, 3],
    ]);
    expect(w.passes).toEqual(passes);
    expect(w.done).toBe(false);
  });

  it("Heft-Lied „Alle meine Entchen“: richtig mit Anstoß, ohne Anstoß hängt es an der Tonwiederholung", () => {
    const tl = buildTimeline(songById("alle-meine-entchen")!);
    expect(tl.tones.length).toBe(27);
    const w = new WaitFollower(tl);
    feed(w, frames(playAll(tl, 150, 50)));
    expect(w.done).toBe(true);
    expect(w.summary()).toMatchObject({ hits: 27, total: 27, complete: true });

    // gebunden gespielt: die erste Tonwiederholung (d'' d'' in Takt 2) kommt nicht weiter
    const legato = new WaitFollower(tl);
    feed(legato, frames(tl.tones.slice(0, 6).map((n) => tone(n.midi, 200))));
    expect(tl.tones[4].midi).toBe(tl.tones[5].midi);
    expect(legato.index).toBe(5);
    expect(legato.wrongMidi).toBeNull();
  });
});

// ---------------------------------------------------------------- Takt-Modus

const SPQ = 0.5; // 120 Viertel je Minute
const START = 1000;

/**
 * Spielt einen Zeitplan im Takt: zum Zeitpunkt t erklingt der Ton, dessen Fenster (um `late` ms
 * verschoben) t enthält, bis `gap` ms vor seinem Ende. Gemessen wird `latency` ms später.
 */
function beatFrames(
  tl: Timeline,
  o: { spq?: number; late?: number; gap?: number; latency?: number; wrong?: Record<number, number>; passes?: number; clarity?: number } = {},
): Frame[] {
  const spq = (o.spq ?? SPQ) * 1000;
  const late = o.late ?? 0;
  const gap = o.gap ?? 30;
  const latency = o.latency ?? DEFAULT_FOLLOW.latencyMs;
  const passes = o.passes ?? 1;
  const out: Frame[] = [];
  const end = START + passes * tl.total * spq + late + latency + 200;
  for (let t = START - 500; t < end; t += STEP) {
    const s = t - latency - late - START; // Stelle beim Spielen in ms ab Zeitplan-Beginn
    const g = s / spq;
    const k = Math.floor(g / tl.total);
    const local = g - k * tl.total;
    const i = k < 0 || k >= passes ? -1 : tl.tones.findIndex((n) => local >= n.start && (local - n.start) * spq < n.dur * spq - gap);
    const midi = i < 0 ? null : (o.wrong?.[i] ?? tl.tones[i].midi);
    out.push(midi === null ? { t, freq: null, clarity: 0 } : { t, freq: hz(midi), clarity: o.clarity ?? 0.98 });
  }
  return out;
}

describe("Mitspielen: Takt-Modus", () => {
  const melody = () => buildTimeline(song("g'4 a'4 h'4 c''4 | d''2 c''2 ||"));

  it("richtig gespielt (mit üblicher Verzögerung): alles getroffen", () => {
    const tl = melody();
    const notes: [number, BeatNoteResult][] = [];
    let summary: FollowSummary | null = null;
    const b = new BeatFollower(tl, { secPerQuarter: SPQ, startMs: START, onNote: (i, r) => notes.push([i, r]), onPass: (s) => (summary = s) });
    feed(b, beatFrames(tl));
    expect(notes.map(([i]) => i)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(notes.every(([, r]) => r.ok && r.coverage > 0.85 && r.coverage <= 1)).toBe(true);
    expect(summary).toMatchObject({ hits: 6, total: 6, complete: true, hardestBars: [] });
    expect(b.done).toBe(true);
  });

  it("getroffen wird live gemeldet, noch bevor das Fenster vorbei ist", () => {
    const tl = melody();
    const hits: [number, number][] = [];
    const b = new BeatFollower(tl, { secPerQuarter: SPQ, startMs: START, onHit: (i) => hits.push([i, b.results.length]) });
    const fs = beatFrames(tl);
    let at = -1;
    for (const f of fs) {
      b.push(f);
      if (at < 0 && hits.length) at = f.t;
    }
    // erste Note: Fenster 1000–1500 ms (+ 80 ms Verzögerung), halbe Dauer = 250 ms
    expect(at).toBeGreaterThan(START + 250);
    expect(at).toBeLessThan(START + 500 + DEFAULT_FOLLOW.latencyMs);
    expect(hits.map(([i]) => i)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("falsche Töne: diese Noten nicht getroffen", () => {
    const tl = melody();
    const b = new BeatFollower(tl, { secPerQuarter: SPQ, startMs: START });
    feed(b, beatFrames(tl, { wrong: { 1: H, 4: C2 } }));
    const r = b.passResults[0];
    expect(r.map((x) => x?.ok)).toEqual([true, false, true, true, false, true]);
    expect(r[1]?.coverage).toBe(0);
    expect(b.passes[0]).toMatchObject({ hits: 4, total: 6 });
  });

  it("verspätet: innerhalb des Ausgleichs getroffen, ohne Ausgleich bei kurzen Noten nicht", () => {
    const tl = buildTimeline(song("g'16 a'16 h'16 c''16 d''16 c''16 h'16 a'16 g'2. ||"));
    const spq = 0.6; // Sechzehntel = 150 ms
    const fs = beatFrames(tl, { spq, latency: 80, gap: 0 });
    const withComp = new BeatFollower(tl, { secPerQuarter: spq, startMs: START });
    feed(withComp, fs);
    expect(withComp.passes[0].hits).toBe(9);
    const noComp = new BeatFollower(tl, { secPerQuarter: spq, startMs: START, cfg: { latencyMs: 0 } });
    feed(noComp, fs);
    expect(noComp.passResults[0].slice(0, 8).every((r) => !r?.ok)).toBe(true);
    expect(noComp.passResults[0][8]?.ok).toBe(true); // lange Schlussnote trotzdem
  });

  it("verspätet: etwas zu spät geht noch, um mehr als die halbe Note nicht", () => {
    const tl = melody();
    const ok = new BeatFollower(tl, { secPerQuarter: SPQ, startMs: START });
    feed(ok, beatFrames(tl, { late: 120 }));
    expect(ok.passes[0].hits).toBe(6);
    const tooLate = new BeatFollower(tl, { secPerQuarter: SPQ, startMs: START });
    feed(tooLate, beatFrames(tl, { late: 300 }));
    // Viertel (500 ms): nur noch 200 ms im eigenen Fenster; Halbe (1000 ms) gehen noch
    expect(tooLate.passResults[0].map((r) => r?.ok)).toEqual([false, false, false, false, true, true]);
  });

  it("sehr kurze Noten: mindestens 80 ms erkannt nötig", () => {
    const tl = buildTimeline(song("g'16 a'16 h'16 c''16 d''4 r2 ||"));
    const spq = 0.6; // Sechzehntel = 150 ms → 80 ms nötig (mehr als die Hälfte)
    const b = new BeatFollower(tl, { secPerQuarter: spq, startMs: START });
    // nur 75 ms je Sechzehntel klingen (Rest Stille)
    feed(b, beatFrames(tl, { spq, gap: 75 }));
    expect(b.passResults[0].map((r) => r?.ok)).toEqual([false, false, false, false, true]);
    const b2 = new BeatFollower(tl, { secPerQuarter: spq, startMs: START });
    feed(b2, beatFrames(tl, { spq, gap: 50 }));
    expect(b2.passes[0].hits).toBe(5);
  });

  it("Tonwiederholung: ohne neuen Einsatz zählt die erkannte Zeit im jeweiligen Fenster", () => {
    const tl = buildTimeline(song("d''4 d''4 d''2 ||"));
    const b = new BeatFollower(tl, { secPerQuarter: SPQ, startMs: START });
    feed(b, beatFrames(tl, { gap: 0 })); // durchgehend gehalten
    expect(b.passes[0].hits).toBe(3);
  });

  it("Haltebogen ist eine Note, Pausen zählen nicht", () => {
    const tl = buildTimeline(song("g'2 r4 a'4~ | a'2 r2 ||"));
    expect(tl.tones.length).toBe(2);
    const b = new BeatFollower(tl, { secPerQuarter: SPQ, startMs: START });
    feed(b, beatFrames(tl));
    expect(b.passes[0]).toMatchObject({ hits: 2, total: 2 });
    expect(b.passResults[0][1]?.coverage).toBeGreaterThan(0.9);
  });

  it("Rauschen und niedrige Klarheit zählen nicht", () => {
    const tl = melody();
    const b = new BeatFollower(tl, { secPerQuarter: SPQ, startMs: START });
    feed(b, beatFrames(tl, { clarity: 0.6 }));
    expect(b.passes[0].hits).toBe(0);
    expect(b.passResults[0].every((r) => r?.coverage === 0)).toBe(true);
  });

  it("Heft-Lied „Alle meine Entchen“: Auswertung mit den schwierigsten Takten", () => {
    const tl = buildTimeline(songById("alle-meine-entchen")!);
    const spq = 60 / 88;
    const ix = (bar: number) => tl.tones.flatMap((n, i) => (n.bar === bar ? [i] : []));
    // Takt 3 (Index 2): zwei falsche, Takt 7 (Index 6): drei falsche, Takt 9 (Index 8): einer, Takt 4 (Index 3): einer
    const wrong: Record<number, number> = {};
    ix(2).slice(0, 2).forEach((i) => (wrong[i] = A));
    ix(6).slice(0, 3).forEach((i) => (wrong[i] = G));
    wrong[ix(8)[0]] = D2;
    wrong[ix(3)[0]] = G;
    const b = new BeatFollower(tl, { secPerQuarter: spq, startMs: START });
    feed(b, beatFrames(tl, { spq, wrong }));
    const s = b.passes[0];
    expect(s).toMatchObject({ hits: 20, total: 27, complete: true });
    // Takt 4 hat nur eine Note: gleich viele Fehler wie Takt 9, aber kleinere Trefferquote
    expect(s.hardestBars).toEqual([
      { bar: 6, misses: 3, total: 4 },
      { bar: 2, misses: 2, total: 4 },
      { bar: 3, misses: 1, total: 1 },
    ]);
  });

  it("Schleife über einen Abschnitt: Bewertung je Durchgang", () => {
    const s = song("g'4 a'4 h'4 c''4 | d''2 c''2 | h'1 ||");
    const tl = sectionTimeline(s, 0, 1);
    const passes: FollowSummary[] = [];
    const b = new BeatFollower(tl, { secPerQuarter: SPQ, startMs: START, loop: true, onPass: (x) => passes.push(x) });
    // erster Durchgang richtig, im zweiten das a' falsch, der dritte wird nach Takt 1 abgebrochen
    const fs = [
      ...beatFrames(tl, { passes: 2 }).filter((f) => f.t < START + tl.total * SPQ * 1000 + 80),
      ...beatFrames(tl, { passes: 3, wrong: { 1: G } }).filter((f) => f.t >= START + tl.total * SPQ * 1000 + 80),
    ];
    feed(b, fs.filter((f) => f.t < START + (2 * tl.total + 4) * SPQ * 1000 + 80));
    expect(passes.map((x) => [x.hits, x.total])).toEqual([
      [6, 6],
      [5, 6],
    ]);
    expect(b.pass).toBe(2);
    const last = b.finish(START + (2 * tl.total + 4) * SPQ * 1000 + 80);
    expect(last).toMatchObject({ hits: 3, total: 4, complete: false });
    expect(b.done).toBe(true);
  });

  it("vorzeitig beendet: nur begonnene Noten werden gewertet", () => {
    const tl = melody();
    const b = new BeatFollower(tl, { secPerQuarter: SPQ, startMs: START });
    // abgebrochen bei 1,2 s: die dritte Note hat erst 200 von 500 ms geklungen
    feed(b, beatFrames(tl).filter((f) => f.t < START + 1200 + 80));
    const s = b.finish(START + 1200 + 80);
    expect(s).toMatchObject({ hits: 2, total: 3, complete: false });
    expect(b.finish(START + 5000)).toBe(s);
  });

  it("Markierung: welche Note ist zu welcher Zeit dran; Tempowechsel ohne Sprung", () => {
    const tl = melody();
    const b = new BeatFollower(tl, { secPerQuarter: SPQ, startMs: START });
    expect(b.toneAt(START - 100)).toBeNull();
    expect(b.toneAt(START + 600)).toBe(1);
    expect(b.toneAt(START + 6100)).toBeNull();
    b.setTempo(0.25, START + 1000); // ab Viertel 2 doppelt so schnell
    expect(b.quarterAt(START + 1000)).toBeCloseTo(2);
    expect(b.toneAt(START + 1300)).toBe(3);
  });
});

// ---------------------------------------------------------------- Auswertung, Bestwert

describe("Mitspielen: Auswertung und Bestwert", () => {
  it("schwierigste Takte: höchstens 3, nur bei Fehlern", () => {
    const tl = buildTimeline(song("g'4 g'4 g'4 g'4 | a'4 a'4 a'4 a'4 | h'1 | c''2 c''2 | d''1 ||"));
    const ok = tl.tones.map(() => ({ ok: true }));
    expect(summarize(tl, ok).hardestBars).toEqual([]);
    const r = tl.tones.map((n) => ({ ok: n.midi === A }));
    const s = summarize(tl, r);
    expect(s.hits).toBe(4);
    expect(s.hardestBars.map((b) => b.bar)).toEqual([0, 3, 2]);
  });

  it("ist besser als: Trefferquote, bei Gleichstand mehr Noten", () => {
    expect(isBetter({ hits: 1, total: 2 })).toBe(true);
    expect(isBetter({ hits: 0, total: 0 })).toBe(false);
    expect(isBetter({ hits: 45, total: 48 }, { hits: 42, total: 48 })).toBe(true);
    expect(isBetter({ hits: 42, total: 48 }, { hits: 45, total: 48 })).toBe(false);
    expect(isBetter({ hits: 42, total: 48 }, { hits: 42, total: 48 })).toBe(false);
    expect(isBetter({ hits: 8, total: 10 }, { hits: 4, total: 5 })).toBe(true);
    expect(isBetter({ hits: 4, total: 5 }, { hits: 8, total: 10 })).toBe(false);
    expect(isBetter({ hits: 10, total: 10 }, { hits: 47, total: 48 })).toBe(true);
  });
});
