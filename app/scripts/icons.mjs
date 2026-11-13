// Erzeugt die App-Symbole (192 und 512 px, normal und maskierbar) aus einer kleinen SVG-Zeichnung:
// Papierton, drei Notenlinien und eine ganze Note aus Bravura.
// Aufruf (aus app/): node scripts/icons.mjs   (braucht Playwright mit Chromium)
import { chromium } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";

const src = readFileSync(new URL("../src/music/bravura.ts", import.meta.url), "utf8");
const whole = src.match(/whole: \{ d: "([^"]+)"/)[1];

function svg(maskable) {
  // maskierbar: Inhalt im inneren Kreis (80 %), Hintergrund bis an den Rand
  const s = maskable ? 0.72 : 0.95;
  const sp = 100 * s; // Zwischenraum in px bei 512
  const cx = 256, cy = 256;
  const lines = [-1, 0, 1].map((i) => `<line x1="${cx - 1.9 * sp}" x2="${cx + 1.9 * sp}" y1="${cy + i * sp}" y2="${cy + i * sp}" stroke="#2b2724" stroke-width="${0.09 * sp}" stroke-linecap="round"/>`).join("");
  const k = 1.08 * sp; // Notenkopf auf der mittleren Linie
  const head = `<path d="${whole}" fill="#2b2724" transform="translate(${cx - 0.844 * k} ${cy}) scale(${k})"/>`;
  const bg = maskable
    ? `<rect width="512" height="512" fill="#fbf6ea"/>`
    : `<rect x="0" y="0" width="512" height="512" rx="112" fill="#fbf6ea"/><rect x="6" y="6" width="500" height="500" rx="106" fill="none" stroke="#d6c4a3" stroke-width="6"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">${bg}${lines}${head}</svg>`;
}

mkdirSync(new URL("../public/icons/", import.meta.url), { recursive: true });
const browser = await chromium.launch();
const page = await browser.newPage();
for (const maskable of [false, true]) {
  for (const size of [192, 512]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent"><div style="width:${size}px;height:${size}px">${svg(maskable).replace('width="512" height="512"', `width="${size}" height="${size}"`)}</div></body></html>`);
    const name = `${maskable ? "maskable" : "icon"}-${size}.png`;
    await page.screenshot({ path: new URL(`../public/icons/${name}`, import.meta.url).pathname, omitBackground: true });
    console.log("geschrieben:", name);
  }
}
await browser.close();
