/**
 * Le moteur Deskline / Feratel, partie réseau.
 *
 * Deux appels, dans cet ordre : on crée une recherche, puis on en lit les
 * résultats. La recherche n'existe pas sans dates — le service refuse de la
 * créer —, ce qui fait que ces prix sont datés par construction.
 *
 * **`robots.txt` est lu sur les deux appels, et n'arrête jamais.** Celui de la
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
  lireFeratel,
  sessionFeratel,
  urlRechercheFeratel,
  urlResultatsFeratel,
  type FicheFeratel,
  type ReponseFeratel,
} from "./feratel";

const UA = `${AGENT_CENTRALES}/1.0 (+https://skitrack.local/robots)`;
const TIMEOUT_MS = 30_000;

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
  const occ = occupancyFromText(f.titre, f.service);
  return {
    id: `dw-${r.cle}-${f.id}`,
    stationId: ctx.stationId,
    title: f.titre,
    source: "Centrale",
    total: f.total,
    currency: "EUR",
    guests: occ.guests,
    bedrooms: occ.bedrooms,
    available: true,
    photo: f.photo,
    // Le service ne donne pas d'adresse par hébergement. Le lien mène donc à la
    // page de réservation de la centrale, qui est juste, plutôt qu'à une fiche
    // fabriquée, qui ne le serait pas.
    url: `${base}${r.chemin}`,
    lat: f.lat,
    lon: f.lon,
    proven: `${r.nom} (Deskline / Feratel, ${r.host}) ${ctx.checkIn}→${ctx.checkOut}, ${ctx.guests} pers.${
      f.service ? ` — ${f.service}` : ""
    }`,
  };
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
  const resultats = await json(urlResultatsFeratel(FERATEL_API, r.organisation, recherche), session);
  if (resultats.statut === 204) {
    console.info(`[centrale] ${r.host} : rien de libre, ${ctx.checkIn}→${ctx.checkOut}`);
    return [];
  }
  const fiches = lireFeratel(resultats.valeur as ReponseFeratel);
  console.info(`[centrale] ${r.host} : ${fiches.length} hébergements, ${ctx.checkIn}→${ctx.checkOut}`);
  return fiches.map((f) => enListing(f, r, ctx));
}
