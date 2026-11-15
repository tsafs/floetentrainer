// Übungsabläufe im Browser.
import { expect, test, type Page } from "@playwright/test";
import { sampleData } from "./seed";
import { answer, info, next, seed, skipIntros, stored, waitNext } from "./util";

test.describe("Startseite", () => {
  test("erster Start: neue Töne, keine Serie", async ({ page }) => {
    await seed(page, null);
    await page.goto("./");
    // allererster Start: Willkommensseite (startpunkt.spec.ts)
    await page.getByRole("button", { name: /Von vorn beginnen/ }).click();
    await expect(page.getByRole("heading", { name: "Flötentrainer" })).toBeVisible();
    await expect(page.getByTestId("streak")).toHaveText("0");
    await expect(page.getByRole("button", { name: /Üben/ })).toContainText("Neue Töne warten");
    await expect(page.locator(".track")).toHaveCount(2);
    await expect(page.locator(".track").first().locator(".steps i")).toHaveCount(12);
    await expect(page.locator(".track").nth(1).locator(".steps i")).toHaveCount(11);
  });

  test("fällige Karten stehen auf den Knöpfen", async ({ page }) => {
    await seed(page, sampleData());
    await page.goto("./");
    await expect(page.getByRole("button", { name: /Üben/ })).toContainText("24 Karten fällig");
    await expect(page.getByRole("button", { name: /Spielen/ })).toContainText("5 Karten fällig");
    await expect(page.getByTestId("streak")).toHaveText("4");
  });

  test("nichts fällig und nichts neu: „Weiter üben“", async ({ page }) => {
    const d = sampleData({ lesen: "erste-toene", spielen: "erste-toene" });
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    d.cards = {};
    for (const n of ["h1", "a1", "g1"]) {
      for (const k of ["name", "griff", "note", "spiel"]) d.cards[`${n}|${k}`] = { box: 5, day: key, session: 4 };
    }
    await seed(page, d);
    await page.goto("./");
    await expect(page.getByRole("button", { name: /Weiter üben/ })).toContainText("Fälliges erledigt · zählt für Stufe 2");
    await expect(page.getByRole("button", { name: /Weiter spielen/ })).toBeVisible();
    await page.getByRole("button", { name: /Weiter üben/ }).click();
    expect((await info(page)).step).toBe("card");
  });
});

