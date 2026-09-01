# dumps/

Captures Playwright du 2026-09-01, Les 2 Alpes, 13–20 fév. 2027, 8 pers.

Les HTML bruts **ne sont pas versionnés** : `form_build_id` Drupal, 80–220 Ko,
pages challenge Expedia / Cloudflare. Ils restent locaux (`.gitignore` `*.html` ici).

La preuve versionnée est `capture-report.json` + `discovery_*.md` + JSON compact.

| fichier | HTTP / fait | commis ? |
| --- | --- | --- |
| `gites_autocomplete.json` | entity_id=497 pois / 50301 towns | **oui** |
| `capture-gites-entity.json` | GET entity_id=497 → form vide + Oups | **oui** |
| `gites-cozy-post.json` | POST session CF 403 · contrat CozyCozy | **oui** |
| `bypass-gites-cozy.json` | GET towns=50301 SERP 33 · SEO CozyCozy 3729 | **oui** |
| `capture-bypass-2.json` | travelers=8, extracteurs old vs dump | **oui** |
| `capture-bypass-3.json` | GET daté 33 · 16 cartes ≥8/4 | **oui** |
| `capture-cozy-rpc.json` | POST searchInputLocation 200 → Booking | **oui** |
| `capture-cosmos-probe.json` | GET REST cosmos-api 404 | **oui** |
| `msem-valberg-ecrins.json` | Valberg 665 / Écrins PDE | **oui** |

Voir `discovery_gites.md`, `discovery_cozycozy.md`, `discovery_valberg.md`, `discovery_ecrins.md`.
