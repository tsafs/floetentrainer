// Wertung beim Mitspielen eines Lieds: aus Messungen (Frames wie beim Üben, ./judge.ts) wird je Ton
// des Zeitplans „getroffen“ oder „nicht getroffen“. Rein rechnerisch, ohne Mikrofon und Oberfläche.
//
// Zwei Arten:
// - Warte-Modus (WaitFollower): Die aktuelle Note bleibt stehen, bis ihr Ton kurz stabil erklingt.
//   Wer vorher deutlich länger einen anderen Ton spielt, bekommt die Note rot, kommt aber trotzdem weiter.
// - Takt-Modus (BeatFollower): Die Zeit läuft im Tempo; jede Note wird nach ihrem Ende gewertet
//   (mittlerer Teil der Note bzw. Einsatz um den Notenbeginn, siehe unten).
// Pausen sind im Zeitplan keine Töne und fallen damit von selbst heraus; Haltebögen sind dort schon
// ein Ton.
//
// Robustere Regeln (Befund am echten Gerät vom 14.11.2026: Android-Handy, günstige Sopranflöte etwa
// 30 Cent zu tief, erwachsene Anfängerin; „Im Takt“ fast alles rot, „Wartet auf mich“ oft rot).
// Vorbild sind Gesangsspiele (Quelltext von UltraStar Deluxe und Performous): Sie werten nach dem
// nächsten Halbton, falten Oktaven, werten nach Anteil der Dauer und gleichen eine einstellbare
// Eingangs-Verzögerung aus (UltraStar Standard 140 ms, Performous 90 ms).
// - Toleranz = nächster Halbton: Ein Ton zählt als Zielton, wenn er näher am Zielton liegt als an
//   jedem Nachbarton (|Abweichung| < 50 Cent) – relativ zur Lage dieses Tons auf *ihrer* Flöte
//   (Flötenprofil, ./flute-profile.ts; für ungemessene Töne der Median der gemessenen, sonst 0). Das
//   Profil wird während des Durchgangs je Ton langsam nachgeführt (LiveTuning). Die Toleranz aus den
//   Einstellungen gilt nur noch für die Übung und das Stimmgerät.
// - Klarheit ab 0,85 statt 0,9 (nur Mitspielen): Eine günstige Flöte klingt hauchig. Synthetisch
//   gemessen (Flötenklang mit Obertönen, weißes Rauschen und tiefes Atemgeräusch, 1024 Samples): Bei
//   sehr starkem Rauschen fällt die Klarheit eines Flötentons auf etwa 0,86 – mit 0,9 käme dann kein
//   einziger Frame durch, mit 0,85 neun von zehn; die wenigen falschen Werte darunter sind
//   Oktavfehler (zählen nicht) und Einzelwerte (Median und Nachbarprüfung entfernen sie). Reines
//   Rauschen oder Atem ohne Ton erreicht im Bereich 480–2300 Hz nie 0,85 (je 400 Versuche).
//   Einschwing-Frames („Chiff“) liegen bei beiden Schwellen darunter; sie zählen nicht gegen die Note.
//
// Neuer Einsatz (nur Warte-Modus, für Tonwiederholungen): Ein Ton gilt als neu angestoßen nach
// - einer Unterbrechung von mindestens reattackGapMs (40 ms) ohne gültigen Ton (Stille, zu leise,
//   unklar, außerhalb des Bereichs) oder mit einem anderen Ton, oder
// - einem Lautstärke-Einbruch (falls Frames rms mitbringen): unter die Hälfte des bisherigen
//   Höchstwerts dieses Tons und danach wieder deutlich lauter (mindestens das 1,5-fache des Tiefpunkts).
// Begründung: Frames kommen alle 25 ms; 40 ms verlangen also mindestens zwei Aussetzer in Folge, ein
// einzelner Messfehler mitten im gehaltenen Ton zählt nicht. Beim Anstoßen mit der Zunge bricht
// das Signal meist kürzer ein, als das Messfenster von pitchy (≈ 21 ms, ./mic.ts) auflöst – dann
// bleibt die Tonhöhe erkennbar, aber die Lautstärke sinkt deutlich; dafür ist der Einbruch-Weg da.
// Das Wiederansteigen ist nötig, damit ein bloßes Leiserwerden (Ausklingen) keinen Einsatz vortäuscht.
//
// Glättung: Beide Arten schicken die Frames zuerst durch den Glätter (./smooth.ts), knapp eingestellt:
// nur ein Median über 3 Frames (≈ 75 ms, Ausgabe 25 ms später), keine Zeitkonstante. Das entfernt
// einzelne Ausreißer (Oktavsprung, Nachbarton), lässt aber auch Sechzehntel durch. Vor dem Median
// prüft der Glätter, ob ein Frame zu einem Nachbarn passt: Übergangswerte beim schnellen Tonwechsel
// (gis¹ zwischen g¹ und a¹) kommen als „kein Ton“ an. Ein einzelner Frame ohne gültigen Ton zwischen
// zwei gleichen Tönen wird überbrückt. Die geglätteten Frames behalten ihren Zeitpunkt; der Median
// verschiebt keinen Tonwechsel, deshalb braucht der Takt-Modus keinen zusätzlichen Ausgleich.
//
// Metronom-Klicks (Takt-Modus ohne Kopfhörer kommen sie aus dem Lautsprecher, gleich neben dem
// Mikrofon): Sie sind keine Rauschimpulse, sondern kurze Sinus-Töne (1250 bzw. 1900 Hz, ≈ 40 ms
// abklingend, ./flute-synth.ts). pitchy erkennt sie mit voller Klarheit, 1250 Hz liegt sogar fast genau
// auf es² der Flöte. Deshalb fängt ClickFilter höchstens zwei Frames lange „Töne“ auf der Höhe eines
// Klicks ab (sie gelten als unklar); ein echter Ton auf dieser Höhe klingt länger und geht durch.
//
// Schleife: Beide Arten werten je Durchgang getrennt (Ergebnis je Durchgang). Die Liedseite nutzt die
// Schleife seit der Nachsteuerung vom 14.11.2026 nicht mehr; die Wertung kann es weiterhin.

