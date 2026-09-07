# Découverte Les Angles — 2026-09-02 (round 9)

Parseur **écrit** : `src/main/providers/tourinsoft/` — cartes `article.tsc-card` du catalogue.

Open System **Produit** unitaire (1395) **non branché**.

## Captures

| id | HTTP | fait |
| --- | --- | --- |
| `GET /wp-json/wp/v2/types` | 200 | CPT `tsc_hebergement` rest_base identique |
| `GET /wp-json/wp/v2/tsc_hebergement?per_page=100` | 200 | `X-WP-Total: 100`, acf vide, occupancy dans le prose seulement |
| Playwright `/tous-les-hebergements/` | 200 | 12 × `article.tsc-card.tsc-card-design[data-id]`, compteur 100 |
| curl HTML catalogue | 403 | CF — le fetch froid peut échouer ; Playwright dump 200 |
| fiche `refuge-cal-chalon` OS | 200 | Widget Produit 1395, 1 produit, 0 vueId |

## Contrat dumpé (SERP)

```
article.tsc-card.tsc-card-design[data-id]
  a.tsc-card-link → /hebergement/{slug}/
  h3.tsc-card-title
  span.tsc-pill  N pers.
  span.tsc-pill  N ch.
  span.tsc-card-price-tag  à partir de N €
```

Exemple : REFUGE CAL CHALON · 12 pers. / 4 ch. · 2 230 €.

Page 1 = 12 cartes. Pagination Search Filter **non dumpée**.

## Ce qu’on n’écrit pas

- Occupancy extraite du contenu REST (« N personnes » dans un paragraphe).
- Connecteur Open System sans `vueId`.
- Page 2+ inventée.
