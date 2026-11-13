# Flötentrainer-App: Entscheidungen

Ergebnis der Abstimmung mit der Nutzerin (13.11.2026). Ergänzt und präzisiert `docs/app-prompt.md`.
**Bei Widersprüchen gilt dieses Dokument.** Visueller Entwurf: `docs/entwurf/app-mock.html`
(im Browser öffnen, `?s=home`, `?s=ok` oder `?s=err` anhängen) und die Bildschirmfotos daneben.

## 1. Sitzungen

- Zwei Knöpfe auf der Startseite:
  - **Üben**: Note→Name, Note→Griff und Griff→Note bunt gemischt.
  - **Spielen**: nur Spielen-Karten mit Mikrofon (Flöte und ruhiger Raum nötig).
- Eine Sitzung endet nach 5 Minuten oder 20 Karten, je nachdem, was zuerst eintritt (beides einstellbar).
  Eine angefangene Karte wird noch zu Ende gespielt.
- Reihenfolge: fällige Karten zuerst (die am längsten überfälligen vorn), dann neue Karten
  der freigeschalteten Töne.
- Falsch beantwortete Karten kommen in derselben Sitzung nochmal, nach 2–3 anderen Karten, falls es
  noch andere gibt. Diese Wiederholung zählt nicht zur Kartengrenze von 20.
- **Nichts fällig, nichts neu:** Die App meldet „Für heute alles erledigt“ und bietet „Trotzdem üben“
  an. Dann kommen zufällige Karten der freigeschalteten Töne, schwache Töne bevorzugt. Diese Antworten
  zählen für die Trefferquote (Abschnitt 3), ändern aber **keine** Fächer und Termine.

## 2. Karten und Wiederholung (Leitner)

- Eine Karte ist eine Kombination aus Ton und Übungsart.
- Sechs Fächer:

  | Fach | wieder fällig |
  |---|---|
  | 1 | in derselben Sitzung |
  | 2 | nach 1 Tag |
  | 3 | nach 3 Tagen |
  | 4 | nach 7 Tagen |
  | 5 | nach 14 Tagen |
  | 6 | nach 30 Tagen |

- Richtig: ein Fach höher. Falsch: zurück in Fach 1.
- Fälligkeit nach Kalendertagen in der lokalen Zeitzone: „nach 1 Tag“ heißt ab dem nächsten Kalendertag.
- Eine neue Karte startet in Fach 1.
- Serie: Anzahl der Kalendertage in Folge mit mindestens einer beantworteten Karte, egal welcher Art.

## 3. Fortschritt: zwei getrennte Spuren

- **Lesen** (die drei Tipp-Übungen zusammen) und **Spielen** haben jeweils eine eigene Stufe.
- **Freischalten:** Die nächste Stufe einer Spur kommt automatisch, sobald *jeder* bisher
  freigeschaltete Ton in dieser Spur
  - mindestens 10 Antworten hat und
  - von seinen letzten 20 Antworten mehr als 90 % richtig sind.

  Bei Lesen werden die Antworten aller drei Tipp-Übungen eines Tons zusammengezählt. Danach erscheint
  eine kurze Meldung, zum Beispiel „Neu: c² und d²“.
- **Spielen kann Lesen nie überholen:** Die Spielen-Stufe ist höchstens so hoch wie die Lesen-Stufe.
  Lesen darf beliebig vorauslaufen.
- **Von Hand:** In den Einstellungen lässt sich jede Spur verstellen. Spielen bleibt dabei auf die
  Lesen-Stufe begrenzt. Wird Lesen unter die Spielen-Stufe gesenkt, sinkt Spielen mit.
- Die Fächer bestimmen nur, *wann* eine Karte wiederkommt, nicht das Freischalten.
- **Stufen** (die acht aus dem Auftrag, dazu eine neunte):
  1. h¹ a¹ g¹
  2. c² d²
  3. e¹ d¹
  4. fis¹
  5. e² f¹
  6. c¹
  7. cis² f² g²
  8. cis¹ es¹ gis¹ b¹ es² fis² gis² a² b² h² c³
  9. Andere Schreibweisen: des¹ dis¹ ges¹ as¹ ais¹ des² dis² ges² as² ais²

  Die Nutzerin wollte die anderen Schreibweisen „in der letzten Stufe“. Deshalb kommen sie
  als eigene Schlussstufe nach allen Tönen der Grifftabelle. Jede andere Schreibweise hat denselben
  Griff wie ihr Partner in der Tabelle.

## 4. Übungsarten im Detail

- **Note→Name:**
  - Anfangs 4 Namen zur Auswahl.
  - Hat die Karte Fach 3 erreicht, kommen Knöpfe für **alle** freigeschalteten Töne der Lesen-Spur,
    nach Tonhöhe geordnet. Fällt sie zurück in Fach 1 oder 2, gibt es wieder 4 Namen.
