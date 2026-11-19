// Startseite: Titel mit Menüknopf, Serie, Tonleiter (alle Töne nach Höhe, wischbar) mit Karte zum gewählten
// Ton, Knöpfe Üben und Spielen. Die Karte führt zur Tonseite (#/ton/<Ton>); quer, ohne Karte, führt das Tippen
// auf einen Ton direkt dorthin.

import { mic } from "../audio/mic";
import { fluteSvg } from "../music/flute";
import { maxLevel, stageIndexOfNote, stagesOf, unlockedNotes, type Track } from "../music/levels";
import { nameHtml, nameText } from "../music/names";
import { ALL_NOTES, note } from "../music/notes";
import { GRIP_TIPS } from "../srs/hints";
import { dueCount } from "../srs/leitner";
import { level, notePoints, POINTS_MAX, POINTS_UNLOCK, streak, weekDots } from "../srs/progress";
import { hasWork, Session } from "../srs/session";
import { BandSession } from "../srs/band";
import { menuSlot, plural, type Ctx, type View } from "./common";
import { ladderHtml, ladderName, wireLadder, type LadderColumn, type LadderGeom } from "./ladder";
import { hasNote, noteState, playWaitsForReading, pointsRow, waitingText } from "./note-info";

const GEOM: LadderGeom = { space: 10, base: 102, col: 40, padLeft: 72, height: 166, clefTop: 30, clefHeight: 136 };

/** Zuletzt gewählter Ton, damit die Leiter nach der Tonseite dort steht, wo sie war */
let lastPick: string | null = null;

function bar(x: number, by: number, p: number, cls: string): string {
  const w = 24;
  return (
    `<rect class="bt" x="${x - w / 2}" y="${by}" width="${w}" height="3" rx="1.5"/>` +
    (p > 0 ? `<rect class="${cls}" x="${x - w / 2}" y="${by}" width="${(w * p) / POINTS_MAX}" height="3" rx="1.5"/>` : "") +
    `<rect class="bk" x="${x - w / 2 + (w * POINTS_UNLOCK) / POINTS_MAX - 0.5}" y="${by - 1.5}" width="1" height="6"/>`
  );
}

function columns(ctx: Ctx): LadderColumn[] {
  const d = ctx.data;
  const b = GEOM.base;
  return ALL_NOTES.map((n) => {
    const state = noteState(d, n.id);
    const learned = state === "learned" || state === "weak";
    const below = (x: number) =>
      ladderName(n.id, x, b + 32, 16) +
      (learned
        ? bar(x, b + 42, notePoints(d, "lesen", n.id), "bl") +
          (hasNote(d, "spielen", n.id) ? bar(x, b + 51, notePoints(d, "spielen", n.id), "bp") : "")
        : `<text class="st" x="${x}" y="${b + 52}" text-anchor="middle" font-size="10">${state === "next" ? "neu" : "St. " + stageIndexOfNote(n.id)}</text>`);
    const label = learned ? `Lesen ${notePoints(d, "lesen", n.id)} von ${POINTS_MAX}` : state === "next" ? "nächste Stufe" : `Stufe ${stageIndexOfNote(n.id)}`;
    return { id: n.id, state, below, label };
  });
}

function cardHtml(ctx: Ctx, id: string): string {
  const d = ctx.data;
  const n = note(id);
  const st = noteState(d, id);
  const fing = n.partner ? note(n.partner).fingering : n.fingering;
  const grip = `<span class="grip${st === "next" || st === "wait" ? " later" : ""}">${fluteSvg(fing, `Griffbild ${nameText(id)}`)}</span>`;
  const chev = `<span class="chev" aria-hidden="true">›</span>`;
  if (st === "next" || st === "wait") {
    return (
      `${grip}<span class="top"><strong>${nameHtml(id)}</strong><span class="soft">${st === "next" ? "nächste Stufe" : "kommt noch"}</span></span>${chev}` +
      `<span class="msg">${waitingText(d, id)}</span>`
    );
  }
  const tip = GRIP_TIPS[n.partner ?? id];
  return (
    `${grip}<span class="top"><strong>${nameHtml(id)}</strong><span class="soft">seit Stufe ${stageIndexOfNote(id)}</span></span>${chev}` +
    `<span class="pts">${pointsRow(d, "lesen", id)}${pointsRow(d, "spielen", id)}</span>` +
    (tip ? `<span class="tip">${tip}</span>` : "")
  );
}

