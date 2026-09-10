# Skitrack

Comparer un séjour ski **en France**, par domaine skiable et par altitude réelle
(le bas des pistes n’est pas l’altitude du village).

Application web : recherche de logements entiers autour du domaine, totaux de
séjour seulement, mix de pistes, forfaits à jour, neige et bulletin d’avalanche.
Rien n’est inventé.

## Ce que l’app montre

- **Domaines français** — altitudes France Montagnes, mix de pistes
  OpenStreetMap réparti sur le kilométrage annoncé.
- **Distances** — distance aux **remontées mécaniques**, en mètres, ou
  « non mesurée ». Aucun « skis aux pieds » n’est déduit.
- **Forfaits** — prix relevé sur la page officielle du domaine, avec la date
  du relevé. Un tarif saisi à la main n’est pas écrasé. Un estimé ≈ n’entre
  pas dans le coût du séjour. Si le relevé échoue, l’ancien prix reste, marqué
  « non à jour ».
- **Logements** — recherche autour du domaine, ou import d’un lien, ou saisie
  manuelle. Un total de séjour, pas un prix « à partir de ».
- **Neige** — Open-Meteo, hauteur au sol et prévision, au village et au sommet.
- **Avalanche** — **BRA officiel Météo-France** quand le massif a un bulletin.
  Sinon, un **indice interne** (chutes + vent) est affiché et nommé clairement :
  ce n’est pas le BRA.
- **France uniquement.** Attribution OpenStreetMap / OpenSkiMap (ODbL) et
  OpenTopoMap (CC-BY-SA).

## Utilisation

1. Choisir un massif et des dates.
2. Lire le mix de pistes, le forfait (âge et source), le BRA.
3. Ouvrir les logements : totaux de séjour, distance aux remontées, secteur.
4. Comparer jusqu’à quatre fiches. Déposer une trace GPX si besoin.

Les écrans : accueil des domaines, fiche station, logements, comparateur,
forfaits, traces GPX.

## Licences

Données de domaines dérivées d’**OpenStreetMap** via **OpenSkiMap**, licence
**ODbL**. Fond de carte **OpenTopoMap**, **CC-BY-SA**.
