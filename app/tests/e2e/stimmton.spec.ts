// Stimmton je Flöte (Wunsch vom 14.11.2026): neue Flöte mit bekanntem Stimmton 442, Kinderflöte mit
// unbekanntem Stimmton einstellen, Flöte wechseln im Stimmgerät. Mikrofon-Attrappe wie in follow-robust.spec.ts.
import { expect, test, type Page } from "@playwright/test";
import { soundingFreq } from "../../src/music/notes";
import { FAKE_AUDIO } from "./fake-audio";
import { sampleData } from "./seed";
import { FAKE_MIC, seed, stored } from "./util";

const ABC = "X:1\nT:Kurz\nM:4/4\nL:1/4\nQ:1/4=120\nK:G\nG A B B | c A G2 |]\n";
const SONG = "abc-kurz";
const MELODY = [67, 69, 71, 71, 72, 69, 67];
/** klingende Frequenz bei Stimmton a, um cents verstimmt */
const hz = (midi: number, cents = 0, a = 440) => soundingFreq(midi, a) * Math.pow(2, cents / 1200);
const KID = 440 * 2 ** (-30 / 1200); // ≈ 432,45 Hz

function data(extra: Record<string, unknown> = {}) {
  return {
    ...sampleData({ lesen: "erste-toene", spielen: "erste-toene" }),
    version: 2,
    ownSongs: [{ id: SONG, title: "Kurz", abc: ABC, number: 1, index: 0, shift: 0, added: 0 }],
    ...extra,
  };
}

const schedule = (page: Page, list: [number, number | null][]) =>
  page.evaluate((l) => (window as unknown as { __osc: { schedule(l: [number, number | null][]): void } }).__osc.schedule(l), list);
const osc = (page: Page) => page.waitForFunction(() => (window as unknown as { __osc: unknown }).__osc !== null);

/** Warte-Modus mitspielen: Noten ab jetzt + 150 ms, je 300 ms und 150 ms Stille; gibt die Farben zurück */
async function playAlong(page: Page, freq: (midi: number, i: number) => number) {
  await page.goto(`./#/lied/${SONG}`);
  await expect(page.locator(".score svg.sys").first()).toBeVisible();
  await page.getByRole("tab", { name: "Mitspielen" }).click();
  await page.getByRole("button", { name: "Wartet auf mich" }).click();
  await page.locator('[data-act="fstart"]').click();
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): { started: boolean } } }).__lied.follow().started);
  await osc(page);
  const now = await page.evaluate(() => performance.now());
  let t = now + 150;
  const list: [number, number | null][] = [];
  MELODY.forEach((m, i) => {
    list.push([t, freq(m, i)], [t + 300, null]);
    t += 450;
  });
  await schedule(page, list);
  await page.waitForFunction(() => {
    const f = (window as unknown as { __lied: { follow(): { active: boolean; running: boolean } } }).__lied.follow();
    return f.active && !f.running;
  }, null, { timeout: 9000 });
  return page.evaluate((n) => {
    const gs = [...document.querySelectorAll<SVGGElement>(".score g.n")].sort((a, b) => Number(a.dataset.id) - Number(b.dataset.id));
    return gs.slice(0, n).map((g) => (g.classList.contains("hit") ? "hit" : g.classList.contains("miss") ? "miss" : ""));
  }, MELODY.length);
}

test.describe.configure({ mode: "parallel" });

