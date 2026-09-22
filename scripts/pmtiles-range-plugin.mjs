/**
 * Sert les fichiers PMTiles de `public/` par tranches, en développement et en
 * aperçu.
 *
 * Un PMTiles est une archive de tuiles lue par requêtes `Range` : la carte
 * demande seize kilo-octets d'en-tête, puis chaque tuile à son décalage. Le
 * serveur statique de Vite (sirv) ignore `Range` et rend le fichier entier
 * en 200 ; le lecteur PMTiles s'en aperçoit et refuse — et en local, la
 * carte se dessinait sans pistes alors que la production, servie par un CDN
 * qui honore `Range`, les montre. Ce greffon répond aux `Range` sur
 * `/carte/*.pmtiles` avant que sirv ne les voie ; il ne touche à rien
 * d'autre, et n'existe pas dans le bundle de production.
 */

import { createReadStream, statSync } from "node:fs";
import { join } from "node:path";

const MOTIF = /^\/carte\/[^/]+\.pmtiles$/;

/** @returns {import("vite").Plugin} */
export function pmtilesRangePlugin() {
  /** @param {string} racine */
  const servir = (racine) =>
    /** @type {import("vite").Connect.NextHandleFunction} */
    (req, res, next) => {
      const url = (req.url ?? "").split("?")[0] ?? "";
      if (!MOTIF.test(url) || (req.method !== "GET" && req.method !== "HEAD")) return next();
      let taille;
      const chemin = join(racine, decodeURIComponent(url));
      try {
        taille = statSync(chemin).size;
      } catch {
        return next();
      }
      res.setHeader("Accept-Ranges", "bytes");
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader("Access-Control-Allow-Origin", "*");
      const m = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range ?? ""));
      if (!m) {
        res.statusCode = 200;
        res.setHeader("Content-Length", String(taille));
        if (req.method === "HEAD") return res.end();
        return createReadStream(chemin).pipe(res);
      }
      const debut = m[1] ? Number(m[1]) : Math.max(0, taille - Number(m[2]));
      const fin = m[1] && m[2] ? Math.min(Number(m[2]), taille - 1) : taille - 1;
      if (debut > fin || debut >= taille) {
        res.statusCode = 416;
        res.setHeader("Content-Range", `bytes */${taille}`);
        return res.end();
      }
      res.statusCode = 206;
      res.setHeader("Content-Range", `bytes ${debut}-${fin}/${taille}`);
      res.setHeader("Content-Length", String(fin - debut + 1));
      if (req.method === "HEAD") return res.end();
      createReadStream(chemin, { start: debut, end: fin }).pipe(res);
    };

  return {
    name: "skitrack:pmtiles-range",
    configureServer(server) {
      server.middlewares.use(servir(join(server.config.root, "public")));
    },
    configurePreviewServer(server) {
      server.middlewares.use(servir(join(server.config.root, "public")));
    },
  };
}
