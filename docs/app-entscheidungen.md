# Flötentrainer-App: Entscheidungen

Ergebnis der Abstimmung mit der Nutzerin (13.11.2026), danach unabhängig geprüft und nachgeschärft.
Ergänzt und präzisiert `docs/app-prompt.md`. **Bei Widersprüchen gilt dieses Dokument.**

Visueller Entwurf: `docs/entwurf/app-mock.html` (im Browser öffnen, `?s=home`, `?s=ok` oder `?s=err`
anhängen) und die Bildschirmfotos daneben. Der Entwurf zeigt Aussehen und Anordnung. Wo er von diesem
Text abweicht, gilt der Text (z. B. Zahl der Stufen, zwei getrennte Fälligkeitszahlen).

## 1. Sitzungen

- Zwei Knöpfe auf der Startseite:
  - **Üben:** Note→Name, Note→Griff und Griff→Note gemischt.
  - **Spielen:** nur Spielen-Karten mit Mikrofon.
- Jeder Knopf zeigt die Zahl der fälligen Karten seiner Art.
- Eine Sitzung endet nach **5 Minuten oder 20 Karten**, je nachdem, was zuerst eintritt (beides
  einstellbar). Die angefangene Karte wird noch zu Ende gespielt.
- **Zusammensetzung**, in dieser Reihenfolge:
  1. **Fällige Karten**, die am längsten überfälligen vorn.
  2. **Neue Karten** der freigeschalteten Töne, **höchstens 6 je Sitzung**. Vor der ersten Karte
     eines neuen Tons kommt dessen Vorstellung (Abschnitt 4).
  3. **Zusatzkarten**, bis die Sitzung voll ist: zufällige Karten der freigeschalteten Töne,
     schwache Töne dreifach gewichtet. Zusatzkarten zählen für die Trefferquote (Abschnitt 3),
     **verändern aber keine Fächer und Termine.**
- Derselbe Ton kommt nie zweimal direkt hintereinander. Sonst würde die Auflösung der einen Karte
  die Antwort der nächsten verraten.
- **Fehler in der Sitzung:**
  - Eine falsch beantwortete Karte kommt nach 2–3 anderen Karten nochmal, höchstens zweimal.
  - Diese Wiederholungen zählen nicht zur Kartengrenze, nicht zur Trefferquote und ändern das Fach
    nicht.
  - Steht beim Sitzungsende noch eine Wiederholung aus, entfällt sie.
- **Abbrechen mit ×:** Bereits beantwortete Karten bleiben gewertet, alles andere bleibt unverändert.
- **Nichts fällig, nichts neu:** Die Startseite meldet „Für heute alles erledigt“, und der Knopf
  heißt dann „Trotzdem üben“. Die Sitzung besteht dann nur aus Zusatzkarten.

## 2. Karten und Wiederholung (Leitner)

- Eine Karte ist eine Kombination aus Ton und Übungsart.
- Sechs Fächer:

  | Fach | wieder fällig |
  |---|---|
  | 1 | in der nächsten Sitzung |
  | 2 | nach 1 Tag |
  | 3 | nach 3 Tagen |
  | 4 | nach 7 Tagen |
  | 5 | nach 14 Tagen |
  | 6 | nach 30 Tagen |

  „Nach n Tagen“ wird in Kalendertagen der lokalen Zeitzone gezählt.
- Richtig: ein Fach höher, Fach 6 bleibt Fach 6. Falsch: Fach 1.
- Eine neue Karte wird bei ihrer ersten Antwort einsortiert: richtig in Fach 2, falsch in Fach 1.
- **Serie:** die Kalendertage in Folge mit mindestens einer gewerteten Antwort, egal welcher Art.
  - Hat sie heute noch nicht geübt, zählt die Serie bis gestern und bleibt stehen. Der heutige Punkt
    bleibt offen.
  - Die Wochenpunkte zeigen Mo–So der laufenden Woche.

## 3. Fortschritt: zwei getrennte Spuren

- **Lesen** (die drei Tipp-Übungen zusammen) und **Spielen** haben jeweils eine eigene Stufe.
- **Trefferquote eines Tons** in einer Spur: Anteil richtig unter seinen letzten 20 gewerteten
  Antworten. Gewertet sind normale Karten und Zusatzkarten, aber keine Wiederholungen und keine
  Vorstellungen.
