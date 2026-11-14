// Mitspielen robuster (Befund am echten Gerät vom 14.11.2026): Verzögerung abgleichen, verstimmte Flöte,
// Flöte einstellen und wechseln, Diagnose-Datei. Echtzeit mit Mikrofon-Attrappe wie in follow.spec.ts.
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import { soundingFreq } from "../../src/music/notes";
import { FAKE_AUDIO } from "./fake-audio";
import { sampleData } from "./seed";
import { FAKE_MIC, seed, stored } from "./util";

const ABC = "X:1\nT:Kurz\nM:4/4\nL:1/4\nQ:1/4=120\nK:G\nG A B B | c A G2 |]\n";
const SONG = "abc-kurz";
const MELODY = [67, 69, 71, 71, 72, 69, 67];
const SPQ = 0.5;
/** klingende Frequenz, ggf. um cents verstimmt */
const hz = (midi: number, cents = 0) => soundingFreq(midi) * Math.pow(2, cents / 1200);

function data(extra: Record<string, unknown> = {}, opts: { lesen?: string; spielen?: string } = {}) {
  return {
    ...sampleData(opts),
    version: 2,
    settings: { tuningHz: 440 },
    ownSongs: [{ id: SONG, title: "Kurz", abc: ABC, number: 1, index: 0, shift: 0, added: 0 }],
    ...extra,
  };
}

async function open(page: Page, d: unknown = data()) {
  await page.addInitScript(FAKE_AUDIO);
  await page.addInitScript(FAKE_MIC);
  await seed(page, d);
  await page.goto(`./#/lied/${SONG}`);
  await expect(page.locator(".score svg.sys").first()).toBeVisible();
}

interface Dbg {
  active: boolean;
  running: boolean;
  started: boolean;
  timeline: { tones: { start: number; dur: number; midi: number }[] } | null;
  startMs: number | null;
  latency: { ms: number; calibrated: boolean };
  cal: { state: string; which: string; ok: boolean | null; clicks: number[] | null; onsets: number[] | null } | null;
  diag: boolean;
  tuning: Record<string, number> | null;
}
const dbg = (page: Page) => page.evaluate(() => (window as unknown as { __lied: { follow(): Dbg } }).__lied.follow());
const go = (page: Page) => page.locator('[data-act="fstart"]');
const finished = (page: Page, timeout = 10000) =>
  page.waitForFunction(() => {
    const f = (window as unknown as { __lied: { follow(): Dbg } }).__lied.follow();
    return f.active && !f.running;
  }, null, { timeout });

async function start(page: Page, mode: "Wartet auf mich" | "Im Takt") {
  await page.getByRole("tab", { name: "Mitspielen" }).click();
  await page.getByRole("button", { name: mode }).click();
  await go(page).click();
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): Dbg } }).__lied.follow().started);
  await page.waitForFunction(() => (window as unknown as { __osc: unknown }).__osc !== null);
}

/** Töne auf der Audio-Uhr der Attrappe einplanen: [Zeitpunkt (performance.now), Frequenz | null] */
const schedule = (page: Page, list: [number, number | null][]) =>
  page.evaluate((l) => (window as unknown as { __osc: { schedule(l: [number, number | null][]): void } }).__osc.schedule(l), list);

/** Warte-Modus: Noten ab jetzt + 150 ms, je 300 ms und 150 ms Stille, um cents[i] verstimmt */
async function playWait(page: Page, cents: number[]) {
  const now = await page.evaluate(() => performance.now());
  let t = now + 150;
  const list: [number, number | null][] = [];
  MELODY.forEach((m, i) => {
    list.push([t, hz(m, cents[i])], [t + 300, null]);
    t += 450;
  });
  await schedule(page, list);
}

