# Übergabe

Für eine neue Claude-Code-Sitzung: Stand und nächste Schritte.

## Nutzerin
Erwachsene Anfängerin auf Sopranblockflöte (barocke Griffweise), programmiert nicht selbst.
Antworten auf Deutsch, Technik in Worten erklären statt Code zu zitieren. Vor größeren Änderungen
kurz den Plan abstimmen. Design: ruhig, elegant, viel Weißraum, schwarz-weiß druckbar.

## Stand
- `heft/pdf/Liederheft-Blockfloete-sw.pdf` – 18 Seiten, aktuell.
- Bauen mit `heft/bauen.sh`. Das Skript misst die echten Höhen der Liedblöcke im Browser und
  verteilt sie auf Seiten (kein Lied über einen Umbruch); am Ende gibt es je Seite die Unterkante in mm
  aus – Werte über ca. 276 heißen: Seite läuft über.
- Lieder: `heft/songs.py` (Notation oben in der Datei erklärt). Jede Melodie wird beim Bauen auf
  Taktlängen und Silbenzahl geprüft.
- Regeln für Inhalte und die Wunschliste: `docs/notizen.md` (nur zweifelsfrei Gemeinfreies!).

## Prüfen vor dem Abgeben
Jede Seite als Bild ansehen (`pdftoppm`), Details vergrößert: Notenköpfe, Hilfslinien, Bögen,
Silben, Atemzeichen, Seitenumbrüche.

## Offene Aufgaben
1. „All in a Garden Green“ aus verlässlicher Quelle aufnehmen (Wunsch der Nutzerin).
2. Weitere Stücke aus `docs/notizen.md`, v. a. Themen aus van Eycks „Fluyten Lust-hof“.
3. Übungs-App: umgesetzt in `app/` nach `docs/app-entscheidungen.md` (Vite + TypeScript, pitchy).
   Tests: `npm test` (Vitest) und `npm run e2e` (Playwright) im Ordner `app/`. Bildschirmfotos für die
   Durchsicht: `SHOTS=1 npx playwright test shots` (optional `SCHEME=dark`), landen in `app/shots/`.
   Veröffentlichung über `.github/workflows/pages.yml` auf https://tsafs.github.io/floetentrainer/.