test("neue Flöte mit 442 Hz anlegen → Mitspielen mit 442-Attrappe grün (gegen 440 lägen die Töne über der Halbton-Grenze)", async ({ page }) => {
  await page.addInitScript(FAKE_AUDIO);
  await page.addInitScript(FAKE_MIC);
  await seed(page, data());
  await page.goto("./#/einstellungen");
  await page.getByRole("button", { name: "Flöte hinzufügen" }).click();
  await expect(page.getByText("Weißt du, auf welchen Stimmton die Flöte gestimmt ist?")).toBeVisible();
  await expect(page.getByTestId("flute-add")).toContainText("z. B. 442 Hz");
  await expect(page.getByTestId("flute-add").getByRole("button", { name: "Weiß nicht" })).toHaveAttribute("aria-pressed", "true");
  await page.getByTestId("flute-new-name").fill("Neue Flöte");
  await page.getByTestId("flute-add").getByRole("button", { name: "442 Hz" }).click();
  // nach dem Wählen bleibt der Name; zum Einstellen wird trotzdem ermuntert
  await expect(page.getByTestId("flute-new-name")).toHaveValue("Neue Flöte");
  await expect(page.getByTestId("flute-add")).toContainText("Ton für Ton einstellen");
  await expect(page.getByTestId("val-new-hz")).toHaveText("442 Hz");
  await page.getByRole("button", { name: "Flöte anlegen" }).click();
  await expect(page.getByRole("radio", { name: /Neue Flöte/ })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: /Neue Flöte/ })).toContainText("Stimmton 442 Hz · noch nicht eingestellt");
  await expect(page.getByTestId("fl-tuning-info")).toContainText("für genauere Wertung Ton für Ton einstellen");
  const d = await stored(page);
  expect(d.flutes[1]).toMatchObject({ name: "Neue Flöte", tuning: { hz: 442, known: true }, offsets: {} });
  expect(d.settings.tuningHz).toBeUndefined();
  // Mitspielen: 44 Cent über 442 Hz (gegen 440 wären das 52 Cent – schon der Nachbarton)
  const c = await playAlong(page, (m) => hz(m, 44, 442));
  await expect(page.getByTestId("flute-line")).toContainText("Neue Flöte · 442 Hz");
  expect(c).toEqual(Array(7).fill("hit"));
});

