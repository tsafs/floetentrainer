// Liederliste und Liedseite: Lieder aus dem Heft ansehen, vorspielen lassen und mitspielen.
//
// Liederliste: Abschnitte als Karten („Kannst du schon spielen“, „Eigene Lieder“, unter „Aus dem Heft“ je
// Kapitel eine Karte), jede über ihre Kopfzeile ein- und ausklappbar. Der Klappzustand wird als
// Bequemlichkeit im localStorage des Geräts gemerkt (eigener Schlüssel, nicht im Datenformat: er gehört
// zur Ansicht auf diesem Gerät und hat in einer Sicherung nichts verloren).
//
// Liedseite (Nachsteuerung vom 14.11.2026, Entwurf A1): Unter dem Titel der Umschalter „Anhören |
// Mitspielen“; jede Art hat ihre eigene Bedienleiste (Hochformat unten fest, Querformat rechts).
// - Anhören: Abspielen/Stopp, Tempo (50–120 %, je Lied gemerkt), Metronom; vor dem Start wird ein Takt
//   eingezählt. Einen Takt antippen startet das Vorspielen ab diesem Takt bzw. springt beim Spielen
//   dorthin (ohne neues Einzählen). Keine Schleife.
// - Mitspielen (./song-follow.ts): Antippen wählt einen Takt, ein zweiter Tipp erweitert die Auswahl bis
//   dorthin, ein weiterer beginnt neu. Ohne Auswahl gilt das ganze Lied; nichts wird vorausgewählt.
// Wischen (Scrollen) tippt nichts an.
// Mitlaufen: Die klingende Note ist markiert, ein senkrechter Balken läuft gleichmäßig mit
// (./playhead.ts); die Seite scrollt sanft mit, sobald die aktuelle Zeile aus dem gut sichtbaren
// Bereich läuft. Scrollt sie selbst, hält das Mitscrollen ein paar Sekunden still.

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
import { buildTimeline, fromBarTimeline, type Timeline } from "../songs/timeline";
import { esc, ICON_BACK, plural, type View } from "./common";
import { brokenSongPage, mountOwnBox, takeListNote } from "./own-songs";
import { Playhead } from "./playhead";
import { followBarHtml, ICON_MIC, mountFollow } from "./song-follow";

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
const ICON_EAR = `<svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true"><path d="M3.5 8.4h3.2L11 4.8v12.4l-4.3-3.6H3.5z" fill="none" stroke-width="1.4" stroke-linejoin="round"/><path d="M14.2 8.2a3.9 3.9 0 0 1 0 5.6M16.6 5.9a7.2 7.2 0 0 1 0 10.2" fill="none" stroke-width="1.4" stroke-linecap="round"/></svg>`;
const ICON_CHEVRON = `<svg class="chev" width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M5 7.5l5 5 5-5" fill="none" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const ICON_PLUS = `<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 3.5v13M3.5 10h13" fill="none" stroke-width="1.6" stroke-linecap="round"/></svg>`;
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

/** Schlüssel für den Klappzustand der Karten (Bequemlichkeit je Gerät, siehe Kopfkommentar) */
export const LIST_OPEN_KEY = "floetentrainer-liederliste";

/** gemerkter Klappzustand: Karte → offen; fehlt eine Karte, gilt der Standard */
function loadOpen(): Record<string, boolean> {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(LIST_OPEN_KEY) ?? "{}");
    if (typeof v !== "object" || v === null || Array.isArray(v)) return {};
    const out: Record<string, boolean> = {};
    for (const [k, o] of Object.entries(v)) if (typeof o === "boolean") out[k] = o;
    return out;
  } catch {
    return {};
  }
}
function saveOpen(m: Record<string, boolean>): void {
  try {
    localStorage.setItem(LIST_OPEN_KEY, JSON.stringify(m));
  } catch {
    /* ohne Speicher gilt beim nächsten Mal wieder der Standard */
  }
}

interface CardOpts {
  key: string;
  title: string;
  /** z. B. „7 Lieder“; leer = keine Anzahl */
  count: string;
  sub: string;
  body: string;
  open: boolean;
  cls: string;
  testid?: string;
}

/** Abschnitt als Karte; die Kopfzeile klappt ihn ein und aus */
function cardHtml(o: CardOpts, n: number): string {
  const id = `liste-${n}`;
  return (
    `<section class="card ${o.cls}${o.open ? "" : " closed"}" data-card="${esc(o.key)}"${o.testid ? ` data-testid="${o.testid}"` : ""}>` +
    `<h2 class="cardh"><button class="cardhd" aria-expanded="${o.open}" aria-controls="${id}">` +
    `<span class="ct">${esc(o.title)}</span>` +
    (o.count ? `<span class="cn">${o.count}</span>` : "") +
    ICON_CHEVRON +
    (o.sub ? `<span class="cs">${o.sub}</span>` : "") +
    `</button></h2>` +
    `<div class="cardbody" id="${id}"${o.open ? "" : " inert"}><div class="cardin">${o.body}</div></div>` +
    `</section>`
  );
}

