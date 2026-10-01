/**
 * La vérification des grilles contre Skiinfo.
 *
 * Skiinfo publie, station par station, une journée, un « forfait semaine » et
 * un forfait saison, sans période. Ce n'est pas une source de prix de séjour :
 * ses fiches datent parfois de plusieurs saisons, et leur périmètre n'est pas
 * dit (la fiche « Châtel » donne le forfait Espace Liberté, 295 € la semaine,
 * pas les Portes du Soleil, 373 € en caisse). C'est en revanche un témoin
 * indépendant : une grille relevée qui s'en écarte de plus de 30 % sur la
 * journée ou le 6 jours adulte est à regarder de près (colonne mal lue,
 * périmètre confondu, tarif de groupe pris pour un tarif public).
 *
 * Rien ici ne modifie une grille : la vérification dit des écarts, pour le
 * rapport. Fonctions pures.
 *
 * Chargé tel quel par `node --experimental-strip-types` : aucun alias `@/`.
 */

import type { ForfaitVue } from "../monde/vues.ts";
import { ECART_SIGNALE } from "./controle.ts";
import { grillesDepuisVue, perimetre } from "./migration.ts";
import { raccorder, type DomaineMonde, type StationARaccorder } from "./raccordement.ts";
import type { Canal, GrilleTarifaire, Tarif } from "./tarifsPeriode.ts";

/** Une fiche de `monde/data/forfaitsSkiinfo.json`. */
export type FicheSkiinfo = {
  cle: string;
  nom: string | null;
  pays?: string;
  devise: string | null;
  deviseSource: string | null;
  misAJour: string | null;
  categories: ForfaitVue["categories"];
  lignes: ForfaitVue["lignes"];
  saison: ForfaitVue["saison"];
};

/** Une fiche de `monde/data/skiinfo.json` : où elle est. Le pays s'écrit
 *  « FR-FR », « CH-CH » ou « IT ». */
export type PositionSkiinfo = { nom: string; lat: number; lon: number; pays: string | null };

/* ---------- La grille témoin ---------- */

/**
 * La grille d'une fiche Skiinfo, pour la saison la plus récente qu'elle
 * publie : mêmes règles que la migration (`grillesDepuisVue`), « Forfait
 * semaine » compris.
 */
export function grilleSkiinfo(
  f: FicheSkiinfo,
  stationIds: readonly string[],
  releveLe: string | null,
): GrilleTarifaire | null {
  const vue: ForfaitVue = {
    source: "skiinfo",
    cle: f.cle,
    nom: f.nom,
    km: 0,
    devise: f.devise,
    deviseSource: f.deviseSource,
    deviseDuPays: null,
    misAJour: f.misAJour,
    categories: f.categories,
    lignes: f.lignes,
    saison: f.saison,
    periodes: null,
  };
  const grilles = grillesDepuisVue(vue, {
    mondeId: f.cle,
    perimetre: perimetre("station", f.nom ?? f.cle, f.cle),
    stationIds,
    releveLe,
  });
  return grilles[grilles.length - 1] ?? null;
}

/**
 * La fiche Skiinfo de chaque station, par le même raccordement que la
 * migration (`raccordement.ts`) : le domaine dans 25 km, le nom dans 10 km,
 * ou la fiche à moins de 2 km. Seules comptent les fiches françaises qui
 * publient une grille.
 */
export function fichesDesStations(
  stations: readonly StationARaccorder[],
  fiches: Readonly<Record<string, FicheSkiinfo>>,
  positions: Readonly<Record<string, PositionSkiinfo>>,
): Map<string, { cle: string; km: number; par: string }> {
  const aUneGrille = (cle: string) =>
    (fiches[cle]?.lignes ?? []).some((l) => l.prix.some((p) => p != null && p > 0)) ||
    (fiches[cle]?.saison?.prix ?? []).some((p) => p != null && p > 0);
  const domaines: DomaineMonde[] = Object.entries(positions)
    .filter(([cle, p]) => !!p.pays?.startsWith("FR") && !!fiches[cle] && Number.isFinite(p.lat))
    .map(([cle, p]) => ({ id: cle, nom: p.nom, lat: p.lat, lon: p.lon }));
  const out = new Map<string, { cle: string; km: number; par: string }>();
  for (const s of stations) {
    const r = raccorder(s, domaines, aUneGrille);
    if (r && aUneGrille(r.id)) out.set(s.id, { cle: r.id, km: r.km, par: r.par });
  }
  return out;
}

/* ---------- La comparaison ---------- */

const ORDRE_CANAL: Canal[] = ["caisse", "non-precise", "en-ligne"];

const joursDe = (t: Tarif) =>
  t.duree.type === "jours" ? t.duree.jours : t.duree.type === "semaine" ? 6 : null;

/**
 * La fourchette d'un forfait adulte ordinaire sur toutes les périodes d'une
 * grille, au meilleur canal publié (caisse, puis non précisé, puis en ligne).
 * « Forfait semaine » vaut 6 jours.
 */
