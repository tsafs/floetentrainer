// Kleiner eigener Service Worker: legt beim Bauen sw.js mit der Liste aller Dateien an.
// Die App funktioniert dadurch offline. Neue Versionen werden im Hintergrund geladen und erst
// übernommen, wenn die App sie freigibt (auf der Startseite, nie mitten in einer Sitzung).

import { createHash } from "node:crypto";
import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import type { Plugin } from "vite";

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...listFiles(p));
    else out.push(p);
  }
  return out;
}

const SW = (cache: string, assets: string[]) => `// Automatisch erzeugt (scripts/sw-plugin.ts)
const CACHE = ${JSON.stringify(cache)};
const ASSETS = ${JSON.stringify(assets)};
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("floetentrainer-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});
self.addEventListener("message", (e) => {
  if (e.data === "skipWaiting") self.skipWaiting();
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith(caches.match("./index.html", { ignoreSearch: true, ignoreVary: true }).then((r) => r || fetch(req)));
    return;
  }
  e.respondWith(caches.match(req, { ignoreSearch: true, ignoreVary: true }).then((r) => r || fetch(req)));
});
`;

export function serviceWorker(): Plugin {
  let publicDir = "";
  return {
    name: "floetentrainer-sw",
    apply: "build",
    configResolved(cfg) {
      publicDir = cfg.publicDir;
    },
    generateBundle(_opts, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith(".map"));
      const pub = listFiles(publicDir).map((p) => relative(publicDir, p).split("\\").join("/"));
      const assets = ["./", ...new Set(["index.html", ...files, ...pub])].filter((f) => f !== "sw.js").map((f) => (f === "./" ? f : "./" + f));
      const hash = createHash("sha256").update(assets.join("\n")).digest("hex").slice(0, 12);
      this.emitFile({ type: "asset", fileName: "sw.js", source: SW(`floetentrainer-${hash}`, assets) });
    },
  };
}
