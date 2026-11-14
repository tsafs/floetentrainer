// Mitspielen mit Mikrofon: „Wartet auf mich“ (Warte-Modus) und „Im Takt“ (Takt-Modus), mit vorgetäuschtem
// Mikrofon (Oszillator). Rückmeldung nur über Farben (keine Auswertung, keine Bestwerte).
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

type Mode = "Wartet auf mich" | "Im Takt";
const go = (page: Page) => page.locator('[data-act="fstart"]');
/** zum Mitspielen umschalten (Umschalter oben) */
const toFollow = (page: Page) => page.getByRole("tab", { name: "Mitspielen" }).click();
/** warten, bis der Durchgang fertig ist (Leiste wieder zum Einstellen) */
const finished = (page: Page, timeout = 9000) =>
  page.waitForFunction(() => {
    const f = (window as unknown as { __lied: { follow(): FollowDebug } }).__lied.follow();
    return f.active && !f.running;
  }, null, { timeout });

async function start(page: Page, mode: Mode) {
  await toFollow(page);
  await page.getByRole("button", { name: mode }).click();
  await go(page).click();
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
/** keine Auswertung, kein Bestwert: nur Farben */
async function noScore(page: Page) {
  await expect(page.getByText(/von \d+ (Noten|Tönen)/)).toHaveCount(0);
  await expect(page.getByText(/Bestes|Schwierig|Bis hierher/)).toHaveCount(0);
  await expect(page.locator("button.barbtn")).toHaveCount(0);
  const d = await stored(page);
  expect(JSON.stringify(d.songs ?? {})).not.toContain("best");
}
const learning = async (page: Page) => {
  const d = await stored(page);
  return JSON.stringify([d.history, d.cards, d.days, d.sessions, d.stages, d.introduced]);
};

test.describe.configure({ mode: "parallel" });

test("Warte-Modus richtig gespielt: alles grün, keine Auswertung, kein Bestwert, Lernspuren unverändert, Mikrofon wieder aus", async ({ page }) => {
  await open(page);
  const before = await learning(page);
  await start(page, "Wartet auf mich");
  // vor dem ersten Ton: Markierung auf der ersten Note, Name g¹ (kein Griffbild)
  await expect(page.getByTestId("follow-note")).toHaveText("g1");
  expect((await dbg(page)).index).toBe(0);
  await expect(page.locator(".score .cur")).toHaveCount(1);
  // Stille: nichts geht weiter
  await page.waitForTimeout(600);
  expect((await dbg(page)).index).toBe(0);
  await expect(page.locator(".songpage .flute")).toHaveCount(0);
  await playSeq(page, waitPieces());
  await finished(page, 8000);
  expect(await colors(page)).toEqual(Array(7).fill("hit"));
  await expect(page.locator(".score .cur")).toHaveCount(0);
  await noScore(page);
  // die Farben bleiben stehen; „Nochmal“ ist wieder der Knopf „Mitspielen“
  await expect(go(page)).toBeVisible();
  await expect(go(page)).toHaveText("Mitspielen");
  await page.waitForTimeout(500);
  expect(await colors(page)).toEqual(Array(7).fill("hit"));
  expect(await learning(page)).toBe(before);
  expect(await page.evaluate(() => (window as unknown as { __micStopped: boolean }).__micStopped)).toBe(true);
  // ohne Kopfhörer: kein Ton erklungen
  expect(await audioLog(page, "tone")).toEqual([]);
});

test("Warte-Modus mit falschen Tönen: Note rot, „Du spielst …“, geht weiter; Farben bleiben bis zum Neustart oder einer neuen Auswahl; alte Bestwerte werden verworfen", async ({ page }) => {
  await open(page, { ...data(), songs: { [SONG]: { tempo: 90, best: { wait: { hits: 6, total: 7, at: 1 } } } } });
  await start(page, "Wartet auf mich");
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
  await finished(page, 9000);
  const after = ["miss", "hit", "hit", "hit", "miss", "hit", "hit"];
  expect(await colors(page)).toEqual(after);
  await noScore(page);
  // gespeichert wurde (Wahl der Art): das alte Feld ist weg, das Tempo bleibt
  expect((await stored(page)).songs[SONG]).toEqual({ tempo: 90 });
  // Wechsel der Art lässt die Farben stehen
  await page.getByRole("button", { name: "Im Takt" }).click();
  await page.getByRole("button", { name: "Wartet auf mich" }).click();
  expect(await colors(page)).toEqual(after);
  // eine neue Auswahl löscht sie
  await page.locator('rect.takt[data-bar="1"]').click();
  expect(await colors(page)).toEqual(Array(7).fill(""));
});

test("Warte-Modus und Takt-Modus: wackelnder Ton (Vibrato ±30 Cent) wird richtig gewertet, nichts rot", async ({ page }) => {
  await open(page);
  await start(page, "Wartet auf mich");
  await page.evaluate(() => (window as unknown as { __osc: { wobble(c: number): void } }).__osc.wobble(30));
  await playSeq(page, waitPieces());
  await finished(page, 8000);
  expect(await colors(page)).toEqual(Array(7).fill("hit"));
  await expect(page.getByTestId("follow-wrong")).toHaveText("");
  // im Takt; jeder Mikrofon-Start bringt einen neuen Oszillator, also das Vibrato wieder einschalten
  await page.getByRole("button", { name: "Im Takt" }).click();
  await go(page).click();
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): FollowDebug } }).__lied.follow().started);
  await page.evaluate(() => (window as unknown as { __osc: { wobble(c: number): void } }).__osc.wobble(30));
  await playBeat(page);
  await finished(page);
  expect(await colors(page)).toEqual(Array(7).fill("hit"));
});

