/**
 * Le moteur Arkiane, partie réseau.
 *
 * Deux appels : un `GET` sur l'accueil de l'hôte marchand pour ouvrir une
 * session, puis le `POST` de recherche. Le premier n'est pas décoratif — la
 * session retient les dernières dates envoyées, et une session neuve est la
 * seule façon d'être sûr que la réponse porte bien les dates demandées.
 *
 * **Les cookies sont relayés à la main.** `fetch` n'en garde aucun : le cookie
 * que l'accueil pose est lu dans l'en-tête de réponse et renvoyé au `POST`.
 * Rien d'autre n'est conservé, et rien ne survit à la recherche.
 */

import type { Listing } from "@/lib/listings";
import { AGENT_CENTRALES } from "../robots";
import { centraleAutorise } from "../robots.server";
import type { ContexteCentrale } from "../types";
import { corpsArkiane, lireArkiane, type FicheArkiane } from "./arkiane";

const UA = `${AGENT_CENTRALES}/1.0 (+https://skitrack.local/robots)`;
const TIMEOUT_MS = 45_000;

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
  const verdict = await centraleAutorise(url);
  if (verdict.autorise !== true) {
    throw new Error(verdict.autorise === null ? verdict.regle : `robots.txt dit « ${verdict.regle} »`);
  }
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
  const verdict = await centraleAutorise(url);
  if (verdict.autorise !== true) {
    throw new Error(verdict.autorise === null ? verdict.regle : `robots.txt dit « ${verdict.regle} »`);
  }
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
  const remise =
    f.avantRemise && f.avantRemise > f.total
      ? ` — remisé depuis ${f.avantRemise.toLocaleString("fr-FR")} €`
      : "";
  return {
    id: `ark-${r.cle}-${f.lot}`,
    stationId: ctx.stationId,
    title: f.titre,
    source: "Centrale",
    total: f.total,
    currency: "EUR",
    guests: f.capacite,
    bedrooms: null,
    available: true,
    photo: f.photo,
    // Le détail d'un lot est lui aussi un `POST` : il n'existe pas d'adresse de
    // fiche atteignable en `GET`, et en fabriquer une mènerait à une erreur.
    url: ctx.base.replace(/\/+$/, ""),
    // La réponse ne porte aucune coordonnée.
    lat: null,
    lon: null,
    locality: f.commune,
    proven: `${r.nom} (Arkiane, ${r.host}) ${ctx.checkIn}→${ctx.checkOut}, ${ctx.guests} pers.${
      f.reference ? ` — référence ${f.reference}` : ""
    }${remise}`,
  };
}

/**
 * Interroge une centrale Arkiane.
 *
 * Lève quand `robots.txt` ferme le chemin ou que l'appel échoue. Une réponse
 * sans carte ne lève pas : c'est ce que la centrale répond quand rien n'est
 * libre, et elle l'écrit en toutes lettres.
 */
export async function chercherArkiane(ctx: ContexteCentrale, r: ReglageArkiane): Promise<Listing[]> {
  const marchand = r.marchand.replace(/\/+$/, "");
  const cookies = await ouvrir(marchand, r.langue);
  const page = await chercherPage(marchand, r.langue, cookies, corpsArkiane(ctx));
  const fiches = lireArkiane(page);
  console.info(`[centrale] ${r.host} : ${fiches.length} lots, ${ctx.checkIn}→${ctx.checkOut}`);
  return fiches.map((f) => enListing(f, r, ctx));
}
