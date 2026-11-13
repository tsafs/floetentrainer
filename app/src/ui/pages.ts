// Sitzungsende, Fortschritt, Grifftabelle und Mikrofon-Hilfe.

import { mic } from "../audio/mic";
import { fluteSvg } from "../music/flute";
import { maxLevel, stagesOf, TRACK_LABEL, unlockedNotes, type Track } from "../music/levels";
import { joinNames, nameHtml, nameText } from "../music/names";
import { CHART, NOTES } from "../music/notes";
import { staffRange, staffSvg } from "../music/staff";
import { isWeak, level, noteAccuracy } from "../srs/progress";
import { topbar, type View } from "./common";

export const summaryView: View = (root, ctx) => {
  const r = ctx.lastResult;
  if (!r) {
    ctx.go("#/");
    return;
  }
  const allRight = r.graded > 0 && r.correct === r.graded;
  const unlocks = r.unlocks
    .map(
      (u) =>
        `<div class="new" data-testid="unlock"><span class="soft">${TRACK_LABEL[u.track]} · Stufe ${u.level}</span><span class="v">Neu: ${joinNames(u.notes)}</span><span class="soft">Die neuen Töne kommen ab der nächsten Sitzung.</span></div>`,
    )
    .join("");
  root.innerHTML = `
<main class="screen summary">
  <h1>${allRight ? "Wunderbar" : "Geschafft"}</h1>
  <section class="block"><span class="num" data-testid="score">${r.correct} von ${r.graded}</span><span class="lbl">richtig</span></section>
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
  root.querySelector('[data-act="home"]')!.addEventListener("click", () => {
    ctx.lastResult = null;
    ctx.go("#/");
  });
};

export const progressView: View = (root, ctx) => {
  const sec = (track: Track) => {
    const lv = level(ctx.data, track);
    const max = maxLevel(track);
    const rows = unlockedNotes(track, lv)
      .map((n) => {
        const a = noteAccuracy(ctx.data, track, n);
        return (
          `<div class="prow${isWeak(a) ? " weak" : ""}"><span class="nm">${nameHtml(n)}</span>` +
          `<span class="pb"><b style="width:${a.n ? Math.round(a.ratio * 100) : 0}%"></b></span>` +
          `<span class="cnt">${a.n ? `${a.correct} von ${a.n}` : "noch keine"}</span></div>`
        );
      })
      .join("");
    const next = stagesOf(track)[lv];
    return `<section aria-label="${TRACK_LABEL[track]}">
      <div class="stagebar"><h2>${TRACK_LABEL[track]}</h2><span class="soft">Stufe ${lv} von ${max}</span></div>
      <div class="rows">${rows}</div>
      <p class="help">${
        next
          ? `Als Nächstes: ${joinNames(next.notes)}. Dafür braucht jeder Ton mindestens 10 Antworten, davon 90 % richtig, an mindestens zwei Tagen.`
          : "Alle Stufen sind freigeschaltet."
      }${track === "spielen" && next ? " Spielen kann Lesen nicht überholen." : ""}</p>
    </section>`;
  };
  root.innerHTML = `<main class="screen page">${topbar("Fortschritt")}<p class="help">Trefferquote der letzten 20 Antworten je Ton.</p>${sec("lesen")}${sec("spielen")}</main>`;
};

export const chartView: View = (root, ctx) => {
  const lv = level(ctx.data, "lesen");
  const open = new Set(unlockedNotes("lesen", lv));
  const range = staffRange(CHART.map((n) => n.id));
  const alts: Record<string, string> = {};
  for (const n of Object.values(NOTES)) if (n.partner) alts[n.partner] = n.id;
  const cells = CHART.map((n) => {
    const alt = alts[n.id];
    return (
      `<div class="cell${open.has(n.id) ? "" : " locked"}" data-note="${n.id}">` +
      staffSvg(n.id, { variant: "narrow", range, label: `Note ${nameText(n.id)}` }) +
      fluteSvg(n.fingering, `Griffbild ${nameText(n.id)}`) +
      `<span class="cn">${nameHtml(n.id)}${alt ? `<small>auch ${nameHtml(alt)}</small>` : ""}</span></div>`
    );
  }).join("");
  root.innerHTML = `<main class="screen page">${topbar("Grifftabelle")}<p class="help">Barocke Griffweise, Sopranflöte in C. Blasse Töne kommen in späteren Stufen.</p><div class="chart">${cells}</div></main>`;
};

export const micHelpView: View = (root, ctx) => {
  const denied = ctx.micError === "denied";
  root.innerHTML = `<main class="screen page">${topbar("Mikrofon")}
  <section>
    <h2>${denied ? "Das Mikrofon ist nicht erlaubt" : "Das Mikrofon lässt sich nicht starten"}</h2>
    <p class="help">Zum Spielen hört die App über das Mikrofon zu. Die Töne werden nur im Gerät ausgewertet, nichts wird aufgenommen oder verschickt.</p>
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
