// Nachrechnen von Testboard-Diagnosen (./replay-lib.ts). Ohne REPLAY prüft der Test nur, dass Ton in der
// Diagnose verlustarm hin und zurück kommt und eine synthetische Aufnahme nachgerechnet wird.
// Mit REPLAY=<datei.json> (mehrere mit Komma) gibt er je Note aus: live / nachgerechnet / Gehörtes.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { base64Pcm16, DiagRecorder, pcm16Base64, type DiagFile } from "../../src/audio/diagnose";
import { midiName } from "../../scripts/diagnose.mjs";
import { renderFlute, SR } from "./flute-signal";
import { replay } from "./replay-lib";

describe("Diagnose mit Ton", () => {
  it("16 Bit hin und zurück: Abweichung unter 1/30000", () => {
    const x = Float32Array.from({ length: 5000 }, (_, i) => Math.sin(i / 7) * 0.8);
    const y = base64Pcm16(pcm16Base64(x));
    expect(y.length).toBe(x.length);
    expect(Math.max(...x.map((v, i) => Math.abs(v - y[i])))).toBeLessThan(1 / 30000);
  });

  it("synthetische Testboard-Aufnahme (Warte-Modus) wird nachgerechnet: alles grün", () => {
    const tones = [67, 69, 71, 72, 71, 69, 67].map((midi, i) => ({ midi, start: i * 0.5, dur: 0.5 }));
    const { x } = renderFlute(tones.map((n) => ({ midi: n.midi, ms: 300 })));
    const d = new DiagRecorder();
    d.begin("warten", 1000, { tones, tuningHz: 440, latencyMs: 120 });
    tones.forEach((_, i) => d.event(1300 + i * 300, "note", { i, ok: true }));
    d.end({});
    d.setAudio({ sampleRate: SR, t0: 1000, samples: x });
    const file = JSON.parse(d.json()) as DiagFile;
    const r = replay(file);
    expect(r).toMatchObject({ live: 7, replayed: 7, total: 7 });
  });
});

const files = (process.env.REPLAY ?? "").split(",").filter(Boolean);
describe.skipIf(!files.length)("REPLAY", () => {
  for (const path of files) {
    it(path, () => {
      const file = JSON.parse(readFileSync(path, "utf8")) as DiagFile;
      const r = replay(file);
      const lines = [`${file.meta.song} (${file.kind}): live ${r.live}/${r.total}, nachgerechnet ${r.replayed}/${r.total}`];
      for (const n of r.notes) {
        const heard = Object.entries(n.heard)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([k, ms]) => `${midiName(Number(k))} ${ms} ms`)
          .join(", ");
        const mark = (v: boolean | null) => (v === null ? "·" : v ? "✓" : "✗");
        lines.push(`${String(n.i + 1).padStart(3)} ${midiName(n.midi).padEnd(5)} live ${mark(n.live)} neu ${mark(n.replay)}  unklar ${Math.round(n.unclear * 100)} %  gehört: ${heard}`);
      }
      process.stdout.write(lines.join("\n") + "\n");
    });
  }
});
