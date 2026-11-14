// Tonfolgen in den Sitzungen (docs/app-tonfolgen.md): Lesen durchtippen, Spielen mit der Mikrofon-Attrappe.
import { expect, test, type Page } from "@playwright/test";
import { note, soundingFreq } from "../../src/music/notes";
import { dayKey } from "../../src/store/dates";
import { sampleData } from "./seed";
import { answer, FAKE_MIC, info, next, seed, stored, waitNext } from "./util";

/** Beispieldaten, in denen nichts fällig und nichts neu ist: Sitzung nur aus Zusatzkarten („Weiter üben“) */
function extrasOnly() {
  const d = sampleData();
  const today = dayKey();
  for (const k of Object.keys(d.cards)) d.cards[k] = { box: 5, day: today, session: 5 };
  return d;
}

/** Bis zur ersten Tonfolge weiter (Karten richtig beantworten) */
async function toFolge(page: Page) {
  for (let i = 0; i < 10; i++) {
    const s = await info(page);
    if (s.step === "folge") return s;
    if (s.step === "card" && s.kind === "spiel") throw new Error("Spielen-Karte vor der Folge");
    await answer(page, true);
    await next(page);
  }
  throw new Error("keine Tonfolge");
}

const folge = (page: Page) => page.locator('main[data-step="folge"]');
const tap = (page: Page, id: string) => folge(page).locator(`.btns button[data-choice="${id}"]`).click();

test.describe("Lesen", () => {
  test("Folge richtig durchtippen: Markierung rückt weiter, Namen wachsen mit, „Richtig“", async ({ page }) => {
    await seed(page, extrasOnly());
    await page.addInitScript(() => ((window as never as { __folgen: string[][] }).__folgen = [["g1", "fis1", "g1", "a1"]]));
    await page.goto("./");
    await page.getByRole("button", { name: /Weiter üben/ }).click();
    const s = await toFolge(page);
    const t0 = await page.evaluate(() => Date.now());
    const m = folge(page);
    await expect(m.locator(".q")).toHaveText("Wie heißen diese Noten? Der Reihe nach.");
    // Die Beschriftung für Vorleser verrät die Namen nicht
    await expect(m.locator(".stage svg").first()).toHaveAttribute("aria-label", "4 Noten");
    await expect(m.locator(".sn")).toHaveCount(4);
    await expect(m.locator(".sn.cur")).toHaveAttribute("data-i", "0");
    await expect(page.getByTestId("count")).toHaveText("2 von 20");
    // 8 Knöpfe (8 Töne freigeschaltet), nach Tonhöhe; mindestens 2 nicht aus der Folge
    const choices = await m.locator(".btns button").evaluateAll((bs) => bs.map((b) => (b as HTMLElement).dataset.choice!));
    expect(choices).toHaveLength(8);
    expect(choices.filter((c) => !["g1", "fis1", "a1"].includes(c)).length).toBeGreaterThanOrEqual(2);
    // Vorzeichen an jeder Note: fis¹ hat ein Kreuz (zwei Pfade: Kopf und Vorzeichen)
    await expect(m.locator('.sn[data-i="1"] path')).toHaveCount(2);
    await tap(page, "g1");
    await expect(m.locator('.sn[data-i="0"]')).toHaveClass(/hit/);
    await expect(m.locator('.sn[data-i="0"] .sl')).toHaveText("g1");
    await expect(m.locator(".sn.cur")).toHaveAttribute("data-i", "1");
    await tap(page, "fis1");
    await tap(page, "g1");
    await tap(page, "a1");
    await expect(page.getByTestId("panel")).toContainText("Richtig");
    await expect(m.locator(".sn.hit")).toHaveCount(4);
    // jeder Ton einmal gewertet: g¹ (zweimal in der Folge) bekommt einen Eintrag
    const d = await stored(page);
    const fresh = (n: string) => (d.history.lesen[n] as [number, string, number][]).filter((a) => a[2] >= t0);
    expect(fresh("g1")).toHaveLength(1);
    expect(fresh("g1")[0][0]).toBe(1);
    expect(fresh("fis1")).toHaveLength(1);
    expect(fresh("a1")).toHaveLength(1);
    // geht von selbst weiter
    await waitNext(page, s.seq);
    await expect(page.getByTestId("count")).toHaveText("3 von 20");
  });

  test("Folge mit Fehler: Note rot, richtiger Name darunter, weiter mit der nächsten; Auflösung und Wiederholung", async ({ page }) => {
    await seed(page, extrasOnly());
    await page.addInitScript(() => ((window as never as { __folgen: string[][] }).__folgen = [["e1", "g1", "e1", "a1"]]));
    await page.goto("./");
    await page.getByRole("button", { name: /Weiter üben/ }).click();
    const s = await toFolge(page);
    const m = folge(page);
    const before = (await stored(page)).history.lesen.fis1.length;
    await tap(page, "e1");
    await tap(page, "g1");
    await tap(page, "fis1"); // falsch (e¹)
    await expect(m.locator('.sn[data-i="2"]')).toHaveClass(/miss/);
    await expect(m.locator('.sn[data-i="2"] .sl')).toHaveText("e1");
    await expect(m.locator(".sn.cur")).toHaveAttribute("data-i", "3");
    await tap(page, "a1");
    await expect(page.getByTestId("panel")).toContainText("Nicht ganz");
    await expect(page.getByTestId("panel")).toContainText("Du hast fis1 gewählt");
    const d = await stored(page);
    expect(d.history.lesen.e1.at(-1)[0]).toBe(0); // an einer Stelle falsch → falsch
    expect(d.history.lesen.g1.at(-1)[0]).toBe(1);
    expect(d.history.lesen.fis1.length).toBe(before); // getippt, aber nicht in der Folge
    await page.getByRole("button", { name: "Weiter" }).click();
    await waitNext(page, s.seq);
    // nach 2–3 anderen Schritten kommt dieselbe Folge noch einmal
    for (let k = 0; k < 4; k++) {
      const i = await info(page);
      if (i.step === "folge" && i.retry) {
        await expect(page.locator("main")).toHaveAttribute("data-notes", "e1 g1 e1 a1");
        await expect(page.getByTestId("count")).toHaveText("nochmal");
        return;
      }
      await answer(page, true);
      await next(page);
    }
    throw new Error("keine Wiederholung");
  });

  test("„Weiß nicht“ löst die restlichen Noten auf", async ({ page }) => {
    await seed(page, extrasOnly());
    await page.addInitScript(() => ((window as never as { __folgen: string[][] }).__folgen = [["a1", "h1", "c2"]]));
    await page.goto("./");
    await page.getByRole("button", { name: /Weiter üben/ }).click();
    await toFolge(page);
    const m = folge(page);
    await tap(page, "a1");
    await m.getByRole("button", { name: "Weiß nicht" }).click();
    await expect(page.getByTestId("panel")).toContainText("Auflösung");
    await expect(m.locator(".sn.miss")).toHaveCount(2);
    await expect(m.locator('.sn[data-i="2"] .sl')).toHaveText("c2");
    const d = await stored(page);
    expect(d.history.lesen.a1.at(-1)[0]).toBe(1);
    expect(d.history.lesen.c2.at(-1)[0]).toBe(0);
  });

  test("Querformat: Notenzeile links, Antworten rechts, nichts verschoben", async ({ page }) => {
    await page.setViewportSize({ width: 740, height: 360 });
    await seed(page, extrasOnly());
    await page.goto("./");
    await page.getByRole("button", { name: /Weiter üben/ }).click();
    await toFolge(page);
    const m = folge(page);
    const staff = await m.locator(".stage .staff").boundingBox();
    const btns = await m.locator(".btns").boundingBox();
    expect(staff!.x + staff!.width).toBeLessThanOrEqual(btns!.x + 1);
    const notes = (await m.getAttribute("data-notes"))!.split(" ");
    for (const n of notes) await tap(page, n);
    await expect(page.getByTestId("panel")).toContainText("Richtig");
    const after = await m.locator(".stage .staff").boundingBox();
    expect(after).toEqual(staff);
    // kein Scrollen
    expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  });
});

