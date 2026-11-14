// Datenformat der App (Version 2), Standardwerte, Prüfung und Umwandlung älterer Versionen.

import { levelOf, stagesOf, type Kind, type Track } from "../music/levels";
import { NOTES } from "../music/notes";
import { TEMPO_MAX, TEMPO_MIN } from "../songs/tempo";
import { A4, clampTuning, defaultTuning, fromLegacy, roundOffset, type Tuning } from "../music/tuning";
import { isValidDayKey } from "./dates";

export const DATA_VERSION = 2;
export const HISTORY_LEN = 20;

/** Darstellung: wie das Handy, immer hell oder immer dunkel */
export type Theme = "auto" | "light" | "dark";
export const THEMES: Theme[] = ["auto", "light", "dark"];

export interface Settings {
  sessionMinutes: number;
  sessionCards: number;
  toleranceCents: number;
  holdMs: number;
  // (Bis 14.11.2026 stand hier der Stimmton für alle Flöten, tuningHz. Er gehört jetzt zur Flöte,
  // Flute.tuning; alte Daten werden in normalizeData umgewandelt.)
  theme: Theme;
  /** Mitspielen: Sie trägt Kopfhörer – dann darf leise die Melodie mitklingen */
  headphones: boolean;
  /** Mitspielen: zuletzt gewählte Art */
  followMode: FollowMode;
  /**
   * Takt-Modus: Verzögerung von Mikrofon und Erkennung in ms (samt dem, was die Ausgabe-Meldung des
   * Browsers verfehlt), am Gerät abgeglichen – getrennt ohne und mit Kopfhörern („Ich trage Kopfhörer“),
   * weil Bluetooth-Kopfhörer Ausgabe und Mikrofon stark verzögern. null = noch nicht abgeglichen
   * (Standard: DEFAULT_INPUT_LATENCY bzw. DEFAULT_HEADPHONE_LATENCY in ../audio/follow.ts).
   * Gehört zum Gerät, nicht zu ihr: steht im Speicher dieses Browsers (also dieses Geräts), geht aber nicht
   * mit in die Sicherung, und beim Einlesen einer Sicherung bleibt der Wert des Geräts
   * (../store/storage.ts). Ein anderes Handy hört anders verzögert; ein übertragener Wert wäre dort still
   * falsch.
   */
  inputLatencyMs: InputLatency;
}

/** Abgeglichene Verzögerung je Zustand des Kopfhörer-Schalters (ms, null = nicht abgeglichen) */
export interface InputLatency {
  speaker: number | null;
  headphones: number | null;
}

/**
 * Eine Flöte mit ihren Eigenheiten: ihr Stimmton (bekannt oder aus den Messungen ermittelt) und je Ton
 * die Abweichung von diesem Stimmton in Cent (Kennung der Grifftabelle → Cent, auf 0,1 genau), gemessen
 * mit „Flöte einstellen“ oder beim Mitspielen nachgeführt (../audio/flute-profile.ts; Rechnung in
 * ../music/tuning.ts). Gehört zum Gegenstand Flöte, der mit ihr umzieht – kommt deshalb mit in die
 * Sicherung (anders als die Verzögerung des Geräts).
 */
export interface Flute {
  /** Kennung, z. B. "floete-1" */
  id: string;
  name: string;
  /** Stimmton dieser Flöte (seit 14.11.2026; vorher galt settings.tuningHz für alle) */
  tuning: Tuning;
  /** Wert je Ton in Cent relativ zu tuning.hz; ungemessene Töne: 0 */
  offsets: Record<string, number>;
  /** Zeitpunkt der letzten Änderung der Werte (ms), 0 = nie */
  updated: number;
}

export const FLUTE_NAME_MAX = 40;
export const DEFAULT_FLUTE_NAME = "Meine Flöte";

export function defaultFlute(): Flute {
  return newFlute("floete-1", DEFAULT_FLUTE_NAME);
}

/** Neue Flöte ohne Werte; ohne Angabe ist der Stimmton unbekannt (440 angenommen) */
export function newFlute(id: string, name: string, tuning: Tuning = defaultTuning()): Flute {
  return { id, name, tuning: { ...tuning }, offsets: {}, updated: 0 };
}

