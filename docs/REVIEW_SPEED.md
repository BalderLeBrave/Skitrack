# REVIEW_SPEED

Live `station_run` avant/après : à coller après un run machine (sandbox = pas de Chrome headed).

## Avant (journal utilisateur, Les 2 Alpes)

| provider | pages | fetched | shown | stopped |
|---|---|---|---|---|
| booking-web | 1 | 25 | 25 | exhausted |
| gites-web | 3 | 14 | 14 | exhausted |
| vrbo-web | 9 | 168 | 168 | exhausted |
| station-web | 1 | 319 | 319 | exhausted |

Goulots mesurés dans le code (pas le live) :

- Booking : `scrollToEnd` + `networkidle` ~6–12 s **par page** (`loadAndExtract`)
- Gîtes : 1 `page.goto` widget **par** gîte + 900 ms sleep
- Station : devis HTTP même si capacité < groupe
- Ceto : 8 GET Tripadvisor + jusqu’à 40 fiches Playwright

## Après (ce patch)

| levier | fichier | effet attendu |
|---|---|---|
| Booking : extract d’abord, scroll seulement si < 20 cartes, plus de networkidle | `webscrape/providers.ts` `loadAndExtract` | ms_search / page ÷ 3–5 |
| Gîtes : GET widget + POST gereResa, 4 workers, cache TTL | `enrichGitesStayTotals` | quote_fetches HTTP, 0 goto fiche |
| Station : skip trop petit + cache devis | `stationCardNeedsQuote` | detail_fetches << parsed |
| Playwright : abort images/fonts/mapbox | `blockHeavyResources` | bande passante |
| Ceto : plus de GET TA | `chamonix.ts` | −8 round-trips |
| Airbnb : wait StaysSearch, pas networkidle | `dynamicHtml.ts` | scroll plus court |

2ᵉ run identique : `cache_hits` > 0 sur gites/station, totaux inchangés (clé dates×guests).

S1 shown : filtres matchesDemand / entire / price_firm **inchangés**.
