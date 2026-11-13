# Auftrag: Übungs-App „Flötentrainer“

Baue eine kleine Web-App zum Notenlernen für Blockflöte. Ich bin erwachsene Anfängerin, spiele
Sopranblockflöte in C mit barocker Griffweise (Doppellöcher bei 6 und 7) und programmiere nicht
selbst – erkläre mir Entscheidungen in Worten, nicht in Code. Bitte vor dem Programmieren kurz den
Plan mit mir abstimmen.

## Ziel
Ich soll die Verbindung „Note auf den Linien → Name → Griff → Ton“ wirklich verinnerlichen.

## Rahmen
- Statische Web-App ohne Server und ohne Konto. Alle Daten bleiben lokal im Browser (localStorage
  oder IndexedDB), mit Export/Import als Datei als Sicherung.
- Auf dem Handy gut bedienbar (große Tippflächen, Hochformat), auch auf Tablet/Desktop. Offline
  nutzbar (PWA, zum Startbildschirm hinzufügbar).
- Veröffentlichung über GitHub Pages aus diesem Repo (GitHub-Actions-Workflow). Schlanker Stack,
  z. B. Vite + TypeScript; möglichst wenige Bibliotheken. App-Code in eigenem Ordner (z. B. `app/`).
- Deutsche Notennamen: c d e f g a h, mit Vorzeichen cis, dis/es, fis, gis/as, b; Oktaven als c¹ … c³.
- Ruhiges, aufgeräumtes Design, viel Weißraum, gut lesbar.

## Notendarstellung
Violinschlüssel, fünf Linien, Hilfslinien für c¹ und ab a², Vorzeichen bei Bedarf. Gern selbst als
SVG zeichnen (es sind nur einzelne Noten), Notenschrift Bravura (liegt in `heft/fonts/`).

## Griffbilder (gleicher Stil wie im Heft, siehe `heft/engrave.py`, Funktion für die Flöte)
- Schlanke stilisierte Flöte, oben Kopf mit Fenster; Daumenloch als eigener Kreis links neben dem
  oberen Teil; Löcher 1–3, feiner Trennstrich, 4–7; 6 und 7 als Doppellöcher. Alle Löcher vollständig
  innerhalb des Korpus.
- ● zu, ○ offen, ◐ halb (Daumen einen Spalt offen bzw. bei 6/7 nur das große Loch zu).
- Grifftabelle (Daumen · 1–3 · 4–7; x=zu, o=offen, h=halb):
  c¹ x xxx xxxx | cis¹ x xxx xxxh | d¹ x xxx xxxo | es¹ x xxx xxho | e¹ x xxx xxoo | f¹ x xxx xoxx |
  fis¹ x xxx oxxo | g¹ x xxx oooo | gis¹ x xxo xxxo | a¹ x xxo oooo | b¹ x xox xooo | h¹ x xoo oooo |
  c² x oxo oooo | cis² o xxo oooo | d² o oxo oooo | es² o oxx xxxo | e² h xxx xxoo | f² h xxx xoxo |
  fis² h xxx oxoo | g² h xxx oooo | gis² h xxo xooo | a² h xxo oooo | b² h xxo xxxo | h² h xxo xxoo |
  c³ h xoo xxoo

## Übungsarten
1. Note → Name: Note wird gezeigt, ich tippe den Namen (Auswahl aus 4, später aus allen Namen der Stufe).
2. Note → Griff: Note wird gezeigt, ich wähle aus 4 Griffbildern das richtige. Falsche Antworten
   möglichst verwechselbar (Nachbartöne, ähnliche Griffe).
3. Griff → Note: umgekehrt.
4. Spielen: Note wird gezeigt, ich spiele sie, die App hört über das Mikrofon zu (Web Audio API,
   Tonhöhenerkennung z. B. mit „pitchy“ oder Autokorrelation/YIN). Achtung: Sopranblockflöte klingt
   eine Oktave höher als notiert (notiertes c¹ ≈ 523 Hz). Toleranz einstellbar (z. B. ±40 Cent), Ton
   muss ca. 0,3 s stabil sein; Stimmton einstellbar (Standard a = 440 Hz). Zeige, welchen Ton die App
   gerade hört.

Nach jeder Antwort kurze Rückmeldung; bei Fehlern Note, Name und Griff zusammen zeigen.

## Lernstufen
Neue Töne kommen schrittweise dazu, erst wenn die bisherigen sitzen:
h¹ a¹ g¹ → c² d² → e¹ d¹ → fis¹ → e² f¹ → c¹ → cis² f² g² → Rest (cis¹, es¹, gis¹, b¹, es², fis², gis²,
a², b², h², c³). Stufe auch manuell wählbar.

## Wiederholung (Spaced Repetition)
- Jede Kombination aus Ton und Übungsart ist eine „Karte“. Leitner-System mit 5–6 Fächern oder SM-2:
  richtig → seltener (sofort, 1, 3, 7, 14, 30 Tage), falsch → zurück ins erste Fach und in derselben
  Sitzung nochmal.
- Kurze Sitzungen (Standard 5 Minuten oder 20 Karten), fällige Karten zuerst, dann neue.
- Übersicht: welche Töne sitzen, welche nicht, Serie der Übungstage.

## Qualität
- Automatische Tests für Grifftabelle, Notennamen/Frequenzen und Wiederholungslogik;
  Browser-Tests (Playwright) für die Übungsabläufe.
- Screenshots in Handy- und Desktop-Breite zeigen, bevor etwas als fertig gemeldet wird.