/** Ton, der beim Öffnen gewählt ist: der zuletzt gewählte, sonst der erste der nächsten Stufe, sonst der neueste */
function initialPick(ctx: Ctx): string {
  if (lastPick && ALL_NOTES.some((n) => n.id === lastPick)) return lastPick;
  const lv = level(ctx.data, "lesen");
  const next = stagesOf("lesen")[lv];
  if (next) return next.notes[0];
  const all = unlockedNotes("lesen", lv);
  return all[all.length - 1];
}

function buttonText(ctx: Ctx, track: Track): { label: string; sub: string } {
  const today = ctx.today();
  const due = dueCount(ctx.data, track, today);
  const work = hasWork(ctx.data, track, today);
  const verb = track === "lesen" ? "Üben" : "Spielen";
  if (!work) {
    // Nichts fällig, nichts neu: Weiterüben zählt trotzdem für Trefferquote und Sicherheit und damit für die nächste Stufe.
    const lv = level(ctx.data, track);
    // Auch Spielen an der Lesen-Grenze zählt: Steigt Lesen, schaltet Spielen sofort mit frei.
    // Steht Spielen an der Lesen-Grenze, geht es dort erst weiter, wenn Lesen steigt – das sagt der Knopf.
    const sub =
      lv >= maxLevel(track)
        ? "Fälliges erledigt · alle Stufen erreicht"
        : track === "spielen" && playWaitsForReading(ctx.data)
          ? `Fälliges erledigt · für Stufe ${lv + 1} erst beim Lesen weiterkommen`
          : `Fälliges erledigt · zählt für Stufe ${lv + 1}`;
    return { label: `Weiter ${verb.toLowerCase()}`, sub };
  }
  const mins = track === "lesen" ? ctx.data.settings.sessionMinutes : ctx.data.settings.bandMinutes;
  if (due > 0) return { label: verb, sub: `${plural(due, "Karte", "Karten")} fällig · etwa ${mins} Minuten` };
  return { label: verb, sub: track === "lesen" ? "Neue Töne warten" : "Neue Töne · mit Flöte und Mikrofon" };
}

export function startSession(ctx: Ctx, track: Track): void {
  const s = ctx.data.settings;
  if (track === "spielen") {
    // Spielen ist das Notenband (docs/app-notenband.md)
    ctx.band = new BandSession(ctx.data, {
      today: ctx.today(),
      rng: Math.random,
      now: () => Date.now(),
      limitMs: s.bandMinutes * 60_000,
      limitNotes: s.bandNotes,
    });
    ctx.band.onChange = () => ctx.save();
    ctx.save();
    ctx.go("#/notenband");
    return;
  }
  ctx.session = new Session(ctx.data, {
    track,
    today: ctx.today(),
    rng: Math.random,
    now: () => Date.now(),
    limitCards: s.sessionCards,
    limitMs: s.sessionMinutes * 60_000,
  });
  ctx.session.onChange = () => ctx.save();
  ctx.save();
  ctx.go("#/uebung");
}

/** Spielen: Mikrofon direkt aus dem Tippen heraus starten, dann die Sitzung. */
export function startPlaying(ctx: Ctx): void {
  const go = () => startSession(ctx, "spielen");
  mic
    .start()
    .then(go)
    .catch((e) => {
      ctx.micError = String(e);
      ctx.micRetry = () => mic.start().then(go);
      ctx.go("#/mikrofon");
    });
}

