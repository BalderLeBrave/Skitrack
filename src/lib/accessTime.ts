/**
 * Temps pour rejoindre le bas des pistes, et par quel moyen.
 *
 * Une distance seule ne dit pas grand-chose : 300 m se marchent, 1 400 m se
 * conduisent, et le même « 28 min » affiché pour les deux serait faux dans un
 * cas sur deux. On choisit donc le moyen, on calcule le temps sur cette base,
 * et **on nomme le moyen** : un temps sans son moyen est illisible, c'est
 * exactement ce qui rendait « 7 min, +23 m » incompréhensible.
 *
 * ## Ce qui décide
 *
 * Quand la source classe l'accès (`skis_aux_pieds`, `navette`, `voiture`), sa
 * classification prime, parce qu'elle connaît le terrain : un logement à 200 m
 * d'une piste peut en être séparé par une falaise. La distance ne sert qu'à
 * trancher quand la source ne dit rien.
 *
 * ## Ce que ces minutes valent
 *
 * Une estimation, et rien de plus. La distance est mesurée à vol d'oiseau, on
 * lui applique un facteur de détour, puis une vitesse. Aucune de ces trois
 * grandeurs n'est un relevé. L'interface doit le dire, voir `ACCESS_TIME_NOTE`,
 * plutôt que de laisser croire à un itinéraire calculé.
 *
 * Repris de `src/renderer/src/data/accessTime.ts` (commit 2d960d5). Les six
 * constantes sont inchangées ; `formatAccessTime` et `ACCESS_TIME_NOTE` sont
 * ajoutés, parce que la mise en forme s'écrivait dans chaque appelant.
 */

/** Marche en station, chaussures aux pieds et matériel sur l'épaule. */
const WALK_M_PER_MIN = 50;

/**
 * Au-delà, personne ne marche avec des skis, et la source ne dit rien : on
 * bascule en voiture. Vingt-quatre minutes de marche, c'est déjà beaucoup.
 */
const WALK_MAX_M = 1200;

/** En deçà, on est au pied des pistes : il n'y a pas de trajet à chiffrer.
 *  Aligné sur le moteur d'origine (`SKI_IN_MAX_DIST_M` = 150 m). */
const SKI_IN_MAX_M = 150;

/** Vitesse sur les routes d'une station en hiver : lentes, étroites, enneigées. */
const DRIVE_KMH = 25;

/** Sortir la voiture, se garer, revenir : incompressible et souvent sous-estimé. */
const DRIVE_OVERHEAD_MIN = 5;

/** Rapport entre trajet réel et distance à vol d'oiseau, en station. */
const DETOUR_FACTOR = 1.3;

export type AccessMode = "skis_aux_pieds" | "a_pied" | "navette" | "voiture";

export type AccessTime = {
  mode: AccessMode;
  /** Minutes estimées. `null` quand il n'y a pas de trajet, skis aux pieds. */
  minutes: number | null;
};

/** Ce que la source a classé, quand elle l'a fait. */
export type EngineAccessType = "skis_aux_pieds" | "navette" | "voiture" | undefined;

function walkMinutes(distanceM: number): number {
  return Math.max(1, Math.round(distanceM / WALK_M_PER_MIN));
}

function driveMinutes(distanceM: number): number {
  const km = (distanceM * DETOUR_FACTOR) / 1000;
  return Math.max(1, Math.round((km / DRIVE_KMH) * 60) + DRIVE_OVERHEAD_MIN);
}

/**
 * Moyen et durée pour rejoindre le point skiable le plus proche.
 *
 * `null` quand la distance n'a pas été calculée : on ne devine pas un trajet
 * depuis une distance absente.
 */
export function accessTimeOf(distanceM: number, engineType: EngineAccessType): AccessTime | null {
  if (!Number.isFinite(distanceM) || distanceM < 0) return null;

  // La classification d'abord : elle sait ce que la distance ignore.
  if (engineType === "skis_aux_pieds") return { mode: "skis_aux_pieds", minutes: null };
  if (engineType === "voiture") return { mode: "voiture", minutes: driveMinutes(distanceM) };
  // La navette roule : c'est bien une vitesse de route. L'attente, elle, ne se
  // devine pas, et la note d'interface le précise plutôt que de l'inventer.
  if (engineType === "navette") return { mode: "navette", minutes: driveMinutes(distanceM) };

  // Sans classification, la distance tranche.
  if (distanceM <= SKI_IN_MAX_M) return { mode: "skis_aux_pieds", minutes: null };
  if (distanceM <= WALK_MAX_M) return { mode: "a_pied", minutes: walkMinutes(distanceM) };
  return { mode: "voiture", minutes: driveMinutes(distanceM) };
}

const MODE_LABEL: Record<AccessMode, string> = {
  skis_aux_pieds: "skis aux pieds",
  a_pied: "à pied",
  navette: "en navette",
  voiture: "en voiture",
};

/**
 * « 8 min à pied », « Skis aux pieds ».
 *
 * `null` en entrée rend une chaîne vide : un accès non calculé ne s'écrit pas,
 * l'écran saute la ligne plutôt que d'afficher un tiret qu'on lira comme zéro.
 */
export function formatAccessTime(access: AccessTime | null): string {
  if (!access) return "";
  if (access.minutes == null) {
    return access.mode === "skis_aux_pieds" ? "Skis aux pieds" : MODE_LABEL[access.mode];
  }
  return `${access.minutes} min ${MODE_LABEL[access.mode]}`;
}

/**
 * La note qui accompagne ces minutes.
 *
 * À afficher **une fois par écran**, pas une fois par ligne : répétée sous
 * chaque logement, elle devient du décor qu'on ne lit plus, et c'est
 * exactement la phrase qu'il faut lire.
 */
export const ACCESS_TIME_NOTE =
  "Temps estimés : distance à vol d’oiseau, facteur de détour et vitesse moyenne. " +
  "Ce n’est pas un itinéraire calculé, et l’attente d’une navette n’y figure pas.";
