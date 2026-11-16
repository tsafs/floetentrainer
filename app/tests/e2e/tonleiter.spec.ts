// Startseite mit Tonleiter, Karte zum gewählten Ton, Tonseite und Grifftabelle (ersetzen die Fortschrittsseite).
import { expect, test, type Page } from "@playwright/test";
import { sampleData } from "./seed";
import { seed } from "./util";

/** Lesen Stufe 4: alle Töne 12× richtig (10 Punkte), d² nach 3 Fehlern bei 4 Punkten */
function pointsData() {
  const data = sampleData({ lesen: "fis1", spielen: "c2-d2" });
  const ok = (n: number, t0: number) => Array.from({ length: n }, (_, i) => [1, data.days[3], t0 + i]);
  for (const n of ["h1", "a1", "g1", "c2", "e1", "d1", "fis1"]) data.history.lesen[n] = ok(12, 1000);
  data.history.lesen.d2 = [...ok(14, 1000), [0, data.days[3], 2000], [0, data.days[3], 2001], [0, data.days[3], 2002]];
  return data;
}

const col = (page: Page, id: string) => page.getByTestId("ladder").locator(`.lc[data-note="${id}"]`);
const card = (page: Page) => page.getByTestId("notecard");

test("Tonleiter: Zustände je Ton, Karte zum nächsten Ton nennt, was fehlt", async ({ page }) => {
  await seed(page, pointsData());
  await page.goto("./");
  await expect(page.getByTestId("level")).toHaveText("Stufe 4");
  await expect(page.getByTestId("ladder")).toContainText("8 von 31 Tönen");
  await expect(col(page, "d2")).toHaveClass(/learned/);
  await expect(col(page, "e2")).toHaveClass(/next/);
  await expect(col(page, "f1")).toHaveClass(/next/);
  await expect(col(page, "c1")).toHaveClass(/wait/);
  // Beim Öffnen gewählt: der erste Ton der nächsten Stufe
  await expect(col(page, "e2")).toHaveClass(/sel/);
  await expect(card(page)).toContainText("Kommt mit der nächsten Stufe. Dafür noch: d2 4 richtige.");
  await expect(card(page)).toHaveAttribute("href", "#/ton/e2");
  // Ein späterer Ton
  await col(page, "c1").click();
  await expect(card(page)).toContainText("Kommt in Stufe 6, also in zwei Stufen.");
});

test("Karte: Punkte mit Strich bei 8, Griff-Tipp; zweites Tippen öffnet die Tonseite, Zurück wählt den Ton wieder", async ({ page }) => {
  await seed(page, pointsData());
  await page.goto("./");
  await col(page, "d2").click();
  await expect(card(page).getByTestId("pts-lesen")).toHaveText("4 von 10");
  await expect(card(page).getByTestId("pts-spielen")).toBeVisible();
  await expect(card(page)).toContainText("Wie c², aber der Daumen ist ganz offen.");
  const bar = card(page).locator(".pbar").first();
  const tick = await bar.evaluate((el) => parseFloat(getComputedStyle(el, "::after").left) / el.clientWidth);
  expect(tick).toBeCloseTo(0.8, 2);
  await col(page, "h1").click();
  await expect(card(page).getByTestId("pts-lesen")).toHaveText("10 von 10");
  await col(page, "h1").click();
  await expect(page).toHaveURL(/#\/ton\/h1$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("h1");
  await expect(page.getByTestId("grip-tip")).toHaveText("Nur der Daumen und der Zeigefinger der linken Hand.");
  await expect(page.getByTestId("tone-progress").getByTestId("pts-lesen")).toHaveText("10 von 10");
  await page.getByRole("link", { name: "Zurück" }).click();
  await expect(col(page, "h1")).toHaveClass(/sel/);
});

test("Tonleiter mit der Tastatur: Pfeile wandern von Ton zu Ton, Enter auf dem gewählten öffnet die Tonseite", async ({ page }) => {
  await seed(page, pointsData());
  await page.goto("./");
  await col(page, "e2").focus();
  await page.keyboard.press("ArrowRight");
  await expect(col(page, "f2")).toBeFocused();
  await expect(col(page, "f2")).toHaveClass(/sel/);
  await expect(card(page)).toHaveAttribute("href", "#/ton/f2");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/ton\/f2$/);
});

test("alle Töne sitzen: die nächste Stufe kommt mit der nächsten richtigen Antwort", async ({ page }) => {
  const data = sampleData({ lesen: "fis1", spielen: "c2-d2" });
  const ok = (n: number, t0: number) => Array.from({ length: n }, (_, i) => [1, data.days[3], t0 + i]);
  for (const n of ["h1", "a1", "g1", "c2", "d2", "e1", "d1", "fis1"]) data.history.lesen[n] = ok(9, 1000);
  await seed(page, data);
  await page.goto("./");
  await expect(card(page)).toContainText("Kommt mit der nächsten Stufe, sobald du wieder richtig antwortest");
});