/** Art des Mitspielens: Warte-Modus oder Takt-Modus */
export type FollowMode = "wait" | "beat";
export const FOLLOW_MODES: FollowMode[] = ["wait", "beat"];

/** Einstellungen mit Zahlenwert */
export type NumSetting = Exclude<keyof Settings, "theme" | "headphones" | "followMode" | "inputLatencyMs">;

export interface CardState {
  /** Fach 1–6 */
  box: number;
  /** Tag der letzten gewerteten Antwort */
  day: string;
  /** Nummer der Sitzung dieser Antwort (für Fach 1: „in der nächsten Sitzung“) */
  session: number;
}

/**
 * Was je Lied gemerkt wird (Schlüssel ist die Liedkennung, z. B. "jingle-bells").
 * Optionales Feld ohne Versionssprung: fehlt es (ältere Daten), gilt {}. Eine ältere App, die es nicht
 * kennt, lässt es beim Einlesen einfach weg.
 *
 * Früher standen hier auch Bestwerte vom Mitspielen (best). Seit der Nachsteuerung vom 14.11.2026 gibt es
 * beim Mitspielen nur noch Farben, keine Wertung: Bestwerte werden nicht mehr geschrieben. Ältere Daten und
 * Sicherungen mit dem Feld bleiben gültig; es wird beim Einlesen still weggelassen (kein Versionssprung –
 * es war nur eine Bequemlichkeit und lässt sich nicht mehr nutzen).
 */
export interface SongPrefs {
  /** Tempo in Prozent des Grundtempos (50–120) */
  tempo?: number;
}

/**
 * Ein eingelesenes eigenes Lied (ABC). Gespeichert wird der Quelltext, nicht das gelesene Liedmodell:
 * Beim Start wird er neu gelesen (src/songs/own.ts), so profitieren gespeicherte Lieder von späteren
 * Verbesserungen des Lesers. Lässt sich ein Stück später nicht mehr lesen, bleibt es trotzdem erhalten.
 */
export interface OwnSong {
  /** Liedkennung, "abc-" + Titel, eindeutig auch gegenüber den Heft-Liedern (z. B. "abc-greensleeves-2") */
  id: string;
  /** Titel beim Einlesen (gezeigt, falls sich das Stück nicht mehr lesen lässt) */
  title: string;
  /** ABC-Quelltext, normalerweise nur dieses eine Stück (X: bis zur Leerzeile) */
  abc: string;
  /** Nummer aus X: (null, wenn das Stück keine hat) – findet das Stück wieder, falls abc mehrere enthält */
  number: number | null;
  /** Stelle unter den lesbaren Stücken von abc (meist 0), falls die Nummer nicht weiterhilft */
  index: number;
  /** Oktavverschiebung, die sie beim Einlesen gewählt hat (Halbtöne) */
  shift: OctaveShift;
  /** Zeitpunkt des Einlesens (ms) */
  added: number;
}
export type OctaveShift = 0 | 12 | -12;

/** Eine gewertete Antwort: [richtig 1/0, Tag, Zeitpunkt in ms] */
export type Answer = [0 | 1, string, number];

