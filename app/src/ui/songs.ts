// Liederliste und Liedseite: Lieder aus dem Heft ansehen und vorspielen lassen.
//
// Bedienung der Liedseite:
// - Abspielen/Stopp, Tempo (50–120 %, je Lied gemerkt), Metronom: in der Bedienleiste (Hochformat
//   unten fest, Querformat rechts). Vor dem Start wird ein Takt eingezählt.
// - Abschnitt wiederholen: einen Takt antippen (Anfang), einen zweiten antippen (Ende) – der Bereich läuft
//   in Schleife. Langes Tippen wählt die ganze Zeile. Tippen bei bestehendem Abschnitt beginnt neu.
//   Wischen (Scrollen) wählt nichts.
// - Mitlaufen: Die klingende Note ist markiert, ein senkrechter Balken läuft gleichmäßig mit
//   (./playhead.ts); die Seite scrollt sanft mit, sobald die aktuelle Zeile aus dem gut sichtbaren
//   Bereich läuft. Scrollt sie selbst, hält das Mitscrollen ein paar Sekunden still.

import { keepAwake } from "../audio/mic";
import { songPlayer, type PlayerPosition } from "../audio/song-player";
import { GLYPHS } from "../music/bravura";
import { fluteSvg } from "../music/flute";
import { nameHtml, nameText } from "../music/names";
import { chartNoteByMidi } from "../music/notes";
import { renderScore, type Score } from "../songs/engrave";
import { chapters, SONGS, songById } from "../songs/library";
import { ownEntries, ownEntryById } from "../songs/own";
import type { NoteEvent, Song, TimeSig } from "../songs/model";
import { missingHtml, playabilityFor } from "../songs/playable";
import { baseTempo, clampPercent, secPerQuarter, TEMPO_MAX, TEMPO_MIN } from "../songs/tempo";
import { buildTimeline, sectionTimeline, type Timeline } from "../songs/timeline";
import { esc, ICON_BACK, type View } from "./common";
import { brokenSongPage, mountOwnBox, takeListNote } from "./own-songs";
import { Playhead } from "./playhead";
import { followBarHtml, ICON_MIC, mountFollow } from "./song-follow";

/** so lange (ms) gilt ein Finger auf dem Takt als langes Tippen */
const LONG_PRESS_MS = 500;
/** so weit (px) darf sich der Finger bewegen, ohne dass es als Wischen gilt */
const TAP_SLOP = 10;
/** nach eigenem Scrollen so lange (ms) nicht mitscrollen */
const USER_SCROLL_PAUSE_MS = 4000;

// ---------------------------------------------------------------- kleine Bausteine

/** Taktart wie „3/4-Takt“ in schlichten Ziffern (ein Garamond-Bruch sähe aus wie „¼“) */
export function timeHtml(t: TimeSig): string {
  return `<span class="ts">${t.num}/${t.den}-Takt</span>`;
}

/** Notenzeichen für die Tempoangabe (♩, ♩. , 𝅗𝅥, ♪) aus Bravura, als kleines Inline-SVG */
export function beatMarkSvg(beat: number): string {
  const half = beat >= 2 - 1e-6;
  const dotted = Math.abs(beat - 1.5) < 1e-6 || Math.abs(beat - 3) < 1e-6;
  const eighth = beat < 1 - 1e-6;
  const head = half ? GLYPHS.half : GLYPHS.black;
  const w = head.x1;
  const sx = w - 0.065;
  let s = `<path d="${head.d}"/>` + `<rect x="${sx - 0.12}" y="-3.3" width="0.12" height="3.12"/>`;
  let right = w + 0.25;
  if (eighth) {
    s += `<path d="${GLYPHS.flag8Up.d}" transform="translate(${sx - 0.06} -3.3)"/>`;
    right = w + 1.15;
  }
  if (dotted) {
    s += `<path d="${GLYPHS.dot.d}" transform="translate(${w + 0.35} -0.25)"/>`;
    right = Math.max(right, w + 0.95);
  }
  const name = half ? "Halbe" : eighth ? "Achtel" : dotted ? "punktierte Viertel" : "Viertel";
  return (
    `<svg class="bm" viewBox="-0.1 -3.6 ${(right + 0.1).toFixed(2)} 4.3" role="img" aria-label="${name}">` + s + `</svg>`
  );
}

