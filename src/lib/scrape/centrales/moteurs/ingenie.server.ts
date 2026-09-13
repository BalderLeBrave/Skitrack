/**
 * Le moteur Ingénie, partie réseau.
 *
 * Un seul appel, et rien autour : pas de visite préalable de l'accueil, pas de
 * cookie de session, pas d'en-tête `Referer`. Vérifié le 13 septembre 2026 —
 * la requête nue rend exactement la même page que la requête précédée d'une
 * session, au millier d'octets près.
 *
 * **`robots.txt` décide, et il décide souvent non.** Vingt-deux des vingt-huit
 * centrales du moteur ferment ce chemin. Le connecteur d'une centrale fermée
 * n'existe pas : ce n'est pas ici qu'on s'en rend compte, c'est
 * `moteurs/etat.ts` qui le dit. La vérification faite ici est la ceinture : si
 * une centrale ouverte se ferme un jour, l'appel s'arrête tout seul et la
 * raison remonte à l'écran.
 */

import type { Listing } from "@/lib/listings";
import { AGENT_CENTRALES } from "../robots";
import { centraleAutorise } from "../robots.server";
import type { ContexteCentrale } from "../types";
import { lireIngenie, nuitsEntre, urlIngenie, type FicheIngenie } from "./ingenie";

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
  return {
    id: `ing-${r.cle}-${f.id}`,
    stationId: ctx.stationId,
    title: f.titre,
    source: "Centrale",
    total: f.total,
    currency: "EUR",
    // Ni capacité ni chambres : la centrale ne les donne nulle part sous une
    // forme sûre. Les titres l'annoncent souvent, mais pas toujours de la même
    // chose — « 2 appartements de 6 personnes face à face » vaut douze places.
    guests: null,
    bedrooms: null,
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

/**
 * Interroge une centrale Ingénie.
 *
 * Lève quand `robots.txt` ferme le chemin ou quand l'appel échoue :
 * `run.server.ts` en fait un rapport de source en échec et l'écran dit
 * pourquoi. Une page sans fiche ne lève pas — c'est la réponse normale quand
 * rien n'est libre à ces dates.
 */
export async function chercherIngenie(ctx: ContexteCentrale, r: ReglageIngenie): Promise<Listing[]> {
  const base = ctx.base.replace(/\/+$/, "");
  const url = urlIngenie(base, r.cid, ctx);
  const verdict = await centraleAutorise(url);
  if (verdict.autorise !== true) {
    throw new Error(
      verdict.autorise === null ? verdict.regle : `robots.txt dit « ${verdict.regle} »`,
    );
  }
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
    const fiches = lireIngenie(await rep.text());
    console.info(`[centrale] ${r.host} : ${fiches.length} fiches, ${ctx.checkIn}→${ctx.checkOut}`);
    return fiches.map((f) => enListing(f, base, r, ctx));
  } finally {
    clearTimeout(minuteur);
  }
}
