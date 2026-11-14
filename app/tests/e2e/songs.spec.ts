// Lieder: Liste (Karten, ein- und ausklappbar), Liedseite: Anhören mit Markierung, Tempo, Metronom, ab
// angetipptem Takt; Auswahl beim Mitspielen; Drehen, Verlassen.
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

/** Karte der Liederliste aufklappen, in der das Lied steht (falls zu) */
async function openCardOf(page: Page, songId: string) {
  const card = page.locator(".card", { has: page.locator(`a[data-song="${songId}"]`) });
  const head = card.locator("button.cardhd");
  if ((await head.getAttribute("aria-expanded")) !== "true") await head.click();
  await expect(card.locator(`a[data-song="${songId}"]`)).toBeVisible();
}
/** Name der angezeigten Note als Text, z. B. „d2“ */
const noteName = (page: Page) => page.getByTestId("note-name");

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
  await expect(page.locator(".card.chap .ct").first()).toHaveText("Kinder- und Weihnachtslieder");
  // anderer Lernstand: e² und f¹ bekannt → Alle meine Entchen spielbar
  await page.evaluate(() => {
    const d = JSON.parse(localStorage.getItem("floetentrainer")!);
    d.stages.lesen = "e2-f1";
    localStorage.setItem("floetentrainer", JSON.stringify(d));
  });
  await page.reload();
  await expect(page.getByTestId("can-play").locator('a[data-song="alle-meine-entchen"]')).toBeVisible();
  // jedes Lied lässt sich öffnen, auch ein noch nicht spielbares
  await openCardOf(page, "stille-nacht-heilige-nacht");
  await page.locator('a[data-song="stille-nacht-heilige-nacht"]').click();
  await expect(page.locator(".score svg.sys").first()).toBeVisible();
  await expect(page.locator(".songhead h1")).toHaveText("Stille Nacht, heilige Nacht");
});

test("Abspielen: Einzählen, dann läuft die Markierung zur richtigen Zeit mit, Name der Note wechselt, kein Griffbild", async ({ page }) => {
  await open(page, "#/lied/haenschen-klein");
  await expect(page.locator(".score svg.sys").first()).toBeVisible();
  // vor dem Start: Name der ersten Note (d²); ein Griffbild zeigt die Liedseite nicht
  await expect(noteName(page)).toHaveText(chartNoteByMidi(74)!.id);
  await expect(page.locator(".songpage .flute")).toHaveCount(0);
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
    await expect(noteName(page)).toHaveText(chartNoteByMidi(tl.tones[k].midi)!.id);
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
  await expect(page.locator(".songpage .flute")).toHaveCount(0);
});

/** mitlaufender Balken: Mitte, oberer und unterer Rand (Fensterkoordinaten), Zeile; null, wenn nicht zu sehen */
const playheadAt = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector<HTMLElement>(".playhead");
    if (!el?.classList.contains("on")) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, top: r.top, bottom: r.bottom, sys: Number(el.dataset.sys), width: r.width };
  });
/** Mitte des Notenkopfs einer Note und Lage ihrer Zeile (Notensystem und erste Liedsilbe) */
const headAt = (page: Page, id: number) =>
  page.evaluate((i) => {
    const h = document.querySelector(`.score g[data-id="${i}"] path.h`)!;
    const svg = h.closest("svg")!;
    const r = h.getBoundingClientRect();
    const lines = [...svg.querySelectorAll(".sl")].map((l) => l.getBoundingClientRect());
    const syl = svg.querySelector(".syl")?.getBoundingClientRect() ?? null;
    return {
      x: r.left + r.width / 2,
      sys: [...document.querySelectorAll(".score svg.sys")].indexOf(svg),
      staffTop: Math.min(...lines.map((l) => l.top)),
      staffBottom: Math.max(...lines.map((l) => l.bottom)),
      sylTop: syl ? syl.top : null,
    };
  }, id);

