/**
 * Les boutiques qui ne publient leur prix caisse que produit par produit.
 *
 * Châtel en est l'exemple : sa page tarifs-hiver ne montre que les prix
 * internet, plusieurs par case (un par période, sans dire lequel). Le prix
 * public en caisse n'apparaît que sur la page d'un forfait de la boutique
 * (eLiberty), pour un premier jour de ski et une catégorie : barré, à côté du
 * prix en ligne.
 *
 * Le relevé se fait donc ainsi :
 *
 * 1. le **calendrier tarifaire** publié (« 19 déc. 2026 – 08 janv. 2027 |
 *    Plein tarif ») donne les périodes et leurs bornes. Une ligne de remise
 *    (« –10 % sur les forfaits ≥ 5 jours ») est une promotion en ligne : elle
 *    découpe le calendrier, mais ne nomme pas une période quand une autre
 *    ligne la couvre ;
 * 2. un **forfait repère** (le premier produit, la première catégorie) est lu
 *    au premier jour de chaque période ; les périodes qui se suivent au même
 *    prix caisse sont réunies ;
 * 3. chaque période réunie est lue pour **toutes les durées et catégories**,
 *    à son premier jour.
 *
 * La catégorie et ses âges sont lus sur la page, jamais déduits du code
 * demandé : une boutique qui ne connaît pas un code en sert un autre sans le
 * dire.
 *
 * Tout ici est pur ; les accès au réseau sont dans `releve.ts`.
 *
 * Chargé tel quel par `node --experimental-strip-types` : aucun alias `@/`.
 */

import {
  agesDepuisTexte,
  categorieDepuisLibelle,
  dateFrancaise,
  dureeDepuisLibelle,
} from "./migration.ts";
import { periodeDepuisTexte, plier } from "./periodesFr.ts";
import { bornesSaison, type Periode, type Tarif } from "./tarifsPeriode.ts";
import { lendemain, veille } from "./vacancesScolaires.ts";

/* ---------- Calendrier tarifaire ---------- */

export type SegmentCalendrier = {
  /** Le tarif applicable, tel que publié : « Plein tarif ». */
  libelle: string;
  debut: string;
  fin: string;
  /** Une remise en ligne plutôt qu'un tarif : « –10 % sur les forfaits ≥ 5 jours ». */
  promotion: boolean;
};

const PROMOTION = /%|remise|reduction|promo|early/;
const PRIX = /€|\d+[,.]\d{2}\b/;

const cellules = (l: string) =>
  l
    .split("|")
    .slice(1, -1)
    .map((c) => c.trim());

const jours = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

/**
 * Le calendrier tarifaire d'une page : les lignes de tableau dont la première
 * case est une plage de dates et la deuxième un tarif sans montant.
 *
 * Rend des segments qui ne se chevauchent pas, dans l'ordre des dates. Chaque
 * segment prend le libellé de la ligne qui le couvre : un tarif plutôt qu'une
 * promotion, puis la plus courte. Une borne ouverte (« Avant le 19 décembre »,
 * « 20 mars – fin de saison ») est ramenée aux dates que le calendrier écrit :
 * ce qui tombe au-delà n'est pas relevé, et c'est dit.
 */
export function calendrierTarifaire(
  lignes: readonly string[],
  saison: string,
): { segments: SegmentCalendrier[]; problemes: string[] } {
  const problemes: string[] = [];
  const b = bornesSaison(saison);
  if (!b) return { segments: [], problemes: [`saison illisible : ${saison}`] };
  type Ligne = SegmentCalendrier & { quand: string; ouvertDebut: boolean; ouvertFin: boolean };
  const lues: Ligne[] = [];
  for (const l of lignes) {
    if (!l.startsWith("|")) continue;
    const [quand, tarif] = cellules(l);
    if (!quand || !tarif || PRIX.test(quand) || PRIX.test(tarif)) continue;
    const p = periodeDepuisTexte(quand, saison);
    if (!p || p.nature !== "dates") continue;
    for (const plage of p.plages) {
      lues.push({
        libelle: tarif,
        debut: plage.debut,
        fin: plage.fin,
        promotion: PROMOTION.test(plier(tarif)),
        quand,
        ouvertDebut: p.ouverte && plage.debut === b.debut,
        ouvertFin: p.ouverte && plage.fin === b.fin,
      });
    }
  }
  if (!lues.length) return { segments: [], problemes: ["aucun calendrier tarifaire lu"] };

  // Les bornes ouvertes ramenées aux dates écrites.
  const debuts = lues
    .filter((l) => !l.ouvertDebut)
    .map((l) => l.debut)
    .sort();
  const fins = lues
    .filter((l) => !l.ouvertFin)
    .map((l) => l.fin)
    .sort();
  const lignesCal: Ligne[] = [];
  for (const l of lues) {
    const debut = l.ouvertDebut && debuts.length ? debuts[0] : l.debut;
    const fin = l.ouvertFin && fins.length ? fins[fins.length - 1] : l.fin;
    if (debut > fin || (l.ouvertDebut && l.ouvertFin)) {
      problemes.push(`« ${l.quand} » (${l.libelle}) : borne non publiée, période non relevée`);
      continue;
    }
    lignesCal.push({ ...l, debut, fin });
  }

  // Les segments élémentaires, entre deux bornes consécutives.
  const coupures = [...new Set(lignesCal.flatMap((l) => [l.debut, lendemain(l.fin)]))].sort();
  const segments: SegmentCalendrier[] = [];
  for (let i = 0; i + 1 < coupures.length; i += 1) {
    const debut = coupures[i];
    const fin = veille(coupures[i + 1]);
    const couvrantes = lignesCal.filter((l) => l.debut <= debut && fin <= l.fin);
    if (!couvrantes.length) continue;
    const choisie = couvrantes.sort(
      (x, y) =>
        Number(x.promotion) - Number(y.promotion) ||
        jours(x.debut, x.fin) - jours(y.debut, y.fin) ||
        (x.debut < y.debut ? 1 : -1),
    )[0];
    const avant = segments[segments.length - 1];
    if (avant && avant.libelle === choisie.libelle && lendemain(avant.fin) === debut)
      avant.fin = fin;
    else segments.push({ libelle: choisie.libelle, debut, fin, promotion: choisie.promotion });
  }
  return { segments, problemes };
}

