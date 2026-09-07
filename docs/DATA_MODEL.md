# Schéma de base de données

17 tables, créées dès la phase 1 même quand elles ne servent qu'en phase 3 ou 4 : figer le schéma
maintenant évite une migration au milieu du projet, et surtout garantit qu'un logement importé à
la main et un logement issu d'une API partagent **exactement la même table**.

SQLite avec `journal_mode=WAL`, `foreign_keys=ON` (désactivées par défaut dans SQLite, ce qui
laisserait passer des références orphelines) et `busy_timeout=5000`.

```
                    ┌──────────────┐
                    │    origin    │  adresses de départ
                    └──────┬───────┘
                           │
        ┌──────────────────┼───────────────────┐
        │                  │                   │
┌───────▼────────┐  ┌──────▼────────┐          │
│ domain_access  │  │ access_metrics│          │
│ (origine ×     │  │ (par logement)│          │
│  domaine ×     │  └──────┬────────┘          │
│  profil)       │         │                   │
└───────┬────────┘         │                   │
        │                  │                   │
┌───────▼──────────────────▼───────┐    ┌──────▼────────┐
│           ski_domain             │◄───┤ saved_search  │
│  ● altitude_min_m (bas pistes)   │    └───────┬───────┘
│  ● altitude_max_m                │            │
│  ● altitude_village_m            │     ┌──────▼───────┐
│  ● glacier, snowmaking_pct       │     │  search_run  │
│  ● linked_domain_id (auto-FK)    │     └──────────────┘
└──┬────────┬─────────────┬────────┘
   │        │             │
┌──▼─────┐ ┌▼──────────┐ ┌▼──────────────┐
│domain_ │ │domain_lift│ │ accommodation │
│slope   │ │           │ │               │
└────────┘ └───────────┘ └───┬───────┬───┘
                             │       │
                    ┌────────▼──┐ ┌──▼──────────────────┐
                    │   offer   │ │ accommodation_photo │
                    └─────┬─────┘ └─────────────────────┘
                          │
                   ┌──────▼──────┐
                   │ price_point │
                   └─────────────┘

    snow_report ──► ski_domain
    scoring_profile · app_setting · http_cache · provider_state  (autonomes)
```

---

## Référentiel

### `ski_domain` — l'unité de raisonnement de l'application

Un **domaine**, pas une station : Les 3 Vallées = 1 domaine, 8 stations. C'est le domaine qui
porte l'altitude des pistes et donc la garantie d'enneigement.

| Colonne | Type | Note |
|---|---|---|
| `source`, `source_id` | str | Clé d'idempotence de l'import (`UNIQUE`). `source_id` = SHA1 stable OpenSkiMap. |
| `osm_id`, `wikidata_id` | str | Traçabilité vers la source. |
| `name`, `slug` | str | `slug` sert de clé humaine dans le fichier curated. |
| `country`, `region`, `admin_code` | str | ISO 3166-1 alpha-2 / nom / ISO 3166-2 (`FR-73`). |
| `massif` | str | Reconstitué depuis `admin_code` via `data/reference/massifs.yaml`. |
| `localities` | JSON | Communes couvertes — rattachement d'un logement géocodé. |
| `status` | str | `operating` / `disused` / `abandoned` / `proposed`. |
| **`altitude_min_m`** | int | **Bas des pistes** = point skiable le plus bas. **Pas** l'altitude du village. Indexé. |
| **`altitude_max_m`** | int | Point culminant skiable. Indexé. |
| `altitude_village_m` | int | Front de neige. Absent de la source : estimé par la gare aval la plus basse. |
| `altitude_source`, `altitude_village_source` | str | `openskimap` / `ign` / `curated` / `derived:lift_base`. **Affiché dans l'UI.** |
| `slopes_km_total` | float | Pistes alpines uniquement (le nordique est exclu). |
| `slopes_km_by_color`, `slopes_count_by_color` | JSON | `{"vert":…, "bleu":…, "rouge":…, "noir":…}` |
| `lifts_count`, `lifts_count_by_type`, `lifts_km_total` | int/JSON/float | |
| `glacier` | bool | Non dérivable des statistiques : intersection Overpass `natural=glacier`, ou curated. |
| `snowmaking_pct` | int | `NULL` ≠ `0` — voir ci-dessous. |
| `north_facing_pct` | int | % de km orientés N/NE/NO. Meilleur prédicteur que l'altitude seule à altitude égale. Calcul phase 2. |
| `linked_domain_id` | FK auto | Liaisons **non** fusionnées par OpenSkiMap (Les 2 Alpes ↔ La Grave). |
| `linked_pass_name` | str | Paradiski, 3 Vallées, Dolomiti Superski… |
| `season_open_typical`, `season_close_typical` | date | Curated uniquement. |
| `official_website_url`, `official_booking_url` | str | |
| `centroid_lat`, `centroid_lon`, `bbox`, `geometry` | float/JSON | Emprise GeoJSON. Les **tracés** sont dans `domain_slope`. |
| `curated` | bool | Vrai si un champ vient du YAML curated → badge « vérifié », protégé des ré-imports. |

