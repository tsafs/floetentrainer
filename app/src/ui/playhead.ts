// Mitlaufender Balken im Notenbild (Abspielposition), für Vorspielen und Mitspielen im Takt-Modus.
//
// Ein senkrechter, halbtransparenter Balken über die Höhe des Notensystems der aktuellen Zeile. Seine
// x-Lage kommt aus der Stelle im Zeitplan (in Vierteln): zwischen den Notenköpfen (bzw. Pausen) eines
// Takts linear verteilt, nach der letzten Note des Takts weiter bis zum ersten Kopf des nächsten Takts
// (in derselben Zeile) bzw. bis zum Taktstrich am Zeilenende – so läuft er gleichmäßig im Tempo. Beim
// Zeilenwechsel und bei Sprüngen der Wiederholung springt er. Beim Einzählen steht er an der ersten
// Note, im Warte-Modus des Mitspielens an der Note, auf die gewartet wird.
//
// Bewegt wird er in jedem Bild nur über transform (kein Layout); Höhe und Zeile werden nur beim
// Zeilenwechsel gesetzt. Die Lage der Zeilen wird beim ersten Zeigen nach dem Zeichnen gemessen.

import type { Score } from "../songs/engrave";
import type { Song } from "../songs/model";
import type { Timeline } from "../songs/timeline";

const EPS = 1e-6;
/** Breite des Balkens in px */
const WIDTH = 2.5;
/** so weit (in Zwischenräumen) ragt er über die oberste und unter die unterste Notenlinie */
const OVER = 1.1;

/** Lage des Balkens: Zeile und x in Pixeln (bezogen auf das SVG der Zeile) */
export interface PlayheadSpot {
  sys: number;
  x: number;
}

/** letzter Index i mit key(arr[i]) ≤ x, sonst -1 */
function lastAtOrBefore<T>(arr: readonly T[], x: number, key: (v: T) => number): number {
  let lo = 0;
  let hi = arr.length - 1;
  let res = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (key(arr[mid]) <= x + EPS) {
      res = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return res;
}

/** Wo steht der Balken an der Stelle q (Viertel im Zeitplan tl; negativ = Einzählen)? */
export function playheadSpot(song: Song, score: Pick<Score, "barGeom">, tl: Timeline, q: number): PlayheadSpot | null {
  const bars = tl.bars;
  if (!bars.length) return null;
  const j = Math.max(0, lastAtOrBefore(bars, q, (b) => b.start));
  const b = bars[j];
  const g = score.barGeom(b.index);
  const evs = song.bars[b.index]?.events;
  if (!g || !evs?.length || !g.xs.length) return null;
  const r = Math.min(Math.max(q - b.start, 0), b.dur);
  const k = Math.max(0, lastAtOrBefore(evs, r, (e) => e.offset));
  const q0 = evs[k].offset;
  const x0 = g.xs[k];
  let q1: number;
  let x1: number;
  if (k + 1 < evs.length) {
    q1 = evs[k + 1].offset;
    x1 = g.xs[k + 1];
  } else {
    q1 = b.dur;
    x1 = g.x1;
    // geht es nahtlos im nächsten Takt derselben Zeile weiter: bis zu dessen erstem Kopf
    const nb = bars[j + 1];
    const ng = nb && nb.index === b.index + 1 && Math.abs(nb.start - (b.start + b.dur)) < EPS ? score.barGeom(nb.index) : undefined;
    if (ng && ng.sys === g.sys && ng.xs.length) x1 = ng.xs[0];
  }
  const f = q1 - q0 > EPS ? Math.min(1, Math.max(0, (r - q0) / (q1 - q0))) : 0;
  return { sys: g.sys, x: x0 + (x1 - x0) * f };
}

export class Playhead {
  /** der Balken (liegt im Behälter des Notenbilds, absolut positioniert) */
  readonly el: HTMLDivElement;
  private host: HTMLElement | null = null;
  private score: Score | null = null;
  /** linker und oberer Rand jeder Zeile relativ zum Behälter (gemessen beim ersten Zeigen) */
  private origins: { x: number; y: number }[] | null = null;
  private sys = -1;
  private x = 0;
  private y = 0;
  private last: { tl: Timeline; q: number } | null = null;

  constructor(private readonly song: Song) {
    this.el = document.createElement("div");
    this.el.className = "playhead";
    this.el.setAttribute("aria-hidden", "true");
    this.el.dataset.testid = "playhead";
  }

  /** Nach jedem (Neu-)Zeichnen: Balken in den Behälter hängen; eine angezeigte Stelle bleibt stehen. */
  attach(host: HTMLElement, score: Score): void {
    this.host = host;
    this.score = score;
    this.origins = null;
    this.sys = -1;
    host.append(this.el);
    if (this.last) this.show(this.last.tl, this.last.q);
    else this.hide();
  }

  /** Balken an die Stelle q (Viertel im Zeitplan tl) stellen; null blendet ihn aus. */
  show(tl: Timeline | null, q: number | null): void {
    if (!tl || q == null || !this.score || !this.host) {
      this.hide();
      return;
    }
    this.last = { tl, q };
    const spot = playheadSpot(this.song, this.score, tl, q);
    if (!spot) {
      this.el.classList.remove("on");
      return;
    }
    if (spot.sys !== this.sys) {
      const o = (this.origins ??= this.measure())[spot.sys] ?? { x: 0, y: 0 };
      const st = this.score.staffPx(spot.sys);
      this.x = o.x;
      this.y = o.y + st.top - OVER * st.unit;
      this.el.style.height = `${(st.bottom - st.top + 2 * OVER * st.unit).toFixed(1)}px`;
      this.sys = spot.sys;
    }
    this.el.style.transform = `translate3d(${(this.x + spot.x - WIDTH / 2).toFixed(2)}px, ${this.y.toFixed(1)}px, 0)`;
    this.el.classList.add("on");
    this.el.dataset.sys = String(spot.sys);
  }

  hide(): void {
    this.last = null;
    this.el.classList.remove("on");
  }

  /** Lage der Zeilen im Behälter (einmal je Zeichnen) */
  private measure(): { x: number; y: number }[] {
    const h = this.host!.getBoundingClientRect();
    return this.score!.systems.map((s) => {
      const r = s.el.getBoundingClientRect();
      return { x: r.left - h.left, y: r.top - h.top };
    });
  }
}
