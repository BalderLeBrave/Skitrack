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
 *
 * **La capacité et le point se lisent sur la fiche, une fois par mois et par
 * logement.** Ni le catalogue ni le calendrier ne les publient ; la fiche
 * `/location/…` les écrit dans ses blocs « Information » et « Localisation »
 * (relevé du 25 septembre 2026). Ils ne dépendent pas des dates : ils sont
 * retenus trente jours. Seuls les logements qui ont une offre aux dates
 * demandées sont lus, un à la fois, chacun une seconde au moins après la
 * requête précédente vers la centrale, calendriers compris (`cadence.ts`),
 * huit secondes au plus par fiche, dans un budget de quinze secondes, et jamais
 * passé trente secondes de recherche : la part des centrales est coupée à
 * quarante-huit (`run.server.ts`), et une fiche ne doit pas emporter les
 * offres déjà lues. Ce qui n'a pas été lu le sera à la recherche suivante, et
 * reste en attendant « non annoncé ». Après un 403, un 429 ou un 503 sur une
 * fiche, plus aucune fiche n'est demandée à cette centrale pendant une heure.
 *
 * **Les logements hors de la règle du propriétaire sont écartés sur le type de
 * leur carte**, avant tout appel de calendrier (`regleTypes.ts`). Un type
 * qu'elle ne connaît pas est gardé, et nommé au journal.
 */

import type { Listing } from "@/lib/listings";
import { annoncer } from "@/lib/stay/occupancy";
import { UA_NAVIGATEUR } from "../../navigateur";
import { aTourDeRole, ECART_HOTE_MS, noterFin } from "../cadence";
import { compter, phrasesRegle, typeInconnu } from "../regleTypes";
import { centraleAutorise } from "../robots.server";
import type { ContexteCentrale } from "../types";
import {
  cartesOrchestra,
  ficheOrchestra,
  horsRegleOrchestra,
  nuitsOrchestra,
  prixOrchestra,
  urlCalendrierOrchestra,
  urlCatalogueOrchestra,
  type CarteOrchestra,
  type FicheOrchestra,
  type OffreOrchestra,
} from "./orchestra";

// L'en-tête d'un navigateur, comme tout le relevé (`navigateur.ts`). Les règles
// de robots.txt se lisent toujours sous `AGENT_CENTRALES` (`../robots.server`).
const UA = UA_NAVIGATEUR;
const TIMEOUT_MS = 30_000;
/** Appels menés de front sur un même hôte. */
const FRONT = 4;
/** Un catalogue de logements bouge en semaines. */
const CATALOGUE_TTL_MS = 6 * 60 * 60 * 1000;
/** Une disponibilité bouge en heures. */
const CALENDRIER_TTL_MS = 3 * 60 * 60 * 1000;
/** La capacité d'un logement ne bouge pas d'une saison à l'autre. */
const FICHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Les fiches se lisent une à une, et pas plus longtemps que cela par recherche. */
const FICHE_BUDGET_MS = 15_000;
/** Une fiche qui ne répond pas dans ce délai est abandonnée. */
const FICHE_TIMEOUT_MS = 8_000;
/** Passé ce temps depuis le début de la recherche, aucune fiche n'est ouverte. */
const FICHES_AVANT_MS = 30_000;
/** Après un refus (403, 429, 503), les fiches de la centrale attendent. */
const FICHE_PAUSE_MS = 60 * 60 * 1000;

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
const fiches = new Map<string, { at: number; valeur: FicheOrchestra }>();
/** L'heure du dernier refus d'une fiche, par centrale. */
const refusFiches = new Map<string, number>();
async function json(url: string, texte = false, delai = TIMEOUT_MS): Promise<unknown> {
  await centraleAutorise(url);
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), delai);
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
    // La fiche qui suit attend une seconde après cette fin (`cadence.ts`).
    noterFin(url);
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

/**
 * Les fiches des logements retenus : en cache d'abord, puis une à une, dans le
 * budget de la recherche et avant `echeance`, heure absolue passé laquelle
 * aucune fiche n'est plus ouverte.
 *
 * Chaque fiche part à son tour (`aTourDeRole`) : une seconde au moins après
 * la requête précédente vers la centrale, y compris le dernier calendrier. Une
 * fiche dont le chemin mène hors de la centrale n'est pas demandée.
 *
 * Un appel qui échoue arrête la lecture pour cette recherche : les fiches
 * suivantes attendront la prochaine, plutôt que d'insister auprès d'un serveur
 * qui vient de refuser. Un 403, un 429 ou un 503 la suspend une heure pour
 * toute la centrale. Les fiches déjà en cache servent quand même.
 */
