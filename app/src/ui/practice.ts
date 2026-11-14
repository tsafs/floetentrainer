// Übungsseite: Vorstellung, Note→Name, Note→Griff, Griff→Note und Spielen.

import { offsetFor } from "../audio/flute-profile";
import { PlayJudge, type Heard, type JudgeOutput } from "../audio/judge";
import { keepAwake, mic } from "../audio/mic";
import { levelOf, unlockedNotes, type Kind } from "../music/levels";
import { fluteSvg } from "../music/flute";
import { midiNameHtml, nameHtml, nameText } from "../music/names";
import { chartNoteByMidi, note } from "../music/notes";
import { staffRange, staffSvg, type Range } from "../music/staff";
import { choiceCount, makeChoices } from "../srs/choices";
import { errorHint, GRIP_TIPS, introSentence } from "../srs/hints";
import type { Session, Step } from "../srs/session";
import { activeFlute, cardKey } from "../store/data";
import { ICON_CHECK, ICON_X, type View } from "./common";

const QUESTION: Record<Kind, string> = {
  name: "Wie heißt diese Note?",
  griff: "Welcher Griff gehört dazu?",
  note: "Welche Note hat diesen Griff?",
  spiel: "Spiel diese Note",
};

/** Nach „Richtig“ so lange stehen lassen, dass man die Bestätigung in Ruhe sieht (Tippen geht schneller) */
const AUTO_NEXT_MS = 1800;
/** fortlaufende Nummer jeder angezeigten Karte (für automatische Tests) */
let seq = 0;

function flute(id: string): string {
  return fluteSvg(note(id).fingering, `Griffbild ${nameText(id)}`);
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
  let closed = false;

  if (playing) {
    keepAwake(true);
    unlisten = mic.listen((f) => {
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
    step = s.next();
    if (!step) return finish();
    phase = "ask";
    if (step.type === "intro") renderIntro(step.note);
    else renderCard(step);
  }

  function autoAdvance() {
    clearTimer();
    timer = window.setTimeout(advance, AUTO_NEXT_MS);
    advanceArmed = true;
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
    const done = () => {
      s.introDone(id);
      advance();
    };
    main.querySelector('[data-act="intro-ok"]')!.addEventListener("click", (e) => {
      e.stopPropagation();
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
        btns = `<div class="btns${choices.length > 4 ? " n8" : ""}">${choices
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

    const errPanel = (head: string, hint: string) => {
      // Bei Griff→Note steht der Griff schon oben: im Feld die Note zeigen
      const pic = kind === "note" ? staffSvg(id, { variant: "narrow", label: `Note ${nameText(id)}` }) : flute(id);
      return (
        `<div class="panel err" data-testid="panel"><div class="fl${kind === "note" ? " st" : ""}">${pic}</div><div class="txt"><span class="head">${head}</span>` +
        `<span class="name">${nameHtml(id)}</span><span class="sub">${hint}</span></div></div>` +
        `<button class="go" data-act="next">Weiter</button>`
      );
    };

    const bindNext = () => {
      const go = slot.querySelector<HTMLButtonElement>('[data-act="next"]');
      go?.addEventListener("click", (e) => {
        e.stopPropagation();
        advance();
      });
      // die Antwortknöpfe sind jetzt verdeckt: Fokus auf „Weiter“, damit er nicht verloren geht
      go?.focus({ preventScroll: true });
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
        if (phase !== "ask") return;
        const c = b.dataset.choice!;
        const ok = c === id;
        s.answer(ok);
        markButtons(c);
        if (ok) {
          setPhase("ok");
          showOk();
          autoAdvance();
        } else {
          setPhase("err");
          slot.innerHTML = errPanel("Nicht ganz", errorHint(id, c, kind));
          bindNext();
        }
      }),
    );

    main.querySelector('[data-act="idk"]')!.addEventListener("click", (e) => {
      e.stopPropagation();
      if (phase !== "ask") return;
      s.answer(false);
      markButtons(null);
      setPhase("err");
      slot.innerHTML = errPanel("Auflösung", errorHint(id, null, kind));
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
          const heardId = chartNoteByMidi(o.wrongMidi!)?.id;
          const head = `Du spielst ${midiNameHtml(o.wrongMidi!)}`;
          const hint = heardId ? errorHint(id, heardId, "spiel") : "";
          slot.innerHTML = errPanel(head, hint);
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

  advance();

  return () => {
    closed = true;
    clearTimer();
    judge.stop();
    unlisten?.();
    if (playing) {
      keepAwake(false);
      mic.stop();
    }
  };
};
