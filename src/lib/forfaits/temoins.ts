/**
 * Les témoins d'une grille : les agrégateurs contre lesquels un prix relevé
 * est vérifié (`verification.ts`), jamais une source de prix de séjour.
 *
 * - **Skiinfo** : journée, semaine, saison, sans période (`verification.ts`) ;
 * - **skiresort.fr** : le forfait journée « haute saison », adulte, jeune et
 *   enfant (`monde/data/forfaits.json`, relevé en dépôt) ;
 * - **skipass.com** : une page « Prix des forfaits » par station, demi-journée,
 *   journée, semaine, saison, adulte, enfant, étudiant, souvent en fourchette
 *   (« 53 € - 56 € »), avec la période de validité et la date de mise à jour.
 *   Une soixantaine de stations françaises seulement, dont beaucoup sans prix
 *   (liste lue le 30 septembre 2026).
 *
 * **France Montagnes n'est pas témoin** : ses fiches station ne publient aucun
 * prix de forfait (description, webcams, activités ; vérifié le 30 septembre
 * 2026).
 *
 * Fonctions pures ; les relevés sont dans `scripts/`.
 *
 * Chargé tel quel par `node --experimental-strip-types` : aucun alias `@/`.
 */

import { categorieDepuisLibelle, dureeDepuisLibelle, perimetre } from "./migration.ts";
import { plier } from "./periodesFr.ts";
import { raccorder, type DomaineMonde, type StationARaccorder } from "./raccordement.ts";
import { decoderEntites } from "./texteStructure.ts";
import {
  periodeSaisonEntiere,
  saisonDeJour,
  type CategorieTarif,
  type GrilleTarifaire,
  type Tarif,
} from "./tarifsPeriode.ts";

/* ---------- Rattachement d'une station à la fiche d'un témoin ---------- */

export type Position = { nom: string; lat: number; lon: number };

/**
 * La fiche d'un témoin pour chaque station, par le raccordement de la
 * migration (`raccordement.ts`) : le domaine dans 25 km, le nom dans 10 km, ou
 * la fiche à moins de 2 km. Seules comptent les fiches qui publient un prix.
 */
export function rattacherAuxFiches(
  stations: readonly StationARaccorder[],
  positions: Readonly<Record<string, Position>>,
  aUnPrix: (cle: string) => boolean,
): Map<string, { cle: string; km: number; par: string }> {
  const domaines: DomaineMonde[] = Object.entries(positions)
    .filter(([cle, p]) => aUnPrix(cle) && Number.isFinite(p.lat) && Number.isFinite(p.lon))
    .map(([cle, p]) => ({ id: cle, nom: p.nom, lat: p.lat, lon: p.lon }));
  const out = new Map<string, { cle: string; km: number; par: string }>();
  for (const s of stations) {
    const r = raccorder(s, domaines, aUnPrix);
    if (r) out.set(s.id, { cle: r.id, km: r.km, par: r.par });
  }
  return out;
}

/* ---------- skiresort.fr ---------- */

type PrixSkiresort = { valeur: number | null; devise: string | null } | null;

/** Une fiche de `monde/data/forfaits.json`. */
export type FicheSkiresort = {
  slug: string;
  nom: string;
  pays: string | null;
  /** « Forfait journalier Haute saison ». */
  libelle: string | null;
  prix: { adultes: PrixSkiresort; jeunes: PrixSkiresort; enfants: PrixSkiresort } | null;
};

export const aUnPrixSkiresort = (f: FicheSkiresort | undefined): boolean =>
  !!f?.prix && [f.prix.adultes, f.prix.jeunes, f.prix.enfants].some((p) => (p?.valeur ?? 0) > 0);

/**
 * La grille témoin d'une fiche skiresort : le forfait journée qu'elle publie,
 * en une période « saison entière » de la saison du relevé. Le site ne dit ni
 * la saison ni les dates de sa « haute saison » : c'est une référence de
 * journée, pas une grille.
 */
