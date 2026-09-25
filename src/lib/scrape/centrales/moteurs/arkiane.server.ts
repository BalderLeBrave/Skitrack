/**
 * Le moteur Arkiane, partie réseau.
 *
 * Un `GET` sur l'accueil de l'hôte marchand pour ouvrir une session, puis un
 * `POST` de recherche par page. Le premier n'est pas décoratif — la session
 * retient les dernières dates envoyées, et une session neuve est la seule façon
 * d'être sûr que la réponse porte bien les dates demandées.
 *
 * **Les cookies sont relayés à la main.** `fetch` n'en garde aucun : le cookie
 * que l'accueil pose est lu dans l'en-tête de réponse et renvoyé au `POST`.
 * Rien d'autre n'est conservé, et rien ne survit à la recherche.
 *
 * **Puis le détail de chaque lot, un à la fois.** C'est lui qui porte la
 * position et les chambres, et il s'ouvre par le formulaire de la carte
 * (`POST /fr-FR/Lot/Detail`), seulement vers l'origine du marchand, sans suivre
 * de redirection : le formulaire et les cookies ne partent pas ailleurs. Il ne
 * dépend pas des dates : il est gardé trente jours par lot. Chaque recherche
 * lui donne quinze secondes au plus, un lot à la fois, chacun une seconde au
 * moins après la requête précédente vers l'hôte, dernière page de résultats
 * comprise (`cadence.ts`) ; ce qui n'a pas été lu attend la recherche
 * suivante. Un refus (403, 429, 503) arrête les détails vers cet hôte jusqu'au
 * redémarrage du serveur, sans reprise ; une autre panne arrête ceux de la
 * recherche. Les annonces partent quand même, sans point.
 *
 * **Seule la rubrique des locations est demandée** (`lot_type_to|801`), et
 * la règle du propriétaire (`regleTypes.ts`) s'applique à la lecture, sur le
 * type commercial (`horsRegleArkiane`) : une chambre, un hôtel, un refuge, un
 * camping, de l'insolite sont écartés ; un type qu'elle ne connaît pas est
 * gardé, et nommé au journal.
 */

import type { Listing } from "@/lib/listings";
import { annoncer } from "@/lib/stay/occupancy";
import { UA_NAVIGATEUR } from "../../navigateur";
import { aTourDeRole, noterFin } from "../cadence";
import { compter, phrasesRegle, typeInconnu } from "../regleTypes";
import { centraleAutorise } from "../robots.server";
import type { ContexteCentrale } from "../types";
import {
  adresseDetailArkiane,
  ARKIANE_PAR_PAGE,
  corpsArkiane,
  estDetailArkiane,
  fragmentsArkiane,
  horsRegleArkiane,
  lireArkiane,
  lireDetailArkiane,
  type DetailArkiane,
  type FicheArkiane,
} from "./arkiane";

// L'en-tête d'un navigateur, comme tout le relevé (`navigateur.ts`). Les règles
// de robots.txt se lisent toujours sous `AGENT_CENTRALES` (`../robots.server`).
const UA = UA_NAVIGATEUR;
const TIMEOUT_MS = 45_000;
/**
 * Pages demandées au plus, borne de sécurité explicite.
 *
 * Dix pages de cinquante font cinq cents lots, très au-delà de ce que
 * Pralognan publie — vingt-quatre au relevé du 13 septembre 2026. L'atteindre
 * se journalise : un relevé tronqué ne doit pas l'être en silence.
 */
const PAGES_MAX = 10;
/** Une pause entre deux pages. La centrale n'en demande pas ; on se la donne. */
const PAUSE_PAGE_MS = 700;
/** Le détail d'un lot ne dépend pas des dates : on le garde trente jours. */
const DETAIL_TTL_MS = 30 * 24 * 3600 * 1000;
/** Temps donné aux détails par recherche ; le reste attend la suivante. */
const DETAIL_BUDGET_MS = 15_000;
/** Délai d'un détail : plus court que celui d'une page, pour tenir le budget. */
const DETAIL_TIMEOUT_MS = 10_000;

/** Détails déjà lus, par hôte marchand et numéro de lot. */
const detailsLus = new Map<string, { at: number; lecture: DetailArkiane }>();
/**
 * Hôtes marchands qui ont refusé un détail (403, 429, 503) : plus aucun détail
 * ne leur est demandé jusqu'au redémarrage. La recherche, elle, continue.
 */
