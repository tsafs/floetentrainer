// Stellt die Lieder aus heft/songs.py als virtuelles Modul "virtual:heft-songs" bereit (Rohdaten als
// JSON, gelesen von scripts/heft-songs.py). Gilt für `vite` (dev), `vite build` und Vitest, damit immer
// die aktuellen Heft-Lieder verwendet werden. Jedes Lied wird mit dem Leser der App geprüft; ein Lied,
// das sich nicht lesen lässt, lässt den Bau mit klarer Meldung scheitern. Es wird keine Datei erzeugt.

import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import type { RawSong } from "../src/songs/model.ts";
import { parseSong } from "../src/songs/parse.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
/** heft/songs.py; zum Ausprobieren über die Umgebungsvariable HEFT_SONGS_PY austauschbar */
export const HEFT_SONGS = resolve(process.env.HEFT_SONGS_PY || resolve(HERE, "../../heft/songs.py"));
const SCRIPT = resolve(HERE, "heft-songs.py");
const ID = "virtual:heft-songs";
const RESOLVED = "\0" + ID;

/** Lieder aus heft/songs.py lesen (mit --ref zusätzlich die Ergebnisse des Heft-Lesers, für Tests). */
export function readHeftSongs(ref = false): RawSong[] {
  const python = process.env.PYTHON || "python3";
  let out: string;
  try {
    out = execFileSync(python, [SCRIPT, HEFT_SONGS, ...(ref ? ["--ref"] : [])], {
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (e) {
    const err = e as { stderr?: string; message: string };
    throw new Error(`heft/songs.py ließ sich nicht lesen (${python} ${SCRIPT}):\n${err.stderr || err.message}`);
  }
  return JSON.parse(out) as RawSong[];
}

/** Meldungen aller Lieder, die sich nicht lesen lassen (Liedtitel, Stelle, Grund); leer, wenn alles gut ist. */
export function songErrors(songs: RawSong[]): string[] {
  const errors: string[] = [];
  for (const s of songs) {
    try {
      parseSong(s);
    } catch (e) {
      errors.push((e as Error).message);
    }
  }
  return errors;
}

/** Lieder lesen und prüfen; wirft mit allen Meldungen, wenn eines sich nicht lesen lässt. */
function loadChecked(): string {
  const songs = readHeftSongs();
  const errors = songErrors(songs);
  if (errors.length) {
    throw new Error(`Lieder aus heft/songs.py lassen sich nicht lesen:\n  ${errors.join("\n  ")}`);
  }
  return `export default ${JSON.stringify(songs)};`;
}

export function heftSongs(): Plugin {
  let code: string | null = null;
  return {
    name: "floetentrainer-heft-songs",
    // Schon beim Start prüfen, auch wenn (noch) kein Modul die Lieder importiert.
    buildStart() {
      code = loadChecked();
    },
    resolveId(id) {
      return id === ID ? RESOLVED : undefined;
    },
    load(id) {
      if (id !== RESOLVED) return undefined;
      this.addWatchFile(HEFT_SONGS);
      code ??= loadChecked();
      return code;
    },
    configureServer(server) {
      // Änderung an heft/songs.py während `npm run dev`: Modul neu laden und Seite auffrischen
      server.watcher.add(HEFT_SONGS);
      server.watcher.on("change", (file) => {
        if (resolve(file) !== HEFT_SONGS) return;
        code = null;
        const mod = server.moduleGraph.getModuleById(RESOLVED);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: "full-reload" });
      });
    },
  };
}
