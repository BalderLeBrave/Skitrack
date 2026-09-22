/**
 * La carte des pistes dans SKITRACK : le style d'OpenSkiMap, sur nos tuiles.
 *
 * OpenSkiMap interdit l'usage direct de ses tuiles (« Direct use of tiles
 * hosted at tiles.openskimap.org is not permitted. Please prepare and host
 * your own tiles using the data from openskidata.org instead. »). C'est donc
 * ce qui est fait : les pistes, remontées, domaines et points d'Europe sont
 * tuilés par `scripts/build-tuiles-openskimap.ts` dans un fichier PMTiles
 * que nous servons nous-mêmes, et dessinés avec les couches de leur style,
 * adaptées par `scripts/adapter-style-openskimap.ts` (`carte/openskimap.style.json`).
 * Le fond vient d'OpenFreeMap, l'ombrage de Mapterhorn, les glyphes et le
 * sprite de ski de `public/` — chaque source à un usage permis, créditée.
 *
 * Leaflet garde la main — épingles, fiches, gestes, fonds IGN — ; MapLibre
 * GL, posé dans Leaflet par `@maplibre/maplibre-gl-leaflet`, ne fait que
 * peindre une couche. Il se charge à la demande, dans son propre morceau,
 * au premier affichage d'une carte qui en a besoin — jamais au démarrage,
 * jamais côté serveur.
 *
 * ## Deux modes
 *
 * - **fond** : la carte entière (OpenFreeMap + ombrage + pistes), comme le
 *   fond « Relief » de l'écran Carte et le fond des écrans Comparer et
 *   Logements ;
 * - **surcouche** : seules les couches de la source `openskimap` — pistes,
 *   remontées, domaines, points —, sans fond ni ombrage, par-dessus un plan
 *   IGN.
 *
 * ## Où sont les tuiles
 *
 * Par défaut à `/carte/openskimap-europe.pmtiles`, à côté de l'application.
 * `VITE_TUILES_OPENSKIMAP` peut nommer une autre adresse (un stockage qui
 * sert les requêtes `Range` avec CORS) : le fichier pèse plus de cent mégas,
 * et tous les hébergeurs ne le prennent pas dans le dépôt.
 */

import type * as Leaflet from "leaflet";
import type { LayerSpecification, StyleSpecification } from "maplibre-gl";
import STYLE from "./carte/openskimap.style.json" with { type: "json" };

/** Ce que la couche doit peindre. */
export type ModeOpenSkiMap = {
  /** Le fond de carte (OpenFreeMap + ombrage), ou seulement les pistes. */
  fond: boolean;
  /** Les couches de la source `openskimap` : pistes, remontées, domaines. */
  pistes: boolean;
};

const SOURCE_PISTES = "openskimap";
const CHEMIN_TUILES = "/carte/openskimap-europe.pmtiles";

/**
 * Le style d'OpenSkiMap adapté au mode demandé. Pure : ne touche pas à
 * l'objet reçu. En surcouche, seules restent les couches et la source
 * `openskimap` ; le `terrain` (3D) est toujours retiré, Leaflet ne
 * connaissant que le plan.
 */
export function adapterStyle(style: StyleSpecification, mode: ModeOpenSkiMap): StyleSpecification {
  const sourceDe = (l: LayerSpecification): string | null => ("source" in l ? (l.source ?? null) : null);
  const layers = style.layers.filter((l) => (sourceDe(l) === SOURCE_PISTES ? mode.pistes : mode.fond));
  const sourcesUtiles = new Set(layers.map(sourceDe));
  const sources: StyleSpecification["sources"] = {};
  for (const [id, src] of Object.entries(style.sources)) if (sourcesUtiles.has(id)) sources[id] = src;
  const { terrain: _terrain, ...reste } = style;
  void _terrain;
  return { ...reste, sources, layers };
}

/**
 * Le style versionné, ses adresses résolues : `{{ORIGINE}}` devient l'origine
 * du site, et la source des tuiles suit `VITE_TUILES_OPENSKIMAP` si elle est
 * donnée. Pure sur son entrée ; lit `location` et l'environnement.
 */
export function styleResolu(origine: string, tuiles?: string | null): StyleSpecification {
  const texte = JSON.stringify(STYLE).replaceAll("{{ORIGINE}}", origine);
  const style = JSON.parse(texte) as StyleSpecification;
  const source = style.sources[SOURCE_PISTES];
  if (source && "url" in source) {
    source.url = `pmtiles://${tuiles?.trim() || origine + CHEMIN_TUILES}`;
  }
  return style;
}

export function styleOpenSkiMap(mode: ModeOpenSkiMap): StyleSpecification {
  const tuiles = (import.meta.env?.VITE_TUILES_OPENSKIMAP as string | undefined) ?? null;
  return adapterStyle(styleResolu(window.location.origin, tuiles), mode);
}

// ── Chargement, une fois, à la demande ─────────────────────────────────

type Pont = typeof import("@maplibre/maplibre-gl-leaflet");

let pont: Promise<Pont["maplibreGL"]> | null = null;

/**
 * MapLibre, sa feuille de style, son worker, le protocole PMTiles et le pont
 * vers Leaflet, dans un morceau à part.
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
    import("pmtiles"),
    import("@maplibre/maplibre-gl-leaflet"),
  ]).then(([, maplibre, worker, pmtiles, m]) => {
    maplibre.setWorkerUrl(worker.default);
    // Le protocole `pmtiles://` : des requêtes Range dans un seul fichier.
    maplibre.addProtocol("pmtiles", new pmtiles.Protocol().tile);
    return m.maplibreGL ?? (m.default as Pont["maplibreGL"]);
  });
  return pont;
}

/**
 * Pose la couche OpenSkiMap sur une carte Leaflet, dans le volet qui convient :
 * celui des tuiles quand elle est le fond, au-dessus quand elle n'est qu'une
 * surcouche — un fond de tuiles porte un `z-index` qui passerait sinon devant.
 *
 * Rend la couche, ou `null` si MapLibre n'a pas pu être chargé ; la carte
 * reste alors telle qu'elle est, et la console dit pourquoi.
 */
export async function poserOpenSkiMap(
  carte: Leaflet.Map,
  mode: ModeOpenSkiMap,
  /** Dit si la carte attend encore la couche : démontée entre-temps, on ne pose rien. */
  encore: () => boolean = () => true,
): Promise<Leaflet.MaplibreGL | null> {
  try {
    const maplibreGL = await chargerOpenSkiMap();
    if (!encore()) return null;
    const options = { style: styleOpenSkiMap(mode), pane: mode.fond ? "tilePane" : "overlayPane" };
    const couche = maplibreGL(options as Parameters<typeof maplibreGL>[0]);
    couche.addTo(carte);
    // Une expression d'icône du fond peut rendre le nom vide (« ofm: ») :
    // une image transparente, plutôt qu'un avertissement par tuile.
    const gl = couche.getMaplibreMap();
    gl.on("styleimagemissing", (e: { id: string }) => {
      if (/^(ofm|ski):$/.test(e.id) && !gl.hasImage(e.id)) {
        gl.addImage(e.id, { width: 1, height: 1, data: new Uint8Array(4) });
      }
    });
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