/* ---------- Page d'un produit ---------- */

export type ProduitLu = {
  /** « 6 Jours-Portes Du Soleil - Portes Du Soleil ». */
  produit: string;
  /** « 6 Jours ». */
  libelleDuree: string;
  /** « Senior », variante (« web », « 15 ») retirée. */
  nomCategorie: string;
  /** « 65 - 74 », tel que publié. */
  agesTexte: string | null;
  /** Le premier jour de validité, AAAA-MM-JJ. */
  premierJour: string | null;
  /** Le prix public, en caisse : le prix réel du panier, celui que le
   *  récapitulatif barre quand une remise en ligne s'applique. */
  prixPublic: number;
  /** Le prix payé en ligne ce jour-là (remises comprises). */
  prixEnLigne: number;
  devise: string;
};

const MONTANT = /(-?)\s*(\d{1,3}(?:[\s\u00a0\u202f]\d{3})*(?:[,.]\d{1,2})?)\s*(€|EUR|CHF)/g;
const nombre = (s: string) => Number(s.replace(/[\s\u00a0\u202f]/g, "").replace(",", "."));

type Montant = { valeur: number; negatif: boolean; devise: string };

function montants(ligne: string): Montant[] {
  return [...ligne.matchAll(MONTANT)].map((m) => ({
    valeur: nombre(m[2]),
    negatif: m[1] === "-",
    devise: m[3] === "€" ? "EUR" : m[3],
  }));
}

