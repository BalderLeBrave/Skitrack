# Reprise de la fiche station

Premier lot. Webcams, prévision à quatorze jours aux deux altitudes, historique
de neige relevé par l'application, crédits photo. Ces fichiers n'ajoutent que
des modules : aucune route n'est modifiée, le branchement des écrans vient
après.

| Nouveau fichier | Source | Reprise |
|---|---|---|
| `src/lib/webcams.ts` | `2d960d5:src/renderer/src/data/webcams.ts` | table et logique telles quelles |
| `src/components/WebcamCard.tsx` | nouveau | |
| `src/lib/meteo/forecast.server.ts` | `2d960d5:src/renderer/src/data/domainWeather.ts` | relevé, moins le hook React |
| `src/lib/meteo/forecast.ts` | nouveau (modèle : `src/lib/snow/api.ts`) | |
| `src/components/ForecastCard.tsx` | nouveau | |
| `src/lib/snow/history.ts` | `2d960d5:src/renderer/src/data/snowHistory.ts` | logique telle quelle, clé changée |
| `src/components/SnowHistoryCard.tsx` | nouveau | |
| `src/lib/photoCredits.ts` | nouveau | |
| `src/lib/photo-credits.overrides.json` | nouveau | |
| `src/components/PhotoCredit.tsx` | nouveau | |
| `scripts/fetch-missing-photos.mjs` | nouveau | |

## Webcams

33 flux, 32 stations (La Rosière en a deux), sept groupes de forfait : 3
Vallées, Paradiski, Espace Killy, Portes du Soleil, Grand Massif, Voie Lactée,
Forêt Blanche. Sur les 320 stations du référentiel actuel, 64 sont couvertes,
83 flux en tout, parce qu'un groupe de forfait donne ses caméras à chacune de
ses stations membres.

Ce qui est conservé du module d'origine : le rapprochement textuel tolérant aux
accents, aux tirets et aux parenthèses, l'essai des clés de la plus spécifique
à la plus large, et la priorité du groupe sur la station isolée. La classe de
caractères combinants, illisible dans le fichier d'origine, est réécrite
`/[̀-ͯ]/g` ; elle fait exactement la même chose.

Ce qui est ajouté : `webcamsForStation(stationId)`, qui résout le nom par
`stationById` et le forfait par `domainForStation(id)?.pass ?? ?.seed?.zone`,
puis appelle `webcamsFor` inchangée. `webcamCoverage(ids)` sert l'audit.

Un point de style : les caméras d'un groupe étaient préfixées avec un tiret
cadratin, « Val Thorens — Saulire ». C'est une virgule ici, l'interface n'en
porte pas.

La carte ne devine jamais une caméra par ressemblance de nom, et le dit quand
elle n'en a pas : la table est tenue à la main, une absence veut dire « pas
vérifié », pas « n'existe pas ».

## Prévision 14 jours

Deux requêtes Open-Meteo, une par altitude, avec `elevation` transmis au modèle
— c'est ce paramètre qui fait la différence entre une prévision de vallée et
une prévision de sommet. Cache mémoire, TTL 3 h. Aucune exception ne remonte :
en échec, les niveaux sont vides et `at` vaut `null`, ce que la carte affiche
comme « prévision non obtenue ».

Les deux pièges du module d'origine sont conservés, commentés sur place :

1. `snow_depth_max` est rendu en **mètres**. Multiplié par 100 pour l'affichage
   en centimètres. Oublier ce facteur donne un manteau de 2 cm en février.
2. `precipitation_sum` additionne la pluie **et** l'équivalent en eau de la
   neige. En altitude il gonfle les millimètres d'une journée où il n'est tombé
   que de la neige. C'est `rain_sum` qui est lu, `precipitation_sum` ne servant
   plus que de secours si le modèle ne rend pas le premier.

L'isotherme 0 °C est lue à midi du premier jour, en bas des pistes : c'est une
propriété de la colonne d'air, la lire en haut ou en bas donne la même valeur.

