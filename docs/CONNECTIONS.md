# CONNECTIONS.md

Preuve grep 2026-09-02, master.

| Case | Preuve |
| --- | --- |
| [x] centrals.ts consommé | `station/centralLookup.ts` + `recon-centrales.mjs`. Moteur = `buildEngine` (`providers/index.ts`) itère les connecteurs enregistrés, pas une liste hardcodée de 4 marques. |
| [x] chaque enabled a un adapter OU not_wired | 71/74 câblées. Rouges : Les Angles (Tourinsoft retiré). Voir `CENTRALES.md` / inventory subagent. |
| [x] search appelé avec dates+guests+bbox UI | `runProviderSearch.ts` + `cozycozySearchUrl({checkIn,checkOut,adults,bedrooms})`. |
| [x] pagination bouclée | Booking `collectPages` **15×25** (plafond 375). Arrêt si la SERP annonce N logements (`advertised`). Gîtes `page` 1-based, max **15**. Airbnb scroll idle 2 / max **15**. Abritel re-scroll idle 2 / **15**. `SEARCH_WALK`. |
| [x] détail/quote si liste incomplète | Gîtes : `enrichGitesStayTotals` → widget ITEA `gereResa.php`. Dates non remplissables → `unavailable`. |
| [x] listingHosts cohérent | `src/shared/listingHosts.ts`. CozyCozy interdit comme source (doublon). Abritel/VRBO lisibles. |
| [x] matchesDemand après enrich | `lodgingFilter.ts` `fitsParty` + `hasConfirmedPrice`. Null capacité = non éligible (plus « non annoncé » affiché en bandeau). |
| [x] null capacity/bedrooms exclus | getResultList exige `guestCapacity` + `bedRoomCount`. HTML « 6 6 13 » ignoré. Airbnb : `personCapacity` (clé StaysPdpSections 2026-08-30) + ligne « N chambres » du StaySearchResult. Absent → null, pas le groupe UI. |
| [x] geo pistes si lat/lng | `attachSlopeDistance` / `enrichWithAccess`. Jamais centroïde. GPS CozyCozy `coordinates` → `approximate_public`. |
| [x] pas de fallback centroïde | `gps_precision=missing` → distance null. |
| [x] résolveur WAF/captcha | Conservé. Airbnb `trySolveVisibleCaptcha`. Booking/Gîtes `loadAndExtract` : 0 cartes + `looksBlocked` → même résolveur, sinon `blocked` (page 1 conservée). |
| [x] cache clé dates+guests + ttl | `availability.ts` ttl 6 h. Un total séjour daté = disponible. |
| [x] 0 résultat → reason_code | Demand API sans jeton : `not_wired` (plus de throw). Ceto/Ublo/… hors hôte : `delegated`. `vrbo-web` 429 documenté. Gîtes empty_inventory. |
| [x] bandeau hidden_* honnête | Bandeaux « N masquée(s) parce qu’elles n’annoncent pas », « sans position relevée », « N écarté(s) plus bas » **retirés** de `LodgingsPage.tsx`. Le filtre reste silencieux. |
| [x] dédup intra-centrale | `listingKey` : code Gîtes / id Abritel / slug Booking, hors `adults` et dates. `mergeDupes` + `mergeProviderReadings` + `seen` du relevé. Une fiche = une carte. |
| [x] book_url présent | Abritel canonique `destination:` unwrap. Gîtes fiche + adults. |
| [x] Gîtes photos tuile | Dump `gites-discovery/search-d2a-0613.html` : 20/20 Drupal `?itok=`. `gitesTilesFromSearchHtml` + `mergeGitesCardsFromHtml` après `page.evaluate` (currentSrc lazy = URL HTML rejeté). Widget `og:image` ITEA si tuile vide. Jamais inventé. |
| [x] accueil chambres | `SearchBar` segment Groupe : voyageurs + chambres (`state.rooms`). Pill `N pers.` si rooms=0, `N pers. · X ch.` sinon. |

## VRBO pérenne

vrbo.com / abritel.fr SERP = 429. Chemin unique : SERP CozyCozy datée
`/fr/search/{lieu}/{from}/{to}/{chambres}-{adultes}-{enfants}/results`
→ intercept `GET /api/getResultList` → `providerCode=abritel|vrbo|homeaway`
→ occupancy, `totalPrice.indicative=false`, photo, GPS, fromDate.

CozyCozy n’émet **aucune** carte propre (doublon Airbnb/Booking/Gîtes).
