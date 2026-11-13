// Darstellung hell/dunkel: „Wie das Handy“ folgt der Systemeinstellung, sonst fest.

import type { Theme } from "../store/data";

const PAPER = { light: "#fbf6ea", dark: "#1e1a16" };

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = theme;
  // Farbe der Browserleiste anpassen
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m) => {
    const forScheme = m.media.includes("dark") ? "dark" : "light";
    m.content = PAPER[theme === "auto" ? forScheme : theme];
  });
}
