// Datenformat der App (Version 2), Standardwerte, Prüfung und Umwandlung älterer Versionen.

import { levelOf, stagesOf, type Kind, type Track } from "../music/levels";
import { NOTES } from "../music/notes";
import { TEMPO_MAX, TEMPO_MIN } from "../songs/tempo";
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
  tuningHz: number;
  theme: Theme;
  /** Mitspielen: Sie trägt Kopfhörer – dann darf leise die Melodie mitklingen */
  headphones: boolean;
  /** Mitspielen: zuletzt gewählte Art */
  followMode: FollowMode;
}

/** Art des Mitspielens: Warte-Modus oder Takt-Modus */
export type FollowMode = "wait" | "beat";
export const FOLLOW_MODES: FollowMode[] = ["wait", "beat"];

/** Einstellungen mit Zahlenwert */
export type NumSetting = Exclude<keyof Settings, "theme" | "headphones" | "followMode">;

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
}

export const DEFAULT_SETTINGS: Settings = {
  sessionMinutes: 5,
  sessionCards: 20,
  toleranceCents: 40,
  holdMs: 300,
  tuningHz: 440,
  theme: "auto",
  headphones: false,
  followMode: "wait",
};

export const SETTING_LIMITS: Record<NumSetting, [number, number]> = {
  sessionMinutes: [1, 30],
  sessionCards: [5, 60],
  toleranceCents: [10, 50],
  holdMs: [100, 1000],
  tuningHz: [415, 466],
};

export function defaultData(): AppData {
  return {
    version: DATA_VERSION,
    app: "floetentrainer",
    settings: { ...DEFAULT_SETTINGS },
    stages: { lesen: stagesOf("lesen")[0].id, spielen: stagesOf("spielen")[0].id },
    countFrom: { lesen: 0, spielen: 0 },
    cards: {},
    history: { lesen: {}, spielen: {} },
    introduced: { lesen: [], spielen: [] },
    days: [],
    sessions: 0,
    songs: {},
    ownSongs: [],
  };
}

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
  return out;
}
