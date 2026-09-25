/**
 * Le moteur Deskline / Feratel, partie réseau.
 *
 * On crée une recherche, puis on en lit les résultats page par page. La
 * recherche n'existe pas sans dates — le service refuse de la créer —, ce qui
 * fait que ces prix sont datés par construction.
 *
 * **Une grande page plutôt que des pages suivantes.** Le service annonce son
 * compte (`paging.totalRecordCount`) mais ne tourne pas les pages : la page 1
 * rend la page 0 (relevé du 25 septembre 2026). On demande donc deux cents
 * résultats d'un coup. Les pages suivantes restent demandées tant qu'une page
 * est pleine et apporte du neuf, au cas où le service se mettrait à les
 * tourner ; un relevé plus court que le compte annoncé se journalise.
 *
 * **`robots.txt` est lu avant chaque appel, et n'arrête jamais.** Celui de la
 * passerelle répond 404. La lecture reste faite pour journaliser le jour où
 * elle publie des règles.
 *
 * **Un `204 No Content` n'est pas une panne.** C'est la réponse quand rien
 * n'est libre à ces dates pour ce groupe, et elle se lit comme une liste vide.
 * Vu à La Clusaz sur trois nuits : la station ne vend pas court en février.
 *
 * **La capacité vient du détail des services, un hébergement à la fois.** La
 * liste porte pièces, chambres et position, pas la capacité. Le détail ne
 * dépend pas des dates pour ce qu'on y lit : il est gardé trente jours par
 * hébergement, chaque produit à sa date. Chaque recherche lui donne quinze
 * secondes au plus, un détail à la fois, chacun une seconde au moins après la
 * requête précédente vers la passerelle, dernière page de résultats comprise
 * (`cadence.ts`) ; ce qui n'a pas été lu attend la recherche suivante. Un
 * refus (403, 429, 503) arrête ces détails vers la centrale jusqu'au
 * redémarrage du serveur, sans reprise ; une autre panne, ceux de la
 * recherche. Les annonces partent quand même, sans capacité.
 */

import type { Listing } from "@/lib/listings";
import { annoncer } from "@/lib/stay/occupancy";
import { UA_NAVIGATEUR } from "../../navigateur";
import { aTourDeRole, noterFin } from "../cadence";
import { compter, phrasesRegle } from "../regleTypes";
import { centraleAutorise } from "../robots.server";
import type { ContexteCentrale } from "../types";
import {
  capacitesFeratel,
  capacitesFraiches,
  categoriesInconnuesFeratel,
  compteFeratel,
  corpsRechercheFeratel,
  FERATEL_PAR_PAGE,
  horsRegleFeratel,
  lireFeratel,
  sessionFeratel,
  typeFeratel,
  urlRechercheFeratel,
  urlResultatsFeratel,
  urlServicesFeratel,
  verserCapacites,
  type CapaciteDatee,
  type CapaciteFeratel,
  type FicheFeratel,
  type ReponseFeratel,
  type ReponseServicesFeratel,
} from "./feratel";

// L'en-tête d'un navigateur, comme tout le relevé (`navigateur.ts`). Les règles
// de robots.txt se lisent toujours sous `AGENT_CENTRALES` (`../robots.server`).
const UA = UA_NAVIGATEUR;
const TIMEOUT_MS = 30_000;
/**
 * Pages demandées au plus, borne de sécurité explicite.
 *
 * Vingt pages de deux cents font quatre mille hébergements, très au-delà de
 * la plus grosse centrale du parc. Atteindre cette borne se journalise : un
 * relevé tronqué ne doit jamais l'être en silence.
 */
const PAGES_MAX = 20;
/** Une pause entre deux pages. Le service n'en demande pas ; on se la donne. */
const PAUSE_PAGE_MS = 400;
/** L'occupation d'un produit ne dépend pas des dates : gardée trente jours. */
const CAPACITE_TTL_MS = 30 * 24 * 3600 * 1000;
/** Temps donné aux détails par recherche ; le reste attend la suivante. */
const CAPACITE_BUDGET_MS = 15_000;
/** Délai d'un détail : plus court que celui d'une page, pour tenir le budget. */
const CAPACITE_TIMEOUT_MS = 10_000;

/**
 * Occupations déjà lues, par centrale et hébergement : l'heure du dernier
 * détail lu, et chaque produit avec la sienne (`verserCapacites`).
 */
const capacitesLues = new Map<string, { lueA: number; produits: Map<string, CapaciteDatee> }>();
/**
 * Centrales qui ont refusé un détail (403, 429, 503) : plus aucun détail ne
 * leur est demandé jusqu'au redémarrage. La recherche, elle, continue.
 */
const capacitesRefusees = new Set<string>();