test("Mitlaufender Balken: steht beim Einzählen an der ersten Note, läuft gleichmäßig mit, springt in die nächste Zeile", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await open(page, "#/lied/haenschen-klein");
  await expect(page.locator(".score svg.sys").first()).toBeVisible();
  expect(await playheadAt(page)).toBeNull(); // vor dem Start nicht zu sehen
  await page.getByRole("button", { name: "Abspielen" }).click();
  await page.clock.runFor(150);
  const tl = (await lied(page))!;
  // Einzählen: an der ersten Note, über die Höhe des Notensystems, nicht über den Liedtext
  const first = await headAt(page, tl.tones[0].ids[0]);
  let ph = (await playheadAt(page))!;
  expect(ph).not.toBeNull();
  expect(Math.abs(ph.x - first.x)).toBeLessThan(1);
  expect(ph.sys).toBe(0);
  expect(ph.width).toBeGreaterThanOrEqual(2);
  expect(ph.width).toBeLessThanOrEqual(3);
  expect(ph.top).toBeLessThan(first.staffTop);
  expect(ph.bottom).toBeGreaterThan(first.staffBottom);
  expect(ph.top).toBeGreaterThan(first.staffTop - 14);
  if (first.sylTop != null) expect(ph.bottom).toBeLessThan(first.sylTop + 4);
  await page.clock.runFor(1000);
  expect(Math.abs((await playheadAt(page))!.x - first.x)).toBeLessThan(1); // steht still
  // Töne: am Einsatz am Notenkopf, dazwischen gleichmäßig zwischen den Köpfen; stetig nach rechts
  let log = await tones(page);
  while (!log.length) {
    await page.clock.runFor(50);
    log = await tones(page);
  }
  const startOf = (k: number) => log[0].start + (tl.tones[k].start - tl.tones[0].start) * 0.625; // Viertel bei 96
  let prevX = -Infinity;
  let sawNext = false;
  for (let k = 0; k + 1 < tl.tones.length && k < 12; k++) {
    const a = await headAt(page, tl.tones[k].ids[0]);
    const b = await headAt(page, tl.tones[k + 1].ids[0]);
    await runTo(page, startOf(k));
    ph = (await playheadAt(page))!;
    expect(ph.sys).toBe(a.sys);
    expect(Math.abs(ph.x - a.x)).toBeLessThan(4);
    if (b.sys !== a.sys) {
      // Zeilenwechsel: mit dem nächsten Ton in der nächsten Zeile
      await runTo(page, startOf(k + 1) + 0.02);
      const n = (await playheadAt(page))!;
      expect(n.sys).toBe(b.sys);
      expect(n.top).toBeGreaterThan(ph.bottom);
      expect(Math.abs(n.x - b.x)).toBeLessThan(4);
      sawNext = true;
      break;
    }
    const xs: number[] = [];
    for (const f of [0.25, 0.5, 0.75]) {
      await runTo(page, startOf(k) + f * (startOf(k + 1) - startOf(k)));
      xs.push((await playheadAt(page))!.x);
    }
    expect(xs[0]).toBeGreaterThan(Math.max(prevX, a.x - 4));
    expect(xs[1]).toBeGreaterThan(xs[0]);
    expect(xs[2]).toBeGreaterThan(xs[1]);
    expect(xs[2]).toBeLessThan(b.x);
    // gleichmäßig: gleiche Zeitabstände, gleiche Wege (± 1,5 px, ein Bild Raster)
    expect(Math.abs(xs[1] - xs[0] - (xs[2] - xs[1]))).toBeLessThan(1.5);
    prevX = xs[2];
  }
  expect(sawNext).toBe(true);
  // Stopp: weg
  await page.getByRole("button", { name: "Stopp" }).click();
  expect(await playheadAt(page)).toBeNull();
});

