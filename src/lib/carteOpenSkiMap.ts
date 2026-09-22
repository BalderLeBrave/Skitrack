/**
 * OpenSkiMap dans les cartes de SKITRACK, à la place des tuiles OpenStreetMap.
 *
 * OpenSkiMap ne publie **aucune tuile raster** : ses pistes, ses remontées et
 * ses domaines n'existent qu'en tuiles vectorielles, dessinées par le style
 * MapLibre de son site (`terrain_v2.json`). Leaflet ne sait pas les lire.
 * Le rendu passe donc par MapLibre GL, posé **dans** Leaflet par le pont
 * `@maplibre/maplibre-gl-leaflet` : Leaflet garde la main — épingles, fiches,
 * gestes, fonds IGN —, MapLibre ne fait que peindre une couche.
 *
 * MapLibre avait quitté le dépôt pour son poids. Il revient à la demande,
 * dans son propre morceau de bundle, chargé au premier affichage d'une carte
 * qui en a besoin — jamais au démarrage, jamais côté serveur.
 *
 * ## Le style est celui d'OpenSkiMap, lu chez lui
 *
 * Il n'est pas recopié dans le dépôt : c'est l'œuvre d'OpenSkiMap, non publiée
 * sous licence, et la lire à l'adresse où le site la sert est ce que fait le
 * site lui-même. On l'adapte en mémoire, sans rien inventer :
 *
 * - le `terrain` est retiré : la 3D déplacerait le dessin sous les épingles
 *   de Leaflet, qui ne connaît que le plan ;
 * - en **surcouche** (sur un fond IGN), seules restent les couches de la
 *   source `openskimap` — pistes, remontées, domaines, points — sans fond ni
 *   ombrage, pour laisser voir le plan IGN dessous ;
 * - les mentions de source sont posées là où le style n'en porte pas, pour
 *   que le crédit s'affiche : OpenSkiMap et OpenStreetMap pour les pistes,
 *   OpenFreeMap et OpenMapTiles pour le fond, Mapterhorn pour le relief.
 */

import type * as Leaflet from "leaflet";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";

export const STYLE_OPENSKIMAP = "https://tiles.openskimap.org/styles/terrain_v2.json";

export const ATTRIBUTION_PISTES =
  '© <a href="https://openskimap.org">OpenSkiMap.org</a> · © <a href="https://openstreetmap.org/copyright">OpenStreetMap</a>';
export const ATTRIBUTION_FOND =
  '<a href="https://openfreemap.org">OpenFreeMap</a> · © <a href="https://www.openmaptiles.org/">OpenMapTiles</a>';
export const ATTRIBUTION_RELIEF = '© <a href="https://mapterhorn.com">Mapterhorn</a>';

/** Ce que la couche doit peindre. */
export type ModeOpenSkiMap = {
  /** Le fond de carte (OpenFreeMap + ombrage), ou seulement les pistes. */
  fond: boolean;
  /** Les couches de la source `openskimap` : pistes, remontées, domaines. */
  pistes: boolean;
};

const SOURCE_PISTES = "openskimap";
const SOURCES_RELIEF = new Set(["hillshade", "terrain"]);

/**
 * Le style d'OpenSkiMap, adapté au mode demandé. Pure : ne touche pas à
 * l'objet reçu.
 */
export function adapterStyle(style: StyleSpecification, mode: ModeOpenSkiMap): StyleSpecification {
  const sourceDe = (l: LayerSpecification): string | null => ("source" in l ? (l.source ?? null) : null);
  const layers = style.layers.filter((l) =>
    sourceDe(l) === SOURCE_PISTES ? mode.pistes : mode.fond,
  );
  const sourcesUtiles = new Set(layers.map(sourceDe));
  const sources: StyleSpecification["sources"] = {};
  for (const [id, src] of Object.entries(style.sources)) {
    if (!sourcesUtiles.has(id)) continue;
    const attribution =
      id === SOURCE_PISTES ? ATTRIBUTION_PISTES : SOURCES_RELIEF.has(id) ? ATTRIBUTION_RELIEF : null;
    const tuilee = src.type === "vector" || src.type === "raster" || src.type === "raster-dem";
    sources[id] = attribution && tuilee && !src.attribution ? { ...src, attribution } : src;
  }
  const { terrain: _terrain, ...reste } = style;
  void _terrain;
  return { ...reste, sources, layers };
}

