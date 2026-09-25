/**
 * Le moteur Open System, partie réseau.
 *
 * L'analyse vit dans `openSystem.ts`, qui ne touche pas au réseau et se teste
 * sur un fragment figé. Ici, on appelle, et on rend compte.
 *
 * **`robots.txt` d'abord, chemin par chemin.** Le fichier est lu une fois par
 * hôte et retenu une heure (`robots.server.ts`). Un Disallow est journalisé,
 * l'appel part quand même. Un fichier illisible n'arrête pas non plus.
 *
 * **Un en-tête de navigateur.** La requête part sous `UA_NAVIGATEUR`
 * (`navigateur.ts`), comme tout le relevé. Les règles de `robots.txt` se
 * lisent toujours sous `AGENT_CENTRALES`, un nom qui ne part pas dans la
 * requête. Un Disallow est lu et journalisé, l'appel part quand même. La
 * centrale de Haute Maurienne Vanoise répondait au nom de l'agent exactement
 * comme à celui d'un navigateur : relevé du 13 septembre 2026, 200 et
 * cinquante prix dans les deux cas.
 *
 * **Plusieurs rubriques, parce qu'une seule ne suffit pas.** Le moteur plafonne
 * à cinquante fiches par page et sa pagination ne répond pas. Interroger
 * plusieurs rubriques d'une centrale plutôt que sa seule page « tous nos
 * hébergements » fait passer le relevé de cinquante à cent sept logements
 * distincts — relevé du 13 septembre 2026 sur Haute Maurienne Vanoise, où trois
 * des huit rubriques d'alors donnaient à elles seules ce compte. Les
 * rubriques se recouvrent largement, et c'est sans importance : ce qui compte
 * est que chacune apporte ses cinquante premières, et qu'elles ne soient pas
 * les mêmes. Chaque centrale déclare ses rubriques dans son propre fichier.
 */

import type { Listing } from "@/lib/listings";
import { annoncer } from "@/lib/stay/occupancy";
import { UA_NAVIGATEUR } from "../../navigateur";
import { phrasesRegle } from "../regleTypes";
import { centraleAutorise } from "../robots.server";
import type { ContexteCentrale } from "../types";
import {
  appliquerRegleOpenSystem,
  lireOpenSystem,
  urlOpenSystem,
  type FicheOpenSystem,
} from "./openSystem";

// L'en-tête d'un navigateur, comme tout le relevé (`navigateur.ts`). Les règles
// de robots.txt se lisent toujours sous `AGENT_CENTRALES` (`../robots.server`).
const UA = UA_NAVIGATEUR;
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
  /**
   * Parmi elles, celles dont l'intitulé ne désigne que des logements que la
   * règle du propriétaire garde (« appartements de particuliers »). Une fiche
   * sans type publié qui y paraît est gardée ; ailleurs, elle est écartée
   * (`horsRegleOpenSystem`).
   */
  rubriquesDeLocation?: readonly string[];
};

/** Ce qu'une page a donné, ou pourquoi elle n'a rien donné. */
type Page = { chemin: string; fiches: FicheOpenSystem[]; refus: string | null };

async function unePage(base: string, chemin: string, ctx: ContexteCentrale): Promise<Page> {
  const url = urlOpenSystem(base, chemin, ctx);
  await centraleAutorise(url);
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
      return { chemin, fiches: [], refus: `${chemin} : la centrale a répondu ${r.status}` };
    }
    return { chemin, fiches: lireOpenSystem(await r.text()), refus: null };
  } catch (err) {
    const quoi = err instanceof Error ? err.message : String(err);
    return { chemin, fiches: [], refus: `${chemin} : ${quoi}` };
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
  // Le bloc `InfoProduit` d'abord : capacité et pièces publiées en champ
  // propre. Le type passe ensuite au lecteur de texte avec le titre, l'adresse
  // et le chemin : « Studio » y dit une pièce et aucune chambre, et un titre
  // « 3 pièces » comble ce que le bloc tait. Les chambres ne sont publiées
  // nulle part en champ propre (relevé du 25 septembre 2026).
  const occ = annoncer(
    { guests: f.capacite, bedrooms: null, rooms: f.pieces },
    f.type,
    f.titre,
    f.adresse,
    f.chemin,
  );
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
    guests: occ.guests,
    bedrooms: occ.bedrooms,
    rooms: occ.rooms,
    propertyType: f.type,
    available: true,
    photo: f.photo,
    url: `${base.replace(/\/+$/, "")}${f.chemin}?DateRecherche=${encodeURIComponent(`${ctx.checkIn}|${ctx.checkOut}`)}`,
    lat: f.lat,
    lon: f.lon,
    locality: f.commune,
    placeName: f.adresse,
    // Les mots de la centrale au-dessus de son prix, « Prix indicatif ». Ils
    // restent aussi dans la preuve ; ici, l'écran peut les citer tels quels.
    priceLabel: f.etiquette,
    proven: `${r.nom} (Open System, ${r.host}) ${ctx.checkIn}→${ctx.checkOut}, ${ctx.guests} pers.${
      f.etiquette ? ` — étiquette de la centrale : « ${f.etiquette} »` : ""
    }${f.classement ? ` — classement publié : ${f.classement}` : ""}`,
  };
}

/**
 * Interroge une centrale Open System.
 *
 * Lève quand aucune rubrique n'a pu être appelée, avec le motif de la première :
 * `run.server.ts` en fait un rapport de source en échec, et l'écran dit
 * pourquoi. Un relevé partiel, lui, ne lève pas : quelques rubriques muettes
 * n'annulent pas celles qui ont répondu.
 *
 * Les fiches hors de la règle du propriétaire (`appliquerRegleOpenSystem` :
 * camping, hôtel, insolite, ou sans type publié hors des rubriques de location)
 * ne deviennent pas des annonces ; leur nombre, par motif, est écrit au journal,
 * comme celui des fiches gardées sous un type publié que la règle ne connaît pas.
 */
export async function chercherOpenSystem(ctx: ContexteCentrale, r: ReglageOpenSystem): Promise<Listing[]> {
  const base = ctx.base.replace(/\/+$/, "");
  const pages = await toutesLesPages(base, ctx, r.rubriques);
  const refus = pages.filter((p) => p.refus != null).map((p) => p.refus as string);
  if (refus.length === pages.length) {
    throw new Error(refus[0] ?? "aucune rubrique déclarée");
  }
  const { gardees, ecartees, inconnus } = appliquerRegleOpenSystem(pages, r.rubriquesDeLocation);
  const par = new Map<string, Listing>();
  for (const f of gardees) {
    const l = enListing(f, base, r, ctx);
    const deja = par.get(l.id);
    // Le même logement paraît sous plusieurs rubriques : le moins cher
    // l'emporte. Zéro n'est pas moins cher, c'est l'absence de prix, et une
    // rubrique qui en publie un remplace toujours celle qui se tait.
    if (!deja || (l.total > 0 && (deja.total <= 0 || l.total < deja.total))) par.set(l.id, l);
  }
  if (refus.length > 0) {
    console.warn(`[centrale] ${r.host} : ${refus.length} rubrique(s) muette(s) — ${refus.join(" ; ")}`);
  }
  const compte = (m: Map<string, Set<string>>) => new Map([...m].map(([k, s]) => [k, s.size]));
  for (const phrase of phrasesRegle(compte(ecartees), compte(inconnus))) {
    console.info(`[centrale] ${r.host} : ${phrase}`);
  }
  return [...par.values()];
}
