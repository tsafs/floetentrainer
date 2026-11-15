// Hören (Echo, docs/app-uebungen.md): vorgespielte Töne nachspielen bzw. die Namen tippen.
import { expect, test, type Page } from "@playwright/test";
import { note, soundingFreq } from "../../src/music/notes";
import { sampleData } from "./seed";
import { FAKE_MIC, seed, stored } from "./util";

const echo = (page: Page) => page.locator('main[data-step="echo"]');
const notesOf = async (page: Page) => (await echo(page).getAttribute("data-notes"))!.split(" ");

test("Namen tippen: erst hören, der erste Ton ist genannt, dann tippen; zählt nicht für die Stufen", async ({ page }) => {
  await seed(page, sampleData());
  await page.goto("./");
  await page.getByTestId("to-echo").click();
  const before = JSON.stringify((await stored(page)).history);
  await page.getByRole("button", { name: /Namen tippen/ }).click();
  await expect(page.getByTestId("count")).toHaveText("1 von 10");
  const notes = await notesOf(page);
  expect(notes.length).toBeGreaterThanOrEqual(2);
  expect(notes.length).toBeLessThanOrEqual(3);
  await expect(echo(page).locator(".first")).toContainText(`Der erste Ton ist ${note(notes[0]).name}`);
  // während des Vorspielens gesperrt, danach frei
  await expect(echo(page).locator(".q")).toHaveText("Hör zu …");
  await expect(echo(page).locator(".btns button").first()).toBeDisabled();
  await expect(echo(page).locator(".q")).toHaveText("Welche Töne waren es? Der Reihe nach.", { timeout: 6000 });
  // der erste ist aufgedeckt, die anderen verdeckt
  await expect(echo(page).locator(".sn.shown")).toHaveCount(1);
  for (const n of notes.slice(1)) await echo(page).locator(`.btns button[data-choice="${n}"]`).click();
  await expect(page.getByTestId("panel")).toContainText("Richtig");
  await expect(echo(page).locator(".sn.shown.hit")).toHaveCount(notes.length);
  await page.getByRole("button", { name: "Weiter" }).click();
  await expect(page.getByTestId("count")).toHaveText("2 von 10");
  // „Weiß nicht“ löst auf
  await page.getByRole("button", { name: "Weiß nicht" }).click();
  await expect(page.getByTestId("panel")).toContainText("Auflösung");
  await page.getByRole("button", { name: "Weiter" }).click();
  await page.getByRole("button", { name: "Beenden" }).click();
  await expect(page.getByTestId("score")).toHaveText("1 von 2");
  expect(JSON.stringify((await stored(page)).history)).toBe(before);
});

test("Nachspielen: nach dem Vorspielen hört das Mikrofon zu, gespielte Töne werden aufgedeckt", async ({ page }) => {
  await page.addInitScript(FAKE_MIC);
  await seed(page, sampleData());
  await page.goto("./#/hoeren");
  await page.getByRole("button", { name: /Nachspielen/ }).click();
  await page.waitForFunction(() => (window as never as { __osc: unknown }).__osc !== null);
  const notes = await notesOf(page);
  await expect(echo(page).locator(".q")).toHaveText("Jetzt du – spiel nach.", { timeout: 6000 });
  const list: [number, number | null][] = [];
  const t0 = await page.evaluate(() => performance.now() + 100);
  notes.forEach((id, k) => {
    list.push([t0 + k * 700, soundingFreq(note(id))]);
    list.push([t0 + k * 700 + 600, null]);
  });
  await page.evaluate((l) => (window as never as { __osc: { schedule(l: [number, number | null][]): void } }).__osc.schedule(l), list);
  await expect(page.getByTestId("panel")).toContainText("Richtig", { timeout: 8000 });
  await expect(echo(page).locator(".sn.shown.hit")).toHaveCount(notes.length);
  await page.getByRole("button", { name: "Beenden" }).click();
  await expect(page.getByTestId("score")).toHaveText("1 von 1");
  // auf der Ergebnisseite ist das Mikrofon wieder aus
  expect(await page.evaluate(() => (window as unknown as { __micStopped: boolean }).__micStopped)).toBe(true);
});

test("Nachspielen: Doppeltippen startet nur einen Durchgang; Verlassen gibt das Mikrofon frei", async ({ page }) => {
  await page.addInitScript(FAKE_MIC);
  await seed(page, sampleData());
  await page.goto("./#/hoeren");
  await page.getByRole("button", { name: /Nachspielen/ }).dblclick();
  await expect(page.getByTestId("count")).toHaveText("1 von 10");
  await page.goto("./#/");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __micStopped: boolean }).__micStopped)).toBe(true);
});
