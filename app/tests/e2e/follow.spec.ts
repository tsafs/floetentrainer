// Mitspielen mit Mikrofon: Warte-Modus und Takt-Modus, mit vorgetäuschtem Mikrofon (Oszillator).
//
// Verfahren: Diese Tests laufen in Echtzeit, ohne page.clock. Die Tonerkennung braucht echtes
// Audio-Rendering (Oszillator → MediaStream → Analyser → pitchy), und das läuft auf dem Audio-Thread
// des Browsers in Echtzeit weiter – eine vorgetäuschte Uhr würde Timer und Mikrofon-Frames anhalten,
// das Rendering aber nicht. Damit es stabil und kurz bleibt:
// - ein eigenes kurzes Lied (7 Noten, 2 Takte, ♩ = 120), also wenige Sekunden je Test;
// - die „Spielerin“ plant ihre Töne im Voraus auf der Audio-Uhr des Oszillators ein (__osc.schedule),
//   statt sie einzeln aus dem Test zu schalten – so stört die Verzögerung der Test-Steuerung nicht;
// - im Takt-Modus richtet sie sich nach dem Beginn des Zeitplans, den die Seite meldet (startMs);
// - die Erwartungen haben deutlichen Abstand zu den Grenzen (Verspätung 0,1 s → alles grün,
//   0,35 s bei 0,5-s-Noten → rot, außer wo der verspätete Ton zur nächsten Note passt).
// FAKE_AUDIO protokolliert nebenbei, was der Abspieler einplant (Klicks, Melodie).
import { expect, test, type Page } from "@playwright/test";
import { soundingFreq } from "../../src/music/notes";
import { audioLog, FAKE_AUDIO } from "./fake-audio";
import { sampleData } from "./seed";
import { FAKE_MIC, seed, stored } from "./util";

const ABC = "X:1\nT:Kurz\nM:4/4\nL:1/4\nQ:1/4=120\nK:G\nG A B B | c A G2 |]\n";
const SONG = "abc-kurz";
/** notierte Höhen der Noten: g¹ a¹ h¹ h¹ c² a¹ g¹ (Tonwiederholung h¹ h¹) */
const MELODY = [67, 69, 71, 71, 72, 69, 67];
const SPQ = 0.5; // ♩ = 120
const hz = (midi: number) => soundingFreq(midi);

function data(settings: Record<string, unknown> = {}) {
  return {
    ...sampleData(),
    version: 2,
    settings: { tuningHz: 440, ...settings },
    ownSongs: [{ id: SONG, title: "Kurz", abc: ABC, number: 1, index: 0, shift: 0, added: 0 }],
  };
}

async function open(page: Page, d: unknown = data()) {
  await page.addInitScript(FAKE_AUDIO);
  await page.addInitScript(FAKE_MIC);
  await seed(page, d);
  await page.goto(`./#/lied/${SONG}`);
  await expect(page.locator(".score svg.sys").first()).toBeVisible();
}

interface FollowDebug {
  active: boolean;
  mode: string;
  running: boolean;
  started: boolean;
  timeline: { tones: { start: number; dur: number; midi: number; ids: number[] }[] } | null;
  index: number | null;
  startMs: number | null;
}
const dbg = (page: Page) => page.evaluate(() => (window as unknown as { __lied: { follow(): FollowDebug } }).__lied.follow());

async function start(page: Page, mode: "Warte-Modus" | "Takt-Modus") {
  await page.getByRole("button", { name: "Mitspielen" }).click();
  await page.getByRole("button", { name: mode }).click();
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): FollowDebug } }).__lied.follow().started);
  await page.waitForFunction(() => (window as unknown as { __osc: unknown }).__osc !== null);
}

