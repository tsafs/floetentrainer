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

/** Ersetzt das Mikrofon durch einen Oszillator, steuerbar über window.__osc.play(freq) / silence(). */
export const FAKE_MIC = () => {
  const w = window as unknown as { __osc: { play(f: number): void; silence(): void } | null };
  w.__osc = null;
  navigator.mediaDevices.getUserMedia = async () => {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    const dest = ctx.createMediaStreamDestination();
    osc.connect(gain).connect(dest);
    osc.start();
    await ctx.resume();
    w.__osc = {
      play(f: number) {
        osc.frequency.setValueAtTime(f, ctx.currentTime);
        gain.gain.setValueAtTime(0.4, ctx.currentTime);
      },
      silence() {
        gain.gain.setValueAtTime(0, ctx.currentTime);
      },
    };
    return dest.stream;
  };
};

