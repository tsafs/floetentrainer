# Flötentrainer-App: Erweiterung „Lieder“

Mit der Nutzerin abgestimmt am 13.11.2026. Baut auf der ersten Fassung der App auf
(`docs/app-entscheidungen.md`, die dort beschlossenen Regeln gelten weiter). **Erst beginnen, wenn die
erste Fassung fertig und nach `main` gemerged ist.**

**Ziel:** Als Anfängerin weiß sie beim Notenlesen oft nicht, wie ein Lied klingen soll. Die App
spielt Lieder deshalb im richtigen Takt vor, zeigt dabei die Noten mit und lässt sie später mitspielen.

**Umsetzung in drei Runden**, jede in einer eigenen Sitzung mit eigenem Pull Request. Nach jeder
Runde probiert die Nutzerin aus und steuert nach.

---

## Runde 1: Liederseite mit Vorspielen

### Lieder aus dem Heft

- Quelle sind die Lieder in `heft/songs.py`. Beim Bauen liest ein Skript in `app/` diese Datei und
  erzeugt daraus die Lieddaten der App, z. B. per Python nach JSON.
  - **`heft/` wird nur gelesen, nie verändert.**
  - Neue Lieder im Heft erscheinen damit automatisch in der App.
  - Der Veröffentlichungs-Workflow läuft auch bei Änderungen an `heft/songs.py`.
- Die Notation ist oben in `heft/songs.py` erklärt. Die App braucht dafür einen eigenen Leser in
  TypeScript, nach dem Vorbild von `parse_music` und `check_and_assign` in `heft/engrave.py`:
  Töne, Dauern, Punkte, Pausen, Taktstriche, Haltebögen `~`, Bindebögen `( )`, Atemzeichen `,`,
  Zeilenumbrüche `/` und Taktwechsel `T…`.
- Liedtext: Silben werden wie im Heft den Noten zugeordnet. Weitere Strophen stehen als Text unter dem
  Lied, Quellenangabe (`credit`) wie im Heft.
- Ein Lied, das sich nicht lesen lässt, lässt den Bau mit klarer Meldung scheitern, statt still zu
  fehlen.

### Notensatz fürs Handy

- Das ganze Lied erscheint in Noten, gesetzt wie im Heft. Als Vorbild dienen `layout_system` und
  `render_staff_system` in `heft/engrave.py`.
- Zum Notensatz gehören:
  - Schlüssel, Tonart- und Taktangabe
  - Hälse und Balken
  - Punkte und Pausen
  - Halte- und Bindebögen
  - Atemzeichen
  - Hilfslinien
  - Liedtext unter den Noten
- Symbole aus Bravura wie in der App sonst auch, Schrift EB Garamond.
- **Umbruch nach Bildschirmbreite**, nicht nach den `/` des Hefts. Ein Takt wird nie getrennt. Beim
  Drehen des Handys wird neu umbrochen.
- Vorzeichen: Was die Tonart schon vorgibt (fis in G-Dur), bekommt kein eigenes ♯. Abweichungen
  bekommen Vorzeichen, mit Auflösungszeichen innerhalb des Takts, wie im Heft.
- Die Notenköpfe sind wie in der Übung auf 82 % verkleinert, so wie in der App sonst auch.

### Vorspielen

- **Klang:** im Browser erzeugt, flötenähnlich: weicher Einsatz, wenig Obertöne und ein Hauch
  Anblasgeräusch. Er klingt eine Oktave höher als notiert, wie die echte Sopranflöte.
  - Gebundene Noten klingen als ein Ton.
  - Zwischen Tonwiederholungen gibt es eine kleine Trennung.
  - Am Atemzeichen gibt es eine kurze Lücke, ohne dass sich das Tempo ändert.
  - Stimmton wie in den Einstellungen.
- **Genaues Timing:** Die Töne werden im Voraus auf der Uhr des Audiosystems eingeplant, nicht mit
  einfachen Timern. Sonst stolpert der Rhythmus.
