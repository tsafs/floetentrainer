# Flötentrainer-App: Abwechslung beim Üben und Spielen

Abgestimmt im Gespräch am 15.11.2026. Ergänzt `docs/app-entscheidungen.md` und `docs/app-tonfolgen.md`;
nach der Umsetzung dort nachtragen. Umsetzung in der Reihenfolge der Abschnitte 1–5, jeder Abschnitt für
sich fertig (Tests, Bildschirmfotos, Übergabe).

## Anlass

Rückmeldung auf Spielen-Stufe 3: „Ich finde das Spielen etwas langweilig, weil ich voll oft einzelne Töne
spielen muss und nur recht selten Tonfolgen bekomme.“ Beim Üben (Tippen) „kommen recht wenige Aufgaben mit
Griffen vor“, und es gibt keine Tonfolgen mit Griffen. Die 2×2- und 2×4-Raster der Antwortknöpfe sind
unübersichtlich: „Ich hätte lieber eine Zeile als zwei, vor allem für die Griffe.“

Ursachen im Aufbau (Stand vor der Änderung):
- Fällige und neue Karten sind immer Einzeltöne; nur jede zweite Zusatzkarte wird eine Folge. Auf
  niedrigen Stufen sind viele Karten in den unteren Fächern und fast jede Sitzung fällig – dann sind nur
  4–6 von 20 Plätzen Folgen.
- Beim Lesen wird jeder zweite Zusatz-Platz zur Folge, egal welche Übungsart dort stand; Folgen gibt es
  aber nur als Note→Name. Griff-Karten verlieren so rund die Hälfte ihrer Plätze an Namen-Folgen.

## Entscheidungen

1. **Eine Zeile, höchstens 5 Antwortknöpfe** – für alle Antwortarten (Namen, Griffe, Notenbilder), auf
   Karten und in Folgen. Gemessen (15.11.2026): 5 Griffbilder passen auf jedem Handy hoch und quer
   bequem (≥ 48 px je Knopf bei 320 px Breite), 6 werden auf kleinen Handys eng, 7 gedrungen. Die
   App-Spalte ist auf etwa 520 px begrenzt, breitere Bildschirme bringen keinen Platz.
2. **Jede Übungsart auch als Folge:** Noten → Namen (wie bisher), **Noten → Griffe** (neu) und
   **Griffbilder → Namen** (neu).
3. **Fällige Karten zählen auch in Folgen.** Kommt ein Ton in einer Folge mehrmals vor, zählt er einmal
   und ist nur richtig, wenn er an allen Stellen richtig war (wie schon für die Trefferquote).
4. **Spielen: deutlich mehr Folgen**, Einzeltöne nur noch für neue Töne.
5. **Wechsel-Drills** für schwere Griffwechsel (Beispiel aus der Rückmeldung: h¹ → c² „echt schwierig“),
   ruhig und sauber statt schnell.
6. **Kapitel:** Die Meilensteine des Startpunkts werden als Kapitel sichtbar; die 11 kleinen Stufen
   bleiben (wenige neue Töne auf einmal, öfter „nächste Stufe“).
7. **Stufenlieder:** Zu jeder Stufe, wo es eins gibt, ein Heft-Lied, dessen Abschnitte während der Stufe
   als Folgen vorkommen; beim Freischalten der nächsten Stufe der Hinweis, es jetzt ganz zu spielen.
8. **Echo (hören → nachspielen)** als eigener Modus, ohne Kopfhörer möglich.
9. **Im Takt:** Start, sobald man einen Ton gespielt hat („Bereit? Spiel einen Ton, dann zähle ich
   ein.“); die Verzögerung wird beim Spielen im Takt nebenbei nachgestellt, der eigene Abgleich wird zur
   Ausnahme.

## 1. Üben (Lesen)

### Eine Zeile

- **Karten:** 4 Möglichkeiten, ab Fach 3 **5** (bisher Note→Name ab Fach 3: 8). Gilt für Note→Name und
  Note→Griff. Griff→Note (Notenbilder als Knöpfe) bleibt bei 4, jetzt in einer Zeile statt 2×2 – vorher
  messen, ob die schmalen Notenbilder bei 320 px Breite lesbar bleiben; sonst Hilfslinien-Bereich enger.
- **Folgen:** höchstens 5 Knöpfe: alle verschiedenen Töne der Folge plus mindestens **1** falscher (bisher
  2; bei 5 Knöpfen und 4 verschiedenen Tönen bleibt nur einer). Gibt es dafür zu wenige verschiedene
  Töne, bekommt die Folge weniger verschiedene Töne – eine Folge hat darum **höchstens 4 verschiedene
  Töne**. Die Länge (2 bis 5, ab Stufe 8 bis 6) bleibt; längere Folgen wiederholen Töne (nie direkt
  hintereinander).
