// Sitzungsende, Grifftabelle und Mikrofon-Hilfe.

import { mic } from "../audio/mic";
import { fluteSvg } from "../music/flute";
import { TRACK_LABEL, unlockedNotes } from "../music/levels";
import { joinNames, nameText } from "../music/names";
import { CHART, NOTES, note } from "../music/notes";
import { level } from "../srs/progress";
import { stageSong } from "../srs/chapters";
import { esc, pressGuard, topbar, type View } from "./common";
import { ladderHtml, ladderName, wireLadder, type LadderColumn, type LadderGeom, type LadderHandle } from "./ladder";

export const summaryView: View = (root, ctx) => {
  const r = ctx.lastResult;
  if (!r) {
    ctx.go("#/");
    return;
  }
  const allRight = r.graded > 0 && r.correct === r.graded;
  const unlocks = r.unlocks
    .map((u) => {
      // Überschrift nennt die erreichte Stufe als solche: „Stufe 4“ allein las sich wie „Stufe 4 geschafft“,
      // „Neu: fis¹“ dann wie ein Ton erst der Stufe danach (docs/app-entscheidungen.md, Abschnitt 3).
      // Spielen: Das Stufenlied der eben geschafften Stufe kann sie jetzt ganz spielen (docs/app-uebungen.md)
      const song = u.track === "spielen" ? stageSong("spielen", u.level - 1) : undefined;
      const songLine = song
        ? `<span data-testid="unlock-song">Jetzt kannst du <a href="#/lied/${encodeURIComponent(song.id)}">${esc(song.title)}</a> ganz spielen.</span>`
        : "";
      return `<div class="new" data-testid="unlock"><span class="soft">${TRACK_LABEL[u.track]} · Stufe ${u.level} erreicht</span><span class="v">Neu: ${joinNames(u.notes)}</span>${songLine}<span class="soft">Die neuen Töne kommen ab der nächsten Sitzung.</span></div>`;
    })
    .join("");
  root.innerHTML = `
<main class="screen summary">
  <h1>${allRight ? "Wunderbar" : "Geschafft"}</h1>
  <section class="block"><span class="num" data-testid="score">${r.correct} von ${r.graded}</span><span class="lbl">${
    "unit" in r ? "Tönen gleich richtig" : "richtig"
  }</span></section>
  <section class="block">${
    r.difficult.length
      ? `<span class="lbl">Schwierig waren</span><span class="v" data-testid="difficult">${joinNames(r.difficult)}</span>`
      : r.graded
        ? `<span class="v">Alles ohne Fehler.</span>`
        : ""
  }</section>
  ${unlocks}
  <div class="spacer"></div>
  <button class="big" data-act="home">Zur Startseite</button>
</main>`;
  // Ein Tipp, der noch auf der letzten Karte begann, soll die Ergebnisse nicht gleich wegklicken
  const pressedHere = pressGuard(root.querySelector("main")!);
  const home = root.querySelector('[data-act="home"]')!;
  home.addEventListener("click", (e) => {
    if (!pressedHere(e, home)) return;
    ctx.lastResult = null;
    ctx.go("#/");
  });
};

/** Grifftabelle: Scrollstand und zuletzt geöffneter Ton, damit die Tabelle nach der Tonseite dort steht, wo sie war */
let chartScroll: number | null = null;
let chartPick: string | null = null;

/**
 * Grifftabelle: eine Notenzeile von c¹ bis c³ (die 25 Töne der Tabelle), darunter die Griffbilder, die eins zu
 * eins mitlaufen; andere Schreibweisen klein unter dem Namen. Hochkant wischbar, quer passen alle auf einmal.
 * Tippen öffnet die Tonseite.
 */
