// Willkommensseite beim allerersten Start und Seite „Startpunkt“ (Meilensteine wählen).
// Regeln: docs/app-startpunkt.md, Logik in ../srs/startpoint.ts.

import "./startpoint.css";
import { GLYPHS } from "../music/bravura";
import { stagesOf, TRACK_LABEL, type Track } from "../music/levels";
import { joinNames, nameHtml, nameText } from "../music/names";
import { note } from "../music/notes";
import { staffRange } from "../music/staff";
import { level, startLevel } from "../srs/progress";
import {
  chooseStart,
  currentMilestone,
  knownNotes,
  milestone,
  milestoneAllowed,
  milestoneLevel,
  addedNotes,
  nextNotes,
  MILESTONES,
  type Milestone,
  needsWelcome,
  type StartTracks,
} from "../srs/startpoint";
import { esc, topbar, type Ctx, type View } from "./common";

const fill = (s: string, html: boolean) => s.replace(/\{(\w+)\}/g, (_, id: string) => (html ? nameHtml(id) : nameText(id)));
export const milestoneTitle = (m: Milestone) => fill(m.title, true);
const milestoneTitleText = (m: Milestone) => fill(m.title, false);

// ---------------------------------------------------------------- kleine Notenvorschau

const HEAD_SCALE = 0.82;
const r = (v: number) => Math.round(v * 1000) / 1000;

/** Mehrere ganze Noten nebeneinander auf einer Zeile (nur zur Vorschau, ohne Takt). */
function previewSvg(ids: string[], label: string, range = staffRange(ids), pale: Set<string> = new Set(), unit = 0): string {
  // Abstand je Note, mit Platz für ein Vorzeichen davor
  const xs: number[] = [];
  let x = 4.9;
  for (const id of ids) {
    x += note(id).alter ? 1.15 : 0;
    xs.push(x);
    x += 2.7;
  }
  const width = (xs[xs.length - 1] ?? x) + 1.6;
  const H = GLYPHS.whole;
  const hw = (H.x1 - H.x0) * HEAD_SCALE;
  const cx = (H.x0 + H.x1) / 2;
  const o: string[] = [];
  for (let i = 0; i < 5; i++) o.push(`<line x1="0.15" x2="${r(width - 0.15)}" y1="${-i}" y2="${-i}" stroke-width="0.08"/>`);
  o.push(`<path d="${GLYPHS.clef.d}" transform="translate(0.45 -1)"/>`);
  ids.forEach((id, i) => {
    const n = note(id);
    const x = xs[i];
    const start = o.length;
    const y = -n.pos / 2;
    const ledger = (q: number) => o.push(`<line x1="${r(x - hw / 2 - 0.36)}" x2="${r(x + hw / 2 + 0.36)}" y1="${-q / 2}" y2="${-q / 2}" stroke-width="0.11"/>`);
    for (let q = -2; q >= n.pos; q -= 2) ledger(q);
    for (let q = 10; q <= n.pos; q += 2) ledger(q);
    o.push(`<path d="${H.d}" transform="translate(${r(x)} ${y}) scale(${HEAD_SCALE}) translate(${r(-cx)} 0)"/>`);
    const a = n.alter === 1 ? GLYPHS.sharp : n.alter === -1 ? GLYPHS.flat : null;
    if (a) o.push(`<path d="${a.d}" transform="translate(${r(x - hw / 2 - 0.28 - (a.x1 - a.x0))} ${y})"/>`);
    // Töne früherer Meilensteine blass
    if (pale.has(id)) o.splice(start, o.length - start, `<g class="old">${o.slice(start).join("")}</g>`);
  });
  // unit > 0: fester Maßstab (px je Zwischenraum), damit alle Zeilen gleich groß sind
  const size = unit ? ` style="width:${r(width * unit)}px"` : "";
  return `<svg class="staff preview" viewBox="0 ${r(range.top)} ${r(width)} ${r(range.bottom - range.top)}"${size} role="img" aria-label="${esc(label)}">${o.join("")}</svg>`;
}

/** Alle Vorschauen im selben Maßstab: der Ausschnitt fasst c¹ bis c³ */
const PREVIEW_RANGE = staffRange(knownNotes(MILESTONES[MILESTONES.length - 1]));
const PREVIEW_UNIT = 6.4; // px je Zwischenraum
const PER_LINE = 9;

