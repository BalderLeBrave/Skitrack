# Centrales — état final du relevé (`fix/centrales-prix-reels`)

Un hôte n’est `live` que si un extracteur peut renvoyer un **TOTAL daté**.
Toutes les stations du `CENTRAL_BY_SLUG` ont une URL. Dénombrement **par slug**
(2026-08-24, `centralCapabilityOf`) : **115 live / 51 link / 2 blocked / 0 none**
(168 slugs, 121 URL uniques). Live : 59 Ingénie, 22 Open System, 15 Ublo/MSEM,
12 Ceto Plagne, 3 Ceto Chamonix, LocVacances / Megève / Méribel / Praz-sur-Arly.

## `blocked` (robots.txt `Disallow: /`) — ne pas contourner

| Station | Hôte |
|---|---|
| Combloux | `reservation.combloux.com` |
| Montgenèvre, Les Alberts | `reservation.montgenevre.com` |

## `link` — moteur identifié ou vitrine, pas de TOTAL meublé

| Station | Hôte | Raison |
|---|---|---|
| Les 7 Laux, Prapoutel, Le Pleynet | `reservation.les7laux.com` | OS forfaits, `etape-rest` `items:[]`. |
| Vaujany, Auris | OS activités oisans-tourisme | Pas de catalogue meublé. |
| Alpe du Grand Serre | `reservation.matheysine-tourisme.com` | OS, catalogue meublé vide. |
| `www.valfrejus.com` | `vueId: null` | Desk live = HMV `ac51-valfrejus.htm`. |
| Super-Besse, Le Mont-Dore | `www.sancy.com` | CMS Sancy, pas d’API. |
| Les Karellis | `karellis-reservation.com` | Desk France Montagnes. Cloudflare 403. `karellis.com` pointe le même desk (WP hospitality). Pas de Playwright. |
| Vars, Praz de Lys | Elloha | `GetCalendarAvailability` = dates d’arrivée, **pas de prix**. `Search/Index` HTML sans TOTAL. |
| La Clusaz | `laclusaz.com/reservation/hebergements` | Apidae (annuaire) + widget e-liberty **forfaits ski** (`ski-widget.js`), pas de TOTAL meublé. |
| Les Angles | 403 / SPA | Pas de Playwright aveugle. |
| Les Arcs, Pra Loup | Yoplanning SPA | `/api/1/item` = Rollbar, pas un catalogue. |
| Guzet | `guzet.ski` | Forfaits, pas de meublé. |
| Cambre d’Aze | `eyne.fr/les-loisirs/hebergement` | Annuaire communal, pas de moteur. `cambredaze.fr` est en vente. |
| Lioran, Métabief, Luz, Sauze, Brides, Morillon, Sixt, Aulps, Abondance, Capcir, Superbagnères, Lac Blanc, Pierre Saint-Martin, Iraty, Azun, Chioula, Brasses, Glières, Méaudre, Gap, Beuil, Pilat, Hotonnes | vitrines OT | Pas de formulaire daté. Chioula charge `genius2beille.ingenie.fr` (centrale **Beille**, pas Chioula) — ne pas recoller. Pilat = OS `InstancePanier` **1703** (chèques cadeaux), **pas de vueId** meublé — desk `reservation.pilat-tourisme.fr` en `link`. |

Valloire (`www.valloire.com`) et Val d’Allos (`www.valdallos.com`) : déjà **live Ingénie** (`datedeb` + `static.ingenie.fr` confirmés au passage 2026-08-24). Ne pas les ranger en vitrine.

Valmorel : **live** Open System `vueId` 1423 (`reservation.valmorel.com`).

Second passage vitrines (2026-08-24) : Lioran / Métabief / Luz OT / Capcir / Superbagnères / Grand Massif / Sancy hebergement = HTML sans moteur. Luz-Ardiden SSL expiré. Aulps / Arves = certificat hôte. Hirmentaz DNS. Mourtis timeout. Retord SSL. Aucun nouveau TOTAL.

Troisième passage : Clusaz lodging = Apidae + e-liberty ski (forfaits). Porté « ceto » = CSS Divi, pas Orchestra. Karellis.com → même desk 403.

Quatrième passage : Chamrousse `/hiver` = **live Ingénie** (`datedeb` + widget-dispo, déjà `INGENIE_HOSTS`). Font-Romeu / Luz / Auron / Métabief / Lioran : pas de `reservation.*` DNS, HTML sans TOTAL. Luz = module Divi maison, pas une famille supportée.

Cinquième passage : inventaire `CENTRAL_BY_SLUG` clos (115/51/2). Praz de Lys `/hebergements-a-taninges-et-mieussy/` = **403**. Guzet / Yoplanning / Vars Elloha inchangés. Aucun nouveau TOTAL.

Quatrième passage : Font-Romeu / Auron = annuaires OT (deep-link hebergements, pas de TOTAL). `reservation.lelioran.com` / `metabief` / `font-romeu.fr` / `sauze.com` : DNS inexistant. Chamrousse déjà live Ingénie.

## `live` ajoutés sur cette branche

Ingénie : Les Rousses, Manigod, Bellefontaine, alias 2 Alpes 1800, Gets, Féclaz, Hauteluce, Peisey-Nancroix, Landry.

Open System : N-PY (vueId **1448** partagé), HMV `ac51` Valfréjus / `ac63` Bessans.

Ublo/MSEM : Oz `523`, Saint-Gervais `569`, Flaine `320`, Isola, Valberg, Montclar, Écrins, Léman.

Ceto : Montchavin `MC`.

## Sans URL

Aucune. Séez recollé sur la vitrine Les Arcs.

## Multi-villages

Val d’Arly : `stationVillage.ts` branché. HMV : URL `acXX`. Plagne : `s_c.location`. Les Arcs : pas d’URL générique Peisey.

## Navigateur des scrapers

Obscura (CDP) est le **défaut** dès que `vendor/obscura` est présent.
`SKITRACK_BROWSER=chromium` = repli. Maps / pixels abortés (SIGSEGV 0.2.1).
`fetch` MSEM / OS / Ceto HTML inchangés.

A/B homepage 2 Alpes (`npm run scrape:probe-browser` / `:win` PowerShell) :

| Moteur | Résultat |
|---|---|
| Playwright Chromium | **200**, `input[name=datedeb]` présent, 5,5 s |
| Playwright Firefox | sandbox sans GTK (`libgtk-3`) — à retester sur Windows |
| Obscura 0.2.1 (défaut) | listing 2 Alpes : `datedeb` **après** `primeObscuraIngenieWidget` (`IngenieWidgetResa` sur `globalThis`). Sans ça : 0 input, widget vide. Maps abortés (sinon SIGSEGV). |

`SKITRACK_BROWSER=firefox` lance Gecko via le même `withPage`. `fetch` MSEM / OS / Ceto HTML inchangés. Pas de `--stealth`.

## Non négociable

Pas de faux `live`. Pas de contournement robots. Pas d’OTA hors connecteurs existants.