- Querformat: alle Knopfreihen ebenfalls einzeilig.

### Die Folge erbt die Übungsart

Der Platz im Plan, der zur Folge wird, bestimmt ihre Art:

| Karte auf dem Platz | Folge |
|---|---|
| Note→Name | Noten → Namen (wie bisher) |
| Note→Griff | **Noten → Griffe** |
| Griff→Note | **Griffbilder → Namen** |

So bekommen Griffe ihren Anteil zurück. Der Anteil der Folgen beim Lesen bleibt (etwa jede zweite
Zusatzkarte).

### Noten → Griffe

- Oben die Notenzeile wie bei Noten → Namen, Frage: „Welche Griffe sind das? Der Reihe nach.“
- Antworten: bis zu 5 Griffbilder in einer Zeile, **gemischt** (wie bei der Griff-Karte; nach Tonhöhe
  geordnet würde die Reihe die Lösung verraten).
- Unter jeder Note erscheint nach dem Tippen der **Name** des getippten Griffs (wie bisher der getippte
  Name), rot bei falsch.
- Fehlerfeld: die richtigen Griffe der Folge als kleine Griffbilder nebeneinander, darunter die Namen,
  falsche rot. „Vertippt“ und „Weiß nicht“ wie bei Noten → Namen.

### Griffbilder → Namen

- Oben statt der Notenzeile eine Reihe von Griffbildern (die Folge, **höchstens 5** – mehr passen nicht
  bequem in eine Zeile), die aktuelle dezent markiert (feiner Strich darunter wie bei den Noten). Frage:
  „Welche Töne sind das? Der Reihe nach.“
- Antworten: Namenknöpfe wie bei Noten → Namen (nach Tonhöhe, höchstens 5).
- Unter jedem Griffbild erscheint der getippte Name, rot bei falsch. Fehlerfeld: die richtigen Namen,
  falsche rot.

## 2. Spielen

### Mehr Folgen, fällige Karten in Folgen

Ab 5 vorgestellten Tönen (wie bisher, also ab Stufe 2):
- **Neue Karten** bleiben Einzeltöne (mit Vorstellung) – einen neuen Ton muss man erst allein finden.
- **Fällige Karten werden Folgen, die ihren Ton enthalten** (der Ton steht an zufälliger Stelle, nicht
  immer vorn). Nach der Folge wird die Karte im Leitner-System gewertet: richtig nur, wenn der Ton an
  allen Stellen richtig war. Andere Töne der Folge zählen wie bisher nur für die Trefferquote.
- **Zusatzkarten:** drei von vier werden Folgen (bisher jede zweite).
- Ein Platz, der eine Folge werden soll, bleibt eine Einzelkarte, wenn es (noch) zu wenige Töne gibt.
- Beim Lesen bleibt es bei fälligen Einzelkarten (dort war die Rückmeldung „ist okay“); die Technik ist
  aber dieselbe und ließe sich später einschalten.

### Wechsel-Drills

- Eine besondere Folge aus **zwei Tönen im Wechsel**, 6 Töne lang (h¹ c² h¹ c² h¹ c²), Frage: „Wechsle
  ruhig hin und her.“ Gewertet wie eine Folge (je Ton einmal); zählt als eine Position.
- **Welches Paar:** Die App merkt sich je Tonpaar (Richtung egal) beim Spielen von Folgen, ob der Wechsel
  gelang (zweiter Ton richtig, nachdem der erste richtig war), die letzten 10 Versuche. Ein Paar ist
  schwierig ab 2 Fehlern in den letzten 10. Solange es kein schwieriges Paar gibt, kommen Paare mit
  **Gegenbewegung** (mindestens ein Finger hebt, ein anderer setzt auf – wie h¹ → c²) bevorzugt.
- Höchstens **ein Drill je Sitzung**, ab 5 Tönen, nur beim Spielen.
- Neues optionales Datenfeld (kein Versionssprung, kommt mit in die Sicherung).
- Erkennung: Die Warte-Wertung erkennt jeden Wechsel sicher, weil sich die Tonhöhe ändert. Tempo wird
  nicht gewertet (die Erkennung braucht je Ton 0,1–0,2 s).

## 3. Kapitel und Stufenlieder

### Kapitel

| Kapitel | Stufen | Töne bis dahin |
|---|---|---|
| 1 Linke Hand: g¹ bis d² | 1–2 | 5 |
| 2 Erste Oktave: c¹ bis e², mit fis¹ | 3–6 | 11 |
| 3 Hohe Töne bis c³, mit cis² | 7–8 | 17 |
| 4 Alle Töne, auch b, es und gis | 9–11 (Lesen auch 12) | 25 |

