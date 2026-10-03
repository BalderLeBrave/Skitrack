/** Lectures de la maquette v7 sur les données du dépôt.
 *
 *  La maquette lisait un `stations-map-data.json` à champs courts (`n`, `m`,
 *  `v`, `lo`, `hi`, `km`, `lifts`, `g`, `dom`, `share`, `cnt`, `pct`, `src`).
 *  Le dépôt a son référentiel (`stations.ts`), son catalogue de forfaits et son
 *  relevé Skiinfo : ce module fait la correspondance, champ par champ, et écrit
 *  l'absence en toutes lettres là où la maquette le faisait.
 *
 *  **Rien n'est estimé.** Une altitude à zéro dans le référentiel n'est pas une
 *  mesure : elle se lit « non relevée ». */

import { domaineNomme, sansDomaineAlpin } from "./classeur.ts";
import { aTraduire, tr, trN } from "./i18n/tr.ts";
import { stationHasGlacier } from "./forfaits/catalog.ts";
import type { Listing } from "./listings.ts";
import { eur, eurCents, eurN, fmt, fmtN, mLbl } from "./parcours.ts";
import { SKIINFO } from "./skiinfo.ts";
import type { Station } from "./stations.ts";
import { availabilityOf, type Stay } from "./stay/availability.ts";
import { chambresDesPieces } from "./stay/logement.ts";

/* ---------- Station ---------- */

/** Une altitude à zéro n'est pas mesurée. */
function alt(n: number | null | undefined): number | null {
  return n != null && n > 0 ? n : null;
}

export const villageM = (s: Station) => alt(s.villageM);

/** Espace fine, tiret demi-cadratin, espace insécable : écrits par leur code,
 *  pour que ni l'éditeur ni le linter ne les prennent pour des espaces perdues. */
const FINE = String.fromCharCode(0x2009);
const TIRET = String.fromCharCode(0x2013);
const INSEC = String.fromCharCode(0xa0);
export const minM = (s: Station) => alt(s.minM);
export const maxM = (s: Station) => alt(s.maxM);

/** « 1 300 – 3 600 m », ou `null` quand l'une des bornes manque. */
export function altLbl(s: Station): string | null {
  const lo = minM(s),
    hi = maxM(s);
  return lo != null && hi != null ? `${fmt(lo)}${FINE}${TIRET}${FINE}${fmt(hi)}${INSEC}m` : null;
}

export function villageLbl(s: Station): string | null {
  const v = villageM(s);
  return v != null ? `${fmt(v)}${INSEC}m` : null;
}

export function kmLbl(s: Station): string | null {
  return s.pistesKm != null ? `${fmt(s.pistesKm)} km` : null;
}

export function liftsLbl(s: Station): string | null {
  return s.lifts != null ? String(s.lifts) : null;
}

export const glacier = (s: Station) => stationHasGlacier(s.id);

/** « Domaine relié » : le domaine porte un autre nom que la station. Le
 *  libellé « domaine non nommé (OpenStreetMap) » n'en est pas un : Névache et
 *  ses 0,4 km passaient la puce, et Comparer écrivait ce libellé au lieu de
 *  « Non ». */
export const linked = (s: Station) => domaineNomme(s.domain) && s.domain !== s.name;

/** Lien vers la fiche Skiinfo, quand la station en a une. */
export function skiinfoUrl(s: Station): string | null {
  return SKIINFO[s.id]?.url ?? null;
}

/** « Alpes du Nord · Isère · Les Deux Alpes » : les seules parts connues. */
export function crumb(s: Station): string {
  return [s.massif, s.dept, s.commune].filter(Boolean).join(" · ");
}

/** Le fil d'une station vue depuis un logement : massif, département, domaine.
 *
 *  Il diffère de `crumb` par sa dernière part. Poser `crumb` puis y ajouter le
 *  domaine répétait le même nom deux fois : aux 2 Alpes, la commune s'appelle
 *  « Les Deux Alpes », et le domaine aussi. */
export function crumbDomaine(s: Station): string {
  return [s.massif, s.dept, s.domain].filter(Boolean).join(" · ");
}

