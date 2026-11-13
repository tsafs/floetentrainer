// Stimmgerät: freies Spielen mit laufender Anzeige der gehörten Note.

import { PlayJudge } from "../audio/judge";
import { keepAwake, mic } from "../audio/mic";
import { fluteSvg } from "../music/flute";
import { midiNameHtml } from "../music/names";
import { CHART, chartNoteByMidi } from "../music/notes";
import { staffRange, staffSvg } from "../music/staff";
import { topbar, type View } from "./common";

export const tunerView: View = (root, ctx) => {
  const range = staffRange(CHART.map((n) => n.id));
  const judge = new PlayJudge({ tuning: ctx.data.settings.tuningHz });
  const tol = ctx.data.settings.toleranceCents;
  root.innerHTML = `
<main class="screen fit tuner">
  ${topbar("Stimmgerät")}
  <div class="stage" data-testid="tuner-staff">${staffSvg(null, { range, label: "Notenzeile" })}<p class="q soft" data-testid="tuner-hint">Spiel einen Ton</p></div>
  <div class="side">
    <div class="tunerrow">
      <div class="fl">${fluteSvg("oooooooo", "Griffbild")}</div>
      <div><div class="nmbig" data-testid="tuner-name">–</div><div class="ct" data-testid="tuner-cents"></div></div>
    </div>
    <div class="meter off" aria-hidden="true"><i></i></div>
    <p class="help soft">Stimmton a = ${ctx.data.settings.tuningHz} Hz. Grün heißt: höchstens ${tol} Cent daneben.</p>
    <button class="big" data-act="start" hidden>Mikrofon einschalten</button>
  </div>
</main>`;
  const main = root.querySelector("main")!;
  const stage = main.querySelector(".stage")!;
  const nm = main.querySelector('[data-testid="tuner-name"]')!;
  const ct = main.querySelector('[data-testid="tuner-cents"]')!;
  const meter = main.querySelector(".meter") as HTMLElement;
  const fl = main.querySelector(".fl")!;
  const hint = main.querySelector('[data-testid="tuner-hint"]')!;
  const startBtn = main.querySelector('[data-act="start"]') as HTMLButtonElement;
  let shown: number | null = null;
  let lastAt = 0;

  const unlisten = mic.listen((f) => {
    const o = judge.push(f);
    const h = o.heard;
    if (!h) {
      if (f.t - lastAt > 400 && shown !== null) {
        shown = null;
        nm.innerHTML = "–";
        ct.textContent = "";
        meter.className = "meter off";
        hint.textContent = "Spiel einen Ton";
      }
      return;
    }
    lastAt = f.t;
    if (h.midi !== shown) {
      shown = h.midi;
      nm.innerHTML = midiNameHtml(h.midi);
      const n = chartNoteByMidi(h.midi);
      const svg = stage.querySelector("svg")!;
      svg.outerHTML = staffSvg(n ? n.id : null, { range, label: "gehörte Note" });
      fl.innerHTML = n ? fluteSvg(n.fingering, "Griffbild") : fluteSvg("oooooooo", "Griffbild");
      fl.classList.toggle("none", !n);
      hint.textContent = n ? "" : "außerhalb von c¹–c³";
    }
    ct.textContent = `${h.cents > 0 ? "+" : h.cents < 0 ? "−" : "±"}${Math.abs(h.cents)} Cent`;
    meter.className = Math.abs(h.cents) <= tol ? "meter in" : "meter";
    (meter.querySelector("i") as HTMLElement).style.left = `${50 + Math.max(-50, Math.min(50, h.cents))}%`;
  });

  keepAwake(true);
  const watch = (p: Promise<void>) =>
    p
      .then(() => {
        startBtn.hidden = true;
      })
      .catch((e) => {
        ctx.micError = String(e);
        ctx.micRetry = () => mic.start().then(() => ctx.go("#/stimmgeraet"));
        ctx.go("#/mikrofon");
      });
  startBtn.addEventListener("click", () => watch(mic.start()));
  // Kam man per Tippen auf „Stimmgerät“ hierher, läuft das Mikrofon schon (oder startet gerade).
  // Sonst braucht der Browser ein Tippen: dann den Knopf zeigen.
  if (mic.running) startBtn.hidden = true;
  else if (mic.pending) watch(mic.pending);
  else startBtn.hidden = false;

  return () => {
    unlisten();
    keepAwake(false);
    mic.stop();
  };
};