- **Freischalten:** Die nächste Stufe einer Spur kommt automatisch, sobald *jeder* freigeschaltete Ton
  dieser Spur
  - mindestens 10 gewertete Antworten hat,
  - mindestens **90 %** richtig hat (z. B. 18 von 20 oder 9 von 10) und
  - Antworten an **mindestens 2 verschiedenen Kalendertagen** unter diesen letzten 20 hat.

  Die Prüfung läuft nach jeder Antwort. Die Meldung („Neu: c² und d²“) erscheint am Sitzungsende,
  und die neuen Töne kommen ab der nächsten Sitzung.
- **Spielen kann Lesen nie überholen:** Die Spielen-Stufe ist höchstens so hoch wie die Lesen-Stufe.
- **Von Hand:** In den Einstellungen lässt sich jede Spur verstellen.
  - Spielen bleibt dabei auf die Lesen-Stufe begrenzt. Wird Lesen unter Spielen gesenkt, sinkt Spielen
    mit.
  - Nach einem Senken zählen für das Freischalten nur Antworten ab diesem Zeitpunkt. Sonst würde die
    Stufe sofort wieder steigen.
  - Daten von Tönen, die dadurch wieder gesperrt sind, bleiben erhalten.
- **Stufen** (die Stufe „Rest“ aus dem Auftrag ist auf Wunsch in vier Stufen geteilt):

  | Stufe | Töne | Anmerkung |
  |---|---|---|
  | 1 | h¹ a¹ g¹ | |
  | 2 | c² d² | |
  | 3 | e¹ d¹ | |
  | 4 | fis¹ | |
  | 5 | e² f¹ | |
  | 6 | c¹ | |
  | 7 | cis² f² g² | |
  | 8 | a² h² c³ | hohe Stammtöne |
  | 9 | b¹ es¹ | häufigste ♭-Töne |
  | 10 | cis¹ gis¹ fis² | ♯-Töne |
  | 11 | es² gis² b² | schwierige hohe Griffe |
  | 12 | dis¹ dis² as¹ as² ais¹ ais² | andere Schreibweisen, **nur Lesen** |

  Lesen hat also 12 Stufen, Spielen 11.
- Stufen haben feste Kennungen (z. B. `hoch-stamm`), nicht nur Nummern, damit sich die Einteilung
  später ändern lässt.
- **Andere Schreibweisen (Stufe 12):**
  - Nur dis, as und ais (keine des, ges).
  - Nur in Note→Name und Note→Griff, nicht in Griff→Note: Ein Griff hätte sonst zwei richtige
    Antworten. Auch nicht beim Spielen, weil der Klang derselbe ist.
  - Der Griff ist jeweils der des Partners in der Tabelle (dis¹ = es¹, as¹ = gis¹, ais¹ = b¹).

## 4. Übungsarten im Detail

- **Vorstellung neuer Töne:** Vor der ersten Abfrage eines neuen Tons erscheint eine Vorstellungskarte
  mit Note, Name, Griffbild und einem Satz zur Lage.
  - Beispiele für den Satz: „c² liegt im dritten Zwischenraum“, „c¹ hat eine eigene Hilfslinie unter
    den Linien“.
  - Dazu ein kurzer Griff-Tipp, wo er hilft, z. B. „Daumen nur einen Spalt offen“. Diese Tipps werden
    je Ton von Hand formuliert.
  - Knopf „Verstanden“.
  - In der Spielen-Spur bittet die Karte zusätzlich, den Ton einmal zu spielen. Die App zeigt, was sie
    hört, und es geht weiter, wenn der Ton stimmt oder bei „Weiter“.
  - Eine Vorstellung zählt nicht als Antwort.
- **Note→Name:**
  - In Fach 1 und 2: 4 Namen.
  - Ab Fach 3: **8 Namen** in zwei Reihen zu 4. Gibt es nicht genug passende Töne, entsprechend
    weniger, mindestens 4.
  - Die Knöpfe stehen nach Tonhöhe geordnet.
- **Note→Griff:** 4 Griffbilder. **Griff→Note:** ein Griffbild, zur Wahl 4 kleine Notenzeilen.
- **Falsche Antworten möglichst verwechselbar:** Nachbartöne, dieselbe Note mit ♯/♭, ähnliche Griffe
  (wenige Löcher anders), derselbe Ton in der anderen Oktave.
  - Reichen die freigeschalteten Töne nicht, kommen Töne aus späteren Stufen dazu. Diese werden selbst
    nie abgefragt.
  - Nie zwei Möglichkeiten mit demselben Griff und nie zwei Schreibweisen desselben Tons.
- **„Weiß nicht“:** Bei jeder Übungsart gibt es einen kleinen Knopf „Weiß nicht“. Er zeigt die
  Auflösung und zählt als Fehler.
