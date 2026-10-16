/**
 * La relecture des fiches de l'écran Logements, sans réseau.
 *
 * Le modèle Airbnb, pour toutes les sources : les tuiles d'abord ; les fiches
 * se lisent ensuite en tâche de fond, une à une, et ce qu'elles publient va
 * dans le cache et les mémoires du serveur (mémoire des fiches, contenu
 * gardé : `contenuFiches.server.ts`). L'écran le relit (`completerAnnonces`)
 * et le pose sur les annonces qu'il montre. Ce module dit lesquelles relire,
 * et quand ; l'écran (`routes/logements.tsx`) fournit l'appel au serveur et
 * la minuterie.
 *
 * Module pur, chargé tel quel par `node --experimental-strip-types`.
 */

import type { Listing } from "../listings.ts";
import { aLecteurDeContenu } from "./contenuFiche.ts";
import { airbnbComplet, pageJamaisOuverte, pointPublie, raisonDeLaisser } from "./priseFiche.ts";

/**
 * Les pages de liste encore à lire arrivent par `lireSuiteAirbnb` (aucun appel
 * à Airbnb : le cache du serveur). La relecture des fiches, elle, pose ce que
 * la mémoire a déjà, y compris une annonce complète à qui il manque encore sa
 * fiche. Elle ne relance pas un catalogue arrêté sur un refus.
 */
export const RELECTURE_MS = 15_000;
/**
 * Une relecture qui ne rapporte rien double l'intervalle, jusqu'à deux
 * minutes ; une qui comble le ramène à 15 s. Vu le 13 octobre 2026 aux
 * 2 Alpes : 22 annonces que rien ne comblait relues toutes les 15 s, 180 fois.
 */
export const RELECTURE_MAX_MS = 120_000;
/**
 * 45 min après la recherche, comme avant : la relecture que lance la réponse
 * Airbnb peut, jusque-là, remettre en file ce qui manque. Au-delà, elle ne
 * continue qu'en pose seule (`poseSeule`), et tant qu'elle rapporte.
 */
export const RELECTURES_DUREE_MS = 45 * 60_000;
/**
 * Les fiches PDP lentes (`airbnbSuite.server.ts`) : 12 s au moins entre deux,
 * jusqu'à 400, après jusqu'à 96 pages de liste. Les dernières arrivent en
 * mémoire vers 100 min ; le cache de la recherche tient 2 h pendant ce temps
 * (`CACHE_PENDANT_SUITE_MS`). La relecture ne dure jamais plus.
 */
export const RELECTURES_PLAFOND_MS = 2 * 60 * 60_000;
/** Une relecture qui comble repousse la fin d'autant, jusqu'au plafond. */
export const RELECTURE_SANS_PROGRES_MS = 15 * 60_000;

/**
 * Une annonce à qui il manque GPS, capacité ou chambres, et que la tâche de
 * fond peut encore combler. Airbnb : lue et à point (`pdpLue`), ce qui lui
 * manque, sa page ne le publie pas. Sans point, sa page se relit encore : elle
 * donne un point de repli que la mémoire des fiches ne garde pas. Un point
 * triangulé (`raw`, `placerSansPoint`) n'en est pas un : `pointPublie`.
 */
export function aCombler(l: Listing): boolean {
  if (l.source === "Airbnb") return !airbnbComplet(l) && !(l.pdpLue === true && pointPublie(l));
  // Hors Airbnb : une fiche que la tâche de fond lit encore, à qui il manque
  // la capacité, ou les chambres sans pièces dont les tirer.
  // Une fiche que le serveur n'ouvre pas (`raisonDeLaisser` : booking.com ne
  // publie rien de ce qui manque) ne se comblera pas : rien à relire.
  if (!l.url || (l.source !== "Gîtes de France" && raisonDeLaisser(l, l.url) != null)) return false;
  return l.capacity == null || (l.bedrooms == null && !(l.rooms != null && l.rooms > 0));
}

/**
 * Hors Airbnb : une annonce dont la fiche a un lecteur de contenu
 * (`aLecteurDeContenu` : Cimalpes, Abritel) et que le serveur ouvre encore
 * (`raisonDeLaisser`), sans description ni équipements. La tâche de fond lit
 * sa page et en garde le contenu ; la relecture le pose. Une annonce Cimalpes
 * publie capacité et chambres et ne manque que du point : sans cela, elle
 * n'était jamais relue, et ses équipements n'arrivaient qu'à la recherche
 * suivante. Un nouveau lecteur de page s'ajoute à `aLecteurDeContenu` ; un
 * collecteur qui lit lui-même ses fiches en tâche de fond (`garderLectures`)
 * ajoute ici sa propre règle.
 */
