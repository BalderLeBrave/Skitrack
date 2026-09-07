# Collecteur — qui fetch quoi

Preuve : fichiers cités. Pas une reconstruction.

## Ordre d’un run

`SearchEngine.search` (`src/main/providers/searchEngine.ts`) lance **toutes les centrales en parallèle** (`Promise.all`). Airbnb est un IPC à part (`airbnb:scrape`), lancé en parallèle depuis `LodgingsPage`.

Pages d’**une** OTA : série (Booking `collectPages` offset, Gîtes `page=`, station « PLUS DE RÉSULTATS »).

## Search (liste)

| Source | Endpoint / geste | Detail après ? | Preuve |
|---|---|---|---|
| Booking-web | SERP HTML `searchresults.fr.html?offset=` | Non. Occupancy tuile + Apollo. | `extractors.ts` `extractBookingCards` |
| Airbnb | `/s/…/homes` + scrolls, JSON `data-deferred-state` / `StaysSearch` | Non. | `airbnb/extract.ts`, `dynamicHtml.ts` |
| Abritel | Cozy `getResultList` XHR | Non (total + occupancy déjà). | `cozyResultList.ts` |
| Gîtes-web | SERP Drupal `page=` | **Oui** : devis ITEA obligatoire (tuile = /semaine). | `gitesFichePrice.ts` |
| station-web | Formulaire Ingénie + pages SERP | **Oui** si « à partir de ». HTTP `searchAjax` + `detailTarifs` + `calculerTotal`. | `station/fichePrice.ts` |
| Ceto | SERP HTML `ajax/more` | **Oui** grille occupancy fiche (Playwright), max 40. | `ceto/ficheOccupancy.ts` |

## Playwright

Un contexte persistant webscrape (`getScrapeContext`, `shared.ts`). Airbnb a le sien. Images / fonts / media / analytics **abort**. Pas de `networkidle` sur Booking.

## SQLite

[FAUX] les logements ne passent pas par SQLite. `selectionStore.ts` = notes/votes. `ms_db` = n/a.

## Cache

`quoteCache.ts` : clé `(source, id, check_in, check_out, guests)`, TTL 20 min.
