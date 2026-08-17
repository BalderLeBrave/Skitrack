# Photos de l'accueil

Sept images, une pour le héro et six pour les tuiles de massif. Elles sont
**empaquetées** avec l'application : la CSP du renderer n'autorise aucune
origine distante pour les images de l'interface, et l'accueil doit s'afficher
hors ligne.

| Fichier | Source d'origine | Dimensions livrées |
|---|---|---|
| `hero-montblanc.jpg` | img3.wallspic.com (3840 × 2160) | 2560 × 1440 |
| `massif-alpes-nord.jpg` | cdn.indebergen.nl — Val Thorens | 1160 × 870 |
| `massif-alpes-sud.jpg` | skieur.com — Alpe d'Huez | 1000 × 667 |
| `massif-pyrenees.jpg` | gite-pyrenees-azun.fr | 1344 × 768 |
| `massif-massif-central.jpg` | mon-sejour-en-montagne.com — Le Lioran | 400 × 400 |
| `massif-vosges.jpg` | moho-mountainhome.com (5000 × 3333) | 1600 × 1067 |
| `massif-jura.jpg` | jura-tourism.com (2048 × 1363) | 1600 × 1065 |

Budgets respectés : héro ≤ 2560 px et ≤ 600 Ko, tuiles ≤ 1600 px et ≤ 300 Ko.

**Usage personnel uniquement.** Aucune de ces photos n'est sous licence libre :
elles viennent de sites de tourisme et de banques d'images, et elles ont été
retenues pour maquetter, pas pour publier. Avant toute distribution de
l'application, les remplacer par des photos libres de droits (Unsplash,
Wikimedia Commons sous CC-BY, ou des clichés à soi) — les noms de fichiers
suffisent, `components/photos.ts` ne connaît rien d'autre.

`massif-massif-central.jpg` ne fait que 400 × 400 : à cette résolution la tuile
reste nette jusqu'à environ 300 px de large, ce qui couvre la grille de six
tuiles. Sur une fenêtre très large avec peu de massifs, elle s'adoucira — la
remplacer par une photo plus grande du Lioran ou de Super-Besse est la seule
correction utile.