import { freqToWrittenMidi } from "../music/notes";
import type { Settings } from "../store/data";
import type { Timeline } from "../songs/timeline";
import { CLICK_ACCENT_FREQ, CLICK_FREQ } from "./flute-synth";
import { correctPitch, LiveTuning } from "./flute-profile";
import { DEFAULT_JUDGE, type Frame, type Heard } from "./judge";
import { Smoother, type SmoothedFrame } from "./smooth";

export interface FollowConfig {
  tuning: number;
  /** Zielton: näher als so viele Cent (an der eigenen Lage des Tons auf dieser Flöte); 50 = nächster Halbton */
  toleranceCents: number;
  minClarity: number;
  /** Ein Oktavfehler nach unten zählt im Warte-Modus nur bei so hoher Klarheit als falsch. */
  octaveClarity: number;
  minFreq: number;
  maxFreq: number;
  /** Warte-Modus: so lange muss der Zielton stabil sein */
  holdMs: number;
  /** Warte-Modus: so lange muss ein falscher Ton stabil sein (deutlich länger als ein Fingerwechsel) */
  wrongHoldMs: number;
  /** Warte-Modus: ein falscher Ton muss so viele Cent über der Halbton-Grenze liegen (keine scharfe Kante) */
  wrongMarginCents: number;
  /** Warte-Modus: Unterbrechung, ab der ein neuer Einsatz erkannt wird */
  reattackGapMs: number;
  /** Warte-Modus: Lautstärke-Einbruch unter diesen Anteil des Höchstwerts … */
  reattackDip: number;
  /** … und danach wieder mindestens um diesen Faktor über dem Tiefpunkt = neuer Einsatz */
  reattackRise: number;
  /** Takt-Modus: Verzögerung von Mikrofon und Erkennung in ms (Frames werden so viel früher einsortiert) */
  latencyMs: number;
  /** Takt-Modus: so viel vom Notenbeginn wird nicht gewertet (Einsatz, höchstens 30 % der Note) … */
  headMs: number;
  /** … und dieser Anteil am Ende (Zungen-Lücke vor dem nächsten Ton) */
  tailShare: number;
  /** Takt-Modus: Anteil des Zieltons an der gewerteten Zeit (Zielton + anderer Ton + Stille) */
  minShare: number;
  /** Takt-Modus: mindestens so viele ms Zielton (bei sehr kurzem gewertetem Teil höchstens 80 % davon) */
  minHitMs: number;
  /** Takt-Modus: ein Einsatz des Zieltons so nah am Notenbeginn (±; zu früh höchstens eine halbe, zu spät eine ganze Note) … */
  onsetWindowMs: number;
  /** … der so lange hält, macht die Note ebenfalls grün */
  onsetHoldMs: number;
  /** Takt-Modus: übliches Frame-Intervall in ms (Mikrofon: 25); größere Lücken zählen nur bis 2×. */
  frameMs: number;
  /** Takt-Modus: Frequenzen der Metronom-Klicks (Hz) – so kurze Töne dort sind Klicks, kein Spiel */
  clickFreqs: number[];
  /** … „auf der Höhe eines Klicks“ heißt: höchstens so viele Cent daneben … */
  clickCents: number;
  /** … und höchstens so viele Frames lang */
  clickFrames: number;
  /** Glättung (./smooth.ts): Median über so viele Frames (ungerade, 1 = keiner) … */
  medianFrames: number;
  /** … und Zeitkonstante in ms (0 = keine) */
  tauMs: number;
  /** Stabilitätsprüfung vor dem Median (./smooth.ts): Nachbar höchstens so viele Cent entfernt; 0 = aus */
  stableCents: number;
}

/** Eingangs-Verzögerung (Mikrofon und Erkennung) ohne Abgleich am Gerät */
export const DEFAULT_INPUT_LATENCY = 120;
/**
 * … mit Kopfhörern (noch nicht abgeglichen): 200 ms. Bluetooth-Kopfhörer mit eigenem Mikrofon (Headset)
 * verzögern den Eingang zusätzlich um typisch 100–200 ms, und manche Browser melden ihre
 * Ausgabe-Verzögerung zu knapp. Mit Kabel-Kopfhörern (Mikrofon des Handys) sind 200 ms um etwa 80 ms zu
 * viel – sie erscheint dann etwas zu früh, was Einsatz-Fenster (±120 ms) und Anteilsregel gut vertragen.
 */
export const DEFAULT_HEADPHONE_LATENCY = 200;

/**
 * Standardwerte.
 * - Toleranz 50 Cent = nächster Halbton (siehe Kopfkommentar), Klarheit 0,85, Frequenzbereich und
 *   Oktavregel wie beim Üben.
 * - Warte-Modus: Zielton 120 ms stabil (Achtel bei 100 Schlägen dauern 300 ms, die Note muss deutlich
 *   vorher grün werden); ein falscher Ton erst nach 250 ms und 10 Cent jenseits der Halbton-Grenze –
 *   ein Fingerwechsel (Übergangsklang) dauert auf der Blockflöte typisch 20–80 ms.
 * - Takt-Modus, Verzögerung 120 ms statt bisher 50: Gemessen wurde die Mikrofon-Eingangs-Verzögerung
 *   bisher nirgends (AnalyserNode im 25-ms-Takt, Zeitstempel performance.now); auf Android liegt sie
 *   samt Puffern typisch bei 80–200 ms, Gesangsspiele nehmen 90–140 ms. Ein Abgleich am Gerät
 *   (Verzögerung abgleichen, ./latency.ts) speichert den echten Wert (settings.inputLatencyMs). Die
 *   Ausgabe der Klicks kommt nicht hierher: Die Oberfläche legt startMs auf den Zeitpunkt, zu dem sie den
 *   Zeitplan-Beginn *hört* (outputClock, ./song-player.ts).
 * - Gewertet wird je Note nur der mittlere Teil: die ersten 60 ms (Einsatz, „Chiff“; höchstens 30 % der
 *   Note) und die letzten 20 % (Zungen-Lücke) nicht. Unklare und fehlende Frames zählen dort weder für
 *   noch gegen die Note, Stille und andere Töne schon. Getroffen, wenn der Zielton mindestens 38 % davon
 *   ausmacht und mindestens 40 ms erkannt wurde – oder wenn der Zielton höchstens 120 ms vor oder nach dem
 *   Notenbeginn einsetzt (bei kurzen Noten zu früh höchstens eine halbe, zu spät eine ganze Note) und mindestens 40 ms hält (so gehen auch Sechzehntel bis ♩ = 120, die etwas zu
 *   früh oder spät kommen). Rot also nur, wenn überwiegend ein anderer Ton oder gar nichts kam.
 * - Median über 3 Frames statt 5 wie beim Üben: Schnelle Noten (Sechzehntel ≈ 125 ms) sollen erkannt
 *   werden, und ein Ausreißer kostet hier höchstens die kurze Haltedauer bzw. 25 ms erkannte Zeit.
 */
