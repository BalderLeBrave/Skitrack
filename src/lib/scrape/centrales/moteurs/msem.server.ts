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
import { memoireFiches } from "@/lib/stay/memoireFiches.server";
import { equipements } from "@/lib/stay/equipements";
import { annoncer } from "@/lib/stay/occupancy";
import { UA_NAVIGATEUR } from "../../navigateur";
import { estMessageRefus, porteFermee, poserRefus } from "../../gardeHote";
import { centraleAutorise } from "../robots.server";
import type { ContexteCentrale } from "../types";
import {
  corpsOffresMsem,
  horsLocationMsem,
  joindreMsem,
  urlCatalogueMsem,
  urlOffresMsem,
  type CatalogueMsem,
  type FicheMsem,
  type OffresMsem,
} from "./msem";

// L'en-tête d'un navigateur, comme tout le relevé (`navigateur.ts`). Les règles
// de robots.txt se lisent toujours sous `AGENT_CENTRALES` (`../robots.server`).
const UA = UA_NAVIGATEUR;
const TIMEOUT_MS = 30_000;
/** Le catalogue vieillit en heures, pas en minutes. */
const CATALOGUE_TTL_MS = 6 * 60 * 60 * 1000;
/** Au moins une seconde entre deux requêtes vers `services.msem.tech`. */
const ECART_MS = 2_000;

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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
async function json(url: string, corps?: Record<string, unknown>, delaiMs = TIMEOUT_MS): Promise<unknown> {
  const ferme = porteFermee(url);
  if (ferme) throw new Error(ferme);
  await centraleAutorise(url);
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), delaiMs);
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
      poserRefus(url, r.status, r.headers);
      throw new Error(`la centrale a répondu ${r.status}`);
    }
    return await r.json();
  } finally {
    clearTimeout(minuteur);
  }
}

/** Le catalogue, et s'il vient d'être demandé à la centrale (et non du cache). */
async function catalogue(r: ReglageMsem): Promise<{ valeur: CatalogueMsem; reseau: boolean }> {
  const cle = `${r.resort}|${r.canal}`;
  const hit = catalogues.get(cle);
  if (hit && Date.now() - hit.at < CATALOGUE_TTL_MS) return { valeur: hit.valeur, reseau: false };
  const valeur = (await json(urlCatalogueMsem(MSEM_BASE, r.resort, r.canal))) as CatalogueMsem;
  catalogues.set(cle, { at: Date.now(), valeur });
  return { valeur, reseau: true };
}

function enListing(f: FicheMsem, r: ReglageMsem, ctx: ContexteCentrale): Listing {
  // La barre finale est écrite d'emblée : sans elle les quatre centrales
  // répondent 308 vers la même adresse barrée. Un aller-retour par visiteur
  // pour un caractère.
  const chemin = r.ficheChemin ?? "/hebergements/{slug}/";
  const base = (r.siteBase ?? ctx.base).replace(/\/+$/, "");
  // `nbRooms` compte des **pièces**. Elles étaient converties en chambres au
  // relevé (`bedroomsFromRooms`), si bien qu'un trois-pièces s'affichait
  // « 2 ch. » sans que la centrale l'ait jamais écrit. Elles se posent
  // désormais dans `rooms` ; la conversion appartient au filtre, qui compare.
  // Les chambres restent vides : aucune clé du catalogue ne les compte (les
  // dix catalogues, relevé du 25 septembre 2026). Le titre peut encore les
  // dire, et `annoncer` le lit.
  const occ = annoncer({ capacity: f.capacite, bedrooms: null, rooms: f.pieces }, f.titre);
  return {
    id: `msem-${r.cle}-${f.id}`,
    stationId: ctx.stationId,
    title: f.titre,
    source: "Centrale",
    total: f.total,
    currency: "EUR",
    capacity: occ.capacity,
    bedrooms: occ.bedrooms,
    rooms: occ.rooms,
    capacityStandard: occ.capacityStandard,
    capacitySource: occ.capacitySource,
    bedroomsSource: occ.bedroomsSource,
    isStudio: occ.isStudio,
    available: true,
    photo: f.photo,
    photos: f.photos.length ? f.photos : null,
    url: f.slug && chemin ? `${base}${chemin.replace("{slug}", f.slug)}` : base,
    lat: f.lat,
    lon: f.lon,
    locality: f.commune,
    placeName: f.adresse,
    ...(f.description ? { description: f.description } : {}),
    ...(f.equipements ? { amenities: equipements(f.equipements) } : {}),
    proven: `${r.nom} (MSEM, ${r.host}) ${ctx.checkIn}→${ctx.checkOut}, ${ctx.guests} pers.${
      f.pieces != null ? ` — ${f.pieces} pièce${f.pieces > 1 ? "s" : ""} annoncée${f.pieces > 1 ? "s" : ""}` : ""
    }${
      // Le prix public est publié à côté du prix vendu. Il est rendu sous son
      // nom à elle : l'appeler « avant remise » serait une déduction, et la
      // centrale n'écrit nulle part que l'un descend de l'autre.
      f.prixPublic != null ? ` — prix public publié : ${f.prixPublic.toLocaleString("fr-FR")} €` : ""
    }${f.capaciteVendue ? ` — capacité : le plus grand groupe vendu, ${f.capacite} pers.` : ""}`,
  };
}

