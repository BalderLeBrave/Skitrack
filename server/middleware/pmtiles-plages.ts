/**
 * Sert les tuiles de la carte des pistes (`/carte/*.pmtiles`) par tranches,
 * dans le serveur Nitro de l'application installée (préréglage `node-server`).
 *
 * Un PMTiles se lit par requêtes `Range` : seize kilo-octets d'en-tête, puis
 * chaque tuile à son décalage. Le serveur statique de Nitro ignore `Range` et
 * rendait les 135 Mo entiers à chaque demande (relevé le 3 octobre 2026 en
 * préparant la 1.1.0) : le lecteur PMTiles refuse alors, et la carte se
 * dessinait sans pistes. Et il répond avant tout middleware : les tuiles ne
 * sont donc pas dans `public/` du build, mais dans `tuiles/` à côté du
 * serveur (`electron-builder.yml`), que seul ce middleware sert, en entier ou
 * par tranches. En développement, `scripts/pmtiles-range-plugin.mjs` fait la
 * même chose pour Vite ; sur Vercel, le CDN honore `Range` et la requête
 * n'arrive pas ici.
 */

import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { Readable } from "node:stream";

interface Evenement {
  url: URL;
  req: { method: string; headers: Headers };
}

const MOTIF = /^\/carte\/[\w.-]+\.pmtiles$/;
/** Une tuile pèse quelques dizaines de kilo-octets ; une demande plus grosse est bornée. */
const TRANCHE_MAX = 16 * 1024 * 1024;

/** Le fichier dans `tuiles/` à côté du serveur bâti, d'où qu'on le lance. */
async function fichier(chemin: string): Promise<{ chemin: string; taille: number } | null> {
  const nom = basename(chemin);
  for (const racine of [join(process.cwd(), "tuiles"), join(process.cwd(), ".output", "tuiles")]) {
    const p = join(racine, nom);
    try {
      const s = await stat(p);
      if (s.isFile()) return { chemin: p, taille: s.size };
    } catch {
      /* pas ici */
    }
  }
  return null;
}

export default async function pmtilesPlages(event: Evenement, next: () => unknown): Promise<unknown> {
  const methode = (event.req.method ?? "GET").toUpperCase();
  if ((methode !== "GET" && methode !== "HEAD") || !MOTIF.test(event.url.pathname)) return next();
  const f = await fichier(event.url.pathname);
  if (!f) return next();

  const base = { "accept-ranges": "bytes", "content-type": "application/octet-stream", "cache-control": "public, max-age=86400" };
  const plage = /^bytes=(\d*)-(\d*)$/.exec(event.req.headers.get("range") ?? "");
  if (!plage) {
    const entetes = { ...base, "content-length": String(f.taille) };
    if (methode === "HEAD") return new Response(null, { status: 200, headers: entetes });
    return new Response(Readable.toWeb(createReadStream(f.chemin)) as ReadableStream, { status: 200, headers: entetes });
  }

  const debut = plage[1] === "" ? Math.max(0, f.taille - Number(plage[2])) : Number(plage[1]);
  const finDemandee = plage[1] !== "" && plage[2] !== "" ? Number(plage[2]) : f.taille - 1;
  const fin = Math.min(finDemandee, f.taille - 1, debut + TRANCHE_MAX - 1);
  if (!(debut <= fin) || debut >= f.taille) {
    return new Response(null, { status: 416, headers: { "content-range": `bytes */${f.taille}` } });
  }
  const longueur = fin - debut + 1;
  const entetes = { ...base, "content-range": `bytes ${debut}-${fin}/${f.taille}`, "content-length": String(longueur) };
  if (methode === "HEAD") return new Response(null, { status: 206, headers: entetes });
  const descripteur = await open(f.chemin, "r");
  try {
    const tampon = Buffer.alloc(longueur);
    await descripteur.read(tampon, 0, longueur, debut);
    return new Response(tampon, { status: 206, headers: entetes });
  } finally {
    await descripteur.close();
  }
}
