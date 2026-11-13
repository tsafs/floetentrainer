// Liedmodell: so sieht ein gelesenes Lied aus (Ergebnis von parseSong in ./parse.ts).
// Notensatz, Vorspielen und Liederliste bauen darauf auf. Alle Dauern und Zeiten in Vierteln
// (1 = eine Viertelnote), Tonhöhen wie in der übrigen App (notiert, c¹ = MIDI 60, Lage 0 = e¹).

/** Rohdaten eines Lieds, wie scripts/heft-songs.py sie aus heft/songs.py liefert (Feldnamen wie im Heft). */
export interface RawSong {
  /** Kapitel; gilt wie im Heft für alle folgenden Lieder bis zum nächsten Kapitel (vom Skript schon übertragen) */
  chapter: string | null;
  title: string;
  /** Untertitel (im Heft optional) */
  subtitle?: string;
  /** Tonart wie im Heft: Großbuchstabe = Dur ("G", "F", "Es"), klein = Moll ("e", "d", "fis") */
  key: string;
  /** Tonartname zum Anzeigen, z. B. "G-Dur" oder "a-Moll (dorisch)" */
  keyname: string;
  /** Taktart am Liedanfang, z. B. [3, 4] */
  time: [number, number];
  /** Melodie in der Heft-Notation (erklärt oben in heft/songs.py) */
  music: string;
  /** Quellenangabe */
  credit?: string;
  /** Text der ersten Strophe, Silben mit "-" getrennt */
  lyrics?: string;
  /** weitere Strophen, Zeilen mit " / " getrennt */
  stanzas?: string[];
  /** Spaltenzahl für die weiteren Strophen im Heft */
  stanza_cols?: number;
  /** Länge des Auftakts (im Heft optional: dann müssen Auftakt und Schlusstakt zusammen einen Takt ergeben) */
  pickup?: number;
  /** nur in der Kreuzprüfung der Tests: Ergebnis von parse_music/check_and_assign aus heft/engrave.py */
  ref?: unknown;
}

/** Stammton; b wird wie im Heft als h mit ♭ geführt. */
export type Letter = "c" | "d" | "e" | "f" | "g" | "a" | "h";

/** Vorzeichen: -1 ♭, 0 keins, 1 ♯ */
export type Alter = -1 | 0 | 1;

/** Ein im Notenbild gezeigtes Vorzeichen (♯, ♭ oder Auflösungszeichen ♮). */
export type Accidental = "sharp" | "flat" | "natural";

/** Notenwert als Nenner: 1 ganze, 2 halbe, 4 Viertel, 8 Achtel, 16 Sechzehntel. */
export type Duration = 1 | 2 | 4 | 8 | 16;

/** Tonhöhe einer Note, so wie sie notiert ist (Schreibweise bleibt erhalten: dis bleibt dis). */
export interface SongPitch {
  /** Stammton für die Notenzeile */
  letter: Letter;
  /** Vorzeichen des Tons selbst (nicht, was im Notenbild steht – dafür NoteEvent.accidental) */
  alter: Alter;
  /** Oktave wie in der App: 1 = eingestrichen (c¹ … h¹), 0 = kleine Oktave */
  octave: number;
  /** deutscher Name ohne Oktave, z. B. "fis", "b", "es", "as", "dis" */
  name: string;
  /** Kennung wie in der App, z. B. "fis1", "b1", "dis2" (für nameHtml aus music/names.ts) */
  id: string;
  /** notierte MIDI-Höhe, c¹ = 60 (die Flöte klingt eine Oktave höher) */
  midi: number;
  /** Lage in halben Zwischenräumen, 0 = unterste Linie (e¹), wie Note.pos in music/notes.ts */
  pos: number;
}

/** Silbe des Liedtexts unter einer Note. */
export interface Syllable {
  text: string;
  /** Das Wort geht mit der nächsten Silbe weiter (Trennstrich zwischen den Silben). */
  hyphen: boolean;
  /**
   * Wortende über einem Bindebogen oder Haltebogen: Kennung der letzten Note ohne eigene Silbe, bis zu
   * der im Heft eine Melisma-Linie gezogen wird; sonst null.
   */
  extendTo: number | null;
}

interface EventBase {
  /** eindeutige Kennung im Lied (fortlaufend ab 1 in Lesereihenfolge, Noten und Pausen zusammen) */
  id: number;
  /** Index des Takts in Song.bars */
  bar: number;
  /** Notenwert */
  dur: Duration;
  /** Zahl der Punkte (0 oder 1) */
  dots: 0 | 1;
  /** Dauer in Vierteln, Punkt eingerechnet (punktierte Viertel = 1,5) */
  q: number;
  /** Beginn im Takt in Vierteln, gezählt ab dem ersten Ereignis des Takts (beim Auftakt also ab 0) */
  offset: number;
}

