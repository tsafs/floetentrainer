// Spielen: Das Mikrofon wird durch einen Oszillator ersetzt, den der Test steuert.
import { expect, test, type Page } from "@playwright/test";
import { note, soundingFreq } from "../../src/music/notes";
import { sampleData } from "./seed";
import { FAKE_MIC } from "./util";

async function setup(page: Page, data: unknown = sampleData()) {
  await page.addInitScript(FAKE_MIC);
  await page.addInitScript((d) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("floetentrainer", JSON.stringify(d));
      sessionStorage.setItem("seeded", "1");
    }
  }, data);
  await page.goto("./");
}

const main = (page: Page) => page.locator("main");
const target = async (page: Page) => (await main(page).getAttribute("data-note"))!;
const play = (page: Page, id: string) => page.evaluate((f) => (window as never as { __osc: { play(f: number): void } }).__osc.play(f), soundingFreq(note(id)));
const silence = (page: Page) => page.evaluate(() => (window as never as { __osc: { silence(): void } }).__osc.silence());
const lastAnswer = (page: Page, id: string) =>
  page.evaluate((n) => JSON.parse(localStorage.getItem("floetentrainer")!).history.spielen[n].at(-1)[0], id);

/** ein anderer Ton der Grifftabelle, nicht in der Oktave */
function other(id: string): string {
  const all = ["g1", "a1", "h1", "c2", "d2", "e1", "f1"];
  return all.find((x) => x !== id && Math.abs(note(x).midi - note(id).midi) !== 12)!;
}

async function startPlaying(page: Page) {
  await page.getByRole("button", { name: /Spielen/ }).click();
  await expect(main(page)).toHaveAttribute("data-kind", "spiel");
  await page.waitForFunction(() => (window as never as { __osc: unknown }).__osc !== null);
}

test("richtig gespielt: grünes Feld, geht von selbst weiter, zeigt was die App hört", async ({ page }) => {
  await setup(page);
  await startPlaying(page);
  const t = await target(page);
  await page.waitForTimeout(450);
  await play(page, t);
  await expect(page.locator(".listen .heard")).toContainText(note(t).name);
  await expect(page.getByTestId("panel")).toContainText("Richtig");
  expect(await lastAnswer(page, t)).toBe(1);
  await expect(page.getByTestId("count")).toHaveText("2 von 20", { timeout: 4000 });
});

test("erst falsch, dann richtig: zählt als Fehler", async ({ page }) => {
  await setup(page);
  await startPlaying(page);
  const t = await target(page);
  const wrong = other(t);
  await page.waitForTimeout(450);
  await play(page, wrong);
  await expect(page.getByTestId("panel")).toContainText(`Du spielst ${note(wrong).name}`);
  await expect(page.locator(".panel .flute")).toHaveAttribute("data-fingering", note(t).fingering);
  await play(page, t);
  await expect(page.getByTestId("panel")).toContainText("Jetzt stimmt es");
  expect(await lastAnswer(page, t)).toBe(0);
  const hist = await page.evaluate((n) => JSON.parse(localStorage.getItem("floetentrainer")!).history.spielen[n], t);
  await expect(page.getByTestId("count")).toHaveText("2 von 20", { timeout: 4000 });
  // nur ein Eintrag für diese Karte
  const after = await page.evaluate((n) => JSON.parse(localStorage.getItem("floetentrainer")!).history.spielen[n], t);
  expect(after.length).toBe(hist.length);
});

test("Nachklang der vorigen Karte zählt nicht", async ({ page }) => {
  await setup(page);
  await startPlaying(page);
  const t1 = await target(page);
  await page.waitForTimeout(450);
  await play(page, t1);
  await expect(page.getByTestId("panel")).toContainText("Richtig");
  // Ton klingt weiter, während die nächste Karte kommt
  await expect(page.getByTestId("count")).toHaveText("2 von 20", { timeout: 4000 });
  const t2 = await target(page);
  expect(t2).not.toBe(t1);
  await page.waitForTimeout(1500);
  await expect(main(page)).not.toHaveClass(/\berr\b/);
  await expect(page.getByTestId("panel")).toHaveCount(0);
  // Stille, dann der richtige Ton
  await silence(page);
  await page.waitForTimeout(250);
  await play(page, t2);
  await expect(page.getByTestId("panel")).toContainText("Richtig");
  expect(await lastAnswer(page, t2)).toBe(1);
});

test("Tonwechsel ohne Pause ist ein neuer Einsatz", async ({ page }) => {
  await setup(page);
  await startPlaying(page);
  const t1 = await target(page);
  await page.waitForTimeout(450);
  await play(page, t1);
  await expect(page.getByTestId("count")).toHaveText("2 von 20", { timeout: 4000 });
  const t2 = await target(page);
  await page.waitForTimeout(500);
  await play(page, t2); // direkt vom alten zum neuen Ton
  await expect(page.getByTestId("panel")).toContainText("Richtig");
  expect(await lastAnswer(page, t2)).toBe(1);
});

test("„Weiß nicht“ beim Spielen: Griffbild, danach darf gespielt werden", async ({ page }) => {
  await setup(page);
  await startPlaying(page);
  const t = await target(page);
  await page.getByRole("button", { name: "Weiß nicht" }).click();
  await expect(page.getByTestId("panel")).toContainText("Auflösung");
  await expect(page.locator(".panel .flute")).toHaveAttribute("data-fingering", note(t).fingering);
  await play(page, t);
  await expect(page.getByTestId("panel")).toContainText("Jetzt stimmt es");
  expect(await lastAnswer(page, t)).toBe(0);
});

test("Stimmgerät zeigt die gehörte Note", async ({ page }) => {
  await setup(page);
  await page.getByRole("link", { name: "Stimmgerät" }).click();
  await page.waitForFunction(() => (window as never as { __osc: unknown }).__osc !== null);
  await play(page, "fis1");
  await expect(page.getByTestId("tuner-name")).toHaveText("fis1");
  await expect(page.getByTestId("tuner-staff").locator("svg")).toHaveAttribute("data-note", "fis1");
  await play(page, "b1");
  await expect(page.getByTestId("tuner-name")).toHaveText("b1");
});

test("Mikrofon verweigert: verständliche Erklärung", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error("nein"), { name: "NotAllowedError" }));
  });
  await page.goto("./");
  await page.getByRole("button", { name: /Spielen/ }).click();
  await expect(page.getByRole("heading", { name: "Das Mikrofon ist nicht erlaubt" })).toBeVisible();
  await expect(page.getByText("Bei „Mikrofon“ auf „Zulassen“ stellen.")).toBeVisible();
});
