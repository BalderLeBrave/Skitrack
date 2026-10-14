# Reprise des logements

Troisième lot. La disponibilité, le filtre, et les notes de sélection. Comme les
précédents, il n'ajoute que des modules. La seule modification d'un fichier
existant est l'ajout de quatre champs **facultatifs** au type `Listing`.

| Nouveau fichier | Source | Reprise |
|---|---|---|
| `src/lib/stay/availability.ts` | `2d960d5:.../data/lodgingAvailability.ts` | logique telle quelle, type structurel |
| `src/lib/stay/lodgingFilter.ts` | `2d960d5:.../data/lodgingFilter.ts` | partie utile, adaptée au `Listing` |
| `src/lib/stay/notes.ts` | réécrit | |
| `src/components/SelectionNotes.tsx` | réécrit | |
| `src/lib/stay/lodging.test.ts` | nouveau | 20 cas |
| `src/lib/listings.ts` | **modifié** | quatre champs facultatifs |

## Le principe de la disponibilité

Gardé mot pour mot dans l'en-tête du module, parce qu'il défait une conviction
qui était écrite en toutes lettres dans le code d'origine : « une recherche
Airbnb ne renvoie que ce qui est libre aux dates demandées ». C'est faux. Airbnb
liste des biens qu'il ne peut pas vendre aux dates demandées, et ne le signale
qu'en n'affichant pas de prix.

Une plateforme tarife ce qu'elle peut vendre. **Un prix relevé pour des dates
précises est donc la seule preuve de disponibilité dont l'application dispose.**
Tout le reste est une supposition, et se dit comme telle.

Quatre statuts : `confirmed`, `unconfirmed`, `gone`, `unrated`. L'ordre des cas
est la règle, et il est conservé :

1. porte d'entrée (`isDoorway` : URL nulle, ou motif `/s/<lieu>/homes`) et
   saisie manuelle : **non jugées**. Une recherche ne peut pas être
   « indisponible » ; et masquer la saisie de l'utilisateur sous un filtre qu'il
   n'a pas relié à elle est un défaut, pas une rigueur ;
2. absence constatée, **avant le prix** : un tarif relevé la semaine dernière ne
   prouve rien contre une absence constatée aujourd'hui aux mêmes dates ;
3. prix daté de **ces** dates, avec péremption à 6 h ;
4. absence de prix : c'est la forme sous laquelle Airbnb dit non ;
5. prix daté d'autres dates.

## Les quatre champs ajoutés à `Listing`

`pricedCheckIn`, `pricedCheckOut`, `scannedAt`, `missingSince`, tous
**facultatifs et renseignés nulle part**. Le relevé figé de `listings.ts` n'a
pas été confronté à des dates par une source : il ressort donc « non confirmé »,
ce qui est exact. Un défaut optimiste les ferait passer pour prouvés, et c'est
précisément l'erreur que ce lot corrige.

Le type que lisent les modules est structurel, pas `Listing` : `Listing` s'y
conforme, et un relevé live plus riche s'y conformera aussi sans qu'on ait à
élargir le type du relevé figé.

## Un écart assumé avec l'original

L'original, quand un prix daté des bonnes dates avait plus de six heures,
rendait `{ status: "unconfirmed", reason: "other_dates" }`. Le motif est faux :
le prix porte bien ces dates-là, il est seulement vieux. L'écran aurait écrit
« prix relevé pour d'autres dates » à propos d'un prix relevé pour ces dates.

Un cinquième motif, `stale`, est donc ajouté, et `availabilityLabel` écrit
« Prix relevé il y a plus de six heures ». Le comportement (non confirmé) est
identique ; seule la raison affichée devient exacte.

## Les deux règles du filtre

1. **« Non annoncé » n'est pas « ne convient pas ».** Une caractéristique
   absente laisse passer. Écarter sur une donnée que la source n'a jamais
   publiée viderait la liste sans rien dire.
