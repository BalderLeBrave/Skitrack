/**
 * Le moteur Ingénie, partie réseau.
 *
 * Un seul appel, et rien autour : pas de visite préalable de l'accueil, pas de
 * cookie de session, pas d'en-tête `Referer`. Vérifié le 13 septembre 2026 —
 * la requête nue rend exactement la même page que la requête précédée d'une
 * session, au millier d'octets près.
 *
 * `robots.txt` est lu avant l'appel et n'arrête jamais. Vingt-deux centrales
 * ferment `/booking` par `Disallow: /*booking?*` : on le journalise, on
 * interroge quand même. Les centrales sans fichier propre passent par
 * `chercherIngenieHote`, qui lit le `cid` sur la page d'accueil.
 */

import type { Listing } from "@/lib/listings";
import { occupancyFromText } from "@/lib/stay/occupancy";
import { AGENT_CENTRALES } from "../robots";
import { centraleAutorise } from "../robots.server";
import type { ContexteCentrale } from "../types";
import { cidDepuisPage, lireIngenie, nuitsEntre, urlIngenie, type FicheIngenie } from "./ingenie";

const UA = `${AGENT_CENTRALES}/1.0 (+https://skitrack.local/robots)`;
const TIMEOUT_MS = 30_000;

export type ReglageIngenie = {
  host: string;
  nom: string;
  /** Jeton court et stable, qui entre dans l'identifiant des annonces. */
  cle: string;
  /**
   * Numéro de configuration du moteur, propre à la centrale.
   *
   * Il se lit sur sa page d'accueil, dans l'appel `new IngenieMenuEngine.Client({ cid: N })`
   * ou dans les champs cachés du formulaire de recherche. Sans lui, la page
   * revient vide.
   */
  cid: number | string;
};

function enListing(f: FicheIngenie, base: string, r: ReglageIngenie, ctx: ContexteCentrale): Listing {
  const nuits = nuitsEntre(ctx.checkIn, ctx.checkOut);
  const occ = occupancyFromText(f.titre);
  return {
    id: `ing-${r.cle}-${f.id}`,
    stationId: ctx.stationId,
    title: f.titre,
    source: "Centrale",
    total: f.total,
    currency: "EUR",
    guests: occ.guests,
    bedrooms: occ.bedrooms,
    available: true,
    photo: f.photo,
    url: f.chemin ? new URL(f.chemin, `${base}/`).toString() : base,
    // La page de résultats ne porte aucune coordonnée. Ces annonces ne
    // paraissent donc pas sur la carte, et l'écran les dit sans localisation.
    lat: null,
    lon: null,
    proven: `${r.nom} (Ingénie, ${r.host}) ${ctx.checkIn}→${ctx.checkOut}, ${nuits} nuit${
      nuits > 1 ? "s" : ""
    }, ${ctx.guests} pers.${f.etiquette ? ` — étiquette de la centrale : « ${f.etiquette} »` : ""}`,
  };
}

async function html(url: string): Promise<string> {
  await centraleAutorise(url);
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const rep = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html", "accept-language": "fr-FR,fr;q=0.9" },
    });
    if (!rep.ok) {
      await rep.body?.cancel();
      throw new Error(`la centrale a répondu ${rep.status}`);
    }
    return await rep.text();
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * Interroge une centrale Ingénie.
 *
 * Lève quand l'appel échoue : `run.server.ts` en fait un rapport de source en
 * échec et l'écran dit pourquoi. Une page sans fiche ne lève pas — c'est la
 * réponse normale quand rien n'est libre à ces dates. `robots.txt` est lu, pas
 * appliqué.
 */
export async function chercherIngenie(ctx: ContexteCentrale, r: ReglageIngenie): Promise<Listing[]> {
  const base = ctx.base.replace(/\/+$/, "");
  const url = urlIngenie(base, r.cid, ctx);
  const fiches = lireIngenie(await html(url));
  console.info(`[centrale] ${r.host} : ${fiches.length} fiches, ${ctx.checkIn}→${ctx.checkOut}`);
  return fiches.map((f) => enListing(f, base, r, ctx));
}

function cleDepuisHote(host: string): string {
  const brut = host.replace(/^www\./, "").split(".")[0] ?? "ing";
  return brut.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "ing";
}

/**
 * Centrale Ingénie sans fichier propre : `cid` lu sur l'accueil, puis la
 * recherche datée. C'est le passage des vingt-deux hôtes que `robots.txt`
 * fermait et qu'on interroge quand même.
 */
export async function chercherIngenieHote(
  ctx: ContexteCentrale,
  nom: string,
  host: string,
): Promise<Listing[]> {
  const base = ctx.base.replace(/\/+$/, "");
  const accueil = await html(`${base}/`);
  const cid = cidDepuisPage(accueil);
  if (cid == null) {
    throw new Error("la page d'accueil n'a pas publié l'identifiant du moteur");
  }
  return chercherIngenie(ctx, { host, nom, cle: cleDepuisHote(host), cid });
}
