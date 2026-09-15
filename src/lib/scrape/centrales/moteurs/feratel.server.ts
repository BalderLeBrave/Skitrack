/**
 * Le moteur Deskline / Feratel, partie réseau.
 *
 * On crée une recherche, puis on en lit les résultats page par page. La
 * recherche n'existe pas sans dates — le service refuse de la créer —, ce qui
 * fait que ces prix sont datés par construction.
 *
 * **Les pages se suivent jusqu'à la dernière.** Une seule était lue, et
 * soixante hébergements exactement en revenaient : le plafond d'une page. Le
 * service ne publiant pas de compteur de résultats, la règle d'arrêt est celle
 * qui ne suppose rien — une page incomplète est la dernière —, avec une borne
 * explicite et une pause entre deux appels.
 *
 * **`robots.txt` est lu avant chaque appel, et n'arrête jamais.** Celui de la
 * passerelle répond 404. La lecture reste faite pour journaliser le jour où
 * elle publie des règles.
 *
 * **Un `204 No Content` n'est pas une panne.** C'est la réponse quand rien
 * n'est libre à ces dates pour ce groupe, et elle se lit comme une liste vide.
 * Vu à La Clusaz sur trois nuits : la station ne vend pas court en février.
 */

import type { Listing } from "@/lib/listings";
import { occupancyFromText } from "@/lib/stay/occupancy";
import { AGENT_CENTRALES } from "../robots";
import { centraleAutorise } from "../robots.server";
import type { ContexteCentrale } from "../types";
import {
  corpsRechercheFeratel,
  FERATEL_PAR_PAGE,
  lireFeratel,
  sessionFeratel,
  urlRechercheFeratel,
  urlResultatsFeratel,
  type FicheFeratel,
  type ReponseFeratel,
} from "./feratel";

const UA = `${AGENT_CENTRALES}/1.0 (+https://skitrack.local/robots)`;
const TIMEOUT_MS = 30_000;
/**
 * Pages demandées au plus, borne de sécurité explicite.
 *
 * Vingt pages de soixante font mille deux cents hébergements, très au-delà de
 * la plus grosse centrale du parc. Atteindre cette borne se journalise : un
 * relevé tronqué ne doit jamais l'être en silence.
 */
const PAGES_MAX = 20;
/** Une pause entre deux pages. Le service n'en demande pas ; on se la donne. */
const PAUSE_PAGE_MS = 400;

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
): Promise<{ statut: number; valeur: unknown }> {
  // La passerelle ne sert même pas son `robots.txt` sans ces en-têtes : sans
  // eux elle rend 400. On les envoie pour lire le fichier, pas pour s'arrêter.
  await centraleAutorise(url, entetesPasserelle(session));
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
      throw new Error(`la centrale a répondu ${r.status}`);
    }
    return { statut: r.status, valeur: await r.json() };
  } finally {
    clearTimeout(minuteur);
  }
}

function enListing(f: FicheFeratel, r: ReglageFeratel, ctx: ContexteCentrale): Listing {
  const base = ctx.base.replace(/\/+$/, "");
  // Le nom du produit vendu entre dans la lecture d'occupation : c'est lui qui
  // porte parfois « 3 pièces » ou « 8 personnes » quand l'hébergement ne porte
  // que le nom de la résidence. Il était demandé au service, puis jeté.
  const occ = occupancyFromText(f.titre, f.service, f.produit);
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
    // L'identifiant de l'annonce est celui de l'hébergement ; celui du produit
    // désigne ce qui est réellement vendu, et ce n'est pas le même.
    platformId: f.produitId,
    // Le service ne donne pas d'adresse par hébergement. Le lien mène donc à la
    // page de réservation de la centrale, qui est juste, plutôt qu'à une fiche
    // fabriquée, qui ne le serait pas.
    url: `${base}${r.chemin}`,
    lat: f.lat,
    lon: f.lon,
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
 * **Le service ne publie pas de compteur de résultats** — la réponse ne porte
 * que `data`. La règle d'arrêt est donc celle qui ne suppose rien : une page
 * incomplète est la dernière. S'y ajoutent une borne explicite, un
 * dédoublonnage par identifiant, et une pause entre deux pages.
 */
async function toutesLesPages(
  r: ReglageFeratel,
  recherche: string,
  session: string,
): Promise<{ fiches: FicheFeratel[]; pages: number; tronque: boolean }> {
  const vues = new Set<string>();
  const fiches: FicheFeratel[] = [];
  let pages = 0;
  for (let page = 0; page < PAGES_MAX; page += 1) {
    if (page > 0) await pause(PAUSE_PAGE_MS);
    const res = await json(urlResultatsFeratel(FERATEL_API, r.organisation, recherche, page), session);
    pages += 1;
    if (res.statut === 204) return { fiches, pages, tronque: false };
    const reponse = res.valeur as ReponseFeratel;
    let neufs = 0;
    for (const f of lireFeratel(reponse)) {
      if (vues.has(f.id)) continue;
      vues.add(f.id);
      fiches.push(f);
      neufs += 1;
    }
    const brutes = reponse?.data?.length ?? 0;
    // Une page incomplète est la dernière ; une page qui ne rapporte rien de
    // neuf l'est aussi, et cette seconde règle protège le service au cas où il
    // ignorerait `pageNo` et rendrait vingt fois la même page.
    if (brutes < FERATEL_PAR_PAGE || neufs === 0) return { fiches, pages, tronque: false };
  }
  return { fiches, pages, tronque: true };
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
  const { fiches, pages, tronque } = await toutesLesPages(r, recherche, session);
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
  return fiches.map((f) => enListing(f, r, ctx));
}