2. **Une caractéristique annoncée engage l'annonce, avec ou sans prix.**
   L'absence de tarif dispense des filtres de prix, pas des autres.

Ce que l'adaptation change : l'ancien `Lodging` disait « non annoncé » avec un
zéro, `Listing` le dit avec `null`. C'est un gain, pas une perte : zéro chambre
redevient un fait publiable, celui d'un studio, distinct du silence de la
source.

`partyVerdict` garde ses trois verdicts, `convient` / `trop-petit` /
`non-annonce`, et surtout son ordre : **un refus l'emporte sur une absence**.
Une annonce qui publie « 1 chambre » quand on en demande quatre est
démontrablement trop petite, que sa capacité soit publiée ou non ; la classer
« non annoncée » la ferait réapparaître dès qu'on réaffiche les non-annoncées.

`minRoomsFor(n) = n + 1` : convention française de la location de montagne,
demander 4 chambres c'est demander un 5 pièces. On traduit **la demande, jamais
la donnée** : aucune annonce ne se voit attribuer un nombre de chambres qu'elle
n'a pas publié.

`isDroppedGitesOffer` prouve par libellé **ou** par chemin d'URL. Un titre
« Gîte » ne sauve pas une URL de groupe. « Copains comme Cochons », 14 personnes,
reste un gîte ordinaire et passe.

`isStudioListing` lisait le champ `type` de l'ancien `Lodging`. Le relevé actuel
n'en a pas ; c'est le titre qui est lu, seul texte disponible, et les centrales
y écrivent « studio » en toutes lettres.

Ce qui n'est **pas** repris, faute de données dans le relevé actuel : l'hôtel
combinable (pas de type), le filtre de type coché, et le filtre de distance
(aucune mesure au moment du filtre). À reprendre le jour où le relevé live les
porte.

## Compter les écarts plutôt qu'afficher une liste vide

`applyFilter(listings, criteria)` rend `{ kept, dropped }`. `dropped` compte par
motif : `groupe`, `capacite`, `prix`, `source`, `disponibilite`, et garde la
ligne de chaque bien écarté. `droppedLabel()` en tire « 6 biens masqués : 1 gîte
de groupe, 2 trop petits, 2 hors budget, 1 source décochée ».

Une liste vide est le pire des résultats : elle ne dit ni pourquoi ni combien.

## Les notes de sélection

Réécrites. L'original indexait les votes par **rang de voyageur** dans une liste
de voyageurs locale, qui n'existe plus. L'auteur est désormais
`useCurrentUser()?.id`.

Store zustand persisté, clé `skitrack-v1-selection-notes`, cible = identifiant
textuel de logement ou de station. Le vote est réversible : recliquer son propre
pouce le retire, parce qu'une interface qui ne permet pas de revenir enregistre
des avis faux. Le décompte ne montre que les voix **exprimées** : « 3 pour », et
jamais « 3 sur 5 », les deux personnes qui n'ont rien dit n'ayant pas voté
contre. On ne retire que ses propres notes.

## Points de branchement

Dans `src/routes/logements.tsx`, à la place du filtrage en ligne :

```tsx
import { applyFilter, droppedLabel } from "@/lib/stay/lodgingFilter";

const { kept, dropped } = applyFilter(listings, {
  travelers: stay.guests,
  rooms: stay.bedrooms,
  stay: { checkIn: stay.checkIn, checkOut: stay.checkOut },
  budgetMin: 0,
  budgetMax: budget,
  budgetCeiling: BUDGET_MAX,
});
// puis, sous la liste : {droppedLabel(dropped)}
```

`<SelectionNotes kind="logement" targetId={listing.id} />` sur une carte de
logement, `kind="station"` sur une fiche de station.

`availabilityOf(listing, stay)` et `availabilityLabel(verdict)` posent la
mention à côté du prix. Tant que le relevé live ne renseigne pas les quatre
champs, elle dira « Prix relevé pour d'autres dates » sur tout le relevé figé :
c'est le comportement voulu, et la preuve que rien n'est supposé.