/** Alle Töne eines Meilensteins nach Tonhöhe wie eine Tonleiter, die neuen schwarz, die früheren blass; lange Reihen umbrochen */
function milestonePreview(m: Milestone): string {
  const ids = knownNotes(m).slice().sort((a, b) => note(a).midi - note(b).midi || note(a).pos - note(b).pos);
  if (!ids.length) return "";
  const added = new Set(addedNotes(m));
  const pale = new Set(ids.filter((n) => !added.has(n)));
  const lines = Math.ceil(ids.length / PER_LINE);
  const per = Math.ceil(ids.length / lines);
  const out: string[] = [];
  for (let i = 0; i < ids.length; i += per) {
    const part = ids.slice(i, i + per);
    out.push(previewSvg(part, part.map(nameText).join(" "), PREVIEW_RANGE, pale, PREVIEW_UNIT));
  }
  return `<span class="mslines" aria-label="${esc(`Töne: ${ids.map(nameText).join(" ")}`)}">${out.join("")}</span>`;
}

// ---------------------------------------------------------------- Willkommensseite

export const welcomeView: View = (root, ctx) => {
  const first = stagesOf("lesen")[0].notes;
  root.innerHTML = `
<main class="screen page welcome">
  <h1>Willkommen</h1>
  <p class="lead">Hier lernst du Schritt für Schritt Noten lesen und auf der Blockflöte spielen – ein paar Minuten am Tag.</p>
  ${previewSvg(first, `Die ersten Töne: ${first.map(nameText).join(" ")}`)}
  <div class="spacer"></div>
  <div class="btnrow">
    <button class="big" data-act="fresh">Von vorn beginnen<small>mit den ersten Tönen ${joinNames(first)}</small></button>
    <button class="big alt" data-act="known">Ich kann schon Noten<small>Wähle, wo du einsteigst</small></button>
  </div>
  <p class="help">Das lässt sich jederzeit ändern – unter Fortschritt oder in den Einstellungen.</p>
</main>`;
  root.querySelector('[data-act="fresh"]')!.addEventListener("click", () => {
    chooseStart(ctx.data, MILESTONES[0], "beide", Date.now(), ctx.today());
    ctx.save();
    ctx.go("#/");
  });
  root.querySelector('[data-act="known"]')!.addEventListener("click", () => ctx.go("#/startpunkt/neu"));
};

// ---------------------------------------------------------------- Startpunkt

const TRACK_OPTIONS: [StartTracks, string][] = [
  ["beide", "Lesen und Spielen"],
  ["lesen", "nur Lesen"],
  ["spielen", "nur Spielen"],
];

function currentText(ctx: Ctx): string {
  const d = ctx.data;
  const part = (t: Track) => `${TRACK_LABEL[t]}: Stufe ${level(d, t)}, Startpunkt „${milestoneTitle(currentMilestone(d, t))}“`;
  return `${part("lesen")} · ${part("spielen")}`;
}

