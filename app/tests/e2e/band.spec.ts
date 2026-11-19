// Spielen als Notenband (docs/app-notenband.md) mit der Mikrofon-Attrappe.
import { expect, test, type Page } from "@playwright/test";
import { note, soundingFreq } from "../../src/music/notes";
import { sampleData } from "./seed";
import { FAKE_MIC } from "./util";

async function setup(page: Page, data: unknown = sampleData(), settings: Record<string, unknown> = {}) {
  await page.addInitScript(FAKE_MIC);
  await page.addInitScript(
    ([d, s]) => {
      if (!sessionStorage.getItem("seeded")) {
        const x = d as { settings?: Record<string, unknown> };
        x.settings = { ...(x.settings ?? {}), ...(s as Record<string, unknown>) };
        localStorage.setItem("floetentrainer", JSON.stringify(x));
        sessionStorage.setItem("seeded", "1");
      }
    },
    [data, settings] as const,
  );
  await page.goto("./");
}

const main = (page: Page) => page.locator("main");
const stored = (page: Page) => page.evaluate(() => JSON.parse(localStorage.getItem("floetentrainer")!));
const silence = (page: Page) => page.evaluate(() => (window as never as { __osc: { silence(): void } }).__osc.silence());
const playNow = (page: Page, id: string) =>
  page.evaluate((f) => (window as never as { __osc: { play(f: number): void } }).__osc.play(f), soundingFreq(note(id)));

async function start(page: Page) {
  await page.getByRole("button", { name: /Spielen/ }).click();
  await page.waitForFunction(() => (window as never as { __osc: unknown }).__osc !== null);
  await expect(main(page)).toHaveAttribute("data-step", "band");
}

/** Den Ton an der Marke spielen (600 ms, dann absetzen) und warten, bis die Marke weiterrückt */
async function playCur(page: Page, id?: string) {
  const i = Number(await main(page).getAttribute("data-i"));
  const t = id ?? (await main(page).getAttribute("data-note"))!;
  const t0 = await page.evaluate(() => performance.now() + 50);
  await page.evaluate(
    (l) => (window as never as { __osc: { schedule(l: [number, number | null][]): void } }).__osc.schedule(l),
    [
      [t0, soundingFreq(note(t))],
      [t0 + 600, null],
    ] as [number, number | null][],
  );
  await expect(main(page)).not.toHaveAttribute("data-i", String(i), { timeout: 4000 });
  await page.waitForTimeout(120);
}

test("Band läuft mit: richtig gespielt → grün, Marke rückt weiter, Abschnitte zählen", async ({ page }) => {
  await setup(page);
  await start(page);
  const view = page.locator(".bandview");
  await expect(view.locator("svg.sys")).toHaveCount(1);
  await expect(page.locator(".bandtrack g.n.cur")).toHaveCount(1);
  await page.waitForTimeout(400);
  // erst den ersten Abschnitt ganz spielen
  const notes = (await view.getAttribute("data-notes"))!.split(" ");
  for (let k = 0; k < 7; k++) await playCur(page);
  expect(await page.locator(".bandtrack g.n.hit").count()).toBeGreaterThanOrEqual(6);
  await expect(page.getByTestId("count")).toContainText("Töne");
  if (process.env.SHOTS) await page.screenshot({ path: "shots/band-1.png" });
  const d = await stored(page);
  // der erste Ton hat eine neue Antwort (richtig)
  expect(d.history.spielen[notes[0]].at(-1)[0]).toBe(1);
});

test("falscher Ton: Note rot, Hinweis, wartet auf den richtigen", async ({ page }) => {
  await setup(page);
  await start(page);
  await page.waitForTimeout(400);
  const t = (await main(page).getAttribute("data-note"))!;
  const wrong = ["g1", "d2", "a1"].find((x) => x !== t && Math.abs(note(x).midi - note(t).midi) > 2)!;
  await playNow(page, wrong);
  await expect(page.locator(".prac.band .q")).toContainText(`Du spielst ${note(wrong).name}`);
  await expect(page.locator(".bandtrack g.n.cur.miss")).toHaveCount(1);
  await expect(main(page)).toHaveAttribute("data-i", "0");
  if (process.env.SHOTS) await page.screenshot({ path: "shots/band-2-falsch.png" });
  await silence(page);
  await page.waitForTimeout(150);
  await playCur(page, t);
  await expect(main(page)).toHaveAttribute("data-i", "1");
  await expect(page.locator(".bandtrack g.n.miss")).toHaveCount(1);
});

