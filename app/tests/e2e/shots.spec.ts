// Bildschirmfotos für die Durchsicht (nur mit SHOTS=1): npx playwright test shots
import { expect, test, type Page } from "@playwright/test";
import { sampleData } from "./seed";
import { answer, FAKE_MIC, info, next, skipIntros } from "./util";
import { FAKE_AUDIO } from "./fake-audio";
import { note, soundingFreq } from "../../src/music/notes";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const abcPath = (name: string) => fileURLToPath(new URL(`../unit/abc/${name}`, import.meta.url));
const abcText = (name: string) => readFileSync(abcPath(name), "utf8");
/** Beispieldaten mit eigenen Liedern (Irish Washerwoman, Drunken Sailor, Greensleeves) */
function ownData() {
  const coll = abcText("sammlung.abc");
  const o = (id: string, title: string, abc: string, number = 1) => ({ id, title, abc, number, index: 0, shift: 0, added: Date.UTC(2026, 10, 13, 12) });
  return {
    ...sampleData(),
    version: 2,
    ownSongs: [
      o("abc-the-irish-washerwoman", "The Irish Washerwoman", abcText("irish-washerwoman.abc")),
      o("abc-drunken-sailor", "Drunken Sailor", abcText("drunken-sailor.abc")),
      o("abc-greensleeves", "Greensleeves", coll.slice(coll.indexOf("X:3")), 3),
    ],
  };
}
const TOO_LOW = "X:4\nT:Tiefes Lied\nM:3/4\nL:1/4\nK:D\nD, E, F, | G,2 A, | B, A, G, | F,3 |]\n";

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
      await page.screenshot({ path: p("l2-liste") });
      await page.screenshot({ path: p("l2-liste-ganz"), fullPage: true });
      // Kapitel aufgeklappt
      await page.locator(".card.chap .cardhd").first().click();
      await page.waitForTimeout(400);
      await page.locator(".card.chap").first().scrollIntoViewIfNeeded();
      await page.screenshot({ path: p("l2b-liste-kapitel") });
      // langes Lied mit Text: Anhören ab Takt 5 (angetippt), Markierung sichtbar
      await page.goto("./#/lied/jingle-bells");
      await page.screenshot({ path: p("l3a-lied-anhoeren") });
      await page.locator('rect.takt[data-bar="4"]').click();
      await page.clock.runFor(5200);
      await expect(page.locator(".score .cur").first()).toBeVisible();
      await page.waitForTimeout(700); // sanftes Scrollen (läuft in Echtzeit)
      await page.screenshot({ path: p("l3-lied-ab-hier") });
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
    test("Eigene Lieder", async ({ page }) => {
      await page.addInitScript(FAKE_AUDIO);
      await page.clock.install();
      await seed(page, ownData());
      const p = (x: string) => `${OUT}/${scheme}-${s.name}-${x}.png`;
      await page.goto("./#/lieder");
      await page.evaluate(() => document.fonts.ready);
      await page.getByTestId("own-songs").locator("button.cardhd").click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: p("e1-liste-eigene"), fullPage: true });
      // Lied hinzufügen: leer, dann Sammlung mit Auswahl und Weggelassenem
      await page.getByRole("link", { name: "Lied hinzufügen" }).click();
      await page.screenshot({ path: p("e2-hinzufuegen") });
      await page.getByTestId("abc-file").setInputFiles(abcPath("sammlung.abc"));
      await page.getByTestId("tune-0").locator("label").click();
      await page.getByTestId("tune-2").locator("label").click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: p("e3-hinzufuegen-auswahl") });
      await page.screenshot({ path: p("e3-hinzufuegen-auswahl-ganz"), fullPage: true });
      // Fehlerstück und Tonumfang
      await page.getByRole("button", { name: "Andere Eingabe" }).click();
      await page.getByTestId("abc-text").fill(abcText("mit-fehler.abc") + "\n" + TOO_LOW);
      await page.getByRole("button", { name: "Noten lesen" }).click();
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.screenshot({ path: p("e4-hinzufuegen-fehler-umfang"), fullPage: true });
      // Liedseite: Irish Washerwoman (Wiederholungen mit Klammern), beim Abspielen
      await page.goto("./#/lied/abc-the-irish-washerwoman");
      await page.getByRole("button", { name: "Abspielen" }).click();
      await page.clock.runFor(3500);
      await expect(page.locator(".score .cur").first()).toBeVisible();
      await page.waitForTimeout(700);
      await page.screenshot({ path: p("e5-lied-abc") });
      await page.getByRole("button", { name: "Stopp" }).click();
      await page.getByRole("button", { name: "Lied löschen" }).click();
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.screenshot({ path: p("e6-lied-abc-loeschen") });
      // Greensleeves: Weggelassenes auf der Liedseite
      await page.goto("./#/lied/abc-greensleeves");
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.screenshot({ path: p("e7-lied-abc-hinweise") });
    });
    test("Mitspielen", async ({ page }) => {
      await page.addInitScript(FAKE_AUDIO);
      await page.addInitScript(FAKE_MIC);
      await seed(page);
      const p = (x: string) => `${OUT}/${scheme}-${s.name}-${x}.png`;
      type Dbg = { started: boolean; startMs: number | null; timeline: { tones: { start: number; dur: number; midi: number }[] } | null; index: number | null };
      const dbg = () => page.evaluate(() => (window as unknown as { __lied: { follow(): Dbg } }).__lied.follow());
      const schedule = (list: [number, number | null][]) =>
        page.evaluate((l) => (window as unknown as { __osc: { schedule(l: [number, number | null][]): void } }).__osc.schedule(l), list);
      const now = () => page.evaluate(() => performance.now());
      // Einstellen: Warte-Modus, ohne Kopfhörer, ohne Auswahl
      await page.goto("./#/lied/jingle-bells");
      await page.evaluate(() => document.fonts.ready);
      await page.getByRole("tab", { name: "Mitspielen" }).click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: p("f1-mitspielen-einstellen") });
      // Warte-Modus mitten im Lied: fünf Noten, eine davon erst falsch; dann ein falscher Ton für die sechste
      await page.getByRole("button", { name: "Mitspielen", exact: true }).click();
      await page.waitForFunction(() => (window as unknown as { __lied: { follow(): Dbg } }).__lied.follow().started);
      await page.waitForFunction(() => (window as unknown as { __osc: unknown }).__osc !== null);
      const tl = (await dbg()).timeline!;
      let t = (await now()) + 150;
      const list: [number, number | null][] = [];
      tl.tones.slice(0, 6).forEach((n, i) => {
        if (i === 2) {
          list.push([t, soundingFreq(n.midi + 2)], [t + 300, null]);
          t += 450;
        }
        list.push([t, soundingFreq(n.midi)], [t + 300, null]);
        t += 450;
      });
      list.push([t, soundingFreq(tl.tones[6].midi - 2)], [t + 1500, null]);
      await schedule(list);
      await page.waitForFunction(() => (window as unknown as { __lied: { follow(): Dbg } }).__lied.follow().index === 6, null, { timeout: 8000 });
      await expect(page.getByTestId("follow-wrong")).toBeVisible({ timeout: 4000 });
      await page.waitForTimeout(300);
      await page.screenshot({ path: p("f2-warte-modus") });
      await page.getByRole("button", { name: "Stopp" }).click();
      await page.waitForTimeout(300);
      // Takt-Modus: Auswahl Takt 5–8 (Einstellen mit Auswahl), mit zwei falschen Tönen; Bild mitten im
      // Durchgang, dann nach dem Durchgang (Farben bleiben stehen)
      await page.getByRole("button", { name: "Im Takt" }).click();
      await page.locator('rect.takt[data-bar="4"]').click();
      await page.locator('rect.takt[data-bar="7"]').click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: p("f1b-mitspielen-auswahl") });
      await page.getByRole("button", { name: "Takt 5–8 mitspielen" }).click();
      await page.waitForFunction(() => (window as unknown as { __lied: { follow(): Dbg } }).__lied.follow().startMs !== null);
      const d = await dbg();
      const spq = await page.evaluate(() => (window as unknown as { __lied: { player: { secPerQuarter: number } } }).__lied.player.secPerQuarter);
      const beat: [number, number | null][] = [];
      d.timeline!.tones.forEach((n, i) => {
        const on = d.startMs! + n.start * spq * 1000;
        const off = d.startMs! + (n.start + n.dur) * spq * 1000 - 60;
        beat.push([on, soundingFreq(i === 3 || i === 8 ? n.midi + 1 : n.midi)], [off, null]);
      });
      await schedule(beat);
      const endMs = d.startMs! + (d.timeline as unknown as { total: number }).total * spq * 1000;
      await page.waitForTimeout(Math.max(0, d.startMs! + 16 * spq * 1000 * 0.55 - (await now())));
      await page.screenshot({ path: p("f3-takt-modus") });
      await page.waitForTimeout(Math.max(0, endMs + 800 - (await now())));
      await expect(page.getByRole("button", { name: "Takt 5–8 mitspielen" })).toBeVisible();
      await page.waitForTimeout(200);
      await page.screenshot({ path: p("f4-nach-dem-durchgang") });
      // Auswahl aufheben, Kopfhörer an (Hinweis ändert sich)
      await page.getByRole("button", { name: "Auswahl aufheben" }).click();
      await page.getByRole("switch", { name: /Kopfhörer/ }).click();
      await page.waitForTimeout(200);
      await page.screenshot({ path: p("f5-mitspielen-kopfhoerer") });
      // Einstellungen: „Ich trage Kopfhörer“
      await page.goto("./#/einstellungen");
      await page.getByRole("heading", { name: "Mitspielen" }).scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -60));
      await page.screenshot({ path: p("f6-einstellungen-kopfhoerer") });
    });
  });
}