**Index composite `(country, altitude_min_m, altitude_max_m)`** : c'est exactement la forme du
filtre principal de l'écran 1.

> **Trois décisions de modélisation qui comptent**
>
> 1. **`snowmaking_pct` vaut `NULL`, jamais `0`, quand la donnée est absente.** OSM ne renseigne
>    la neige de culture que sur 12 domaines français sur 288. Stocker `0` ferait échouer le
>    filtre « ≥ 30 % » pour cause de non-cartographie, ce qui est un mensonge.
> 2. **La couleur n'est pas stockée sur la piste.** `domain_slope.difficulty` conserve la
>    difficulté OpenSkiData (`novice`/`easy`/`intermediate`/…) ; la couleur européenne en est
>    dérivée à l'agrégation. La même difficulté se colore autrement en Amérique du Nord.
> 3. **Chaque altitude porte sa provenance.** Sans `altitude_source`, impossible de distinguer un
>    « 1 559 m » mesuré d'un « 1 559 m » déduit d'une remontée mal cartographiée. La provenance
>    est affichée à l'utilisateur.

### `domain_slope`, `domain_lift`

Tracés de pistes (import optionnel, `runs.geojson` pèse plusieurs centaines de Mo) et remontées.
La **gare aval** (`base_lat`, `base_lon`) est le meilleur proxy disponible du front de neige :
c'est le point que vise réellement un skieur à pied. Les altitudes sont lues dans la 3ᵉ composante
des coordonnées GeoJSON — aucun appel altimétrique nécessaire.

### `snow_report`

Bulletin daté par domaine (Open-Meteo, Météo-France). `UNIQUE(domain_id, source, observed_on)`.
Phase 4 côté UI, table posée dès maintenant.

---

## Accès et trajets

### `origin`

Adresses de départ. Plusieurs possibles (domicile, bureau, chez les parents).

### `domain_access`

Temps et distance porte-à-porte entre une origine et un domaine.
`UNIQUE(origin_id, domain_id, profile)`.

**`profile` est une ligne, pas une colonne.** « Voiture avec péages » et « voiture sans péage »
sont deux enregistrements distincts. Sinon, ajouter le profil train imposerait une migration.

