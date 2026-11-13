// Beispieldaten für Browser-Tests und Bildschirmfotos.
import { addDays, dayKey } from "../../src/store/dates";

export function sampleData(opts: { lesen?: string; spielen?: string } = {}) {
  const today = dayKey();
  const days = [-4, -3, -2, -1].map((n) => addDays(today, n));
  const hist = (n: number, wrong: number) =>
    Array.from({ length: n }, (_, i) => [i < wrong ? 0 : 1, days[i % days.length], Date.now() - 86400000 * 2 + i]);
  const lesen: Record<string, unknown[]> = {
    h1: hist(20, 0), a1: hist(20, 1), g1: hist(20, 2), c2: hist(18, 3), d2: hist(16, 3), e1: hist(11, 6), d1: hist(9, 4), fis1: hist(4, 1),
  };
  const cards: Record<string, unknown> = {};
  for (const n of Object.keys(lesen)) for (const k of ["name", "griff", "note"]) cards[`${n}|${k}`] = { box: n === "fis1" ? 2 : 3, day: addDays(today, -4), session: 3 };
  for (const n of ["h1", "a1", "g1", "c2", "d2"]) cards[`${n}|spiel`] = { box: 2, day: addDays(today, -2), session: 3 };
  return {
    version: 1,
    app: "floetentrainer",
    stages: { lesen: opts.lesen ?? "fis1", spielen: opts.spielen ?? "c2-d2" },
    cards,
    history: { lesen, spielen: { h1: hist(12, 1), a1: hist(12, 2), g1: hist(10, 1), c2: hist(6, 2), d2: hist(5, 1) } },
    introduced: { lesen: ["h1", "a1", "g1", "c2", "d2", "e1", "d1", "fis1"], spielen: ["h1", "a1", "g1", "c2", "d2"] },
    days,
    sessions: 5,
  };
}
