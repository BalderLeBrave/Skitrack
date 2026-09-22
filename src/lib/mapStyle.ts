/** Fonds libres — IGN Géoportail en tuiles, OpenSkiMap en vecteur. Jamais
 *  CARTO / MapTiler / Esri / Mapbox (leurs tuiles écrivent « API KEY REQUIRED »
 *  en énorme).
 *
 *  Deux moteurs : des tuiles, que Leaflet empile lui-même ; et OpenSkiMap, dont
 *  le style MapLibre est lu et posé par `carteOpenSkiMap.ts`. Le fond « Relief »
 *  était OpenTopoMap, un rendu raster d'OpenStreetMap ; il est devenu la carte
 *  d'OpenSkiMap — même donnée de fond, mais avec ses pistes et son ombrage. */

export type BasemapKey = "ign" | "ortho" | "pistes";

export const DEFAULT_BASEMAP: BasemapKey = "ign";

type BasemapCommun = {
  key: BasemapKey;
  label: string;
  sub: string;
  attribution: string;
};

export type BasemapDef = BasemapCommun &
  (
    | {
        moteur: "tuiles";
        tiles: readonly string[];
        maxzoom: number;
        /** Emprise servie par la source, si elle n'est pas mondiale. */
        bounds?: readonly [number, number, number, number];
      }
    | {
        /** La carte d'OpenSkiMap, fond et pistes, dessinée par MapLibre. */
        moteur: "openskimap";
      }
  );

/** France métropolitaine et Corse.
 *
 *  Les couches IGN ne servent pas le monde : hors emprise, `data.geopf.fr`
 *  répond 404, et la console de l'écran Carte en portait un à chaque
 *  chargement (une tuile au zoom 7, au-dessus de la Suisse). Déclarer l'emprise
 *  empêche la requête au lieu de la laisser échouer. Les 320 stations du
 *  référentiel y sont toutes. */
const FRANCE_BOUNDS = [-5.3, 41.2, 9.8, 51.2] as const;

/* La surcouche de pistes était OpenSnowMap, en tuiles. Elle est devenue les
   couches d'OpenSkiMap — voir `carteOpenSkiMap.ts`, qui les pose sur un fond
   IGN comme il pose la carte entière quand OpenSkiMap est le fond. */

const OPENSKIMAP = {
  moteur: "openskimap" as const,
  // Les crédits des sources viennent avec le style ; celui-ci nomme le site.
  attribution: '© <a href="https://openskimap.org">OpenSkiMap.org</a>',
};

const IGN_PLAN = {
  moteur: "tuiles" as const,
  bounds: FRANCE_BOUNDS,
  tiles: [
    "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
  ] as const,
  maxzoom: 18,
  attribution: '© <a href="https://www.ign.fr">IGN</a> · Plan IGN v2',
};

const IGN_ORTHO = {
  moteur: "tuiles" as const,
  bounds: FRANCE_BOUNDS,
  tiles: [
    "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
  ] as const,
  maxzoom: 18,
  attribution: '© <a href="https://www.ign.fr">IGN</a> · BD ORTHO',
};
/* La couche « pentes montagne » de l'IGN est partie avec le style MapLibre
   qui seul la posait. Aucun écran ne l'offrait plus. */

export const BASEMAPS: readonly BasemapDef[] = [
  {
    key: "ign",
    label: "Plan IGN",
    sub: "topographie française — sans clé",
    ...IGN_PLAN,
  },
  {
    key: "pistes",
    label: "Relief",
    sub: "OpenSkiMap — pistes, remontées, ombrage — sans clé",
    ...OPENSKIMAP,
  },
  {
    key: "ortho",
    label: "Photo aérienne",
    sub: "orthophoto IGN — sans clé",
    ...IGN_ORTHO,
  },
];

export function resolvedBasemap(key: string | null | undefined): BasemapKey {
  if (key === "topo") return "pistes";
  if (key === "sat") return "ortho";
  if (key === "sobre") return "ign";
  if (BASEMAPS.some((b) => b.key === key)) return key as BasemapKey;
  return DEFAULT_BASEMAP;
}