const detailsRefuses = new Set<string>();

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type ReglageArkiane = {
  host: string;
  nom: string;
  /** Jeton court et stable, qui entre dans l'identifiant des annonces. */
  cle: string;
  /**
   * Hôte marchand qui sert les prix, sans barre finale.
   *
   * Ce n'est pas celui de la centrale : le site public renvoie vers une
   * instance LocVacances, et c'est elle qu'on interroge.
   */
  marchand: string;
  /** Langue et région du chemin, par exemple « fr-FR ». */
  langue: string;
};

/** Ce que le serveur a posé comme cookies, prêt à être renvoyé. */
function cookiesDe(r: Response): string {
  const brut = r.headers.getSetCookie?.() ?? [];
  const paires = brut.map((c) => c.split(";")[0] ?? "").filter(Boolean);
  return paires.join("; ");
}

async function ouvrir(marchand: string, langue: string): Promise<string> {
  const url = `${marchand}/${langue}/`;
  await centraleAutorise(url);
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html", "accept-language": "fr-FR,fr;q=0.9" },
    });
    const cookies = cookiesDe(r);
    await r.body?.cancel();
    return cookies;
  } finally {
    clearTimeout(minuteur);
    noterFin(url);
  }
}

async function chercherPage(
  marchand: string,
  langue: string,
  cookies: string,
  corps: URLSearchParams,
): Promise<string> {
  const url = `${marchand}/${langue}/Home/RefreshAvailabilities`;
  await centraleAutorise(url);
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent": UA,
        accept: "text/html, */*",
        "accept-language": "fr-FR,fr;q=0.9",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        // Le moteur ne rend son fragment que pour une demande d'arrière-plan.
        "x-requested-with": "XMLHttpRequest",
        referer: `${marchand}/${langue}/`,
        ...(cookies ? { cookie: cookies } : {}),
      },
      body: corps.toString(),
    });
    if (!r.ok) {
      await r.body?.cancel();
      throw new Error(`la centrale a répondu ${r.status}`);
    }
    return await r.text();
  } finally {
    clearTimeout(minuteur);
    // Le premier détail attend une seconde après cette fin (`cadence.ts`).
    noterFin(url);
  }
}

/**
 * Le détail d'un lot : le formulaire de sa carte, renvoyé tel quel à `url`,
 * que l'appelant a vérifiée (`adresseDetailArkiane`). Une redirection n'est
 * pas suivie : elle mènerait le formulaire et les cookies où l'on n'a pas
 * vérifié, et se lit comme une réponse sans détail.
 */
async function detailLot(
  url: string,
  marchand: string,
  langue: string,
  cookies: string,
  formulaire: NonNullable<FicheArkiane["detail"]>,
): Promise<{ statut: number; page: string | null }> {
  await centraleAutorise(url);
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), DETAIL_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      redirect: "manual",
      headers: {
        "user-agent": UA,
        accept: "text/html",
        "accept-language": "fr-FR,fr;q=0.9",
        "content-type": "application/x-www-form-urlencoded",
        referer: `${marchand}/${langue}/`,
        ...(cookies ? { cookie: cookies } : {}),
      },
      body: new URLSearchParams(formulaire.champs).toString(),
    });
    if (!r.ok) {
      await r.body?.cancel();
      return { statut: r.status, page: null };
    }
    return { statut: r.status, page: await r.text() };
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * Le détail des lots, un à la fois, dans le budget de la recherche.
 *
 * Ce qui est en mémoire depuis moins de trente jours ne se redemande pas. Un
 * formulaire dont l'action mène hors de l'origine du marchand n'est pas
 * envoyé. Chaque détail part à son tour (`aTourDeRole`). Une page qui n'est
 * pas un détail n'est pas gardée, et arrête les détails de la recherche : le
 * lot sera redemandé à la suivante. Un refus (403, 429, 503) arrête les
 * détails vers l'hôte jusqu'au redémarrage ; toute autre panne, ceux de cette
 * recherche. Aucune reprise.
 */
