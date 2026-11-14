// Glättung der gemessenen Tonhöhe, zwischen den rohen Frames des Mikrofons (./mic.ts, alle ~25 ms) und
// den Verbrauchern (Stimmgerät, Spielen-Übung, Mitspielen). Rein rechnerisch, ohne Mikrofon – testbar.
//
// Anlass (Rückmeldung vom 14.11.2026, Android-Handy, echte Sopranflöte): Der Ton „wackelt zu viel hin
// und her“, dadurch zeigt die App zu viele Fehler. Verfahren:
// 1. Gültig ist ein Frame wie bisher nur mit Klarheit ≥ minClarity und Frequenz im Bereich. Die Prüfung
//    bleibt pro Frame *vor* dem Median: unklare Frames zählen als „kein Ton“ und gehen unverändert durch.
// 2. Gültige Frames werden in eine gebrochene (klingende) MIDI-Nummer umgerechnet (0,01 = 1 Cent).
// 2a. Stabilitätsprüfung (Rückmeldung vom 14.11.2026: „wenn ich G, A und H schnell im Wechsel spiele,
//    wird oft GIS erkannt“): Überspannt das Messfenster einen Tonwechsel, liefert pitchy einen Wert
//    zwischen beiden Tönen (z. B. gis¹ zwischen g¹ und a¹), mit voller Klarheit. Ein gültiger Frame
//    zählt deshalb nur, wenn er mit mindestens einem direkten Nachbarn (davor oder danach, gültig, im
//    selben Toneinsatz) innerhalb von stableCents übereinstimmt; sonst gilt er als unstet und wird wie
//    ein unklarer Frame behandelt (kein Ton, ggf. von 6. überbrückt). Ausnahme: Sind beide Nachbarn
//    ungültig (Frame zwischen zwei Aussetzern), gibt es nichts zu vergleichen, und er zählt wie bisher –
//    ein Übergangswert liegt immer zwischen zwei Tönen. Ein einzelner Übergangswert
//    verschwindet so, ein echter Ton (mindestens zwei Frames) nicht; Vibrato ±30 Cent bei 5 Hz ändert
//    sich von Frame zu Frame um höchstens 24 Cent und geht durch. Der ausgegebene Frame selbst hat
//    immer beide Nachbarn (der Median wartet ohnehin auf die Frames danach); nur der jüngste Frame im
//    Median-Fenster hat noch keinen Nachfolger und zählt dort vorläufig – als einzelner Wert am Rand
//    kann er den Median nicht bestimmen. So braucht die Prüfung keinen zusätzlichen Frame Vorschau.
//    Ohne Median (medianFrames 1, „roh“) gibt es auch keine Stabilitätsprüfung.
// 3. Median über medianFrames Frames, mittig um den ausgegebenen Frame (bei 5 also die zwei davor und
//    die zwei danach): entfernt Ausreißer wie einzelne Oktavsprünge, statt sie zu mitteln. Gezählt
//    werden nur die gültigen, stabilen Frames desselben Toneinsatzes (siehe 2a. und 5.). Bei gerader Anzahl zählt der vom
//    Mittelpunkt am weitesten entfernte nicht mit; der Wert ist so immer ein wirklich gemessener (kein
//    Mittel aus Ton und Oktave).
// 4. Danach optional exponentielle Glättung mit Zeitkonstante tauMs, über t gerechnet (unabhängig von
//    der Frame-Rate).
// 5. Neubeginn: Nach resetMs ohne gültigen Ton (Stille, zu leise, unklar) beginnt ein neuer Toneinsatz;
//    Median und Glättung greifen nicht über diese Grenze. Liegt der Median mehr als jumpCents vom
//    geglätteten Wert entfernt (klarer Tonwechsel), springt der Wert sofort dorthin, statt langsam
//    hinzugleiten. So verschmieren Töne nicht ineinander, und Tonwechsel werden nicht verzögert.
// 6. Einzelaussetzer überbrücken: Ein Frame ohne gültigen Ton (unklar, zu leise, außerhalb des Bereichs
//    – etwa ein Oktavsprung über 2300 Hz bei d² – oder unstet nach 2a., etwa ein einzelner Oktavsprung
//    darunter) mitten in einem Toneinsatz, also eine Lücke unter
//    resetMs, bekommt den Ton seiner Nachbarn, wenn davor und danach derselbe Ton erkannt wird (Median
//    höchstens jumpCents vom zuletzt ausgegebenen Wert). Er ist dann als `filled` markiert, hat die
//    kleinere Klarheit der beiden Nachbarn und behält seine Lautstärke. So startet ein einzelner
//    Messfehler weder Haltedauer noch Anzeige neu und unterbricht im Takt-Modus die erkannte Zeit nicht.
//    Ab resetMs ohne gültigen Ton bleibt es Stille wie bisher. Ohne Median (medianFrames 1) fehlt der
//    Blick auf den nächsten Frame; dann wird nichts überbrückt.
//
// Zeitstempel: Weil der Median mittig liegt, gibt push() jeden Frame erst aus, wenn die
// (medianFrames − 1) / 2 Frames danach da sind (bei 3 Frames 25 ms, bei 5 Frames 50 ms später; die
// Stabilitätsprüfung kommt ohne weiteren Frame aus, siehe 2a.). Der ausgegebene Frame behält aber
// seinen eigenen Zeitpunkt t, seine Klarheit und seine Lautstärke (rms); nur freq ist geglättet (bei
// überbrückten Frames auch die Klarheit; ein unsteter, nicht überbrückter Frame kommt mit freq null und
// `unstable` heraus, also als „kein Ton“). Ein Tonwechsel steht damit an der richtigen Stelle (Median
// verschiebt ihn nicht), Stille und Lautstärke-Einbrüche kommen in derselben Reihenfolge und mit
// denselben Zeiten an wie roh. Für den Takt-Modus heißt das: Die Verzögerung des Medians ist schon
// ausgeglichen, latencyMs bleibt die Verzögerung von Mikrofon und Erkennung.

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
  /**
   * Stabilitätsprüfung: ein gültiger Frame zählt nur, wenn ein direkter Nachbar höchstens so weit (Cent)
   * entfernt liegt; 0 = aus. Wirkt nur mit Median (medianFrames > 1).
   */
  stableCents: number;
}

