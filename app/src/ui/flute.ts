// „Flöte einstellen“ (#/floete, einzelner Ton: #/floete/<kennung>): misst Ton für Ton, wie weit die aktive
// Flöte vom Stimmton der Einstellungen abweicht (../audio/flute-profile.ts, FluteCalibrator).
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
import { activeFlute } from "../store/data";
import { esc, topbar, type View } from "./common";

/** Nach einem Ergebnis so lange bis zum nächsten Ton (ms) */
const NEXT_MS = 1400;
/** So lange Stille, bevor nach einem Tonwechsel gemessen wird (ms) */
const QUIET_MS = 60;

/** „−25“, „+3“, „±0“ */
export function centsText(c: number): string {
  return `${c > 0 ? "+" : c < 0 ? "−" : "±"}${Math.abs(Math.round(c))}`;
}

export const fluteView: View = (root, ctx) => {
  const d = ctx.data;
  const flute = activeFlute(d);
  const tuning = d.settings.tuningHz;
  const ids = calibrationNotes(unlockedNotes("lesen", levelOf("lesen", d.stages.lesen)));
  const range = staffRange(ids);
  const single = location.hash.split("/")[2] ?? null;
  /** geführt (alle der Reihe nach) oder ein einzelner Ton */
  let guided = !(single && ids.includes(single));
  let idx = guided ? 0 : ids.indexOf(single!);
  let cal = new FluteCalibrator(note(ids[idx]).midi, tuning);
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
    <p class="help">Abweichung vom Stimmton a = ${tuning} Hz in Cent (minus = zu tief). Antippen misst einen Ton neu. Beim Mitspielen verfeinern sich die Werte von selbst.</p>
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
  };

  const drawNote = () => {
    const id = ids[idx];
    sub.innerHTML = `${esc(flute.name)} · ${guided ? `Ton ${idx + 1} von ${ids.length}` : "einzelner Ton"}`;
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
      stat.innerHTML = `${nameHtml(ids[idx])}: ${centsText(s.cents)} Cent`;
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
    cal = new FluteCalibrator(note(ids[idx]).midi, tuning);
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
    sub.innerHTML = esc(flute.name);
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
    show(s);
    if (s.phase === before) return;
    if (s.phase === "done") {
      flute.offsets[ids[idx]] = s.cents;
      flute.updated = Date.now();
      ctx.save();
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
