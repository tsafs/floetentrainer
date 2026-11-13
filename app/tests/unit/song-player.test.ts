import { describe, expect, it } from "vitest";
import { toneFreq } from "../../src/audio/flute-synth";
import {
  BREATH_GAP,
  FADE,
  REPEAT_GAP,
  START_DELAY as S,
  SongPlayer,
  type PlayOptions,
  type PlayerPosition,
} from "../../src/audio/song-player";
import { songById } from "../../src/songs/library";
import { buildTimeline, type Timeline, type TimelineBar } from "../../src/songs/timeline";
import { Harness } from "./audio-fake";

type T = [start: number, dur: number, midi: number, breath?: boolean];

/** Zeitplan aus Tönen; Takte gleichmäßig nach `barDur` mit den Zählzeiten `beats`. */
function timeline(tones: T[], o: { beats?: number[]; barDur?: number; total?: number; bars?: TimelineBar[] } = {}): Timeline {
  const beats = o.beats ?? [0, 1, 2, 3];
  const barDur = o.barDur ?? 4;
  const lastEnd = Math.max(...tones.map(([s, d]) => s + d));
  const total = o.total ?? Math.ceil(lastEnd / barDur - 1e-9) * barDur;
  const bars: TimelineBar[] = o.bars ?? [];
  if (!o.bars) for (let i = 0; i * barDur < total; i++) bars.push({ index: i, start: i * barDur, dur: barDur, beats });
  return {
    tones: tones.map(([start, dur, midi, breath], i) => ({
      start,
      dur,
      midi,
      ids: [i],
      bar: Math.floor(start / barDur),
      breathAfter: !!breath,
    })),
    bars,
    total,
    countIn: beats,
    countInDur: barDur,
    countInBeats: beats.length,
  };
}

function setup(tl: Timeline, opts: Partial<PlayOptions> = {}) {
  const h = new Harness();
  const player = new SongPlayer(h.env);
  const positions: PlayerPosition[] = [];
  let ended = 0;
  player.play(tl, {
    secPerQuarter: 0.5,
    onPosition: (p) => positions.push(p),
    onEnd: () => ended++,
    ...opts,
  });
  return { h, player, positions, ended: () => ended };
}

const close = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);
const ACCENT = 1900;
const CLICK = 1250;

describe("Flötenstimme", () => {
  it("klingt eine Oktave höher als notiert, Stimmton 440 und 442", () => {
    close(toneFreq(69, 440), 880); // a¹ notiert → a² klingt
    close(toneFreq(69, 442), 884);
    close(toneFreq(60, 440), 440 * 2 ** (3 / 12)); // c¹ → c²
    const { h } = setup(timeline([[0, 1, 67]]), { a4: 442, countIn: false });
    h.advance(0.3);
    close(h.ctx.tones()[0].freq, 442 * 2 ** (10 / 12));
  });

  it("weicher Einsatz: Lautstärke beginnt bei 0 und steigt an", () => {
    const { h } = setup(timeline([[0, 1, 67]]), { countIn: false });
    h.advance(0.3);
    const env = h.ctx.oscs[0].outs[0] as unknown as { gain: { events: { type: string; value: number; time: number }[] } };
    const [first, second] = env.gain.events;
    expect(first).toMatchObject({ type: "set", value: 0 });
    expect(second.type).toBe("linear");
    expect(second.time - first.time).toBeGreaterThanOrEqual(0.02);
  });
});

