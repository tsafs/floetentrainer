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
   `#/lied/<kennung>` mit Notensatz, Vorspielen, Tempo je Lied, Einzählen, Metronom; Schleife und
   Griffbild sind mit der Nachsteuerung vom 14.11.2026 entfallen). Runde 2 (ABC-Dateien) und Runde 3 (Mitspielen) umgesetzt.
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
   - **Runde 3, Mitspielen** (Stand nach der Nachsteuerung vom 14.11.2026, siehe Ende von
     `docs/app-lieder.md`): Liedseite mit Umschalter „Anhören | Mitspielen“ unter dem Titel, kein
     Griffbild auf der Liedseite. Anhören: Takt antippen = ab dort vorspielen (keine Schleife mehr,
     `fromBarTimeline` in `timeline.ts`). Mitspielen: Takt antippen wählt, zweiter Tipp erweitert, ohne
     Auswahl ganzes Lied, ein Durchgang; Wahl „Wartet auf mich | Im Takt“ (`settings.followMode`), Schalter
     „Ich trage Kopfhörer“ (`settings.headphones`, derselbe wie in den Einstellungen), im Takt-Modus Tempo.
     Rückmeldung **nur Farben** (`.hit`/`.miss`), die nach dem Durchgang stehen bleiben; **Auswertung,
     schwierigste Takte und Bestwerte entfallen** (alte `songs[id].best` werden beim Laden still verworfen,
     kein Versionssprung). Lernspuren bleiben unberührt. Wertung `app/src/audio/follow.ts` (kann weiterhin
     Schleifen, die Oberfläche nutzt sie nicht), Oberfläche `app/src/ui/song-follow.ts`, Abspieler-
     Option `melody` (false = nur Klicks, Zahl = leise) in `song-player.ts`. Ohne Kopfhörer: Takt-Modus
     nur Klicks, Warte-Modus still; mit Kopfhörern Melodie leise bzw. im Warte-Modus nach einem falschen
     Ton kurz der richtige. Liederliste als klappbare Karten (Klappzustand im localStorage unter
     `floetentrainer-liederliste`). Tests `follow.test.ts`, `app/tests/e2e/follow.spec.ts` (echtes Audio in
     Echtzeit, Mikrofon-Attrappe plant Töne auf der Audio-Uhr), `songs.spec.ts`, Bildschirmfotos
     `*-l2…l6-*.png`, `*-f1…f6-*.png`.
     **Robuster seit 14.11.2026** (Befund am Gerät: Flöte −30 Cent, „Im Takt“ fast alles rot; Regeln in
     `docs/app-lieder.md`, „Mitspielen robuster“): nächster Halbton, Klarheit 0,85, „falsch“ im Warte-Modus erst
     nach 250 ms und neuem Einsatz, im Takt Wertung nach Anteil im mittleren Teil oder Einsatz am Notenbeginn,
     Verzögerung 120 ms (mit Kopfhörern 200 ms) bzw. am Gerät abgeglichen („Verzögerung abgleichen“ im
     Mitspiel-Bereich, `app/src/audio/latency.ts`; Wert je Kopfhörer-Zustand in `settings.inputLatencyMs`, nur
     im Browser, nicht in der Sicherung). **Flötenprofile** (`flutes`/`activeFlute` in den Daten, mit Sicherung):
     Einstellungen → Flöte, „Flöte einstellen“ (`#/floete`, `app/src/ui/flute.ts`); angewandt im Mitspielen
     (dort nachgeführt) und in der Spielen-Übung, Logik `app/src/audio/flute-profile.ts`.
     **Stimmton je Flöte (seit 14.11.2026):** Die Einstellung „Stimmton“ für alle (`settings.tuningHz`) ist weg;
     jede Flöte hat `tuning: { hz, known }` – bekannt (Wahl 440/442/443, sonst ± 1 Hz, 415–466) oder unbekannt
     (Median der gemessenen absoluten Lagen, beim Einstellen und Mitspielen mit ermittelt). Werte je Ton sind
     relativ zum Stimmton der Flöte; ungemessene Töne 0. Der Stimmton der aktiven Flöte gilt überall (Übung,
     Stimmgerät, Mitspielen, Vorspielen, Abgleich, Diagnose). Hz↔Cent und alle Umrechnungen (absolute Lagen
     bleiben) in `app/src/music/tuning.ts`; alte Daten werden ohne Versionssprung umgewandelt
     (`normalizeData`). Regeln in `docs/app-entscheidungen.md` 4/6/8. Tests `tuning.test.ts`,
     `app/tests/e2e/stimmton.spec.ts`, Bildschirmfotos `*-s1…s6-*.png`.
   - **Diagnose-Datei:** Nach jedem Mitspiel-Durchgang (und nach dem Abgleich) steht unter dem großen Knopf
     „Diagnose speichern“. Auf dem Handy öffnet das das Teilen-Menü – die Nutzerin schickt die Datei z. B. per
     E-Mail; sonst landet sie in „Downloads“ (`floetentrainer-diagnose-JJJJ-MM-TT-HHMM.json`). Enthält nur
     Messwerte (Frequenz, Klarheit, Lautstärke, Einordnung je 25 ms, Ereignisse, Verzögerungen, Flötenwerte,
     Mikrofon- und Browserangaben), keinen Ton. Auswerten: `node app/scripts/diagnose.mjs <datei>` (je Note
     erwartet/erkannt, Cent, Einsatz-Versatz, Grund für Rot, Median-Versatz, Anteil unklarer Messungen).
     Aufnahme `app/src/audio/diagnose.ts`. Bildschirmfotos `*-r1…r12-*.png`.
