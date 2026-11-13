// Datenformat der App (Version 1), Standardwerte, Prüfung und Umwandlung älterer Versionen.

import { levelOf, stagesOf, type Kind, type Track } from "../music/levels";
import { NOTES } from "../music/notes";
import { isValidDayKey } from "./dates";

export const DATA_VERSION = 1;
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
}

/** Einstellungen mit Zahlenwert */
export type NumSetting = Exclude<keyof Settings, "theme">;

export interface CardState {
  /** Fach 1–6 */
  box: number;
  /** Tag der letzten gewerteten Antwort */
  day: string;
  /** Nummer der Sitzung dieser Antwort (für Fach 1: „in der nächsten Sitzung“) */
  session: number;
}

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
}

export const DEFAULT_SETTINGS: Settings = {
  sessionMinutes: 5,
  sessionCards: 20,
  toleranceCents: 40,
  holdMs: 300,
  tuningHz: 440,
  theme: "auto",
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
};

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
  return out;
}
