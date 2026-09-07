# discovery_gites.md

**Status : SERP_GET + QUOTE_ITEA** — dumps 2026-09-01 / 2026-09-02.
Preuve : `dumps/bypass-gites-cozy.json`, `dumps/gites-itea-catalog.json`, POST `gereResa.php`.

## Chemins universels (schéma réel, tous les ids)

| clé | path | preuve |
| --- | --- | --- |
| `path_price_from` | tuile `.g2f-accommodationTile-text-price` / widget `.prixSansDate` « À partir de N € /semaine » | Copains 1330, Centaurée 1400, Feuillardiers 950, Maradri 1700. **Jamais le séjour.** |
| `path_price_total_stay` | POST `widget-fngf.itea.fr/lib_2/ajax/gereResa.php` `type=getHTMLTabPrixFormulesSejour` → `.sp_montantPrixTotal[data-prix]` | Copains 4261.52 ; Centaurée 2899.36 ; Feuillardiers 1898.4 ; Maradri 2448.4 (8 pers. 06–13/02/2027). |
| `path_available` | même POST : `data-prix` présent = available ; JSON `contactSiNonVendable` = unavailable | Copains / Feuillardiers 13–20/02/2027 → hors liste. `prixLoc` dans ce JSON est la grille, pas un séjour. |
| `path_typology` | `data-ident` suffixe **`.G`** gîte / **`.H`** chambre d'hôtes / **`.GS`/`.GG`** gîte de séjour/groupe ; tuile `.g2f-accommodationTile-text-type` ; og:url `Gite-` / `Chambre-d-hotes-` / `Gite-de-groupe-` ; facet Drupal `type:36172` / `36174` / `36171` | Brindille `.H` + og `Chambre-d-hotes-` ; La Mansio `.GS` + og `Gite-de-sejour-`. Jamais le titre, jamais capacity ≥ 15. |

Contrat client : `typology_keep === gite` AND devis daté (`price_firm`) AND `guest_capacity_max >= guests` AND `bedrooms >= bedrooms` AND `availability_status === available`. Sinon exclu + `hidden_reason`.

## Contournement SERP (le POST Drupal reste 403)

GET `https://www.gites-de-france.com/fr/search?towns=50301&travelers=8&date-start=2027-02-13&date-end=2027-02-20&f[0]=type:36172`

- `towns=50301` = id **towns** de l’autocomplete (`gites_autocomplete.json`), pas le POI 497.
- HTTP **200**, titre « … Les Deux Alpes », **33 Résultats**.
- 20 tuiles page 1, **16 ≥ 8 pers. / 4 chb** (plancher).
- Sélecteur dumpé : `.js-search-tile` / `.g2f-accommodationTile` — **pas** `.gite-card` (0).
- `extractGitesCards` : tuile + `a.g2f-accommodationTile-link` + prix `g2f-accommodationTile-text-price-new`.
- curl hors navigateur : Cloudflare 403. Navigateur neuf : GET OK. Même session trop sollicitée : 403.

`travelers=2` → 117 résultats. `travelers=` est un plancher côté Gîtes.

Prix « À partir de N € par semaine » — catalogue, pas un panier daté confirmé.

## Quote ITEA (tous les ids, pas un if Copains)

Widget : `https://widget-fngf.itea.fr/fiche-{NUMGITE}.html?WIDGET=RESAFNGF&KEY=FNGF-00M562O4`.

1. GET widget → `data-ident` / `data-instance` / `data-exercice`.
2. POST `getExerciceByDateFin` (peut avancer l’exercice).
3. POST `getHTMLTabPrixFormulesSejour` avec `nbAdultes`, `dateDeb`, `dateFin` **identiques à l’UI**.
4. Lire `.sp_montantPrixTotal[data-prix]` = total public (loyer + taxe déjà dans le tunnel).
5. JSON `contactSiNonVendable` ou pas de total → indisponible, hors liste.

Dump `gites-itea-catalog.json` (8 pers.) :

| code | ident | weekly_from | 06–13/02 | 13–20/02 |
| --- | --- | ---: | ---: | --- |
| 38G253122 Copains | `.G` | 1330 | **4261.52** | contactSiNonVendable |
| 38G52734 Centaurée | `.G` | 1400 | **2899.36** | 2899.36 |
| 38G52200 Feuillardiers | `.G` | 950 | **1898.40** | contactSiNonVendable |
| 38G20200 Maradri | `.G` | 1700 | **2448.40** | 2448.40 |
| 38G253101 Pré-Forent | `.G` | 1208 | indispo | indispo |
| 38G549050 Brindille | `.H` | 90 | — chambre d'hôtes | — |
| 38G253115 La Mansio | `.GS` | 35 | — gîte de séjour | — |

G6 : changer uniquement les dates change le total (Centaurée 23–30/01 = 1642.24 ≠ 2899.36 ; Feuillardiers 1390.40 ≠ 1898.40 ; Maradri 2148.40 ≠ 2448.40).

## Ce qui reste faux

- GET `entity_id=497` → form vide + Oups
- POST `search_api_page_block_form` in-page → Cloudflare 403

## FOUND

| id | HTTP | ce que ça prouve |
| --- | --- | --- |
| `gites_autocomplete.json` | 200 | 497 pois, 424697 domaine, **50301 towns** |
| `gites_entity_poi497` | 200 | GET entity_id ignoré |
| `gites_inpage_post` | 403 | POST session bloqué |
| `gites_towns_50301` | 200 | GET towns= → 117 résultats (2 voy.) |
| `gites_dates_fresh` | 200 | GET towns + travelers=8 + dates → 33 résultats |
| `gites-itea-catalog.json` | 200 | POST gereResa daté, ident suffixe, 3 gîtes même station |
