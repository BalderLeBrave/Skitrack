# Maquette v7 : ce qui est porté, ce qui diffère

Source : les handoffs Claude Design du 13 puis du 16 septembre 2026 (`Skitrack-handoff.zip`,
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
| Barre figée de Comparer et de Logements | `src/design/v7.css` (`.barre7`) |
| Fermeture au clic dehors et à Échap | `src/components/v7/fermeture.ts` |
| Noms des stations sur la carte, et leur désencombrement | `src/components/v7/CarteEpingles.tsx` |
| Positions relevées à la main | `src/lib/classeur.ts` (`GPS_FIXES`) |

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

## Deux pièges rencontrés

- **Verrous lus dans une fermeture.** `useGo` capturait `stationId` au rendu ;
  « Retenir et voir les logements » retenait puis refusait le passage. Il lit
  maintenant le magasin à l'appel.
- **Premier rendu du navigateur.** Zustand sert l'instantané initial (rien de
  retenu) pendant l'hydratation ; un effet qui redirige sur `!stationId`
  renvoyait toute visite directe de `/logements` vers Comparer. Les effets
  relisent `useParcours.getState()`.

## Deuxième passe : la maquette du 16 septembre 2026

La maquette a continué d'évoluer après le portage du 13. Ce que cette passe
reprend, écran par écran.

### Comparer

1. **En-tête sur une ligne** — « Étape 1 · Stations », 22 px, sans la phrase
   d'intro. Les marges verticales passent de 24 à 16 px (`.v7main--serre`).
2. **Barre figée** (`.barre7`) — recherche, Filtres et Tri collés sous la barre
   du haut pendant tout le défilement. La recherche porte sur le nom de la
   station, son domaine skiable et son massif : c'est le prédicat `q` de
   `filtres.ts`, qui existait déjà et servait l'accueil. Son aide est passée en
   infobulle, elle tenait sous le champ et coûtait une ligne.
3. **Plus de rectangle « Aucune station cochée »** — le tableau paraît à la
   première case cochée, sinon rien.
4. **Les six raccourcis** quittent la ligne pour la tête du panneau Filtres, et
   le compteur de stations quitte la ligne tout court.
5. **La note sur les tronçons OpenSkiMap** est retirée du panneau.
6. **La légende de la carte** ne garde que « N stations dans le cadrage » et le
   retour à l'ensemble des résultats.
7. **La pilule de séjour de la barre du haut** ne s'affiche plus ici : aucune
   station n'est encore retenue, elle n'avait rien à résumer.

### Logements

8. **Un seul bloc figé** — titre, séjour, fiche station, Filtres et tri. Ils
   vivaient dans trois conteneurs de hauteurs différentes ; aucun ne pouvait
   glisser sous les deux autres, et ils se recouvraient au défilement.
9. **Le séjour passe dans la ligne du titre**, à droite, et la barre du haut
   n'en porte plus sur cet écran : c'est ce qui donne à cette barre la hauteur
   de celle de Comparer.
10. **La loupe est un vrai bouton** : elle relance le relevé pour les dates
    affichées. « Relancer le relevé » doublait l'action et part avec elle.
11. **Retirés** : « Importer une annonce » (l'import par lien n'existe pas côté
    écran, la décision 9 du 13 septembre le disait déjà), la phrase du relevé
    sous le titre, le bandeau RÉSA de la centrale, la ligne « Toujours
    appliqué », la légende des annonces sans coordonnées, le bloc « Provenance »
    du volet, et la ligne « Trajet — non calculé » du pied.
12. **Ce que les règles verrouillées écartent reste dit** — hors zone, autre
    domaine, centrale muette, annonces sans position. Ces motifs ont suivi la
    ligne « Toujours appliqué » dans le panneau Filtres plutôt que de
    disparaître : une liste courte sans explication se lit comme un relevé
    pauvre, pas comme un filtre qui a joué.
13. **Les paliers de distance** rejoignent le panneau, sous le rayon.

### Accueil

14. **Titre** — « Comparez les stations, / puis les logements. » Sous-titre :
    « Altitude des pistes, forfait 6 jours et total du séjour, station par
    station. » La phrase « Ce qui n'est pas relevé est dit absent » est retirée.
15. **L'indice de défilement est un bouton** : il descend jusqu'aux domaines,
    s'efface dès qu'ils sont à l'écran (45 % de la hauteur du héros) et revient
    en haut de page — en 0,35 s, sans rejouer l'attente du premier affichage
    qui le laissait invisible quatre secondes. Le défilement doux du navigateur
    ne fait rien dans la coquille Electron : l'animation est écrite à la main,
    et `prefers-reduced-motion` la remplace par un saut net.
16. **Section** — « Plus grands domaines », lien « Toutes les stations → ». La
    phrase « Une station par forfait relié, classées par kilomètres » est
    supprimée : elle ne s'accordait pas et n'apprenait rien.

### Réservation

17. **Retirés** : le bloc « Ce que ce récapitulatif ne dit pas », la phrase
    « Skitrack ne prend pas de paiement… », la ligne « Trajet — non calculé ».
    L'encadré de droite revient à son calage de 138 px.

### Carte

18. **Les noms reviennent à côté des épingles**, à droite et non dessous : au
    même zoom, deux fois plus de noms tiennent. Ils se masquent plutôt que de se
    recouvrir — à chaque zoom et à chaque déplacement, un nom qui chevaucherait
    un voisin ou une épingle disparaît, et revient dès qu'il a de la place.
    Priorité aux stations de la comparaison, puis à l'ordre du tri. La pastille
    reste à 26 px dans une boîte de 32, qui est la cible du pointeur.
