// Menü: Leiste von rechts mit allen Seiten, geöffnet über den Knopf oben rechts (menuButton in common.ts).
//
// Die Leiste liegt außerhalb von #app, damit sie das Neuzeichnen einer Seite übersteht. Beim Öffnen
// entsteht ein Verlaufseintrag mit derselben Adresse (kein hashchange, also kein Neuzeichnen), damit die
// Zurück-Geste von Android das Menü schließt. Schließen auf anderem Weg nimmt diesen Eintrag wieder
// zurück; wurde ein Eintrag gewählt, geht es erst danach zur neuen Seite – so bleibt der Verlauf sauber
// und die bisherige Seite räumt wie gewohnt über ihre Aufräumfunktion auf.

import { mic } from "../audio/mic";
import { ICON_X } from "./common";

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
    `<div class="menuhead"><button type="button" class="iconbtn" data-menu-close aria-label="Menü schließen">${ICON_X}</button></div>` +
    `<nav aria-label="Seiten"><ul>${ENTRIES.map((e) => `<li><a href="${hashOf(e.route)}" data-route="${e.route}">${e.label}</a></li>`).join("")}</ul></nav>`;
  document.body.append(shade, panel);

  let open = false;
  /** Nach dem Zurücknehmen des Verlaufseintrags dorthin wechseln */
  let pendingHash: string | null = null;
  let opener: HTMLElement | null = null;

  const setExpanded = (v: boolean) =>
    document.querySelectorAll<HTMLElement>("[data-menu]").forEach((b) => b.setAttribute("aria-expanded", String(v)));

  const focusOpener = () => {
    const btn = opener?.isConnected ? opener : document.querySelector<HTMLElement>("[data-menu]");
    btn?.focus();
    opener = null;
  };

  /** Nur das Bild schließen, ohne Verlauf */
  const hide = () => {
    open = false;
    document.documentElement.classList.remove("menu-open");
    app.inert = false;
    setExpanded(false);
  };

  const show = (btn: HTMLElement) => {
    if (open) return;
    open = true;
    opener = btn;
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
    else opener = null;
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

  document.addEventListener("click", (e) => {
    const btn = (e.target as Element).closest?.("[data-menu]") as HTMLElement | null;
    if (btn) {
      e.preventDefault();
      show(btn);
    }
  });
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
