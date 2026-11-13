// Notensatz eines Lieds, Teil 2: Zeichnen als SVG (Vorbild render_staff_system in heft/engrave.py).
// engraveScore liefert je Zeile ein SVG als Zeichenkette (ohne DOM, in Vitest prüfbar), renderScore baut
// daraus die Elemente für die Liederseite und gibt die Haken für Markierung und Taktauswahl zurück.
//
// Haken für die Oberfläche (Gestaltung in styles.css, Abschnitt „Notensatz der Lieder“):
// - jede Note und Pause ist eine Gruppe <g class="n" data-id> bzw. <g class="r" data-id>;
//   Klasse "cur" färbt die gerade klingende Note (Kopf, Hals, Fähnchen, Vorzeichen, Punkt).
// - jeder Takt hat ein unsichtbares Rechteck <rect class="takt" data-bar> über die ganze Zeilenhöhe samt
//   Liedtext zum Antippen; Klassen "inloop" (Takt im gewählten Abschnitt) und "sel" (gerade angetippt)
//   hinterlegen den Takt zart.
// Einheiten wie in layout.ts: 1 = ein Zwischenraum, y = 0 unterste Linie, y nach unten.

import { GLYPHS, type Glyph } from "../music/bravura";
import type { BarEvent, KeyInfo, NoteEvent, Song } from "./model";
import {
  BAR_W,
  CANCEL_GAP,
  CLEF_X,
  DOUBLE_GAP,
  DOT_GAP,
  HEAD_SCALE,
  KEY_STEP,
  LEDGER_OVER,
  accGap,
  accGlyph,
  headGlyph,
  headHalf,
  layoutScore,
  restGlyph,
  textWidth,
  timeSigWidth,
  type BarLayout,
  type KeySwitch,
  type ScoreLayout,
  type SystemLayout,
} from "./layout";

export { layoutScore } from "./layout";

const LINE_W = 0.13;
const STEM_W = 0.12;
const LEDGER_W = 0.16;
const BEAM_TH = 0.5;
const STEM_LEN = 3.5;
const BEAM_STEM = 3.25;

const r = (v: number) => String(Math.round(v * 1000) / 1000);
const Y = (pos: number) => -pos / 2;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function glyph(g: Glyph, x: number, y: number, scale = 1): string {
  return `<path d="${g.d}" transform="translate(${r(x)} ${r(y)})${scale !== 1 ? ` scale(${scale})` : ""}"/>`;
}
function line(x1: number, y1: number, x2: number, y2: number, w: number, cls = ""): string {
  return `<line${cls ? ` class="${cls}"` : ""} x1="${r(x1)}" y1="${r(y1)}" x2="${r(x2)}" y2="${r(y2)}" stroke-width="${w}"/>`;
}
function rect(x: number, y: number, w: number, h: number): string {
  return `<rect x="${r(x)}" y="${r(y)}" width="${r(w)}" height="${r(h)}"/>`;
}

/** Bogen als gefüllte Sichel wie im Heft; side −1 = nach oben gewölbt, +1 = nach unten */
function arc(xa: number, ya: number, xb: number, yb: number, side: number, h: number, cls: string): string {
  const t = 0.2;
  const mx = (xa + xb) / 2;
  const my = (ya + yb) / 2;
  return (
    `<path class="${cls}" d="M${r(xa)} ${r(ya)}Q${r(mx)} ${r(my + side * h * 2)} ${r(xb)} ${r(yb)}` +
    `Q${r(mx)} ${r(my + side * (h * 2 - t * 2))} ${r(xa)} ${r(ya)}Z"/>`
  );
}

/** Lage einer gezeichneten Note */
interface Placed {
  ev: NoteEvent;
  sys: number;
  x: number;
  y: number;
  up: boolean;
  /** Halsende (y), bei ganzen Noten der Kopf */
  tip: number;
}

/** Ein gesetztes Notenbild: je Zeile ein SVG als Zeichenkette */
export interface EngravedScore {
  layout: ScoreLayout;
  systems: {
    /** Indizes der Takte (Song.bars) in dieser Zeile */
    bars: number[];
    svg: string;
    /** Breite und Höhe in CSS-Pixeln */
    width: number;
    height: number;
  }[];
}

