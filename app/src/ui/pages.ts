// Sitzungsende, Fortschritt, Grifftabelle und Mikrofon-Hilfe.

import { mic } from "../audio/mic";
import { fluteSvg } from "../music/flute";
import { maxLevel, stagesOf, TRACK_LABEL, unlockedNotes, type Track } from "../music/levels";
import { joinNames, nameHtml, nameText } from "../music/names";
import { CHART, NOTES } from "../music/notes";
import { staffRange, staffSvg } from "../music/staff";
import {
  countedNotes,
  isWeak,
  level,
  levelCap,
  noteAccuracy,
  noteMastered,
  notePoints,
  POINTS_MAX,
  POINTS_RIGHT,
  POINTS_UNLOCK,
  POINTS_WRONG,
  pointsMissing,
  startLevel,
} from "../srs/progress";
import { chapterOf, chaptersOf, snippetSong, stageSong } from "../srs/chapters";
import { esc, pressGuard, topbar, type View } from "./common";
import { milestoneTitle } from "./startpoint";

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
  // Ein Tipp, der noch auf der letzten Karte begann, soll die Ergebnisse nicht gleich wegklicken
  const pressedHere = pressGuard(root.querySelector("main")!);
  const home = root.querySelector('[data-act="home"]')!;
  home.addEventListener("click", (e) => {
    if (!pressedHere(e, home)) return;
    ctx.lastResult = null;
    ctx.go("#/");
  });
};

export const progressView: View = (root, ctx) => {
  const sec = (track: Track) => {
    const lv = level(ctx.data, track);
    const max = maxLevel(track);
    // Balken: Sicherheit (Punkte), Kerbe bei POINTS_UNLOCK. Rot nur, wer schwach ist und noch nicht sitzt
    // (nach anfänglichen Fehlern kann ein Ton schon voll sein, obwohl die Trefferquote noch unter 80 % liegt).
    const rows = unlockedNotes(track, lv)
      .map((n) => {
        const a = noteAccuracy(ctx.data, track, n);
        const p = notePoints(ctx.data, track, n);
        const weak = isWeak(a) && p < POINTS_UNLOCK;
        return (
          `<div class="prow${weak ? " weak" : ""}" data-note="${n}"><span class="nm">${nameHtml(n)}</span>` +
          `<span class="pb" style="--mark:${(POINTS_UNLOCK / POINTS_MAX) * 100}%"><b style="width:${(p / POINTS_MAX) * 100}%"></b></span>` +
          `<span class="cnt">${a.n || p ? `${p} von ${POINTS_MAX}` : "noch keine"}</span></div>`
        );
      })
      .join("");
    // Töne unter 8 Punkten – auch wenn Spielen gerade an der Lesen-Stufe ansteht (dort hält blockingNotes
    // nichts auf, aber diese Töne entscheiden, ob Spielen mit Lesen mitzieht)
    const missing = countedNotes(ctx.data, track).filter((n) => !noteMastered(ctx.data, track, n)).map((n) => {
      const k = pointsMissing(ctx.data, track, n);
      return `${nameHtml(n)} (${k} richtige)`;
    });
    const next = stagesOf(track)[lv];
    // Kapitel (Meilensteine) und beim Spielen das Lied, aus dem die Abschnitte kommen
    const ch = chapterOf(track, lv);
    const song = track === "spielen" ? snippetSong(track, lv) : undefined;
    return `<section aria-label="${TRACK_LABEL[track]}">
      <div class="stagebar"><h2>${TRACK_LABEL[track]}</h2><span class="soft">Stufe ${lv} von ${max}</span></div>
      <p class="chap" data-testid="chapter-${track}">Kapitel ${ch.no} von ${chaptersOf(track).length} · ${milestoneTitle(ch.milestone)} <span class="soft">(Stufe ${ch.from}–${ch.to})</span></p>
      ${song ? `<p class="chap" data-testid="stage-song">Lied dieser Stufe: <a href="#/lied/${encodeURIComponent(song.id)}">${esc(song.title)}</a> <span class="soft">– seine Abschnitte kommen beim Spielen vor</span></p>` : ""}
      <div class="rows">${rows}</div>
      <p class="help">${
        next
          ? `Als Nächstes: ${joinNames(next.notes)}. Dafür braucht jeder Ton${startLevel(ctx.data, track) > 1 ? ` ab deinem Startpunkt (Stufe ${startLevel(ctx.data, track)})` : ""} ${POINTS_UNLOCK} Punkte.` +
            (missing.length
              ? ` <span data-testid="missing-${track}">Es fehlen noch: ${missing.join(", ")}.</span>`
              : lv < levelCap(ctx.data, track)
                ? ` <span data-testid="missing-${track}">Alle sitzen – die nächste Stufe kommt mit deiner nächsten richtigen Antwort.</span>`
                : "")
          : "Alle Stufen sind freigeschaltet."
      }${track === "spielen" && next ? " Spielen kann Lesen nicht überholen." : ""}</p>
    </section>`;
  };
  const start = `<section aria-label="Startpunkt"><p class="help">Zu leicht oder zu schwer? Du kannst bei einem anderen Abschnitt einsteigen – weiter hinten oder wieder vorn.</p><a class="big alt" href="#/startpunkt" data-testid="to-startpoint">Startpunkt ändern</a></section>`;
  root.innerHTML = `<main class="screen page">${topbar("Fortschritt")}<p class="help">Sicherheit je Ton: richtig +${POINTS_RIGHT}, falsch −${POINTS_WRONG}, höchstens ${POINTS_MAX}. Ab ${POINTS_UNLOCK} Punkten sitzt ein Ton. Wiederholt wird er trotzdem: am nächsten Tag, nach 3 Tagen, nach einer Woche …</p>${sec("lesen")}${sec("spielen")}${start}</main>`;
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