export function contenuAPoser(l: Listing): boolean {
  if (l.source === "Airbnb" || l.source === "Gîtes de France" || !l.url) return false;
  if (l.amenities != null || l.description) return false;
  return aLecteurDeContenu(l.url) && raisonDeLaisser(l, l.url) == null;
}

/**
 * Arkiane (Pralognan) : le détail d'un lot ne s'ouvre que par le formulaire
 * de sa carte, et l'annonce mène à l'accueil de la centrale, que le serveur
 * n'ouvre jamais (`raisonDeLaisser` : « URL commune »). Le relevé lit ces
 * détails lui-même, un à la fois ; ce qui ne tient pas dans la recherche se
 * lit après, en tâche de fond, et sa description, ses douze clés et ses
 * pictos se gardent trente jours (`garderLectures`, clé `cleListing` :
 * `Centrale:ark-…`), avec le point et les nombres de ses pavés. La relecture
 * les pose sans réseau (`reposerGardees`). Une annonce qui porte un contenu
 * et un point publié n'attend plus rien.
 */
export function contenuArkianeAPoser(l: Listing): boolean {
  if (l.source !== "Centrale" || !l.id.startsWith("ark-")) return false;
  return (l.amenities == null && !l.description) || (!pointPublie(l) && pageJamaisOuverte(l.url));
}

/**
 * Booking : la fiche se lit en tâche de fond, page à page, après la suite de
 * pages (`fichesBooking.server.ts`), et se garde trente jours ; la relecture
 * la pose sans réseau (`reposerGardees`). Un hôtel ou une chambre n'en reçoit
 * jamais (`ficheDepuisPageBooking`), ni une annonce sans page établissement :
 * rien à attendre pour eux. Une fiche `indisponible` (défi 202) n'est pas lue.
 */
export function ficheBookingAPoser(l: Listing): boolean {
  if (l.source !== "Booking" || !l.url || !/^https?:\/\/([a-z0-9-]+\.)*booking\.com\/hotel\/[a-z]{2}\//i.test(l.url)) {
    return false;
  }
  if (l.lodgingType === "hotel" || l.lodgingType === "chambre") return false;
  return l.fiche == null || l.fiche.indisponible === true;
}

/**
 * Orchestra (La Plagne, Combloux, Praz-sur-Arly, Chamonix) : le relevé lit
 * lui-même la fiche `/location/…` de chaque logement, une à une ; ce qui ne
 * tient pas dans la recherche se lit après, en tâche de fond, et sa
 * description, ses douze clés et ses « Caractéristiques » se gardent trente
 * jours (`garderLectures`, clé `cleListing` : `Centrale:` et la référence du
 * logement). Le lecteur de pages n'en tire aucun contenu (`aLecteurDeContenu`)
 * et n'ouvre jamais celles de La Plagne (`raisonDeLaisser`) : la relecture
 * pose ce contenu sans réseau (`reposerGardees`), et, pour La Plagne dont
 * l'écran n'ouvre jamais la page, le point et la capacité notés à la lecture.
 * Une annonce qui porte un contenu et un point publié n'attend plus rien.
 */
export function contenuOrchestraAPoser(l: Listing): boolean {
  if (l.source !== "Centrale" || !l.id.startsWith("orc-")) return false;
  return (l.amenities == null && !l.description) || (!pointPublie(l) && pageJamaisOuverte(l.url));
}

/**
 * Travelski : la tâche de la station (`lireStation`, travelski.server.ts) lit
 * elle-même la fiche de chaque résidence après la réponse, et en garde le
 * point et l'occupation (mémoire des fiches) et le contenu — description,
 * galerie, équipements, services inclus — trente jours (`contenuFiches`, clé
 * `cleListing`). Le lecteur de pages ne l'ouvre jamais (`pageJamaisOuverte`) :
 * la relecture pose tout cela sans réseau (`reposerGardees`). Une annonce qui
 * porte un contenu et un point publié n'attend plus rien.
 */
export function ficheTravelskiAPoser(l: Listing): boolean {
  return l.source === "Travelski" && ((l.amenities == null && !l.description) || !pointPublie(l));
}

/**
 * Ski-Planet : le panneau d'un logement (`infos-logement.php`) se lit en
 * tâche de fond après la réponse, un à la fois (`lancerSuitePanneaux`,
 * skiPlanet.server.ts), et sa description, ses photos et les équipements
 * qu'elle nomme se gardent trente jours, sans fiche (`garderLectures`, clé
 * `cleListing` : `Ski-Planet:` et l'identifiant du logement, la même pour
 * l'offre seule et l'offre forfaits compris). L'écran n'ouvre jamais une page
 * de ski-planet.com (`pageJamaisOuverte`) : la relecture pose ce contenu sans
 * réseau (`reposerGardees`). Le panneau ne publie ni point ni capacité : une
 * annonce qui porte une description n'attend plus rien.
 */
