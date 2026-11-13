// Kalendertage in der lokalen Zeitzone als "JJJJ-MM-TT".

export function dayKey(d: Date | number = Date.now()): string {
  const x = typeof d === "number" ? new Date(d) : d;
  const m = String(x.getMonth() + 1).padStart(2, "0");
  const day = String(x.getDate()).padStart(2, "0");
  return `${x.getFullYear()}-${m}-${day}`;
}

function parse(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12); // Mittag: unempfindlich gegen Sommerzeit
}

export function addDays(key: string, n: number): string {
  const d = parse(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

/** Zahl der Kalendertage von a bis b (b − a). */
export function daysBetween(a: string, b: string): number {
  return Math.round((parse(b).getTime() - parse(a).getTime()) / 86400000);
}

/** Montag der Woche, in der der Tag liegt. */
export function mondayOf(key: string): string {
  const d = parse(key);
  const wd = (d.getDay() + 6) % 7; // Mo = 0
  return addDays(key, -wd);
}

export function isValidDayKey(s: unknown): s is string {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(parse(s).getTime());
}
