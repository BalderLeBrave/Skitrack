# Reprise des centrales de réservation

Cinquième lot. Je l'avais annoncé comme suspendu à votre décision sur les API :
il ne l'était qu'à moitié. La décision porte sur la façon de relever les prix.
Le rattachement station vers centrale officielle, lui, reste vrai dans tous les
cas, et c'est la partie que ce lot restitue.

| Nouveau fichier | Source | Lignes d'origine |
|---|---|---|
| `src/lib/centrales.data.json` | `main/providers/station/centrals.ts` | 3 261 |
| `src/lib/centrales.ts` | idem | |
| `src/components/CentraleCard.tsx` | nouveau | |

`src/lib/centrales.test.ts` : 3 cas, tous verts.

## Ce qui a été repris, et ce qui a été laissé

Le fichier d'origine portait, pour chaque centrale, les sélecteurs CSS de son
formulaire de recherche : champ d'arrivée, durée, nombre de personnes, bouton de
soumission. **Ils ne sont pas repris.** C'est la machinerie de scraping, celle
dont vous vous éloignez, et elle périme au premier changement de page chez
l'exploitant.

Ce qui est repris : le nom, l'URL et l'hôte. 74 relevés sont devenus 49 stations
du catalogue, 5 centrales de domaine, 45 hôtes distincts.

Les rattachements ont demandé une table d'alias, tous vérifiables sur les noms :
les sept villages de La Plagne pointent vers `la-plagne`, `La Rosière` vers
`la-rosiere-1850`, `Dévoluy` vers `superdevoluy-la-joue-du-loup`,
`Grand Tourmalet` vers `la-mongie-bareges`, et ainsi de suite.

Trois relevés n'ont pas trouvé de station et sont conservés tels quels dans
`nonRattachees` plutôt qu'effacés : `Les Alberts` (hameau), `Les Hameaux de la
Roche` (résidence, pas une station), `Vallée` (nom tronqué à la saisie). À
reprendre dans le classeur, pas dans le JSON, qui est généré.

Airbnb et Booking.com figuraient dans la table. Ils en sont sortis : ce sont des
plateformes globales, pas les centrales des stations, et les confondre brouille
exactement la distinction que cette table sert à tenir.

## La règle du module

`centraleFor()` rend l'adresse relevée, jamais une URL de recherche fabriquée.
Chaque centrale a sa syntaxe de paramètres, elle n'est pas publiée, et un lien
construit qui tombe sur une page d'erreur est pire que le lien d'accueil. La
carte affiche donc les dates du séjour à côté du lien, à recopier dans leur
formulaire, et le dit en toutes lettres.

La station prime sur le domaine : une station qui a sa propre centrale la garde
même si son domaine en a une. Val Thorens vend ses appartements, les 3 Vallées
vendent le forfait.

## Branchement

Dans `routes/stations.$id.tsx`, après `<ForfaitCard />` :

```tsx
import { CentraleCard } from "@/components/CentraleCard";

<CentraleCard
  stationId={station.id}
  checkIn={stay.checkIn}
  checkOut={stay.checkOut}
  guests={stay.guests}
/>
```

`centraleCoverage(STATIONS.map((s) => s.id))` donne le compte station, domaine,
aucune, pour une page d'audit.

## Ce qui reste vraiment suspendu à une décision

Le relevé des prix chez ces 45 hôtes. Trois voies, et elles ne se valent pas :
API officielle ou partenaire là où elle existe (Ingénie, Open System, Ublo ont
des interfaces côté exploitant), accord direct avec les centrales mutualisées
qui couvrent le plus de stations, ou renoncement au prix relevé sur les
centrales, l'application se contentant d'y envoyer le visiteur. La troisième est
la seule qui ne demande rien à personne, et elle est déjà en place avec ce lot.
