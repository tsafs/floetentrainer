# Flötentrainer-App: Tonfolgen

Abgestimmt mit der Nutzerin am 14.11.2026. Ergänzt `docs/app-entscheidungen.md` (Abschnitte 1, 3, 4);
nach der Umsetzung dort nachtragen. Unabhängig von `docs/app-navigation.md` – beide können gleichzeitig
umgesetzt werden. Die Startseite und die Kopfzeilen bitte nicht umbauen (das macht die Menü-Arbeit).

## Anlass

Rückmeldung der Nutzerin: „Nur einzelne Töne ist recht langweilig, wenn man gefühlt 20 Mal den gleichen
Ton spielen oder eingeben muss.“ Grund ist der Aufbau: Auf den ersten Stufen gibt es nur wenige Töne,
und die Sitzung wird mit Zusatzkarten aufgefüllt. Tonfolgen schließen außerdem die Lücke zwischen
„einzelner Ton“ und „ganzes Lied“: mehrere Noten hintereinander lesen und spielen, auch Halbtonschritte
wie f¹ – fis¹ – g¹.

## Entscheidungen der Nutzerin

1. **Eingemischt in die normalen Sitzungen** (kein eigener Knopf): Ein Teil der Zusatzkarten wird zu
   Tonfolgen.
2. **Ab 5 Tönen**, also ab Stufe 2 der jeweiligen Spur (Lesen-Stufe für Üben, Spielen-Stufe für Spielen).
3. **Fortschritt:** Jeder Ton einer Folge zählt für seine Trefferquote (also fürs Freischalten), aber
   **jeder Ton höchstens einmal pro Folge**. Kommt ein Ton mehrfach vor, ist er richtig, wenn er an allen
   Stellen richtig war. Die Fächer und Termine (Leitner) bleiben unberührt – wie bei Zusatzkarten heute.
4. **Lesen und Spielen**, beides.
5. **Tonwiederholungen** (wie bei „Hänschen klein“: g¹ e¹ e¹) sind ausdrücklich erwünscht. Beim Spielen
   braucht es dafür einen neuen Einsatz (kurz absetzen oder neu anstoßen); die Warte-Wertung kann das
   schon (`WaitFollower` in `app/src/audio/follow.ts`).

## Vorschläge für die Einzelheiten (bei Unklarheit so umsetzen)

### Zusammensetzung (`app/src/srs/session.ts`)

- Eine Tonfolge ist ein neuer Schritt in der Sitzung, neben Vorstellung und Karte (z. B.
  `{ type: "folge", notes: string[], … }`). Sie ist **keine Leitner-Karte** und braucht keinen Eintrag in
  `data.cards`.
- **Etwa jede zweite Zusatzkarte** wird eine Tonfolge (abwechselnd, nicht zufällig gehäuft). Fällige und
  neue Karten bleiben wie sie sind. In der Sitzung „Weiter üben“ (nur Zusatzkarten) ist also rund die
  Hälfte Tonfolgen – genau dort entstand die Langeweile.
- Eine Tonfolge zählt als **eine** Position in „7 von 20“ und für die Kartengrenze. Im Ergebnis
  („x von y richtig“) ist sie richtig, wenn alle Töne richtig waren; jeder falsche Ton kommt in
  „Schwierig waren“.
- **Nur Töne, die in dieser Spur schon vorgestellt sind** (`data.introduced[track]`), also nicht die
  neuen Töne dieser Sitzung vor ihrer Vorstellung. Keine anderen Schreibweisen (Stufe 12) – weder in
  Lesen noch in Spielen.
- **Bei einem Fehler** kommt dieselbe Folge nach 2–3 anderen Schritten noch einmal (höchstens einmal);
  die Wiederholung zählt nicht, wie bei Karten.
- Weniger als 5 vorgestellte Töne in der Spur → keine Tonfolgen.
- Die Regel „derselbe Ton nie zweimal direkt hintereinander“ gilt zwischen Schritten: Die Karte nach
  einer Folge fragt nicht den letzten Ton der Folge ab, und eine Folge beginnt nicht mit dem Ton der
  Karte davor.

### Erzeugen der Folgen (neue Datei, z. B. `app/src/srs/sequences.ts`, rein und gut testbar)

- **Länge:** Beginn mit 3 Tönen (bei genau 5 Tönen 2–3). Innerhalb der Sitzung: nach zwei fehlerfreien
  Folgen in Reihe +1, nach einer fehlerhaften −1; Bereich 2 bis 5 (bis 6 ab Stufe 8). Wird nicht
  gespeichert, jede Sitzung beginnt neu.