test.describe("Spielen", () => {
  async function setup(page: Page, folgen: string[][]) {
    await page.addInitScript(FAKE_MIC);
    await seed(page, extrasOnly());
    await page.addInitScript((f) => ((window as never as { __folgen: string[][] }).__folgen = f), folgen);
    await page.goto("./");
    await page.getByRole("button", { name: /Weiter spielen/ }).click();
    await page.waitForFunction(() => (window as never as { __osc: unknown }).__osc !== null);
  }
  const playNow = (page: Page, id: string) =>
    page.evaluate((f) => (window as never as { __osc: { play(f: number): void } }).__osc.play(f), soundingFreq(note(id)));
  /** Töne der Reihe nach, je 600 ms mit 100 ms Absetzen (neuer Einsatz auch bei Tonwiederholung) */
  async function playSeq(page: Page, ids: (string | null)[]) {
    const list: [number, number | null][] = [];
    const t0 = await page.evaluate(() => performance.now() + 100);
    ids.forEach((id, k) => {
      list.push([t0 + k * 700, id ? soundingFreq(note(id)) : null]);
      list.push([t0 + k * 700 + 600, null]);
    });
    await page.evaluate((l) => (window as never as { __osc: { schedule(l: [number, number | null][]): void } }).__osc.schedule(l), list);
    return t0 + ids.length * 700;
  }
  /** Spielen-Karte vorn (fällig ist nichts, die erste ist eine Zusatzkarte) richtig spielen */
  async function toFolge(page: Page) {
    for (let k = 0; k < 4; k++) {
      const i = await info(page);
      if (i.step === "folge") return i;
      await page.waitForTimeout(450);
      await playNow(page, i.note);
      await expect(page.locator(`main[data-seq="${i.seq}"]`)).toHaveClass(/\bok\b/);
      await page.evaluate(() => (window as never as { __osc: { silence(): void } }).__osc.silence());
      await page.locator(`main[data-seq="${i.seq}"] .bar`).click();
      await waitNext(page, i.seq);
    }
    throw new Error("keine Tonfolge");
  }

  test("Folge richtig gespielt (ein Ton kommt wieder), „Anhören“", async ({ page }) => {
    await setup(page, [["g1", "a1", "g1", "h1"]]);
    const s = await toFolge(page);
    const m = folge(page);
    await expect(m.locator(".q")).toHaveText("Spiel diese Töne nacheinander.");
    await expect(m.locator(".listen")).toBeVisible();
    await page.waitForTimeout(300);
    // erst nur zwei Töne: die Markierung steht auf der dritten
    await playSeq(page, ["g1", "a1"]);
    await expect(m.locator(".sn.hit")).toHaveCount(2);
    await page.waitForTimeout(600);
    await expect(m.locator(".sn.cur")).toHaveAttribute("data-i", "2");
    await playSeq(page, ["g1", "h1"]);
    await expect(page.getByTestId("panel")).toContainText("Richtig");
    await expect(m.locator(".sn.hit")).toHaveCount(4);
    const d = await stored(page);
    expect(d.history.spielen.a1.at(-1)[0]).toBe(1);
    expect(d.history.spielen.h1.at(-1)[0]).toBe(1);
    // „Anhören“ hält das automatische Weitergehen an
    await m.getByRole("button", { name: "Anhören" }).click();
    await page.waitForTimeout(2500);
    await expect(page.locator(`main[data-seq="${s.seq}"]`)).toHaveCount(1);
  });

  test("Folge mit Halbtonschritt und falschem Ton: Note rot, wartet weiter auf den richtigen", async ({ page }) => {
    await setup(page, [["a1", "h1", "c2"]]);
    await toFolge(page);
    const m = folge(page);
    await page.waitForTimeout(300);
    await playSeq(page, ["a1"]);
    await expect(m.locator(".sn.hit")).toHaveCount(1);
    await page.waitForTimeout(500);
    // statt h¹ ein deutlich falscher Ton, lange gehalten
    await playNow(page, "d1");
    await expect(m.locator('.sn[data-i="1"]')).toHaveClass(/miss/);
    await expect(m.locator(".q")).toContainText("Du spielst d1");
    await expect(m.locator(".sn.cur")).toHaveAttribute("data-i", "1");
    await page.evaluate(() => (window as never as { __osc: { silence(): void } }).__osc.silence());
    await page.waitForTimeout(150);
    await playSeq(page, ["h1", "c2"]);
    await expect(page.getByTestId("panel")).toContainText("Nicht ganz");
    await expect(m.locator('.sn[data-i="1"] .sl')).toHaveText("h1");
    await expect(m.locator('.sn[data-i="2"]')).toHaveClass(/hit/);
    await expect(m.getByRole("button", { name: "Anhören" })).toBeVisible();
    const d = await stored(page);
    expect(d.history.spielen.h1.at(-1)[0]).toBe(0);
    expect(d.history.spielen.a1.at(-1)[0]).toBe(1);
    expect(d.history.spielen.c2.at(-1)[0]).toBe(1);
  });
});