/** Takt-Modus: Noten ab dem gemeldeten Beginn, je 60 ms Lücke, um cents[i] verstimmt */
async function playBeat(page: Page, cents: number[]) {
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): Dbg } }).__lied.follow().startMs !== null);
  const d = await dbg(page);
  const list: [number, number | null][] = [];
  d.timeline!.tones.forEach((n, i) => {
    list.push([d.startMs! + n.start * SPQ * 1000, hz(MELODY[i], cents[i])], [d.startMs! + (n.start + n.dur) * SPQ * 1000 - 60, null]);
  });
  await schedule(page, list);
}

async function colors(page: Page): Promise<string[]> {
  return page.evaluate((n) => {
    const gs = [...document.querySelectorAll<SVGGElement>(".score g.n")].sort((a, b) => Number(a.dataset.id) - Number(b.dataset.id));
    return gs.slice(0, n).map((g) => (g.classList.contains("hit") ? "hit" : g.classList.contains("miss") ? "miss" : ""));
  }, MELODY.length);
}

test.describe.configure({ mode: "parallel" });

test("Verzögerung abgleichen: Töne 140 ms nach den Klicks → etwa 140 ms, gespeichert je Kopfhörer-Zustand, feiner Schieber, Diagnose", async ({ page }) => {
  await open(page);
  await page.getByRole("tab", { name: "Mitspielen" }).click();
  await page.getByRole("button", { name: "Im Takt" }).click();
  await expect(page.getByTestId("latency-line")).toContainText("Verzögerung 120 ms (Standard)");
  await page.getByRole("button", { name: "abgleichen" }).click();
  await expect(page.getByTestId("fcal")).toBeVisible();
  await expect(page.getByTestId("fcal-for")).toHaveText("ohne Kopfhörer");
  await expect(page.getByTestId("fcal-val")).toHaveText("120 ms");
  await page.getByRole("button", { name: "Abgleich starten" }).click();
  await page.waitForFunction(() => !!(window as unknown as { __lied: { follow(): Dbg } }).__lied.follow().cal?.clicks);
  await page.waitForFunction(() => (window as unknown as { __osc: unknown }).__osc !== null);
  // Umschalter ist gesperrt, solange gemessen wird
  await expect(page.getByRole("tab", { name: "Anhören" })).toBeDisabled();
  const clicks = (await dbg(page)).cal!.clicks!;
  expect(clicks.length).toBe(8);
  expect(clicks[1] - clicks[0]).toBeCloseTo(750, 0);
  // zu jedem Klick ein kurzer Ton (verschiedene Töne), 140 ms danach
  const notes = [67, 72, 69, 74, 71, 67, 76, 72];
  await schedule(page, clicks.flatMap((c, k): [number, number | null][] => [[c + 140, hz(notes[k])], [c + 340, null]]));
  await expect(page.getByTestId("fcal-text")).toContainText("Dein Handy hört etwa", { timeout: 15000 });
  const ms = Number((await page.getByTestId("fcal-val").textContent())!.replace(/\D/g, ""));
  // 140 ms plus der kleine Weg der Attrappe bis zur Messung (Messfenster, Zeitraster 25 ms)
  expect(ms).toBeGreaterThanOrEqual(130);
  expect(ms).toBeLessThanOrEqual(200);
  await expect(page.getByTestId("fcal-text")).toContainText(`etwa ${ms} ms verzögert`);
  expect((await stored(page)).settings.inputLatencyMs).toEqual({ speaker: ms, headphones: null });
  expect(await page.evaluate(() => (window as unknown as { __micStopped: boolean }).__micStopped)).toBe(true);
  // feiner Schieber
  await page.getByTestId("fcal").getByRole("button", { name: "mehr" }).click();
  await expect(page.getByTestId("fcal-val")).toHaveText(`${ms + 10} ms`);
  expect((await stored(page)).settings.inputLatencyMs.speaker).toBe(ms + 10);
  await page.getByRole("button", { name: "Fertig" }).click();
  await expect(page.getByTestId("fcal")).toBeHidden();
  await expect(page.getByTestId("latency-line")).toContainText(`Verzögerung ${ms + 10} ms`);
  await expect(page.getByTestId("latency-line")).toContainText("ändern");
  // Diagnose vom Abgleich
  await expect(page.getByTestId("diag")).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("diag").click()]);
  const file = JSON.parse(readFileSync((await dl.path())!, "utf8"));
  expect(file.kind).toBe("abgleich");
  expect(file.events.find((e: { type: string }) => e.type === "ergebnis")).toMatchObject({ ok: true, ms, which: "speaker" });
  // mit Kopfhörern: eigener Wert, noch nicht abgeglichen (Standard 200 ms)
  await page.getByRole("switch", { name: /Kopfhörer/ }).click();
  await expect(page.getByTestId("latency-line")).toContainText("Verzögerung 200 ms");
  await expect(page.getByTestId("latency-line")).toContainText("mit Kopfhörern noch nicht abgeglichen");
  expect((await dbg(page)).latency).toEqual({ ms: 200, calibrated: false });
  await page.getByRole("button", { name: "abgleichen" }).click();
  await expect(page.getByTestId("fcal-for")).toHaveText("mit Kopfhörern");
  await expect(page.getByTestId("fcal-val")).toHaveText("200 ms");
});