export interface AppData {
  version: number;
  app: "floetentrainer";
  settings: Settings;
  /** aktuelle Stufe je Spur, als Kennung */
  stages: Record<Track, string>;
  /** Für das Freischalten zählen nur Antworten ab diesem Zeitpunkt (nach einem Senken). */
  countFrom: Record<Track, number>;
  /** Karten "ton|art" → Fach und Termin */
  cards: Record<string, CardState>;
  /** letzte 20 gewertete Antworten je Spur und Ton */
  history: Record<Track, Record<string, Answer[]>>;
  /** Töne, deren Vorstellung schon gezeigt wurde, je Spur */
  introduced: Record<Track, string[]>;
  /** Tage mit mindestens einer gewerteten Antwort */
  days: string[];
  /** Zahl der begonnenen Sitzungen */
  sessions: number;
  /** Einstellungen je Lied (Tempo) */
  songs: Record<string, SongPrefs>;
  /** eingelesene eigene Lieder (ab Version 2), in der Reihenfolge des Einlesens */
  ownSongs: OwnSong[];
  /**
   * Flöten (mindestens eine) und die aktive. Ohne Versionssprung dazugekommen: Die Werte lassen sich jederzeit
   * neu messen (und werden beim Mitspielen ohnehin nachgeführt). Eine ältere App ließe das Feld beim
   * Speichern weg – das kostet höchstens ein erneutes „Flöte einstellen“. Ein Sprung würde dagegen eine
   * noch nicht aktualisierte App alle Daten ablehnen lassen.
   *
   * Auch der Stimmton je Flöte (Flute.tuning, statt settings.tuningHz) kam ohne Sprung: Eine ältere App
   * fände kein settings.tuningHz und nähme 440 Hz; die Werte je Ton (jetzt relativ zum Stimmton der Flöte)
   * hielte sie für relativ zu 440 – bei einer Flöte mit 432 Hz läge sie etwa 30 Cent daneben, was ihr
   * Nachführen beim Mitspielen ohnehin ausgleicht, und beim Speichern ginge tuning verloren (ein
   * eingetragener Stimmton wäre neu einzutragen, ein ermittelter neu zu messen). Beides ist
   * wiederherstellbar und kommt nur vor, solange eine veraltete App läuft; ein Sprung würde dagegen dort
   * alle Daten sperren.
   */
  flutes: Flute[];
  activeFlute: string;
}

export const DEFAULT_SETTINGS: Settings = {
  sessionMinutes: 5,
  sessionCards: 20,
  toleranceCents: 40,
  holdMs: 300,
  theme: "auto",
  headphones: false,
  followMode: "wait",
  inputLatencyMs: { speaker: null, headphones: null },
};

export const SETTING_LIMITS: Record<NumSetting, [number, number]> = {
  sessionMinutes: [1, 30],
  sessionCards: [5, 60],
  toleranceCents: [10, 50],
  holdMs: [100, 1000],
};

export function defaultData(): AppData {
  return {
    version: DATA_VERSION,
    app: "floetentrainer",
    settings: { ...DEFAULT_SETTINGS, inputLatencyMs: { ...DEFAULT_SETTINGS.inputLatencyMs } },
    stages: { lesen: stagesOf("lesen")[0].id, spielen: stagesOf("spielen")[0].id },
    countFrom: { lesen: 0, spielen: 0 },
    cards: {},
    history: { lesen: {}, spielen: {} },
    introduced: { lesen: [], spielen: [] },
    days: [],
    sessions: 0,
    songs: {},
    ownSongs: [],
    flutes: [defaultFlute()],
    activeFlute: "floete-1",
  };
}

/** Die aktive Flöte (gibt es immer) */
export function activeFlute(d: Pick<AppData, "flutes" | "activeFlute">): Flute {
  return d.flutes.find((f) => f.id === d.activeFlute) ?? d.flutes[0];
}

/** Stimmton der aktiven Flöte in Hz – gilt überall (Übung, Stimmgerät, Mitspielen, Vorspielen, Abgleich) */
export function tuningHz(d: Pick<AppData, "flutes" | "activeFlute">): number {
  return activeFlute(d).tuning.hz;
}

/** Grenzen der Eingangs-Verzögerung in ms (wie LATENCY_MIN/MAX in ../audio/follow.ts) */
export const INPUT_LATENCY_LIMITS: [number, number] = [0, 400];

export function cardKey(noteId: string, kind: Kind): string {
  return `${noteId}|${kind}`;
}

export function parseCardKey(key: string): { note: string; kind: Kind } {
  const [note, kind] = key.split("|");
  return { note, kind: kind as Kind };
}

export class DataError extends Error {}

const KINDS = ["name", "griff", "note", "spiel"];
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Umwandlung älterer Datenformate. Jede Stufe hebt die Version um eins.
 * Version 0 (Vorabstand ohne Versionsfeld) kannte noch keine Sperrzeitpunkte und Stufenkennungen
 * standen als Nummern in `level`.
 */