/** Le plus grand groupe qu'on demande aux offres : au-delà, la capacité reste inconnue. */
const GROUPE_MAX = 30;
/**
 * Le temps qu'une montée en tâche de fond se donne. Les offres répondent
 * parfois en près de quarante secondes (Flaine, 2 octobre 2026) : la montée
 * ne peut pas tenir dans la recherche, qui ne l'attend donc pas.
 */
const BUDGET_CAPACITES_MS = 6 * 60_000;
/** Le délai d'une requête d'offres de la montée. */
const DELAI_MONTEE_MS = 75_000;
/** Par station et logement : le plus grand groupe vendu, et si la montée s'est arrêtée sur un refus (`fini`). */
const vendus = new Map<string, { at: number; groupe: number; fini: boolean }>();
/** Les stations dont une montée court : une seule à la fois par station. */
const montees = new Set<string>();

/** La clé d'un logement dans la mémoire des fiches : la sienne, écrite par la seule montée. */
function cleMemoireMsem(r: ReglageMsem, id: string): string {
  return `MSEM:${r.resort}:${id}`;
}

/**
 * La capacité que la centrale vend, pour les logements dont ni le catalogue
 * (`maxCapacity` à 0) ni le titre ne disent la capacité : les studios de
 * Flaine, par exemple (2 octobre 2026). Rend ce qui est déjà su (montée finie
 * dans le processus, ou mémoire des fiches de moins de trente jours), et lance
 * pour le reste une montée en tâche de fond : les offres se demandent pour un
 * groupe ; on monte d'une personne à la fois, une seconde entre deux appels,
 * tant qu'un de ces logements est encore vendu. Le dernier groupe vendu est sa
 * capacité. Un logement encore vendu quand le temps ou `GROUPE_MAX` arrête la
 * montée ne reçoit rien : la montée suivante reprend à ce groupe.
 */
function capacitesVendues(r: ReglageMsem, ctx: ContexteCentrale, ids: readonly string[]): Map<string, number> {
  const out = new Map<string, number>();
  const cle = (id: string) => `${r.resort}|${r.canal}|${id}`;
  const depart = Math.max(1, Math.trunc(ctx.guests));
  const groupe = new Map<string, number>();
  let memoire: ReturnType<typeof memoireFiches> | null = null;
  try {
    memoire = memoireFiches();
  } catch {
    memoire = null;
  }
  for (const id of ids) {
    const h = vendus.get(cle(id));
    if (h && Date.now() - h.at < CATALOGUE_TTL_MS) {
      if (h.fini) out.set(id, h.groupe);
      else groupe.set(id, Math.max(h.groupe, depart));
      continue;
    }
    const m = memoire?.lire(cleMemoireMsem(r, id));
    if (m?.capacity != null && m.capacitySource === "structured") out.set(id, m.capacity);
    else groupe.set(id, depart);
  }
  const station = `${r.resort}|${r.canal}`;
  if (groupe.size > 0 && !montees.has(station)) {
    montees.add(station);
    void monter(r, ctx, groupe, cle)
      .catch(() => undefined)
      .finally(() => montees.delete(station));
  }
  return out;
}

