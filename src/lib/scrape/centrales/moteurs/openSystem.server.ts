/**
 * Le moteur Open System, partie réseau.
 *
 * L'analyse vit dans `openSystem.ts`, qui ne touche pas au réseau et se teste
 * sur un fragment figé. Ici, on appelle, et on rend compte.
 *
 * **`robots.txt` d'abord, chemin par chemin.** Le fichier est lu une fois par
 * hôte et retenu une heure (`robots.server.ts`). Un chemin interdit n'est pas
 * appelé ; un `robots.txt` illisible ne vaut pas autorisation et fait renoncer.
 * Dans les deux cas la raison remonte en clair jusqu'à l'écran, qui l'écrit au
 * lieu d'afficher un vide.
 *
 * **On se nomme.** L'agent envoyé est celui sur lequel porte la vérification
 * `robots.txt`. Vérifier les règles sous un nom et appeler sous un autre serait
 * se réclamer d'une permission qu'on ne demande pas. La centrale de Haute
 * Maurienne Vanoise répond à ce nom exactement comme à celui d'un navigateur :
 * relevé du 13 septembre 2026, 200 et cinquante prix dans les deux cas.
 *
 * **Plusieurs rubriques, parce qu'une seule ne suffit pas.** Le moteur plafonne
 * à cinquante fiches par page et sa pagination ne répond pas. Interroger les
 * huit rubriques d'une centrale plutôt que sa seule page « tous nos
 * hébergements » fait passer le relevé de cinquante à cent sept logements
 * distincts — relevé du 13 septembre 2026 sur Haute Maurienne Vanoise. Les
 * rubriques se recouvrent largement, et c'est sans importance : ce qui compte
 * est que chacune apporte ses cinquante premières, et qu'elles ne soient pas
 * les mêmes. Chaque centrale déclare ses rubriques dans son propre fichier.
 */

import type { Listing } from "@/lib/listings";
import { AGENT_CENTRALES } from "../robots";
import { centraleAutorise } from "../robots.server";
import type { ContexteCentrale } from "../types";
import { lireOpenSystem, urlOpenSystem, type FicheOpenSystem } from "./openSystem";

const UA = `${AGENT_CENTRALES}/1.0 (+https://skitrack.local/robots)`;
const TIMEOUT_MS = 25_000;
/** Requêtes menées de front sur un même hôte. Trois, c'est une page ordinaire. */
const FRONT = 3;

export type ReglageOpenSystem = {
  /** Hôte, tel que `centrales.data.json` l'écrit. */
  host: string;
  /** Nom de la centrale, pour l'écran. */
  nom: string;
  /** Jeton court et stable, qui entre dans l'identifiant des annonces. */
  cle: string;
  /** Les rubriques à interroger, chemins absolus commençant par `/`. */
  rubriques: readonly string[];
};

/** Ce qu'une page a donné, ou pourquoi elle n'a rien donné. */
type Page = { fiches: FicheOpenSystem[]; refus: string | null };

async function unePage(base: string, chemin: string, ctx: ContexteCentrale): Promise<Page> {
  const url = urlOpenSystem(base, chemin, ctx);
  const verdict = await centraleAutorise(url);
  if (verdict.autorise !== true) {
    const cause = verdict.autorise === null ? verdict.regle : `robots.txt dit « ${verdict.regle} »`;
    return { fiches: [], refus: `${chemin} : ${cause}` };
  }
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
      return { fiches: [], refus: `${chemin} : la centrale a répondu ${r.status}` };
    }
    return { fiches: lireOpenSystem(await r.text()), refus: null };
  } catch (err) {
    const quoi = err instanceof Error ? err.message : String(err);
    return { fiches: [], refus: `${chemin} : ${quoi}` };
  } finally {
    clearTimeout(minuteur);
  }
}

/** Mène les appels trois par trois, dans l'ordre des rubriques déclarées. */
async function toutesLesPages(base: string, ctx: ContexteCentrale, rubriques: readonly string[]): Promise<Page[]> {
  const sorties: Page[] = new Array<Page>(rubriques.length);
  let curseur = 0;
  const ouvrier = async (): Promise<void> => {
    for (;;) {
      const i = curseur;
      curseur += 1;
      const chemin = rubriques[i];
      if (chemin === undefined) return;
      sorties[i] = await unePage(base, chemin, ctx);
    }
  };
  await Promise.all(Array.from({ length: Math.min(FRONT, rubriques.length) }, ouvrier));
  return sorties;
}

function enListing(f: FicheOpenSystem, base: string, r: ReglageOpenSystem, ctx: ContexteCentrale): Listing {
  return {
    // L'identifiant porte l'identité sans rubrique, pas le chemin : le même
    // logement trouvé sous « tous nos hébergements » et sous « hôtels » doit
    // être la même annonce, sinon il occupe deux fois la liste et la carte.
    id: `os-${r.cle}-${f.identite.replace(/\//g, "_")}`,
    stationId: ctx.stationId,
    title: f.titre,
    source: "Centrale",
    total: f.total,
    currency: "EUR",
    // La fiche de résultat n'annonce ni capacité ni nombre de chambres. La
    // recherche a bien porté sur `nbpers`, donc le logement accueille le
    // groupe ; mais combien il en accueille au plus, la centrale ne le dit pas
    // ici, et l'inventer serait pire que de laisser vide.
    guests: null,
    bedrooms: null,
    available: true,
    photo: f.photo,
    url: `${base.replace(/\/+$/, "")}${f.chemin}?DateRecherche=${encodeURIComponent(`${ctx.checkIn}|${ctx.checkOut}`)}`,
    lat: f.lat,
    lon: f.lon,
    locality: f.commune,
    placeName: f.adresse,
    proven: `${r.nom} (Open System, ${r.host}) ${ctx.checkIn}→${ctx.checkOut}, ${ctx.guests} pers.${
      f.etiquette ? ` — étiquette de la centrale : « ${f.etiquette} »` : ""
    }`,
  };
}

/**
 * Interroge une centrale Open System.
 *
 * Lève quand aucune rubrique n'a pu être appelée, avec le motif de la première :
 * `run.server.ts` en fait un rapport de source en échec, et l'écran dit
 * pourquoi. Un relevé partiel, lui, ne lève pas : quelques rubriques muettes
 * n'annulent pas celles qui ont répondu.
 */
export async function chercherOpenSystem(ctx: ContexteCentrale, r: ReglageOpenSystem): Promise<Listing[]> {
  const base = ctx.base.replace(/\/+$/, "");
  const pages = await toutesLesPages(base, ctx, r.rubriques);
  const refus = pages.filter((p) => p.refus != null).map((p) => p.refus as string);
  if (refus.length === pages.length) {
    throw new Error(refus[0] ?? "aucune rubrique déclarée");
  }
  const par = new Map<string, Listing>();
  for (const p of pages) {
    for (const f of p.fiches) {
      const l = enListing(f, base, r, ctx);
      const deja = par.get(l.id);
      if (!deja || l.total < deja.total) par.set(l.id, l);
    }
  }
  if (refus.length > 0) {
    console.warn(`[centrale] ${r.host} : ${refus.length} rubrique(s) muette(s) — ${refus.join(" ; ")}`);
  }
  return [...par.values()];
}
