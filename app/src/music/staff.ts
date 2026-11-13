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
    o.push(`<line x1="0.15" x2="${width - 0.15}" y1="${-i}" y2="${-i}" stroke-width="${LINE_W}"/>`);
  }
  o.push(`<path d="${GLYPHS.clef.d}" transform="translate(0.45 ${CLEF_Y})"/>`);
  if (id) {
    const n = note(id);
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
    o.push(
      `<path d="${HEAD.d}" transform="translate(${r(nx)} ${y}) scale(${HEAD_SCALE}) translate(${r(-cx)} 0)"/>`,
    );
    const a = accGlyph(n);
    if (a) {
      const ax = nx - half - 0.28 - (a.x1 - a.x0);
      o.push(`<path d="${a.d}" transform="translate(${r(ax)} ${y})"/>`);
    }
  }
  const cls = ["staff", opt.className].filter(Boolean).join(" ");
  const label = opt.label ?? "Notenzeile";
  return (
    `<svg class="${cls}" viewBox="0 ${r(range.top)} ${width} ${r(h)}" role="img" aria-label="${label}"` +
    `${id ? ` data-note="${id}"` : ""}${opt.attrs ? " " + opt.attrs : ""}>${o.join("")}</svg>`
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