test("Mitspielen: ein Neustart löscht die Farben des letzten Durchgangs", async ({ page }) => {
  await open(page);
  await start(page, "Wartet auf mich");
  const ms = await playSeq(page, waitPieces().slice(0, 4)); // zwei Noten
  await page.waitForTimeout(ms + 200);
  await page.getByRole("button", { name: "Stopp" }).click();
  expect(await colors(page)).toEqual(["hit", "hit", "", "", "", "", ""]);
  await go(page).click();
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): FollowDebug } }).__lied.follow().started);
  expect(await colors(page)).toEqual(Array(7).fill(""));
  await page.getByRole("button", { name: "Stopp" }).click();
});

test("Warte-Modus: Tonwiederholung braucht einen neuen Einsatz", async ({ page }) => {
  await open(page);
  await start(page, "Wartet auf mich");
  // g¹, a¹, dann h¹ lange gehalten (über beide h¹-Noten)
  const ms = await playSeq(page, [[67, 300], [null, 150], [69, 300], [null, 150], [71, 1200]]);
  await page.waitForTimeout(ms + 100);
  expect((await dbg(page)).index).toBe(3); // die zweite h¹ wartet noch
  expect(await colors(page)).toEqual(["hit", "hit", "hit", "", "", "", ""]);
  // neu anstoßen: nach der Stille wieder h¹
  await playSeq(page, [[71, 300], [null, 150]]);
  await expect.poll(async () => (await dbg(page)).index, { timeout: 3000 }).toBe(4);
  expect(await colors(page)).toEqual(["hit", "hit", "hit", "hit", "", "", ""]);
  // Stopp mittendrin: das Gespielte bleibt gefärbt, keine Auswertung, kein Bestwert
  await page.getByRole("button", { name: "Stopp" }).click();
  expect(await colors(page)).toEqual(["hit", "hit", "hit", "hit", "", "", ""]);
  await noScore(page);
});

/** Balken (Mitte x) und Mitte des Notenkopfs der i-ten Note; x null, wenn der Balken nicht zu sehen ist */
const barAndHead = (page: Page, i: number) =>
  page.evaluate((k) => {
    const el = document.querySelector<HTMLElement>(".playhead");
    const gs = [...document.querySelectorAll<SVGGElement>(".score g.n")].sort((a, b) => Number(a.dataset.id) - Number(b.dataset.id));
    const h = gs[k].querySelector("path.h")!.getBoundingClientRect();
    const r = el?.getBoundingClientRect();
    return { x: el?.classList.contains("on") && r ? r.left + r.width / 2 : null, head: h.left + h.width / 2 };
  }, i);