export const DEFAULT_FOLLOW: FollowConfig = {
  tuning: DEFAULT_JUDGE.tuning,
  toleranceCents: 50,
  minClarity: 0.85,
  octaveClarity: DEFAULT_JUDGE.octaveClarity,
  minFreq: DEFAULT_JUDGE.minFreq,
  maxFreq: DEFAULT_JUDGE.maxFreq,
  holdMs: 120,
  wrongHoldMs: 250,
  wrongMarginCents: 10,
  reattackGapMs: 40,
  reattackDip: 0.5,
  reattackRise: 1.5,
  latencyMs: DEFAULT_INPUT_LATENCY,
  headMs: 60,
  tailShare: 0.2,
  minShare: 0.38,
  minHitMs: 40,
  onsetWindowMs: 120,
  onsetHoldMs: 40,
  frameMs: 25,
  clickFreqs: [CLICK_FREQ, CLICK_ACCENT_FREQ],
  clickCents: 40,
  clickFrames: 2,
  medianFrames: 3,
  tauMs: 0,
  stableCents: DEFAULT_JUDGE.stableCents,
};

/** Grenzen der Eingangs-Verzögerung (Abgleich und Schieber) */
export const LATENCY_MIN = 0;
export const LATENCY_MAX = 400;

/** Verzögerung für den jetzigen Kopfhörer-Schalter: abgeglichen oder Standard */
export function inputLatency(s: Pick<Settings, "inputLatencyMs" | "headphones">): { ms: number; calibrated: boolean } {
  const v = s.headphones ? s.inputLatencyMs.headphones : s.inputLatencyMs.speaker;
  if (v !== null) return { ms: v, calibrated: true };
  return { ms: s.headphones ? DEFAULT_HEADPHONE_LATENCY : DEFAULT_INPUT_LATENCY, calibrated: false };
}

/**
 * Was aus den App-Einstellungen übernommen wird: Stimmton und Eingangs-Verzögerung (passend zum
 * Kopfhörer-Schalter, abgeglichen oder Standard). Toleranz und Haltedauer der Einstellungen gelten fürs
 * Üben, nicht hier.
 */
export function followConfig(s: Pick<Settings, "tuningHz" | "inputLatencyMs" | "headphones">): Partial<FollowConfig> {
  return { tuning: s.tuningHz, latencyMs: inputLatency(s).ms };
}

/** Wertung einer Note im Warte-Modus */
export interface WaitNoteResult {
  /** grün: getroffen, ohne vorher einen anderen Ton stabil zu spielen */
  ok: boolean;
  /** bei ok = false: der zuerst gespielte falsche Ton (notierte MIDI-Nummer) */
  wrongMidi?: number;
  /** mittlere Abweichung des Zieltons vom Stimmton (Cent), für die Diagnose */
  cents?: number;
}

/** Warum eine Note im Takt-Modus grün bzw. rot wurde */
export type BeatReason = "anteil" | "einsatz" | "anderer-ton" | "nichts" | "zu-kurz";

/** Wertung einer Note im Takt-Modus */
export interface BeatNoteResult {
  ok: boolean;
  /** Anteil der ganzen Notendauer, in dem ihr Ton erkannt wurde (0–1) */
  coverage: number;
  reason: BeatReason;
  /** gewerteter (mittlerer) Teil der Note in ms und darin: Zielton, anderer Ton, Stille */
  partMs: number;
  targetMs: number;
  otherMs: number;
  silentMs: number;
  /** Einsatz des Zieltons relativ zum Notenbeginn (ms, nach Verzögerungsausgleich); null ohne */
  onsetMs: number | null;
  /** mittlere Abweichung des Zieltons vom Stimmton (Cent); null ohne Zielton */
  cents: number | null;
  /** am häufigsten erkannter anderer Ton (notierte MIDI-Nummer) */
  otherMidi: number | null;
}

/** Zusammenfassung eines Durchgangs */
export interface FollowSummary {
  hits: number;
  /** Zahl der gewerteten Noten */
  total: number;
  /** alle Noten des Zeitplans gewertet (nicht vorzeitig beendet) */
  complete: boolean;
}

/** Was ein Follower je geglättetem Frame gesehen hat (für die Diagnose-Aufnahme) */
export interface JudgedFrame {
  t: number;
  /** geglättete Frequenz (null: kein gültiger Ton) */
  freq: number | null;
  filled?: boolean;
  unstable?: boolean;
  click?: boolean;
  /** gehörter Ton dieser Flöte und Abstand dazu (Cent) */
  midi?: number;
  cents?: number;
  /** Note, auf die sich die Wertung bezieht (Index im Zeitplan) */
  note?: number;
  /** Einordnung: Zielton, anderer Ton, Oktave, alter (gehaltener) Ton, unklar, Stille */
  cls?: "ziel" | "anders" | "oktave" | "alt" | "unklar" | "still";
}

/** Treffer und Gesamtzahl. results[i] gehört zu tl.tones[i]; fehlende Einträge (nicht gewertet) zählen nicht. */
export function summarize(tl: Timeline, results: ({ ok: boolean } | undefined)[]): FollowSummary {
  let hits = 0;
  let total = 0;
  results.forEach((r, i) => {
    if (!r || !tl.tones[i]) return;
    total++;
    if (r.ok) hits++;
  });
  return { hits, total, complete: total === tl.tones.length };
}

// ---------------------------------------------------------------- gemeinsame Bausteine

