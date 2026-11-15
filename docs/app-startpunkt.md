# Flötentrainer-App: Startpunkt im Lernplan

Abgestimmt am 14.11.2026, am selben Tag umgesetzt; die Meilensteine danach noch einmal neu gefasst (siehe unten). Ergänzt
`docs/app-entscheidungen.md` (Abschnitte 2, 3, 6); nach der Umsetzung dort nachtragen. Unabhängig von
`docs/app-navigation.md` (Menü) und `docs/app-tonfolgen.md` (Tonfolgen in `session.ts`/`practice.ts`):
Diese Arbeit fasst `session.ts` und `practice.ts` nicht an und die Startseite nur so weit, dass beim
allerersten Start die Willkommensseite kommt.

## Anlass

Wunsch des Nutzers (Anrede im Gespräch: „du“): Wer schon Noten kann, soll nicht ganz vorn anfangen müssen, sondern einen Meilenstein
wählen. Ist es zu leicht, geht man weiter, ist es zu schwer, zurück oder ganz von vorn. Außerdem zum
Ausprobieren: weiter hinten anfangen und prüfen, ob alles funktioniert.

## Was heute beim Vorspringen schiefgeht (geprüft)

In den Einstellungen lässt sich die Stufe mit + erhöhen. Springt man so auf Stufe 8:

- Alle Töne der Stufen 1–8 (17 Töne, beim Lesen je 3 Karten = 51 Karten) sind **neue Karten**. Eine
  Sitzung nimmt höchstens 6 neue, und zwar in Stufenreihenfolge – also erst h¹ a¹ g¹ usw. Vor jedem Ton
  kommt seine Vorstellung. Das sind 9 Sitzungen nur mit neuen Karten, ehe alle durch sind, und
  17 Vorstellungen von Tönen, die man angeblich schon kann.
- Für Stufe 9 braucht **jeder** der 17 Töne 10 Antworten mit 90 % (seit 15.11.2026: 8 Punkte Sicherheit). Zusatzkarten verteilen sich gleich auf
  alle Töne; das sind rund 170 gewertete Antworten (mit 8 Punkten je Ton seit 15.11.2026 rund 136), bevor es weitergeht.

## Entscheidungen

### Meilensteine

Gefragt wird „Ich kann schon …“; der Start ist die Stufe danach. Die Grenzen fallen genau auf Stufengrenzen
in `app/src/music/levels.ts`.

| Meilenstein | enthält Stufen | neue Töne | zusammen | Start bei Stufe |
|---|---|---|---|---|
| Ganz von vorn | – | – | – | 1 |
| Linke Hand: g¹ bis d² | 1–2 | 5 | 5 | 3 |
| Erste Oktave: c¹ bis e², mit fis¹ | 1–6 | 6 | 11 | 7 |
| Hohe Töne bis c³, mit cis² | 1–8 | 6 | 17 | 9 |
| Alle Töne von c¹ bis c³, auch b, es und gis | 1–11 | 8 | 25 | 12 |

Bei „Alle Töne“ steht Spielen ganz oben (Stufe 11), und auch dessen Töne gelten als bekannt; Lesen beginnt
mit den anderen Schreibweisen.

**Notenvorschau** je Meilenstein: alle enthaltenen Töne nach Tonhöhe wie eine Tonleiter, die neuen dieses
Meilensteins schwarz, die aus früheren blass (so kann man sich selbst prüfen: „Kannst du diese Noten lesen?“).
Alle Vorschauen im selben Maßstab; höchstens 9 Töne je Zeile, längere Reihen werden gleichmäßig umbrochen.
Darunter „17 Töne · danach neu: b¹ und es¹“.

**Feinabstimmung** zwischen den Meilensteinen bleibt − / + unter „Stufen“ in den Einstellungen; die
Auswahlseite weist darauf hin („Dazwischen? Wähle den kleineren und stelle in den Einstellungen eine Stufe
höher.“).

Erste Fassung (ersetzt): sechs Meilensteine, benannt nach dem, was dort neu kommt (Erste Töne · Hinunter bis
d¹ · Das tiefe c¹ · Hohe Töne · Vorzeichen · Schwierige hohe Griffe, Start 1/3/6/7/9/11). Auf den
Bildschirmfotos wirkten die Notenzeilen (Stufenreihenfolge) wie ein Durcheinander, zwei Meilensteine brachten
nur je 3 Töne, und „Ich kann schon …“ lässt sich für Einsteiger leichter beantworten.

### Wo gewählt wird

- **Beim allerersten Start** (noch keine Sitzung, noch nichts gewählt): Willkommensseite `#/willkommen`
  mit zwei Knöpfen „Von vorn beginnen“ und „Ich kann schon Noten“. Der zweite öffnet die Meilensteine.
