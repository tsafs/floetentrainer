// Notennamen als HTML mit eigener Hochzahl (nicht die Unicode-Zeichen ¹ ² ³, die in Garamond anstoßen).

import { NOTES, spellMidi } from "./notes";

export function nameParts(id: string): { name: string; octave: number } {
  const n = NOTES[id];
  if (n) return { name: n.name, octave: n.octave };
  return { name: id.replace(/\d+$/, ""), octave: Number(id.match(/\d+$/)?.[0] ?? 0) };
}

export function nameHtml(id: string): string {
  const { name, octave } = nameParts(id);
  return `<span class="nn">${name}<span class="o">${octave}</span></span>`;
}

/** Klartext für Bildschirmleser und Titel, z. B. "c¹". */
export function nameText(id: string): string {
  const { name, octave } = nameParts(id);
  return name + ["⁰", "¹", "²", "³", "⁴"][octave];
}

/** Name in der Schreibweise der Grifftabelle zu einer notierten MIDI-Nummer. */
export function midiNameHtml(midi: number): string {
  const { name, octave } = spellMidi(midi);
  if (octave <= 0) return `<span class="nn">${name}</span>`;
  return `<span class="nn">${name}<span class="o">${octave}</span></span>`;
}

/** Aufzählung: "c¹", "c¹ und d²", "c¹, d² und e¹". */
export function joinNames(ids: string[]): string {
  const parts = ids.map(nameHtml);
  if (parts.length <= 1) return parts.join("");
  return parts.slice(0, -1).join(", ") + " und " + parts[parts.length - 1];
}