const MIGRATIONS: Record<number, (d: Record<string, unknown>) => Record<string, unknown>> = {
  0: (d) => {
    const out: Record<string, unknown> = { ...d, version: 1, app: "floetentrainer" };
    const lv = d.level;
    if (isObj(lv)) {
      out.stages = {
        lesen: stagesOf("lesen")[Math.max(1, Math.min(Number(lv.lesen) || 1, 12)) - 1].id,
        spielen: stagesOf("spielen")[Math.max(1, Math.min(Number(lv.spielen) || 1, 11)) - 1].id,
      };
      delete out.level;
    }
    if (!out.countFrom) out.countFrom = { lesen: 0, spielen: 0 };
    return out;
  },
  // Version 2 bringt die eigenen Lieder. Anders als beim Tempo je Lied (optionales Feld ohne Sprung)
  // ist das Inhalt, den sie selbst eingegeben hat: Eine ältere App ließe das unbekannte Feld beim
  // Lesen weg und würde es beim nächsten Speichern still löschen. Mit dem Sprung lehnt sie die Daten
  // stattdessen ab („aus einer neueren Version“) und überschreibt nichts.
  1: (d) => ({ ...d, version: 2, ownSongs: [] }),
};

/** Kennungen eigener Lieder: wie Liedkennungen, mit "abc-" davor */
export const OWN_ID_RE = /^abc-[a-z0-9-]{1,72}$/;

/** Gleiche Kennungen bekommen "-2", "-3" … angehängt (taken: schon vergebene Kennungen). */
export function uniqueId(id: string, taken: Set<string>): string {
  if (!taken.has(id)) return id;
  for (let n = 2; ; n++) {
    const c = `${id}-${n}`;
    if (!taken.has(c)) return c;
  }
}