// ── Chargement, une fois, à la demande ─────────────────────────────────

type Pont = typeof import("@maplibre/maplibre-gl-leaflet");

let pont: Promise<Pont["maplibreGL"]> | null = null;
let styleBrut: Promise<StyleSpecification> | null = null;

/**
 * MapLibre, sa feuille de style, son worker et le pont vers Leaflet, dans un
 * morceau à part.
 *
 * Le worker est nommé exprès. MapLibre 6 le cherche à côté de son propre
 * module, par `new URL("./maplibre-gl-worker.mjs", import.meta.url)` ; une
 * fois empaqueté par Vite, ce voisin n'existe plus, la requête rend 404 sans
 * bruit, et chaque tuile reste « en chargement » pour toujours — le style, le
 * sprite et la source, eux, arrivent, ce qui rend la panne muette. Vite bâtit
 * donc le worker comme un fichier à lui (`?worker&url`), et MapLibre reçoit
 * son adresse avant la première carte.
 */
export function chargerOpenSkiMap(): Promise<Pont["maplibreGL"]> {
  pont ??= Promise.all([
    import("maplibre-gl/dist/maplibre-gl.css"),
    import("maplibre-gl"),
    import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"),
    import("@maplibre/maplibre-gl-leaflet"),
  ]).then(([, maplibre, worker, m]) => {
    maplibre.setWorkerUrl(worker.default);
    return m.maplibreGL ?? (m.default as Pont["maplibreGL"]);
  });
  return pont;
}

/** Le style d'OpenSkiMap, lu une fois par page, puis adapté à chaque mode. */
export function styleOpenSkiMap(mode: ModeOpenSkiMap): Promise<StyleSpecification> {
  if (!styleBrut) {
    const lecture = fetch(STYLE_OPENSKIMAP, { headers: { accept: "application/json" } }).then(
      async (res) => {
        if (!res.ok) throw new Error(`style OpenSkiMap : HTTP ${res.status}`);
        return (await res.json()) as StyleSpecification;
      },
    );
    // Une lecture ratée ne condamne pas la page : la prochaine carte réessaie.
    lecture.catch(() => {
      if (styleBrut === lecture) styleBrut = null;
    });
    styleBrut = lecture;
  }
  return styleBrut.then((s) => adapterStyle(s, mode));
}

/**
 * Pose la couche OpenSkiMap sur une carte Leaflet, dans le volet qui convient :
 * celui des tuiles quand elle est le fond, au-dessus quand elle n'est qu'une
 * surcouche — un fond de tuiles porte un `z-index` qui passerait sinon devant.
 *
 * Rend la couche, ou `null` si le style ou MapLibre n'ont pas pu être chargés ;
 * la carte reste alors telle qu'elle est, et la console dit pourquoi.
 */
export async function poserOpenSkiMap(
  carte: Leaflet.Map,
  mode: ModeOpenSkiMap,
  /** Dit si la carte attend encore la couche : démontée entre-temps, on ne pose rien. */
  encore: () => boolean = () => true,
): Promise<Leaflet.MaplibreGL | null> {
  try {
    const [maplibreGL, style] = await Promise.all([chargerOpenSkiMap(), styleOpenSkiMap(mode)]);
    if (!encore()) return null;
    const options = { style, pane: mode.fond ? "tilePane" : "overlayPane" };
    const couche = maplibreGL(options as Parameters<typeof maplibreGL>[0]);
    couche.addTo(carte);
    return couche;
  } catch (err) {
    console.warn("OpenSkiMap indisponible :", err);
    return null;
  }
}

/**
 * Retire la couche, crédit compris.
 *
 * Le pont pose son crédit dans le contrôle de Leaflet au chargement du style,
 * mais l'oublie au retrait : il jette d'abord sa carte MapLibre, et quand
 * Leaflet lui redemande son crédit pour l'effacer, il n'a plus rien à dire.
 * Changer de fond deux fois écrivait donc « © OpenSkiMap.org » deux fois.
 *
 * Sans danger sur une couche de tuiles : Leaflet ne retire un crédit qu'une
 * fois, quel que soit le nombre de demandes.
 */
export function retirerOpenSkiMap(carte: Leaflet.Map, couche: Leaflet.Layer): void {
  const credit = couche.getAttribution?.();
  if (credit) carte.attributionControl?.removeAttribution(credit);
  couche.remove();
}
