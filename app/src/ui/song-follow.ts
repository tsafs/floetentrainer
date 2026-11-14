// Mitspielen mit Mikrofon auf der Liedseite (docs/app-lieder.md, Runde 3).
//
// Ein eigener Zustand der Liedseite: Die Bedienleiste zeigt dann die Wahl Warte-Modus / Takt-Modus
// (letzte Wahl gemerkt), den Schalter „Ich trage Kopfhörer“, Start/Stopp, im Takt-Modus das Tempo und
// „Mitspielen beenden“. Vorspielen ist währenddessen aus. Ein gewählter Abschnitt gilt auch hier
// (in Schleife, jeder Durchgang einzeln gewertet).
//
// Die Wertung selbst steckt in ../audio/follow.ts; hier nur Mikrofon, Abspieler und Anzeige:
// - Warte-Modus: Markierung auf der Note, auf die gewartet wird; grün/rot, sobald sie getroffen ist
//   (rot schon beim ersten falschen Ton, dazu dezent „Du spielst a¹“). Es erklingt nichts – mit
//   Kopfhörern bei einem falschen Ton kurz und leise der richtige (siehe PREVIEW_VOL).
// - Takt-Modus: Der Abspieler zählt ein und klickt leise im Tempo, ohne Melodie (mit Kopfhörern leise
//   mit Melodie); die Markierung läuft mit, jede Note wird nach ihrem Ende grün oder rot.
// Mikrofon und AudioContext starten erst beim Tippen auf Start; nach jedem Durchgang, beim Stopp, beim
// Wechsel in den Hintergrund und beim Verlassen der Seite gehen Mikrofon und Klicks wieder aus.
// Die Lernspuren bleiben unberührt: Gespeichert wird nur der Bestwert je Lied und Art.

import { BeatFollower, followConfig, WaitFollower, type FollowSummary } from "../audio/follow";
import { keepAwake, mic } from "../audio/mic";
import { songPlayer, type PlayerPosition } from "../audio/song-player";
import { fluteSvg } from "../music/flute";
import { midiNameHtml, nameHtml, nameText } from "../music/names";
import { chartNoteByMidi } from "../music/notes";
import type { NoteEvent, Song } from "../songs/model";
import { clampPercent, secPerQuarter, TEMPO_MAX, TEMPO_MIN } from "../songs/tempo";
import { sectionTimeline, type Timeline } from "../songs/timeline";
import { recordBest, type BestScore, type FollowMode } from "../store/data";
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

const ICON_PLAY = `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><path d="M8.5 5.2v15.6L21 13z"/></svg>`;
const ICON_STOP = `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><rect x="7" y="7" width="12" height="12" rx="1.6"/></svg>`;
export const ICON_MIC = `<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="2.2" width="6" height="10.2" rx="3" fill="none" stroke-width="1.4"/><path d="M4.3 9.6a5.7 5.7 0 0 0 11.4 0M10 15.3v2.6M7.2 17.9h5.6" fill="none" stroke-width="1.4" stroke-linecap="round"/></svg>`;

const MODE_LABEL: Record<FollowMode, string> = { wait: "Warte-Modus", beat: "Takt-Modus" };
const MODE_EXPL: Record<FollowMode, string> = {
  wait: "Die Markierung wartet auf jede Note und geht weiter, sobald du sie triffst. Spiel in deinem Tempo.",
  beat: "Nach dem Einzählen läuft die Markierung im Tempo mit, leise Klicks geben den Takt.",
};

export interface FollowHost {
  ctx: Ctx;
  song: Song;
  /** Zeitplan des ganzen Lieds */
  full: Timeline;
  noteById: Map<number, NoteEvent>;
  /** gewählter Abschnitt (Takt-Indizes im Notenbild) oder null */
  section(): { from: number; to: number } | null;
  /** Abschnitt wählen (schwierigen Takt angetippt) bzw. aufheben */
  setSection(s: { from: number; to: number } | null): void;
  percent(): number;
  setPercent(p: number, save: boolean): void;
  setCur(ids: number[]): void;
  /** Noten grün (hit), rot (miss) oder wieder schwarz (null) färben */
  paint(ids: number[], cls: "hit" | "miss" | null): void;
  clearPaint(): void;
  /** Zeile des Takts sichtbar halten */
  scrollTo(barIndex: number, force?: boolean): void;
  /** Mitspielen an/aus bzw. Start/Stopp: die Seite passt Hinweis und Taktauswahl an */
  changed(): void;
}