/**
 * « sans domaine alpin » quand l'absence de domaine est connue (La Bourboule,
 * `sansDomaineAlpin`), `null` sinon. Ses km, remontées et altitudes de pistes
 * ne sont pas « non relevés » : il n'y en a pas. Ses 0 m au référentiel ne sont
 * pas une mesure non plus.
 */
export function sansDomaineLbl(s: Station): string | null {
  return sansDomaineAlpin(s.id) ? tr("sans domaine alpin") : null;
}

/** Sous-titre d'une carte : massif et domaine. */
export function sub(s: Station): string {
  return `${s.massif} · ${s.domain ?? sansDomaineLbl(s) ?? tr("domaine non renseigné")}`;
}

/** « aux 2 Alpes », « au Corbier », « à l'Alpe d'Huez », « à Tignes ».
 *
 *  Soixante-quatre stations du référentiel portent un article dans leur nom :
 *  vingt-six en « Les », trente-cinq en « Le », une en « L' », deux en
 *  « Alpe ». Coller un « à » invariable devant leur nom écrit « à Les Arcs »
 *  — une faute visible, et sur un bouton, l'endroit où elle se lit le plus.
 *
 *  Les deux dernières règles ne sont pas décoratives : « Alpe d'Huez » et
 *  « Alpe du Grand Serre » n'ont pas leur article dans le référentiel, mais le
 *  français le leur donne à l'oral comme à l'écrit. */