const songCount = (n: number) => (n ? plural(n, "Lied", "Lieder") : "");

export const songListView: View = (root, ctx) => {
  const can: Song[] = [];
  const rest = new Map<Song, string>();
  for (const s of SONGS) {
    const p = playabilityFor(s, ctx.data);
    if (p.playable) can.push(s);
    else rest.set(s, missingHtml(p.missing));
  }
  // Eigene Lieder: spielbare stehen wie Heft-Lieder oben, die übrigen in der eigenen Karte
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
  const chapterNo = new Map(chapters(SONGS).map((c, i) => [c.chapter, i + 1]));
  const groups = chapters(SONGS.filter((s) => rest.has(s)));
  const note = takeListNote();

  // Standard: „Kannst du schon spielen“ offen, die übrigen zu. „Eigene Lieder“ ist offen, wenn darin
  // nur Hinweis und „Lied hinzufügen“ stehen (klein, zeigt die Möglichkeit), wenn „Kannst du schon
  // spielen“ leer ist oder gerade ein Lied hinzugefügt/gelöscht wurde. Sind beide leer, ist das erste
  // Kapitel offen, damit es überhaupt etwas zu sehen gibt.
  const defaults: Record<string, boolean> = {
    can: can.length > 0,
    own: !ownRows.length || !can.length,
  };
  if (!can.length && !ownRows.length && groups.length) defaults[`kapitel:${groups[0].chapter}`] = true;
  const saved = loadOpen();
  const isOpen = (key: string) => (key === "own" && note ? true : (saved[key] ?? defaults[key] ?? false));

  let n = 0;
  const cards: string[] = [];
  cards.push(
    cardHtml(
      {
        key: "can",
        title: "Kannst du schon spielen",
        count: songCount(can.length),
        sub: "Alle Töne kennst du schon.",
        body: can.length
          ? `<ul class="songs">${can.map((s) => songRow(s, null)).join("")}</ul>`
          : `<p class="help">Noch keins – mit den nächsten Stufen kommen die ersten Lieder dazu.</p>`,
        open: isOpen("can"),
        cls: "can",
        testid: "can-play",
      },
      n++,
    ),
  );
  // „Eigene Lieder“ steht oben, gleich nach „Kannst du schon spielen“: Die Heft-Liste ist lang, und
  // was sie selbst hinzugefügt hat, sucht sie am ehesten – samt dem Knopf zum Hinzufügen.
  cards.push(
    cardHtml(
      {
        key: "own",
        title: "Eigene Lieder",
        count: songCount(ownRows.length),
        sub: "Aus einer ABC-Datei, zum Beispiel von thesession.org.",
        body:
          (ownRows.length ? `<ul class="songs">${ownRows.join("")}</ul>` : "") +
          (ownHelp ? `<p class="help">${ownHelp}</p>` : "") +
          `<a class="addrow addsong" href="#/lied-hinzufuegen">${ICON_PLUS}<span>Lied hinzufügen</span></a>`,
        open: isOpen("own"),
        cls: "own",
        testid: "own-songs",
      },
      n++,
    ),
  );
  const heft = groups
    .map((c) =>
      cardHtml(
        {
          key: `kapitel:${c.chapter}`,
          title: c.chapter,
          count: songCount(c.songs.length),
          sub: `Kapitel ${chapterNo.get(c.chapter)} · dir fehlen noch Töne`,
          body: `<ul class="songs">${c.songs.map((s) => songRow(s, rest.get(s)!)).join("")}</ul>`,
          open: isOpen(`kapitel:${c.chapter}`),
          cls: "chap",
        },
        n++,
      ),
    )
    .join("");
  root.innerHTML = `
<main class="screen page songlist">
  <header class="topbar"><a class="iconbtn" href="#/" aria-label="Zurück">${ICON_BACK}</a><h1>Lieder</h1><span></span></header>
  <p class="help intro">Jedes Lied lässt sich anhören und mitspielen: Die App spielt es vor und zeigt die Noten mit.</p>
  ${note ? `<p class="msg ok" data-testid="msg" role="status">${esc(note)}</p>` : ""}
  ${cards.join("")}
  ${heft ? `<p class="grp">Aus dem Heft</p>${heft}` : ""}
</main>`;

  root.querySelector("main")!.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest?.("button.cardhd") as HTMLButtonElement | null;
    if (!btn) return;
    const card = btn.closest(".card") as HTMLElement;
    const open = card.classList.contains("closed");
    card.classList.toggle("closed", !open);
    btn.setAttribute("aria-expanded", String(open));
    (card.querySelector(".cardbody") as HTMLElement).inert = !open;
    const m = loadOpen();
    m[card.dataset.card!] = open;
    saveOpen(m);
  });
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

