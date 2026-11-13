// Eigene Lieder (ABC): hinzufügen per Datei oder Text, Auswahl, Fehlerstücke, Weggelassenes, Oktav-Angebot,
// Liste, Liedseite mit Vorspielen, Neuladen, Sicherung, Löschen.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "@playwright/test";
import { audioLog, FAKE_AUDIO } from "./fake-audio";
import { sampleData } from "./seed";
import { seed, stored } from "./util";

const abcPath = (name: string) => fileURLToPath(new URL(`../unit/abc/${name}`, import.meta.url));
const abcText = (name: string) => readFileSync(abcPath(name), "utf8");

/** Beispieldaten (Version 1, wie ältere Geräte) – beim Laden wird daraus Version 2 */
const withOwn = (ownSongs: unknown[]) => ({ ...sampleData(), version: 2, ownSongs });
const greensleeves = () => {
  const t = abcText("sammlung.abc");
  return { id: "abc-greensleeves", title: "Greensleeves", abc: t.slice(t.indexOf("X:3")), number: 3, index: 0, shift: 0, added: Date.UTC(2026, 10, 13, 12) };
};

async function toAdd(page: Page) {
  await page.goto("./#/lieder");
  await page.getByRole("link", { name: "Lied hinzufügen" }).click();
  await expect(page.locator(".songadd h1")).toHaveText("Lied hinzufügen");
}

test("Datei mit mehreren Stücken: auswählen, Weggelassenes sehen, übernehmen; bleibt nach Neuladen", async ({ page }) => {
  await seed(page, sampleData());
  await toAdd(page);
  await page.getByTestId("abc-file").setInputFiles(abcPath("sammlung.abc"));
  const res = page.getByTestId("abc-result");
  await expect(res).toContainText("sammlung.abc · 3 Stücke");
  await expect(page.getByTestId("tune-0")).toContainText("Bruder Jakob");
  await expect(page.getByTestId("tune-0")).toContainText("G-Dur · 4/4-Takt");
  await expect(page.getByTestId("omitted-0")).toHaveText("Weggelassen: Begleitakkorde (8).");
  await expect(page.getByTestId("omitted-2")).toContainText("Vorschläge (1)");
  await expect(page.getByTestId("omitted-1")).toHaveCount(0);
  // bei mehreren Stücken ist zunächst keins gewählt
  const take = page.locator('[data-act="take"]');
  await expect(take).toBeDisabled();
  await page.getByTestId("tune-0").locator("label").click();
  await page.getByTestId("tune-2").locator("label").click();
  await expect(take).toHaveText("2 Lieder übernehmen");
  await expect(res).toContainText("2 von 3 gewählt");
  // „Alle wählen“ und wieder zurück
  await page.getByRole("button", { name: "Alle wählen" }).click();
  await expect(take).toHaveText("3 Lieder übernehmen");
  await page.getByRole("button", { name: "Keins wählen" }).click();
  await expect(take).toBeDisabled();
  await page.getByTestId("tune-0").locator("label").click();
  await page.getByTestId("tune-2").locator("label").click();
  await take.click();
  // zurück in der Liste, mit kurzer Meldung
  await expect(page.getByTestId("msg")).toHaveText("2 Lieder sind jetzt in deiner Liederliste.");
  await expect(page.locator('a[data-song="abc-bruder-jakob"]')).toBeVisible();
  await expect(page.locator('a[data-song="abc-greensleeves"]')).toContainText("a-Moll (dorisch) · 6/8-Takt");
  // Greensleeves braucht Töne, die sie noch nicht kennt: im Kapitel „Eigene Lieder“ mit „Fehlt noch“
  await expect(page.getByTestId("own-songs").locator('a[data-song="abc-greensleeves"]')).toContainText("Fehlt noch:");
  const d = await stored(page);
  expect(d.version).toBe(2);
  expect(d.ownSongs.map((o: { id: string }) => o.id)).toEqual(["abc-bruder-jakob", "abc-greensleeves"]);
  expect(d.ownSongs[0].abc).toMatch(/^X:1\nT:Bruder Jakob/);
  expect(d.ownSongs[0].abc).not.toContain("Greensleeves");
  // nach dem Neuladen noch da (aus dem Quelltext neu gelesen); die Meldung ist weg
  await page.reload();
  await expect(page.locator('a[data-song="abc-greensleeves"]')).toBeVisible();
  await expect(page.getByTestId("msg")).toHaveCount(0);
  // dieselbe Datei noch einmal: doppelte Kennung wird aufgelöst
  await toAdd(page);
  await page.getByTestId("abc-file").setInputFiles(abcPath("sammlung.abc"));
  await page.getByTestId("tune-0").locator("label").click();
  await page.locator('[data-act="take"]').click();
  await expect(page.locator('a[data-song="abc-bruder-jakob-2"]')).toBeVisible();
});

