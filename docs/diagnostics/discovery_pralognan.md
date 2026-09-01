# Découverte Pralognan — 2026-09-01 (round 6)

Parseur **non écrit**. Prix « à partir de », catalogue undaté.

## Captures

| id | HTTP | fait |
| --- | --- | --- |
| `pralognan_cookies` | 200 | Mur cookies levé → AJAX 4g |
| `pralognan_liste` | 200 | `ajax.req.4g.php?id=getListe` 12 736 o |
| `pralognan_getListe.html` | — | 12 cartes `.Card.Card_Lots` |
| `pralognan_getNB` | 200 | `427 Résultats` |
| GET `getNB&dd=13/02/2027&df=20/02/2027` | 200 | « Il n'y a plus de disponibilités sur cette période. » |

## Contrat dumpé

- Liste : `GET /ajax/ajax.req.4g.php?id=getListe` (session cookies).
- Compte : `id=getNB`. Pagination `getListe('2','lot_random')` — 12 / page, 36 pages.
- Carte : `.Card.Card_Lots` · `.Card_Price` « à partir de N € » · `h4` nom · « Chalet - 19 personnes » · `a[href=/reservation/resultats/{lot}/]`.
- **Pas de chambres** sur la carte.
- Dates : `id=dd` / `id=df` (tableaux de jours). Sans `dd` = catalogue.

## Ce qu’on n’écrit pas

Un parseur qui prendrait l’« à partir de » undaté pour un tarif séjour.
Une semaine datée (fév. 2027) n’a **pas de stock** d’après `getNB`.
