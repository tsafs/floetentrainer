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