- **Notennamen:** Deutsch (c d e f g a h, cis, es, b …), immer mit Oktavzahl.
  - Die Schreibweise in der Notenzeile folgt dem Namen: es¹ mit ♭, cis¹ mit ♯, b¹ mit ♭.
  - Was die App beim Spielen und im Stimmgerät *hört*, benennt sie immer mit der Schreibweise der
    Grifftabelle (cis, es, fis, gis, b).
- **Spielen:**
  - Die Note wird gezeigt, die App hört zu (Bibliothek „pitchy“).
  - Die Sopranflöte klingt eine Oktave höher als notiert: notiertes c¹ ≈ 523,25 Hz bei a = 440 Hz.
  - **Richtig:** Der gesuchte Ton klingt 0,3 s stabil innerhalb der Toleranz (Standard ±40 Cent).
  - **Falsch:** Ein anderer Ton klingt 0,3 s stabil.
    - Gewertet wird erst ab einem neuen Toneinsatz nach der Kartenanzeige, also nach Stille oder einem
      Tonwechsel und frühestens 400 ms nach der Anzeige. Ein Nachklang der vorigen Karte zählt so nicht.
    - Ein Fehler wird höchstens einmal je Karte gewertet. „Erst falsch, dann richtig“ ist ein Fehler.
    - Die App zeigt dann „Du spielst a¹“ und das Griffbild des gesuchten Tons. Die Nutzerin spielt
      weiter, bis der richtige Ton kommt, oder tippt „Weiter“.
  - **Weiß nicht:** Das Griffbild erscheint, und sie darf den Ton danach spielen. Es zählt als Fehler.
  - **Erkennung, damit nichts ungerecht gewertet wird:**
    - Tonhöhe nur, wenn pitchy eine Klarheit von mindestens etwa 0,9 meldet und die Lautstärke über
      einer Schwelle liegt.
    - Nur Frequenzen zwischen etwa 480 und 2300 Hz gelten.
    - Ein Oktavfehler, also derselbe Ton eine Oktave daneben, wird erst bei besonders hoher Klarheit
      als falsch gewertet.
    - Glättung (`app/src/audio/smooth.ts`, Rückmeldung vom 14.11.2026: „der Ton wackelt zu viel“):
      Klarheit und Bereich werden weiter je Messung geprüft; unklare Messungen zählen als „kein Ton“.
      Die gültigen Messungen gehen durch einen Median über mehrere Messungen (mittig, entfernt
      Ausreißer wie einzelne Oktavsprünge, statt sie zu mitteln), danach je nach Anzeige durch eine
      Zeitkonstante.
      - Spielen-Übung: Median über 5 Messungen (≈ 125 ms), keine Zeitkonstante.
      - Mitspielen (beide Arten): Median über 3 Messungen (≈ 75 ms), keine Zeitkonstante, damit auch
        Sechzehntel erkannt werden.
      - Stimmgerät: Median über 5 Messungen und Zeitkonstante 175 ms für Zeiger und Cent. Der
        Notenname wechselt erst, wenn der neue Ton 100 ms anliegt oder mehr als 60 Cent vom
        angezeigten abweicht. Der Zeiger gleitet zusätzlich 0,1 s nach.
      - Neubeginn nach 50 ms ohne Ton und bei einem klaren Tonwechsel (über 70 Cent): Der Wert
        springt sofort, Töne verschmieren nicht ineinander.
      - Einzelne Aussetzer werden überbrückt: Eine Messung ohne gültigen Ton (unklar, zu leise oder
        außerhalb des Bereichs, z. B. ein Oktavsprung über 2300 Hz bei d²), also eine Lücke unter
        50 ms, zählt als der umgebende Ton, wenn davor und danach derselbe Ton klingt. Sie startet
        weder die Haltedauer noch die Anzeige neu und unterbricht im Takt die erkannte Zeit nicht.
        Ab 50 ms ohne Ton gilt es wie bisher als Stille bzw. neuer Einsatz. Für den neuen Einsatz
        über einen Lautstärke-Einbruch zählt eine überbrückte Messung nicht.
      - Die geglätteten Messungen behalten ihren Zeitpunkt und kommen nur um den halben Median
        später an (25 bzw. 50 ms). Haltedauer, neuer Einsatz, Nachklang-Schutz und der
        Verzögerungsausgleich im Takt bleiben dadurch unverändert. Lautstärke und Stille gehen
        ungeglättet durch.
  - Laufend wird angezeigt, welchen Ton die App hört, mit Abweichung in Cent.
  - Einstellbar sind Toleranz, Haltedauer und Stimmton (Standard a = 440 Hz).
