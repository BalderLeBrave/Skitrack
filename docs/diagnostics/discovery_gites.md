# discovery_gites.md

**Status : CAPTURED_NO_SERP** — dumps 2026-09-01, HTML brut **non versionné**
(tokens `form_build_id`). Preuve : `dumps/capture-report.json` + extraits ci-dessous.

## Ce que le code dit

- URL : `https://www.gites-de-france.com/fr/search?destination=&date-start=&date-end=&adults=&page=`
  `gitesSearchUrl` — noms du formulaire Drupal `search_api_page_block_form`
- Extracteur : `a[href*="/fr/"]`, `.gite-card`, JSON-LD geo — **prix requis**
  `extractGitesCards` — **inchangé** (pas de SERP de cartes dans les dumps)
- Pagination : `collectPages` offset 0-based ; `page = offset + 1`
- Vide : `.g2f-searchResult-noResults` → `empty_inventory` (`gitesSearchEmptyKind`)

## FOUND (dumps 2026-09-01)

| id | HTTP | titre / marqueur | ce que ça prouve |
| --- | --- | --- | --- |
| `gites_p1.html` | 200 | `.g2f-searchResult-noResults` | GET `search[value]=Les 2 Alpes&search[from]=…` **ignoré** par l’UI |
| `gites_dest.html` | 200 | même classe, même « Oups » | GET `destination=` **aussi ignoré** sans `entity_id` |
| `gites_home.html` | CF | `Attention Required! \| Cloudflare` | 2ᵉ visite Playwright = WAF, pas un parseur |

Phrase exacte (p1 + dest) :

> Oups ! Vous devez affiner votre recherche de séjour en indiquant au moins une destination.

Champs du formulaire POST `action="/fr/search"` `id="search-api-page-block-form"` :

`destination` (vide), `entity_id` (vide), `entity_type` (vide), `date-start`, `date-end`, `adults`, `children`, `infants`, `min_price`, `max_price`, `distance`, `promo_only`, `arrival`, `departure`.

Autocomplete : `data-autocomplete-url="/fr/g2f_autocomplete"` sur `#edit-destination`. Curl = 403 Cloudflare. **Pas de dump JSON** → pas de résolution `entity_id` inventée.

Drupal `currentQuery` :

- p1 (`search[value]`) : `search.{value,from,to,capacity}` rempli, form `destination=""` `entity_id=""`
- dest (`destination=`) : `{destination,date-start,date-end,adults}` remplis, form `destination=""` `entity_id=""`

Sélecteurs de cartes sur ces pages : `.gite-card` = 0, `article` = 0, JSON-LD = 0. `a[href*="/fr/"]` = nav, pas des annonces.

## MISSING / NEXT

- MISSING : SERP avec cartes, page 2, fiche, studio, indisponible, réponse autocomplete
- NEXT : capturer `/fr/g2f_autocomplete?q=Les%202%20Alpes` **puis** une recherche POST avec `entity_id` réel. **Pas de nouveau parseur** avant ce dump.
- `extractGitesCards` **non retouché**.