- **Mitlaufen:**
  - Die gerade klingende Note ist farbig markiert, und die Ansicht scrollt so mit, dass die aktuelle
    Zeile sichtbar bleibt.
  - Unten zeigt ein kleines Griffbild die aktuelle Note. Im Querformat stehen die Noten links und das
    Griffbild rechts.
- **Grundtempo:** Das Heft enthält kein Tempo. Die App hat eine kleine Tabelle mit Grundtempo je Lied
  (nach Liedtitel). Fehlt ein Lied darin, gilt ein Wert nach Taktart: 2/4 und 4/4 etwa 90 Viertel pro
  Minute, 3/4 etwa 100, 6/8 etwa 60 punktierte Viertel.

### Hilfen

- **Tempo** per Regler von 50 % bis 120 % des Grundtempos. Die Einstellung wird je Lied gemerkt.
- **Einzählen:** vor dem Start ein Takt leiser Klicks, die erste Zählzeit betont. Bei 6/8 zwei Schläge
  zu je drei Achteln.
- **Metronom:** Ein Schalter lässt die Klicks während des ganzen Lieds weiterlaufen.
- **Abschnitt wiederholen:**
  - Sie tippt einen Anfangstakt und einen Endtakt an, die App spielt diesen Bereich in Schleife.
    Eingezählt wird nur beim ersten Mal.
  - Ein langes Tippen auf eine Zeile wählt die ganze Zeile.
  - Ein Knopf hebt die Schleife wieder auf.

### Liederliste und Lernstufen

- **Lieder** wird auf der Startseite ein vierter Eintrag in der unteren Zeile:
  Lieder · Stimmgerät · Grifftabelle · Einstellungen. Passt das nicht in 360 px Breite, wird die Zeile
  zweizeilig, ohne die Schrift zu verkleinern.
- Die Liste ist nach den Kapiteln des Hefts geordnet. Jedes Lied zeigt Titel, Tonart und Taktart.
- **Spielbare Lieder hervorheben:**
  - Kennt sie alle Töne eines Lieds in der Lesen-Spur, steht es oben unter „Kannst du schon spielen“.
    Andere Schreibweisen zählen als ihr Partner aus der Grifftabelle.
  - Bei den übrigen steht „Fehlt noch: fis¹, c¹“.
  - Anhören lässt sich jedes Lied.

### Tests und Abschluss

- **Vitest:**
  - Alle Heft-Lieder lassen sich lesen, Taktlängen und Silbenzahlen stimmen.
  - Der Zeitplan der Töne ist korrekt: Dauer, Punkte, Haltebögen, 6/8 und Taktwechsel.
  - Die Prüfung „spielbar“ und „fehlt noch“ stimmt.
- **Playwright:**
  - Ein Lied öffnet sich, die Markierung läuft mit, Tempo und Schleife wirken.
  - Dafür die Audio-Uhr vortäuschen, damit die Tests nicht in Echtzeit warten.
- **Bildschirmfotos** wie in der ersten Fassung (hoch, quer, Desktop), mindestens von einem langen
  Lied mit Text und von einem Lied in 6/8.

---

## Runde 2: Eigene Lieder als ABC-Datei

- **Einlesen:**
  - Auf der Liederseite gibt es „Lied hinzufügen“. Sie wählt eine `.abc`-Datei oder fügt ABC-Text ein.
  - Enthält die Datei mehrere Stücke, wählt sie aus.
  - Eingelesene Lieder bleiben nur auf ihrem Gerät, kommen aber mit in die Sicherungsdatei.
  - Sie lassen sich wieder löschen.
- **Verstanden wird einstimmige Melodie:**
  - Kopffelder: Titel, Taktart, Grundnotenlänge, Tonart samt Moll und Kirchentonarten, Tempo.
  - Noten mit Oktavlage, Vorzeichen, Längen, punktierte und „gebrochene“ Rhythmen (`>` `<`).
  - Pausen, Taktstriche, Wiederholungen `|: :|` samt erster und zweiter Klammer, Triolen.
  - Halte- und Bindebögen sowie Liedtext aus `w:`-Zeilen.
