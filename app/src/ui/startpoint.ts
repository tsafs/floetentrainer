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
  milestoneNotes,
  MILESTONES,
  type Milestone,
  type StartTracks,
} from "../srs/startpoint";
import { esc, topbar, type Ctx, type View } from "./common";

/** Was als bekannt gilt, in Worten (Platzhalter {c1} usw. werden zu Notennamen) */
const KNOWN_TEXT: Record<string, string> = {
  "erste-toene": "Ganz von vorn – nichts vorausgesetzt.",
  "bis-d1": "Du kennst schon {h1} {a1} {g1} {c2} {d2}.",
  "tiefes-c1": "Du kennst schon {d1} bis {e2}, auch {fis1} und {f1}.",
  "hohe-toene": "Du kennst schon {c1} bis {e2} mit {fis1}.",
  vorzeichen: "Du kennst schon alle Töne ohne Vorzeichen von {c1} bis {c3}, dazu {fis1} und {cis2}.",
  "hohe-griffe": "Du kennst schon alles bis auf die schwierigen hohen Griffe.",
};

const fill = (s: string, html: boolean) => s.replace(/\{(\w+)\}/g, (_, id: string) => (html ? nameHtml(id) : nameText(id)));
export const milestoneTitle = (m: Milestone) => fill(m.title, true);
const milestoneTitleText = (m: Milestone) => fill(m.title, false);

// ---------------------------------------------------------------- kleine Notenvorschau

const HEAD_SCALE = 0.82;
const r = (v: number) => Math.round(v * 1000) / 1000;

/** Mehrere ganze Noten nebeneinander auf einer Zeile (nur zur Vorschau, ohne Takt). */
function previewSvg(ids: string[], label: string, range = staffRange(ids)): string {
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
    const y = -n.pos / 2;
    const ledger = (q: number) => o.push(`<line x1="${r(x - hw / 2 - 0.36)}" x2="${r(x + hw / 2 + 0.36)}" y1="${-q / 2}" y2="${-q / 2}" stroke-width="0.11"/>`);
    for (let q = -2; q >= n.pos; q -= 2) ledger(q);
    for (let q = 10; q <= n.pos; q += 2) ledger(q);
    o.push(`<path d="${H.d}" transform="translate(${r(x)} ${y}) scale(${HEAD_SCALE}) translate(${r(-cx)} 0)"/>`);
    const a = n.alter === 1 ? GLYPHS.sharp : n.alter === -1 ? GLYPHS.flat : null;
    if (a) o.push(`<path d="${a.d}" transform="translate(${r(x - hw / 2 - 0.28 - (a.x1 - a.x0))} ${y})"/>`);
  });
  return `<svg class="staff preview" viewBox="0 ${r(range.top)} ${r(width)} ${r(range.bottom - range.top)}" role="img" aria-label="${esc(label)}">${o.join("")}</svg>`;
}

/** Alle Vorschauen im selben Maßstab: der Ausschnitt fasst c¹ bis c³ */
const PREVIEW_RANGE = staffRange(MILESTONES.flatMap(milestoneNotes));

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
  // #/startpunkt/neu: aus der Willkommensseite (noch nichts gewählt, nur gemeinsam)
  const fresh = location.hash.replace(/^#\/?/, "").split("/")[1] === "neu";
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
        ? `<p>Alles davor gilt als bekannt: keine Vorstellung, die Töne kommen ab und zu zur Wiederholung. Für die nächste Stufe zählen nur die Töne ab hier.</p>`
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
      const notes = milestoneNotes(m);
      const lv = milestoneLevel(m, "lesen");
      const conf =
        picked?.id === m.id
          ? `<div class="confirm" data-testid="confirm">${confirmText(m)}<div class="btnrow"><button class="big" data-act="yes">Hier beginnen</button><button class="big alt" data-act="no">Abbrechen</button></div></div>`
          : "";
      return `<li class="ms${isCur ? " cur" : ""}${picked?.id === m.id ? " picked" : ""}">
        <button class="msbtn" data-ms="${m.id}"${allowed ? "" : " disabled"} aria-label="${esc(`${milestoneTitleText(m)}, ab Stufe ${lv}`)}">
          <span class="mshead"><span class="mst">${milestoneTitle(m)}</span><span class="soft">${isCur ? "dein Startpunkt" : `ab Stufe ${lv}`}</span></span>
          ${previewSvg(notes, `Neu dort: ${notes.map(nameText).join(" ")}`, PREVIEW_RANGE)}
          <span class="msknown">${fill(KNOWN_TEXT[m.id] ?? "", true)}</span>
          ${allowed ? "" : `<span class="msknown">Erst, wenn Lesen so weit ist.</span>`}
        </button>${conf}</li>`;
    }).join("");
    root.innerHTML = `
<main class="screen page startpoint">
  ${topbar(fresh ? "Wo steigst du ein?" : "Startpunkt", fresh ? "#/" : "#/fortschritt", !fresh)}
  <p class="help">${
    fresh
      ? "Wähle den Abschnitt, mit dem du beginnen willst. Ist es zu leicht oder zu schwer, kannst du später unter Fortschritt wechseln."
      : "Zu leicht? Wähle einen späteren Abschnitt. Zu schwer? Einen früheren – oder ganz von vorn."
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
  ${fresh ? "" : `<p class="help">Einzelne Stufen lassen sich in den Einstellungen unter „Stufen“ verstellen. Alles löschen: Einstellungen → Zurücksetzen.</p>`}
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
      ctx.go("#/");
    });
  }

  render();
};