test("Balken: im Warte-Modus an der Note, auf die gewartet wird; im Takt-Modus läuft er mit", async ({ page }) => {
  await open(page);
  await start(page, "Wartet auf mich");
  let p = await barAndHead(page, 0);
  expect(p.x).not.toBeNull();
  expect(Math.abs(p.x! - p.head)).toBeLessThan(1);
  await playSeq(page, waitPieces().slice(0, 2)); // nur die erste Note
  await expect.poll(async () => (await dbg(page)).index, { timeout: 4000 }).toBe(1);
  p = await barAndHead(page, 1);
  expect(Math.abs(p.x! - p.head)).toBeLessThan(1);
  await page.getByRole("button", { name: "Stopp" }).click();
  expect((await barAndHead(page, 0)).x).toBeNull();

  // Takt-Modus: nach dem Einzählen (2 s) stetig nach rechts
  await page.getByRole("button", { name: "Im Takt" }).click();
  await go(page).click();
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): FollowDebug } }).__lied.follow().startMs !== null);
  const startMs = (await dbg(page)).startMs!;
  await page.waitForFunction((t) => performance.now() > t + 300, startMs);
  const a = (await barAndHead(page, 0)).x!;
  await page.waitForTimeout(400);
  const b = (await barAndHead(page, 0)).x!;
  expect(b).toBeGreaterThan(a + 5);
  await page.getByRole("button", { name: "Stopp" }).click();
  expect((await barAndHead(page, 0)).x).toBeNull();
});

test("Takt-Modus richtig gespielt: Einzählen und leise Klicks ohne Melodie, alles grün, keine Auswertung", async ({ page }) => {
  await open(page);
  const before = await learning(page);
  await start(page, "Im Takt");
  await playBeat(page);
  await expect(page.getByTestId("follow-count")).toBeVisible();
  await finished(page);
  expect(await colors(page)).toEqual(Array(7).fill("hit"));
  await noScore(page);
  expect(await learning(page)).toBe(before);
  // Klicks: 4 Einzählen + 8 Metronom, Melodie aus (ohne Kopfhörer)
  expect((await audioLog(page, "click")).length).toBe(12);
  expect(await audioLog(page, "tone")).toEqual([]);
  expect(await page.evaluate(() => (window as unknown as { __micStopped: boolean }).__micStopped)).toBe(true);
});

test("Takt-Modus mit falschen Tönen: diese Noten rot, sonst nichts", async ({ page }) => {
  await open(page);
  await start(page, "Im Takt");
  const midis = [...MELODY];
  midis[1] = 72; // statt a¹ ein c²
  midis[5] = 74; // statt a¹ ein d²
  midis[4] = 74; // statt c² ein d²
  await playBeat(page, { midis });
  await finished(page);
  expect(await colors(page)).toEqual(["hit", "miss", "hit", "hit", "miss", "miss", "hit"]);
  await noScore(page);
});

test("Takt-Modus mit Verspätung: 0,1 s wird ausgeglichen, 0,35 s macht die Noten rot", async ({ page }) => {
  await open(page);
  await start(page, "Im Takt");
  await playBeat(page, { delay: 100 });
  await finished(page);
  expect(await colors(page)).toEqual(Array(7).fill("hit"));
  // nochmal, deutlich zu spät: Nur die zweite h¹ (der verspätete erste Ton passt) und die lange
  // Schlussnote haben genug Zeit mit ihrem Ton.
  await go(page).click();
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): FollowDebug } }).__lied.follow().started);
  await playBeat(page, { delay: 350 });
  await finished(page);
  expect(await colors(page)).toEqual(["miss", "miss", "miss", "hit", "miss", "miss", "hit"]);
});

test("Kopfhörer: Schalter im Mitspielen und in den Einstellungen ist dieselbe Einstellung; Melodie leise im Takt-Modus, Zielton im Warte-Modus", async ({ page }) => {
  await open(page);
  await toFollow(page);
  const sw = page.getByRole("switch", { name: /Ich trage Kopfhörer/ });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(page.getByTestId("phones-hint")).toContainText("bleibt die Melodie aus");
  await expect(page.getByTestId("phones-hint")).toContainText("Mikrofon");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  expect((await stored(page)).settings.headphones).toBe(true);
  // Takt-Modus: Melodie klingt mit
  await page.getByRole("button", { name: "Im Takt" }).click();
  await expect(page.getByTestId("phones-hint")).toHaveText("Die Melodie spielt leise mit.");
  await go(page).click();
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): FollowDebug } }).__lied.follow().startMs !== null);
  await expect.poll(async () => (await audioLog(page, "tone")).length, { timeout: 6000 }).toBeGreaterThanOrEqual(3);
  const tones = await audioLog(page, "tone");
  expect(tones[0].freq).toBeCloseTo(hz(67), 0);
  expect(tones[1].freq).toBeCloseTo(hz(69), 0);
  await page.getByRole("button", { name: "Stopp" }).click();
  // Warte-Modus: falscher Ton → der richtige erklingt kurz
  await page.getByRole("button", { name: "Wartet auf mich" }).click();
  const n = (await audioLog(page, "tone")).length;
  await go(page).click();
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): FollowDebug } }).__lied.follow().started);
  await playSeq(page, [[72, 400], [null, 100]]);
  await expect(page.getByTestId("follow-wrong")).toHaveText("Du spielst c2");
  await expect.poll(async () => (await audioLog(page, "tone")).length).toBe(n + 1);
  expect((await audioLog(page, "tone"))[n].freq).toBeCloseTo(hz(67), 0);
  // während des Spielens ist der Umschalter gesperrt; nach dem Stopp zurück zum Anhören
  await expect(page.getByRole("tab", { name: "Anhören" })).toBeDisabled();
  await page.getByRole("button", { name: "Stopp" }).click();
  await page.getByRole("tab", { name: "Anhören" }).click();
  // Einstellungen zeigen denselben Schalter; ausschalten wirkt auf der Liedseite
  await page.goto("./#/einstellungen");
  const sw2 = page.getByRole("switch", { name: /Ich trage Kopfhörer/ });
  await expect(sw2).toHaveAttribute("aria-checked", "true");
  await sw2.click();
  await expect(sw2).toHaveAttribute("aria-checked", "false");
  await page.goto(`./#/lied/${SONG}`);
  await toFollow(page);
  await expect(page.getByRole("switch", { name: /Ich trage Kopfhörer/ })).toHaveAttribute("aria-checked", "false");
  // letzte Wahl der Art ist gemerkt
  await expect(page.getByRole("button", { name: "Wartet auf mich" })).toHaveAttribute("aria-pressed", "true");
});

