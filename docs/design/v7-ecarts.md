# Maquette v7 : ce qui est porté, ce qui diffère

Source : le handoff Claude Design du 13 septembre 2026 (`Skitrack-handoff.zip`,
projet `94054660-9e3d-4b33-98e2-0e5b5f9047a4`), fichiers `SKITRACK v7 -
App.dc.html` et `V7Coquille.dc.html`, plus `v7/v7-data.js` et `image-slot.js`
qu'il importe. La maquette v7 remplace la v6 comme contrat d'interface des cinq
écrans du parcours ; `docs/design/v6-contrat.md` et `v6-ecarts.md` restent
comme archive et ne décrivent plus l'application.

## Où c'est porté

| Maquette | Dépôt |
| --- | --- |
| Palette, Manrope, tailles, rayons, ombres (styles en ligne) | `src/design/system.css` (jetons) et `src/design/v7.css` (classes) |
| `V7Coquille` : barre, verrous, pilule de séjour, panneau « Votre séjour » | `src/components/Coquille.tsx`, `v7/Calendrier.tsx`, `v7/Compteur.tsx` |
| Accueil | `src/routes/index.tsx`, `v7/CarteStation.tsx` |
| Comparer : tableau, filtres, jetons, état vide, cartes, carte | `src/routes/comparer.tsx`, `v7/CarteEpingles.tsx`, `v7/Vide.tsx` |
| Station | `src/routes/stations.$id.tsx`, `v7/useForfait.ts` |
| Logements : filtres, cartes, volet, pied fixe, carte aux prix | `src/routes/logements.tsx` |
| Réservation | `src/routes/reservation.tsx` |
| `state` du script (cmp, pick, seen, booked, filtres) | `src/lib/parcours.ts` |
| Lectures des champs courts (`n`, `lo`, `hi`, `dom`, `share`…) | `src/lib/v7.ts` |

Les écrans de contrôle (`/carte`, `/altitudes`, `/openskimap`, `/forfaits`,
`/traces`) ne sont pas dans la maquette : ils gardent leur coquille `.v6` et
leurs feuilles, sous la nouvelle barre. Ils prennent la famille et la palette du
système par les jetons, sans autre changement.

## Décisions (13 septembre 2026)

1. **Données du dépôt, jamais celles du bundle.** `stations-map-data.json` et
   `v7-data.js` ne sont pas lus. Le référentiel compte 320 stations (la maquette
   en annonçait 318) ; les altitudes sont celles de la station, pas du domaine ;
   les annonces sont le relevé figé du dépôt plus la recherche en direct, telle
   que la route précédente la lançait. Le code de collecte n'est pas touché.
2. **Une altitude à zéro n'est pas une mesure.** Le référentiel met 0 là où le
   classeur se tait ; l'écran écrit « non relevée ». (`src/lib/v7.ts`)
3. **Forfaits : le relevé du dépôt prime la graine.** La maquette lisait la
   seule graine du catalogue. Ici `getForfait` répond quand le magasin a relevé
   la page officielle ; sa date s'écrit. Un tarif « estimé » n'entre jamais dans
   le coût. La saison et la zone n'existent que dans la graine. (`useForfait.ts`)
4. **Météo, webcams, bulletin : les services du dépôt.** « Aujourd'hui aux deux
   altitudes » et « 14 jours » viennent de `getForecastPair` (Open-Meteo par le
   serveur), pas d'un appel direct depuis le navigateur. Les webcams sont celles
   de la table du dépôt, avec le flux de l'exploitant ; la maquette n'en
   affichait aucune. Le bulletin d'avalanche est lu quand Météo-France répond ;
   sinon le texte de la maquette, « Bulletin d'avalanche non lu ».
5. **Quatre stations au plus dans la comparaison** (la v6 en admettait trois).
6. **Un seul tableau de comparaison**, comme la maquette, avec la note « valeur
   du domaine » sur les lignes mesurées à l'échelle du domaine. La phase 4 de
   l'audit avait séparé ces lignes dans un second tableau ; la maquette tranche
   autrement et la note tient le même rôle.
