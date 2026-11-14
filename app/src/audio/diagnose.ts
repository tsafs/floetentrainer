// Diagnose-Aufnahme beim Mitspielen und beim Abgleich der Verzögerung: Damit sich die Wertung an echten
// Gerätedaten prüfen lässt, hält die App während eines Durchgangs alle Messwerte im Speicher (nur den
// letzten Durchgang, begrenzt) und bietet sie danach als JSON-Datei an („Diagnose speichern“).
// **Kein Ton, keine Aufnahme:** nur Zahlen (Zeitpunkt, erkannte Frequenz, Klarheit, Lautstärke, die
// Einordnung durch die Wertung) und Ereignisse (Notenfenster, Treffer und Fehler mit Grund, Verzögerungen,
// Stimmton, Flötenwerte, Angaben zu Browser und Mikrofon). Auswertung: app/scripts/diagnose.mjs.

import type { Frame } from "./judge";
import type { JudgedFrame } from "./follow";

/** Format der Datei (bei Änderungen erhöhen; das Auswerte-Skript prüft es) */
export const DIAG_FORMAT = 1;

/** Erklärung am Anfang der Datei */
export const DIAG_INFO =
  "Diagnose des Mitspielens im Flötentrainer (letzter Durchgang). Enthalten sind nur Messwerte: je Messung " +
  "(etwa alle 25 ms) Zeitpunkt t in ms seit Beginn, erkannte Frequenz f in Hz, Klarheit c (0–1), Lautstärke r, " +
  "dazu die geglättete Frequenz sf und die Einordnung durch die Wertung (gehörter Ton m, Abweichung ct in Cent, " +
  "Note n, Art k). Außerdem Ereignisse (Notenfenster, Treffer und Fehler mit Grund), Verzögerungen, Stimmton, " +
  "Werte der Flöte sowie Angaben zu Browser, Mikrofon und Audio-Ausgabe. Es ist kein Ton und keine Aufnahme " +
  "enthalten. Auswertung: node app/scripts/diagnose.mjs <Datei>";

/** Höchstens so viele Messungen (≈ 6 Minuten) und Ereignisse je Durchgang */
export const DIAG_MAX_FRAMES = 15000;
export const DIAG_MAX_EVENTS = 3000;

export type DiagKind = "warten" | "takt" | "abgleich";

/** Eine Messung in der Datei (kurze Namen, die Datei wird sonst groß) */
export interface DiagFrame {
  t: number;
  f: number | null;
  c: number;
  r?: number;
  sf?: number | null;
  m?: number;
  ct?: number;
  n?: number;
  k?: string;
  fl?: string;
}

export interface DiagEvent {
  t: number;
  type: string;
  [key: string]: unknown;
}

export interface DiagFile {
  info: string;
  format: number;
  kind: DiagKind;
  created: string;
  /** Uhr der Messungen (performance.now) zu Beginn; alle t sind relativ dazu */
  t0: number;
  meta: Record<string, unknown>;
  events: DiagEvent[];
  frames: DiagFrame[];
  end?: Record<string, unknown>;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r3 = (x: number) => Math.round(x * 1000) / 1000;

export class DiagRecorder {
  private file: DiagFile | null = null;
  private byT = new Map<number, DiagFrame>();
  private open = false;

  /** Gibt es einen abgeschlossenen (oder abgebrochenen) Durchgang zum Speichern? */
  get available(): boolean {
    return !!this.file && !this.open && (this.file.frames.length > 0 || this.file.events.length > 0);
  }

  /** Läuft gerade eine Aufnahme? */
  get recording(): boolean {
    return this.open;
  }

  /** Neuen Durchgang beginnen (der vorige wird verworfen) */
  begin(kind: DiagKind, t0: number, meta: Record<string, unknown>): void {
    this.file = { info: DIAG_INFO, format: DIAG_FORMAT, kind, created: new Date().toISOString(), t0: r1(t0), meta, events: [], frames: [] };
    this.byT.clear();
    this.open = true;
  }

  /** Zeitpunkt t (Uhr der Messungen) relativ zum Beginn */
  rel(t: number): number {
    return r1(t - (this.file?.t0 ?? 0));
  }

  /** Rohe Messung des Mikrofons */
  frame(f: Frame): void {
    const file = this.file;
    if (!this.open || !file || file.frames.length >= DIAG_MAX_FRAMES) return;
    const e: DiagFrame = { t: this.rel(f.t), f: f.freq === null ? null : r1(f.freq), c: r3(f.clarity) };
    if (f.rms !== undefined) e.r = Math.round(f.rms * 1e5) / 1e5;
    file.frames.push(e);
    this.byT.set(f.t, e);
    // alte Zuordnungen vergessen (die Wertung kommt höchstens ein paar Frames später)
    if (this.byT.size > 64) this.byT.delete(this.byT.keys().next().value!);
  }

  /** Einordnung eines (geglätteten) Frames durch die Wertung; gehört zur rohen Messung mit gleichem t */
  judged(j: JudgedFrame): void {
    if (!this.open) return;
    const e = this.byT.get(j.t);
    if (!e) return;
    e.sf = j.freq === null ? null : r1(j.freq);
    if (j.midi !== undefined) e.m = j.midi;
    if (j.cents !== undefined) e.ct = j.cents;
    if (j.note !== undefined) e.n = j.note;
    if (j.cls) e.k = j.cls;
    const fl = [j.filled && "überbrückt", j.unstable && "unstet", j.click && "klick"].filter(Boolean).join(",");
    if (fl) e.fl = fl;
  }

  /** Ereignis zum Zeitpunkt t (Uhr der Messungen) */
  event(t: number, type: string, data: Record<string, unknown> = {}): void {
    const file = this.file;
    if (!this.open || !file || file.events.length >= DIAG_MAX_EVENTS) return;
    file.events.push({ t: this.rel(t), type, ...data });
  }

  /** Weitere Angaben zum Durchgang (z. B. die Notenfenster, sobald bekannt) */
  setMeta(data: Record<string, unknown>): void {
    if (this.file) Object.assign(this.file.meta, data);
  }

  /** Durchgang beenden */
  end(data: Record<string, unknown> = {}): void {
    if (!this.open || !this.file) return;
    this.file.end = data;
    this.open = false;
  }

  /** Inhalt der Datei (null ohne Durchgang) */
  get content(): DiagFile | null {
    return this.file;
  }

  json(): string {
    return JSON.stringify(this.file);
  }
}

export const diag = new DiagRecorder();

/** Dateiname, z. B. floetentrainer-diagnose-2026-11-14-1530.json */
export function diagFileName(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `floetentrainer-diagnose-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`;
}

/**
 * Datei anbieten: Wo der Browser Dateien teilen kann (Android-Chrome), öffnet sich das Teilen-Menü
 * (z. B. E-Mail oder Messenger); sonst wird sie heruntergeladen. Gibt zurück, was passiert ist.
 */
export async function offerDiag(json: string, name = diagFileName()): Promise<"geteilt" | "heruntergeladen" | "abgebrochen"> {
  const blob = new Blob([json], { type: "application/json" });
  try {
    const file = new File([blob], name, { type: "application/json" });
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: "Flötentrainer-Diagnose" });
      return "geteilt";
    }
  } catch (e) {
    if ((e as { name?: string })?.name === "AbortError") return "abgebrochen";
    /* sonst herunterladen */
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
  return "heruntergeladen";
}
