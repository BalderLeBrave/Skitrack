# Centrales encore en `link` / `blocked`

Relevé après les lots A–D de `fix/centrales-prix-reels` (août 2026).
Un hôte n’est `live` que si un extracteur peut renvoyer un **TOTAL daté**.

## `blocked` (robots.txt `Disallow: /`) — ne pas contourner

| Station | Hôte |
|---|---|
| Combloux | `reservation.combloux.com` |
| Montgenèvre, Les Alberts | `reservation.montgenevre.com` |

## `link` — moteur identifié, pas de TOTAL meublé

| Station | Hôte | Raison |
|---|---|---|
| Les 7 Laux, Prapoutel, Le Pleynet | `reservation.les7laux.com` | OS forfaits (`login=isere-les7laux`, id 1345). `etape-rest` `items:[]`. |
| Vaujany | `reservation.vaujany.com` | OS activités (`oisans-tourisme` / 1047). |
| Auris-en-Oisans | `reservation.auris-en-oisans.fr` | OS activités (`oisans-tourisme` / 1301). |
| Alpe du Grand Serre | `reservation.matheysine-tourisme.com` | OS `login=matheysine` / 943, catalogue meublé vide. |
| Valfréjus | `www.valfrejus.com` | OS `vueId: null`. **Desk live** : `reservation.haute-maurienne-vanoise.com/ac51-valfrejus.htm` (vueId 1115, comme La Norma). |
| Super-Besse, Le Mont-Dore | `www.sancy.com` | Famille `sancy` (CMS), pas d’API datée. |
| Vars | `www.alpes-sudlocations.com` | Elloha : calendrier dispo, **pas** d’API search. |
| La Clusaz | `www.laclusaz.com` | Catalogue Apidae + widget e-liberty ski, pas de TOTAL. |
| Les Karellis | `www.karellis.com` / `karellis-reservation.com` | Cloudflare 403. Pas de Playwright. |
| Les Angles | `lesangles.com` | 403 / SPA. Pas de Playwright aveugle. |
| Font-Romeu | `font-romeu.fr/sejourner` | Vitrine OT, pas de desk. |
| Auron | `hiver.auron.com/bons-plans` | Pas de moteur meublé. |
| Flaine | `flaine.com/reservez-votre-sejour` | Page MSEM marketing, **pas** de `resort` / `channel` → **link**. |
| Les Arcs, Villaroger, Bourg-Saint-Maurice | `lesarcs.com/hebergement` | Yoplanning vitrine, SPA sans API search → **link**. Pas d’URL générique Peisey. |
| Pra Loup | `booking.yoplanning.pro/…` | Yoplanning (famille connue) : pas d’extracteur TOTAL. |
| Praz de Lys – Sommand | `prazdelys-sommand.com` | Elloha (calendrier), pas d’API search. |
| Le Lioran, Métabief, Luz Ardiden, Le Sauze | vitrines OT | Pas de moteur meublé daté (Chioula = ScriptsLoader Ingénie sans formulaire). |

## Devenus `live` (août 2026)

| Station | Desk | Connecteur |
|---|---|---|
| Oz-en-Oisans | `oz-en-oisans.com` MSEM `523` / `OT-523` | `ublo-msem` |
| Saint-Gervais | `saintgervais.com` MSEM `569` / `OT-569` | `ublo-msem` |
| Manigod | `www.manigod.com` Ingénie (`datedeb`, `searchAjax`) | `station-web` |
| Bessans | HMV `ac63-bessans.htm` | Open System 1115 |
| Valfréjus | HMV `ac51-valfrejus.htm` | Open System 1115 |
| Landry | `peisey-vallandry.com` | Ingénie |
| Saint-Nicolas-de-Véroce | MSEM Saint-Gervais 569 | `ublo-msem` |
| Bellefontaine | `lesrousses-reservation.com` | Ingénie (village des Rousses) |
| Les Deux Alpes 1800 | alias → `reservation.les2alpes.com` | Ingénie |
| Montchavin – Les Coches | `laplagneresort.com` village `MC` | Ceto |
| Peisey-Nancroix | `peisey-vallandry.com` | Ingénie |
| La Féclaz | `reservation.chamberymontagnes.com` | Ingénie |
| Corrençon-en-Vercors | desk Villard Ublo | `ublo-msem` |
| Hauteluce | `reservation.lessaisies.com` | Ingénie |

## `live` avec stock parfois vide (pas un bug)

N-PY `vueId` **1448** unique : Grand Tourmalet, Cauterets, Gourette, Peyragudes, Piau. `items:[]` = pas de meublé ces dates.

Montclar, Villard-Reculas (Ublo) : API OK, 0 offre cette semaine.

## Multi-villages

- **Val d’Arly** : `stationVillage.ts` branché dans `station.ts` (`criteres[]` + `cityMismatch`).
- **Haute-Maurienne** : URL par village (`ac54-la-norma.htm`, …).
- **La Plagne** (Ceto) : `s_c.location` (A2, BP, MC, PC…). Montchavin → `MC`. Pas de select Ingénie.

## Non négociable

Pas de faux `live`. Pas de contournement robots. Pas d’OTA hors connecteurs existants.