/** Une réponse hors 2xx, avec son statut, pour distinguer un refus d'une panne. */
class ErreurStatut extends Error {
  statut: number;
  constructor(statut: number) {
    super(`la centrale a répondu ${statut}`);
    this.statut = statut;
  }
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const FERATEL_API = "https://webapi.deskline.net";

/**
 * Les deux en-têtes sans lesquels la passerelle ne répond à rien.
 *
 * Elle les réclame l'un après l'autre : sans le premier elle rend 400 « Must
 * provide value for header DW-Source », et une fois celui-là fourni, 400 pour
 * le second. Il faut donc les deux, `/robots.txt` compris.
 *
 * `dw-source` est une constante écrite en clair dans le paquet public du
 * composant ; `dw-sessionid` est un identifiant de corrélation que le client
 * fabrique lui-même. Ni l'un ni l'autre n'ouvre quoi que ce soit : ils
 * s'envoient comme un `content-type`, parce que le service ne parle pas sans.
 */
function entetesPasserelle(session: string): Record<string, string> {
  return { "dw-source": "desklineweb", "dw-sessionid": session };
}

export type ReglageFeratel = {
  host: string;
  nom: string;
  /** Jeton court et stable, qui entre dans l'identifiant des annonces. */
  cle: string;
  /**
   * Clé de la centrale chez Feratel, celle qui entre dans le chemin des
   * résultats. Elle se lit dans la configuration que le composant imprime en
   * clair sur la page de la centrale, sous `organizationCode`.
   */
  organisation: string;
  /** Chemin de la page de réservation, où mènent les liens des annonces. */
  chemin: string;
};

async function json(
  url: string,
  session: string,
  corps?: Record<string, unknown>,
  delaiMs = TIMEOUT_MS,
): Promise<{ statut: number; valeur: unknown }> {
  // La passerelle ne sert même pas son `robots.txt` sans ces en-têtes : sans
  // eux elle rend 400. On les envoie pour lire le fichier, pas pour s'arrêter.
  await centraleAutorise(url, entetesPasserelle(session));
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
        ...entetesPasserelle(session),
        ...(corps ? { "content-type": "application/json" } : {}),
      },
      ...(corps ? { body: JSON.stringify(corps) } : {}),
    });
    if (r.status === 204) {
      await r.body?.cancel();
      return { statut: 204, valeur: null };
    }
    if (!r.ok) {
      await r.body?.cancel();
      throw new ErreurStatut(r.status);
    }
    return { statut: r.status, valeur: await r.json() };
  } finally {
    clearTimeout(minuteur);
    // Le détail qui suit attend une seconde après cette fin (`cadence.ts`).
    noterFin(url);
  }
}

/**
 * L'occupation des produits, hébergement par hébergement, dans le budget de la
 * recherche.
 *
 * Ce qui est en mémoire depuis moins de trente jours ne se redemande pas, sauf
 * si le produit vendu aujourd'hui n'y est pas, ou plus : le détail d'une
 * recherche ne liste que les produits qu'elle vend (autre groupe, autres
 * dates), et chaque produit vieillit à sa propre date. Les hébergements jamais
 * lus passent d'abord, ceux-là ensuite, pour qu'un produit introuvable n'use
 * pas le budget de toutes les recherches. Chaque détail part à son tour
 * (`aTourDeRole`). Un refus (403, 429, 503) arrête ces détails vers la
 * centrale jusqu'au redémarrage ; toute autre panne, ceux de cette recherche.
 * Aucune reprise.
 */
