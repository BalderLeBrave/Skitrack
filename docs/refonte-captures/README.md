# Captures avant / après — refonte « Airbnb × Skiinfo »

Huit écrans, deux états : `avant/` au commit `4232686` (« Dédoublage des
offres »), `apres/` à l'issue des dix phases de la refonte. Même fenêtre
(1 440 × 940), même thème clair, même jeu de données, même ordre de visite —
seule la feuille de style et la structure des écrans changent d'un dossier à
l'autre.

| Écran | Ce qui change |
|---|---|
| `1-accueil` | Héro photo et voile en trois arrêts, barre de recherche en pilule à quatre segments, bandeau neige, tuiles de massif 4:3 |
| `2-recherche` | Deux colonnes 55 / 45, filtres en survol, puces des filtres posés, forfait sur les épingles |
| `3-offres` | Deux colonnes « dans le budget » / « juste au-dessus », lignes denses |
| `4-combinaisons` | Dégradé bleu monochrome, liseré des vacances scolaires, légende |
| `5-decision` | Colonne de 560 px, carte du logement retenu, pastilles d'initiales, écart au partage égal en encart |
| `6-logements` | Photo 16:10, placeholder montagne, bande neige, actions en pilules |
| `7-suivi` | Lignes-cartes à cinq colonnes, sparklines pointillées quand la série est simulée |
| `8-reglages` | Gabarit deux colonnes, sommaire des sections réelles, lignes libellé-contrôle |

## Comment elles ont été prises

Une sonde temporaire dans `main.tsx` pose `window.__DEMO_OVERRIDES__` — le point
d'entrée prévu par `state/appState.tsx` pour un hôte de capture — puis parcourt
les onglets en annonçant chaque écran prêt dans le titre de la fenêtre ; un
script PowerShell capture à ce signal. La sonde n'est pas au dépôt : elle est
retirée après coup, et les préférences qu'elle a écrites sont remises à leurs
valeurs d'origine.

**Les logements et les suivis visibles sont des données de démonstration**, ce
que leurs noms disent en clair (« Logement de démonstration », « Chalet de
démonstration »). Le catalogue local est vide sans relevé, et un écran Logements
vide n'aurait rien montré du travail de la phase 8. Les hauteurs de neige à
`0 / 0 cm` sont, elles, de vraies réponses du modèle : les captures ont été
prises en août.

`avant/6-logements` et `apres/6-logements` partagent ces données injectées, donc
la comparaison porte bien sur l'interface et non sur le contenu.
