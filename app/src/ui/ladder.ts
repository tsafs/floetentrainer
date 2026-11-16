// Wischbare Notenzeile („Tonleiter“) für Startseite und Grifftabelle: Der Violinschlüssel bleibt links stehen,
// die Töne gleiten darunter durch. Unter jeder Note steht, was die Seite braucht (Name und Punkte-Balken auf der
// Startseite, Name und Griffbild in der Grifftabelle). Finger scrollen nativ, die Maus zieht mit Schwung, das
// Mausrad scrollt quer. Jede Spalte ist ein Knopf; Pfeiltasten wandern von Ton zu Ton.
//
// Maße in Bildpunkten: `space` ist ein Zwischenraum der Notenzeile, `base` die Lage der untersten Linie.
// Farben kommen aus CSS-Klassen der Spalte (learned, weak, next, wait; styles.css „Tonleiter“).

import { GLYPHS } from "../music/bravura";
import { nameText } from "../music/names";
import { note, type Note } from "../music/notes";

const HEAD_SCALE = 0.82; // wie music/staff.ts
const CLEF_W = 80; // Breite der festen Schlüssel-Spalte

export interface LadderGeom {
  /** Bildpunkte je Zwischenraum */
  space: number;
  /** y der untersten Linie */
  base: number;
  /** Spaltenbreite */
  col: number;
  /** Platz links vor der ersten Spalte (unter dem Schlüssel) */
  padLeft: number;
  height: number;
  /** senkrechter Ausschnitt der Schlüssel-Spalte (nur Notenzeile, nicht was darunter steht) */
  clefTop: number;
  clefHeight: number;
  /** Platz rechts nach der letzten Spalte (Standard 40) */
  padRight?: number;
}

export interface LadderColumn {
  id: string;
  /** Zustand für die Farbe: learned | weak | next | wait */
  state: string;
  /** SVG unter der Notenzeile; x ist die Spaltenmitte */
  below: (x: number) => string;
  /** zusätzlicher Text für Bildschirmleser */
  label?: string;
}

const r = (v: number) => Math.round(v * 100) / 100;
const y = (g: LadderGeom, pos: number) => g.base - (pos * g.space) / 2;

function staffLines(g: LadderGeom, x0: number, x1: number): string {
  let s = "";
  for (let i = 0; i < 5; i++) {
    const ly = g.base - i * g.space;
    s += `<line class="sline" x1="${x0}" x2="${x1}" y1="${ly}" y2="${ly}"/>`;
  }
  return s;
}

/** Notenkopf, Vorzeichen und Hilfslinien einer Note mit Kopfmitte bei x */
export function ladderNote(g: LadderGeom, n: Note, x: number): string {
  const head = GLYPHS.whole;
  const half = ((head.x1 - head.x0) * HEAD_SCALE * g.space) / 2;
  let s = "";
  const ledger = (q: number) =>
    (s += `<line class="led" x1="${r(x - half - 3)}" x2="${r(x + half + 3)}" y1="${y(g, q)}" y2="${y(g, q)}"/>`);
  for (let q = -2; q >= n.pos; q -= 2) ledger(q);
  for (let q = 10; q <= n.pos; q += 2) ledger(q);
  const cx = (head.x0 + head.x1) / 2;
  s += `<path class="nh" d="${head.d}" transform="translate(${r(x)} ${y(g, n.pos)}) scale(${r(g.space * HEAD_SCALE)}) translate(${r(-cx)} 0)"/>`;
  const a = n.alter > 0 ? GLYPHS.sharp : n.alter < 0 ? GLYPHS.flat : null;
  if (a) {
    const ax = x - half - g.space * 0.22 - (a.x1 - a.x0) * g.space;
    s += `<path class="nh" d="${a.d}" transform="translate(${r(ax)} ${y(g, n.pos)}) scale(${g.space})"/>`;
  }
  return s;
}