test("Kinderflöte mit unbekanntem Stimmton einstellen (−30 Cent) → „etwa 432 Hz“, Mitspielen grün; bekannt/unbekannt umschalten", async ({ page }) => {
  await page.addInitScript(FAKE_AUDIO);
  await page.addInitScript(FAKE_MIC);
  await seed(page, data({ flutes: [{ id: "floete-1", name: "Kinderflöte", tuning: { hz: 440, known: false }, offsets: {}, updated: 0 }], activeFlute: "floete-1" }));
  await page.goto("./#/einstellungen");
  await expect(page.getByTestId("fl-tuning-info")).toHaveText("unbekannt – wird beim Einstellen ermittelt");
  await expect(page.getByTestId("fl-tuning").getByRole("button", { name: "Weiß nicht" })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "„Kinderflöte“ einstellen" }).click();
  await osc(page);
  // um −30 Cent mit Eigenheiten: g¹ −36, a¹ −24, h¹ −32 (Mitte −32 → 431,96 Hz)
  const plan: [number, number][] = [[67, -36], [69, -24], [71, -32]];
  const now = await page.evaluate(() => performance.now());
  await schedule(page, plan.flatMap(([m, c], k): [number, number | null][] => [[now + 200 + k * 4000, hz(m, c)], [now + 2400 + k * 4000, null]]));
  await expect(page.getByTestId("cal-status")).toContainText("Fertig – alle Töne sind eingestellt.", { timeout: 15000 });
  await expect(page.getByTestId("cal-tuning")).toHaveText("Stimmton unbekannt – etwa 432 Hz (ermittelt)");
  for (const [id, v] of [["g1", "−4"], ["a1", "+8"], ["h1", "±0"]] as const) await expect(page.getByTestId(`cal-val-${id}`)).toHaveText(v);
  let fl = (await stored(page)).flutes[0];
  expect(fl.tuning.known).toBe(false);
  expect(fl.tuning.hz).toBeCloseTo(440 * 2 ** (-32 / 1200), 1);
  // Einstellungen zeigen den ermittelten Stimmton
  await page.getByRole("button", { name: "Zurück zu den Einstellungen" }).click();
  await expect(page.getByRole("radio", { name: /Kinderflöte/ })).toContainText("Stimmton unbekannt – etwa 432 Hz (ermittelt) · 3 Töne eingestellt");
  await expect(page.getByTestId("fl-hz-est")).toHaveText("etwa 432 Hz");
  // Mitspielen um −30 (c² ungemessen: beim Stimmton der Flöte erwartet)
  const c = await playAlong(page, (m, i) => hz(m, -30 + (i % 2 ? 5 : -5)));
  expect(c).toEqual(Array(7).fill("hit"));
  await expect(page.getByTestId("flute-line")).toContainText(/Kinderflöte · etwa 43\d(,5)? Hz/);
  // umschalten: bekannt 442 → Werte umgerechnet, absolute Lagen bleiben; zurück auf unbekannt
  await page.goto("./#/einstellungen");
  fl = (await stored(page)).flutes[0];
  const abs = (f: { tuning: { hz: number }; offsets: Record<string, number> }) =>
    Object.fromEntries(Object.entries(f.offsets).map(([k, v]) => [k, 1200 * Math.log2(f.tuning.hz / 440) + v]));
  const abs0 = abs(fl);
  await page.getByTestId("fl-tuning").getByRole("button", { name: "442 Hz" }).click();
  await expect(page.getByTestId("val-fl-hz")).toHaveText("442 Hz");
  // (das Mitspielen hat die Werte ein wenig nachgeführt: gemessen jetzt etwa 431,5–432 Hz)
  await expect(page.getByTestId("fl-tuning-info")).toContainText(/angegeben · gemessen etwa 43[12](,5)? Hz/);
  fl = (await stored(page)).flutes[0];
  expect(fl.tuning).toEqual({ hz: 442, known: true });
  for (const [k, v] of Object.entries(abs(fl))) expect(v).toBeCloseTo(abs0[k], 1);
  // gemessen weicht deutlich ab: übernehmen (auf 0,5 Hz), dann fein in ganzen Hz
  await page.getByRole("button", { name: "übernehmen", exact: true }).click();
  await expect(page.getByTestId("val-fl-hz")).toHaveText(/^43[12](,5)? Hz$/);
  const adopted = (await stored(page)).flutes[0].tuning.hz;
  expect(Math.abs(adopted - 432)).toBeLessThanOrEqual(1);
  await page.getByTestId("fl-tuning").getByRole("button", { name: "mehr" }).click();
  await expect(page.getByTestId("val-fl-hz")).toHaveText(`${Math.floor(adopted) + 1} Hz`);
  await page.getByTestId("fl-tuning").getByRole("button", { name: "Weiß nicht" }).click();
  await expect(page.getByTestId("fl-hz-est")).toHaveText(/^etwa 43[12](,5)? Hz$/);
  fl = (await stored(page)).flutes[0];
  expect(fl.tuning.known).toBe(false);
  for (const [k, v] of Object.entries(abs(fl))) expect(v).toBeCloseTo(abs0[k], 1);
});