7. **Disponibilité : le verdict du dépôt.** « Prix relevé aux dates » et
   « Disponibilité non confirmée » viennent de `stay/availability.ts`, avec sa
   raison en toutes lettres, au lieu de la phrase figée « relevé le 3 sept. ».
   La provenance affichée dans le volet est le champ `proven` de l'annonce.
8. **Lien de partage** : `/reservation#s=…&l=…&d=…&n=…&t=…&r=…`, lu au montage
   de la coquille. `d` (arrivée) est ajouté au format v6. Le bandeau
   « Récapitulatif partagé » s'affiche quand l'état vient du lien.
9. **« Relancer le relevé »** relance la recherche en direct (c'est réel).
   « Importer une annonce » reste un bandeau : l'import par lien n'existe pas
   encore côté écran.
10. **« Plus »** garde ses liens vers les écrans de contrôle et la
    synchronisation : c'est le seul chemin vers eux. La maquette ne dessinait
    pas le contenu du menu.

## Écarts assumés

| Sujet | Maquette | Application | Pourquoi |
| --- | --- | --- | --- |
| Couverture | slot vide « crédit obligatoire » | `/hero.jpg` du dépôt, mention « Crédit photo à relever » | décision v6 conservée |
| Photos de station | « Photo Skiinfo · crédit à relever » | idem, ou « Photo Skiinfo de X, même domaine » quand elle est empruntée (`stationPhoto.ts`) | l'emprunt est dit |
| Lead des logements | « relevés le 3 sept. 2026 pour 8 personnes… » | compte des annonces et nuits du séjour réel | phrase figée sur des données de démonstration |
| État vide des logements | « Le relevé du 3 sept. 2026 ne couvre que Les 2 Alpes » | « Aucune annonce relevée pour X » | idem |
| Sources dans les filtres | Airbnb, Gîtes de France, Centrale, Abritel | les sources présentes dans le relevé (Booking compris) | données réelles |
| Profil altimétrique, minicarte, historique de neige | absents | retirés de la fiche | pas dans la maquette v7 |
| Récapitulatif imprimable (`StayReport`) | absent | retiré de la réservation ; « Copier le récapitulatif » porte le même contenu | pas dans la maquette v7 |
| Curseur de budget « tous » à 5 000 | curseur 0–6 000, 0 = indifférent | idem, indifférent = aucun plafond | même règle |

## Composants retirés

Treize composants n'avaient plus d'appelant après le portage et sont supprimés,
comme la phase 1 de l'audit l'avait fait pour seize autres : `StayReport`,
`LodgeCompare`, `SearchStayBar`, `StayDatesField`, `Flocons`, `PhotoCredit`,
`AltitudeProfile`, `SnowHistoryCard`, `ForecastCard`, `WebcamCard`, `BraCard`,
`SkiinfoCard`, `LangToggle`. Ce qu'ils affichaient est soit repris dans les
écrans v7 (prévision, webcams, bulletin, langue, calendrier, compteurs,
récapitulatif copié), soit absent de la maquette v7 (profil altimétrique,
minicarte, historique de neige, récapitulatif imprimable, comparateur de
logements). Les modules de `src/lib` qu'ils lisaient restent, avec leurs tests.

Les cinq primitives de `src/components/base/` (Bouton, Champ, Etiquette,
Liste, Tableau) restent aussi : elles sont le système décrit par `base.css`,
pas des écrans. Les écrans v7 emploient leur propre vocabulaire (`btn7`,
`puce`, `jeton`…) ; rapprocher les deux est un chantier à part.

## Trois points tranchés le 13 septembre 2026

- **Tableau de comparaison unique**, comme la maquette (décision 6 ci-dessus).
- **Couverture** : `/hero.jpg` reste, aucun crédit n'étant connu dans le dépôt
  pour ce fichier ; la mention « Crédit photo à relever » est donc exacte.
- **Sections hors maquette** (profil, minicarte, historique de neige,
  récapitulatif imprimable) : retirées avec leurs composants, ci-dessus.

## Conformité à l'export du 16 septembre 2026

Un second export du même projet est arrivé le 16 septembre. Comparé bloc par
bloc au portage, il a donné une trentaine d'écarts réels, corrigés dans les
commits qui suivent ce document. Restent quatre écarts connus, assumés, et
c'est ici qu'ils sont écrits pour ne pas se re-signaler à chaque relecture.

1. **Le panneau « Centrales de réservation » (App.dc.html:466-487) n'est pas
   porté**, et ne le sera pas en l'état. Il est inatteignable dans la maquette
   elle-même : `auditOpen` naît à `false`, Échap le remet à `false`, et
   `openAudit` — la seule fonction qui le passerait à `true` — n'est liée à
   aucun balisage, dans aucun des dix fichiers de l'export. L'objet `cen`
   (l. 890-892) est mort de la même façon. Le porter demanderait d'inventer un
   déclencheur que la maquette ne donne pas. Ses textes achèvent de le
   disqualifier : le bandeau (l. 907) finit par « Les annonces affichées dans
   **cette maquette** viennent du relevé du 3 sept. 2026 aux 2 Alpes », et ses
   compteurs — « 49 centrales de station, 5 de domaine », « 27 connecteurs,
   19 qui répondent » — sont tapés à la main. Le sens de l'autorité est
   d'ailleurs inversé : les lignes 660-712 de la maquette recopient
   `src/lib/scrape/centrales/registre.ts` et `hotes/index.ts`, en le disant en
   commentaire, et la copie est déjà périmée. La source vivante est le dépôt.
2. **La pilule de séjour reste sur Comparer et sur Logements**, là où la
   maquette calcule `showStayBar: screen !== 'compare' && screen !== 'lodgings'`
   (l. 918). Elle la retire parce qu'elle met à la place, sur Logements, un
   résumé de séjour dans l'en-tête collant (l. 320-330). Tant que ce résumé
   n'existe pas ici, retirer la pilule supprimerait le seul accès aux dates et
   au groupe depuis cet écran : on perdrait une commande pour gagner une ligne.
3. **La loupe de l'accueil ouvre les logements de la station désignée**, là où
   la maquette ouvre sa fiche (l. 882). C'est une décision écrite
   (`index.tsx`, en-tête de `v7/OngletsStation.tsx`, commit 408a7cb) : la fiche
   reste à un clic par l'onglet « Fiche station », et la phrase sous la barre
   annonce ce que la loupe fera.
4. **L'indice de défilement de la couverture reste inerte** — `aria-hidden`,
   `pointer-events: none` —, là où la maquette en fait un bouton qui défile en
   douceur et s'efface au-delà de 45 % de la hauteur. Le texte de la maquette,
   lui, est repris : il nomme ce qu'il y a plus bas.

Deux autres écarts de l'export sont déjà couverts plus haut : la neige confinée
à la couverture, et le voile renforcé de cette même couverture.

## Deux pièges rencontrés

- **Verrous lus dans une fermeture.** `useGo` capturait `stationId` au rendu ;
  « Retenir et voir les logements » retenait puis refusait le passage. Il lit
  maintenant le magasin à l'appel.
- **Premier rendu du navigateur.** Zustand sert l'instantané initial (rien de
  retenu) pendant l'hydratation ; un effet qui redirige sur `!stationId`
  renvoyait toute visite directe de `/logements` vers Comparer. Les effets
  relisent `useParcours.getState()`.

## Vérification

- `npm run typecheck` : vert.
- `npm test` : 208 / 208.
- `npx eslint src` : 4 erreurs préexistantes (`app-data/client.server.ts`,
  `forfaits/refresh.server.ts`, `pistes.ts`), aucune dans les fichiers touchés.
- Cinq écrans vus tourner dans le navigateur à 1440×900 : panneaux de la barre,
  recherche par Entrée, comparaison à trois stations, filtres, fiche avec et
  sans photo, logements des 2 Alpes (94 annonces, relevé en direct), volet,
  pied, réservation, bandeau « réservé », panneau de séjour, menu « Plus »,
  écran de contrôle `/carte` sous la nouvelle barre.