- **Vereinfacht:**
  - Bei Akkorden zählt nur der oberste Ton.
  - Verzierungen, Vorschläge und Begleitakkorde werden weggelassen.
  - Die App meldet kurz, was sie weggelassen hat.
- **Umfang:** Die Sopranflöte reicht von c¹ bis etwa d³. Liegt ein Stück daneben, bietet die App an,
  es eine Oktave zu verschieben, wenn es dann passt. Sonst erscheint ein Hinweis, welche Töne außerhalb
  liegen.
- **Wiederholungen** werden im Notenbild mit Wiederholungszeichen und Klammern gezeigt. Beim Vorspielen
  werden sie ausgeschrieben. Der Notensatz aus Runde 1 muss dafür um diese Zeichen erweitert werden.
- **Lesen der Dateien:** Am liebsten ein eigener Leser für genau diesen Umfang.
  - Wird das zu verwickelt, darf nur der Leser der Bibliothek `abcjs` verwendet werden, nie deren
    Notensatz, damit alles einheitlich aussieht.
  - Die Entscheidung kurz begründen.
- **Tests:** eine Sammlung kleiner ABC-Beispiele für jede Regel oben, dazu einige echte Volksmelodien
  als Ganzes.

---

## Runde 3: Mitspielen mit Mikrofon

- Auf jeder Liedseite gibt es einen Knopf „Mitspielen“, zwei Arten zur Wahl:
  - **Warte-Modus:**
    - Die Markierung bleibt auf einer Note stehen, bis sie getroffen ist, dann springt sie weiter.
    - Pausen werden übersprungen.
    - Bei Tonwiederholungen braucht es einen neuen Einsatz: kurz leiser werden oder neu anstoßen.
      Haltebögen gelten als eine Note.
  - **Takt-Modus:**
    - Nach dem Einzählen läuft die Markierung im eingestellten Tempo.
    - Eine Note gilt als getroffen, wenn ihr Ton während mindestens etwa der Hälfte ihrer Dauer
      (mindestens 80 ms) erkannt wird.
    - Die Verzögerung von Mikrofon und Erkennung wird ausgeglichen: zunächst ein fester Wert,
      eventuell später ein Abgleich-Knopf.
- **Rückmeldung:** Jede Note färbt sich grün oder rot. Am Ende erscheint eine kurze Auswertung, z. B.
  „42 von 48 Noten getroffen“, im Takt-Modus mit den schwierigsten Takten.
  - Das beste Ergebnis je Lied und Art wird gemerkt.
  - Das Mitspielen beeinflusst die Lernspuren nicht.
- **Was erklingt:**
  - Standard sind nur leise Metronom-Klicks, im Warte-Modus Stille.
  - Hat sie in der App „Ich trage Kopfhörer“ eingeschaltet, spielt die App zusätzlich leise die
    Melodie mit.
  - Ohne Kopfhörer würde das Mikrofon das Handy mithören, deshalb erklärt ein Hinweis, warum die
    Melodie dann aus bleibt.
- **Tonerkennung:** dieselbe wie beim Üben, mit Toleranz, Stimmton, Mikrofon-Einstellungen und
  Wachhalten des Bildschirms. Für das schnellere Mitspielen ist eine kürzere Haltedauer nötig (etwa
  0,1–0,15 s), die Klarheitsschwelle bleibt.
- **Tests:** Playwright mit vorgetäuschtem Mikrofon (Oszillator), der eine Melodie richtig, mit
  falschen Tönen und mit Verspätung spielt, in beiden Modi.

---

## Nachsteuerung nach dem Ausprobieren (14.11.2026)

Nach dem ersten Ausprobieren der drei Runden hat sie einiges anders entschieden. Das gilt jetzt und geht
den Abschnitten oben vor.

- **Mitlaufender Balken:** Zusätzlich zur farbigen Note läuft ein schmaler, halbdurchsichtiger
  senkrechter Balken gleichmäßig im Tempo über das Notensystem (beim Einzählen an der ersten Note, im
  Warte-Modus an der Note, auf die gewartet wird). Klick und Markierung sind auf das gerechnet, was sie
  hört (Ausgabe-Verzögerung eingerechnet).