- **Melodisch statt zufällig:** Die freigeschalteten Töne nach Tonhöhe geordnet; der nächste Ton liegt
  meist einen Schritt daneben (Nachbar in dieser Reihe), oft eine Terz, selten ein größerer Sprung
  (höchstens eine Quinte bzw. 7 Halbtöne). Richtungswechsel erlaubt, lange Läufe in eine Richtung
  ebenfalls.
- **Halbtonschritte** bevorzugen, wo beide Töne freigeschaltet sind (f¹–fis¹, fis¹–g¹, cis²–d², b¹–h¹ …):
  Gerade diese Griffwechsel sind schwer.
- **Tonwiederholung** in etwa jeder vierten Folge einmal (nie dreimal derselbe Ton in Reihe).
- **Schwache Töne** (`isWeak`) häufiger einbauen (wie bei Zusatzkarten dreifach gewichtet).
- In einer Sitzung keine Folge zweimal (außer der Wiederholung nach einem Fehler).
- Zufall nur über das übergebene `rng`, damit Tests feste Folgen bekommen.
- Später denkbar (nicht jetzt): Schnipsel aus den Heft-Liedern, die nur freigeschaltete Töne enthalten.

### Lesen: Tonfolge → Namen

- Oben eine breite Notenzeile mit allen Noten der Folge nebeneinander (ganze Notenköpfe wie bisher, ohne
  Takt und Hals). Dafür `staffSvg` in `app/src/music/staff.ts` um mehrere Noten erweitern oder eine
  Schwesterfunktion schreiben; Hilfslinien und Vorzeichen wie bei der einzelnen Note. **Vorzeichen an jeder
  Note**, auch bei Wiederholung (kein Takt, also keine Taktregel – so bleibt jede Note für sich lesbar).
- Frage: „Wie heißen diese Noten? Der Reihe nach.“
- Antworten: Namenknöpfe wie bei Note→Name, nach Tonhöhe geordnet: alle verschiedenen Töne der Folge plus
  verwechselbare dazu (`makeChoices`/`confusability` in `app/src/srs/choices.ts` nutzen), insgesamt 8
  (gibt es weniger freigeschaltete Töne, entsprechend weniger). Mindestens 2 Knöpfe sollen nicht in der
  Folge vorkommen, damit sich die Lösung nicht durch Abzählen erraten lässt.
- Die aktuelle Note ist dezent markiert (z. B. feiner Strich darunter). Tippen:
  - **richtig:** die Note bekommt das kleine Häkchen bzw. wird ruhig abgehakt, die Markierung rückt weiter;
  - **falsch:** die Note wird als falsch markiert, darunter erscheint ihr richtiger Name, es geht mit der
    nächsten Note weiter (kein Steckenbleiben).
- Unter der Notenzeile wachsen die getippten Namen mit (so sieht man, wo man ist).
- „Weiß nicht“: löst die restlichen Noten auf, sie zählen als falsch.
- Nach der letzten Note: Rückmeldung wie bei den Karten (ganz richtig: kurz „Richtig“ und automatisch
  weiter nach `AUTO_NEXT_MS`; sonst die aufgelöste Folge und „Weiter“). Die bestehende Gestaltung ohne
  Verschieben (Richtig inline, Falsch-Feld anstelle der Antworten, Querformat) beibehalten.

### Spielen: Tonfolge spielen

- Dieselbe Notenzeile, Frage: „Spiel diese Töne nacheinander.“ Darunter wie bei der Spielen-Karte „Ich
  höre“ mit Name und Anzeige.
- Wertung mit dem **`WaitFollower`** aus `app/src/audio/follow.ts` (wartet auf jede Note, braucht für
  Tonwiederholungen einen neuen Einsatz, verzeiht Übergangsklänge beim Fingerwechsel, Oktave zu hoch ist
  ein Hinweis, kein Fehler). Dafür aus der Folge einen kleinen Zeitplan (`Timeline`,
  `app/src/songs/timeline.ts`) bauen. Stimmton und Werte der aktiven Flöte wie in `practice.ts` bzw.
  `song-follow.ts` übergeben.
- Rückmeldung je Note **farbig wie beim Mitspielen** (`.hit`/`.miss`): getroffen → als getroffen markiert,
  Markierung rückt weiter; falscher Ton → Note wird als falsch markiert, wartet aber weiter auf den
  richtigen Ton (so lernt man den Griff). Die Note zählt dann als falsch.