/** Folge von Stücken [notierte Höhe | null, ms] ab jetzt + lead ms auf der Audio-Uhr einplanen; gibt die Dauer zurück */
async function playSeq(page: Page, pieces: [number | null, number][], lead = 150): Promise<number> {
  return page.evaluate(
    ({ list, lead }) => {
      let t = performance.now() + lead;
      const out: [number, number | null][] = [];
      for (const [f, ms] of list) {
        out.push([t, f]);
        t += ms;
      }
      out.push([t, null]);
      (window as unknown as { __osc: { schedule(l: [number, number | null][]): void } }).__osc.schedule(out);
      return t - performance.now();
    },
    { list: pieces.map(([m, ms]) => [m === null ? null : hz(m), ms] as [number | null, number]), lead },
  );
}

/** Warte-Modus: jede Note 300 ms, danach 150 ms Stille (neuer Einsatz); wrong: falscher Ton vor Note i */
const waitPieces = (wrong: Record<number, number> = {}): [number | null, number][] =>
  MELODY.flatMap((m, i) => [...(i in wrong ? ([[wrong[i], 300], [null, 150]] as [number, number][]) : []), [m, 300], [null, 150]] as [number | null, number][]);

/** Takt-Modus: Töne relativ zum Beginn des Zeitplans, um delay ms verspätet, je 60 ms Lücke vor dem nächsten */
async function playBeat(page: Page, opts: { delay?: number; midis?: number[] } = {}) {
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): FollowDebug } }).__lied.follow().startMs !== null);
  const d = await dbg(page);
  const tones = d.timeline!.tones;
  const midis = opts.midis ?? MELODY;
  const delay = opts.delay ?? 0;
  const list: [number, number | null][] = [];
  tones.forEach((t, i) => {
    const on = d.startMs! + t.start * SPQ * 1000 + delay;
    const off = d.startMs! + (t.start + t.dur) * SPQ * 1000 + delay - 60;
    list.push([on, hz(midis[i])], [off, null]);
  });
  await page.evaluate((l) => (window as unknown as { __osc: { schedule(l: [number, number | null][]): void } }).__osc.schedule(l), list);
}

/** Farbe je Note des Zeitplans: "hit", "miss" oder "" */
async function colors(page: Page): Promise<string[]> {
  return page.evaluate((n) => {
    const gs = [...document.querySelectorAll<SVGGElement>(".score g.n")].sort((a, b) => Number(a.dataset.id) - Number(b.dataset.id));
    return gs.slice(0, n).map((g) => (g.classList.contains("hit") ? "hit" : g.classList.contains("miss") ? "miss" : ""));
  }, MELODY.length);
}
const result = (page: Page) => page.getByTestId("follow-result");
const learning = async (page: Page) => {
  const d = await stored(page);
  return JSON.stringify([d.history, d.cards, d.days, d.sessions, d.stages, d.introduced]);
};

test.describe.configure({ mode: "parallel" });

test("Warte-Modus richtig gespielt: alles grün, Auswertung, Bestwert gemerkt, Lernspuren unverändert, Mikrofon wieder aus", async ({ page }) => {
  await open(page);
  const before = await learning(page);
  await start(page, "Warte-Modus");
  // vor dem ersten Ton: Markierung auf der ersten Note, Griffbild g¹
  await expect(page.getByTestId("follow-note")).toHaveText("g1");
  expect((await dbg(page)).index).toBe(0);
  await expect(page.locator(".score .cur")).toHaveCount(1);
  // Stille: nichts geht weiter
  await page.waitForTimeout(600);
  expect((await dbg(page)).index).toBe(0);
  await playSeq(page, waitPieces());
  await expect(result(page)).toContainText("7 von 7 Noten getroffen", { timeout: 8000 });
  expect(await colors(page)).toEqual(Array(7).fill("hit"));
  await expect(page.locator(".score .cur")).toHaveCount(0);
  await expect(page.getByTestId("follow-best")).toHaveText("Bestes im Warte-Modus: 7 von 7");
  const d = await stored(page);
  expect(d.songs[SONG].best.wait).toMatchObject({ hits: 7, total: 7 });
  expect(d.songs[SONG].best.beat).toBeUndefined();
  expect(await learning(page)).toBe(before);
  expect(await page.evaluate(() => (window as unknown as { __micStopped: boolean }).__micStopped)).toBe(true);
  // ohne Kopfhörer: kein Ton erklungen
  expect(await audioLog(page, "tone")).toEqual([]);
});

