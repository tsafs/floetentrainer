# Flötentrainer-App: Notenband beim Spielen

Abgestimmt im Gespräch am 19.11.2026. Ergänzt `docs/app-entscheidungen.md` und `docs/app-uebungen.md`.

## Anlass

Rückmeldung: „Beim Spielen üben, dass ich einzelne Töne oder zwei Töne oder eine Tonreihe von 3 oder 4 Tönen
spielen muss, ist ziemlich langweilig, und man hat immer eine kleine Unterbrechung zwischen den kleineren
Aufgaben.“ Wunsch: ein durchlaufender Modus – die Notenlinien laufen von rechts nach links, und wenn man einen
Ton gespielt hat, kommt einfach der nächste; je nachdem, wie schnell man spielt, läuft es schneller oder
langsamer.

## Entscheidungen der Nutzerin

1. **Das Notenband ersetzt das Spielen.** Der Knopf „Spielen“ startet immer das Band; die einzelnen Spielen-
   Karten und Folgen-Bildschirme entfallen. Neue Töne werden vorher wie bisher einzeln vorgestellt.
2. **Länge eher nach Zeit, „vielleicht auch nach Tönen, etwa 50“:** Das Band endet am Ende des laufenden
   Abschnitts, sobald die Zeit (Standard 3 Minuten) um ist **oder** so viele Töne gespielt sind (Standard 50).
   Beides in den Einstellungen unter „Spielen“ änderbar (wie bei den Sitzungen beim Üben).
3. **Liedstücke im Band**, „solange es melodisch passt und ein melodischer Übergang in das Lied da ist“.
4. **Auch die übrigen Töne mit Notenwerten** (ganze, halbe, Viertel, Achtel), damit das Band wie ein Lied
   aussieht. Gespielt wird nicht im Takt – das Band wartet –, aber es soll „optisch gleich aussehen“ und sich
   möglichst melodisch anhören.
5. **Üben (Tippen) bleibt**, die Tonfolgen dort dürfen aber länger werden.

## Wie das Band funktioniert

- Eine lange Notenzeile mit fester Lesemarke etwa bei einem Drittel der Breite. Links steht fest der
  Violinschlüssel; das Band läuft darunter durch. Rechts sind die nächsten Noten schon zu sehen
  (vorauslesen), links die eben gespielten (grün bzw. rot).
- **Das Band wartet:** Erst wenn die Note an der Marke richtig gespielt ist, gleitet es weich zur nächsten.
  Wer schnell spielt, lässt es schnell laufen. Kein Zeitdruck, keine Wertung des Rhythmus.
- **Falscher Ton:** Note rot, darunter „Du spielst …“; das Band wartet auf den richtigen Ton (wie bisher bei
  Folgen). Mit Kopfhörern kurz der richtige Ton. Oktave zu hoch: nur ein Hinweis.
- Erkennung wie beim Mitspielen „Wartet auf mich“ (seit 19.11.2026, `docs/erkennung.md`): feine Messungen
  (≈ 5 ms) im AudioWorklet, nächster Halbton relativ zur Flöte, Haltedauer 120 ms (Zielton-Zeit
  zusammengezählt), Klarheit ab 0,85 und nahe der erwarteten Note ab 0,7; Tonwiederholung braucht einen
  neuen Einsatz; Stimmton und Werte der aktiven Flöte. Toleranz und Haltedauer der Einstellungen gelten nur
  noch für die Vorstellung neuer Töne (wie beim Üben). Ein einziger Durchgang über das
  ganze Band, damit der gehaltene Ton am Übergang zweier Abschnitte nicht als falsch zählt.

## Was im Band steht

Das Band besteht aus **Abschnitten** von meist zwei Takten, Taktart wie das Stufenlied (sonst 4/4), ohne
Vorzeichnung (Vorzeichen stehen an den Noten und gelten bis zum Taktende, wie in Liedern).

- **Melodische Abschnitte** aus den vorgestellten Tönen wie die bisherigen Folgen: meist Nachbartöne, oft
  Terzen, selten größere Sprünge, Halbtonschritte und schwache Töne bevorzugt, nie derselbe Ton zweimal direkt
  hintereinander. Jeder Abschnitt beginnt nahe beim letzten Ton davor und endet möglichst auf einem Ton des
  Grundakkords der Tonart des Stufenlieds (klingt nach Ruhepunkt). Rhythmus aus kleinen Taktmustern (Viertel,
  Halbe, Achtelpaare, gelegentlich punktiert); der letzte Takt endet mit einem langen Ton.
