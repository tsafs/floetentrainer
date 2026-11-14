import type { Answer, AppData } from "../../src/store/data";

/** Wiederholbarer Zufall */
export function seeded(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** n Antworten, davon `wrong` falsch, verteilt auf die angegebenen Tage */
export function answers(n: number, wrong: number, days: string[], t0 = 1000): Answer[] {
  const out: Answer[] = [];
  for (let i = 0; i < n; i++) out.push([i < wrong ? 0 : 1, days[i % days.length], t0 + i]);
  return out;
}

export const TODAY = "2026-11-13"; // ein Freitag

export function master(data: AppData, track: "lesen" | "spielen", notes: string[], days = [TODAY]) {
  for (const n of notes) data.history[track][n] = answers(10, 0, days);
}
