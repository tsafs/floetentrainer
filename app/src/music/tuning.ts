// Stimmton und Cent: die einzige Stelle, an der zwischen Hertz und Cent umgerechnet wird.
//
// Seit dem 14.11.2026 gehört der Stimmton zur Flöte (Wunsch der Nutzerin: „meine neue Flöte ist auf
// 442 Hertz gestimmt, bei der Kinderflöte weiß ich es nicht“). Jede Flöte hat
// - einen Stimmton (Kammerton a in Hz) – bekannt (sie hat ihn eingetragen, z. B. 442) oder unbekannt
//   (aus den Messungen ermittelt: Mitte, also Median, der absoluten Lagen ihrer Töne), und
// - je Ton einen Wert in Cent *relativ zu diesem Stimmton* („e¹ −15“ = 15 Cent tiefer, als der Stimmton
//   der Flöte erwarten lässt). Ungemessene Töne liegen genau beim Stimmton (0).
// Die absolute Lage eines Tons (das, was wirklich klingt) ist Stimmton + Wert. Alle Umrechnungen hier
// (Stimmton ändern, unbekannten Stimmton neu ermitteln, alte Daten umwandeln) erhalten diese Lagen.
//
// Rein rechnerisch, ohne Oberfläche und Speicher – testbar.

/** Bezug, wenn nichts anderes bekannt ist: a = 440 Hz */
export const A4 = 440;
/** Bereich des Stimmtons in Hz (Barock 415 bis hoher Orchesterstimmton 466) */
export const TUNING_LIMITS: [number, number] = [415, 466];
/** Gängige Stimmtöne als schnelle Wahl */
export const COMMON_TUNINGS = [440, 442, 443];
/** Größter Wert je Ton: mehr als ein halber Halbton wäre schon der Nachbarton */
export const MAX_OFFSET = 49;

/** Abstand von hz zu refHz in Cent (positiv = höher) */
export function centsBetween(hz: number, refHz: number): number {
  return 1200 * Math.log2(hz / refHz);
}

/** hz um cents verschoben */
export function shiftHz(hz: number, cents: number): number {
  return hz * Math.pow(2, cents / 1200);
}

export const clampTuning = (hz: number) => Math.max(TUNING_LIMITS[0], Math.min(TUNING_LIMITS[1], hz));
export const clampOffset = (c: number) => Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, c));
/** Werte je Ton werden auf 0,1 Cent genau gespeichert (Umrechnungen sollen nichts verschieben) */
export const roundOffset = (c: number) => Math.round(clampOffset(c) * 10) / 10 + 0;

/** Median einer Zahlenliste (leer: null) */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

/** Stimmton einer Flöte */
export interface Tuning {
  /** Kammerton a in Hz */
  hz: number;
  /** true: von ihr eingetragen; false: aus den Messungen ermittelt (bzw. noch 440 angenommen) */
  known: boolean;
}

/** Was eine Flöte für die Tonhöhe ausmacht (Ausschnitt von Flute in ../store/data.ts) */
export interface Tuned {
  tuning: Tuning;
  /** Wert je Ton in Cent relativ zu tuning.hz, Schlüssel = Kennung der Grifftabelle */
  offsets: Record<string, number>;
}

export function defaultTuning(): Tuning {
  return { hz: A4, known: false };
}

/** Absolute Lage je Ton in Cent relativ zu a = 440 Hz */
export function absoluteCents(f: Tuned): Record<string, number> {
  const base = centsBetween(f.tuning.hz, A4);
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(f.offsets)) out[k] = base + v;
  return out;
}

/**
 * Stimmton auf hz setzen, die absoluten Lagen der gemessenen Töne bleiben (Werte werden umgerechnet).
 * Ändert f.
 */
export function retune(f: Tuned, hz: number): void {
  const hzNew = clampTuning(hz);
  const shift = centsBetween(f.tuning.hz, hzNew);
  for (const k of Object.keys(f.offsets)) f.offsets[k] = roundOffset(f.offsets[k] + shift);
  f.tuning.hz = hzNew;
}

/**
 * Unbekannten Stimmton neu ermitteln: Median der absoluten Lagen aller gemessenen Töne (die Werte
 * liegen danach um 0). Bei bekanntem Stimmton oder ohne Werte ändert sich nichts. Ändert f.
 */
