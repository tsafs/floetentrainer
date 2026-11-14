// Mitspielen mit Mikrofon auf der Liedseite (docs/app-lieder.md, Runde 3 und Nachsteuerung vom 14.11.2026).
//
// Eine der beiden Arten der Liedseite (Umschalter „Anhören | Mitspielen“ oben, siehe ./songs.ts). Die
// Bedienleiste zeigt zum Einstellen die Wahl „Wartet auf mich | Im Takt“ (letzte Wahl gemerkt), den
// Schalter „Ich trage Kopfhörer“, im Takt-Modus das Tempo und darunter den großen Knopf „Mitspielen“
// (mit Auswahl „Takt 5–7 mitspielen“). Gewählte Takte (Auswahl, siehe ./songs.ts) werden einmal gespielt,
// ohne Auswahl das ganze Lied. Während des Spielens ist die Leiste knapp: Griffbild, Stopp, ggf. Tempo.
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
// Mikrofon und AudioContext starten erst beim Tippen auf „Mitspielen“; nach dem Durchgang, beim Stopp,
// beim Wechsel in den Hintergrund und beim Verlassen der Seite gehen Mikrofon und Klicks wieder aus.
// Die Lernspuren bleiben unberührt; gespeichert werden nur Art, Kopfhörer und Tempo.

import { BeatFollower, followConfig, WaitFollower } from "../audio/follow";
import { keepAwake, mic } from "../audio/mic";
import { heardAtPerf, songPlayer } from "../audio/song-player";
import { fluteSvg } from "../music/flute";
import { midiNameHtml, nameHtml, nameText } from "../music/names";
import { chartNoteByMidi } from "../music/notes";
import type { NoteEvent, Song } from "../songs/model";
import { clampPercent, secPerQuarter, TEMPO_MAX, TEMPO_MIN } from "../songs/tempo";
import { sectionTimeline, type Timeline } from "../songs/timeline";
import type { FollowMode } from "../store/data";
import type { Ctx } from "./common";

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
  `<span class="tv"><small>Tempo</small><output data-testid="follow-tempo"></output></span>` +
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
        <div class="fopts">
          <div class="fphones">
            <button class="switch" role="switch" aria-checked="false" aria-labelledby="fphones-lab" data-act="phones"><i></i></button>
            <span class="lab" id="fphones-lab">Ich trage Kopfhörer<small data-testid="phones-hint"></small></span>
          </div>
          ${tempoStepHtml("fset-tempo")}
        </div>
        <button class="big fgo" data-act="fstart">${ICON_PLAY_SM}<span data-testid="follow-go">Mitspielen</span></button>
      </div>
      <div class="frun" hidden>
        <div class="ffl" data-testid="follow-flute"></div>
        <div class="finfo">
          <span class="pname" data-testid="follow-note"></span>
          <span class="pcount" data-testid="follow-count" hidden></span>
          <span class="fwrong" data-testid="follow-wrong" aria-live="polite"></span>
          <span class="pstat" data-testid="follow-status" aria-live="polite"></span>
        </div>
        <button class="playbtn on" data-act="fstop" aria-label="Stopp">${ICON_STOP}</button>
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
  const fl = q<HTMLElement>(".ffl");
  const fname = q<HTMLElement>('[data-testid="follow-note"]');
  const fcount = q<HTMLElement>('[data-testid="follow-count"]');
  const fwrong = q<HTMLElement>(".fwrong");
  const fstat = q<HTMLElement>('[data-testid="follow-status"]');
  const goBtn = q<HTMLButtonElement>('[data-act="fstart"]');
  const goText = q<HTMLElement>('[data-testid="follow-go"]');
  const tempoBoxes = [...el.querySelectorAll<HTMLElement>(".tstep")];

  let active = false;
  let mode: FollowMode = settings.followMode;
  /** Zähler der Durchläufe: Rückrufe eines beendeten Laufs werden ignoriert */
  let token = 0;
  let run: {
    tl: Timeline;
    wait?: WaitFollower;
    beat?: BeatFollower;
    unlisten?: () => void;
    started: boolean;
    /** Takt-Modus: Beginn des Zeitplans (ms, Uhr der Frames) */
    startMs: number | null;
  } | null = null;
  let shownMidi: number | null | undefined;

  // ------------------------------------------------------------ Anzeige
  const showNote = (midi: number | null, id?: string) => {
    if (midi === shownMidi) return;
    shownMidi = midi;
    const chart = midi == null ? undefined : chartNoteByMidi(midi);
    fl.classList.toggle("none", !chart);
    fl.innerHTML = chart ? fluteSvg(chart.fingering, `Griffbild ${nameText(chart.id)}`) : "";
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
        ? "Sonst bleibt die Melodie aus – das Mikrofon hörte das Handy mit."
        : mode === "beat"
          ? "Die Melodie spielt leise mit."
          : "Bei falschem Ton erklingt leise der richtige.";
      const sec = host.section();
      selBox.hidden = !sec;
      selText.textContent = sec ? `${barRangeText(sec)} gewählt` : "";
      goText.textContent = sec ? `${barRangeText(sec)} mitspielen` : "Mitspielen";
    }
    host.changed();
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

  const beginWait = (tl: Timeline, my: number) => {
    const r = run!;
    const ok = () => my === token && run === r;
    /** Markierung und Balken auf die Note, auf die gewartet wird */
    const markAt = (i: number) => {
      host.setCur(tl.tones[i].ids);
      host.playhead(tl, tl.tones[i].start);
    };
    const w = new WaitFollower(tl, {
      cfg: followConfig(settings),
      onNote: (i, nr) => {
        if (!ok()) return;
        host.paint(tl.tones[i].ids, nr.ok ? "hit" : "miss");
        fwrong.textContent = "";
        if (w.index < tl.tones.length) {
          markAt(w.index);
          showTone(w.index);
          host.scrollTo(tl.tones[w.index].bar);
        }
      },
      onWrong: (i, midi) => {
        if (!ok()) return;
        host.paint(tl.tones[i].ids, "miss");
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
      onPass: () => {
        if (ok()) finishRun();
      },
    });
    r.wait = w;
    w.arm(performance.now());
    r.unlisten = mic.listen((f) => {
      if (ok()) w.push(f);
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
        b.finish(performance.now());
        finishRun();
      },
    });
    const startMs = heardAt(songPlayer.context!, songPlayer.timelineStart!);
    const b = new BeatFollower(tl, {
      secPerQuarter: spq,
      startMs,
      cfg: followConfig(settings),
      onNote: (i, nr) => {
        if (ok()) host.paint(tl.tones[i].ids, nr.ok ? "hit" : "miss");
      },
    });
    r.beat = b;
    r.startMs = startMs;
    r.unlisten = mic.listen((f) => {
      if (ok()) b.push(f);
    });
    showTone(0);
    setStatus("");
  };

  const startRun = () => {
    if (run) return;
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

  // ------------------------------------------------------------ Bedienung
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
      return !!run;
    },
    enter() {
      if (active) return;
      active = true;
      keepAwake(true);
      render();
    },
    exit() {
      if (!active) return;
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
    }),
  };

  if (reopenFollow === song.id) {
    reopenFollow = null;
    api.enter();
  }
  return api;
}