test("Markierung der klingenden Note: deutlich (Farbe und Hinterlegung des Kopfs), ohne Übergang", async ({ page }) => {
  await open(page, "#/lied/haenschen-klein");
  await page.getByRole("button", { name: "Abspielen" }).click();
  await page.clock.runFor(4 * 625 + 200);
  const st = await page.evaluate(() => {
    const g = document.querySelector<SVGGElement>(".score g.cur")!;
    const h = g.querySelector("path.h")!;
    const cs = getComputedStyle(g);
    const hs = getComputedStyle(h);
    return { fill: hs.fill, stroke: hs.stroke, sw: hs.strokeWidth, tr: cs.transitionDuration + "|" + hs.transitionDuration };
  });
  expect(st.stroke).not.toBe("none");
  expect(parseFloat(st.sw)).toBeGreaterThan(0.3);
  expect(st.tr).toBe("0s|0s");
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

test("Anhören: Takt antippen spielt ab diesem Takt (mit Einzählen), bis zum Ende, ohne Schleife", async ({ page }) => {
  await open(page, "#/lied/haenschen-klein");
  await expect(page.getByTestId("hint")).toHaveText("Tippe einen Takt an, um ab dort zu hören.");
  await page.locator('rect.takt[data-bar="4"]').click();
  expect(await playing(page)).toBe(true);
  await expect(page.locator('rect.takt[data-bar="4"]')).toHaveClass(/from/);
  await expect(page.locator("rect.takt.picked")).toHaveCount(0);
  const tl = (await lied(page))!;
  const full = await page.evaluate(() => (window as unknown as { __lied: { full: Tl } }).__lied.full);
  expect(tl.bars[0].index).toBe(4);
  // bis zum Liedende: alle Takte ab Takt 5 in Spielreihenfolge
  expect(tl.bars.map((b) => b.index)).toEqual(full.bars.slice(full.bars.findIndex((b) => b.index === 4)).map((b) => b.index));
  // erster eingeplanter Ton ist der erste Ton dieses Takts, nach einem Takt Einzählen
  let log = await tones(page);
  while (!log.length) {
    await page.clock.runFor(50);
    log = await tones(page);
  }
  const first = full.tones.find((t) => t.bar === 4)!;
  expect(log[0].freq).toBeCloseTo(freqOf(first.midi), 1);
  const cl = await clicks(page);
  expect(cl.length).toBe(4);
  for (const c of cl) expect(c.start).toBeLessThan(log[0].start);
  await runTo(page, log[0].start + 0.03);
  expect(await curIds(page)).toEqual(first.ids);
  await expect(page.getByTestId("status")).toHaveText("Takt 5");
  // keine Schleife: nach dem Ende ist Schluss, genau so viele Töne wie der Zeitplan hat
  await page.clock.runFor(Math.ceil(tl.total * 625) + 1500);
  expect(await playing(page)).toBe(false);
  expect((await tones(page)).length).toBe(tl.tones.length);
  await expect(page.locator("rect.takt.from")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Schleife aufheben" })).toHaveCount(0);
  // „Abspielen“ beginnt wieder am Anfang
  await page.getByRole("button", { name: "Abspielen" }).click();
  expect((await lied(page))!.bars[0].index).toBe(0);
});

test("Anhören: Tippen während des Spielens springt sofort dorthin, ohne neues Einzählen", async ({ page }) => {
  await open(page, "#/lied/haenschen-klein");
  await page.getByRole("button", { name: "Abspielen" }).click();
  await page.clock.runFor(3500);
  const clicksBefore = (await clicks(page)).length;
  const n = (await tones(page)).length; // die Uhr steht: bis zum Springen kommt nichts dazu
  await page.locator('rect.takt[data-bar="6"]').click();
  const tl = (await lied(page))!;
  expect(tl.bars[0].index).toBe(6);
  await page.clock.runFor(1500);
  const log = (await tones(page)).slice(n);
  expect(log.length).toBeGreaterThan(0);
  expect(log[0].freq).toBeCloseTo(freqOf(tl.tones[0].midi), 1);
  expect((await clicks(page)).length).toBe(clicksBefore); // kein neues Einzählen
  await expect(page.getByTestId("status")).toHaveText("Takt 7");
});

test("Wischen tippt keinen Takt an", async ({ page }) => {
  await open(page, "#/lied/haenschen-klein");
  const rect = page.locator('rect.takt[data-bar="5"]');
  const box = (await rect.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 4 });
  await page.mouse.up();
  expect(await playing(page)).toBe(false);
  await page.getByRole("tab", { name: "Mitspielen" }).click();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator("rect.takt.picked")).toHaveCount(0);
});

test("Mitspielen: nichts vorausgewählt; ein Takt, mehrere Takte, neu wählen, Auswahl aufheben", async ({ page }) => {
  await open(page, "#/lied/haenschen-klein");
  const tab = page.getByRole("tab", { name: "Mitspielen" });
  await tab.click();
  await expect(tab).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: "Anhören" })).toHaveAttribute("aria-selected", "false");
  // Bedienleiste des Mitspielens statt der fürs Anhören
  await expect(page.getByRole("button", { name: "Abspielen" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Wartet auf mich" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Im Takt" })).toBeVisible();
  await expect(page.getByRole("switch", { name: /Ich trage Kopfhörer/ })).toBeVisible();
  // nichts vorausgewählt: ganzes Lied
  await expect(page.locator("rect.takt.picked")).toHaveCount(0);
  await expect(page.getByTestId("follow-sel")).toBeHidden();
  const go = page.locator('[data-act="fstart"]');
  await expect(go).toHaveText("Mitspielen");
  await expect(page.getByTestId("hint")).toContainText("Ohne Auswahl spielst du das ganze Lied");
  // ein Takt
  await page.locator('rect.takt[data-bar="1"]').click();
  await expect(page.locator("rect.takt.picked")).toHaveCount(1);
  await expect(page.locator('rect.takt[data-bar="1"]')).toHaveClass(/picked/);
  await expect(go).toHaveText("Takt 2 mitspielen");
  await expect(page.getByTestId("follow-sel")).toContainText("Takt 2");
  await expect(page.getByTestId("hint")).toContainText("erweitern");
  expect(await playing(page)).toBe(false); // Tippen spielt hier nichts vor
  // zweiter Tipp erweitert bis dorthin (auch rückwärts)
  await page.locator('rect.takt[data-bar="3"]').click();
  await expect(page.locator("rect.takt.picked")).toHaveCount(3);
  await expect(go).toHaveText("Takt 2–4 mitspielen");
  // ein weiterer Tipp beginnt neu
  await page.locator('rect.takt[data-bar="5"]').click();
  await expect(go).toHaveText("Takt 6 mitspielen");
  await page.locator('rect.takt[data-bar="4"]').click();
  await expect(go).toHaveText("Takt 5–6 mitspielen");
  await expect(page.locator("rect.takt.picked")).toHaveCount(2);
  // Auswahl aufheben
  await page.getByRole("button", { name: "Auswahl aufheben" }).click();
  await expect(page.locator("rect.takt.picked")).toHaveCount(0);
  await expect(go).toHaveText("Mitspielen");
  await expect(page.getByTestId("follow-sel")).toBeHidden();
  // zurück zum Anhören: keine Auswahl zu sehen, Tippen spielt ab dort
  await page.locator('rect.takt[data-bar="2"]').click();
  await page.getByRole("tab", { name: "Anhören" }).click();
  await expect(page.locator("rect.takt.picked")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Abspielen" })).toBeVisible();
  await page.locator('rect.takt[data-bar="3"]').click();
  expect(await playing(page)).toBe(true);
  expect((await lied(page))!.bars[0].index).toBe(3);
  // Wechsel zum Mitspielen hält das Vorspielen an
  await tab.click();
  expect(await playing(page)).toBe(false);
});