async function lireCapacites(
  r: ReglageFeratel,
  recherche: string,
  session: string,
  fiches: readonly FicheFeratel[],
): Promise<{
  lues: Map<string, Map<string, CapaciteFeratel>>;
  demandes: number;
  enMemoire: number;
  arret: string | null;
}> {
  const lues = new Map<string, Map<string, CapaciteFeratel>>();
  const jamaisLues: FicheFeratel[] = [];
  const produitAbsent: FicheFeratel[] = [];
  let enMemoire = 0;
  for (const f of fiches) {
    const garde = capacitesLues.get(`${r.organisation}|${f.id}`);
    const maintenant = Date.now();
    if (!garde || maintenant - garde.lueA >= CAPACITE_TTL_MS) {
      jamaisLues.push(f);
      continue;
    }
    const fraiches = capacitesFraiches(garde.produits, maintenant, CAPACITE_TTL_MS);
    lues.set(f.id, fraiches);
    if (f.produitId && !fraiches.has(f.produitId)) produitAbsent.push(f);
    else enMemoire += 1;
  }
  const debut = Date.now();
  let demandes = 0;
  let arret: string | null = null;
  for (const f of [...jamaisLues, ...produitAbsent]) {
    if (!f.base) continue;
    if (capacitesRefusees.has(r.organisation)) {
      arret = "la centrale a refusé un détail plus tôt, aucun n'est redemandé";
      break;
    }
    if (Date.now() - debut > CAPACITE_BUDGET_MS) {
      arret = `budget de ${CAPACITE_BUDGET_MS / 1000} s atteint`;
      break;
    }
    demandes += 1;
    const cle = `${r.organisation}|${f.id}`;
    const url = urlServicesFeratel(FERATEL_API, r.organisation, f.base, f.id, recherche);
    try {
      const res = await aTourDeRole(url, async () => {
        // Une autre recherche a pu essuyer un refus pendant l'attente.
        if (capacitesRefusees.has(r.organisation)) {
          throw new Error("la centrale a refusé un détail plus tôt, aucun n'est redemandé");
        }
        return json(url, session, undefined, CAPACITE_TIMEOUT_MS);
      });
      // Ce qui était déjà su des autres produits reste, avec sa date ; le neuf
      // s'y ajoute à la date du jour.
      const maintenant = Date.now();
      const produits = verserCapacites(
        capacitesLues.get(cle)?.produits,
        capacitesFeratel(res.valeur as ReponseServicesFeratel),
        maintenant,
        CAPACITE_TTL_MS,
      );
      capacitesLues.set(cle, { lueA: maintenant, produits });
      lues.set(f.id, produits);
    } catch (e) {
      if (e instanceof ErreurStatut && (e.statut === 403 || e.statut === 429 || e.statut === 503)) {
        capacitesRefusees.add(r.organisation);
        arret = `refus ${e.statut}, plus aucun détail demandé à cette centrale`;
      } else {
        arret = e instanceof Error ? e.message : String(e);
      }
      break;
    }
  }
  return { lues, demandes, enMemoire, arret };
}

function enListing(
  f: FicheFeratel,
  r: ReglageFeratel,
  ctx: ContexteCentrale,
  cap: CapaciteFeratel | undefined,
): Listing {
  const base = ctx.base.replace(/\/+$/, "");
  // Les champs d'abord : la capacité du produit vendu (`maxAdults` du détail),
  // les pièces et chambres de son service. Puis le nom du logement, du service
  // et du produit, qui porte parfois « 8 personnes » quand le détail n'a pas
  // encore été lu.
  const occ = annoncer(
    { guests: cap?.adultes ?? null, bedrooms: f.chambres, rooms: f.pieces },
    f.titre,
    f.service,
    f.produit,
  );
  return {
    id: `dw-${r.cle}-${f.id}`,
    stationId: ctx.stationId,
    title: f.titre,
    source: "Centrale",
    total: f.total,
    currency: "EUR",
    guests: occ.guests,
    bedrooms: occ.bedrooms,
    rooms: occ.rooms,
    available: true,
    photo: f.photo,
    photos: f.photos.length ? f.photos : null,
    // Ses catégories, telles que publiées : « Appartement dans chalet »,
    // « Chalet individuel », « Studio »…
    propertyType: typeFeratel(f.categories),
    // L'identifiant de l'annonce est celui de l'hébergement ; celui du produit
    // désigne ce qui est réellement vendu, et ce n'est pas le même.
    platformId: f.produitId,
    // Le service ne donne pas d'adresse par hébergement. Le lien mène donc à la
    // page de réservation de la centrale, qui est juste, plutôt qu'à une fiche
    // fabriquée, qui ne le serait pas.
    url: `${base}${r.chemin}`,
    lat: f.lat,
    lon: f.lon,
    // La commune et le quartier publiés (« La Clusaz », « Vallée des
    // Confins ») : les seuls repères des logements sans coordonnées.
    locality: f.commune,
    placeName: f.quartier,
    proven: `${r.nom} (Deskline / Feratel, ${r.host}) ${ctx.checkIn}→${ctx.checkOut}, ${ctx.guests} pers.${
      f.service ? ` — ${f.service}` : ""
    }${f.produit && f.produit !== f.titre ? ` — produit vendu : ${f.produit}` : ""}`,
  };
}

/**
 * Toutes les pages de résultats, et non la première seule.
 *
 * Le connecteur s'arrêtait à la page zéro, soixante par page : le relevé de La
 * Clusaz du 13 septembre 2026 comptait exactement soixante hébergements, et ce
 * nombre rond était le plafond, pas un inventaire.
 *
 * **La page 1 rend la page 0.** Relevé du 25 septembre 2026 : 183 résultats
 * annoncés, quatre pages de soixante, et trois fois les mêmes soixante
 * hébergements (`pageNo=1`, `page=1`, lien `links.next`). La page est donc de
 * deux cents (`FERATEL_PAR_PAGE`), et la règle d'arrêt reste celle qui ne
 * suppose rien : une page incomplète est la dernière, une page sans rien de
 * neuf aussi. Le compte annoncé, lu sur la première page, dit si le relevé est
 * complet. S'y ajoutent une borne explicite, un dédoublonnage par identifiant,
 * et une pause entre deux pages.
 */
