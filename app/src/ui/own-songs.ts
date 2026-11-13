// Eigene Lieder in der Oberfläche: Seite „Lied hinzufügen“ (#/lied-hinzufuegen), Kasten auf der Liedseite
// (Hinweise, Weggelassenes, Löschen) und die Seite für ein Lied, das sich nicht mehr lesen lässt.
//
// Ablauf beim Hinzufügen: ABC-Datei wählen oder Text einfügen → „Noten lesen“ → gefundene Stücke
// erscheinen mit Tonart, Taktart, Weggelassenem und Hinweisen zum Tonumfang; nicht lesbare Stücke
// stehen darunter mit Zeile und Grund. Bei mehreren Stücken wählt sie aus (einzeln oder alle), dann
// „Übernehmen“. Liegt ein Stück daneben, passt aber eine Oktave verschoben, ist „Eine Oktave höher/tiefer
// setzen“ schon angehakt.

import type { OctaveShift } from "../store/data";
import { dayKey } from "../store/dates";
import type { AbcTune } from "../songs/abc";
import type { Song } from "../songs/model";
import { addOwnSongs, kb, LARGE_INPUT, ownSize, readImport, removeOwnSong, type ImportResult, type OwnEntry } from "../songs/own";
import { FLUTE_HIGH, FLUTE_LOW, type OutsideNote } from "../songs/range";
import { esc, ICON_BACK, plural, type Ctx, type View } from "./common";

// ---------------------------------------------------------------- Meldung für die Liederliste

let listNote: string | null = null;

/** Kurze Meldung, die die Liederliste einmal oben zeigt (nach Hinzufügen oder Löschen). */
export function setListNote(text: string): void {
  listNote = text;
}
/** Meldung abholen (danach ist sie weg) */
export function takeListNote(): string | null {
  const t = listNote;
  listNote = null;
  return t;
}

// ---------------------------------------------------------------- kleine Bausteine

const CHECK = `<svg class="ck" viewBox="0 0 26 26" aria-hidden="true"><circle cx="13" cy="13" r="11.6"/><path d="M8 13.4l3.4 3.4 6.8-7.2"/></svg>`;

/** Tonname mit Hochzahl wie in der übrigen App; kleine Oktave ohne Zeichen, große Oktave groß */
function pitchHtml(p: { name: string; octave: number }): string {
  if (p.octave >= 1) return `<span class="nn">${p.name}<span class="o">${p.octave}</span></span>`;
  if (p.octave === 0) return `<span class="nn">${p.name}</span>`;
  return `<span class="nn">${p.name[0].toUpperCase() + p.name.slice(1)}</span>`;
}
const RANGE_HTML = `${pitchHtml({ name: "c", octave: 1 })}–${pitchHtml({ name: "d", octave: 3 })}`;

function outsideHtml(list: OutsideNote[]): string {
  return list.map(pitchHtml).join(", ");
}

function metaHtml(song: Song): string {
  return `${esc(song.keyName)} · <span class="ts">${song.time.num}/${song.time.den}-Takt</span>`;
}

/** Hinweis zum Tonumfang vor dem Übernehmen; bei möglicher Verschiebung mit Haken (Standard: an). */
function rangeHtml(tune: AbcTune, i: number, shift: OctaveShift): string {
  const r = tune.range;
  if (r.ok) return "";
  if (r.shift) {
    const up = r.shift > 0;
    const low = tune.song.range.low;
    const high = tune.song.range.high;
    const why = up
      ? `Das Stück liegt für die Sopranflöte zu tief (tiefster Ton ${pitchHtml(low)}).`
      : `Das Stück liegt für die Sopranflöte zu hoch (höchster Ton ${pitchHtml(high)}).`;
    return (
      `<div class="shiftbox"><p>${why} Eine Oktave ${up ? "höher" : "tiefer"} passt es genau.</p>` +
      `<label class="tick"><input type="checkbox" data-shift="${i}" data-testid="shift-${i}"${shift ? " checked" : ""}>${CHECK}` +
      `<span>Eine Oktave ${up ? "höher" : "tiefer"} setzen</span></label></div>`
    );
  }
  return `<p class="note" data-testid="outside-${i}">Außerhalb der Sopranflöte (${RANGE_HTML}): ${outsideHtml(r.outside)}. Anhören lässt es sich trotzdem.</p>`;
}