export function panneauSkiPlanetAPoser(l: Listing): boolean {
  return l.source === "Ski-Planet" && l.amenities == null && !l.description;
}

/**
 * GreenGo : le relevé lit lui-même, par l'API, le détail des hôtes les plus
 * proches ; ceux qu'il n'a pas lus (au-delà, échéance) se lisent ensuite en
 * tâche de fond, un à la fois (`lancerSuiteGreenGo`, greengo.server.ts). Ce que
 * le détail d'un hôte à logement unique publie — fiche, description, douze
 * clés, capacité et chambres — se garde trente jours sous la clé de son
 * annonce sans détail (`lecturesAGarder`, `notesDuDetail`), et l'écran n'ouvre
 * jamais la page GreenGo (`pageJamaisOuverte`) : la relecture le pose sans
 * réseau (`reposerGardees`). L'annonce sans détail est celle dont le total
 * n'est pas publié ; un total publié dit un détail déjà lu. Le détail donne
 * les chambres en champ de l'API, avec le reste, d'une seule lecture : posées,
 * l'annonce n'attend plus rien.
 */
export function detailGreenGoAPoser(l: Listing): boolean {
  if (l.source !== "GreenGo" || l.total > 0) return false;
  return l.capacity == null || l.bedroomsSource !== "structured";
}

/**
 * Ce que relisait la boucle d'avant : des trous de fiche (`aCombler`), ou une
 * annonce Airbnb dont la fiche enrichie n'est pas encore posée. Elle
 * s'arrêtait dès qu'il n'en restait plus. La boucle de la réponse Airbnb ne
 * remet en file que tant qu'il en reste : le contenu à poser seul
 * (`contenuAPoser`) la ferait vivre plus longtemps qu'avant, et une annonce
 * trouée arrivée ensuite par la suite partirait en file.
 */
export function aRelireEnFile(l: Listing): boolean {
  return aCombler(l) || (l.source === "Airbnb" && l.fiche == null);
}

/**
 * À relire : ce que relisait la boucle d'avant (`aRelireEnFile`), ou un
 * contenu ou une fiche Booking que la tâche de fond lit encore
 * (`contenuAPoser`, `contenuArkianeAPoser`, `ficheBookingAPoser`,
 * `contenuOrchestraAPoser`, `ficheTravelskiAPoser`, `panneauSkiPlanetAPoser`,
 * `detailGreenGoAPoser`). La mémoire se pose sans réseau.
 */
export function aRelire(l: Listing): boolean {
  return (
    aRelireEnFile(l) ||
    contenuAPoser(l) ||
    contenuArkianeAPoser(l) ||
    ficheBookingAPoser(l) ||
    contenuOrchestraAPoser(l) ||
    ficheTravelskiAPoser(l) ||
    panneauSkiPlanetAPoser(l) ||
    detailGreenGoAPoser(l)
  );
}

/**
 * Ce qui reste à relire et ce qu'on en sait : inchangé d'une relecture à
 * l'autre, elle n'a rien rapporté.
 */
export function empreinte(rows: readonly Listing[]): string {
  return rows
    .filter(aRelire)
    .map((l) =>
      [
        l.id,
        `${l.lat},${l.lon}`,
        l.capacity,
        l.bedrooms,
        l.rooms,
        l.pdpLue,
        l.fiche != null && l.fiche.indisponible !== true,
        l.amenities != null,
        Boolean(l.description),
      ].join(":"),
    )
    .join("|");
}

/** Ce que la boucle demande à l'écran. */
export type PorteRelecture = {
  /** Les annonces que l'écran tient. */
  annonces: () => readonly Listing[];
  /**
   * Relit ces annonces au serveur (`completerAnnonces`) et pose la réponse à
   * l'écran (`patchLive`). Rejetée : réseau, pause.
   */
  relire: (rows: Listing[], opts: { poseSeule: boolean }) => Promise<void>;
  /** Appelle `f` dans `ms` ; rend de quoi l'annuler. */
  attendre: (f: () => void, ms: number) => () => void;
  maintenant: () => number;
};

