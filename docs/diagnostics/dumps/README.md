# dumps/

Captures Playwright du 2026-09-01, Les 2 Alpes, 13–20 fév. 2027, 8 pers.

Les HTML bruts **ne sont pas versionnés** : `form_build_id` Drupal, 80–220 Ko,
pages challenge Expedia / Cloudflare. Ils restent locaux (`.gitignore` `*.html` ici).

La preuve versionnée est `capture-report.json` + `discovery_*.md` + JSON compact.

| fichier | HTTP / fait | commis ? |
| --- | --- | --- |
| `gites_autocomplete.json` | entity_id=497 pois Les 2 Alpes | **oui** |
| `capture-gites-entity.json` | GET entity_id=497 → form vide + Oups | **oui** |
| `gites-cozy-post.json` | POST session CF 403 · contrat CozyCozy | **oui** |
| `capture-gites-cozy-2.json` | dump in-page POST + cosmos-api | **oui** |
| `capture-cosmos-probe.json` | searchInputLocation / getResultList | **oui** |
| `msem-valberg-ecrins.json` | Valberg 665 / Écrins PDE | **oui** |
| `capture-red-points-5.json` | round 5 centrales | **oui** |
| `capture-report.json` | métadonnées 1er tour | **oui** |

Voir `discovery_gites.md`, `discovery_cozycozy.md`, `discovery_valberg.md`, `discovery_ecrins.md`.
