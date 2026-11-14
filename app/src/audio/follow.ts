// Wertung beim Mitspielen eines Lieds: aus Messungen (Frames wie beim Üben, ./judge.ts) wird je Ton
// des Zeitplans „getroffen“ oder „nicht getroffen“. Rein rechnerisch, ohne Mikrofon und Oberfläche.
//
// Zwei Arten:
// - Warte-Modus (WaitFollower): Die aktuelle Note bleibt stehen, bis ihr Ton kurz stabil erklingt.
//   Wer vorher einen anderen Ton stabil spielt, bekommt die Note rot, kommt aber trotzdem weiter.
// - Takt-Modus (BeatFollower): Die Zeit läuft im Tempo; eine Note ist getroffen, wenn ihr Ton etwa
//   die Hälfte ihrer Dauer (mindestens 80 ms) erkannt wird.
// Pausen sind im Zeitplan keine Töne und fallen damit von selbst heraus; Haltebögen sind dort schon
// ein Ton.
//
// Neuer Einsatz (nur Warte-Modus, für Tonwiederholungen): Ein Ton gilt als neu angestoßen nach
// - einer Unterbrechung von mindestens reattackGapMs (40 ms) ohne gültigen Ton (Stille, zu leise,
//   unklar, außerhalb des Bereichs) oder mit einem anderen Ton, oder
// - einem Lautstärke-Einbruch (falls Frames rms mitbringen): unter die Hälfte des bisherigen
//   Höchstwerts dieses Tons und danach wieder deutlich lauter (mindestens das 1,5-fache des Tiefpunkts).
// Begründung: Frames kommen alle 25 ms; 40 ms verlangen also mindestens zwei Aussetzer in Folge, ein
// einzelner Messfehler mitten im gehaltenen Ton zählt nicht. Beim Anstoßen mit der Zunge bricht
// das Signal meist kürzer ein, als das 43-ms-Messfenster von pitchy auflöst – dann bleibt die Tonhöhe
// erkennbar, aber die Lautstärke sinkt deutlich; dafür ist der Einbruch-Weg da. Das Wiederansteigen
// ist nötig, damit ein bloßes Leiserwerden (Ausklingen) keinen Einsatz vortäuscht.
//
// Glättung: Beide Arten schicken die Frames zuerst durch den Glätter (./smooth.ts), knapp eingestellt:
// nur ein Median über 3 Frames (≈ 75 ms, Ausgabe 25 ms später), keine Zeitkonstante. Das entfernt
// einzelne Ausreißer (Oktavsprung, Nachbarton), lässt aber auch Sechzehntel durch. Ein einzelner
// Frame ohne gültigen Ton zwischen zwei gleichen Tönen wird überbrückt (zählt als dieser Ton, seine
// Lautstärke aber nicht für den Einbruch-Weg); ab 50 ms ohne Ton bleibt es Stille. Lautstärke und
// Stille gehen sonst unverändert durch – der neue Einsatz (oben) wird also genauso erkannt wie roh. Die geglätteten Frames behalten ihren Zeitpunkt; der Median
// verschiebt keinen Tonwechsel, deshalb braucht der Takt-Modus keinen zusätzlichen Ausgleich.
//
// Schleife: Beide Arten werten je Durchgang getrennt (Ergebnis je Durchgang). Die Liedseite nutzt die
// Schleife seit der Nachsteuerung vom 14.11.2026 nicht mehr (ein Durchgang, danach bleiben die Farben
// stehen); die Wertung kann es weiterhin. Gezeigt werden nur noch die Farben je Note – die Zusammenfassung
// (FollowSummary) dient den Abläufen (Durchgang fertig? vollständig?), nicht der Anzeige.

import { freqToWrittenMidi } from "../music/notes";
import type { Settings } from "../store/data";
import type { Timeline } from "../songs/timeline";
import { DEFAULT_JUDGE, type Frame, type Heard } from "./judge";
import { Smoother } from "./smooth";