- Dieselben Grenzen und Namen wie die Meilensteine (`app/src/srs/startpoint.ts`).
- Fortschrittsseite: Stufen nach Kapiteln gruppiert („Kapitel 2 · Erste Oktave“, darunter die Stufen);
  bei der aktuellen Stufe „Stufe 4 · Kapitel 2“. Freischalten wie bisher je Stufe.

### Stufenlieder

Ab welcher Stufe die Heft-Lieder spielbar sind (Stand 15.11.2026):

| Stufe | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| neu spielbar | 0 | 2 | 1 | 4 | 5 | 1 | 6 | 0 | 4 | 7 | 3 |

- Je Stufe mit Lied ein fest gewähltes **Stufenlied** (das bekannteste und einfachste, z. B. Stufe 2
  „Hänschen klein“, Stufe 3 „Bi-Ba-Butzemann“, Stufe 5 „Alle meine Entchen“); Liste im Code.
  Stufe 1 und 8 haben keins (offen: eigene kleine Melodie oder Heft-Übung).
- **Abschnitte:** Das Lied wird an den Atemzeichen und Pausen geteilt, zu lange Stücke an Taktgrenzen
  (höchstens 8 Töne). *Umgesetzt zunächst ohne Rhythmus* (ganze Noten wie die anderen Folgen); mit echtem
  Rhythmus später. Beim Spielen ist etwa
  jede vierte Folge ein Abschnitt des Stufenlieds der aktuellen Stufe (ohne eigenes Lied: eines aus dem
  Kapitel, das schon spielbar ist). Gewertet nur die Töne (Warte-Wertung), je Ton einmal für die
  Trefferquote. Frage „Aus „Hänschen klein“ – spiel diese Töne.“
- **Beim Freischalten** einer Stufe: im Ergebnis zusätzlich „Jetzt kannst du *Hänschen klein* ganz
  spielen“ mit Link auf die Liedseite (Mitspielen, Warte-Modus).

## 4. Echo: hören → nachspielen

- Eigener Modus, erreichbar über das Menü und einen kleinen dritten Knopf „Hören“ auf der Startseite.
- Zwei Arten: **nachspielen** (Mikrofon) und **Namen tippen** (leise, auch unterwegs).
- Ablauf: Der **erste Ton ist genannt** (Name und Note), die App spielt die Folge einmal vor (Flötenklang,
  Stimmton der aktiven Flöte), danach hört sie zu bzw. es wird getippt. „Nochmal anhören“ beliebig oft.
  Danach erscheint die Notenzeile mit grün/rot.
- Relatives Hören statt absolutem Gehör: Beginn mit 2–3 Tönen in Schritten, dann länger (bis 5) und mit
  Terzen und Sprüngen; Länge wie bei Folgen (nach zwei richtigen +1, nach einem Fehler −1).
- Töne: freigeschaltete Töne der Spielen- bzw. Lesen-Spur. Zählt **nicht** für Trefferquote und Fächer
  (eigene Fähigkeit); 10 Aufgaben je Durchgang.
- Kopfhörer nicht nötig: Das Mikrofon hört erst nach dem Vorspielen (kurze Nachklangpause) zu.

## 5. Im Takt

- **Start durch Spielen:** Nach „Mitspielen“ im Takt-Modus (und beim Abgleich) steht „Bereit? Spiel
  einen Ton, dann zähle ich ein.“ Die App wartet auf einen beliebigen Ton (mindestens 0,3 s) und die
  Pause danach; dann beginnt das Einzählen. Tippen auf „Los“ startet ohne Ton.
- **Zwei Takte einzählen** im Takt-Modus (bisher einer).
- **Verzögerung nebenbei:** Nach jedem Durchgang im Takt mit mindestens 6 sauberen Einsätzen (umgesetzt mit
  6 statt 8, damit auch kurze Lieder und Abschnitte zählen) errechnet die
  App den mittleren Versatz der Einsätze (Median, Ausreißer weg) und stellt die Verzögerung für den
  aktuellen Kopfhörer-Zustand um die Hälfte der Abweichung nach (nur ab 15 ms Abweichung, innerhalb der
  erlaubten Grenzen). Dezent: „Verzögerung nachgestellt: 150 ms“. Der Knopf „abgleichen“ bleibt.
- Später denkbar: Abgleich ohne Kopfhörer ganz ohne Spielen (Klick über den Lautsprecher, das Mikrofon
  hört ihn).
- Rhythmus in Folgen und schnellere Stücke erst, wenn die Erkennung bei schnellem Spiel besser ist.
