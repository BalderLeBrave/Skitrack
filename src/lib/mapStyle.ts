/** Fonds raster libres — IGN Géoportail + OpenTopoMap. Jamais CARTO / MapTiler /
 *  Esri / Mapbox (leurs tuiles écrivent « API KEY REQUIRED » en énorme).
 *
 *  Ce fichier ne décrit plus que des tuiles. La construction de style MapLibre
 *  est partie avec MapLibre : Leaflet empile ces couches lui-même. */

export type BasemapKey = "ign" | "ortho" | "pistes";

export const DEFAULT_BASEMAP: BasemapKey = "ign";

export type BasemapDef = {
  key: BasemapKey;
  label: string;
  sub: string;
  tiles: readonly string[];
  maxzoom: number;
  attribution: string;
  /** Emprise servie par la source, si elle n'est pas mondiale. */
  bounds?: readonly [number, number, number, number];
};

/** France métropolitaine et Corse.
 *
 *  Les couches IGN ne servent pas le monde : hors emprise, `data.geopf.fr`
 *  répond 404, et la console de l'écran Carte en portait un à chaque
 *  chargement (une tuile au zoom 7, au-dessus de la Suisse). Déclarer l'emprise
 *  empêche la requête au lieu de la laisser échouer. Les 320 stations du
 *  référentiel y sont toutes. */
const FRANCE_BOUNDS = [-5.3, 41.2, 9.8, 51.2] as const;

export const PISTE_OVERLAY = {
  tiles: ["https://tiles.opensnowmap.org/pistes/{z}/{x}/{y}.png"] as const,
  maxzoom: 18,
  attribution:
    '© <a href="https://www.opensnowmap.org">OpenSnowMap</a> · © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> (CC-BY-SA)',
};

const OPENTOPO = {
  tiles: [
    "https://a.tile.opentopomap.org/{z}/{x}/{y}.png",
    "https://b.tile.opentopomap.org/{z}/{x}/{y}.png",
  ] as const,
  maxzoom: 17,
  attribution:
    '© <a href="https://openstreetmap.org/copyright">OpenStreetMap</a> · <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)',
};

const IGN_PLAN = {
  bounds: FRANCE_BOUNDS,
  tiles: [
    "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
  ] as const,
  maxzoom: 18,
  attribution: '© <a href="https://www.ign.fr">IGN</a> · Plan IGN v2',
};

const IGN_ORTHO = {
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
    sub: "OpenTopoMap — sans clé",
    ...OPENTOPO,
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