/** „♩ = 72“ */
function tempoMark(song: Song, percent: number): string {
  const b = baseTempo(song);
  return `${beatMarkSvg(b.beat)}<span class="eq">\u2009=\u2009</span>${Math.round((b.bpm * percent) / 100)}`;
}

const ICON_PLAY = `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><path d="M8.5 5.2v15.6L21 13z"/></svg>`;
const ICON_STOP = `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><rect x="7" y="7" width="12" height="12" rx="1.6"/></svg>`;
const ICON_METRO = `<svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true"><path d="M9.6 3.6h6.8l4.2 18.4H5.4z" fill="none" stroke-width="1.5" stroke-linejoin="round"/><path d="M6.6 17.4h12.8" fill="none" stroke-width="1.3"/><path d="M13 17.4L18.6 6.4" fill="none" stroke-width="1.5" stroke-linecap="round"/><circle cx="17.2" cy="9.2" r="1.6"/></svg>`;

// ---------------------------------------------------------------- Liederliste

function songRow(song: Song, missing: string | null): string {
  return (
    `<li><a class="songrow" href="#/lied/${song.id}" data-song="${song.id}">` +
    `<span class="st">${esc(song.title)}</span>` +
    `<span class="sm">${esc(song.keyName)} · ${timeHtml(song.time)}</span>` +
    (missing ? `<span class="miss" data-testid="missing">Fehlt noch: ${missing}</span>` : "") +
    `</a></li>`
  );
}

export const songListView: View = (root, ctx) => {
  const can: Song[] = [];
  const rest = new Map<Song, string>();
  for (const s of SONGS) {
    const p = playabilityFor(s, ctx.data);
    if (p.playable) can.push(s);
    else rest.set(s, missingHtml(p.missing));
  }
  // Eigene Lieder: spielbare stehen wie Heft-Lieder oben, die übrigen im eigenen Kapitel
  const own = ownEntries(ctx.data);
  const ownRows: string[] = [];
  for (const e of own) {
    if (!e.song) {
      ownRows.push(
        `<li><a class="songrow broken" href="#/lied/${e.stored.id}" data-song="${e.stored.id}"><span class="st">${esc(e.stored.title || "Ohne Titel")}</span>` +
          `<span class="miss" data-testid="unreadable">Lässt sich zurzeit nicht lesen</span></a></li>`,
      );
      continue;
    }
    const p = playabilityFor(e.song, ctx.data);
    if (p.playable) can.push(e.song);
    else ownRows.push(songRow(e.song, missingHtml(p.missing)));
  }
  const ownHelp = !own.length
    ? "Lieder aus einer ABC-Datei, zum Beispiel von thesession.org oder abcnotation.com."
    : !ownRows.length
      ? "Deine eigenen Lieder kannst du alle schon spielen – sie stehen oben."
      : "";
  const groups = chapters(SONGS.filter((s) => rest.has(s)))
    .map(
      (c) =>
        `<section class="chap"><h2>${esc(c.chapter)}</h2><ul class="songs">${c.songs.map((s) => songRow(s, rest.get(s)!)).join("")}</ul></section>`,
    )
    .join("");
  const note = takeListNote();
  // „Eigene Lieder“ steht oben, gleich nach „Kannst du schon spielen“: Die Heft-Liste ist lang, und
  // was sie selbst hinzugefügt hat, sucht sie am ehesten – samt dem Knopf zum Hinzufügen.
  root.innerHTML = `
<main class="screen page songlist">
  <header class="topbar"><a class="iconbtn" href="#/" aria-label="Zurück">${ICON_BACK}</a><h1>Lieder</h1><span></span></header>
  <p class="help">Jedes Lied lässt sich anhören: Die App spielt es vor und zeigt die Noten mit.</p>
  ${note ? `<p class="msg ok" data-testid="msg" role="status">${esc(note)}</p>` : ""}
  <section class="can" data-testid="can-play"><h2>Kannst du schon spielen</h2>${
    can.length
      ? `<ul class="songs">${can.map((s) => songRow(s, null)).join("")}</ul>`
      : `<p class="help">Noch keins – mit den nächsten Stufen kommen die ersten Lieder dazu.</p>`
  }</section>
  <section class="chap own" data-testid="own-songs"><h2>Eigene Lieder</h2>
    ${ownRows.length ? `<ul class="songs">${ownRows.join("")}</ul>` : ""}
    ${ownHelp ? `<p class="help">${ownHelp}</p>` : ""}
    <a class="big alt addsong" href="#/lied-hinzufuegen">Lied hinzufügen</a>
  </section>
  ${groups}
</main>`;
};