/** Prüft und vervollständigt Daten (aus dem Speicher oder einer Sicherung). Wirft DataError. */
export function normalizeData(raw: unknown): AppData {
  if (!isObj(raw)) throw new DataError("Die Daten sind kein gültiges Objekt.");
  let d: Record<string, unknown> = raw;
  const rawV = d.version === undefined ? 0 : d.version;
  if (!isNum(rawV) || !Number.isInteger(rawV) || rawV < 0) throw new DataError("Unbekannte Versionsnummer.");
  let v: number = rawV;
  if (v > DATA_VERSION) {
    throw new DataError("Die Daten stammen aus einer neueren Version der App.");
  }
  while (v < DATA_VERSION) {
    d = MIGRATIONS[v](d);
    v = d.version as number;
  }
  if (d.app !== undefined && d.app !== "floetentrainer") throw new DataError("Das ist keine Sicherung des Flötentrainers.");

  const out = defaultData();
  // Einstellungen
  if (d.settings !== undefined) {
    if (!isObj(d.settings)) throw new DataError("Einstellungen fehlerhaft.");
    for (const k of Object.keys(SETTING_LIMITS) as NumSetting[]) {
      const val = d.settings[k];
      if (val === undefined) continue;
      if (!isNum(val)) throw new DataError(`Einstellung ${k} fehlerhaft.`);
      const [lo, hi] = SETTING_LIMITS[k];
      out.settings[k] = Math.max(lo, Math.min(hi, val));
    }
    // unbekannte Werte fallen still auf „wie das Handy“ zurück
    const th = d.settings.theme;
    if (typeof th === "string" && (THEMES as string[]).includes(th)) out.settings.theme = th as Theme;
    // Mitspielen (ohne Versionssprung dazugekommen): Fehlerhaftes fällt still auf den Standard zurück
    if (typeof d.settings.headphones === "boolean") out.settings.headphones = d.settings.headphones;
    const fm = d.settings.followMode;
    if (typeof fm === "string" && (FOLLOW_MODES as string[]).includes(fm)) out.settings.followMode = fm as FollowMode;
    const lat = d.settings.inputLatencyMs;
    if (isObj(lat)) {
      for (const k of ["speaker", "headphones"] as const) {
        const v = lat[k];
        if (isNum(v)) out.settings.inputLatencyMs[k] = Math.round(Math.max(INPUT_LATENCY_LIMITS[0], Math.min(INPUT_LATENCY_LIMITS[1], v)));
      }
    }
  }
  // Stufen
  if (d.stages !== undefined) {
    if (!isObj(d.stages)) throw new DataError("Stufen fehlerhaft.");
    for (const t of ["lesen", "spielen"] as Track[]) {
      const id = d.stages[t];
      if (id === undefined) continue;
      if (typeof id !== "string") throw new DataError("Stufen fehlerhaft.");
      // unbekannte Kennungen (z. B. nach einer Änderung der Einteilung) fallen auf Stufe 1 zurück
      out.stages[t] = stagesOf(t)[levelOf(t, id) - 1].id;
    }
    const l = levelOf("lesen", out.stages.lesen);
    if (levelOf("spielen", out.stages.spielen) > l) out.stages.spielen = stagesOf("spielen")[Math.min(l, 11) - 1].id;
  }
  if (isObj(d.countFrom)) {
    for (const t of ["lesen", "spielen"] as Track[]) if (isNum(d.countFrom[t])) out.countFrom[t] = d.countFrom[t];
  }
  // Karten
  if (d.cards !== undefined) {
    if (!isObj(d.cards)) throw new DataError("Karten fehlerhaft.");
    for (const [key, c] of Object.entries(d.cards)) {
      const [n, k] = key.split("|");
      if (!NOTES[n] || !KINDS.includes(k)) continue; // unbekannte Karten überspringen
      if (!isObj(c) || !isNum(c.box) || !isValidDayKey(c.day)) throw new DataError(`Karte ${key} fehlerhaft.`);
      out.cards[key] = {
        box: Math.max(1, Math.min(6, Math.round(c.box))),
        day: c.day,
        session: isNum(c.session) ? c.session : 0,
      };
    }
  }
  // Antworten
  if (d.history !== undefined) {
    if (!isObj(d.history)) throw new DataError("Antworten fehlerhaft.");
    for (const t of ["lesen", "spielen"] as Track[]) {
      const h = d.history[t];
      if (h === undefined) continue;
      if (!isObj(h)) throw new DataError("Antworten fehlerhaft.");
      for (const [n, list] of Object.entries(h)) {
        if (!NOTES[n]) continue;
        if (!Array.isArray(list)) throw new DataError(`Antworten zu ${n} fehlerhaft.`);
        const clean: Answer[] = [];
        for (const a of list) {
          if (!Array.isArray(a) || (a[0] !== 0 && a[0] !== 1) || !isValidDayKey(a[1]) || !isNum(a[2])) {
            throw new DataError(`Antworten zu ${n} fehlerhaft.`);
          }
          clean.push([a[0], a[1], a[2]]);
        }
        out.history[t][n] = clean.slice(-HISTORY_LEN);
      }
    }
  }
  if (isObj(d.introduced)) {
    for (const t of ["lesen", "spielen"] as Track[]) {
      const l = d.introduced[t];
      if (Array.isArray(l)) out.introduced[t] = l.filter((x): x is string => typeof x === "string" && !!NOTES[x]);
    }
  }
  if (d.days !== undefined) {
    if (!Array.isArray(d.days)) throw new DataError("Übungstage fehlerhaft.");
    out.days = [...new Set(d.days.filter(isValidDayKey))].sort();
  }
  if (isNum(d.sessions)) out.sessions = Math.max(0, Math.round(d.sessions));
  // Einstellungen je Lied: Fehlerhaftes wird still übergangen (es geht nur um Bequemlichkeit)
  if (isObj(d.songs)) {
    for (const [id, p] of Object.entries(d.songs)) {
      if (!isObj(p) || !/^[a-z0-9-]{1,80}$/.test(id)) continue;
      const prefs: SongPrefs = {};
      if (isNum(p.tempo)) prefs.tempo = Math.max(TEMPO_MIN, Math.min(TEMPO_MAX, Math.round(p.tempo)));
      // (ein altes Feld best mit Bestwerten vom Mitspielen wird still weggelassen, siehe SongPrefs)
      if (Object.keys(prefs).length) out.songs[id] = prefs;
    }
  }
  // Eigene Lieder: Inhalt der Nutzerin, deshalb nie still übergehen. Fehlt der Quelltext, ist die
  // ganze Sicherung fehlerhaft; Nebensächliches wird ergänzt, doppelte Kennungen werden aufgelöst.
  if (d.ownSongs !== undefined) {
    if (!Array.isArray(d.ownSongs)) throw new DataError("Eigene Lieder fehlerhaft.");
    const taken = new Set<string>();
    d.ownSongs.forEach((o, i) => {
      if (!isObj(o) || typeof o.abc !== "string" || !o.abc.trim()) throw new DataError(`Eigenes Lied Nr. ${i + 1} fehlerhaft.`);
      const title = typeof o.title === "string" ? o.title : "";
      const id = uniqueId(typeof o.id === "string" && OWN_ID_RE.test(o.id) ? o.id : `abc-lied-${i + 1}`, taken);
      taken.add(id);
      out.ownSongs.push({
        id,
        title,
        abc: o.abc,
        number: isNum(o.number) && Number.isInteger(o.number) ? o.number : null,
        index: isNum(o.index) && Number.isInteger(o.index) && o.index >= 0 ? o.index : 0,
        shift: o.shift === 12 || o.shift === -12 ? o.shift : 0,
        added: isNum(o.added) ? o.added : 0,
      });
    });
  }
  // Flöten: Messwerte, keine Eingabe von ihr außer Name und bekanntem Stimmton – Fehlerhaftes wird still
  // übergangen, unbekannte Töne und Werte außerhalb ±49 Cent fallen weg bzw. werden begrenzt, der
  // Stimmton auf 415–466 Hz. Ohne gültige Flöte bleibt die Standard-Flöte.
  //
  // Umwandlung (ohne Versionssprung, siehe AppData.flutes): Bis 14.11.2026 galt ein Stimmton für alle
  // (settings.tuningHz), und die Werte je Ton waren relativ dazu gemessen. Eine Flöte ohne Feld tuning
  // bekommt einen unbekannten Stimmton aus ihren absoluten Lagen (fromLegacy in ../music/tuning.ts);
  // ohne Werte gilt für die aktive Flöte der alte Stimmton, für weitere Flöten 440 Hz.
  const legacyHz = isObj(d.settings) && isNum(d.settings.tuningHz) ? clampTuning(d.settings.tuningHz) : A4;
  const rawActive = typeof d.activeFlute === "string" ? d.activeFlute : null;
  if (Array.isArray(d.flutes)) {
    const taken = new Set<string>();
    const list: Flute[] = [];
    for (const f of d.flutes) {
      if (!isObj(f) || typeof f.id !== "string" || !FLUTE_ID_RE.test(f.id) || taken.has(f.id)) continue;
      taken.add(f.id);
      let offsets: Record<string, number> = {};
      if (isObj(f.offsets)) {
        for (const [k, v] of Object.entries(f.offsets)) {
          if (NOTES[k] && !NOTES[k].partner && isNum(v)) offsets[k] = roundOffset(v);
        }
      }
      const name = typeof f.name === "string" && f.name.trim() ? f.name.trim().slice(0, FLUTE_NAME_MAX) : DEFAULT_FLUTE_NAME;
      let tuning: Tuning;
      if (isObj(f.tuning) && isNum(f.tuning.hz)) {
        tuning = { hz: clampTuning(f.tuning.hz), known: f.tuning.known === true };
      } else {
        // alte Flöte: aktive (bzw. erste) mit dem alten Stimmton, weitere ohne Werte mit 440 Hz
        const isActive = rawActive === null ? list.length === 0 : f.id === rawActive;
        const conv = fromLegacy(offsets, Object.keys(offsets).length || isActive ? legacyHz : A4);
        tuning = conv.tuning;
        offsets = conv.offsets;
      }
      list.push({ id: f.id, name, tuning, offsets, updated: isNum(f.updated) ? f.updated : 0 });
    }
    if (list.length) out.flutes = list;
  } else {
    // ganz alte Daten ohne Flöten: die Standard-Flöte übernimmt den alten Stimmton (unbekannt)
    out.flutes[0].tuning.hz = legacyHz;
  }
  if (rawActive !== null && out.flutes.some((f) => f.id === rawActive)) out.activeFlute = rawActive;
  else out.activeFlute = out.flutes[0].id;
  return out;
}

/** Kennungen der Flöten */
export const FLUTE_ID_RE = /^floete-[a-z0-9-]{1,40}$/;

/** Neue Kennung für eine Flöte (floete-2, floete-3 …) */
export function newFluteId(flutes: Flute[]): string {
  const taken = new Set(flutes.map((f) => f.id));
  for (let n = flutes.length + 1; ; n++) if (!taken.has(`floete-${n}`)) return `floete-${n}`;
}
