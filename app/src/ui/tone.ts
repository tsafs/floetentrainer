// Tonseite (#/ton/<Ton>, aus der Grifftabelle mit ?von=griffe): alles zu einem Ton – Note und großes Griffbild,
// Anhören, Griff-Tipp, Lage auf den Linien, Sicherheit beim Lesen und Spielen (bzw. was bis dahin fehlt),
// Fälligkeit und Lieder. Unten blättert man zum tieferen oder höheren Ton (ersetzt den Verlaufseintrag, damit
// Zurück zur Startseite bzw. Grifftabelle führt).

import { songPlayer } from "../audio/song-player";
import { calibrationNotes } from "../audio/flute-profile";
import { fluteSvg } from "../music/flute";
import { stageIndexOfNote, unlockedNotes } from "../music/levels";
import { nameHtml, nameText } from "../music/names";
import { ALL_NOTES, NOTES, note } from "../music/notes";
import { staffSvg } from "../music/staff";
import { GRIP_TIPS, introSentence } from "../srs/hints";
import { level } from "../srs/progress";
import { toneTimeline } from "../songs/timeline";
import { activeFlute } from "../store/data";
import { topbar, type View } from "./common";
import { dueText, hasNote, noteState, pointsRow, songsWithNextStage, songsWithNote, waitingText } from "./note-info";

/** Kennung und Herkunft aus der Adresse: #/ton/fis1?von=griffe */
function parseHash(): { id: string | null; from: string } {
  const [path, query = ""] = location.hash.replace(/^#\/?/, "").split("?");
  const id = path.split("/")[1] ?? null;
  const from = new URLSearchParams(query).get("von") ?? "";
  return { id: id && NOTES[id] ? id : null, from };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const toneView: View = (root, ctx) => {
  const d = ctx.data;
  const { id, from } = parseHash();
  if (!id) {
    location.replace("#/"); // unbekannter Ton: ohne Verlaufseintrag, sonst führte Zurück wieder hierher
    return;
  }
  const n = note(id);
  const back = from === "griffe" ? "#/griffe" : "#/";
  const suffix = from ? `?von=${from}` : "";
  const st = noteState(d, id);
  const learned = st === "learned" || st === "weak";
  const chartId = n.partner ?? id;
  const fing = note(chartId).fingering;
  const tip = GRIP_TIPS[chartId];
  const status = learned ? `seit Stufe ${stageIndexOfNote(id)}` : st === "next" ? "nächste Stufe" : `Stufe ${stageIndexOfNote(id)}`;

  // Sicherheit, Fälligkeit, Lieder
  let progress: string;
  if (learned) {
    const due = [dueText(d, "lesen", id, ctx.today()), hasNote(d, "spielen", id) ? dueText(d, "spielen", id, ctx.today()) : null];
    const dueLine = [due[0] && `Lesen ${due[0]}`, due[1] && `Spielen ${due[1]}`].filter(Boolean).join(" · ");
    progress = `<div class="pts">${pointsRow(d, "lesen", id)}${pointsRow(d, "spielen", id)}</div>${dueLine ? `<p class="extra" data-testid="due">${dueLine}</p>` : ""}`;
  } else {
    progress = `<p class="msg">${waitingText(d, id)}</p>`;
    const more = st === "next" ? songsWithNextStage(d) : 0;
    if (more) progress += `<p class="extra">Mit der nächsten Stufe kannst du ${plural(more, "Lied", "Lieder")} mehr spielen.</p>`;
  }
  const inSongs = songsWithNote(id);
  const songLine = inSongs ? `Kommt in ${plural(inSongs, "Lied", "Liedern")} aus dem Heft vor.` : "Kommt in keinem Lied aus dem Heft vor.";
  // (Bei anderen Schreibweisen nennt introSentence den Partner schon.)
  const other = ALL_NOTES.find((m) => m.partner === id);
  const alt = other ? ` Sie wird manchmal auch als ${nameHtml(other.id)} geschrieben, mit demselben Griff.` : "";
  const canTune = calibrationNotes(unlockedNotes("lesen", level(d, "lesen"))).includes(chartId);

  // Nachbarn nach Tonhöhe (in der Grifftabelle nur deren 25 Töne)
  const order = from === "griffe" ? ALL_NOTES.filter((m) => !m.partner) : ALL_NOTES;
  const k = order.findIndex((m) => m.id === (from === "griffe" ? chartId : id));
  const prev = order[k - 1]?.id;
  const next = order[k + 1]?.id;
  const navLink = (t: string | undefined, dir: "prev" | "next") =>
    t
      ? `<a href="#/ton/${t}${suffix}" data-nav="${dir}" aria-label="${dir === "prev" ? "tieferer Ton" : "höherer Ton"}: ${nameText(t)}">${dir === "prev" ? "‹&nbsp;" : ""}${nameHtml(t)}${dir === "next" ? "&nbsp;›" : ""}</a>`
      : "<span></span>";

  root.innerHTML = `
<main class="screen page tonepage" data-note="${id}">
  ${topbar(nameHtml(id), back)}
  <section class="thero">
    <div class="tstaff">${staffSvg(id, { label: `Note ${nameText(id)}` })}</div>
    <div class="tflute">${fluteSvg(fing, `Griffbild ${nameText(id)}`)}</div>
    <p class="soft tstatus" data-testid="tone-status">${status}</p>
    <div class="tbtns">
      <button class="pill" data-act="hear"><svg viewBox="0 0 9 10" aria-hidden="true"><path d="M0 0 9 5 0 10Z"/></svg>Anhören</button>
      ${canTune ? `<a class="pill" href="#/floete/${chartId}">Flöte einstellen</a>` : ""}
    </div>
  </section>
  ${tip ? `<section class="tsec"><h2>Griff</h2><p data-testid="grip-tip">${tip}</p></section>` : ""}
  <section class="tsec"><h2>Note</h2><p>${introSentence(id)}${alt}</p><p class="extra">${songLine}</p></section>
  <section class="tsec" data-testid="tone-progress"><h2>Sicherheit</h2>${progress}</section>
  <div class="spacer"></div>
  <nav class="tnav" aria-label="Nachbartöne">${navLink(prev, "prev")}${navLink(next, "next")}</nav>
</main>`;

  root.querySelector('[data-act="hear"]')!.addEventListener("click", () => {
    songPlayer.play(toneTimeline([n.midi]), { secPerQuarter: 1.1, a4: activeFlute(d).tuning.hz, countIn: false, melody: true });
  });
  // Blättern ersetzt den Eintrag im Verlauf, damit Zurück nicht jeden Ton einzeln zurückgeht
  root.querySelectorAll<HTMLAnchorElement>("[data-nav]").forEach((a) =>
    a.addEventListener("click", (e) => {
      e.preventDefault();
      location.replace(a.getAttribute("href")!);
    }),
  );
  return () => {
    if (songPlayer.playing) songPlayer.stop();
    else if (songPlayer.context) songPlayer.idle();
  };
};