test("Mitspielen-Zustand: Anhören aus, Auswahl gilt einmal (keine Schleife), Verlassen beendet Mikrofon und Klicks", async ({ page }) => {
  await open(page);
  await toFollow(page);
  await expect(page.getByRole("button", { name: "Abspielen" })).toBeHidden();
  await expect(go(page)).toBeVisible();
  // Takt 2 wählen: gilt beim Mitspielen
  await page.locator('rect.takt[data-bar="1"]').click();
  await expect(go(page)).toHaveText("Takt 2 mitspielen");
  await page.getByRole("button", { name: "Im Takt" }).click();
  await go(page).click();
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): FollowDebug } }).__lied.follow().startMs !== null);
  const d = await dbg(page);
  expect(d.timeline!.tones.map((t) => t.midi)).toEqual([72, 69, 67]);
  await expect(page.getByTestId("follow-status")).toContainText("Takt 2", { timeout: 5000 });
  // ein Durchgang, dann ist Schluss (Einzählen 2 s + Takt 2 s): Mikrofon wieder aus, Auswahl bleibt
  await finished(page, 7000);
  expect(await page.evaluate(() => (window as unknown as { __micStopped: boolean }).__micStopped)).toBe(true);
  expect((await audioLog(page, "click")).length).toBe(4 + 4);
  await expect(go(page)).toHaveText("Takt 2 mitspielen");
  // nochmal starten, dann die Seite verlassen: Mikrofon frei, Abspieler still
  await go(page).click();
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): FollowDebug } }).__lied.follow().startMs !== null);
  await page.getByRole("link", { name: "Zurück" }).click();
  await expect(page.getByRole("heading", { name: "Lieder", exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { __micStopped: boolean }).__micStopped)).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { __lied: { player: { playing: boolean } } }).__lied.player.playing)).toBe(false);
  // neu geöffnet: wieder beim Anhören
  await page.goto(`./#/lied/${SONG}`);
  await expect(page.getByRole("tab", { name: "Anhören" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("button", { name: "Abspielen" })).toBeVisible();
});

test("Mikrofon verweigert: dieselbe Erklärung wie beim Spielen", async ({ page }) => {
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error("nein"), { name: "NotAllowedError" }));
  });
  await seed(page, data());
  await page.goto(`./#/lied/${SONG}`);
  await toFollow(page);
  await go(page).click();
  await expect(page.getByRole("heading", { name: "Das Mikrofon ist nicht erlaubt" })).toBeVisible();
  await expect(page.getByText("Bei „Mikrofon“ auf „Zulassen“ stellen.")).toBeVisible();
});

