// Fortschrittsseite: Sicherheit je Ton (Punkte) und welche Töne die nächste Stufe noch aufhalten.
import { expect, test } from "@playwright/test";
import { sampleData } from "./seed";
import { seed } from "./util";

test("Punkte je Ton, Kerbe bei 8, „Es fehlen noch“ nennt den aufhaltenden Ton", async ({ page }) => {
  const data = sampleData({ lesen: "fis1", spielen: "c2-d2" });
  const ok = (n: number, t0: number) => Array.from({ length: n }, (_, i) => [1, data.days[3], t0 + i]);
  for (const n of ["h1", "a1", "g1", "c2", "e1", "d1", "fis1"]) data.history.lesen[n] = ok(12, 1000);
  // d2: 14 richtig, dann 3 Fehler – 10 → 4 Punkte
  data.history.lesen.d2 = [...ok(14, 1000), [0, data.days[3], 2000], [0, data.days[3], 2001], [0, data.days[3], 2002]];
  await seed(page, data);
  await page.goto("./#/fortschritt");
  const lesen = page.getByRole("region", { name: "Lesen" });
  await expect(lesen.locator('.prow[data-note="d2"] .cnt')).toHaveText("4 von 10");
  await expect(lesen.locator('.prow[data-note="h1"] .cnt')).toHaveText("10 von 10");
  // Kerbe bei 8 von 10
  const mark = await lesen.locator('.prow[data-note="d2"] .pb').evaluate((el) => getComputedStyle(el, "::after").left);
  const width = await lesen.locator('.prow[data-note="d2"] .pb').evaluate((el) => el.clientWidth);
  expect(parseFloat(mark) / width).toBeCloseTo(0.8, 2);
  await expect(page.getByTestId("missing-lesen")).toHaveText("Es fehlen noch: d2 (4 richtige)."); // d mit hochgestellter 2
  await page.screenshot({ path: test.info().outputPath("fortschritt.png") });
});

test("alle Töne sitzen schon: Hinweis, dass die nächste Stufe mit der nächsten Antwort kommt", async ({ page }) => {
  const data = sampleData({ lesen: "fis1", spielen: "c2-d2" });
  const ok = (n: number, t0: number) => Array.from({ length: n }, (_, i) => [1, data.days[3], t0 + i]);
  for (const n of ["h1", "a1", "g1", "c2", "d2", "e1", "d1", "fis1"]) data.history.lesen[n] = ok(9, 1000);
  await seed(page, data);
  await page.goto("./#/fortschritt");
  await expect(page.getByTestId("missing-lesen")).toHaveText("Alle sitzen – die nächste Stufe kommt mit deiner nächsten richtigen Antwort.");
});
