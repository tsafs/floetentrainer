// Spielen: Das Mikrofon wird durch einen Oszillator ersetzt, den der Test steuert.
import { expect, test, type Page } from "@playwright/test";
import { note, soundingFreq } from "../../src/music/notes";
import { sampleData } from "./seed";
import { FAKE_MIC } from "./util";

async function setup(page: Page, data: unknown = sampleData()) {
  await page.addInitScript(FAKE_MIC);
  await page.addInitScript((d) => {
    if (!sessionStorage.getItem("seeded")) {
      localStorage.setItem("floetentrainer", JSON.stringify(d));
      sessionStorage.setItem("seeded", "1");
    }
  }, data);
  await page.goto("./");
}

const main = (page: Page) => page.locator("main");
const target = async (page: Page) => (await main(page).getAttribute("data-note"))!;
const play = (page: Page, id: string) => page.evaluate((f) => (window as never as { __osc: { play(f: number): void } }).__osc.play(f), soundingFreq(note(id)));
const wobble = (page: Page, cents: number) =>
  page.evaluate((c) => (window as never as { __osc: { wobble(c: number): void } }).__osc.wobble(c), cents);
const silence = (page: Page) => page.evaluate(() => (window as never as { __osc: { silence(): void } }).__osc.silence());
const lastAnswer = (page: Page, id: string) =>
  page.evaluate((n) => JSON.parse(localStorage.getItem("floetentrainer")!).history.spielen[n].at(-1)[0], id);

/** ein anderer Ton der Grifftabelle, nicht in der Oktave */
function other(id: string): string {
  const all = ["g1", "a1", "h1", "c2", "d2", "e1", "f1"];
  return all.find((x) => x !== id && Math.abs(note(x).midi - note(id).midi) !== 12)!;
}

async function startPlaying(page: Page) {
  await page.getByRole("button", { name: /Spielen/ }).click();
  await expect(main(page)).toHaveAttribute("data-kind", "spiel");
  await page.waitForFunction(() => (window as never as { __osc: unknown }).__osc !== null);
}

test("richtig gespielt: grünes Feld, geht von selbst weiter, zeigt was die App hört", async ({ page }) => {
  await setup(page);
  await startPlaying(page);
  const t = await target(page);
  await page.waitForTimeout(450);
  await play(page, t);
  await expect(page.locator(".listen .heard")).toContainText(note(t).name);
  await expect(page.getByTestId("panel")).toContainText("Richtig");
  expect(await lastAnswer(page, t)).toBe(1);
  await expect(page.getByTestId("count")).toHaveText("2 von 20", { timeout: 4000 });
});

test("erst falsch, dann richtig: zählt als Fehler", async ({ page }) => {
  await setup(page);
  await startPlaying(page);
  const t = await target(page);
  const wrong = other(t);
  await page.waitForTimeout(450);
  await play(page, wrong);
  await expect(page.getByTestId("panel")).toContainText(`Du spielst ${note(wrong).name}`);
  await expect(page.locator(".panel .flute")).toHaveAttribute("data-fingering", note(t).fingering);
  await play(page, t);
  await expect(page.getByTestId("panel")).toContainText("Jetzt stimmt es");
  expect(await lastAnswer(page, t)).toBe(0);
  const hist = await page.evaluate((n) => JSON.parse(localStorage.getItem("floetentrainer")!).history.spielen[n], t);
  await expect(page.getByTestId("count")).toHaveText("2 von 20", { timeout: 4000 });
  // nur ein Eintrag für diese Karte
  const after = await page.evaluate((n) => JSON.parse(localStorage.getItem("floetentrainer")!).history.spielen[n], t);
  expect(after.length).toBe(hist.length);
});

test("Nachklang der vorigen Karte zählt nicht", async ({ page }) => {
  await setup(page);
  await startPlaying(page);
  const t1 = await target(page);
  await page.waitForTimeout(450);
  await play(page, t1);
  await expect(page.getByTestId("panel")).toContainText("Richtig");
  // Ton klingt weiter, während die nächste Karte kommt
  await expect(page.getByTestId("count")).toHaveText("2 von 20", { timeout: 4000 });
  const t2 = await target(page);
  expect(t2).not.toBe(t1);
  await page.waitForTimeout(1500);
  await expect(main(page)).not.toHaveClass(/\berr\b/);
  await expect(page.getByTestId("panel")).toHaveCount(0);
  // Stille, dann der richtige Ton
  await silence(page);
  await page.waitForTimeout(250);
  await play(page, t2);
  await expect(page.getByTestId("panel")).toContainText("Richtig");
  expect(await lastAnswer(page, t2)).toBe(1);
});

