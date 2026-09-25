/**
 * Le moteur Ingénie, partie réseau.
 *
 * Un seul appel, et rien autour : pas de visite préalable de l'accueil, pas de
 * cookie de session, pas d'en-tête `Referer`. Vérifié le 13 septembre 2026 —
 * la requête nue rend exactement la même page que la requête précédée d'une
 * session, au millier d'octets près.
 *
 * **La suite de la liste, elle, vit dans la session.** La première page ne
 * montre qu'une partie des résultats (10 sur 37 à Arêches-Beaufort, relevé du
 * 25 septembre 2026) ; le reste arrive par le lien `#lasuite`, qui ne porte ni
 * dates ni groupe. On le suit avec les cookies que la première page a posés,
 * comme le fait son défilement. Même relevé : avec eux, la page 2 d'Arêches
 * rend dix fiches neuves ; sans eux, dix autres, dont trois seulement en
 * commun — la page 2 d'un autre classement (`pageSuivanteIngenie`).
 *
 * **Toute la recherche tient sous une échéance**, comptée dès son entrée
 * (`ECHEANCE_INGENIE_MS`) : chaque appel n'a que le temps qui reste, et deux
 * pages d'un même hôte sont séparées d'une seconde au moins.
 *
 * `robots.txt` est lu avant l'appel et n'arrête jamais. Vingt-deux centrales
 * portent `Disallow: /*booking?*` sur `/booking` : on le journalise, on
 * interroge. Les centrales sans fichier propre passent par
 * `chercherIngenieHote`, qui lit le `cid` sur la page d'accueil.
 */

import type { Listing } from "@/lib/listings";
import { annoncer } from "@/lib/stay/occupancy";
import { UA_NAVIGATEUR } from "../../navigateur";
import { centraleAutorise } from "../robots.server";
import type { ContexteCentrale } from "../types";
import {
  APPEL_MIN_INGENIE_MS,
  configWidgetIngenie,
  lienReservationDepuisPage,
  estPageResultat,
  lireIngenie,
  pagesSuivantesIngenie,
  PAUSE_PAGE_INGENIE_MS,
  resultatsAnnonces,
  TYPE_PRESTATAIRE_DEFAUT,
  TYPES_PRESTATAIRE_CONNUS,
  categoriesDeRepli,
  typesPrestataireDepuisPage,
  nuitsEntre,
  urlIngenie,
  type FicheIngenie,
  type PageIngenie,
} from "./ingenie";

// L'en-tête d'un navigateur, comme tout le relevé (`navigateur.ts`). Les règles
// de robots.txt se lisent toujours sous `AGENT_CENTRALES` (`../robots.server`).
const UA = UA_NAVIGATEUR;
const TIMEOUT_MS = 30_000;

/**
 * Le temps que se donne une recherche Ingénie, compté dès son entrée
 * (`chercherIngenieHote`, ou `chercherIngenie` pour un hôte qui a son
 * fichier) : l'accueil, la première page, le repli de catégorie et les pages
 * suivantes le partagent.
 *
 * La part « centrales » est abandonnée à 48 s (`PART_ALL_MS`,
 * `run.server.ts`), et avec elle tout ce qu'elle avait lu. Chaque appel n'a
 * donc que le temps qui reste, et aucun ne part à moins de
 * `APPEL_MIN_INGENIE_MS` de l'échéance. Seule la lecture de `robots.txt`,
 * avant l'appel, garde son propre délai de 10 s (`robots.server.ts`) :
 * commencée au plus tard 3 s avant l'échéance, elle peut la dépasser de 7 s,
 * et l'appel ne part pas. 38 + 7 = 45 s, sous les 48.
 */
const ECHEANCE_INGENIE_MS = 38_000;

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
  /** La catégorie que le site déclare. Absente, le défaut `G` s'applique et le
   *  repli se débrouille. */
  typePrestataire?: string;
};

/**
 * La centrale annonce-t-elle son prix comme un « à partir de » ?
 *
 * Elle l'écrit en toutes lettres au-dessus du montant, dans sa casse à elle —
 * « à partir de » à Risoul, « À partir de » aux Contamines. C'était repris dans
 * la preuve et nulle part ailleurs ; le modèle porte désormais le drapeau, et
 * l'écran peut dire que ce nombre n'est pas un total de séjour.
 */
