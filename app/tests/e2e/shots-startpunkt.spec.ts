// Bildschirmfotos Willkommensseite und Startpunkt (nur mit SHOTS=1): npx playwright test shots-startpunkt
import { test } from "@playwright/test";
import { sampleData } from "./seed";
import { seed } from "./util";

test.skip(!process.env.SHOTS, "nur auf Wunsch");

const SIZES = [
  { name: "360x740", width: 360, height: 740 },
  { name: "740x360", width: 740, height: 360 },
  { name: "412x915", width: 412, height: 915 },
  { name: "desktop", width: 1280, height: 800 },
];
const scheme = (process.env.SCHEME as "light" | "dark") ?? "light";

for (const s of SIZES) {
  test.describe(s.name, () => {
    test.use({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 2, colorScheme: scheme });
    test("Willkommen und Meilensteine", async ({ page }) => {
      const p = (x: string) => `shots/${scheme}-${s.name}-w${x}.png`;
      await seed(page, null);
      await page.goto("./");
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: p("1-willkommen") });
      await page.getByRole("button", { name: /Ich kann schon Noten/ }).click();
      await page.screenshot({ path: p("2-meilensteine") });
      await page.getByRole("button", { name: /^Hohe Töne/ }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: p("3-bestaetigen") });
      await page.screenshot({ path: p("3-bestaetigen-ganz"), fullPage: true });
    });
    test("Startpunkt ändern", async ({ page }) => {
      const p = (x: string) => `shots/${scheme}-${s.name}-w${x}.png`;
      await seed(page, sampleData({ lesen: "fis1", spielen: "c2-d2" }));
      await page.goto("./#/startpunkt");
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: p("4-startpunkt") });
      await page.getByRole("button", { name: "nur Spielen" }).click();
      await page.getByRole("button", { name: /^Ganz von vorn/ }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: p("5-zurueck"), fullPage: true });
      await page.goto("./#/fortschritt");
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.screenshot({ path: p("6-fortschritt") });
    });
  });
}
