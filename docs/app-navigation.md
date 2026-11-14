# Flötentrainer-App: Menü statt unterer Linkleiste

Abgestimmt mit der Nutzerin am 14.11.2026. Ergänzt `docs/app-entscheidungen.md` (Abschnitt 6 „Seiten“);
nach der Umsetzung dort nachtragen. Unabhängig von `docs/app-tonfolgen.md` – beide können gleichzeitig
umgesetzt werden. Bitte die Startseite nur so weit anfassen, wie es für das Menü nötig ist.

## Ziel

Die Zeile „Lieder · Stimmgerät · Grifftabelle · Einstellungen“ unten auf der Startseite entfällt. Sie
wird auf schmalen Handys schon jetzt zweizeilig und lässt sich nicht erweitern. Stattdessen gibt es auf
jeder Seite oben rechts einen Menüknopf, der eine Leiste mit allen Seiten aufklappt.

## Entscheidungen

- **Menüknopf** oben rechts, drei feine Striche (passend zu `ICON_BACK`/`ICON_X` in
  `app/src/ui/common.ts`: gleiche Strichstärke, `currentColor`, ruhig). Beschriftung für Vorleser
  „Menü“, `aria-expanded`, `aria-controls`. Tippfläche mindestens 44 × 44 px.
- **Wo:** auf allen Seiten mit Kopfzeile. In `topbar()` ist rechts schon ein leerer Platz (`<span></span>`).
  Seiten, die die Kopfzeile selbst schreiben (`songs.ts` Liederliste und Liedseite, `own-songs.ts`),
  bekommen den Knopf ebenso – am besten über eine gemeinsame Funktion in `common.ts`.
  Auf der **Startseite** (keine Kopfzeile): Knopf oben rechts in einer Zeile mit dem Titel
  „Flötentrainer“.
- **Wo nicht:** in der **Übung** (`#/uebung`, dort bleibt nur ×; sonst tippt man mitten in der Sitzung
  weg), auf dem **Sitzungsende** (`#/ende`) und auf der Fehlerseite „Daten nicht lesbar“.
- **Die Leiste** kommt von rechts (der Knopf sitzt rechts), etwa 80 % der Breite, höchstens ~320 px. Der
  Rest der Seite wird leicht abgedunkelt. Einträge in dieser Reihenfolge:
  1. Startseite
  2. Lieder
  3. Fortschritt
  4. Grifftabelle
  5. Stimmgerät
  6. Flöte einstellen
  7. Einstellungen

  Die aktuelle Seite ist markiert (`aria-current="page"`, dezent, z. B. feiner Strich oder fette Schrift).
  Schrift und Abstände wie die übrigen Seiten (EB Garamond, viel Weißraum, kein Farbschmuck). Oben in der
  Leiste ein ×.
- **Schließen:** ×, Tippen auf den abgedunkelten Bereich, Escape, Wahl eines Eintrags, und die
  **Zurück-Geste von Android** (wichtig, das ist auf dem Handy der natürliche Weg). Für die Zurück-Geste
  beim Öffnen einen Verlaufseintrag anlegen (`history.pushState` ohne Änderung des `#`-Ziels) und auf
  `popstate` schließen; beim Schließen per × diesen Eintrag wieder zurücknehmen. Dabei darf die
  bestehende `#`-Steuerung in `app/src/main.ts` (`hashchange` → `render`) nicht doppelt zeichnen.
- **Stimmgerät:** Heute startet der Link das Mikrofon direkt aus dem Tippen (`home.ts`, `data-act="tuner"`),
  damit der Browser die Erlaubnis zulässt. Der Menüeintrag muss das genauso tun.
- **Läuft gerade etwas** (Vorspielen, Mitspielen, Stimmgerät, Flöte einstellen): Das Öffnen des Menüs
  hält nichts an; erst die Wahl einer anderen Seite räumt wie bisher über die Aufräumfunktion der Seite
  auf. Wird die aktuelle Seite gewählt, nur schließen.
- **Startseite:** `nav.links` und die zugehörige Anpassung „zweizeilig“ in der `fit()`-Funktion entfallen
  (die Verdichtung `dense`/`denser` bleibt). Fortschritt bleibt zusätzlich über die Stufenleisten
  erreichbar. Der gewonnene Platz kommt der Tonübersicht zugute.
- **Zugänglichkeit:** Fokus beim Öffnen auf den ersten Eintrag (oder ×), Fokus bleibt in der Leiste
  (Tab läuft im Kreis), beim Schließen zurück auf den Menüknopf. Bei `prefers-reduced-motion` ohne
  Gleiten. Hell- und Dunkelmodus (`app/src/ui/theme.ts`, Farbvariablen in `styles.css`) prüfen.
- **Querformat** (Handy quer, 740 × 360): Die Leiste muss ganz bedienbar sein, notfalls scrollt sie in
  sich.

## Tests und Prüfung

- Bestehende Browser-Tests, die auf der Startseite den Link „Stimmgerät“ antippen oder `nav.links`
  prüfen (`songs.spec.ts`, `play.spec.ts`, `follow-robust.spec.ts`, `shots.spec.ts`), auf das Menü
  umstellen – am besten über eine kleine Hilfsfunktion in `app/tests/e2e/util.ts` („Menü öffnen und
  Eintrag wählen“).
- Neue Tests: Menü öffnen/schließen (×, Abdunklung, Escape, Zurück), Eintrag führt zur Seite, aktuelle
  Seite markiert, kein Menü in der Übung und auf dem Sitzungsende, Stimmgerät startet das Mikrofon.
- Bildschirmfotos (`SHOTS=1 npx playwright test shots`, auch `SCHEME=dark`): Startseite und eine
  Unterseite, Menü offen, je hoch und quer (360 × 740 und 740 × 360). Vor dem Abgeben selbst ansehen.
- `npm test`, `npm run e2e`, `npm run build` im Ordner `app/` grün.

## Doku nach der Umsetzung

- `docs/app-entscheidungen.md` Abschnitt 6: Startseite („darunter Stimmgerät · …“ ersetzen) und ein
  Punkt „Menü“.
- `docs/UEBERGABE.md`: kurzer Eintrag, wo das Menü liegt und wie es getestet wird.