export interface NoteEvent extends EventBase {
  kind: "note";
  pitch: SongPitch;
  /**
   * Vorzeichen, das im Notenbild vor dieser Note steht, genau wie im Heft (render_staff_system):
   * Was die Tonart vorgibt, bekommt keins; Abweichungen bekommen eins und gelten bis zum Taktende
   * für diesen Stammton in dieser Oktave; die Rückkehr wird mit ♮ (bzw. dem Vorzeichen der Tonart)
   * angezeigt. Wie im Heft wird auch die gehaltene Note nach einem Taktstrich neu beurteilt.
   */
  accidental: Accidental | null;
  /** Haltebogen zur nächsten Note (gleiche Tonhöhe, klingt als ein Ton) */
  tie: boolean;
  /** Diese Note ist das Ende eines Haltebogens von der vorigen Note. */
  tiedFromPrev: boolean;
  /** Bindebogen beginnt an dieser Note */
  slurStart: boolean;
  /** Bindebogen endet an dieser Note */
  slurEnd: boolean;
  /** Atemzeichen nach dieser Note */
  breath: boolean;
  /** zugeordnete Silbe; null bei Noten ohne Text (Melisma unter Bogen, Haltebogen, Lied ohne Text) */
  syllable: Syllable | null;
}

export interface RestEvent extends EventBase {
  kind: "rest";
}

export type BarEvent = NoteEvent | RestEvent;

/** Taktart, z. B. { num: 6, den: 8 } */
export interface TimeSig {
  num: number;
  den: number;
}

/**
 * Taktstrich am Ende eines Takts. "single" einfacher Strich, "final" Schlussstrich (||),
 * "repeatEnd" Wiederholungszeichen :|, "none" Lied endet ohne Strich.
 * Beginnt der folgende Takt mit |: (Bar.repeatStart), zeigt der Notensatz dort das Wiederholungszeichen.
 */
export type Barline = "single" | "final" | "repeatEnd" | "none";

export interface Bar {
  /** Index in Song.bars (= Index im Notenbild, 0-basiert) */
  index: number;
  /** Noten und Pausen des Takts */
  events: BarEvent[];
  /** Taktart, die in diesem Takt gilt */
  time: TimeSig;
  /** Vor diesem Takt steht ein Taktwechsel T… (Taktangabe im Notenbild zeigen). Für Takt 0 false. */
  timeChange: boolean;
  /** Soll-Länge nach Taktart in Vierteln */
  nominal: number;
  /** tatsächliche Länge in Vierteln (Auftakt und Schlusstakt können kürzer sein) */
  length: number;
  /**
   * Auftakt: kürzer als die Taktart und am Liedanfang, nach |: oder als Rest eines vor :| geteilten
   * Takts. Seine Ereignisse stehen am Taktende (die erste Note ist also nicht die Eins).
   */
  pickup: boolean;
  /** Wiederholung beginnt mit diesem Takt (|:) */
  repeatStart: boolean;
  /** Strich am Taktende */
  barline: Barline;
  /** Takt gehört zur 1. bzw. 2. Klammer (1. Klammer bis zum :|, 2. Klammer wie im Heft genau ein Takt) */
  volta: 1 | 2 | null;
  /** Die Klammer beginnt mit diesem Takt (dort steht „1.“ bzw. „2.“). */
  voltaStart: boolean;
  /** Zeile im Heft (0-basiert, nach den "/"), in der der Takt beginnt – nur zur Information */
  line: number;
  /** Im Heft endet nach diesem Takt eine Zeile. */
  breakAfter: boolean;
  /** Im Heft ist der Takt auf zwei Zeilen verteilt: Umbruch nach events[breakInside]; sonst null */
  breakInside: number | null;
}

/** Tonart eines Lieds samt Vorzeichnung. */
export interface KeyInfo {
  /** wie im Heft, z. B. "G" oder "e" */
  name: string;
  /** Moll (Kleinbuchstabe im Heft) */
  minor: boolean;
  /** Zahl der Vorzeichen: +n Kreuze, −n Be */
  fifths: number;
  /** Vorzeichen je Stammton, z. B. G-Dur { f: 1 } */
  alter: Partial<Record<Letter, Alter>>;
  /** Zeichen der Vorzeichnung in Reihenfolge, mit Lage im Violinschlüssel (0 = unterste Linie) */
  signature: { accidental: "sharp" | "flat"; pos: number }[];
}

export interface Song {
  /** stabile Kennung, aus dem Titel gebildet, z. B. "alle-meine-entchen" */
  id: string;
  title: string;
  subtitle: string | null;
  /** Kapitel des Hefts */
  chapter: string;
  key: KeyInfo;
  /** Tonartname zum Anzeigen, z. B. "a-Moll (dorisch)" */
  keyName: string;
  /** Taktart am Liedanfang */
  time: TimeSig;
  /** Quellenangabe wie im Heft */
  credit: string;
  /** Das Lied hat Text unter den Noten. */
  hasLyrics: boolean;
  /** weitere Strophen, je Strophe ihre Zeilen */
  stanzas: string[][];
  /** Spaltenzahl der weiteren Strophen im Heft, falls angegeben */
  stanzaCols: number | null;
  /** Takte in Notenbild-Reihenfolge (Wiederholungen nicht ausgeschrieben) */
  bars: Bar[];
  /** alle Noten in Lesereihenfolge (dieselben Objekte wie in bars) */
  notes: NoteEvent[];
  /** tiefster und höchster Ton (nach MIDI) */
  range: { low: SongPitch; high: SongPitch };
}
