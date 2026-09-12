# Reprise du récapitulatif de séjour

Quatrième lot. Le document imprimable du séjour retenu, et surtout le modèle de
provenance qui le gouverne. Comme les précédents, il n'ajoute que des modules :
aucune route n'est modifiée.

| Nouveau fichier | Source | Reprise |
|---|---|---|
| `src/lib/stay/report.ts` | logique extraite de `2d960d5:.../components/StayReport.tsx` | |
| `src/components/StayReport.tsx` | réécrit | |
| `src/lib/stay/report.test.ts` | nouveau | 11 cas |

## Le modèle de provenance

C'est ce qui compte, et c'est tout ce que le module apporte. Quatre origines :

- `relevé` : une source l'a publié, l'application l'a lu ;
- `saisi` : l'utilisateur l'a écrit lui-même ;
- `estimé` : l'application l'a calculé depuis un barème, et le dit ;
- `néant` : le poste vaut zéro **par décision**.

Le quatrième est celui que le commentaire d'origine documente comme ayant
manqué. Un poste à zéro parce que le matériel est décoché, parce qu'il n'y a
aucun péage sur la route, n'est pas une estimation. Le marquer « estimé » puis
l'inscrire dans « ce qui manque » revenait à reprocher à l'application de ne pas
avoir relevé un chiffre que personne ne lui a demandé.

`posteDecide(label, montant)` applique la règle : zéro devient `néant`,
au-dessus de zéro l'origine passée fait foi.

Un cinquième cas existe, `inconnu`, mais ce n'est pas une origine de montant :
il dit qu'il **n'y a pas de montant**.

## Un poste inconnu ne figure pas au tableau

`buildReport(input)` rend `{ nuits, postes, total, totalEstime, manques,
parPersonne }`. Un poste dont le montant est inconnu n'entre pas dans `postes`,
il part dans `manques`. Une ligne à « — » dans un budget se lit comme un zéro à
la troisième relecture, et fausse toutes les additions faites de tête.

Le total additionne **tous** les postes chiffrés, estimations comprises :
retrancher les estimations donnerait un chiffre plus bas que la réalité, la
pire des deux erreurs possibles sur un budget. `fiabiliteLabel()` annonce alors
la part estimée, « dont 240 € estimés, soit 6 % du total », plutôt qu'un chiffre
net qui aurait une précision qu'il n'a pas.

## Le forfait

`origineForfait()` traduit `src/lib/forfaits/types.ts` :

| Statut | Origine |
|---|---|
| `ok`, `stale` | `relevé` |
| `manuel` | `saisi` |
| `estimé` | `estimé` |
| `erreur`, absent | `inconnu`, et part dans les manques |

`stale` reste un relevé : le tarif est vieux, mais il a bien été lu chez
l'exploitant. C'est l'écran des forfaits qui dit son âge, pas le récapitulatif.

## Le composant

Imprimable : `print:` masque la carte et le bouton d'impression, et allège les
marges. Une carte en niveaux de gris ne renseigne personne, et un bouton sur
papier est du bruit.

Sections : en-tête du séjour, budget avec l'origine de chaque montant et un
« ≈ » devant les estimations, total avec prix par personne, puis « ce que ce
document ne dit pas ».

Deux choses qu'il ne fait pas, comme demandé :

- **`StayReportMap` n'est pas repris.** Ses 227 lignes redessinaient ce que
  `MapPanel` fait déjà. C'est `MapPanel` qui est utilisé, avec une épingle de
  type `listing`, qui existait déjà dans son type `MapPin`.
- **Aucun plan des pistes officiel n'est intégré.** Ce sont des œuvres
  graphiques protégées, même si le catalogue en porte l'URL pour chaque station.
  Le document le dit en pied, pour que la question ne se repose pas.

## Une dépendance évitée

`report.ts` ne importe pas `formatEuro` de `listings.ts` : ce module entraîne
avec lui le relevé figé, l'accès et les 320 stations du référentiel, ce qui
rendait le fichier de test impossible à exécuter sous `node --test`. Le
formatage des euros est donc recopié, six lignes, avec la raison en commentaire.
Le composant, lui, importe bien `formatEuro` : il est déjà dans le graphe de
l'application.

## Point de branchement

`src/routes/reservation.tsx` est le candidat naturel, mais il fait partie de la
campagne v6 non commitée : le branchement se fera dans la session qui la reprend.
L'appel ressemble à ceci :

```tsx
import { StayReport } from "@/components/StayReport";
import { posteDecide, origineForfait } from "@/lib/stay/report";

<StayReport
  lat={listing.lat}
  lon={listing.lon}
  listingTitle={listing.title}
  input={{
    stationName: station.name,
    checkIn: stay.checkIn,
    checkOut: stay.checkOut,
    voyageurs: stay.guests,
    postes: [
      { label: "Logement", montant: listing.total, origine: "relevé", detail: listing.title },
      { label: "Forfaits", montant: forfait?.j6 ?? null, origine: origineForfait(forfait?.status) },
      posteDecide("Location de matériel", materielCoche ? estimation : 0),
    ],
    manquesAutres: listing.lat == null ? ["Le logement n’a pas de position."] : [],
  }}
/>
```

Le point important du branchement : c'est l'appelant qui décide de l'origine de
chaque montant, parce que lui seul sait d'où il vient. Le module ne la devine
jamais.
