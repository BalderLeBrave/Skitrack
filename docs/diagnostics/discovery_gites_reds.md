# Contournement Gîtes `towns=` — Karellis, Vars, Les Angles

**Status : SERP_GET** — 2026-09-02. Même contrat que Les 2 Alpes (`towns=50301`).
**Aucun parseur nouveau.** `extractGitesCards` (`.js-search-tile`) déjà dump-prouvé.

Officiels restés bloqués :

| station | moteur | dump | décision |
| --- | --- | --- | --- |
| Les Karellis | WP Hospitality | CF 403 FR ; `/en/accommodation/` = 62 unités, 0 prix, 0 chambres, 0 dates | pas de parseur |
| Vars | Elloha | POST Search → GetDetail/HLOPAC0050005312 (agence) | pas de parseur |
| Les Angles | Tourinsoft | déjà branché (`article.tsc-card`, 12/100) | Gîtes en complément daté |

## Autocomplete (GET `/fr/g2f_autocomplete`)

| q | id honoré | type | écarté |
| --- | --- | --- | --- |
| Montricher | **64400** | towns Montricher-Albanne | pois Karellis `425067` |
| Vars | **38123** | towns Hautes-Alpes | `42881` Roseix, `63410` Haute-Saône |
| Les Angles | **61540** | towns Pyrénées-Orientales | `61077` Hautes-Pyrénées, `42616` Corrèze |

`q=Karellis` ne rend que le POI. GET `entity_id=` n’ouvre pas la SERP (déjà vu sur 497).

## GET daté (8 voyageurs, 13–20 fév. 2027)

| towns | titre | résultats | échantillon |
| --- | --- | --- | --- |
| 64400 | Montricher-Albanne | 107 | Chalet De L'ermite 8p/3ch/760 € · Aiguille Noire 12p/5ch/800 € |
| 38123 | Vars | 42 | Chalet Constellation 8p/4ch/850 € à VARS |
| 61540 | Les Angles | 27 (20 tuiles p.1, Playwright 200) | Anthemis II 8p/3ch/1848 € |

Playwright : première URL 200, suivantes 403 CF. Les deux SERP Karellis/Vars sont lues par fetch GET daté (titre + cartes).

CozyCozy `/fr/location-vacances-*` reste un catalogue nuit — pas cette solution.

## Branchement

`gitesTownsIdForDestination` : Karellis/Montricher → 64400, Les Angles → 61540, Vars → 38123.
Garde : Vars-sur-Roseix et Angles-sur-Corrèze → pas d’id ski.
