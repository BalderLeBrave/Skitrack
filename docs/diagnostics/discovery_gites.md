# discovery_gites.md

**Status : PAGINATION_FIXED / PARSEUR_INCHANGÉ** — pas de HAR / HTML dans ce dépôt.

## Ce que le code dit

- URL : `https://www.gites-de-france.com/fr/search?search[value]=…&search[from]=&search[to]=&search[capacity]=&page=`
  `gitesSearchUrl`
- Extracteur : `a[href*="/fr/"]`, `.gite-card`, JSON-LD geo — **prix requis**
  `extractGitesCards`
- Pagination **corrigée** (2026-09-01) : `collectPages` envoie un offset 0-based ;
  `gitesSearchUrl` pose `page = offset + 1` (page 2 = `page=2`, plus de rejeu de
  la page 1). Test : `providers.test.ts` section 13.

## Hypothèse du 0 (non testée réseau)

1. ~~Off-by-one pagination~~ **corrigé dans le code**
2. `selector_miss` si le DOM a changé
3. `blocked`

Un 0 live pose maintenant `reasonCode` (`selector_miss` | `blocked` | `0_after_parse`).

## FOUND / MISSING / NEXT

- FOUND : URL, extracteur, register `gites-web`, off-by-one fixé
- MISSING : dumps HAR/HTML
- NEXT : dumps avant de changer les sélecteurs