export const startpointView: View = (root, ctx) => {
  // #/startpunkt/neu: aus der Willkommensseite (noch nichts gewählt, nur gemeinsam). Ist schon etwas gewählt
  // (etwa per Zurück wieder hier), gilt die normale Seite „Startpunkt“ mit Spurwahl und Hinweisen.
  const neu = location.hash.replace(/^#\/?/, "").split("/")[1] === "neu";
  const fresh = neu && needsWelcome(ctx.data);
  if (neu && !fresh) history.replaceState(history.state, "", "#/startpunkt");
  let tracks: StartTracks = "beide";
  let picked: Milestone | null = null;

  function confirmText(m: Milestone): string {
    const d = ctx.data;
    const t: Track = tracks === "spielen" ? "spielen" : "lesen";
    const back = !fresh && milestoneLevel(m, t) < level(d, t);
    const known = knownNotes(m);
    const parts = [
      `<p><b>Bei „${milestoneTitle(m)}“ beginnen${tracks === "beide" || fresh ? "" : ` (${tracks === "lesen" ? "nur Lesen" : "nur Spielen"})`}?</b></p>`,
      known.length
        ? `<p>Diese Töne gelten als bekannt: keine Vorstellung, sie kommen ab und zu zur Wiederholung. Für die nächste Stufe zählen nur die Töne danach.</p>`
        : `<p>Die Töne kommen der Reihe nach, jeder mit einer kurzen Vorstellung.</p>`,
    ];
    if (back) parts.push(`<p>Töne ab hier, die du noch nicht geübt hast, kommen wieder mit Vorstellung. Deine bisherigen Antworten bleiben erhalten.</p>`);
    return parts.join("");
  }

  function render() {
    const d = ctx.data;
    const t: Track = tracks === "spielen" ? "spielen" : "lesen";
    const cur = fresh ? null : currentMilestone(d, t);
    const items = MILESTONES.map((m) => {
      const allowed = milestoneAllowed(d, m, tracks);
      const isCur = cur?.id === m.id && startLevel(d, t) === milestoneLevel(m, t);
      const lv = milestoneLevel(m, "lesen");
      const conf =
        picked?.id === m.id
          ? `<div class="confirm" data-testid="confirm">${confirmText(m)}<div class="btnrow"><button class="big" data-act="yes">Hier beginnen</button><button class="big alt" data-act="no">Abbrechen</button></div></div>`
          : "";
      const known = knownNotes(m);
      const after = nextNotes(m);
      const info = !known.length
        ? `Du beginnst mit ${joinNames(after)}.`
        : `${known.length} Töne · danach ${lv === 12 ? "andere Schreibweisen wie dis und as (nur Lesen)" : `neu: ${joinNames(after)}`}`;
      return `<li class="ms${isCur ? " cur" : ""}${picked?.id === m.id ? " picked" : ""}">
        <button class="msbtn" data-ms="${m.id}"${allowed ? "" : " disabled"} aria-label="${esc(milestoneTitleText(m))}">
          <span class="mshead"><span class="mst">${milestoneTitle(m)}</span><span class="soft">${isCur ? "dein Startpunkt" : `Start bei Stufe ${lv}`}</span></span>
          ${milestonePreview(m)}
          <span class="msknown">${info}</span>
          ${allowed ? "" : `<span class="msknown">Erst, wenn Lesen so weit ist.</span>`}
        </button>${conf}</li>`;
    }).join("");
    root.innerHTML = `
<main class="screen page startpoint">
  ${topbar(fresh ? "Wo steigst du ein?" : "Startpunkt", fresh ? "#/" : "#/einstellungen", !fresh)}
  <p class="help">${
    fresh
      ? "Was kannst du schon? Kannst du die Noten eines Abschnitts lesen und greifen, beginnst du danach. Schwarz sind jeweils die Töne, die dazukommen."
      : "Zu leicht? Wähle einen späteren Abschnitt. Zu schwer? Einen früheren – oder ganz von vorn. Schwarz sind jeweils die Töne, die dazukommen."
  }</p>
  ${
    fresh
      ? ""
      : `<p class="soft cur-info" data-testid="current">${currentText(ctx)}</p>
  <div class="seg" role="group" aria-label="Für welche Übungen">${TRACK_OPTIONS.map(
    ([v, label]) => `<button data-tracks="${v}" aria-pressed="${tracks === v}">${label}</button>`,
  ).join("")}</div>`
  }
  <ol class="milestones">${items}</ol>
  <p class="help" data-testid="between">Dazwischen? Wähle den kleineren und stelle in den Einstellungen unter „Stufen“ eine Stufe höher.${fresh ? "" : " Alles löschen: Einstellungen → Zurücksetzen."}</p>
</main>`;
    bind();
  }

  function bind() {
    root.querySelectorAll<HTMLButtonElement>("[data-tracks]").forEach((b) =>
      b.addEventListener("click", () => {
        tracks = b.dataset.tracks as StartTracks;
        picked = null;
        render();
      }),
    );
    root.querySelectorAll<HTMLButtonElement>("[data-ms]").forEach((b) =>
      b.addEventListener("click", () => {
        const m = milestone(b.dataset.ms!)!;
        picked = picked?.id === m.id ? null : m;
        render();
        root.querySelector('[data-act="yes"]')?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }),
    );
    root.querySelector('[data-act="no"]')?.addEventListener("click", () => {
      picked = null;
      render();
    });
    root.querySelector('[data-act="yes"]')?.addEventListener("click", () => {
      if (!picked) return;
      chooseStart(ctx.data, picked, fresh ? "beide" : tracks, Date.now(), ctx.today());
      ctx.save();
      // Nach der ersten Wahl führt Zurück nicht wieder auf „Wo steigst du ein?“
      if (fresh) location.replace("#/");
      else ctx.go("#/");
    });
  }

  render();
};
