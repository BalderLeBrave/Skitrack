# Annonces — contrat unique

Toutes les annonces, API ou scraping, finissent dans le même objet
(`CanonicalListing` / table `accommodation`) et la même ligne UI.

La source d'annonce **n'est pas** la source de vérité géo.

| Champ | Qui décide |
|---|---|
| Identité, lits, chambres, prix, URL | provider / parser |
| Coordonnées | provider si `exact`, sinon BAN (FR) / Nominatim, sinon centroid commune (`approximate`) |
| `altitude_m` | **toujours** IGN RGE ALTI (France) ou OpenTopoData EU-DEM. Jamais le texte d'annonce. |
| Distance remontées | **toujours** gare aval `domain_lift.base`. Pas le centroïde du domaine. Pas une « piste » si `domain_slope` est vide. |
| Capacité / chambres | provider, sinon parse fiche, sinon OSM, sinon `NULL`. `NULL` n'est pas `0`. |

## Définitions

**Altitude logement** — élévation au point `(lat, lon)` de l'annonce. Pas l'altitude
station, pas le bas des pistes, pas « chalet d'altitude 2000 m » du titre.
Si `location_precision != exact` : afficher `~altitude` et « point approximatif ».
Conflit titre vs IGN : on garde IGN, le titre reste une note.

**Distance des pistes** — distance géodésique jusqu'à la gare aval la plus proche
**du domaine recherché**. Libellé : « X m des remontées » tant que `domain_slope`
est vide. Position floue : arrondi à 100 m, ou « < 1 km » sous le kilomètre.

**Chambres** — pièces destinées à dormir, fermées. Studio = 0 chambre,
`capacity_max` renseigné. « T3 » / « 2 pièces » restent des pièces (`rooms`) ;
on ne les traduit pas en chambres sur l'annonce (le filtre convertit la *demande*).

**Capacité max** — couchages déclarés (personnes). `adults + children` si la
source sépare. Jamais `bedrooms × 2` sauf `inferred` + pastille.

## Mapping par source

| Source | `source` | `source_id` | GPS | `location_precision` | chambres | capacité | note |
|---|---|---|---|---|---|---|---|
| Airbnb scraper | `airbnb_scraper` | `rooms/{id}` | cercle | `approximate` | `bedroomCount` | `personCapacity` | note /5 |
| Booking scraper | `booking_scraper` | slug hôtel | Apollo `location` | `exact` (hôtel) | `numberOfBedrooms` | `maxPersons` | note /10 |
| Abritel / VRBO | `abritel_scraper` | `p…` | Cozy coords | `approximate` | `bedRoomCount` | `guestCapacity` | |
| Gîtes de France | `gites_de_france` | `38G…` | JSON-LD / BAN | `address` | tuile `N chambres` | `N personnes` | |
| CozyCozy | `cozycozy_scraper` | id carte | coords carte | `approximate` | si publié | si publié | porte, pas source d'affichage |
| LiteAPI | `liteapi` | id hôtel | exact | `exact` | provider | occupancy | |
| Centrales | `central:{moteur}` | id fiche | fiche / OSM | `exact` si GPS | souvent `rooms` (pièces) | barème occupancy | |
| OSM | `osm` | node/way | nœud | `exact` | `rooms` | `beds` / `capacity` | pas de prix ; carte-redirection Airbnb si le bâtiment n'est pas déjà dans le relevé |
| Manuel / URL | `manual` / `deeplink` | hash URL | page ou saisie | selon geo | saisie | saisie | |

`normalize()` : `sidecar/skitrack/scrapers/normalize.py` + `scrapers/sources/*`.
Une altitude présente dans le brut est **jetée**. L'IGN la recalcule
(`parse_ign_elevations`, fixture Val Thorens 45.2976, 6.5850 → 2304 m ± 5).

## Pipeline

