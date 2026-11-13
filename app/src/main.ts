// Einstieg: Daten laden, Seiten über #-Adressen wechseln, Updates auf der Startseite übernehmen.

import "./styles.css";
import type { Ctx, View } from "./ui/common";
import { topbar } from "./ui/common";
import { homeView } from "./ui/home";
import { chartView, micHelpView, progressView, summaryView } from "./ui/pages";
import { practiceView } from "./ui/practice";
import { settingsView } from "./ui/settings";
import { tunerView } from "./ui/tuner";
import { defaultData } from "./store/data";
import { dayKey } from "./store/dates";
import { backupFileName, keepBrokenCopy, loadData, parseBackup, requestPersistence, saveData } from "./store/storage";

const root = document.getElementById("app")!;

const ROUTES: Record<string, View> = {
  "": homeView,
  uebung: practiceView,
  ende: summaryView,
  fortschritt: progressView,
  griffe: chartView,
  stimmgeraet: tunerView,
  einstellungen: settingsView,
  mikrofon: micHelpView,
};

function routeName(): string {
  return location.hash.replace(/^#\/?/, "").split("?")[0];
}

let cleanup: (() => void) | void;

function render(ctx: Ctx) {
  cleanup?.();
  cleanup = undefined;
  const name = routeName();
  const view = ROUTES[name] ?? homeView;
  window.scrollTo(0, 0);
  cleanup = view(root, ctx);
  if (name === "" || !ROUTES[name]) applyWaitingUpdate();
}

// ---------------------------------------------------------------- Updates (Service Worker)

let waiting: ServiceWorker | null = null;
let reloadOnChange = false;

function applyWaitingUpdate() {
  if (!waiting) return;
  reloadOnChange = true;
  waiting.postMessage("skipWaiting");
  waiting = null;
}

function setupServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    // Nur neu laden, wenn wir das Update selbst auf der Startseite freigegeben haben
    if (reloadOnChange && routeName() === "") location.reload();
  });
  navigator.serviceWorker
    .register("./sw.js")
    .then((reg) => {
      const track = (w: ServiceWorker | null) => {
        if (!w) return;
        const check = () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) {
            waiting = w;
            if (routeName() === "") applyWaitingUpdate();
          }
        };
        w.addEventListener("statechange", check);
        check();
      };
      track(reg.waiting);
      reg.addEventListener("updatefound", () => track(reg.installing));
      // gelegentlich nach Updates sehen
      window.setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    })
    .catch(() => {});
}

// ---------------------------------------------------------------- Start

function start() {
  const res = loadData();
  if (!res.ok) {
    showLoadError(res.error, res.raw);
    return;
  }
  const ctx: Ctx = {
    data: res.data,
    save() {
      ctx.saveFailed = !saveData(ctx.data);
    },
    go(hash: string) {
      if (location.hash === hash || (hash === "#/" && routeName() === "")) render(ctx);
      else location.hash = hash;
    },
    today: () => dayKey(),
    session: null,
    lastResult: null,
    micError: null,
    micRetry: null,
    saveFailed: false,
  };
  if (res.fresh) ctx.save();
  requestPersistence();
  window.addEventListener("hashchange", () => render(ctx));
  // Nach einem Neuladen gibt es keine laufende Sitzung mehr
  if (["uebung", "ende"].includes(routeName())) history.replaceState(null, "", location.pathname + location.search);
  render(ctx);
  setupServiceWorker();
  // Für automatische Tests
  (window as unknown as { __ft: Ctx }).__ft = ctx;
}

/** Gespeicherte Daten lassen sich nicht lesen: nie still löschen, sondern Wege anbieten. */
function showLoadError(error: string, raw: string) {
  let confirm = false;
  const draw = (msg = "") => {
    root.innerHTML = `
<main class="screen page">
  ${topbar("Daten nicht lesbar", "#")}
  <p class="banner">${error}</p>
  <p class="help">Die gespeicherten Übungsdaten lassen sich nicht lesen. Es wurde nichts gelöscht. Du kannst eine Sicherung einlesen oder die beschädigten Daten zur Aufbewahrung herunterladen.</p>
  <div class="btnrow">
    <button class="big" data-act="import">Sicherung einlesen</button>
    <input type="file" accept=".json,application/json" hidden>
    <button class="big alt" data-act="download">Beschädigte Daten herunterladen</button>
    ${
      confirm
        ? `<div class="confirm"><p>Neu beginnen? Die beschädigten Daten werden beiseitegelegt, der Fortschritt beginnt von vorn.</p><button class="big danger" data-act="fresh-yes">Ja, neu beginnen</button><button class="big alt" data-act="fresh-no">Abbrechen</button></div>`
        : `<button class="big alt" data-act="fresh">Neu beginnen</button>`
    }
  </div>
  ${msg ? `<p class="msg err">${msg}</p>` : ""}
</main>`;
    const on = (a: string, fn: () => void) => root.querySelector(`[data-act="${a}"]`)?.addEventListener("click", fn);
    const file = root.querySelector('input[type="file"]') as HTMLInputElement;
    on("import", () => file.click());
    file.addEventListener("change", async () => {
      const f = file.files?.[0];
      if (!f) return;
      try {
        const data = parseBackup(await f.text());
        keepBrokenCopy(raw);
        saveData(data);
        start();
      } catch (e) {
        draw((e as Error).message);
      }
    });
    on("download", () => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([raw], { type: "application/json" }));
      a.download = backupFileName().replace("sicherung", "beschaedigt");
      a.click();
    });
    on("fresh", () => {
      confirm = true;
      draw();
    });
    on("fresh-no", () => {
      confirm = false;
      draw();
    });
    on("fresh-yes", () => {
      keepBrokenCopy(raw);
      saveData(defaultData());
      start();
    });
  };
  draw();
}

start();
