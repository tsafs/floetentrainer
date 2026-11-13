// Schalter für die Darstellung: wie das Handy, immer hell, immer dunkel.
import { expect, test, type Page } from "@playwright/test";
import { sampleData } from "./seed";
import { seed, stored } from "./util";

const PAPER = "rgb(251, 246, 234)";
const DARK = "rgb(30, 26, 22)";
const bg = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

test.describe("Handy im Dunkelmodus", () => {
  test.use({ colorScheme: "dark" });

  test("„Hell“ macht die App hell, auch nach dem Neuladen", async ({ page }) => {
    await seed(page, sampleData());
    await page.goto("./#/einstellungen");
    expect(await bg(page)).toBe(DARK);
    await page.getByRole("button", { name: "Hell", exact: true }).click();
    await expect(page.getByRole("button", { name: "Hell", exact: true })).toHaveAttribute("aria-pressed", "true");
    expect(await bg(page)).toBe(PAPER);
    expect((await stored(page)).settings.theme).toBe("light");
    await page.goto("./");
    await page.reload();
    expect(await bg(page)).toBe(PAPER);
    // Griffbild: Daumenloch-Hintergrund ist im hellen Modus aus
    await page.goto("./#/griffe");
    const tb = await page.locator(".flute .tb").first().evaluate((e) => getComputedStyle(e).fill);
    expect(tb).toBe("none");
  });

  test("„Wie das Handy“ folgt wieder dem System", async ({ page }) => {
    await seed(page, { ...sampleData(), settings: { theme: "light" } });
    await page.goto("./#/einstellungen");
    expect(await bg(page)).toBe(PAPER);
    await page.getByRole("button", { name: "Wie das Handy" }).click();
    expect(await bg(page)).toBe(DARK);
    expect((await stored(page)).settings.theme).toBe("auto");
  });
});

test.describe("Handy im hellen Modus", () => {
  test.use({ colorScheme: "light" });

  test("„Dunkel“ macht die App dunkel", async ({ page }) => {
    await seed(page, sampleData());
    await page.goto("./#/einstellungen");
    expect(await bg(page)).toBe(PAPER);
    await page.getByRole("button", { name: "Dunkel", exact: true }).click();
    expect(await bg(page)).toBe(DARK);
    await page.reload();
    expect(await bg(page)).toBe(DARK);
  });
});