- **Liedstücke:** etwa jeder vierte Abschnitt ist ein Abschnitt des Stufenlieds (mit Rhythmus und Liedtext),
  der Reihe nach durch das Lied. Der Abschnitt davor endet einen Schritt neben dem ersten Ton des Liedstücks,
  der danach beginnt nahe bei dessen letztem Ton. Über dem Liedstück steht klein der Titel. Auftakte schließen
  an den Takt davor an; ein kurzer Schlusstakt wird mit einer Pause aufgefüllt.
- **Wechsel:** einmal je Band ein Abschnitt aus zwei Tönen im Wechsel (schwieriger Griffwechsel), Titel
  „Wechsel“.
- **Fällige und neue Töne** stecken in den ersten Abschnitten (je Abschnitt einer). Ihre Leitner-Karte wird
  mit diesem Abschnitt gewertet: richtig nur, wenn der Ton dort überall gleich richtig war.
- **Fehler:** Ein Abschnitt mit Fehler kommt nach einem anderen Abschnitt noch einmal (ungewertet, Titel
  „noch einmal“).

## Wertung

- Je Abschnitt zählt jeder verschiedene Ton einmal für Trefferquote und Sicherheit (wie bei Folgen),
  Griffwechsel werden gemerkt (`data.pairs`).
- Ergebnis: „47 von 50 Tönen sofort richtig“, dazu „Schwierig waren“ und Freischaltungen wie bisher.

## Lesen: längere Tonfolgen

Die Tonfolgen beim Tippen beginnen mit 4 Tönen (bei genau 5 vorgestellten 3) und werden bis 8 lang (bisher 5,
ab Stufe 8 6). Höchstens 4 verschiedene Töne bleibt (eine Knopfzeile). Griffbilder → Namen bleibt bei
höchstens 5.

## Später denkbar

- Band, das von selbst im Tempo läuft und sich dem eigenen Tempo anpasst (erst, wenn die Erkennung bei
  schnellem Spiel besser ist).
- Ganze Lieder als Band auf der Liedseite; Notenband auch beim Tippen.

## Umsetzung (19.11.2026)

- **Wo was liegt:** Notenbild des Bands `app/src/songs/band-score.ts` (`BandScore`: Abschnitte anhängen,
  Taktmuster je Taktart, Auftakt an den offenen Takt, kurzer Schlusstakt mit Pause, Vorzeichen bis Taktende,
  Grundakkord `triadNotes`); Ablauf und Wertung `app/src/srs/band.ts` (`BandSession`: Vorstellungen,
  `fill` hängt Abschnitte an, bis 10 Töne vorrätig sind, `phraseDone` wertet, Wiederholung nach Fehler,
  Ende nach Zeit/Tönen mit Schlussstrich); Oberfläche `app/src/ui/band.ts`, Seite `#/notenband`
  (`ctx.band`), Gestaltung am Ende von `app/src/styles.css`. Melodischer Verlauf über neue Optionen von
  `makeFolge` (`from`, `toward`, `endOn`, `contour`). Notensatz: Option `band` von `layoutScore`/`renderScore`
  (eine Zeile, feste Dehnung, ohne Zeilenkopf und Linien, feste Höhe). Erkennung: ein `WaitFollower` über
  den wachsenden Zeitplan; neu `WaitFollower.skip` für „Überspringen“.
- **Abweichungen vom Plan:** Liedstück nach je drei erzeugten Abschnitten (statt jedem vierten), der Wechsel
  ist der vierte erzeugte Abschnitt. Liedstücke nur, wenn das Stufenlied eine Taktart hat, die das Band kann
  (4/4, 2/2, 3/4, 2/4, 6/8). Knopf „Überspringen“ (Note zählt falsch). Der Zähler oben zählt die Töne vor
  der Marke, der Balken die Zeit bzw. die gewerteten Töne.
- Das Band läuft über die ganze Bildschirmbreite (höchstens 960 px), quer eine Spalte.
- Die Spielen-Teile von `Session` (`app/src/srs/session.ts`: Folgen-Plätze, Drill, Stufenlied-Abschnitte
  beim Spielen) und von `renderFolge`/`renderCard` in `app/src/ui/practice.ts` benutzt die Oberfläche nicht
  mehr; sie sind noch da (getestet), können aber entfernt werden.
- **Tests:** `app/tests/unit/band.test.ts`, `app/tests/e2e/band.spec.ts` (Bildschirmfotos mit `SHOTS=1`:
  `shots/band-*.png`), in `shots.spec.ts` „Spielen und Stimmgerät“ (`*-a-spielen-hoeren`, `*-b-spielen-falsch`).
  Die alten Spielen-Karten- und Spielen-Folgen-Tests sind entfallen.