test("Doppelklick auf „Lied übernehmen“ speichert das Lied nur einmal; Latin-1-Datei mit Umlauten", async ({ page }) => {
  await seed(page, sampleData());
  await toAdd(page);
  await page.getByTestId("abc-text").fill("X:1\nT:Doppelt\nM:3/4\nL:1/4\nK:G\nG A B|c2 B|A3|]\n");
  await page.locator('[data-act="read"]').click();
  await page.locator('[data-act="take"]').dblclick();
  await expect(page.getByTestId("msg")).toHaveText("„Doppelt“ ist jetzt in deiner Liederliste.");
  expect((await stored(page)).ownSongs.map((o: { id: string }) => o.id)).toEqual(["abc-doppelt"]);
  // ältere ABC-Dateien sind oft Latin-1: Umlaute nicht durch „�“ ersetzen
  await toAdd(page);
  const latin1 = Buffer.from("X:1\nT:Hänschen klein\nM:4/4\nL:1/4\nK:G\nG E E2|F D D2|]\n", "latin1");
  await page.getByTestId("abc-file").setInputFiles({ name: "alt.abc", mimeType: "text/plain", buffer: latin1 });
  await expect(page.getByTestId("tune-0")).toContainText("Hänschen klein");
});

test("Fehlerhaftes Stück wird mit Titel, Zeile und Grund gezeigt; das lesbare bleibt übernehmbar", async ({ page }) => {
  await seed(page, sampleData());
  await toAdd(page);
  await page.getByTestId("abc-file").setInputFiles(abcPath("mit-fehler.abc"));
  const errs = page.getByTestId("abc-errors");
  await expect(errs).toContainText("Kaputtes Stück");
  await expect(errs).toContainText("(Nr. 2)");
  await expect(errs).toContainText("Zeile 12: Unbekannte Tonart „K:Xyz“");
  await expect(errs).toContainText("Die übrigen Stücke lassen sich trotzdem übernehmen.");
  // ein einziges lesbares Stück: ohne Auswahl, gleich übernehmbar
  await expect(page.getByTestId("tune-0")).toContainText("Lesbares Stück");
  await expect(page.getByTestId("tune-0").locator("input")).toHaveCount(0);
  await page.getByRole("button", { name: "Lied übernehmen" }).click();
  await expect(page.getByTestId("msg")).toHaveText("„Lesbares Stück“ ist jetzt in deiner Liederliste.");
  await expect(page.locator('a[data-song="abc-lesbares-stueck"]')).toBeVisible();
});

test("Text einfügen; Stück ohne Noten ergibt eine verständliche Meldung", async ({ page }) => {
  await seed(page, sampleData());
  await toAdd(page);
  const read = page.getByRole("button", { name: "Noten lesen" });
  await expect(read).toBeDisabled();
  await page.getByTestId("abc-text").fill("% nur ein Kommentar, keine Noten");
  await read.click();
  await expect(page.getByTestId("abc-errors")).toContainText("Nicht lesbar");
  await expect(page.getByTestId("abc-errors")).toContainText("Keine ABC-Noten gefunden");
  await expect(page.locator('[data-act="take"]')).toHaveCount(0);
  // zurück zur Eingabe: der Text ist noch da
  await page.getByRole("button", { name: "Andere Eingabe" }).click();
  await expect(page.getByTestId("abc-text")).toHaveValue("% nur ein Kommentar, keine Noten");
  await page.getByTestId("abc-text").fill(abcText("alle-meine-entchen.abc"));
  await read.click();
  await expect(page.getByTestId("abc-result")).toContainText("Eingefügter Text · 1 Stück");
  await page.getByRole("button", { name: "Lied übernehmen" }).click();
  await expect(page.locator('a[data-song="abc-alle-meine-entchen"]')).toBeVisible();
});

const LOW = "X:1\nT:Tiefes Lied\nM:4/4\nL:1/4\nK:C\nC, D, E, F, | G, A, B, C |]\n";
const WIDE = "X:2\nT:Zu weit\nM:4/4\nL:1/4\nK:C\nC, D, E, F, | c' d' e' f' |]\n";

