/**
 * Le moteur Orchestra, partie réseau.
 *
 * **Deux caches, et sans eux ce connecteur ne serait pas tenable.** Le prix
 * s'obtient un logement à la fois, et la recherche groupée porte un Disallow
 * `/*serp?` : on le lit, on n'en fait pas un arrêt. Couvrir La Plagne entière
 * demande onze pages de destination et quatre-vingt-quinze calendriers. Aucun
 * de ces appels ne dépend des dates — la page de destination est un catalogue,
 * et le calendrier d'un logement porte d'un coup tous ses mois et toutes ses
 * durées. Ils sont donc retenus, et la deuxième recherche ne coûte plus rien,
 * à n'importe quelles dates.
 *
 * Le catalogue tient six heures, le calendrier trois. Ce n'est pas la même
 * chose : une liste de logements bouge en semaines, une disponibilité en
 * heures. Trois heures est le compromis entre un serveur qu'on ménage et un
 * prix qu'on n'invente pas.
 *
 * **Chaque station vise son village.** Le connecteur reçoit l'identifiant de la
 * station demandée et n'interroge que les destinations qui la concernent :
 * Champagny-en-Vanoise coûte huit appels, Montchavin-les-Coches huit, et seule
 * « La Plagne », qui désigne le domaine entier, en coûte cent six la première
 * fois.
 */

import type { Listing } from "@/lib/listings";
import { annoncer } from "@/lib/stay/occupancy";
import { AGENT_CENTRALES } from "../robots";
import { centraleAutorise } from "../robots.server";
import type { ContexteCentrale } from "../types";
import {
  cartesOrchestra,
  nuitsOrchestra,
  prixOrchestra,
  urlCalendrierOrchestra,
  urlCatalogueOrchestra,
  type CarteOrchestra,
  type OffreOrchestra,
} from "./orchestra";

const UA = `${AGENT_CENTRALES}/1.0 (+https://skitrack.local/robots)`;
const TIMEOUT_MS = 30_000;
/** Appels menés de front sur un même hôte. */
const FRONT = 4;
/** Un catalogue de logements bouge en semaines. */
const CATALOGUE_TTL_MS = 6 * 60 * 60 * 1000;
/** Une disponibilité bouge en heures. */
const CALENDRIER_TTL_MS = 3 * 60 * 60 * 1000;

export type ReglageOrchestra = {
  host: string;
  nom: string;
  /** Jeton court et stable, qui entre dans l'identifiant des annonces. */
  cle: string;
  /**
   * Les destinations à interroger, par station.
   *
   * Une station de village ne vise que son village. Seule une station qui
   * désigne le domaine entier les vise toutes, et c'est la seule qui coûte
   * cher.
   */
  destinations: Record<string, readonly string[]>;
  /** Ce qu'on interroge pour une station absente de la table. */
  parDefaut: readonly string[];
};

const catalogues = new Map<string, { at: number; valeur: CarteOrchestra[] }>();
const calendriers = new Map<string, { at: number; valeur: unknown }>();
async function json(url: string, texte = false): Promise<unknown> {
  await centraleAutorise(url);
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent": UA,
        accept: texte ? "text/html" : "application/json, */*",
        "accept-language": "fr-FR,fr;q=0.9",
      },
    });
    if (!r.ok) {
      await r.body?.cancel();
      throw new Error(`la centrale a répondu ${r.status}`);
    }
    return texte ? await r.text() : await r.json();
  } finally {
    clearTimeout(minuteur);
  }
}