// ---------------------------------------------------------------- Seite „Lied hinzufügen“

interface Source {
  /** Dateiname oder null bei eingefügtem Text */
  name: string | null;
  res: ImportResult;
}

export const songAddView: View = (root, ctx) => {
  let src: Source | null = null;
  /** gewählte Stücke (Index in src.res.tunes) */
  let chosen = new Set<number>();
  /** Oktavverschiebung je Stück */
  let shifts: OctaveShift[] = [];
  let pasted = "";
  let message: string | null = null;

  const load = (name: string | null, text: string) => {
    const res = readImport(text);
    src = { name, res };
    shifts = res.tunes.map((t) => (t.tune.range.shift ?? 0) as OctaveShift);
    chosen = new Set(res.tunes.length === 1 ? [0] : []);
    message = null;
    render();
    root.querySelector<HTMLElement>(".addres")?.scrollIntoView?.({ block: "nearest" });
  };

  const inputHtml = () => `
  <section class="addsrc">
    <p class="help">Eigene Lieder kommen als ABC-Datei, wie sie zum Beispiel thesession.org oder abcnotation.com anbieten. Die App liest daraus eine einstimmige Melodie.</p>
    <button class="big alt" data-act="file">ABC-Datei wählen</button>
    <input type="file" accept=".abc,.txt,text/plain,text/vnd.abc" hidden data-testid="abc-file">
    <p class="or">oder</p>
    <label class="paste"><span>ABC-Text einfügen</span>
      <textarea rows="7" spellcheck="false" autocapitalize="off" autocomplete="off" data-testid="abc-text" placeholder="X:1&#10;T:Titel&#10;M:3/4&#10;L:1/4&#10;K:G&#10;G A B | c2 B | A3 |]">${esc(pasted)}</textarea>
    </label>
    <button class="big" data-act="read"${pasted.trim() ? "" : " disabled"}>Noten lesen</button>
  </section>`;

  const tuneHtml = (i: number) => {
    const { tune } = src!.res.tunes[i];
    const many = src!.res.tunes.length > 1;
    const head = `<span class="st">${esc(tune.title)}</span><span class="sm">${metaHtml(tune.song)}${tune.number != null && many ? ` · Nr. ${tune.number}` : ""}</span>`;
    return (
      `<li class="pick${chosen.has(i) ? " on" : ""}" data-testid="tune-${i}">` +
      (many
        ? `<label class="pk"><input type="checkbox" data-pick="${i}"${chosen.has(i) ? " checked" : ""}>${CHECK}<span class="pt">${head}</span></label>`
        : `<div class="pk one"><span class="pt">${head}</span></div>`) +
      `<div class="pd">` +
      (tune.omitted.length ? `<p class="note" data-testid="omitted-${i}">Weggelassen: ${tune.omitted.map(esc).join(", ")}.</p>` : "") +
      (tune.hints.length ? `<p class="note">Hinweis: ${tune.hints.map(esc).join("; ")}.</p>` : "") +
      rangeHtml(tune, i, shifts[i]) +
      `</div></li>`
    );
  };

  const resultHtml = () => {
    const { res, name } = src!;
    const n = res.tunes.length;
    const what = n ? plural(n, "Stück", "Stücke") : "kein lesbares Stück";
    const anyOmitted = res.tunes.some((t) => t.tune.omitted.length);
    const errs = res.errors.length
      ? `<section class="bad" data-testid="abc-errors"><h3>${res.errors.length === 1 && !n ? "Nicht lesbar" : `Nicht lesbar: ${plural(res.errors.length, "Stück", "Stücke")}`}</h3><ul>${res.errors
          .map(
            (e) =>
              `<li>${e.title ? `<b>${esc(e.title)}</b>${e.number != null ? ` <span class="soft">(Nr. ${e.number})</span>` : ""}<br>` : ""}${esc(e.message)}</li>`,
          )
          .join("")}</ul>${n ? `<p class="help">Die übrigen Stücke lassen sich trotzdem übernehmen.</p>` : ""}</section>`
      : "";
    const k = chosen.size;
    return `
  <section class="addres" data-testid="abc-result">
    <div class="srcline"><span>${name ? `<b>${esc(name)}</b>` : "Eingefügter Text"} · ${what}</span><button class="textbtn" data-act="again">Andere Eingabe</button></div>
    ${res.size > LARGE_INPUT ? `<p class="note">Die Eingabe ist groß (${kb(res.size)}). Gespeichert wird nur, was du übernimmst – wähle am besten nur die Stücke, die du brauchst.</p>` : ""}
    ${anyOmitted ? `<p class="help">Die App zeigt nur die Melodie. Was sie dafür weglässt, steht beim Stück.</p>` : ""}
    ${
      n > 1
        ? `<div class="selall"><span>${n === k ? "Alle gewählt" : `${k} von ${n} gewählt`}</span><button class="textbtn" data-act="${n === k ? "none" : "all"}">${n === k ? "Keins wählen" : "Alle wählen"}</button></div>`
        : ""
    }
    ${n ? `<ul class="picks">${res.tunes.map((_, i) => tuneHtml(i)).join("")}</ul>` : ""}
    ${errs}
    ${n ? `<button class="big" data-act="take"${k ? "" : " disabled"}>${k > 1 ? `${k} Lieder übernehmen` : "Lied übernehmen"}</button>` : ""}
    ${message ? `<p class="msg err" data-testid="msg">${esc(message)}</p>` : ""}
  </section>`;
  };

  function render() {
    root.innerHTML = `
<main class="screen page songadd">
  <header class="topbar"><a class="iconbtn" href="#/lieder" aria-label="Zurück">${ICON_BACK}</a><h1>Lied hinzufügen</h1><span></span></header>
  ${src ? resultHtml() : inputHtml()}
</main>`;
    bind();
  }

  function bind() {
    const on = (act: string, fn: () => void) => root.querySelector(`[data-act="${act}"]`)?.addEventListener("click", fn);
    const file = root.querySelector<HTMLInputElement>('input[type="file"]');
    const ta = root.querySelector<HTMLTextAreaElement>("textarea");
    const readBtn = root.querySelector<HTMLButtonElement>('[data-act="read"]');
    on("file", () => file?.click());
    file?.addEventListener("change", async () => {
      const f = file.files?.[0];
      if (!f) return;
      load(f.name, await f.text());
    });
    ta?.addEventListener("input", () => {
      pasted = ta.value;
      if (readBtn) readBtn.disabled = !pasted.trim();
    });
    on("read", () => {
      if (pasted.trim()) load(null, pasted);
    });
    on("again", () => {
      src = null;
      render();
    });
    on("all", () => {
      chosen = new Set(src!.res.tunes.map((_, i) => i));
      render();
    });
    on("none", () => {
      chosen = new Set();
      render();
    });
    root.querySelectorAll<HTMLInputElement>("[data-pick]").forEach((cb) =>
      cb.addEventListener("change", () => {
        const i = Number(cb.dataset.pick);
        if (cb.checked) chosen.add(i);
        else chosen.delete(i);
        render();
      }),
    );
    root.querySelectorAll<HTMLInputElement>("[data-shift]").forEach((cb) =>
      cb.addEventListener("change", () => {
        const i = Number(cb.dataset.shift);
        shifts[i] = cb.checked ? (src!.res.tunes[i].tune.range.shift ?? 0) : 0;
      }),
    );
    on("take", () => take());
  }

  function take() {
    if (!src || !chosen.size) return;
    const items = src.res.tunes;
    const picks = [...chosen].sort((a, b) => a - b).map((i) => ({ item: items[i], shift: shifts[i] }));
    const before = ctx.data.ownSongs.length;
    const added = addOwnSongs(ctx.data, picks);
    ctx.save();
    if (ctx.saveFailed) {
      // nichts halb speichern: wieder herausnehmen
      ctx.data.ownSongs.splice(before);
      ctx.save();
      message = `Der Speicher des Browsers ist voll – die Lieder wurden nicht übernommen. Eigene Lieder belegen zurzeit etwa ${kb(ownSize(ctx.data))}.`;
      render();
      return;
    }
    setListNote(added.length === 1 ? `„${added[0].title}“ ist jetzt in deiner Liederliste.` : `${added.length} Lieder sind jetzt in deiner Liederliste.`);
    ctx.go("#/lieder");
  }

  render();
};

