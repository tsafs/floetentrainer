// „Flöte einstellen“ (#/floete, einzelner Ton: #/floete/<kennung>): misst Ton für Ton, wie weit die aktive
// Flöte vom Stimmton *dieser Flöte* abweicht (../audio/flute-profile.ts, FluteCalibrator; Stimmton und
// Umrechnung ../music/tuning.ts).
//
// Stimmton (seit 14.11.2026 je Flöte):
// - unbekannt: Er wird hier ermittelt. Nach jedem gemessenen Ton rückt er auf den Median der absoluten
//   Lagen aller gemessenen Töne (recenter), die Werte liegen dann um 0. Das Ergebnis zeigt deshalb den
//   Wert relativ zum neuen Stimmton und diesen dazu („a¹: −4 Cent · Stimmton etwa 432,5 Hz“). Die nächste
//   Messung bezieht sich schon auf den neuen Stimmton (so wird auch eine sehr tiefe Flöte nicht für „ein
//   anderer Ton“ gehalten).
// - bekannt (z. B. 442 laut Hersteller): Die Angabe ist der Bezug und wird nicht überschrieben; die Werte
//   je Ton werden genauso gemessen und angewandt. Unten steht zur Information „angegeben 442 Hz · gemessen
//   etwa 442,5 Hz“ (Median der absoluten Lagen); ab 10 Cent Abstand dezent das Angebot, den gemessenen Wert
//   als Stimmton zu übernehmen (die absoluten Lagen bleiben, die Werte werden umgerechnet).
//
// Geführt durch die in der Lesen-Spur freigeschalteten Töne, nach Tonhöhe. Je Ton: Notenbild und Name,
// „Spiel diesen Ton ruhig etwa 2 Sekunden“, ein Fortschrittsbalken über die stabile Phase, dann das Ergebnis
// („a¹: −25 Cent“, sofort gespeichert) und nach kurzer Pause der nächste Ton. „Überspringen“ und
// „Nochmal“. War der Median 50 Cent oder mehr daneben, war es wohl ein anderer Ton: Hinweis, und sie
// spielt einfach nochmal. Unten die Übersicht aller Töne mit ihren Werten; Antippen misst diesen einen Ton
// (nachträglich, ohne weiterzuspringen).
// Nach einem Ergebnis wartet die Messung des nächsten Tons auf eine kurze Stille, damit der noch
// klingende vorige Ton nicht als falscher Ton gilt.

import { FluteCalibrator, calibrationNotes, type CalibrateState } from "../audio/flute-profile";
import { keepAwake, mic } from "../audio/mic";
import { pitched, DEFAULT_SMOOTH } from "../audio/smooth";
import { levelOf, unlockedNotes } from "../music/levels";
import { midiNameHtml, nameHtml, nameText } from "../music/names";
import { note } from "../music/notes";
import { staffRange, staffSvg } from "../music/staff";
import {
  calibrationReference,
  centsBetween,
  hzRoundText,
  hzText,
  measuredHz,
  MEASURED_HINT_CENTS,
  offsetFromReference,
  recenter,
  roundHalfHz,
  setKnownTuning,
  tuningShort,
} from "../music/tuning";
import { activeFlute } from "../store/data";
import { esc, topbar, type View } from "./common";

/** Nach einem Ergebnis so lange bis zum nächsten Ton (ms) */
const NEXT_MS = 1400;
/** So lange Stille, bevor nach einem Tonwechsel gemessen wird (ms) */
const QUIET_MS = 60;

/** „−25“, „+3“, „±0“ */
export function centsText(c: number): string {
  const r = Math.round(c);
  return `${r > 0 ? "+" : r < 0 ? "−" : "±"}${Math.abs(r)}`;
}

