// Notenzeile als SVG: Violinschlüssel, fünf Linien, ganze Note ohne Hals, Hilfslinien, Vorzeichen.
// Einheiten: 1 = ein Zwischenraum, y = 0 ist die unterste Linie, y wächst nach unten.

import { GLYPHS } from "./bravura";
import { note, type Note } from "./notes";

const HEAD_SCALE = 0.82; // Notenkopf verkleinert, damit er frei im Zwischenraum steht
const HEAD = GLYPHS.whole;
const HEAD_W = (HEAD.x1 - HEAD.x0) * HEAD_SCALE;
const CLEF_Y = -1; // Violinschlüssel sitzt auf der g¹-Linie
const LINE_W = 0.08;
const LEDGER_W = 0.11;
const LEDGER_OVER = 0.36;
const PAD = 0.35;

export interface Range {
  top: number;
  bottom: number;
}

function noteY(n: Note): number {
  return -n.pos / 2;
}

function accGlyph(n: Note) {
  return n.alter === 1 ? GLYPHS.sharp : n.alter === -1 ? GLYPHS.flat : null;
}

/** Senkrechter Platzbedarf einer Note (mit Vorzeichen). */
function noteExtent(n: Note): Range {
  const y = noteY(n);
  let top = y - 0.5 * HEAD_SCALE;
  let bottom = y + 0.5 * HEAD_SCALE;
  const a = accGlyph(n);
  if (a) {
    top = Math.min(top, y + a.y0);
    bottom = Math.max(bottom, y + a.y1);
  }
  return { top, bottom };
}

/** Bildausschnitt, der den Schlüssel und alle angegebenen Töne fasst. */
export function staffRange(ids: string[]): Range {
  let top = CLEF_Y + GLYPHS.clef.y0;
  let bottom = CLEF_Y + GLYPHS.clef.y1;
  for (const id of ids) {
    const e = noteExtent(note(id));
    top = Math.min(top, e.top);
    bottom = Math.max(bottom, e.bottom);
  }
  return { top: top - PAD, bottom: bottom + PAD };
}

const r = (v: number) => Math.round(v * 1000) / 1000;

/** Hilfslinien, Notenkopf und Vorzeichen einer Note mit Kopfmitte bei x = nx */
function noteParts(n: Note, nx: number, headCls = ""): string[] {
  const o: string[] = [];
  const y = noteY(n);
  const half = HEAD_W / 2;
  const ledgers: number[] = [];
  for (let q = -2; q >= n.pos; q -= 2) ledgers.push(q);
  for (let q = 10; q <= n.pos; q += 2) ledgers.push(q);
  for (const q of ledgers) {
    o.push(
      `<line class="ledger" x1="${r(nx - half - LEDGER_OVER)}" x2="${r(nx + half + LEDGER_OVER)}" y1="${-q / 2}" y2="${-q / 2}" stroke-width="${LEDGER_W}"/>`,
    );
  }
  const cx = (HEAD.x0 + HEAD.x1) / 2;
  const c = headCls ? ` class="${headCls}"` : "";
  o.push(`<path${c} d="${HEAD.d}" transform="translate(${r(nx)} ${y}) scale(${HEAD_SCALE}) translate(${r(-cx)} 0)"/>`);
  const a = accGlyph(n);
  if (a) {
    const ax = nx - half - 0.28 - (a.x1 - a.x0);
    o.push(`<path${c} d="${a.d}" transform="translate(${r(ax)} ${y})"/>`);
  }
  return o;
}

export interface StaffOptions {
  /** "wide" für die Frage, "narrow" für kleine Notenzeilen (Auswahl, Tabelle) */
  variant?: "wide" | "narrow";
  range?: Range;
  className?: string;
  /** zusätzliche Attribute am <svg> */
  attrs?: string;
  label?: string;
}

