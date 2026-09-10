# Terrain accueil (pack WeTransfer / Gaea 1.3.1)

| Fichier servi | Source | Rôle |
|---|---|---|
| `snow-mountain.glb` (~9 Mo) | Low Poly.obj + albedo 2K | Premier affichage |
| `snow-mountain-hi.glb` (~66 Mo) | High Poly.obj (1,57 M verts) | Remplace le low poly ensuite |
| `snow-mountain-albedo.jpg` (~6 Mo) | image00003.tif 4096² | Albedo 4K |
| `snow-mountain-8k.jpg` (~0,7 Mo) | image00004.tif 8192² float | Height 8K → bump |

TIF 8K brut (257 Mo) et OBJ High Poly (230 Mo) ne partent pas dans le bundle : trop lourds à parser. Les conversions ci-dessus **sont chargées** par `MountainScene` (hi sauté si `saveData` ou viewport < 900 px).