export function fourchetteAdulte(
  g: GrilleTarifaire,
  jours: number,
): { min: number; max: number } | null {
  const tarifs = g.periodes
    .flatMap((p) => p.tarifs)
    .filter(
      (t) =>
        t.categorie === "adulte" &&
        t.restriction == null &&
        !t.estime &&
        t.prix > 0 &&
        joursDe(t) === jours,
    );
  for (const canal of ORDRE_CANAL) {
    const prix = tarifs.filter((t) => t.canal === canal).map((t) => t.prix);
    if (prix.length) return { min: Math.min(...prix), max: Math.max(...prix) };
  }
  return null;
}

export type Comparaison = {
  jours: 1 | 6;
  notre: { min: number; max: number };
  /** Le prix du témoin (le haut de sa fourchette). */
  temoin: number;
  /** L'écart relatif au prix du témoin, 0 quand il tombe dans la fourchette. */
  ecart: number;
};

export type Confrontation = {
  grille: string;
  perimetre: string;
  /** Le site témoin : « Skiinfo », « skiresort.fr », « skipass.com ». */
  site: string;
  fiche: string;
  saisonTemoin: string;
  comparaisons: Comparaison[];
  /** Un écart au-delà de `ECART_SIGNALE` : à vérifier. */
  alerte: boolean;
};

/** Le nom d'un site témoin, tel qu'on l'écrit dans un rapport. */
export const SITE_TEMOIN: Partial<Record<GrilleTarifaire["source"]["origine"], string>> = {
  skiinfo: "Skiinfo",
  skiresort: "skiresort.fr",
  skipass: "skipass.com",
  bergfex: "bergfex",
};

/**
 * Une grille face à une grille témoin (Skiinfo, skiresort.fr, skipass.com) :
 * la journée et le 6 jours adulte, quand les deux les publient. `null` si rien
 * ne se compare (devises différentes, aucune durée commune).
 */
export function confronter(g: GrilleTarifaire, temoin: GrilleTarifaire): Confrontation | null {
  const devise = (x: GrilleTarifaire) => x.periodes[0]?.tarifs[0]?.devise ?? null;
  if (devise(g) && devise(temoin) && devise(g) !== devise(temoin)) return null;
  const comparaisons: Comparaison[] = [];
  for (const jours of [1, 6] as const) {
    const notre = fourchetteAdulte(g, jours);
    const t = fourchetteAdulte(temoin, jours);
    if (!notre || !t) continue;
    const s = t.max;
    const ecart = s < notre.min ? (notre.min - s) / s : s > notre.max ? (s - notre.max) / s : 0;
    comparaisons.push({ jours, notre, temoin: s, ecart: Math.round(ecart * 10000) / 10000 });
  }
  if (!comparaisons.length) return null;
  return {
    grille: g.id,
    perimetre: g.perimetre.nom,
    site: SITE_TEMOIN[temoin.source.origine] ?? temoin.source.origine,
    fiche: temoin.source.libelle,
    saisonTemoin: temoin.saison,
    comparaisons,
    alerte: comparaisons.some((c) => c.ecart > ECART_SIGNALE),
  };
}

const eur = (n: number) => `${String(n).replace(".", ",")} €`;
const fourchette = (f: { min: number; max: number }) =>
  f.min === f.max ? eur(f.min) : `${eur(f.min)} à ${eur(f.max)}`;

/** Une confrontation en une ligne, pour le rapport. */
export function texteConfrontation(c: Confrontation): string {
  const parties = c.comparaisons.map(
    (x) =>
      `${x.jours === 1 ? "journée" : "6 jours"} adulte ${fourchette(x.notre)}, ${c.site} ${eur(x.temoin)}${x.ecart ? ` (écart ${Math.round(x.ecart * 100)} %)` : ""}`,
  );
  return `${c.perimetre} (${c.grille}) face à ${c.fiche}, saison ${c.saisonTemoin} : ${parties.join(" ; ")}${c.alerte ? " : à vérifier" : ""}`;
}

/**
 * Les vérifications d'une grille contre un témoin : une confrontation par
 * fiche du témoin que ses stations touchent (une grille de domaine en touche
 * souvent plusieurs, chacune avec son propre périmètre). Une grille ne se
 * vérifie pas contre sa propre source.
 */
export function verifierGrille(
  g: GrilleTarifaire,
  ficheDe: (stationId: string) => string | null,
  temoinDe: (cle: string) => GrilleTarifaire | null,
): Confrontation[] {
  const vues = new Set<string>();
  const out: Confrontation[] = [];
  for (const id of g.stationIds) {
    const cle = ficheDe(id);
    if (!cle || vues.has(cle)) continue;
    vues.add(cle);
    const t = temoinDe(cle);
    // Une grille ne se vérifie pas contre sa propre source.
    if (!t || t.source.origine === g.source.origine) continue;
    const c = confronter(g, t);
    if (c) out.push(c);
  }
  return out;
}