- Mit Kopfhörern (`settings.headphones`): nach einem falschen Ton kurz den richtigen vorspielen, wie im
  Warte-Modus beim Mitspielen. Ohne Kopfhörer still.
- Nach der letzten Note: Rückmeldung wie oben; zusätzlich ein kleiner Knopf **„Anhören“**, der die Folge
  einmal vorspielt (`flute-synth.ts`/`song-player.ts`) – gut fürs Ohr.
- „Weiß nicht“/„Überspringen“ wie bei der Spielen-Karte: restliche Töne zählen als falsch.
- Die Haltedauer und Toleranz aus den Einstellungen gelten wie bei der Spielen-Karte.

### Wertung (`app/src/srs/progress.ts`)

- Nach der Folge je **verschiedenem** Ton einmal `recordAnswer(… ok …)`: ok nur, wenn er an allen Stellen
  richtig war. Danach `checkUnlocks` wie bei Karten.
- Keine Änderung an `data.cards`. **Kein neues Datenfeld nötig, kein Versionssprung.** Falls doch ein
  Schalter nötig wird (z. B. „Tonfolgen in Sitzungen“ in den Einstellungen – nur wenn es sich als nötig
  erweist), als optionales Feld wie bei `songs`.

## Tests und Prüfung

- Unit-Tests (Vitest) für das Erzeugen: nur vorgestellte Töne, keine anderen Schreibweisen,
  Sprunggrenze, Halbtonschritte kommen vor, Wiederholungen kommen vor und nie dreifach, Länge passt sich an,
  feste Ergebnisse mit festem `rng`.
- Unit-Tests für die Sitzung: Anteil Tonfolgen unter den Zusatzkarten, keine Folgen unter 5 Tönen,
  Zählung „jeder Ton höchstens einmal pro Folge“, Leitner-Fächer unverändert, Wiederholung nach Fehler,
  „nie zweimal derselbe Ton direkt hintereinander“ über die Grenze Folge/Karte.
- Browser-Tests: Lesen-Folge richtig und mit Fehler durchtippen; Spielen-Folge mit der Mikrofon-Attrappe
  (wie in `follow.spec.ts`/`play.spec.ts`), darunter eine Folge mit Tonwiederholung und eine mit
  Halbtonschritt; Querformat.
- Bildschirmfotos (`SHOTS=1 npx playwright test shots`, auch `SCHEME=dark`), hoch und quer: Lesen-Folge
  am Anfang, mittendrin, mit Fehler, aufgelöst; Spielen-Folge mittendrin und am Ende. Vor dem Abgeben
  selbst ansehen.
- `npm test`, `npm run e2e`, `npm run build` im Ordner `app/` grün.

## Doku nach der Umsetzung

- `docs/app-entscheidungen.md`: Abschnitt 1 (Zusammensetzung), 3 (Trefferquote: Folgen zählen je Ton
  einmal), 4 (neue Übungsart „Tonfolge“ für Lesen und Spielen).
- `docs/UEBERGABE.md`: kurzer Eintrag, wo was liegt und wie es getestet wird.

## Umsetzung (14.11.2026)

Umgesetzt wie oben beschrieben; Regeln nachgetragen in `docs/app-entscheidungen.md` (Abschnitte 1, 3, 4).

- **Wo was liegt:** Erzeugen, Länge, Antwortknöpfe `app/src/srs/sequences.ts`; Zusammensetzung und Wertung
  `app/src/srs/session.ts` (Schritt `{ type: "folge", folge: { notes, uid }, track, retry }`, Planeintrag
  `folge: true` an jeder zweiten Zusatzkarte, Wertung `Session.answerFolge`); Notenzeile mit mehreren Noten
  `staffSeqSvg` in `app/src/music/staff.ts` (Namen darunter als SVG-Text, damit sie genau unter ihrer Note
  stehen); einfacher Zeitplan `toneTimeline` in `app/src/songs/timeline.ts`; Oberfläche `renderFolge` in
  `app/src/ui/practice.ts`, Gestaltung `.staff.seq` u. a. in `app/src/styles.css`.
- Kein neues Datenfeld, kein Versionssprung, kein Schalter in den Einstellungen.

### Abweichungen und Ergänzungen (begründet)