test("Umfang: Oktave verschieben ist angeboten und angehakt; sonst Hinweis auf Töne außerhalb", async ({ page }) => {
  await seed(page, sampleData());
  await toAdd(page);
  await page.getByTestId("abc-text").fill(LOW + "\n" + WIDE + "\n" + LOW.replace("X:1", "X:3").replace("Tiefes Lied", "Bleibt tief"));
  await page.getByRole("button", { name: "Noten lesen" }).click();
  await expect(page.getByTestId("tune-0")).toContainText("zu tief");
  const shift0 = page.getByTestId("shift-0");
  await expect(shift0).toBeChecked();
  await expect(page.getByTestId("tune-0")).toContainText("Eine Oktave höher setzen");
  await expect(page.getByTestId("outside-1")).toContainText("Außerhalb der Sopranflöte");
  await expect(page.getByTestId("outside-1")).toContainText("Anhören lässt es sich trotzdem");
  await expect(page.getByTestId("shift-1")).toHaveCount(0);
  // beim dritten die Verschiebung abwählen
  await page.getByTestId("tune-2").locator(".tick").click();
  await expect(page.getByTestId("shift-2")).not.toBeChecked();
  await page.getByRole("button", { name: "Alle wählen" }).click();
  await expect(page.getByTestId("shift-2")).not.toBeChecked(); // bleibt beim Neuzeichnen
  await page.getByRole("button", { name: "3 Lieder übernehmen" }).click();
  const d = await stored(page);
  expect(d.ownSongs.map((o: { shift: number }) => o.shift)).toEqual([12, 0, 0]);
  // verschoben: erster Ton c¹; nicht verschoben: c (kleine Oktave), lässt sich trotzdem öffnen
  await page.locator('a[data-song="abc-tiefes-lied"]').click();
  await expect(page.locator(".score svg.sys").first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __lied: { song: { notes: { pitch: { midi: number } }[] } } }).__lied.song.notes[0].pitch.midi)).toBe(60);
  await expect(page.getByTestId("own-info")).toContainText("eine Oktave höher gesetzt");
  await page.goto("./#/lied/abc-bleibt-tief");
  await expect(page.locator(".score svg.sys").first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __lied: { song: { notes: { pitch: { midi: number } }[] } } }).__lied.song.notes[0].pitch.midi)).toBe(48);
  await expect(page.getByTestId("own-info")).toContainText("Außerhalb der Sopranflöte");
});

