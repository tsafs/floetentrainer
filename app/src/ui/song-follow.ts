// Mitspielen mit Mikrofon auf der Liedseite (docs/app-lieder.md, Runde 3 und Nachsteuerung vom 14.11.2026).
//
// Eine der beiden Arten der Liedseite (Umschalter „Anhören | Mitspielen“ oben, siehe ./songs.ts). Die
// Bedienleiste zeigt zum Einstellen die Wahl „Wartet auf mich | Im Takt“ (letzte Wahl gemerkt), den
// Schalter „Ich trage Kopfhörer“, im Takt-Modus das Tempo und darunter den großen Knopf „Mitspielen“
// (mit Auswahl „Takt 5–7 mitspielen“). Gewählte Takte (Auswahl, siehe ./songs.ts) werden einmal gespielt,
// ohne Auswahl das ganze Lied. Während des Spielens ist die Leiste knapp: Stopp, Name der Note, ggf. Tempo.
// Ein Griffbild gibt es hier bewusst nicht – sie soll die Noten lesen.
//
// Rückmeldung nur über Farben: jede Note wird grün (getroffen) oder rot (verfehlt). Keine Auswertung,
// keine Bestwerte. Nach dem Durchgang bleiben die Farben im Notenbild stehen, bis sie neu startet oder die
// Auswahl ändert; „Nochmal“ ist einfach wieder der Knopf „Mitspielen“.
//
// Die Wertung selbst steckt in ../audio/follow.ts; hier nur Mikrofon, Abspieler und Anzeige:
// - Warte-Modus: Markierung auf der Note, auf die gewartet wird; grün/rot, sobald sie getroffen ist
//   (rot schon beim ersten falschen Ton, dazu dezent „Du spielst a¹“). Es erklingt nichts – mit
//   Kopfhörern bei einem falschen Ton kurz und leise der richtige (siehe PREVIEW_VOL).
// - Takt-Modus: Der Abspieler zählt ein und klickt leise im Tempo, ohne Melodie (mit Kopfhörern leise
//   mit Melodie); Markierung und Balken laufen mit, jede Note wird nach ihrem Ende grün oder rot.
//   Im Warte-Modus steht der Balken an der Note, auf die gewartet wird.
// Unter dem großen Knopf klein: die aktive Flöte (Link zu den Einstellungen; Tipp „Flöte einstellen“, solange
// sie keine Werte hat, sonst z. B. „etwa 30 Cent tief, wird ausgeglichen“), im Takt-Modus die Verzögerung
// mit „abgleichen“ (Abgleich-Feld .fcal, ../audio/latency.ts; je Kopfhörer-Zustand ein Wert) und nach
// einem Durchgang „Diagnose speichern“ (../audio/diagnose.ts: nur Messwerte, kein Ton).
// Mikrofon und AudioContext starten erst beim Tippen auf „Mitspielen“; nach dem Durchgang, beim Stopp,
// beim Wechsel in den Hintergrund und beim Verlassen der Seite gehen Mikrofon und Klicks wieder aus.
// Die Lernspuren bleiben unberührt; gespeichert werden nur Art, Kopfhörer und Tempo.

import { diag, offerDiag } from "../audio/diagnose";
import { fallbackOffset, LiveTuning } from "../audio/flute-profile";
import { BeatFollower, DEFAULT_FOLLOW, followConfig, inputLatency, LATENCY_MAX, LATENCY_MIN, WaitFollower } from "../audio/follow";
import { CAL_CLICKS, CAL_COUNT_IN, CAL_SPQ, DEFAULT_LATENCY, latencyFromOnsets, OnsetDetector } from "../audio/latency";
import { keepAwake, mic } from "../audio/mic";
import { heardAtPerf, outputClock, songPlayer } from "../audio/song-player";
import { midiNameHtml, nameHtml } from "../music/names";
import type { NoteEvent, Song } from "../songs/model";
import { clampPercent, secPerQuarter, TEMPO_MAX, TEMPO_MIN } from "../songs/tempo";
import { sectionTimeline, type Timeline } from "../songs/timeline";
import { activeFlute, type FollowMode } from "../store/data";
import { esc, type Ctx } from "./common";

/** Lautstärke der mitlaufenden Melodie (Takt-Modus mit Kopfhörern) relativ zum Vorspielen */
export const MELODY_VOL = 0.35;
/**
 * Warte-Modus mit Kopfhörern: Bei einem falschen Ton erklingt kurz und leise der richtige.
 * Begründung: Eine mitlaufende Melodie gibt es ohne Tempo nicht. Den Zielton nach jedem Treffer
 * vorzuspielen, klänge über ihren eigenen Ton und nähme ihr das Notenlesen ab. Nach einem
 * falschen Ton dagegen hilft das Hören, und es passt zum Hinweis „Du spielst a¹“.
 */
export const PREVIEW_VOL = 0.4;
const PREVIEW_SEC = 0.7;
/** Schritt der Tempo-Knöpfe (Prozent) */
const TEMPO_STEP = 5;
/** Schritt des feinen Schiebers der Verzögerung (ms) */
const LATENCY_STEP = 10;
/** Abweichung der Flöte (Median ihrer Werte), ab der der Hinweis „etwa … Cent tief“ erscheint */
const FLUTE_NOTE_CENTS = 8;