/** Le titre d'un forfait dans le panier : « 6 Jours-Portes Du Soleil - … ». */
const TITRE = /^(\d{1,2}\s*(?:jours?|heures?))\s*-\s*(.+)$/i;
/** La catégorie sous le titre : « Adulte web (26 - 64) », « Senior 15 (65 et +) ». */
const CATEGORIE = /^(\p{L}[\p{L}' ]*?)(?:\s+(?:web|\d{1,3}))*\s*\(([^)]*)\)\s*$/u;
/** La même, en fin de titre quand le panier les écrit sur une ligne : un mot. */
const CATEGORIE_EN_FIN = /\s(\p{L}+)(?:\s+(?:web|\d{1,3}))*\s*\(([^)]*)\)\s*$/u;

/**
 * Ce qu'une page produit dit du forfait choisi : sa durée, sa catégorie, son
 * premier jour, son prix public et son prix en ligne. `null` si la page ne
 * montre pas de panier lisible (produit épuisé, date non vendue, catégorie
 * inconnue de la boutique).
 */
export function lireProduit(lignes: readonly string[]): ProduitLu | null {
  // Le panier : le titre, la catégorie, puis le prix réel, la remise, le total.
  let i = lignes.findIndex((l) => TITRE.test(l.replace(/^#+\s*/, "")));
  if (i < 0) return null;
  const titre = lignes[i].replace(/^#+\s*/, "");
  const t = TITRE.exec(titre)!;
  let cat = CATEGORIE_EN_FIN.exec(t[2]);
  let produit = titre;
  if (cat) {
    // Titre et catégorie sur la même ligne.
    produit = `${t[1]}-${t[2].slice(0, cat.index).trim()}`;
  } else {
    i += 1;
    cat = CATEGORIE.exec((lignes[i] ?? "").trim());
    if (!cat) return null;
  }
  const suite: Montant[] = [];
  for (let k = i + 1; k < lignes.length && k <= i + 8; k += 1) {
    suite.push(...montants(lignes[k]));
    if (/sous-total|total panier/i.test(lignes[k])) break;
  }
  const positifs = suite.filter((m) => !m.negatif);
  if (!positifs.length) return null;
  // Le prix réel, puis (s'il y a une remise) le prix payé.
  const reel = positifs[0];
  const paye = positifs.length > 1 ? positifs[1] : reel;

  const validite = lignes.find((l) =>
    /^(?:du|le)\s+\p{L}+\s+\d{1,2}\s+\p{L}+\.?\s+\d{4}/iu.test(l.trim()),
  );
  return {
    produit,
    libelleDuree: t[1].replace(/\s+/g, " "),
    nomCategorie: cat[1].trim(),
    agesTexte: cat[2].trim() || null,
    premierJour: validite ? dateFrancaise(validite) : null,
    prixPublic: reel.valeur,
    prixEnLigne: Math.min(paye.valeur, reel.valeur),
    devise: reel.devise,
  };
}

/** L'adresse d'un produit pour un premier jour et un code de catégorie. */
export function adresseProduit(modele: string, date: string, categorie: string): string {
  return modele.replace("{date}", date).replace("{categorie}", encodeURIComponent(categorie));
}

/** Le tarif en caisse d'un produit lu. */
export function tarifDuProduit(p: ProduitLu): Tarif {
  const ages = p.agesTexte
    ? agesDepuisTexte(p.agesTexte.replace(/\s*et\s*\+|\s*ans?\b/gi, "+"))
    : null;
  const agesLbl = p.agesTexte ? p.agesTexte.replace(/\s*-\s*/g, "-") : null;
  return {
    duree: dureeDepuisLibelle(p.libelleDuree).duree,
    libelleDuree: p.libelleDuree,
    categorie: categorieDepuisLibelle(p.nomCategorie),
    libelleCategorie: agesLbl ? `${p.nomCategorie} ${agesLbl}` : p.nomCategorie,
    ages,
    prix: p.prixPublic,
    devise: p.devise,
    canal: "caisse",
    restriction: null,
  };
}

/* ---------- Périodes au même prix ---------- */

export type PeriodeBoutique = { libelle: string; debut: string; fin: string };

/**
 * Les segments du calendrier réunis quand ils se suivent au même prix caisse
 * du forfait repère. Le libellé d'une période réunie est celui de ses tarifs
 * (« Plein tarif »), les promotions en ligne n'en faisant pas partie ; faute
 * de tarif, celui de ses promotions. Un segment sans prix lu est écarté.
 */
export function periodesAuMemePrix(
  segments: readonly SegmentCalendrier[],
  prixRepere: readonly (number | null)[],
): PeriodeBoutique[] {
  const groupes: { segs: SegmentCalendrier[]; prix: number }[] = [];
  segments.forEach((s, i) => {
    const prix = prixRepere[i];
    if (prix == null) return;
    const g = groupes[groupes.length - 1];
    const dernier = g?.segs[g.segs.length - 1];
    if (g && g.prix === prix && lendemain(dernier!.fin) === s.debut) g.segs.push(s);
    else groupes.push({ segs: [s], prix });
  });
  return groupes.map(({ segs }) => {
    const tarifs = segs.filter((s) => !s.promotion);
    const noms = [...new Set((tarifs.length ? tarifs : segs).map((s) => s.libelle))];
    return { libelle: noms.join(" / "), debut: segs[0].debut, fin: segs[segs.length - 1].fin };
  });
}

/**
 * Les tarifs lus d'une période, dédoublonnés : une boutique qui sert la même
 * catégorie pour deux codes la donne deux fois. Deux prix différents pour le
 * même produit sont signalés, le premier gardé.
 */
export function periodeDesProduits(
  p: PeriodeBoutique,
  lus: readonly ProduitLu[],
): { periode: Periode; problemes: string[] } {
  const problemes: string[] = [];
  const tarifs: Tarif[] = [];
  for (const produit of lus) {
    const t = tarifDuProduit(produit);
    const meme = tarifs.find(
      (x) =>
        JSON.stringify(x.duree) === JSON.stringify(t.duree) &&
        x.libelleCategorie === t.libelleCategorie,
    );
    if (!meme) tarifs.push(t);
    else if (meme.prix !== t.prix)
      problemes.push(
        `« ${p.libelle} » : ${t.libelleDuree} ${t.libelleCategorie} lu à ${meme.prix} puis ${t.prix}, le premier gardé`,
      );
  }
  return {
    periode: { libelle: p.libelle, debut: p.debut, fin: p.fin, saisonEntiere: false, tarifs },
    problemes,
  };
}
