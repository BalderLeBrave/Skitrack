# CONNECTIONS.md

Checklist bloquante. Une case non cochée = travail restant, pas un nice-to-have.

État **après patch** (cocher seulement ce qui est prouvé par grep + test).

## Moteur ↔ centrales

- [x] `centrals.ts` export utilisé par le moteur de recherche — `src/main/providers/station/centralLookup.ts` importe `CENTRALS` ; `aggregateResults` appelle `centralsLoaded()` + `emptyStationReason`
- [x] chaque `central_id` enabled a un adapter importable — **sauf 3 `not_wired`** (CENTRALES.md), `reasonCode=not_wired` au lieu de `[]` silencieux
- [x] `adapter.search` est appelé avec dates/guests/bbox de l’UI — `LodgingsPage.launchSearch` → `runProviderSearch` / `runAirbnbSearch` (Airbnb reçoit enfin `bedrooms` → `min_bedrooms`)
- [x] `adapter.paginate` / offset / cursor réellement bouclé **jusqu’à exhausted ou stopped_reason exposé** — `collectPages` pose `pageIndex` + `pagination.stoppedReason` ; Gîtes `page = offset+1`
- [x] `adapter.detail` branché OU champs déjà dans la liste — Ingénie : `fichePrice.ts` ; Ceto : occupancy ; webscrape : SERP seulement
- [x] `listingHosts` / denylist cohérent avec `centrals.ts` — `FORBIDDEN_LISTING_HOSTS = []`, plus de veto OTA
- [x] renderer et main importent le **même** module d’hôtes (`src/shared/listingHosts.ts`)
- [x] filtre `matchesDemand` appelé APRÈS enrich, sur le chemin UI (`matchesLodgingFilters` ← `selectors.tsx`)
- [x] null capacity/bedrooms exclus de l’UI client — défaut `lodgHideUnannounced: true` (schéma 8) ; seau debug = décocher
- [x] module geo pistes appelé pour Airbnb/Booking **avec lat/lng** (`enrichWithAccess`)
- [x] pas de fallback centroïde station — `lodgingCoords` rend `null` sans GPS ; carte : pas de pin
- [x] résolveur CAPTCHA/WAF : find + call sites + config — sidecar `CaptchaSolver` + `POST /api/scrape/captcha/solve` + `captchaBridge` après wait humain Airbnb ; Playwright = STEALTH conservé
- [x] cache dispo a un ttl **et** un chemin d’invalidation — `AVAILABILITY_TTL_MS = 6h` sur `scannedAt` dans `availabilityOf` (pas un cache disque Electron)
- [x] 0 résultat produit un `reason_code` par centrale — `ProviderOutcome.reasonCode`
- [x] tests unitaires `matchesDemand` + pagination Gîtes + `centralLookup` — `lodgfilter:test`, `providers:test`
- [x] pas d’import cassé sur les modules touchés (tests ci-dessus)

## Captcha / WAF (ne pas casser)

| symbole | fichier | statut |
| --- | --- | --- |
| `CaptchaSolver` | `sidecar/skitrack/services/captcha_solver.py` | **gardé** |
| injection | `sidecar/skitrack/api/routes/lodging.py` | **gardé** + `/captcha/solve` |
| `STEALTH_INIT` | `webscrape/shared.ts`, `airbnb/scrape.ts` | **gardé** |
| `looksBlocked` | `webscrape/shared.ts` | **gardé** + phrases dump VRBO/Abritel/CF ; Gîtes `.g2f-searchResult-noResults` → `empty_inventory` ; CozyCozy `joli-root` → `0_after_parse` |
| `ProxyManager` | `sidecar/skitrack/services/proxy_manager.py` | **gardé** |
| robots.txt | `station/robots.ts` | permissif (plus un veto) |

## Écarts justifiés

1. **Pas de nouveau parseur** Karellis / Vars-Elloha / Les Angles / VRBO DOM — dumps 2026-09-01/02 = CF 403, pages résidence sans SERP logements, 1 produit OS sans vueinfo, 429. Pralognan : LocVacances dumpé (getListe + getFiche). Sancy : Diffusio dumpé (SERP + fiche). La Clusaz : Deskline dumpé. Gîtes GET `towns=50301` et CozyCozy SEO `hoj_seo_card` : URLs + sélecteurs dumpés, **pas** un inventaire injecté.
2. **Pas de nouveau kit Cloudflare**. 429 VRBO / CF Karellis → `blocked` + CaptchaSolver existant.
3. Sidecar `/api/scrape/{name}` reste hors UI ; le solveur est joint via `/captcha/solve`.
4. HTML dumps non commis (`form_build_id`) ; `capture-report.json` + `discovery_*.md` oui.
