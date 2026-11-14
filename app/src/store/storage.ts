// Speichern im localStorage. Bei Lesefehlern wird nie still gelöscht.

import { DataError, defaultData, normalizeData, type AppData } from "./data";
import { dayKey } from "./dates";

export const STORAGE_KEY = "floetentrainer";

export type LoadResult = { ok: true; data: AppData; fresh: boolean } | { ok: false; error: string; raw: string };

export function loadData(storage: Storage = localStorage): LoadResult {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { ok: false, error: "Der Speicher des Browsers lässt sich nicht lesen.", raw: "" };
  }
  if (raw === null) return { ok: true, data: defaultData(), fresh: true };
  try {
    return { ok: true, data: normalizeData(JSON.parse(raw)), fresh: false };
  } catch (e) {
    const msg = e instanceof DataError ? e.message : "Die gespeicherten Daten sind beschädigt.";
    return { ok: false, error: msg, raw };
  }
}

export function saveData(data: AppData, storage: Storage = localStorage): boolean {
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

/** Beschädigte Daten vor dem Überschreiben aufheben, damit nichts verloren geht. */
export function keepBrokenCopy(raw: string, storage: Storage = localStorage): void {
  try {
    storage.setItem(`${STORAGE_KEY}-beschaedigt-${Date.now()}`, raw);
  } catch {
    /* nichts zu tun */
  }
}

export function requestPersistence(): void {
  try {
    navigator.storage?.persist?.().catch(() => {});
  } catch {
    /* ältere Browser */
  }
}

export function backupFileName(): string {
  return `floetentrainer-sicherung-${dayKey()}.json`;
}

/**
 * Die Sicherung enthält alles außer dem, was nur zu diesem Gerät gehört: der abgeglichenen
 * Eingangs-Verzögerung (settings.inputLatencyMs, siehe ./data.ts). Beim Einlesen behält das Gerät
 * seinen eigenen Wert (keepDeviceSettings).
 */
export function backupJson(data: AppData): string {
  const settings: Partial<AppData["settings"]> = { ...data.settings };
  delete settings.inputLatencyMs;
  return JSON.stringify({ ...data, settings, savedAt: new Date().toISOString() }, null, 1);
}

/** Eingelesene Daten: Werte, die zum Gerät gehören, vom jetzigen Stand übernehmen */
export function keepDeviceSettings(incoming: AppData, current: AppData): AppData {
  return { ...incoming, settings: { ...incoming.settings, inputLatencyMs: { ...current.settings.inputLatencyMs } } };
}

/** Sicherung einlesen: prüfen und gegebenenfalls umwandeln. Wirft DataError mit verständlicher Meldung. */
export function parseBackup(text: string): AppData {
  let obj: unknown;
  try {
    obj = JSON.parse(text);
  } catch {
    throw new DataError("Die Datei ist keine lesbare Sicherung (kein gültiges JSON).");
  }
  if (typeof obj === "object" && obj !== null && (obj as Record<string, unknown>).app !== "floetentrainer") {
    throw new DataError("Das ist keine Sicherung des Flötentrainers.");
  }
  const d = normalizeData(obj);
  return d;
}