test("Warte-Modus mit falschen Tönen: Note rot, „Du spielst …“, geht weiter; schlechteres Ergebnis ersetzt den Bestwert nicht", async ({ page }) => {
  await open(page, { ...data(), songs: { [SONG]: { best: { wait: { hits: 6, total: 7, at: 1 } } } } });
  await start(page, "Warte-Modus");
  await expect(page.getByTestId("follow-note")).toHaveText("g1");
  // erst ein falscher Ton für die erste Note: Hinweis, Note schon rot, Markierung wartet
  const t0 = Date.now();
  const ms = await playSeq(page, [[72, 400], [null, 100]]);
  await expect(page.getByTestId("follow-wrong")).toHaveText("Du spielst c2");
  expect(await colors(page)).toEqual(["miss", "", "", "", "", "", ""]);
  await page.waitForTimeout(Math.max(0, ms + 50 - (Date.now() - t0))); // falschen Ton ausklingen lassen
  expect((await dbg(page)).index).toBe(0);
  // dann der Rest, mit einem falschen Ton vor der fünften Note (c²)
  await playSeq(page, waitPieces({ 4: 74 }));
  await expect(result(page)).toContainText("5 von 7 Noten getroffen", { timeout: 9000 });
  expect(await colors(page)).toEqual(["miss", "hit", "hit", "hit", "miss", "hit", "hit"]);
  // Schwierige Takte: je ein Fehler, Takt 2 hat weniger Noten (höhere Fehlerquote) und steht vorn
  await expect(result(page).locator("button.barbtn")).toHaveText(["Takt 2", "Takt 1"]);
  await expect(page.getByTestId("follow-best")).toHaveText("Bestes im Warte-Modus: 6 von 7");
  expect((await stored(page)).songs[SONG].best.wait).toMatchObject({ hits: 6, total: 7 });
  // Takt antippen → wird als Abschnitt gewählt
  await result(page).locator("button.barbtn", { hasText: "Takt 2" }).click();
  await expect(page.locator('rect.takt[data-bar="1"]')).toHaveClass(/inloop/);
  await expect(page.getByTestId("follow-go")).toHaveText("Takt 2 in Schleife");
});

test("Warte-Modus: Tonwiederholung braucht einen neuen Einsatz", async ({ page }) => {
  await open(page);
  await start(page, "Warte-Modus");
  // g¹, a¹, dann h¹ lange gehalten (über beide h¹-Noten)
  const ms = await playSeq(page, [[67, 300], [null, 150], [69, 300], [null, 150], [71, 1200]]);
  await page.waitForTimeout(ms + 100);
  expect((await dbg(page)).index).toBe(3); // die zweite h¹ wartet noch
  expect(await colors(page)).toEqual(["hit", "hit", "hit", "", "", "", ""]);
  // neu anstoßen: nach der Stille wieder h¹
  await playSeq(page, [[71, 300], [null, 150]]);
  await expect.poll(async () => (await dbg(page)).index, { timeout: 3000 }).toBe(4);
  expect(await colors(page)).toEqual(["hit", "hit", "hit", "hit", "", "", ""]);
  // Stopp mittendrin: Auswertung bis hierher, kein Bestwert
  await page.getByRole("button", { name: "Stopp" }).click();
  await expect(result(page)).toContainText("Bis hierher:");
  await expect(result(page)).toContainText("4 von 4 Noten getroffen");
  expect((await stored(page)).songs[SONG]?.best).toBeUndefined();
});