- **Abgesetzte Noten:** Normale Noten klingen abgesetzt wie mit der Zunge gespielt (kurze Lücke vor dem
  nächsten Ton, etwa 12 % der Dauer, 35–90 ms); nur Bindebögen klingen gebunden. Tonenden ohne Knacksen.
- **Lautstärke:** Das Vorspielen ist lauter; ein Begrenzer am Ausgang verhindert Übersteuern.
- **Liedseite mit Umschalter „Anhören | Mitspielen“** (Entwurf A1): unter dem Titel, jede Art mit eigener
  Bedienleiste (Hochformat unten, Querformat rechte Spalte mit dem Umschalter oben). Der frühere Knopf
  „Mitspielen“ und „Mitspielen beenden“ entfallen; während des Mitspielens ist der Umschalter gesperrt.
- **Kein Griffbild auf der Liedseite** (weder beim Anhören noch beim Mitspielen, auch nicht im
  Querformat). Der Plan sah unten ein kleines Griffbild vor; sie möchte beim Anhören und Mitspielen die
  Noten lesen. Es bleibt nur der kleine Name der klingenden Note (mit Hochzahl) und im Warte-Modus der
  Hinweis „Du spielst c¹“. Der Platz kommt den Noten zugute: Die Leisten sind niedriger. Griffbilder in
  Übung, Grifftabelle und Stimmgerät bleiben.
- **Anhören ohne Schleife:** Einen Takt antippen startet das Vorspielen ab diesem Takt (mit Einzählen)
  bzw. springt beim Spielen sofort dorthin (ohne neues Einzählen); gespielt wird bis zum Liedende.
  „Im Abspielmodus bringt mir Auswählen gar nichts“ – Abschnitt in Schleife, langes Tippen auf eine
  Zeile und „Schleife aufheben“ entfallen. „Abspielen“ beginnt immer am Anfang.
- **Auswahl beim Mitspielen:** Antippen wählt einen Takt, ein zweiter Tipp erweitert die Auswahl bis
  dorthin, ein weiterer beginnt neu; „Auswahl aufheben“ in der Leiste. Ohne Auswahl gilt das ganze Lied.
  Nichts wird vorausgewählt (auch keine schwierigen Stellen). Die Auswahl wird einmal gespielt, nicht in
  Schleife. Leiste zum Einstellen: „Wartet auf mich | Im Takt“, „Ich trage Kopfhörer“ (mit kurzem
  Hinweis), im Takt-Modus Tempo in 5-%-Schritten, darunter der große Knopf „Mitspielen“ bzw.
  „Takt 5–7 mitspielen“. Während des Spielens nur Stopp, Name der Note und ggf. Tempo.
- **Nur Farben statt Wertung:** Getroffene Noten werden grün, verfehlte rot – mehr nicht. Es gibt keine
  Endauswertung („x von y Noten getroffen“), keine schwierigsten Takte und keine Bestwerte mehr. Nach
  einem Durchgang bleiben die Farben stehen, bis sie neu startet oder die Auswahl ändert; „Nochmal“ ist
  einfach wieder der Knopf „Mitspielen“. Bestwerte werden nicht mehr gespeichert; ältere Daten und
  Sicherungen mit Bestwerten bleiben gültig, das Feld wird beim Laden still weggelassen (kein
  Versionssprung).
- **Liederliste als klappbare Karten** („B2, aber einklappbar“): „Kannst du schon spielen“, „Eigene
  Lieder“ (mit „Lied hinzufügen“) und unter „Aus dem Heft“ je Kapitel eine Karte mit getönter Kopfzeile,
  Anzahl und kurzer Erklärung. Die Kopfzeile klappt die Karte auf und zu (Pfeil, kurze sanfte
  Bewegung). Standard: „Kannst du schon spielen“ offen, die übrigen zu; „Eigene Lieder“ offen, solange
  darin nur der Hinweis und „Lied hinzufügen“ stehen oder gerade ein Lied hinzugefügt/gelöscht wurde; ist
  „Kannst du schon spielen“ leer, ist „Eigene Lieder“ bzw. das erste Kapitel offen. Der Klappzustand wird
  je Gerät im Browser gemerkt (nicht im Datenformat und nicht in der Sicherung – er gehört zur Ansicht).

