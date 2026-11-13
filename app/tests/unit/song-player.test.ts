import { describe, expect, it } from "vitest";
import { GLIDE, toneFreq } from "../../src/audio/flute-synth";
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
import { buildTimeline, sectionTimeline, type Timeline, type TimelineBar } from "../../src/songs/timeline";
import { Harness, type FakeGain } from "./audio-fake";
import { song } from "./songs-helpers";

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

/** Töne mit den Indizes `idx` an den nächsten binden (Bindebogen) */
function slur(tl: Timeline, ...idx: number[]): Timeline {
  for (const i of idx) tl.tones[i].slurToNext = true;
  return tl;
}

/** Zeitplan ohne Ton */
function empty(o: Partial<Timeline> = {}): Timeline {
  return { tones: [], bars: [], total: 4, countIn: [], countInDur: 0, countInBeats: 0, ...o };
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

describe("Abspieler: Bindebogen (legato)", () => {
  const flutes = (h: Harness) => h.ctx.oscs.filter((o) => o.type === "custom");

  it("kein neuer Einsatz: eine Stimme, die Tonhöhe gleitet kurz, Ende erst nach dem letzten Ton", () => {
    const { h } = setup(slur(timeline([[0, 1, 60], [1, 1, 62], [2, 1, 64], [3, 1, 65]]), 0, 1), { countIn: false });
    h.advance(3);
    expect(flutes(h).length).toBe(2); // c'–d'–e' gebunden, f' neu
    const tones = h.ctx.tones();
    expect(tones.map((t) => [t.osc, t.legato])).toEqual([
      [tones[0].osc, false],
      [tones[0].osc, true],
      [tones[0].osc, true],
      [tones[3].osc, false],
    ]);
    [60, 62, 64, 65].forEach((m, i) => close(tones[i].freq, toneFreq(m)));
    [0, 0.5, 1, 1.5].forEach((d, i) => close(tones[i].start, S + d));
    close(tones[2].end!, S + 1.5); // der gebundene Klang endet normal mit dem letzten Ton
    // Einschwingen (Rampe der Lautstärke) nur einmal
    const env = flutes(h)[0].outs[0] as FakeGain;
    expect(env.gain.events.filter((e) => e.type === "linear").length).toBe(1);
    expect(env.gain.events.filter((e) => e.type === "target" && e.value === 0).length).toBe(1);
    // Gleiten: schnell, aber nicht sprunghaft
    const fe = flutes(h)[0].frequency.events;
    expect(fe.map((e) => e.type)).toEqual(["set", "exp", "set", "exp"]);
    close(fe[1].time - fe[0].time, GLIDE);
    expect(GLIDE).toBeGreaterThanOrEqual(0.015);
    expect(GLIDE).toBeLessThanOrEqual(0.025);
    close(fe[0].value, toneFreq(60));
    // kein neues Anblasgeräusch und kein neues Anschleifen
    expect(flutes(h)[0].detune.events.length).toBe(2);
  });

  it("Tonwiederholung unter dem Bogen: kurz getrennt und neu angestoßen", () => {
    const { h } = setup(slur(timeline([[0, 1, 67], [1, 1, 67], [2, 1, 69]]), 0, 1), { countIn: false });
    h.advance(3);
    const [a, b, c] = h.ctx.tones();
    expect(a.osc).not.toBe(b.osc);
    close(a.end!, S + 0.5 - REPEAT_GAP);
    close(b.start, S + 0.5);
    expect(c.osc).toBe(b.osc); // g'→a' gebunden
    expect(c.legato).toBe(true);
  });

  it("Atemzeichen am Bogenende: Lücke nach der Dauer des letzten Tons, nicht des ganzen Bogens", () => {
    const { h } = setup(slur(timeline([[0, 4, 60], [4, 0.5, 62, true], [4.5, 3.5, 64]]), 0), { countIn: false });
    h.advance(5);
    const [a, b, c] = h.ctx.tones();
    expect(b.osc).toBe(a.osc);
    close(b.end!, S + 2.25 - 0.4 * 0.25);
    expect(c.osc).not.toBe(b.osc);
    close(c.start, S + 2.25);
  });

  it("Heft: Stille Nacht – gebundene Töne auf derselben Stimme, alle Töne zur richtigen Zeit", () => {
    const tl = buildTimeline(songById("stille-nacht-heilige-nacht")!);
    const spq = 0.3;
    const { h, ended } = setup(tl, { secPerQuarter: spq, countIn: false });
    h.advance(tl.total * spq + 1);
    expect(ended()).toBe(1);
    const tones = h.ctx.tones();
    expect(tones.length).toBe(tl.tones.length);
    tl.tones.forEach((t, i) => {
      close(tones[i].freq, toneFreq(t.midi));
      close(tones[i].start, S + t.start * spq);
      expect(tones[i].legato).toBe(!!tl.tones[i - 1]?.slurToNext);
    });
    const bound = tl.tones.filter((t) => t.slurToNext).length;
    expect(bound).toBe(3);
    expect(flutes(h).length).toBe(tl.tones.length - bound);
    // erster Ton: g' gebunden zu a', danach ein neuer Einsatz auf g'
    expect(tones[1].osc).toBe(tones[0].osc);
    expect(tones[2].osc).not.toBe(tones[1].osc);
    close(tones[1].end!, S + tl.tones[2].start * spq);
  });

  it("Tempoänderung mitten im Bogen: weiter gebunden, danach im neuen Tempo", () => {
    const tl = timeline(Array.from({ length: 12 }, (_, i) => [i, 1, 60 + (i % 2) * 2] as T));
    slur(tl, ...Array.from({ length: 11 }, (_, i) => i));
    const { h, player } = setup(tl, { countIn: false });
    h.advance(1.0);
    player.setTempo(0.25);
    h.advance(4);
    expect(flutes(h).length).toBe(1);
    const tones = h.ctx.tones();
    expect(tones.length).toBe(12);
    const diffs = tones.slice(1).map((t, i) => Number((t.start - tones[i].start).toFixed(6)));
    const k = diffs.indexOf(0.25);
    expect(k).toBeGreaterThan(0);
    expect(diffs.slice(0, k).every((d) => d === 0.5)).toBe(true);
    expect(diffs.slice(k).every((d) => d === 0.25)).toBe(true);
    close(tones[11].end!, tones[11].start + 0.25);
  });

  it("Stopp mitten im Bogen: die Stimme endet nach dem Ausblenden, spätere Wechsel erklingen nicht", () => {
    const tl = timeline(Array.from({ length: 16 }, (_, i) => [i, 1, 60 + (i % 3)] as T));
    slur(tl, ...Array.from({ length: 15 }, (_, i) => i));
    const { h, player } = setup(tl, { countIn: false });
    h.advance(1.6);
    player.stop();
    const osc = flutes(h)[0];
    expect(osc.stopAt!).toBeLessThanOrEqual(1.6 + FADE + 0.011);
    h.advance(2);
    expect(flutes(h).length).toBe(1);
    for (const t of h.ctx.tones()) expect(t.start).toBeLessThan(osc.stopAt!);
  });

  it("Schleife: am Ende des Durchgangs neuer Einsatz, im Durchgang weiter gebunden", () => {
    // auch wenn der letzte Ton (fälschlich) als gebunden markiert ist: nie über die Schleifengrenze
    const tl = slur(timeline([[0, 2, 60], [2, 2, 62]]), 0, 1);
    const { h } = setup(tl, { countIn: false, loop: true });
    h.advance(S + 3 * 2 + 0.1);
    const tones = h.ctx.tones();
    expect(tones.length).toBeGreaterThanOrEqual(6);
    expect(tones.slice(0, 6).map((t) => t.legato)).toEqual([false, true, false, true, false, true]);
    tones.slice(0, 6).forEach((t, i) => close(t.start, S + i));
    close(tones[1].end!, S + 2); // Übergang zum nächsten Durchgang ohne Lücke
    expect(tones[2].osc).not.toBe(tones[1].osc);
  });

  it("Abschnitt aus Stille Nacht in Schleife: Bindung über den Taktstrich, Durchgänge nahtlos", () => {
    const s = songById("stille-nacht-heilige-nacht")!;
    // Takte 19–20: (c''2. | e''2.)
    const tl = sectionTimeline(s, 18, 19);
    expect(tl.tones.map((t) => [t.midi, !!t.slurToNext])).toEqual([
      [72, true],
      [76, false],
    ]);
    const { h } = setup(tl, { countIn: false, loop: true, secPerQuarter: 0.25 });
    h.advance(S + 2 * 6 * 0.25 + 0.1);
    const tones = h.ctx.tones();
    expect(tones.slice(0, 4).map((t) => [Math.round(t.freq), t.legato])).toEqual([
      [Math.round(toneFreq(72)), false],
      [Math.round(toneFreq(76)), true],
      [Math.round(toneFreq(72)), false],
      [Math.round(toneFreq(76)), true],
    ]);
    close(tones[2].start, S + 6 * 0.25);
  });
});

describe("Abspieler: Zeitplan ohne Ton", () => {
  it("ohne Ton und ohne Zählzeit in Schleife: keine Endlosschleife, Durchgänge laufen im Takt weiter", () => {
    const { h, player, positions, ended } = setup(empty({ total: 4 }), { loop: true });
    expect(player.playing).toBe(true);
    h.advance(S + 3 * 4 * 0.5 + 0.1); // drei Durchgänge zu je 4 Vierteln
    expect(player.playing).toBe(true);
    expect(ended()).toBe(0);
    expect(h.ctx.oscs.length).toBe(0);
    expect(Math.max(...positions.map((p) => p.pass))).toBe(3);
    player.stop();
    expect(player.playing).toBe(false);
  });

  it("Länge 0: keine Schleife, endet sofort; ohne Schleife endet ein stiller Abschnitt nach seiner Länge", () => {
    const zero = setup(empty({ total: 0 }), { loop: true });
    zero.h.advance(1);
    expect(zero.player.playing).toBe(false);
    expect(zero.ended()).toBe(1);
    zero.player.setLoop(true);
    const once = setup(empty({ total: 4 }));
    once.h.advance(S + 2 - 0.05);
    expect(once.player.playing).toBe(true);
    once.h.advance(0.5);
    expect(once.player.playing).toBe(false);
    expect(once.ended()).toBe(1);
  });

  it("Schleife über einen Pausentakt: Metronom klickt im Takt weiter", () => {
    const s = song("c'1 | r1 | d'1 ||");
    const tl = sectionTimeline(s, 1, 1);
    expect(tl.tones).toEqual([]);
    const { h, player } = setup(tl, { loop: true, metronome: true });
    h.advance(S + 2 + 3 * 2 + 0.1);
    expect(player.playing).toBe(true);
    const clicks = h.ctx.clicks();
    expect(clicks.length).toBeGreaterThanOrEqual(4 + 12);
    clicks.slice(0, 16).forEach((c, i) => close(c.start, S + i * 0.5));
    expect(clicks.slice(4, 16).map((c) => c.freq === ACCENT)).toEqual(
      Array.from({ length: 12 }, (_, i) => i % 4 === 0),
    );
    expect(h.ctx.tones().length).toBe(0);
  });
});