export const fluteView: View = (root, ctx) => {
  const d = ctx.data;
  const flute = activeFlute(d);
  const ids = calibrationNotes(unlockedNotes("lesen", levelOf("lesen", d.stages.lesen)));
  const range = staffRange(ids);
  const single = location.hash.split("/")[2] ?? null;
  /** geführt (alle der Reihe nach) oder ein einzelner Ton */
  let guided = !(single && ids.includes(single));
  let idx = guided ? 0 : ids.indexOf(single!);
  /**
   * Messung je Ton gegen die gemessene Mitte der Flöte (unbekannt: ihr Stimmton, der mitwandert; bekannt
   * und noch nichts gemessen: die Angabe), Ergebnis dann relativ zum Stimmton (calibrationReference)
   */
  let calRef = 0;
  const newCal = () => {
    calRef = calibrationReference(flute);
    return new FluteCalibrator(note(ids[idx]).midi, calRef);
  };
  let cal = newCal();
  let quietSince: number | null = null;
  let needQuiet = false;
  let timer: number | null = null;
  let finished = false;
  let lastShown = "";

  root.innerHTML = `
<main class="screen page flcal">
  ${topbar("Flöte einstellen", "#/einstellungen")}
  <p class="flsub soft" data-testid="cal-sub"></p>
  <section class="calcard">
    <div class="calstage" data-testid="cal-staff"></div>
    <div class="calinfo">
      <div class="nmbig" data-testid="cal-name"></div>
      <p class="calq" data-testid="cal-q">Spiel diesen Ton ruhig etwa 2 Sekunden.</p>
      <div class="calbar" aria-hidden="true"><i></i></div>
      <p class="calstat" data-testid="cal-status" aria-live="polite"></p>
    </div>
  </section>
  <div class="calbtns">
    <button class="big alt" data-act="again">Nochmal</button>
    <button class="big alt" data-act="skip">Überspringen</button>
  </div>
  <button class="big" data-act="start" hidden>Mikrofon einschalten</button>
  <button class="big" data-act="done" hidden>Zurück zu den Einstellungen</button>
  <section aria-label="Werte je Ton">
    <h2>Werte je Ton</h2>
    <div class="calgrid" data-testid="cal-grid"></div>
    <p class="calhz" data-testid="cal-tuning"></p>
    <div class="caladopt" data-testid="cal-adopt" hidden><p></p><button class="clear" data-act="adopt">Gemessenen Wert als Stimmton übernehmen</button></div>
    <p class="help" data-testid="cal-help"></p>
  </section>
</main>`;
  const main = root.querySelector("main")!;
  const $ = <T extends Element>(s: string) => main.querySelector(s) as T;
  const sub = $<HTMLElement>('[data-testid="cal-sub"]');
  const stage = $<HTMLElement>(".calstage");
  const nm = $<HTMLElement>('[data-testid="cal-name"]');
  const qEl = $<HTMLElement>('[data-testid="cal-q"]');
  const bar = $<HTMLElement>(".calbar i");
  const stat = $<HTMLElement>('[data-testid="cal-status"]');
  const grid = $<HTMLElement>('[data-testid="cal-grid"]');
  const startBtn = $<HTMLButtonElement>('[data-act="start"]');
  const doneBtn = $<HTMLButtonElement>('[data-act="done"]');
  const againBtn = $<HTMLButtonElement>('[data-act="again"]');
  const skipBtn = $<HTMLButtonElement>('[data-act="skip"]');
  const hzEl = $<HTMLElement>('[data-testid="cal-tuning"]');
  const adoptBox = $<HTMLElement>('[data-testid="cal-adopt"]');
  const helpEl = $<HTMLElement>('[data-testid="cal-help"]');

  /** Stimmton-Zeile, Angebot zum Übernehmen und Erklärung unter der Übersicht */
  const drawTuning = () => {
    const t = flute.tuning;
    const meas = measuredHz(flute);
    adoptBox.hidden = true;
    if (t.known) {
      hzEl.innerHTML = meas === null ? `Stimmton ${hzText(t)} (angegeben)` : `Stimmton angegeben ${hzText(t)} · gemessen etwa ${hzRoundText(meas)}`;
      const diff = meas === null ? 0 : centsBetween(meas, t.hz);
      if (Math.abs(diff) > MEASURED_HINT_CENTS && Math.abs(roundHalfHz(meas!) - t.hz) >= 0.5) {
        adoptBox.hidden = false;
        adoptBox.querySelector("p")!.textContent = `Deine Flöte klingt insgesamt etwa ${Math.round(Math.abs(diff))} Cent ${diff < 0 ? "tiefer" : "höher"} als angegeben.`;
      }
      helpEl.textContent = `Abweichung vom Stimmton deiner Flöte in Cent (minus = tiefer, als ${hzText(t)} erwarten lässt). Antippen misst einen Ton neu. Beim Mitspielen verfeinern sich die Werte von selbst.`;
    } else {
      const est = tuningShort(flute);
      hzEl.innerHTML = est ? `Stimmton unbekannt – ${est} (ermittelt)` : "Stimmton unbekannt – wird beim Einstellen ermittelt";
      helpEl.textContent = "Abweichung vom Stimmton deiner Flöte in Cent (minus = tiefer). Den Stimmton ermittelt die App aus allen Tönen (ihre Mitte). Antippen misst einen Ton neu. Beim Mitspielen verfeinern sich die Werte von selbst.";
    }
  };

  const clearTimer = () => {
    if (timer !== null) window.clearTimeout(timer);
    timer = null;
  };

  const drawGrid = () => {
    grid.innerHTML = ids
      .map((id) => {
        const v = flute.offsets[id];
        const cur = !finished && id === ids[idx];
        return `<button class="calcell${cur ? " cur" : ""}${v === undefined ? " none" : ""}" data-note="${id}" aria-label="${nameText(id)} ${v === undefined ? "noch nicht eingestellt" : `${centsText(v)} Cent`}"><span class="nm">${nameHtml(id)}</span><span class="v" data-testid="cal-val-${id}">${v === undefined ? "–" : centsText(v)}</span></button>`;
      })
      .join("");
    drawTuning();
  };

  /** „Kinderflöte · etwa 432,5 Hz“ */
  const subHead = () => {
    const hz = tuningShort(flute);
    return `${esc(flute.name)}${hz ? ` · ${hz}` : ""}`;
  };

  const drawNote = () => {
    const id = ids[idx];
    sub.innerHTML = `${subHead()} · ${guided ? `Ton ${idx + 1} von ${ids.length}` : "einzelner Ton"}`;
    stage.innerHTML = staffSvg(id, { range, label: `Note ${nameText(id)}` });
    nm.innerHTML = nameHtml(id);
    main.dataset.note = id;
    drawGrid();
  };

  const show = (s: CalibrateState) => {
    const key = s.phase === "measure" ? `m${Math.round(s.progress * 50)}` : s.phase;
    if (key === lastShown) return;
    lastShown = key;
    main.dataset.phase = s.phase;
    stat.className = "calstat";
    if (s.phase === "wait") {
      bar.style.width = "0";
      stat.textContent = needQuiet ? "" : "Ich höre zu …";
    } else if (s.phase === "measure") {
      bar.style.width = `${Math.round(s.progress * 100)}%`;
      stat.textContent = `${centsText(s.cents)} Cent`;
    } else if (s.phase === "done") {
      bar.style.width = "100%";
      stat.classList.add("ok");
      // gespeicherter Wert (bei unbekanntem Stimmton relativ zum neu ermittelten)
      const v = flute.offsets[ids[idx]] ?? s.cents;
      stat.innerHTML = `${nameHtml(ids[idx])}: ${centsText(v)} Cent${flute.tuning.known ? "" : ` · Stimmton ${tuningShort(flute)}`}`;
    } else {
      bar.style.width = "0";
      stat.classList.add("err");
      stat.innerHTML = `Das war wohl ein anderer Ton (${midiNameHtml(s.heardMidi)}) – nochmal.`;
    }
  };

  const goTo = (i: number, keepGuided = guided) => {
    clearTimer();
    guided = keepGuided;
    finished = false;
    idx = i;
    cal = newCal();
    needQuiet = true;
    quietSince = null;
    lastShown = "";
    qEl.hidden = false;
    againBtn.hidden = skipBtn.hidden = false;
    doneBtn.hidden = true;
    drawNote();
    show(cal.state);
  };

  const finishAll = () => {
    clearTimer();
    finished = true;
    main.dataset.phase = "fertig";
    sub.innerHTML = subHead();
    stat.className = "calstat ok";
    stat.textContent = "Fertig – alle Töne sind eingestellt.";
    qEl.hidden = true;
    againBtn.hidden = skipBtn.hidden = true;
    doneBtn.hidden = false;
    drawGrid();
  };

  const next = () => {
    if (!guided) return;
    if (idx + 1 < ids.length) goTo(idx + 1);
    else finishAll();
  };

  const unlisten = mic.listen((f) => {
    if (finished) return;
    if (needQuiet) {
      // erst nach kurzer Stille messen (vorigen Ton ausklingen lassen)
      if (pitched(DEFAULT_SMOOTH, f)) {
        quietSince = null;
        return;
      }
      quietSince ??= f.t;
      if (f.t - quietSince < QUIET_MS) return;
      needQuiet = false;
      lastShown = "";
    }
    const before = cal.state.phase;
    const s = cal.push(f);
    if (s.phase === "done" && before !== "done") {
      // speichern, unbekannten Stimmton neu ermitteln, dann erst zeigen
      flute.offsets[ids[idx]] = offsetFromReference(flute, s.cents, calRef);
      recenter(flute);
      flute.updated = Date.now();
      ctx.save();
    }
    show(s);
    if (s.phase === before) return;
    if (s.phase === "done") {
      if (!finished) sub.innerHTML = `${subHead()} · ${guided ? `Ton ${idx + 1} von ${ids.length}` : "einzelner Ton"}`;
      drawGrid();
      if (guided) timer = window.setTimeout(next, NEXT_MS);
    } else if (s.phase === "wrong") {
      // nochmal: nach kurzer Pause neu messen
      timer = window.setTimeout(() => {
        cal.reset();
        needQuiet = true;
        quietSince = null;
        lastShown = "";
      }, 300);
    }
  });

  againBtn.addEventListener("click", () => goTo(idx));
  skipBtn.addEventListener("click", () => {
    if (guided) next();
    else goTo(idx);
  });
  doneBtn.addEventListener("click", () => ctx.go("#/einstellungen"));
  adoptBox.querySelector("button")!.addEventListener("click", () => {
    const meas = measuredHz(flute);
    if (meas === null) return;
    // gemessener Stimmton (auf 0,5 Hz) wird die Angabe; die absoluten Lagen bleiben
    setKnownTuning(flute, roundHalfHz(meas));
    flute.updated = Date.now();
    ctx.save();
    if (finished) {
      sub.innerHTML = subHead();
      drawGrid();
    } else drawNote();
  });
  grid.addEventListener("click", (e) => {
    const b = (e.target as Element).closest?.("button[data-note]") as HTMLButtonElement | null;
    if (!b) return;
    goTo(ids.indexOf(b.dataset.note!), false);
  });

  drawNote();
  show(cal.state);
  keepAwake(true);
  const watch = (p: Promise<void>) =>
    p
      .then(() => {
        startBtn.hidden = true;
      })
      .catch((e) => {
        ctx.micError = String(e);
        ctx.micRetry = () => mic.start().then(() => ctx.go("#/floete"));
        ctx.go("#/mikrofon");
      });
  startBtn.addEventListener("click", () => watch(mic.start()));
  // Kam man per Tippen auf „Flöte einstellen“ hierher, läuft das Mikrofon schon (oder startet gerade).
  if (mic.running) startBtn.hidden = true;
  else if (mic.pending) watch(mic.pending);
  else startBtn.hidden = false;
  // Für automatische Tests
  (window as unknown as { __floete: unknown }).__floete = { ids, state: () => ({ idx, guided, finished, phase: cal.state.phase }) };

  return () => {
    clearTimer();
    unlisten();
    keepAwake(false);
    mic.stop();
  };
};