### Sechzehntel im Takt-Modus messbar (14.11.2026)

Die Regel „mindestens die Hälfte der Dauer, mindestens 80 ms erkannt“ machte angestoßene Sechzehntel
ab etwa ♩ = 105 unmessbar: Von einer Sechzehntel (bei ♩ = 108 rund 140 ms) sind wegen Zungen-Lücke
und unklarem Einsatz nur etwa 80 ms als Ton messbar. Neu: Von der Notendauer werden zuerst 50 ms für
Zungen-Lücke und Einsatz abgezogen, davon muss die Hälfte erkannt sein, mindestens aber 50 ms
(zwei Messungen). Geprüft mit Test bis ♩ = 120, auch 30 ms zu früh oder zu spät. Falsche Töne bleiben
falsch; eine kurz (staccato) gespielte Sechzehntel zählt als getroffen.

(Abgelöst durch den folgenden Abschnitt; der Test bis ♩ = 120 gilt weiter.)

### Mitspielen robuster (14.11.2026)

**Befund am echten Gerät** (Android-Handy, günstige 20-€-Sopranflöte, erwachsene Anfängerin): Das
Stimmgerät zeigt die richtigen Namen, aber etwa −30 Cent (Flöte zu tief, ≈ a = 432 Hz; einzelne Töne
streuen je nach Blasdruck). „Im Takt“: fast alle Noten rot, auffällig wird die zweite von zwei gleichen
Noten grün (Zeitversatz). „Wartet auf mich“: überwiegend grün, aber oft rot.

**Recherche** (Quelltext von UltraStar Deluxe und Performous): Gesangsspiele werten nach dem *nächsten
Halbton* (±50 Cent), falten Oktaven, werten nach dem Anteil der Notendauer und gleichen eine
*einstellbare* Eingangs-Verzögerung aus (UltraStar Standard 140 ms, Performous 90 ms, beide mit Abgleich).
Unsere App maß die Mikrofon-Verzögerung nirgends (AnalyserNode im 25-ms-Takt, Zeitstempel
`performance.now`); fest 50 ms war zu wenig. Einschwing-Frames („Chiff“) haben niedrige Klarheit und
fehlten in der erkannten Zeit.

**Regeln jetzt** (Code `app/src/audio/follow.ts`, `flute-profile.ts`, `latency.ts`; Übung und Stimmgerät
bleiben bei ihren Regeln, außer dem Flötenprofil in der Übung):

- **Toleranz = nächster Halbton** (beide Arten): Ein Ton zählt als Zielton, wenn er näher am Zielton liegt
  als an jedem Nachbarton (|Abweichung| < 50 Cent) – gemessen an der Lage dieses Tons auf *ihrer* Flöte.
- **Flötenprofile** (Wunsch der Nutzerin: mehrere Flöten, in den Einstellungen wechselbar und einstellbar):
  Je Flöte ihr Stimmton und je Ton die Abweichung davon in Cent, gemessen mit „Flöte einstellen“
  (Einstellungen → Flöte, Ablauf in `docs/app-entscheidungen.md` Abschnitt 6). Angewandt beim Mitspielen und
  in der Spielen-Übung; ungemessene Töne: 0 relativ zum Stimmton der Flöte (bis zum Stimmton je Flöte: Median
  der gemessenen, siehe unten). Beim Mitspielen wird jeder Ton langsam
  nachgeführt (je Messung 3 % des Abstands zum Median seiner letzten 40 Messungen, höchstens 0,5 Cent;
  gemessene Töne höchstens 15 Cent je Durchgang vom gespeicherten Wert). Gespeichert wird das nur nach
  einem *vollständigen* Durchgang und nur für Töne mit mindestens 10 Messungen – ein abgebrochener Versuch
  (oft gerade, weil es nicht klappte) soll das Profil nicht verschieben. So gleicht sich auch eine nie
  eingestellte, insgesamt zu tiefe Flöte nach wenigen Noten an (ihr unbekannter Stimmton wandert mit, siehe
  „Stimmton je Flöte“). Eine eigene Gesamtverschiebung gibt es nicht – das ist der Stimmton. Im
  Mitspiel-Bereich steht klein die Flöte mit ihrem Stimmton bzw. „Tipp: Flöte einstellen, dann wird genauer
  gewertet.“; der Name führt zu den Einstellungen.