async function lireDetails(
  marchand: string,
  langue: string,
  cookies: string,
  fiches: FicheArkiane[],
): Promise<{
  lus: Map<string, DetailArkiane>;
  demandes: number;
  enMemoire: number;
  horsOrigine: number;
  arret: string | null;
}> {
  const lus = new Map<string, DetailArkiane>();
  const debut = Date.now();
  let demandes = 0;
  let enMemoire = 0;
  let horsOrigine = 0;
  let arret: string | null = null;
  for (const f of fiches) {
    const cle = `${marchand}|${f.lot}`;
    const garde = detailsLus.get(cle);
    if (garde && Date.now() - garde.at < DETAIL_TTL_MS) {
      lus.set(f.lot, garde.lecture);
      enMemoire += 1;
      continue;
    }
    if (arret || !f.detail) continue;
    if (detailsRefuses.has(marchand)) {
      arret = "l'hôte a refusé un détail plus tôt, aucun n'est redemandé";
      continue;
    }
    if (Date.now() - debut > DETAIL_BUDGET_MS) {
      arret = `budget de ${DETAIL_BUDGET_MS / 1000} s atteint`;
      continue;
    }
    const url = adresseDetailArkiane(marchand, f.detail.action);
    if (!url) {
      horsOrigine += 1;
      continue;
    }
    const formulaire = f.detail;
    demandes += 1;
    try {
      const { statut, page } = await aTourDeRole(url, async () => {
        // Une autre recherche a pu essuyer un refus pendant l'attente.
        if (detailsRefuses.has(marchand)) {
          throw new Error("l'hôte a refusé un détail plus tôt, aucun n'est redemandé");
        }
        return detailLot(url, marchand, langue, cookies, formulaire);
      });
      if (statut === 403 || statut === 429 || statut === 503) {
        detailsRefuses.add(marchand);
        arret = `refus ${statut}, plus aucun détail demandé à cet hôte`;
        continue;
      }
      if (page == null) {
        arret = `la centrale a répondu ${statut}`;
        continue;
      }
      // Une autre page qu'un détail (session perdue, accueil) : les lots
      // suivants la recevraient aussi. On s'arrête là pour cette recherche.
      if (!estDetailArkiane(page)) {
        arret = "la centrale a rendu autre chose qu'un détail";
        continue;
      }
      const lecture = lireDetailArkiane(page);
      detailsLus.set(cle, { at: Date.now(), lecture });
      lus.set(f.lot, lecture);
    } catch (e) {
      arret = e instanceof Error ? e.message : String(e);
    }
  }
  return { lus, demandes, enMemoire, horsOrigine, arret };
}

function enListing(
  f: FicheArkiane,
  r: ReglageArkiane,
  ctx: ContexteCentrale,
  d: DetailArkiane | undefined,
): Listing {
  // Les champs d'abord : la capacité de la carte (`lot_pax`), les pièces de son
  // type commercial ou du détail, les chambres du détail. Puis le libellé
  // entier, et non le titre nettoyé : c'est lui qui porte « 3 PIECES » et
  // « Capacité 7/8 personnes », et le nettoyage lui coupe sa fin.
  const occ = annoncer(
    {
      guests: f.capacite ?? d?.capacite ?? null,
      bedrooms: d?.chambres ?? null,
      rooms: f.pieces ?? d?.pieces ?? null,
    },
    f.libelle,
    f.titre,
  );
  // Le prix barré est publié — `<del class="before">` — et il est rendu sous ce
  // nom-là. L'appeler « remisé depuis » ajouterait une interprétation à ce que
  // la centrale a écrit ; elle barre un montant, elle n'annonce pas de remise.
  const barre =
    f.avantRemise != null && f.avantRemise > f.total
      ? `prix barré ${f.avantRemise.toLocaleString("fr-FR")} €`
      : null;
  return {
    id: `ark-${r.cle}-${f.lot}`,
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
    // Le type commercial publié : « 3 pièces », « Studio », « Chalet ».
    propertyType: f.typeCommercial,
    priceLabel: barre,
    // Le détail d'un lot est lui aussi un `POST` : il n'existe pas d'adresse de
    // fiche atteignable en `GET`, et en fabriquer une mènerait à une erreur.
    url: ctx.base.replace(/\/+$/, ""),
    // Le point du lien « Localiser ce bien » du détail, quand il a été lu et
    // que la centrale en publie un.
    lat: d?.lat ?? null,
    lon: d?.lon ?? null,
    locality: f.commune,
    placeName: d?.quartier ?? null,
    proven: `${r.nom} (Arkiane, ${r.host}) ${ctx.checkIn}→${ctx.checkOut}, ${ctx.guests} pers.${
      f.reference ? ` — référence ${f.reference}` : ""
    }${barre ? ` — ${barre}` : ""}${
      // La centrale tronque ses longs libellés et le titre en perd la fin :
      // surface et classement y sont écrits, et le modèle n'a pas de champ pour
      // les porter. La preuve de l'annonce garde donc sa phrase entière.
      f.libelle && f.libelle !== f.titre ? ` — libellé publié : « ${f.libelle} »` : ""
    }`,
  };
}