function annoncePartirDe(etiquette: string | null): boolean {
  if (!etiquette) return false;
  const plat = etiquette
    .toLowerCase()
    .normalize("NFD")
    // Les marques diacritiques, écrites en échappement : un caractère
    // invisible dans le source se relit mal et se recopie plus mal encore.
    .replace(/[\u0300-\u036f]/g, "");
  return plat.includes("a partir de");
}

function enListing(f: FicheIngenie, base: string, r: ReglageIngenie, ctx: ContexteCentrale): Listing {
  const nuits = nuitsEntre(ctx.checkIn, ctx.checkOut);
  // Ce que la fiche affiche en clair d'abord — « 10 personnes », « 3 chambres »
  // sous le titre ou dans les critères —, le titre et le chemin ensuite.
  // « Chalet - Chalet Santa Claus », « Appartement 3 pièces » : les pièces que
  // le titre annonce sont des pièces, et restent des pièces.
  const occ = annoncer({ guests: f.capacite, bedrooms: f.chambres, rooms: f.pieces }, f.titre, f.chemin);
  return {
    id: `ing-${r.cle}-${f.id}`,
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
    priceLabel: f.libelle,
    priceIndicative: annoncePartirDe(f.etiquette) ? true : null,
    url: f.chemin ? new URL(f.chemin, `${base}/`).toString() : base,
    // Le point du logement, lu dans le JSON-LD de sa fiche (`location.geo`).
    // Vide quand la centrale l'a laissé vide : jamais un point de commune.
    lat: f.lat,
    lon: f.lon,
    locality: f.commune,
    placeName: f.adresse,
    proven: `${r.nom} (Ingénie, ${r.host}) ${ctx.checkIn}→${ctx.checkOut}, ${nuits} nuit${
      nuits > 1 ? "s" : ""
    }, ${ctx.guests} pers.${f.etiquette ? ` — étiquette de la centrale : « ${f.etiquette} »` : ""}`,
  };
}

function cookiesDe(r: Response): string {
  return (r.headers.getSetCookie?.() ?? [])
    .map((c) => c.split(";")[0] ?? "")
    .filter(Boolean)
    .join("; ");
}

const PLUS_LE_TEMPS =
  "plus assez de temps pour interroger la centrale avant l'échéance de la recherche";

/**
 * Une page de la centrale, avec la session quand on en a une.
 *
 * Elle part seulement s'il reste `APPEL_MIN_INGENIE_MS` avant l'échéance, et
 * n'attend que ce qui reste, 30 s au plus. `robots.txt` est lu avant, et le
 * temps qu'il a pris est recompté.
 */
async function pageIngenie(
  url: string,
  echeance: number,
  cookies = "",
  referer?: string,
): Promise<PageIngenie> {
  if (echeance - Date.now() < APPEL_MIN_INGENIE_MS) throw new Error(PLUS_LE_TEMPS);
  await centraleAutorise(url);
  const reste = echeance - Date.now();
  if (reste < APPEL_MIN_INGENIE_MS) throw new Error(PLUS_LE_TEMPS);
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), Math.min(TIMEOUT_MS, reste));
  try {
    const rep = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent": UA,
        accept: "text/html",
        "accept-language": "fr-FR,fr;q=0.9",
        ...(cookies ? { cookie: cookies } : {}),
        ...(referer ? { referer } : {}),
      },
    });
    if (!rep.ok) {
      await rep.body?.cancel();
      throw new Error(`la centrale a répondu ${rep.status}`);
    }
    return { url: rep.url || url, texte: await rep.text(), cookies: cookiesDe(rep) };
  } finally {
    clearTimeout(minuteur);
  }
}

async function html(url: string, echeance: number): Promise<string> {
  return (await pageIngenie(url, echeance)).texte;
}

