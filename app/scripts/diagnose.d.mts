// Typen für das Auswerte-Skript der Diagnose-Datei (für die Tests).
export interface DiagNoteSummary {
  i: number;
  expected: number;
  heard: number | null;
  ok: boolean | null;
  reason: string | null;
  wrongMidi: number | null;
  cents: number | null;
  onsetMs: number | null;
  targetMs: number | null;
  partMs: number | null;
}
export interface DiagSummary {
  kind: string;
  created: string;
  frames: number;
  notes: DiagNoteSummary[];
  hits: number;
  judged: number;
  medianOnsetMs: number | null;
  medianCents: number | null;
  unclearShare: number;
  latency?: { ok: boolean; ms: number | null; offsets: (number | null)[]; reason: string | null } | null;
}
export function midiName(m: number | null | undefined): string;
export function summarizeDiag(d: unknown): DiagSummary;
export function formatSummary(d: unknown, s?: DiagSummary): string;
