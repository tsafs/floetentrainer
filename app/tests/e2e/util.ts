// Hilfen für die Browser-Tests der Übungsseite.
import { expect, type Page } from "@playwright/test";

export const main = (page: Page) => page.locator("main");

export async function seed(page: Page, data: unknown) {
  await page.addInitScript((d) => {
    if (!sessionStorage.getItem("seeded")) {
      if (d === null) localStorage.removeItem("floetentrainer");
      else localStorage.setItem("floetentrainer", typeof d === "string" ? d : JSON.stringify(d));
      sessionStorage.setItem("seeded", "1");
    }
  }, data);
}

/** Wartet auf eine angezeigte Karte oder Vorstellung und gibt ihre laufende Nummer zurück. */
export async function seq(page: Page): Promise<string> {
  const m = page.locator("main[data-seq]");
  await m.waitFor();
  return (await m.getAttribute("data-seq"))!;
}

export async function info(page: Page) {
  const s = await seq(page);
  const m = page.locator(`main[data-seq="${s}"]`);
  return {
    seq: s,
    step: (await m.getAttribute("data-step"))!,
    kind: await m.getAttribute("data-kind"),
    note: (await m.getAttribute("data-note"))!,
    retry: (await m.getAttribute("data-retry")) === "true",
  };
}

/** Wartet, bis eine andere Karte (oder eine andere Seite) angezeigt wird. */
export async function waitNext(page: Page, s: string) {
  await expect(page.locator(`main[data-seq="${s}"]`)).toHaveCount(0);
}

/** Aktuelle Karte richtig oder falsch beantworten (Tipp-Übungen). */
export async function answer(page: Page, right: boolean) {
  const { note, seq: s } = await info(page);
  const scope = page.locator(`main[data-seq="${s}"]`);
  const sel = right ? `.btns button[data-choice="${note}"]` : `.btns button:not([data-choice="${note}"])`;
  await scope.locator(sel).first().click();
  return note;
}

/** Nach der Rückmeldung weiter (Tippen bzw. „Weiter“) und auf die nächste Karte warten. */
export async function next(page: Page) {
  const s = await seq(page);
  const m = page.locator(`main[data-seq="${s}"]`);
  const go = m.getByRole("button", { name: "Weiter" });
  if (await go.isVisible()) await go.click();
  else await m.locator(".bar").click();
  await waitNext(page, s);
}

export async function skipIntros(page: Page) {
  for (;;) {
    const i = await info(page);
    if (i.step !== "intro") return;
    await page.locator(`main[data-seq="${i.seq}"] [data-act="intro-ok"]`).click();
    await waitNext(page, i.seq);
  }
}

export async function stored(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("floetentrainer")!));
}

/**
 * Ersetzt das Mikrofon durch einen Oszillator, steuerbar über window.__osc.play(freq) / silence().
 * Für das Mitspielen auch im Voraus: __osc.schedule([[ms, freq | null], …]) plant Tonwechsel auf der
 * Audio-Uhr ein (ms = Zeitpunkt auf der Uhr von performance.now, null = Stille) – genauer als einzelne
 * Aufrufe aus dem Test. Läuft mit FAKE_AUDIO zusammen: Der Oszillator lebt in einem echten AudioContext
 * (window.__RealAudioContext), erscheint also nicht in __audioLog und folgt der echten Audio-Uhr.
 * window.__micStopped wird true, sobald die App das Mikrofon wieder freigibt.
 */
export const FAKE_MIC = () => {
  type Osc = { play(f: number): void; silence(): void; schedule(list: [number, number | null][]): void };
  const w = window as unknown as { __osc: Osc | null; __micStopped: boolean; __RealAudioContext?: typeof AudioContext };
  w.__osc = null;
  w.__micStopped = false;
  navigator.mediaDevices.getUserMedia = async () => {
    const Ctx = w.__RealAudioContext ?? AudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const dest = ctx.createMediaStreamDestination();
    osc.connect(gain).connect(dest);
    osc.start();
    await ctx.resume();
    w.__micStopped = false;
    w.__osc = {
      play(f: number) {
        osc.frequency.setValueAtTime(f, ctx.currentTime);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
      },
      silence() {
        gain.gain.setValueAtTime(0, ctx.currentTime);
      },
      schedule(list) {
        const now = performance.now();
        const t0 = ctx.currentTime;
        for (const [ms, f] of list) {
          const t = t0 + Math.max(0, ms - now) / 1000;
          if (f === null) gain.gain.setValueAtTime(0, t);
          else {
            osc.frequency.setValueAtTime(f, t);
            gain.gain.setValueAtTime(0.4, t);
          }
        }
      },
    };
    for (const tr of dest.stream.getTracks()) {
      const stop = tr.stop.bind(tr);
      tr.stop = () => {
        w.__micStopped = true;
        stop();
      };
    }
    return dest.stream;
  };
};