// ---------------------------------------------------------------- Kasten auf der Liedseite

/**
 * Kasten „Eigenes Lied“ unter den Noten: wann eingelesen, Weggelassenes, Hinweise, Löschen (mit
 * Bestätigung in der Seite). onDelete wird vor dem Löschen aufgerufen (z. B. Wiedergabe beenden).
 */
export function mountOwnBox(el: HTMLElement, ctx: Ctx, entry: OwnEntry, onDelete: () => void = () => {}): void {
  let confirm = false;
  const o = entry.stored;
  const title = entry.song?.title ?? (o.title || "Ohne Titel");
  const draw = () => {
    const t = entry.tune;
    const lines: string[] = [];
    const when = o.added ? ` am ${formatDay(o.added)}` : "";
    lines.push(`<p>Eigenes Lied, eingelesen${when}${o.shift ? ` und eine Oktave ${o.shift > 0 ? "höher" : "tiefer"} gesetzt` : ""}.</p>`);
    if (t?.omitted.length) lines.push(`<p data-testid="own-omitted">Weggelassen: ${t.omitted.map(esc).join(", ")}.</p>`);
    if (t?.hints.length) lines.push(`<p>Hinweis: ${t.hints.map(esc).join("; ")}.</p>`);
    const song = entry.song;
    if (song) {
      const out = outsideOf(song);
      if (out.length) lines.push(`<p>Außerhalb der Sopranflöte (${RANGE_HTML}): ${outsideHtml(out)}.</p>`);
    }
    el.innerHTML =
      `<div class="ownnotes">${lines.join("")}</div>` +
      (confirm
        ? `<div class="confirm"><p>„${esc(title)}“ wirklich löschen? Das gemerkte Tempo geht mit verloren. Die Heft-Lieder bleiben, wie sie sind.</p><div class="btnrow"><button class="big danger" data-act="del-yes">Ja, löschen</button><button class="big alt" data-act="del-no">Abbrechen</button></div></div>`
        : `<button class="big alt" data-act="del">Lied löschen</button>`);
    const on = (act: string, fn: () => void) => el.querySelector(`[data-act="${act}"]`)?.addEventListener("click", fn);
    on("del", () => {
      confirm = true;
      draw();
      el.querySelector<HTMLElement>(".confirm")?.scrollIntoView?.({ block: "nearest" });
    });
    on("del-no", () => {
      confirm = false;
      draw();
    });
    on("del-yes", () => {
      onDelete();
      removeOwnSong(ctx.data, o.id);
      ctx.save();
      setListNote(`„${title}“ wurde gelöscht.`);
      ctx.go("#/lieder");
    });
  };
  draw();
}

