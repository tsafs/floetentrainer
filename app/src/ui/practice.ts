// Übungsseite: Vorstellung, Note→Name, Note→Griff, Griff→Note und Spielen.

import { LiveTuning, offsetFor } from "../audio/flute-profile";
import { WaitFollower } from "../audio/follow";
import { DEFAULT_JUDGE, PlayJudge, type Frame, type Heard, type JudgeOutput } from "../audio/judge";
import { keepAwake, mic } from "../audio/mic";
import { songPlayer } from "../audio/song-player";
import { levelOf, unlockedNotes, type Kind } from "../music/levels";
import { fluteSvg } from "../music/flute";
import { midiNameHtml, nameHtml, nameText } from "../music/names";
import { chartNoteByMidi, note } from "../music/notes";
import { nameSvgText, staffRange, staffSeqSvg, staffSvg, type Range } from "../music/staff";
import { choiceCount, makeChoices } from "../srs/choices";
import { folgeChoices } from "../srs/sequences";
import { toneTimeline } from "../songs/timeline";
import { songById } from "../songs/library";
import { renderScore, type Score } from "../songs/engrave";
import { excerptTimeline, songExcerpt } from "../songs/snippets";
import { secPerQuarter } from "../songs/tempo";
import { GRIP_TIPS, introSentence } from "../srs/hints";
import type { Session, Step } from "../srs/session";
import { activeFlute, cardKey } from "../store/data";
import { ICON_CHECK, ICON_X, pressGuard, type View } from "./common";

const QUESTION: Record<Kind, string> = {
  name: "Wie heißt diese Note?",
  griff: "Welcher Griff gehört dazu?",
  note: "Welche Note hat diesen Griff?",
  spiel: "Spiel diese Note",
};

/** Tonfolge vorspielen („Anhören“, Ton nach einem Fehler mit Kopfhörern): Sekunden je Ton und Lautstärke */
const FOLGE_SEC = 0.6;
const HINT_VOL = 0.4;

/** größter Zwischenraum der Notenlinien (px) im Ausschnitt eines Stufenlieds */
const SNIP_SP = 11;

/** Nach „Richtig“ so lange stehen lassen, dass man die Bestätigung in Ruhe sieht (Tippen geht schneller) */
const AUTO_NEXT_MS = 1800;
/** fortlaufende Nummer jeder angezeigten Karte (für automatische Tests) */
let seq = 0;

function flute(id: string): string {
  return fluteSvg(note(id).fingering, `Griffbild ${nameText(id)}`);
}

/**
 * Griffbilder → Namen: die Folge als Reihe von Griffbildern. Jedes ist wie eine Note der Notenzeile eine
 * Gruppe `.sn[data-i]` mit Strich für die aktuelle (.seqcur) und Zeile für den getippten Namen (.sl).
 */
function gripSeq(ids: string[]): string {
  return `<div class="gseq" role="img" aria-label="${ids.length} Griffbilder">${ids
    .map((id, i) => `<div class="sn" data-i="${i}">${fluteSvg(note(id).fingering, `Griffbild ${i + 1}`)}<i class="seqcur"></i><span class="sl"></span></div>`)
    .join("")}</div>`;
}

/**
 * Tippfehler: letzten Tipp zurücknehmen und neu tippen. inRow: in der Zeile „Weiß nicht“ einer Tonfolge,
 * dort vor dem ersten Tipp unsichtbar (eigene Test-Kennung, das Fehlerfeld hat einen zweiten Knopf).
 */
function typoBtn(inRow = false): string {
  return inRow
    ? `<button class="textbtn typo" data-act="typo" data-testid="typo-row" style="visibility:hidden">Vertippt</button>`
    : `<button class="textbtn" data-act="typo" data-testid="typo">Vertippt</button>`;
}

