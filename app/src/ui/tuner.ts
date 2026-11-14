// Stimmgerät: freies Spielen mit laufender Anzeige der gehörten Note.
//
// Ruhige Anzeige (Rückmeldung vom 14.11.2026, „der Ton wackelt zu viel hin und her“): Die Frames
// laufen durch den Glätter (../audio/smooth.ts) mit kräftiger Einstellung – Stabilitätsprüfung,
// Median über 5 Frames (≈ 125 ms) und Zeitkonstante 175 ms – für Zeiger und Cent-Anzeige. Ein klarer
// Tonwechsel (über 70 Cent) und ein neuer Einsatz nach Stille gelten trotzdem sofort. Der Notenname hat
// eine Hysterese (NameHold): Er wechselt erst, wenn der neue Ton ununterbrochen anliegt – bei einem
// klaren Wechsel (über 60 Cent vom angezeigten) drei Frames (≈ 50 ms), knapp an der Mitte zwischen zwei
// Tönen 100 ms. Die Cent-Anzeige bezieht sich immer auf den angezeigten Namen. Dazu gleitet der Zeiger
// per CSS kurz (100 ms) nach, ohne die Anzeige zu verzögern.
//
// Tonwechsel (Rückmeldung vom 14.11.2026: „wenn ich schnell von G auf A oder von A auf H wechsle, sehe
// ich kurz GIS bzw. den Zwischenton“): Übergangswerte, die beim Wechsel entstehen, filtert schon die
// Stabilitätsprüfung im Glätter; die Namensregel (drei Frames) fängt den Rest. Solange ein klarer
// Wechsel abgewartet wird (NameHold.pending), bleiben Zeiger und Cent stehen, statt kurz an den Rand
// („+100 Cent“) gezogen zu werden.
//
// Flötenprofil: Das Stimmgerät misst gegen den Stimmton der aktiven Flöte (seit 14.11.2026: der Stimmton
// gehört zur Flöte, ../music/tuning.ts) – Name und Cent sind die echte Abweichung von dem, was dieser
// Stimmton erwarten lässt. Ist für den gehörten Ton auf der aktiven Flöte ein Wert gespeichert, steht klein
// darunter, wie dieser Ton innerhalb der Flöte liegt („Deine Flöte bei e¹: −15“). Oben dezent die Flöte
// und ihr Stimmton („Flöte: Kinderflöte · etwa 432,5 Hz“).

import { keepAwake, mic } from "../audio/mic";
import { NameHold, pitched, Smoother, TUNER_SMOOTH } from "../audio/smooth";
import { fluteSvg } from "../music/flute";
import { midiNameHtml } from "../music/names";
import { CHART, chartNoteByMidi, freqToWrittenMidi } from "../music/notes";
import { staffRange, staffSvg } from "../music/staff";
import { hzText, tuningShort } from "../music/tuning";
import { activeFlute } from "../store/data";
import { esc, topbar, type View } from "./common";
import { centsText } from "./flute";

export const tunerView: View = (root, ctx) => {
  const range = staffRange(CHART.map((n) => n.id));
  const flute = activeFlute(ctx.data);
  const tuning = flute.tuning.hz;
  const tuningLine = tuningShort(flute) ?? `Stimmton unbekannt, ${hzText(flute.tuning)} angenommen`;
  const smoother = new Smoother(TUNER_SMOOTH);
  const names = new NameHold();
  const tol = ctx.data.settings.toleranceCents;
  root.innerHTML = `
<main class="screen fit tuner">
  ${topbar("Stimmgerät")}
  <p class="tunerfl soft" data-testid="tuner-tuning">Flöte: ${esc(flute.name)} · ${tuningLine}</p>
  <div class="stage" data-testid="tuner-staff">${staffSvg(null, { range, label: "Notenzeile" })}<p class="q soft" data-testid="tuner-hint">Spiel einen Ton</p></div>
  <div class="side">
    <div class="tunerrow">
      <div class="fl">${fluteSvg("oooooooo", "Griffbild")}</div>
      <div><div class="nmbig" data-testid="tuner-name">–</div><div class="ct" data-testid="tuner-cents"></div><div class="flnote" data-testid="tuner-flute"></div></div>
    </div>
    <div class="meter off" aria-hidden="true"><i></i></div>
    <p class="help soft">Cent im Verhältnis zum Stimmton deiner Flöte. Grün heißt: höchstens ${tol} Cent daneben.</p>
    <button class="big" data-act="start" hidden>Mikrofon einschalten</button>
  </div>
</main>`;
  const main = root.querySelector("main")!;
  const stage = main.querySelector(".stage")!;
  const nm = main.querySelector('[data-testid="tuner-name"]')!;
  const ct = main.querySelector('[data-testid="tuner-cents"]')!;
  const flnote = main.querySelector('[data-testid="tuner-flute"]') as HTMLElement;
  const fluteMulti = ctx.data.flutes.length > 1;
  const meter = main.querySelector(".meter") as HTMLElement;
  const fl = main.querySelector(".fl")!;
  const hint = main.querySelector('[data-testid="tuner-hint"]')!;
  const startBtn = main.querySelector('[data-act="start"]') as HTMLButtonElement;
  let shown: number | null = null;
  let lastAt = 0;

  const unlisten = mic.listen((raw) => {
    const f = smoother.push(raw);
    if (!f) return;
    const m = pitched(smoother.cfg, f) ? freqToWrittenMidi(f.freq, tuning) : null;
    const midi = names.push(m, f.t);
    const h = m === null || midi === null ? null : { midi, cents: Math.round((m - midi) * 100) };
    if (!h) {
      if (f.t - lastAt > 400 && shown !== null) {
        shown = null;
        nm.innerHTML = "–";
        ct.textContent = "";
        meter.className = "meter off";
        flnote.textContent = "";
        hint.textContent = "Spiel einen Ton";
      }
      return;
    }
    lastAt = f.t;
    // neuer Ton wird noch abgewartet: Name, Zeiger und Cent bleiben wie sie sind
    if (names.pending) return;
    if (h.midi !== shown) {
      shown = h.midi;
      nm.innerHTML = midiNameHtml(h.midi);
      const n = chartNoteByMidi(h.midi);
      const svg = stage.querySelector("svg")!;
      svg.outerHTML = staffSvg(n ? n.id : null, { range, label: "gehörte Note" });
      fl.innerHTML = n ? fluteSvg(n.fingering, "Griffbild") : fluteSvg("oooooooo", "Griffbild");
      fl.classList.toggle("none", !n);
      hint.textContent = n ? "" : "außerhalb von c¹–c³";
      const v = n ? flute.offsets[n.id] : undefined;
      flnote.innerHTML =
        v === undefined
          ? ""
          : `${fluteMulti ? esc(flute.name) : "Deine Flöte"} bei ${midiNameHtml(h.midi)}: ${centsText(v)}`;
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