/** SVG einer einzelnen Note; id = null zeigt nur Schlüssel und Linien. */
export function staffSvg(id: string | null, opt: StaffOptions = {}): string {
  const wide = opt.variant !== "narrow";
  const width = wide ? 15 : 7.6;
  const nx = wide ? 10 : 5.25; // Mitte des Notenkopfs
  const range = opt.range ?? staffRange(id ? [id] : []);
  const h = range.bottom - range.top;
  const o: string[] = [];
  for (let i = 0; i < 5; i++) {
    o.push(`<line class="sline" x1="0.15" x2="${width - 0.15}" y1="${-i}" y2="${-i}" stroke-width="${LINE_W}"/>`);
  }
  o.push(`<path class="clef" d="${GLYPHS.clef.d}" transform="translate(0.45 ${CLEF_Y})"/>`);
  if (id) o.push(noteParts(note(id), nx).join(""));
  const cls = ["staff", opt.className].filter(Boolean).join(" ");
  const label = opt.label ?? "Notenzeile";
  return (
    `<svg class="${cls}" viewBox="0 ${r(range.top)} ${width} ${r(h)}" role="img" aria-label="${label}"` +
    `${id ? ` data-note="${id}"` : ""}${opt.attrs ? " " + opt.attrs : ""}>${o.join("")}</svg>`
  );
}

/** Abstand der Noten einer Folge und Lage der ersten (Kopfmitte) */
const SEQ_STEP = 3.3;
const SEQ_X0 = 5.9;
/** Zeile für die Namen unter der Notenzeile: Höhe, Grundlinie (unter dem Bildausschnitt), Schriftgröße */
const SEQ_LABEL_H = 2.5;
const SEQ_LABEL_BASE = 1.85;
const SEQ_LABEL_SIZE = 1.55;

/** Mitte der Note i einer Folge (für Tests und die Oberfläche) */
export function seqNoteX(i: number): number {
  return SEQ_X0 + i * SEQ_STEP;
}

/** Name als SVG-Text mit eigener Hochzahl (wie .nn/.o in HTML) */
export function nameSvgText(id: string): string {
  const n = note(id);
  return `${n.name}<tspan class="o" font-size="0.58em" dy="-0.72em">${n.octave}</tspan>`;
}

/**
 * Notenzeile einer Tonfolge: alle Noten nebeneinander (ganze Notenköpfe ohne Takt und Hals), jede mit
 * eigenem Vorzeichen, darunter eine Zeile für die Namen. Jede Note ist eine Gruppe
 * `<g class="sn" data-i="…">` mit dem Strich für die aktuelle Note (.seqcur) und dem Namen (.sl, zu
 * Beginn leer); die Oberfläche setzt cur/hit/miss und füllt die Namen.
 */
export function staffSeqSvg(ids: string[], opt: { range?: Range; label?: string; className?: string } = {}): string {
  const base = opt.range ?? staffRange(ids);
  const range = { top: base.top, bottom: base.bottom + SEQ_LABEL_H };
  const width = seqNoteX(ids.length - 1) + 2.4;
  const h = range.bottom - range.top;
  const o: string[] = [];
  for (let i = 0; i < 5; i++) {
    o.push(`<line class="sline" x1="0.15" x2="${r(width - 0.15)}" y1="${-i}" y2="${-i}" stroke-width="${LINE_W}"/>`);
  }
  o.push(`<path class="clef" d="${GLYPHS.clef.d}" transform="translate(0.45 ${CLEF_Y})"/>`);
  const ly = base.bottom + SEQ_LABEL_BASE;
  ids.forEach((id, i) => {
    const nx = seqNoteX(i);
    o.push(
      `<g class="sn" data-i="${i}" data-note="${id}">${noteParts(note(id), nx, "nh").join("")}` +
        `<line class="seqcur" x1="${r(nx - 0.85)}" x2="${r(nx + 0.85)}" y1="${r(ly - 0.35)}" y2="${r(ly - 0.35)}" stroke-width="0.14"/>` +
        `<text class="sl" x="${r(nx)}" y="${r(ly)}" text-anchor="middle" font-size="${SEQ_LABEL_SIZE}"></text></g>`,
    );
  });
  const cls = ["staff", "seq", opt.className].filter(Boolean).join(" ");
  return (
    `<svg class="${cls}" viewBox="0 ${r(range.top)} ${r(width)} ${r(h)}" role="img" aria-label="${opt.label ?? "Notenzeile"}"` +
    ` data-notes="${ids.join(" ")}">${o.join("")}</svg>`
  );
}

/** Kleines Inline-Vorzeichen für Fließtext (♯ oder ♭), da EB Garamond diese Zeichen nicht hat. */
export function accidentalInline(kind: "sharp" | "flat"): string {
  const g = GLYPHS[kind];
  const w = g.x1 - g.x0;
  return (
    `<svg class="acc" viewBox="${g.x0 - 0.08} -1.8 ${r(w + 0.16)} 2.6" aria-label="${kind === "sharp" ? "Kreuz" : "B"}" role="img">` +
    `<path d="${g.d}"/></svg>`
  );
}