export interface FollowConfig {
  tuning: number;
  toleranceCents: number;
  minClarity: number;
  /** Ein Oktavfehler zählt im Warte-Modus nur bei so hoher Klarheit als falsch. */
  octaveClarity: number;
  minFreq: number;
  maxFreq: number;
  /** Warte-Modus: so lange muss der Ton stabil sein (richtig wie falsch) */
  holdMs: number;
  /** Warte-Modus: Unterbrechung, ab der ein neuer Einsatz erkannt wird */
  reattackGapMs: number;
  /** Warte-Modus: Lautstärke-Einbruch unter diesen Anteil des Höchstwerts … */
  reattackDip: number;
  /** … und danach wieder mindestens um diesen Faktor über dem Tiefpunkt = neuer Einsatz */
  reattackRise: number;
  /** Takt-Modus: Verzögerung von Mikrofon und Erkennung in ms (Frames werden so viel früher einsortiert) */
  latencyMs: number;
  /** Takt-Modus: nötiger Anteil der Notendauer mit erkanntem Ton */
  minCoverage: number;
  /** Takt-Modus: mindestens so viele ms erkannt (bei sehr kurzen Noten höchstens 80 % der Dauer) */
  minHitMs: number;
  /** Takt-Modus: übliches Frame-Intervall in ms (Mikrofon: 25); größere Lücken zählen nur bis 2×. */
  frameMs: number;
  /** Glättung (./smooth.ts): Median über so viele Frames (ungerade, 1 = keiner) … */
  medianFrames: number;
  /** … und Zeitkonstante in ms (0 = keine) */
  tauMs: number;
}

/**
 * Standardwerte. Toleranz, Klarheit, Oktavregel und Frequenzbereich wie beim Üben (DEFAULT_JUDGE).
 * Haltedauer 120 ms statt 300 ms: Achtel bei 100 Schlägen dauern 300 ms, die Note muss deutlich
 * vorher grün werden.
 * Verzögerung 50 ms (Mikrofon und Erkennung): Messfenster von pitchy 2048 Samples (≈ 43 ms bei
 * 48 kHz; der Messwert gehört im Mittel zur Fenstermitte, also ≈ 20 ms zurück) + Mikrofon-Eingang auf
 * Android typisch 20–40 ms. Die Ausgabe der Klicks, nach denen sie spielt, kommt nicht hierher: Die
 * Oberfläche legt startMs auf den Zeitpunkt, zu dem sie den Zeitplan-Beginn *hört* (mit der vom
 * Browser gemeldeten Ausgabe-Verzögerung, wie die Markierung des Abspielers; ohne Meldung üblich
 * 30 ms, zusammen also wie bisher 80 ms). Bluetooth-Kopfhörer, die der Browser zu knapp meldet,
 * brauchen mehr – dafür später ein Abgleich-Knopf (latencyMs ist einstellbar). Der Median der
 * Glättung kommt nicht hinzu: Die geglätteten Frames behalten ihren Zeitpunkt (siehe Kopfkommentar).
 * Median über 3 Frames statt 5 wie beim Üben: Schnelle Noten (Sechzehntel ≈ 150 ms) sollen erkannt
 * werden, und ein Ausreißer kostet hier höchstens die kurze Haltedauer bzw. 25 ms erkannte Zeit.
 */
export const DEFAULT_FOLLOW: FollowConfig = {
  tuning: DEFAULT_JUDGE.tuning,
  toleranceCents: DEFAULT_JUDGE.toleranceCents,
  minClarity: DEFAULT_JUDGE.minClarity,
  octaveClarity: DEFAULT_JUDGE.octaveClarity,
  minFreq: DEFAULT_JUDGE.minFreq,
  maxFreq: DEFAULT_JUDGE.maxFreq,
  holdMs: 120,
  reattackGapMs: 40,
  reattackDip: 0.5,
  reattackRise: 1.5,
  latencyMs: 50,
  minCoverage: 0.5,
  minHitMs: 80,
  frameMs: 25,
  medianFrames: 3,
  tauMs: 0,
};

