// Lieder: Liste, Liedseite, Vorspielen mit Markierung, Tempo, Metronom, Abschnitt, Drehen, Verlassen.
// Audio-Uhr, Timer und requestAnimationFrame laufen über page.clock: Die Tests warten nie in Echtzeit.
import { expect, test, type Page } from "@playwright/test";
import { chartNoteByMidi } from "../../src/music/notes";
import { audioLog, FAKE_AUDIO } from "./fake-audio";
import { sampleData } from "./seed";
import { seed } from "./util";

interface Tl {
  tones: { start: number; dur: number; midi: number; ids: number[]; bar: number }[];
  bars: { index: number; start: number; dur: number }[];
  countIn: number[];
  total: number;
}

/** Seite mit vorgetäuschter Audio-Uhr öffnen; die Uhr steht danach still, bis der Test sie weiterstellt. */
async function open(page: Page, hash: string, data: unknown = sampleData()) {
  await page.addInitScript(FAKE_AUDIO);
  await page.clock.install();
  await seed(page, data);
  await page.goto("./" + hash);
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
}

type Lied = { player: { playing: boolean; context: AudioContext | null }; timeline(): Tl | null };
const lied = (page: Page) => page.evaluate(() => (window as unknown as { __lied: Lied }).__lied.timeline());
const playing = (page: Page) => page.evaluate(() => (window as unknown as { __lied: Lied }).__lied.player.playing);
const audioNow = (page: Page) => page.evaluate(() => (window as unknown as { __lied: Lied }).__lied.player.context?.currentTime ?? 0);
/** Uhr bis zur Audiozeit t (s) weiterstellen */
async function runTo(page: Page, t: number) {
  const now = await audioNow(page);
  if (t > now) await page.clock.runFor(Math.ceil((t - now) * 1000));
}
const curIds = (page: Page) =>
  page.evaluate(() => [...document.querySelectorAll<SVGGElement>(".score .cur")].map((e) => Number(e.dataset.id)).sort((a, b) => a - b));
const freqOf = (midi: number, a4 = 440) => a4 * 2 ** ((midi + 12 - 69) / 12);
const tones = (page: Page) => audioLog(page, "tone");
const clicks = (page: Page) => audioLog(page, "click");

async function setTempo(page: Page, pct: number) {
  await page.getByTestId("tempo-range").evaluate((el: HTMLInputElement, v) => {
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, pct);
}

/** Lesen-Stufe setzen (Beispieldaten) */
const withStage = (lesen: string) => ({ ...sampleData(), stages: { lesen, spielen: "erste-toene" } });

test("Startseite zeigt „Lieder“ und führt zur Liste", async ({ page }) => {
  await seed(page, sampleData());
  await page.goto("./");
  const links = page.locator("nav.links a");
  await expect(links).toHaveText(["Lieder", "Stimmgerät", "Grifftabelle", "Einstellungen"]);
  await page.getByRole("link", { name: "Lieder" }).click();
  await expect(page.getByRole("heading", { name: "Kannst du schon spielen" })).toBeVisible();
});

test("Liste: „Kannst du schon spielen“ und „Fehlt noch“ nach dem Lernstand", async ({ page }) => {
  await seed(page, withStage("c2-d2")); // h¹ a¹ g¹ c² d²
  await page.goto("./#/lieder");
  const can = page.getByTestId("can-play");
  await expect(can.getByRole("link", { name: /Hänschen klein/ })).toBeVisible();
  await expect(can.getByRole("link", { name: /Kuckuck/ })).toBeVisible();
  await expect(can.getByRole("link", { name: /Alle meine Entchen/ })).toHaveCount(0);
  const entchen = page.locator('.chap a[data-song="alle-meine-entchen"]');
  await expect(entchen).toContainText("Fehlt noch: e2");
  await expect(entchen).toContainText("2/4");
  await expect(page.locator(".chap:not(.own) h2").first()).toHaveText("Kinder- und Weihnachtslieder");
  // anderer Lernstand: e² und f¹ bekannt → Alle meine Entchen spielbar
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("floetentrainer")!);
    d.stages.lesen = "e2-f1";
    localStorage.setItem("floetentrainer", JSON.stringify(d));
  });
  await page.reload();
  await expect(page.getByTestId("can-play").locator('a[data-song="alle-meine-entchen"]')).toBeVisible();
  // jedes Lied lässt sich öffnen, auch ein noch nicht spielbares
  await page.locator('a[data-song="stille-nacht-heilige-nacht"]').click();
  await expect(page.locator(".score svg.sys").first()).toBeVisible();
  await expect(page.locator(".songhead h1")).toHaveText("Stille Nacht, heilige Nacht");
});