function isValid(cfg: FollowConfig, f: Frame): f is Frame & { freq: number } {
  return f.freq !== null && f.clarity >= cfg.minClarity && f.freq >= cfg.minFreq && f.freq <= cfg.maxFreq;
}

/** Unter dieser Lautstärke gilt ein Frame als Stille (wie die Schwelle des Mikrofons, ./mic.ts) */
const SILENT_RMS = 0.006;

/** Klingt in einem Frame ohne gültigen Ton trotzdem etwas (unklar statt still)? */
function sounding(f: SmoothedFrame & { click?: boolean }): boolean {
  return f.freq !== null || !!f.unstable || !!f.click || (f.rms ?? 0) >= SILENT_RMS;
}

/**
 * Fängt Metronom-Klicks ab (siehe Kopfkommentar): Frames auf der Höhe eines Klicks werden zurückgehalten;
 * bleibt es bei höchstens clickFrames, kommen sie als unklar heraus (click), sonst unverändert.
 */
export class ClickFilter {
  private held: SmoothedFrame[] = [];
  private pass = false;

  constructor(private cfg: Pick<FollowConfig, "clickFreqs" | "clickCents" | "clickFrames">) {}

  private clicky(f: Frame): boolean {
    const freq = f.freq;
    return freq !== null && this.cfg.clickFreqs.some((c) => Math.abs(1200 * Math.log2(freq / c)) <= this.cfg.clickCents);
  }

  push(f: SmoothedFrame): (SmoothedFrame & { click?: boolean })[] {
    if (!this.cfg.clickFreqs.length) return [f];
    if (this.clicky(f)) {
      if (this.pass) return [f];
      this.held.push(f);
      if (this.held.length <= this.cfg.clickFrames) return [];
      this.pass = true;
      const out = this.held;
      this.held = [];
      return out;
    }
    this.pass = false;
    const out = this.release();
    out.push(f);
    return out;
  }

  /** Zurückgehaltenes ausgeben (am Ende) */
  flush(): (SmoothedFrame & { click?: boolean })[] {
    return this.release();
  }

  private release(): (SmoothedFrame & { click?: boolean })[] {
    const out = this.held.map((h) => ({ ...h, freq: null, click: true }));
    this.held = [];
    return out;
  }
}

interface Segment {
  midi: number;
  /** Zeitpunkt des Einsatzes (ms) */
  start: number;
  minClarity: number;
  /** höchste Lautstärke seit dem Einsatz bzw. bis zum Einbruch */
  peak: number;
  /** Tiefpunkt während eines Lautstärke-Einbruchs, sonst null */
  trough: number | null;
}

/** Zerlegt die Frames in Toneinsätze (siehe Kopfkommentar, „neuer Einsatz“). */
class Onsets {
  seg: Segment | null = null;
  private prev: Segment | null = null;
  private gapStart: number | null = null;

  constructor(private cfg: FollowConfig) {}

  /** Gültiger Frame: aktualisiert den Einsatz und gibt ihn zurück. */
  push(f: Frame, midi: number): Segment {
    const cfg = this.cfg;
    const interrupted = this.gapStart !== null && f.t - this.gapStart >= cfg.reattackGapMs;
    this.gapStart = null;
    const rms = f.rms;
    let seg = this.seg;
    if (!seg || interrupted) {
      seg = this.begin(midi, f);
      this.prev = null;
    } else if (seg.midi !== midi) {
      // Kurzer Ausreißer auf einen anderen Ton mitten im gehaltenen Ton: wie ein kurzer Aussetzer
      // behandeln, der vorige Einsatz läuft weiter.
      if (this.prev && this.prev.midi === midi && f.t - seg.start < cfg.reattackGapMs) {
        seg = this.prev;
        this.prev = null;
      } else {
        this.prev = seg;
        seg = this.begin(midi, f);
      }
    } else if (rms !== undefined && !f.filled) {
      // überbrückter Einzelaussetzer (./smooth.ts): seine Lautstärke zählt nicht, wie bisher bei einer Lücke
      if (seg.trough === null) {
        if (rms < cfg.reattackDip * seg.peak) seg.trough = rms;
        else seg.peak = Math.max(seg.peak, rms);
      } else if (rms >= cfg.reattackRise * seg.trough) {
        this.prev = null;
        seg = this.begin(midi, f);
      } else {
        seg.trough = Math.min(seg.trough, rms);
      }
    }
    seg.minClarity = Math.min(seg.minClarity, f.clarity);
    this.seg = seg;
    return seg;
  }

  /** Ungültiger Frame (Stille, unklar, außerhalb des Bereichs) */
  gap(t: number): void {
    this.gapStart ??= t;
  }

  private begin(midi: number, f: Frame): Segment {
    return { midi, start: f.t, minClarity: f.clarity, peak: f.rms ?? 0, trough: null };
  }
}

// ---------------------------------------------------------------- Warte-Modus

export interface WaitOptions {
  cfg?: Partial<FollowConfig>;
  /** Abweichungen der Flöte (wird nachgeführt); Standard: leeres Profil, das sich selbst angleicht */
  tuning?: LiveTuning;
  /** nach der letzten Note wieder von vorn (neuer Durchgang) */
  loop?: boolean;
  /** Note getroffen (Index in tl.tones), danach steht index auf der nächsten */
  onNote?: (index: number, result: WaitNoteResult, pass: number) => void;
  /** erster falscher Ton für die aktuelle Note (die Note wird rot, wartet aber weiter) */
  onWrong?: (index: number, midi: number, pass: number) => void;
  /** Zielton eine Oktave zu hoch (überblasen): Hinweis, kein Fehler und kein Treffer */
  onOctave?: (index: number, pass: number) => void;
  /** Durchgang fertig (alle Noten getroffen) */
  onPass?: (summary: FollowSummary, pass: number) => void;
  /** jeder geglättete Frame mit seiner Einordnung (Diagnose) */
  onFrame?: (j: JudgedFrame) => void;
}