/** Name als SVG-Text mit kleiner Hochzahl (wie .nn/.o in HTML) */
export function ladderName(id: string, x: number, ty: number, size: number, cls = "nm", prefix = ""): string {
  const n = note(id);
  return `<text class="${cls}" x="${r(x)}" y="${ty}" text-anchor="middle" font-size="${size}">${prefix}${n.name}<tspan font-size="${r(size * 0.58)}" dy="${r(-size * 0.38)}">${n.octave}</tspan></text>`;
}

export interface LadderOptions {
  testid: string;
  label: string;
  /** Hinterlegung von Spalte a bis b (z. B. gelernter Bereich) */
  band?: [number, number];
  /** Kopfzeile über der Notenzeile (HTML), z. B. „Stufe 5“ links und „10 von 31 Tönen“ rechts */
  head?: string;
}

export function ladderHtml(g: LadderGeom, cols: LadderColumn[], opt: LadderOptions): string {
  const colX = (i: number) => g.padLeft + i * g.col + g.col / 2;
  const width = g.padLeft + cols.length * g.col + (g.padRight ?? 40);
  let s = "";
  if (opt.band) {
    const [a, b] = opt.band;
    s += `<rect class="band" x="${colX(a) - g.col / 2}" y="${g.base - g.space * 5}" width="${colX(b) - colX(a) + g.col}" height="${g.space * 6.6}" rx="8"/>`;
  }
  s += staffLines(g, 0, width);
  cols.forEach((c, i) => {
    const x = colX(i);
    s +=
      `<g class="lc ${c.state}" data-note="${c.id}" data-i="${i}" role="button" tabindex="-1" aria-label="${nameText(c.id)}${c.label ? ", " + c.label : ""}">` +
      `<rect class="hl" x="${x - g.col / 2 + 1.5}" y="${g.clefTop}" width="${g.col - 3}" height="${g.height - g.clefTop - 2}" rx="9"/>` +
      ladderNote(g, note(c.id), x) +
      c.below(x) +
      `</g>`;
  });
  const clef = GLYPHS.clef;
  const clefSvg =
    `<svg width="${CLEF_W}" height="${g.clefHeight}" viewBox="0 ${g.clefTop} ${CLEF_W} ${g.clefHeight}">` +
    staffLines(g, 0, CLEF_W) +
    `<path class="clef" d="${clef.d}" transform="translate(20 ${g.base - g.space}) scale(${g.space})"/></svg>`;
  return (
    `<div class="ladder" data-testid="${opt.testid}">${opt.head ?? ""}` +
    `<div class="ladstrip" role="group" aria-label="${opt.label}"><svg width="${width}" height="${g.height}" viewBox="0 0 ${width} ${g.height}">${s}</svg></div>` +
    `<div class="ladclef" aria-hidden="true" style="top:${g.clefTop}px;height:${g.clefHeight}px">${clefSvg}</div></div>`
  );
}

export interface LadderHandle {
  /** Spalte wählen (markieren, fokussierbar machen); scroll: in den sichtbaren Bereich holen */
  select(id: string, scroll?: "center" | "nearest" | false): void;
  destroy(): void;
}

/**
 * Bedienung einer gezeichneten Leiste. onPick bekommt den Ton, ob er schon gewählt war (zweites Tippen) und
 * wie er gewählt wurde: "activate" (Tippen, Klick, Enter, Leertaste) oder "move" (Pfeiltaste – nur wählen,
 * nie eine andere Seite öffnen).
 */