/**
 * Was aus den App-Einstellungen übernommen wird: Stimmton und Toleranz. Die Haltedauer der
 * Einstellungen gilt fürs Üben und ist fürs Mitspielen zu lang, sie bleibt bei DEFAULT_FOLLOW.
 */
export function followConfig(s: Pick<Settings, "tuningHz" | "toleranceCents">): Partial<FollowConfig> {
  return { tuning: s.tuningHz, toleranceCents: s.toleranceCents };
}

/** Wertung einer Note im Warte-Modus */
export interface WaitNoteResult {
  /** grün: getroffen, ohne vorher einen anderen Ton stabil zu spielen */
  ok: boolean;
  /** bei ok = false: der zuerst gespielte falsche Ton (notierte MIDI-Nummer) */
  wrongMidi?: number;
}

/** Wertung einer Note im Takt-Modus */
export interface BeatNoteResult {
  ok: boolean;
  /** Anteil der Notendauer, in dem ihr Ton erkannt wurde (0–1) */
  coverage: number;
}

/** Zusammenfassung eines Durchgangs */
export interface FollowSummary {
  hits: number;
  /** Zahl der gewerteten Noten */
  total: number;
  /** alle Noten des Zeitplans gewertet (nicht vorzeitig beendet) */
  complete: boolean;
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

/** Gehörter Ton und gebrochene MIDI-Nummer eines gültigen Frames */
function hear(cfg: FollowConfig, freq: number): { heard: Heard; m: number } {
  const m = freqToWrittenMidi(freq, cfg.tuning);
  const midi = Math.round(m);
  return { heard: { midi, cents: Math.round((m - midi) * 100), freq }, m };
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

  /** Gültiger Frame: aktualisiert den Einsatz und gibt ihn zurück; sonst null. */
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
  /** nach der letzten Note wieder von vorn (neuer Durchgang) */
  loop?: boolean;
  /** Note getroffen (Index in tl.tones), danach steht index auf der nächsten */
  onNote?: (index: number, result: WaitNoteResult, pass: number) => void;
  /** erster falscher Ton für die aktuelle Note (die Note wird rot, wartet aber weiter) */
  onWrong?: (index: number, midi: number, pass: number) => void;
  /** Durchgang fertig (alle Noten getroffen) */
  onPass?: (summary: FollowSummary, pass: number) => void;
}

/**
 * Warte-Modus. Die Oberfläche schickt jeden Frame mit push(); index ist die Note, auf die gewartet
 * wird (Index in tl.tones; = tl.tones.length, wenn fertig).
 * Eine Note ist getroffen, wenn ihr Ton holdMs lang ununterbrochen in der Toleranz liegt und sein
 * Einsatz nach dem Treffer der vorigen Note begann – bei einer Tonwiederholung braucht es also
 * einen neuen Einsatz, ein einfach weitergehaltener Ton zählt nicht. Ein anderer Ton holdMs lang
 * stabil (neuer Einsatz nach dem vorigen Treffer, kein Nachklang) macht die Note rot; ein Oktavfehler
 * nur bei hoher Klarheit (wie beim Üben). Ein Ton knapp außerhalb der Toleranz ist weder richtig
 * noch falsch.
 */
export class WaitFollower {
  readonly cfg: FollowConfig;
  index = 0;
  pass = 0;
  /** Wertungen des laufenden Durchgangs, results[i] zu tl.tones[i] */
  results: (WaitNoteResult | undefined)[] = [];
  /** Auswertungen der abgeschlossenen Durchgänge */
  passes: FollowSummary[] = [];
  /** Wurde für die aktuelle Note schon ein falscher Ton gewertet? */
  wrongMidi: number | null = null;
  done = false;
  private onsets: Onsets;
  private smoother: Smoother;
  private inTolStart: number | null = null;
  /** Zeitpunkt des letzten Treffers: nur spätere Einsätze zählen */
  private armedAt = -Infinity;