/** Notenbild eines Lieds als SVG-Zeichenketten, eine je Zeile. width = verfügbare Breite in CSS-Pixeln. */
export function engraveScore(song: Song, opts: { width: number; sp?: number }): EngravedScore {
  const L = layoutScore(song, opts);
  const { metrics: M, systems, stems } = L;
  const W = L.width;
  const out: string[][] = systems.map(() => []);
  const top = systems.map(() => -4);
  const bottom = systems.map(() => 0);
  const ext = (k: number, y0: number, y1: number) => {
    top[k] = Math.min(top[k], y0);
    bottom[k] = Math.max(bottom[k], y1);
  };
  const placed = new Map<number, Placed>();
  /** Pausen: Mitte und senkrechte Ausdehnung (für Triolenklammern) */
  const restAt = new Map<number, { x: number; y0: number; y1: number }>();
  /** oberster Punkt von Zeichen über den Noten je Takt (Triolen), damit die Klammern 1./2. darüber stehen */
  const barTop = new Map<number, number>();
  /** Takt → (Zeile, Lage) */
  const barAt = new Map<number, { sys: number; bl: BarLayout }>();
  systems.forEach((sy, k) => sy.bars.forEach((bl) => barAt.set(bl.index, { sys: k, bl })));
  const bars = song.bars;

  // ---------------------------------------------------------- Linien, Kopf, Taktstriche, Noten
  systems.forEach((sy, k) => {
    const o = out[k];
    const right = sy.justified ? W - BAR_W / 2 : sy.right;
    for (let i = 0; i < 5; i++) o.push(line(0, -i, sy.justified ? W : right + BAR_W / 2, -i, LINE_W, "sl"));
    ext(k, -5.4, 0); // Schlüssel oben (unten reicht er nicht bis unter den Text)
    o.push(glyph(GLYPHS.clef, CLEF_X, -1));
    o.push(keySig(sy.key.signature, sy.keyX));
    if (sy.time) o.push(timeSig(sy.time.num, sy.time.den, sy.timeX + 0.1));
    if (k > 0) {
      const no = sy.bars[0].index + 1;
      o.push(`<text class="bno" x="0.05" y="-4.75" font-size="${r(M.small)}">${no}</text>`);
      ext(k, -4.75 - 0.75 * M.small, 0);
    }
    sy.bars.forEach((bl, bi) => {
      const bar = bars[bl.index];
      const prev = bars[bl.index - 1];
      // Wiederholungsbeginn: am Zeilenanfang nach dem Kopf, sonst anstelle des Taktstrichs
      if (bar.repeatStart) {
        if (bi === 0) o.push(repeatSign(sy.headerEnd - 0.35, 1));
        else if (prev?.barline !== "repeatEnd") o.push(repeatSign(bl.x0, 1));
      }
      if (bl.keyChange) o.push(keySwitchSigns(bl.keyChange.sw, bl.keyChange.x));
      if (bl.timeX != null) o.push(timeSig(bar.time.num, bar.time.den, bl.timeX));
      const next = bars[bl.index + 1];
      const lineEnd = bi === sy.bars.length - 1;
      const bx = lineEnd && sy.justified && !sy.courtesy ? W - BAR_W / 2 : bl.x1;
      switch (bar.barline) {
        case "single":
          if (!(next?.repeatStart && !lineEnd)) {
            o.push(line(bx, -4 - 0.065, bx, 0.065, BAR_W, "bl"));
            // Doppelstrich mitten im Stück (nur ABC): zwei dünne Striche
            if (bar.double) o.push(line(bx - DOUBLE_GAP, -4 - 0.065, bx - DOUBLE_GAP, 0.065, BAR_W, "bl"));
          }
          break;
        case "final":
          o.push(line(bx - 0.75 + BAR_W / 2, -4, bx - 0.75 + BAR_W / 2, 0, BAR_W, "bl"));
          o.push(rect(bx - 0.5 + BAR_W / 2, -4 - 0.065, 0.5, 4.13));
          break;
        case "repeatEnd":
          o.push(repeatSign(bx + BAR_W / 2, next?.repeatStart && !lineEnd ? 0 : -1));
          break;
        case "none":
          break;
      }
      drawBarNotes(k, bl, o);
    });
    // Ankündigung des Tonartwechsels am Zeilenende
    if (sy.courtesy) o.push(keySwitchSigns(sy.courtesy.sw, sy.courtesy.x));
  });

  /** Vorzeichnung ab x */
  function keySig(sig: KeyInfo["signature"], x: number): string {
    return sig.map((a, i) => glyph(GLYPHS[a.accidental], x + i * KEY_STEP, Y(a.pos))).join("");
  }

  /** Tonartwechsel: Auflösungszeichen, dann die neue Vorzeichnung */
  function keySwitchSigns(sw: KeySwitch, x: number): string {
    let p = sw.cancel.map((pos, i) => glyph(GLYPHS.natural, x + i * KEY_STEP, Y(pos))).join("");
    const x2 = x + sw.cancel.length * KEY_STEP + (sw.cancel.length ? CANCEL_GAP : 0);
    p += keySig(sw.sig, x2);
    return `<g class="key">${p}</g>`;
  }

  function timeSig(num: number, den: number, x: number): string {
    const w = timeSigWidth({ num, den });
    const digits = (n: number, y: number) => {
      const s = String(n);
      const dw = [...s].reduce((a, c) => a + GLYPHS[`time${c}`].adv, 0);
      let xx = x + (w - dw) / 2;
      let p = "";
      for (const c of s) {
        p += glyph(GLYPHS[`time${c}`], xx, y);
        xx += GLYPHS[`time${c}`].adv;
      }
      return p;
    };
    return digits(num, Y(6)) + digits(den, Y(2));
  }

  /** Wiederholungszeichen; dir 1 = Beginn |: (Strich bei x, Punkte rechts), −1 = Ende :|, 0 = beides :|: */
  function repeatSign(x: number, dir: 1 | -1 | 0): string {
    const dots = (xd: number) => `<circle cx="${r(xd)}" cy="${r(Y(3))}" r="0.24"/><circle cx="${r(xd)}" cy="${r(Y(5))}" r="0.24"/>`;
    const thin = (xt: number) => line(xt, -4, xt, 0, BAR_W, "bl");
    if (dir === 0) return rect(x - 0.25, -4.065, 0.5, 4.13) + thin(x - 0.6) + thin(x + 0.6) + dots(x - 1.05) + dots(x + 1.05);
    if (dir === 1) return rect(x, -4.065, 0.5, 4.13) + thin(x + 0.8) + dots(x + 1.25);
    return rect(x - 0.5, -4.065, 0.5, 4.13) + thin(x - 0.8) + dots(x - 1.25);
  }

  function drawBarNotes(k: number, bl: BarLayout, o: string[]): void {
    const bar = bars[bl.index];
    const tips = new Map<number, { x: number; tip: number }>();
    // Balken
    const done = new Set<NoteEvent[]>();
    bar.events.forEach((e) => {
      const st = e.kind === "note" ? stems.get(e.id) : undefined;
      if (!st?.group || done.has(st.group)) return;
      done.add(st.group);
      const g = st.group;
      const up = st.up;
      const xs = g.map((n) => {
        const x = bl.xs[bar.events.indexOf(n)];
        const h = headHalf(n.dur);
        return up ? x + h - STEM_W / 2 : x - h + STEM_W / 2;
      });
      const ys = g.map((n) => Y(n.pitch.pos));
      const dx = xs[xs.length - 1] - xs[0];
      const rise = Math.max(-1, Math.min(1, (ys[ys.length - 1] - ys[0]) * 0.5));
      const slope = dx ? rise / dx : 0;
      let b0 = up
        ? Math.min(...ys.map((y, q) => y - BEAM_STEM - slope * (xs[q] - xs[0])))
        : Math.max(...ys.map((y, q) => y + BEAM_STEM - slope * (xs[q] - xs[0])));
      // Balken reicht mindestens bis zur Mittellinie
      if (up) b0 = Math.min(b0, -2 - Math.max(0, slope * dx));
      else b0 = Math.max(b0, -2 - Math.min(0, slope * dx));
      const bl0 = (x: number) => b0 + slope * (x - xs[0]);
      const sg = up ? 1 : -1;
      const beam = (xa: number, xb: number, off: number) =>
        `<path d="M${r(xa)} ${r(bl0(xa) + off)}L${r(xb)} ${r(bl0(xb) + off)}L${r(xb)} ${r(bl0(xb) + off + sg * BEAM_TH)}L${r(xa)} ${r(bl0(xa) + off + sg * BEAM_TH)}Z"/>`;
      o.push(beam(xs[0] - STEM_W / 2, xs[xs.length - 1] + STEM_W / 2, 0));
      // Sechzehntel: zweiter Balken, einzelne als kurzer Stummel zur Nachbarnote
      g.forEach((n, q) => {
        if (n.dur !== 16) return;
        const nx = g[q + 1]?.dur === 16;
        const pv = g[q - 1]?.dur === 16;
        if (nx) o.push(beam(xs[q] - STEM_W / 2, xs[q + 1] + STEM_W / 2, sg * 0.75));
        else if (!pv) {
          const xa = q > 0 ? xs[q] - 1.1 : xs[q] - STEM_W / 2;
          const xb = q > 0 ? xs[q] + STEM_W / 2 : xs[q] + 1.1;
          o.push(beam(xa, xb, sg * 0.75));
        }
      });
      g.forEach((n, q) => tips.set(n.id, { x: xs[q], tip: bl0(xs[q]) }));
      for (const q of xs.keys()) ext(k, bl0(xs[q]) - BEAM_TH, bl0(xs[q]) + BEAM_TH);
    });

    bar.events.forEach((e, q) => {
      const x = bl.xs[q];
      if (e.kind === "rest") {
        const g = restGlyph(e.dur);
        const y = e.dur === 1 ? Y(6) : Y(4);
        const w = g.x1 - g.x0;
        let p = glyph(g, x - w / 2 - g.x0, y);
        if (e.dots) p += glyph(GLYPHS.dot, x + w / 2 + DOT_GAP, Y(5));
        o.push(`<g class="r" data-id="${e.id}">${p}</g>`);
        ext(k, y + g.y0, y + g.y1);
        restAt.set(e.id, { x, y0: y + g.y0, y1: y + g.y1 });
        return;
      }
      const pos = e.pitch.pos;
      const y = Y(pos);
      const hg = headGlyph(e.dur);
      const hh = headHalf(e.dur);
      // Hilfslinien
      for (let p = -2; p >= pos; p -= 2) o.push(line(x - hh - LEDGER_OVER, Y(p), x + hh + LEDGER_OVER, Y(p), LEDGER_W, "ll"));
      for (let p = 10; p <= pos; p += 2) o.push(line(x - hh - LEDGER_OVER, Y(p), x + hh + LEDGER_OVER, Y(p), LEDGER_W, "ll"));
      let p = "";
      if (e.accidental) {
        const a = accGlyph(e.accidental);
        p += glyph(a, x - hh - accGap(pos) - (a.x1 - a.x0) - a.x0, y);
        ext(k, y + a.y0, y + a.y1);
      }
      const cx = (hg.x0 + hg.x1) / 2;
      p += `<path d="${hg.d}" transform="translate(${r(x)} ${r(y)}) scale(${HEAD_SCALE}) translate(${r(-cx)} 0)"/>`;
      ext(k, y - 0.5, y + 0.5);
      if (e.dots) p += glyph(GLYPHS.dot, x + hh + DOT_GAP, Y(pos % 2 ? pos : pos + 1));
      const st = stems.get(e.id)!;
      let tip = y;
      if (e.dur >= 2) {
        let sx: number;
        const tg = tips.get(e.id);
        if (tg) {
          sx = tg.x;
          tip = tg.tip;
        } else {
          const len = Math.max(STEM_LEN, Math.abs(pos - 4) / 2);
          sx = st.up ? x + hh - STEM_W / 2 : x - hh + STEM_W / 2;
          tip = st.up ? y - len : y + len;
          if (e.dur >= 8) {
            const fg = GLYPHS[`flag${e.dur}${st.up ? "Up" : "Down"}`];
            p += glyph(fg, sx - STEM_W / 2, tip);
            ext(k, tip + fg.y0, tip + fg.y1);
          }
        }
        const y0 = st.up ? y - 0.14 : y + 0.14;
        p += line(sx, y0, sx, tip, STEM_W);
        ext(k, Math.min(y0, tip), Math.max(y0, tip));
      }
      o.push(`<g class="n" data-id="${e.id}">${p}</g>`);
      placed.set(e.id, { ev: e, sys: k, x, y, up: st.up, tip });
    });
  }

  // ---------------------------------------------------------- Triolen (nur ABC)
  // Zahl p über bzw. unter der Gruppe, auf der Seite der Hälse. Bilden die Noten genau einen Balken,
  // steht nur die Zahl am Balken, sonst eine Klammer mit Haken und der Zahl in einer Lücke.
  systems.forEach((sy, k) => {
    for (const bl of sy.bars) {
      const evs = bars[bl.index].events;
      for (let a = 0; a < evs.length; a++) {
        const t = evs[a].tuplet;
        if (!t?.start) continue;
        let b = a;
        while (b < evs.length - 1 && !evs[b].tuplet?.end) b++;
        const s = tupletMark(evs.slice(a, b + 1), bl.xs.slice(a, b + 1), t.p, k);
        out[k].push(s.svg);
        if (s.top != null) barTop.set(bl.index, Math.min(barTop.get(bl.index) ?? 0, s.top));
        a = b;
      }
    }
  });

  /** Ziffern der Triolenzahl (Bravura), mittig um x, Grundlinie y */
  function tupletDigits(n: number, x: number, y: number): { svg: string; w: number; h: number } {
    const gs = [...String(n)].map((c) => GLYPHS[`tuplet${c}`]);
    const w = gs.reduce((a, g) => a + g.adv, 0);
    let xx = x - w / 2;
    let svg = "";
    for (const g of gs) {
      svg += glyph(g, xx, y);
      xx += g.adv;
    }
    return { svg, w, h: -Math.min(...gs.map((g) => g.y0)) };
  }

  function tupletMark(evs: BarEvent[], xs: number[], p: number, k: number): { svg: string; top: number | null } {
    const ns = evs.filter((e): e is NoteEvent => e.kind === "note").map((e) => placed.get(e.id)!);
    const g0 = ns.length ? stems.get(ns[0].ev.id)?.group : null;
    const beamed = !!g0 && ns.length === evs.length && g0.length === evs.length && ns.every((q) => stems.get(q.ev.id)?.group === g0);
    const ups = ns.filter((q) => q.up).length;
    const above = ns.length ? (beamed ? ns[0].up : ups * 2 >= ns.length) : true;
    const sg = above ? -1 : 1;
    const DH = 1.5; // Höhe der Ziffern
    if (beamed) {
      // Zahl am Balken, mittig zwischen dem ersten und letzten Hals
      const f = ns[0];
      const l = ns[ns.length - 1];
      const hf = headHalf(f.ev.dur);
      const sx = (q: Placed) => (q.up ? q.x + hf - STEM_W / 2 : q.x - hf + STEM_W / 2);
      const xm = (sx(f) + sx(l)) / 2;
      const tm = (f.tip + l.tip) / 2;
      // über den Hälsen: Balken liegt unter tip, Zahl darüber; sonst unter dem Balken
      let edge = above ? Math.min(...ns.map((q) => q.tip)) : Math.max(...ns.map((q) => q.tip));
      edge = above ? Math.min(edge, tm) : Math.max(edge, tm);
      const base = above ? edge - 0.35 : edge + 0.35 + DH;
      const d = tupletDigits(p, xm, base);
      ext(k, base - d.h, base);
      return { svg: `<g class="tup">${d.svg}</g>`, top: above ? base - d.h : null };
    }
    // Klammer: waagerecht, mit Abstand zu Köpfen, Hälsen und Pausen
    let edge = above ? Infinity : -Infinity;
    evs.forEach((e) => {
      if (e.kind === "rest") {
        const ra = restAt.get(e.id)!;
        edge = above ? Math.min(edge, ra.y0) : Math.max(edge, ra.y1);
        return;
      }
      const q = placed.get(e.id)!;
      const stemSide = q.ev.dur >= 2 && q.up === above;
      const ext0 = above ? Math.min(q.y - 0.5, stemSide ? q.tip : q.y - 0.5) : Math.max(q.y + 0.5, stemSide ? q.tip : q.y + 0.5);
      edge = above ? Math.min(edge, ext0) : Math.max(edge, ext0);
    });
    const yb = edge + sg * 1.0;
    const halfW = (e: BarEvent) => (e.kind === "note" ? headHalf(e.dur) : (restGlyph(e.dur).x1 - restGlyph(e.dur).x0) / 2);
    const xa = xs[0] - halfW(evs[0]) - 0.15;
    const xb = xs[xs.length - 1] + halfW(evs[evs.length - 1]) + 0.15;
    const xm = (xa + xb) / 2;
    const d = tupletDigits(p, xm, yb + DH / 2);
    const gap = d.w / 2 + 0.3;
    const hook = -sg * 0.6;
    const path =
      `M${r(xa)} ${r(yb + hook)}L${r(xa)} ${r(yb)}L${r(xm - gap)} ${r(yb)}` +
      `M${r(xm + gap)} ${r(yb)}L${r(xb)} ${r(yb)}L${r(xb)} ${r(yb + hook)}`;
    ext(k, Math.min(yb - DH / 2, yb + hook), Math.max(yb + DH / 2, yb + hook));
    return {
      svg: `<g class="tup"><path class="tupb" d="${path}" fill="none" stroke-width="0.12"/>${d.svg}</g>`,
      top: above ? yb - DH / 2 : null,
    };
  }

  // ---------------------------------------------------------- Bögen, Atemzeichen, Klammern
  const notes = song.notes;
  /** rechter Rand der Notenlinien einer Zeile */
  const lineRight = (k: number) => (systems[k].justified && !systems[k].courtesy ? W - BAR_W / 2 : systems[k].right);
  /** Bogen von a nach b (Noten in Lesereihenfolge), ggf. über Zeilenumbrüche */
  function bow(a: number, b: number, tie: boolean): void {
    const pa = placed.get(notes[a].id)!;
    const pb = placed.get(notes[b].id)!;
    const span = notes.slice(a, b + 1).map((n) => placed.get(n.id)!);
    // Haltebogen gegenüber dem Hals; Bindebogen unten nur, wenn alle Hälse nach oben zeigen (wie im Heft)
    const below = tie ? pa.up : span.every((p) => p.up);
    const side = below ? 1 : -1;
    for (let k = pa.sys; k <= pb.sys; k++) {
      const seg = span.filter((p) => p.sys === k);
      if (!seg.length) continue;
      const first = seg[0];
      const last = seg[seg.length - 1];
      const off = tie ? 0.62 : 0.85;
      const openL = k > pa.sys;
      const openR = k < pb.sys;
      const hhA = headHalf(first.ev.dur);
      const hhB = headHalf(last.ev.dur);
      const xa = openL ? systems[k].headerEnd - 0.3 : tie ? first.x + hhA * 0.7 : first.x;
      const xb = openR ? lineRight(k) - 0.2 : tie ? last.x - hhB * 0.7 : last.x;
      if (xb - xa < 0.6) continue;
      // offenes Ende am Zeilenumbruch: auf Höhe der Note am anderen Ende
      const ya = (openL ? last.y : first.y) + side * off;
      const yb = (openR ? first.y : last.y) + side * off;
      const len = xb - xa;
      let h = Math.min(tie ? 0.6 : 1.1, 0.22 + 0.07 * len);
      if (!tie) {
        // innere Noten freihalten
        for (const p of seg) {
          if (p === first && !openL) continue;
          if (p === last && !openR) continue;
          const t = (p.x - xa) / len;
          if (t <= 0.05 || t >= 0.95) continue;
          const chord = ya + (yb - ya) * t;
          let edge = p.y + side * 0.85;
          if (p.ev.dur >= 2 && p.up === !below) edge = side > 0 ? Math.max(edge, p.tip + 0.5) : Math.min(edge, p.tip - 0.5);
          const need = (side * (edge - chord)) / (4 * t * (1 - t));
          h = Math.max(h, Math.min(need, 3));
        }
      }
      out[k].push(arc(xa, ya, xb, yb, side, h, tie ? "tie" : "slur"));
      const ymid = (ya + yb) / 2 + side * h;
      ext(k, Math.min(ya, yb, ymid), Math.max(ya, yb, ymid));
    }
  }
  notes.forEach((n, i) => {
    if (n.tie && notes[i + 1]) bow(i, i + 1, true);
    if (n.slurStart) {
      let j = i;
      while (j < notes.length && !(notes[j].slurEnd && j > i)) j++;
      if (j < notes.length) bow(i, j, false);
    }
  });

  // Atemzeichen: über der Linie, gut halb zwischen Note und Folgendem (wie im Heft)
  for (const n of notes) {
    if (!n.breath) continue;
    const p = placed.get(n.id)!;
    const { bl } = barAt.get(n.bar)!;
    const q = bars[n.bar].events.indexOf(n);
    const xn = q + 1 < bl.xs.length ? bl.xs[q + 1] : bl.x1;
    const xb = p.x + 0.62 * (xn - p.x);
    const g = GLYPHS.breath;
    let y = Y(10.4);
    const noteTop = Math.min(p.y - 0.5, p.up && p.ev.dur >= 2 ? p.tip : 0);
    y = Math.min(y, noteTop - 0.4);
    out[p.sys].push(`<g class="br">${glyph(g, xb - (g.x1 - g.x0) / 2, y)}</g>`);
    ext(p.sys, y + g.y0, y);
  }

  // Wiederholungsklammern 1. / 2.: je Zeile ein Stück, Ziffer nur am Anfang, Haken am Anfang und am Ende der 1.
  // Bei ABC reicht eine Klammer über alle Takte bis zum nächsten Klammeranfang; Beschriftung aus
  // voltaNumbers („3.“, „1., 2.“), Haken am Ende bei jeder Klammer, die mit :| endet.
  systems.forEach((sy, k) => {
    let q = 0;
    while (q < sy.bars.length) {
      const v = bars[sy.bars[q].index].volta;
      if (!v) {
        q++;
        continue;
      }
      let e = q;
      while (e + 1 < sy.bars.length && bars[sy.bars[e + 1].index].volta === v && !bars[sy.bars[e + 1].index].voltaStart) e++;
      const b0 = bars[sy.bars[q].index];
      const b1 = bars[sy.bars[e].index];
      const startHere = b0.voltaStart;
      const nb = bars[b1.index + 1];
      const endHere = v === 1 ? b1.barline === "repeatEnd" : !(nb?.volta === 2 && !nb.voltaStart);
      let topPos = 11;
      for (let t = q; t <= e; t++) {
        for (const ev of bars[sy.bars[t].index].events) {
          if (ev.kind !== "note") continue;
          const p = placed.get(ev.id)!;
          topPos = Math.max(topPos, -2 * Math.min(p.y - 0.5, p.up ? p.tip : p.y) + 2.2);
        }
        const bt = barTop.get(sy.bars[t].index);
        if (bt != null) topPos = Math.max(topPos, -2 * bt + 1.6);
      }
      const xa = (q === 0 ? sy.headerEnd : sy.bars[q].x0) + (startHere ? 0.3 : 0);
      const label = b0.voltaNumbers?.length ? b0.voltaNumbers.map((n) => `${n}.`).join(", ") : `${v}.`;
      if (startHere) {
        // Beschriftung steht unter der Linie: hohe Noten darunter bekommen Abstand zur Schrift
        const lx1 = xa + 0.4 + textWidth(label, M.small) + 0.3;
        for (const ev of b0.events) {
          if (ev.kind !== "note") continue;
          const p = placed.get(ev.id)!;
          const hh = headHalf(ev.dur);
          if (p.x - hh > lx1) break;
          const top = Math.min(p.y - 0.5, p.up && ev.dur >= 2 ? p.tip : p.y, ev.accidental ? p.y - 1.6 : 0);
          topPos = Math.max(topPos, -2 * top + 3.2);
        }
      }
      const yv = Y(topPos);
      const lastX1 = e === sy.bars.length - 1 && sy.justified && !sy.courtesy ? W - BAR_W / 2 : sy.bars[e].x1;
      const xb = endHere ? lastX1 - (v === 1 ? 1.7 : 0.4) : lastX1;
      const hook = 1.5;
      let d = `M${r(xa)} ${r(startHere ? yv + hook : yv)}L${r(xa)} ${r(yv)}L${r(xb)} ${r(yv)}`;
      if (v === 1 && endHere) d += `L${r(xb)} ${r(yv + hook)}`;
      let s = `<path class="volta" d="${d}" fill="none" stroke-width="0.12"/>`;
      if (startHere) s += `<text class="vno" x="${r(xa + 0.4)}" y="${r(yv + 1.2)}" font-size="${r(M.small)}">${label}</text>`;
      out[k].push(s);
      ext(k, yv - 0.1, yv);
      q = e + 1;
    }
  });

  // ---------------------------------------------------------- Höhe: für alle Zeilen gleich (wie im Heft)
  const yTop = Math.min(...top) - 0.6;
  const notBottom = Math.max(1.2, ...bottom);
  const lyr = M.lyr;
  const yLyr = notBottom + 0.75 + 0.68 * lyr;
  const yBottom = song.hasLyrics ? yLyr + 0.32 * lyr + 1.0 : notBottom + 1.4;

  // ---------------------------------------------------------- Liedtext
  if (song.hasLyrics) {
    const sylNotes = notes.filter((n) => n.syllable);
    const yh = yLyr - 0.27 * lyr;
    const hy = (k: number, xa: number, xb: number) => out[k].push(line(xa, yh, xb, yh, 0.11, "hy"));
    sylNotes.forEach((n, i) => {
      const p = placed.get(n.id)!;
      const syl = n.syllable!;
      const w = textWidth(syl.text, lyr);
      out[p.sys].push(`<text class="syl" x="${r(p.x)}" y="${r(yLyr)}" font-size="${r(lyr)}">${esc(syl.text)}</text>`);
      const xa = p.x + w / 2;
      // Trennstrich zur nächsten Silbe (am Zeilenende hinter der Silbe)
      if (syl.hyphen) {
        const nx = sylNotes[i + 1] && placed.get(sylNotes[i + 1].id)!;
        if (nx && nx.sys === p.sys) {
          const xb = nx.x - textWidth(sylNotes[i + 1].syllable!.text, lyr) / 2;
          const len = Math.min(0.32 * lyr, Math.max(0.18 * lyr, (xb - xa) * 0.4));
          if (xb - xa > len + 0.1) hy(p.sys, (xa + xb) / 2 - len / 2, (xa + xb) / 2 + len / 2);
        } else if (nx) hy(p.sys, xa + 0.3, xa + 0.3 + 0.28 * lyr);
      }
      // Melisma-Linie bis zur letzten Note ohne Silbe
      if (syl.extendTo != null) {
        const t = placed.get(syl.extendTo)!;
        const yl = yLyr + 0.12;
        for (let k = p.sys; k <= t.sys; k++) {
          const x0 = k === p.sys ? xa + 0.2 : systems[k].headerEnd;
          const x1 = k === t.sys ? t.x + headHalf(t.ev.dur) + 0.1 : lineRight(k) - 0.1;
          if (x1 > x0 + 0.4) out[k].push(line(x0, yl, x1, yl, 0.1, "mel"));
        }
      }
    });
  }

  // ---------------------------------------------------------- Zusammensetzen
  const sp = M.sp;
  const h = yBottom - yTop;
  const result = systems.map((sy: SystemLayout, k) => {
    const hits = sy.bars
      .map((bl, bi) => {
        const x0 = bi === 0 ? 0 : bl.x0;
        const x1 = bi === sy.bars.length - 1 ? W : bl.x1;
        return `<rect class="takt" data-bar="${bl.index}" x="${r(x0)}" y="${r(yTop)}" width="${r(x1 - x0)}" height="${r(h)}"/>`;
      })
      .join("");
    const vbW = sy.scale < 1 ? W / sy.scale : W;
    const vbH = sy.scale < 1 ? h / sy.scale : h;
    const wPx = W * sp;
    const hPx = h * sp;
    const first = sy.bars[0].index + 1;
    const lastNo = sy.bars[sy.bars.length - 1].index + 1;
    const svg =
      `<svg class="sys" xmlns="http://www.w3.org/2000/svg" viewBox="0 ${r(yTop)} ${r(vbW)} ${r(vbH)}" ` +
      `width="${r(wPx)}" height="${r(hPx)}" role="img" aria-label="Takt ${first}${lastNo > first ? `–${lastNo}` : ""}">` +
      hits +
      out[k].join("") +
      `</svg>`;
    return { bars: sy.bars.map((b) => b.index), svg, width: wPx, height: hPx };
  });
  return { layout: L, systems: result };
}