- **Später** auf einer eigenen Seite „Startpunkt“ (`#/startpunkt`), erreichbar von der Fortschrittsseite
  („Zu leicht oder zu schwer? Startpunkt ändern“) und in den Einstellungen unter „Stufen“. Die Menü-Arbeit
  kann sie später ins Menü aufnehmen.
- Wer die App schon benutzt (es gibt Sitzungen), sieht die Willkommensseite nie.

### Lesen und Spielen

Standard: **ein Startpunkt für beide**. Auf der Seite „Startpunkt“ oben die Wahl „Lesen und Spielen ·
nur Lesen · nur Spielen“. Spielen bleibt wie bisher höchstens so hoch wie Lesen; Meilensteine darüber sind
für „nur Spielen“ ausgegraut.

### Die Töne davor („gilt als bekannt“)

- Keine Vorstellung (sie gelten als vorgestellt).
- Ihre Karten kommen in **Fach 3** – also nicht neu, sondern zum gelegentlichen Prüfen. Die Termine werden
  gestaffelt, **höchstens 3 Karten je Spur und Tag**, ab morgen, damit die fälligen Karten die neuen Töne
  nicht verdrängen. Wer sie richtig weiß, schiebt sie weiter nach hinten (7, 14, 30 Tage); wer sie nicht
  weiß, bekommt sie wie üblich öfter.
- Fürs **Freischalten** zählen nur die Töne ab dem Startpunkt. Wer bei „Hohe Töne bis c³“ beginnt (Start Stufe 9), braucht für
  die nächste Stufe also nur b¹ und es¹ mit je 8 Punkten Sicherheit.
- Hat ein Ton schon echte Antworten (z. B. nach einem Zurückgehen), bleibt seine Karte wie sie ist.

### Zurückgehen und „ganz von vorn“

- **Zurück zu einem früheren Meilenstein:** Die Stufe sinkt, für das Freischalten zählen wie beim Senken
  von Hand nur Antworten ab jetzt. Töne ab dem neuen Startpunkt, die nur als bekannt angenommen und **nie
  wirklich beantwortet** wurden, werden wieder ganz neu (mit Vorstellung) – man geht ja zurück, weil sie
  nicht sitzen. Geübte Töne behalten ihre Karten und Antworten.
- **„Ganz von vorn“** ist der erste Meilenstein: dasselbe wie oben, also bisherige Antworten
  bleiben, aber angenommene Töne werden wieder neu. Wer wirklich alles löschen will, nimmt wie bisher
  Einstellungen → „Alles zurücksetzen“.
- **Weiter zu einem späteren Meilenstein:** wie beim ersten Wählen; Töne mit echten Antworten bleiben
  unverändert.

### Daten

- Neues **optionales Feld** `start` (je Spur die Kennung der Stufe, ab der fürs Freischalten gezählt wird).
  Fehlt es, gilt Stufe 1 – genau wie heute. Kein Versionssprung: Eine ältere App ließe das Feld weg, dann
  müssten fürs Freischalten wieder alle Töne sitzen. Das bremst nur und lässt sich durch erneutes Wählen
  beheben.
- Ob die Willkommensseite kommt: kein `start` und noch keine Sitzung.
- Die angenommenen Karten sind gewöhnliche Karten in `cards`, die Töne stehen in `introduced`. „Nie
  wirklich beantwortet“ heißt: keine Antworten in `history` dieser Spur.

### Ideen für später

- Kurzer **Einstufungstest**: einige Noten aus einem Meilenstein abfragen und daraus den Startpunkt
  vorschlagen.

### Bekannte Grenze (nicht in dieser Arbeit)

Zusatzkarten verteilen sich gleichmäßig auf alle freigeschalteten Töne. Auf hohen Stufen – egal ob
erreicht oder gewählt – kommen die neuen Töne darum selten genug dran, um schnell 10 Antworten zu sammeln.
Abhilfe wäre, die Töne der aktuellen Stufe bei Zusatzkarten stärker zu gewichten. Das betrifft `session.ts`,
wo gerade die Tonfolgen entstehen; deshalb erst danach.

## Tests und Prüfung

- Unit: Meilensteine passen zu den Stufen, Wählen setzt Stufe/Startpunkt/Karten/Vorstellungen richtig,
  Staffelung höchstens 3 je Tag, Freischalten zählt nur ab Startpunkt, Zurückgehen macht angenommene Töne
  wieder neu und lässt geübte stehen, Spielen ≤ Lesen, Daten ohne `start` wie bisher, Sicherung behält
  `start`.
- Browser: erster Start zeigt Willkommensseite; „Von vorn“ führt zur Startseite und kommt nie wieder;
  „Ich kann schon Noten“ → Meilenstein → erste Sitzung ohne Vorstellungen der bekannten Töne und mit den
  neuen Tönen; Startpunkt ändern von der Fortschrittsseite; bestehende Daten sehen keine Willkommensseite.
- Bildschirmfotos hoch/quer, hell/dunkel: Willkommensseite, Meilensteine, Bestätigung.
