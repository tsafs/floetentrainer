#!/usr/bin/env node
// Fasst eine Diagnose-Datei des Mitspielens zusammen („Diagnose speichern“ in der App, Format siehe
// app/src/audio/diagnose.ts). Aufruf im Ordner app/:  node scripts/diagnose.mjs <datei.json>
// Ausgabe: Kopf (Art, Gerät, Verzögerungen, Stimmton, Flöte), je Note erwartet/erkannt, mittlere
// Cent-Abweichung, Einsatz-Versatz in ms und Grund für Rot; Median des Einsatz-Versatzes; Anteil unklarer
// Messungen. Beim Abgleich: Versatz je Klick und Ergebnis.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const NAMES = ["c", "cis", "d", "es", "e", "f", "fis", "g", "gis", "a", "b", "h"];
const SUP = ["⁰", "¹", "²", "³", "⁴"];

/** Notierte MIDI-Nummer → deutscher Name (Schreibweise der Grifftabelle), z. B. 69 → a¹ */
export function midiName(m) {
  if (m === null || m === undefined || !Number.isFinite(m)) return "–";
  const oct = Math.floor(m / 12) - 4;
  return NAMES[((m % 12) + 12) % 12] + (SUP[oct] ?? String(oct));
}

function med(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const k = s.length >> 1;
  return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
}

/**
 * Zusammenfassung als Objekt (für Tests und die Textausgabe).
 * notes: je Note { i, expected, heard (häufigster gehörter Ton im Fenster), ok, reason, cents, onsetMs }
 */
export function summarizeDiag(d) {
  if (!d || typeof d !== "object" || !Array.isArray(d.frames)) throw new Error("Keine Diagnose-Datei des Flötentrainers.");
  const frames = d.frames;
  const tones = d.meta?.tones ?? [];
  const noteEvents = new Map();
  for (const e of d.events ?? []) if (e.type === "note") noteEvents.set(e.i, e);
  // gehörte Töne je Note (aus der Einordnung der Wertung)
  const heardBy = new Map();
  for (const f of frames) {
    if (f.n === undefined || f.m === undefined || f.k === "alt") continue;
    const h = heardBy.get(f.n) ?? new Map();
    h.set(f.m, (h.get(f.m) ?? 0) + 1);
    heardBy.set(f.n, h);
  }
  const notes = tones.map((t, i) => {
    const e = noteEvents.get(i);
    let heard = null;
    let most = 0;
    for (const [m, c] of heardBy.get(i) ?? []) if (c > most) [heard, most] = [m, c];
    return {
      i,
      expected: t.midi,
      heard,
      ok: e ? !!e.ok : null,
      reason: e?.reason ?? (e && !e.ok && e.wrongMidi !== undefined ? "anderer-ton" : null),
      wrongMidi: e?.wrongMidi ?? e?.otherMidi ?? null,
      cents: e?.cents ?? null,
      onsetMs: e?.onsetMs ?? null,
      targetMs: e?.targetMs ?? null,
      partMs: e?.partMs ?? null,
    };
  });
  const onsets = notes.map((n) => n.onsetMs).filter((x) => x !== null && x !== undefined);
  // Messungen mit Klang (Frequenz, unstet/unklar oder laut genug) und davon ohne gültigen Ton
  const minClarity = d.meta?.minClarity ?? 0.85;
  const minRms = d.meta?.mic?.minRms ?? 0.006;
  let sounding = 0;
  let unclear = 0;
  for (const f of frames) {
    const snd = f.f !== null || (f.r ?? 0) >= minRms;
    if (!snd) continue;
    sounding++;
    if (f.f === null || f.c < minClarity || f.k === "unklar") unclear++;
  }
  const out = {
    kind: d.kind,
    created: d.created,
    frames: frames.length,
    notes,
    hits: notes.filter((n) => n.ok).length,
    judged: notes.filter((n) => n.ok !== null).length,
    medianOnsetMs: med(onsets),
    medianCents: med(notes.map((n) => n.cents).filter((x) => x !== null && x !== undefined)),
    unclearShare: sounding ? unclear / sounding : 0,
  };
  if (d.kind === "abgleich") {
    const r = (d.events ?? []).find((e) => e.type === "ergebnis");
    out.latency = r ? { ok: r.ok, ms: r.ms ?? null, offsets: r.offsets ?? [], reason: r.reason ?? null } : null;
  }
  return out;
}

