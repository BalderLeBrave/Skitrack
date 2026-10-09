/**
 * Prévision à quatorze jours, aux deux altitudes qui bornent la station.
 *
 * La météo de la liste de résultats suffit pour comparer des stations : neige
 * au sol et chutes annoncées, un point par station. La fiche pose une autre
 * question, « à quoi ressemble la semaine là-haut, et où tombe la limite
 * pluie-neige », et demande donc quatorze jours en bas des pistes **et** au
 * point culminant. Deux mille mètres d'écart valent souvent plus qu'une
 * journée de décalage.
 *
 * Repris de `src/renderer/src/data/domainWeather.ts` (commit 2d960d5). Deux
 * décisions de ce module sont conservées telles quelles, parce que les oublier
 * fausse les chiffres sans rien casser :
 *
 * 1. `snow_depth_max` est rendu en **mètres**, comme toutes les hauteurs de
 *    manteau d'Open-Meteo. Il faut multiplier par 100 pour l'afficher en cm.
 * 2. `precipitation_sum` additionne la pluie **et** l'équivalent en eau de la
 *    neige. En altitude, cela gonfle les millimètres de pluie d'une journée où
 *    il n'est tombé que de la neige. C'est `rain_sum` qui répond à la question
 *    posée, et `precipitation_sum` ne sert plus que de secours quand le modèle
 *    ne rend pas `rain_sum`.
 *
 * Rien n'est mis en cache sur le disque : le cache mémoire, trois heures, évite
 * le rechargement quand on referme et rouvre la même fiche. Aucune exception ne
 * remonte : en échec, les niveaux sont vides et `at` vaut `null`, ce que
 * l'écran sait dire.
 *
 * Le modèle par défaut d'Open-Meteo (`best_match`, ICON sur les Alpes) ne
 * sert plus. Le 8 octobre 2026, aux 2 Alpes à 3 600 m, il a publié 1,96 cm
 * de neige et 41 mm de pluie alors que la température est restée sous −1 °C,
 * et une hauteur au sol de 1 cm. Arpège, à la même altitude, a publié 11,2 cm
 * de neige. Le CEPMMT, 11 cm au sol. C'est ce décalage, pas une mesure de
 * pisteur, que la fiche montrait.
 *
 * En France métropolitaine et en Corse, les chutes, la pluie et les
 * températures viennent donc d'Arpège (il suit l'altitude demandée : pluie
 * au bas des pistes, neige au sommet). La hauteur au sol vient du CEPMMT,
 * parce qu'Arpège ne la publie pas. Ailleurs, le CEPMMT sert pour les deux :
 * son diagnostic de neige tient mieux qu'ICON en montagne. La série commence
 * hier, pour que la chute de la veille reste lisible le lendemain matin.
 */

import type {
  ForecastDay,
  ForecastLevel,
  ForecastPair,
  ForecastSlot,
  SkyKind,
  SkyLabel,
} from "./forecast.ts";
import { dateParis } from "./forecast.ts";

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";
const TTL_MS = 3 * 3600 * 1000;
const FORECAST_DAYS = 14;

type OpenMeteoForecast = {
  hourly?: {
    time?: string[];
    temperature_2m?: (number | null)[];
    weather_code?: (number | null)[];
    freezing_level_height?: (number | null)[];
  };
  daily?: {
    time?: string[];
    temperature_2m_max?: (number | null)[];
    temperature_2m_min?: (number | null)[];
    precipitation_sum?: (number | null)[];
    rain_sum?: (number | null)[];
    snowfall_sum?: (number | null)[];
    weather_code?: (number | null)[];
    wind_speed_10m_max?: (number | null)[];
    snow_depth_max?: (number | null)[];
  };
};

/** Codes WMO regroupés en quatre familles : celles que la fiche sait dessiner.
 *
 *  L'intervalle 51-67 est continu, et tout code au-delà de 95 en est : la
 *  bruine verglaçante (56, 57), la pluie verglaçante (66, 67) et l'orage (95,
 *  96, 99) tombaient sur « nuage », c'est-à-dire sur l'icône d'une journée
 *  couverte. Dans la bande des quatorze jours, l'icône est la seule
 *  information de ciel : rien à côté ne rattrapait le contresens.
 *  `skyLabelOf`, juste en dessous, connaît pourtant déjà « storm ». */
export function skyKindOf(code: number | null | undefined): SkyKind {
  if (code == null) return "cloud";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95) return "rain";
  if ([0, 1].includes(code)) return "sun";
  return "cloud";
}

function round(v: number | null | undefined): number | null {
  return v == null || !Number.isFinite(v) ? null : Math.round(v);
}