19. **La fiche de survol du dépôt tient lieu de l'infobulle de la maquette** :
    elle en est un sur-ensemble, avec le focus clavier et la fiche épinglée.

### Marque et libellés

20. **Logo** — le pictogramme de montagne est retiré : « ski » léger,
    « track » gras, point bleu en haut à droite du « k ».
21. **`aStation`** (`v7.ts`) écrit « aux 2 Alpes », « au Collet d'Allevard »,
    « à l'Alpe d'Huez », « à La Plagne ». Trois libellés l'emploient — le titre
    de Logements, l'appel de la fiche station, le bouton de Comparer — et ils
    écrivaient tous « à Les 2 Alpes ».

### Positions des stations

22. **`GPS_FIXES`** (`classeur.ts`) relève à la main dix-huit stations que le
    classeur posait au centre de leur commune : Lanslebourg tombait à 5,7 km de
    ses pistes, Val Joly à 3,5 km, Arc 1600 à 2,3 km, Bisanne 1500 à 2,2 km.
    La table vit à côté de `DOMAIN_FIXES` et pour la même raison : le fichier
    généré serait écrasé au prochain `npm run catalogue:import`.
23. **Une position non relevée le dit.** `Station.posRelevee` est vraie quand la
    position vient d'un pin Skiinfo ou d'une correction à la main ; la fiche de
    la carte écrit sinon « Position approximative : centre de la commune ».
    Finir les autres demande une source — géocodage IGN ou relevé —, pas une
    estimation.

### Écarts assumés de cette passe

| Sujet | Maquette | Application | Pourquoi |
| --- | --- | --- | --- |
| Épingles de Comparer | soixante au plus, comme la liste | toutes les stations du résultat | une carte se parcourt au-delà de soixante vignettes ; bornée, elle ne montrait que les soixante premières, toutes alpines puisque le tri par défaut est le kilométrage. Le désencombrement fait le tri des noms. |
| Calage des cartes | valeurs fixes (130 px, 254 px) | hauteur de barre mesurée, publiée en `--barre-h` | la barre de Logements change de hauteur quand les jetons actifs passent à la ligne ; une valeur écrite en dur faisait déborder la carte. |
| Corrections GPS | vingt-deux stations | dix-huit | quatre des vingt-deux (Avoriaz, Chamonix, Les Carroz, Flaine) ont déjà un pin Skiinfo mesuré dans le dépôt, à moins de 200 m du relevé de la maquette. Un relevé prime une pose à la main. |
| Infobulle de la carte | infobulle Leaflet | fiche de survol du dépôt | sur-ensemble : focus clavier, fiche épinglée, actions. |

### Un piège rencontré

- **Un voile cliquable ne sort pas d'un `backdrop-filter`.** La première version
  du clic-dehors posait un voile `position: fixed` plein écran dans la barre
  collante. Le `backdrop-filter` de cette barre crée un contexte de confinement :
  le voile restait borné à la barre, et un clic sous elle ne l'atteignait jamais
  — le panneau Filtres ne se fermait donc pas. `useFermeturePanneau`
  (`components/v7/fermeture.ts`) écoute le document en phase de capture et ne
  pose qu'une question : le `pointerdown` est-il tombé dans l'ancre du panneau ?
  L'ancre englobe le bouton **et** le panneau, sans quoi le clic sur le bouton
  fermerait le panneau juste avant que son `onClick` ne le rouvre.

## Vérification

### 13 septembre 2026

- `npm run typecheck` : vert.
- `npm test` : 208 / 208.
- `npx eslint src` : 4 erreurs préexistantes (`app-data/client.server.ts`,
  `forfaits/refresh.server.ts`, `pistes.ts`), aucune dans les fichiers touchés.
- Cinq écrans vus tourner dans le navigateur à 1440×900 : panneaux de la barre,
  recherche par Entrée, comparaison à trois stations, filtres, fiche avec et
  sans photo, logements des 2 Alpes (94 annonces, relevé en direct), volet,
  pied, réservation, bandeau « réservé », panneau de séjour, menu « Plus »,
  écran de contrôle `/carte` sous la nouvelle barre.

### 16 septembre 2026

- `npm run typecheck` : vert.
- `npm run verify` : 472 / 472, dont les huit cas de `src/lib/v7.test.ts`
  (élision, corrections GPS, drapeau de position approximative), ajouté par
  cette passe aux scripts `test` et `verify`.
- `npx eslint src` : 5 erreurs, les mêmes qu'avant la passe et dans les mêmes
  fichiers (`app-data/client.server.ts`, `auth/use-current-user.ts`,
  `pistes.ts`, `PartPistes.tsx`, `stay/tarif.test.ts`) ; aucune dans les
  fichiers touchés, et trois avertissements de moins.
- `npm test` échoue sur dix-sept cas de `scripts/**` — les mêmes dix-sept qu'à
  la révision de base, sans rapport avec le parcours. Ils sont enchaînés par un
  `&&` devant les tests de `src/lib`, qui ne tournaient donc pas ; `npm run
  verify` les lance et c'est la commande à employer tant que `scripts/` n'est
  pas réparé.
- **Écrans non vus tourner.** Cette passe n'a pas été ouverte dans un
  navigateur : la session n'a pas d'affichage. Le calage des barres figées, le
  désencombrement des noms sur la carte et les fondus de l'accueil demandent une
  relecture à l'œil avant d'être tenus pour acquis.