test("Spielen an der Grenze von Lesen: der Knopf sagt, dass es beim Lesen weitergeht – nur wenn alles sitzt", async ({ page }) => {
  const data = sampleData({ lesen: "fis1", spielen: "fis1" });
  const today = data.days[3];
  const notes = ["h1", "a1", "g1", "c2", "d2", "e1", "d1", "fis1"];
  for (const n of notes) data.cards[`${n}|spiel`] = { box: 4, day: today, session: 5 };
  data.introduced.spielen = notes;
  // d² hat beim Spielen erst wenige Punkte: Weiterspielen zählt noch
  const ok = (n: number) => Array.from({ length: n }, (_, i) => [1, today, 1000 + i]);
  const spielen: Record<string, unknown[]> = {};
  for (const n of notes) spielen[n] = ok(9);
  spielen.d2 = ok(3);
  (data.history as Record<string, unknown>).spielen = spielen;
  await seed(page, data);
  await page.goto("./");
  await expect(page.getByRole("button", { name: /Weiter spielen/ })).toContainText("zählt für Stufe 5");
  // alle sitzen: jetzt wartet Spielen auf Lesen
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("floetentrainer")!);
    d.history.spielen.d2 = d.history.spielen.h1;
    delete d.points;
    localStorage.setItem("floetentrainer", JSON.stringify(d));
  });
  await page.reload();
  await expect(page.getByRole("button", { name: /Weiter spielen/ })).toContainText("für Stufe 5 erst beim Lesen weiterkommen");
});

test("Pfeiltasten wählen nur, auch quer ohne Karte und in der Grifftabelle; die Tabelle ist per Tab erreichbar", async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 360 });
  await seed(page, pointsData());
  await page.goto("./");
  await col(page, "e2").focus();
  await page.keyboard.press("ArrowRight");
  await expect(col(page, "f2")).toHaveClass(/sel/);
  await expect(page).not.toHaveURL(/#\/ton\//);
  await page.goto("./#/griffe");
  const chart = page.getByTestId("chart");
  await expect(chart.locator('.lc[tabindex="0"]')).toHaveCount(1);
  await chart.locator('.lc[tabindex="0"]').focus();
  await page.keyboard.press("ArrowRight");
  await expect(chart.locator('.lc[data-note="cis1"]')).toBeFocused();
  await expect(page).toHaveURL(/#\/griffe$/);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/ton\/cis1\?von=griffe$/);
});

test("Tonseite: Note, Griff, Lage, Blättern ersetzt den Verlauf; wartender Ton zeigt, wann er kommt", async ({ page }) => {
  await seed(page, pointsData());
  await page.goto("./");
  await page.goto("./#/ton/g1");
  await expect(page.getByTestId("tone-status")).toHaveText("seit Stufe 1");
  await expect(page.getByText("g1 liegt auf der zweiten Linie.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Flöte einstellen" })).toHaveAttribute("href", "#/floete/g1");
  await page.getByRole("link", { name: /höherer Ton/ }).click();
  await expect(page).toHaveURL(/#\/ton\/gis1$/);
  await expect(page.getByTestId("tone-status")).toHaveText("Stufe 10");
  await expect(page.getByTestId("tone-progress")).toContainText("Kommt in Stufe 10, also in sechs Stufen.");
  await expect(page.getByRole("link", { name: "Flöte einstellen" })).toHaveCount(0);
  // Blättern hat den Eintrag ersetzt: Zurück führt zur Startseite
  await page.goBack();
  await expect(page.getByRole("heading", { name: "Flötentrainer" })).toBeVisible();
});

test("Grifftabelle: eine Notenzeile mit 25 Griffbildern; Tippen öffnet die Tonseite, Zurück führt zur Tabelle", async ({ page }) => {
  await seed(page, pointsData());
  await page.goto("./#/griffe");
  const chart = page.getByTestId("chart");
  await expect(chart.locator(".lc")).toHaveCount(25);
  await expect(chart.locator(".lc .flute")).toHaveCount(25);
  await expect(chart.locator('.lc[data-note="es1"]')).toContainText("auch dis1");
  await expect(chart.locator('.lc[data-note="c1"]')).toHaveClass(/wait/);
  await expect(chart.locator('.lc[data-note="d1"]')).toHaveClass(/learned/);
  await chart.locator('.lc[data-note="d1"]').click();
  await expect(page).toHaveURL(/#\/ton\/d1\?von=griffe$/);
  // In der Grifftabelle blättert die Tonseite über die 25 Töne (ohne andere Schreibweisen)
  await page.getByRole("link", { name: /höherer Ton/ }).click();
  await expect(page).toHaveURL(/#\/ton\/es1\?von=griffe$/);
  await page.getByRole("link", { name: "Zurück" }).click();
  await expect(page).toHaveURL(/#\/griffe$/);
  await expect(chart.locator('.lc[data-note="d1"]')).toHaveClass(/sel/);
});

test("Grifftabelle quer: alle 25 Griffe passen ohne Wischen", async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 360 });
  await seed(page, pointsData());
  await page.goto("./#/griffe");
  const strip = page.getByTestId("chart").locator(".ladstrip");
  const last = await page.getByTestId("chart").locator('.lc[data-note="c3"] .flute').boundingBox();
  const box = await strip.boundingBox();
  expect(await strip.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(last!.x + last!.width).toBeLessThanOrEqual(box!.x + box!.width);
  expect(last!.y + last!.height).toBeLessThanOrEqual(360);
});