/** Töne außerhalb c¹–d³ in der Schreibweise des Lieds */
function outsideOf(song: Song): OutsideNote[] {
  const seen = new Map<number, OutsideNote>();
  for (const n of song.notes) {
    const p = n.pitch;
    if ((p.midi < FLUTE_LOW || p.midi > FLUTE_HIGH) && !seen.has(p.midi)) seen.set(p.midi, { midi: p.midi, id: p.id, name: p.name, octave: p.octave, text: "" });
  }
  return [...seen.values()].sort((a, b) => a.midi - b.midi);
}

function formatDay(ms: number): string {
  const [y, m, d] = dayKey(ms).split("-");
  return `${Number(d)}.${Number(m)}.${y}`;
}

// ---------------------------------------------------------------- nicht mehr lesbar

/** Seite für ein gespeichertes Lied, das sich nicht (mehr) lesen lässt: nichts löschen, erklären. */
export function brokenSongPage(root: HTMLElement, ctx: Ctx, entry: OwnEntry): void {
  const title = entry.stored.title || "Eigenes Lied";
  root.innerHTML = `
<main class="screen page songbroken" data-song="${esc(entry.stored.id)}">
  <header class="topbar"><a class="iconbtn" href="#/lieder" aria-label="Zurück">${ICON_BACK}</a><h1>${esc(title)}</h1><span></span></header>
  <p class="help">Dieses Lied lässt sich zurzeit nicht lesen. Es ist weiter gespeichert und in der Sicherung enthalten – eine spätere Fassung der App kann es vielleicht wieder lesen.</p>
  <p class="note" data-testid="own-error">${esc(entry.error ?? "")}</p>
  <section class="ownbox"></section>
</main>`;
  mountOwnBox(root.querySelector(".ownbox") as HTMLElement, ctx, entry);
}
