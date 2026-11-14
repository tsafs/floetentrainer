# Flötentrainer-App: Startpunkt im Lernplan

Abgestimmt mit der Nutzerin am 14.11.2026 (alle Empfehlungen angenommen), am selben Tag umgesetzt. Ergänzt
`docs/app-entscheidungen.md` (Abschnitte 2, 3, 6); nach der Umsetzung dort nachtragen. Unabhängig von
`docs/app-navigation.md` (Menü) und `docs/app-tonfolgen.md` (Tonfolgen in `session.ts`/`practice.ts`):
Diese Arbeit fasst `session.ts` und `practice.ts` nicht an und die Startseite nur so weit, dass beim
allerersten Start die Willkommensseite kommt.

## Anlass

Wunsch der Nutzerin: Wer schon Noten kann, soll nicht ganz vorn anfangen müssen, sondern einen Meilenstein
wählen. Ist es zu leicht, geht man weiter, ist es zu schwer, zurück oder ganz von vorn. Außerdem zum
Ausprobieren: weiter hinten anfangen und prüfen, ob alles funktioniert.

## Was heute beim Vorspringen schiefgeht (geprüft)

In den Einstellungen lässt sich die Stufe mit + erhöhen. Springt man so auf Stufe 8:

- Alle Töne der Stufen 1–8 (17 Töne, beim Lesen je 3 Karten = 51 Karten) sind **neue Karten**. Eine
  Sitzung nimmt höchstens 6 neue, und zwar in Stufenreihenfolge – also erst h¹ a¹ g¹ usw. Vor jedem Ton
  kommt seine Vorstellung. Das sind 9 Sitzungen nur mit neuen Karten, ehe alle durch sind, und
  17 Vorstellungen von Tönen, die man angeblich schon kann.
- Für Stufe 9 braucht **jeder** der 17 Töne 10 Antworten mit 90 %. Zusatzkarten verteilen sich gleich auf
  alle Töne; das sind rund 170 gewertete Antworten, bevor es weitergeht.

## Entscheidungen

### Meilensteine

Sechs benannte Einstiegspunkte, jeder beginnt bei einer Stufe. Alles davor gilt als bekannt.

| Meilenstein | beginnt bei | Neu dort | Gilt als bekannt |
|---|---|---|---|
| Erste Töne | Stufe 1 | h¹ a¹ g¹ | – |
| Hinunter bis d¹ | Stufe 3 | e¹ d¹, dann fis¹, e² f¹ | h¹ a¹ g¹ c² d² |
| Das tiefe c¹ | Stufe 6 | c¹ | d¹–e² mit fis¹ und f¹ |
| Hohe Töne | Stufe 7 | cis² f² g², dann a² h² c³ | c¹–e² |
| Vorzeichen | Stufe 9 | b¹ es¹, dann cis¹ gis¹ fis² | alle Stammtöne c¹–c³ |
| Schwierige hohe Griffe | Stufe 11 | es² gis² b² | alles bis auf es² gis² b² |

Jeder Meilenstein zeigt eine kleine Notenvorschau der Töne, mit denen man dort beginnt, und darunter in
einer Zeile, was als bekannt gilt. Die einzelnen Stufen bleiben in den Einstellungen mit − / + einstellbar
(Feinsteuerung), Stufe 12 (andere Schreibweisen) erreicht man von „Schwierige hohe Griffe“ aus wie bisher.

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
- Fürs **Freischalten** zählen nur die Töne ab dem Startpunkt. Wer bei „Vorzeichen“ beginnt, braucht für
  die nächste Stufe also nur b¹ und es¹ mit je 10 Antworten und 90 %.
- Hat ein Ton schon echte Antworten (z. B. nach einem Zurückgehen), bleibt seine Karte wie sie ist.

### Zurückgehen und „ganz von vorn“

- **Zurück zu einem früheren Meilenstein:** Die Stufe sinkt, für das Freischalten zählen wie beim Senken
  von Hand nur Antworten ab jetzt. Töne ab dem neuen Startpunkt, die nur als bekannt angenommen und **nie
  wirklich beantwortet** wurden, werden wieder ganz neu (mit Vorstellung) – man geht ja zurück, weil sie
  nicht sitzen. Geübte Töne behalten ihre Karten und Antworten.
- **„Ganz von vorn“** ist der Meilenstein „Erste Töne“: dasselbe wie oben, also bisherige Antworten
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
