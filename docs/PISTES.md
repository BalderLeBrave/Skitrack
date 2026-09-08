# Pistes alpines — comptage, provenance, limites

SKITRACK ne scrappe **aucun** site de station, ni France Montagnes, ni OnTheSnow.
Le décompte affiché est un **comptage reproductible** d’OpenSkiMap (données OSM, licence **ODbL**),
éventuellement remplacé à l’affichage par un overlay brochure saisi à la main.

Un chiffre de piste n’est **pas** un chiffre officiel d’exploitant.

Attribution : © contributeurs OpenStreetMap / [OpenSkiMap](https://openskimap.org/) (ODbL).

## Définition « 1 piste »

Une piste = **une feature OpenSkiMap** `run` alpine rattachée au `skiArea` du domaine, après dédoublonnage :

1. **1 relation / 1 run id OpenSkiMap = 1 piste**, même si la géométrie a N segments.
2. Un way membre d’une relation déjà comptée n’est pas compté une deuxième fois (`source_id` unique).
3. Variantes (même nom + même id parent) : 1 piste. La difficulté retenue est celle du tracé principal documenté, pas une moyenne.
4. Liaisons / ski route / itinerary : clé `unknown` (segment Autres), pas bleu/rouge.
5. Snowpark / boardercross : clé `park`, sauf s’ils sont déjà tagués downhill + difficulty.

v1 **n’agrège pas** les pistes des stations liées (`linked_domain_id`).
Chaque ligne Comparer = une entité `ski_domain`. Le forfait commun est un sous-texte, pas une somme.

La distance logement ↔ domaine reste calculée sur les **remontées** (`domain_lift`), pas sur les tracés de pistes.

## Mapping OSM → couleur UI (France / Alpes)

Uniquement le downhill alpin (`piste:type=downhill` / activité OpenSkiMap `downhill`).
Nordique, hike, sled, playground, connection non cotée : exclus du classic.

| OSM `piste:difficulty` | Couleur UI FR | Clé JSON | Hex (clair) |
|---|---|---|---|
| novice | Verte | `green` | `#22A34A` |
| easy | Bleue | `blue` | `#2B6CB0` |
| intermediate | Rouge | `red` | `#C53030` |
| advanced | Noire | `black` | `#1A1A1A` |
| expert, extreme | Jaune/orange hors-piste | `expert` | `#DD6B20` |
| freeride | Jaune itinéraire | `freeride` | `#D69E2E` |
| null / other | Gris non coté | `unknown` | `#718096` |
| snowpark (non downhill coté) | — | `park` | — |

**Expert n’est pas du noir.** Un cercle vert US (`easy`) n’est jamais colorié en vert français sans ce tableau.
v1 = France only.

Barre grand public : 4 couleurs classiques V/B/R/N. Un 5ᵉ segment **Autres** (expert + freeride + unknown + park) se déplie.

`slopes_count_alpine_classic` = green + blue + red + black (dénominateur de la barre).
`slopes_count_total` = toutes les clés.

Largeur d’un segment = nombre, km **annoncés** (parts OSM × total fiche) ou % — bascule Nombre | km | % sur la fiche. La somme des km par couleur (vertes + bleues + rouges + noires + autres) **est** le kilométrage annoncé ; on n’invente ni le total ni la répartition.

## Contrat de vérité — trois couches

Jamais mélangées à l’affichage sans pastille.

| Couche | `slopes_source` | `slopes_quality` | Ce que l’UI montre |
|---|---|---|---|
| A. calculé | `openskimap` | `complete` / `partial` / `empty` | Comptes OSM + pastille OSM ou « partiel » |
| B. curaté | `curated` | `curated` | Comptes YAML + pastille fiche station. OSM reste en tooltip |
| C. incomplet | `openskimap` | `empty` / `partial` | Pas de faux 0/0/0/0. Barre pointillée « Pistes non recensées » |

`partial` si `runs_with_difficulty / runs_alpine < 0.6` (ou > 40 % untagged).
Un domaine `empty` n’entre pas dans un preset ni dans un filtre « au moins N ».

Interdit : inventer un décompte, scraper une brochure, l’injecter dans le score séjour.

## Overlay YAML

Dans `sidecar/skitrack/data/curated/domains_fr.yaml`, bloc optionnel `slopes:` :

```yaml
# slopes:
#   source: brochure          # brochure | office_tourisme | manuel
#   as_of: 2025-12-01
#   url: https://example.invalid/brochure-hiver-2025-26.pdf
#   counts:
#     green: 8
#     blue: 21
#     red: 14
#     black: 6
#     other: 2
#   km:
#     green: 12.0
#     blue: 40.0
#   note: "Brochure hiver 2025-26, p. 4"
```

Aucun exemple chiffré n’est commité : coller un décompte brochure est un geste humain, pas un défaut du dépôt.

## Ingest

1. `ski_areas.geojson` pose un premier agrégat (`statistics.runs.byActivity.downhill.byDifficulty`).
2. `runs.geojson` (optionnel, gros) upsert `domain_slope` **sans géométrie v1**, puis **recompte** 1 `source_id` = 1 piste. Ce recomptage écrase les stats ski_area du domaine touché.
3. Overlay curated **après** l’agrégat.
4. Contrôle : `npm run sidecar:audit-slopes -- --top 30` → CSV domaine, total OSM, total curaté, delta, % untagged, statut (`ok` / `ecart>15%` / `vide` / `partiel`).

Import : `npm run sidecar:import` (domaines + remontées + pistes si le dump runs est dispo). `--no-runs` conserve les agrégats ski_area.

## Trois exemples (méthode, pas brochure)

### 1. Petit domaine — La Féclaz

Domaine comptable à la main sur [OpenSkiMap.org](https://openskimap.org/) : chaque run downhill rattaché au skiArea, une ligne = un id. Si OSM n’a tagué qu’une partie des traces, `slopes_quality = partial` et le filtre « au moins N noires » **n’utilise pas** ce domaine.

### 2. Les 3 Vallées — agrégat vs station

OpenSkiMap publie à la fois un domaine « Les 3 Vallées » et des entités station (Val Thorens, Les Menuires, Méribel…). SKITRACK **n’additionne pas** les pistes des stations dans la ligne du domaine relié. Val Thorens a son mix ; Les 3 Vallées a le sien, s’il existe comme `ski_domain`. Le forfait commun apparaît en sous-texte.

Le jeu de tests renderer utilise 8 / 21 / 14 / 6 comme **proportions de barre** (Val Thorens illustratif), pas comme chiffre officiel 2026.

### 3. Domaine mal tagué

Un skiArea sans runs downhill, ou dont > 40 % des traces n’ont pas `piste:difficulty` : `empty` ou `partial`. L’UI affiche « Pistes non recensées » (lien OpenSkiMap) ou la pastille **partiel**. Pas de 0/0/0/0, pas de score, pas de preset Famille / Engagé / Expert.

## Presets Comparer (constantes testées)

| Profil | Règle |
|---|---|
| Famille / débutant | vertes+bleues ≥ 60 % du classic **et** noires ≤ 15 % |
| Mixte | aucune couleur classic > 50 % |
| Engagé | rouges+noires ≥ 50 % |
| Expert | noires ≥ 8 **ou** (noires+expert) ≥ 20 % du classic |

Le mix **n’entre pas** dans le score séjour / forfait.

## Hors scope (volontaire)

- Ouverture temps réel des pistes.
- Scrape des plans PDF.
- Recolorisation par pente réelle (OpenSkiStats) — TODO ici, ne pas coder.
- Nordique comme 1er citoyen (juste exclu du classic).
- Changer le calcul d’accès logement (lifts vs slopes).