function round1(v: number | null | undefined): number | null {
  return v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10;
}

const EMPTY_SLOT = (hour: string): ForecastSlot => ({ hour, temp: null, sky: "unknown" });

function emptyLevel(altitudeM: number): ForecastLevel {
  return { altitudeM, morning: EMPTY_SLOT("09"), afternoon: EMPTY_SLOT("15"), days: [] };
}

/** Codes WMO en états de ciel nommés. Plus fin que `skyKindOf`, qui n'a que
 *  quatre familles parce qu'il sert à choisir un dessin. */
export function skyLabelOf(code: number | null | undefined): SkyLabel {
  if (code == null) return "unknown";
  if (code === 0) return "clear";
  if ([1, 2].includes(code)) return "fair";
  if (code === 3) return "overcast";
  if ([45, 48].includes(code)) return "fog";
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82].includes(code)) return "rain";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "snow";
  if ([95, 96, 99].includes(code)) return "storm";
  return "variable";
}

const MODELE_ARPEGE = "meteofrance_arpege_europe";
const MODELE_ECMWF = "ecmwf_ifs";

export type ChoixModele = {
  chutes: string;
  sol: string;
  /** Deux modèles dans la même réponse : chaque clé porte le nom du modèle. */
  suffixe: boolean;
  sourceChutes: "arpege" | "ecmwf";
};

/** Arpège Europe couvre la métropole et la Corse. Pas l'outre-mer. */
export function enFranceMetropolitaine(lat: number, lon: number): boolean {
  return lat >= 41.2 && lat <= 51.15 && lon >= -5.2 && lon <= 9.7;
}

export function choixModele(lat: number, lon: number): ChoixModele {
  if (enFranceMetropolitaine(lat, lon)) {
    return { chutes: MODELE_ARPEGE, sol: MODELE_ECMWF, suffixe: true, sourceChutes: "arpege" };
  }
  return { chutes: MODELE_ECMWF, sol: MODELE_ECMWF, suffixe: false, sourceChutes: "ecmwf" };
}

function colonne(
  table: object | undefined,
  nom: string,
  modele: string,
  suffixe: boolean,
): (number | null)[] | undefined {
  if (!table) return undefined;
  const v = (table as Record<string, unknown>)[suffixe ? `${nom}_${modele}` : nom];
  return Array.isArray(v) ? (v as (number | null)[]) : undefined;
}

type Releve = {
  daily?: { time?: string[]; [colonne: string]: unknown };
  hourly?: { time?: string[]; [colonne: string]: unknown };
};

/**
 * Une colonne du modèle des chutes, complétée jour par jour par celle du
 * CEPMMT quand elle est vide. Arpège Europe ne prévoit que quatre jours :
 * au-delà, ses colonnes sont nulles, et la bande des quatorze jours restait
 * vide en France. Le CEPMMT est déjà dans la même réponse : aucune requête de
 * plus.
 */
function serie(table: object | undefined, nom: string, choix: ChoixModele): (number | null)[] | undefined {
  const a = colonne(table, nom, choix.chutes, choix.suffixe);
  if (!choix.suffixe) return a;
  const b = colonne(table, nom, choix.sol, true);
  if (!a || !b) return a ?? b;
  return Array.from({ length: Math.max(a.length, b.length) }, (_, k) => a[k] ?? b[k] ?? null);
}

function slotAt(point: Releve, hour: string, choix: ChoixModele, jour: string): ForecastSlot {
  const i = slotIndex(point, hour, jour);
  if (i < 0) return EMPTY_SLOT(hour);
  const temp = serie(point.hourly, "temperature_2m", choix);
  const code = serie(point.hourly, "weather_code", choix);
  return {
    hour,
    temp: round(temp?.[i]),
    sky: skyLabelOf(code?.[i]),
  };
}