/** kleines Häkchen am richtigen Antwortknopf */
const TICK = `<span class="okmark" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14"><path d="M3 7.4l2.6 2.6L11 4.4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;

function listenBox(): string {
  return `<div class="listen" aria-live="off"><span class="hl">Ich höre</span><span class="heard">–</span><span class="cents"></span><div class="meter off"><i></i></div></div>`;
}

export const practiceView: View = (root, ctx) => {
  const session = ctx.session;
  if (!session) {
    ctx.go("#/");
    return;
  }
  const s: Session = session;
  const playing = s.track === "spielen";
  const d = ctx.data;
  const lesenNotes = unlockedNotes("lesen", levelOf("lesen", d.stages.lesen));
  const range: Range = staffRange(lesenNotes);
  // Aktive Flöte (Flötenprofil): erwartet wird ihr Stimmton + Wert des Tons; Toleranz und Anzeige relativ
  // zur Lage jedes Tons auf ihrer Flöte; ungemessene Töne liegen beim Stimmton (../audio/flute-profile.ts)
  const myFlute = activeFlute(d);
  const fluteOffsets = myFlute.offsets;
  const judge = new PlayJudge(
    {
      tuning: myFlute.tuning.hz,
      toleranceCents: d.settings.toleranceCents,
      holdMs: d.settings.holdMs,
    },
    (midi) => offsetFor(fluteOffsets, midi),
  );

  let step: Step | null = null;
  let phase: "ask" | "ok" | "err" = "ask";
  let timer: number | null = null;
  let advanceArmed = false;
  let lastHeardAt = 0;
  let unlisten: (() => void) | null = null;
  let onJudge: ((o: JudgeOutput) => void) | null = null;
  /** Tonfolge beim Spielen: bekommt die Frames statt der Karten-Wertung */
  let onFolgeFrame: ((f: Frame) => Heard | null) | null = null;
  let closed = false;

  if (playing) {
    keepAwake(true);
    unlisten = mic.listen((f) => {
      if (onFolgeFrame) {
        showHeard(onFolgeFrame(f), f.t);
        return;
      }
      const o = judge.push(f);
      showHeard(o.heard, f.t);
      onJudge?.(o);
    });
  }

  function clearTimer() {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  }

  function finish() {
    clearTimer();
    ctx.lastResult = s.result();
    ctx.session = null;
    ctx.go("#/ende");
  }

  function advance() {
    if (closed) return;
    clearTimer();
    advanceArmed = false;
    judge.stop();
    onJudge = null;
    onFolgeFrame = null;
    stopSound();
    step = s.next();
    if (!step) return finish();
    phase = "ask";
    if (step.type === "intro") renderIntro(step.note);
    else if (step.type === "folge") renderFolge(step);
    else renderCard(step);
  }

  /** Vorspielen beenden (beim Weitergehen und Verlassen) */
  function stopSound() {
    if (songPlayer.playing) songPlayer.stop();
    else if (songPlayer.context) songPlayer.idle();
  }

  /** Töne vorspielen (Synth, Stimmton der aktiven Flöte) */
  function playTones(midis: number[], volume: number | true) {
    songPlayer.play(toneTimeline(midis), { secPerQuarter: FOLGE_SEC, a4: myFlute.tuning.hz, countIn: false, melody: volume });
  }

  function autoAdvance() {
    clearTimer();
    timer = window.setTimeout(advance, AUTO_NEXT_MS);
    advanceArmed = true;
  }

  /**
   * Nach „Vertippt“ (Session.undoLast schon aufgerufen): Rückmeldung weg, Antwortknöpfe wieder frei,
   * Fokus auf den ersten. clear: Klassen, die von den Knöpfen weg müssen.
   */
  function reopen(main: HTMLElement, clear: string[]) {
    clearTimer();
    advanceArmed = false;
    phase = "ask";
    main.classList.remove("err", "ok");
    main.classList.add("ask");
    main.querySelector(".slot")!.innerHTML = "";
    main.querySelectorAll<HTMLButtonElement>(".btns button").forEach((b) => {
      b.disabled = false;
      b.classList.remove(...clear);
      b.querySelector(".okmark")?.remove();
    });
    main.querySelector<HTMLButtonElement>(".btns button")?.focus({ preventScroll: true });
  }

  /** Knopf „Vertippt“ in scope: Tipp zurücknehmen (undo), es geht nicht weiter – sie tippt neu */
  function bindTypo(scope: Element, pressedHere: (e: Event, el: Element) => boolean, undo: () => void) {
    const b = scope.querySelector<HTMLButtonElement>('[data-act="typo"]');
    b?.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!pressedHere(e, b)) return;
      undo();
    });
  }

  function header(label: string): string {
    const total = s.total;
    const pct = total ? Math.round((s.graded / total) * 100) : 0;
    return (
      `<div class="barrow"><button class="iconbtn x" data-act="close" aria-label="Sitzung beenden">${ICON_X}</button>` +
      `<div class="bar" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${s.graded}"><i style="width:${pct}%"></i></div>` +
      `<span class="count" data-testid="count">${label}</span></div>`
    );
  }

  function bindCommon(main: HTMLElement) {
    main.querySelector('[data-act="close"]')!.addEventListener("click", (e) => {
      e.stopPropagation();
      if (s.graded > 0) finish();
      else {
        ctx.session = null;
        ctx.go("#/");
      }
    });
    // Nach „Richtig“: Tippen irgendwo geht schneller weiter
    main.addEventListener("click", (e) => {
      if (advanceArmed && !(e.target as HTMLElement).closest('[data-act="close"]')) advance();
    });
  }

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

  // ------------------------------------------------------------ Vorstellung
  function renderIntro(id: string) {
    const tip = GRIP_TIPS[note(id).partner ?? id];
    root.innerHTML = `
<main class="screen fit prac intro" data-step="intro" data-note="${id}" data-seq="${++seq}">
  ${header("Neuer Ton")}
  <div class="stage">${staffSvg(id, { range, label: `Note ${nameText(id)}` })}<p class="q">${playing ? "Spiel diesen Ton einmal" : "Ein neuer Ton"}</p></div>
  <div class="answer">
    ${playing ? listenBox() : ""}
    <div class="panel neutral" data-testid="panel"><div class="fl">${flute(id)}</div><div class="txt">
      <span class="newtag">Neu</span><span class="name">${nameHtml(id)}</span>
      <span class="sub">${introSentence(id)}</span>${tip ? `<span class="tip">${tip}</span>` : ""}
    </div></div>
    <button class="go" data-act="intro-ok">${playing ? "Weiter" : "Verstanden"}</button>
  </div>
</main>`;
    const main = root.querySelector("main")!;
    bindCommon(main);
    const pressedHere = pressGuard(main);
    const done = () => {
      s.introDone(id);
      advance();
    };
    const ok = main.querySelector('[data-act="intro-ok"]')!;
    ok.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!pressedHere(e, ok)) return;
      done();
    });
    if (playing) {
      judge.newCard(note(id).midi, performance.now(), { judgeWrong: false });
      onJudge = (o) => {
        if (o.event === "correct") {
          s.introDone(id);
          const p = main.querySelector(".panel")!;
          p.className = "panel ok";
          p.querySelector(".newtag")!.outerHTML = `<span class="head">${ICON_CHECK}Richtig</span>`;
          onJudge = null;
          autoAdvance();
        }
      };
    }
  }

  // ------------------------------------------------------------ Karten
  function renderCard(st: Extract<Step, { type: "card" }>) {
    const { item, retry } = st;
    const id = item.note;
    const kind = item.kind;
    const box = d.cards[cardKey(id, kind)]?.box;
    const label = retry ? "nochmal" : `${s.position} von ${s.total}`;
    let stage: string;
    let btns = "";
    let choices: string[] = [];
    if (kind === "note") {
      stage = `<div class="flbig">${flute(id)}</div>`;
    } else {
      stage = staffSvg(id, { range, label: "Note" });
    }
    if (kind !== "spiel") {
      choices = makeChoices(id, kind, choiceCount(kind, box), lesenNotes, Math.random);
      if (kind === "name") {
        btns = `<div class="btns">${choices
          .map((c) => `<button data-choice="${c}" aria-label="${nameText(c)}">${nameHtml(c)}</button>`)
          .join("")}</div>`;
      } else if (kind === "griff") {
        btns = `<div class="btns fing">${choices.map((c, i) => `<button data-choice="${c}" aria-label="Griff ${i + 1}">${fluteSvg(note(c).fingering, `Griff ${i + 1}`)}</button>`).join("")}</div>`;
      } else {
        const r = staffRange(choices);
        btns = `<div class="btns staffs">${choices
          .map((c, i) => `<button data-choice="${c}" aria-label="Note ${i + 1}">${staffSvg(c, { variant: "narrow", range: r, label: `Note ${i + 1}` })}</button>`)
          .join("")}</div>`;
      }
    }
    // Rückmeldung ohne Verschieben: „Richtig“ ersetzt nur die Zeile „Weiß nicht“ (gleiche Höhe),
    // „Falsch“ legt sich als .slot über die Antworten bzw. beim Spielen über den Platz darüber.
    const idk = `<div class="idkrow" aria-live="polite"><button class="textbtn" data-act="idk">Weiß nicht</button></div>`;
    const answer =
      kind === "spiel"
        ? `<div class="answer"><div class="anchor"><div class="slot" aria-live="polite"></div></div>${listenBox()}${idk}</div>`
        : `<div class="answer">${btns}${idk}<div class="slot" aria-live="polite"></div></div>`;
    root.innerHTML = `
<main class="screen fit prac ask kind-${kind}" data-step="card" data-kind="${kind}" data-note="${id}" data-retry="${retry}" data-seq="${++seq}">
  ${header(label)}
  <div class="stage">${stage}<p class="q">${QUESTION[kind]}</p></div>
  ${answer}
</main>`;
    const main = root.querySelector("main")!;
    bindCommon(main);
    const pressedHere = pressGuard(main);
    const slot = main.querySelector(".slot")!;
    const idkRow = main.querySelector(".idkrow")!;

    const setPhase = (p: "ok" | "err") => {
      phase = p;
      main.classList.remove("ask");
      main.classList.add(p);
    };

    const showOk = (head = "Richtig") => {
      slot.innerHTML = "";
      idkRow.innerHTML = `<span class="okline" data-testid="panel">${ICON_CHECK}<span>${head}</span><span class="name">${nameHtml(id)}</span></span>`;
    };

    const errPanel = (head: string) => {
      // Nur der richtige Name, mittig. Wo die Antwort ein Bild ist (Griff wählen, Note zum Griff wählen),
      // bleibt sie als Bild daneben – das Feld verdeckt ja die Antwortknöpfe.
      const pic =
        kind === "griff"
          ? `<div class="fl">${flute(id)}</div>`
          : kind === "note"
            ? `<div class="fl st">${staffSvg(id, { variant: "narrow", label: `Note ${nameText(id)}` })}</div>`
            : "";
      return (
        `<div class="panel err center${pic ? "" : " solo"}" data-testid="panel">${pic}<div class="txt"><span class="head">${head}</span>` +
        `<span class="name">${nameHtml(id)}</span></div></div>` +
        (s.canUndo ? `<div class="gorow">${typoBtn()}<button class="go" data-act="next">Weiter</button></div>` : `<button class="go" data-act="next">Weiter</button>`)
      );
    };

    const bindNext = () => {
      const go = slot.querySelector<HTMLButtonElement>('[data-act="next"]');
      go?.addEventListener("click", (e) => {
        e.stopPropagation();
        // beim Spielen erscheint das Feld ohne Tippen (falscher Ton gehört): liegender Finger zählt nicht
        if (!pressedHere(e, go)) return;
        advance();
      });
      bindTypo(slot, pressedHere, retype);
      // die Antwortknöpfe sind jetzt verdeckt: Fokus auf „Weiter“, damit er nicht verloren geht
      go?.focus({ preventScroll: true });
    };

    /** „Vertippt“: Antwort zurücknehmen (zählt nicht), Karte wieder offen – sie tippt neu */
    const retype = () => {
      if (!s.canUndo) return;
      s.undoLast();
      reopen(main, ["right", "dim", "chosen"]);
    };

    const markButtons = (chosen: string | null) => {
      main.querySelectorAll<HTMLButtonElement>(".btns button").forEach((b) => {
        b.disabled = true;
        const c = b.dataset.choice;
        if (c === id) {
          b.classList.add("right");
          b.insertAdjacentHTML("beforeend", TICK);
        }
        else b.classList.add("dim");
        if (c === chosen && c !== id) b.classList.add("chosen");
      });
    };

    // Tipp-Übungen
    main.querySelectorAll<HTMLButtonElement>(".btns button").forEach((b) =>
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        if (phase !== "ask" || !pressedHere(e, b)) return;
        const c = b.dataset.choice!;
        const ok = c === id;
        s.answer(ok, true);
        markButtons(c);
        if (ok) {
          setPhase("ok");
          showOk();
          autoAdvance();
        } else {
          setPhase("err");
          slot.innerHTML = errPanel("Nicht ganz");
          bindNext();
        }
      }),
    );

    const idkBtn = main.querySelector('[data-act="idk"]')!;
    idkBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (phase !== "ask" || !pressedHere(e, idkBtn)) return;
      s.answer(false);
      markButtons(null);
      setPhase("err");
      slot.innerHTML = errPanel("Auflösung");
      bindNext();
      if (kind === "spiel") judge.markWrong();
    });

    // Spielen
    if (kind === "spiel") {
      judge.newCard(note(id).midi, performance.now());
      onJudge = (o) => {
        if (o.event === "wrong" && phase === "ask") {
          s.answer(false);
          setPhase("err");
          slot.innerHTML = errPanel(`Du spielst ${midiNameHtml(o.wrongMidi!)}`);
          bindNext();
        } else if (o.event === "correct") {
          onJudge = null;
          if (phase === "ask") {
            s.answer(true);
            setPhase("ok");
            showOk();
          } else {
            // nach einem Fehler: jetzt richtig, zählt aber als Fehler
            main.classList.remove("err");
            main.classList.add("ok");
            showOk("Jetzt stimmt es");
          }
          autoAdvance();
        }
      };
    }
  }


  // ------------------------------------------------------------ Tonfolgen
  function renderFolge(st: Extract<Step, { type: "folge" }>) {
    // Nur für Browser-Tests: feste Folgen vorgeben (window.__folgen = [["g1", "e1", "a1"], …]; mit Übungsart
    // als { kind: "griff", notes: [...] })
    const forced = (window as unknown as { __folgen?: (string[] | { kind: Kind; notes: string[] })[] }).__folgen;
    if (forced?.length && !st.retry) {
      const f = forced.shift()!;
      if (Array.isArray(f)) st.folge.notes = f;
      else Object.assign(st.folge, f);
    }
    const notes = st.folge.notes;
    const n = notes.length;
    // Abschnitt eines Stufenlieds (Spielen): kleiner Ausschnitt des Notenbilds mit echtem Rhythmus
    const snipSong = playing && st.folge.songId && st.folge.bars ? songById(st.folge.songId) : undefined;
    let excerpt = snipSong ? songExcerpt(snipSong, st.folge.bars![0], st.folge.bars![1]) : null;
    const exTl = excerpt ? excerptTimeline(excerpt) : null;
    if (exTl && exTl.tones.length !== n) excerpt = null;
    // Übungsart der Folge (docs/app-uebungen.md): Noten → Namen, Noten → Griffe, Griffbilder → Namen
    const fkind = playing ? "spiel" : st.folge.kind;
    const label = st.retry ? "nochmal" : `${s.position} von ${s.total}`;
    const question = playing
      ? st.folge.drill
        ? "Wechsle ruhig hin und her."
        : st.folge.song
          ? `Aus „${st.folge.song}“ – spiel diese Töne.`
          : "Spiel diese Töne nacheinander."
      : fkind === "griff"
        ? "Welche Griffe sind das? Der Reihe nach."
        : fkind === "note"
          ? "Welche Töne sind das? Der Reihe nach."
          : "Wie heißen diese Noten? Der Reihe nach.";
    // Beim Lesen verrät die Beschriftung für Vorleser die Namen nicht (wie bei der einzelnen Note→Name-Karte)
    const staff = excerpt
      ? `<div class="snip" role="img" aria-label="Noten ${notes.map(nameText).join(" ")}"></div>`
      : fkind === "note"
        ? gripSeq(notes)
        : staffSeqSvg(notes, { range, label: playing ? `Noten ${notes.map(nameText).join(" ")}` : `${n} Noten` });
    let btns = "";
    if (fkind === "griff") {
      const choices = folgeChoices(notes, lesenNotes, Math.random, "griff");
      btns = `<div class="btns fing">${choices
        .map((c, i) => `<button data-choice="${c}" aria-label="Griff ${i + 1}">${fluteSvg(note(c).fingering, `Griff ${i + 1}`)}</button>`)
        .join("")}</div>`;
    } else if (!playing) {
      const choices = folgeChoices(notes, lesenNotes, Math.random);
      btns = `<div class="btns">${choices
        .map((c) => `<button data-choice="${c}" aria-label="${nameText(c)}">${nameHtml(c)}</button>`)
        .join("")}</div>`;
    }
    // Lesen: „Vertippt“ neben „Weiß nicht“, sichtbar sobald eine Note getippt ist (nimmt den letzten Tipp
    // zurück). Vorher nur unsichtbar; „Weiß nicht“ steht mittig wie auf den Karten (.idkrow.three).
    const idk = `<div class="idkrow${playing ? "" : " three"}" aria-live="polite">${playing ? "" : "<span></span>"}<button class="textbtn" data-act="idk">Weiß nicht</button>${playing ? "" : typoBtn(true)}</div>`;
    const answer = playing
      ? `<div class="answer"><div class="anchor"><div class="slot" aria-live="polite"></div></div>${listenBox()}${idk}</div>`
      : `<div class="answer">${btns}${idk}<div class="slot" aria-live="polite"></div></div>`;
    root.innerHTML = `
<main class="screen fit prac ask kind-folge folge-${fkind}" data-step="folge" data-kind="folge" data-fkind="${fkind}"${st.folge.drill ? ' data-drill="true"' : ""}${st.folge.song ? ` data-song="${st.folge.song}"` : ""} data-notes="${notes.join(" ")}" data-note="${notes[0]}" data-i="0" data-retry="${st.retry}" data-seq="${++seq}">
  ${header(label)}
  <div class="stage">${staff}<p class="q" aria-live="polite">${question}</p></div>
  ${answer}
</main>`;
    const main = root.querySelector("main")!;
    bindCommon(main);
    const pressedHere = pressGuard(main);
    const slot = main.querySelector(".slot")!;
    const idkRow = main.querySelector(".idkrow")!;
    const q = main.querySelector(".q")!;
    // Ausschnitt setzen (Breite der Bühne)
    let score: Score | null = null;
    if (excerpt) {
      const box = main.querySelector<HTMLElement>(".snip")!;
      // so groß, dass zwei Takte noch in eine Zeile passen (etwa 40 Zwischenräume), höchstens SNIP_SP
      const width = Math.max(240, Math.min(600, box.clientWidth || main.clientWidth - 32));
      score = renderScore(excerpt, { width, sp: Math.max(7.5, Math.min(SNIP_SP, width / 42)) });
      box.appendChild(score.el);
    }
    /** je Note: richtig? (undefined = noch offen) und was zuerst falsch getippt bzw. gespielt wurde */
    const ok: (boolean | undefined)[] = [];
    const wrongAt: (string | null)[] = [];
    let cur = 0;

    /** Elemente der Note k: in der Notenzeile ihre Gruppe, im Ausschnitt alle Noten des Tons (Haltebogen) */
    const els = (k: number): Element[] =>
      score && exTl
        ? (exTl.tones[k]?.ids ?? []).map((id) => score!.noteEl(id)).filter((x): x is SVGGElement => !!x)
        : [...main.querySelectorAll(`.sn[data-i="${k}"]`)];
    const setCur = (k: number) => {
      main.querySelectorAll(".stage .cur").forEach((x) => x.classList.remove("cur"));
      els(k).forEach((x) => x.classList.add("cur"));
      main.dataset.i = String(k);
      main.dataset.note = notes[k] ?? "";
    };
    /**
     * Note k abhaken (bzw. als falsch markieren). Darunter steht *ihre Antwort* (getippt bzw. gespielt),
     * nicht die Lösung – die steht am Ende im Feld, so lassen sich beide Reihen vergleichen.
     * answer null: nichts darunter (Weiß nicht, Ton außerhalb der Grifftabelle).
     */
    const mark = (k: number, good: boolean, answer: string | null) => {
      for (const el of els(k)) {
        el.classList.remove("hit", "miss");
        el.classList.add(good ? "hit" : "miss");
        // Griffbilder → Namen: HTML-Zeile unter dem Griffbild, sonst Text in der Notenzeile (SVG); im
        // Ausschnitt eines Lieds gibt es keine Zeile dafür
        const sl = el.querySelector(".sl");
        if (sl) sl.innerHTML = answer ? (fkind === "note" ? nameHtml(answer) : nameSvgText(answer)) : "";
      }
    };
    setCur(0);
    const rowTypo = idkRow.querySelector<HTMLButtonElement>('[data-act="typo"]');
    /** Lesen, „Vertippt“: die Tipps ab Note k zurücknehmen (ohne k: den letzten), Note k ist wieder dran */
    const untap = (k = cur - 1) => {
      if (k < 0) return;
      for (let j = k; j < cur; j++) {
        ok[j] = undefined;
        wrongAt[j] = null;
        for (const el of els(j)) {
          el.classList.remove("hit", "miss");
          const sl = el.querySelector(".sl");
          if (sl) sl.innerHTML = "";
        }
      }
      cur = k;
      setCur(cur);
      if (rowTypo) rowTypo.style.visibility = cur === 0 ? "hidden" : "";
    };
    if (rowTypo) bindTypo(idkRow, pressedHere, () => phase === "ask" && untap());

    const setPhase = (p: "ok" | "err") => {
      phase = p;
      main.classList.remove("ask");
      main.classList.add(p);
      main.querySelectorAll(".stage .cur").forEach((x) => x.classList.remove("cur"));
      main.dataset.note = "";
      main.querySelectorAll<HTMLButtonElement>(".btns button").forEach((b) => {
        b.disabled = true;
        b.classList.add("dim");
      });
    };
    const listenBtn = playing ? `<button class="textbtn listenbtn" data-act="listen">Anhören</button>` : "";
    const bindListen = (scope: Element) => {
      scope.querySelector('[data-act="listen"]')?.addEventListener("click", (e) => {
        e.stopPropagation();
        // nach „Richtig“: nicht von selbst weiter, solange sie zuhört (Tippen geht weiter)
        clearTimer();
        // Abschnitt eines Lieds: mit seinem Rhythmus im Grundtempo des Lieds
        if (excerpt && exTl && snipSong)
          songPlayer.play(exTl, { secPerQuarter: secPerQuarter(snipSong, 100), a4: myFlute.tuning.hz, countIn: false, melody: true });
        else playTones(notes.map((x) => note(x).midi), true);
      });
    };

    /** Folge fertig: werten und Rückmeldung */
    /** typed: alle Antworten getippt (nicht „Weiß nicht“, nicht gespielt) – dann gibt es „Vertippt“ */
    const done = (head: string, typed = false) => {
      const res = notes.map((_, k) => ok[k] === true);
      s.answerFolge(res, typed);
      if (res.every(Boolean)) {
        setPhase("ok");
        idkRow.innerHTML = `<span class="okline" data-testid="panel">${ICON_CHECK}<span>Richtig</span>${listenBtn}</span>`;
        bindListen(idkRow);
        autoAdvance();
        return;
      }
      setPhase("err");
      // Die ganze richtige Folge, Fehler rot; ihre Antworten stehen darüber unter den Noten
      const names =
        fkind === "griff"
          ? // Noten → Griffe: die richtigen Griffe klein nebeneinander, darunter die Namen
            `<span class="grips">${notes
              .map(
                (x, j) =>
                  `<span class="g${res[j] ? "" : " bad"}">${fluteSvg(note(x).fingering, `Griffbild ${nameText(x)}`)}<span>${nameHtml(x)}</span></span>`,
              )
              .join("")}</span>`
          : `<span class="names">${notes.map((x, j) => `<span class="${res[j] ? "" : "bad"}">${nameHtml(x)}</span>`).join(" ")}</span>`;
      slot.innerHTML =
        `<div class="panel err center solo" data-testid="panel"><div class="txt"><span class="head">${head}</span>` +
        `${names}</div></div>` +
        `<div class="gorow">${listenBtn}${s.canUndo ? typoBtn() : ""}<button class="go" data-act="next">Weiter</button></div>`;
      bindListen(slot);
      // „Vertippt“ nach dem Ende: Wertung zurücknehmen, Folge wieder offen ab der ersten falschen Note
      // (die Tipps danach sind mit weg; sie tippt von dort weiter)
      bindTypo(slot, pressedHere, () => {
        if (!s.canUndo) return;
        s.undoLast();
        reopen(main, ["dim", "tap-ok", "tap-err"]);
        untap(Math.max(0, ok.findIndex((x) => x === false)));
      });
      const go = slot.querySelector<HTMLButtonElement>('[data-act="next"]')!;
      go.addEventListener("click", (e) => {
        e.stopPropagation();
        // beim Spielen erscheint das Feld ohne Tippen (falscher Ton gehört): liegender Finger zählt nicht
        if (!pressedHere(e, go)) return;
        advance();
      });
      go.focus({ preventScroll: true });
    };

    const idkBtn = main.querySelector('[data-act="idk"]')!;
    idkBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (phase !== "ask" || !pressedHere(e, idkBtn)) return;
      onFolgeFrame = null;
      for (let k = cur; k < n; k++) {
        ok[k] = false;
        // beim Spielen: ein schon falsch gespielter Ton bleibt stehen
        mark(k, false, wrongAt[k] ?? null);
      }
      done("Auflösung");
    });

    if (!playing) {
      // Lesen: der Reihe nach tippen; falsch → die Note wird rot, ihr Name steht darunter, es geht weiter
      main.querySelectorAll<HTMLButtonElement>(".btns button").forEach((b) =>
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          // Tipp vom Kartenwechsel (begann auf der vorigen Ansicht) nicht als Antwort werten
          if (phase !== "ask" || cur >= n || !pressedHere(e, b)) return;
          const c = b.dataset.choice!;
          const good = c === notes[cur];
          ok[cur] = good;
          wrongAt[cur] = good ? null : c;
          mark(cur, good, c);
          b.classList.remove("tap-ok", "tap-err");
          void b.offsetWidth; // Animation neu starten
          b.classList.add(good ? "tap-ok" : "tap-err");
          cur++;
          if (rowTypo) rowTypo.style.visibility = "";
          if (cur < n) setCur(cur);
          else done("Nicht ganz", true);
        }),
      );
      return;
    }

    // Spielen: Warte-Wertung wie beim Mitspielen (neuer Einsatz für Tonwiederholungen, Übergangsklänge
    // beim Fingerwechsel verziehen, Oktave zu hoch nur ein Hinweis); Toleranz und Haltedauer wie bei der
    // Spielen-Karte, Stimmton und Werte der aktiven Flöte.
    const w = new WaitFollower(exTl && excerpt ? exTl : toneTimeline(notes.map((x) => note(x).midi)), {
      cfg: {
        tuning: myFlute.tuning.hz,
        toleranceCents: d.settings.toleranceCents,
        holdMs: d.settings.holdMs,
        minClarity: DEFAULT_JUDGE.minClarity,
      },
      tuning: new LiveTuning(fluteOffsets, {}, myFlute.tuning.known),
      onNote: (k, r) => {
        if (phase !== "ask") return;
        if (ok[k] === undefined) ok[k] = r.ok;
        if (!ok[k] && wrongAt[k] == null && r.wrongMidi !== undefined) wrongAt[k] = chartNoteByMidi(r.wrongMidi)?.id ?? null;
        mark(k, ok[k]!, ok[k] ? notes[k] : (wrongAt[k] ?? null));
        q.textContent = question;
        q.classList.remove("warn", "hint");
        cur = k + 1;
        if (cur < n) setCur(cur);
      },
      onWrong: (k, midi) => {
        if (phase !== "ask") return;
        ok[k] = false;
        // der erste falsche Ton bleibt unter der Note stehen
        if (wrongAt[k] == null) {
          wrongAt[k] = chartNoteByMidi(midi)?.id ?? null;
          mark(k, false, wrongAt[k]);
        }
        q.innerHTML = `Du spielst ${midiNameHtml(midi)}`;
        q.classList.remove("hint");
        q.classList.add("warn");
        if (d.settings.headphones) playTones([note(notes[k]).midi], HINT_VOL);
      },
      onOctave: () => {
        if (phase !== "ask" || ok[cur] === false) return;
        q.textContent = "eine Oktave zu hoch – sanfter blasen";
        q.classList.add("hint");
      },
      onPass: () => {
        if (phase !== "ask") return;
        onFolgeFrame = null;
        done("Nicht ganz");
      },
    });
    w.arm(performance.now());
    onFolgeFrame = (f) => w.push(f);
  }

  advance();

  return () => {
    closed = true;
    clearTimer();
    judge.stop();
    onFolgeFrame = null;
    stopSound();
    unlisten?.();
    if (playing) {
      keepAwake(false);
      mic.stop();
    }
  };
};