describe("Abspieler: Zeitplan", () => {
  it("legt den AudioContext erst beim Abspielen an und setzt ihn fort", () => {
    const h = new Harness();
    const player = new SongPlayer(h.env);
    expect(h.created).toBe(0);
    player.play(timeline([[0, 1, 60]]), { secPerQuarter: 0.5 });
    expect(h.created).toBe(1);
    expect(h.ctx.state).toBe("running");
    player.play(timeline([[0, 1, 60]]), { secPerQuarter: 0.5 });
    expect(h.created).toBe(1);
  });

  it("plant nur voraus ein, nicht das ganze Lied auf einmal", () => {
    const { h } = setup(timeline([[0, 1, 60], [1, 1, 62], [2, 1, 64], [3, 1, 65]]), { countIn: false });
    expect(h.ctx.tones().length).toBe(1); // nur der erste liegt im Vorausschau-Fenster
    h.advance(0.5);
    expect(h.ctx.tones().length).toBe(2);
  });

  it("Töne beginnen nach dem Einzähltakt zur richtigen Zeit und dauern richtig", () => {
    const { h } = setup(timeline([[0, 1, 60], [1, 1, 62], [2, 2, 64]]));
    h.advance(6);
    const tones = h.ctx.tones();
    expect(tones.length).toBe(3);
    const t0 = S + 4 * 0.5;
    [0, 0.5, 1].forEach((d, i) => close(tones[i].start, t0 + d));
    close(tones[0].end!, t0 + 0.5); // gebunden an den nächsten (legato)
    close(tones[1].end!, t0 + 1);
    close(tones[2].end!, t0 + 2);
    close(tones[0].freq, toneFreq(60));
  });

  it("Einzählen: ein Takt leiser Klicks, die erste Zählzeit betont", () => {
    const { h } = setup(timeline([[0, 4, 60]]));
    h.advance(5);
    const clicks = h.ctx.clicks();
    expect(clicks.map((c) => c.freq)).toEqual([ACCENT, CLICK, CLICK, CLICK]);
    clicks.forEach((c, i) => close(c.start, S + i * 0.5));
  });

  it("Einzählen bei 6/8: zwei Schläge zu je drei Achteln", () => {
    const tl = timeline([[0, 1.5, 67], [1.5, 1.5, 69]], { beats: [0, 1.5], barDur: 3 });
    const { h } = setup(tl, { secPerQuarter: 0.4 });
    h.advance(3);
    const clicks = h.ctx.clicks();
    expect(clicks.map((c) => c.freq)).toEqual([ACCENT, CLICK]);
    close(clicks[0].start, S);
    close(clicks[1].start, S + 0.6);
    close(h.ctx.tones()[0].start, S + 1.2);
  });

  it("ohne Einzählen beginnt die Musik sofort", () => {
    const { h } = setup(timeline([[0, 1, 60]]), { countIn: false });
    h.advance(1);
    expect(h.ctx.clicks().length).toBe(0);
    close(h.ctx.tones()[0].start, S);
  });

  it("Haltebogen (ein Ton im Zeitplan) klingt als ein Ton", () => {
    const tl = timeline([[0, 3, 67], [3, 1, 69]]);
    tl.tones[0].ids = [0, 1];
    const { h } = setup(tl, { countIn: false });
    h.advance(3);
    const tones = h.ctx.tones();
    expect(tones.length).toBe(2);
    close(tones[0].end! - tones[0].start, 1.5);
  });

  it("Tonwiederholung: kleine Trennung, der nächste Ton kommt pünktlich", () => {
    const { h } = setup(timeline([[0, 1, 67], [1, 1, 67], [2, 1, 69]]), { countIn: false });
    h.advance(3);
    const [a, b, c] = h.ctx.tones();
    close(a.end!, S + 0.5 - REPEAT_GAP);
    close(b.start, S + 0.5);
    close(b.end!, S + 1); // danach ein anderer Ton: keine Trennung
    close(c.start, S + 1);
  });

  it("Atemzeichen: Ton endet früher, die Folgetöne verschieben sich nicht", () => {
    const { h } = setup(timeline([[0, 1, 67, true], [1, 1, 69], [2, 0.5, 71, true], [2.5, 1.5, 72]]), { countIn: false });
    h.advance(3);
    const [a, b, c, d] = h.ctx.tones();
    close(a.end!, S + 0.5 - BREATH_GAP);
    close(b.start, S + 0.5);
    close(c.start, S + 1);
    close(c.end!, S + 1.25 - 0.4 * 0.25); // kurzer Ton: Lücke höchstens 40 %
    close(d.start, S + 1.25);
  });
});

