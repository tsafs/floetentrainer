// Menü oben rechts: Öffnen, Schließen auf allen Wegen, Einträge, Markierung, wo es fehlt.
import { expect, test, type Page } from "@playwright/test";
import { sampleData } from "./seed";
import { answer, FAKE_MIC, menuTo, next, seed, skipIntros } from "./util";

const menuBtn = (page: Page) => page.getByRole("button", { name: "Menü", exact: true });
const menu = (page: Page) => page.getByRole("dialog", { name: "Menü" });

async function openMenu(page: Page) {
  await menuBtn(page).click();
  await expect(menu(page)).toBeVisible();
  await expect(menuBtn(page)).toHaveAttribute("aria-expanded", "true");
}

test("Einträge in der abgestimmten Reihenfolge, Fokus auf dem ersten, aktuelle Seite markiert", async ({ page }) => {
  await seed(page, sampleData());
  await page.goto("./");
  await expect(menu(page)).toBeHidden();
  await expect(menuBtn(page)).toHaveAttribute("aria-controls", "menu");
  await openMenu(page);
  const links = menu(page).getByRole("link");
  await expect(links).toHaveText(["Startseite", "Lieder", "Fortschritt", "Grifftabelle", "Stimmgerät", "Flöte einstellen", "Einstellungen"]);
  await expect(links.first()).toBeFocused();
  await expect(menu(page).locator('[aria-current="page"]')).toHaveText("Startseite");
  // Der Rest der Seite ist gesperrt
  await expect(page.locator("#app")).toHaveJSProperty("inert", true);

  await page.goto("./#/griffe");
  await openMenu(page);
  await expect(menu(page).locator('[aria-current="page"]')).toHaveText("Grifftabelle");
});

