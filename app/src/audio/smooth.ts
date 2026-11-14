// Glättung der gemessenen Tonhöhe, zwischen den rohen Frames des Mikrofons (./mic.ts, alle ~25 ms) und
// den Verbrauchern (Stimmgerät, Spielen-Übung, Mitspielen). Rein rechnerisch, ohne Mikrofon – testbar.
//
// Anlass (Rückmeldung vom 14.11.2026, Android-Handy, echte Sopranflöte): Der Ton „wackelt zu viel hin
// und her“, dadurch zeigt die App zu viele Fehler. Verfahren:
// 1. Gültig ist ein Frame wie bisher nur mit Klarheit ≥ minClarity und Frequenz im Bereich. Die Prüfung
//    bleibt pro Frame *vor* dem Median: unklare Frames zählen als „kein Ton“ und gehen unverändert durch.
// 2. Gültige Frames werden in eine gebrochene (klingende) MIDI-Nummer umgerechnet (0,01 = 1 Cent).
// 3. Median über medianFrames Frames, mittig um den ausgegebenen Frame (bei 5 also die zwei davor und
//    die zwei danach): entfernt Ausreißer wie einzelne Oktavsprünge, statt sie zu mitteln. Gezählt
//    werden nur die gültigen Frames desselben Toneinsatzes (siehe 5.). Bei gerader Anzahl zählt der vom
//    Mittelpunkt am weitesten entfernte nicht mit; der Wert ist so immer ein wirklich gemessener (kein
//    Mittel aus Ton und Oktave).
// 4. Danach optional exponentielle Glättung mit Zeitkonstante tauMs, über t gerechnet (unabhängig von
//    der Frame-Rate).
// 5. Neubeginn: Nach resetMs ohne gültigen Ton (Stille, zu leise, unklar) beginnt ein neuer Toneinsatz;
//    Median und Glättung greifen nicht über diese Grenze. Liegt der Median mehr als jumpCents vom
//    geglätteten Wert entfernt (klarer Tonwechsel), springt der Wert sofort dorthin, statt langsam
//    hinzugleiten. So verschmieren Töne nicht ineinander, und Tonwechsel werden nicht verzögert.
// 6. Einzelaussetzer überbrücken: Ein Frame ohne gültigen Ton (unklar, zu leise, außerhalb des Bereichs
//    – etwa ein Oktavsprung über 2300 Hz bei d²) mitten in einem Toneinsatz, also eine Lücke unter
//    resetMs, bekommt den Ton seiner Nachbarn, wenn davor und danach derselbe Ton erkannt wird (Median
//    höchstens jumpCents vom zuletzt ausgegebenen Wert). Er ist dann als `filled` markiert, hat die
//    kleinere Klarheit der beiden Nachbarn und behält seine Lautstärke. So startet ein einzelner
//    Messfehler weder Haltedauer noch Anzeige neu und unterbricht im Takt-Modus die erkannte Zeit nicht.
//    Ab resetMs ohne gültigen Ton bleibt es Stille wie bisher. Ohne Median (medianFrames 1) fehlt der
//    Blick auf den nächsten Frame; dann wird nichts überbrückt.
//
// Zeitstempel: Weil der Median mittig liegt, gibt push() jeden Frame erst aus, wenn die
// (medianFrames − 1) / 2 Frames danach da sind (bei 3 Frames 25 ms, bei 5 Frames 50 ms später). Der
// ausgegebene Frame behält aber seinen eigenen Zeitpunkt t, seine Klarheit und seine Lautstärke (rms);
// nur freq ist geglättet (bei überbrückten Frames auch die Klarheit). Ein Tonwechsel steht damit an der richtigen Stelle (Median verschiebt ihn
// nicht), Stille und Lautstärke-Einbrüche kommen in derselben Reihenfolge und mit denselben Zeiten an
// wie roh. Für den Takt-Modus heißt das: Die Verzögerung des Medians ist schon ausgeglichen, latencyMs
// bleibt die Verzögerung von Mikrofon und Erkennung.

import type { Frame } from "./judge";

export interface SmoothConfig {
  minClarity: number;
  minFreq: number;
  maxFreq: number;
  /** Median über so viele Frames (ungerade; 1 = kein Median), mittig um den ausgegebenen Frame */
  medianFrames: number;
  /** Zeitkonstante der exponentiellen Glättung in ms; 0 = keine */
  tauMs: number;
  /** so lange ohne gültigen Ton = neuer Toneinsatz (Median und Glättung beginnen neu) */
  resetMs: number;
  /** liegt der Median so weit (Cent) vom geglätteten Wert entfernt, gilt er sofort (Tonwechsel) */
  jumpCents: number;
}

/**
 * Standard: Klarheit und Bereich wie beim Üben (DEFAULT_JUDGE, ./judge.ts – hier als Zahlen, damit
 * die beiden Dateien sich nicht gegenseitig brauchen). Median über 5 Frames (≈ 125 ms), keine
 * Zeitkonstante. Neubeginn nach 50 ms ohne Ton, also zwei Aussetzern in Folge; ein einzelner
 * Messfehler mitten im Ton zählt nicht. Tonwechsel ab 70 Cent: deutlich mehr als Vibrato oder
 * Schwankungen eines gehaltenen Tons (±25–30 Cent), deutlich weniger als ein Halbton.
 */