export function levelOf(point: Releve, altitudeM: number, choix: ChoixModele, jour = dateParis()): ForecastLevel {
  const d = point.daily;
  const time = d?.time ?? [];
  const snow = serie(d, "snowfall_sum", choix);
  const rain = serie(d, "rain_sum", choix);
  const precip = serie(d, "precipitation_sum", choix);
  const tmax = serie(d, "temperature_2m_max", choix);
  const tmin = serie(d, "temperature_2m_min", choix);
  const wind = serie(d, "wind_speed_10m_max", choix);
  const depth = colonne(d, "snow_depth_max", choix.sol, choix.suffixe);
  const code = serie(d, "weather_code", choix);
  const days: ForecastDay[] = time.map((iso, k) => ({
    date: iso,
    tempMax: round(tmax?.[k]),
    tempMin: round(tmin?.[k]),
    // `rain_sum` d'abord : `precipitation_sum` compte aussi l'équivalent en eau
    // de la neige, et gonflerait les millimètres en altitude.
    rainMm: round1(rain?.[k] ?? precip?.[k]),
    snowCm: round1(snow?.[k]),
    windMaxKmh: round(wind?.[k]),
    // `snow_depth_max` est en mètres, comme toutes les hauteurs de manteau.
    // On lit celui du CEPMMT : Arpège ne publie pas cette hauteur.
    depthCm: (() => {
      const m = depth?.[k];
      return m == null || !Number.isFinite(m) ? null : Math.round(m * 100);
    })(),
    kind: skyKindOf(code?.[k]),
  }));
  return { altitudeM, morning: slotAt(point, "09", choix, jour), afternoon: slotAt(point, "15", choix, jour), days };
}

/** Index horaire du créneau `hh` sur le jour demandé, pas sur le premier de la série. */
function slotIndex(point: Releve, hour: string, jour: string): number {
  const times = point.hourly?.time ?? [];
  return times.findIndex((t) => t.startsWith(jour) && t.endsWith(`T${hour}:00`));
}

function urlFor(lat: number, lon: number, elevationM: number, choix: ChoixModele): string {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    elevation: String(Math.round(elevationM)),
    // Les créneaux de 9 h et 15 h demandent la température et le code de ciel
    // horaires. C'est ce que l'écran montre au-dessus des quatorze jours :
    // « à quoi ressemble la journée, en haut et en bas ».
    hourly: "temperature_2m,weather_code,freezing_level_height",
    daily: [
      "temperature_2m_max",
      "temperature_2m_min",
      "precipitation_sum",
      "rain_sum",
      "snowfall_sum",
      "weather_code",
      "wind_speed_10m_max",
      "snow_depth_max",
    ].join(","),
    // Hier reste dans la série : le lendemain d'une chute, « aujourd'hui »
    // seul ne montrait plus que le résidu.
    past_days: "1",
    forecast_days: String(FORECAST_DAYS),
    models: choix.suffixe ? `${choix.chutes},${choix.sol}` : choix.chutes,
    timezone: "Europe/Paris",
  });
  return `${ENDPOINT}?${params.toString()}`;
}

const cache = new Map<string, { at: number; value: ForecastPair }>();

async function load(url: string): Promise<OpenMeteoForecast | null> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return null;
  return (await res.json()) as OpenMeteoForecast;
}

function gelMidi(point: Releve, choix: ChoixModele, jour: string): number | null {
  const noon = slotIndex(point, "12", jour);
  if (noon < 0) return null;
  const propre = colonne(point.hourly, "freezing_level_height", choix.chutes, choix.suffixe);
  const repli = colonne(point.hourly, "freezing_level_height", choix.sol, choix.suffixe);
  return round(propre?.[noon] ?? repli?.[noon]);
}

export async function fetchForecastPair(
  lat: number,
  lon: number,
  villageM: number,
  summitM: number,
): Promise<ForecastPair> {
  const low = Math.round(villageM);
  const high = Math.round(summitM);
  const choix = choixModele(lat, lon);
  // Le jour de Paris dans la clé : les créneaux et l'isotherme sont ceux de ce
  // jour. Gardé 3 h par-dessus minuit, le relevé de la veille donnait ses
  // créneaux à côté du jour courant que l'écran choisit (`jourCourant`).
  const key = `${lat.toFixed(3)},${lon.toFixed(3)},${low},${high},${choix.sourceChutes},${dateParis()}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;

  const empty: ForecastPair = {
    low: emptyLevel(low),
    high: emptyLevel(high),
    freezingLevelM: null,
    sourceChutes: choix.sourceChutes,
    at: null,
  };

  try {
    const [rl, rh] = await Promise.all([
      load(urlFor(lat, lon, low, choix)),
      load(urlFor(lat, lon, high, choix)),
    ]);
    if (!rl || !rh) return empty;

    const jour = dateParis();
    // L'isotherme est une propriété de la colonne d'air, pas du sol : la lire au
    // point culminant ou en bas donne la même valeur. On prend le relevé de
    // mi-journée du bas des pistes, sur le jour courant et non sur hier.
    const value: ForecastPair = {
      low: levelOf(rl, low, choix, jour),
      high: levelOf(rh, high, choix, jour),
      freezingLevelM: gelMidi(rl, choix, jour),
      sourceChutes: choix.sourceChutes,
      at: new Date().toISOString(),
    };
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return empty;
  }
}
