// Einstellungen: Sitzungslänge, Spielen, Stufen, Sicherung, Zurücksetzen.

import { maxLevel, stagesOf, type Track } from "../music/levels";
import { joinNames } from "../music/names";
import { level, levelCap, setLevel } from "../srs/progress";
import { defaultData, SETTING_LIMITS, type NumSetting, type Theme } from "../store/data";
import { applyTheme } from "./theme";
import { backupFileName, backupJson, parseBackup } from "../store/storage";
import { esc, topbar, type Ctx, type View } from "./common";

interface NumField {
  key: NumSetting;
  label: string;
  help?: string;
  step: number;
  fmt: (v: number) => string;
}

const FIELDS: { title: string; fields: NumField[] }[] = [
  {
    title: "Sitzung",
    fields: [
      { key: "sessionMinutes", label: "Länge", help: "endet nach dieser Zeit …", step: 1, fmt: (v) => `${v} Min.` },
      { key: "sessionCards", label: "Karten", help: "… oder nach so vielen Karten", step: 5, fmt: (v) => `${v}` },
    ],
  },
  {
    title: "Spielen",
    fields: [
      { key: "toleranceCents", label: "Toleranz", help: "so weit darf der Ton daneben liegen", step: 5, fmt: (v) => `±${v} Cent` },
      { key: "holdMs", label: "Haltedauer", help: "so lange muss der Ton stabil klingen", step: 50, fmt: (v) => `${(v / 1000).toFixed(2).replace(".", ",")} s` },
      { key: "tuningHz", label: "Stimmton", help: "Kammerton a", step: 1, fmt: (v) => `${v} Hz` },
    ],
  },
];

const THEME_OPTIONS: [Theme, string][] = [
  ["auto", "Wie das Handy"],
  ["light", "Hell"],
  ["dark", "Dunkel"],
];

function stepper(name: string, value: string, canDown: boolean, canUp: boolean): string {
  return (
    `<div class="stepper" data-name="${name}"><button data-dir="-1" aria-label="weniger"${canDown ? "" : " disabled"}>−</button>` +
    `<output data-testid="val-${name}">${value}</output><button data-dir="1" aria-label="mehr"${canUp ? "" : " disabled"}>+</button></div>`
  );
}

/** Bestätigung vor dem Einlesen; nennt die eigenen Lieder, weil sie mit ersetzt werden */
function importText(inBackup: number, now: number): string {
  const has = inBackup ? ` und enthält ${inBackup === 1 ? "ein eigenes Lied" : `${inBackup} eigene Lieder`}` : "";
  const lost = now ? (now === 1 ? ", auch dein eigenes Lied" : `, auch deine ${now} eigenen Lieder`) : "";
  return `Die Sicherung ist in Ordnung${has}. Sie ersetzt alle jetzigen Daten${lost}.`;
}

function levelText(track: Track, lv: number): string {
  return joinNames(stagesOf(track)[lv - 1].notes);
}