export const DEFAULT_SMOOTH: SmoothConfig = {
  minClarity: 0.9,
  minFreq: 480,
  maxFreq: 2300,
  medianFrames: 5,
  tauMs: 0,
  resetMs: 50,
  jumpCents: 70,
};

/**
 * Stimmgerät (../ui/tuner.ts): kräftiger, hier zählt eine ruhige Anzeige mehr als Tempo. Median über
 * 5 Frames, dazu Zeitkonstante 175 ms: Vibrato um 5 Hz schrumpft so auf etwa ein Sechstel, ein langsames
 * Ziehen des Tons zeigt der Zeiger nach gut 0,2 s. Tonwechsel und Neubeginn wirken trotzdem sofort.
 */
export const TUNER_SMOOTH: Partial<SmoothConfig> = { medianFrames: 5, tauMs: 175 };

/** Hat der Frame einen gültigen Ton (Klarheit, Bereich)? */
export function pitched(cfg: Pick<SmoothConfig, "minClarity" | "minFreq" | "maxFreq">, f: Frame): f is Frame & { freq: number } {
  return f.freq !== null && f.clarity >= cfg.minClarity && f.freq >= cfg.minFreq && f.freq <= cfg.maxFreq;
}

/** Frequenz → gebrochene klingende MIDI-Nummer und zurück (unabhängig vom Stimmton) */
const toPitch = (freq: number) => 69 + 12 * Math.log2(freq / 440);
const toFreq = (p: number) => 440 * Math.pow(2, (p - 69) / 12);

interface Entry {
  f: Frame;
  /** gebrochene MIDI-Nummer, null ohne gültigen Ton */
  p: number | null;
  /** Nummer des Toneinsatzes (wächst bei jedem Neubeginn) */
  run: number;
}

/** Glätter für einen Strom von Frames; ein Exemplar je Verbraucher. */
export class Smoother {
  readonly cfg: SmoothConfig;
  /** Frames um die Ausgabestelle: bis zu half schon ausgegebene davor, dahinter die noch offenen */
  private buf: Entry[] = [];
  /** Index in buf des nächsten auszugebenden Frames */
  private next = 0;
  private readonly half: number;
  private run = 0;
  private gapStart: number | null = null;
  private lastT: number | null = null;
  private ema: { p: number; t: number; run: number } | null = null;
  /** zuletzt ausgegebener Ton (für das Überbrücken) */
  private lastOut: { p: number; run: number } | null = null;

  constructor(cfg: Partial<SmoothConfig> = {}) {
    this.cfg = { ...DEFAULT_SMOOTH, ...cfg };
    this.half = Math.max(0, Math.floor((this.cfg.medianFrames - 1) / 2));
  }

  /** So viele Frames später kommt ein Frame heraus (Verzögerung in Frames, nicht in seinem t). */
  get lag(): number {
    return this.half;
  }

  /**
   * Nimmt einen rohen Frame und gibt den Frame von vor lag Frames geglättet zurück (null, solange
   * noch nicht genug Frames da sind).
   */
  push(f: Frame): Frame | null {
    const cfg = this.cfg;
    const ok = pitched(cfg, f);
    // Neubeginn nach Stille; auch, wenn länger gar keine Frames kamen (z. B. Seite kurz im Hintergrund –
    // ein einzelner verspäteter Frame, wie er bei ruckelndem Hauptthread vorkommt, zählt noch nicht)
    if (this.lastT !== null && f.t - this.lastT > 2 * cfg.resetMs) this.run++;
    else if (ok && this.gapStart !== null && f.t - this.gapStart >= cfg.resetMs) this.run++;
    this.lastT = f.t;
    if (ok) this.gapStart = null;
    else this.gapStart ??= f.t;
    this.buf.push({ f, p: ok ? toPitch(f.freq) : null, run: this.run });
    if (this.buf.length - 1 - this.next < this.half) return null;
    return this.emit();
  }

  /** Die noch offenen Frames ausgeben (am Ende eines Laufs), mit dem, was an Nachbarn da ist. */
  flush(): Frame[] {
    const out: Frame[] = [];
    while (this.next < this.buf.length) out.push(this.emit());
    return out;
  }

  private emit(): Frame {
    const c = this.next++;
    const e = this.buf[c];
    const out = this.value(c);
    // vorne nur so viele behalten, wie der Median als Vorgänger braucht
    const drop = this.next - this.half;
    if (drop > 0) {
      this.buf.splice(0, drop);
      this.next -= drop;
    }
    if (!out) return e.f;
    if (e.p !== null) return { ...e.f, freq: out.freq };
    return { ...e.f, freq: out.freq, clarity: out.clarity, filled: true };
  }

