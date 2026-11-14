// Einstellungen: Sitzungslänge, Spielen, Flöte, Mitspielen, Stufen, Sicherung, Zurücksetzen.
//
// Abschnitt „Flöte“: Liste der Flöten (eine aktiv), „Flöte einstellen“ (#/floete, ./flute.ts),
// umbenennen, hinzufügen, löschen (Bestätigung in der Seite). Die Werte gelten für die Übung (Spielen) und
// das Mitspielen (../audio/flute-profile.ts).

import { inputLatency } from "../audio/follow";
import { mic } from "../audio/mic";
import { maxLevel, stagesOf, type Track } from "../music/levels";
import { joinNames } from "../music/names";
import { level, levelCap, setLevel } from "../srs/progress";
import { activeFlute, defaultData, FLUTE_NAME_MAX, newFluteId, SETTING_LIMITS, type AppData, type NumSetting, type Theme } from "../store/data";
import { applyTheme } from "./theme";
import { backupFileName, backupJson, keepDeviceSettings, parseBackup } from "../store/storage";
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

/** „7 Töne eingestellt“ bzw. „noch nicht eingestellt“ */
function fluteState(n: number): string {
  return n ? `${n === 1 ? "1 Ton" : `${n} Töne`} eingestellt` : "noch nicht eingestellt";
}

/** Verzögerung im Takt-Modus je Kopfhörer-Zustand, z. B. „140 ms (abgeglichen)“ */
function latencyText(d: AppData, headphones: boolean): string {
  const l = inputLatency({ ...d.settings, headphones });
  return `${l.ms} ms ${l.calibrated ? "(abgeglichen)" : "(Standard)"}`;
}

/** Abschnitt „Flöte“ */
function fluteSection(d: AppData, ui: { rename: boolean; del: boolean }): string {
  const act = activeFlute(d);
  const rows = d.flutes
    .map((f) => {
      const on = f.id === act.id;
      return `<button class="flpick" role="radio" aria-checked="${on}" data-flute="${f.id}"><i></i><span class="lab">${esc(f.name)}<small>${fluteState(Object.keys(f.offsets).length)}</small></span></button>`;
    })
    .join("");
  const rename = ui.rename
    ? `<div class="flrename"><input type="text" maxlength="${FLUTE_NAME_MAX}" value="${esc(act.name)}" aria-label="Name der Flöte" data-testid="flute-name-input"><div class="btnrow two"><button class="big" data-act="fl-rename-ok">Übernehmen</button><button class="big alt" data-act="fl-rename-no">Abbrechen</button></div></div>`
    : "";
  const del = ui.del
    ? `<div class="confirm"><p>„${esc(act.name)}“ wirklich löschen? Ihre Werte gehen verloren.</p><div class="btnrow"><button class="big danger" data-act="fl-del-yes">Ja, löschen</button><button class="big alt" data-act="fl-del-no">Abbrechen</button></div></div>`
    : "";
  return `<section><h2>Flöte</h2>
    <div class="flutes" role="radiogroup" aria-label="Aktive Flöte">${rows}</div>
    ${rename}${del}
    <button class="big" data-act="fl-cal">„${esc(act.name)}“ einstellen</button>
    <div class="fllinks">
      <button class="clear" data-act="fl-rename">Umbenennen</button>
      <button class="clear" data-act="fl-add">Flöte hinzufügen</button>
      ${d.flutes.length > 1 ? `<button class="clear" data-act="fl-del">Löschen</button>` : ""}
    </div>
    <p class="help">Jede Flöte klingt etwas anders, viele günstige sind insgesamt zu tief. Eingestellt wertet die App jeden Ton im Verhältnis zu deiner Flöte; beim Mitspielen verfeinern sich die Werte von selbst.</p>
  </section>`;
}

function levelText(track: Track, lv: number): string {
  return joinNames(stagesOf(track)[lv - 1].notes);
}

export const settingsView: View = (root, ctx) => {
  let confirmReset = false;
  let pendingImport: ReturnType<typeof parseBackup> | null = null;
  let message: { ok: boolean; text: string } | null = null;
  const flui = { rename: false, del: false };

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
  ${fluteSection(d, flui)}
  <section><h2>Mitspielen</h2>
    <div class="setting"><span class="lab" id="phones-lab">Ich trage Kopfhörer<small>${
      s.headphones
        ? "Beim Mitspielen klingt die Melodie leise mit."
        : "Ohne Kopfhörer bleibt beim Mitspielen die Melodie aus, sonst würde das Mikrofon das Handy mithören."
    }</small></span><button class="switch" role="switch" aria-checked="${s.headphones}" aria-labelledby="phones-lab" data-act="phones"><i></i></button></div>
    <p class="help" data-testid="latency-info">Verzögerung im Takt: ohne Kopfhörer ${latencyText(d, false)}, mit Kopfhörern ${latencyText(d, true)}. Abgleichen kannst du sie beim Mitspielen „Im Takt“; sie gilt nur für dieses Gerät.</p>
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
    // Flöte
    root.querySelectorAll<HTMLButtonElement>("[data-flute]").forEach((b) =>
      b.addEventListener("click", () => {
        d.activeFlute = b.dataset.flute!;
        flui.rename = flui.del = false;
        ctx.save();
        render();
      }),
    );
    on("fl-cal", () => {
      // Mikrofon direkt aus dem Tippen heraus (wie beim Stimmgerät); Fehler zeigt die Seite selbst
      mic.start().catch(() => {});
      ctx.go("#/floete");
    });
    on("fl-rename", () => {
      flui.rename = true;
      flui.del = false;
      render();
      const inp = root.querySelector<HTMLInputElement>('[data-testid="flute-name-input"]');
      inp?.focus();
      inp?.select();
    });
    on("fl-rename-ok", () => {
      const v = root.querySelector<HTMLInputElement>('[data-testid="flute-name-input"]')!.value.trim().slice(0, FLUTE_NAME_MAX);
      if (v) activeFlute(d).name = v;
      flui.rename = false;
      ctx.save();
      render();
    });
    on("fl-rename-no", () => {
      flui.rename = false;
      render();
    });
    root.querySelector<HTMLInputElement>('[data-testid="flute-name-input"]')?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") (root.querySelector('[data-act="fl-rename-ok"]') as HTMLButtonElement).click();
    });
    on("fl-add", () => {
      const id = newFluteId(d.flutes);
      d.flutes.push({ id, name: `Flöte ${d.flutes.length + 1}`, offsets: {}, updated: 0 });
      d.activeFlute = id;
      ctx.save();
      flui.del = false;
      flui.rename = true;
      render();
      const inp = root.querySelector<HTMLInputElement>('[data-testid="flute-name-input"]');
      inp?.focus();
      inp?.select();
    });
    on("fl-del", () => {
      flui.del = true;
      flui.rename = false;
      render();
    });
    on("fl-del-no", () => {
      flui.del = false;
      render();
    });
    on("fl-del-yes", () => {
      if (d.flutes.length > 1) {
        d.flutes = d.flutes.filter((f) => f.id !== d.activeFlute);
        d.activeFlute = d.flutes[0].id;
        ctx.save();
      }
      flui.del = false;
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
      if (pendingImport) replaceData(ctx, keepDeviceSettings(pendingImport, ctx.data));
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