test("Tonwechsel ohne Pause ist ein neuer Einsatz", async ({ page }) => {
  await setup(page);
  await startPlaying(page);
  const t1 = await target(page);
  await page.waitForTimeout(450);
  await play(page, t1);
  await expect(page.getByTestId("count")).toHaveText("2 von 20", { timeout: 4000 });
  const t2 = await target(page);
  await page.waitForTimeout(500);
  await play(page, t2); // direkt vom alten zum neuen Ton
  await expect(page.getByTestId("panel")).toContainText("Richtig");
  expect(await lastAnswer(page, t2)).toBe(1);
});

test("wackelnder Ton (Vibrato ±30 Cent) wird als richtig gewertet", async ({ page }) => {
  await setup(page);
  await startPlaying(page);
  const t = await target(page);
  await wobble(page, 30);
  await page.waitForTimeout(450);
  await play(page, t);
  await expect(page.locator(".listen .heard")).toContainText(note(t).name);
  await expect(page.getByTestId("panel")).toContainText("Richtig");
  expect(await lastAnswer(page, t)).toBe(1);
});

test("„Weiß nicht“ beim Spielen: Griffbild, danach darf gespielt werden", async ({ page }) => {
  await setup(page);
  await startPlaying(page);
  const t = await target(page);
  await page.getByRole("button", { name: "Weiß nicht" }).click();
  await expect(page.getByTestId("panel")).toContainText("Auflösung");
  await expect(page.locator(".panel .flute")).toHaveAttribute("data-fingering", note(t).fingering);
  await play(page, t);
  await expect(page.getByTestId("panel")).toContainText("Jetzt stimmt es");
  expect(await lastAnswer(page, t)).toBe(0);
});

test("Stimmgerät zeigt die gehörte Note", async ({ page }) => {
  await setup(page);
  await page.getByRole("link", { name: "Stimmgerät" }).click();
  await page.waitForFunction(() => (window as never as { __osc: unknown }).__osc !== null);
  await play(page, "fis1");
  await expect(page.getByTestId("tuner-name")).toHaveText("fis1");
  await expect(page.getByTestId("tuner-staff").locator("svg")).toHaveAttribute("data-note", "fis1");
  await play(page, "b1");
  await expect(page.getByTestId("tuner-name")).toHaveText("b1");
});

test("Stimmgerät: wackelnder Ton nahe der Mitte zwischen zwei Halbtönen lässt den Namen nicht flackern", async ({ page }) => {
  await setup(page);
  await page.getByRole("link", { name: "Stimmgerät" }).click();
  await page.waitForFunction(() => (window as never as { __osc: unknown }).__osc !== null);
  // fis¹ +30 Cent mit Vibrato ±35 Cent: roh reicht das bis +65 Cent, also ins g¹
  await wobble(page, 35);
  await page.evaluate((f) => (window as never as { __osc: { play(f: number): void } }).__osc.play(f), soundingFreq(note("fis1")) * Math.pow(2, 30 / 1200));
  await expect(page.getByTestId("tuner-name")).toHaveText("fis1");
  // alle Namen mitschreiben, die in den nächsten 2 s erscheinen
  const seen = await page.evaluate(
    () =>
      new Promise<string[]>((done) => {
        const el = document.querySelector('[data-testid="tuner-name"]')!;
        const names = new Set([el.textContent ?? ""]);
        const obs = new MutationObserver(() => names.add(el.textContent ?? ""));
        obs.observe(el, { childList: true, subtree: true, characterData: true });
        setTimeout(() => {
          obs.disconnect();
          done([...names]);
        }, 2000);
      }),
  );
  expect(seen).toEqual(["fis1"]);
  await expect(page.getByTestId("tuner-cents")).toHaveText(/^\+[1-4]\d Cent$/);
});

