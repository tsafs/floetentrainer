// Hören (Echo): Die App spielt eine kurze Folge vor, sie spielt sie nach oder tippt die Namen
// (docs/app-uebungen.md, Abschnitt 4). Relatives Hören: Der erste Ton ist genannt, den Rest erkennt sie am
// Abstand. Zählt nicht für Trefferquote und Fächer – eine eigene Fähigkeit.

import { LiveTuning } from "../audio/flute-profile";
import { WaitFollower } from "../audio/follow";
import { DEFAULT_JUDGE, type Frame } from "../audio/judge";
import { keepAwake, mic } from "../audio/mic";
import { songPlayer } from "../audio/song-player";
import { isAltSpelling, levelOf, unlockedNotes, type Track } from "../music/levels";
import { midiNameHtml, nameHtml } from "../music/names";
import { chartNoteByMidi, note } from "../music/notes";
import { nameSvgText, staffRange, staffSeqSvg } from "../music/staff";
import { FOLGE_MAX_DISTINCT, folgeChoices, folgeKey, FolgeLength, makeFolge } from "../srs/sequences";
import { toneTimeline } from "../songs/timeline";
import { activeFlute } from "../store/data";
import { ICON_CHECK, ICON_X, pressGuard, topbar, type View } from "./common";

/** Aufgaben je Durchgang */
export const ECHO_TASKS = 10;
/** längste Folge */
export const ECHO_MAX_LEN = 5;
/** Sekunden je Ton beim Vorspielen */
const ECHO_SEC = 0.6;
/** Nachklang abwarten, bevor das Mikrofon zuhört (ms) */
const ECHO_TAIL_MS = 350;

type Variant = "spielen" | "tippen";

