// Testboard (#/testboard, aus den Einstellungen): Liste der Testfolgen (../songs/testboard.ts). Jede
// öffnet die normale Liedseite; dort Mitspielen und danach „Diagnose speichern“ – hier mit Ton.

import { TEST_PIECES } from "../songs/testboard";
import { esc, topbar, type View } from "./common";

export const testboardView: View = (root) => {
  root.innerHTML = `
<main class="screen page testboard">
  ${topbar("Testboard", "#/einstellungen")}
  <section>
    <h2>Erkennung prüfen</h2>
    <p class="help">Kurze Tonfolgen, an denen sich prüfen lässt, wie gut die App deine Töne erkennt. So gehts:</p>
    <ol class="steps-list">
      <li>Eine Folge öffnen, auf „Mitspielen“ umschalten und spielen – „Wartet auf mich“ oder „Im Takt“, gern beides nacheinander.</li>
      <li>Danach unten auf „Diagnose speichern“ tippen und die Datei weitergeben.</li>
    </ol>
    <p class="help" data-testid="testboard-audio"><strong>Anders als bei den Liedern nimmt die App hier beim Mitspielen auch den Ton auf.</strong> Er bleibt im Gerät und steckt nur in der Diagnose-Datei, die du selbst speicherst oder teilst. Damit lässt sich die Erkennung mit genau deinem Spiel nachrechnen und verbessern.</p>
  </section>
  <section>
    <ul class="songs">${TEST_PIECES.map(
      (p) => `<li><a class="songrow" href="#/lied/${p.id}" data-song="${p.id}"><span class="st">${esc(p.title)}</span><span class="sm">${esc(p.about)} · Tempo ${p.bpm}</span></a></li>`,
    ).join("")}</ul>
  </section>
</main>`;
};
