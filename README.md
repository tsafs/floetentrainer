# Flötentrainer

Übungsmaterial für Sopranblockflöte in C mit barocker Griffweise (Doppellöcher bei 6 und 7).

- **`heft/`** – Liederheft zum Ausdrucken (A4, schwarz-weiß): Grifftabelle, Noten lesen, erste Übungen,
  Tonleitern und Lieder. Das fertige PDF liegt in `heft/pdf/`.
- **`app/`** – Übungs-App „Flötentrainer“ zum Notenlernen (Note → Name → Griff → Ton), läuft im Browser
  und offline: <https://tsafs.github.io/floetentrainer/>
- **`docs/`** – Übergabe, Notizen, Auftrag und Entscheidungen zur Übungs-App.

## Heft neu bauen

Voraussetzungen: Python 3 mit Pillow (`pip install -r heft/requirements.txt`), Node.js mit Playwright
(`cd heft && npm install`, Chromium über Playwright).

```bash
heft/bauen.sh
```

Der Notensatz ist selbst geschrieben (`heft/engrave.py`): Noten, Balken, Bögen, Atemzeichen und die
Griffbilder werden als SVG gezeichnet, Chromium druckt daraus das PDF. Die Lieder stehen in
`heft/songs.py` in einer kurzen Textnotation (Erklärung oben in der Datei).

## App entwickeln

Voraussetzung: Node.js 22. Im Ordner `app/`:

```bash
npm install
npm run dev      # Entwicklungsserver
npm test         # Logik-Tests (Vitest)
npm run e2e      # Browser-Tests (Playwright)
npm run build    # fertige App in app/dist
```

Bei jedem Push auf `main` baut ein GitHub-Actions-Workflow die App und veröffentlicht sie auf GitHub Pages.
Alle Übungsdaten bleiben im Browser (localStorage); in den Einstellungen gibt es eine Sicherung als Datei.

## Rechte

- Code: MIT-Lizenz (siehe `LICENSE`).
- Lieder: Es sind nur Melodien und Texte aufgenommen, deren Urheber seit über 70 Jahren tot sind oder
  die alte Volksweisen bzw. Stücke vor 1700 sind. Lieder oder Strophen mit unklarer Herkunft sind
  bewusst nicht enthalten (siehe `docs/notizen.md`). Melodien abgeglichen mit dem Liederbuch auf
  de.wikibooks.org.
- Schriften: Bravura, EB Garamond und Source Sans 3 unter der SIL Open Font License 1.1
  (Lizenztexte in `heft/fonts/`, für die App in `app/public/fonts/`). Die App nutzt nur EB Garamond und
  übernimmt einzelne Bravura-Zeichen als Umrisse.