`crow_km` (vol d'oiseau) est stocké : c'est le pré-filtre **gratuit** appliqué avant tout appel au
routeur — inutile de calculer un itinéraire vers un domaine à 900 km quand on filtre à 4 h.
`provider` est conservé pour que l'écart entre deux sources soit lisible plutôt que suspect.

---

## Logements (phases 2-4, schéma déjà en place)

### `accommodation`

`UNIQUE(source, source_id)`. `source` vaut `expedia_rapid`, `booking`, `manual`, `deeplink`.

| Colonne notable | Pourquoi |
|---|---|
| `location_precision` | `exact` / `approximate`. Airbnb ne publie qu'un cercle flou avant réservation : sans ce drapeau, un `dist_to_nearest_slope_m` au mètre près serait une fausse précision. |
| `altitude_m` + `altitude_source` | **Toujours** calculée depuis (lat, lon) par API altimétrique, jamais reprise de l'annonce. |
| `rating` + `rating_scale` | Booking note sur 10, Airbnb sur 5. Comparer sans l'échelle est un piège. |
| `amenities` | Vocabulaire normalisé maison (`ski_room`, `sauna`, `dishwasher`, `parking`, `pets`, `wifi`…). Chaque provider y mappe dans `normalize()`. |

### `access_metrics`

Toutes les distances d'un logement, **pré-calculées et stockées**, jamais recalculées à
l'affichage.

- `dist_to_nearest_slope_m` (vol d'oiseau) **et** `walk_dist_to_slope_m` / `walk_time_to_slope_min`
  (itinéraire piéton réel, souvent 1,5× le vol d'oiseau).
- `dist_to_nearest_lift_m`, `walk_time_to_lift_min` — la remontée est plus pertinente que la
  piste : personne ne chausse au milieu d'une rouge.
- **`denivele_to_slope_m`**, signé. Positif = ça monte au retour. 300 m à plat n'est pas 300 m avec
  60 m de D+ skis à l'épaule. Le badge « skis aux pieds » exige `< 100 m` **et** `D+ < 20 m`.
- `slope_access_type` : `skis_aux_pieds` / `navette` / `voiture`.
- `has_ski_bus`, `walk_time_to_busstop_min`.
- `car_time_from_origin_min`, `transit_time_from_origin_min`.
- `computed_with` (JSON) : providers et versions utilisés, pour invalider **sélectivement** après
  un ré-import du référentiel plutôt que tout recalculer.

### `offer`

`UNIQUE(accommodation_id, source, check_in, check_out, guests)`.

**`guests` fait partie de la clé** : chez la plupart des sources le prix dépend du nombre
d'occupants (personne supplémentaire, taxe de séjour). Une offre « 6 personnes » ne peut pas
répondre pour 4.

| Colonne | Note |
|---|---|
| **`price_total`** | **Tout compris** : hébergement + ménage + taxe de séjour + charges + frais de service. Hors caution (remboursable, donc pas un coût). C'est la seule valeur affichée en gros. |
| `price_base` | Prix d'appel hors frais — conservé **uniquement** pour afficher l'écart. |
| `price_total_eur`, `fx_rate`, `fx_date` | Converti au taux du jour : indispensable pour trier un chalet suisse et un appartement français dans la même liste. |
| `fees_breakdown` | JSON : `{"cleaning":…, "tourist_tax":…, "service":…, "utilities":…, "deposit":…, "deposit_refundable":true}` |
| `expires_at` | `fetched_at + ttl`. Une offre expirée reste lisible hors ligne mais l'UI l'affiche grisée avec sa date, plutôt que de mentir sur un prix périmé. |

### `price_point`

Un relevé de prix par exécution. Alimente le graphique d'historique et les alertes de baisse.

---

## Recherches et préférences

| Table | Rôle |
|---|---|
| `saved_search` | Critères mémorisés. `criteria` est un JSON volontairement schemaless : les filtres évoluent à chaque phase et on ne veut pas migrer les recherches existantes à chaque ajout. |
| `search_run` | Trace d'exécution avec `provider_report`. Sans ça, « 12 résultats » est ininterprétable : on ne sait pas si Booking n'avait rien ou si le connecteur était en erreur. |
| `scoring_profile` | Pondérations du score, éditables par sliders. |
| `app_setting` | Préférences (langue, devise, provider de routage, TTL). **Aucune clé d'API ici.** |
| `http_cache` | Cache HTTP applicatif par `namespace` (`elevation` / `route` / `geocode` / `weather` / `offer`), pour purger par famille. On ne s'appuie pas sur les en-têtes serveur : IGN et OpenTopoData n'en renvoient pas d'exploitable, et on veut un TTL choisi par nous — altitude ≈ éternel, offre ≈ 6 h. |
| `provider_state` | État runtime d'un connecteur : configuré ? en quota ? dernière erreur ? C'est ce que lit l'UI pour afficher « source non configurée » sans casser la recherche. |

---

## Conventions transverses

- **Datetimes en UTC *aware*.** Le décorateur `UTCDateTime` force la conversion à l'écriture et à
  la lecture. SQLite ne conserve pas le fuseau : sans ça, toute comparaison
  `fetched_at + ttl < now` devient fausse d'une heure deux fois par an.
- **JSON sérialisé avec clés triées.** Diff stable, hash de cache reproductible.
- **Suppressions en cascade** depuis `ski_domain` et `accommodation` ; `SET NULL` sur les
  références faibles (`linked_domain_id`, `origin_id` d'`access_metrics`) pour ne pas perdre un
  logement en supprimant une adresse de départ.