- **Hinweis nach einem Fehler:** ein Satz aus festen Vorlagen. Je nach Verwechslung geht es um
  Hilfslinien, Linie oder Zwischenraum, die Oktave (Daumen), ♯/♭ oder die Nachbarnote. Beispiel:
  „Du hast d¹ gewählt. c¹ hat eine eigene Hilfslinie, d¹ hängt unter der untersten Linie.“

## 5. Rückmeldung

- **Richtig:**
  - Ein grün getöntes Feld erscheint: Häkchen und „Richtig“, darunter groß der Name. Daneben steht
    das Griffbild, Text und Bild senkrecht mittig zueinander.
  - Nach etwa 1 Sekunde geht es von selbst weiter, Tippen geht schneller.
  - Im Hochformat bleiben die Knöpfe sichtbar (der richtige hervorgehoben, die anderen blass).
    Im Querformat ersetzt das Feld die Knöpfe.
- **Falsch:**
  - Ein rötlich getöntes Feld ersetzt die Knöpfe. Darin stehen „Nicht ganz“, der richtige Name, das
    Griffbild und der Hinweis.
  - Darunter ein großer Knopf „Weiter“, es geht nicht von selbst weiter.
  - Die Note bleibt oben stehen, sodass Note, Name und Griff zusammen sichtbar sind.
- **Keine Beschreibung in Worten, welche Löcher zu sind.** Das Griffbild reicht. Griff-Tipps gibt es
  nur bei der Vorstellung.

## 6. Seiten

- **Startseite** (Entwurf `?s=home`):
  - Titel; die fälligen Karten für Lesen und Spielen jeweils auf ihrem Knopf.
  - „Tage in Folge“ mit den Wochenpunkten Mo–So.
  - Die beiden Spuren als Stufenleisten (12 bzw. 11 Abschnitte).
  - „Deine Töne beim Lesen“: Namen mit Trefferquote-Balken. Rot ist ein Ton mit mindestens 5 Antworten
    und unter 80 %.
  - Unten die großen Knöpfe Üben und Spielen, darunter Stimmgerät · Grifftabelle · Einstellungen.
- **Übung** (Entwurf `?s=ok`, `?s=err`): oben ein ×-Knopf, ein feiner Fortschrittsstrich und
  „7 von 20“, darunter Notenzeile, Frage, Antworten und Rückmeldung.
- **Sitzungsende:** wie viele richtig, welche Töne schwierig waren und gegebenenfalls „Neu: …“.
  Danach zurück zur Startseite.
- **Fortschritt:** Trefferquote je Ton, getrennt nach Lesen und Spielen. Erreichbar durch Tippen auf
  die Spuren.
- **Stimmgerät:** freies Spielen mit laufender Anzeige der gehörten Note (auf den Linien, als Name und
  Griffbild) und der Abweichung in Cent.
- **Grifftabelle:** alle Töne c¹–c³ mit Note, Name und Griffbild. Noch nicht freigeschaltete Töne
  (Lesen-Spur) erscheinen blass.
- **Einstellungen:**
  - Sitzungslänge
  - Toleranz, Haltedauer und Stimmton
  - beide Stufen von Hand
  - Sicherung herunterladen und einlesen
  - alles zurücksetzen, mit Bestätigung in der Seite selbst

## 7. Gestaltung

- **Schrift:** ausschließlich EB Garamond, lokal eingebunden. Aus `heft/fonts/` werden normal 400,
  normal 500 und kursiv 400 in die App kopiert, mit Lizenztext.
  - Keine anderen Schnitte und kein Laden von Google Fonts. Der Entwurf tut das nur zur Ansicht.
  - Nebeninfos stehen kursiv in gedämpfter Farbe.
  - Keine Sans-Schrift: Die Nutzerin fand die Mischung unnatürlich.