/**
 * Warte-Modus. Die Oberfläche schickt jeden Frame mit push(); index ist die Note, auf die gewartet
 * wird (Index in tl.tones; = tl.tones.length, wenn fertig).
 * - Getroffen: Der Zielton (nächster Halbton, relativ zu ihrer Flöte) liegt holdMs (120 ms) lang
 *   ununterbrochen an, und sein Einsatz begann nach dem Treffer der vorigen Note – bei einer
 *   Tonwiederholung braucht es also einen neuen Einsatz.
 * - Rot wird die Note nur, wenn ein anderer Ton (a) mindestens einen Halbton daneben liegt (nach der
 *   Regel des nächsten Halbtons, mit 10 Cent Abstand zur Grenze), (b) nach dem Weiterspringen neu
 *   eingesetzt hat – der gehaltene alte Ton zählt nie – und (c) wrongHoldMs (250 ms) lang stabil
 *   bleibt. Übergangsklänge beim Fingerwechsel (wenige Frames) und kurze Fehlgriffe bleiben so ohne
 *   Folgen. Ein Oktavfehler nach unten zählt nur bei hoher Klarheit (wie beim Üben).
 * - Eine Oktave zu hoch (Überblasen beim Zielton) ist kein Fehler: Es ist der richtige Griff mit zu
 *   viel Luft, und gerade Anfängerinnen passiert es oft. Er zählt aber auch nicht als Treffer – die
 *   Markierung wartet, und onOctave gibt den Hinweis „eine Oktave zu hoch – sanfter blasen“.
 */
export class WaitFollower {
  readonly cfg: FollowConfig;
  readonly tuning: LiveTuning;
  index = 0;
  pass = 0;
  /** Wertungen des laufenden Durchgangs, results[i] zu tl.tones[i] */
  results: (WaitNoteResult | undefined)[] = [];
  /** Auswertungen der abgeschlossenen Durchgänge */
  passes: FollowSummary[] = [];
  /** Wurde für die aktuelle Note schon ein falscher Ton gewertet? */
  wrongMidi: number | null = null;
  /** Wurde für die aktuelle Note schon der Oktav-Hinweis gegeben? */
  octaveHinted = false;
  done = false;
  private onsets: Onsets;
  private smoother: Smoother;
  private inTolStart: number | null = null;
  /** Zeitpunkt des letzten Treffers: nur spätere Einsätze zählen */
  private armedAt = -Infinity;
  private cents: number[] = [];
  /** zuletzt getroffener Zielton (für das Nachführen, solange sie ihn weiterhält) */
  private lastTarget: number | null = null;

  constructor(
    readonly tl: Timeline,
    private opts: WaitOptions = {},
  ) {
    this.cfg = { ...DEFAULT_FOLLOW, ...opts.cfg };
    this.tuning = opts.tuning ?? new LiveTuning();
    this.onsets = new Onsets(this.cfg);
    this.smoother = new Smoother(this.cfg);
    this.done = tl.tones.length === 0;
  }

  /** Erst ab diesem Zeitpunkt beginnende Töne werten (z. B. beim Start des Mitspielens). */
  arm(t: number): void {
    this.armedAt = t;
    this.inTolStart = null;
  }

  /** Roher Frame vom Mikrofon; gibt den gehörten (geglätteten) Ton zurück. */
  push(raw: Frame): Heard | null {
    const cfg = this.cfg;
    const f = this.smoother.push(raw);
    if (!f) return null;
    const note = this.done ? undefined : this.index;
    if (!isValid(cfg, f)) {
      this.onsets.gap(f.t);
      this.inTolStart = null;
      this.opts.onFrame?.({ t: f.t, freq: null, unstable: f.unstable, note, cls: sounding(f) ? "unklar" : "still" });
      return null;
    }
    const m = freqToWrittenMidi(f.freq, cfg.tuning);
    const hp = correctPitch(m, this.tuning.offsetOf);
    const heard: Heard = { midi: hp.midi, cents: Math.round(hp.cents), freq: f.freq };
    const seg = this.onsets.push(f, heard.midi);
    const info: JudgedFrame = { t: f.t, freq: f.freq, filled: f.filled, midi: hp.midi, cents: Math.round(hp.cents), note };
    const report = (cls: JudgedFrame["cls"]) => this.opts.onFrame?.({ ...info, cls });
    if (this.done || seg.start <= this.armedAt) {
      // Nachklang der vorigen Note bzw. Ton ohne neuen Einsatz. Hält sie die eben getroffene Note weiter,
      // sind das gute Messungen dieses Tons fürs Nachführen.
      this.inTolStart = null;
      report("alt");
      const lt = this.lastTarget;
      if (lt !== null && !f.filled && Math.abs((m - lt) * 100 - this.tuning.offsetOf(lt)) < cfg.toleranceCents) {
        this.tuning.observe(lt, (m - lt) * 100);
      }
      return heard;
    }
    const target = this.tl.tones[this.index].midi;
    const dev = (m - target) * 100 - this.tuning.offsetOf(target);
    if (Math.abs(dev) < cfg.toleranceCents) {
      report("ziel");
      if (!f.filled) {
        this.tuning.observe(target, (m - target) * 100);
        this.cents.push((m - target) * 100);
      }
      this.inTolStart ??= f.t;
      if (f.t - this.inTolStart >= cfg.holdMs) this.hit(f.t);
      return heard;
    }
    this.inTolStart = null;
    if (heard.midi === target + 12) {
      report("oktave");
      if (!this.octaveHinted && f.t - seg.start >= cfg.holdMs) {
        this.octaveHinted = true;
        this.opts.onOctave?.(this.index, this.pass);
      }
      return heard;
    }
    report(heard.midi - target === -12 ? "oktave" : "anders");
    if (this.wrongMidi !== null || heard.midi === target) return heard;
    if (Math.abs(dev) < cfg.toleranceCents + cfg.wrongMarginCents) return heard;
    if (f.t - seg.start < cfg.wrongHoldMs) return heard;
    if (heard.midi - target === -12 && seg.minClarity < cfg.octaveClarity) return heard;
    this.wrongMidi = heard.midi;
    this.opts.onWrong?.(this.index, heard.midi, this.pass);
    return heard;
  }

  /** Auswertung des laufenden Durchgangs (bisher getroffene Noten); bei Abbruch die Endauswertung */
  summary(): FollowSummary {
    return summarize(this.tl, this.results);
  }

