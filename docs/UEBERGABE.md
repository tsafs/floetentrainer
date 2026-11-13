# Übergabe

Für eine neue Claude-Code-Sitzung: Stand und nächste Schritte.

## Nutzerin
Erwachsene Anfängerin auf Sopranblockflöte (barocke Griffweise), programmiert nicht selbst.
Antworten auf Deutsch, Technik in Worten erklären statt Code zu zitieren. Vor größeren Änderungen
kurz den Plan abstimmen. Design: ruhig, elegant, viel Weißraum, schwarz-weiß druckbar.

## Stand
- `heft/pdf/Liederheft-Blockfloete-sw.pdf` – 19 Seiten, aktuell (22 Lieder).
- Bauen mit `heft/bauen.sh`. Das Skript misst die echten Höhen der Liedblöcke im Browser und
  verteilt sie auf Seiten (kein Lied über einen Umbruch); am Ende gibt es je Seite die Unterkante in mm
  aus – Werte über ca. 276 heißen: Seite läuft über.
- Lieder: `heft/songs.py` (Notation oben in der Datei erklärt). Jede Melodie wird beim Bauen auf
  Taktlängen und Silbenzahl geprüft. Wiederholungszeichen `|:` und `:|` werden unterstützt
  (erklärt auf der Seite „Noten lesen“).
- Regeln für Inhalte und die Wunschliste: `docs/notizen.md` (nur zweifelsfrei Gemeinfreies!).
- Vorlagen, die die Nutzerin selbst besorgt hat: `docs/quellen/`.
- Netz: Die Arbeitsumgebung erreicht nur de.wikibooks.org (plus Websuche mit Zusammenfassungen).
  Notenarchive (thesession.org, imslp.org …) sind gesperrt – Vorlagen lädt die Nutzerin ggf. selbst hoch.

## Prüfen vor dem Abgeben
Jede Seite als Bild ansehen (`pdftoppm`), Details vergrößert: Notenköpfe, Hilfslinien, Bögen,
Silben, Atemzeichen, Seitenumbrüche.

## Offene Aufgaben
1. Weitere Stücke aus `docs/notizen.md`, v. a. Themen aus van Eycks „Fluyten Lust-hof“.
   Seite 16 („All in a Garden Green“) ist erst halb voll – Platz für ein weiteres altes Stück.
2. Übungs-App: Auftrag in `docs/app-prompt.md`.