export type PickHow = "activate" | "move";
export function wireLadder(
  root: HTMLElement,
  g: LadderGeom,
  onPick: (id: string, again: boolean, how: PickHow) => void,
): LadderHandle {
  const strip = root.querySelector<HTMLElement>(".ladstrip")!;
  const cols = [...strip.querySelectorAll<SVGGElement>(".lc")];
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let current: string | null = null;

  const colLeft = (i: number) => g.padLeft + i * g.col;
  const scrollToCol = (i: number, mode: "center" | "nearest", smooth: boolean) => {
    const vis = strip.clientWidth - CLEF_W;
    const x = colLeft(i);
    let left: number;
    if (mode === "center") left = x + g.col / 2 - CLEF_W - vis / 2;
    else if (x < strip.scrollLeft + CLEF_W) left = x - CLEF_W - 4;
    else if (x + g.col > strip.scrollLeft + strip.clientWidth - 30) left = x + g.col - strip.clientWidth + 34;
    else return;
    strip.scrollTo({ left: Math.max(0, left), behavior: smooth && !reduced ? "smooth" : "auto" });
  };

  const select = (id: string, scroll: "center" | "nearest" | false = "nearest", smooth = true) => {
    current = id;
    cols.forEach((c) => {
      const on = c.dataset.note === id;
      c.classList.toggle("sel", on);
      c.setAttribute("tabindex", on ? "0" : "-1");
      c.setAttribute("aria-pressed", String(on));
    });
    const i = cols.findIndex((c) => c.dataset.note === id);
    if (scroll && i >= 0) scrollToCol(i, scroll, smooth);
  };

  // Ziehen mit der Maus, mit Schwung; ein Ziehen wählt keinen Ton
  let drag: { x: number; s: number; lx: number; t: number; v: number } | null = null;
  let moved = false;
  let raf = 0;
  const down = (e: PointerEvent) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    cancelAnimationFrame(raf);
    drag = { x: e.clientX, s: strip.scrollLeft, lx: e.clientX, t: performance.now(), v: 0 };
    moved = false;
  };
  const move = (e: PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!moved && Math.abs(dx) > 4) {
      moved = true;
      strip.classList.add("grabbing");
    }
    if (!moved) return;
    strip.scrollLeft = drag.s - dx;
    const now = performance.now();
    drag.v = (e.clientX - drag.lx) / Math.max(1, now - drag.t);
    drag.lx = e.clientX;
    drag.t = now;
  };
  const up = () => {
    if (!drag) return;
    let v = moved && !reduced ? -drag.v * 16 : 0;
    drag = null;
    strip.classList.remove("grabbing");
    const step = () => {
      if (Math.abs(v) < 0.4) return;
      strip.scrollLeft += v;
      v *= 0.94;
      raf = requestAnimationFrame(step);
    };
    step();
  };
  strip.addEventListener("pointerdown", down);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  strip.addEventListener(
    "click",
    (e) => {
      if (moved) {
        e.stopPropagation();
        moved = false;
      }
    },
    true,
  );
  strip.addEventListener(
    "wheel",
    (e) => {
      // Mausrad quer scrollen, solange die Leiste in diese Richtung noch weiter kann; sonst scrollt die Seite
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      const max = strip.scrollWidth - strip.clientWidth;
      if (max <= 0 || (e.deltaY < 0 && strip.scrollLeft <= 0) || (e.deltaY > 0 && strip.scrollLeft >= max - 1)) return;
      e.preventDefault();
      strip.scrollLeft += e.deltaY;
    },
    { passive: false },
  );

  const pick = (c: SVGGElement, how: PickHow) => {
    const id = c.dataset.note!;
    const again = id === current;
    select(id, "nearest");
    onPick(id, again, how);
  };
  cols.forEach((c, i) => {
    c.addEventListener("click", () => pick(c, "activate"));
    c.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        pick(c, "activate");
      } else if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
        e.preventDefault();
        const t = cols[i + (e.key === "ArrowRight" ? 1 : -1)];
        if (!t) return;
        t.focus({ preventScroll: true });
        pick(t, "move");
      }
    });
  });
  // Ohne Auswahl ist die erste Spalte mit der Tastatur erreichbar (sonst hätten alle tabindex -1)
  if (cols.length && !cols.some((c) => c.getAttribute("tabindex") === "0")) cols[0].setAttribute("tabindex", "0");

  return {
    select: (id, scroll = "nearest") => select(id, scroll, false),
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    },
  };
}