async function lireFiches(
  base: string,
  cartes: readonly CarteOrchestra[],
  echeance: number,
): Promise<Map<string, FicheOrchestra>> {
  const out = new Map<string, FicheOrchestra>();
  const fin = Math.min(Date.now() + FICHE_BUDGET_MS, echeance);
  const refus = refusFiches.get(base);
  let arret: string | null =
    refus != null && Date.now() - refus < FICHE_PAUSE_MS
      ? "pause d'une heure après un refus"
      : null;
  const origine = new URL(`${base}/`).origin;
  for (const c of cartes) {
    const cle = `${base}|${c.id}`;
    const hit = fiches.get(cle);
    if (hit && Date.now() - hit.at < FICHE_TTL_MS) {
      out.set(c.id, hit.valeur);
      continue;
    }
    if (!c.chemin || arret) continue;
    const url = new URL(c.chemin, `${base}/`);
    if (url.origin !== origine) continue;
    // L'écart d'une seconde se compte dans le budget.
    if (fin - Date.now() < 1_000 + ECART_HOTE_MS) {
      arret = "budget de la recherche épuisé";
      continue;
    }
    try {
      const page = await aTourDeRole(url.toString(), async () => {
        const reste = fin - Date.now();
        return reste < 1_000
          ? null
          : ((await json(url.toString(), true, Math.min(FICHE_TIMEOUT_MS, reste))) as string);
      });
      if (page == null) {
        arret = "budget de la recherche épuisé";
        continue;
      }
      const valeur = ficheOrchestra(page);
      fiches.set(cle, { at: Date.now(), valeur });
      out.set(c.id, valeur);
    } catch (err) {
      const quoi = err instanceof Error ? err.message : String(err);
      if (/répondu (?:403|429|503)\b/.test(quoi)) refusFiches.set(base, Date.now());
      arret = `fiche ${c.id} : ${quoi}`;
    }
  }
  const restent = cartes.filter((c) => !out.has(c.id)).length;
  if (arret || restent > 0) {
    console.info(
      `[centrale] ${base} : ${out.size} fiche(s) lue(s) ou en cache, ${restent} à lire à la prochaine recherche` +
        (arret ? ` — arrêt : ${arret}` : ""),
    );
  }
  return out;
}

/** « N personnes », avec le pluriel qu'il faut. */
function personnes(n: number): string {
  return `${n} personne${n > 1 ? "s" : ""}`;
}

/**
 * Ce que le prix couvre, dans les termes que le calendrier publie.
 *
 * `byHousing` dit que le montant porte sur le logement entier et non par
 * personne, et `nightNb` combien de nuits il couvre. Le calendrier les publie
 * depuis toujours et le connecteur n'en lisait aucun — or sans eux rien ne
 * distingue un total de séjour d'un tarif par tête.
 */
function libellePrix(o: OffreOrchestra): string | null {
  const porte =
    o.parLogement === true
      ? "prix du logement entier"
      : o.parLogement === false
        ? "prix par personne"
        : null;
  const couvre = o.nuits != null ? `${o.nuits} nuit${o.nuits > 1 ? "s" : ""}` : null;
  return [o.categorie, porte, couvre].filter(Boolean).join(" · ") || null;
}