  constructor(
    readonly tl: Timeline,
    private opts: WaitOptions = {},
  ) {
    this.cfg = { ...DEFAULT_FOLLOW, ...opts.cfg };
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
    if (!isValid(cfg, f)) {
      this.onsets.gap(f.t);
      this.inTolStart = null;
      return null;
    }
    const { heard, m } = hear(cfg, f.freq);
    const seg = this.onsets.push(f, heard.midi);
    if (this.done || seg.start <= this.armedAt) {
      // Nachklang der vorigen Note bzw. Ton ohne neuen Einsatz
      this.inTolStart = null;
      return heard;
    }
    const target = this.tl.tones[this.index].midi;
    if (Math.abs((m - target) * 100) <= cfg.toleranceCents) {
      this.inTolStart ??= f.t;
      if (f.t - this.inTolStart >= cfg.holdMs) this.hit(f.t);
      return heard;
    }
    this.inTolStart = null;
    if (heard.midi === target || this.wrongMidi !== null || f.t - seg.start < cfg.holdMs) return heard;
    if (Math.abs(heard.midi - target) === 12 && seg.minClarity < cfg.octaveClarity) return heard;
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
    const i = this.index;
    this.results[i] = result;
    this.armedAt = t;
    this.inTolStart = null;
    this.wrongMidi = null;
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
  /** Abschnitt/Lied endlos wiederholen; Durchgänge folgen lückenlos (wie im Abspieler) */
  loop?: boolean;
  /** Note hat genug erkannte Zeit (live, noch vor ihrem Ende) */
  onHit?: (index: number, pass: number) => void;
  /** endgültige Wertung einer Note, sobald ihr Zeitfenster vorbei ist */
  onNote?: (index: number, result: BeatNoteResult, pass: number) => void;
  /** Durchgang fertig */
  onPass?: (summary: FollowSummary, pass: number) => void;
}

interface Anchor {
  t: number;
  g: number;
  spq: number;
}

interface PassState {
  /** erkannte Zeit je Note in ms bzw. in Vierteln */
  ms: number[];
  q: number[];
  hit: boolean[];
  results: (BeatNoteResult | undefined)[];
  /** nächste noch nicht abschließend gewertete Note */
  next: number;
}

/**
 * Takt-Modus. Zeitachse: Viertel g = (t − startMs) / (secPerQuarter · 1000), Frames werden um
 * latencyMs früher einsortiert. Jeder gültige Frame steht für ein Frame-Intervall um seinen
 * (korrigierten) Zeitpunkt; liegt der Ton in der Toleranz der Note, deren Fenster dieses Intervall
 * überlappt, zählt die Überlappung als erkannte Zeit. Getroffen: erkannte Zeit ≥ minCoverage der
 * Dauer und ≥ minHitMs (bei Noten unter 100 ms höchstens 80 % der Dauer).
 * Tonwiederholungen brauchen hier keinen neuen Einsatz: Es zählt nur die erkannte Zeit im Fenster
 * der jeweiligen Note; wer eine Wiederholung durchhält, hat beide getroffen (das Tempo gibt die
 * Notengrenzen vor). Oktavfehler und Töne knapp außerhalb der Toleranz zählen einfach nicht.
 */
export class BeatFollower {
  readonly cfg: FollowConfig;
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

  constructor(
    readonly tl: Timeline,
    private opts: BeatOptions,
  ) {
    this.cfg = { ...DEFAULT_FOLLOW, ...opts.cfg };
    this.anchor = { t: opts.startMs, g: 0, spq: opts.secPerQuarter };
    this.L = tl.total;
    this.smoother = new Smoother(this.cfg);
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
    return f ? this.take(f) : null;
  }