describe("Abspieler: Metronom", () => {
  it("klickt auf den Zählzeiten jedes Takts, die Eins betont", () => {
    const tl = timeline([[0, 3, 67], [3, 3, 69]], { beats: [0, 1, 2], barDur: 3 });
    const { h } = setup(tl, { countIn: false, metronome: true });
    h.advance(4);
    const clicks = h.ctx.clicks();
    expect(clicks.map((c) => c.freq)).toEqual([ACCENT, CLICK, CLICK, ACCENT, CLICK, CLICK]);
    clicks.forEach((c, i) => close(c.start, S + i * 0.5));
  });

  it("Auftakt: der erste (kurze) Takt bekommt keine betonte Eins", () => {
    const bars: TimelineBar[] = [
      { index: 0, start: 0, dur: 1, beats: [0], pickup: true },
      { index: 1, start: 1, dur: 3, beats: [0, 1, 2] },
    ];
    const tl = timeline([[0, 1, 62], [1, 3, 67]], { beats: [0, 1, 2], barDur: 3, total: 4, bars });
    const { h } = setup(tl, { countIn: false, metronome: true });
    h.advance(3);
    expect(h.ctx.clicks().map((c) => c.freq)).toEqual([CLICK, ACCENT, CLICK, CLICK]);
  });

  it("Heft-Lied mit Auftakt: Einzählen und Metronom bleiben im Takt (Auftakt auf seiner Zählzeit)", () => {
    // Doen Daphne: 3/4, Viertel-Auftakt. Vorher kam der Auftakt direkt nach „1 2 3“, so dass zwischen
    // zwei betonten Klicks vier Schläge lagen.
    const tl = buildTimeline(songById("doen-daphne-dover-schoone-maeght")!);
    const { h, positions } = setup(tl, { secPerQuarter: 1, metronome: true });
    h.advance(S + 8.5);
    const clicks = h.ctx.clicks();
    const at = clicks.map((c) => Math.round((c.start - S) * 1000) / 1000);
    const accents = clicks.filter((c) => c.freq === ACCENT).map((c) => Math.round((c.start - S) * 1000) / 1000);
    expect(at).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
    expect(accents).toEqual([0, 3, 6]);
    // erster Ton (Auftakt) auf der 3, erster voller Takt auf der Eins
    close(h.ctx.tones()[0].start, S + 5);
    close(h.ctx.tones()[1].start, S + 6);
    // Zählanzeige: 1 2 3 1 2
    expect(positions.filter((p) => p.countIn != null).map((p) => p.countIn)).toEqual([1, 2, 3, 1, 2]);
  });

  it("Auftakt mitten im Lied (nach :|) bekommt keine betonte Eins", () => {
    // Now is the month of maying: zweiter Teil beginnt mit |: h'4 (Auftakt, Takt 10)
    const s = songById("now-is-the-month-of-maying")!;
    const tl = buildTimeline(s);
    const bi = tl.bars.findIndex((b) => b.index === 9);
    expect(tl.bars[bi].pickup).toBe(true);
    const { h } = setup(tl, { countIn: false, metronome: true, secPerQuarter: 0.25 });
    h.advance(S + tl.bars[bi].start * 0.25 + 1.2);
    const startOf = (q: number) => S + q * 0.25;
    const click = h.ctx.clicks().find((c) => Math.abs(c.start - startOf(tl.bars[bi].start)) < 1e-6)!;
    expect(click.freq).toBe(CLICK);
    const next = h.ctx.clicks().find((c) => Math.abs(c.start - startOf(tl.bars[bi + 1].start)) < 1e-6)!;
    expect(next.freq).toBe(ACCENT);
  });

  it("lässt sich während des Spielens an- und ausschalten", () => {
    const tl = timeline([[0, 16, 67]]);
    const { h, player } = setup(tl, { countIn: false });
    h.advance(2);
    expect(h.ctx.clicks().length).toBe(0);
    player.setMetronome(true);
    h.advance(2);
    const on = h.ctx.clicks();
    expect(on.length).toBeGreaterThanOrEqual(3);
    for (const c of on) expect(c.start).toBeGreaterThanOrEqual(2);
    player.setMetronome(false);
    const n = h.ctx.clicks().length;
    // noch nicht erklungene Klicks werden abgesagt
    for (const c of h.ctx.clicks()) if (c.start > 4) expect(c.stop).toBeLessThanOrEqual(c.start);
    h.advance(2);
    expect(h.ctx.clicks().length).toBe(n);
  });
});

