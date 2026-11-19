# Tonerkennung beim Mitspielen: Recherche und Umbau (19.11.2026)

## Anlass

Rückmeldung am 19.11.2026: „Der Flötentrainer erkennt meine Töne immer noch nicht gut, vor allem wenn ich
schneller spiele – bei Vierteln, vor allem bei Achteln. Von einem hohen zu einem tieferen Ton stockt es
besonders. Etwa 25–30 % der Töne werden falsch erkannt.“

## Recherche

### Wie bewährte freie Programme messen

| Programm | Fenster / Schritt | Verfahren |
|---|---|---|
| aubio (`aubionotes`) | Tonhöhe 2048, Schritt 256 (≈ 5,8 ms) | Einsatz-Erkennung (HFC); Note = Median der Tonhöhen ab dem Einsatz nach 6 Schritten |
| Performous | FFT 1024, Schritt 200 (≈ 4 ms) | Obertonreihen; ein Ton zählt nach 2 Schritten |
| pYIN / Tony | 2048, Schritt 256 | HMM je Ton mit Zuständen Einschwingen / stabil / still; beim Einschwingen wird eine unsaubere Tonhöhe erwartet |
| Essentia | 2048, Schritt 128–256 | pYIN, Melodia (Konturen) |

Alle messen alle 3–6 ms. Die App maß bis jetzt alle 25 ms per `setInterval` am `AnalyserNode`. Dabei
gingen zwischen zwei Messungen Samples verloren (Fenster 21 ms, Abstand 25 ms). Wenn der Hauptthread
ruckelte, kamen Messungen verspätet oder gar nicht. Bei einer Achtel blieben 3–4 gewertete Messungen, und
eine einzige schlechte entschied.

### Wie Lern-Apps werten

Simply Piano (JoyTunes, „MusicSense“) prüft laut einem Beitrag eines früheren Entwicklers je Messung die
Aktivität der Tasten, die *erwartet* werden. Yousician-Patente (Klapuri) vergleichen das Gespielte mit den
Parametern des Stücks. Beide werten also notengestützt und raten nicht frei unter allen Tönen.
Forschungssysteme zur Partiturverfolgung arbeiten ähnlich, etwa Antescofo und Music Plus One: Wahrscheinlichkeiten bei den erwarteten
Tonhöhen, zeitlich geglättet. Patente und Blogbeitrag konnten wir nur als Ausschnitte lesen.

### Kleine KI-Modelle (für später)

| Modell | Größe | Takt | Lizenz | Browser | Haken |
|---|---|---|---|---|---|
| **SwiftF0** (2025) | 14–96 Tsd. Parameter, < 1 MB | 16 ms | MIT | ONNX Runtime Web (Demo) | endgültig erst nach 176 ms; reicht nur bis 2093 Hz (notiert c³) |
| PESTO (Sony, 2023/25) | ≈ 130 Tsd. | 5–20 ms, < 10 ms Verzögerung | LGPL-3.0 | nur ONNX, VQT müsste nach JS | Aufwand |
| CREPE tiny | ≈ 0,5 Mio., ≈ 2 MB | 10 ms | MIT | TF.js / ml5 | zu schwer, bis ≈ 2 kHz |
| SPICE, basic-pitch, FCPE, RMVPE | | | | | zu grob, nicht für Echtzeit oder viel zu groß |

Keines wurde an der Blockflöte geprüft. Am ehesten käme **SwiftF0** in Frage, als zweiter Erkenner neben
MPM, verglichen an echten Aufnahmen (Testboard). Die Recherche ergab einhellig: Der größere Gewinn liegt
im Abgleich mit den Noten, nicht im Modell.

### Warum „hoch → tief“ schwerer sein kann

Diese Gründe sind abgeleitet, nicht an der Flöte gemessen.

- **MPM:** Solange das Fenster beide Töne enthält, gewinnt eher der höhere (erster Gipfel der NSDF).
- **Flöte:** Der tiefere Ton braucht weniger Luft. Mit dem Druck des hohen Tons klingt er zuerst zu hoch
  oder springt eine Oktave hinauf. Außerdem müssen mehr Löcher dicht sein.
- **Leise tiefe Töne:** Sie sind leiser und hauchiger, ihre Klarheit liegt näher an der Schwelle.

## Prüfstand (`app/tests/unit/erkennung.test.ts`)

Synthetische Blockflötentöne als Samples (`app/tests/unit/flute-signal.ts`):

- Obertöne, Atemrauschen, Zungenstoß mit „Chiff“, gebunden mit Fingerwechsel;
- Überblasen beim Abwärtsschritt, gebogene Einsätze, ungenaues Spiel ±40 ms, Nachhall;
- dazu die frühere Messung samt ruckelndem Zeitgeber (`measurePolled`).

