// Wertung beim Spielen: aus einzelnen Messungen (Tonhöhe, Klarheit) wird „richtig“ oder „falsch“.
// Rein rechnerisch, ohne Mikrofon – dadurch automatisch testbar.

import { freqToWrittenMidi } from "../music/notes";
import { Smoother } from "./smooth";

export interface Frame {
  /** Zeitpunkt in ms */
  t: number;
  /** gemessene Frequenz in Hz, null bei Stille oder zu leise */
  freq: number | null;
  /** Klarheit laut pitchy (0–1) */
  clarity: number;
  /** Lautstärke (Effektivwert des Messfensters, 0–1); optional, das Mitspielen erkennt daran neue Einsätze */
  rms?: number;
}

export interface JudgeConfig {
  tuning: number;
  toleranceCents: number;
  holdMs: number;
  minClarity: number;
  /** Ein Oktavfehler zählt nur bei so hoher Klarheit. */
  octaveClarity: number;
  minFreq: number;
  maxFreq: number;
  /** So lange ohne Ton gilt als Stille (Ende eines Toneinsatzes). */
  silenceMs: number;
  /** Frühestens so lange nach der Kartenanzeige wird gewertet. */
  armDelayMs: number;
  /** Glättung (./smooth.ts): Median über so viele Frames (ungerade, 1 = keiner) … */
  medianFrames: number;
  /** … und Zeitkonstante in ms (0 = keine) */
  tauMs: number;
}

export const DEFAULT_JUDGE: JudgeConfig = {
  tuning: 440,
  toleranceCents: 40,
  holdMs: 300,
  minClarity: 0.9,
  octaveClarity: 0.97,
  minFreq: 480,
  maxFreq: 2300,
  silenceMs: 90,
  armDelayMs: 400,
  // Median über 5 Frames (≈ 125 ms, Ausgabe 50 ms später): einzelne Ausreißer, auch zwei in Folge,
  // unterbrechen die 0,3 s Haltedauer nicht mehr. Keine Zeitkonstante – die Toleranz von ±40 Cent
  // fängt das Wackeln eines gehaltenen Tons schon ab, und die Anzeige soll Tonwechseln sofort folgen.
  medianFrames: 5,
  tauMs: 0,
};

export interface Heard {
  /** nächstliegende notierte MIDI-Nummer */
  midi: number;
  /** Abweichung von diesem Ton in Cent */
  cents: number;
  freq: number;
}

export interface JudgeOutput {
  heard: Heard | null;
  event: "correct" | "wrong" | null;
  /** bei „wrong“: der gespielte Ton */
  wrongMidi?: number;
}

interface Segment {
  midi: number;
  start: number;
  minClarity: number;
}

/**
 * Über eine ganze Sitzung bestehende Wertung; newCard() setzt den gesuchten Ton.
 * Die Frames laufen zuerst durch den Glätter (./smooth.ts); gewertet und angezeigt wird der geglättete
 * Ton. Er kommt um den halben Median später an, behält aber seinen Zeitpunkt t – Haltedauer, Einsatz
 * nach der Kartenanzeige und armDelayMs gelten also weiter in der Zeit, in der gespielt wurde.
 */
export class PlayJudge {
  cfg: JudgeConfig;
  private smoother: Smoother;
  private seg: Segment | null = null;
  private gapStart: number | null = null;
  private inTolStart: number | null = null;
  private target: number | null = null;
  private shownAt = 0;
  private done = true;
  /** Wurde für die aktuelle Karte schon ein Fehler gewertet? */
  wrongCounted = false;
  /** Fehler nicht werten (z. B. bei der Vorstellung) */
  private judgeWrong = true;

  constructor(cfg: Partial<JudgeConfig> = {}) {
    this.cfg = { ...DEFAULT_JUDGE, ...cfg };
    this.smoother = new Smoother(this.cfg);
  }

  /** Neue Karte: gesuchter Ton als notierte MIDI-Nummer. */
  newCard(targetMidi: number, t: number, opts: { judgeWrong?: boolean } = {}): void {
    this.target = targetMidi;
    this.shownAt = t;
    this.done = false;
    this.wrongCounted = false;
    this.inTolStart = null;
    this.judgeWrong = opts.judgeWrong ?? true;
  }

  /** Nicht mehr werten (Karte abgeschlossen); die Anzeige läuft weiter. */
  stop(): void {
    this.done = true;
  }

  /** Nach einem Fehler oder „Weiß nicht“: weiter auf den richtigen Ton warten, aber keinen Fehler mehr werten. */
  markWrong(): void {
    this.wrongCounted = true;
  }

  private valid(f: Frame): f is Frame & { freq: number } {
    return f.freq !== null && f.clarity >= this.cfg.minClarity && f.freq >= this.cfg.minFreq && f.freq <= this.cfg.maxFreq;
  }

  /** Roher Frame vom Mikrofon; die Ausgabe gehört zum geglätteten Frame von vor ein paar Frames. */
  push(raw: Frame): JudgeOutput {
    const f = this.smoother.push(raw);
    if (!f) return { heard: null, event: null };
    if (!this.valid(f)) {
      this.gapStart ??= f.t;
      if (f.t - this.gapStart >= this.cfg.silenceMs) this.seg = null;
      this.inTolStart = null;
      return { heard: null, event: null };
    }
    this.gapStart = null;
    const m = freqToWrittenMidi(f.freq, this.cfg.tuning);
    const midi = Math.round(m);
    const heard: Heard = { midi, cents: Math.round((m - midi) * 100), freq: f.freq };
    if (!this.seg || this.seg.midi !== midi) {
      this.seg = { midi, start: f.t, minClarity: f.clarity };
      this.inTolStart = null;
    } else {
      this.seg.minClarity = Math.min(this.seg.minClarity, f.clarity);
    }
    if (this.done || this.target === null) return { heard, event: null };

    const seg = this.seg;
    // Nur ein Toneinsatz nach der Kartenanzeige zählt (kein Nachklang der vorigen Karte).
    if (seg.start < this.shownAt) return { heard, event: null };
    const armedAt = this.shownAt + this.cfg.armDelayMs;
    if (f.t < armedAt) return { heard, event: null };

    const centsToTarget = (m - this.target) * 100;
    if (Math.abs(centsToTarget) <= this.cfg.toleranceCents) {
      this.inTolStart ??= Math.max(f.t, seg.start, armedAt);
      if (f.t - this.inTolStart >= this.cfg.holdMs) {
        this.done = true;
        return { heard, event: "correct" };
      }
      return { heard, event: null };
    }
    this.inTolStart = null;
    if (midi === this.target || this.wrongCounted || !this.judgeWrong) return { heard, event: null };
    const from = Math.max(seg.start, armedAt);
    if (f.t - from < this.cfg.holdMs) return { heard, event: null };
    const octave = Math.abs(midi - this.target) === 12;
    if (octave && seg.minClarity < this.cfg.octaveClarity) return { heard, event: null };
    this.wrongCounted = true;
    return { heard, event: "wrong", wrongMidi: midi };
  }
}
