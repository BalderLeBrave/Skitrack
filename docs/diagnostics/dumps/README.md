# dumps/

Captures Playwright du 2026-09-01, Les 2 Alpes, 13–20 fév. 2027, 8 pers.

Les HTML bruts **ne sont pas versionnés** : `form_build_id` Drupal, 80–220 Ko,
pages challenge Expedia. Ils restent locaux (`.gitignore` `*.html` ici).

`capture-report.json` est la preuve commise : URL, HTTP, title, hits de sélecteurs.

| fichier local | HTTP | title | commis ? |
| --- | --- | --- | --- |
| `gites_p1.html` | 200 | Rechercher une location de vacances | non |
| `gites_dest.html` | 200 | idem, GET `destination=` | non |
| `gites_home.html` | CF | Attention Required! \| Cloudflare | non |
| `vrbo_p1.html` | 429 | Bot or Not? | non |
| `abritel_p1.html` | 429 | Robot ou pas robot ? | non |
| `les2alpes_central.html` | 200 | Location et réservation d'appartement | non |
| `capture-report.json` | — | métadonnées | **oui** |

Voir `discovery_gites.md` et `discovery_vrbo.md`.