const ICON_PLAY_SM = `<svg width="18" height="18" viewBox="0 0 26 26" aria-hidden="true"><path d="M8.5 5.2v15.6L21 13z"/></svg>`;
const ICON_STOP = `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><rect x="7" y="7" width="12" height="12" rx="1.6"/></svg>`;
export const ICON_MIC = `<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="2.2" width="6" height="10.2" rx="3" fill="none" stroke-width="1.4"/><path d="M4.3 9.6a5.7 5.7 0 0 0 11.4 0M10 15.3v2.6M7.2 17.9h5.6" fill="none" stroke-width="1.4" stroke-linecap="round"/></svg>`;

/**
 * Audiozeit t des Abspielers (s) → Zeitpunkt auf der Uhr der Mikrofon-Frames (performance.now), zu dem
 * sie den dort eingeplanten Klick *hört*: dieselbe Abbildung wie für die Markierung des Abspielers
 * (outputClock: getOutputTimestamp, sonst gemeldete Ausgabe-Verzögerung – bei Bluetooth-Kopfhörern oft
 * 0,2 s und mehr). Die Verzögerung von Mikrofon und Erkennung gleicht die Wertung selbst aus
 * (FollowConfig.latencyMs).
 */
export function heardAt(ac: AudioContext, t: number, now = performance.now()): number {
  return heardAtPerf(ac, t, now);
}

/** Beschriftung der beiden Arten (intern weiter Warte-Modus „wait“ und Takt-Modus „beat“) */
export const MODE_LABEL: Record<FollowMode, string> = { wait: "Wartet auf mich", beat: "Im Takt" };

export interface FollowHost {
  ctx: Ctx;
  song: Song;
  /** Zeitplan des ganzen Lieds */
  full: Timeline;
  noteById: Map<number, NoteEvent>;
  /** gewählte Takte (Indizes im Notenbild) oder null = ganzes Lied */
  section(): { from: number; to: number } | null;
  /** Auswahl aufheben */
  clearSection(): void;
  percent(): number;
  setPercent(p: number, save: boolean): void;
  setCur(ids: number[]): void;
  /** Balken an Stelle q (Viertel) im Zeitplan tl; null blendet ihn aus */
  playhead(tl: Timeline | null, q: number | null): void;
  /** Noten grün (hit), rot (miss) oder wieder schwarz (null) färben */
  paint(ids: number[], cls: "hit" | "miss" | null): void;
  clearPaint(): void;
  /** Zeile des Takts sichtbar halten */
  scrollTo(barIndex: number, force?: boolean): void;
  /** Mitspielen an/aus bzw. Start/Stopp: die Seite passt Umschalter und Hinweis an */
  changed(): void;
}

const tempoStepHtml = (cls: string) =>
  `<div class="tstep ${cls}" role="group" aria-label="Tempo">` +
  `<button data-dir="-1" aria-label="Langsamer">−</button>` +
  `<span class="tv"><small>Tempo</small><output data-testid="${cls}"></output></span>` +
  `<button data-dir="1" aria-label="Schneller">+</button></div>`;

/** HTML der Bedienleiste fürs Mitspielen (in .player, neben der Leiste fürs Anhören) */
export function followBarHtml(): string {
  return `
    <div class="fpin" data-testid="follow" hidden>
      <div class="fset">
        <div class="fsel" data-testid="follow-sel" hidden>
          <span class="fsl"></span>
          <button class="clear" data-act="fclear">Auswahl aufheben</button>
        </div>
        <div class="seg fmode" role="group" aria-label="Art des Mitspielens">
          <button data-mode="wait" aria-pressed="false">${MODE_LABEL.wait}</button><button data-mode="beat" aria-pressed="false">${MODE_LABEL.beat}</button>
        </div>
        <div class="fphones">
          <button class="switch" role="switch" aria-checked="false" aria-labelledby="fphones-lab" data-act="phones"><i></i></button>
          <span class="lab" id="fphones-lab">Ich trage Kopfhörer<small data-testid="phones-hint"></small></span>
        </div>
        <div class="fgorow">
          ${tempoStepHtml("fset-tempo")}
          <button class="big fgo" data-act="fstart">${ICON_PLAY_SM}<span data-testid="follow-go">Mitspielen</span></button>
        </div>
        <div class="fmeta">
          <p class="fline" data-testid="flute-line"></p>
          <div class="fline2">
            <p class="fline" data-testid="latency-line"></p>
            <button class="clear fdiag" data-act="diag" data-testid="diag" hidden>Diagnose speichern</button>
          </div>
        </div>
      </div>
      <div class="fcal" data-testid="fcal" hidden>
        <div class="fcalhead"><h3>Verzögerung abgleichen</h3><span class="fcalfor" data-testid="fcal-for"></span></div>
        <p class="fcaltext" data-testid="fcal-text" aria-live="polite"></p>
        <div class="fdots" data-testid="fcal-dots" aria-hidden="true"></div>
        <div class="fcalval">
          <div class="stepper" role="group" aria-label="Verzögerung"><button data-lat="-1" aria-label="weniger">−</button><output data-testid="fcal-val"></output><button data-lat="1" aria-label="mehr">+</button></div>
          <button class="clear" data-act="lat-default">Standard</button>
        </div>
        <div class="fcalbtns">
          <button class="big alt" data-act="lat-close">Fertig</button>
          <button class="big" data-act="lat-start">Abgleich starten</button>
        </div>
      </div>
      <div class="frun" hidden>
        <button class="playbtn on" data-act="fstop" aria-label="Stopp">${ICON_STOP}</button>
        <div class="finfo">
          <span class="pname" data-testid="follow-note"></span>
          <span class="pcount" data-testid="follow-count" hidden></span>
          <span class="fwrong" data-testid="follow-wrong" aria-live="polite"></span>
          <span class="pstat" data-testid="follow-status" aria-live="polite"></span>
        </div>
        ${tempoStepHtml("frun-tempo")}
      </div>
    </div>`;
}

