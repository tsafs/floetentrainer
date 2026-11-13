// Texte: Lage einer Note, Vorstellung neuer Töne und Hinweise nach Fehlern (feste Vorlagen).

import type { Kind } from "../music/levels";
import { joinNames, nameHtml } from "../music/names";
import { note, type Note } from "../music/notes";
import { accidentalInline } from "../music/staff";

const ORD = ["ersten", "zweiten", "dritten", "vierten", "fünften"];

/** Lage auf den Linien, als Satzende: „c¹ hat eine eigene Hilfslinie unter den Linien“. */
export function positionPhrase(n: Note): string {
  const p = n.pos;
  if (p === -2) return "hat eine eigene Hilfslinie unter den Linien";
  if (p === -1) return "hängt unter der untersten Linie";
  if (p === 0) return "liegt auf der untersten Linie";
  if (p === 8) return "liegt auf der obersten Linie";
  if (p === 9) return "liegt über der obersten Linie";
  if (p === 10) return "hat eine eigene Hilfslinie über den Linien";
  if (p === 11) return "liegt über der ersten Hilfslinie";
  if (p === 12) return "hat zwei Hilfslinien über den Linien";
  if (p % 2 === 0) return `liegt auf der ${ORD[p / 2]} Linie`;
  return `liegt im ${ORD[(p - 1) / 2]} Zwischenraum`;
}

function accText(n: Note): string {
  if (n.alter === 1) return `ein ${accidentalInline("sharp")}`;
  if (n.alter === -1) return `ein ${accidentalInline("flat")}`;
  return "kein Vorzeichen";
}

/** Satz zur Lage für die Vorstellung. */
export function introSentence(id: string): string {
  const n = note(id);
  let s = `${nameHtml(id)} ${positionPhrase(n)}`;
  if (n.alter !== 0) s += ` und hat ${accText(n)} davor`;
  s += ".";
  if (n.partner) s += ` Sie klingt wie ${nameHtml(n.partner)} und hat denselben Griff.`;
  return s;
}

/** Griff-Tipps je Ton, von Hand formuliert (nur bei der Vorstellung). */
export const GRIP_TIPS: Record<string, string> = {
  h1: "Nur der Daumen und der Zeigefinger der linken Hand.",
  a1: "Wie h¹, dazu der Mittelfinger der linken Hand.",
  g1: "Die ganze linke Hand: Daumen und drei Finger, ganz flach auflegen.",
  c2: "Ein ungewohnter Griff: Daumen und nur der Mittelfinger der linken Hand.",
  d2: "Wie c², aber der Daumen ist ganz offen.",
  e1: "Tiefe Töne brauchen wenig Luft: ganz sanft blasen.",
  d1: "Sanft blasen und die Löcher ganz dicht abdecken.",
  fis1: "Ein Gabelgriff: Loch 4 bleibt offen, 5 und 6 sind zu.",
  e2: "Griff wie e¹, aber der Daumen nur einen Spalt offen.",
  f1: "Ein Gabelgriff: Loch 5 bleibt offen, 6 und 7 sind zu. Sanft blasen.",
  c1: "Alle Löcher zu. Ganz sanft blasen, sonst springt der Ton nach oben.",
  cis2: "Der Daumen ist ganz offen, nicht nur einen Spalt.",
  f2: "Daumen nur einen Spalt offen, Loch 5 bleibt frei.",
  g2: "Griff wie g¹, aber der Daumen nur einen Spalt offen.",
  a2: "Griff wie a¹, aber der Daumen nur einen Spalt offen.",
  h2: "Daumen nur einen Spalt offen, etwas kräftiger blasen.",
  c3: "Daumen nur einen Spalt offen. Der höchste Ton: kräftig und gleichmäßig blasen.",
  b1: "Ein Gabelgriff: Loch 2 offen, 3 und 4 zu.",
  es1: "Bei Loch 6 nur das große Loch abdecken.",
  cis1: "Bei Loch 7 nur das große Loch abdecken.",
  gis1: "Loch 3 bleibt offen, 4 bis 6 sind zu.",
  fis2: "Daumen nur einen Spalt offen, Loch 4 offen.",
  es2: "Der Daumen ist ganz offen. Etwas kräftiger blasen.",
  gis2: "Daumen nur einen Spalt offen. Etwas kräftiger blasen.",
  b2: "Daumen nur einen Spalt offen. Etwas kräftiger blasen.",
};

function interval(t: Note, c: Note): string {
  const d = c.midi - t.midi;
  const dir = d > 0 ? "höher" : "tiefer";
  const a = Math.abs(d);
  if (a === 1) return `einen Halbton ${dir}`;
  if (a === 2) return `einen Ganzton ${dir}`;
  if (a === 12) return `eine Oktave ${dir}`;
  return `${dir}`;
}

/**
 * Hinweis nach einem Fehler. target: gesuchter Ton, chosen: gewählter/gespielter Ton (null bei
 * „Weiß nicht“). Ergebnis ist HTML.
 */
export function errorHint(targetId: string, chosenId: string | null, kind: Kind): string {
  const t = note(targetId);
  const T = nameHtml(targetId);
  if (!chosenId) return `${T} ${positionPhrase(t)}.`;
  const c = note(chosenId);
  const C = nameHtml(chosenId);
  const lead = kind === "griff" ? `Du hast den Griff von ${C} gewählt.` : kind === "spiel" ? "" : `Du hast ${C} gewählt.`;
  let body: string;
  if (t.name === c.name && t.octave !== c.octave) {
    // andere Oktave
    if (kind === "griff" || kind === "spiel") {
      body =
        t.fingering[0] !== c.fingering[0]
          ? `${C} klingt ${interval(t, c)}. Den Unterschied macht vor allem der Daumen.`
          : `${C} klingt ${interval(t, c)} als ${T}.`;
    } else {
      body = `${T} ${positionPhrase(t)}, ${C} ${positionPhrase(c)} – eine Oktave Unterschied.`;
    }
  } else if (t.pos === c.pos) {
    // gleiche Stelle, anderes Vorzeichen
    body = `Achte auf das Vorzeichen: ${T} hat ${accText(t)}, ${C} hat ${accText(c)}.`;
  } else if (kind === "griff" || kind === "spiel") {
    body = `${C} liegt ${interval(t, c)} als ${T}. ${T} ${positionPhrase(t)}.`;
  } else {
    body = `${T} ${positionPhrase(t)}, ${C} ${positionPhrase(c)}.`;
  }
  return lead ? `${lead} ${body}` : body;
}

/** „Neu: c² und d²“ */
export function newNotesText(ids: string[]): string {
  return `Neu: ${joinNames(ids)}`;
}