describe("Abspieler: Schleife", () => {
  const four = timeline([[0, 1, 60], [1, 1, 62], [2, 1, 64], [3, 1, 65]]);

  it("wiederholt nahtlos, eingezählt wird nur beim ersten Mal", () => {
    const { h, ended, positions } = setup(four, { loop: true });
    h.advance(S + 2 + 2 + 2 + 1);
    const tones = h.ctx.tones();
    expect(tones.length).toBeGreaterThanOrEqual(10);
    const t0 = S + 2;
    tones.slice(0, 10).forEach((t, i) => close(t.start, t0 + i * 0.5));
    close(tones[3].end!, tones[4].start); // Übergang ohne Lücke
    expect(h.ctx.clicks().length).toBe(4); // nur der Einzähltakt
    expect(ended()).toBe(0);
    expect(positions.some((p) => p.pass === 2 && p.tone === 0)).toBe(true);
  });

  it("Tonwiederholung über die Schleifengrenze bekommt eine Trennung", () => {
    const { h } = setup(timeline([[0, 2, 67], [2, 2, 67]]), { loop: true, countIn: false });
    h.advance(3);
    const [, b, c] = h.ctx.tones();
    close(b.end!, S + 2 - REPEAT_GAP);
    close(c.start, S + 2);
  });

  it("Schleife ausschalten: der laufende Durchgang wird zu Ende gespielt", () => {
    const { h, player, ended } = setup(four, { loop: true, countIn: false });
    h.advance(2.5); // im zweiten Durchgang
    player.setLoop(false);
    h.advance(3);
    expect(h.ctx.tones().length).toBe(8);
    expect(ended()).toBe(1);
  });
});