test("Flöte etwa 30 Cent zu tief (ohne Einstellen): in beiden Modi grün; Werte werden nachgeführt", async ({ page }) => {
  await open(page);
  const cents = [-30, -42, -18, -35, -25, -44, -20];
  await start(page, "Wartet auf mich");
  await expect(page.getByTestId("flute-line")).toContainText("Tipp: Flöte einstellen");
  await playWait(page, cents);
  await finished(page, 9000);
  expect((await colors(page)).filter((c) => c === "hit").length).toBeGreaterThanOrEqual(6);
  // nach dem vollständigen Durchgang sind die nachgeführten Werte in der Flöte, und ihr (unbekannter)
  // Stimmton ist mit ermittelt: unter 440 Hz (das Nachführen ist langsam), die Werte liegen um ihn
  const fl = (await stored(page)).flutes[0];
  expect(Object.keys(fl.offsets).length).toBeGreaterThan(0);
  expect(fl.tuning.known).toBe(false);
  expect(fl.tuning.hz).toBeLessThan(439);
  expect(Object.values(fl.offsets as Record<string, number>).every((v) => Math.abs(v) < 20)).toBe(true);
  // im Takt
  await page.getByRole("button", { name: "Im Takt" }).click();
  await go(page).click();
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): Dbg } }).__lied.follow().started);
  await playBeat(page, cents);
  await finished(page);
  expect((await colors(page)).filter((c) => c === "hit").length).toBeGreaterThanOrEqual(6);
});

test("Diagnose: nach einem Durchgang „Diagnose speichern“ – JSON mit Kopf, Messungen und Ereignissen, kein Ton", async ({ page }) => {
  await open(page);
  await start(page, "Wartet auf mich");
  await expect(page.getByTestId("diag")).toBeHidden(); // während des Spielens nicht
  await playWait(page, [0, 0, 0, 0, 0, 0, 0]);
  await finished(page, 9000);
  await expect(page.getByTestId("diag")).toBeVisible();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("diag").click()]);
  expect(dl.suggestedFilename()).toMatch(/^floetentrainer-diagnose-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
  const f = JSON.parse(readFileSync((await dl.path())!, "utf8"));
  expect(f.info).toContain("kein Ton und keine Aufnahme");
  expect(f).toMatchObject({ format: 1, kind: "warten" });
  expect(f.meta).toMatchObject({ songId: SONG, tuningHz: 440, tuningKnown: false, headphones: false, latencyMs: 120, latencyCalibrated: false });
  expect(f.meta.flute).toMatchObject({ name: "Meine Flöte" });
  expect(f.meta.tones.map((t: { midi: number }) => t.midi)).toEqual(MELODY);
  expect(f.meta.mic.trackSettings).toBeTruthy();
  expect(f.meta.mic.context.sampleRate).toBeGreaterThan(0);
  expect(f.meta.userAgent).toContain("Chrome");
  expect(f.frames.length).toBeGreaterThan(50);
  expect(Object.keys(f.frames.find((x: { k?: string }) => x.k === "ziel"))).toEqual(expect.arrayContaining(["t", "f", "c", "r", "sf", "m", "ct", "n", "k"]));
  expect(f.events.filter((e: { type: string }) => e.type === "note").length).toBe(7);
  expect(JSON.stringify(f)).not.toMatch(/audio\/|base64|wav/i);
  await expect(page.getByTestId("diag")).toHaveText("Diagnose gespeichert");
});

