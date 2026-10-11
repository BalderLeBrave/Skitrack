/**
 * Découverte par sitemap, polie : robots.txt d'abord, puis les sitemaps qu'il
 * nomme (ou les emplacements usuels), index ouverts un par un, chaque URL
 * jugée par `verdictPoli` avant d'être retenue.
 *
 * Ce qui arrête : une règle `Disallow` (l'URL n'est pas retenue, le sitemap
 * n'est pas ouvert), un refus du serveur (401, 403, 429 : `poserRefus` ferme
 * la porte de l'hôte, `demander` n'y retourne plus). Rien n'est contourné :
 * pas d'autre agent, pas de proxy, pas de second essai sur un refus.
 */

import { gunzipSync } from "node:zlib";
import { demanderOctets, texteRobots, verdictPoli } from "./politesse.ts";
import {
  dedoublonner,
  lireSitemap,
  preferFrancais,
  sitemapsDeRobots,
  interditToutSansGroupe,
  sitemapDedie,
  sitemapsParDefaut,
  sitemapUtile,
  urlDuProfil,
  type Profil,
} from "./sitemap.ts";

export type Decouverte = {
  origine: string;
  profil: Profil;
  /** Sitemaps lus avec succès. */
  sitemaps: string[];
  /** Pages du profil, autorisées par robots.txt. */
  urls: string[];
  /** Pages du sitemap (tous profils) vues au total. */
  vues: number;
  /** Pages ou sitemaps écartés par une règle robots.txt. */
  interditsRobots: number;
  /** robots.txt interdit la racine : rien n'a été lu. */
  racineInterdite: boolean;
  /** Le serveur a refusé (401, 403, 429) : la découverte s'est arrêtée là. */
  refus: number | null;
  erreurs: string[];
};

export type OptionsDecouverte = {
  maxSitemaps?: number;
  maxUrls?: number;
  signal?: AbortSignal;
};

function texteDe(octets: Uint8Array, url: string, type: string | null): string {
  const gz = /\.gz($|\?)/i.test(url) || /gzip/i.test(type ?? "") || (octets[0] === 0x1f && octets[1] === 0x8b);
  const buf = gz ? gunzipSync(octets) : Buffer.from(octets);
  return buf.toString("utf8");
}

export async function decouvrirParSitemap(
  origineBrute: string,
  profil: Profil,
  opts: OptionsDecouverte = {},
): Promise<Decouverte> {
  const origine = new URL(origineBrute).origin;
  const maxSitemaps = opts.maxSitemaps ?? 40;
  const maxUrls = opts.maxUrls ?? 5_000;
  const d: Decouverte = {
    origine,
    profil,
    sitemaps: [],
    urls: [],
    vues: 0,
    interditsRobots: 0,
    racineInterdite: false,
    refus: null,
    erreurs: [],
  };

  const racine = await verdictPoli(`${origine}/`);
  const robots = await texteRobots(origine);
  if (!racine.autorise || interditToutSansGroupe(robots)) {
    d.racineInterdite = true;
    d.erreurs.push(`robots.txt : ${racine.regle ?? "Disallow: / pour tous"}`);
    return d;
  }

  const file = sitemapsDeRobots(robots, origine);
  const publies = file.length > 0;
  if (!publies) file.push(...sitemapsParDefaut(origine));

  const ouverts = new Set<string>();
  // Pages des sitemaps dédiés au profil, puis des autres : quand un site
  // publie `hebergements-sitemap.xml`, ses rubriques de `page-sitemap.xml`
  // ne sont pas des fiches.
  const dediees: string[] = [];
  const generiques: string[] = [];
  // Les sitemaps dédiés s'ouvrent d'abord : `maxSitemaps` ne doit pas être
  // épuisé par les articles.
  const ranger = () => file.sort((a, b) => Number(sitemapDedie(b, profil)) - Number(sitemapDedie(a, profil)));
  ranger();
  while (file.length > 0 && ouverts.size < maxSitemaps && dediees.length < maxUrls) {
    if (opts.signal?.aborted) break;
    const sm = file.shift()!;
    if (ouverts.has(sm)) continue;
    ouverts.add(sm);
    const v = await verdictPoli(sm);
    if (!v.autorise) {
      d.interditsRobots += 1;
      continue;
    }
    let r;
    try {
      r = await demanderOctets(sm, opts.signal, v.delaiMs);
    } catch (e) {
      d.erreurs.push(`${sm} : ${e instanceof Error ? e.message : String(e)}`);
      continue;
    }
    if (r.status === 401 || r.status === 403 || r.status === 429) {
      d.refus = r.status;
      d.erreurs.push(`${sm} : refus ${r.status}, découverte arrêtée`);
      break;
    }
    if (!r.ok) {
      // Un emplacement par défaut absent n'est pas une erreur du site.
      if (publies) d.erreurs.push(`${sm} : HTTP ${r.status}`);
      continue;
    }
    let lu;
    try {
      lu = lireSitemap(texteDe(r.octets, sm, r.type));
    } catch (e) {
      d.erreurs.push(`${sm} : illisible (${e instanceof Error ? e.message : String(e)})`);
      continue;
    }
    if (lu.type === "illisible") {
      if (publies) d.erreurs.push(`${sm} : ni index ni liste d'URL`);
      continue;
    }
    d.sitemaps.push(sm);
    if (lu.type === "index") {
      for (const e of lu.entrees) if (sitemapUtile(e.loc, profil) && !ouverts.has(e.loc)) file.push(e.loc);
      ranger();
      continue;
    }
    d.vues += lu.entrees.length;
    const dedie = sitemapDedie(sm, profil);
    for (const e of lu.entrees) {
      if (new URL(e.loc).origin !== origine && !memeSite(e.loc, origine)) continue;
      if (dedie || urlDuProfil(e.loc, profil)) (dedie ? dediees : generiques).push(e.loc);
    }
  }

  // Un flux dédié (Diffusio, Tourinsoft) mêle hébergements, restaurants et
  // activités : le profil trie quand son chemin parle.
  const duProfil = dediees.filter((u) => urlDuProfil(u, profil));
  const trouves = dediees.length ? (duProfil.length ? duProfil : dediees) : generiques;
  for (const u of preferFrancais(dedoublonner(trouves)).slice(0, maxUrls)) {
    const v = await verdictPoli(u);
    if (v.autorise) d.urls.push(u);
    else d.interditsRobots += 1;
  }
  return d;
}

/** www.x.fr et x.fr sont le même site ; un sous-domaine aussi. */
function memeSite(url: string, origine: string): boolean {
  const racine = (h: string) => h.replace(/^www\./, "");
  try {
    const a = racine(new URL(url).hostname);
    const b = racine(new URL(origine).hostname);
    return a === b || a.endsWith(`.${b}`) || b.endsWith(`.${a}`);
  } catch {
    return false;
  }
}