  private hit(t: number): void {
    const result: WaitNoteResult = this.wrongMidi === null ? { ok: true } : { ok: false, wrongMidi: this.wrongMidi };
    if (this.cents.length) result.cents = Math.round(this.cents.reduce((a, b) => a + b, 0) / this.cents.length);
    const i = this.index;
    this.results[i] = result;
    this.lastTarget = this.tl.tones[i].midi;
    this.armedAt = t;
    this.inTolStart = null;
    this.wrongMidi = null;
    this.octaveHinted = false;
    this.cents = [];
    this.index++;
    this.opts.onNote?.(i, result, this.pass);
    if (this.index < this.tl.tones.length) return;
    const s = this.summary();
    this.passes.push(s);
    this.opts.onPass?.(s, this.pass);
    if (this.opts.loop) {
      this.pass++;
      this.index = 0;
      this.results = [];
    } else {
      this.done = true;
    }
  }
}

// ---------------------------------------------------------------- Takt-Modus

export interface BeatOptions {
  /** Sekunden je Viertel (tempo.ts: secPerQuarter) */
  secPerQuarter: number;
  /** Zeitpunkt (ms, Uhr der Frames) des Zeitplan-Beginns, also nach dem Einzählen */
  startMs: number;
  cfg?: Partial<FollowConfig>;
  /** Abweichungen der Flöte (wird nachgeführt); Standard: leeres Profil, das sich selbst angleicht */
  tuning?: LiveTuning;
  /** Abschnitt/Lied endlos wiederholen; Durchgänge folgen lückenlos (wie im Abspieler) */
  loop?: boolean;
  /** Note hat genug erkannte Zeit (live, noch vor ihrem Ende) */
  onHit?: (index: number, pass: number) => void;
  /** endgültige Wertung einer Note, sobald ihr Zeitfenster vorbei ist */
  onNote?: (index: number, result: BeatNoteResult, pass: number) => void;
  /** Durchgang fertig */
  onPass?: (summary: FollowSummary, pass: number) => void;
  /** jeder geglättete Frame mit seiner Einordnung (Diagnose) */
  onFrame?: (j: JudgedFrame) => void;
}

interface Anchor {
  t: number;
  g: number;
  spq: number;
}

interface NoteAcc {
  /** Viertel mit Zielton (ganze Note, für coverage) */
  q: number;
  targetMs: number;
  otherMs: number;
  silentMs: number;
  centsSum: number;
  centsMs: number;
  other: Map<number, number>;
  /** Einsatz des Zieltons relativ zum Notenbeginn (ms) */
  onset: number | null;
  hit: boolean;
}

interface PassState {
  acc: NoteAcc[];
  results: (BeatNoteResult | undefined)[];
  /** nächste noch nicht abschließend gewertete Note */
  next: number;
}

/**
 * Takt-Modus. Zeitachse: Viertel g = (t − startMs) / (secPerQuarter · 1000), Frames werden um
 * latencyMs früher einsortiert. Jeder Frame steht für ein Frame-Intervall um seinen (korrigierten)
 * Zeitpunkt. Je Note wird gezählt, wie viel davon im gewerteten (mittleren) Teil Zielton, anderer Ton
 * oder Stille war (unklare und fehlende Frames sowie die Oktave zählen nicht), dazu der erste stabile
 * Einsatz des Zieltons nahe am Notenbeginn. Regeln und Werte siehe DEFAULT_FOLLOW.
 * Gewertet wird eine Note, sobald ihr Fenster vorbei ist und ein später Einsatz nicht mehr kommen kann
 * (Notenbeginn + onsetWindowMs + onsetHoldMs + ein Frame).
 * Tonwiederholungen brauchen hier keinen neuen Einsatz: Wer eine Wiederholung durchhält, hat beide
 * getroffen (der Anteil im mittleren Teil reicht; das Tempo gibt die Notengrenzen vor).
 */
export class BeatFollower {
  readonly cfg: FollowConfig;
  readonly tuning: LiveTuning;
  pass = 0;
  /** Auswertungen der abgeschlossenen Durchgänge */
  passes: FollowSummary[] = [];
  /** Notenwertungen der abgeschlossenen Durchgänge */
  passResults: (BeatNoteResult | undefined)[][] = [];
  done = false;
  private anchor: Anchor;
  private cur: PassState;
  private lastTc: number | null = null;
  private readonly L: number;
  private smoother: Smoother;
  private clicks: ClickFilter;
  /** laufender Einsatz (gehörter Ton, Beginn und letzter Frame in korrigierter Zeit) */
  private run: { midi: number; start: number; last: number; used: boolean } | null = null;

  constructor(
    readonly tl: Timeline,
    private opts: BeatOptions,
  ) {
    this.cfg = { ...DEFAULT_FOLLOW, ...opts.cfg };
    this.tuning = opts.tuning ?? new LiveTuning();
    this.anchor = { t: opts.startMs, g: 0, spq: opts.secPerQuarter };
    this.L = tl.total;
    this.smoother = new Smoother(this.cfg);
    this.clicks = new ClickFilter(this.cfg);
    this.cur = this.newPass();
    this.done = tl.tones.length === 0 || this.L <= 0;
  }

  /** Wertungen des laufenden Durchgangs (bisher abgeschlossene Noten), results[i] zu tl.tones[i] */
  get results(): (BeatNoteResult | undefined)[] {
    return this.cur.results;
  }

  /** Stelle im Zeitplan in Vierteln zum Zeitpunkt t (ohne Verzögerungsausgleich, für die Anzeige) */
  quarterAt(t: number): number {
    const a = this.anchor;
    return a.g + (t - a.t) / (a.spq * 1000);
  }

  /**
   * Index der Note, die zum Zeitpunkt t (Uhr der Frames, ohne Ausgleich) dran ist, oder null in
   * Pausen, beim Einzählen und nach dem Ende.
   */
  toneAt(t: number): number | null {
    let g = this.quarterAt(t);
    if (g < 0) return null;
    if (this.opts.loop) g %= this.L;
    else if (g >= this.L) return null;
    const i = this.tl.tones.findIndex((n) => g >= n.start && g < n.start + n.dur);
    return i < 0 ? null : i;
  }

