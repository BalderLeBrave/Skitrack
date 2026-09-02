# Découverte CozyCozy

## SERP datée — dump 2026-09-02 (le prix)

GET

`https://www.cozycozy.com/fr/search/{place}/{from}/{to}/{chambres}-{adultes}-{enfants}/results`

Exemples dumpés (8 pers. / 4 chb / 0 enfant, 13–20 fév. 2027) :

| lieu | offres | exemple |
| --- | --- | --- |
| `Les Deux Alpes station de ski, France` | 180 / 21 sites | 6692 € pour 7 nuits (Airbnb) |
| `Méribel, France` | 715 / 13 sites | 8067 € pour 7 nuits |
| `Les Karellis, France` | 205 / 8 sites | 1811 € pour 7 nuits |
| `Vars, France` | 142 / 14 sites | 3680 € pour 7 nuits |
| `Les Angles, France` | 191 / 14 sites | 2280 € pour 7 nuits |

XHR (dans l’ordre) : `POST /api/searchInputLocation` → `POST /api/launch {searchId}` → `getSearchStateWhenNot` → **`getResultList`** → `getResults`.

Cartes HTML : `joli-resultitem` · prix `.pricetag-stacked` « N € pour 7 nuits » · lien `a.fake-deeplink`.

Pas de parseur JSON `getResults` : les champs occupancy de la carte (6 6 13) ne sont pas libellés.

`/fr/search?location=` reste une SPA vide.

## Catalogue SEO — dump 2026-09-01 (sans dates)

`https://www.cozycozy.com/fr/location-vacances-les-2-alpes`

- HTTP 200, **3729 offres**, 28 `article.hoj_seo_card`
- Prix « À partir de N € / nuit »
- Bouton Rechercher de **cette** page → Booking affiliate (`logNonResultRedirect`)

## Contrat bundle

- `searchByText` → `searchInputLocation({q, siteCode, locale})`
- `launch({searchId})` / `getResultList` : **dumpés** sur le path `/results` daté