  /** Geglättete Frequenz für buf[c] (bei einem überbrückten Aussetzer samt Klarheit), null ohne Ton */
  private value(c: number): { freq: number; clarity: number } | null {
    const e = this.buf[c];
    const lo = Math.max(0, c - this.half);
    const hi = Math.min(this.buf.length - 1, c + this.half);
    let run = e.run;
    let clarity = e.f.clarity;
    if (e.p === null) {
      // Einzelaussetzer? Gültige Nachbarn davor und danach im selben Toneinsatz
      let l = c - 1;
      while (l >= lo && this.buf[l].p === null) l--;
      let r = c + 1;
      while (r <= hi && this.buf[r].p === null) r++;
      if (l < lo || r > hi || this.buf[l].run !== this.buf[r].run) return null;
      run = this.buf[r].run;
      if (!this.lastOut || this.lastOut.run !== run) return null;
      clarity = Math.min(this.buf[l].f.clarity, this.buf[r].f.clarity);
    }
    const near: { e: Entry; d: number }[] = [];
    for (let i = lo; i <= hi; i++) {
      const x = this.buf[i];
      if (x.p !== null && x.run === run) near.push({ e: x, d: Math.abs(i - c) });
    }
    if (near.length % 2 === 0) {
      // gerade Anzahl: den am weitesten entfernten weglassen (bei Gleichstand den älteren)
      let k = 0;
      for (let j = 1; j < near.length; j++) if (near[j].d > near[k].d) k = j;
      near.splice(k, 1);
    }
    near.sort((a, b) => a.e.p! - b.e.p!);
    const med = near[(near.length - 1) / 2].e;
    const cfg = this.cfg;
    // überbrückt nur, wenn danach derselbe Ton weiterklingt (kein Tonwechsel in der Lücke)
    if (e.p === null && Math.abs(med.p! - this.lastOut!.p) * 100 > cfg.jumpCents) return null;
    let p = med.p!;
    if (cfg.tauMs > 0) {
      const t = e.f.t;
      const ema = this.ema;
      if (!ema || ema.run !== run || Math.abs(p - ema.p) * 100 > cfg.jumpCents) {
        this.ema = { p, t, run };
      } else {
        const a = 1 - Math.exp(-Math.max(0, t - ema.t) / cfg.tauMs);
        ema.p += a * (p - ema.p);
        ema.t = t;
      }
      p = this.ema!.p;
    }
    this.lastOut = { p, run };
    return { freq: cfg.tauMs > 0 ? toFreq(p) : med.f.freq!, clarity };
  }
}

// ---------------------------------------------------------------- Notenname mit Hysterese

export interface NameHoldConfig {
  /** ein anderer Ton muss so lange ununterbrochen anliegen, bis der Name wechselt … */
  holdMs: number;
  /** … außer er liegt so weit (Cent) vom angezeigten Ton entfernt (Mitte zwischen zwei Tönen: 50) */
  switchCents: number;
  /** so lange ohne Ton: der nächste Ton gilt sofort */
  resetMs: number;
}

export const DEFAULT_NAME_HOLD: NameHoldConfig = { holdMs: 100, switchCents: 60, resetMs: 50 };

/**
 * Welcher Ton wird angezeigt? Für das Stimmgerät: Ein Ton genau zwischen zwei Halbtönen (z. B. fis¹
 * +50 Cent) soll den Namen nicht hin und her springen lassen. Der Name wechselt erst, wenn der neue
 * Ton holdMs anliegt oder die Abweichung über switchCents geht.
 */
export class NameHold {
  readonly cfg: NameHoldConfig;
  /** angezeigter Ton (MIDI-Nummer), null vor dem ersten Ton bzw. nach Stille */
  midi: number | null = null;
  private cand: { midi: number; since: number } | null = null;
  private gapStart: number | null = null;

  constructor(cfg: Partial<NameHoldConfig> = {}) {
    this.cfg = { ...DEFAULT_NAME_HOLD, ...cfg };
  }

  /** m: gebrochene MIDI-Nummer des (geglätteten) Tons oder null ohne Ton; gibt den angezeigten Ton zurück */
  push(m: number | null, t: number): number | null {
    if (m === null) {
      this.gapStart ??= t;
      if (t - this.gapStart >= this.cfg.resetMs) this.midi = null;
      this.cand = null;
      return this.midi;
    }
    // nach Stille (gemessen bis zum nächsten Ton, wie im Glätter) gilt der neue Ton sofort
    if (this.gapStart !== null && t - this.gapStart >= this.cfg.resetMs) this.midi = null;
    this.gapStart = null;
    const r = Math.round(m);
    if (this.midi === null || r === this.midi || Math.abs(m - this.midi) * 100 > this.cfg.switchCents) {
      this.midi = r;
      this.cand = null;
      return r;
    }
    if (!this.cand || this.cand.midi !== r) this.cand = { midi: r, since: t };
    else if (t - this.cand.since >= this.cfg.holdMs) {
      this.midi = r;
      this.cand = null;
    }
    return this.midi;
  }
}
