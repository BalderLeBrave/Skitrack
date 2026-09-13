/**
 * Le moteur MSEM, partie réseau.
 *
 * L'analyse et la jointure vivent dans `msem.ts`, qui ne touche pas au réseau.
 * Ici, deux appels et un compte rendu.
 *
 * **Le catalogue est retenu, les prix jamais.** Le catalogue ne dépend ni des
 * dates ni du groupe : c'est la liste des hébergements de la station, et elle
 * bouge de temps en temps, pas d'une recherche à l'autre. Le redemander à
 * chaque fois coûterait trois cents kilo-octets pour rien. Les offres, elles,
 * sont la réponse à une question datée : les mettre en cache serait afficher le
 * prix d'hier pour les dates de demain.
 *
 * **`robots.txt` est lu pour les deux appels, et n'arrête jamais.** Celui d'un
 * `POST` n'a guère de sens dans la spécification, qui parle de récupération
 * d'URL ; il est lu quand même. Relevé du 13 septembre 2026 :
 * `services.msem.tech` n'a pas de `robots.txt`.
 */

import type { Listing } from "@/lib/listings";
import { annoncer, bedroomsFromRooms } from "@/lib/stay/occupancy";
import { AGENT_CENTRALES } from "../robots";
import { centraleAutorise } from "../robots.server";
import type { ContexteCentrale } from "../types";
import {
  corpsOffresMsem,
  joindreMsem,
  urlCatalogueMsem,
  urlOffresMsem,
  type CatalogueMsem,
  type FicheMsem,
  type OffresMsem,
} from "./msem";

const UA = `${AGENT_CENTRALES}/1.0 (+https://skitrack.local/robots)`;
const TIMEOUT_MS = 30_000;
/** Le catalogue vieillit en heures, pas en minutes. */
const CATALOGUE_TTL_MS = 6 * 60 * 60 * 1000;

const MSEM_BASE = "https://services.msem.tech";

export type ReglageMsem = {
  /** Hôte de la centrale, tel que le registre l'écrit. */
  host: string;
  nom: string;
  /** Jeton court et stable, qui entre dans l'identifiant des annonces. */
  cle: string;
  /** Identifiant de station chez MSEM. */
  resort: number | string;
  /** Canal de vente. C'est lui qui choisit la grille tarifaire. */
  canal: string;
  /**
   * Chemin d'une fiche sur le site de la centrale, `{slug}` à remplacer.
   *
   * La chaîne vide dit qu'il n'y a pas de page par logement : le lien rendu
   * mène alors à la centrale elle-même. C'est le cas de Montclar, dont le site
   * est un WordPress aux adresses propres, sans rapport avec les slugs de MSEM.
   * Un lien vers la bonne centrale vaut mieux qu'un lien vers une erreur 404.
   */
  ficheChemin?: string;
  /**
   * Site où vivent les fiches, quand ce n'est pas celui du registre.
   *
   * Villard-de-Lans en a besoin : le registre connaît le site de l'office de
   * tourisme, qui porte bien la configuration du moteur mais rend 404 sur
   * `/hebergements/<slug>`. Les fiches vivent sur son sous-domaine de
   * réservation. Sans ce réglage, chaque lien de la liste mènerait à une page
   * d'erreur, ce qui est pire que pas de lien du tout.
   */
  siteBase?: string;
};

const catalogues = new Map<string, { at: number; valeur: CatalogueMsem }>();
async function json(url: string, corps?: Record<string, unknown>): Promise<unknown> {
  await centraleAutorise(url);
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: corps ? "POST" : "GET",
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent": UA,
        accept: "application/json",
        "accept-language": "fr-FR,fr;q=0.9",
        ...(corps ? { "content-type": "application/json" } : {}),
      },
      ...(corps ? { body: JSON.stringify(corps) } : {}),
    });
    if (!r.ok) {
      await r.body?.cancel();
      throw new Error(`la centrale a répondu ${r.status}`);
    }
    return await r.json();
  } finally {
    clearTimeout(minuteur);
  }
}

async function catalogue(r: ReglageMsem): Promise<CatalogueMsem> {
  const cle = `${r.resort}|${r.canal}`;
  const hit = catalogues.get(cle);
  if (hit && Date.now() - hit.at < CATALOGUE_TTL_MS) return hit.valeur;
  const valeur = (await json(urlCatalogueMsem(MSEM_BASE, r.resort, r.canal))) as CatalogueMsem;
  catalogues.set(cle, { at: Date.now(), valeur });
  return valeur;
}

function enListing(f: FicheMsem, r: ReglageMsem, ctx: ContexteCentrale): Listing {
  // La barre finale est écrite d'emblée : sans elle les quatre centrales
  // répondent 308 vers la même adresse barrée. Un aller-retour par visiteur
  // pour un caractère.
  const chemin = r.ficheChemin ?? "/hebergements/{slug}/";
  const base = (r.siteBase ?? ctx.base).replace(/\/+$/, "");
  const occ = annoncer(
    { guests: f.capacite, bedrooms: bedroomsFromRooms(f.pieces) },
    f.titre,
  );
  return {
    id: `msem-${r.cle}-${f.id}`,
    stationId: ctx.stationId,
    title: f.titre,
    source: "Centrale",
    total: f.total,
    currency: "EUR",
    guests: occ.guests,
    bedrooms: occ.bedrooms,
    available: true,
    photo: f.photo,
    url: f.slug && chemin ? `${base}${chemin.replace("{slug}", f.slug)}` : base,
    lat: f.lat,
    lon: f.lon,
    locality: f.commune,
    placeName: f.adresse,
    proven: `${r.nom} (MSEM, ${r.host}) ${ctx.checkIn}→${ctx.checkOut}, ${ctx.guests} pers.${
      f.pieces != null ? ` — ${f.pieces} pièce${f.pieces > 1 ? "s" : ""} annoncée${f.pieces > 1 ? "s" : ""}` : ""
    }`,
  };
}

/**
 * Interroge une centrale MSEM.
 *
 * Lève quand un des deux appels échoue : `run.server.ts` en fait un rapport de
 * source en échec, et l'écran dit pourquoi. Une réponse d'offres vide ne lève
 * pas — c'est un renseignement, pas une panne : la centrale existe, elle n'a
 * rien à vendre à ces dates-là pour ce groupe.
 */
export async function chercherMsem(ctx: ContexteCentrale, r: ReglageMsem): Promise<Listing[]> {
  const [cat, offres] = await Promise.all([
    catalogue(r),
    json(urlOffresMsem(MSEM_BASE, r.resort), corpsOffresMsem(r.canal, ctx)) as Promise<OffresMsem>,
  ]);
  const fiches = joindreMsem(cat, offres);
  const auCatalogue = cat.accomodations?.length ?? 0;
  console.info(
    `[centrale] ${r.host} : ${fiches.length} vendables sur ${auCatalogue} au catalogue, ${ctx.checkIn}→${ctx.checkOut}`,
  );
  return fiches.map((f) => enListing(f, r, ctx));
}