export function grilleSkiresort(f: FicheSkiresort, releveLe: string): GrilleTarifaire | null {
  const saison = saisonDeJour(releveLe);
  if (!f.prix || !saison) return null;
  const libelle = f.libelle ?? "Forfait journalier";
  const { duree, restriction } = dureeDepuisLibelle(libelle);
  const tarifs: Tarif[] = [];
  const cats: [PrixSkiresort, CategorieTarif, string][] = [
    [f.prix.adultes, "adulte", "Adultes"],
    [f.prix.jeunes, "junior", "Jeunes"],
    [f.prix.enfants, "enfant", "Enfants"],
  ];
  for (const [p, categorie, nom] of cats) {
    if (!p?.valeur || p.valeur <= 0 || !p.devise) continue;
    tarifs.push({
      duree,
      libelleDuree: libelle,
      categorie,
      libelleCategorie: nom,
      ages: null,
      prix: p.valeur,
      devise: p.devise,
      canal: "non-precise",
      restriction,
    });
  }
  const periode = tarifs.length ? periodeSaisonEntiere(saison, tarifs) : null;
  if (!periode) return null;
  const nom = decoderEntites(f.nom);
  return {
    id: `skiresort:${f.slug}:${saison}`,
    saison,
    perimetre: perimetre("station", nom, f.slug),
    stationIds: [],
    periodes: [periode],
    source: {
      origine: "skiresort",
      url: `https://www.skiresort.fr/domaine-skiable/${f.slug}/`,
      libelle: `skiresort.fr, fiche « ${nom} »`,
    },
    scrapeLe: releveLe,
    confiance: "faible",
    notes: ["Forfait journée « haute saison » publié par skiresort.fr, sans dates."],
  };
}

/* ---------- skipass.com ---------- */

export type Fourchette = { min: number; max: number };

/** Ce qu'une page « Prix des forfaits » de skipass.com publie. */
export type FicheSkipass = {
  slug: string;
  nom: string;
  url: string;
  /** « Prix du forfait du 01/10/2025 au 01/10/2026 », en AAAA-MM-JJ. */
  validite: { debut: string; fin: string } | null;
  /** « Dernière mise à jour le 9 décembre 2025 », telle qu'écrite. */
  maj: string | null;
  lignes: {
    /** « Demi-journée », « Journée », « Semaine », « Saison ». */
    duree: string;
    adulte: Fourchette | null;
    enfant: Fourchette | null;
    etudiant: Fourchette | null;
  }[];
};

/**
 * Les pages de prix de la liste « Prix des forfaits de ski » : chaque lien
 * `/stations/forfait-<slug>.html` avec le nom de la station.
 */
export function lireListeSkipass(html: string): { slug: string; nom: string; url: string }[] {
  const out: { slug: string; nom: string; url: string }[] = [];
  const vus = new Set<string>();
  const re =
    /href="((?:https:\/\/www\.skipass\.com)?\/stations\/forfait-([^"/]+)\.html)"[^>]*>\s*([^<]+?)\s*</g;
  for (const m of html.matchAll(re)) {
    if (vus.has(m[2])) continue;
    vus.add(m[2]);
    const url = m[1].startsWith("http") ? m[1] : `https://www.skipass.com${m[1]}`;
    out.push({ slug: m[2], nom: decoderEntites(m[3]).trim(), url });
  }
  return out;
}

const DUREE_SKIPASS = /^(demi-journee|journee|semaine|saison|\d{1,2} jours?)$/;
const CATEGORIE_SKIPASS: Record<string, "adulte" | "enfant" | "etudiant"> = {
  adulte: "adulte",
  enfant: "enfant",
  etudiant: "etudiant",
};
const MONTANT = /(\d{1,4}(?:[,.]\d{1,2})?)\s*€/g;