export const settingsView: View = (root, ctx) => {
  let confirmReset = false;
  let pendingImport: ReturnType<typeof parseBackup> | null = null;
  let message: { ok: boolean; text: string } | null = null;

  function render() {
    const d = ctx.data;
    const s = d.settings;
    const sections = FIELDS.map(
      (sec) =>
        `<section><h2>${sec.title}</h2>${sec.fields
          .map((f) => {
            const [lo, hi] = SETTING_LIMITS[f.key];
            const v = s[f.key];
            return `<div class="setting"><span class="lab">${f.label}${f.help ? `<small>${f.help}</small>` : ""}</span>${stepper(f.key, f.fmt(v), v - f.step >= lo, v + f.step <= hi)}</div>`;
          })
          .join("")}</section>`,
    ).join("");
    const lvRow = (t: Track) => {
      const lv = level(d, t);
      const cap = t === "lesen" ? maxLevel("lesen") : levelCap(d, "spielen");
      return `<div class="setting"><span class="lab">${t === "lesen" ? "Lesen" : "Spielen"}<small>Stufe ${lv}: ${levelText(t, lv)}</small></span>${stepper("lv-" + t, `${lv} / ${maxLevel(t)}`, lv > 1, lv < cap)}</div>`;
    };
    root.innerHTML = `
<main class="screen page settings">
  ${topbar("Einstellungen")}
  ${sections}
  <section><h2>Mitspielen</h2>
    <div class="setting"><span class="lab" id="phones-lab">Ich trage Kopfhörer<small>${
      s.headphones
        ? "Beim Mitspielen klingt die Melodie leise mit."
        : "Ohne Kopfhörer bleibt beim Mitspielen die Melodie aus, sonst würde das Mikrofon das Handy mithören."
    }</small></span><button class="switch" role="switch" aria-checked="${s.headphones}" aria-labelledby="phones-lab" data-act="phones"><i></i></button></div>
  </section>
  <section><h2>Darstellung</h2>
    <div class="seg" role="group" aria-label="Darstellung">${THEME_OPTIONS.map(
      ([v, label]) => `<button data-theme-opt="${v}" aria-pressed="${s.theme === v}">${label}</button>`,
    ).join("")}</div>
  </section>
  <section><h2>Stufen</h2>${lvRow("lesen")}${lvRow("spielen")}
    <p class="help">Spielen ist höchstens so hoch wie Lesen. Nach dem Senken zählen für das Freischalten nur neue Antworten; die bisherigen Daten bleiben erhalten.</p>
  </section>
  <section><h2>Sicherung</h2>
    <p class="help">Alle Daten liegen nur in diesem Browser. Eine Sicherung ist eine kleine Datei, die du aufheben und später wieder einlesen kannst.</p>
    <div class="btnrow">
      <button class="big alt" data-act="export">Sicherung herunterladen</button>
      <button class="big alt" data-act="import">Sicherung einlesen</button>
      <input type="file" accept=".json,application/json" hidden data-testid="import-file">
    </div>
    ${
      pendingImport
        ? `<div class="confirm"><p data-testid="import-info">${importText(pendingImport.ownSongs.length, d.ownSongs.length)}</p><div class="btnrow"><button class="big" data-act="import-yes">Sicherung übernehmen</button><button class="big alt" data-act="import-no">Abbrechen</button></div></div>`
        : ""
    }
    ${message ? `<p class="msg ${message.ok ? "ok" : "err"}" data-testid="msg">${esc(message.text)}</p>` : ""}
  </section>
  <section><h2>Zurücksetzen</h2>
    ${
      confirmReset
        ? `<div class="confirm"><p>Wirklich alles löschen? Fortschritt, Serie${d.ownSongs.length ? ", Einstellungen und eigene Lieder" : " und Einstellungen"} gehen verloren.</p><div class="btnrow"><button class="big danger" data-act="reset-yes">Ja, alles löschen</button><button class="big alt" data-act="reset-no">Abbrechen</button></div></div>`
        : `<button class="big alt" data-act="reset">Alles zurücksetzen</button>`
    }
  </section>
</main>`;
    bind();
  }

  function bind() {
    const d = ctx.data;
    root.querySelectorAll<HTMLElement>(".stepper").forEach((el) => {
      const name = el.dataset.name!;
      el.querySelectorAll<HTMLButtonElement>("button").forEach((b) =>
        b.addEventListener("click", () => {
          const dir = Number(b.dataset.dir);
          if (name.startsWith("lv-")) {
            const t = name.slice(3) as Track;
            setLevel(d, t, level(d, t) + dir, Date.now());
          } else {
            const f = FIELDS.flatMap((x) => x.fields).find((x) => x.key === name)!;
            const [lo, hi] = SETTING_LIMITS[f.key];
            d.settings[f.key] = Math.max(lo, Math.min(hi, d.settings[f.key] + dir * f.step));
          }
          message = null;
          ctx.save();
          render();
        }),
      );
    });
    root.querySelectorAll<HTMLButtonElement>("[data-theme-opt]").forEach((b) =>
      b.addEventListener("click", () => {
        d.settings.theme = b.dataset.themeOpt as Theme;
        applyTheme(d.settings.theme);
        ctx.save();
        render();
      }),
    );
    const on = (act: string, fn: () => void) => root.querySelector(`[data-act="${act}"]`)?.addEventListener("click", fn);
    on("phones", () => {
      d.settings.headphones = !d.settings.headphones;
      message = null;
      ctx.save();
      render();
    });
    on("export", () => {
      const blob = new Blob([backupJson(ctx.data)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = backupFileName();
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
      message = { ok: true, text: "Sicherung wurde heruntergeladen." };
      render();
    });
    const file = root.querySelector('input[type="file"]') as HTMLInputElement;
    on("import", () => file.click());
    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        pendingImport = parseBackup(await f.text());
        message = null;
      } catch (e) {
        pendingImport = null;
        message = { ok: false, text: (e as Error).message };
      }
      render();
    });
    on("import-yes", () => {
      if (pendingImport) replaceData(ctx, pendingImport);
      pendingImport = null;
      message = { ok: true, text: "Sicherung eingelesen." };
      render();
    });
    on("import-no", () => {
      pendingImport = null;
      render();
    });
    on("reset", () => {
      confirmReset = true;
      render();
    });
    on("reset-no", () => {
      confirmReset = false;
      render();
    });
    on("reset-yes", () => {
      confirmReset = false;
      replaceData(ctx, defaultData());
      message = { ok: true, text: "Alles wurde zurückgesetzt." };
      render();
    });
  }

  render();
};

export function replaceData(ctx: Ctx, data: ReturnType<typeof defaultData>): void {
  // Inhalt ersetzen, damit alle Verweise auf ctx.data gültig bleiben
  for (const k of Object.keys(ctx.data) as (keyof typeof data)[]) delete (ctx.data as unknown as Record<string, unknown>)[k];
  Object.assign(ctx.data, data);
  applyTheme(ctx.data.settings.theme);
  ctx.session = null;
  ctx.save();
}
