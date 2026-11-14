// Menü: Leiste von rechts mit allen Seiten, geöffnet über den Knopf oben rechts in der Bildschirmecke.
//
// Knopf und Leiste liegen außerhalb von #app, damit sie das Neuzeichnen einer Seite überstehen. Der Knopf
// steht auf allen Seiten an derselben Stelle; sichtbar ist er nur, wenn die Seite mit menuSlot() (common.ts)
// Platz für ihn freihält – nicht in der Übung, auf dem Sitzungsende, der Willkommensseite usw. Das × der
// offenen Leiste steht genau an seiner Stelle. Beim Öffnen
// entsteht ein Verlaufseintrag mit derselben Adresse (kein hashchange, also kein Neuzeichnen), damit die
// Zurück-Geste von Android das Menü schließt. Schließen auf anderem Weg nimmt diesen Eintrag wieder
// zurück; wurde ein Eintrag gewählt, geht es erst danach zur neuen Seite – so bleibt der Verlauf sauber
// und die bisherige Seite räumt wie gewohnt über ihre Aufräumfunktion auf.

import { mic } from "../audio/mic";
import { ICON_MENU, ICON_X } from "./common";

const ENTRIES: { route: string; label: string }[] = [
  { route: "", label: "Startseite" },
  { route: "lieder", label: "Lieder" },
  { route: "fortschritt", label: "Fortschritt" },
  { route: "griffe", label: "Grifftabelle" },
  { route: "stimmgeraet", label: "Stimmgerät" },
  { route: "floete", label: "Flöte einstellen" },
  { route: "einstellungen", label: "Einstellungen" },
];

const hashOf = (route: string) => `#/${route}`;
const currentRoute = () => location.hash.replace(/^#\/?/, "").split("?")[0].split("/")[0];
const isMenuEntry = (state: unknown) => !!(state && (state as { ftMenu?: boolean }).ftMenu);

let installed = false;

export function installMenu(app: HTMLElement): void {
  if (installed) return;
  installed = true;

  const button = document.createElement("button");
  button.type = "button";
  button.className = "iconbtn menubtn";
  button.hidden = true;
  button.setAttribute("aria-label", "Menü");
  button.setAttribute("aria-expanded", "false");
  button.setAttribute("aria-controls", "menu");
  button.setAttribute("aria-haspopup", "dialog");
  button.innerHTML = ICON_MENU;
  // Sichtbar, wenn die gezeichnete Seite Platz für den Knopf freihält
  const sync = () => (button.hidden = !app.querySelector("[data-menu-slot]"));
  new MutationObserver(sync).observe(app, { childList: true, subtree: true });
  sync();

  const shade = document.createElement("div");
  shade.className = "menushade";
  shade.dataset.testid = "menu-shade";
  const panel = document.createElement("div");
  panel.id = "menu";
  panel.className = "menu";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "true");
  panel.setAttribute("aria-label", "Menü");
  panel.innerHTML =
    `<div class="menuhead"><button type="button" class="iconbtn menuclose" data-menu-close aria-label="Menü schließen">${ICON_X}</button></div>` +
    `<nav aria-label="Seiten"><ul>${ENTRIES.map((e) => `<li><a href="${hashOf(e.route)}" data-route="${e.route}">${e.label}</a></li>`).join("")}</ul></nav>`;
  document.body.append(button, shade, panel);

  let open = false;
  /** Nach dem Zurücknehmen des Verlaufseintrags dorthin wechseln */
  let pendingHash: string | null = null;

  const setExpanded = (v: boolean) => button.setAttribute("aria-expanded", String(v));
  const focusOpener = () => {
    if (!button.hidden) button.focus();
  };

  /** Nur das Bild schließen, ohne Verlauf */
  const hide = () => {
    open = false;
    document.documentElement.classList.remove("menu-open");
    app.inert = false;
    setExpanded(false);
  };

  const show = () => {
    if (open) return;
    open = true;
    const cur = currentRoute();
    panel.querySelectorAll<HTMLAnchorElement>("a[data-route]").forEach((a) => {
      if (a.dataset.route === cur) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    document.documentElement.classList.add("menu-open");
    app.inert = true;
    setExpanded(true);
    history.pushState({ ftMenu: true }, "", location.href);
    panel.scrollTop = 0;
    panel.querySelector<HTMLElement>("a[data-route]")?.focus();
  };

  /** Schließen per ×, Abdunklung, Escape oder Wahl eines Eintrags (target: neue Adresse) */
  const close = (target: string | null = null) => {
    if (!open) return;
    hide();
    if (isMenuEntry(history.state)) {
      pendingHash = target;
      history.back();
    } else if (target) location.hash = target;
    if (!target) focusOpener();
  };

  window.addEventListener("popstate", () => {
    if (open) {
      // Zurück-Geste: der Verlaufseintrag des Menüs ist schon weg
      hide();
      focusOpener();
      return;
    }
    if (pendingHash !== null) {
      const h = pendingHash;
      pendingHash = null;
      location.hash = h;
    }
  });
  // Seitenwechsel auf anderem Weg (sollte bei offenem Menü nicht vorkommen): nur schließen
  window.addEventListener("hashchange", () => {
    if (open) hide();
  });

  // Neu geladen, während das Menü offen war: dessen Verlaufseintrag (gleiche Adresse) zurücknehmen
  if (isMenuEntry(history.state)) history.back();

  button.addEventListener("click", show);
  shade.addEventListener("click", () => close());
  panel.querySelector("[data-menu-close]")!.addEventListener("click", () => close());
  panel.addEventListener("click", (e) => {
    const a = (e.target as Element).closest("a[data-route]") as HTMLAnchorElement | null;
    if (!a) return;
    e.preventDefault();
    const route = a.dataset.route!;
    if (route === currentRoute()) {
      close();
      return;
    }
    // Stimmgerät: Mikrofon direkt aus dem Tippen heraus starten, sonst lässt der Browser es nicht zu;
    // Fehler zeigt das Stimmgerät selbst an.
    if (route === "stimmgeraet") mic.start().catch(() => {});
    close(hashOf(route));
  });

  document.addEventListener("keydown", (e) => {
    if (!open) return;
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "Tab") {
      // Fokus bleibt in der Leiste
      const items = [...panel.querySelectorAll<HTMLElement>("button, a[href]")];
      const first = items[0];
      const last = items[items.length - 1];
      const at = document.activeElement;
      if (e.shiftKey && (at === first || !panel.contains(at))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (at === last || !panel.contains(at))) {
        e.preventDefault();
        first.focus();
      }
    }
  });
}
