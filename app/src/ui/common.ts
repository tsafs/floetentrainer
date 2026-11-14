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

/**
 * Klicks auf einen Knopf nur zählen, wenn auch der Druck auf diesem Knopf begann. Sonst landet ein Tipp,
 * der noch auf der vorigen Ansicht anfing (z. B. „Richtig“ wegtippen, während die Karte gerade von selbst
 * weitergeht), als Klick auf dem Knopf, der in der neuen Ansicht an derselben Stelle liegt.
 * Klicks ohne Zeiger (Tastatur, Screenreader, el.click(): detail = 0) zählen immer.
 */
export function pressGuard(root: HTMLElement): (e: Event, el: Element) => boolean {
  let pressed: Element | null = null;
  root.addEventListener("pointerdown", (e) => {
    pressed = (e.target as Element).closest("button");
  });
  return (e, el) => (e as MouseEvent).detail === 0 || pressed === el;
}

export const ICON_MENU = `<svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" fill="none" stroke-width="1.6" stroke-linecap="round"/></svg>`;

/**
 * Platz für den Menüknopf oben rechts. Der Knopf selbst ist ein einziges Element aus ui/menu.ts, das immer
 * an derselben Stelle in der Bildschirmecke steht; er erscheint nur auf Seiten, die diesen Platz freihalten.
 */
export function menuSlot(): string {
  return `<span class="menuslot" data-menu-slot></span>`;
}

/** Kopfzeile: Zurück, Titel, rechts der Menüknopf (menu = false: leerer Platz, z. B. auf der Fehlerseite). */
export function topbar(title: string, back = "#/", menu = true): string {
  return `<header class="topbar"><a class="iconbtn" href="${back}" aria-label="Zurück">${ICON_BACK}</a><h1>${title}</h1>${menu ? menuSlot() : "<span></span>"}</header>`;
}

/** „1 Karte“ / „5 Karten“ */
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function percent(r: number): string {
  return `${Math.round(r * 100)} %`;
}