test("Takt-Modus: gemeldete Ausgabe-Verzögerung (z. B. Bluetooth) gilt für Markierung und Wertung gleich", async ({ page }) => {
  // Der Abspieler meldet 0,3 s Ausgabe-Verzögerung; sie spielt nach dem, was sie hört.
  // (nach FAKE_AUDIO, dessen Attrappe sonst 0 meldet)
  await page.addInitScript(FAKE_AUDIO);
  await page.addInitScript(() => {
    const w = window as unknown as { AudioContext: typeof AudioContext };
    const Base = w.AudioContext;
    w.AudioContext = class extends Base {
      get outputLatency() {
        return 0.3;
      }
    };
  });
  await open(page);
  expect(await page.evaluate(() => new AudioContext().outputLatency)).toBe(0.3);
  await start(page, "Im Takt");
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): FollowDebug } }).__lied.follow().startMs !== null);
  // Hörbeginn unabhängig von der Seite berechnet: eingeplanter Beginn + 0,3 s
  const heard = await page.evaluate(() => {
    const p = (window as unknown as { __lied: { player: { context: AudioContext; timelineStart: number } } }).__lied.player;
    return performance.now() + (p.timelineStart - p.context.currentTime + 0.3) * 1000;
  });
  const d = await dbg(page);
  const list: [number, number | null][] = [];
  d.timeline!.tones.forEach((t, i) => {
    list.push([heard + t.start * SPQ * 1000, hz(MELODY[i])], [heard + (t.start + t.dur) * SPQ * 1000 - 60, null]);
  });
  await page.evaluate((l) => (window as unknown as { __osc: { schedule(l: [number, number | null][]): void } }).__osc.schedule(l), list);
  // die Markierung kommt beim Hören auf die zweite Note
  const markAt = await page.evaluate(async (h) => {
    for (;;) {
      const g = [...document.querySelectorAll<SVGGElement>(".score g.n")].sort((a, b) => Number(a.dataset.id) - Number(b.dataset.id))[1];
      if (g?.classList.contains("cur")) return performance.now() - h;
      await new Promise((r) => requestAnimationFrame(r));
    }
  }, heard);
  expect(markAt).toBeGreaterThan(SPQ * 1000 - 60);
  expect(markAt).toBeLessThan(SPQ * 1000 + 100);
  await finished(page);
  expect(await colors(page)).toEqual(Array(7).fill("hit"));
});

test("Schneller Doppeltipp Mitspielen/Stopp bzw. Verlassen während der Mikrofon-Abfrage: Mikrofon bleibt nicht an", async ({ page }) => {
  // getUserMedia antwortet erst nach 600 ms (wie bei der Erlaubnis-Abfrage); gezählt werden offene Spuren
  await page.addInitScript(FAKE_MIC);
  await page.addInitScript(() => {
    const w = window as unknown as { __live: number; __gum: number };
    const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    w.__live = 0;
    w.__gum = 0;
    navigator.mediaDevices.getUserMedia = async (c) => {
      w.__gum++;
      await new Promise((r) => setTimeout(r, 600));
      const s = await orig(c);
      for (const tr of s.getTracks()) {
        w.__live++;
        const stop = tr.stop.bind(tr);
        tr.stop = () => {
          if (tr.readyState === "live") w.__live--;
          stop();
        };
      }
      return s;
    };
  });
  await page.addInitScript(FAKE_AUDIO);
  await seed(page, data());
  await page.goto(`./#/lied/${SONG}`);
  const live = () => page.evaluate(() => (window as unknown as { __live: number }).__live);
  await toFollow(page);
  await go(page).click();
  await page.getByRole("button", { name: "Stopp" }).click();
  await page.waitForTimeout(1000);
  expect(await live()).toBe(0);
  await go(page).click();
  await page.getByRole("link", { name: "Zurück" }).click();
  await page.waitForTimeout(1000);
  expect(await live()).toBe(0);
  // Mitspielen, Stopp, Mitspielen: ein einziger Strom, und der Lauf beginnt
  await page.goto(`./#/lied/${SONG}`);
  await toFollow(page);
  await go(page).click();
  await page.getByRole("button", { name: "Stopp" }).click();
  await go(page).click();
  await page.waitForFunction(() => (window as unknown as { __lied: { follow(): FollowDebug } }).__lied.follow().started);
  expect(await live()).toBe(1);
  await page.getByRole("button", { name: "Stopp" }).click();
  expect(await live()).toBe(0);
});

test("Warte-Modus mit Kopfhörern ohne falschen Ton: nach dem Stopp läuft der AudioContext des Abspielers nicht weiter", async ({ page }) => {
  await open(page, data({ headphones: true }));
  await start(page, "Wartet auf mich");
  const state = () => page.evaluate(() => (window as unknown as { __lied: { player: { context: AudioContext | null } } }).__lied.player.context?.state);
  expect(await state()).toBe("running"); // vorbereitet für den Zielton
  await page.getByRole("button", { name: "Stopp" }).click();
  await expect.poll(state).toBe("suspended");
});
