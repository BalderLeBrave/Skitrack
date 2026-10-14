# Reprise du séjour

Deuxième lot. Le calendrier samedi au samedi, les bornes du groupe, les plages
de filtre et le temps d'accès aux pistes. Comme le premier, ce lot n'ajoute que
des modules : aucune route n'est modifiée.

| Nouveau fichier | Source | Reprise |
|---|---|---|
| `src/lib/stay/calendar.ts` | `2d960d5:src/renderer/src/data/stayCalendar.ts` | tel quel, plus quatre fonctions |
| `src/lib/stay/party.ts` | `2d960d5:.../data/partyLimits.ts` | constantes telles quelles |
| `src/lib/stay/range.ts` | `2d960d5:.../data/range.ts` | tel quel |
| `src/lib/accessTime.ts` | `2d960d5:.../data/accessTime.ts` | constantes et logique telles quelles |
| `src/components/StayDatesField.tsx` | réécrit | |
| `src/components/PartyStepper.tsx` | réécrit | |
| `src/lib/stay/stay.test.ts` | nouveau | 20 cas |

## Le calendrier

La raison d'être est gardée dans l'en-tête du module, parce qu'elle explique un
symptôme qu'on met une heure à diagnostiquer sans elle : les centrales de
station vendent du **samedi au samedi** et refusent une arrivée hors
calendrier, donc une plage mercredi vers mercredi rend zéro offre de toutes les
centrales, sans que rien à l'écran dise pourquoi.

Tout est calculé en UTC sur des chaînes ISO, jamais sur un objet `Date` local
dont le fuseau ferait glisser un jour à minuit. `parseIso` refuse
« 2027-02-30 » : le mois fait foi, un 30 février est une erreur, pas un 2 mars.

Repris tel quel : `parseIso`, `addDaysIso`, `weekdayIso` (lundi = 0),
`isSaturdayIso`, `monthOfIso`, `monthGrid`, `saturdayWeekFrom`, `shiftMonth`,
`todayIso`.

Ajouté : `nightsBetween(arr, dep)`, qui rend un nombre **négatif** quand le
départ précède l'arrivée plutôt que zéro, pour que l'écran puisse le signaler ;
`monthLabel(ym)` ; et, venus du composant pour ne pas y rester coincés,
`formatDayIso` et `stayRangeLabel`.

Les noms de mois sont une table fixe, pas un appel à `Intl` : l'entête du
calendrier ne doit pas changer de forme selon les données ICU de la machine, et
le test peut alors le vérifier.

## Les bornes du groupe

`PARTY_LIMITS` inchangé : 1 à 20 voyageurs, 0 à 9 chambres. L'histoire est
conservée dans l'en-tête, parce qu'elle dit ce que les bornes signifient : elles
valaient 12 et 6, un groupe de quatorze ou un chalet de huit chambres ne
pouvaient pas s'exprimer, et le bouton « + » cessait simplement de répondre.
Ce ne sont pas des limites techniques mais celles de ce que l'application
prétend traiter sérieusement.

`clampTravelers`, `clampRooms` ramènent entre les bornes plutôt que de refuser :
taper « 50 » pose 20 et le montre. `roomsLabel(0)` vaut « studio accepté », pas
« 0 chambre » : zéro n'est pas une exigence, c'est l'absence d'exigence.

## Les plages de filtre

Repris mot pour mot. Une plage grande ouverte n'écarte rien, y compris les
valeurs inconnues ; une plage posée écarte une valeur inconnue, parce qu'un
domaine dont on ignore le temps de route ne peut pas prétendre entrer dans une
fourchette qu'on ne peut pas vérifier. Le plafond compte comme « sans limite » :
sans cela, un domaine à 620 km sortirait d'une plage laissée grande ouverte à
1 200 km.

## Le temps d'accès

Les six constantes sont inchangées : marche 50 m/min, seuil de marche 1 200 m,
skis aux pieds 150 m, voiture 25 km/h, 5 min de surcoût, détour 1,3. La
classification de la source prime sur la distance, parce qu'un logement à 200 m
d'une piste peut en être séparé par une falaise.

Ajouté : `formatAccessTime()`, qui écrit toujours le moyen avec le temps (« 8
min à pied »), parce qu'un temps sans son moyen est illisible ; et
`ACCESS_TIME_NOTE`, **à afficher une fois par écran et non par ligne** :
répétée sous chaque logement elle devient du décor qu'on ne lit plus, et c'est
exactement la phrase qu'il faut lire.

`formatAccessTime(null)` rend une chaîne vide, pas un tiret : une ligne à « — »
se lit comme un zéro à la troisième relecture.

## Les deux composants

Réécrits, pas portés : les originaux tenaient à `useApp` et aux sélecteurs
d'état, qui n'existent plus. Ils lisent et écrivent `useStay` (`checkIn`,
`checkOut`, `guests`, `bedrooms`).

`StayDatesField` cercle les samedis et propose la semaine entière au
double-clic, sans jamais l'imposer, avec un bouton de suggestion qui ne
s'affiche que s'il change quelque chose et reste réservable. Le magasin n'est
écrit qu'à la plage complète : entre le clic d'arrivée et le clic de départ, la
sélection vit en local, pour que le séjour ne traverse jamais une plage
invalide. Les chevrons sont des SVG, pas des glyphes.

`PartyStepper` désactive visiblement ses boutons aux bornes (`disabled`, plus
une opacité réduite) plutôt que de cesser de répondre. Le champ central reste un
`input` : on y tape « 18 » au lieu de cliquer dix-huit fois, et la saisie vide
est conservée le temps de la frappe, faute de quoi effacer « 8 » pour écrire
« 12 » est impossible.

## Points de branchement

Aucun écran ne les appelle encore. Là où les critères de séjour se saisissent
(`src/routes/logements.tsx`, la barre de recherche) :

```tsx
import { StayDatesField } from "@/components/StayDatesField";
import { PartyStepper } from "@/components/PartyStepper";

<StayDatesField />
<PartyStepper />
```

Les deux se suffisent à eux-mêmes, sans props : ils lisent `useStay`.

`ACCESS_TIME_NOTE` se pose une fois en pied de la liste des logements, jamais
dans la carte d'un logement. `stayRangeLabel(checkIn, checkOut)` sert aux écrans
qui affichent la plage sans la modifier, le récapitulatif en particulier.