- **Stimmton je Flöte** (seit 14.11.2026, Wunsch der Nutzerin: „meine neue Flöte ist auf 442 Hertz gestimmt,
  bei der Kinderflöte weiß ich es nicht“): Die Werte je Ton sind jetzt relativ zum *Stimmton der Flöte*
  (bekannt, z. B. 442, oder unbekannt = Median der absoluten Lagen ihrer Töne), siehe
  `docs/app-entscheidungen.md` Abschnitte 4 und 6. Mitspielen erwartet Stimmton der aktiven Flöte + Wert des
  Tons; ungemessene Töne liegen beim Stimmton (der frühere Rückfall „Median der gemessenen“ entfällt, das
  deckt der Stimmton ab). Beim Nachführen gilt:
  - Stimmton **unbekannt**: Ungemessene Töne folgen während des Durchgangs dem Median aller Werte, und nach
    dem Speichern rückt der Stimmton auf die neue Mitte (die absoluten Lagen bleiben). So gleicht sich eine nie
    eingestellte, insgesamt zu tiefe Flöte weiter nach wenigen Noten an – der Stimmton sinkt mit.
  - Stimmton **bekannt**: Die Angabe bleibt; ungemessene Töne werden beim Stimmton erwartet, gemessene
    nachgeführt (gespeicherte höchstens 15 Cent je Durchgang von ihrem Wert, auch wenn er nach einem Wechsel
    des Stimmtons über ±49 liegt).
  - Klicks, mitklingende Melodie und der richtige Ton nach einem Fehler (Kopfhörer) klingen im Stimmton der
    aktiven Flöte, ebenso das Vorspielen auf der Liedseite.
  - Zeile im Mitspiel-Bereich: „Flöte: Kinderflöte · etwa 432,5 Hz, wird ausgeglichen“ (unbekannt, ab 8 Cent
    von 440), „Flöte: Neue Flöte · 442 Hz, eingestellt“ bzw. ohne Werte „… · 442 Hz · Tipp: Flöte einstellen,
    dann wird genauer gewertet.“ Die Diagnose-Datei nennt `tuningHz` (Stimmton der aktiven Flöte) und
    `tuningKnown`.
- **Klarheit ab 0,85** (nur Mitspielen, sonst 0,9): Synthetisch gemessen (Flötenklang mit Obertönen, weißes
  Rauschen und tiefes Atemgeräusch, 1024 Samples): Bei sehr starkem Rauschen fällt die Klarheit eines
  Flötentons auf etwa 0,86 – mit 0,9 käme kein Frame durch, mit 0,85 neun von zehn; die wenigen falschen
  Werte darunter sind Oktavfehler (zählen nicht) und Einzelwerte (Median und Nachbarprüfung entfernen sie).
  Reines Rauschen oder Atem ohne Ton erreicht im Bereich 480–2300 Hz nie 0,85.
