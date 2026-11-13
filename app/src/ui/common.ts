// Gemeinsame Bausteine der Oberfläche.

import type { Session, SessionResult } from "../srs/session";
import type { AppData } from "../store/data";

export interface Ctx {
  data: AppData;
  save(): void;
  go(hash: string): void;
  today(): string;
  session: Session | null;
  lastResult: SessionResult | null;
  /** Vom Stimmgerät/Spielen: Mikrofon-Fehler für die Hilfeseite */
  micError: string | null;
  /** Wohin nach erteilter Mikrofon-Erlaubnis */
  micRetry: (() => Promise<unknown>) | null;
  saveFailed: boolean;
}

/** Eine Seite zeichnet in root und gibt eine Aufräumfunktion zurück. */
export type View = (root: HTMLElement, ctx: Ctx) => (() => void) | void;

export function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export const ICON_X = `<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 3l12 12M15 3L3 15" fill="none" stroke-width="1.6" stroke-linecap="round"/></svg>`;
export const ICON_BACK = `<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 3.5L6 10l6.5 6.5" fill="none" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const ICON_CHECK = `<svg width="22" height="22" viewBox="0 0 34 34" aria-hidden="true"><circle cx="17" cy="17" r="15.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.5 17.5l4.3 4.3 8.7-9.3" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export function topbar(title: string, back = "#/"): string {
  return `<header class="topbar"><a class="iconbtn" href="${back}" aria-label="Zurück">${ICON_BACK}</a><h1>${title}</h1><span></span></header>`;
}

/** „1 Karte“ / „5 Karten“ */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function percent(r: number): string {
  return `${Math.round(r * 100)} %`;
}