/** Zeitplan eines einzelnen kurzen Tons (Zielton im Warte-Modus anspielen) */
function singleTone(midi: number): Timeline {
  return {
    tones: [{ start: 0, dur: 1, midi, ids: [], bar: 0, breathAfter: false }],
    bars: [],
    total: 1,
    countIn: [],
    countInDur: 0,
    countInBeats: 0,
  };
}

/** „Takt 5“ bzw. „Takt 5–7“ */
export function barRangeText(s: { from: number; to: number }): string {
  return s.from === s.to ? `Takt ${s.from + 1}` : `Takt ${s.from + 1}–${s.to + 1}`;
}

export interface Follow {
  readonly active: boolean;
  readonly running: boolean;
  enter(): void;
  exit(): void;
  /** laufendes Mitspielen beenden (Stopp, Hintergrund); die Farben bleiben stehen */
  stopRun(): void;
  /** Auswahl oder Tempo hat sich geändert (Anzeige nachziehen) */
  refresh(): void;
  /** Seite wird verlassen */
  destroy(): void;
  /** Für automatische Tests */
  debug(): unknown;
}

/** Song-Kennung, deren Seite nach erteilter Mikrofon-Erlaubnis gleich im Mitspielen öffnen soll */
let reopenFollow: string | null = null;