test.describe("Üben", () => {
  test("Vorstellung, richtig, falsch, Wiederholung", async ({ page }) => {
    await seed(page, null);
    await page.goto("./");
    await page.getByRole("button", { name: /Von vorn beginnen/ }).click();
    await page.getByRole("button", { name: /Üben/ }).click();
    // Vorstellung
    let i = await info(page);
    expect(i.step).toBe("intro");
    await expect(page.getByTestId("count")).toHaveText("Neuer Ton");
    await page.getByRole("button", { name: "Verstanden" }).click();
    await waitNext(page, i.seq);
    // Erste Karte richtig: grüne Bestätigung, geht nach knapp 2 s von selbst weiter
    i = await info(page);
    expect(i.step).toBe("card");
    await expect(page.getByTestId("count")).toHaveText("1 von 20");
    await answer(page, true);
    await expect(page.getByTestId("panel")).toContainText("Richtig");
    await expect(page.locator(".btns .right")).toHaveCount(1);
    await waitNext(page, i.seq);
    await skipIntros(page);
    // Zweite Karte falsch: rötliches Feld mit Hinweis, „Weiter“ nötig
    i = await info(page);
    const wrongNote = await answer(page, false);
    await expect(page.getByTestId("panel")).toContainText("Nicht ganz");
    // nur der richtige Name, kein Hinweistext, kein Griffbild (bei Note→Name)
    await expect(page.getByTestId("panel")).toContainText(wrongNote);
    await expect(page.locator(".panel .sub")).toHaveCount(0);
    await expect(page.locator(".btns")).toBeHidden();
    await page.waitForTimeout(1500);
    await expect(page.getByTestId("panel")).toContainText("Nicht ganz"); // nicht von selbst weiter
    await next(page);
    // Die falsche Karte kommt nach 2–3 anderen Karten nochmal
    const seen: string[] = [];
    for (let k = 0; k < 6; k++) {
      await skipIntros(page);
      i = await info(page);
      seen.push(i.retry ? `R:${i.note}` : i.note);
      if (i.retry) {
        await expect(page.getByTestId("count")).toHaveText("nochmal");
        break;
      }
      await answer(page, true);
      await next(page);
    }
    const idx = seen.findIndex((x) => x.startsWith("R:"));
    expect(seen[idx]).toBe(`R:${wrongNote}`);
    expect(idx).toBeGreaterThanOrEqual(2);
    expect(idx).toBeLessThanOrEqual(3);
  });

  test("„Vertippt“: Antwort zurück, dieselbe Karte bleibt offen, neu tippen", async ({ page }) => {
    await seed(page, sampleData());
    await page.goto("./");
    await page.getByRole("button", { name: /Üben/ }).click();
    await skipIntros(page);
    let i = await info(page);
    if (i.step === "folge") {
      await answer(page, true);
      await next(page);
      await skipIntros(page);
      i = await info(page);
    }
    const before = (await stored(page)).history.lesen[i.note]?.length ?? 0;
    await answer(page, false);
    await expect(page.getByTestId("panel")).toContainText("Nicht ganz");
    expect((await stored(page)).history.lesen[i.note].at(-1)[0]).toBe(0);
    await page.getByTestId("typo").click();
    // kein Sprung: dieselbe Karte, Antworten wieder frei, kein Feld
    await expect(page.getByTestId("panel")).toHaveCount(0);
    expect(await info(page)).toMatchObject({ seq: i.seq, note: i.note });
    expect((await stored(page)).history.lesen[i.note]?.length ?? 0).toBe(before);
    await expect(page.locator(".btns button:disabled")).toHaveCount(0);
    await expect(page.locator(".btns .right, .btns .dim, .btns .chosen")).toHaveCount(0);
    await answer(page, true);
    await expect(page.getByTestId("panel")).toContainText("Richtig");
    expect((await stored(page)).history.lesen[i.note].at(-1)[0]).toBe(1);
  });

  test("„Weiß nicht“ zeigt die Auflösung und zählt als Fehler", async ({ page }) => {
    await seed(page, sampleData());
    await page.goto("./");
    await page.getByRole("button", { name: /Üben/ }).click();
    const { note } = await info(page);
    await page.getByRole("button", { name: "Weiß nicht" }).click();
    await expect(page.getByTestId("panel")).toContainText("Auflösung");
    await expect(page.getByTestId("typo")).toHaveCount(0); // kein Tippfehler
    const d = await stored(page);
    expect(d.history.lesen[note].at(-1)[0]).toBe(0);
  });

  test("ganze Sitzung bis zum Ende", async ({ page }) => {
    await seed(page, sampleData());
    await page.goto("./");
    await page.getByRole("button", { name: /Üben/ }).click();
    let wrong = 0;
    for (let k = 0; k < 40; k++) {
      await page.locator('main[data-seq], [data-testid="score"]').first().waitFor();
      if (await page.getByTestId("score").isVisible()) break;
      await skipIntros(page);
      const i = await info(page);
      const right = i.retry || k % 5 !== 2;
      if (!right) wrong++;
      await answer(page, right);
      await next(page);
    }
    await expect(page.getByTestId("score")).toHaveText(`${20 - wrong} von 20`);
    await expect(page.getByTestId("difficult")).toBeVisible();
    await page.getByRole("button", { name: "Zur Startseite" }).click();
    await expect(page.getByRole("heading", { name: "Flötentrainer" })).toBeVisible();
  });

  test("Abbrechen mit ×: beantwortete Karten bleiben gewertet", async ({ page }) => {
    await seed(page, sampleData());
    await page.goto("./");
    const before = await stored(page);
    await page.getByRole("button", { name: /Üben/ }).click();
    await answer(page, true);
    await next(page);
    await answer(page, true);
    await page.getByRole("button", { name: "Sitzung beenden" }).click();
    await expect(page.getByTestId("score")).toHaveText("2 von 2");
    const after = await stored(page);
    const count = (d: { history: { lesen: Record<string, unknown[]> } }) => Object.values(d.history.lesen).reduce((a, l) => a + l.length, 0);
    expect(count(after) - count(before)).toBeLessThanOrEqual(2);
    expect(after.sessions).toBe(before.sessions + 1);
  });

  test("Freischalten wird am Sitzungsende gemeldet", async ({ page }) => {
    const d = sampleData({ lesen: "erste-toene", spielen: "erste-toene" });
    const today = new Date();
    const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const y = new Date(Date.now() - 86400000);
    const ykey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, "0")}-${String(y.getDate()).padStart(2, "0")}`;
    for (const n of ["h1", "a1", "g1"]) d.history.lesen[n] = Array.from({ length: 12 }, (_, i) => [1, i % 2 ? ykey : key, Date.now() - 1000 + i]);
    await seed(page, d);
    await page.goto("./");
    await page.getByRole("button", { name: /Üben/ }).click();
    await answer(page, true);
    await page.getByRole("button", { name: "Sitzung beenden" }).click();
    await expect(page.getByTestId("unlock")).toContainText("Neu: c2 und d2");
  });
});

test.describe("Tippen am Kartenwechsel", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 839 } });

  /** Finger an pt aufsetzen; erst abheben, wenn der automatische Wechsel (1,8 s, Playwright-Uhr) durch ist. */
  async function touchAcrossSwitch(page: Page, pt: { x: number; y: number }, s: string) {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt] });
    await page.clock.runFor(1800);
    await waitNext(page, s);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.clock.runFor(300);
  }

  const center = (b: { x: number; y: number; width: number; height: number }) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });

  test("Tipp, der auf der alten Karte beginnt, zählt nicht als Antwort auf der neuen", async ({ page }) => {
    await page.clock.install();
    await seed(page, sampleData());
    await page.goto("./");
    await page.getByRole("button", { name: /Üben/ }).click();
    await skipIntros(page);
    const i = await info(page);
    const m = page.locator(`main[data-seq="${i.seq}"]`);
    await m.locator(`.btns button[data-choice="${i.note}"]`).tap();
    await expect(page.getByTestId("panel")).toContainText("Richtig");
    // genau dort, wo auf der neuen Karte ein Antwortknopf liegt
    const pt = center((await m.locator(".btns button").first().boundingBox())!);
    await touchAcrossSwitch(page, pt, i.seq);
    const j = await info(page);
    expect(j.step).toBe("card"); // sonst wäre die Prüfung unten trivial
    await expect(page.locator("main")).toHaveClass(/\bask\b/);
    await expect(page.locator(".btns button:disabled")).toHaveCount(0);
  });

  test("nach „Richtig“ schaltet ein Tipp auf die gesperrten Antworten sofort weiter", async ({ page }) => {
    await page.clock.install();
    await seed(page, sampleData());
    await page.goto("./");
    await page.getByRole("button", { name: /Üben/ }).click();
    await skipIntros(page);
    const i = await info(page);
    const m = page.locator(`main[data-seq="${i.seq}"]`);
    // Uhr anhalten: weiter geht es nur durch den Tipp, nicht durch den 1,8-s-Timer
    // (Ziel mit Puffer in der Zukunft, sonst ist es unter Last schon vorbei; vor dem Antworten läuft kein Timer)
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 2000);
    await m.locator(`.btns button[data-choice="${i.note}"]`).tap();
    await expect(page.getByTestId("panel")).toContainText("Richtig");
    const pt = center((await m.locator(`.btns button:not([data-choice="${i.note}"])`).first().boundingBox())!);
    await page.touchscreen.tap(pt.x, pt.y);
    await waitNext(page, i.seq);
  });

  test("Enter auf einem Antwortknopf zählt weiterhin", async ({ page }) => {
    await seed(page, sampleData());
    await page.goto("./");
    await page.getByRole("button", { name: /Üben/ }).click();
    await skipIntros(page);
    const i = await info(page);
    const b = page.locator(`main[data-seq="${i.seq}"] .btns button[data-choice="${i.note}"]`);
    await b.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("panel")).toContainText("Richtig");
  });

  test("Tipp von der letzten Karte klickt die Ergebnisse nicht weg", async ({ page }) => {
    await page.clock.install();
    await seed(page, { ...sampleData(), settings: { sessionCards: 5 } });
    await page.goto("./");
    await page.getByRole("button", { name: /Üben/ }).click();
    for (let k = 0; k < 5; k++) {
      await skipIntros(page);
      const i = await info(page);
      const m = page.locator(`main[data-seq="${i.seq}"]`);
      await m.locator(`.btns button[data-choice="${i.note}"]`).tap();
      await expect(page.getByTestId("panel")).toContainText("Richtig");
      if (k < 4) {
        await page.clock.runFor(1800);
        await waitNext(page, i.seq);
        continue;
      }
      // letzte Karte: Finger liegt dort, wo auf der Ergebnisseite „Zur Startseite“ erscheint
      await page.clock.runFor(1);
      const cdp = await page.context().newCDPSession(page);
      const vp = page.viewportSize()!;
      const pt = { x: vp.width / 2, y: vp.height - 60 };
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt] });
      await page.clock.runFor(1800);
      const home = page.getByRole("button", { name: "Zur Startseite" });
      await expect(home).toBeVisible();
      const hb = (await home.boundingBox())!;
      expect(pt.y).toBeGreaterThan(hb.y);
      expect(pt.y).toBeLessThan(hb.y + hb.height);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.clock.runFor(300);
      await expect(page.getByTestId("score")).toHaveText("5 von 5");
    }
  });
});

test.describe("Daten", () => {
  test("beschädigte Daten werden nicht gelöscht", async ({ page }) => {
    await seed(page, "{kaputt");
    await page.goto("./");
    await expect(page.getByRole("heading", { name: "Daten nicht lesbar" })).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("floetentrainer"))).toBe("{kaputt");
    await page.getByRole("button", { name: "Neu beginnen" }).click();
    await page.getByRole("button", { name: "Ja, neu beginnen" }).click();
    // ganz neue Daten: wie beim allerersten Start die Willkommensseite
    await expect(page.getByRole("heading", { name: "Willkommen" })).toBeVisible();
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys.some((k) => k.startsWith("floetentrainer-beschaedigt-"))).toBe(true);
  });

  test("Zurücksetzen mit Bestätigung in der Seite", async ({ page }) => {
    await seed(page, sampleData());
    await page.goto("./#/einstellungen");
    await page.getByRole("button", { name: "Alles zurücksetzen" }).click();
    await expect(page.getByText("Wirklich alles löschen?")).toBeVisible();
    await page.getByRole("button", { name: "Ja, alles löschen" }).click();
    const d = await stored(page);
    expect(Object.keys(d.cards)).toHaveLength(0);
    expect(d.stages.lesen).toBe("erste-toene");
  });

  test("Sicherung herunterladen und wieder einlesen", async ({ page }) => {
    await seed(page, sampleData());
    await page.goto("./#/einstellungen");
    const dl = page.waitForEvent("download");
    await page.getByRole("button", { name: "Sicherung herunterladen" }).click();
    const file = await dl;
    expect(file.suggestedFilename()).toMatch(/^floetentrainer-sicherung-\d{4}-\d{2}-\d{2}\.json$/);
    const path = await file.path();
    // zurücksetzen, dann einlesen
    await page.getByRole("button", { name: "Alles zurücksetzen" }).click();
    await page.getByRole("button", { name: "Ja, alles löschen" }).click();
    await page.getByTestId("import-file").setInputFiles(path);
    await page.getByRole("button", { name: "Sicherung übernehmen" }).click();
    await expect(page.getByTestId("msg")).toHaveText("Sicherung eingelesen.");
    expect((await stored(page)).stages.lesen).toBe("fis1");
  });

  test("ungültige Sicherung wird abgelehnt", async ({ page }) => {
    await seed(page, sampleData());
    await page.goto("./#/einstellungen");
    await page.getByTestId("import-file").setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from('{"app":"anders"}') });
    await expect(page.getByTestId("msg")).toContainText("keine Sicherung");
    expect((await stored(page)).stages.lesen).toBe("fis1");
  });

  test("Stufen von Hand: Spielen höchstens Lesen", async ({ page }) => {
    await seed(page, sampleData({ lesen: "c2-d2", spielen: "c2-d2" }));
    await page.goto("./#/einstellungen");
    const sp = page.locator('.stepper[data-name="lv-spielen"]');
    await expect(sp.locator("button").last()).toBeDisabled();
    await page.locator('.stepper[data-name="lv-lesen"] button').first().click();
    await expect(page.getByTestId("val-lv-lesen")).toHaveText("1 / 12");
    await expect(page.getByTestId("val-lv-spielen")).toHaveText("1 / 11");
  });
});