/** HTML der Bedienleiste fürs Mitspielen (in .player, neben der Leiste fürs Vorspielen) */
export function followBarHtml(): string {
  return `
    <div class="fpin" data-testid="follow" hidden>
      <div class="fset">
        <div class="seg fmode" role="group" aria-label="Art des Mitspielens">
          <button data-mode="wait" aria-pressed="false">${MODE_LABEL.wait}</button><button data-mode="beat" aria-pressed="false">${MODE_LABEL.beat}</button>
        </div>
        <p class="fexpl" data-testid="follow-expl"></p>
        <div class="fres" data-testid="follow-result" role="status" hidden></div>
        <p class="fbest" data-testid="follow-best"></p>
        <div class="fphones">
          <span class="lab" id="fphones-lab">Ich trage Kopfhörer<small data-testid="phones-hint"></small></span>
          <button class="switch" role="switch" aria-checked="false" aria-labelledby="fphones-lab" data-act="phones"><i></i></button>
        </div>
      </div>
      <div class="frun">
        <div class="ffl" data-testid="follow-flute"></div>
        <div class="finfo">
          <span class="pname" data-testid="follow-note"></span>
          <span class="pcount" data-testid="follow-count" hidden></span>
          <span class="fwrong" data-testid="follow-wrong" aria-live="polite"></span>
          <span class="pstat" data-testid="follow-status" aria-live="polite"></span>
        </div>
      </div>
      <div class="fctl">
        <button class="playbtn" data-act="fstart" aria-label="Start">${ICON_PLAY}</button>
        <label class="tempo ftempo">
          <span class="tl">Tempo <output data-testid="follow-tempo"></output></span>
          <input type="range" min="${TEMPO_MIN}" max="${TEMPO_MAX}" step="5" aria-label="Tempo in Prozent des Grundtempos" data-testid="follow-tempo-range">
        </label>
        <span class="fgo" data-testid="follow-go"></span>
      </div>
      <div class="ffoot">
        <button class="clear" data-act="fexit">Mitspielen beenden</button>
        <button class="clear" data-act="fclear" hidden>Schleife aufheben</button>
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

/** Ergebnis-Text, z. B. „42 von 48 Noten getroffen“ */
function scoreText(s: FollowSummary): string {
  return `<b>${s.hits} von ${s.total}</b> ${s.total === 1 ? "Note" : "Noten"} getroffen`;
}

export interface Follow {
  readonly active: boolean;
  readonly running: boolean;
  enter(): void;
  exit(): void;
  /** laufendes Mitspielen beenden (Stopp, Hintergrund); zeigt die bisherige Auswertung */
  stopRun(): void;
  /** Abschnitt oder Tempo hat sich geändert (Anzeige nachziehen) */
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
  const expl = q<HTMLElement>(".fexpl");
  const res = q<HTMLElement>(".fres");
  const bestEl = q<HTMLElement>(".fbest");
  const phonesBtn = q<HTMLButtonElement>('[data-act="phones"]');
  const phonesHint = q<HTMLElement>('[data-testid="phones-hint"]');
  const fl = q<HTMLElement>(".ffl");
  const fname = q<HTMLElement>('[data-testid="follow-note"]');
  const fcount = q<HTMLElement>('[data-testid="follow-count"]');
  const fwrong = q<HTMLElement>(".fwrong");
  const fstat = q<HTMLElement>('[data-testid="follow-status"]');
  const startBtn = q<HTMLButtonElement>('[data-act="fstart"]');
  const tempoBox = q<HTMLElement>(".ftempo");
  const range = q<HTMLInputElement>(".ftempo input");
  const tempoOut = q<HTMLOutputElement>(".ftempo output");
  const go = q<HTMLElement>(".fgo");
  const clearBtn = q<HTMLButtonElement>('[data-act="fclear"]');

  let active = false;
  let mode: FollowMode = settings.followMode;
  /** Zähler der Durchläufe: Rückrufe eines beendeten Laufs werden ignoriert */
  let token = 0;
  let run: {
    tl: Timeline;
    loop: boolean;
    wait?: WaitFollower;
    beat?: BeatFollower;
    unlisten?: () => void;
    /** Takt-Modus: bis zu diesem Durchgang sind die Farben gelöscht bzw. gültig */
    paintedPass: number;
    donePass: number;
    lastPos: PlayerPosition | null;
    /** Warte-Modus mit Schleife: Farben beim nächsten Ereignis löschen */
    clearNext: boolean;
    started: boolean;
    /** Takt-Modus: Beginn des Zeitplans (ms, Uhr der Frames) */
    startMs: number | null;
    /** Schleife: Notenwertungen des letzten ganzen Durchgangs (zum Wiederherstellen der Farben beim Stopp) */
    lastPass: ({ ok: boolean } | undefined)[] | null;
  } | null = null;
  /** Auswertung des letzten Laufs */
  let result: { s: FollowSummary; label: string; best: "new" | BestScore | null } | null = null;
  let shownMidi: number | null | undefined;

  // ------------------------------------------------------------ Anzeige
  const best = (): BestScore | null => {
    const b = ctx.data.songs[song.id]?.best?.[mode];
    return b && b.total === host.full.tones.length ? b : null;
  };

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

  const sectionText = () => {
    const s = host.section();
    return s ? (s.from === s.to ? `Takt ${s.from + 1}` : `Takt ${s.from + 1}–${s.to + 1}`) : "";
  };

  const showTempo = () => {
    const p = host.percent();
    range.value = String(p);
    tempoOut.textContent = `${p} %`;
  };

  /** Bedienleiste nach Zustand zeichnen */
  const render = () => {
    el.hidden = !active;
    main.classList.toggle("following", active);
    main.classList.toggle("frunning", !!run);
    main.dataset.followMode = mode;
    if (!active) return;
    for (const b of modeBtns) b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
    const running = !!run;
    el.classList.toggle("running", running);
    el.classList.toggle("beat", mode === "beat");
    const fset = q<HTMLElement>(".fset");
    fset.hidden = running;
    fset.scrollTop = 0;
    q<HTMLElement>(".frun").hidden = !running;
    startBtn.innerHTML = running ? ICON_STOP : ICON_PLAY;
    startBtn.setAttribute("aria-label", running ? "Stopp" : "Start");
    startBtn.classList.toggle("on", running);
    tempoBox.hidden = mode !== "beat";
    showTempo();
    // Erklärung oder Auswertung
    if (result) {
      const r = result;
      const hard = r.s.hardestBars.length
        ? `<p class="fhard"><span>Schwierig:</span> ${r.s.hardestBars
            .map((b) => `<button class="barbtn" data-bar="${b.bar}" aria-label="Takt ${b.bar + 1} als Abschnitt üben">Takt ${b.bar + 1}</button>`)
            .join("")}</p>`
        : "";
      res.innerHTML =
        `<p class="fscore">${r.label ? `<span class="flab">${r.label}</span>` : ""}${scoreText(r.s)}</p>` +
        (r.best === "new" ? `<p class="fnew" data-testid="follow-new-best">Neues Bestes!</p>` : "") +
        hard;
      res.hidden = false;
      expl.hidden = true;
    } else {
      res.hidden = true;
      res.innerHTML = "";
      expl.hidden = false;
      expl.textContent = MODE_EXPL[mode];
    }
    const b = best();
    bestEl.textContent = b ? `Bestes im ${MODE_LABEL[mode]}: ${b.hits} von ${b.total}` : "";
    bestEl.hidden = !b;
    // Kopfhörer
    phonesBtn.setAttribute("aria-checked", String(settings.headphones));
    phonesHint.textContent = !settings.headphones
      ? "Ohne Kopfhörer bleibt die Melodie aus, sonst würde das Mikrofon das Handy mithören."
      : mode === "beat"
        ? "Die Melodie spielt leise mit."
        : "Bei einem falschen Ton erklingt leise der richtige.";
    // Abschnitt
    const sec = sectionText();
    clearBtn.hidden = running || !host.section();
    // (im Takt-Modus steht hier das Tempo; der Abschnitt ist im Notenbild hinterlegt)
    go.textContent = running ? "" : sec ? `${sec} in Schleife` : "Start, dann die erste Note spielen";
    host.changed();
  };

  const setStatus = (text: string) => {
    fstat.textContent = text;
  };

  // ------------------------------------------------------------ Lauf
  const finishRun = (s: FollowSummary | null, label = "") => {
    const r = run;
    if (!r) return;
    token++;
    run = null;
    r.unlisten?.();
    if (songPlayer.playing) songPlayer.stop();
    mic.stop();
    host.setCur([]);
    showCount(null);
    fwrong.textContent = "";
    shownMidi = undefined;
    result = null;
    if (s && s.total > 0) {
      let bestState: "new" | BestScore | null = null;
      if (!r.loop) {
        const rec = recordBest(ctx.data, song.id, mode, s, host.full.tones.length, Date.now());
        if (rec.saved) {
          ctx.save();
          bestState = rec.prev ? "new" : null;
        }
      }
      result = { s, label, best: bestState };
    }
    render();
  };

  /** Farben eines ganzen Durchgangs wieder zeigen (Schleife: die Auswertung gilt für ihn) */
  const repaint = (r: NonNullable<typeof run>) => {
    if (!r.lastPass) return;
    host.clearPaint();
    r.lastPass.forEach((x, i) => {
      if (x) host.paint(r.tl.tones[i].ids, x.ok ? "hit" : "miss");
    });
  };

  /** Stopp/Hintergrund: Auswertung des bisher Gespielten (bei Schleife: letzter ganzer Durchgang) */
  const stopRun = () => {
    const r = run;
    if (!r) return;
    const last = `${sectionText()}, letzter Durchgang:`;
    if (r.beat) {
      if (songPlayer.playing) songPlayer.stop();
      const partial = r.beat.finish(performance.now());
      // Schleife: den letzten ganzen Durchgang zeigen (er kann auch eben erst in finish fertig geworden sein)
      const k = r.loop ? r.beat.passes.map((p) => p.complete).lastIndexOf(true) : -1;
      if (k >= 0) {
        r.lastPass = r.beat.passResults[k];
        repaint(r);
        finishRun(r.beat.passes[k], last);
      } else finishRun(partial, partial && !partial.complete ? "Bis hierher:" : "");
    } else if (r.wait) {
      // die Note, auf die noch gewartet wurde, ist nicht gewertet: kein Rot stehen lassen
      const open = r.tl.tones[r.wait.index];
      if (open && r.wait.wrongMidi !== null) host.paint(open.ids, null);
      const done = r.wait.passes.length;
      if (r.loop && done) {
        repaint(r);
        finishRun(r.wait.passes[done - 1], last);
      } else {
        const s = r.wait.summary();
        finishRun(s, s.complete ? "" : "Bis hierher:");
      }
    } else finishRun(null);
  };

  const passDone = (s: FollowSummary, pass: number) => {
    setStatus(`${pass + 1}. Durchgang: ${s.hits} von ${s.total}`);
  };

  const beginWait = (tl: Timeline, loop: boolean, my: number) => {
    const r = run!;
    const ok = () => my === token && run === r;
    const w = new WaitFollower(tl, {
      cfg: followConfig(settings),
      loop,
      onNote: (i, nr) => {
        if (!ok()) return;
        if (r.clearNext) {
          host.clearPaint();
          r.clearNext = false;
        }
        host.paint(tl.tones[i].ids, nr.ok ? "hit" : "miss");
        fwrong.textContent = "";
        if (w.index < tl.tones.length) {
          host.setCur(tl.tones[w.index].ids);
          showTone(w.index);
          host.scrollTo(tl.tones[w.index].bar);
        }
      },
      onWrong: (i, midi) => {
        if (!ok()) return;
        if (r.clearNext) {
          host.clearPaint();
          r.clearNext = false;
          host.setCur(tl.tones[i].ids);
        }
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
      onPass: (s, pass) => {
        if (!ok()) return;
        if (!loop) {
          finishRun(s);
          return;
        }
        passDone(s, pass);
        r.lastPass = [...w.results];
        r.clearNext = true;
        host.setCur(tl.tones[0].ids);
        showTone(0);
        host.scrollTo(tl.tones[0].bar);
      },
    });
    r.wait = w;
    w.arm(performance.now());
    r.unlisten = mic.listen((f) => {
      if (ok()) w.push(f);
    });
    host.setCur(tl.tones[0].ids);
    showTone(0);
    host.scrollTo(tl.tones[0].bar, true);
    setStatus(loop ? `${sectionText()} in Schleife` : "");
  };

  const beginBeat = (tl: Timeline, loop: boolean, my: number) => {
    const r = run!;
    const ok = () => my === token && run === r;
    const spq = secPerQuarter(song, host.percent());
    const clear = () => {
      // Schleife: Farben löschen, sobald der neue Durchgang läuft und der alte fertig gewertet ist
      const p = r.lastPos?.pass ?? 0;
      if (p > r.paintedPass && r.donePass >= p - 1) {
        host.clearPaint();
        r.paintedPass = p;
      }
    };
    songPlayer.play(tl, {
      secPerQuarter: spq,
      a4: settings.tuningHz,
      countIn: true,
      metronome: true,
      loop,
      melody: settings.headphones ? MELODY_VOL : false,
      onPosition: (p) => {
        if (!ok()) return;
        r.lastPos = p;
        showCount(p.countIn);
        const tone = p.tone != null ? tl.tones[p.tone] : null;
        host.setCur(tone ? tone.ids : []);
        if (p.tone != null) showTone(p.tone);
        if (p.bar != null) {
          host.scrollTo(tl.bars[p.bar].index);
          setStatus(`Takt ${tl.bars[p.bar].index + 1}${loop ? ` · ${p.pass + 1}. Durchgang` : ""}`);
        } else if (p.countIn != null && tl.bars.length) host.scrollTo(tl.bars[0].index, true);
        clear();
      },
      onEnd: () => {
        if (!ok()) return;
        finishRun(b.finish(performance.now()));
      },
    });
    const ac = songPlayer.context!;
    const startMs = performance.now() + (songPlayer.timelineStart! - ac.currentTime) * 1000;
    const b = new BeatFollower(tl, {
      secPerQuarter: spq,
      startMs,
      cfg: followConfig(settings),
      loop,
      onNote: (i, nr, pass) => {
        if (!ok() || pass < r.paintedPass) return;
        host.paint(tl.tones[i].ids, nr.ok ? "hit" : "miss");
      },
      onPass: (s, pass) => {
        if (!ok() || !loop) return;
        r.donePass = pass;
        passDone(s, pass);
        clear();
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
      setStatus("In diesem Abschnitt gibt es keine Note.");
      return;
    }
    const my = ++token;
    run = { tl, loop: !!sec, paintedPass: 0, donePass: -1, lastPos: null, clearNext: false, started: false, startMs: null, lastPass: null };
    result = null;
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
        if (mode === "beat") beginBeat(tl, !!sec, my);
        else beginWait(tl, !!sec, my);
      })
      .catch((e) => {
        if (my !== token) return;
        finishRun(null);
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
      result = null;
      host.clearPaint();
      render();
    });
  }
  phonesBtn.addEventListener("click", () => {
    settings.headphones = !settings.headphones;
    ctx.save();
    render();
  });
  startBtn.addEventListener("click", () => {
    if (run) stopRun();
    else startRun();
  });
  q<HTMLElement>('[data-act="fexit"]').addEventListener("click", () => api.exit());
  clearBtn.addEventListener("click", () => host.setSection(null));
  res.addEventListener("click", (e) => {
    const b = (e.target as Element).closest?.("button[data-bar]") as HTMLButtonElement | null;
    if (!b) return;
    const bar = Number(b.dataset.bar);
    host.setSection({ from: bar, to: bar });
    host.scrollTo(bar, true);
  });
  range.addEventListener("input", () => {
    const p = clampPercent(Number(range.value));
    host.setPercent(p, false);
    tempoOut.textContent = `${p} %`;
    const r = run;
    if (r?.beat) {
      const spq = secPerQuarter(song, p);
      const at = songPlayer.setTempo(spq);
      const ac = songPlayer.context;
      if (at != null && ac) r.beat.setTempo(spq, performance.now() + (at - ac.currentTime) * 1000);
    }
  });
  range.addEventListener("change", () => host.setPercent(clampPercent(Number(range.value)), true));

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
      result = null;
      keepAwake(true);
      render();
    },
    exit() {
      if (!active) return;
      if (run) finishRun(null);
      mic.stop();
      active = false;
      result = null;
      host.clearPaint();
      host.setCur([]);
      keepAwake(false);
      render();
    },
    stopRun,
    refresh() {
      if (active) render();
    },
    destroy() {
      if (run) finishRun(null);
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
      result: result?.s ?? null,
    }),
  };

  if (reopenFollow === song.id) {
    reopenFollow = null;
    api.enter();
  }
  return api;
}