  /** Tempo ab Zeitpunkt t ändern, ohne dass die Stelle springt */
  setTempo(secPerQuarter: number, t: number): void {
    this.anchor = { t, g: this.quarterAt(t), spq: secPerQuarter };
  }

  /** Roher Frame vom Mikrofon; gibt den gehörten (geglätteten) Ton zurück. */
  push(raw: Frame): Heard | null {
    const f = this.smoother.push(raw);
    if (!f) return null;
    let heard: Heard | null = null;
    for (const g of this.clicks.push(f)) heard = this.take(g) ?? heard;
    return heard;
  }

  private take(f: SmoothedFrame & { click?: boolean }): Heard | null {
    const cfg = this.cfg;
    const tc = f.t - cfg.latencyMs;
    const dt = this.lastTc === null ? cfg.frameMs : Math.min(Math.max(tc - this.lastTc, 0), 2 * cfg.frameMs);
    this.lastTc = tc;
    const valid = isValid(cfg, f);
    const m = valid ? freqToWrittenMidi(f.freq!, cfg.tuning) : 0;
    const hp = valid ? correctPitch(m, this.tuning.offsetOf) : null;
    const heard: Heard | null = hp ? { midi: hp.midi, cents: Math.round(hp.cents), freq: f.freq! } : null;
    if (this.done) return heard;
    const info: JudgedFrame = { t: f.t, freq: valid ? f.freq : null, filled: f.filled, unstable: f.unstable, click: f.click };
    if (hp) {
      info.midi = hp.midi;
      info.cents = Math.round(hp.cents);
    }
    if (dt > 0) this.credit(tc - dt / 2, tc + dt / 2, valid ? m : null, sounding(f), !!f.filled, info);
    this.opts.onFrame?.(info);
    if (hp) this.onsetFrame(hp.midi, tc);
    else this.run = null;
    this.settle(this.quarterAt(tc));
    return heard;
  }

  /**
   * Vorzeitig beenden (Stopp): Noten, deren Fenster schon begonnen hat, werden mit ihrer bisher
   * erkannten Zeit gewertet, spätere nicht. Gibt die Auswertung dieses (unvollständigen)
   * Durchgangs zurück, oder null, wenn darin noch keine Note begonnen hatte. War das Lied schon zu
   * Ende, die Auswertung des letzten Durchgangs.
   */
  finish(t: number): FollowSummary | null {
    if (this.done) return this.passes[this.passes.length - 1] ?? null;
    // was Glätter und Klick-Filter noch zurückhalten, zählt mit
    for (const f of this.smoother.flush()) for (const g of this.clicks.push(f)) this.take(g);
    for (const g of this.clicks.flush()) this.take(g);
    if (this.done) return this.passes[this.passes.length - 1] ?? null;
    const g = this.quarterAt(t - this.cfg.latencyMs);
    this.settle(g, true);
    if (this.done) return this.passes[this.passes.length - 1] ?? null;
    const local = g - this.pass * this.L;
    const tones = this.tl.tones;
    while (this.cur.next < tones.length && tones[this.cur.next].start < local) this.decide(this.cur.next++);
    this.done = true;
    if (!this.cur.results.some(Boolean)) return null;
    const s = summarize(this.tl, this.cur.results);
    this.passes.push(s);
    this.passResults.push(this.cur.results);
    this.opts.onPass?.(s, this.pass);
    return s;
  }

  private newPass(): PassState {
    const acc = this.tl.tones.map(
      (): NoteAcc => ({ q: 0, targetMs: 0, otherMs: 0, silentMs: 0, centsSum: 0, centsMs: 0, other: new Map(), onset: null, hit: false }),
    );
    return { acc, results: [], next: 0 };
  }

  private get msPerQ(): number {
    return this.anchor.spq * 1000;
  }

  /** Gewerteter Teil der Note i in Vierteln (relativ zum Durchgang) */
  private part(i: number): [number, number] {
    const n = this.tl.tones[i];
    const durMs = n.dur * this.msPerQ;
    const head = Math.min(this.cfg.headMs, 0.3 * durMs) / this.msPerQ;
    return [n.start + head, n.start + n.dur * (1 - this.cfg.tailShare)];
  }

  /**
   * Frame-Intervall [ta, tb] (ms, korrigiert) gutschreiben: m gebrochene MIDI-Nummer (null ohne gültigen
   * Ton), snd: klingt trotzdem etwas (unklar statt Stille).
   */
  private credit(ta: number, tb: number, m: number | null, snd: boolean, filled: boolean, info: JudgedFrame): void {
    const ga = this.quarterAt(ta);
    const gb = this.quarterAt(tb);
    if (gb <= 0) {
      info.cls = m === null ? (snd ? "unklar" : "still") : undefined;
      return;
    }
    const msPerQ = (tb - ta) / (gb - ga);
    const local0 = ga - this.pass * this.L;
    const local1 = gb - this.pass * this.L;
    const tones = this.tl.tones;
    for (let i = this.cur.next; i < tones.length; i++) {
      const n = tones[i];
      if (n.start >= local1) break;
      if (Math.min(local1, n.start + n.dur) - Math.max(local0, n.start) <= 0) continue;
      const a = this.cur.acc[i];
      const [p0, p1] = this.part(i);
      const ovFull = Math.min(local1, n.start + n.dur) - Math.max(local0, n.start);
      const ovPart = Math.max(0, Math.min(local1, p1) - Math.max(local0, p0)) * msPerQ;
      let cls: JudgedFrame["cls"];
      if (m === null) {
        cls = snd ? "unklar" : "still";
        if (!snd) a.silentMs += ovPart;
      } else {
        const nominal = (m - n.midi) * 100;
        const dev = nominal - this.tuning.offsetOf(n.midi);
        if (Math.abs(dev) < this.cfg.toleranceCents) {
          cls = "ziel";
          a.q += ovFull;
          a.targetMs += ovPart;
          a.centsSum += nominal * ovFull;
          a.centsMs += ovFull;
          if (!filled) this.tuning.observe(n.midi, nominal);
        } else if (Math.abs(Math.round(nominal / 100)) === 12) {
          cls = "oktave";
        } else {
          cls = "anders";
          a.otherMs += ovPart;
          const r = Math.round(m);
          a.other.set(r, (a.other.get(r) ?? 0) + ovPart);
        }
      }
      if (info.note === undefined) {
        info.note = i;
        info.cls = cls;
      }
      if (!a.hit && this.enough(i)) {
        a.hit = true;
        this.opts.onHit?.(i, this.pass);
      }
    }
    // Schleife: Der Teil des Intervalls hinter dem Durchgangsende gehört schon zum nächsten – aber nur
    // dieser Teil: Lag das ganze Intervall schon dahinter (Frame-Lücke über die Grenze, z. B. ein
    // ruckelnder Hauptthread), beginnt es nicht an der Grenze, sonst würde Ungehörtes gutgeschrieben.
    if (this.opts.loop && local1 > this.L) {
      const pass = this.pass;
      this.settle((pass + 1) * this.L, true);
      if (this.pass > pass) this.credit(Math.max(ta, this.anchorTimeOf(this.pass * this.L)), tb, m, snd, filled, info);
    }
  }