test.describe("Tippen am Kartenwechsel", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 412, height: 839 } });

  test("Lesen: Tipp, der auf der Karte davor beginnt, zählt nicht als erste Antwort der Folge", async ({ page }) => {
    await page.clock.install();
    await seed(page, extrasOnly());
    await page.goto("./");
    await page.getByRole("button", { name: /Weiter üben/ }).click();
    /** Mitte eines Namenknopfs der Folge (aus einer früheren Folge derselben Sitzung, die Anordnung ist gleich) */
    let pt: { x: number; y: number } | null = null;
    for (let k = 0; k < 16; k++) {
      const i = await info(page);
      const m = page.locator(`main[data-seq="${i.seq}"]`);
      if (i.step === "folge" || !pt) {
        if (i.step === "folge") {
          const box = (await m.locator(".btns button").first().boundingBox())!;
          pt = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
        }
        // ohne Zeiger auflösen (el.click zählt immer) und weiter
        await m.locator('[data-act="idk"]').evaluate((b: HTMLElement) => b.click());
        await m.locator('[data-act="next"]').evaluate((b: HTMLElement) => b.click());
        await waitNext(page, i.seq);
        continue;
      }
      if (i.step !== "card") throw new Error(`unerwartet: ${i.step}`);
      await answer(page, true);
      await expect(page.getByTestId("panel")).toContainText("Richtig");
      // Finger aufsetzen, während „Richtig“ steht; abheben erst nach dem automatischen Wechsel
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [pt] });
      await page.clock.runFor(1800);
      await waitNext(page, i.seq);
      const j = await info(page);
      const hit = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest(".btns button"), pt);
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.clock.runFor(300);
      // nur aussagekräftig, wenn jetzt eine Folge kam und der Finger auf einem ihrer Namenknöpfe lag
      if (j.step !== "folge" || !hit) continue;
      await expect(folge(page).locator(".sn.hit, .sn.miss")).toHaveCount(0);
      await expect(folge(page).locator(".sn.cur")).toHaveAttribute("data-i", "0");
      await expect(folge(page)).toHaveClass(/\bask\b/);
      return;
    }
    throw new Error("keine Folge nach einer Karte");
  });
});
