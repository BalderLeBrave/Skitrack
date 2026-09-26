/**
 * Les gares OSM qui ne font pas un logement au pied des pistes.
 *
 * Les données (`osmLifts.json`, `osmAccess.snapshot.json`) ne gardent que le
 * nom, le genre et la position d'une gare. Le 26 septembre 2026,
 * `scripts/retirer-remontees-hors-service.mjs` en a retiré 715 positions de
 * gares d'après openskidata.org (l'index national passe de 7 030 à 6 313
 * gares ; 716 gares, position et nom, sur 715 positions : celle du Col des
 * Aravis en porte deux), en cinq familles :
 *
 * - **hors service** (désaffecté, abandonné, en projet) : 404 positions, dont
 *   l'ancienne télécabine de Charlannes, qui mettait le bourg de La Bourboule à
 *   307 m des pistes, « Sambuy » (La Sambuy) et « Prat de Tossa » (Puigmal) ;
 * - **privé sans domaine** : 24, dont le téléphérique de l'observatoire de
 *   Bure et Plaouquès (privé, sans domaine, vallée d'Aure), qui faisaient
 *   entrer un chalet du Dévoluy à La Joue du Loup et une grange de la vallée
 *   d'Aure à Espiaube ;
 * - **cabine sans domaine** (funiculaire, téléphérique, télécabine en
 *   service) : 151, dont Applevage (deux appartements de Gabas relevés pour
 *   Artouste) et le funiculaire de Thonon, qui était dans la liste de Lullin.
 *   Le funiculaire du Capucin (Le Mont-Dore) en est aussi, par décision du
 *   propriétaire ; l'Aiguille du Midi et la Mer de Glace restent ;
 * - **câble plat sans domaine** (3 m de dénivelé au plus sur 80 m) : 132, des
 *   téléskis nautiques, dont celui de Chaillol ;
 * - **désignés** : le télésiège du Glacier des Bossons, sans piste à 2 km, et
 *   la corde du tremplin de Ventron (4 positions).
 *
 * Sur les relevés et sur le code du 25 septembre, 11 logements sortent de ce
 * seul fait de « Par budget » (1 618 → 1 607), dont « Papillon Chamonix
 * Chalet », affiché « au pied des pistes » à 171 m du Glacier des Bossons
 * (2 979 m sans lui) ; 3 y restent, remesurés un peu plus loin. Sur le code
 * du 26, 10 sortent (1 499 → 1 489) : le « Mobile-home » d'Espiaube en sort
 * déjà par ailleurs. Le retrait du Capucin, décidé ensuite, en ôte 17 de
 * plus : les logements du bourg du Mont-Dore relevés pour Besse, à 2,2 km des
 * Longes, première remontée de ski.
 *
 * Ce filtre, sur le nom, reste la garde de toute donnée à venir :
 *
 * - **en projet** : « (Project) Télécabine Bozel - St Bon - Courchevel »,
 *   « (Proposed) TCD Sapinière (Projet 2021) ». Le filtre d'avant attendait
 *   le mot en tête du nom, sans la parenthèse : il ne retenait rien ;
 * - **hors service** : un nom qui commence par « Ancien » ou « Ancienne », ou
 *   qui dit l'appareil désaffecté, démonté, démoli, abandonné, ou marqué
 *   « (✝) » ;
 * - **hors ski** : les téléphériques EDF et de service (« Téléphérique EDF »
 *   mettait le bourg d'Ugine à 745 m des pistes de Bisanne 1500), les
 *   téléskis nautiques et de wakeboard, le remonte-luge de luge d'été.
 *
 * « Ferme », « Vieux Moulin » ou « Remonte Luge » (le Semnoz, l'hiver) ne
 * tombent pas : aucune de ces règles ne les touche.
 */

import retirees from "./remonteesRetirees.json" with { type: "json" };

const PROJET = /^\(?\s*(project|proposed)\b/i;
const HORS_SERVICE = /^ancien(ne)?s?\b|d[ée]saffect|d[ée]mont[ée]|d[ée]moli|abandonn|\(\s*[✝†]\s*\)|\(disused\)/i;
const HORS_SKI = /luge d['’]?[ée]t[ée]|\bEDF\b|\bde service\b|^ligne de service|nautique|\bwake/i;

export function remonteeHorsService(nom: string | null | undefined): boolean {
  if (!nom) return false;
  return PROJET.test(nom) || HORS_SERVICE.test(nom) || HORS_SKI.test(nom);
}

/** Les gares retirées des données (`remonteesRetirees.json`, écrit par le
 *  script), par leur position exacte, avec tous leurs noms : une même position
 *  en porte parfois deux (« TKE1 du Col des Aravis » et « Télétraineau du Col
 *  des Aravis »). Aucune gare gardée n'occupe l'une de ces positions. */
const RETIREES = new Map<string, Set<string | null>>();
for (const g of retirees as { n: string | null; lat: number; lon: number }[]) {
  const k = `${g.lat},${g.lon}`;
  const noms = RETIREES.get(k);
  if (noms) noms.add(g.n);
  else RETIREES.set(k, new Set([g.n]));
}

/**
 * La gare enregistrée à cette position, sous ce nom, a-t-elle été retirée des
 * données ? Son nom ne le dit pas toujours : « TKF1 Portatif », à La Giettaz,
 * est désaffecté selon openskidata.org, et les relevés déjà enregistrés
 * gardaient « 293 m de TKF1 Portatif ». Une gare enregistrée l'est avec sa
 * position exacte (`asHit`) ; le nom, quand il est donné, doit aussi être
 * l'un de ceux retirés à cette position.
 */
export function gareRetiree(
  lat: number | null | undefined,
  lon: number | null | undefined,
  nom?: string | null,
): boolean {
  if (lat == null || lon == null) return false;
  const noms = RETIREES.get(`${lat},${lon}`);
  if (!noms) return false;
  return nom == null || noms.has(nom);
}