const fmt = (x, unit = "") => (x === null || x === undefined ? "–" : `${Math.round(x)}${unit}`);
const REASON = {
  anteil: "",
  einsatz: "über den Einsatz",
  "anderer-ton": "anderer Ton",
  nichts: "nichts erkannt",
  "zu-kurz": "zu kurz/zu wenig",
};

/** Lesbarer Text */
export function formatSummary(d, s = summarizeDiag(d)) {
  const m = d.meta ?? {};
  const lines = [];
  lines.push(`Diagnose vom ${d.created} – ${d.kind === "takt" ? "Im Takt" : d.kind === "warten" ? "Wartet auf mich" : "Verzögerung abgleichen"}`);
  if (m.song) lines.push(`Lied: ${m.song}${m.section ? ` (${m.section})` : ""}${m.percent ? `, Tempo ${m.percent} %` : ""}`);
  lines.push(`Stimmton der Flöte ${m.tuningHz != null ? Math.round(m.tuningHz * 10) / 10 : "?"} Hz${m.tuningKnown === true ? " (angegeben)" : m.tuningKnown === false ? " (ermittelt)" : ""}, Verzögerung ${fmt(m.latencyMs, " ms")} (${m.latencyCalibrated ? "abgeglichen" : "Standard"}), Kopfhörer ${m.headphones ? "an" : "aus"}`);
  if (m.flute) lines.push(`Flöte: ${m.flute.name} – ${Object.entries(m.flute.offsets ?? {}).map(([k, v]) => `${k} ${v > 0 ? "+" : ""}${v}`).join(", ") || "keine Werte"}`);
  if (m.userAgent) lines.push(`Browser: ${m.userAgent}`);
  if (m.mic?.trackStats) lines.push(`Mikrofon-Statistik: ${JSON.stringify(m.mic.trackStats)}`);
  if (m.output) lines.push(`Ausgabe: ${JSON.stringify(m.output)}`);
  lines.push(`Messungen: ${s.frames}, davon unklar (Klang ohne gültigen Ton): ${Math.round(s.unclearShare * 100)} %`);
  if (s.latency) {
    lines.push(`Abgleich: ${s.latency.ok ? `${s.latency.ms} ms` : `fehlgeschlagen (${s.latency.reason})`}; je Klick: ${s.latency.offsets.map((x) => fmt(x)).join(" ")}`);
    return lines.join("\n");
  }
  lines.push("");
  lines.push(" Nr  erwartet  erkannt  Ergebnis  Cent  Einsatz  Grund");
  for (const n of s.notes) {
    const res = n.ok === null ? "–" : n.ok ? "grün" : "rot";
    const why = n.ok === false ? (REASON[n.reason] ?? n.reason ?? "") + (n.wrongMidi !== null && n.reason === "anderer-ton" ? ` (${midiName(n.wrongMidi)})` : "") : n.ok ? REASON[n.reason] ?? "" : "";
    lines.push(
      `${String(n.i + 1).padStart(3)}  ${midiName(n.expected).padEnd(8)}  ${midiName(n.heard).padEnd(7)}  ${res.padEnd(8)}  ${fmt(n.cents).padStart(4)}  ${fmt(n.onsetMs, " ms").padStart(7)}  ${why}`,
    );
  }
  lines.push("");
  lines.push(`Getroffen: ${s.hits} von ${s.judged}; Median Einsatz-Versatz: ${fmt(s.medianOnsetMs, " ms")} (positiv = später als die Note); Median Cent: ${fmt(s.medianCents)}`);
  return lines.join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file) {
    console.error("Aufruf: node scripts/diagnose.mjs <diagnose.json>");
    process.exit(1);
  }
  const d = JSON.parse(readFileSync(file, "utf8"));
  console.log(formatSummary(d));
}