async function toutesLesPages(
  r: ReglageFeratel,
  recherche: string,
  session: string,
): Promise<{ fiches: FicheFeratel[]; pages: number; tronque: boolean; annonce: number | null }> {
  const vues = new Set<string>();
  const fiches: FicheFeratel[] = [];
  let pages = 0;
  let annonce: number | null = null;
  for (let page = 0; page < PAGES_MAX; page += 1) {
    if (page > 0) await pause(PAUSE_PAGE_MS);
    const res = await json(urlResultatsFeratel(FERATEL_API, r.organisation, recherche, page), session);
    pages += 1;
    if (res.statut === 204) return { fiches, pages, tronque: false, annonce };
    const reponse = res.valeur as ReponseFeratel;
    annonce ??= compteFeratel(reponse);
    let neufs = 0;
    for (const f of lireFeratel(reponse)) {
      if (vues.has(f.id)) continue;
      vues.add(f.id);
      fiches.push(f);
      neufs += 1;
    }
    const brutes = reponse?.data?.length ?? 0;
    // Une page incomplète est la dernière ; une page qui ne rapporte rien de
    // neuf l'est aussi, et cette seconde règle protège le service : il ignore
    // `pageNo` et rendrait vingt fois la même page.
    if (brutes < FERATEL_PAR_PAGE || neufs === 0) return { fiches, pages, tronque: false, annonce };
  }
  return { fiches, pages, tronque: true, annonce };
}

/**
 * Interroge une centrale Deskline / Feratel.
 *
 * Lève quand la recherche ne peut pas être créée ou que les résultats
 * échouent. Une réponse `204` rend une liste vide sans lever : la centrale a
 * répondu, elle n'a rien à ces dates.
 */
export async function chercherFeratel(ctx: ContexteCentrale, r: ReglageFeratel): Promise<Listing[]> {
  const session = sessionFeratel(Date.now());
  const creation = await json(urlRechercheFeratel(FERATEL_API), session, corpsRechercheFeratel(ctx));
  const recherche = (creation.valeur as { id?: unknown } | null)?.id;
  if (typeof recherche !== "string" || !recherche) {
    throw new Error("la centrale n'a pas ouvert de recherche");
  }
  const { fiches: toutes, pages, tronque, annonce } = await toutesLesPages(r, recherche, session);
  if (annonce != null && toutes.length < annonce) {
    console.warn(
      `[centrale] ${r.host} : ${toutes.length} hébergements lus sur ${annonce} annoncés par le service, ${ctx.checkIn}→${ctx.checkOut}`,
    );
  }
  // Règle du propriétaire (`regleTypes.ts`) : la catégorie publiée tranche, et
  // le nom de l'hébergement pour le seul camping ; jamais le nom du service.
  // Une catégorie que la règle ne connaît pas est gardée, et nommée.
  const ecartes = new Map<string, number>();
  const inconnus = new Map<string, number>();
  const fiches = toutes.filter((f) => {
    const motif = horsRegleFeratel(f);
    if (motif) compter(ecartes, motif);
    else for (const c of categoriesInconnuesFeratel(f.categories)) compter(inconnus, c);
    return !motif;
  });
  for (const phrase of phrasesRegle(ecartes, inconnus)) {
    console.info(`[centrale] ${r.host} : ${phrase}`);
  }
  if (fiches.length === 0) {
    console.info(`[centrale] ${r.host} : rien de libre, ${ctx.checkIn}→${ctx.checkOut}`);
    return [];
  }
  console.info(
    `[centrale] ${r.host} : ${fiches.length} hébergements sur ${pages} page(s)` +
      ` (dont ${fiches.filter((f) => f.total <= 0).length} sans prix publié), ${ctx.checkIn}→${ctx.checkOut}`,
  );
  if (tronque) {
    console.warn(`[centrale] ${r.host} : relevé arrêté à la borne de ${PAGES_MAX} pages, il en reste peut-être.`);
  }
  const { lues, demandes, enMemoire, arret } = await lireCapacites(r, recherche, session, fiches);
  // L'occupation du produit vendu, celui dont le prix est montré.
  const capaciteDe = (f: FicheFeratel) =>
    f.produitId ? lues.get(f.id)?.get(f.produitId) : undefined;
  console.info(
    `[centrale] ${r.host} : capacité lue pour ${fiches.filter((f) => capaciteDe(f)?.adultes != null).length}/${fiches.length}` +
      ` hébergements (${enMemoire} en mémoire, ${demandes} détail(s) demandé(s))${arret ? `, arrêté : ${arret}` : ""}`,
  );
  return fiches.map((f) => enListing(f, r, ctx, capaciteDe(f)));
}