test("Liederliste: Karten klappen über die Kopfzeile auf und zu; der Zustand bleibt nach dem Neuladen", async ({ page }) => {
  await seed(page, withStage("c2-d2"));
  await page.goto("./#/lieder");
  const can = page.getByTestId("can-play");
  const own = page.getByTestId("own-songs");
  const kinder = page.locator(".card.chap").first();
  const head = (c: typeof can) => c.locator("button.cardhd");
  // Standard: „Kannst du schon spielen“ offen; „Eigene Lieder“ (nur Hinweis und Knopf) offen; Kapitel zu
  await expect(head(can)).toHaveAttribute("aria-expanded", "true");
  await expect(can.locator('a[data-song="haenschen-klein"]')).toBeVisible();
  await expect(head(own)).toHaveAttribute("aria-expanded", "true");
  await expect(own.getByRole("link", { name: "Lied hinzufügen" })).toBeVisible();
  await expect(head(kinder)).toHaveAttribute("aria-expanded", "false");
  await expect(kinder.locator('a[data-song="alle-meine-entchen"]')).toBeHidden();
  // Tippfläche der Kopfzeile mindestens 48 px hoch
  expect((await head(kinder).boundingBox())!.height).toBeGreaterThanOrEqual(48);
  // aufklappen, zuklappen
  await head(kinder).click();
  await expect(head(kinder)).toHaveAttribute("aria-expanded", "true");
  await expect(kinder.locator('a[data-song="alle-meine-entchen"]')).toBeVisible();
  await head(can).click();
  await expect(head(can)).toHaveAttribute("aria-expanded", "false");
  await expect(can.locator('a[data-song="haenschen-klein"]')).toBeHidden();
  // nach dem Neuladen gleich; nicht im Datenspeicher (keine Sicherung), sondern als Bequemlichkeit je Gerät
  await page.reload();
  await expect(head(can)).toHaveAttribute("aria-expanded", "false");
  await expect(can.locator('a[data-song="haenschen-klein"]')).toBeHidden();
  await expect(head(kinder)).toHaveAttribute("aria-expanded", "true");
  await expect(kinder.locator('a[data-song="alle-meine-entchen"]')).toBeVisible();
  expect(JSON.stringify(await page.evaluate(() => JSON.parse(localStorage.getItem("floetentrainer")!)))).not.toContain("cardOpen");
  expect(await page.evaluate(() => localStorage.getItem("floetentrainer-liederliste"))).toContain("Kinder");
  // ein kaputter gemerkter Zustand stört nicht
  await page.evaluate(() => localStorage.setItem("floetentrainer-liederliste", "{kaputt"));
  await page.reload();
  await expect(head(can)).toHaveAttribute("aria-expanded", "true");
});