test("Abspielen: Einzählen, dann läuft die Markierung zur richtigen Zeit mit, Griffbild wechselt", async ({ page }) => {
  await open(page, "#/lied/haenschen-klein");
  await expect(page.locator(".score svg.sys").first()).toBeVisible();
  // vor dem Start: Griffbild der ersten Note (d²)
  await expect(page.locator(".pfl .flute")).toHaveAttribute("data-fingering", chartNoteByMidi(74)!.fingering);
  await page.getByRole("button", { name: "Abspielen" }).click();
  await page.clock.runFor(150);
  await expect(page.getByTestId("count")).toBeVisible();
  await expect(page.locator('[data-testid="count"] i.on')).toHaveText("1");
  expect(await curIds(page)).toEqual([]);
  const tl = (await lied(page))!;
  expect(tl.countIn).toHaveLength(4);
  for (let k = 0; k < 7; k++) {
    let log = await tones(page);
    while (log.length <= k) {
      await page.clock.runFor(50);
      log = await tones(page);
    }
    const t = log[k];
    await runTo(page, t.start + 0.03);
    expect(t.freq).toBeCloseTo(freqOf(tl.tones[k].midi), 1);
    expect(await curIds(page)).toEqual(tl.tones[k].ids);
    await expect(page.locator(".pfl .flute")).toHaveAttribute("data-fingering", chartNoteByMidi(tl.tones[k].midi)!.fingering);
    await expect(page.getByTestId("count")).toBeHidden();
  }
  // eingezählt wurde genau ein Takt, betont auf der Eins, vor dem ersten Ton
  const log = await tones(page);
  const cl = await clicks(page);
  expect(cl.length).toBe(4);
  for (const c of cl) expect(c.start).toBeLessThan(log[0].start);
  // Abstände: Viertel bei 96 Schlägen pro Minute
  expect(log[1].start - log[0].start).toBeCloseTo(60 / 96, 2);
  await expect(page.getByRole("button", { name: "Stopp" })).toBeVisible();
});

test("Bindebogen (Stille Nacht): gebundene Töne stehen einzeln im Protokoll, Markierung läuft mit", async ({ page }) => {
  await open(page, "#/lied/stille-nacht-heilige-nacht");
  await expect(page.locator(".score svg.sys").first()).toBeVisible();
  await page.getByRole("button", { name: "Abspielen" }).click();
  const tl = (await lied(page))!;
  // erst g'4. a'8 unter einem Bogen, dann g'4 neu angesetzt; die Markierung folgt jedem Ton
  let log = await tones(page);
  for (let k = 0; k < 4; k++) {
    while (log.length <= k) {
      await page.clock.runFor(50);
      log = await tones(page);
    }
    await runTo(page, log[k].start + 0.03);
    expect(await curIds(page)).toEqual(tl.tones[k].ids);
    log = await tones(page);
  }
  const cl = await clicks(page);
  const spq = (cl[1].start - cl[0].start) / 1.5; // 6/8: Einzählen auf punktierten Vierteln
  for (let k = 0; k < 4; k++) {
    expect(log[k].freq).toBeCloseTo(freqOf(tl.tones[k].midi), 1);
    expect(log[k].start - log[0].start).toBeCloseTo((tl.tones[k].start - tl.tones[0].start) * spq, 3);
  }
  expect(log.slice(0, 3).map((t) => !!t.legato)).toEqual([false, true, false]);
  // der gebundene Ton endet, wo der nächste gleitet: kein neuer Einsatz dazwischen
  expect(log[0].stop).toBeCloseTo(log[1].start, 6);
});