export const echoView: View = (root, ctx) => {
  const d = ctx.data;
  const flute = activeFlute(d);
  let closed = false;
  let unlisten: (() => void) | null = null;
  let onFrame: ((f: Frame) => void) | null = null;
  let timer: number | null = null;

  const stopSound = () => {
    if (songPlayer.playing) songPlayer.stop();
    else if (songPlayer.context) songPlayer.idle();
  };
  const clearTimer = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };

  // ------------------------------------------------------------ Auswahl
  const renderStart = () => {
    root.innerHTML = `
<main class="screen page echo-start">${topbar("Hören")}
  <p class="help">Die App spielt dir ein paar Töne vor. Der erste ist genannt – die anderen erkennst du am Abstand: ein Schritt höher, ein Sprung tiefer … Zählt nicht für die Stufen.</p>
  <section class="actions">
    <button class="main" data-variant="spielen">Nachspielen<small>mit Flöte und Mikrofon</small></button>
    <button class="alt" data-variant="tippen">Namen tippen<small>leise, auch unterwegs</small></button>
  </section>
</main>`;
    root.querySelectorAll<HTMLButtonElement>("[data-variant]").forEach((b) =>
      b.addEventListener("click", () => {
        const v = b.dataset.variant as Variant;
        // AudioContext und Mikrofon direkt aus dem Tippen heraus
        songPlayer.prepare();
        if (v === "tippen") return begin(v);
        mic
          .start()
          .then(() => begin(v))
          .catch((e) => {
            ctx.micError = String(e);
            ctx.micRetry = () => mic.start().then(() => ctx.go("#/hoeren"));
            ctx.go("#/mikrofon");
          });
      }),
    );
  };

  // ------------------------------------------------------------ Durchgang
  let variant: Variant = "tippen";
  let pool: string[] = [];
  let len: FolgeLength;
  let used = new Set<string>();
  let done = 0;
  let correct = 0;
  let last: string | null = null;

  const begin = (v: Variant) => {
    if (closed) return;
    variant = v;
    const track: Track = v === "spielen" ? "spielen" : "lesen";
    pool = unlockedNotes(track, levelOf(track, d.stages[track]))
      .filter((n) => !isAltSpelling(n))
      .sort((a, b) => note(a).midi - note(b).midi);
    // Beginn mit 2–3 Tönen (FolgeLength), bis ECHO_MAX_LEN
    len = new FolgeLength(Math.min(pool.length, 5), ECHO_MAX_LEN, Math.random);
    used = new Set();
    done = 0;
    correct = 0;
    if (v === "spielen") {
      keepAwake(true);
      unlisten = mic.listen((f) => onFrame?.(f));
    }
    task();
  };

  const task = () => {
    if (closed) return;
    clearTimer();
    stopSound();
    onFrame = null;
    if (done >= ECHO_TASKS) return renderEnd();
    const notes = makeFolge(pool, len.len, Math.random, {
      used,
      avoidFirst: last,
      maxDistinct: variant === "tippen" ? FOLGE_MAX_DISTINCT : undefined,
    });
    used.add(folgeKey(notes));
    last = notes[notes.length - 1];
    renderTask(notes);
  };

  const renderTask = (notes: string[]) => {
    const n = notes.length;
    const range = staffRange(pool);
    const staff = staffSeqSvg(notes, { range, className: "echo", label: `${n} Töne, der erste ${note(notes[0]).name}` });
    const pct = Math.round((done / ECHO_TASKS) * 100);
    const typing = variant === "tippen";
    const choices = typing ? folgeChoices(notes, pool, Math.random) : [];
    const btns = typing
      ? `<div class="btns">${choices.map((c) => `<button data-choice="${c}" disabled>${nameHtml(c)}</button>`).join("")}</div>`
      : "";
    root.innerHTML = `
<main class="screen fit prac ask kind-folge echo" data-step="echo" data-notes="${notes.join(" ")}" data-variant="${variant}">
  <div class="barrow"><button class="iconbtn x" data-act="close" aria-label="Beenden">${ICON_X}</button>
    <div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${ECHO_TASKS}" aria-valuenow="${done}"><i style="width:${pct}%"></i></div>
    <span class="count" data-testid="count">${done + 1} von ${ECHO_TASKS}</span></div>
  <div class="stage">${staff}<p class="q" aria-live="polite">Hör zu …</p><p class="first">Der erste Ton ist ${nameHtml(notes[0])}.</p></div>
  <div class="answer">${btns}<div class="idkrow three"><button class="textbtn" data-act="again">Anhören</button><button class="textbtn" data-act="idk">Weiß nicht</button><span></span></div><div class="slot" aria-live="polite"></div></div>
</main>`;
    const main = root.querySelector("main")!;
    const pressedHere = pressGuard(main);
    const q = main.querySelector(".q")!;
    const slot = main.querySelector(".slot")!;
    const ok: (boolean | undefined)[] = [];
    /** beim Nachspielen: der erste falsch gespielte Ton je Note (bleibt unter der Note stehen) */
    const wrongAt: (string | null)[] = [];
    let cur = 0;
    let finished = false;
    let follower: WaitFollower | null = null;
    const g = (k: number) => main.querySelector<SVGGElement>(`.sn[data-i="${k}"]`);
    const setCur = (k: number) => {
      main.querySelectorAll(".sn.cur").forEach((x) => x.classList.remove("cur"));
      g(k)?.classList.add("cur");
    };
    /** Note k aufdecken: grün/rot, darunter ihre Antwort */
    const reveal = (k: number, good: boolean, answer: string | null) => {
      const el = g(k);
      if (!el) return;
      el.classList.add("shown", good ? "hit" : "miss");
      el.querySelector(".sl")!.innerHTML = answer ? nameSvgText(answer) : "";
    };
    g(0)?.classList.add("shown");

    const answering = () => {
      if (finished || closed) return;
      q.textContent = typing ? "Welche Töne waren es? Der Reihe nach." : "Jetzt du – spiel nach.";
      if (typing) main.querySelectorAll<HTMLButtonElement>(".btns button").forEach((b) => (b.disabled = false));
      else {
        follower ??= makeFollower();
        follower.arm(performance.now());
        onFrame = (f) => follower!.push(f);
      }
    };
    const listen = () => {
      onFrame = null;
      clearTimer();
      q.textContent = "Hör zu …";
      songPlayer.play(toneTimeline(notes.map((x) => note(x).midi)), {
        secPerQuarter: ECHO_SEC,
        a4: flute.tuning.hz,
        countIn: false,
        melody: true,
        onEnd: () => {
          if (closed || finished) return;
          timer = window.setTimeout(answering, ECHO_TAIL_MS);
        },
      });
    };

    const finish = (head?: string) => {
      if (finished) return;
      finished = true;
      onFrame = null;
      main.querySelectorAll(".sn.cur").forEach((x) => x.classList.remove("cur"));
      for (let k = 0; k < n; k++) if (ok[k] === undefined) ((ok[k] = false), reveal(k, false, null));
      const all = ok.every(Boolean);
      done++;
      if (all) correct++;
      len.update(all);
      main.classList.remove("ask");
      main.classList.add(all ? "ok" : "err");
      main.querySelectorAll<HTMLButtonElement>(".btns button").forEach((b) => (b.disabled = true));
      const names = notes.map((x, j) => `<span class="${ok[j] ? "" : "bad"}">${nameHtml(x)}</span>`).join(" ");
      slot.innerHTML =
        `<div class="panel ${all ? "ok" : "err"} center solo" data-testid="panel"><div class="txt"><span class="head">${all ? `${ICON_CHECK} Richtig` : (head ?? "Nicht ganz")}</span>` +
        `<span class="names">${names}</span></div></div>` +
        `<div class="gorow"><button class="textbtn" data-act="replay">Anhören</button><button class="go" data-act="next">Weiter</button></div>`;
      slot.querySelector('[data-act="replay"]')!.addEventListener("click", (e) => {
        e.stopPropagation();
        songPlayer.play(toneTimeline(notes.map((x) => note(x).midi)), { secPerQuarter: ECHO_SEC, a4: flute.tuning.hz, countIn: false, melody: true });
      });
      const go = slot.querySelector<HTMLButtonElement>('[data-act="next"]')!;
      go.addEventListener("click", (e) => {
        if (!pressedHere(e, go)) return;
        task();
      });
      go.focus({ preventScroll: true });
    };

    const makeFollower = () =>
      new WaitFollower(toneTimeline(notes.map((x) => note(x).midi)), {
        cfg: { tuning: flute.tuning.hz, toleranceCents: d.settings.toleranceCents, holdMs: d.settings.holdMs, minClarity: DEFAULT_JUDGE.minClarity },
        tuning: new LiveTuning(flute.offsets, {}, flute.tuning.known),
        onNote: (k, r) => {
          if (finished) return;
          if (ok[k] === undefined) ok[k] = r.ok;
          reveal(k, ok[k]!, ok[k] ? notes[k] : (wrongAt[k] ?? null));
          q.textContent = "Jetzt du – spiel nach.";
          q.classList.remove("warn");
          cur = k + 1;
          if (cur < n) setCur(cur);
        },
        onWrong: (k, midi) => {
          if (finished) return;
          ok[k] = false;
          g(k)?.classList.add("miss");
          const id = chartNoteByMidi(midi)?.id;
          if (id && wrongAt[k] == null) {
            wrongAt[k] = id;
            g(k)!.querySelector(".sl")!.innerHTML = nameSvgText(id);
          }
          q.innerHTML = `Du spielst ${midiNameHtml(midi)}`;
          q.classList.add("warn");
        },
        onPass: () => finish(),
      });

    if (typing) {
      // der erste Ton ist genannt: er gilt als richtig, getippt wird ab dem zweiten
      ok[0] = true;
      reveal(0, true, notes[0]);
      cur = 1;
      setCur(1);
      main.querySelectorAll<HTMLButtonElement>(".btns button").forEach((b) =>
        b.addEventListener("click", (e) => {
          if (finished || cur >= n || !pressedHere(e, b)) return;
          const c = b.dataset.choice!;
          ok[cur] = c === notes[cur];
          reveal(cur, ok[cur]!, c);
          cur++;
          if (cur < n) setCur(cur);
          else finish();
        }),
      );
    } else setCur(0);

    main.querySelector('[data-act="again"]')!.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!finished) listen();
    });
    main.querySelector('[data-act="idk"]')!.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!finished) finish("Auflösung");
    });
    main.querySelector('[data-act="close"]')!.addEventListener("click", () => (done > 0 ? renderEnd() : ctx.go("#/")));
    timer = window.setTimeout(listen, 400);
  };

  // ------------------------------------------------------------ Ende
  const renderEnd = () => {
    clearTimer();
    stopSound();
    onFrame = null;
    root.innerHTML = `
<main class="screen summary">
  <h1>${done > 0 && correct === done ? "Wunderbar" : "Geschafft"}</h1>
  <section class="block"><span class="num" data-testid="score">${correct} von ${done}</span><span class="lbl">richtig gehört</span></section>
  <div class="spacer"></div>
  <div class="btnrow"><button class="big alt" data-act="again">Nochmal</button><button class="big" data-act="home">Zur Startseite</button></div>
</main>`;
    root.querySelector('[data-act="again"]')!.addEventListener("click", () => {
      songPlayer.prepare();
      done = 0;
      correct = 0;
      used = new Set();
      task();
    });
    root.querySelector('[data-act="home"]')!.addEventListener("click", () => ctx.go("#/"));
  };

  renderStart();

  return () => {
    closed = true;
    clearTimer();
    onFrame = null;
    stopSound();
    unlisten?.();
    if (variant === "spielen" && unlisten) {
      keepAwake(false);
      mic.stop();
    }
  };
};