Le hook `useDomainWeather` n'est pas repris : les slots matin / après-midi qu'il
servait n'ont plus d'écran, et la requête horaire se réduit donc au seul
`freezing_level_height`, ce qui divise le poids de la réponse.

## Historique de neige

Même logique que l'original, `localStorage`, un point par jour calendaire, le
premier relevé du jour gagne, plafonds de 400 points et 120 stations, éviction
par série la plus courte. La clé devient l'identifiant textuel de station, et
non plus l'identifiant numérique de domaine.

`typeof localStorage === "undefined"` garde le rendu serveur : pas de stockage,
pas d'historique, pas d'erreur.

`snowHistorySince()` rend le jour du premier relevé, toutes stations
confondues. Quand rien n'est enregistré, la carte écrit la seule chose vraie :
l'historique commence aujourd'hui, l'application enregistre ce qu'elle mesure,
elle n'importe aucun passé.

Les deux courbes sont tracées en SVG à la main, sans dépendance nouvelle.

## Crédits photo

Pas un portage. Le crédit se **dérive** de l'hôte de l'URL relevée dans
`skiinfo.photos.json` : `cdn.bfldr.com` vaut Skiinfo, `img1.onthesnow.com` vaut
OnTheSnow. Les 231 photos sont ainsi créditées sans qu'aucune liste ne soit à
tenir, et une station ajoutée demain ne sort pas sans crédit.

`src/lib/photo-credits.overrides.json`, `{ "rows": {} }` aujourd'hui, sert aux
deux choses que la dérivation ne sait pas faire : nommer un auteur quand il est
connu et vérifié, et porter `removed` pour retirer une photo à la demande de sa
source — la ligne reste, avec sa raison, pour que le prochain rafraîchissement
du relevé ne la remette pas.

Un hôte inconnu ne produit aucun crédit et rien ne s'affiche : un crédit deviné
est un crédit faux.

## Les deux photos manquantes

`public/stations/` porte 229 fichiers pour 231 URL relevées. `larche` et
`le-chazelet` ont une URL mais aucun fichier local, donc aucune photo à
l'écran : `skiinfoPhoto()` rend `null` pour elles, ce que le test des photos
constate déjà.

`scripts/fetch-missing-photos.mjs` liste l'écart, et le comble avec `--write`.
Il refuse tout corps de moins de 20 ko : les deux sources répondent 200 avec une
page d'erreur HTML quand l'image a bougé, et une page d'erreur écrite dans
`larche.jpg` serait pire que l'absence.

Le script n'a pas été lancé en écriture dans ce lot : il ferait passer le
compte à 230 ou 231 fichiers, ce que `src/lib/skiinfo.photos.test.ts` vérifie à
229. Les deux changements vont ensemble, le jour où on le décide.

## Points de branchement

Dans `src/routes/stations.$id.tsx`, aucune de ces cartes n'est encore posée.

```tsx
import { WebcamCard } from "@/components/WebcamCard";
import { ForecastCard } from "@/components/ForecastCard";
import { SnowHistoryCard } from "@/components/SnowHistoryCard";
import { PhotoCredit } from "@/components/PhotoCredit";

<WebcamCard stationId={station.id} />
<ForecastCard lat={station.lat} lon={station.lon} villageM={station.villageM} summitM={station.maxM} />
<SnowHistoryCard
  stationId={station.id}
  lat={station.lat}
  lon={station.lon}
  villageM={station.villageM}
  summitM={station.maxM}
/>
```

`<PhotoCredit stationId={station.id} />` se pose dans le bandeau photo, dont le
conteneur doit être `relative` : le crédit est en `absolute bottom-2 right-3`.
`PhotoCreditInk` est la variante pour fond clair, sans positionnement.

`ForecastCard` et `SnowHistoryCard` appellent chacune leur fonction serveur.
`SnowHistoryCard` appelle `getSnowPair`, la même que `SnowCard` : le cache
serveur de 30 minutes absorbe le second appel, les deux cartes peuvent coexister
sur la fiche sans doubler la requête.