test("Flöte einstellen mit verstimmten Tönen → Werte gespeichert → Mitspielen grün; Flöte wechseln", async ({ page }) => {
  await page.addInitScript(FAKE_AUDIO);
  await page.addInitScript(FAKE_MIC);
  await seed(page, data({}, { lesen: "erste-toene", spielen: "erste-toene" }));
  await page.goto("./#/einstellungen");
  await expect(page.getByRole("heading", { name: "Flöte" })).toBeVisible();
  await expect(page.getByRole("radio", { name: /Meine Flöte/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: /Meine Flöte/ })).toContainText("Stimmton unbekannt · noch nicht eingestellt");
  await page.getByRole("button", { name: "„Meine Flöte“ einstellen" }).click();
  await expect(page.getByRole("heading", { name: "Flöte einstellen" })).toBeVisible();
  await page.waitForFunction(() => (window as unknown as { __osc: unknown }).__osc !== null);
  expect(await page.evaluate(() => (window as unknown as { __floete: { ids: string[] } }).__floete.ids)).toEqual(["g1", "a1", "h1"]);
  await expect(page.getByTestId("cal-sub")).toContainText("Ton 1 von 3");
  await expect(page.getByTestId("cal-q")).toHaveText("Spiel diesen Ton ruhig etwa 2 Sekunden.");
  // je Ton 2,2 s, verstimmt: g¹ −40, a¹ −46, h¹ −42 (ohne Profil läge das an der Halbton-Grenze). Der
  // Stimmton ist unbekannt: Er rückt nach jedem Ton auf die Mitte, am Ende −42 Cent ≈ 429,5 Hz.
  const plan: [number, number][] = [[67, -40], [69, -46], [71, -42]];
  const now = await page.evaluate(() => performance.now());
  await schedule(page, plan.flatMap(([m, c], k): [number, number | null][] => [[now + 200 + k * 4000, hz(m, c)], [now + 2400 + k * 4000, null]]));
  await expect(page.getByTestId("cal-status")).toContainText(/g1: ±0 Cent · Stimmton etwa (429,5|430) Hz/, { timeout: 5000 });
  await expect(page.getByTestId("cal-status")).toContainText("Fertig – alle Töne sind eingestellt.", { timeout: 15000 });
  for (const [id, c] of [["g1", "+2"], ["a1", "−4"], ["h1", "±0"]] as const) {
    await expect(page.getByTestId(`cal-val-${id}`)).toHaveText(c);
  }
  await expect(page.getByTestId("cal-tuning")).toHaveText("Stimmton unbekannt – etwa 429,5 Hz (ermittelt)");
  await expect(page.getByTestId("cal-sub")).toHaveText("Meine Flöte · etwa 429,5 Hz");
  const fl = (await stored(page)).flutes[0];
  expect(fl.offsets).toEqual({ g1: 2, a1: -4, h1: 0 });
  expect(fl.tuning.known).toBe(false);
  expect(fl.tuning.hz).toBeCloseTo(440 * 2 ** (-42 / 1200), 1);
  // ein Ton nachträglich, und ein falscher Ton: Hinweis
  await page.locator('.calcell[data-note="a1"]').click();
  await expect(page.getByTestId("cal-sub")).toContainText("einzelner Ton");
  const t2 = await page.evaluate(() => performance.now());
  await schedule(page, [[t2 + 150, hz(72)], [t2 + 2400, null]]);
  await expect(page.getByTestId("cal-status")).toContainText("Das war wohl ein anderer Ton (c2) – nochmal.", { timeout: 5000 });
  expect((await stored(page)).flutes[0].offsets.a1).toBe(-4);
  // Mitspielen: dieselben Abweichungen werden herausgerechnet
  await page.goto(`./#/lied/${SONG}`);
  await page.getByRole("tab", { name: "Mitspielen" }).click();
  await expect(page.getByTestId("flute-line")).toContainText("Meine Flöte");
  await expect(page.getByTestId("flute-line")).toContainText("Meine Flöte · etwa 429,5 Hz, wird ausgeglichen");
  await go(page).click();
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): Dbg } }).__lied.follow().started);
  await page.waitForFunction(() => (window as unknown as { __osc: unknown }).__osc !== null);
  expect((await dbg(page)).tuning).toMatchObject({ g1: 2, a1: -4, h1: 0 });
  const off: Record<number, number> = { 67: -40, 69: -46, 71: -42, 72: -42 };
  await playWait(page, MELODY.map((m, i) => off[m] + (i % 2 ? 6 : -6)));
  await finished(page, 9000);
  expect(await colors(page)).toEqual(Array(7).fill("hit"));
  // Flöte wechseln: neue Flöte ohne Werte, dann zurück
  await page.goto("./#/einstellungen");
  await page.getByRole("button", { name: "Flöte hinzufügen" }).click();
  await page.getByTestId("flute-new-name").fill("Holzflöte");
  await page.getByRole("button", { name: "Flöte anlegen" }).click();
  await expect(page.getByRole("radio", { name: /Holzflöte/ })).toHaveAttribute("aria-checked", "true");
  let d = await stored(page);
  expect(d.flutes.map((f: { name: string }) => f.name)).toEqual(["Meine Flöte", "Holzflöte"]);
  expect(d.activeFlute).toBe(d.flutes[1].id);
  await page.goto(`./#/lied/${SONG}`);
  await page.getByRole("tab", { name: "Mitspielen" }).click();
  await expect(page.getByTestId("flute-line")).toContainText("Holzflöte · Tipp: Flöte einstellen");
  await page.getByTestId("flute-name").click();
  await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
  await page.getByRole("radio", { name: /Meine Flöte/ }).click();
  await page.getByRole("button", { name: "Löschen" }).click();
  await expect(page.getByText("„Meine Flöte“ wirklich löschen?")).toBeVisible();
  await page.getByRole("button", { name: "Abbrechen" }).first().click();
  d = await stored(page);
  expect(d.activeFlute).toBe("floete-1");
  expect(d.flutes.length).toBe(2);
});