export const homeView: View = (root, ctx) => {
  const d = ctx.data;
  const today = ctx.today();
  const st = streak(d.days, today);
  const dots = weekDots(d.days, today)
    .map((w) => `<span class="${[w.on ? "on" : "", w.today ? "now" : ""].join(" ").trim()}">${w.label}</span>`)
    .join("");
  const lv = level(d, "lesen");
  const count = unlockedNotes("lesen", lv).length;
  const cols = columns(ctx);
  const learnedIdx = cols.map((c, i) => (c.state === "learned" || c.state === "weak" ? i : -1)).filter((i) => i >= 0);
  const head = `<div class="ladhead"><b data-testid="level">Stufe ${lv}</b><span class="soft">${count} von ${ALL_NOTES.length} Tönen</span></div>`;
  const ladder = ladderHtml(GEOM, cols, {
    testid: "ladder",
    label: "Deine Töne, nach Tonhöhe",
    band: learnedIdx.length ? [learnedIdx[0], learnedIdx[learnedIdx.length - 1]] : undefined,
    head,
  });
  const lese = buttonText(ctx, "lesen");
  const spiel = buttonText(ctx, "spielen");
  root.innerHTML = `
<main class="screen fit home">
  <header class="homehead"><h1>Flötentrainer</h1>${menuSlot()}</header>
  ${ctx.saveFailed ? `<p class="banner">Speichern ist gerade nicht möglich. Bitte in den Einstellungen eine Sicherung herunterladen.</p>` : ""}
  <section class="today">
    <div class="stat"><span class="num" data-testid="streak">${st}</span><span class="lbl">${st === 1 ? "Tag in Folge" : "Tage in Folge"}</span></div>
    <div class="week" aria-label="Übungstage dieser Woche">${dots}</div>
  </section>
  <section class="scale" aria-label="Fortschritt">${ladder}<a class="notecard" data-testid="notecard"></a></section>
  <div class="spacer"></div>
  <section class="actions">
    <button class="main" data-act="ueben">${lese.label}<small>${lese.sub}</small></button>
    <button class="alt" data-act="spielen">${spiel.label}<small>${spiel.sub}</small></button>
    <a class="textbtn hearlink" href="#/hoeren" data-testid="to-echo">Hören: vorgespielte Töne erkennen</a>
  </section>
</main>`;
  const main = root.querySelector("main")!;
  main.querySelector('[data-act="ueben"]')!.addEventListener("click", () => startSession(ctx, "lesen"));
  main.querySelector('[data-act="spielen"]')!.addEventListener("click", () => startPlaying(ctx));

  const card = main.querySelector<HTMLAnchorElement>(".notecard")!;
  const show = (id: string) => {
    lastPick = id;
    card.href = `#/ton/${id}`;
    card.setAttribute("aria-label", `Mehr zu ${nameText(id)}`);
    card.innerHTML = cardHtml(ctx, id);
  };
  const lad = wireLadder(main.querySelector<HTMLElement>(".ladder")!, GEOM, (id, again, how) => {
    show(id);
    // Zweites Tippen oder keine Karte zu sehen (quer, sehr klein): gleich zur Tonseite – nie per Pfeiltaste
    if (how === "activate" && (again || card.offsetParent === null)) ctx.go(`#/ton/${id}`);
  });
  const first = initialPick(ctx);
  show(first);
  lad.select(first, "center");

  // Passt alles ohne Scrollen? Sonst erst den Griff-Tipp, dann die Karte weglassen.
  const fit = () => {
    main.classList.remove("dense", "denser");
    const over = () => main.scrollHeight > main.clientHeight + 1;
    if (over()) main.classList.add("dense");
    if (over()) main.classList.add("denser");
  };
  fit();
  document.fonts?.ready.then(fit);
  window.addEventListener("resize", fit);
  return () => {
    window.removeEventListener("resize", fit);
    lad.destroy();
  };
};