describe("Abspieler: Tempo, Stopp, Rückmeldungen", () => {
  it("Tempoänderung mitten im Stück: ohne Sprung, danach im neuen Tempo", () => {
    const tl = timeline(Array.from({ length: 12 }, (_, i) => [i, 1, 60 + (i % 2) * 2] as T));
    const { h, player } = setup(tl, { countIn: false });
    h.advance(1.0);
    const before = player.position()!.quarter;
    player.setTempo(0.25);
    const after = player.position()!.quarter;
    close(after, before);
    h.advance(4);
    const tones = h.ctx.tones();
    expect(tones.length).toBe(12);
    const diffs = tones.slice(1).map((t, i) => Number((t.start - tones[i].start).toFixed(6)));
    const k = diffs.indexOf(0.25);
    expect(k).toBeGreaterThan(0);
    expect(diffs.slice(0, k).every((d) => d === 0.5)).toBe(true);
    expect(diffs.slice(k).every((d) => d === 0.25)).toBe(true);
    // schon eingeplante Töne bleiben, wie sie sind: der Wechsel liegt im Vorausschau-Fenster
    expect(tones[k + 1].start).toBeGreaterThan(1.0);
    expect(tones[k + 1].start).toBeLessThan(1.0 + 0.5);
    // legato bleibt erhalten (kein Loch, keine Überlappung)
    for (let i = 0; i < 11; i++) close(tones[i].end!, tones[i + 1].start);
  });

  it("Stopp: Eingeplantes wird abgebrochen und kurz ausgeblendet", () => {
    const tl = timeline(Array.from({ length: 16 }, (_, i) => [i, 1, 60 + (i % 3)] as T));
    const { h, player, positions, ended } = setup(tl, { metronome: true });
    h.advance(3);
    const n = h.ctx.oscs.length;
    const seen = positions.length;
    player.stop();
    expect(player.playing).toBe(false);
    // was schon klingt, endet nach dem Ausblenden; was noch kommen sollte, erklingt nicht
    for (const o of h.ctx.oscs) expect(o.stopAt!).toBeLessThanOrEqual(Math.max(o.startAt!, 3 + FADE + 0.011));
    expect(h.ctx.oscs.some((o) => o.startAt! > 3)).toBe(true);
    const bus = h.ctx.gains.find((g) => g.outs.includes(h.ctx.destination))!;
    expect(bus.gain.events.at(-1)).toMatchObject({ type: "linear", value: 0 });
    close(bus.gain.events.at(-1)!.time, 3 + FADE);
    h.advance(2);
    expect(h.ctx.oscs.length).toBe(n);
    expect(positions.length).toBe(seen);
    expect(ended()).toBe(0);
    expect(h.ctx.suspends).toBe(1);
    expect(h.timers.active).toBe(0);
    expect(bus.disconnected).toBe(true);
  });

  it("meldet Zählzeiten beim Einzählen, dann den klingenden Ton, Pausen als null, am Ende onEnd", () => {
    const tl = timeline([[0, 1, 60], [1, 1, 62], [2, 1, 64]], { total: 4 });
    const { h, player, positions, ended } = setup(tl);
    h.advance(S + 2 + 2 + 0.5);
    expect(positions.map((p) => [p.countIn, p.tone, p.bar])).toEqual([
      [1, null, null],
      [2, null, null],
      [3, null, null],
      [4, null, null],
      [null, 0, 0],
      [null, 1, 0],
      [null, 2, 0],
      [null, null, 0], // Pause
      [null, null, null], // Ende
    ]);
    expect(ended()).toBe(1);
    expect(player.playing).toBe(false);
    expect(h.timers.active).toBe(0);
  });

  it("die Meldung kommt zur Zeit des Tons (aus der Audio-Uhr abgeleitet)", () => {
    const tl = timeline([[0, 1, 60], [1, 1, 62]]);
    const h = new Harness();
    const player = new SongPlayer(h.env);
    const at: [number | null, number][] = [];
    player.play(tl, { secPerQuarter: 0.5, countIn: false, onPosition: (p) => at.push([p.tone, h.ctx.currentTime]) });
    h.advance(1.2, 5);
    expect(at[0][0]).toBe(0);
    expect(at[0][1]).toBeGreaterThanOrEqual(S);
    expect(at[0][1]).toBeLessThan(S + 0.006);
    expect(at[1][0]).toBe(1);
    expect(at[1][1]).toBeGreaterThanOrEqual(S + 0.5 - 1e-9);
    expect(at[1][1]).toBeLessThan(S + 0.506);
  });

  it("ein neues play beendet das laufende", () => {
    const { h, player } = setup(timeline([[0, 8, 60]]), { countIn: false });
    h.advance(1);
    player.play(timeline([[0, 1, 72]]), { secPerQuarter: 0.5, countIn: false });
    h.advance(0.3);
    const tones = h.ctx.tones();
    expect(tones.length).toBe(2);
    expect(tones[0].stop!).toBeLessThanOrEqual(1 + FADE + 0.011);
    close(tones[1].freq, toneFreq(72));
    expect(player.playing).toBe(true);
  });
});
