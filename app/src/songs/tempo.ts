// Grundtempo der Lieder. Das Heft enthält kein Tempo: Für die Heft-Lieder steht hier ein Wert je
// Liedtitel (für Anfängerinnen eher ruhig), sonst gilt ein Wert nach Taktart.
// Alle Werte sind Schläge pro Minute in der Zählzeit der Taktart (siehe beatUnit): bei 2/4, 3/4, 4/4
// Viertel, bei 6/8, 9/8, 12/8 punktierte Viertel, bei 2/2 und 3/2 Halbe, bei 3/8 Achtel.

import type { Song, TimeSig } from "./model";

/** Grundtempo je Liedtitel (wie in heft/songs.py), Schläge pro Minute in der Zählzeit der Taktart. */
export const BASE_TEMPO: Record<string, number> = {
  // Kinder- und Weihnachtslieder
  "Kuckuck, Kuckuck, ruft’s aus dem Wald": 100,
  "Hänschen klein": 96,
  "Alle meine Entchen": 88,
  "Jingle Bells": 104,
  "Morgen kommt der Weihnachtsmann": 92,
  "Kling, Glöckchen": 76,
  "Bruder Jakob": 92,
  "Leise rieselt der Schnee": 96,
  "Alle Vögel sind schon da": 92,
  "Lasst uns froh und munter sein": 96,
  "Alle Jahre wieder": 76,
  "Es tanzt ein Bi-Ba-Butzemann": 88,
  "O Tannenbaum": 84,
  "ABC, die Katze lief im Schnee": 84,
  "Stille Nacht, heilige Nacht": 46, // ruhig, punktierte Viertel
  // Alte Lieder und Tänze
  "Noël nouvelet": 88,
  Greensleeves: 50, // punktierte Viertel
  "All in a Garden Green": 92,
  "Innsbruck, ich muss dich lassen": 72,
  Tourdion: 108,
  "Ronde „Pour quoy“": 96,
  "Belle qui tiens ma vie": 76,
  "Branle de l’Official": 100,
  "The Honie-suckle": 96,
  "The Fairie-round": 66, // punktierte Viertel
  "Now is the month of maying": 100,
  "It was a lover and his lass": 100,
  "Doen Daphne d’over schoone Maeght": 96,
  "Malle Symen": 88,
  "Engels Nachtegaeltje": 80,
  "Onder de Linde groene": 84,
  // Schöne Melodien
  "The Water Is Wide": 72,
  Musette: 76,
};

/** Tempo-Regler: erlaubter Bereich in Prozent des Grundtempos */
export const TEMPO_MIN = 50;
export const TEMPO_MAX = 120;

/** Länge einer Zählzeit in Vierteln: 6/8 → 1,5 (punktierte Viertel), 2/2 → 2, 3/8 → 0,5, sonst 4/den. */
export function beatUnit(t: TimeSig): number {
  if (t.den === 8 && t.num % 3 === 0 && t.num > 3) return 1.5;
  return 4 / t.den;
}

/** Grundtempo nach Taktart, in Schlägen pro Minute der Zählzeit (beatUnit). */
export function defaultTempo(t: TimeSig): number {
  if (t.den === 8 && t.num % 3 === 0 && t.num > 3) return 60; // 6/8, 9/8, 12/8: punktierte Viertel
  if (t.den === 4) return t.num === 3 ? 100 : 90; // 2/4, 4/4 (und andere) ≈ 90, 3/4 ≈ 100
  if (t.den === 2) return 50; // 2/2, 3/2: Halbe (= 100 Viertel)
  if (t.den === 8) return 180; // 3/8, 5/8 …: Achtel (= 90 Viertel)
  if (t.den === 16) return 360; // Sechzehntel (= 90 Viertel)
  return 90 / beatUnit(t); // ganze Noten: wie 90 Viertel
}

/** Grundtempo eines Lieds: Schläge pro Minute, Länge des Schlags in Vierteln und Viertel pro Minute. */
export function baseTempo(song: Song): { bpm: number; beat: number; quartersPerMin: number } {
  const beat = beatUnit(song.time);
  const bpm = BASE_TEMPO[song.title] ?? defaultTempo(song.time);
  return { bpm, beat, quartersPerMin: bpm * beat };
}

/** Prozentwert des Tempo-Reglers auf 50–120 % begrenzen (ungültig → 100 %). */
export function clampPercent(percent: number): number {
  if (!Number.isFinite(percent)) return 100;
  return Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, percent));
}

/** Sekunden je Viertel für ein Lied bei percent % des Grundtempos (50–120, wird begrenzt). */
export function secPerQuarter(song: Song, percent = 100): number {
  return 60 / (baseTempo(song).quartersPerMin * (clampPercent(percent) / 100));
}