1. **Extract** — worker furtif (`scrape/airbnb` curl_cffi, Booking/Abritel Playwright stealth, Gîtes ITEA). Empreinte partagée : `skitrack.scrapers.stealth`.
2. **Normalize** → `CanonicalListing`.
3. **Geolocate** — `sidecar/skitrack/services/geolocate.py`, appelé par `POST /api/lodgings/access` **avant** IGN et la distance aux remontées.
   - GPS `exact` plausible et pas à plus de 40 km du domaine : on le garde (`provider`).
   - Sinon BAN (France, biais `lat`/`lon` du domaine) / Nominatim (`viewbox`).
   - BAN `housenumber` / `street` → précision `address`. Commune / municipality → `approximate`.
   - Un titre d'annonce n'est **pas** une adresse (« Chalet les étoiles » ne se géocode pas).
   - `(0, 0)` n'est **pas** un logement (SkiLift Apollo Booking).
   - Le centroïde du domaine n'est **jamais** écrit comme GPS du logement.
   - Un résultat BAN à plus de 40 km du domaine est refusé.
   - **Cercle flou (Airbnb / Abritel)** — à la demande, `visual_gps.resolve_exact_coords` :
     Google Lens (SerpApi) retrouve la même façade sur une *fiche* Gîtes ou Booking
     (pas une SERP, pas une page ville, pas une photo de banque). OpenStreetMap
     vote **avec** Lens : Overpass liste les hébergements nommés autour du cercle
     (500 m). Même bâtiment = 2 sources. On lit **leur** GPS publié, jamais un
     centroïde de domaine. Un point n'est pas le bien sous prétexte qu'il tombe
     dans 800 m :
     - ≤ 200 m du cercle, sauf collision de nom (une seule source = voisin) ;
     - hameau dense (≥ 3 chalets OSM nommés dans 200 m) : il faut le nom, ou 2 sources ;
     - 200–450 m si le nom de la fiche concorde, ou si 2 sources votent le même bâtiment ;
     - 450–800 m seulement si nom **et** 2 sources.
     Une photo qui pointe 3 GPS distincts est un catalogue (jetée). Deux
     bâtiments à égalité de voix → on garde le cercle. `b_map_center` (mini-plan
     de station) et un `Place` Schema.org ne comptent pas. BAN uniquement sur
     une adresse postale de fiche, jamais un chef-lieu. OSM : nom strict **et
     unique** (deux homonymes proches = silence). Un titre générique n'est pas un
     nom. Sans match : on garde le cercle, `low` — jamais le centroïde du domaine.
4. **Enrich** — `POST /api/lodgings/access` : une requête Overpass sur l'emprise
   du domaine (pas une par annonce). Un bâtiment OSM au nom **unique** :
   - GPS flou / absent → on cale l'épingle sur le nœud (`exact`, source `osm`) ;
   - GPS `exact` du provider : on ne le déplace pas ;
   - chambres / capacité encore vides → tags `rooms` / `beds` / `capacity`
     (`capacity_source=osm`). Jamais un 0 inventé, jamais un T3 traduit.
   Puis IGN + distance à `domain_lift.base`, sur le point raffiné.
5. **Dedupe** — même `source_id` / URL. Second passage < 40 m **et** nom proche **uniquement** entre sources distinctes à GPS exact/adresse. Un GPS flou (Airbnb, Abritel) ne fusionne jamais : trop d'annonces partagent le même cercle. Même source : `listingKey` suffit, on ne recollera pas deux chambres d'hôtel.
6. **Quality gate** — une annonce se montre avec des trous. Elle n'invente rien.

## UI

Ligne fixe, toutes sources :

`[badge source]  [altitude IGN]  [distance remontées]  [chambres]  [pers.]`

Exemples :

```
Airbnb     1 720 m IGN   250 m des remontées     2 ch.   6 pers.
Booking    1 850 m IGN   < 1 km des remontées (point flou)  —   4 pers.
Gîtes      1 642 m IGN   420 m des remontées     3 ch.   8 pers.
```

Filtres « ≥ 6 personnes » et « ≤ 500 m des remontées » lisent `capacity_max` et
`dist_to_nearest_lift_m`. Une valeur inconnue n'est pas un 0.

## Interdit

* Recopier l'altitude marketing.
* Afficher `dist_to_domain_centroid_m` comme « distance pistes ».
* Comparer une note /10 et une note /5 sans `rating_scale`.
* Filtrer sur 0 quand la valeur est inconnue.
* UI spécifique par source au-delà du badge + lien.