test("Stimmgerät: Abweichung zum Stimmton der Flöte, dazu klein der Wert des Tons in der Flöte", async ({ page }) => {
  await page.addInitScript(FAKE_MIC);
  await seed(page, data({ flutes: [{ id: "floete-1", name: "Meine Flöte", tuning: { hz: 440, known: true }, offsets: { a1: -25 }, updated: 1 }], activeFlute: "floete-1" }));
  await page.goto("./");
  await page.getByRole("link", { name: "Stimmgerät" }).click();
  await page.waitForFunction(() => (window as unknown as { __osc: unknown }).__osc !== null);
  await page.evaluate((f) => (window as unknown as { __osc: { play(f: number): void } }).__osc.play(f), hz(69, -25));
  await expect(page.getByTestId("tuner-tuning")).toHaveText("Flöte: Meine Flöte · 440 Hz");
  await expect(page.getByTestId("tuner-name")).toHaveText("a1");
  await expect(page.getByTestId("tuner-cents")).toHaveText(/−2[3-7] Cent/);
  await expect(page.getByTestId("tuner-flute")).toHaveText("Deine Flöte bei a1: −25");
  await page.evaluate((f) => (window as unknown as { __osc: { play(f: number): void } }).__osc.play(f), hz(71));
  await expect(page.getByTestId("tuner-name")).toHaveText("h1");
  await expect(page.getByTestId("tuner-flute")).toHaveText("");
});