// ---------------------------------------------------------------- Liedseite

function stanzasHtml(song: Song): string {
  if (!song.stanzas.length) return "";
  const maxLen = Math.max(...song.stanzas.flat().map((l) => l.length));
  // Spalten wie im Heft (build2.py): kurze Zeilen bis zu drei Spalten; auf schmalen Schirmen weniger
  let cols = maxLen <= 30 ? 3 : maxLen <= 48 ? 2 : 1;
  if (song.stanzas.length === 1) cols = 1;
  if (song.stanzas.length === 2 && cols === 3) cols = 2;
  if (song.stanzaCols) cols = song.stanzaCols;
  const items = song.stanzas
    .map((lines, i) => `<div class="stz"><span class="stn">${i + 2}.</span>${lines.map(esc).join("<br>")}</div>`)
    .join("");
  return `<section class="stanzas" style="--cols:${cols};--minw:${(maxLen * 0.43 + 1.6).toFixed(1)}em" aria-label="Weitere Strophen">${items}</section>`;
}

interface Section {
  from: number;
  to: number;
}

export const songView: View = (root, ctx) => {
  const id = decodeURIComponent(location.hash.replace(/^#\/?lied\/?/, "").split("?")[0]);
  const ownEntry = songById(id) ? undefined : ownEntryById(ctx.data, id);
  const found = songById(id) ?? ownEntry?.song;
  if (ownEntry && !ownEntry.song) {
    brokenSongPage(root, ctx, ownEntry);
    return;
  }
  if (!found) {
    ctx.go("#/lieder");
    return;
  }
  const song: Song = found;
  const noteById = new Map<number, NoteEvent>(song.notes.map((n) => [n.id, n]));
  const full = buildTimeline(song);
  const prefs = (ctx.data.songs[song.id] ??= {});
  let percent = clampPercent(prefs.tempo ?? 100);
  let metronome = false;

  root.innerHTML = `
<main class="screen songpage" data-song="${song.id}">
  <header class="topbar songhead">
    <a class="iconbtn" href="#/lieder" aria-label="Zurück">${ICON_BACK}</a>
    <div class="ttl">
      <h1>${esc(song.title)}</h1>
      <p class="meta">${song.subtitle ? `${esc(song.subtitle)} · ` : ""}${esc(song.keyName)} · ${timeHtml(song.time)} · <span class="nb">Grundtempo ${tempoMark(song, 100)}</span></p>
    </div>
    <span></span>
  </header>
  <div class="songtools"><button class="followbtn" data-act="follow">${ICON_MIC}<span>Mitspielen</span></button></div>
  <p class="hint" data-testid="hint">Tippe einen Takt an, um einen Abschnitt zu wiederholen. Lange tippen wählt die ganze Zeile.</p>
  <div class="scorebox" data-testid="score"></div>
  ${stanzasHtml(song)}
  ${song.credit ? `<p class="credit">${esc(song.credit)}</p>` : ""}
  ${ownEntry ? `<section class="ownbox" data-testid="own-info"></section>` : ""}
  <div class="player" role="region" aria-label="Wiedergabe">
    <div class="pin">
      <div class="pfl" data-testid="flute"></div>
      <div class="pinfo">
        <span class="pname" data-testid="note-name" aria-live="off"></span>
        <span class="pcount" data-testid="count" hidden></span>
        <span class="pstat" data-testid="status" aria-live="polite"></span>
        <button class="clear" data-act="clear" hidden>Schleife aufheben</button>
      </div>
      <button class="playbtn" data-act="play" aria-label="Abspielen">${ICON_PLAY}</button>
      <label class="tempo">
        <span class="tl">Tempo <output data-testid="tempo">${percent} % · ${tempoMark(song, percent)}</output></span>
        <input type="range" min="${TEMPO_MIN}" max="${TEMPO_MAX}" step="5" value="${percent}" aria-label="Tempo in Prozent des Grundtempos" data-testid="tempo-range">
      </label>
      <button class="metro" data-act="metro" aria-pressed="false" aria-label="Metronom" title="Metronom">${ICON_METRO}</button>
    </div>${followBarHtml()}
  </div>
</main>`;
  const main = root.querySelector("main") as HTMLElement;
  const box = main.querySelector(".scorebox") as HTMLElement;
  const hint = main.querySelector(".hint") as HTMLElement;
  const player = main.querySelector(".player") as HTMLElement;
  const fl = main.querySelector(".pfl") as HTMLElement;
  const pname = main.querySelector(".pname") as HTMLElement;
  const pcount = main.querySelector(".pcount") as HTMLElement;
  const pstat = main.querySelector(".pstat") as HTMLElement;
  const clearBtn = main.querySelector('[data-act="clear"]') as HTMLButtonElement;
  const playBtn = main.querySelector('[data-act="play"]') as HTMLButtonElement;
  const metroBtn = main.querySelector('[data-act="metro"]') as HTMLButtonElement;
  const range = main.querySelector('input[type="range"]') as HTMLInputElement;
  const tempoOut = main.querySelector("output") as HTMLOutputElement;

  // ------------------------------------------------------------ Zustand
  let score: Score | null = null;
  let width = 0;
  /** gerade markierte Noten (Kennungen) */
  let cur: number[] = [];
  /** angetippter Anfangstakt (Abschnitt noch nicht fertig) */
  let selStart: number | null = null;
  let section: Section | null = null;
  /** Zeitplan, der gerade spielt (null = Stille) */
  let playingTl: Timeline | null = null;
  let lastPos: PlayerPosition | null = null;
  let followedSys = -1;
  let userScrollUntil = 0;
  let shownMidi: number | null | undefined;
  /** Farben vom Mitspielen: Kennung → getroffen/verfehlt (bleibt beim Neuzeichnen erhalten) */
  const painted = new Map<number, "hit" | "miss">();
  /** mitlaufender Balken */
  const playhead = new Playhead(song);

  // ------------------------------------------------------------ Notenbild
  const draw = () => {
    const w = Math.floor(box.clientWidth);
    if (w <= 0 || w === width) return;
    width = w;
    score = renderScore(song, { width: w });
    box.replaceChildren(score.el);
    playhead.attach(box, score);
    // Zustand übernehmen
    for (const i of cur) score.noteEl(i)?.classList.add("cur");
    for (const [i, c] of painted) score.noteEl(i)?.classList.add(c);
    markBars();
    main.dataset.systems = String(score.systems.length);
    if (playingTl && lastPos?.bar != null) {
      followedSys = -1;
      keepVisible(playingTl.bars[lastPos.bar].index, true);
    }
  };

  const markBars = () => {
    if (!score) return;
    for (let i = 0; i < song.bars.length; i++) {
      const r = score.barEl(i);
      if (!r) continue;
      r.classList.toggle("inloop", !!section && i >= section.from && i <= section.to);
      r.classList.toggle("sel", selStart === i);
    }
  };

  const paint = (ids: number[], c: "hit" | "miss" | null) => {
    for (const i of ids) {
      const g = score?.noteEl(i);
      g?.classList.remove("hit", "miss");
      if (c) {
        painted.set(i, c);
        g?.classList.add(c);
      } else painted.delete(i);
    }
  };
  const clearPaint = () => paint([...painted.keys()], null);

  const setCur = (ids: number[]) => {
    for (const i of cur) score?.noteEl(i)?.classList.remove("cur");
    cur = ids;
    for (const i of cur) score?.noteEl(i)?.classList.add("cur");
  };

  // ------------------------------------------------------------ Griffbild und Name
  const showNote = (n: NoteEvent | undefined) => {
    const midi = n ? n.pitch.midi : null;
    if (midi === shownMidi) return;
    shownMidi = midi;
    if (!n) {
      fl.innerHTML = "";
      fl.classList.add("none");
      pname.innerHTML = "";
      return;
    }
    const chart = chartNoteByMidi(n.pitch.midi);
    fl.classList.toggle("none", !chart);
    fl.innerHTML = chart ? fluteSvg(chart.fingering, `Griffbild ${nameText(n.pitch.id)}`) : "";
    pname.innerHTML = nameHtml(n.pitch.id);
  };
  /** vor dem Start: erste Note des Lieds bzw. des Abschnitts */
  const restingNote = () => {
    const from = section ? section.from : 0;
    return song.notes.find((n) => n.bar >= from) ?? song.notes[0];
  };

  // ------------------------------------------------------------ Statuszeile
  const barRange = (s: Section) => (s.from === s.to ? `Takt ${s.from + 1}` : `Takt ${s.from + 1}–${s.to + 1}`);
  const updateStatus = () => {
    let text = "";
    if (section) text = `${barRange(section)} in Schleife`;
    else if (selStart != null) text = `Ab Takt ${selStart + 1} – tippe den Endtakt`;
    else if (playingTl && lastPos?.bar != null) text = `Takt ${playingTl.bars[lastPos.bar].index + 1}`;
    pstat.textContent = text;
    clearBtn.hidden = !section && selStart == null;
    clearBtn.textContent = section ? "Schleife aufheben" : "Auswahl aufheben";
    hint.classList.toggle("gone", !!section || selStart != null);
    main.classList.toggle("looping", !!section);
  };

  const showCount = (k: number | null) => {
    if (k == null) {
      pcount.hidden = true;
      pname.hidden = false;
      return;
    }
    const n = (playingTl ?? full).countInBeats;
    pcount.innerHTML = Array.from({ length: n }, (_, i) => `<i${i + 1 === k ? ' class="on"' : ""}>${i + 1}</i>`).join("");
    pcount.setAttribute("aria-label", `Einzählen ${k}`);
    pcount.hidden = false;
    pname.hidden = true;
  };

  // ------------------------------------------------------------ Mitscrollen
  const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  /** gut sichtbarer Bereich (Fensterkoordinaten): ohne die Bedienleiste unten */
  const viewArea = () => {
    const pr = player.getBoundingClientRect();
    const bottom = pr.top > window.innerHeight / 2 ? pr.top : window.innerHeight;
    return { top: 0, bottom };
  };
  /** Zeile des Takts sichtbar halten; force: auch während der Nutzer-Scroll-Pause */
  const keepVisible = (barIndex: number, force = false) => {
    if (!score) return;
    const k = score.systemOfBar(barIndex);
    if (k < 0 || k === followedSys) return;
    followedSys = k;
    if (!force && performance.now() < userScrollUntil) return;
    const r = score.systems[k].el.getBoundingClientRect();
    const v = viewArea();
    const h = v.bottom - v.top;
    const margin = Math.min(48, h * 0.1);
    if (r.top >= v.top + margin && r.bottom <= v.bottom - margin) return;
    // Zeile ins obere Drittel, damit die folgenden Zeilen schon zu sehen sind
    const target = window.scrollY + r.top - v.top - Math.max(margin, Math.min(h * 0.22, h - r.height - margin));
    window.scrollTo({ top: Math.max(0, target), behavior: reduceMotion() ? "auto" : "smooth" });
  };
  const userScrolled = () => {
    userScrollUntil = performance.now() + USER_SCROLL_PAUSE_MS;
  };
  const onKey = (e: KeyboardEvent) => {
    if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "].includes(e.key) && e.target === document.body) userScrolled();
  };

  // ------------------------------------------------------------ Wiedergabe
  const setPlayingUi = (on: boolean) => {
    playBtn.innerHTML = on ? ICON_STOP : ICON_PLAY;
    playBtn.setAttribute("aria-label", on ? "Stopp" : "Abspielen");
    playBtn.classList.toggle("on", on);
    main.classList.toggle("playing", on);
  };

  /** Markierung zurücksetzen, Ruhezustand anzeigen */
  const resetUi = () => {
    playingTl = null;
    lastPos = null;
    followedSys = -1;
    setCur([]);
    playhead.hide();
    showCount(null);
    setPlayingUi(false);
    shownMidi = undefined;
    showNote(restingNote());
    updateStatus();
    keepAwake(false);
  };

  const stop = () => {
    if (playingTl) songPlayer.stop();
    resetUi();
  };

  const onPosition = (p: PlayerPosition) => {
    const tl = playingTl;
    if (!tl) return;
    lastPos = p;
    showCount(p.countIn);
    const tone = p.tone != null ? tl.tones[p.tone] : null;
    setCur(tone ? tone.ids : []);
    if (tone) showNote(noteById.get(tone.ids[0]));
    if (p.bar != null) keepVisible(tl.bars[p.bar].index);
    else if (p.countIn != null && tl.bars.length) keepVisible(tl.bars[0].index, true);
    updateStatus();
  };

  /** Starten (direkt aus dem Tippen heraus: legt den AudioContext an). */
  const start = (opts: { countIn: boolean }) => {
    const tl = section ? sectionTimeline(song, section.from, section.to) : full;
    playingTl = tl;
    lastPos = null;
    followedSys = -1;
    userScrollUntil = 0;
    setPlayingUi(true);
    keepAwake(true);
    songPlayer.play(tl, {
      secPerQuarter: secPerQuarter(song, percent),
      a4: ctx.data.settings.tuningHz,
      countIn: opts.countIn,
      metronome,
      loop: !!section,
      onPosition,
      onFrame: (p) => {
        if (playingTl === tl) playhead.show(tl, p.quarter);
      },
      onEnd: () => {
        if (playingTl === tl) resetUi();
      },
    });
  };

  playBtn.addEventListener("click", () => {
    if (playingTl) stop();
    else start({ countIn: true });
  });

  metroBtn.addEventListener("click", () => {
    metronome = !metronome;
    metroBtn.setAttribute("aria-pressed", String(metronome));
    songPlayer.setMetronome(metronome);
  });

  const showTempo = () => {
    tempoOut.innerHTML = `${percent} % · ${tempoMark(song, percent)}`;
  };
  range.addEventListener("input", () => {
    percent = clampPercent(Number(range.value));
    showTempo();
    if (playingTl) songPlayer.setTempo(secPerQuarter(song, percent));
  });
  range.addEventListener("change", () => {
    prefs.tempo = percent;
    ctx.data.songs[song.id] = prefs;
    ctx.save();
  });

  // ------------------------------------------------------------ Abschnitt wählen
  /** Abschnitt steht fest: läuft gerade etwas, sofort dorthin umstellen (ohne neues Einzählen) */
  const applySection = () => {
    selStart = null;
    markBars();
    updateStatus();
    if (follow.active) follow.refresh();
    else if (playingTl) start({ countIn: false });
    else showNote(restingNote());
  };

  const tapBar = (i: number) => {
    if (follow.running) return; // beim Mitspielen gilt der Abschnitt erst beim nächsten Start

    if (section) {
      // neue Auswahl beginnt; die alte Schleife läuft weiter, bis der Endtakt feststeht
      section = null;
      selStart = i;
    } else if (selStart == null) {
      selStart = i;
    } else {
      section = { from: Math.min(selStart, i), to: Math.max(selStart, i) };
      applySection();
      return;
    }
    markBars();
    updateStatus();
  };

  const pressLine = (i: number) => {
    if (!score || follow.running) return;
    const bars = score.systems[score.systemOfBar(i)].bars;
    section = { from: bars[0], to: bars[bars.length - 1] };
    applySection();
  };

  clearBtn.addEventListener("click", () => {
    section = null;
    selStart = null;
    markBars();
    // Läuft die Schleife gerade, wird der laufende Durchgang noch zu Ende gespielt. Das gilt auch, wenn
    // schon ein neuer Anfangstakt angetippt war (dann ist section schon null, die alte Schleife läuft aber).
    if (playingTl && playingTl !== full) songPlayer.setLoop(false);
    updateStatus();
    if (!playingTl) showNote(restingNote());
  });

  // Tippen von Wischen unterscheiden; langes Tippen ohne Kontextmenü
  let press: { id: number; x: number; y: number; bar: number; scrollY: number; timer: number; long: boolean } | null = null;
  const endPress = () => {
    if (press) clearTimeout(press.timer);
    press = null;
  };
  box.addEventListener("pointerdown", (e) => {
    const t = (e.target as Element).closest?.("rect.takt") as SVGRectElement | null;
    if (!t || (e.pointerType === "mouse" && e.button !== 0)) return;
    endPress();
    const bar = Number(t.dataset.bar);
    const p = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      bar,
      scrollY: window.scrollY,
      long: false,
      timer: window.setTimeout(() => {
        if (press !== p) return;
        p.long = true;
        pressLine(bar);
      }, LONG_PRESS_MS),
    };
    press = p;
  });
  box.addEventListener("pointermove", (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP) endPress();
  });
  box.addEventListener("pointerup", (e) => {
    if (!press || e.pointerId !== press.id) return;
    const p = press;
    endPress();
    if (p.long || Math.abs(window.scrollY - p.scrollY) > TAP_SLOP) return;
    tapBar(p.bar);
  });
  box.addEventListener("pointercancel", endPress);
  box.addEventListener("contextmenu", (e) => e.preventDefault());

  // ------------------------------------------------------------ Größe, Hintergrund, Verlassen
  const ro = new ResizeObserver(() => {
    draw();
    main.style.setProperty("--ph", `${Math.ceil(player.getBoundingClientRect().height)}px`);
  });
  ro.observe(box);
  ro.observe(player);
  const onVisibility = () => {
    if (!document.hidden) return;
    stop();
    follow.stopRun();
  };
  document.addEventListener("visibilitychange", onVisibility);
  window.addEventListener("wheel", userScrolled, { passive: true });
  window.addEventListener("touchmove", userScrolled, { passive: true });
  window.addEventListener("keydown", onKey);

  // ------------------------------------------------------------ Mitspielen
  const follow = mountFollow(main, {
    ctx,
    song,
    full,
    noteById,
    section: () => section,
    setSection: (s) => {
      section = s;
      selStart = null;
      markBars();
      updateStatus();
      follow.refresh();
    },
    percent: () => percent,
    setPercent: (p, save) => {
      percent = p;
      range.value = String(p);
      showTempo();
      if (save) {
        prefs.tempo = percent;
        ctx.data.songs[song.id] = prefs;
        ctx.save();
      }
    },
    setCur,
    playhead: (tl, q) => playhead.show(tl, q),
    paint,
    clearPaint,
    scrollTo: (bar, force) => {
      if (force) followedSys = -1;
      keepVisible(bar, force);
    },
    changed: () => {
      hint.classList.toggle("gone", !!section || selStart != null || follow.running);
    },
  });
  main.querySelector('[data-act="follow"]')!.addEventListener("click", () => {
    stop();
    userScrollUntil = 0;
    followedSys = -1;
    follow.enter();
  });
  main.querySelector('[data-act="fexit"]')!.addEventListener("click", () => {
    followedSys = -1;
    resetUi();
  });

  if (ownEntry) mountOwnBox(main.querySelector(".ownbox") as HTMLElement, ctx, ownEntry, () => {
    stop();
    follow.exit();
  });
  draw();
  if (follow.active) {
    showNote(restingNote());
    updateStatus();
  } else resetUi();
  // Für automatische Tests
  (window as unknown as { __lied: unknown }).__lied = { song, full, player: songPlayer, timeline: () => playingTl, follow: () => follow.debug() };

  return () => {
    follow.destroy();
    stop();
    endPress();
    ro.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("wheel", userScrolled);
    window.removeEventListener("touchmove", userScrolled);
    window.removeEventListener("keydown", onKey);
  };
};