function pause(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Interroge une centrale Ingénie.
 *
 * Lève quand l'appel échoue : `run.server.ts` en fait un rapport de source en
 * échec et l'écran dit pourquoi. Une page sans fiche ne lève pas — c'est la
 * réponse normale quand rien n'est libre à ces dates. `robots.txt` est lu, pas
 * appliqué.
 *
 * `echeance` est celle de toute la recherche : `chercherIngenieHote` passe la
 * sienne, qui court depuis l'accueil ; pour un hôte qui a son fichier, elle
 * court d'ici.
 */
export async function chercherIngenie(
  ctx: ContexteCentrale,
  r: ReglageIngenie,
  echeance = Date.now() + ECHEANCE_INGENIE_MS,
): Promise<Listing[]> {
  const base = ctx.base.replace(/\/+$/, "");
  const url = urlIngenie(base, r.cid, ctx, r.typePrestataire ?? TYPE_PRESTATAIRE_DEFAUT);
  let premiere = await pageIngenie(url, echeance);
  let page = premiere.texte;

  // `type_prestataire=G` marche sur douze hôtes et pas sur treize : ceux-là ne
  // connaissent pas cette catégorie et rendent leur formulaire de recherche.
  // Ce formulaire porte justement les catégories qu'ils acceptent : on les y
  // lit et on réessaie une fois. Aucune requête n'est dépensée pour les hôtes
  // que le défaut satisfait.
  if (!estPageResultat(page)) {
    // Ceux qui servent leur formulaire disent ce qu'ils acceptent ; ceux qui
    // peignent tout en JavaScript ne disent rien, et on essaie alors le
    // vocabulaire commun. Deux essais au plus : le premier qui répond gagne.
    //
    // Seulement les catégories de location : ni hôtels ni hébergements
    // insolites (`TYPES_PRESTATAIRE_ECARTES`), consigne du propriétaire. Un
    // hôte dont le formulaire n'en publie aucune n'est pas sondé au hasard.
    const aEssayer = categoriesDeRepli(page);
    if (aEssayer.length === 0) {
      console.info(
        `[centrale] ${r.host} : aucune catégorie de location publiée (${typesPrestataireDepuisPage(page).join(", ")})`,
      );
    }
    for (const type of aEssayer) {
      // Le même hôte que la page qu'on vient de lire : une seconde entre les deux.
      await pause(PAUSE_PAGE_INGENIE_MS);
      const autre = await pageIngenie(urlIngenie(base, r.cid, ctx, type), echeance);
      if (!estPageResultat(autre.texte)) continue;
      console.info(`[centrale] ${r.host} : type_prestataire ${type} au lieu de ${TYPE_PRESTATAIRE_DEFAUT}`);
      premiere = autre;
      page = autre.texte;
      break;
    }
  }

  // Une centrale qui sert son accueil au lieu d'une page de résultats n'a pas
  // dit « rien de disponible » : elle n'a rien dit. Lever plutôt que rendre
  // zéro, pour que l'écran annonce une panne et non un complet.
  if (!estPageResultat(page)) {
    throw new Error("la centrale a servi son accueil de réservation au lieu d'une page de résultats");
  }
  const fiches = lireIngenie(page);
  // La suite de la liste, sous la même échéance. Une page suivante en échec
  // n'emporte ni la première ni celles déjà lues (`pagesSuivantesIngenie`).
  const suite = await pagesSuivantesIngenie(
    premiere,
    fiches.map((f) => f.id),
    echeance,
    {
      lire: (lien, cookies, referer) => pageIngenie(lien, echeance, cookies, referer),
      maintenant: () => Date.now(),
      attendre: pause,
    },
  );
  fiches.push(...suite.fiches);
  if (suite.arret === "échec") {
    console.warn(
      `[centrale] ${r.host} : page ${suite.page} en échec, suite arrêtée sans reprise — ${suite.erreur}`,
    );
  } else if (suite.arret === "échéance") {
    console.warn(`[centrale] ${r.host} : page ${suite.page} non demandée faute de temps`);
  }
  const annonce = resultatsAnnonces(page);
  console.info(
    `[centrale] ${r.host} : ${fiches.length} fiches${
      annonce != null ? ` sur ${annonce} annoncées` : ""
    }, ${ctx.checkIn}→${ctx.checkOut}`,
  );
  return fiches.map((f) => enListing(f, base, r, ctx));
}

/**
 * La catégorie déclarée, si c'en est une d'hébergement.
 *
 * Le moteur classe aussi des services — forfaits, matériel, boîtiers wifi —
 * sous d'autres lettres. `MOTEUR_TYPES_PRESTATAIRE=MOTEUR_HEBERGEMENT` ne les
 * écarte pas : c'est `type_prestataire` qui tranche, et une lettre inconnue y
 * ramène autre chose que des logements.
 *
 * Les hôtels et les hébergements insolites (`H`, `H_INSOLITE`) sont des
 * hébergements, mais pas de la location : ils ne sont plus dans
 * `TYPES_PRESTATAIRE_CONNUS`, et un widget qui les déclare est ignoré comme
 * celui des services.
 */
function hebergement(type: string | null | undefined): string | undefined {
  if (!type) return undefined;
  const connu = [TYPE_PRESTATAIRE_DEFAUT, ...TYPES_PRESTATAIRE_CONNUS];
  return connu.includes(type) ? type : undefined;
}

function cleDepuisHote(host: string): string {
  const brut = host.replace(/^www\./, "").split(".")[0] ?? "ing";
  return brut.replace(/[^a-z0-9]/gi, "").slice(0, 8) || "ing";
}

/**
 * Centrale Ingénie sans fichier propre : `cid` lu sur l'accueil, puis la
 * recherche datée. C'est le passage des vingt-deux hôtes dont le fichier
 * porte `Disallow: /*booking?*` : on le journalise, on interroge.
 */
export async function chercherIngenieHote(
  ctx: ContexteCentrale,
  nom: string,
  host: string,
): Promise<Listing[]> {
  // L'échéance court dès l'accueil : lui et son lien comptent dans le temps.
  const echeance = Date.now() + ECHEANCE_INGENIE_MS;
  const base = ctx.base.replace(/\/+$/, "");
  const accueil = await html(`${base}/`, echeance);
  let config = configWidgetIngenie(accueil);
  let baseConfig = base;

  // `www.chatel.com` ne configure aucun widget : son `cid` est enfoui dans un
  // paquet JavaScript minifié. Mais il renvoie en clair vers
  // `www.chatelreservation.com`, qui publie tout. Suivre ce lien coûte une
  // requête, et seulement à ceux dont l'accueil ne dit rien.
  if (config.cid == null) {
    const lien = lienReservationDepuisPage(accueil, new URL(`${base}/`).host);
    if (lien) {
      const page = await html(`${lien}/`, echeance);
      const autre = configWidgetIngenie(page);
      if (autre.cid != null) {
        console.info(`[centrale] ${host} : configuration lue sur ${lien}`);
        config = autre;
        baseConfig = lien;
      }
    }
  }

  if (config.cid == null) {
    throw new Error("la page d'accueil n'a pas publié l'identifiant du moteur");
  }

  // Le widget dit sur quel domaine il vend. `www.lesrousses.com` rend 404 sur
  // `/booking` parce que sa centrale est sur `www.lesrousses-reservation.com`,
  // et seule sa configuration le disait.
  const vendeur = config.urlSite?.replace(/\/+$/, "") || baseConfig;
  const ctxVendeur = vendeur === base ? ctx : { ...ctx, base: vendeur };
  if (vendeur !== base) {
    console.info(`[centrale] ${host} : la réservation est sur ${vendeur}`);
  }

  const reglage: ReglageIngenie = {
    host,
    nom,
    cle: cleDepuisHote(host),
    cid: config.cid,
    // La catégorie déclarée ne sert que si c'en est une d'hébergement.
    //
    // `www.lesrousses.com` déclare `typePrestataire: 'S'`, et ce n'est pas un
    // oubli : le widget configuré sur son accueil est celui des **services**.
    // Interrogée sur `S`, la centrale rend dix fiches dont
    // `PRESTATION-S-WIFI-WIFI`, un boîtier Travel Wifi à 49 € la semaine. Les
    // prendre pour des logements aurait été pire que de n'en trouver aucun.
    //
    // Hors du vocabulaire d'hébergement, on ignore donc la déclaration et on
    // laisse le repli faire son travail.
    typePrestataire: hebergement(config.typePrestataire),
  };
  // La première page part le plus souvent vers l'hôte dont on vient de lire
  // l'accueil : une seconde entre les deux, comme entre deux pages de la liste.
  await pause(PAUSE_PAGE_INGENIE_MS);
  return chercherIngenie(ctxVendeur, reglage, echeance);
}
