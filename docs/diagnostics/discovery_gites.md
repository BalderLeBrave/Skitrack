# discovery_gites.md

**Status : SERP_GET** — dumps 2026-09-01 21:47. HTML brut **non versionné**.
Preuve : `dumps/bypass-gites-cozy.json`, `dumps/gites_autocomplete.json`.

## Contournement (le POST reste 403)

GET `https://www.gites-de-france.com/fr/search?towns=50301&travelers=8&date-start=2027-02-13&date-end=2027-02-20`

- `towns=50301` = id **towns** de l’autocomplete (`gites_autocomplete.json`), pas le POI 497.
- HTTP **200**, titre « … Les Deux Alpes », **33 Résultats**.
- 20 tuiles page 1, **16 ≥ 8 pers. / 4 chb** (plancher).
- Sélecteur dumpé : `.js-search-tile` / `.g2f-accommodationTile` — **pas** `.gite-card` (0).
- `extractGitesCards` : tuile + `a.g2f-accommodationTile-link` + prix `g2f-accommodationTile-text-price-new`.
- curl hors navigateur : Cloudflare 403. Navigateur neuf : GET OK. Même session trop sollicitée : 403.

`travelers=2` → 117 résultats. `travelers=` est un plancher côté Gîtes.

Prix « À partir de N € par semaine » — catalogue, pas un panier daté confirmé.

## Ce qui reste faux

- GET `entity_id=497` → form vide + Oups
- POST `search_api_page_block_form` in-page → Cloudflare 403 Ray a3475ff08e9744a6

## FOUND (dumps 2026-09-01)

| id | HTTP | ce que ça prouve |
| --- | --- | --- |
| `gites_autocomplete.json` | 200 | 497 pois, 424697 domaine, **50301 towns** |
| `gites_entity_poi497` | 200 | GET entity_id ignoré |
| `gites_inpage_post` | 403 | POST session bloqué |
| `gites_towns_50301` | 200 | GET towns= → 117 résultats (2 voy.) |
| `gites_dates_fresh` | 200 | GET towns + travelers=8 + dates → 33 résultats |
