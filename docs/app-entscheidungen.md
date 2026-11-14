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
- **Nichts fällig, nichts neu:** Der Knopf heißt dann „Weiter üben“ bzw. „Weiter spielen“, darunter
  „Fälliges erledigt · zählt für Stufe n“ (an der höchsten erlaubten Stufe „Fälliges erledigt · freies
  Üben“). Die Sitzung besteht dann nur aus Zusatzkarten. Bis 14.11.2026 hieß er „Trotzdem üben“ mit
  „Für heute alles erledigt“; das klang, als brächte Weiterüben nichts, obwohl Zusatzkarten für die
  Trefferquote und damit fürs Freischalten zählen.

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
  - mindestens **90 %** richtig hat (z. B. 18 von 20 oder 9 von 10).

  Bis 14.11.2026 galt zusätzlich: Antworten an mindestens 2 verschiedenen Kalendertagen unter diesen
  letzten 20. Gestrichen auf Rückmeldung: „Ich würde gerne weiter üben, doch für heute kann ich nichts
  mehr erreichen. Fleißige Lerner werden ausgebremst. Wiederholt werden kann ja am nächsten Tag
  trotzdem.“ Wer an einem Tag viel übte, verdrängte außerdem die Antworten vom Vortag aus den letzten
  20 und blockierte sich so selbst. Ob die Töne auch am nächsten Tag sitzen, prüfen die fälligen Karten
  (Abschnitt 2): Jede richtig beantwortete Karte kommt nach 1, 3, 7 … Tagen wieder.

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
    Erwartet wird im Stimmton der aktiven Flöte (seit 14.11.2026, siehe „Stimmton je Flöte“ unten).
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
    - Messfenster (`app/src/audio/mic.ts`): die jüngsten 1024 Samples (≈ 21 ms bei 48 kHz), Messung
      alle 25 ms. Bis zum 14.11.2026 waren es 2048 Samples (≈ 43 ms); Rückmeldung: „Wenn ich G, A und H
      schnell im Wechsel spiele, wird oft GIS oder eine andere Zwischennote erkannt“ (im Stimmgerät kurz
      nach dem Wechsel, dann der richtige Ton). Ein Fenster, das einen Tonwechsel überspannt, liefert
      einen Wert zwischen beiden Tönen, mit voller Klarheit. Weil das kürzere Fenster kürzer ist als der
      Messabstand, kann ein Wechsel nur noch eine Messung verfälschen, nie zwei in Folge.
      - Synthetisch gemessen (Flötenklang mit Obertönen und Rauschen, Wechsel an zufälliger Stelle):
        Wechsel mit Zwischenwert 61 % → 31 %, mit zwei Zwischenwerten in Folge 2 % → 0 %.
        In Chromium über den echten Audio-Weg: etwa halb so viele Zwischenwerte, keine zwei in Folge
        mehr (vorher bei 6–30 % der Wechsel).
      - Genauigkeit und Klarheit bleiben für c¹–d³: Die Sopranflöte klingt ab 523 Hz, also mindestens
        11 Perioden im Fenster. Fehler höchstens wenige Cent (bei starkem Rauschen bis 7 statt 6),
        Klarheit eines Flötentons weiter über 0,97. Die Klarheit fällt bei beiden Fenstern erst bei sehr
        starkem Rauschen unter 0,9, an derselben Stelle – die Schwelle 0,9 bleibt.
      - Messabstand und Verzögerungsausgleich im Takt (damals 50 ms, seit 14.11.2026 120 ms bzw. am Gerät
        abgeglichen, siehe `docs/app-lieder.md`) bleiben. Der Messwert liegt jetzt etwa
        10 ms weniger zurück; das liegt in der Spanne, die der Takt-Modus verträgt.
    - Nur Frequenzen zwischen etwa 480 und 2300 Hz gelten.
    - Ein Oktavfehler, also derselbe Ton eine Oktave daneben, wird erst bei besonders hoher Klarheit
      als falsch gewertet.
    - Glättung (`app/src/audio/smooth.ts`, Rückmeldung vom 14.11.2026: „der Ton wackelt zu viel“):
      Klarheit und Bereich werden weiter je Messung geprüft; unklare Messungen zählen als „kein Ton“.
      - Stabilitätsprüfung vor dem Median (Rückmeldung „GIS zwischen G und A“): Eine gültige Messung
        zählt nur, wenn sie mit mindestens einer direkt benachbarten (davor oder danach) auf etwa
        35 Cent übereinstimmt. Sonst gilt sie als unstet und wie eine unklare Messung, also „kein Ton“
        (und kann wie ein Aussetzer überbrückt werden, siehe unten). Ein einzelner Übergangswert beim
        Tonwechsel verschwindet so, ein echter Ton (mindestens zwei Messungen) nicht.
        - Vibrato ±30 Cent bei 5 Hz ändert sich von Messung zu Messung um höchstens 24 Cent und geht
          durch.
        - Sind beide Nachbarn ungültig (eine Messung zwischen zwei Aussetzern), gibt es nichts zu
          vergleichen; sie zählt wie bisher. Ein Übergangswert liegt immer zwischen zwei Tönen.
        - Ohne zusätzliche Verzögerung: Der Median wartet ohnehin auf die Messungen danach. Nur die
          jüngste Messung im Median-Fenster hat noch keinen Nachfolger und zählt dort vorläufig.
        - Im Mitspielen und in der Übung ist ein Übergangswert damit weder ein falscher Ton noch ein
          neuer Einsatz (25 ms Lücke) und erscheint nicht als „Du spielst gis¹“. Die erkannte Zeit im
          Takt ändert sich nicht (der Übergangswert lag ohnehin außerhalb der Toleranz).
      Die gültigen Messungen gehen durch einen Median über mehrere Messungen (mittig, entfernt
      Ausreißer wie einzelne Oktavsprünge, statt sie zu mitteln), danach je nach Anzeige durch eine
      Zeitkonstante.
      - Spielen-Übung: Median über 5 Messungen (≈ 125 ms), keine Zeitkonstante.
      - Mitspielen (beide Arten): Median über 3 Messungen (≈ 75 ms), keine Zeitkonstante, damit auch
        Sechzehntel erkannt werden.
      - Stimmgerät: Median über 5 Messungen und Zeitkonstante 175 ms für Zeiger und Cent. Der Zeiger
        gleitet zusätzlich 0,1 s nach.
        - Notenname: Er wechselt nur, wenn der neue Ton ununterbrochen anliegt. Bei einem klaren
          Wechsel (mehr als 60 Cent vom angezeigten Ton) sind das 3 Messungen in Folge (≈ 50 ms), knapp
          an der Mitte zwischen zwei Tönen (bis 60 Cent) 100 ms. Früher galt ein klarer Wechsel sofort,
          dadurch erschien jeder kurze Übergangswert als Name.
        - Ein echter Tonwechsel erscheint so zwei Messungen (50 ms) nach seiner ersten Messung.
        - Solange ein klarer Wechsel abgewartet wird, bleiben Zeiger und Cent stehen und werden nicht
          an den Rand gezogen.
        - Nach Stille (ab 50 ms ohne Ton) gilt der nächste Ton sofort.
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
  - **Flötenprofil** (seit 14.11.2026, Befund am Gerät: günstige Flöte etwa 30 Cent zu tief, die
    Stimmton-Einstellung half nur bedingt – 437 Hz „zu hoch“, 436 „zu tief“, weil die Töne einzeln
    verschieden abweichen): Je Flöte wird je Ton gespeichert, wie weit er vom Stimmton *der Flöte* abweicht
    („Flöte einstellen“, siehe 6.; beim Mitspielen langsam nachgeführt). In der Spielen-Übung wird die
    Abweichung des gesuchten Tons herausgerechnet: Die Toleranz (±40 Cent) gilt relativ zu diesem Wert, und
    „Ich höre a¹ ±0 Cent“ heißt „genau wie a¹ auf deiner Flöte“. Der gehörte Ton ist der nächste Ton
    *dieser* Flöte (`correctPitch` in `app/src/audio/flute-profile.ts`). Noch nicht gemessene Töne liegen
    beim Stimmton der Flöte (0). Die Übung führt selbst nichts nach (zu wenige, zu kurze Töne).
  - **Stimmton je Flöte** (seit 14.11.2026, Wunsch der Nutzerin: „Was ist, wenn ich weiß, dass meine neue
    Flöte auf 442 Hertz gestimmt ist, aber nicht weiß, auf welchen Stimmton genau meine Kinderflöte gestimmt
    ist?“). Die frühere Einstellung „Stimmton“ für alle (`settings.tuningHz`) entfällt; jede Flöte hat
    `tuning: { hz, known }` (Rechnung an einer Stelle: `app/src/music/tuning.ts`).
    - **Bekannt:** Sie trägt ihn ein (Wahl 440/442/443 Hz, sonst mit + und − in 1-Hz-Schritten, 415–466 Hz).
      Die Angabe ist der Bezug und wird nie von selbst überschrieben – sie ist aber nur der Startwert: Die
      Werte je Ton werden genauso gemessen, gespeichert und angewandt wie bei „unbekannt“ (eine „442er“ kann
      real 442,5 Hz haben, einzelne Töne ±10–20 Cent).
    - **Unbekannt:** „wird beim Einstellen ermittelt“ – der Stimmton ist der Median der absoluten Lagen aller
      gemessenen Töne (die Werte liegen dann um 0), angezeigt auf 0,5 Hz gerundet („etwa 432,5 Hz“). Er wird
      nach jeder Messung beim Einstellen und nach jedem vollständigen Mitspiel-Durchgang neu ermittelt.
      Solange nichts gemessen ist, nimmt die App 440 Hz an.
    - **Werte je Ton** sind relativ zum Stimmton der Flöte („e¹ −15“ = 15 Cent tiefer, als der Stimmton der
      Flöte erwarten lässt), auf 0,01 Cent gespeichert, gemessen und nachgeführt höchstens ±49, gespeichert
      bis ±120 (damit ein Wechsel des Stimmtons die absoluten Lagen erhält). Ungemessene Töne: 0. Der frühere
      Rückfall „Median der gemessenen“ entfällt, weil der Stimmton ihn abdeckt: Bei unbekanntem Stimmton ist er
      genau dieser Median; bei bekanntem gilt ihre Angabe. Nur beim Nachführen eines unbekannten Stimmtons
      folgen ungemessene Töne während des Durchgangs dem Median (dorthin rückt der Stimmton danach).
    - **Absolute Lage** eines Tons = Stimmton + Wert. Jeder Wechsel (andere Angabe, bekannt ↔ unbekannt,
      gemessenen Wert übernehmen) rechnet die Werte so um, dass die absoluten Lagen bleiben.
    - Der Stimmton der aktiven Flöte gilt **überall**: Übung (Spielen-Karten), Stimmgerät, Mitspielen,
      Vorspielen (Synth – passt mit Kopfhörern zu ihrem Spiel), Verzögerungs-Abgleich, Diagnose.
  - **Mitspielen** wertet seit dem 14.11.2026 nach eigenen, großzügigeren Regeln (nächster Halbton,
    Klarheit ab 0,85, „falsch“ erst nach 250 ms, im Takt Verzögerung 120 ms bzw. abgeglichen, Wertung nach
    Anteil im mittleren Teil der Note oder Einsatz am Notenbeginn): siehe `docs/app-lieder.md`, Abschnitt
    „Mitspielen robuster“. Übung und Stimmgerät behalten Toleranz, Haltedauer und Klarheit 0,9.
  - Laufend wird angezeigt, welchen Ton die App hört, mit Abweichung in Cent.
  - Einstellbar sind Toleranz und Haltedauer; der Stimmton gehört seit 14.11.2026 zur Flöte (Einstellungen →
    Flöte).
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
  Griffbild) und der Abweichung in Cent. Die Abweichung ist die echte zum Stimmton der aktiven Flöte (so
  sieht sie ehrlich, wie ihre Flöte klingt, ohne die Werte je Ton herauszurechnen); ist für den Ton auf der
  aktiven Flöte ein Wert gespeichert, steht klein darunter, wie er innerhalb der Flöte liegt („Deine Flöte bei
  e¹: −15“, bei mehreren Flöten mit ihrem Namen). Oben dezent „Flöte: Kinderflöte · etwa 432,5 Hz“ (bekannt
  „· 442 Hz“, noch nicht ermittelt „· Stimmton unbekannt, 440 Hz angenommen“). Eine andere Flöte wählen
  ändert den Bezug.