function enListing(
  c: CarteOrchestra,
  o: OffreOrchestra,
  fiche: FicheOrchestra | null,
  base: string,
  r: ReglageOrchestra,
  ctx: ContexteCentrale,
): Listing {
  const nuits = nuitsOrchestra(ctx.checkIn, ctx.checkOut);
  // La capacité rendue était `maxPax`, c'est-à-dire le haut de la bande
  // tarifaire : jusqu'à combien de personnes ce tarif se vend, et non combien
  // le logement en couche. Le libellé de catégorie dit la même bande en toutes
  // lettres — « Logement 1 à 6 personnes » — et le passer au lecteur de texte
  // ferait rentrer le même nombre par la fenêtre. La capacité vient donc de la
  // fiche, qui l'écrit sous le mot « Capacité », et à défaut du nom du logement
  // et de son chemin, qui parlent bien du bien.
  const occ = annoncer(
    { guests: fiche?.capacite ?? null, bedrooms: null, rooms: fiche?.pieces ?? null },
    c.titre,
    c.chemin,
  );
  const bande =
    o.bandeMin != null && o.bandeMax != null
      ? ` — bande tarifaire ${o.bandeMin} à ${personnes(o.bandeMax)}, qui n'est pas la capacité du bien`
      : "";
  return {
    id: `orc-${r.cle}-${c.id}`,
    stationId: ctx.stationId,
    title: c.titre,
    source: "Centrale",
    total: o.total,
    currency: "EUR",
    guests: occ.guests,
    bedrooms: occ.bedrooms,
    rooms: occ.rooms,
    propertyType: c.type,
    available: true,
    photo: c.photo,
    url: c.chemin ? new URL(c.chemin, `${base}/`).toString() : base,
    // Le point et l'adresse du logement viennent du bloc « Localisation » de
    // la fiche ; tant qu'elle n'est pas lue, ils restent vides. L'adresse de
    // l'agence, sur la même fiche, n'est pas lue.
    lat: fiche?.lat ?? null,
    lon: fiche?.lon ?? null,
    locality: fiche?.village ?? null,
    placeName: fiche?.adresse ?? null,
    priceLabel: libellePrix(o),
    // Un prix par personne n'est pas un total de séjour, et ne se compare pas à
    // un total. Le drapeau le dit à l'écran plutôt que de le laisser croire.
    priceIndicative: o.parLogement === false ? true : null,
    platformId: o.codeProduit,
    proven: `${r.nom} (Orchestra, ${r.host}) ${ctx.checkIn}→${ctx.checkOut}, ${nuits} nuit${
      nuits > 1 ? "s" : ""
    }, ${ctx.guests} pers.${o.categorie ? ` — ${o.categorie}` : ""}${bande}`,
  };
}

/**
 * Interroge une centrale Orchestra.
 *
 * Une destination qui échoue n'emporte pas les autres : son motif est noté au
 * journal et la recherche continue. Elle ne lève que si toutes échouent.
 */
export async function chercherOrchestra(ctx: ContexteCentrale, r: ReglageOrchestra): Promise<Listing[]> {
  const t0 = Date.now();
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
  const vus = new Set<string>();
  const ecartes = new Map<string, number>();
  const inconnus = new Map<string, number>();
  for (const l of listes) {
    for (const c of l) {
      if (vus.has(c.id)) continue;
      vus.add(c.id);
      // La règle du propriétaire, avant le calendrier : un logement refusé ne
      // coûte pas d'appel.
      const motif = horsRegleOrchestra(c);
      if (motif) {
        compter(ecartes, motif);
        continue;
      }
      if (c.type && typeInconnu(c.type)) compter(inconnus, c.type.trim());
      par.set(c.id, c);
    }
  }
  const cartes = [...par.values()];
  for (const phrase of phrasesRegle(ecartes, inconnus)) {
    console.info(`[centrale] ${r.host} : ${phrase}`);
  }

  const offres = await parGroupes(cartes, async (c) => {
    try {
      return prixOrchestra(await calendrier(base, c.id, ctx), ctx);
    } catch {
      return null;
    }
  });

  // Seuls les logements qui ont une offre à ces dates ouvrent leur fiche.
  const fichesLues = await lireFiches(
    base,
    cartes.filter((_, i) => offres[i]),
    t0 + FICHES_AVANT_MS,
  );

  const listings: Listing[] = [];
  for (const [i, c] of cartes.entries()) {
    const o = offres[i];
    if (o) listings.push(enListing(c, o, fichesLues.get(c.id) ?? null, base, r, ctx));
  }
  console.info(
    `[centrale] ${r.host} : ${listings.length} offres sur ${cartes.length} au catalogue` +
      ` (dont ${listings.filter((l) => l.total <= 0).length} sans prix publié,` +
      ` ${destinations.length} destination(s)), ${ctx.checkIn}→${ctx.checkOut}`,
  );
  if (refus.length) console.warn(`[centrale] ${r.host} : ${refus.join(" ; ")}`);
  return listings;
}