test("Tempo ändert die Abstände, wirkt sofort und wird je Lied gemerkt", async ({ page }) => {
  await open(page, "#/lied/haenschen-klein");
  await page.getByRole("button", { name: "Abspielen" }).click();
  await page.clock.runFor(4200);
  const a = await tones(page);
  const d100 = a[1].start - a[0].start;
  expect(d100).toBeCloseTo(0.625, 2);
  // während des Spielens auf 50 %: spätere Töne mit doppeltem Abstand
  await setTempo(page, 50);
  await expect(page.getByTestId("tempo")).toContainText("50 %");
  await expect(page.getByTestId("tempo")).toContainText(/=\s*48/);
  const n = (await tones(page)).length;
  await page.clock.runFor(10000);
  const b = await tones(page);
  expect(b.length).toBeGreaterThan(n + 3);
  const gaps = b.slice(n, n + 3).map((t, i) => b[n + i + 1].start - t.start);
  // Hänschen klein T.2–3: Viertel und Halbe – jede Lücke ist ein Vielfaches von 1,25 s (Viertel bei 50 %)
  for (const g of gaps) expect((g / 1.25) % 1 < 0.02 || (g / 1.25) % 1 > 0.98).toBe(true);
  await page.getByRole("button", { name: "Stopp" }).click();
  expect(await playing(page)).toBe(false);
  // neu starten bei 50 %
  const before = (await tones(page)).length;
  await page.getByRole("button", { name: "Abspielen" }).click();
  await page.clock.runFor(7600);
  const c = (await tones(page)).slice(before);
  expect(c[1].start - c[0].start).toBeCloseTo(1.25, 2);
  // gemerkt (im Datenspeicher, je Lied)
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("floetentrainer")!).songs);
  expect(stored["haenschen-klein"].tempo).toBe(50);
  await page.reload();
  await expect(page.getByTestId("tempo-range")).toHaveValue("50");
  await expect(page.getByTestId("tempo")).toContainText("50 %");
  // anderes Lied: unverändert 100 %
  await page.goto("./#/lied/alle-meine-entchen");
  await expect(page.getByTestId("tempo-range")).toHaveValue("100");
});

test("Metronom an: Klicks während des ganzen Lieds", async ({ page }) => {
  await open(page, "#/lied/haenschen-klein");
  const m = page.getByRole("button", { name: "Metronom" });
  await m.click();
  await expect(m).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Abspielen" }).click();
  await page.clock.runFor(7000);
  const first = (await tones(page))[0].start;
  const during = (await clicks(page)).filter((c) => c.start >= first - 1e-3);
  expect(during.length).toBeGreaterThanOrEqual(6);
  // im Takt: Abstand eine Viertel
  expect(during[1].start - during[0].start).toBeCloseTo(0.625, 2);
  expect(during[0].start).toBeCloseTo(first, 2);
});