async function monter(
  r: ReglageMsem,
  ctx: ContexteCentrale,
  groupe: Map<string, number>,
  cle: (id: string) => string,
): Promise<void> {
  const fin = Date.now() + BUDGET_CAPACITES_MS;
  const notes: Array<{ cle: string; capacity: number; capacitySource: "structured" }> = [];
  let restants = [...groupe.keys()];
  while (restants.length > 0 && Date.now() < fin) {
    const g = Math.min(...restants.map((id) => groupe.get(id) ?? 1)) + 1;
    if (g > GROUPE_MAX) break;
    // Personne n'attend : la requête a 75 s (les offres en ont pris près de
    // quarante à Flaine le 2 octobre 2026), et un échec se retente une fois,
    // dix secondes plus tard.
    let offres: OffresMsem | null = null;
    for (let essai = 0; essai < 2 && offres == null; essai++) {
      await pause(essai === 0 ? ECART_MS : 10_000);
      try {
        offres = (await json(
          urlOffresMsem(MSEM_BASE, r.resort),
          corpsOffresMsem(r.canal, { ...ctx, guests: g }),
          DELAI_MONTEE_MS,
        )) as OffresMsem;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (estMessageRefus(msg)) break;
        offres = null;
      }
    }
    if (offres == null) break;
    const encore: string[] = [];
    for (const id of restants) {
      const avant = groupe.get(id) ?? 1;
      if (avant >= g) {
        encore.push(id);
      } else if (offres?.[id] != null) {
        groupe.set(id, g);
        encore.push(id);
      } else {
        vendus.set(cle(id), { at: Date.now(), groupe: avant, fini: true });
        notes.push({ cle: cleMemoireMsem(r, id), capacity: avant, capacitySource: "structured" });
      }
    }
    restants = encore;
  }
  for (const id of restants) vendus.set(cle(id), { at: Date.now(), groupe: groupe.get(id) ?? 1, fini: false });
  if (notes.length > 0) {
    try {
      memoireFiches().noter(notes);
    } catch {
      /* mémoire refusée : la montée du processus reste */
    }
  }
  console.info(
    `[centrale] ${r.host} : capacité vendue trouvée en tâche de fond pour ${notes.length}/${groupe.size} hébergement(s)`,
  );
}

/**
 * Interroge une centrale MSEM.
 *
 * Lève quand un des deux appels échoue : `run.server.ts` en fait un rapport de
 * source en échec, et l'écran dit pourquoi. Une réponse d'offres vide ne lève
 * pas — c'est un renseignement, pas une panne : la centrale existe, elle n'a
 * rien à vendre à ces dates-là pour ce groupe.
 *
 * Le catalogue d'abord, les offres ensuite : les deux vont au même hôte, et
 * partaient de front. Quand le catalogue vient d'être demandé à la centrale,
 * les offres attendent une seconde ; servi par le cache, il ne fait rien
 * attendre.
 */
export async function chercherMsem(ctx: ContexteCentrale, r: ReglageMsem): Promise<Listing[]> {
  const { valeur: cat, reseau } = await catalogue(r);
  if (reseau) await pause(ECART_MS);
  const offres = (await json(
    urlOffresMsem(MSEM_BASE, r.resort),
    corpsOffresMsem(r.canal, ctx),
  )) as OffresMsem;
  const fiches = joindreMsem(cat, offres);
  // Sans capacité au catalogue ni dans le titre : celle que la centrale vend.
  // Pas pour une résidence : elle vend sous un seul prix plusieurs types de
  // logement (« 2 pièces 4 personnes » à « 5 pièces 10 personnes », Odalys
  // l'Éclose), et son plus grand groupe vendu n'est pas celui du prix affiché.
  const sansCapacite = fiches.filter(
    (f) =>
      f.capacite == null &&
      f.kind !== "RESIDENCE" &&
      annoncer({ capacity: null, bedrooms: null }, f.titre).capacity == null,
  );
  if (sansCapacite.length > 0) {
    const vendues = capacitesVendues(r, ctx, sansCapacite.map((f) => f.id));
    for (const f of sansCapacite) {
      const cap = vendues.get(f.id);
      if (cap != null) {
        f.capacite = cap;
        f.capaciteVendue = true;
      }
    }
    console.info(
      `[centrale] ${r.host} : capacité vendue connue pour ${vendues.size}/${sansCapacite.length} hébergement(s) sans capacité publiée, le reste en tâche de fond`,
    );
  }
  const auCatalogue = cat.accomodations?.length ?? 0;
  const ecartees = Object.entries(horsLocationMsem(cat, offres));
  console.info(
    `[centrale] ${r.host} : ${fiches.length} offres sur ${auCatalogue} au catalogue` +
      ` (dont ${fiches.filter((f) => f.total <= 0).length} sans prix publié), ${ctx.checkIn}→${ctx.checkOut}` +
      (ecartees.length
        ? ` ; hors location, écartées : ${ecartees.map(([k, n]) => `${k} ${n}`).join(", ")}`
        : ""),
  );
  return fiches.map((f) => enListing(f, r, ctx));
}
