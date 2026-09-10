/** Fonds raster libres — IGN Géoportail + OpenTopoMap. Jamais CARTO / MapTiler /
 *  Esri / Mapbox (leurs tuiles écrivent « API KEY REQUIRED » en énorme). */

export type BasemapKey = "ign" | "ortho" | "pistes";

export const DEFAULT_BASEMAP: BasemapKey = "ign";

/** Incrémenter pour forcer le remount MapLibre (HMR + persistance CARTO). */
export const MAP_TILE_REV = 6;

export type BasemapDef = {
  key: BasemapKey;
  label: string;
  sub: string;
  tiles: readonly string[];
  maxzoom: number;
  attribution: string;
};

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
  tiles: [
    "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.PLANIGNV2&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
  ] as const,
  maxzoom: 18,
  attribution: '© <a href="https://www.ign.fr">IGN</a> · Plan IGN v2',
};

const IGN_ORTHO = {
  tiles: [
    "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
  ] as const,
  maxzoom: 18,
  attribution: '© <a href="https://www.ign.fr">IGN</a> · BD ORTHO',
};

const IGN_PENTES = {
  tiles: [
    "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=GEOGRAPHICALGRIDSYSTEMS.SLOPES.MOUNTAIN&STYLE=normal&TILEMATRIXSET=PM&FORMAT=image/png&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
  ] as const,
  maxzoom: 16,
  attribution: '© <a href="https://www.ign.fr">IGN</a> · pentes montagne',
};

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

export function skiMapStyle(active: BasemapKey = DEFAULT_BASEMAP, pistes = true, pentes = false) {
  const current = resolvedBasemap(active);
  const b = BASEMAPS.find((x) => x.key === current) ?? BASEMAPS[0];
  const sources: Record<string, object> = {
    basemap: {
      type: "raster",
      tiles: [...b.tiles],
      tileSize: 256,
      maxzoom: b.maxzoom,
      attribution: b.attribution,
    },
    "ov-pentes": {
      type: "raster",
      tiles: [...IGN_PENTES.tiles],
      tileSize: 256,
      maxzoom: IGN_PENTES.maxzoom,
      attribution: IGN_PENTES.attribution,
    },
    "ov-pistes": {
      type: "raster",
      tiles: [...PISTE_OVERLAY.tiles],
      tileSize: 256,
      maxzoom: PISTE_OVERLAY.maxzoom,
      attribution: PISTE_OVERLAY.attribution,
    },
  };
  return {
    version: 8 as const,
    glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
    sources,
    layers: [
      { id: "bg", type: "background" as const, paint: { "background-color": "#dce6ee" } },
      { id: "basemap", type: "raster" as const, source: "basemap" },
      {
        id: "ov-pentes",
        type: "raster" as const,
        source: "ov-pentes",
        layout: { visibility: (pentes ? "visible" : "none") as "visible" | "none" },
        paint: { "raster-opacity": 0.55 },
      },
      {
        id: "ov-pistes",
        type: "raster" as const,
        source: "ov-pistes",
        layout: { visibility: (pistes ? "visible" : "none") as "visible" | "none" },
        paint: { "raster-opacity": 0.95 },
      },
    ],
  };
}
