/**
 * Les centrales de réservation officielles des stations.
 *
 * C'est la moitié de la table d'origine qui survit au changement de cap : le
 * fichier généré du 8 septembre portait aussi, pour chaque centrale, les
 * sélecteurs CSS de son formulaire de recherche. Ils ne sont pas repris. Ce qui
 * l'est, c'est le rattachement station vers centrale officielle, son URL et son
 * hôte, qui reste vrai quelle que soit la façon dont les prix seront relevés
 * plus tard, par API ou pas du tout.
 *
 * Ce que ce module fait : dire vers quelle adresse envoyer un visiteur qui veut
 * réserver auprès de l'exploitant plutôt que d'une plateforme.
 *
 * Ce qu'il ne fait pas : relever quoi que ce soit, ni construire une URL de
 * recherche datée. Chaque centrale a sa syntaxe de paramètres, et une URL
 * fabriquée qui tombe sur une page d'erreur est pire que le lien d'accueil.
 * L'adresse rendue est celle qui a été relevée à la main, rien d'autre.
 *
 * Airbnb et Booking.com figuraient dans la table d'origine. Ils en sont sortis :
 * ce sont des plateformes globales, pas les centrales des stations, et les
 * confondre brouille exactement la distinction que cette table sert à tenir.
 */

import data from "./centrales.data.json" with { type: "json" };
import { domainForStation } from "./forfaits/catalog";
import { stationById } from "./stations";

export type Centrale = {
  /** Nom tel que le relevé l'écrit, qui peut différer de celui du catalogue. */
  nom: string;
  url: string;
  host: string;
  /** Rattachée à la station elle-même, ou au domaine qui la contient. */
  portee: "station" | "domaine";
};

type Fichier = {
  at: string;
  source: string;
  stations: Record<string, { nom: string; url: string; host: string }>;
  domaines: Record<string, { url: string; host: string }>;
  nonRattachees: string[];
};

const FICHIER = data as Fichier;

function fold(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const DOMAINE_INDEX = new Map(
  Object.entries(FICHIER.domaines).map(([nom, v]) => [fold(nom), { nom, ...v }]),
);

/**
 * Centrale d'une station.
 *
 * La station d'abord, le domaine ensuite : une station qui a sa propre centrale
 * la garde même si son domaine en a une. Val Thorens vend ses appartements, les
 * 3 Vallées vendent le forfait.
 */
export function centraleFor(stationId: string): Centrale | null {
  const direct = FICHIER.stations[stationId];
  if (direct) return { ...direct, portee: "station" };

  const station = stationById(stationId);
  const domaine = domainForStation(stationId);
  const candidats = [domaine?.pass, domaine?.seed?.zone, station?.massif]
    .filter((v): v is string => Boolean(v))
    .map(fold);

  for (const c of candidats) {
    for (const [key, value] of DOMAINE_INDEX) {
      if (c === key || c.includes(key) || key.includes(c)) {
        return { nom: value.nom, url: value.url, host: value.host, portee: "domaine" };
      }
    }
  }
  return null;
}

/** Couverture du catalogue, pour l'audit. */
export function centraleCoverage(ids: readonly string[]): {
  station: number;
  domaine: number;
  aucune: number;
} {
  let station = 0;
  let domaine = 0;
  let aucune = 0;
  for (const id of ids) {
    const c = centraleFor(id);
    if (!c) aucune += 1;
    else if (c.portee === "station") station += 1;
    else domaine += 1;
  }
  return { station, domaine, aucune };
}

/** Relevés qui n'ont pas trouvé de station : résidences, hameaux, noms ambigus. */
export const CENTRALES_NON_RATTACHEES: readonly string[] = FICHIER.nonRattachees;

export const CENTRALES_RELEVE_AT = FICHIER.at;