  /** Gültiger Frame mit gehörtem Ton midi zur korrigierten Zeit tc: Einsätze verfolgen */
  private onsetFrame(midi: number, tc: number): void {
    const cfg = this.cfg;
    let r = this.run;
    if (!r || r.midi !== midi || tc - r.last > 2 * cfg.frameMs + 1) r = this.run = { midi, start: tc, last: tc, used: false };
    r.last = tc;
    if (r.used || r.last - r.start + cfg.frameMs < cfg.onsetHoldMs) return;
    // dem nächstgelegenen passenden Notenbeginn zuordnen (höchstens einer je Einsatz)
    const tones = this.tl.tones;
    let best = -1;
    let bestD = Infinity;
    for (let i = this.cur.next; i < tones.length; i++) {
      const n = tones[i];
      const d = r.start - this.anchorTimeOf(this.pass * this.L + n.start);
      if (d < -cfg.onsetWindowMs) break;
      // zu früh bei kurzen Noten höchstens eine halbe Note (sonst gälte ein eine Sechzehntel zu früh
      // gespielter Ton für die nächste Note); zu spät bis onsetWindowMs, höchstens eine ganze Note – der
      // erste klare Frame kommt wegen des unklaren Einsatzes („Chiff“) ohnehin etwas später
      const durMs = n.dur * this.msPerQ;
      const win = d < 0 ? Math.min(cfg.onsetWindowMs, 0.5 * durMs) : Math.min(cfg.onsetWindowMs, durMs);
      if (n.midi !== midi || this.cur.acc[i].onset !== null || Math.abs(d) > win) continue;
      if (Math.abs(d) < Math.abs(bestD)) {
        best = i;
        bestD = d;
      }
    }
    r.used = true;
    if (best < 0) return;
    const a = this.cur.acc[best];
    a.onset = bestD;
    if (!a.hit && this.enough(best)) {
      a.hit = true;
      this.opts.onHit?.(best, this.pass);
    }
  }

  /** ms-Zeitpunkt zu einer Stelle g (Umkehrung von quarterAt) */
  private anchorTimeOf(g: number): number {
    const a = this.anchor;
    return a.t + (g - a.g) * a.spq * 1000;
  }

  private shareOk(i: number): boolean {
    const a = this.cur.acc[i];
    const [p0, p1] = this.part(i);
    const partMs = (p1 - p0) * this.msPerQ;
    const need = Math.min(this.cfg.minHitMs, 0.8 * partMs);
    const base = a.targetMs + a.otherMs + a.silentMs;
    return a.targetMs >= need - 1e-6 && a.targetMs >= this.cfg.minShare * base - 1e-6;
  }

  private enough(i: number): boolean {
    return this.shareOk(i) || this.cur.acc[i].onset !== null;
  }

  private decide(i: number): void {
    const n = this.tl.tones[i];
    const a = this.cur.acc[i];
    const [p0, p1] = this.part(i);
    const share = this.shareOk(i);
    const ok = share || a.onset !== null;
    let reason: BeatReason;
    if (share) reason = "anteil";
    else if (ok) reason = "einsatz";
    else if (a.otherMs > a.targetMs && a.otherMs >= a.silentMs) reason = "anderer-ton";
    else if (a.targetMs === 0 && a.otherMs === 0) reason = "nichts";
    else reason = "zu-kurz";
    let otherMidi: number | null = null;
    let most = 0;
    for (const [k, v] of a.other) if (v > most) [otherMidi, most] = [k, v];
    const result: BeatNoteResult = {
      ok,
      coverage: Math.min(1, a.q / n.dur),
      reason,
      partMs: Math.round((p1 - p0) * this.msPerQ),
      targetMs: Math.round(a.targetMs),
      otherMs: Math.round(a.otherMs),
      silentMs: Math.round(a.silentMs),
      onsetMs: a.onset === null ? null : Math.round(a.onset),
      cents: a.centsMs > 0 ? Math.round(a.centsSum / a.centsMs) : null,
      otherMidi,
    };
    this.cur.results[i] = result;
    this.opts.onNote?.(i, result, this.pass);
  }

  /**
   * Alle Noten abschließend werten, deren Fenster vor der Stelle g (Viertel) zu Ende ist und deren
   * Einsatz-Fenster vorbei ist (now: ohne auf späte Einsätze zu warten, z. B. beim Stopp).
   */
  private settle(g: number, now = false): void {
    const tones = this.tl.tones;
    const cfg = this.cfg;
    const waitQ = (cfg.onsetWindowMs + cfg.onsetHoldMs + cfg.frameMs) / this.msPerQ;
    while (!this.done) {
      const local = g - this.pass * this.L;
      while (this.cur.next < tones.length) {
        const n = tones[this.cur.next];
        if (n.start + n.dur > local + 1e-9) break;
        if (!now && n.start + waitQ > local + 1e-9) break;
        this.decide(this.cur.next++);
      }
      if (this.cur.next < tones.length || local < this.L - 1e-9) return;
      const s = summarize(this.tl, this.cur.results);
      this.passes.push(s);
      this.passResults.push(this.cur.results);
      this.opts.onPass?.(s, this.pass);
      if (!this.opts.loop) {
        this.done = true;
        return;
      }
      this.pass++;
      this.cur = this.newPass();
      this.run = null;
    }
  }
}
