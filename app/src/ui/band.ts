// Spielen als Notenband (docs/app-notenband.md): erst die neuen Töne einzeln vorstellen, dann eine lange
// Notenzeile, die unter einer festen Lesemarke durchläuft. Das Band wartet: Ist die Note an der Marke richtig
// gespielt, gleitet es zur nächsten. Erkennung wie bei den Folgen (WaitFollower), ein einziger Durchgang über
// das wachsende Band.

import { LiveTuning, offsetFor } from "../audio/flute-profile";
import { WaitFollower } from "../audio/follow";
import { DEFAULT_JUDGE, PlayJudge, type Frame, type Heard, type JudgeOutput } from "../audio/judge";
import { keepAwake, mic } from "../audio/mic";
import { songPlayer } from "../audio/song-player";
import { GLYPHS } from "../music/bravura";
import { fluteSvg } from "../music/flute";
import { levelOf, unlockedNotes } from "../music/levels";
import { midiNameHtml, nameHtml, nameText } from "../music/names";
import { note } from "../music/notes";
import { staffRange, staffSvg } from "../music/staff";
import { renderScore, type BandOptions, type Score } from "../songs/engrave";
import { toneTimeline, type Timeline } from "../songs/timeline";
import type { BandPhrase, BandSession } from "../srs/band";
import { GRIP_TIPS, introSentence } from "../srs/hints";
import { activeFlute } from "../store/data";
import { ICON_CHECK, ICON_X, pressGuard, type View } from "./common";

/** feste senkrechte Ausdehnung des Bands in Zwischenräumen (Platz für c³ mit Vorzeichen und für c¹) */
const FRAME = { top: -8, bottom: 2.2 };
/** Dehnung der Notenabstände */
const STRETCH = 0.9;
/** Gleiten zur nächsten Note */
const GLIDE_MS = 380;
/** nach einem falschen Ton mit Kopfhörern: so laut der richtige */
const HINT_VOL = 0.4;
/** Breite des feststehenden Zeilenkopfs (Schlüssel, Taktangabe) in Zwischenräumen */
const HEAD = 3.4;
const HEAD_TIME = 2.3;

const QUESTION = "Spiel die Note an der Marke.";

let seq = 0;
const r = (v: number) => String(Math.round(v * 1000) / 1000);