test("Liederliste: ist „Kannst du schon spielen“ leer, ist das erste Kapitel offen", async ({ page }) => {
  await seed(page, withStage("erste-toene"));
  await page.goto("./#/lieder");
  await expect(page.getByTestId("can-play")).toContainText("Noch keins");
  await expect(page.locator(".card.chap").first().locator("button.cardhd")).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(".card.chap").nth(1).locator("button.cardhd")).toHaveAttribute("aria-expanded", "false");
});

test("Drehen bricht neu um, Markierung und Auswahl bleiben", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await open(page, "#/lied/jingle-bells");
  const sys = page.locator("main.songpage");
  const portrait = Number(await sys.getAttribute("data-systems"));
  await page.locator('rect.takt[data-bar="2"]').click(); // ab Takt 3
  await page.clock.runFor(4500);
  const ids = await curIds(page);
  expect(ids.length).toBeGreaterThan(0);
  const w0 = await page.locator(".score svg.sys").first().getAttribute("width");
  await page.setViewportSize({ width: 740, height: 360 });
  await expect.poll(() => page.locator(".score svg.sys").first().getAttribute("width")).not.toBe(w0);
  expect(Number(await sys.getAttribute("data-systems"))).not.toBe(portrait);
  expect(await curIds(page)).toEqual(ids);
  await expect(page.locator('rect.takt[data-bar="2"]')).toHaveClass(/from/);
  expect(await playing(page)).toBe(true);
  // Querformat: Umschalter und Bedienleiste rechts neben den Noten
  const sc = (await page.locator(".scorebox").boundingBox())!;
  for (const sel of [".modes", ".pin"]) expect((await page.locator(sel).boundingBox())!.x).toBeGreaterThan(sc.x + sc.width);
  // Auswahl beim Mitspielen bleibt beim Zurückdrehen
  await page.getByRole("tab", { name: "Mitspielen" }).click();
  await page.locator('rect.takt[data-bar="4"]').click();
  await page.locator('rect.takt[data-bar="5"]').click();
  await page.setViewportSize({ width: 360, height: 740 });
  await expect(page.locator("rect.takt.picked")).toHaveCount(2);
  await expect(page.locator('[data-act="fstart"]')).toHaveText("Takt 5–6 mitspielen");
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