/** Mène une file d'attente par petits groupes, sans jamais dépasser `FRONT`. */
async function parGroupes<T, R>(items: readonly T[], faire: (x: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let curseur = 0;
  const ouvrier = async (): Promise<void> => {
    for (;;) {
      const i = curseur;
      curseur += 1;
      const x = items[i];
      if (x === undefined) return;
      out[i] = await faire(x);
    }
  };
  await Promise.all(Array.from({ length: Math.min(FRONT, items.length) }, ouvrier));
  return out;
}

async function catalogue(base: string, destination: string): Promise<CarteOrchestra[]> {
  const cle = `${base}|${destination}`;
  const hit = catalogues.get(cle);
  if (hit && Date.now() - hit.at < CATALOGUE_TTL_MS) return hit.valeur;
  const page = (await json(urlCatalogueOrchestra(base, destination), true)) as string;
  const valeur = cartesOrchestra(page);
  catalogues.set(cle, { at: Date.now(), valeur });
  return valeur;
}

async function calendrier(base: string, id: string, ctx: ContexteCentrale): Promise<unknown> {
  // Le calendrier porte tous les mois et toutes les durées : la clé de cache
  // ne retient donc que le logement, jamais les dates de la demande.
  const cle = `${base}|${id}`;
  const hit = calendriers.get(cle);
  if (hit && Date.now() - hit.at < CALENDRIER_TTL_MS) return hit.valeur;
  const valeur = await json(urlCalendrierOrchestra(base, id, ctx));
  calendriers.set(cle, { at: Date.now(), valeur });
  return valeur;
}

function enListing(
  c: CarteOrchestra,
  o: OffreOrchestra,
  base: string,
  r: ReglageOrchestra,
  ctx: ContexteCentrale,
): Listing {
  const nuits = nuitsOrchestra(ctx.checkIn, ctx.checkOut);
  const occ = annoncer({ guests: o.capacite, bedrooms: null }, c.titre, o.categorie);
  return {
    id: `orc-${r.cle}-${c.id}`,
    stationId: ctx.stationId,
    title: c.titre,
    source: "Centrale",
    total: o.total,
    currency: "EUR",
    guests: occ.guests,
    bedrooms: occ.bedrooms,
    available: true,
    photo: c.photo,
    url: c.chemin ? new URL(c.chemin, `${base}/`).toString() : base,
    // Les pages de destination ne portent pas de coordonnées.
    lat: null,
    lon: null,
    proven: `${r.nom} (Orchestra, ${r.host}) ${ctx.checkIn}→${ctx.checkOut}, ${nuits} nuit${
      nuits > 1 ? "s" : ""
    }, ${ctx.guests} pers.${o.categorie ? ` — ${o.categorie}` : ""}`,
  };
}

/**
 * Interroge une centrale Orchestra.
 *
 * Une destination qui échoue n'emporte pas les autres : son motif est noté au
 * journal et la recherche continue. Elle ne lève que si toutes échouent.
 */
export async function chercherOrchestra(ctx: ContexteCentrale, r: ReglageOrchestra): Promise<Listing[]> {
  const base = ctx.base.replace(/\/+$/, "");
  const destinations = r.destinations[ctx.stationId] ?? r.parDefaut;
  const refus: string[] = [];

  const listes = await parGroupes(destinations, async (d) => {
    try {
      return await catalogue(base, d);
    } catch (err) {
      refus.push(`${d} : ${err instanceof Error ? err.message : String(err)}`);
      return [] as CarteOrchestra[];
    }
  });
  if (refus.length === destinations.length) {
    throw new Error(refus[0] ?? "aucune destination déclarée");
  }

  const par = new Map<string, CarteOrchestra>();
  for (const l of listes) for (const c of l) if (!par.has(c.id)) par.set(c.id, c);
  const cartes = [...par.values()];

  const offres = await parGroupes(cartes, async (c) => {
    try {
      return prixOrchestra(await calendrier(base, c.id, ctx), ctx);
    } catch {
      return null;
    }
  });

  const listings: Listing[] = [];
  for (const [i, c] of cartes.entries()) {
    const o = offres[i];
    if (o) listings.push(enListing(c, o, base, r, ctx));
  }
  console.info(
    `[centrale] ${r.host} : ${listings.length} vendables sur ${cartes.length} au catalogue` +
      ` (${destinations.length} destination(s)), ${ctx.checkIn}→${ctx.checkOut}`,
  );
  if (refus.length) console.warn(`[centrale] ${r.host} : ${refus.join(" ; ")}`);
  return listings;
}
