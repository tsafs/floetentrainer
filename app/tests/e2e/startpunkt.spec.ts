// Willkommensseite und Startpunkt (docs/app-startpunkt.md).
import { expect, test } from "@playwright/test";
import { sampleData } from "./seed";
import { info, seed, stored } from "./util";

test("erster Start: Willkommensseite, „Von vorn beginnen“ führt zur Startseite und kommt nie wieder", async ({ page }) => {
  await seed(page, null);
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Willkommen" })).toBeVisible();
  await page.getByRole("button", { name: /Von vorn beginnen/ }).click();
  await expect(page.getByRole("heading", { name: "Flötentrainer" })).toBeVisible();
  const d = await stored(page);
  expect(d.start).toEqual({ lesen: "erste-toene", spielen: "erste-toene" });
  await page.reload();
  await expect(page.getByRole("heading", { name: "Flötentrainer" })).toBeVisible();
  // die erste Sitzung beginnt mit einer Vorstellung
  await page.getByRole("button", { name: /Üben/ }).click();
  expect((await info(page)).step).toBe("intro");
});

test("„Ich kann schon Noten“: Meilenstein wählen, die erste Sitzung kennt die Töne davor", async ({ page }) => {
  await seed(page, null);
  await page.goto("./");
  await page.getByRole("button", { name: /Ich kann schon Noten/ }).click();
  await expect(page.getByRole("heading", { name: "Wo steigst du ein?" })).toBeVisible();
  await expect(page.locator(".ms")).toHaveCount(5);
  // „Ganz von vorn“ ohne Notenzeile; „Alle Töne“ (25) in drei Zeilen
  await expect(page.locator(".ms").first().locator(".staff")).toHaveCount(0);
  await expect(page.locator(".ms").last().locator(".staff")).toHaveCount(3);
  await expect(page.locator(".ms").nth(1).locator(".staff .old")).toHaveCount(0);
  await expect(page.locator(".ms").nth(2).locator(".staff .old")).toHaveCount(5);
  await expect(page.getByTestId("between")).toContainText("Dazwischen?");
  // Abbrechen
  await page.getByRole("button", { name: /^Hohe Töne bis/ }).click();
  await expect(page.getByTestId("confirm")).toContainText("gelten als bekannt");
  await page.getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.getByTestId("confirm")).toHaveCount(0);
  // Wählen
  await page.getByRole("button", { name: /^Hohe Töne bis/ }).click();
  await page.getByRole("button", { name: "Hier beginnen" }).click();
  await expect(page.getByRole("heading", { name: "Flötentrainer" })).toBeVisible();
  await expect(page.locator(".track").first()).toContainText("Stufe 9");
  await expect(page.locator(".track").nth(1)).toContainText("Stufe 9");
  const d = await stored(page);
  expect(d.start).toEqual({ lesen: "b-toene", spielen: "b-toene" });
  expect(d.cards["h1|name"].box).toBe(3);
  // Die Sitzung stellt nur b¹ und es¹ vor
  await page.getByRole("button", { name: /Üben/ }).click();
  const i = await info(page);
  expect(i.step).toBe("intro");
  expect(["b1", "es1"]).toContain(i.note);
});

test("zurück von der Meilenstein-Wahl zur Willkommensseite", async ({ page }) => {
  await seed(page, null);
  await page.goto("./");
  await page.getByRole("button", { name: /Ich kann schon Noten/ }).click();
  await page.getByRole("link", { name: "Zurück" }).click();
  await expect(page.getByRole("heading", { name: "Willkommen" })).toBeVisible();
});

test("wer die App schon benutzt, sieht keine Willkommensseite", async ({ page }) => {
  await seed(page, sampleData());
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Flötentrainer" })).toBeVisible();
});

test("Startpunkt ändern über Fortschritt: zurück, nur Lesen, Spielen geht mit", async ({ page }) => {
  await seed(page, { ...sampleData({ lesen: "fis1", spielen: "fis1" }) });
  await page.goto("./#/fortschritt");
  await page.getByTestId("to-startpoint").click();
  await expect(page.getByRole("heading", { name: "Startpunkt" })).toBeVisible();
  await expect(page.getByTestId("current")).toContainText("Lesen: Stufe 4");
  // Spielen-Meilensteine über der Lesen-Stufe sind gesperrt
  await page.getByRole("button", { name: "nur Spielen" }).click();
  await expect(page.getByRole("button", { name: /^Hohe Töne bis/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: /^Erste Oktave/ })).toBeDisabled();
  await page.getByRole("button", { name: "nur Lesen" }).click();
  await page.getByRole("button", { name: /^Erste Oktave/ }).click();
  await page.getByRole("button", { name: "Hier beginnen" }).click();
  await expect(page.locator(".track").first()).toContainText("Stufe 7");
  await expect(page.locator(".track").nth(1)).toContainText("Stufe 4");
  // ganz von vorn (beide): Lesen und Spielen auf 1, geübte Töne behalten ihre Karten
  await page.goto("./#/startpunkt");
  await expect(page.locator(".ms.cur")).toContainText("Erste Oktave");
  await page.getByRole("button", { name: /^Ganz von vorn/ }).click();
  await expect(page.getByTestId("confirm")).toContainText("Deine bisherigen Antworten bleiben erhalten");
  await page.getByRole("button", { name: "Hier beginnen" }).click();
  await expect(page.locator(".track").first()).toContainText("Stufe 1");
  await expect(page.locator(".track").nth(1)).toContainText("Stufe 1");
  const d = await stored(page);
  expect(d.cards["e1|name"].box).toBe(3); // aus den Beispieldaten, geübt
  expect(d.cards["e2|name"]).toBeUndefined(); // nur angenommen → wieder neu
});

test("Einstellungen verweisen auf den Startpunkt", async ({ page }) => {
  await seed(page, sampleData());
  await page.goto("./#/einstellungen");
  await page.getByRole("link", { name: "Startpunkt wählen" }).click();
  await expect(page.getByRole("heading", { name: "Startpunkt" })).toBeVisible();
});