- **Warte-Modus, weniger „falsch“:** Rot nur, wenn ein anderer Ton (a) mindestens einen Halbton daneben
  liegt (nächster Halbton, dazu 10 Cent Abstand zur Grenze, damit nichts an der Kante kippt), (b) nach dem
  Weiterspringen neu eingesetzt hat – der gehaltene alte Ton zählt nie – und (c) 250 ms stabil bleibt.
  **Der Ton der eben getroffenen Note zählt für die nächste nie als falsch**, auch nach einem scheinbar
  neuen Einsatz (Nachtrag 14.11.2026, Befund mit der neuen Flöte bei „Kuckuck“: nach jeder halben Note
  wurde die folgende Terz abwärts rot, das Stimmgerät zeigte alles richtig. Im lange gehaltenen Ton
  hatte die Einsatz-Regel – Lautstärke-Einbruch und Wiederanstieg, zwei unklare Messungen – einen neuen
  Einsatz gesehen.) Bei einer Tonwiederholung braucht es weiter einen echten neuen Einsatz.
  „Richtig“ braucht weiter nur 120 ms. Übergangsklänge beim Fingerwechsel dauern auf der Blockflöte typisch
  20–80 ms (die Nachbarprüfung im Glätter entfernt einzelne schon vorher) und bleiben folgenlos.
  **Eine Oktave zu hoch** beim Zielton (Überblasen): nicht rot – es ist der richtige Griff mit zu viel Luft –,
  aber auch kein Treffer; dezent „eine Oktave zu hoch – sanfter blasen“. Die Oktave darunter zählt wie beim
  Üben nur bei hoher Klarheit als falsch. Hält sie die getroffene Note weiter, werden diese Messungen fürs
  Nachführen genutzt.
- **Takt-Modus, großzügiger:**
  - Eingangs-Verzögerung Standard **120 ms** (statt 50), mit Kopfhörern **200 ms** (Bluetooth-Headsets
    verzögern auch das Mikrofon um typisch 100–200 ms, manche Browser melden die Ausgabe zu knapp; mit
    Kabel-Kopfhörern sind 80 ms zu viel gut verträglich). Die Ausgabe-Seite kommt weiter aus `outputClock`
    (`startMs` = Zeitpunkt, zu dem sie den Zeitplan-Beginn *hört*); Frames werden um die Verzögerung früher
    einsortiert. Die Rechnung in `song-follow.ts`/`follow.ts` war richtig, nur der Wert zu klein.
  - **Verzögerung abgleichen** (Mitspiel-Bereich, „Im Takt“: „Verzögerung 120 ms (Standard) · abgleichen“):
    vier Klicks Einzählen, dann acht Klicks im Puls ♩ = 80; sie spielt zu jedem Klick einen kurzen Ton,
    egal welchen. Einsatz = erster gültiger Frame eines Tons von mindestens 75 ms (wie die Wertung ihn
    sieht), je Klick der erste Einsatz von 250 ms vor bis 450 ms nach dem *gehörten* Klick; Median, Werte
    über 80 ms davon weg verworfen, mindestens 4 von 8 nötig, plausibel 0–400 ms. Ergebnis: „Dein Handy hört
    etwa 140 ms verzögert.“, dazu ein feiner Schieber (± 10 ms) und „Standard“. Gemessen und gespeichert wird
    **je Kopfhörer-Zustand** (Anzeige „ohne Kopfhörer“/„mit Kopfhörern“); fehlt der Wert für Kopfhörer:
    „mit Kopfhörern noch nicht abgeglichen“. Speicherort `settings.inputLatencyMs` = `{ speaker, headphones }`
    im Speicher dieses Browsers, **nicht in der Sicherung** (ein anderes Handy hört anders verzögert; beim
    Einlesen bleibt der Wert des Geräts).
  - **Wertung je Note:** gewertet wird nur der mittlere Teil (ohne die ersten 60 ms, höchstens 30 % der Note,
    und ohne die letzten 20 %). Unklare und fehlende Frames und die Oktave zählen dort weder für noch gegen
    die Note, Stille und andere Töne schon. **Getroffen**, wenn der Zielton mindestens 38 % davon ausmacht und
    mindestens 40 ms erkannt wurde – **oder** wenn der Zielton höchstens 120 ms vor oder nach dem
    Notenbeginn einsetzt (zu früh höchstens eine halbe, zu spät höchstens eine ganze Note – sonst gälte ein
    eine Sechzehntel zu früh gespielter Ton für die nächste) und mindestens 40 ms hält. Rot also nur, wenn
    überwiegend ein anderer Ton oder gar nichts kam. Gewertet wird eine Note, wenn ihr Fenster vorbei ist und
    kein später Einsatz mehr kommen kann. Sechzehntel bis ♩ = 120 (auch 30 ms daneben) gehen weiter.
  - **Metronom-Klicks** (ohne Kopfhörer aus dem Lautsprecher): Sie sind keine Rauschimpulse, sondern kurze
    Sinus-Töne (1250/1900 Hz, ≈ 40 ms), die pitchy mit voller Klarheit erkennt – 1250 Hz liegt fast genau auf
    es² der Flöte. Ein Filter macht höchstens zwei Frames lange „Töne“ auf Klick-Höhe zu „unklar“; ein echter
    Ton dort klingt länger und zählt. Auch im Abgleich, wo ein mitgehörter Klick sonst als Einsatz gälte.