test("Takt-Modus richtig gespielt: Einzählen und leise Klicks ohne Melodie, alles grün, Bestwert", async ({ page }) => {
  await open(page);
  const before = await learning(page);
  await start(page, "Takt-Modus");
  await playBeat(page);
  await expect(page.getByTestId("follow-count")).toBeVisible();
  await expect(result(page)).toContainText("7 von 7 Noten getroffen", { timeout: 9000 });
  expect(await colors(page)).toEqual(Array(7).fill("hit"));
  await expect(page.getByTestId("follow-best")).toHaveText("Bestes im Takt-Modus: 7 von 7");
  expect((await stored(page)).songs[SONG].best.beat).toMatchObject({ hits: 7, total: 7 });
  expect(await learning(page)).toBe(before);
  // Klicks: 4 Einzählen + 8 Metronom, Melodie aus (ohne Kopfhörer)
  expect((await audioLog(page, "click")).length).toBe(12);
  expect(await audioLog(page, "tone")).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __micStopped: boolean }).__micStopped)).toBe(true);
});

test("Takt-Modus mit falschen Tönen: diese Noten rot, schwierigster Takt genannt", async ({ page }) => {
  await open(page);
  await start(page, "Takt-Modus");
  const midis = [...MELODY];
  midis[1] = 72; // statt a¹ ein c²
  midis[5] = 74; // statt a¹ ein d²
  midis[4] = 74; // statt c² ein d²
  await playBeat(page, { midis });
  await expect(result(page)).toContainText("4 von 7 Noten getroffen", { timeout: 9000 });
  expect(await colors(page)).toEqual(["hit", "miss", "hit", "hit", "miss", "miss", "hit"]);
  await expect(result(page).locator("button.barbtn")).toHaveText(["Takt 2", "Takt 1"]);
});

test("Takt-Modus mit Verspätung: 0,1 s wird ausgeglichen, 0,35 s macht die Noten rot", async ({ page }) => {
  await open(page);
  await start(page, "Takt-Modus");
  await playBeat(page, { delay: 100 });
  await expect(result(page)).toContainText("7 von 7 Noten getroffen", { timeout: 9000 });
  // nochmal, deutlich zu spät: Nur die zweite h¹ (der verspätete erste Ton passt) und die lange
  // Schlussnote haben genug Zeit mit ihrem Ton.
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): FollowDebug } }).__lied.follow().started);
  await playBeat(page, { delay: 350 });
  await expect(result(page)).toContainText("2 von 7 Noten getroffen", { timeout: 9000 });
  expect(await colors(page)).toEqual(["miss", "miss", "miss", "hit", "miss", "miss", "hit"]);
  // der erste Durchgang bleibt der Bestwert
  expect((await stored(page)).songs[SONG].best.beat).toMatchObject({ hits: 7, total: 7 });
});

