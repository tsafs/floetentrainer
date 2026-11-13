# Flötentrainer

Übungsmaterial für Sopranblockflöte in C mit barocker Griffweise (Doppellöcher bei 6 und 7).

- **`heft/`** – Liederheft zum Ausdrucken (A4, schwarz-weiß): Grifftabelle, Noten lesen, erste Übungen,
  Tonleitern und Lieder. Das fertige PDF liegt in `heft/pdf/`.
- **`docs/`** – Übergabe, Notizen und der Auftrag für die geplante Übungs-App.

## Heft neu bauen

Voraussetzungen: Python 3 mit Pillow (`pip install -r heft/requirements.txt`), Node.js mit Playwright
(`cd heft && npm install`, Chromium über Playwright).

```bash
heft/bauen.sh
```

Der Notensatz ist selbst geschrieben (`heft/engrave.py`): Noten, Balken, Bögen, Atemzeichen und die
Griffbilder werden als SVG gezeichnet, Chromium druckt daraus das PDF. Die Lieder stehen in
`heft/songs.py` in einer kurzen Textnotation (Erklärung oben in der Datei).

## Rechte

- Code: MIT-Lizenz (siehe `LICENSE`).
- Lieder: Es sind nur Melodien und Texte aufgenommen, deren Urheber seit über 70 Jahren tot sind oder
  die alte Volksweisen bzw. Stücke vor 1700 sind. Lieder oder Strophen mit unklarer Herkunft sind
  bewusst nicht enthalten (siehe `docs/notizen.md`). Melodien abgeglichen mit dem Liederbuch auf
  de.wikibooks.org.
- Schriften: Bravura, EB Garamond und Source Sans 3 unter der SIL Open Font License 1.1
  (Lizenztexte in `heft/fonts/`).