- **Diagnose-Aufnahme:** Während jedes Mitspiel-Durchgangs und beim Abgleich hält die App die Messwerte im
  Speicher (nur der letzte Durchgang, höchstens 15 000 Messungen): je Messung Zeit, Frequenz, Klarheit,
  Lautstärke, geglättete Frequenz und Einordnung (gehörter Ton, Cent, Note, Art, überbrückt/unstet/Klick),
  dazu Ereignisse (Noten mit Ergebnis und Grund, Einsatz-Versatz, falsche Töne, Oktav-Hinweis, Abgleich-
  Ergebnis), Notenfenster, Stimmton, Verzögerung (abgeglichen?), Flötenwerte, `track.getSettings()`,
  `track.stats` (falls vorhanden), `AudioContext.baseLatency/outputLatency`, `getOutputTimestamp` und
  Browserkennung. **Kein Ton, keine Aufnahme**; der Kopf der Datei sagt das. Danach dezent „Diagnose
  speichern“: auf Android öffnet sich das Teilen-Menü (z. B. E-Mail), sonst wird die JSON-Datei
  heruntergeladen. Auswertung: `node app/scripts/diagnose.mjs <datei>` (je Note erwartet/erkannt, mittlere
  Cent-Abweichung, Einsatz-Versatz, Grund für Rot; Median des Versatzes; Anteil unklarer Messungen).
- **Tests:** `follow-robust.test.ts`, `flute-profile.test.ts`, `latency.test.ts`, `diagnose.test.ts`,
  `data.test.ts`; E2E `follow-robust.spec.ts` (Abgleich mit Tönen 140 ms nach den Klicks, −30 Cent
  verstimmt in beiden Modi, Diagnose-Datei, Flöte einstellen und wechseln, Stimmgerät). Bewusst geänderte
  ältere Tests: falsche Töne im Warte-Modus jetzt 300 statt 200 ms; „knapp außerhalb der Toleranz“ (45 Cent)
  ist jetzt ein Treffer; Oktave zu hoch nicht mehr rot; Klarheit 0,85 statt 0,9 „zu unklar“ → 0,8; im Takt
  „live grün“ schon nach gehaltenem Einsatz, eine abgebrochene, bis dahin richtig gespielte Note ist grün,
  Verspätung im E2E 0,25 s grün statt 0,35 s rot (rot jetzt erst bei 0,7 s). Zum Stimmton je Flöte:
  `tuning.test.ts`, E2E `stimmton.spec.ts` (neue Flöte mit 442 → Mitspielen mit 442-Attrappe grün;
  Kinderflöte unbekannt mit −30-Attrappe einstellen → „etwa 432 Hz“, Mitspielen grün, bekannt/unbekannt
  umschalten; bekannter Stimmton einstellen mit „gemessen etwa …“ und Übernehmen; Flöte wechseln im
  Stimmgerät). Angepasst: `follow-robust.test.ts` (Rückfall 0 statt Median; Nachführen je nach bekannt/
  unbekannt), `follow.test.ts`/`data.test.ts` (`followConfig(s, tuningHz)`, Flöten mit `tuning`, Grenze der
  Werte ±120), `follow-robust.spec.ts` (Werte nach dem Einstellen relativ zum ermittelten Stimmton, z. B.
  g¹ +2 bei etwa 429,5 Hz statt −40; Neuanlegen mit Stimmton-Frage; Stimmgerät-Bezug).