export const bandView: View = (root, ctx) => {
  const band = ctx.band;
  if (!band) {
    ctx.go("#/");
    return;
  }
  const b: BandSession = band;
  const d = ctx.data;
  const myFlute = activeFlute(d);
  const fluteOffsets = myFlute.offsets;
  const range = staffRange(unlockedNotes("lesen", levelOf("lesen", d.stages.lesen)));
  let closed = false;
  let lastHeardAt = 0;
  let onFrame: ((f: Frame) => Heard | null) | null = null;
  let timer: number | null = null;

  keepAwake(true);
  const unlisten = mic.listen((f) => {
    const h = onFrame ? onFrame(f) : null;
    showHeard(h, f.t);
  });

  function showHeard(h: Heard | null, t: number) {
    const box = root.querySelector(".listen");
    if (!box) return;
    if (!h) {
      if (t - lastHeardAt < 250) return;
      box.querySelector(".heard")!.innerHTML = "–";
      box.querySelector(".cents")!.textContent = "";
      box.querySelector(".meter")!.className = "meter off";
      return;
    }
    lastHeardAt = t;
    box.querySelector(".heard")!.innerHTML = midiNameHtml(h.midi);
    box.querySelector(".cents")!.textContent = `${h.cents > 0 ? "+" : h.cents < 0 ? "−" : "±"}${Math.abs(h.cents)} Cent`;
    const m = box.querySelector(".meter") as HTMLElement;
    m.className = Math.abs(h.cents) <= d.settings.toleranceCents ? "meter in" : "meter";
    (m.querySelector("i") as HTMLElement).style.left = `${50 + Math.max(-50, Math.min(50, h.cents))}%`;
  }

  const listenBox = () =>
    `<div class="listen" aria-live="off"><span class="hl">Ich höre</span><span class="heard">–</span><span class="cents"></span><div class="meter off"><i></i></div></div>`;

  function finish() {
    if (timer !== null) window.clearTimeout(timer);
    ctx.lastResult = b.result();
    ctx.band = null;
    ctx.go("#/ende");
  }

  function header(label: string, pct: number): string {
    return (
      `<div class="barrow"><button class="iconbtn x" data-act="close" aria-label="Spielen beenden">${ICON_X}</button>` +
      `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><i style="width:${pct}%"></i></div>` +
      `<span class="count" data-testid="count">${label}</span></div>`
    );
  }

  function bindClose(main: HTMLElement) {
    main.querySelector('[data-act="close"]')!.addEventListener("click", (e) => {
      e.stopPropagation();
      if (b.played > 0) finish();
      else {
        ctx.band = null;
        ctx.go("#/");
      }
    });
  }

  function playTones(midis: number[], volume: number | true) {
    songPlayer.play(toneTimeline(midis), { secPerQuarter: 0.6, a4: myFlute.tuning.hz, countIn: false, melody: volume });
  }

  // ------------------------------------------------------------ Vorstellung neuer Töne
  const intros = b.intros.slice();
  const judge = new PlayJudge(
    { tuning: myFlute.tuning.hz, toleranceCents: d.settings.toleranceCents, holdMs: d.settings.holdMs },
    (midi) => offsetFor(fluteOffsets, midi),
  );

  function renderIntro(id: string) {
    const tip = GRIP_TIPS[note(id).partner ?? id];
    root.innerHTML = `
<main class="screen fit prac intro" data-step="intro" data-note="${id}" data-seq="${++seq}">
  ${header("Neuer Ton", 0)}
  <div class="stage">${staffSvg(id, { range, label: `Note ${nameText(id)}` })}<p class="q">Spiel diesen Ton einmal</p></div>
  <div class="answer">
    ${listenBox()}
    <div class="panel neutral" data-testid="panel"><div class="fl">${fluteSvg(note(id).fingering, `Griffbild ${nameText(id)}`)}</div><div class="txt">
      <span class="newtag">Neu</span><span class="name">${nameHtml(id)}</span>
      <span class="sub">${introSentence(id)}</span>${tip ? `<span class="tip">${tip}</span>` : ""}
    </div></div>
    <button class="go" data-act="intro-ok">Weiter</button>
  </div>
</main>`;
    const main = root.querySelector("main")!;
    bindClose(main);
    const pressedHere = pressGuard(main);
    let done = false;
    const next = () => {
      if (done || closed) return;
      done = true;
      if (timer !== null) window.clearTimeout(timer);
      onFrame = null;
      judge.stop();
      b.introDone(id);
      step();
    };
    const ok = main.querySelector('[data-act="intro-ok"]')!;
    ok.addEventListener("click", (e) => {
      e.stopPropagation();
      if (pressedHere(e, ok)) next();
    });
    judge.newCard(note(id).midi, performance.now(), { judgeWrong: false });
    onFrame = (f) => {
      const o: JudgeOutput = judge.push(f);
      if (o.event === "correct") {
        onFrame = null;
        b.introDone(id);
        const p = main.querySelector(".panel")!;
        p.className = "panel ok";
        p.querySelector(".newtag")!.outerHTML = `<span class="head">${ICON_CHECK}Richtig</span>`;
        timer = window.setTimeout(next, 1500);
        main.addEventListener("click", next, { once: true });
      }
      return o.heard;
    };
  }

  function step() {
    const n = intros.shift();
    if (n) renderIntro(n);
    else renderBand();
  }

  // ------------------------------------------------------------ Das Band
  function renderBand() {
    b.start();
    b.fill(0);
    root.innerHTML = `
<main class="screen fit prac band" data-step="band" data-seq="${++seq}" data-i="0">
  ${header("", 0)}
  <div class="stage">
    <div class="bandview" role="img" aria-label="Notenband">
      <svg class="bandbg" aria-hidden="true"></svg>
      <div class="bandtrack"></div>
      <svg class="bandhead" aria-hidden="true"></svg>
      <i class="bandmark" aria-hidden="true"></i>
    </div>
    <p class="q" aria-live="polite">${QUESTION}</p>
  </div>
  <div class="answer">
    ${listenBox()}
    <div class="idkrow"><button class="textbtn" data-act="skip">Überspringen</button></div>
  </div>
</main>`;
    const main = root.querySelector("main")!;
    bindClose(main);
    const pressedHere = pressGuard(main);
    const view = main.querySelector<HTMLElement>(".bandview")!;
    const track = main.querySelector<HTMLElement>(".bandtrack")!;
    const bg = main.querySelector<SVGSVGElement>(".bandbg")!;
    const head = main.querySelector<SVGSVGElement>(".bandhead")!;
    const mark = main.querySelector<HTMLElement>(".bandmark")!;
    const q = main.querySelector<HTMLElement>(".q")!;
    const count = main.querySelector<HTMLElement>('[data-testid="count"]')!;
    const barI = main.querySelector<HTMLElement>(".bar i")!;

    // Zeitplan, den die Wertung liest: wächst mit dem Band (die Töne werden angehängt)
    const live: Timeline = { ...b.score.timeline(), tones: b.score.timeline().tones.slice() };
    /** je Ton: getroffen (true), falsch (false), offen (undefined) */
    const ok: (boolean | undefined)[] = [];
    let cur = 0;
    let score: Score | null = null;
    let sp = 10;
    let markX = 0;
    let lastW = 0;

    const phraseOf = (k: number): BandPhrase | undefined => b.phrases.find((p) => k >= p.span.from && k < p.span.to);

    /** Notenbild neu setzen (nach dem Anhängen und bei neuer Breite) */
    function draw() {
      const w = view.clientWidth || 320;
      lastW = w;
      sp = Math.max(9.5, Math.min(13, w / 32));
      const opts: BandOptions = { stretch: STRETCH, ...FRAME };
      score = renderScore(b.score.song(), { width: w, sp, band: opts });
      const svg = score.systems[0].el;
      const hPx = svg.height.baseVal.value || Number(svg.getAttribute("height"));
      const yTop = FRAME.top;
      const hSp = hPx / sp;
      view.style.height = `${hPx}px`;
      track.replaceChildren(score.el);
      // Hintergrund: Linien über die ganze Breite; Kopf: Schlüssel und Taktangabe auf Papier, sanft auslaufend
      const W = w / sp;
      const m = b.score.meter;
      const headW = HEAD + HEAD_TIME;
      const vb = `0 ${r(yTop)} ${r(W)} ${r(hSp)}`;
      bg.setAttribute("viewBox", vb);
      bg.setAttribute("width", String(w));
      bg.setAttribute("height", String(hPx));
      bg.innerHTML = [0, 1, 2, 3, 4].map((i) => `<line class="sline" x1="0" x2="${r(W)}" y1="${-i}" y2="${-i}" stroke-width="0.13"/>`).join("");
      const digits = (n: number, y: number) =>
        [...String(n)].map((c, i, a) => `<path d="${GLYPHS[`time${c}`].d}" transform="translate(${r(HEAD + 0.15 + (i - (a.length - 1) / 2) * GLYPHS[`time${c}`].adv)} ${y})"/>`).join("");
      head.setAttribute("viewBox", `0 ${r(yTop)} ${r(headW + 2)} ${r(hSp)}`);
      head.setAttribute("width", String((headW + 2) * sp));
      head.setAttribute("height", String(hPx));
      head.innerHTML =
        `<defs><linearGradient id="bandfade" x1="0" x2="1" y1="0" y2="0"><stop offset="0" class="fade0"/><stop offset="1" class="fade1"/></linearGradient></defs>` +
        `<rect class="paper" x="0" y="${r(yTop)}" width="${r(headW)}" height="${r(hSp)}"/>` +
        `<rect x="${r(headW)}" y="${r(yTop)}" width="2" height="${r(hSp)}" fill="url(#bandfade)"/>` +
        [0, 1, 2, 3, 4].map((i) => `<line class="sline" x1="0" x2="${r(headW + 2)}" y1="${-i}" y2="${-i}" stroke-width="0.13"/>`).join("") +
        `<path class="clef" d="${GLYPHS.clef.d}" transform="translate(0.45 -1)"/>` +
        `<g class="tsig">${digits(m.num, -3)}${digits(m.den, -1)}</g>`;
      markX = Math.round(Math.max((headW + 3.5) * sp, w * 0.34));
      mark.style.left = `${markX}px`;
      const staffTop = (-4 - yTop) * sp;
      mark.style.top = `${staffTop - 1.2 * sp}px`;
      mark.style.height = `${6.4 * sp}px`;
      // Titel über den Abschnitten (Lied, Wechsel, noch einmal)
      for (const p of b.phrases) {
        if (!p.label) continue;
        const t = live.tones[p.span.from] ?? b.score.timeline().tones[p.span.from];
        const x = t ? xOf(p.span.from) : null;
        if (x === null) continue;
        const el = document.createElement("span");
        el.className = `blabel ${p.kind}${p.retry ? " retry" : ""}`;
        el.textContent = p.label;
        el.style.left = `${x - 0.6 * sp}px`;
        track.appendChild(el);
      }
      // Markierungen wieder anbringen
      ok.forEach((v, k) => v !== undefined && classes(k, v ? "hit" : "miss"));
      setCur(cur, false);
    }

    /** x-Lage (Pixel im Band) des Tons k */
    function xOf(k: number): number | null {
      const t = b.score.timeline().tones[k];
      if (!t || !score) return null;
      const bar = b.score.bars[t.bar];
      const i = bar.events.findIndex((e) => e.id === t.ids[0]);
      const g = score.barGeom(t.bar);
      return g && i >= 0 ? g.xs[i] : null;
    }

    function els(k: number): SVGGElement[] {
      const t = b.score.timeline().tones[k];
      return t && score ? t.ids.map((id) => score!.noteEl(id)).filter((x): x is SVGGElement => !!x) : [];
    }
    function classes(k: number, c: "hit" | "miss") {
      for (const el of els(k)) {
        el.classList.remove("hit", "miss");
        el.classList.add(c);
      }
    }

    /** Note k an die Marke holen */
    function setCur(k: number, glide = true) {
      main.querySelectorAll(".bandtrack .cur").forEach((x) => x.classList.remove("cur"));
      els(k).forEach((x) => x.classList.add("cur"));
      const x = xOf(k) ?? xOf(k - 1) ?? 0;
      track.style.transition = glide ? `transform ${GLIDE_MS}ms cubic-bezier(.3,.7,.3,1)` : "none";
      track.style.transform = `translateX(${Math.round(markX - x)}px)`;
      const t = b.score.timeline().tones[k];
      main.dataset.i = String(k);
      main.dataset.note = t ? (note(idOf(k)).id ?? "") : "";
      const p = phraseOf(k);
      main.dataset.phrase = p ? p.kind : "";
      view.dataset.notes = b.phrases.flatMap((x) => x.notes).join(" ");
      // gespielt sind alle Töne vor der Marke (gewertet wird erst am Ende eines Abschnitts)
      count.textContent = `${k} ${k === 1 ? "Ton" : "Töne"}`;
      barI.style.width = `${Math.round(b.progress * 100)}%`;
    }

    /** Kennung des Tons k (aus seinem Abschnitt) */
    function idOf(k: number): string {
      const p = phraseOf(k);
      return p ? p.notes[k - p.span.from] : "a1";
    }

    /** Neue Abschnitte anhängen, wenn rechts die Noten knapp werden */
    function grow() {
      if (!b.fill(cur)) return;
      const tones = b.score.timeline().tones;
      for (let i = live.tones.length; i < tones.length; i++) live.tones.push(tones[i]);
      draw();
    }

    /** Ton k fertig (getroffen bzw. übersprungen): ggf. Abschnitt werten, weiter */
    function noteDone(k: number, good: boolean) {
      if (ok[k] === undefined) ok[k] = good;
      classes(k, ok[k] ? "hit" : "miss");
      q.textContent = QUESTION;
      q.classList.remove("warn", "hint");
      const p = phraseOf(k);
      if (p && k === p.span.to - 1) {
        b.phraseDone(p, p.notes.map((_, i) => ok[p.span.from + i] === true));
      }
      cur = k + 1;
      grow();
      if (cur >= b.score.timeline().tones.length && b.closed) {
        main.querySelectorAll(".bandtrack .cur").forEach((x) => x.classList.remove("cur"));
        count.textContent = `${cur} Töne`;
        barI.style.width = "100%";
        timer = window.setTimeout(finish, 900);
        return;
      }
      setCur(cur);
    }

    const w = new WaitFollower(live, {
      cfg: {
        tuning: myFlute.tuning.hz,
        toleranceCents: d.settings.toleranceCents,
        holdMs: d.settings.holdMs,
        minClarity: DEFAULT_JUDGE.minClarity,
      },
      tuning: new LiveTuning(fluteOffsets, {}, myFlute.tuning.known),
      onNote: (k, res) => noteDone(k, res.ok),
      onWrong: (k, midi) => {
        ok[k] = false;
        classes(k, "miss");
        q.innerHTML = `Du spielst ${midiNameHtml(midi)}`;
        q.classList.remove("hint");
        q.classList.add("warn");
        if (d.settings.headphones) playTones([note(idOf(k)).midi], HINT_VOL);
      },
      onOctave: (k) => {
        if (ok[k] === false) return;
        q.textContent = "eine Oktave zu hoch – sanfter blasen";
        q.classList.add("hint");
      },
    });

    const skip = main.querySelector<HTMLButtonElement>('[data-act="skip"]')!;
    skip.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!pressedHere(e, skip) || w.done) return;
      w.skip(performance.now());
    });

    draw();
    const onResize = () => {
      if (view.clientWidth && view.clientWidth !== lastW) draw();
    };
    window.addEventListener("resize", onResize);
    cleanups.push(() => window.removeEventListener("resize", onResize));
    w.arm(performance.now());
    onFrame = (f) => w.push(f);
  }

  const cleanups: (() => void)[] = [];
  step();

  return () => {
    closed = true;
    if (timer !== null) window.clearTimeout(timer);
    onFrame = null;
    judge.stop();
    if (songPlayer.playing) songPlayer.stop();
    for (const c of cleanups) c();
    unlisten();
    keepAwake(false);
    mic.stop();
  };
};