export function mountFollow(main: HTMLElement, host: FollowHost): Follow {
  const { ctx, song } = host;
  const settings = ctx.data.settings;
  const el = main.querySelector(".fpin") as HTMLElement;
  const q = <T extends Element>(sel: string) => el.querySelector(sel) as T;
  const modeBtns = [...el.querySelectorAll<HTMLButtonElement>(".fmode button")];
  const fset = q<HTMLElement>(".fset");
  const frun = q<HTMLElement>(".frun");
  const selBox = q<HTMLElement>(".fsel");
  const selText = q<HTMLElement>(".fsl");
  const phonesBtn = q<HTMLButtonElement>('[data-act="phones"]');
  const phonesHint = q<HTMLElement>('[data-testid="phones-hint"]');
  const fname = q<HTMLElement>('[data-testid="follow-note"]');
  const fcount = q<HTMLElement>('[data-testid="follow-count"]');
  const fwrong = q<HTMLElement>(".fwrong");
  const fstat = q<HTMLElement>('[data-testid="follow-status"]');
  const goBtn = q<HTMLButtonElement>('[data-act="fstart"]');
  const goText = q<HTMLElement>('[data-testid="follow-go"]');
  const tempoBoxes = [...el.querySelectorAll<HTMLElement>(".tstep")];
  const fluteLine = q<HTMLElement>('[data-testid="flute-line"]');
  const latLine = q<HTMLElement>('[data-testid="latency-line"]');
  const diagBtn = q<HTMLButtonElement>('[data-act="diag"]');
  const fcal = q<HTMLElement>(".fcal");
  const fcalFor = q<HTMLElement>('[data-testid="fcal-for"]');
  const fcalText = q<HTMLElement>('[data-testid="fcal-text"]');
  const fcalDots = q<HTMLElement>('[data-testid="fcal-dots"]');
  const fcalVal = q<HTMLElement>('[data-testid="fcal-val"]');
  const fcalVals = q<HTMLElement>(".fcalval");
  const latClose = q<HTMLButtonElement>('[data-act="lat-close"]');
  const latStart = q<HTMLButtonElement>('[data-act="lat-start"]');

  let active = false;
  let mode: FollowMode = settings.followMode;
  /** Zähler der Durchläufe: Rückrufe eines beendeten Laufs werden ignoriert */
  let token = 0;
  let run: {
    tl: Timeline;
    wait?: WaitFollower;
    beat?: BeatFollower;
    /** Abweichungen der Flöte, im Durchgang nachgeführt */
    tuning?: LiveTuning;
    unlisten?: () => void;
    started: boolean;
    /** Takt-Modus: Beginn des Zeitplans (ms, Uhr der Frames) */
    startMs: number | null;
  } | null = null;
  let shownMidi: number | null | undefined;
  /**
   * Abgleich der Verzögerung: null = zu; intro (Erklärung, Wert, Start), running (Klicks laufen),
   * result (Ergebnis oder Fehlschlag). Gemessen wird für den Kopfhörer-Zustand beim Start (which).
   */
  let cal: {
    state: "intro" | "running" | "result";
    which: "speaker" | "headphones";
    ok?: boolean;
    clicks?: number[];
    det?: OnsetDetector;
    hits?: boolean[];
    passed?: number;
    unlisten?: () => void;
    timer?: number;
  } | null = null;
  let diagMsg = "";

  // ------------------------------------------------------------ Anzeige
  const showNote = (midi: number | null, id?: string) => {
    if (midi === shownMidi) return;
    shownMidi = midi;
    fname.innerHTML = id ? nameHtml(id) : midi == null ? "" : midiNameHtml(midi);
  };
  const showTone = (i: number | null) => {
    if (!run || i == null || !run.tl.tones[i]) return;
    const t = run.tl.tones[i];
    const n = host.noteById.get(t.ids[0]);
    showNote(t.midi, n?.pitch.id);
  };

  const showCount = (k: number | null) => {
    if (k == null) {
      fcount.hidden = true;
      fname.hidden = false;
      return;
    }
    const n = run?.tl.countInBeats || host.full.countInBeats;
    fcount.innerHTML = Array.from({ length: n }, (_, i) => `<i${i + 1 === k ? ' class="on"' : ""}>${i + 1}</i>`).join("");
    fcount.setAttribute("aria-label", `Einzählen ${k}`);
    fcount.hidden = false;
    fname.hidden = true;
  };

  const showTempo = () => {
    const p = host.percent();
    for (const box of tempoBoxes) {
      (box.querySelector("output") as HTMLOutputElement).textContent = `${p} %`;
      (box.querySelector('[data-dir="-1"]') as HTMLButtonElement).disabled = p <= TEMPO_MIN;
      (box.querySelector('[data-dir="1"]') as HTMLButtonElement).disabled = p >= TEMPO_MAX;
    }
  };

  /** Bedienleiste nach Zustand zeichnen */
  const render = () => {
    el.hidden = !active;
    main.classList.toggle("following", active);
    main.classList.toggle("frunning", !!run);
    main.dataset.followMode = mode;
    if (active) {
      for (const b of modeBtns) b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
      const running = !!run;
      el.classList.toggle("running", running);
      el.classList.toggle("beat", mode === "beat");
      fset.hidden = running;
      frun.hidden = !running;
      for (const box of tempoBoxes) box.hidden = mode !== "beat";
      showTempo();
      phonesBtn.setAttribute("aria-checked", String(settings.headphones));
      phonesHint.textContent = !settings.headphones
        ? "Ohne bleibt die Melodie aus, sonst hörte das Mikrofon mit."
        : mode === "beat"
          ? "Die Melodie spielt leise mit."
          : "Nach einem falschen Ton klingt leise der richtige.";
      const sec = host.section();
      selBox.hidden = !sec;
      selText.innerHTML = sec ? `${barRangeText(sec)}<span class="gw"> gewählt</span>` : "";
      goText.textContent = sec ? `${barRangeText(sec)} mitspielen` : "Mitspielen";
      renderMeta();
      renderCal();
    }
    host.changed();
  };

  /** Zeilen unter dem großen Knopf: Flöte, Verzögerung (Takt-Modus), Diagnose */
  const renderMeta = () => {
    const fl = activeFlute(ctx.data);
    const vals = Object.values(fl.offsets);
    const name = `<a href="#/einstellungen" data-testid="flute-name">${esc(fl.name)}</a>`;
    if (!vals.length) {
      fluteLine.innerHTML = `Flöte: ${name} · Tipp: <a href="#/floete">Flöte einstellen</a>, dann wird genauer gewertet.`;
    } else {
      const med = Math.round(fallbackOffset(fl.offsets) / 5) * 5;
      fluteLine.innerHTML =
        Math.abs(med) >= FLUTE_NOTE_CENTS
          ? `Flöte: ${name} · etwa ${Math.abs(med)} Cent ${med < 0 ? "tief" : "hoch"}, wird ausgeglichen`
          : `Flöte: ${name} · eingestellt`;
    }
    const lat = inputLatency(settings);
    latLine.hidden = mode !== "beat";
    latLine.innerHTML =
      `Verzögerung ${lat.ms} ms ` +
      (lat.calibrated ? "" : settings.headphones ? "<span class=\"warn\">· mit Kopfhörern noch nicht abgeglichen</span> " : "(Standard) ") +
      `· <button class="clear" data-act="lat-open">${lat.calibrated ? "ändern" : "abgleichen"}</button>`;
    diagBtn.hidden = !diag.available;
    diagBtn.textContent = diagMsg || "Diagnose speichern";
    (latLine.parentElement as HTMLElement).hidden = latLine.hidden && diagBtn.hidden;
  };

  /** Abgleich-Feld zeichnen */
  const renderCal = () => {
    const open = active && !!cal;
    fcal.hidden = !open;
    if (!cal) return;
    fset.hidden = true;
    frun.hidden = true;
    const which = cal.which;
    fcalFor.textContent = which === "headphones" ? "mit Kopfhörern" : "ohne Kopfhörer";
    const lat = inputLatency({ ...settings, headphones: which === "headphones" });
    fcalVal.textContent = `${lat.ms} ms`;
    for (const b of fcalVals.querySelectorAll<HTMLButtonElement>("[data-lat]")) {
      const d = Number(b.dataset.lat);
      b.disabled = d < 0 ? lat.ms <= LATENCY_MIN : lat.ms >= LATENCY_MAX;
    }
    (fcalVals.querySelector('[data-act="lat-default"]') as HTMLElement).hidden = !lat.calibrated;
    fcalVals.hidden = cal.state === "running";
    fcalDots.hidden = cal.state !== "running";
    latStart.hidden = cal.state === "running";
    latClose.textContent = cal.state === "running" ? "Abbrechen" : "Fertig";
    latStart.textContent = cal.state === "intro" ? "Abgleich starten" : "Nochmal";
    if (cal.state === "running") {
      fcalDots.innerHTML = Array.from(
        { length: CAL_CLICKS },
        (_, k) => `<i class="${cal!.hits?.[k] ? "hit" : k < (cal!.passed ?? 0) ? "on" : ""}"></i>`,
      ).join("");
    }
    if (cal.state === "intro") {
      fcalText.textContent =
        "Nach vier Klicks zum Einzählen klickt es acht Mal. Spiel zu jedem Klick einen kurzen Ton – egal welchen." +
        (lat.calibrated ? "" : " Bis dahin gilt ein Standardwert.");
    } else if (cal.state === "result") {
      fcalText.textContent = cal.ok
        ? `${which === "headphones" ? "Mit Kopfhörern hört" : "Dein Handy hört"} etwa ${lat.ms} ms verzögert. Mit + und − kannst du den Wert fein einstellen.`
        : "Das hat nicht geklappt – es kamen zu wenige Töne passend zu den Klicks. Spiel zu jedem Klick einen kurzen, deutlichen Ton.";
    }
  };

  const setStatus = (text: string) => {
    fstat.textContent = text;
  };

  // ------------------------------------------------------------ Lauf
  /** Lauf beenden: Mikrofon und Klicks aus; die Farben bleiben stehen */
  const finishRun = () => {
    const r = run;
    if (!r) return;
    token++;
    run = null;
    r.unlisten?.();
    if (diag.recording) {
      diag.end({ t: diag.rel(performance.now()), mic: mic.info(), tuning: r.tuning ? { ...r.tuning.values } : null });
    }
    diagMsg = "";
    if (songPlayer.playing) songPlayer.stop();
    else songPlayer.idle();
    mic.stop();
    host.setCur([]);
    host.playhead(null, null);
    showCount(null);
    fwrong.textContent = "";
    shownMidi = undefined;
    render();
  };

  /** Stopp/Hintergrund: Gespieltes bleibt gefärbt, die offene Note wird nicht gewertet */
  const stopRun = () => {
    if (cal?.state === "running") stopCal(false);
    const r = run;
    if (!r) return;
    if (r.beat) {
      if (songPlayer.playing) songPlayer.stop();
      r.beat.finish(performance.now());
    } else if (r.wait) {
      // die Note, auf die noch gewartet wurde, ist nicht gewertet: kein Rot stehen lassen
      const open = r.tl.tones[r.wait.index];
      if (open && r.wait.wrongMidi !== null) host.paint(open.ids, null);
    }
    finishRun();
  };

  /** Abweichungen der aktiven Flöte für einen Durchgang (werden darin nachgeführt) */
  const startTuning = (r: NonNullable<typeof run>) => {
    const t = new LiveTuning(activeFlute(ctx.data).offsets);
    r.tuning = t;
    return t;
  };

  /**
   * Nach einem *vollständigen* Durchgang die nachgeführten Werte (Töne mit mindestens 10 Messungen) in die
   * aktive Flöte übernehmen. Nur dann: Ein abgebrochener Versuch (oft gerade, weil es nicht klappte) soll
   * das Profil nicht verschieben. Die Schritte sind klein und je Durchgang begrenzt (LiveTuning).
   */
  const saveTuning = (t: LiveTuning) => {
    const ch = t.changes();
    if (!Object.keys(ch).length) return;
    const fl = activeFlute(ctx.data);
    Object.assign(fl.offsets, ch);
    fl.updated = Date.now();
    ctx.save();
  };

  /** Ausgabe-Uhr des Abspielers (für die Diagnose) */
  const outputInfo = () => {
    const ac = songPlayer.context;
    if (!ac) return null;
    const ts = typeof ac.getOutputTimestamp === "function" ? ac.getOutputTimestamp() : null;
    const now = performance.now();
    return {
      sampleRate: ac.sampleRate,
      baseLatency: ac.baseLatency,
      outputLatency: ac.outputLatency,
      currentTime: ac.currentTime,
      outputTimestamp: ts ? { contextTime: ts.contextTime, performanceTime: ts.performanceTime } : null,
      perfNow: now,
      outputClock: outputClock(ac, now),
    };
  };

  /** Diagnose-Aufnahme für einen Durchgang beginnen (nur Messwerte) */
  const beginDiag = (kind: "warten" | "takt" | "abgleich", t0: number, tl: Timeline | null, beat: { startMs: number; spq: number } | null) => {
    const fl = activeFlute(ctx.data);
    const lat = inputLatency(settings);
    const sec = host.section();
    diag.begin(kind, t0, {
      song: song.title,
      songId: song.id,
      section: sec ? barRangeText(sec) : null,
      percent: host.percent(),
      tuningHz: settings.tuningHz,
      headphones: settings.headphones,
      latencyMs: lat.ms,
      latencyCalibrated: lat.calibrated,
      flute: { name: fl.name, offsets: { ...fl.offsets } },
      minClarity: DEFAULT_FOLLOW.minClarity,
      startMs: beat ? diag.rel(beat.startMs) : null,
      spq: beat?.spq ?? null,
      tones: tl
        ? tl.tones.map((n) => ({
            midi: n.midi,
            start: n.start,
            dur: n.dur,
            ...(beat ? { fromMs: Math.round(beat.startMs - t0 + n.start * beat.spq * 1000), toMs: Math.round(beat.startMs - t0 + (n.start + n.dur) * beat.spq * 1000) } : {}),
          }))
        : [],
      mic: mic.info(),
      output: outputInfo(),
      userAgent: navigator.userAgent,
      screen: { w: screen.width, h: screen.height, dpr: devicePixelRatio },
    });
    diag.setMeta({ t0perf: t0 });
  };

  const beginWait = (tl: Timeline, my: number) => {
    const r = run!;
    const ok = () => my === token && run === r;
    /** Markierung und Balken auf die Note, auf die gewartet wird */
    const markAt = (i: number) => {
      host.setCur(tl.tones[i].ids);
      host.playhead(tl, tl.tones[i].start);
    };
    const tuning = startTuning(r);
    const w = new WaitFollower(tl, {
      cfg: followConfig(settings),
      tuning,
      onFrame: (j) => diag.judged(j),
      onNote: (i, nr) => {
        if (!ok()) return;
        diag.event(performance.now(), "note", { i, midi: tl.tones[i].midi, ...nr });
        host.paint(tl.tones[i].ids, nr.ok ? "hit" : "miss");
        fwrong.textContent = "";
        fwrong.classList.remove("hint");
        if (w.index < tl.tones.length) {
          markAt(w.index);
          showTone(w.index);
          host.scrollTo(tl.tones[w.index].bar);
        }
      },
      onWrong: (i, midi) => {
        if (!ok()) return;
        diag.event(performance.now(), "falsch", { i, midi: tl.tones[i].midi, wrongMidi: midi });
        host.paint(tl.tones[i].ids, "miss");
        fwrong.classList.remove("hint");
        fwrong.innerHTML = `Du spielst ${midiNameHtml(midi)}`;
        if (settings.headphones) {
          songPlayer.play(singleTone(tl.tones[i].midi), {
            secPerQuarter: PREVIEW_SEC,
            a4: settings.tuningHz,
            countIn: false,
            melody: PREVIEW_VOL,
          });
        }
      },
      onOctave: (i) => {
        if (!ok()) return;
        diag.event(performance.now(), "oktave", { i, midi: tl.tones[i].midi });
        if (w.wrongMidi !== null) return;
        fwrong.classList.add("hint");
        fwrong.textContent = "eine Oktave zu hoch – sanfter blasen";
      },
      onPass: () => {
        if (!ok()) return;
        saveTuning(tuning);
        finishRun();
      },
    });
    r.wait = w;
    const t0 = performance.now();
    w.arm(t0);
    beginDiag("warten", t0, tl, null);
    r.unlisten = mic.listen((f) => {
      if (!ok()) return;
      diag.frame(f);
      w.push(f);
    });
    markAt(0);
    showTone(0);
    host.scrollTo(tl.tones[0].bar, true);
    setStatus("");
  };

  const beginBeat = (tl: Timeline, my: number) => {
    const r = run!;
    const ok = () => my === token && run === r;
    const spq = secPerQuarter(song, host.percent());
    songPlayer.play(tl, {
      secPerQuarter: spq,
      a4: settings.tuningHz,
      countIn: true,
      metronome: true,
      melody: settings.headphones ? MELODY_VOL : false,
      onPosition: (p) => {
        if (!ok()) return;
        showCount(p.countIn);
        const tone = p.tone != null ? tl.tones[p.tone] : null;
        host.setCur(tone ? tone.ids : []);
        if (p.tone != null) showTone(p.tone);
        if (p.bar != null) {
          host.scrollTo(tl.bars[p.bar].index);
          setStatus(`Takt ${tl.bars[p.bar].index + 1}`);
        } else if (p.countIn != null && tl.bars.length) host.scrollTo(tl.bars[0].index, true);
      },
      onFrame: (p) => {
        if (ok()) host.playhead(tl, p.quarter);
      },
      onEnd: () => {
        if (!ok()) return;
        const s = b.finish(performance.now());
        if (s?.complete) saveTuning(tuning);
        finishRun();
      },
    });
    const startMs = heardAt(songPlayer.context!, songPlayer.timelineStart!);
    const tuning = startTuning(r);
    const b = new BeatFollower(tl, {
      secPerQuarter: spq,
      startMs,
      cfg: followConfig(settings),
      tuning,
      onFrame: (j) => diag.judged(j),
      onNote: (i, nr) => {
        if (!ok()) return;
        diag.event(performance.now(), "note", { i, midi: tl.tones[i].midi, ...nr });
        host.paint(tl.tones[i].ids, nr.ok ? "hit" : "miss");
      },
    });
    r.beat = b;
    r.startMs = startMs;
    beginDiag("takt", performance.now(), tl, { startMs, spq });
    r.unlisten = mic.listen((f) => {
      if (!ok()) return;
      diag.frame(f);
      b.push(f);
    });
    showTone(0);
    setStatus("");
  };

  const startRun = () => {
    if (run || cal?.state === "running") return;
    cal = null;
    const sec = host.section();
    const tl = sec ? sectionTimeline(song, sec.from, sec.to) : host.full;
    if (!tl.tones.length) {
      host.clearPaint();
      selText.textContent = "In dieser Auswahl gibt es keine Note.";
      return;
    }
    const my = ++token;
    run = { tl, started: false, startMs: null };
    host.clearPaint();
    host.setCur([]);
    shownMidi = undefined;
    showNote(null);
    // AudioContext direkt aus dem Tippen heraus (Klicks bzw. Zielton mit Kopfhörern)
    if (mode === "beat" || settings.headphones) songPlayer.prepare();
    render();
    setStatus("Mikrofon wird eingeschaltet …");
    keepAwake(true);
    mic
      .start()
      .then(() => {
        if (my !== token || !run) return;
        run.started = true;
        if (mode === "beat") beginBeat(tl, my);
        else beginWait(tl, my);
      })
      .catch((e) => {
        if (my !== token) return;
        finishRun();
        ctx.micError = String(e);
        const back = `#/lied/${encodeURIComponent(song.id)}`;
        ctx.micRetry = () =>
          mic.start().then(() => {
            reopenFollow = song.id;
            ctx.go(back);
          });
        ctx.go("#/mikrofon");
      });
  };

  // ------------------------------------------------------------ Verzögerung abgleichen
  /** Zeitplan des Abgleichs: vier Klicks Einzählen, dann zwei Takte zu vier Klicks, keine Töne */
  const calTimeline = (): Timeline => ({
    tones: [],
    bars: [0, 1].map((k) => ({ index: k, start: 4 * k, dur: 4, beats: [0, 1, 2, 3] })),
    total: 2 * CAL_COUNT_IN,
    countIn: [0, 1, 2, 3],
    countInDur: CAL_COUNT_IN,
    countInBeats: CAL_COUNT_IN,
  });

  const openCal = () => {
    if (run) return;
    cal = { state: "intro", which: settings.headphones ? "headphones" : "speaker" };
    render();
  };

  const closeCal = () => {
    if (cal?.state === "running") stopCal(false);
    cal = null;
    render();
  };

  const setLatency = (which: "speaker" | "headphones", v: number | null) => {
    settings.inputLatencyMs[which] = v;
    ctx.save();
  };

  const startCal = () => {
    if (!cal || run || cal.state === "running") return;
    const which = settings.headphones ? "headphones" : "speaker";
    const my = ++token;
    const c: NonNullable<typeof cal> = { state: "running", which, hits: [], passed: 0 };
    cal = c;
    // AudioContext direkt aus dem Tippen heraus
    songPlayer.prepare();
    keepAwake(true);
    render();
    fcalText.textContent = "Mikrofon wird eingeschaltet …";
    mic
      .start()
      .then(() => {
        if (my !== token || cal !== c) return;
        songPlayer.play(calTimeline(), {
          secPerQuarter: CAL_SPQ,
          a4: settings.tuningHz,
          countIn: true,
          metronome: true,
          melody: false,
          onPosition: (p) => {
            if (my !== token || cal !== c) return;
            fcalText.textContent = p.countIn != null ? `Einzählen … ${p.countIn}` : "Spiel zu jedem Klick einen kurzen Ton.";
          },
          onFrame: (p) => {
            if (my !== token || cal !== c) return;
            const passed = p.quarter < 0 ? 0 : Math.min(CAL_CLICKS, Math.floor(p.quarter) + 1);
            if (passed !== c.passed) {
              c.passed = passed;
              renderCal();
            }
          },
          onEnd: () => {
            // die Antwort auf den letzten Klick (bis 450 ms danach) noch abwarten
            if (my === token && cal === c) c.timer = window.setTimeout(() => stopCal(true), 500);
          },
        });
        const ac = songPlayer.context!;
        const t0 = songPlayer.timelineStart!;
        c.clicks = Array.from({ length: CAL_CLICKS }, (_, k) => heardAt(ac, t0 + k * CAL_SPQ));
        const det = new OnsetDetector(DEFAULT_LATENCY, { tuning: settings.tuningHz });
        c.det = det;
        beginDiag("abgleich", performance.now(), null, null);
        diag.setMeta({ clicks: c.clicks.map((x) => diag.rel(x)), which, spq: CAL_SPQ });
        c.unlisten = mic.listen((f) => {
          if (my !== token || cal !== c) return;
          diag.frame(f);
          const n = det.onsets.length;
          det.push(f);
          for (const o of det.onsets.slice(n)) {
            diag.event(o, "einsatz");
            const k = c.clicks!.findIndex((t, i) => !c.hits![i] && o >= t - DEFAULT_LATENCY.before && o <= t + DEFAULT_LATENCY.after);
            if (k >= 0) {
              c.hits![k] = true;
              renderCal();
            }
          }
        });
      })
      .catch((e) => {
        if (my !== token) return;
        cal = null;
        render();
        ctx.micError = String(e);
        ctx.micRetry = () => mic.start().then(() => ctx.go(`#/lied/${encodeURIComponent(song.id)}`));
        ctx.go("#/mikrofon");
      });
  };

  /** Abgleich beenden: done = Klicks vorbei, auswerten; sonst abgebrochen */
  const stopCal = (done: boolean) => {
    const c = cal;
    if (!c || c.state !== "running") return;
    token++;
    if (c.timer) window.clearTimeout(c.timer);
    c.unlisten?.();
    if (songPlayer.playing) songPlayer.stop();
    else songPlayer.idle();
    const micInfo = mic.info();
    mic.stop();
    if (done && c.det && c.clicks) {
      c.det.flush();
      const res = latencyFromOnsets(c.clicks, c.det.onsets);
      diag.event(performance.now(), "ergebnis", { ...res, which: c.which });
      if (res.ok) setLatency(c.which, res.ms);
      cal = { state: "result", which: c.which, ok: res.ok };
    } else {
      cal = { state: "intro", which: c.which };
    }
    diag.end({ t: diag.rel(performance.now()), mic: micInfo, done });
    render();
  };

  // ------------------------------------------------------------ Bedienung
  el.addEventListener("click", (e) => {
    if ((e.target as Element).closest?.('[data-act="lat-open"]')) openCal();
  });
  latStart.addEventListener("click", () => startCal());
  latClose.addEventListener("click", () => closeCal());
  for (const b of fcalVals.querySelectorAll<HTMLButtonElement>("[data-lat]")) {
    b.addEventListener("click", () => {
      if (!cal) return;
      const which = cal.which;
      const cur = inputLatency({ ...settings, headphones: which === "headphones" }).ms;
      setLatency(which, Math.max(LATENCY_MIN, Math.min(LATENCY_MAX, cur + Number(b.dataset.lat) * LATENCY_STEP)));
      render();
    });
  }
  q<HTMLButtonElement>('[data-act="lat-default"]').addEventListener("click", () => {
    if (!cal) return;
    setLatency(cal.which, null);
    render();
  });
  diagBtn.addEventListener("click", () => {
    if (!diag.available) return;
    offerDiag(diag.json())
      .then((r) => {
        diagMsg = r === "geteilt" ? "Diagnose geteilt" : r === "heruntergeladen" ? "Diagnose gespeichert" : "";
        if (active) renderMeta();
      })
      .catch(() => {});
  });
  for (const b of modeBtns) {
    b.addEventListener("click", () => {
      if (run) return;
      mode = b.dataset.mode as FollowMode;
      settings.followMode = mode;
      ctx.save();
      render();
    });
  }
  phonesBtn.addEventListener("click", () => {
    if (run || cal?.state === "running") return;
    settings.headphones = !settings.headphones;
    ctx.save();
    render();
  });
  goBtn.addEventListener("click", () => startRun());
  q<HTMLButtonElement>('[data-act="fstop"]').addEventListener("click", () => stopRun());
  q<HTMLButtonElement>('[data-act="fclear"]').addEventListener("click", () => host.clearSection());
  for (const box of tempoBoxes) {
    box.addEventListener("click", (e) => {
      const btn = (e.target as Element).closest?.("button[data-dir]") as HTMLButtonElement | null;
      if (!btn) return;
      const p = clampPercent(host.percent() + Number(btn.dataset.dir) * TEMPO_STEP);
      if (p === host.percent()) return;
      host.setPercent(p, true);
      showTempo();
      const r = run;
      if (r?.beat) {
        const spq = secPerQuarter(song, p);
        const at = songPlayer.setTempo(spq);
        const ac = songPlayer.context;
        if (at != null && ac) r.beat.setTempo(spq, heardAt(ac, at));
      }
    });
  }

  const api: Follow = {
    get active() {
      return active;
    },
    get running() {
      return !!run || cal?.state === "running";
    },
    enter() {
      if (active) return;
      active = true;
      keepAwake(true);
      render();
    },
    exit() {
      if (!active) return;
      if (cal?.state === "running") stopCal(false);
      cal = null;
      if (run) finishRun();
      mic.stop();
      active = false;
      host.clearPaint();
      host.setCur([]);
      host.playhead(null, null);
      keepAwake(false);
      render();
    },
    stopRun,
    refresh() {
      if (active) render();
    },
    destroy() {
      if (cal?.state === "running") stopCal(false);
      cal = null;
      if (run) finishRun();
      mic.stop();
      if (active) keepAwake(false);
      active = false;
    },
    debug: () => ({
      active,
      mode,
      running: !!run,
      started: !!run?.started,
      timeline: run?.tl ?? null,
      index: run?.wait?.index ?? null,
      startMs: run?.startMs ?? null,
      latency: inputLatency(settings),
      cal: cal ? { state: cal.state, which: cal.which, ok: cal.ok ?? null, clicks: cal.clicks ?? null, onsets: cal.det?.onsets ?? null } : null,
      diag: diag.available,
      tuning: run?.tuning ? { ...run.tuning.values } : null,
    }),
  };

  if (reopenFollow === song.id) {
    reopenFollow = null;
    api.enter();
  }
  return api;
}
