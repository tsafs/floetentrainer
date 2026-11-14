// Startseite: Serie, Stufenleisten, Töne beim Lesen, Knöpfe Üben und Spielen.

import { mic } from "../audio/mic";
import { maxLevel, unlockedNotes, type Track } from "../music/levels";
import { nameHtml } from "../music/names";
import { dueCount } from "../srs/leitner";
import { isWeak, level, levelCap, noteAccuracy, streak, weekDots } from "../srs/progress";
import { hasWork, Session } from "../srs/session";
import { plural, type Ctx, type View } from "./common";

function trackRow(ctx: Ctx, track: Track): string {
  const lv = level(ctx.data, track);
  const max = maxLevel(track);
  const steps = Array.from({ length: max }, (_, i) => `<i${i < lv ? ' class="on"' : ""}></i>`).join("");
  return (
    `<a class="track" href="#/fortschritt" data-track="${track}" aria-label="${track === "lesen" ? "Lesen" : "Spielen"}: Stufe ${lv} von ${max}">` +
    `<span class="t">${track === "lesen" ? "Lesen" : "Spielen"}</span>` +
    `<span class="steps" style="grid-template-columns:repeat(${max},1fr)">${steps}</span>` +
    `<span class="s">Stufe ${lv}</span></a>`
  );
}

function buttonText(ctx: Ctx, track: Track): { label: string; sub: string } {
  const today = ctx.today();
  const due = dueCount(ctx.data, track, today);
  const work = hasWork(ctx.data, track, today);
  const verb = track === "lesen" ? "Üben" : "Spielen";
  if (!work) {
    // Nichts fällig, nichts neu: Weiterüben zählt trotzdem für die Trefferquote und damit für die nächste Stufe.
    const lv = level(ctx.data, track);
    const sub = lv < levelCap(ctx.data, track) ? `Fälliges erledigt · zählt für Stufe ${lv + 1}` : "Fälliges erledigt · freies Üben";
    return { label: `Weiter ${verb.toLowerCase()}`, sub };
  }
  const mins = ctx.data.settings.sessionMinutes;
  if (due > 0) return { label: verb, sub: `${plural(due, "Karte", "Karten")} fällig · etwa ${mins} Minuten` };
  return { label: verb, sub: track === "lesen" ? "Neue Töne warten" : "Neue Töne · mit Flöte und Mikrofon" };
}

export function startSession(ctx: Ctx, track: Track): void {
  const s = ctx.data.settings;
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
  const notes = unlockedNotes("lesen", level(d, "lesen"));
  const chips = notes
    .map((n) => {
      const acc = noteAccuracy(d, "lesen", n);
      const w = acc.n ? Math.round(acc.ratio * 100) : 0;
      return `<span class="chip${isWeak(acc) ? " weak" : ""}" title="${acc.n ? `${acc.correct} von ${acc.n} richtig` : "noch keine Antworten"}">${nameHtml(n)}<i><b style="width:${w}%"></b></i></span>`;
    })
    .join("");
  const lese = buttonText(ctx, "lesen");
  const spiel = buttonText(ctx, "spielen");
  root.innerHTML = `
<main class="screen fit home">
  <h1>Flötentrainer</h1>
  ${ctx.saveFailed ? `<p class="banner">Speichern ist gerade nicht möglich. Bitte in den Einstellungen eine Sicherung herunterladen.</p>` : ""}
  <section class="today">
    <div class="stat"><span class="num" data-testid="streak">${st}</span><span class="lbl">${st === 1 ? "Tag in Folge" : "Tage in Folge"}</span></div>
    <div class="week" aria-label="Übungstage dieser Woche">${dots}</div>
  </section>
  <nav class="tracks" aria-label="Fortschritt">${trackRow(ctx, "lesen")}${trackRow(ctx, "spielen")}</nav>
  <section class="notes"><h2>Deine Töne beim Lesen</h2><div class="chips">${chips}</div></section>
  <div class="spacer"></div>
  <section class="actions">
    <button class="main" data-act="ueben">${lese.label}<small>${lese.sub}</small></button>
    <button class="alt" data-act="spielen">${spiel.label}<small>${spiel.sub}</small></button>
  </section>
  <nav class="links"><a href="#/lieder">Lieder</a><a href="#/stimmgeraet" data-act="tuner">Stimmgerät</a><a href="#/griffe">Grifftabelle</a><a href="#/einstellungen">Einstellungen</a></nav>
</main>`;
  const main = root.querySelector("main")!;
  main.querySelector('[data-act="ueben"]')!.addEventListener("click", () => startSession(ctx, "lesen"));
  main.querySelector('[data-act="spielen"]')!.addEventListener("click", () => startPlaying(ctx));
  main.querySelector('[data-act="tuner"]')!.addEventListener("click", () => {
    // Mikrofon aus dem Tippen heraus starten; das Stimmgerät zeigt Fehler selbst an
    mic.start().catch(() => {});
  });

  // Passt alles ohne Scrollen? Sonst die Tonübersicht verdichten oder ausblenden.
  // Die untere Zeile wird zweizeilig, wenn ihre vier Einträge nicht nebeneinander passen.
  const links = main.querySelector(".links") as HTMLElement;
  const fit = () => {
    main.classList.remove("dense", "denser");
    links.classList.remove("two");
    if (links.scrollWidth > links.clientWidth + 1) links.classList.add("two");
    const over = () => main.scrollHeight > main.clientHeight + 1;
    if (over()) main.classList.add("dense");
    if (over()) main.classList.add("denser");
  };
  fit();
  document.fonts?.ready.then(fit);
  window.addEventListener("resize", fit);
  return () => window.removeEventListener("resize", fit);
};