/**
 * Interroge une centrale Arkiane.
 *
 * Lève quand l'appel échoue. Une réponse
 * sans carte ne lève pas : c'est ce que la centrale répond quand rien n'est
 * libre, et elle l'écrit en toutes lettres. `robots.txt` est lu, pas appliqué.
 *
 * **La pagination était figée à la première page**, `take=50 / skip=1`, sans
 * que rien ne dise que cinquante suffisent. La centrale ne publie pas de
 * compteur de résultats dans son fragment, et l'unité de `skip` n'a pas été
 * observée : la règle d'arrêt est donc celle qui vaut dans les deux cas — on
 * s'arrête dès qu'une page n'apporte plus de lot inconnu, ou qu'elle n'est pas
 * pleine. S'y ajoutent une borne explicite et une pause entre deux pages. Sur
 * Pralognan, la première page suffit et la deuxième n'est jamais demandée.
 */
export async function chercherArkiane(ctx: ContexteCentrale, r: ReglageArkiane): Promise<Listing[]> {
  const marchand = r.marchand.replace(/\/+$/, "");
  const cookies = await ouvrir(marchand, r.langue);
  const fiches: FicheArkiane[] = [];
  const vus = new Set<string>();
  let pages = 0;
  let tronque = false;
  for (let skip = 1; skip <= PAGES_MAX; skip += 1) {
    if (skip > 1) await pause(PAUSE_PAGE_MS);
    const page = await chercherPage(marchand, r.langue, cookies, corpsArkiane(ctx, skip));
    pages += 1;
    // Les cartes, avant tri : une page peut être pleine de cartes que
    // `lireArkiane` écarte, et c'est sa taille à elle qui dit s'il y a une suite.
    const cartes = fragmentsArkiane(page).length;
    let neufs = 0;
    for (const f of lireArkiane(page)) {
      if (vus.has(f.lot)) continue;
      vus.add(f.lot);
      fiches.push(f);
      neufs += 1;
    }
    if (cartes < ARKIANE_PAR_PAGE || (cartes > 0 && neufs === 0)) break;
    if (cartes === 0) break;
    if (skip === PAGES_MAX) tronque = true;
  }
  console.info(
    `[centrale] ${r.host} : ${fiches.length} lots sur ${pages} page(s), ${ctx.checkIn}→${ctx.checkOut}`,
  );
  // Règle du propriétaire (`regleTypes.ts`) : le type commercial tranche, et
  // le libellé pour le seul camping. Un type inconnu est gardé, et nommé.
  const ecartes = new Map<string, number>();
  const inconnus = new Map<string, number>();
  const gardes = fiches.filter((f) => {
    const motif = horsRegleArkiane(f);
    if (motif) compter(ecartes, motif);
    else if (f.typeCommercial && typeInconnu(f.typeCommercial)) compter(inconnus, f.typeCommercial);
    return !motif;
  });
  for (const phrase of phrasesRegle(ecartes, inconnus)) {
    console.info(`[centrale] ${r.host} : ${phrase}`);
  }
  if (tronque) {
    console.warn(`[centrale] ${r.host} : relevé arrêté à la borne de ${PAGES_MAX} pages, il en reste peut-être.`);
  }
  const { lus, demandes, enMemoire, horsOrigine, arret } = await lireDetails(
    marchand,
    r.langue,
    cookies,
    gardes,
  );
  console.info(
    `[centrale] ${r.host} : détail de ${lus.size}/${gardes.length} lots (${enMemoire} en mémoire, ${demandes} demandé(s))` +
      `, point sur ${[...lus.values()].filter((d) => d.lat != null).length}${arret ? `, arrêté : ${arret}` : ""}`,
  );
  if (horsOrigine > 0) {
    console.warn(
      `[centrale] ${r.host} : ${horsOrigine} formulaire(s) de détail hors de ${marchand}, non envoyé(s)`,
    );
  }
  return gardes.map((f) => enListing(f, r, ctx, lus.get(f.lot)));
}
