/**
 * Le moteur iResa, partie réseau.
 *
 * Deux appels : un `GET` sur la page de recherche, qui donne le jeton du
 * formulaire et pose la session, puis le `POST` de la soumission. Le jeton est
 * repris tel quel, comme le ferait n'importe quelle soumission de ce
 * formulaire ; il n'est ni deviné ni fabriqué.
 *
 * **L'hôte interrogé n'est pas celui du registre.** La vitrine de la station
 * est `lesarcs.com` ; la centrale vit sur `lesarcs-reservation.com`, et c'est
 * son `robots.txt` qui est lu. Il ferme `/search/` et `/search?`, qui ne sont
 * pas le chemin du moteur. Tous les critères voyagent dans le corps du `POST`,
 * sans chaîne de requête. Un Disallow est journalisé, l'appel part quand même.
 */

import type { Listing } from "@/lib/listings";
import { annoncer } from "@/lib/stay/occupancy";
import { AGENT_CENTRALES } from "../robots";
import { centraleAutorise } from "../robots.server";
import type { ContexteCentrale } from "../types";
import { corpsIresa, jetonIresa, lireIresa, nuitsIresa, type FicheIresa } from "./iresa";

const UA = `${AGENT_CENTRALES}/1.0 (+https://skitrack.local/robots)`;
const TIMEOUT_MS = 45_000;

export type ReglageIresa = {
  host: string;
  nom: string;
  /** Jeton court et stable, qui entre dans l'identifiant des annonces. */
  cle: string;
  /** Origine du site de réservation, sans barre finale. */
  reservation: string;
  /** Chemin de la page de recherche, celui du formulaire comme de sa soumission. */
  chemin: string;
};

function cookiesDe(r: Response): string {
  const brut = r.headers.getSetCookie?.() ?? [];
  return brut
    .map((c) => c.split(";")[0] ?? "")
    .filter(Boolean)
    .join("; ");
}

async function permis(url: string): Promise<void> {
  await centraleAutorise(url);
}

async function formulaire(url: string): Promise<{ jeton: string; cookies: string }> {
  await permis(url);
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: "text/html", "accept-language": "fr-FR,fr;q=0.9" },
    });
    if (!r.ok) {
      await r.body?.cancel();
      throw new Error(`la centrale a répondu ${r.status}`);
    }
    const cookies = cookiesDe(r);
    const jeton = jetonIresa(await r.text());
    if (!jeton) throw new Error("le formulaire de recherche n'a pas livré son jeton");
    return { jeton, cookies };
  } finally {
    clearTimeout(minuteur);
  }
}

async function soumettre(url: string, cookies: string, corps: Record<string, string>): Promise<string> {
  await permis(url);
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      redirect: "follow",
      headers: {
        "user-agent": UA,
        accept: "text/html",
        "accept-language": "fr-FR,fr;q=0.9",
        "content-type": "application/x-www-form-urlencoded",
        referer: url,
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

function enListing(f: FicheIresa, r: ReglageIresa, ctx: ContexteCentrale): Listing {
  const base = r.reservation.replace(/\/+$/, "");
  const occ = annoncer({ guests: f.capacite, bedrooms: null }, f.titre, f.chemin);
  const remise =
    f.avantRemise && f.avantRemise > f.total
      ? ` — remisé depuis ${Math.round(f.avantRemise).toLocaleString("fr-FR")} €`
      : "";
  return {
    id: `irs-${r.cle}-${f.id}`,
    stationId: ctx.stationId,
    title: f.titre,
    source: "Centrale",
    total: f.total,
    currency: "EUR",
    guests: occ.guests,
    bedrooms: occ.bedrooms,
    available: true,
    photo: f.photo ? new URL(f.photo, `${base}/`).toString() : null,
    // Le gabarit porte l'adresse de la fiche ; à défaut, la page de recherche.
    url: f.chemin ? new URL(f.chemin, `${base}/`).toString() : `${base}${r.chemin}`,
    // Aucune coordonnée dans le flux de résultats.
    lat: null,
    lon: null,
    locality: f.lieu,
    proven: `${r.nom} (iResa, ${r.host}) ${ctx.checkIn}→${ctx.checkOut}, ${f.nuits} nuit${
      f.nuits > 1 ? "s" : ""
    }, ${ctx.guests} pers.${remise}`,
  };
}

/**
 * Interroge une centrale iResa.
 *
 * Une liste vide n'est pas une panne, et elle est même le cas le plus fréquent :
 * cette centrale ne vend, à bien des dates, qu'une seule durée. Quand la durée
 * demandée n'est pas vendue, le moteur rend son catalogue non daté, que
 * `lireIresa` écarte fiche par fiche sur la durée et la date de début.
 */
export async function chercherIresa(ctx: ContexteCentrale, r: ReglageIresa): Promise<Listing[]> {
  const url = `${r.reservation.replace(/\/+$/, "")}${r.chemin}`;
  const { jeton, cookies } = await formulaire(url);
  const page = await soumettre(url, cookies, corpsIresa(ctx, jeton));
  const fiches = lireIresa(page, ctx);
  const nuits = nuitsIresa(ctx.checkIn, ctx.checkOut);
  console.info(
    `[centrale] ${r.host} : ${fiches.length} hébergements à ${nuits} nuits, ${ctx.checkIn}→${ctx.checkOut}`,
  );
  return fiches.map((f) => enListing(f, r, ctx));
}