export type BoucleRelecture = {
  /**
   * La réponse Airbnb de la recherche : comme avant, la relecture qu'elle
   * lance peut remettre en file ce qui manque (45 min au plus).
   */
  releveAirbnb: (rows: readonly Listing[]) => void;
  /**
   * Des annonces arrivent (une autre part, une suite de pages) : la relecture
   * reprend si elle s'était arrêtée, faute d'annonce à relire.
   */
  relancer: () => void;
  /** L'écran quitte la recherche. */
  arreter: () => void;
};

/**
 * La relecture d'une recherche : une boucle au plus, qui relit toutes les
 * `RELECTURE_MS` (doublées sans progrès, jusqu'à `RELECTURE_MAX_MS`) les
 * annonces à relire (`aRelire`), et s'arrête quand il n'y en a plus, ou à sa
 * fin.
 *
 * Une seule boucle : « en cours » tient de la minuterie posée jusqu'à la
 * réponse du serveur. Retombé dès la minuterie, il laisserait une suite de
 * pages arrivée pendant la réponse lancer une seconde boucle. Arrêtée, la
 * boucle reprend quand des annonces arrivent (`relancer`) : la suite de pages
 * ajoute des annonces sans fiche, que rien ne relisait plus.
 *
 * Sa fin : 45 min après la recherche, repoussée de 15 min par chaque relecture
 * qui comble, jusqu'à 2 h. Les fiches lentes arrivent en mémoire bien après
 * 45 min, et n'atteignaient plus l'écran.
 *
 * Sans une requête de plus qu'avant : seule la boucle lancée par la réponse
 * Airbnb, dans ses 45 premières minutes et tant qu'il reste ce que la boucle
 * d'avant relisait (`aRelireEnFile`), peut remettre en file ce qui manque,
 * comme avant ; toute autre relecture est en pose seule (`poseSeule`) : une
 * boucle lancée par une autre part, reprise après un arrêt, qui ne vit plus
 * que d'un contenu à poser (là où l'ancienne s'arrêtait), ou au-delà des
 * 45 min.
 */
export function boucleRelecture(porte: PorteRelecture): BoucleRelecture {
  const debut = porte.maintenant();
  const finFile = debut + RELECTURES_DUREE_MS;
  let fin = finFile;
  let delai = RELECTURE_MS;
  /** Une relecture attend sa minuterie ou sa réponse. */
  let enCours = false;
  /**
   * La boucle est celle de la réponse Airbnb, et ne s'est pas arrêtée depuis,
   * ni n'a manqué de ce que la boucle d'avant relisait (`aRelireEnFile`).
   */
  let enFile = false;
  let finie = false;
  let annuler: (() => void) | null = null;

  const stopper = () => {
    enCours = false;
    enFile = false;
  };
  /**
   * Plus rien de ce que la boucle d'avant relisait : elle s'arrêtait là, et
   * rien ne la relançait. Celle-ci continue pour le contenu à poser, en pose
   * seule, comme une reprise, et ne remet plus en file.
   */
  const finDeFile = (rows: readonly Listing[]) => {
    if (!rows.some(aRelireEnFile)) enFile = false;
  };
  const planifier = (rows: readonly Listing[]) => {
    if (finie) return;
    if (porte.maintenant() >= fin || !rows.some(aRelire)) return stopper();
    finDeFile(rows);
    enCours = true;
    annuler = porte.attendre(tour, delai);
  };
  const tour = () => {
    annuler = null;
    if (finie) return;
    const avant = porte.annonces();
    const actuelles = avant.filter(aRelire);
    if (actuelles.length === 0) return stopper();
    finDeFile(actuelles);
    const empreinteAvant = empreinte(avant);
    const poseSeule = !enFile || porte.maintenant() >= finFile;
    porte.relire(actuelles, { poseSeule }).then(
      () => {
        if (finie) return;
        const apres = porte.annonces();
        if (empreinte(apres) === empreinteAvant) {
          delai = Math.min(delai * 2, RELECTURE_MAX_MS);
        } else {
          delai = RELECTURE_MS;
          fin = Math.min(
            debut + RELECTURES_PLAFOND_MS,
            Math.max(fin, porte.maintenant() + RELECTURE_SANS_PROGRES_MS),
          );
        }
        planifier(apres);
      },
      () => {
        // Réseau ou pause : on réessaie, plus tard.
        if (finie) return;
        delai = Math.min(delai * 2, RELECTURE_MAX_MS);
        planifier(actuelles);
      },
    );
  };
  const relancer = () => {
    if (finie || enCours) return;
    delai = RELECTURE_MS;
    planifier(porte.annonces());
  };
  return {
    releveAirbnb(rows) {
      if (rows.some(aRelireEnFile)) enFile = true;
      relancer();
    },
    relancer,
    arreter() {
      finie = true;
      annuler?.();
      annuler = null;
    },
  };
}