export const chartView: View = (root, ctx) => {
  const lv = level(ctx.data, "lesen");
  const open = new Set(unlockedNotes("lesen", lv));
  const alts: Record<string, string> = {};
  for (const n of Object.values(NOTES)) if (n.partner) alts[n.partner] = n.id;
  let lad: LadderHandle | null = null;
  let strip: HTMLElement | null = null;

  /** Maße hochkant bzw. quer (niedriger Bildschirm: Spaltenbreite so, dass alle 25 Töne nebeneinander passen) */
  const geom = (): ChartGeom => {
    const land = window.innerWidth > window.innerHeight && window.innerHeight <= 520;
    if (!land) return { land, space: 10, base: 82, col: 46, padLeft: 72, height: 82 + 50 + 200 + 10, clefTop: 10, clefHeight: 100, flH: 200, nameSize: 16, altSize: 10.5 };
    // Die Leiste reicht quer über die ganze Breite (der Seitenrand wird mit negativem Rand aufgehoben)
    const col = Math.max(26, Math.floor((Math.min(window.innerWidth, 980) - 72 - 8) / CHART.length));
    const flH = Math.max(80, Math.min(150, window.innerHeight - 205));
    return { land, space: 8, base: 66, col, padLeft: 72, padRight: 8, height: 66 + 42 + flH + 6, clefTop: 6, clefHeight: 80, flH, nameSize: 13.5, altSize: 9 };
  };
  const key = (g: ChartGeom) => `${g.land}|${g.col}|${g.flH}`;
  let drawn = "";

  const draw = (cg: ChartGeom) => {
    if (strip) chartScroll = strip.scrollLeft;
    const hadFocus = !!document.activeElement?.closest?.(".lc");
    lad?.destroy();
    drawn = key(cg);
    const land = cg.land;
    const below = (id: string) => (x: number) => {
      const alt = alts[id];
      const ny = cg.base + (land ? 24 : 30);
      const fy = cg.base + (land ? 40 : 50);
      const w = (cg.flH * 26.5) / 136;
      return (
        ladderName(id, x, ny, cg.nameSize) +
        (alt ? ladderName(alt, x, ny + cg.altSize + 3, cg.altSize, "alt", "auch ") : "") +
        fluteSvg(note(id).fingering, `Griffbild ${nameText(id)}`, `x="${x - (17.5 * cg.flH) / 136}" y="${fy}" width="${w}" height="${cg.flH}" style="width:${w}px;height:${cg.flH}px"`)
      );
    };
    const cols: LadderColumn[] = CHART.map((n) => ({
      id: n.id,
      state: open.has(n.id) ? "learned" : "wait",
      below: below(n.id),
      label: alts[n.id] ? `auch ${nameText(alts[n.id])}` : undefined,
    }));
    root.innerHTML = `<main class="screen page chartpage${land ? " land" : ""}">${topbar("Grifftabelle")}<p class="help">Barocke Griffweise, Sopranflöte in C. Blasse Töne kommen in späteren Stufen. Tippe auf einen Ton für Hinweise zum Griff.</p><div class="spacer"></div>${ladderHtml(cg, cols, { testid: "chart", label: "Grifftabelle, nach Tonhöhe" })}<div class="spacer"></div></main>`;
    strip = root.querySelector<HTMLElement>(".ladstrip");
    lad = wireLadder(root.querySelector<HTMLElement>(".ladder")!, cg, (id, _again, how) => {
      chartPick = id;
      if (how === "move") return; // Pfeiltasten wählen nur
      chartScroll = strip!.scrollLeft;
      ctx.go(`#/ton/${id}?von=griffe`);
    });
    if (chartPick) lad.select(chartPick, false);
    if (chartScroll !== null) strip!.scrollLeft = chartScroll;
    if (hadFocus) root.querySelector<SVGGElement>('.lc[tabindex="0"]')?.focus({ preventScroll: true });
  };
  draw(geom());
  let t = 0;
  // Neu zeichnen nur, wenn sich die Maße wirklich ändern (nicht bei jeder Adressleiste, die ein- und ausfährt)
  const onResize = () => {
    window.clearTimeout(t);
    t = window.setTimeout(() => {
      const g = geom();
      if (key(g) !== drawn) draw(g);
    }, 120);
  };
  window.addEventListener("resize", onResize);
  return () => {
    if (strip) chartScroll = strip.scrollLeft;
    window.removeEventListener("resize", onResize);
    window.clearTimeout(t);
    lad?.destroy();
  };
};

interface ChartGeom extends LadderGeom {
  land: boolean;
  flH: number;
  nameSize: number;
  altSize: number;
}

export const micHelpView: View = (root, ctx) => {
  const denied = ctx.micError === "denied";
  root.innerHTML = `<main class="screen page">${topbar("Mikrofon")}
  <section>
    <h2>${denied ? "Das Mikrofon ist nicht erlaubt" : "Das Mikrofon lässt sich nicht starten"}</h2>
    <p class="help">Zum Spielen hört die App über das Mikrofon zu. Die Töne werden nur im Gerät ausgewertet, nichts wird aufgenommen oder verschickt – außer auf dem Testboard (Einstellungen): Dort steckt der Ton in der Diagnose, die du selbst speicherst.</p>
  </section>
  <section>
    <h2>So erlaubst du es in Chrome auf Android</h2>
    <ol class="steps-list">
      <li>Oben links neben der Adresse auf das Symbol tippen (Schloss oder Regler).</li>
      <li>„Berechtigungen“ oder „Website-Einstellungen“ wählen.</li>
      <li>Bei „Mikrofon“ auf „Zulassen“ stellen.</li>
      <li>Hier auf „Nochmal versuchen“ tippen.</li>
    </ol>
    <p class="help">Als App auf dem Startbildschirm: Android-Einstellungen → Apps → Chrome → Berechtigungen → Mikrofon → „Nur während der Nutzung zulassen“.</p>
    ${denied ? "" : `<p class="help">Falls ein anderes Programm das Mikrofon gerade benutzt, dieses bitte schließen.</p>`}
  </section>
  <div class="btnrow"><button class="big" data-act="retry">Nochmal versuchen</button><a class="big alt" href="#/" style="text-align:center;text-decoration:none;display:grid;place-items:center">Zur Startseite</a></div>
</main>`;
  root.querySelector('[data-act="retry"]')!.addEventListener("click", () => {
    const retry = ctx.micRetry ?? (() => mic.start());
    retry().catch((e: unknown) => {
      ctx.micError = String(e);
      micHelpView(root, ctx);
    });
  });
};
