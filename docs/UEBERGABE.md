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
   Schleife, Griffbild). Runde 2 (ABC-Dateien) und Runde 3 (Mitspielen) umgesetzt.
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
   - Daten: Tempo je Lied steht in `songs` (optionales Feld, kam ohne Versionssprung dazu).
   - **Runde 2, eigene Lieder (ABC):** Liederliste → „Lied hinzufügen“ (`#/lied-hinzufuegen`,
     `app/src/ui/own-songs.ts`): Datei wählen oder Text einfügen, bei mehreren Stücken auswählen,
     Fehlerstücke mit Zeile und Grund, Weggelassenes je Stück, Oktav-Angebot (angehakt) bzw. Hinweis auf
     Töne außerhalb c¹–d³. Kapitel „Eigene Lieder“ steht oben nach „Kannst du schon spielen“; spielbare
     eigene Lieder stehen wie Heft-Lieder ganz oben. Liedseite wie bei Heft-Liedern, dazu Kasten mit
     Hinweisen und „Lied löschen“ (Bestätigung in der Seite).
   - Gespeichert wird je Lied nur der **ABC-Quelltext** des Stücks (X: bis Leerzeile) samt Oktav-
     verschiebung, X:-Nummer und Zeitpunkt in `ownSongs` (`app/src/store/data.ts`); beim Start liest
     `app/src/songs/own.ts` ihn neu. Unlesbare Stücke bleiben und erscheinen mit Hinweis. **Datenformat
     Version 2** (Umwandlung aus 1): eine ältere App hätte die eigenen Lieder sonst beim Speichern still
     verworfen, so lehnt sie die Daten ab. Kommen mit in die Sicherung; Tests `own-songs.test.ts`,
     `app/tests/e2e/abc.spec.ts`, Bildschirmfotos `*-e1…e7-*.png`.
   - **Runde 3, Mitspielen:** Liedseite → Knopf „Mitspielen“ → Bedienleiste wechselt (Vorspielen aus):
     Wahl Warte-/Takt-Modus (gemerkt in `settings.followMode`), Schalter „Ich trage Kopfhörer“
     (`settings.headphones`, derselbe wie in den Einstellungen), Start/Stopp, im Takt-Modus Tempo,
     „Mitspielen beenden“. Gewählter Abschnitt läuft in Schleife, jeder Durchgang einzeln gewertet.
     Noten werden grün/rot (`.hit`/`.miss`), danach Auswertung „x von y Noten getroffen“ mit
     schwierigsten Takten (antippen = Abschnitt). Bestwert je Lied und Art in `songs[id].best`
     (optional, ohne Versionssprung; nur vollständige Durchgänge des ganzen Lieds). Lernspuren bleiben
     unberührt. Wertung `app/src/audio/follow.ts`, Oberfläche `app/src/ui/song-follow.ts`, Abspieler-
     Option `melody` (false = nur Klicks, Zahl = leise) in `song-player.ts`. Ohne Kopfhörer: Takt-Modus
     nur Klicks, Warte-Modus still; mit Kopfhörern Melodie leise bzw. im Warte-Modus nach einem falschen
     Ton kurz der richtige. Tests `follow.test.ts`, `app/tests/e2e/follow.spec.ts` (echtes Audio in
     Echtzeit, Mikrofon-Attrappe plant Töne auf der Audio-Uhr), Bildschirmfotos `*-f0…f6-*.png`.
     Verzögerung: fest 50 ms für Mikrofon und Erkennung, dazu die vom Browser gemeldete Ausgabe-Verzögerung
     (wie bei der Markierung; ohne Meldung 30 ms). Offen: Abgleich-Knopf für Kopfhörer, die zu knapp gemeldet werden.