test("Abschnitt per Tippen: Schleife wiederholt die richtigen Takte ohne neues Einzählen", async ({ page }) => {
  await open(page, "#/lied/haenschen-klein");
  await expect(page.getByTestId("hint")).not.toHaveClass(/gone/);
  await page.locator('rect.takt[data-bar="1"]').click();
  await expect(page.locator('rect.takt[data-bar="1"]')).toHaveClass(/sel/);
  await expect(page.getByTestId("status")).toContainText("Ab Takt 2");
  await page.locator('rect.takt[data-bar="2"]').click();
  await expect(page.getByTestId("status")).toHaveText("Takt 2–3 in Schleife");
  await expect(page.locator("rect.takt.inloop")).toHaveCount(2);
  await expect(page.getByTestId("hint")).toHaveClass(/gone/);
  await page.getByRole("button", { name: "Abspielen" }).click();
  const tl = (await lied(page))!;
  expect(tl.bars.map((b) => b.index)).toEqual([1, 2]);
  // Einzählen + drei Durchgänge
  await page.clock.runFor((4 + 3 * tl.total) * 625 + 300);
  const log = await tones(page);
  const per = tl.tones.length;
  expect(log.length).toBeGreaterThanOrEqual(3 * per);
  for (let k = 0; k < 3 * per; k++) expect(log[k].freq).toBeCloseTo(freqOf(tl.tones[k % per].midi), 1);
  // zweiter Durchgang beginnt nahtlos eine Abschnittslänge später
  expect(log[per].start - log[0].start).toBeCloseTo(tl.total * 0.625, 2);
  // nur einmal eingezählt
  const cl = await clicks(page);
  expect(cl.length).toBe(4);
  expect(Math.max(...cl.map((c) => c.start))).toBeLessThan(log[0].start);
  // Markierung bleibt im Abschnitt
  const ids = new Set(tl.tones.flatMap((t) => t.ids));
  for (const i of await curIds(page)) expect(ids.has(i)).toBe(true);

  // Schleife aufheben: Hinterlegung weg, der laufende Durchgang endet, dann ist Schluss
  await page.getByRole("button", { name: "Schleife aufheben" }).click();
  await expect(page.locator("rect.takt.inloop")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Schleife aufheben" })).toBeHidden();
  await page.clock.runFor(tl.total * 625 + 800);
  expect(await playing(page)).toBe(false);
  await expect(page.getByRole("button", { name: "Abspielen" })).toBeVisible();
  expect(await curIds(page)).toEqual([]);
});

test("Abschnitt während des Spielens: gleicher Takt zweimal = ein Takt, sofort umgestellt", async ({ page }) => {
  await open(page, "#/lied/haenschen-klein");
  await page.getByRole("button", { name: "Abspielen" }).click();
  await page.clock.runFor(3500);
  const clicksBefore = (await clicks(page)).length;
  const n = (await tones(page)).length; // die Uhr steht: bis zum Umstellen kommt nichts dazu
  await page.locator('rect.takt[data-bar="4"]').click();
  await page.locator('rect.takt[data-bar="4"]').click();
  await expect(page.getByTestId("status")).toHaveText("Takt 5 in Schleife");
  const tl = (await lied(page))!;
  expect(tl.bars.map((b) => b.index)).toEqual([4]);
  await page.clock.runFor(4000);
  const log = (await tones(page)).slice(n);
  expect(log.length).toBeGreaterThan(tl.tones.length);
  log.slice(0, tl.tones.length * 2).forEach((t, k) => expect(t.freq).toBeCloseTo(freqOf(tl.tones[k % tl.tones.length].midi), 1));
  expect((await clicks(page)).length).toBe(clicksBefore); // kein neues Einzählen
});

test("Langes Tippen wählt die ganze Zeile, Wischen wählt nichts", async ({ page }) => {
  await open(page, "#/lied/haenschen-klein");
  const rect = page.locator('rect.takt[data-bar="5"]');
  const box = (await rect.boundingBox())!;
  // Wischen
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator("rect.takt.sel, rect.takt.inloop")).toHaveCount(0);
  // langes Tippen
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.clock.runFor(700);
  await page.mouse.up();
  const lineBars = await rect.evaluate((r) => [...(r as unknown as SVGRectElement).ownerSVGElement!.querySelectorAll<SVGRectElement>("rect.takt")].map((x) => Number(x.dataset.bar)));
  expect(lineBars).toContain(5);
  await expect(page.locator("rect.takt.inloop")).toHaveCount(lineBars.length);
  for (const b of lineBars) await expect(page.locator(`rect.takt[data-bar="${b}"]`)).toHaveClass(/inloop/);
  const a = Math.min(...lineBars) + 1;
  const z = Math.max(...lineBars) + 1;
  await expect(page.getByTestId("status")).toHaveText(a === z ? `Takt ${a} in Schleife` : `Takt ${a}–${z} in Schleife`);
  // erneutes Tippen beginnt eine neue Auswahl
  await page.locator('rect.takt[data-bar="0"]').click();
  await expect(page.locator("rect.takt.inloop")).toHaveCount(0);
  await expect(page.locator('rect.takt[data-bar="0"]')).toHaveClass(/sel/);
});