- **Platz bleibt Karte, wenn es (noch) keine Folge geben kann:** Der Plan markiert jede zweite Zusatzkarte
  als „wird Tonfolge“; ob genug Töne vorgestellt sind, wird erst entschieden, wenn der Schritt drankommt.
  So zählen neue Töne dieser Sitzung ab ihrer Vorstellung mit, und unter 5 Tönen bleibt der Platz die
  Zusatzkarte (die Sitzung wird nicht kürzer).
- **Abwechseln:** Nach einer Folge kommt möglichst eine Karte, nach einer Zusatzkarte möglichst eine Folge –
  sonst schob eine Karte, die wegen „nie zweimal derselbe Ton“ gerade nicht passte, die Folgen nach hinten,
  und sie häuften sich am Sitzungsende. Ausnahme: Die Wiederholung einer Folge nach einem Fehler kommt
  nach 2–3 Schritten, auch wenn davor eine Folge stand (die Regel 2–3 geht vor).
- **Wiederholung und „nie zweimal derselbe Ton“:** Eine neue Folge endet möglichst nicht mit dem ersten Ton
  einer gleich fälligen Wiederholung, sonst müsste diese länger warten.
- **Länge** ändert sich nur durch gewertete Folgen, nicht durch die Wiederholung nach einem Fehler.
- **Lesen, falscher Tipp:** Unter der Note steht ihr richtiger Name in Rot; der getippte falsche Name steht
  nicht noch zusätzlich dort (zwei Namen übereinander wären unruhig). Er steht im Hinweis am Ende („Du hast
  fis¹ gewählt …“, für die erste falsche Note). Der getippte Knopf leuchtet kurz grün bzw. rötlich auf.
- **Rückmeldung bei Fehlern:** Im rötlichen Feld steht das Griffbild der *ersten* falschen Note, die ganze
  Folge (falsche Töne rot) und der Hinweis wie bei Karten; beim Spielen beginnt er mit „Du hast d²
  gespielt.“, weil keine Überschrift „Du spielst …“ wie bei der Karte da ist.
- **Spielen, Klarheit 0,9** wie bei der Spielen-Karte (das Mitspielen nimmt 0,85): Abschnitt 4 sagt, dass die
  Übung Toleranz, Haltedauer und Klarheit 0,9 behält. Übrige Werte der Warte-Wertung (falsch erst nach
  250 ms und neuem Einsatz usw.) wie beim Mitspielen.
- **Spielen, Beginn der Wertung:** Es zählen nur Töne, die nach dem Erscheinen der Folge neu einsetzen (der
  ausklingende Ton der Karte davor zählt nicht). Die 400-ms-Regel der Spielen-Karte gilt hier nicht: Sie
  würde einen schnellen ersten Ton verschlucken.
- **Spielen, Hinweise in der Frage-Zeile:** „Du spielst d²“ bzw. „eine Oktave zu hoch – sanfter blasen“
  ersetzen vorübergehend die Frage (nichts verschiebt sich); nach dem nächsten Treffer steht wieder die Frage.
- **„Anhören“** spielt die Folge mit 0,6 s je Ton im Stimmton der aktiven Flöte. Nach „Richtig“ hält es das
  automatische Weitergehen an (sonst bliebe keine Zeit zum Zuhören); Tippen irgendwo geht weiter. Beim
  Weitergehen verstummt es, damit das Mikrofon es nicht als Spiel der nächsten Aufgabe hört.
- **Nur für Browser-Tests:** `window.__folgen = [["g1", "e1", "e1"], …]` gibt die nächsten Folgen fest vor.

### Tests

- `app/tests/unit/sequences.test.ts` (Pool, Sprunggrenze, Halbtonschritte, Wiederholungen, Länge, fester
  Zufall, Antwortknöpfe), `app/tests/unit/session.test.ts` Abschnitt „Tonfolgen“ (Anteil, unter 5 Tönen
  keine, je Ton einmal gewertet, Fächer unverändert, Wiederholung nach Fehler, Länge, „nie zweimal derselbe
  Ton“ über die Grenze Folge/Karte).
- `app/tests/e2e/folge.spec.ts`: Lesen richtig, mit Fehler und Wiederholung, „Weiß nicht“, Querformat;
  Spielen mit Tonwiederholung (neuer Einsatz) und „Anhören“, mit Halbtonschritt und falschem Ton.
- Bildschirmfotos `*-t1…t7-*.png` (`SHOTS=1 npx playwright test shots -g Tonfolgen`, auch `SCHEME=dark`).
