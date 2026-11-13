# Übergabe

Für eine neue Claude-Code-Sitzung: Stand und nächste Schritte.

## Nutzerin
Erwachsene Anfängerin auf Sopranblockflöte (barocke Griffweise), programmiert nicht selbst.
Antworten auf Deutsch, Technik in Worten erklären statt Code zu zitieren. Vor größeren Änderungen
kurz den Plan abstimmen. Design: ruhig, elegant, viel Weißraum, schwarz-weiß druckbar.

## Stand
- `heft/pdf/Liederheft-Blockfloete-sw.pdf` – 27 Seiten, aktuell (33 Stücke). Vorn das Inhaltsverzeichnis; es wird automatisch zweiseitig, wenn es nicht auf eine Seite passt.
- Bauen mit `heft/bauen.sh`. Das Skript misst die echten Höhen der Liedblöcke im Browser und
  verteilt sie auf Seiten (kein Lied über einen Umbruch); am Ende gibt es je Seite die Unterkante in mm
  aus – Werte über ca. 276 heißen: Seite läuft über.
- Lieder: `heft/songs.py` (Notation oben in der Datei erklärt). Jede Melodie wird beim Bauen auf
  Taktlängen und Silbenzahl geprüft. Wiederholungszeichen `|:` und `:|` sowie Klammern `[1` / `[2` (nach einem Taktstrich) werden unterstützt;
  Vorzeichen gelten bis zum Taktende
  (erklärt auf der Seite „Noten lesen“). Alle Notenzeilen laufen im Blocksatz über die volle Breite
  (Wunsch der Nutzerin) – deshalb pro Zeile genug Takte setzen, sonst wirkt es luftig.
- Regeln für Inhalte und die Wunschliste: `docs/notizen.md` (nur zweifelsfrei Gemeinfreies!).
- Vorlagen, die die Nutzerin selbst besorgt hat: `docs/quellen/`.
- Netz: Cloud-Umgebung „Floetentrainer“ benutzen. Sie erreicht de.wikibooks.org, thesession.org,
  imslp.org, abcnotation.com, de./en.wikipedia.org, upload.wikimedia.org, www.ceolas.org.
  www.cpdl.org und www.tunearch.org stehen auf der Liste, antworten aber mit 403 (sperren Programme aus).
  Freigaben kann die Nutzerin nur am Computer bestätigen, nicht am Handy.

## Prüfen vor dem Abgeben
Jede Seite als Bild ansehen (`pdftoppm`), Details vergrößert: Notenköpfe, Hilfslinien, Bögen,
Silben, Atemzeichen, Seitenumbrüche.

## Offene Aufgaben
1. Wunschliste in `docs/notizen.md` ist abgearbeitet; weitere Themen aus van Eycks „Fluyten Lust-hof“ möglich.
2. Übungs-App: umgesetzt in `app/` nach `docs/app-entscheidungen.md` (Vite + TypeScript, pitchy).
   Tests: `npm test` (Vitest) und `npm run e2e` (Playwright) im Ordner `app/`. Bildschirmfotos für die
   Durchsicht: `SHOTS=1 npx playwright test shots` (optional `SCHEME=dark`), landen in `app/shots/`.
   Veröffentlichung über `.github/workflows/pages.yml` auf https://tsafs.github.io/floetentrainer/.
3. Lieder-Erweiterung (`docs/app-lieder.md`): **Runde 1 umgesetzt** (Liederliste `#/lieder`, Liedseite
   `#/lied/<kennung>` mit Notensatz, Vorspielen, Tempo je Lied, Einzählen, Metronom, Abschnitt in
   Schleife, Griffbild). Runde 2 (ABC-Dateien) und Runde 3 (Mitspielen) sind offen.
   - Wo was liegt: `app/src/songs/` (Leser `parse.ts`, Modell, Zeitplan, Tempo, Spielbarkeit,
     Notensatz `layout.ts`/`engrave.ts`), Klang `app/src/audio/flute-synth.ts` und `song-player.ts`,
     Seiten `app/src/ui/songs.ts`, Tests `app/tests/unit/songs*.test.ts`, `timeline.test.ts`,
     `engrave.test.ts`, `song-player.test.ts` und `app/tests/e2e/songs.spec.ts` (mit vorgetäuschter
     Audio-Uhr `fake-audio.ts`).
   - **`heft/songs.py` wird beim Bauen gelesen** (`app/scripts/heft-songs.py` + `heft-songs-plugin.ts`):
     neue Lieder erscheinen automatisch, ein unlesbares Lied lässt den Bau scheitern. Die Notation dort
     muss deshalb stabil bleiben; neue Zeichen erst im App-Leser nachziehen. Die Liedkennung entsteht aus
     dem Titel – wird ein Titel geändert, geht das gemerkte Tempo dieses Lieds verloren. Grundtempo je
     Titel in `app/src/songs/tempo.ts`.
   - Daten: Tempo je Lied steht in `songs` (optionales Feld, Datenformat bleibt Version 1).