Befund:

- **Fast alles war schon vorher grün.** Sauberer Klang, Nachhall, Überblasen, gebogene Einsätze und
  ungenaues Spiel bringen die Wertung nicht aus dem Tritt. Die realen Fehler müssen also an Dingen
  liegen, die die Synthese nicht hat. Deshalb das Testboard mit Ton (unten).
- **Harte Kante bei hauchigem Klang.** Mit starkem Atemrauschen fällt die Klarheit unter 0,85, und
  dann wird *gar nichts* mehr erkannt.
  - Rauschen 0,25: Klarheit ≈ 0,89, alles grün.
  - Rauschen 0,4: Klarheit ≈ 0,77, 0 von 48 Noten erkannt.

  Eine günstige Flöte oder leise tiefe Töne können nahe an dieser Kante liegen. Das passt zu „es stockt“
  und zu „hoch → tief“.
- **Ruckelnder Zeitgeber:** In einer Variante mit Atemrauschen (Rauschen 0,25) blieb der Warte-Modus mit
  dem neuen Glätter nach 30 von 48 Noten hängen. Der Grund war eine Lücke im Zielton, die von einem
  hängenden Zeitgeber stammte (früher: Haltedauer am Stück).

## Umbau

1. **Messung im AudioWorklet** (`app/src/audio/capture-worklet.ts`, `analyze.ts`, `mpm.ts`)
   - Lückenlos, Zeit nach Sample-Zählung, fein alle 256 Samples (≈ 5,3 ms) mit dem NSDF-Ausschnitt.
   - Der grobe 25-ms-Takt bleibt für Stimmgerät, Üben, Hören und „Flöte einstellen“.
   - Die Messung selbst ist dieselbe wie bei pitchy (`mpm.test.ts` prüft die Gleichheit).
   - Ohne AudioWorklet bleibt der frühere Weg.
2. **Lauf-Glätter mit Hinweis auf den erwarteten Ton** (`app/src/audio/run-smoother.ts`)
   - Rechnet in ms statt in Frames und ersetzt beim Mitspielen und beim Abgleich Median und
     Nachbarprüfung.
   - Läufe ab 35 ms zählen. Kürzere sind Übergangswerte oder Ausreißer, und ein kurzer Ausreißer mitten
     im Ton wird zur Lücke.
   - Lücken unter 50 ms werden überbrückt.
   - Neu: Nahe einem erwarteten Ton (±50 Cent) genügt eine Klarheit ab 0,7, wenn auch die NSDF dort
     einen Gipfel hat. Erwartet werden im Warte-Modus der Zielton, im Takt die Note samt Nachbarn.
   - Falsche Töne und Rauschen werden dadurch nicht grün (Prüfstand: ±1 und ±2 Halbtöne, nur Rauschen).
3. **Warte-Modus:** Die Haltedauer (120 ms) zählt die Zeit des Zieltons zusammen. Unklare Frames und
   Aussetzer unterbrechen sie nicht mehr, erst ein anderer Ton oder Stille.
4. **Klick-Filter** nach Zeit (70 ms statt 2 Frames).

Ergebnis im Prüfstand:

- Bei Rauschen 0,4 werden jetzt 48 von 48 Noten erkannt (vorher 0).
- Bei Rauschen 0,5 kommt der Takt-Modus je nach Obertönen auf 6 bis 48 von 48, der Warte-Modus auf 0
  bis 32 von 48 (vorher 0 bis 8).
- Alle übrigen Folgen bleiben grün.

Ob das die 25–30 % am echten Gerät behebt, zeigt erst das Testboard.

## Testboard

Einstellungen → „Testboard: Erkennung prüfen“ (`#/testboard`, Folgen in `app/src/songs/testboard.ts`):

- Viertel;
- Achtel abwärts;
- Sprünge abwärts und aufwärts;
- Tonwiederholungen;
- schneller Wechsel g–a–h;
- tiefe und hohe Töne.

Ablauf: Mitspielen (beide Arten), danach „Diagnose speichern“. **Nur hier nimmt die App den Ton mit
auf** (16 Bit in der Diagnose, `audio`; Format 2). Die Seite sagt das vorher.

Nachrechnen mit der jetzigen Wertung:

```
cd app && REPLAY=/pfad/datei.json npx vitest run tests/unit/replay.test.ts
```

Das gibt je Note aus: live in der App, nachgerechnet, Anteil unklarer Messungen, gehörte Töne. So
lassen sich Regeln und auch ein Modell wie SwiftF0 an genau ihrem Spiel vergleichen.