  private take(f: Frame): Heard | null {
    const cfg = this.cfg;
    const tc = f.t - cfg.latencyMs;
    const dt = this.lastTc === null ? cfg.frameMs : Math.min(Math.max(tc - this.lastTc, 0), 2 * cfg.frameMs);
    this.lastTc = tc;
    if (this.done) return isValid(cfg, f) ? hear(cfg, f.freq).heard : null;
    let heard: Heard | null = null;
    if (isValid(cfg, f)) {
      const h = hear(cfg, f.freq);
      heard = h.heard;
      if (dt > 0) this.credit(tc - dt / 2, tc + dt / 2, h.m);
    }
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
    // was der Glätter noch zurückhält, zählt mit
    for (const f of this.smoother.flush()) this.take(f);
    if (this.done) return this.passes[this.passes.length - 1] ?? null;
    const g = this.quarterAt(t - this.cfg.latencyMs);
    this.settle(g);
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
    const n = this.tl.tones.length;
    return { ms: Array(n).fill(0), q: Array(n).fill(0), hit: Array(n).fill(false), results: [], next: 0 };
  }

  /** Erkannte Zeit [ta, tb] (ms, korrigiert) mit gebrochener MIDI-Nummer m gutschreiben */
  private credit(ta: number, tb: number, m: number): void {
    const ga = this.quarterAt(ta);
    const gb = this.quarterAt(tb);
    if (gb <= 0) return;
    const msPerQ = (tb - ta) / (gb - ga);
    const local0 = ga - this.pass * this.L;
    const local1 = gb - this.pass * this.L;
    const tones = this.tl.tones;
    for (let i = this.cur.next; i < tones.length; i++) {
      const n = tones[i];
      if (n.start >= local1) break;
      const ov = Math.min(local1, n.start + n.dur) - Math.max(local0, n.start);
      if (ov <= 0) continue;
      if (Math.abs((m - n.midi) * 100) > this.cfg.toleranceCents) continue;
      this.cur.q[i] += ov;
      this.cur.ms[i] += ov * msPerQ;
      if (!this.cur.hit[i] && this.enough(i)) {
        this.cur.hit[i] = true;
        this.opts.onHit?.(i, this.pass);
      }
    }
    // Schleife: Der Teil des Intervalls hinter dem Durchgangsende gehört schon zum nächsten – aber nur
    // dieser Teil: Lag das ganze Intervall schon dahinter (Frame-Lücke über die Grenze, z. B. ein
    // ruckelnder Hauptthread), beginnt es nicht an der Grenze, sonst würde Ungehörtes gutgeschrieben.
    if (this.opts.loop && local1 > this.L) {
      const pass = this.pass;
      this.settle((pass + 1) * this.L);
      if (this.pass > pass) this.credit(Math.max(ta, this.anchorTimeOf(this.pass * this.L)), tb, m);
    }
  }

  /** ms-Zeitpunkt zu einer Stelle g (Umkehrung von quarterAt) */
  private anchorTimeOf(g: number): number {
    const a = this.anchor;
    return a.t + (g - a.g) * a.spq * 1000;
  }

  private enough(i: number): boolean {
    const n = this.tl.tones[i];
    const durMs = n.dur * this.anchor.spq * 1000;
    const need = Math.min(Math.max(this.cfg.minCoverage * durMs, this.cfg.minHitMs), 0.8 * durMs);
    return this.cur.ms[i] >= need - 1e-6;
  }

  private decide(i: number): void {
    const n = this.tl.tones[i];
    const result: BeatNoteResult = { ok: this.enough(i), coverage: Math.min(1, this.cur.q[i] / n.dur) };
    this.cur.results[i] = result;
    this.opts.onNote?.(i, result, this.pass);
  }

  /** Alle Noten abschließend werten, deren Fenster vor der Stelle g (Viertel) zu Ende ist. */
  private settle(g: number): void {
    const tones = this.tl.tones;
    while (!this.done) {
      const local = g - this.pass * this.L;
      while (this.cur.next < tones.length) {
        const n = tones[this.cur.next];
        if (n.start + n.dur > local + 1e-9) break;
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
    }
  }
}
