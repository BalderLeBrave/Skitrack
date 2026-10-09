/**
 * Open System, génération ancienne : appeler le catalogue et la recherche datée
 * que le widget publie. L'analyse est dans `alliance.ts`.
 *
 * Le catalogue change peu : on le garde six heures. La recherche dépend des
 * dates : on la garde trois heures, pour que la recherche suivante ne rappelle
 * pas `etape-rest`. Les pages d'une même recherche s'enchaînent, une à la fois.
 */
import type { Listing } from "@/lib/listings";
import { annoncer } from "@/lib/stay/occupancy";
import { UA_NAVIGATEUR } from "../../navigateur";
import { estMessageRefus, poserRefus, respecterCadence } from "../../gardeHote";
import { centraleAutorise } from "../robots.server";
import type { ContexteCentrale } from "../types";
import {
  blocSuivant,
  lireCatalogueAlliance,
  lireDisposAlliance,
  logementsAlliance,
  requeteAlliance,
  urlRechercheAlliance,
  type CatalogueAlliance,
  type ReponseAlliance,
} from "./alliance";

const UA = UA_NAVIGATEUR;
const TIMEOUT_MS = 25_000;
const CATALOGUE_MS = 6 * 60 * 60 * 1000;
const RECHERCHE_MS = 3 * 60 * 60 * 1000;
/** Au-delà, on rend ce qu'on a déjà. Six pages ont couvert les réponses mesurées. */
const BLOCS_MAX = 6;

const MOIS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export type ReglageAlliance = {
  host: string;
  nom: string;
  /** Jeton court, dans l'identifiant des annonces. */
  cle: string;
  /** `loginAPI` publié par le fichier d'intégration du widget. */
  login: string;
  /** `vueinfo.js` de l'onglet « Tous les hébergements ». */
  catalogue: string;
  /** Site de réservation publié, pour le lien de l'annonce. */
  site: string;
};

type Memoire<T> = { jusqua: number; valeur: T };
const catalogues = new Map<string, Memoire<CatalogueAlliance>>();
const recherches = new Map<string, Memoire<Listing[]>>();

