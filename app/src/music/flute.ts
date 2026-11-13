// Griffbild wie flute() in heft/engrave.py, mit den feineren Maßen der App
// (siehe docs/app-entscheidungen.md, Abschnitt 7). Farben kommen aus CSS-Variablen (Dunkelmodus).

const HH = 8; // halbe Kopfbreite
const BW = 7; // halbe Korpusbreite
const TH = 134; // Gesamthöhe
const RB = 5.5; // Rundung unten
const SW = 0.7; // Kontur
const HW = 0.5; // Lochrand
const R = 3.0; // Lochradius
const BIG_R = 2.35;
const BIG_X = -2.0;
const SMALL_R = 1.4;
const SMALL_X = 3.35;
const HOLES_Y = [44, 55, 66, 81, 92, 103, 114];
const THUMB = [-13.6, 37] as const;

function hole(x: number, y: number, r: number, s: string): string {
  if (s === "h") {
    return (
      `<circle class="ho" cx="${x}" cy="${y}" r="${r}"/>` +
      `<path class="hx" d="M${x},${y - r} A${r},${r} 0 0 0 ${x},${y + r} Z"/>` +
      `<circle class="hr" cx="${x}" cy="${y}" r="${r}" fill="none" stroke-width="${HW}"/>`
    );
  }
  return `<circle class="${s === "x" ? "hx" : "ho"} hr" cx="${x}" cy="${y}" r="${r}" stroke-width="${HW}"/>`;
}

/** SVG des Griffbilds. fing = 8 Zeichen (Daumen, Loch 1–7), x/o/h. */
export function fluteSvg(fing: string, label = "Griffbild", attrs = ""): string {
  const o: string[] = [];
  o.push(
    `<path class="fw" d="M${-BW},26 L${-BW},${TH - RB} Q${-BW},${TH} ${-BW + RB},${TH} L${BW - RB},${TH} Q${BW},${TH} ${BW},${TH - RB} L${BW},26 Z" stroke-width="${SW}" stroke-linejoin="round"/>`,
  );
  o.push(
    `<path class="fw" d="M${-HH},30 L${-HH},9 C${-HH},2.2 ${-HH + 3.5},0 0,0 C${HH - 3.5},0 ${HH},2.2 ${HH},9 L${HH},30 Z" stroke-width="${SW}" stroke-linejoin="round"/>`,
  );
  o.push(`<rect class="fd" x="-3.4" y="13.5" width="6.8" height="4.6" rx="0.9" stroke-width="${SW * 0.8}"/>`);
  o.push(`<line class="fl" x1="${-BW}" y1="123.5" x2="${BW}" y2="123.5" stroke-width="${SW * 0.7}" opacity="0.7"/>`);
  o.push(`<line class="fl" x1="-3.6" y1="73.5" x2="3.6" y2="73.5" stroke-width="${SW * 0.75}"/>`);
  o.push(hole(THUMB[0], THUMB[1], R, fing[0]));
  for (let i = 0; i < 7; i++) {
    const s = fing[i + 1];
    const y = HOLES_Y[i];
    if (i < 5) o.push(hole(0, y, R, s));
    else {
      o.push(hole(BIG_X, y, BIG_R, "xh".includes(s) ? "x" : "o"));
      o.push(hole(SMALL_X, y, SMALL_R, s === "x" ? "x" : "o"));
    }
  }
  return (
    `<svg class="flute" viewBox="-17.5 -1 26.5 136" role="img" aria-label="${label}" data-fingering="${fing}"` +
    `${attrs ? " " + attrs : ""}>${o.join("")}</svg>`
  );
}
