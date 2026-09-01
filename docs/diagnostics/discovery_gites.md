# discovery_gites.md

**Status : CAPTURED_NO_SERP** — dumps 2026-09-01. HTML brut **non versionné**
(tokens `form_build_id`, pages challenge). Preuve : `dumps/capture-gites-cozy-2.json`,
`dumps/gites_autocomplete.json`, `dumps/capture-gites-entity.json`.

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
| `gites_autocomplete.json` | 200 | JSON | `entity_id=497` / pois « Les 2 Alpes » (score 18.43) ; 424697 domaine ; 50301 towns |
| `gites_entity_poi497` | 200 | Oups + form vide | GET `entity_id=497` **laisse** `entity_id=""` dans le formulaire |
| `gites_inpage_post` | GET 200 puis POST **403** | Cloudflare « Sorry, you have been blocked » | Champs remplis en session (`destination`, `entity_id=497`, `entity_type=pois`, dates, `adults=8`, `op=Rechercher`) puis `form.submit()` **dans** la page. Ray `a3475ff08e9744a6`. 0 `.gite-card` |

Phrase exacte (GET) :

> Oups ! Vous devez affiner votre recherche de séjour en indiquant au moins une destination.

Champs du formulaire POST `action="/fr/search"` `id="search-api-page-block-form"` :

`form_build_id`, `form_id=search_api_page_block_form` (**pas** de `form_token`),
`destination`, `entity_id`, `entity_type`, `date-start`, `date-end`, `adults`,
`children`, `infants`, `arrival`, `departure`, `op=Rechercher`.

Sélecteurs de cartes sur ces pages : `.gite-card` = 0, `article` = 0, JSON-LD = 0.

## MISSING / NEXT

- MISSING : SERP avec cartes, page 2, fiche, studio, indisponible
- NEXT : POST depuis un client qui passe Cloudflare, **puis** dump `.gite-card > 0`
- `extractGitesCards` **non retouché**. Inventer un parseur sur un 403 n’est pas une SERP.
