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
| Valfréjus | `www.valfrejus.com` | OS `vueId: null`. Recoller HMV 1115 mélange Val Cenis. |
| Super-Besse, Le Mont-Dore | `www.sancy.com` | Famille `sancy` (CMS), pas d’API datée. |
| Vars | `www.alpes-sudlocations.com` | Elloha : calendrier dispo, **pas** d’API search. |
| La Clusaz | `www.laclusaz.com` | Catalogue Apidae + widget e-liberty ski, pas de TOTAL. |
| Les Karellis | `www.karellis.com` / `karellis-reservation.com` | Cloudflare 403. Pas de Playwright. |
| Les Angles | `lesangles.com` | 403 / SPA. Pas de Playwright aveugle. |
| Font-Romeu | `font-romeu.fr/sejourner` | Vitrine OT, pas de desk. |
| Auron | `hiver.auron.com/bons-plans` | Pas de moteur meublé. |
| Flaine | `flaine.com/reservez-votre-sejour` | Page MSEM marketing, **pas** de `resort` / `channel`. |
| Saint-Gervais | `saintgervais.com/reserver-mon-sejour` | Addon MSEM chargé, **pas** d’id resort dans le HTML. |
| Les Arcs, Villaroger, Bourg-Saint-Maurice | — | `lesarcs.com` 403 ; `reservation.lesarcs.com` SSL invalide. Pas d’URL générique Peisey. |
| Pra Loup | `booking.yoplanning.pro/…` | Yoplanning (famille connue) : pas d’extracteur TOTAL. |

## Devenus `live` (août 2026)

| Station | Desk | Connecteur |
|---|---|---|
| Oz-en-Oisans | `oz-en-oisans.com` MSEM `523` / `OT-523` | `ublo-msem` (16 meublés, totaux datés) |
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