const nettoyer = (l: string) =>
  plier(l.replace(/^[-*#\s]+/, "").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")).trim();

function fourchette(texte: string): Fourchette | null {
  const v = [...texte.matchAll(MONTANT)].map((m) => Number(m[1].replace(",", ".")));
  if (!v.length) return null;
  return { min: Math.min(...v), max: Math.max(...v) };
}

/**
 * Une page « Prix des forfaits » de skipass.com, ramenée à des lignes
 * (`texteStructure.ts`). Le prix d'une catégorie suit son nom, sur la même
 * ligne ou la suivante ; « - » dit qu'il n'est pas publié.
 */
export function lireForfaitSkipass(
  lignes: readonly string[],
  base: { slug: string; nom: string; url: string },
): FicheSkipass {
  const fiche: FicheSkipass = { ...base, validite: null, maj: null, lignes: [] };
  let courante: FicheSkipass["lignes"][number] | null = null;
  let attente: "adulte" | "enfant" | "etudiant" | null = null;
  for (const brute of lignes) {
    const l = nettoyer(brute);
    if (!l) continue;
    const v = /prix du forfait du (\d{2})\/(\d{2})\/(\d{4}) au (\d{2})\/(\d{2})\/(\d{4})/.exec(l);
    if (v) {
      fiche.validite = { debut: `${v[3]}-${v[2]}-${v[1]}`, fin: `${v[6]}-${v[5]}-${v[4]}` };
      continue;
    }
    const maj = /derniere mise a jour (?:le )?(.+?)\.?$/.exec(l);
    if (maj) {
      fiche.maj = brute
        .replace(/^.*?[Dd]ernière mise à jour (?:\[)?(?:le )?/, "")
        .replace(/\].*$/, "")
        .replace(/\.$/, "")
        .trim();
      break;
    }
    if (DUREE_SKIPASS.test(l)) {
      courante = {
        duree: brute.replace(/^[-*#\s]+/, "").trim(),
        adulte: null,
        enfant: null,
        etudiant: null,
      };
      fiche.lignes.push(courante);
      attente = null;
      continue;
    }
    const cat = /^(adulte|enfant|etudiant)\b\s*(.*)$/.exec(l);
    if (cat && courante) {
      attente = CATEGORIE_SKIPASS[cat[1]];
      const f = fourchette(cat[2]);
      if (f || /^\\?-$/.test(cat[2].trim())) {
        courante[attente] = f;
        attente = null;
      }
      continue;
    }
    if (attente && courante) {
      courante[attente] = fourchette(l);
      attente = null;
    }
  }
  fiche.lignes = fiche.lignes.filter((x) => x.adulte || x.enfant || x.etudiant);
  return fiche;
}

/**
 * La grille témoin d'une fiche skipass.com : chaque prix publié, en une
 * période « saison entière » de la saison de sa validité. Une fourchette
 * donne deux tarifs, le bas et le haut : le site ne dit pas à quelles dates
 * chacun s'applique.
 */
export function grilleSkipass(f: FicheSkipass, releveLe: string): GrilleTarifaire | null {
  const saison = saisonDeJour(f.validite?.debut ?? releveLe);
  if (!saison) return null;
  const tarifs: Tarif[] = [];
  for (const l of f.lignes) {
    const { duree, restriction } = dureeDepuisLibelle(l.duree);
    for (const cat of ["adulte", "enfant", "etudiant"] as const) {
      const p = l[cat];
      if (!p) continue;
      for (const prix of new Set([p.min, p.max])) {
        tarifs.push({
          duree,
          libelleDuree: l.duree,
          categorie: categorieDepuisLibelle(cat),
          libelleCategorie:
            cat === "etudiant" ? "Étudiant" : cat === "adulte" ? "Adulte" : "Enfant",
          ages: null,
          prix,
          devise: "EUR",
          canal: "non-precise",
          restriction,
        });
      }
    }
  }
  const periode = tarifs.length ? periodeSaisonEntiere(saison, tarifs) : null;
  if (!periode) return null;
  return {
    id: `skipass:${f.slug}:${saison}`,
    saison,
    perimetre: perimetre("station", f.nom, f.slug),
    stationIds: [],
    periodes: [periode],
    source: { origine: "skipass", url: f.url, libelle: `skipass.com, fiche « ${f.nom} »` },
    scrapeLe: releveLe,
    confiance: "faible",
    notes: [
      f.validite
        ? `Prix publiés pour la période du ${f.validite.debut} au ${f.validite.fin}${f.maj ? `, mis à jour le ${f.maj}` : ""}.`
        : "Prix publiés sans période.",
    ],
  };
}

const cleNom = (s: string) =>
  plier(s)
    .replace(/\b(st|ste)\b/g, (m) => (m === "st" ? "saint" : "sainte"))
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * La fiche skipass.com d'une station, par le nom : l'identifiant de la
 * station égal au slug de la page, sinon le nom de la station ou de son
 * domaine égal au nom publié, sinon un nom publié qui contient celui de la
 * station (s'il n'y en a qu'un). Sans coordonnées, rien de plus : un doute
 * reste sans fiche.
 */
export function ficheSkipassDe(
  station: { id: string; name: string; domain: string | null },
  fiches: readonly { slug: string; nom: string }[],
): string | null {
  const parSlug = fiches.find((f) => cleNom(f.slug) === cleNom(station.id));
  if (parSlug) return parSlug.slug;
  const noms = [station.name, station.domain].filter((x): x is string => !!x).map(cleNom);
  const exact = fiches.find((f) => noms.includes(cleNom(f.nom)));
  if (exact) return exact.slug;
  const contient = fiches.filter((f) => {
    const n = cleNom(f.nom);
    return noms.some(
      (x) => x.length >= 5 && (` ${n} `.includes(` ${x} `) || ` ${x} `.includes(` ${n} `)),
    );
  });
  return contient.length === 1 ? contient[0].slug : null;
}