- **Note→Griff:** 4 Griffbilder zur Auswahl.
- **Griff→Note:** Ein Griffbild wird gezeigt, zur Wahl stehen 4 kleine Notenzeilen.
  - Nur Töne aus der Grifftabelle, keine anderen Schreibweisen: Ein Griff hätte sonst zwei richtige
    Antworten.
- **Falsche Antworten möglichst verwechselbar:** Nachbartöne, ähnliche Griffe (wenige Löcher anders),
  derselbe Ton in der anderen Oktave.
  - Reichen die freigeschalteten Töne nicht für 4 Möglichkeiten (z. B. Stufe 1), kommen Nachbartöne
    aus späteren Stufen dazu. Diese werden selbst nie abgefragt.
  - Nie zwei Möglichkeiten mit demselben Griff und nie zwei Schreibweisen desselben Tons.
- **Notennamen:** Deutsch (c d e f g a h, cis, es, b …), immer mit Oktavzahl.
  - Die Schreibweise in der Notenzeile folgt dem Namen: es¹ mit ♭, cis¹ mit ♯, b¹ mit ♭.
- **Spielen:**
  - Die Note wird gezeigt, die App hört zu (Bibliothek „pitchy“).
  - Die Sopranflöte klingt eine Oktave höher als notiert: notiertes c¹ ≈ 523,25 Hz bei a = 440 Hz.
  - Richtig: Der gesuchte Ton klingt 0,3 s stabil innerhalb der Toleranz (Standard ±40 Cent).
  - Ein stabiler falscher Ton (0,3 s, gleiche Regel) zählt als Fehler, die Karte kommt in Fach 1. Die App
    zeigt „Du spielst a¹“, und die Nutzerin darf weiterspielen, bis der richtige Ton kommt.
    Danach geht es weiter.
  - Knopf „Weiß nicht“: Lösung zeigen, gilt als Fehler.
  - Laufend wird angezeigt, welchen Ton die App hört.
  - Einstellbar sind Toleranz, Haltedauer (Standard 0,3 s) und Stimmton (Standard a = 440 Hz).

## 5. Rückmeldung

- **Richtig:**
  - Ein grün getöntes Feld erscheint mit Häkchen, „Richtig“, dem Namen groß und dem Griffbild.
    Text und Griffbild stehen senkrecht mittig nebeneinander.
  - Nach etwa 1 Sekunde geht es von selbst weiter, Tippen geht schneller.
  - Im Hochformat bleiben die Knöpfe sichtbar (der richtige hervorgehoben, die anderen blass).
    Im Querformat ersetzt das Feld die Knöpfe.
- **Falsch:**
  - Ein rötlich getöntes Feld ersetzt die Knöpfe: „Nicht ganz“, der richtige Name, das Griffbild,
    die eigene Antwort und ein kurzer Hinweis (z. B. „c¹ hat eine eigene Hilfslinie …“).
  - Darunter ein großer Knopf „Weiter“, es geht nicht von selbst weiter.
  - Die Note bleibt oben stehen, sodass Note, Name und Griff zusammen sichtbar sind.
- **Keine Beschreibung in Worten, welche Löcher zu sind.** Das Griffbild reicht.

## 6. Seiten

- **Startseite** (Entwurf `?s=home`):
  - Titel, die Zahl der fälligen Karten, „Tage in Folge“ und die Woche als Punkte Mo–So.
  - Die beiden Spuren als Stufenleisten.
  - „Deine Töne beim Lesen“: Namen mit kleinem Trefferquote-Balken, schwache Töne in Rot.
  - Unten die großen Knöpfe Üben und Spielen, darunter Stimmgerät · Grifftabelle · Einstellungen.
- **Übung** (Entwurf `?s=ok`, `?s=err`): oben ein ×-Knopf zum Beenden, ein feiner Fortschrittsstrich und
  „7 von 20“, darunter Notenzeile, Frage, Antworten und Rückmeldung.
- **Sitzungsende:** eine kurze Zusammenfassung (wie viele richtig, welche Töne schwierig waren, ggf.
  neu freigeschaltete Töne), dann zurück zur Startseite.
- **Fortschritt:** Trefferquote je Ton, getrennt nach Lesen und Spielen. Erreichbar durch Tippen auf
  die Spuren der Startseite.
- **Stimmgerät:** freies Spielen mit laufender Anzeige der gehörten Note (auf den Linien, als Name und
  Griffbild) und der Abweichung in Cent.
- **Grifftabelle:** alle Töne c¹–c³ mit Note, Name und Griffbild. Noch nicht freigeschaltete Töne
  erscheinen blass.
- **Einstellungen:**
  - Sitzungslänge (Minuten, Karten)
  - Toleranz, Haltedauer und Stimmton
  - beide Stufen von Hand
  - Sicherung als Datei herunterladen und wieder einlesen
  - alles zurücksetzen, mit Bestätigung in der Seite selbst

## 7. Gestaltung

- **Schrift:** ausschließlich EB Garamond (normal 400 und 500, kursiv 400), lokal eingebunden.
  - Die woff2-Dateien liegen in `heft/fonts/`; die App bekommt Kopien mitsamt Lizenztext.
  - Nebeninfos stehen kursiv in gedämpfter Farbe.
  - Keine Sans-Schrift: Die Nutzerin fand die Mischung mit Source Sans 3 unnatürlich.