/**
 * Standard: Klarheit und Bereich wie beim Üben (DEFAULT_JUDGE, ./judge.ts – hier als Zahlen, damit
 * die beiden Dateien sich nicht gegenseitig brauchen). Median über 5 Frames (≈ 125 ms), keine
 * Zeitkonstante. Neubeginn nach 50 ms ohne Ton, also zwei Aussetzern in Folge; ein einzelner
 * Messfehler mitten im Ton zählt nicht. Tonwechsel ab 70 Cent: deutlich mehr als Vibrato oder
 * Schwankungen eines gehaltenen Tons (±25–30 Cent), deutlich weniger als ein Halbton.
 * Stabilitätsprüfung mit 35 Cent: Vibrato ±30 Cent bei 5 Hz ändert sich je Frame (25 ms) um höchstens
 * 24 Cent, das Messrauschen von pitchy liegt bei einem Flötenton unter wenigen Cent (Messung mit
 * 1024 Samples, siehe ./mic.ts). Ein Zwischenwert in der Mitte eines Ganztonschritts liegt 100 Cent,
 * in der Mitte eines Halbtonschritts 50 Cent von beiden Tönen entfernt; Übergangswerte näher als
 * 35 Cent an einem Ton runden ohnehin auf diesen.
 */
export const DEFAULT_SMOOTH: SmoothConfig = {
  minClarity: 0.9,
  minFreq: 480,
  maxFreq: 2300,
  medianFrames: 5,
  tauMs: 0,
  resetMs: 50,
  jumpCents: 70,
  stableCents: 35,
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

/** Ausgegebener Frame: zusätzlich markiert, wenn er roh gültig war, aber die Stabilitätsprüfung nicht bestand */
export type SmoothedFrame = Frame & { unstable?: boolean };

/** Glätter für einen Strom von Frames; ein Exemplar je Verbraucher. */
export class Smoother {
  readonly cfg: SmoothConfig;
  /**
   * Frames um die Ausgabestelle: bis zu half schon ausgegebene davor (mit Stabilitätsprüfung einer
   * mehr, als Vorgänger des ältesten im Median), dahinter die noch offenen
   */
  private buf: Entry[] = [];
  /** Index in buf des nächsten auszugebenden Frames */
  private next = 0;
  private readonly half: number;
  /** Stabilitätsprüfung aktiv? */
  private readonly check: boolean;
  private run = 0;
  private gapStart: number | null = null;
  private lastT: number | null = null;
  private ema: { p: number; t: number; run: number } | null = null;
  /** zuletzt ausgegebener Ton (für das Überbrücken) */
  private lastOut: { p: number; run: number } | null = null;

  constructor(cfg: Partial<SmoothConfig> = {}) {
    this.cfg = { ...DEFAULT_SMOOTH, ...cfg };
    this.half = Math.max(0, Math.floor((this.cfg.medianFrames - 1) / 2));
    this.check = this.half > 0 && this.cfg.stableCents > 0;
  }

  /** So viele Frames später kommt ein Frame heraus (Verzögerung in Frames, nicht in seinem t). */
  get lag(): number {
    return this.half;
  }

  /**
   * Nimmt einen rohen Frame und gibt den Frame von vor lag Frames geglättet zurück (null, solange
   * noch nicht genug Frames da sind).
   */
  push(f: Frame): SmoothedFrame | null {
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
  flush(): SmoothedFrame[] {
    const out: SmoothedFrame[] = [];
    while (this.next < this.buf.length) out.push(this.emit());
    return out;
  }

  private emit(): SmoothedFrame {
    const c = this.next++;
    const e = this.buf[c];
    const stable = this.stable(c);
    const out = this.value(c, stable);
    // vorne nur so viele behalten, wie der Median als Vorgänger braucht (und die Prüfung als deren Vorgänger)
    const drop = this.next - this.half - (this.check ? 1 : 0);
    if (drop > 0) {
      this.buf.splice(0, drop);
      this.next -= drop;
    }
    if (!out) return e.p === null ? e.f : { ...e.f, freq: null, unstable: true };
    if (stable) return { ...e.f, freq: out.freq };
    return { ...e.f, freq: out.freq, clarity: out.clarity, filled: true };
  }

  /** Zählt buf[i] als gültiger, stabiler Ton? (Stabilitätsprüfung, Kopfkommentar 2a.) */
  private stable(i: number): boolean {
    const x = this.buf[i];
    if (x.p === null) return false;
    if (!this.check) return true;
    // gültige direkte Nachbarn im selben Toneinsatz
    const nb = [this.buf[i - 1], this.buf[i + 1]].filter((y) => y !== undefined && y.p !== null && y.run === x.run);
    // keiner zum Vergleichen (zwischen zwei Aussetzern): bleibt wie bisher – ein Übergangswert liegt
    // immer zwischen zwei Tönen, und ein kurzer echter Ton zwischen Aussetzern ginge sonst verloren
    if (nb.length === 0) return true;
    if (nb.some((y) => Math.abs(y.p! - x.p!) * 100 <= this.cfg.stableCents)) return true;
    // jüngster Frame im Fenster, Nachfolger fehlt noch: zählt vorläufig (der Median über die übrigen
    // entscheidet). Würde er nur mit passendem Vorgänger zählen, ließe sich ein Ausreißer direkt davor
    // nicht mehr überbrücken, und ein Ausreißer-Paar davor bekäme im Median die Mehrheit.
    return i === this.buf.length - 1;
  }

  /**
   * Geglättete Frequenz für buf[c] (bei einem überbrückten Aussetzer samt Klarheit), null ohne Ton.
   * stable: ist buf[c] selbst ein gültiger, stabiler Frame? Sonst (unklar, zu leise, außerhalb, unstet)
   * wird er höchstens überbrückt.
   */
  private value(c: number, stable: boolean): { freq: number; clarity: number } | null {
    const e = this.buf[c];
    const lo = Math.max(0, c - this.half);
    const hi = Math.min(this.buf.length - 1, c + this.half);
    let run = e.run;
    let clarity = e.f.clarity;
    // gültige, stabile Frames im Fenster
    const ok: boolean[] = [];
    for (let i = lo; i <= hi; i++) ok[i] = i === c ? stable : this.stable(i);
    if (!stable) {
      // Einzelaussetzer? Gültige, stabile Nachbarn davor und danach im selben Toneinsatz
      let l = c - 1;
      while (l >= lo && !ok[l]) l--;
      let r = c + 1;
      while (r <= hi && !ok[r]) r++;
      if (l < lo || r > hi || this.buf[l].run !== this.buf[r].run) return null;
      run = this.buf[r].run;
      if (!this.lastOut || this.lastOut.run !== run) return null;
      clarity = Math.min(this.buf[l].f.clarity, this.buf[r].f.clarity);
    }
    const near: { e: Entry; d: number }[] = [];
    for (let i = lo; i <= hi; i++) {
      const x = this.buf[i];
      if (ok[i] && x.run === run) near.push({ e: x, d: Math.abs(i - c) });
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
    if (!stable && Math.abs(med.p! - this.lastOut!.p) * 100 > cfg.jumpCents) return null;
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
  /** ein anderer Ton knapp an der Mitte zwischen zwei Tönen (bis switchCents vom angezeigten) muss so lange ununterbrochen anliegen … */
  holdMs: number;
  /** … ein klar anderer Ton (über switchCents vom angezeigten entfernt) so lange */
  switchMs: number;
  /** Grenze zwischen beiden Fällen in Cent vom angezeigten Ton (Mitte zwischen zwei Tönen: 50) */
  switchCents: number;
  /** so lange ohne Ton: der nächste Ton gilt sofort */
  resetMs: number;
}

/**
 * holdMs 100 ms (5 Frames): ein Ton genau zwischen zwei Halbtönen flackert nicht. switchMs 50 ms, also
 * drei Frames in Folge (der erste und zwei weitere): ein einzelner Übergangswert beim Tonwechsel, den
 * die Stabilitätsprüfung im Glätter durchlassen müsste (zwei ähnliche in Folge), erscheint nicht als
 * Name; ein echter Tonwechsel kommt zwei Frames (50 ms) später an.
 */
export const DEFAULT_NAME_HOLD: NameHoldConfig = { holdMs: 100, switchMs: 50, switchCents: 60, resetMs: 50 };

/**
 * Welcher Ton wird angezeigt? Für das Stimmgerät. Der Name wechselt nur, wenn der neue Ton
 * ununterbrochen anliegt, je nach Abstand zum angezeigten Ton unterschiedlich lange (eine Regel, zwei
 * Dauern):
 * - klarer Wechsel (über switchCents, z. B. g¹ → a¹): switchMs (≈ 3 Frames). Früher galt der neue Ton
 *   hier sofort; dann erschien jeder kurze Übergangswert (gis¹ zwischen g¹ und a¹) als Name.
 * - knapp an der Mitte zwischen zwei Tönen (z. B. fis¹ +55 Cent): holdMs.
 * Unterbrochen wird das Abwarten von einem Frame ohne Ton und von einem Frame auf einem anderen Ton
 * (auch dem angezeigten); dann beginnt es neu. Nach Stille (resetMs ohne Ton) gilt der nächste Ton
 * sofort – es gibt nichts, wovon er sich abheben müsste, und der Glätter lässt ihn ohnehin erst durch,
 * wenn er mit einem Nachbarn übereinstimmt. Solange ein klarer Wechsel abgewartet wird, gibt pending
 * true zurück: Das Stimmgerät lässt dann Zeiger und Cent stehen, statt sie an den Rand zu ziehen.
 */
export class NameHold {
  readonly cfg: NameHoldConfig;
  /** angezeigter Ton (MIDI-Nummer), null vor dem ersten Ton bzw. nach Stille */
  midi: number | null = null;
  /** Wird gerade ein klarer Wechsel abgewartet (letzter Ton über switchCents vom angezeigten)? */
  pending = false;
  private cand: { midi: number; since: number } | null = null;
  private gapStart: number | null = null;

  constructor(cfg: Partial<NameHoldConfig> = {}) {
    this.cfg = { ...DEFAULT_NAME_HOLD, ...cfg };
  }

  /** m: gebrochene MIDI-Nummer des (geglätteten) Tons oder null ohne Ton; gibt den angezeigten Ton zurück */
  push(m: number | null, t: number): number | null {
    this.pending = false;
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
    if (this.midi === null || r === this.midi) {
      this.midi = r;
      this.cand = null;
      return r;
    }
    const far = Math.abs(m - this.midi) * 100 > this.cfg.switchCents;
    if (!this.cand || this.cand.midi !== r) this.cand = { midi: r, since: t };
    if (t - this.cand.since >= (far ? this.cfg.switchMs : this.cfg.holdMs)) {
      this.midi = r;
      this.cand = null;
      return r;
    }
    this.pending = far;
    return this.midi;
  }
}