function nuitsDe(arrivee: string, depart: string): number {
  const a = Date.parse(`${arrivee}T12:00:00Z`);
  const b = Date.parse(`${depart}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

function dateConfirmee(annoncee: string | null, arrivee: string): boolean {
  if (!annoncee) return false;
  const [annee, mois, jour] = arrivee.split("-");
  const nom = MOIS[Number(mois) - 1];
  if (!annee || !jour || !nom) return false;
  const texte = annoncee.toLowerCase();
  return texte.includes(jour) && texte.includes(annee) && texte.includes(nom);
}

async function lire(url: string): Promise<string> {
  const garde = await respecterCadence(url, 5_000);
  if (garde) throw new Error(garde);
  await centraleAutorise(url);
  const ctrl = new AbortController();
  const minuteur = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": UA, accept: "*/*", "accept-language": "fr-FR,fr;q=0.9" },
    });
    if (!r.ok) {
      await r.body?.cancel();
      poserRefus(url, r.status, r.headers);
      throw new Error(`la centrale a répondu ${r.status}`);
    }
    return await r.text();
  } finally {
    clearTimeout(minuteur);
  }
}

async function catalogueDe(url: string): Promise<CatalogueAlliance> {
  const deja = catalogues.get(url);
  if (deja && deja.jusqua > Date.now()) return deja.valeur;
  const valeur = lireCatalogueAlliance(await lire(url));
  catalogues.set(url, { jusqua: Date.now() + CATALOGUE_MS, valeur });
  return valeur;
}

async function pages(r: ReglageAlliance, ctx: ContexteCentrale, vue: number, nuits: number): Promise<ReponseAlliance[]> {
  const sorties: ReponseAlliance[] = [];
  let conversation = "";
  let bloc = 0;
  for (let i = 0; i < BLOCS_MAX; i++) {
    const url = urlRechercheAlliance(
      requeteAlliance({
        login: r.login,
        vue,
        arrivee: ctx.checkIn,
        nuits,
        personnes: ctx.guests,
        conversation,
        bloc,
      }),
    );
    let reponse: ReponseAlliance;
    try {
      reponse = lireDisposAlliance(await lire(url));
    } catch (err) {
      const quoi = err instanceof Error ? err.message : String(err);
      if (sorties.length === 0 || estMessageRefus(quoi) || /limiteur local/.test(quoi)) throw err;
      console.warn(`[centrale] ${r.host} : page ${bloc} muette — ${quoi}`);
      break;
    }
    if (reponse.nuits !== nuits || !dateConfirmee(reponse.dateAnnoncee, ctx.checkIn)) {
      throw new Error(
        `la recherche a chiffré ${reponse.dateAnnoncee ?? "une autre date"} sur ${reponse.nuits ?? "?"} nuits, pas le séjour demandé`,
      );
    }
    sorties.push(reponse);
    const suivant = blocSuivant(bloc, reponse.rs);
    if (suivant == null || !reponse.conversation) break;
    conversation = reponse.conversation;
    bloc = suivant;
  }
  return sorties;
}

function enAnnonces(
  gardes: ReturnType<typeof logementsAlliance>["gardes"],
  r: ReglageAlliance,
  ctx: ContexteCentrale,
  nuits: number,
): Listing[] {
  return gardes.map((f) => {
    const occ = annoncer({ capacity: null, bedrooms: null, rooms: null }, null, f.titre);
    return {
      id: `al-${r.cle}-${f.cle.replace(/[^a-zA-Z0-9]+/g, "_")}`,
      stationId: ctx.stationId,
      title: f.titre,
      source: "Centrale",
      total: f.total,
      currency: "EUR",
      capacity: occ.capacity,
      bedrooms: occ.bedrooms,
      rooms: occ.rooms,
      capacityStandard: occ.capacityStandard,
      capacitySource: occ.capacitySource,
      bedroomsSource: occ.bedroomsSource,
      isStudio: occ.isStudio,
      propertyType: null,
      available: true,
      photo: null,
      url: r.site.replace(/\/+$/, "/"),
      lat: f.lat,
      lon: f.lon,
      locality: null,
      placeName: null,
      proven: `${r.nom} (Open System, ${r.host}) ${ctx.checkIn}→${ctx.checkOut}, ${nuits} nuits. Total daté publié par la recherche du widget, login « ${r.login} ». Le résumé répond pour 2 adultes : le montant suit la durée, pas le nombre de personnes.`,
    };
  });
}

/** Interroge une centrale dont le widget Alliance publie un `loginAPI`. */
export async function chercherAlliance(ctx: ContexteCentrale, r: ReglageAlliance): Promise<Listing[]> {
  const nuits = nuitsDe(ctx.checkIn, ctx.checkOut);
  if (nuits < 1) throw new Error("dates de séjour illisibles");
  const cle = `${r.login}|${r.catalogue}|${ctx.checkIn}|${ctx.checkOut}|${ctx.guests}`;
  const deja = recherches.get(cle);
  if (deja && deja.jusqua > Date.now()) return deja.valeur.map((l) => ({ ...l, stationId: ctx.stationId }));
  const catalogue = await catalogueDe(r.catalogue);
  const recues = await pages(r, ctx, catalogue.id, nuits);
  const fusion: ReponseAlliance = {
    total: recues[0]?.total ?? null,
    nuits,
    dateAnnoncee: recues[0]?.dateAnnoncee ?? null,
    conversation: "",
    rs: -1,
    dispos: recues.flatMap((p) => p.dispos),
  };
  const { gardes, ecartes } = logementsAlliance(catalogue, fusion);
  if (ecartes.size > 0) {
    const texte = [...ecartes].map(([m, n]) => `${m} (${n})`).join(", ");
    console.info(`[centrale] ${r.host} : écartés hors règle — ${texte}`);
  }
  const annonces = enAnnonces(gardes, r, ctx, nuits);
  recherches.set(cle, { jusqua: Date.now() + RECHERCHE_MS, valeur: annonces });
  return annonces;
}
