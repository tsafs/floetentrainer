// Testboard (seit dem 19.11.2026): kurze Tonfolgen, an denen sich die Erkennung beim Mitspielen gezielt
// prüfen lässt. Sie spielt eine Folge mit „Mitspielen“ (Warte-Modus oder im Takt) und speichert danach
// die Diagnose. Anders als bei den Liedern enthält die Diagnose hier auch den Ton (16 Bit): Damit lässt
// sich die Erkennung mit genau diesem Spiel nachrechnen und verbessern (scripts/replay.ts,
// docs/erkennung.md). Die Seite sagt das vor dem Spielen.
//
// Jede Folge zielt auf eine Frage aus der Rückmeldung vom 19.11.2026 („schnelle Viertel und Achtel“,
// „von oben nach unten stockt es“). Tonraum vor allem e¹–d², den Anfängerinnen früh lernen; tiefe und
// hohe Töne in eigenen Folgen.

import type { RawSong, Song } from "./model";
import { parseSong } from "./parse";

export const TEST_CHAPTER = "Testboard";

interface TestPiece {
  id: string;
  title: string;
  /** worum es geht (auf der Testboard-Seite) */
  about: string;
  /** Grundtempo (Viertel je Minute) */
  bpm: number;
  music: string;
}

export const TEST_PIECES: TestPiece[] = [
  {
    id: "test-viertel",
    title: "Test 1 · Viertel auf und ab",
    about: "Ruhige Viertel in Tonschritten – zum Vergleich.",
    bpm: 84,
    music: "g'4 a'4 h'4 c''4 | d''4 c''4 h'4 a'4 | g'4 a'4 h'4 a'4 | g'2 r2 | / " + "h'4 c''4 d''4 c''4 | h'4 a'4 g'4 a'4 | h'4 a'4 g'4 a'4 | g'2 r2 ||",
  },
  {
    id: "test-achtel-ab",
    title: "Test 2 · Achtel abwärts",
    about: "Achtel, meist von oben nach unten.",
    bpm: 76,
    music: "d''8 c''8 h'8 a'8 g'8 a'8 h'8 c''8 | d''8 c''8 h'8 a'8 g'4 r4 | / " + "c''8 h'8 a'8 g'8 a'8 h'8 a'8 g'8 | d''8 c''8 h'8 a'8 g'2 ||",
  },
  {
    id: "test-spruenge-ab",
    title: "Test 3 · Sprünge abwärts",
    about: "Große Schritte von hoch nach tief, erst in Vierteln, dann in Achteln.",
    bpm: 72,
    music: "d''4 g'4 c''4 a'4 | h'4 e'4 a'4 g'4 | / " + "d''8 g'8 d''8 g'8 c''8 a'8 c''8 a'8 | h'8 e'8 h'8 e'8 a'4 r4 | / " + "d''4 e'4 c''4 g'4 | h'2 g'2 ||",
  },
  {
    id: "test-spruenge-auf",
    title: "Test 4 · Sprünge aufwärts",
    about: "Dieselben Sprünge umgekehrt, von tief nach hoch.",
    bpm: 72,
    music: "g'4 d''4 a'4 c''4 | e'4 h'4 g'4 a'4 | / " + "g'8 d''8 g'8 d''8 a'8 c''8 a'8 c''8 | e'8 h'8 e'8 h'8 a'4 r4 | / " + "e'4 d''4 g'4 c''4 | g'2 h'2 ||",
  },
  {
    id: "test-wiederholung",
    title: "Test 5 · Tonwiederholungen",
    about: "Gleiche Töne hintereinander, mit der Zunge neu angestoßen.",
    bpm: 76,
    music: "g'8 g'8 g'8 g'8 a'8 a'8 a'8 a'8 | h'4 h'4 h'4 h'4 | / " + "c''8 c''8 h'8 h'8 a'8 a'8 g'8 g'8 | a'4 a'4 g'2 ||",
  },
  {
    id: "test-wechsel",
    title: "Test 6 · Schneller Wechsel g–a–h",
    about: "Schnelle Achtel nur mit g¹, a¹ und h¹.",
    bpm: 88,
    music: "g'8 a'8 h'8 a'8 g'8 a'8 h'8 a'8 | g'8 a'8 h'8 a'8 g'4 r4 | / " + "h'8 a'8 g'8 a'8 h'8 a'8 g'8 a'8 | h'8 a'8 g'8 a'8 h'4 r4 ||",
  },
  {
    id: "test-tief",
    title: "Test 7 · Tiefe Töne",
    about: "Tiefe Töne bis c¹ – leiser und hauchiger. Nur, wenn du sie schon kannst.",
    bpm: 72,
    music: "g'4 f'4 e'4 d'4 | e'4 f'4 g'4 e'4 | / " + "a'4 e'4 g'4 d'4 | f'4 d'4 e'4 c'4 | d'2 c'2 ||",
  },
  {
    id: "test-hoch",
    title: "Test 8 · Hohe Töne",
    about: "Hohe Töne bis g² (mit halb geschlossenem Daumenloch). Nur, wenn du sie schon kannst.",
    bpm: 72,
    music: "c''4 d''4 e''4 d''4 | c''4 e''4 f''4 g''4 | / " + "e''8 d''8 c''8 d''8 e''4 c''4 | g''4 e''4 d''4 c''4 | h'2 c''2 ||",
  },
];

function toSong(p: TestPiece): Song {
  const raw: RawSong = { chapter: TEST_CHAPTER, title: p.title, key: "C", keyname: "C-Dur", time: [4, 4], music: p.music };
  const s = parseSong(raw);
  s.id = p.id;
  s.tempo = { bpm: p.bpm, beat: 1 };
  return s;
}

export const TEST_SONGS: Song[] = TEST_PIECES.map(toSong);

export function testSongById(id: string): Song | undefined {
  return TEST_SONGS.find((s) => s.id === id);
}

export function isTestSong(id: string): boolean {
  return id.startsWith("test-") && !!testSongById(id);
}

export function testAbout(id: string): string {
  return TEST_PIECES.find((p) => p.id === id)?.about ?? "";
}