// ---------------------------------------------------------------- DOM

/** Notenbild auf der Seite, mit Haken für Markierung, Mitscrollen und Taktauswahl */
export interface Score {
  /** <div class="score"> mit einem <svg class="sys"> je Zeile */
  el: HTMLElement;
  /** Zeilen von oben nach unten: SVG und die Indizes ihrer Takte (Song.bars) */
  systems: { el: SVGSVGElement; bars: number[] }[];
  /** Gruppe einer Note oder Pause (Kennung NoteEvent.id); Klasse "cur" markiert sie */
  noteEl(id: number): SVGGElement | undefined;
  /** Tipp-Rechteck eines Takts (data-bar); Klassen "inloop" und "sel" hinterlegen ihn */
  barEl(index: number): SVGRectElement | undefined;
  /** Zeile (Index in systems), in der ein Takt steht */
  systemOfBar(index: number): number;
  /** ein Zwischenraum in CSS-Pixeln */
  sp: number;
}

/**
 * Setzt ein Lied für die verfügbare Breite (CSS-Pixel). Beim Drehen oder bei anderer Breite einfach neu
 * aufrufen und das alte Element ersetzen. Ereignisse behandelt die Oberfläche selbst (z. B. Klick auf
 * [data-bar] im Element el).
 */
export function renderScore(song: Song, opts: { width: number; sp?: number }): Score {
  const eng = engraveScore(song, opts);
  const el = document.createElement("div");
  el.className = "score";
  el.innerHTML = eng.systems.map((s) => s.svg).join("");
  const svgs = [...el.querySelectorAll<SVGSVGElement>("svg.sys")];
  const notes = new Map<number, SVGGElement>();
  el.querySelectorAll<SVGGElement>("g[data-id]").forEach((g) => notes.set(Number(g.dataset.id), g));
  const barRects = new Map<number, SVGRectElement>();
  el.querySelectorAll<SVGRectElement>("rect[data-bar]").forEach((b) => barRects.set(Number(b.dataset.bar), b));
  const sysOf = new Map<number, number>();
  eng.systems.forEach((s, k) => s.bars.forEach((b) => sysOf.set(b, k)));
  return {
    el,
    systems: eng.systems.map((s, k) => ({ el: svgs[k], bars: s.bars })),
    noteEl: (id) => notes.get(id),
    barEl: (i) => barRects.get(i),
    systemOfBar: (i) => sysOf.get(i) ?? -1,
    sp: eng.layout.metrics.sp,
  };
}
