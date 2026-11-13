// Bildschirmfotos für die Durchsicht (nur mit SHOTS=1): npx playwright test shots
import { expect, test, type Page } from "@playwright/test";
import { sampleData } from "./seed";
import { answer, info, next, skipIntros } from "./util";

test.skip(!process.env.SHOTS, "nur auf Wunsch");

const SIZES = [
  { name: "360x740", width: 360, height: 740 },
  { name: "740x360", width: 740, height: 360 },
  { name: "412x915", width: 412, height: 915 },
  { name: "915x412", width: 915, height: 412 },
  { name: "desktop", width: 1280, height: 800 },
];
const OUT = "shots";
const scheme = (process.env.SCHEME as "light" | "dark") ?? "light";

async function seed(page: Page, data: unknown = sampleData()) {
  await page.addInitScript((d) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("floetentrainer", JSON.stringify(d));
      sessionStorage.setItem("seeded", "1");
    }
  }, data);
}

/** Übung starten und bis zu einer Karte der gewünschten Art weiterklicken */
async function toCard(page: Page, kind: string) {
  await page.goto("./");
  await page.getByRole("button", { name: /Üben/ }).click();
  for (let i = 0; i < 60; i++) {
    await skipIntros(page);
    if ((await info(page)).kind === kind) return;
    await answer(page, true);
    await next(page);
  }
  throw new Error("Karte nicht gefunden: " + kind);
}

for (const s of SIZES) {
  test.describe(s.name, () => {
    test.use({ viewport: { width: s.width, height: s.height }, deviceScaleFactor: 2, colorScheme: scheme });
    test("Seiten", async ({ page }) => {
      await seed(page);
      const p = (x: string) => `${OUT}/${scheme}-${s.name}-${x}.png`;
      await page.goto("./");
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: p("1-start") });
      for (const kind of ["name", "griff", "note"]) {
        await toCard(page, kind);
        await page.screenshot({ path: p(`2-${kind}-frage`) });
        await answer(page, true);
        await page.screenshot({ path: p(`3-${kind}-richtig`) });
        await page.goto("./");
        await toCard(page, kind);
        await answer(page, false);
        await page.screenshot({ path: p(`4-${kind}-falsch`) });
        await page.goto("./");
      }
      for (const [route, name] of [["#/griffe", "6-griffe"], ["#/einstellungen", "7-einstellungen"], ["#/fortschritt", "8-fortschritt"]]) {
        await page.goto("./" + route);
        await page.screenshot({ path: p(name), fullPage: false });
      }
      // Vorstellung
      await page.evaluate(() => {
        const d = JSON.parse(localStorage.getItem("floetentrainer")!);
        d.stages.lesen = "e2-f1";
        localStorage.setItem("floetentrainer", JSON.stringify(d));
      });
      await page.goto("./");
      await page.reload();
      await page.getByRole("button", { name: /Üben/ }).click();
      for (let i = 0; i < 40 && (await info(page)).step !== "intro"; i++) {
        await answer(page, true);
        await next(page);
      }
      expect((await info(page)).step).toBe("intro");
      await page.screenshot({ path: p("5-vorstellung") });
    });
  });
}