- **Notennamen mit Hochzahl:** Buchstaben plus eigenes Element für die Oktavzahl
  (etwa 0,58 em groß, etwa 0,72 em angehoben, 0,09 em Abstand links).
  - Nicht die Unicode-Zeichen ¹ ² ³: Das ¹ stößt in Garamond an den Bogen des f.
- **Farben (hell):**

  | Rolle | Wert |
  |---|---|
  | Papier | `#fbf6ea` |
  | Tinte | `#2b2724` |
  | gedämpft | `#82786d` |
  | Linien und Rahmen | `#d6c4a3` |
  | Leisten | `#e8dcc6` |
  | Knopfgrund | `#fffdf8` |
  | Richtig | `#4c7350` auf `#edf0e1` |
  | Falsch | `#9a4b3a` auf `#f5e8de` |

  - Holzfarben des Griffbilds wie in `heft/engrave.py`.
  - **Dunkelmodus** folgt automatisch der Systemeinstellung: dunkler, warmer Grund, helle Tinte,
    gedämpftes Holz. Die Werte legt die Umsetzung fest, mit gutem Kontrast.
- **Notenzeile:** Violinschlüssel und Notenköpfe aus Bravura (`heft/fonts/bravura.otf`, SMuFL:
  Violinschlüssel U+E050, ganze Note U+E0A2, ♯ U+E262, ♭ U+E260).
  - Ganze Note ohne Hals.
  - Der Notenkopf ist auf **82 %** verkleinert, damit er im Zwischenraum frei steht und keine Linie
    berührt (ausdrücklicher Wunsch).
  - Hilfslinien für c¹ und ab a².
  - Die Bravura-Schrift möglichst auf die benötigten Zeichen verkleinern oder die Umrisse als SVG-Pfade
    übernehmen.
- **Griffbild** wie `flute()` in `heft/engrave.py` (gleiche Maße und Farben), aber feiner:

  | Maß | Heft | App |
  |---|---|---|
  | Lochrand | 0,8 | 0,5 |
  | Kontur | 0,85 | 0,7 |
  | Lochradius | 3,05 | 3,0 |
  | Doppelloch groß | r 2,45 bei x −1,85 | r 2,35 bei x −2,0 |
  | Doppelloch klein | r 1,5 bei x 3,05 | r 1,4 bei x 3,35 |

  Siehe `flute()` in `docs/entwurf/app-mock.html`.
- **Hoch- und Querformat** müssen auf allen Handygrößen gut aussehen, ohne Scrollen auf Start- und
  Übungsseite.
  - Querformat-Regel im Entwurf: `(orientation: landscape) and (max-height: 520px)`.
  - Startseite quer: links Zahlen und Spuren, rechts die Knöpfe; die Tonübersicht entfällt.
  - Übung quer: links die Note, rechts Antworten bzw. Rückmeldung.
  - Tablet und Desktop: dieselben Seiten, mittig mit begrenzter Breite.
- Große Tippflächen (mindestens 48 px hoch), Knöpfe für den Daumen unten.

## 8. Technik

- Ort und Werkzeuge:
  - Alles im Ordner `app/`. **`heft/` nicht verändern.**
  - Vite + TypeScript ohne UI-Framework.
  - Laufzeit-Bibliothek nur `pitchy`; als Entwicklungswerkzeuge Vitest und Playwright, für die
    Offline-Fähigkeit `vite-plugin-pwa` (oder ein kleiner eigener Service Worker).
- Gerät: Hauptgerät ist ein **Android-Handy mit Chrome**. Mikrofon und Installation („Zum
  Startbildschirm hinzufügen“) dort testen bzw. absichern.
- Daten in `localStorage` mit Versionsnummer im Datenformat. Sicherung als JSON-Datei herunterladen
  und wieder einlesen, mit Prüfung der Datei.
- Veröffentlichung:
  - GitHub Actions baut bei jedem Push auf `main` und veröffentlicht auf GitHub Pages
    (`https://tsafs.github.io/floetentrainer/`, Basis-Pfad `/floetentrainer/`).
  - Die Nutzerin muss Pages einmal selbst einschalten: Settings → Pages → Source „GitHub Actions“.
- Tests:
  - Vitest: Grifftabelle (alle 25 Griffe aus `app-prompt.md`), Namen, andere Schreibweisen,
    Frequenzen, Leitner-Logik, Freischalt-Regel, Auswahl der falschen Antworten.
  - Playwright: die Übungsabläufe, auch das Spielen mit vorgetäuschtem Mikrofonsignal.
- Vor dem Fertigmelden: Bildschirmfotos zeigen, mindestens 360×740 und 412×915 hoch, dieselben
  Größen quer, dazu Desktop.
- Vor dem Pushen `git pull`. Zum Schluss ein Pull Request nach `main` und eine Schritt-für-Schritt-Anleitung
  für Mergen und Pages.
