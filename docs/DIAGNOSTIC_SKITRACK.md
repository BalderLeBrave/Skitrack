# DIAGNOSTIC_SKITRACK.md

Audit du dépôt réel (`scrape-barriers`). Rien d’inventé. Chaque bug porte des
citations `fichier:ligne` **avant** patch, puis le correctif.

`centrals.ts` : **trouvé** — `src/main/providers/station/centrals.ts` (74
entrées). **Branché** via `station/centralLookup.ts` (import `CENTRALS`).

Captcha / WAF : **conservés**. Aucun kit d’évasion nouveau. Voir § Resolver.

---

## BUG 1 — Pagination incomplète — PATCHED (limites explicites)

### Preuves (avant)

| trou | citation |
| --- | --- |
| Plafond 5 pages / 60 s | `webscrape/providers.ts` `BOOKING_MAX_PAGES = 5` |
| Gîtes : `page=1` rejoué comme 2ᵉ page | `urls.ts` + `GITES_PAGE_STEP = 1` |
| Airbnb : 2–3 scrolls | `runAirbnbSearch.ts` `scrollCount: 3` |
| `page_index` / `stopped_reason` | **étaient NOT_FOUND_IN_REPO** |

### Correctif

- `collectPages` tamponne `pageIndex` / `searchRank`, attache `PaginationReport.stoppedReason`
- Gîtes/CozyCozy : `page = offset + 1`
- Airbnb : `scrollCount: 8`, `min_bedrooms` transmis
- `ProviderOutcome.pagination` + `reasonCode`

Acceptation « toute la station » : **interdit** si `stoppedReason != exhausted`.

---

## BUG 2 — Logements plus disponibles — PATCHED (partiel)

- `AvailabilityStatus` + `listing_gone` dans `types.ts` / IPC
- `toLodging` / `lodgingsFromOutcome` jettent `unavailable` et `listing_gone`
- `baseAccommodation` : tarifé → `available`
- TTL 6 h : `AVAILABILITY_TTL_MS` sur `scannedAt` dans `availabilityOf`

Dates du formulaire : déjà envoyées (`urls.ts`, `LodgingsPage`).

---

## BUG 3 — Filtres personnes / chambres → studios — PATCHED

- `matchesDemand` dans `lodgingFilter.ts`, appelé par `matchesLodgingFilters` si `!includeUnannounced`
- `normalizedBedrooms` : pièces françaises → chambres (`N pièces` ⇒ `N-1`, studio = 0)
- Studio seulement si `demand.bedrooms <= 1`
- Défaut UI : `lodgHideUnannounced: true` (schéma 8)
- Test : 4p/2chb → 0 studio (`lodgingFilter.test.ts` §12)

---

## BUG 4 — Distance pistes / GPS / centroïde — PATCHED

- `lodgingCoords` : **plus de dispersion** autour de `d.lat/d.lon` ; `null` sans GPS
- Carte : pas de pin sans lat/lng (`LodgingMap.tsx`)
- Cadrage carte : sans GPS, l’annonce **reste** dans la liste (`inBounds` → true)
- `distanceStatus`: `no_gps` | `ok` | `no_slope_geom`
- `enrichWithAccess` inchangé pour les GPS publiés (même calculateur)

---

## BUG 5 — VRBO / Gîtes = 0 silencieux — PATCHED (motif, pas parseur)

- Connecteurs déjà `register()` (`providers/index.ts`)
- 0 cartes → throw `emptyReason` (blocked vs selector_miss vs empty_inventory)
- `reasonCode` posé sur chaque outcome
- `station-web` hôte hors adapter → `[not_wired]` au lieu de `[]`
- `lodgFailed` / `lodgEmpty` **réaffichés** sur l’écran Logements
- VRBO extracteur : **pas touché** (SERP absente) — voir `discovery_vrbo.md`
- Gîtes extracteur : sélecteur dumpé `.js-search-tile` (GET `towns=`) — voir `discovery_gites.md`
- CozyCozy extracteur : `article.hoj_seo_card` (catalogue SEO) — voir `discovery_cozycozy.md`. `getResultList` jamais dumpé.

### Live 2026-09-01 (Les 2 Alpes, 13–20 fév. 2027, 8 pers.)

| source | HTTP | motif réel | reasonCode désormais |
| --- | --- | --- | --- |
| VRBO | 429 | title `Bot or Not?` | `blocked` (`pageLooksBlocked`) |
| Abritel | 429 | title `Robot ou pas robot ?` | `blocked` |
| Gîtes GET `search[value]` | 200 | `.g2f-searchResult-noResults` + « Oups ! … destination » ; `entity_id=""` | `empty_inventory` (destination_missing) |
| Gîtes GET `destination=` | 200 | **même** noResults — le nom de champ ne suffit pas | idem |
| Gîtes 2ᵉ visite | CF | `Attention Required!` | `blocked` |
| CozyCozy GET + Playwright | 200 | SPA `joli-root`, 0 XHR search, `router-outlet` vide | `0_after_parse` (`cozycozySearchEmptyKind`) |

`looksBlocked` avant ce dump : `/captcha\|are you a robot\|…/` — **ne matchait pas** « Bot or Not? ». Un 0 VRBO live serait sorti `selector_miss`.

`gitesSearchUrl` : dump 2026-09-01 21:47, GET `towns=50301` + `travelers=` + dates ouvre la SERP Les 2 Alpes (33 résultats). Hors dump : `destination=` (toujours 0 sans towns). Sélecteur `.js-search-tile`.

`cozycozySearchUrl` : Les 2 Alpes → `/fr/location-vacances-les-2-alpes` (catalogue SEO `hoj_seo_card`). `getResultList` jamais dumpé.

---

## Resolver CAPTCHA / WAF (conservé + rebranché)

| pièce | où | appelé par |
| --- | --- | --- |
| `CaptchaSolver` 2captcha | `captcha_solver.py` | `lodging.py` scrape **et** `POST /api/scrape/captcha/solve` |
| Electron pont | `src/main/captchaBridge.ts` | Airbnb `scrape.ts` après timeout humain |
| Playwright `STEALTH_INIT` | `webscrape/shared.ts`, `airbnb/scrape.ts` | **inchangé** |
| Captcha humain | `waitForCaptchaSolved` | **inchangé**, prioritaire |

Échec solveur → `challenge_unresolved`, pas une liste vide.