test("Kopfhörer: Schalter im Mitspielen und in den Einstellungen ist dieselbe Einstellung; Melodie leise im Takt-Modus, Zielton im Warte-Modus", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Mitspielen" }).click();
  const sw = page.getByRole("switch", { name: /Ich trage Kopfhörer/ });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("phones-hint")).toContainText("das Mikrofon das Handy mithören");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  expect((await stored(page)).settings.headphones).toBe(true);
  // Takt-Modus: Melodie klingt mit
  await page.getByRole("button", { name: "Takt-Modus" }).click();
  await expect(page.getByTestId("phones-hint")).toHaveText("Die Melodie spielt leise mit.");
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): FollowDebug } }).__lied.follow().startMs !== null);
  await expect.poll(async () => (await audioLog(page, "tone")).length, { timeout: 6000 }).toBeGreaterThanOrEqual(3);
  const tones = await audioLog(page, "tone");
  expect(tones[0].freq).toBeCloseTo(hz(67), 0);
  expect(tones[1].freq).toBeCloseTo(hz(69), 0);
  await page.getByRole("button", { name: "Stopp" }).click();
  // Warte-Modus: falscher Ton → der richtige erklingt kurz
  await page.getByRole("button", { name: "Warte-Modus" }).click();
  const n = (await audioLog(page, "tone")).length;
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): FollowDebug } }).__lied.follow().started);
  await playSeq(page, [[72, 400], [null, 100]]);
  await expect(page.getByTestId("follow-wrong")).toHaveText("Du spielst c2");
  await expect.poll(async () => (await audioLog(page, "tone")).length).toBe(n + 1);
  expect((await audioLog(page, "tone"))[n].freq).toBeCloseTo(hz(67), 0);
  await page.getByRole("button", { name: "Mitspielen beenden" }).click();
  // Einstellungen zeigen denselben Schalter; ausschalten wirkt auf der Liedseite
  await page.goto("./#/einstellungen");
  const sw2 = page.getByRole("switch", { name: /Ich trage Kopfhörer/ });
  await expect(sw2).toHaveAttribute("aria-checked", "true");
  await sw2.click();
  await expect(sw2).toHaveAttribute("aria-checked", "false");
  await page.goto(`./#/lied/${SONG}`);
  await page.getByRole("button", { name: "Mitspielen" }).click();
  await expect(page.getByRole("switch", { name: /Ich trage Kopfhörer/ })).toHaveAttribute("aria-checked", "false");
  // letzte Wahl der Art ist gemerkt
  await expect(page.getByRole("button", { name: "Warte-Modus" })).toHaveAttribute("aria-pressed", "true");
});

test("Mitspielen-Zustand: Vorspielen aus, Abschnitt gilt (Schleife), Verlassen beendet Mikrofon und Klicks", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Mitspielen" }).click();
  await expect(page.getByRole("button", { name: "Abspielen" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Start" })).toBeVisible();
  // Abschnitt Takt 2 wählen: gilt beim Mitspielen
  await page.locator('rect.takt[data-bar="1"]').click();
  await page.locator('rect.takt[data-bar="1"]').click();
  await expect(page.getByTestId("follow-go")).toHaveText("Takt 2 in Schleife");
  await page.getByRole("button", { name: "Takt-Modus" }).click();
  await page.getByRole("button", { name: "Start" }).click();
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): FollowDebug } }).__lied.follow().startMs !== null);
  const d = await dbg(page);
  expect(d.timeline!.tones.map((t) => t.midi)).toEqual([72, 69, 67]);
  await expect(page.getByTestId("follow-status")).toContainText("Takt 2", { timeout: 5000 });
  // Seite verlassen: Mikrofon frei, Abspieler still
  await page.getByRole("link", { name: "Zurück" }).click();
  await expect(page.getByRole("heading", { name: "Lieder", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __micStopped: boolean }).__micStopped)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __lied: { player: { playing: boolean } } }).__lied.player.playing)).toBe(false);
  // beenden führt zurück zum Vorspielen
  await page.goto(`./#/lied/${SONG}`);
  await page.getByRole("button", { name: "Mitspielen" }).click();
  await page.getByRole("button", { name: "Mitspielen beenden" }).click();
  await expect(page.getByRole("button", { name: "Abspielen" })).toBeVisible();
});

test("Mikrofon verweigert: dieselbe Erklärung wie beim Spielen", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error("nein"), { name: "NotAllowedError" }));
  });
  await seed(page, data());
  await page.goto(`./#/lied/${SONG}`);
  await page.getByRole("button", { name: "Mitspielen" }).click();
  await page.getByRole("button", { name: "Start" }).click();
  await expect(page.getByRole("heading", { name: "Das Mikrofon ist nicht erlaubt" })).toBeVisible();
  await expect(page.getByText("Bei „Mikrofon“ auf „Zulassen“ stellen.")).toBeVisible();
});
