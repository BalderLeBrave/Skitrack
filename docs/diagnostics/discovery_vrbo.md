# discovery_vrbo.md

**Status : NOT_CAPTURED** — pas de HAR / HTML search p1 / p2 / listing dans ce dépôt.

## Ce que le code dit (pas un dump)

- URL : `https://www.vrbo.com/search?destination=…&startDate=&endDate=&adults=&startIndex=`  
  `src/main/providers/webscrape/urls.ts` `vrboSearchUrl`
- Extracteur : `[data-stid="property-listing"]`, `uitk-card`, href `/\d{4,}/`  
  `extractors.ts` `extractVrboCards` — **prix requis**
- Pagination : `startIndex` pas 50, max 5 pages (`VRBO_PAGE_SIZE = 50`)
- Sidecar : `[data-testid="listing"]` (forme Airbnb) — **autre sélecteur**, non appelé par l’UI

## Hypothèse du 0 (non testée réseau)

1. `selector_miss` si le DOM VRBO a changé
2. `blocked` / challenge (Cloudflare) → `looksBlocked` doit throw, pas `[]`
3. `0_after_parse` si cartes sans prix (filtre extracteur)

Sans part HAR : **pas de nouveau parseur**.

## FOUND / MISSING / NEXT

- FOUND : URL builder, extracteur TS, register `vrbo-web`
- MISSING : search p1, p2, listing, studio, indisponible
- NEXT_PART : capturer ces 5 documents avant de retoucher `extractVrboCards`