export function recenter(f: Tuned): void {
  if (f.tuning.known) return;
  const med = median(Object.values(f.offsets));
  if (med === null || Math.abs(med) < 0.05) return;
  retune(f, shiftHz(f.tuning.hz, med));
}

/** Bekannten Stimmton eintragen (absolute Lagen bleiben). Ändert f. */
export function setKnownTuning(f: Tuned, hz: number): void {
  retune(f, hz);
  f.tuning.known = true;
}

/** Stimmton unbekannt: ab jetzt aus den Messungen ermittelt (sofort neu, absolute Lagen bleiben). Ändert f. */
export function setUnknownTuning(f: Tuned): void {
  f.tuning.known = false;
  recenter(f);
}

/**
 * Hat die App für den unbekannten Stimmton schon einen Anhalt (gemessene Töne oder ein übernommener
 * Wert ≠ 440)? Sonst ist er „noch nicht ermittelt“ (440 angenommen).
 */
export function tuningEstimated(f: Tuned): boolean {
  return !f.tuning.known && (Object.keys(f.offsets).length > 0 || Math.abs(centsBetween(f.tuning.hz, A4)) >= 0.5);
}

/**
 * Gemessener Stimmton: Median der absoluten Lagen der gemessenen Töne in Hz (ohne Werte: null). Bei
 * unbekanntem Stimmton ist das (nach recenter) der Stimmton selbst; bei bekanntem zeigt er, wie weit die
 * Flöte von ihrer Angabe abweicht („angegeben 442 Hz · gemessen etwa 442,5 Hz“).
 */
export function measuredHz(f: Tuned): number | null {
  const med = median(Object.values(f.offsets));
  return med === null ? null : shiftHz(f.tuning.hz, med);
}

/** Ab so vielen Cent Abstand zwischen Angabe und Messung bietet die App an, den gemessenen Wert zu übernehmen */
export const MEASURED_HINT_CENTS = 10;

/** Auf 0,5 Hz gerundet (so wird ein ermittelter Stimmton gezeigt und ein gemessener übernommen) */
export const roundHalfHz = (hz: number) => Math.round(hz * 2) / 2;

/** Zahl mit deutschem Komma, höchstens eine Nachkommastelle („432,5“, „442“) */
function num(x: number): string {
  const r = Math.round(x * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1).replace(".", ",");
}

/** Hz als Text auf 0,5 gerundet („432,5 Hz“) */
export function hzRoundText(hz: number): string {
  return `${num(roundHalfHz(hz))} Hz`;
}

/** Stimmton als Text: bekannt „442 Hz“, ermittelt auf 0,5 Hz gerundet „432,5 Hz“ */
export function hzText(t: Tuning): string {
  return `${num(t.known ? t.hz : roundHalfHz(t.hz))} Hz`;
}

/**
 * Kurzer Text zum Stimmton einer Flöte: „442 Hz“, „etwa 432,5 Hz“ (ermittelt) bzw. null, solange der
 * unbekannte Stimmton noch nicht ermittelt ist.
 */
export function tuningShort(f: Tuned): string | null {
  if (f.tuning.known) return hzText(f.tuning);
  return tuningEstimated(f) ? `etwa ${hzText(f.tuning)}` : null;
}

/**
 * Alte Daten (bis 14.11.2026): ein Stimmton für alle (settings.tuningHz), die Werte je Ton waren relativ
 * dazu gemessen. Absolute Lage je Ton = tuningHz + Wert. Daraus wird eine Flöte mit unbekanntem Stimmton
 * = Median der absoluten Lagen (ohne Werte: tuningHz), Werte = absolute Lage − Stimmton. Verlustfrei bis
 * auf 0,1 Cent (und die Grenzen von Stimmton und Werten).
 */
export function fromLegacy(offsets: Record<string, number>, tuningHz: number): Tuned {
  const f: Tuned = { tuning: { hz: tuningHz, known: false }, offsets: { ...offsets } };
  const med = median(Object.values(offsets));
  retune(f, med === null ? tuningHz : shiftHz(tuningHz, med));
  return f;
}