test("bekannter Stimmton 442: Einstellen misst die Töne relativ zur Angabe, zeigt „gemessen etwa …“ und bietet Übernehmen an", async ({ page }) => {
  await page.addInitScript(FAKE_AUDIO);
  await page.addInitScript(FAKE_MIC);
  await seed(page, data({ flutes: [{ id: "floete-1", name: "Neue", tuning: { hz: 442, known: true }, offsets: {}, updated: 0 }], activeFlute: "floete-1" }));
  await page.goto("./#/floete");
  await page.getByRole("button", { name: "Mikrofon einschalten" }).click();
  await osc(page);
  await expect(page.getByTestId("cal-tuning")).toHaveText("Stimmton 442 Hz (angegeben)");
  // gegen 442: g¹ −16, a¹ −10, h¹ −22 (Mitte −16 → etwa 438 Hz)
  const plan: [number, number][] = [[67, -16], [69, -10], [71, -22]];
  const now = await page.evaluate(() => performance.now());
  await schedule(page, plan.flatMap(([m, c], k): [number, number | null][] => [[now + 200 + k * 4000, hz(m, c, 442)], [now + 2400 + k * 4000, null]]));
  await expect(page.getByTestId("cal-status")).toContainText("g1: −16 Cent", { timeout: 5000 });
  await expect(page.getByTestId("cal-status")).toContainText("Fertig – alle Töne sind eingestellt.", { timeout: 15000 });
  for (const [id, v] of [["g1", "−16"], ["a1", "−10"], ["h1", "−22"]] as const) await expect(page.getByTestId(`cal-val-${id}`)).toHaveText(v);
  await expect(page.getByTestId("cal-tuning")).toHaveText("Stimmton angegeben 442 Hz · gemessen etwa 438 Hz");
  await expect(page.getByTestId("cal-adopt")).toContainText("etwa 16 Cent tiefer als angegeben");
  expect((await stored(page)).flutes[0].tuning).toEqual({ hz: 442, known: true });
  await page.getByRole("button", { name: "Gemessenen Wert als Stimmton übernehmen" }).click();
  await expect(page.getByTestId("cal-tuning")).toHaveText("Stimmton angegeben 438 Hz · gemessen etwa 438 Hz");
  await expect(page.getByTestId("cal-adopt")).toBeHidden();
  const fl = (await stored(page)).flutes[0];
  expect(fl.tuning).toEqual({ hz: 438, known: true });
  // absolute Lagen bleiben: g¹ lag bei 442 − 16 Cent
  expect(1200 * Math.log2(438 / 442) + fl.offsets.g1).toBeCloseTo(-16, 0);
});

test("Flöte wechseln ändert den Bezug des Stimmgeräts", async ({ page }) => {
  await page.addInitScript(FAKE_MIC);
  await seed(
    page,
    data({
      flutes: [
        { id: "floete-1", name: "Neue", tuning: { hz: 442, known: true }, offsets: {}, updated: 0 },
        { id: "floete-2", name: "Kinderflöte", tuning: { hz: KID, known: false }, offsets: { a1: 0, e1: -15 }, updated: 1 },
      ],
      activeFlute: "floete-1",
    }),
  );
  await page.goto("./#/stimmgeraet");
  await page.getByRole("button", { name: "Mikrofon einschalten" }).click();
  await osc(page);
  await expect(page.getByTestId("tuner-tuning")).toHaveText("Flöte: Neue · 442 Hz");
  await page.evaluate((f) => (window as unknown as { __osc: { play(f: number): void } }).__osc.play(f), hz(69, 0, 442));
  await expect(page.getByTestId("tuner-name")).toHaveText("a1");
  await expect(page.getByTestId("tuner-cents")).toHaveText(/^[−+±][0-2] Cent$/);
  await page.evaluate(() => (window as unknown as { __osc: { silence(): void } }).__osc.silence());
  // andere Flöte: derselbe Ton liegt 38 Cent über ihrem Stimmton; e¹ zeigt den Wert in der Flöte
  await page.goto("./#/einstellungen");
  await page.getByRole("radio", { name: /Kinderflöte/ }).click();
  await page.goto("./#/stimmgeraet");
  await page.getByRole("button", { name: "Mikrofon einschalten" }).click();
  await osc(page);
  await expect(page.getByTestId("tuner-tuning")).toHaveText("Flöte: Kinderflöte · etwa 432,5 Hz");
  await page.evaluate((f) => (window as unknown as { __osc: { play(f: number): void } }).__osc.play(f), hz(69, 0, 442));
  await expect(page.getByTestId("tuner-cents")).toHaveText(/^\+3[6-9] Cent$/);
  await page.evaluate((f) => (window as unknown as { __osc: { play(f: number): void } }).__osc.play(f), hz(64, -15, KID));
  await expect(page.getByTestId("tuner-name")).toHaveText("e1");
  await expect(page.getByTestId("tuner-cents")).toHaveText(/−1[3-7] Cent/);
  await expect(page.getByTestId("tuner-flute")).toHaveText("Kinderflöte bei e1: −15");
});