/** Art der Liedseite */
type SongMode = "listen" | "follow";

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
<main class="screen songpage" data-song="${song.id}" data-mode="listen">
  <header class="topbar songhead">
    <a class="iconbtn" href="#/lieder" aria-label="Zurück">${ICON_BACK}</a>
    <div class="ttl">
      <h1>${esc(song.title)}</h1>
      <p class="meta">${song.subtitle ? `${esc(song.subtitle)} · ` : ""}${esc(song.keyName)} · ${timeHtml(song.time)} · <span class="nb">Grundtempo ${tempoMark(song, 100)}</span></p>
    </div>
    <span></span>
  </header>
  <div class="seg modes" role="tablist" aria-label="Anhören oder mitspielen">
    <button role="tab" data-mode="listen" aria-selected="true">${ICON_EAR}<span>Anhören</span></button><button role="tab" data-mode="follow" aria-selected="false">${ICON_MIC}<span>Mitspielen</span></button>
  </div>
  <p class="hint" data-testid="hint"></p>
  <div class="scorebox" data-testid="score"></div>
  ${stanzasHtml(song)}
  ${song.credit ? `<p class="credit">${esc(song.credit)}</p>` : ""}
  ${ownEntry ? `<section class="ownbox" data-testid="own-info"></section>` : ""}
  <div class="player" role="region" aria-label="Bedienung">
    <div class="pin">
      <div class="pfl" data-testid="flute"></div>
      <div class="pinfo">
        <span class="pname" data-testid="note-name" aria-live="off"></span>
        <span class="pcount" data-testid="count" hidden></span>
        <span class="pstat" data-testid="status" aria-live="polite"></span>
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
  const modeTabs = [...main.querySelectorAll<HTMLButtonElement>(".modes button")];
  const fl = main.querySelector(".pfl") as HTMLElement;
  const pname = main.querySelector(".pname") as HTMLElement;
  const pcount = main.querySelector(".pcount") as HTMLElement;
  const pstat = main.querySelector(".pstat") as HTMLElement;
  const playBtn = main.querySelector('[data-act="play"]') as HTMLButtonElement;
  const metroBtn = main.querySelector('[data-act="metro"]') as HTMLButtonElement;
  const range = main.querySelector('input[type="range"]') as HTMLInputElement;
  const tempoOut = main.querySelector("output") as HTMLOutputElement;

  // ------------------------------------------------------------ Zustand
  let mode: SongMode = "listen";
  let score: Score | null = null;
  let width = 0;
  /** gerade markierte Noten (Kennungen) */
  let cur: number[] = [];
  /** Mitspielen: gewählte Takte; extendable = erst ein Takt angetippt, ein zweiter Tipp erweitert */
  let section: Section | null = null;
  let extendable = false;
  /** Anhören: Takt, ab dem gerade vorgespielt wird (null = vom Anfang) */
  let fromBar: number | null = null;
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

  /** Auswahl (Mitspielen) bzw. Takt „ab hier“ (Anhören) hinterlegen */
  const markBars = () => {
    if (!score) return;
    const picked = mode === "follow" ? section : null;
    const from = mode === "listen" && playingTl ? fromBar : null;
    for (let i = 0; i < song.bars.length; i++) {
      const r = score.barEl(i);
      if (!r) continue;
      r.classList.toggle("picked", !!picked && i >= picked.from && i <= picked.to);
      r.classList.toggle("from", from === i);
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
  /** vor dem Start: erste Note des Lieds */
  const restingNote = () => song.notes[0];

  // ------------------------------------------------------------ Hinweis, Umschalter, Statuszeile
  const updateHint = () => {
    const running = follow.running;
    let text = "";
    if (mode === "listen") text = "Tippe einen Takt an, um ab dort zu hören.";
    else if (!running) {
      text = !section
        ? "Ohne Auswahl spielst du das ganze Lied. Tippe einen Takt an, um nur ihn zu üben – ein zweiter Tipp erweitert die Auswahl."
        : extendable
          ? "Tippe einen weiteren Takt an, um die Auswahl bis dorthin zu erweitern."
          : "Ein neuer Tipp auf einen Takt beginnt eine neue Auswahl.";
    }
    hint.textContent = text;
    hint.classList.toggle("gone", !text);
    for (const t of modeTabs) {
      t.setAttribute("aria-selected", String(t.dataset.mode === mode));
      t.disabled = running;
    }
    main.classList.toggle("modes-off", running);
    main.dataset.mode = mode;
  };

  const updateStatus = () => {
    pstat.textContent = playingTl && lastPos?.bar != null ? `Takt ${playingTl.bars[lastPos.bar].index + 1}` : "";
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

  // ------------------------------------------------------------ Anhören
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
    fromBar = null;
    followedSys = -1;
    setCur([]);
    playhead.hide();
    showCount(null);
    setPlayingUi(false);
    shownMidi = undefined;
    showNote(restingNote());
    updateStatus();
    markBars();
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

  /** Vorspielen starten, vom Anfang oder ab einem Takt (direkt aus dem Tippen heraus: legt den AudioContext an). */
  const start = (opts: { from: number | null; countIn: boolean }) => {
    const tl = opts.from == null ? full : fromBarTimeline(song, opts.from);
    playingTl = tl;
    fromBar = opts.from;
    lastPos = null;
    followedSys = -1;
    userScrollUntil = 0;
    setPlayingUi(true);
    keepAwake(true);
    markBars();
    if (opts.from != null && tl.bars.length) keepVisible(tl.bars[0].index, true);
    songPlayer.play(tl, {
      secPerQuarter: secPerQuarter(song, percent),
      a4: ctx.data.settings.tuningHz,
      countIn: opts.countIn,
      metronome,
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
    else start({ from: null, countIn: true });
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

  // ------------------------------------------------------------ Takt antippen
  /** Mitspielen: Auswahl hat sich geändert – alte Farben gelten nicht mehr */
  const selectionChanged = () => {
    clearPaint();
    markBars();
    follow.refresh();
  };

  const tapBar = (i: number) => {
    if (mode === "listen") {
      // ab hier: beim Spielen sofort dorthin (ohne neues Einzählen), sonst mit Einzählen starten
      if (playingTl) start({ from: i, countIn: false });
      else start({ from: i, countIn: true });
      return;
    }
    if (follow.running) return; // beim Mitspielen gilt die Auswahl erst beim nächsten Start
    if (section && extendable) {
      section = { from: Math.min(section.from, i), to: Math.max(section.from, i) };
      extendable = false;
    } else {
      section = { from: i, to: i };
      extendable = true;
    }
    selectionChanged();
  };

  // Tippen von Wischen unterscheiden
  let press: { id: number; x: number; y: number; bar: number; scrollY: number } | null = null;
  box.addEventListener("pointerdown", (e) => {
    const t = (e.target as Element).closest?.("rect.takt") as SVGRectElement | null;
    if (!t || (e.pointerType === "mouse" && e.button !== 0)) {
      press = null;
      return;
    }
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, bar: Number(t.dataset.bar), scrollY: window.scrollY };
  });
  box.addEventListener("pointermove", (e) => {
    if (!press || e.pointerId !== press.id) return;
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) > TAP_SLOP) press = null;
  });
  box.addEventListener("pointerup", (e) => {
    if (!press || e.pointerId !== press.id) return;
    const p = press;
    press = null;
    if (Math.abs(window.scrollY - p.scrollY) > TAP_SLOP) return;
    tapBar(p.bar);
  });
  box.addEventListener("pointercancel", () => (press = null));
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
    clearSection: () => {
      section = null;
      extendable = false;
      selectionChanged();
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
    changed: () => updateHint(),
  });

  // ------------------------------------------------------------ Umschalter „Anhören | Mitspielen“
  const setMode = (m: SongMode) => {
    if (m === mode || follow.running) return;
    mode = m;
    if (m === "follow") {
      stop();
      userScrollUntil = 0;
      followedSys = -1;
      follow.enter();
    } else {
      follow.exit();
      followedSys = -1;
      resetUi();
    }
    markBars();
    updateHint();
  };
  for (const t of modeTabs) t.addEventListener("click", () => setMode(t.dataset.mode as SongMode));

  if (ownEntry) mountOwnBox(main.querySelector(".ownbox") as HTMLElement, ctx, ownEntry, () => {
    stop();
    follow.exit();
  });
  draw();
  resetUi();
  if (follow.active) mode = "follow"; // nach erteilter Mikrofon-Erlaubnis gleich wieder im Mitspielen
  markBars();
  updateHint();
  // Für automatische Tests
  (window as unknown as { __lied: unknown }).__lied = { song, full, player: songPlayer, timeline: () => playingTl, follow: () => follow.debug() };

  return () => {
    follow.destroy();
    stop();
    press = null;
    ro.disconnect();
    document.removeEventListener("visibilitychange", onVisibility);
    window.removeEventListener("wheel", userScrolled);
    window.removeEventListener("touchmove", userScrolled);
    window.removeEventListener("keydown", onKey);
  };
};