- **Notennamen mit Hochzahl:** Buchstaben plus eigenes Element für die Oktavzahl, CSS genau wie im
  Entwurf (`.o`: `font-size: 0.58em; position: relative; top: -0.72em; margin-left: 0.09em;
  line-height: 0`).
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
- **Notenzeile:** Violinschlüssel, Notenköpfe und Vorzeichen aus Bravura (`heft/fonts/bravura.otf`,
  SMuFL: Violinschlüssel U+E050, ganze Note U+E0A2, ♯ U+E262, ♭ U+E260).
  - Die Umrisse werden **als SVG-Pfade** in die App übernommen. Die Schrift wird nicht geladen, damit
    nichts beim Laden flackert. Der Lizenztext kommt mit.
  - Ganze Note ohne Hals.
  - Der Notenkopf ist auf **82 %** verkleinert, damit er im Zwischenraum frei steht und keine Linie
    berührt (ausdrücklicher Wunsch).
  - Hilfslinien für c¹ und ab a², c³ hat zwei.
  - Der Bildausschnitt muss oben und unten genug Platz für c³ und Vorzeichen lassen. Im Entwurf ist er
    oben zu knapp.
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
  - Querformat-Regel: `(orientation: landscape) and (max-height: 520px)`.
  - Startseite quer: links Zahlen und Spuren, rechts die Knöpfe; die Tonübersicht entfällt.
  - Übung quer: links die Note, rechts Antworten bzw. Rückmeldung.
  - Tablet und Desktop: dieselben Seiten, mittig mit begrenzter Breite.
- Große Tippflächen (mindestens 48 px hoch), Knöpfe für den Daumen unten.

## 8. Technik

- **Ort und Werkzeuge:**
  - Alles im Ordner `app/`. **`heft/` nicht verändern.**
  - Vite + TypeScript ohne UI-Framework.
  - Laufzeit-Bibliothek nur `pitchy`; als Entwicklungswerkzeuge Vitest und Playwright, dazu
    `vite-plugin-pwa` oder ein kleiner eigener Service Worker.
- **Hauptgerät: Android-Handy mit Chrome.**
- **Mikrofon:**
  - `getUserMedia` mit `echoCancellation`, `noiseSuppression` und `autoGainControl` auf `false`.
    Sonst verfälscht Android gehaltene Töne.
  - AudioContext erst beim Tippen auf „Spielen“ bzw. „Stimmgerät“ anlegen und fortsetzen.
  - Während Spielen und Stimmgerät den Bildschirm wachhalten (Wake Lock), denn die Hände sind an der
    Flöte.
  - Verweigert sie das Mikrofon, erscheint eine verständliche Erklärung, wie sie es erlaubt.
- **PWA:**
  - Manifest mit `start_url` und `scope` `/floetentrainer/`.
  - Ein App-Symbol in 192 und 512 px (schlicht, Papierton, z. B. Notenkopf oder Flöte), auch als
    maskierbares Symbol.
  - Seitenwechsel über `#`-Adressen, weil tiefe Links auf GitHub Pages sonst 404 ergeben.
  - Updates lädt die App im Hintergrund und übernimmt sie erst auf der Startseite, nie mitten in einer
    Sitzung.
- **Daten:**
  - In `localStorage`, mit Versionsnummer im Datenformat und Umwandlung älterer Versionen.
  - Je Ton und Spur werden nur die letzten 20 Antworten gespeichert (richtig/falsch und Tag).
  - Die Stufen werden über ihre Kennungen gespeichert.
  - Mit `navigator.storage.persist()` um dauerhaften Speicher bitten.
  - Bei einem Lesefehler nie still löschen. Stattdessen Meldung und Angebot, eine Sicherung einzulesen.
  - Die Sicherung ist eine JSON-Datei zum Herunterladen und Einlesen. Beim Einlesen wird sie geprüft
    und gegebenenfalls umgewandelt.
- **Veröffentlichung:**
  - Ein GitHub-Actions-Workflow baut bei jedem Push auf `main` und veröffentlicht auf GitHub Pages:
    `https://tsafs.github.io/floetentrainer/`, Basis-Pfad `/floetentrainer/`.
  - Die Nutzerin muss Pages **vor** dem ersten Lauf auf `main` einmal einschalten: Settings → Pages →
    Source „GitHub Actions“.
- **Tests:**
  - Vitest: alle 25 Griffe aus `app-prompt.md`, Namen, andere Schreibweisen, Frequenzen,
    Leitner-Logik samt Randfällen, Freischalt-Regel (auch die 2-Tage-Bedingung), Zusammensetzung der
    Sitzung, falsche Antworten (nie gleicher Griff, nie zwei Schreibweisen).
  - Playwright: die Übungsabläufe. Für Spielen wird `getUserMedia` per Init-Skript durch einen
    Oszillator ersetzt. Getestet werden richtig, falsch, dann richtig, Nachklang und Tonwechsel.
- **Vor dem Fertigmelden** Bildschirmfotos zeigen: 360×740 und 412×915, jeweils hoch und quer, dazu
  Desktop.
- **Vor dem Pushen** `git pull`. Zum Schluss ein Pull Request nach `main` und eine Schritt-für-Schritt-
  Anleitung für Pages und Mergen.
