// Bildschirmfotos für die Durchsicht (nur mit SHOTS=1): npx playwright test shots
import { expect, test, type Page } from "@playwright/test";
import { sampleData } from "./seed";
import { answer, FAKE_MIC, info, next, skipIntros } from "./util";
import { FAKE_AUDIO } from "./fake-audio";
import { note, soundingFreq } from "../../src/music/notes";

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
      // Sitzungsende
      await page.getByRole("button", { name: "Sitzung beenden" }).click();
      await page.screenshot({ path: p("9-ende") });
    });
    test("Spielen und Stimmgerät", async ({ page }) => {
      await page.addInitScript(FAKE_MIC);
      await seed(page);
      const p = (x: string) => `${OUT}/${scheme}-${s.name}-${x}.png`;
      const osc = (id: string) => page.evaluate((f) => (window as never as { __osc: { play(f: number): void } }).__osc.play(f), soundingFreq(note(id)));
      await page.goto("./");
      await page.getByRole("button", { name: /Spielen/ }).click();
      await page.waitForFunction(() => (window as never as { __osc: unknown }).__osc !== null);
      const t = (await info(page)).note;
      await page.waitForTimeout(500);
      await osc(t === "g1" ? "a1" : "g1");
      await page.waitForTimeout(150);
      await page.screenshot({ path: p("a-spielen-hoeren") });
      await expect(page.getByTestId("panel")).toBeVisible();
      await page.screenshot({ path: p("b-spielen-falsch") });
      await page.goto("./");
      await page.getByRole("link", { name: "Stimmgerät" }).click();
      await page.waitForFunction(() => (window as never as { __osc: unknown }).__osc !== null);
      await osc("b1");
      await expect(page.getByTestId("tuner-name")).toHaveText("b1");
      await page.waitForTimeout(200);
      await page.screenshot({ path: p("c-stimmgeraet") });
    });
    test("Lieder", async ({ page }) => {
      await page.addInitScript(FAKE_AUDIO);
      await page.clock.install();
      await seed(page);
      const p = (x: string) => `${OUT}/${scheme}-${s.name}-${x}.png`;
      await page.goto("./");
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: p("l1-start") });
      await page.getByRole("link", { name: "Lieder" }).click();
      await expect(page.getByTestId("can-play")).toBeVisible();
      await page.screenshot({ path: p("l2-liste"), fullPage: true });
      // langes Lied mit Text beim Abspielen: Abschnitt gewählt, Markierung sichtbar
      await page.goto("./#/lied/jingle-bells");
      await page.locator('rect.takt[data-bar="4"]').click();
      await page.locator('rect.takt[data-bar="7"]').click();
      await page.getByRole("button", { name: "Abspielen" }).click();
      await page.clock.runFor(5200);
      await expect(page.locator(".score .cur").first()).toBeVisible();
      await page.waitForTimeout(700); // sanftes Scrollen (läuft in Echtzeit)
      await page.screenshot({ path: p("l3-lied-spielt") });
      await page.getByRole("button", { name: "Stopp" }).click();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.screenshot({ path: p("l4-lied-ende") });
      // 6/8: Stille Nacht, beim Einzählen
      await page.goto("./#/lied/stille-nacht-heilige-nacht");
      await page.getByRole("button", { name: "Abspielen" }).click();
      await page.clock.runFor(400);
      await page.screenshot({ path: p("l5-stille-nacht-einzaehlen") });
      await page.clock.runFor(6000);
      await page.waitForTimeout(700);
      await page.screenshot({ path: p("l6-stille-nacht") });
    });
  });
}