test("Schließen: ×, Abdunklung, Escape, Zurück – Fokus zurück auf den Knopf, Seite und Adresse bleiben", async ({ page }) => {
  await seed(page, sampleData());
  await page.goto("./#/einstellungen");
  const before = await page.evaluate(() => history.length);

  await openMenu(page);
  await menu(page).getByRole("button", { name: "Menü schließen" }).click();
  await expect(menu(page)).toBeHidden();
  await expect(menuBtn(page)).toBeFocused();
  await expect(menuBtn(page)).toHaveAttribute("aria-expanded", "false");

  await openMenu(page);
  await page.mouse.click(10, 300); // links neben der Leiste
  await expect(menu(page)).toBeHidden();

  await openMenu(page);
  await page.keyboard.press("Escape");
  await expect(menu(page)).toBeHidden();
  await expect(menuBtn(page)).toBeFocused();

  // Zurück-Geste: schließt nur das Menü, die Seite bleibt
  await openMenu(page);
  await page.goBack();
  await expect(menu(page)).toBeHidden();
  await expect(page).toHaveURL(/#\/einstellungen$/);
  await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
  await expect(page.locator("#app")).toHaveJSProperty("inert", false);

  // Der Verlauf ist nicht gewachsen: jeder Weg hat seinen Eintrag wieder zurückgenommen
  await page.waitForTimeout(100);
  expect(await page.evaluate(() => history.length)).toBe(before + 1);
  expect(await page.evaluate(() => history.state)).toBeNull();
});

test("Eintrag führt zur Seite; Zurück danach führt zur vorigen Seite; aktuelle Seite wählen schließt nur", async ({ page }) => {
  await seed(page, sampleData());
  await page.goto("./#/griffe");
  let renders = 0;
  await page.exposeFunction("__countRender", () => renders++);
  await page.evaluate(() => {
    const app = document.getElementById("app")!;
    new MutationObserver(() => (window as unknown as { __countRender(): void }).__countRender()).observe(app, { childList: true });
  });

  await menuTo(page, "Fortschritt");
  await expect(page).toHaveURL(/#\/fortschritt$/);
  await expect(page.getByRole("heading", { name: "Fortschritt" })).toBeVisible();
  await page.waitForTimeout(150);
  expect(renders).toBe(1); // genau einmal gezeichnet

  await page.goBack();
  await expect(page).toHaveURL(/#\/griffe$/);
  await expect(page.getByRole("heading", { name: "Grifftabelle" })).toBeVisible();

  renders = 0;
  await menuTo(page, "Grifftabelle");
  await page.waitForTimeout(150);
  expect(renders).toBe(0);
  await expect(page).toHaveURL(/#\/griffe$/);

  await menuTo(page, "Startseite");
  await expect(page.getByRole("heading", { name: "Flötentrainer" })).toBeVisible();
  await menuTo(page, "Flöte einstellen");
  await expect(page).toHaveURL(/#\/floete$/);
  await menuTo(page, "Einstellungen");
  await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
});

test("Tab läuft in der Leiste im Kreis", async ({ page }) => {
  await seed(page, sampleData());
  await page.goto("./");
  await openMenu(page);
  const links = menu(page).getByRole("link");
  await expect(links.first()).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(menu(page).getByRole("button", { name: "Menü schließen" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(links.last()).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(menu(page).getByRole("button", { name: "Menü schließen" })).toBeFocused();
});

test("Menüknopf auf den Unterseiten, auch Liederliste, Liedseite und Lied hinzufügen", async ({ page }) => {
  await seed(page, sampleData());
  for (const route of ["#/lieder", "#/lied/haenschen-klein", "#/lied-hinzufuegen", "#/einstellungen", "#/fortschritt", "#/griffe", "#/stimmgeraet", "#/floete", "#/mikrofon"]) {
    await page.goto("./" + route);
    await expect(menuBtn(page), route).toBeVisible();
    const box = (await menuBtn(page).boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  }
});

test("kein Menü in der Übung und auf dem Sitzungsende", async ({ page }) => {
  await seed(page, sampleData());
  await page.goto("./");
  await page.getByRole("button", { name: /Üben/ }).click();
  await skipIntros(page);
  await expect(page.getByRole("button", { name: "Sitzung beenden" })).toHaveCount(1);
  await expect(menuBtn(page)).toHaveCount(0);
  await answer(page, true);
  await next(page);
  await page.getByRole("button", { name: "Sitzung beenden" }).click();
  await expect(page).toHaveURL(/#\/ende$/);
  await expect(menuBtn(page)).toHaveCount(0);
});

test("kein Menü auf der Seite „Daten nicht lesbar“", async ({ page }) => {
  await seed(page, "{kaputt");
  await page.goto("./");
  await expect(page.getByRole("heading", { name: "Daten nicht lesbar" })).toBeVisible();
  await expect(menuBtn(page)).toHaveCount(0);
});

test("Stimmgerät aus dem Menü startet das Mikrofon gleich", async ({ page }) => {
  await page.addInitScript(FAKE_MIC);
  await seed(page, sampleData());
  await page.goto("./#/griffe");
  await menuTo(page, "Stimmgerät");
  await expect(page).toHaveURL(/#\/stimmgeraet$/);
  await page.waitForFunction(() => (window as never as { __osc: unknown }).__osc !== null);
  await expect(page.getByRole("button", { name: "Mikrofon einschalten" })).toHaveCount(0);
});

test("Querformat 740 × 360: alle Einträge erreichbar", async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 360 });
  await seed(page, sampleData());
  await page.goto("./");
  await openMenu(page);
  const last = menu(page).getByRole("link", { name: "Einstellungen" });
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  const box = (await menu(page).boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(320);
  await last.click();
  await expect(page.getByRole("heading", { name: "Einstellungen" })).toBeVisible();
});

test("Neu geladen bei offenem Menü: kein überzähliger Verlaufseintrag", async ({ page }) => {
  await seed(page, sampleData());
  await page.goto("./#/griffe");
  await page.goto("./#/einstellungen");
  await openMenu(page);
  await page.reload();
  await expect(menu(page)).toBeHidden();
  await expect.poll(() => page.evaluate(() => history.state)).toBeNull();
  await page.goBack();
  await expect(page).toHaveURL(/#\/griffe$/);
});