test("Stimmgerät: schneller Wechsel g¹–a¹–h¹ auf- und abwärts (Flötenklang) zeigt nur g¹, a¹, h¹; kürzeres Fenster, weniger Zwischenwerte", async ({ page }) => {
  test.setTimeout(60_000);
  await setup(page);
  await page.getByRole("link", { name: "Stimmgerät" }).click();
  await page.waitForFunction(() => (window as never as { __osc: unknown }).__osc !== null);
  await page.waitForFunction(() => (window as never as { __mic: { running: boolean } }).__mic.running);
  const tones = ["g1", "a1", "h1"].map((id) => soundingFreq(note(id)));
  /**
   * Spielt mit Messfenster win 6 s lang g¹ a¹ h¹ a¹ g¹ … (je 2 s mit 6, 8 und 10 Tönen je Sekunde,
   * Tonwechsel abrupt) und schreibt die angezeigten Namen und die rohen Messungen des Mikrofons mit.
   */
  const run = (win: number) =>
    page.evaluate(
      async ({ win, tones }) => {
        type Raw = { freq: number | null; clarity: number };
        const w = window as never as {
          __osc: { flute(n?: number): void; schedule(l: [number, number | null][]): void };
          __mic: { setWindow(n: number): void; listen(fn: (f: Raw) => void): () => void };
        };
        w.__osc.flute(0.03);
        w.__mic.setWindow(win);
        const el = document.querySelector('[data-testid="tuner-name"]')!;
        const names = new Set<string>();
        const obs = new MutationObserver(() => names.add(el.textContent ?? ""));
        obs.observe(el, { childList: true, subtree: true, characterData: true });
        const raw: Raw[] = [];
        const unlisten = w.__mic.listen((f) => raw.push({ freq: f.freq, clarity: f.clarity }));
        const order = [0, 1, 2, 1];
        const list: [number, number | null][] = [];
        let t = performance.now() + 200;
        let k = 0;
        // Tondauer je Ton zufällig ±15 %: sonst stünden die Tonwechsel immer an derselben Stelle zwischen
        // zwei Messungen (Messabstand 25 ms, Tondauern 100/125 ms als Vielfache davon), und es hinge am
        // zufälligen Versatz zu Beginn, ob bei jedem Wechsel ein Zwischenwert entsteht oder bei keinem
        for (const rate of [6, 8, 10]) {
          for (let i = 0; i < 2 * rate; i++, k++, t += (1000 / rate) * (0.85 + 0.3 * Math.random())) list.push([t, tones[order[k % 4]]]);
        }
        list.push([t, null]);
        w.__osc.schedule(list);
        await new Promise((r) => setTimeout(r, t - performance.now() + 600));
        unlisten();
        obs.disconnect();
        return { names: [...names].filter((n) => n !== "–"), raw, changes: list.length - 2 };
      },
      { win, tones },
    );
  // Zwischenwert: gültige Messung (Klarheit, Bereich wie in der App), die mehr als 35 Cent von g¹, a¹
  // und h¹ entfernt liegt – das Fenster hat einen Tonwechsel überspannt. Gezählt: alle und solche
  // direkt hintereinander (zwei Fenster über demselben Wechsel; die kann die Stabilitätsprüfung nicht
  // sicher entfernen).
  const between = (raw: { freq: number | null; clarity: number }[]) => {
    const odd = raw.map(
      (f) =>
        f.freq !== null &&
        f.clarity >= 0.9 &&
        f.freq >= 480 &&
        f.freq <= 2300 &&
        tones.every((x) => Math.abs(1200 * Math.log2(f.freq! / x)) > 35),
    );
    return { all: odd.filter(Boolean).length, pairs: odd.filter((o, i) => o && odd[i - 1]).length };
  };
  const long = await run(2048);
  const short = await run(1024);
  const nLong = between(long.raw);
  const nShort = between(short.raw);
  console.log(
    `Zwischenwerte bei ${long.changes} Tonwechseln: 2048 Samples ${nLong.all} (${nLong.pairs} direkt nacheinander), ` +
      `1024 Samples ${nShort.all} (${nShort.pairs})`,
  );
  // Das lange Fenster erzeugt bei fast jedem Wechsel Zwischenwerte, oft zwei in Folge; das kurze
  // deutlich weniger und (Fenster kürzer als der Messabstand) praktisch nie zwei in Folge
  // (gemessen: 2048 → 48–72 Zwischenwerte, davon 3–14 Paare; 1024 → 24–34, keine Paare)
  expect(nLong.all).toBeGreaterThan(long.changes / 2);
  expect(nShort.all).toBeLessThan(nLong.all * 0.75);
  expect(nShort.pairs).toBeLessThanOrEqual(1);
  // Im Stimmgerät erscheinen nur die gespielten Töne, alle drei
  expect(short.names.sort()).toEqual(["a1", "g1", "h1"]);
});

test("Mikrofon verweigert: verständliche Erklärung", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error("nein"), { name: "NotAllowedError" }));
  });
  await page.goto("./");
  await page.getByRole("button", { name: /Spielen/ }).click();
  await expect(page.getByRole("heading", { name: "Das Mikrofon ist nicht erlaubt" })).toBeVisible();
  await expect(page.getByText("Bei „Mikrofon“ auf „Zulassen“ stellen.")).toBeVisible();
});
