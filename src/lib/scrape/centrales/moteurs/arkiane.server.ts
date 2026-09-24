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
 */

import type { Listing } from "@/lib/listings";
import { annoncer } from "@/lib/stay/occupancy";
import { UA_NAVIGATEUR } from "../../navigateur";
import { centraleAutorise } from "../robots.server";
import type { ContexteCentrale } from "../types";
import {
  ARKIANE_PAR_PAGE,
  corpsArkiane,
  fragmentsArkiane,
  lireArkiane,
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
  }
}

async function chercherPage(
  marchand: string,
  langue: string,
  cookies: string,
  corps: Record<string, string>,
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
      body: new URLSearchParams(corps).toString(),
    });
    if (!r.ok) {
      await r.body?.cancel();
      throw new Error(`la centrale a répondu ${r.status}`);
    }
    return await r.text();
  } finally {
    clearTimeout(minuteur);
  }
}

function enListing(f: FicheArkiane, r: ReglageArkiane, ctx: ContexteCentrale): Listing {
  // Le libellé entier, et non le titre nettoyé : c'est lui qui porte
  // « 3 PIECES » et « Capacité 7/8 personnes », et le nettoyage lui coupe sa
  // fin. Les pièces s'y lisent comme des pièces.
  const occ = annoncer({ guests: f.capacite, bedrooms: null }, f.libelle, f.titre);
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
    priceLabel: barre,
    // Le détail d'un lot est lui aussi un `POST` : il n'existe pas d'adresse de
    // fiche atteignable en `GET`, et en fabriquer une mènerait à une erreur.
    url: ctx.base.replace(/\/+$/, ""),
    // La réponse ne porte aucune coordonnée.
    lat: null,
    lon: null,
    locality: f.commune,
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
  if (tronque) {
    console.warn(`[centrale] ${r.host} : relevé arrêté à la borne de ${PAGES_MAX} pages, il en reste peut-être.`);
  }
  return fiches.map((f) => enListing(f, r, ctx));
}