test("Drehen bricht neu um, Markierung und Abschnitt bleiben", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await open(page, "#/lied/jingle-bells");
  const sys = page.locator("main.songpage");
  const portrait = Number(await sys.getAttribute("data-systems"));
  await page.locator('rect.takt[data-bar="2"]').click();
  await page.locator('rect.takt[data-bar="5"]').click();
  await page.getByRole("button", { name: "Abspielen" }).click();
  await page.clock.runFor(4500);
  const ids = await curIds(page);
  expect(ids.length).toBeGreaterThan(0);
  const w0 = await page.locator(".score svg.sys").first().getAttribute("width");
  await page.setViewportSize({ width: 740, height: 360 });
  await expect.poll(() => page.locator(".score svg.sys").first().getAttribute("width")).not.toBe(w0);
  expect(Number(await sys.getAttribute("data-systems"))).not.toBe(portrait);
  expect(await curIds(page)).toEqual(ids);
  await expect(page.locator("rect.takt.inloop")).toHaveCount(4);
  expect(await playing(page)).toBe(true);
  // Querformat: Griffbild rechts neben den Noten
  const fl = (await page.locator(".pfl").boundingBox())!;
  const sc = (await page.locator(".scorebox").boundingBox())!;
  expect(fl.x).toBeGreaterThan(sc.x + sc.width);
});

test("Verlassen, Hintergrund und Ende stoppen die Wiedergabe", async ({ page }) => {
  await open(page, "#/lied/alle-meine-entchen");
  await page.getByRole("button", { name: "Abspielen" }).click();
  await page.clock.runFor(3000);
  expect(await playing(page)).toBe(true);
  // Hintergrund
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { value: true, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  expect(await playing(page)).toBe(false);
  expect(await curIds(page)).toEqual([]);
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  // Ende: Markierung weg, Knopf wieder „Abspielen“
  await page.getByRole("button", { name: "Abspielen" }).click();
  await page.clock.runFor(16000);
  expect(await playing(page)).toBe(false);
  expect(await curIds(page)).toEqual([]);
  await expect(page.getByRole("button", { name: "Abspielen" })).toBeVisible();
  // Verlassen
  await page.getByRole("button", { name: "Abspielen" }).click();
  await page.clock.runFor(3000);
  expect(await playing(page)).toBe(true);
  await page.getByRole("link", { name: "Zurück" }).click();
  await expect(page.getByRole("heading", { name: "Kannst du schon spielen" })).toBeVisible();
  expect(await playing(page)).toBe(false);
  const n = (await tones(page)).length;
  await page.clock.runFor(3000);
  expect((await tones(page)).length).toBe(n);
});

test("Neue Auswahl während der Schleife, dann „Auswahl aufheben“: die alte Schleife endet auch", async ({ page }) => {
  await open(page, "#/lied/haenschen-klein");
  await page.locator('rect.takt[data-bar="1"]').click();
  await page.locator('rect.takt[data-bar="1"]').click();
  await page.getByRole("button", { name: "Abspielen" }).click();
  await page.clock.runFor(4 * 625 + 1000);
  const tl = (await lied(page))!;
  expect(tl.bars.map((b) => b.index)).toEqual([1]);
  // neuer Anfangstakt: die alte Schleife läuft weiter, bis der Endtakt feststeht …
  await page.locator('rect.takt[data-bar="3"]').click();
  await expect(page.getByTestId("status")).toContainText("Ab Takt 4");
  expect(await playing(page)).toBe(true);
  // … oder bis die Auswahl aufgehoben wird: dann wird der laufende Durchgang zu Ende gespielt
  await page.getByRole("button", { name: "Auswahl aufheben" }).click();
  await page.clock.runFor(tl.total * 625 + 800);
  expect(await playing(page)).toBe(false);
  await expect(page.getByRole("button", { name: "Abspielen" })).toBeVisible();
});