- **Grifftabelle:** alle Töne c¹–c³ mit Note, Name und Griffbild. Noch nicht freigeschaltete Töne
  (Lesen-Spur) erscheinen blass.
- **Einstellungen:**
  - Sitzungslänge
  - Toleranz und Haltedauer (Abschnitt „Spielen“)
  - **Flöte** (seit 14.11.2026): Liste der Flöten (Standard eine, „Meine Flöte“), eine ist aktiv; je Flöte
    zwei kleine Zeilen: „Stimmton 442 Hz“ bzw. „Stimmton unbekannt – etwa 432,5 Hz (ermittelt)“ (noch nicht
    ermittelt: „Stimmton unbekannt“) und „7 Töne eingestellt“ bzw. „noch nicht eingestellt“. Darunter der
    **Stimmton der aktiven Flöte**: Zeile „Stimmton“ mit Erklärung – bekannt „angegeben“ (ohne Werte:
    „angegeben – für genauere Wertung Ton für Ton einstellen“; mit Werten „angegeben · gemessen etwa 438 Hz“,
    ab 10 Cent Abstand mit „übernehmen“) und rechts − / 442 Hz / +; unbekannt „unbekannt – wird beim
    Einstellen ermittelt“ bzw. „… ermittelt aus 7 Tönen“ und rechts „etwa 432,5 Hz“. Darunter die Wahl
    „440 Hz · 442 Hz · 443 Hz · Weiß nicht“ (Umschalten bekannt/unbekannt; die Werte werden umgerechnet, die
    absoluten Lagen bleiben). Dann der große Knopf „„Meine Flöte“ einstellen“, darunter „Umbenennen“
    (Eingabefeld in der Seite), „Flöte hinzufügen“ und „Löschen“ (nur bei mehr als einer, Bestätigung in der
    Seite).
  - **Flöte hinzufügen:** Feld in der Seite „Neue Flöte“: Name (zunächst „Flöte 2“), dann die Frage „Weißt du,
    auf welchen Stimmton die Flöte gestimmt ist?“ mit dem Hinweis „Steht oft auf der Flöte oder der
    Verpackung, z. B. 442 Hz.“ und derselben Wahl 440 · 442 · 443 · Weiß nicht (vorgewählt „Weiß nicht“:
    „Kein Problem – die App ermittelt ihn, wenn du die Flöte einstellst.“). Mit Zahl: − / + für andere Werte
    und die Ermunterung „Für eine genauere Wertung danach trotzdem Ton für Ton einstellen“. „Flöte anlegen“
    macht sie zur aktiven, „Abbrechen“.
  - **Flöte einstellen** (`#/floete`, einzelner Ton `#/floete/<kennung>`): geführt Ton für Ton durch die in der
    Lesen-Spur freigeschalteten Töne, nach Tonhöhe. Notenbild und Name, „Spiel diesen Ton ruhig etwa
    2 Sekunden.“, Balken über die stabile Phase, Ergebnis „a¹: −25 Cent“ (sofort gespeichert), nach 1,4 s der
    nächste Ton. „Nochmal“, „Überspringen“. Gemessen wird der Median der Cent-Abweichung über 1,5 s stabile
    Phase (Bezug: die gemessene Mitte der Flöte, ohne Werte ihr Stimmton; gespeichert relativ zum Stimmton der
    Flöte) (die ersten 150 ms Einsatz nicht; bricht der Ton nach mindestens 1 s
    ab, zählt es auch), nur klare, stabile Messungen, Wackler über 40 Cent vom laufenden Median nicht. Liegt
    der Median 50 Cent oder mehr vom Zielton weg: „Das war wohl ein anderer Ton (h¹) – nochmal.“ Darunter die
    Übersicht „Werte je Ton“; Antippen misst diesen Ton neu. Nach einem Ergebnis wartet die Messung des
    nächsten Tons auf kurze Stille (60 ms), damit der ausklingende vorige Ton nicht als falscher gilt.
    Stimmton dabei (seit 14.11.2026): Oben „Kinderflöte · etwa 432,5 Hz · Ton 2 von 7“. **Unbekannt:** Nach
    jedem Ton rückt der Stimmton auf die Mitte aller gemessenen; das Ergebnis zeigt den Wert relativ zum neuen
    Stimmton und diesen dazu („a¹: −4 Cent · Stimmton etwa 432,5 Hz“; der erste Ton ist so immer ±0). Unter der
    Übersicht „Stimmton unbekannt – etwa 432,5 Hz (ermittelt)“. **Bekannt:** Die Angabe bleibt; unter der
    Übersicht „Stimmton angegeben 442 Hz · gemessen etwa 442,5 Hz“ (Median der absoluten Lagen, auf 0,5 Hz).
    Liegt die Messung mehr als 10 Cent daneben, dezent „Deine Flöte klingt insgesamt etwa 16 Cent tiefer als
    angegeben.“ mit „Gemessenen Wert als Stimmton übernehmen“ (auf 0,5 Hz; die absoluten Lagen bleiben). Dass
    die Messung an der gemessenen Mitte ansetzt, hält bei einer falsch angegebenen Flöte (442 angegeben, real
    432) die Prüfung „ein anderer Ton?“ an ihrer wirklichen Lage.
  - Mitspielen: „Ich trage Kopfhörer“; darunter die Verzögerung im Takt je Kopfhörer-Zustand (Abgleich im
    Mitspiel-Bereich, siehe `docs/app-lieder.md`)
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
  - Flöten (`flutes`, `activeFlute`; je Flöte Name, Stimmton `tuning: { hz, known }` und Cent je Ton relativ
    dazu) kamen ohne Versionssprung dazu (lassen sich neu messen) und gehen mit in die Sicherung – die Flöte
    zieht mit ihr um, die Tonhöhe hängt nicht vom Mikrofon ab.
  - **Stimmton je Flöte statt `settings.tuningHz`** (14.11.2026), ebenfalls ohne Versionssprung. Umwandlung
    beim Lesen (auch alter Sicherungen): absolute Lage je Ton = alter Stimmton + Wert; eine Flöte ohne
    `tuning` wird „unbekannt“ mit Stimmton = Median ihrer absoluten Lagen und Werten = absolut − Stimmton
    (verlustfrei bis auf 0,01 Cent). Ohne Werte bekommt die aktive Flöte den alten Stimmton, weitere Flöten
    440 Hz; ganz alte Daten ohne Flöten geben ihn der Standard-Flöte. Bewertung des fehlenden Sprungs: Eine
    noch nicht aktualisierte App fände kein `settings.tuningHz` und nähme 440 Hz; die Werte (jetzt relativ zum
    Stimmton der Flöte) hielte sie für relativ zu 440 – bei einer 432er etwa 30 Cent daneben, was ihr
    Nachführen beim Mitspielen ausgleicht –, und beim Speichern verlöre sie `tuning` (ein eingetragener
    Stimmton wäre neu einzutragen, ein ermittelter neu zu messen). Das ist wiederherstellbar und betrifft nur
    die kurze Zeit, bis das Update übernommen ist; ein Sprung würde dort dagegen alle Daten sperren. Die abgeglichene Verzögerung im Takt (`settings.inputLatencyMs`, je Kopfhörer-Zustand)
    gehört dagegen zum Gerät: Sie bleibt im Speicher dieses Browsers, geht nicht in die Sicherung, und beim
    Einlesen einer Sicherung behält das Gerät seinen Wert.
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
    Leitner-Logik samt Randfällen, Freischalt-Regel (auch: alles an einem Tag reicht), Zusammensetzung der
    Sitzung, falsche Antworten (nie gleicher Griff, nie zwei Schreibweisen).
  - Playwright: die Übungsabläufe. Für Spielen wird `getUserMedia` per Init-Skript durch einen
    Oszillator ersetzt. Getestet werden richtig, falsch, dann richtig, Nachklang und Tonwechsel.
- **Vor dem Fertigmelden** Bildschirmfotos zeigen: 360×740 und 412×915, jeweils hoch und quer, dazu
  Desktop.
- **Vor dem Pushen** `git pull`. Zum Schluss ein Pull Request nach `main` und eine Schritt-für-Schritt-
  Anleitung für Pages und Mergen.