test("Liedseite eines eigenen Lieds: Vorspielen, Tempo je Lied, Hinweise, Quelle; Löschen mit Bestätigung", async ({ page }) => {
  await page.addInitScript(FAKE_AUDIO);
  await page.clock.install();
  await seed(page, withOwn([greensleeves()]));
  await page.goto("./#/lieder");
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 100);
  await page.locator('a[data-song="abc-greensleeves"]').click();
  await expect(page.locator(".songhead h1")).toHaveText("Greensleeves");
  await expect(page.locator(".songhead .meta")).toContainText("a-Moll (dorisch)");
  await expect(page.locator(".credit")).toHaveText("England, 16. Jahrhundert");
  await expect(page.getByTestId("own-info")).toContainText("Eigenes Lied, eingelesen am 13.11.2026.");
  await expect(page.getByTestId("own-omitted")).toContainText("Begleitakkorde (18)");
  // Vorspielen wie bei Heft-Liedern: Einzählen (6/8: zwei Schläge), dann Töne mit Markierung
  await page.getByRole("button", { name: "Abspielen" }).click();
  await page.clock.runFor(6000);
  const tl = await page.evaluate(() => (window as unknown as { __lied: { timeline(): { tones: { midi: number }[]; countIn: number[] } } }).__lied.timeline());
  expect(tl!.countIn[0]).toBe(0);
  expect(tl!.countIn[1]).toBe(1.5); // 6/8: Schläge in punktierten Vierteln
  const log = await audioLog(page, "tone");
  expect(log.length).toBeGreaterThan(3);
  expect(log[0].freq).toBeCloseTo(440 * 2 ** ((tl!.tones[0].midi + 12 - 69) / 12), 1);
  await expect(page.locator(".score .cur").first()).toBeVisible();
  await page.getByRole("button", { name: "Stopp" }).click();
  // Tempo je Lied gemerkt
  await page.getByTestId("tempo-range").evaluate((el: HTMLInputElement) => {
    el.value = "70";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect((await stored(page)).songs["abc-greensleeves"].tempo).toBe(70);
  // Löschen: erst Bestätigung in der Seite, Abbrechen lässt alles, wie es ist
  await page.getByRole("button", { name: "Lied löschen" }).click();
  await expect(page.getByText("„Greensleeves“ wirklich löschen?")).toBeVisible();
  await page.getByRole("button", { name: "Abbrechen" }).click();
  await expect(page.getByText("wirklich löschen?")).toHaveCount(0);
  expect((await stored(page)).ownSongs).toHaveLength(1);
  await page.getByRole("button", { name: "Lied löschen" }).click();
  await page.getByRole("button", { name: "Ja, löschen" }).click();
  await expect(page.getByTestId("msg")).toHaveText("„Greensleeves“ wurde gelöscht.");
  await expect(page.locator('a[data-song="abc-greensleeves"]')).toHaveCount(0);
  const d = await stored(page);
  expect(d.ownSongs).toEqual([]);
  expect(d.songs["abc-greensleeves"]).toBeUndefined();
  // die Adresse des gelöschten Lieds führt zur Liste
  await page.goto("./#/lied/abc-greensleeves");
  await expect(page.getByTestId("own-songs")).toBeVisible();
});

test("Sicherung: eigene Lieder kommen hinein und beim Einlesen wieder heraus", async ({ page }) => {
  await seed(page, withOwn([greensleeves()]));
  await page.goto("./#/einstellungen");
  const dl = page.waitForEvent("download");
  await page.getByRole("button", { name: "Sicherung herunterladen" }).click();
  const path = await (await dl).path();
  const backup = JSON.parse(readFileSync(path, "utf8"));
  expect(backup.version).toBe(2);
  expect(backup.ownSongs[0]).toMatchObject({ id: "abc-greensleeves", number: 3, shift: 0 });
  expect(backup.ownSongs[0].abc).toContain("T:Greensleeves");
  // alles zurücksetzen (nennt die eigenen Lieder), dann die Sicherung einlesen
  await page.getByRole("button", { name: "Alles zurücksetzen" }).click();
  await expect(page.getByText("Einstellungen und eigene Lieder gehen verloren")).toBeVisible();
  await page.getByRole("button", { name: "Ja, alles löschen" }).click();
  expect((await stored(page)).ownSongs).toEqual([]);
  await page.getByTestId("import-file").setInputFiles(path);
  await expect(page.getByTestId("import-info")).toHaveText("Die Sicherung ist in Ordnung und enthält ein eigenes Lied. Sie ersetzt alle jetzigen Daten.");
  await page.getByRole("button", { name: "Sicherung übernehmen" }).click();
  await page.goto("./#/lieder");
  await page.locator('a[data-song="abc-greensleeves"]').click();
  await expect(page.locator(".score svg.sys").first()).toBeVisible();
  // eine Sicherung mit kaputtem Eintrag wird abgelehnt, die Daten bleiben
  await page.goto("./#/einstellungen");
  const bad = { ...backup, ownSongs: [{ id: "abc-x", title: "X" }] };
  await page.getByTestId("import-file").setInputFiles({ name: "x.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(bad)) });
  await expect(page.getByTestId("msg")).toContainText("Eigenes Lied Nr. 1 fehlerhaft");
  expect((await stored(page)).ownSongs).toHaveLength(1);
});

test("Ein Lied, das sich nicht mehr lesen lässt, bleibt und wird mit Hinweis gezeigt", async ({ page }) => {
  const broken = { id: "abc-kaputt", title: "Kaputtes Lied", abc: "X:1\nT:Kaputtes Lied\nK:Xyz\nC D E|\n", number: 1, index: 0, shift: 0, added: 1 };
  await seed(page, withOwn([broken, greensleeves()]));
  await page.goto("./#/lieder");
  const row = page.locator('a[data-song="abc-kaputt"]');
  await expect(row).toContainText("Kaputtes Lied");
  await expect(row.getByTestId("unreadable")).toHaveText("Lässt sich zurzeit nicht lesen");
  await row.click();
  await expect(page.locator("h1")).toHaveText("Kaputtes Lied");
  await expect(page.getByTestId("own-error")).toContainText("Unbekannte Tonart");
  expect((await stored(page)).ownSongs).toHaveLength(2);
  // löschen geht auch hier
  await page.getByRole("button", { name: "Lied löschen" }).click();
  await page.getByRole("button", { name: "Ja, löschen" }).click();
  expect((await stored(page)).ownSongs.map((o: { id: string }) => o.id)).toEqual(["abc-greensleeves"]);
});