test("Überspringen und Ende: Ergebnis in Tönen", async ({ page }) => {
  await setup(page, sampleData(), { bandNotes: 20 });
  await start(page);
  await page.waitForTimeout(300);
  for (let k = 0; k < 60; k++) {
    if ((await main(page).getAttribute("data-step")) !== "band") break;
    if (k % 3 === 0) {
      const i = await main(page).getAttribute("data-i");
      await page.getByRole("button", { name: "Überspringen" }).click();
      await expect(main(page)).not.toHaveAttribute("data-i", i!);
    } else await playCur(page).catch(() => {});
    if (await page.locator("main.summary").count()) break;
  }
  await expect(page.locator("main.summary")).toBeVisible({ timeout: 5000 });
  await expect(page.getByTestId("score")).toContainText("von");
  await expect(page.locator("main.summary")).toContainText("Tönen gleich richtig");
});

test("neuer Ton: erst die Vorstellung, dann das Band", async ({ page }) => {
  const d = sampleData();
  d.introduced.spielen = ["h1", "a1", "g1", "c2"]; // d² ist neu
  delete d.cards["d2|spiel"];
  await setup(page, d);
  await page.getByRole("button", { name: /Spielen/ }).click();
  await page.waitForFunction(() => (window as never as { __osc: unknown }).__osc !== null);
  await expect(main(page)).toHaveAttribute("data-step", "intro");
  await expect(main(page)).toHaveAttribute("data-note", "d2");
  await page.waitForTimeout(400);
  await playNow(page, "d2");
  await expect(page.getByTestId("panel")).toContainText("Richtig");
  await silence(page);
  await expect(main(page)).toHaveAttribute("data-step", "band", { timeout: 4000 });
  expect((await stored(page)).introduced.spielen).toContain("d2");
});

test("Vibrato ±30 Cent gilt als richtig; Tonwechsel ohne Absetzen ist ein neuer Einsatz", async ({ page }) => {
  await setup(page);
  await start(page);
  await page.evaluate(() => (window as never as { __osc: { wobble(c: number): void } }).__osc.wobble(30));
  await page.waitForTimeout(400);
  const first = (await main(page).getAttribute("data-note"))!;
  await playNow(page, first);
  await expect(main(page)).toHaveAttribute("data-i", "1", { timeout: 4000 });
  // ohne Pause gleich weiter zum nächsten Ton
  await page.waitForTimeout(300);
  await playNow(page, (await main(page).getAttribute("data-note"))!);
  await expect(main(page)).toHaveAttribute("data-i", "2", { timeout: 4000 });
  await expect(page.locator(".bandtrack g.n.hit")).toHaveCount(2);
});

test("Stufe geschafft: Hinweis auf das Stufenlied", async ({ page }) => {
  const d = sampleData();
  const day = d.days[d.days.length - 1];
  // alle Töne der Spielen-Stufe 2 sitzen schon: der erste fertige Abschnitt schaltet frei
  for (const n of ["h1", "a1", "g1", "c2", "d2"] as const) d.history.spielen[n] = Array.from({ length: 12 }, (_, i) => [1, day, Date.now() - 100000 + i]);
  await setup(page, d);
  await start(page);
  await page.waitForTimeout(400);
  for (let k = 0; k < 14; k++) {
    await playCur(page);
    if ((await stored(page)).stages.spielen !== "c2-d2") break;
  }
  await silence(page);
  await page.getByRole("button", { name: "Spielen beenden" }).click();
  await expect(page.getByTestId("unlock")).toContainText("Spielen · Stufe 3 erreicht");
  await expect(page.getByTestId("unlock-song")).toHaveText("Jetzt kannst du Hänschen klein ganz spielen.");
});

test.describe("Bildschirmfotos", () => {
  test.skip(!process.env.SHOTS, "nur mit SHOTS=1");
  for (const [w, h] of [[360, 740], [740, 360]]) {
    test(`Band ${w}×${h}`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await setup(page, sampleData(), { bandNotes: 80 });
      await start(page);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `shots/band-${w}x${h}-a.png` });
      // bis zum ersten Liedstück spielen
      for (let k = 0; k < 40; k++) {
        if ((await main(page).getAttribute("data-phrase")) === "song") break;
        await playCur(page);
      }
      await playCur(page);
      await page.waitForTimeout(500);
      await page.screenshot({ path: `shots/band-${w}x${h}-b-lied.png` });
    });
  }
});