export function aStation(nom: string | null | undefined): string {
  const n = nom?.trim();
  if (!n) return "";
  if (/^les /i.test(n)) return `aux ${n.slice(4)}`;
  if (/^le /i.test(n)) return `au ${n.slice(3)}`;
  if (/^l['’]/i.test(n)) return `à l’${n.slice(2)}`;
  if (/^alpes? /i.test(n)) return `à l’${n}`;
  return `à ${n}`;
}

export const SHARE_VIDE = { green: 0, blue: 0, red: 0, black: 0 } as const;

/** Prédicats des raccourcis de la maquette (`CH`). */
export const CHIPS = {
  big: { label: aTraduire("Grands domaines · 300 km"), fn: (s: Station) => (s.pistesKm ?? 0) >= 300 },
  high: { label: aTraduire("Sommet 3 000 m"), fn: (s: Station) => (maxM(s) ?? 0) >= 3000 },
  glacier: { label: aTraduire("Glacier"), fn: (s: Station) => glacier(s) },
  linked: { label: aTraduire("Domaine relié"), fn: (s: Station) => linked(s) },
  family: {
    label: aTraduire("Famille · 60 % faciles"),
    fn: (s: Station) => !!s.colorShare && s.colorShare.green + s.colorShare.blue >= 60,
  },
  steep: {
    label: aTraduire("Engagé · 40 % rouges ou noires"),
    fn: (s: Station) => !!s.colorShare && s.colorShare.red + s.colorShare.black >= 40,
  },
} as const;

/* ---------- Annonce ---------- */

export type DistKind = "measured" | "no_lifts" | "no_coords" | "other_domain";

/** Trois messages de distance, qui ne veulent pas dire la même chose. En
 *  français dans la table ; `distanceOf` les traduit au rendu. */
export const DIST_MSG: Record<Exclude<DistKind, "measured">, string> = {
  no_lifts: aTraduire("Pas de données de remontées pour cette station"),
  no_coords: aTraduire("Distance non communiquée"),
  other_domain: aTraduire("Autre domaine"),
};

export function distanceOf(l: Listing): { kind: DistKind; text: string } {
  if (l.domainFit === "other") return { kind: "other_domain", text: tr(DIST_MSG.other_domain) };
  if (l.lat == null || l.lon == null) return { kind: "no_coords", text: tr(DIST_MSG.no_coords) };
  if (l.distToLiftM != null)
    return {
      kind: "measured",
      text: tr("{distance} de {remontee}", { distance: mLbl(l.distToLiftM) ?? "", remontee: l.liftName ?? tr("la remontée") }),
    };
  return { kind: "no_lifts", text: tr(DIST_MSG.no_lifts) };
}

/** Prix relevé pour exactement ces dates : la seule preuve de disponibilité. */
export function firmOf(l: Listing, stay: Stay): boolean {
  return availabilityOf(l, stay).status === "confirmed";
}

/** Ce qu'aucune source, aucune fiche ni aucun texte n'a dit. L'annonce reste
 *  affichée ; seuls les filtres chiffrés l'écartent (`dansPlage`). En français :
 *  les libellés le rendent par `tr(NON_RENSEIGNE)`, à comparer de même. */
export const NON_RENSEIGNE = aTraduire("Non renseigné");

/** La capacité maximale, et la standard quand la source la distingue ou
 *  donne une fourchette : « 4/6 pers. » pour « 4 à 6 personnes ». */
export function capLbl(l: Listing): string {
  if (l.capacity == null) return tr(NON_RENSEIGNE);
  if (l.capacityStandard != null && l.capacityStandard > 0 && l.capacityStandard < l.capacity) {
    return tr("{standard}/{max} pers.", { standard: l.capacityStandard, max: l.capacity });
  }
  return persLbl(l.capacity);
}

/** « 8 pers. » : un nombre de personnes, capacité ou voyageurs. L'anglais
 *  accorde (« 1 person », « 8 people »), d'où la clé à part pour un. */
export function persLbl(n: number): string {
  return n === 1 ? tr("1 pers.") : tr("{n} pers.", { n });
}

export function bedLbl(l: Listing): string {
  // Ce que la source a écrit, dans ses mots. Des chambres tirées des pièces
  // (« 3 pièces » : 2 chambres supposées) s'affichent en pièces : on ne dit
  // pas « 2 ch. » d'un logement qui ne l'a pas annoncé. Un studio se dit
  // « Studio », jamais « 0 ch. » ; la cabine ne compte pas comme chambre.
  const cabine = l.cabin ? tr(" + cabine") : "";
  const pieces =
    l.rooms != null && l.rooms > 0 ? trN(l.rooms, "{n} pièce", "{n} pièces") : null;
  if (
    l.isStudio === true ||
    l.bedrooms === 0 ||
    (l.bedrooms == null && l.lodgingType === "studio")
  ) {
    return `${tr("Studio")}${cabine}`;
  }
  if (l.bedrooms == null) return pieces ? `${pieces}${cabine}` : tr(NON_RENSEIGNE);
  if (pieces && chambresDesPieces(l)) return `${pieces}${cabine}`;
  return `${l.bedrooms === 1 ? tr("1 ch.") : tr("{n} ch.", { n: l.bedrooms })}${cabine}`;
}

/** Hors d'une case titrée (carte, épingle, ligne de fiche), « Non renseigné »
 *  dit de quoi il parle : « Capacité : Non renseigné ». */
export function capNomme(l: Listing): string {
  const v = capLbl(l);
  return v === tr(NON_RENSEIGNE) ? tr("Capacité : {v}", { v }) : v;
}

export function bedNomme(l: Listing): string {
  const v = bedLbl(l);
  return v === tr(NON_RENSEIGNE) ? tr("Chambres : {v}", { v }) : v;
}

/** Un total à 0 n'est pas un prix : c'est « non publié ». Rien d'autre que le montant. */
export function prixLbl(l: Listing): string {
  if (!(l.total > 0)) return tr("prix non publié");
  return eurCents(l.total) ?? tr("prix non publié");
}

/** Par personne, seulement quand un total a été publié. */
export function prixPersLbl(l: Listing, trav: number): string | null {
  if (!(l.total > 0) || !(trav > 0)) return null;
  return eurN(l.total / trav);
}

/** Texte de pastille : jamais « 0 € ». */
export function prixPin(l: Listing): string {
  return l.total > 0 ? eur(l.total) : tr("sans prix");
}

/** Fond du cadre photo vide, par source : la maquette teinte à peine. */
export function mediaTon(l: Listing): "airbnb" | "gites" | "autre" | "photo" {
  if (l.photo) return "photo";
  if (l.source === "Airbnb") return "airbnb";
  if (l.source === "Gîtes de France") return "gites";
  return "autre";
}

export { fmtN };
