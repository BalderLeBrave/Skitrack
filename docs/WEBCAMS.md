# Webcams des stations

La fiche station montre les webcams de la station, puis celles des autres
stations de son domaine (`src/lib/webcams.ts`). La table des caméras,
`src/lib/webcams.data.ts`, est **générée** : elle ne se retouche pas à la
main. `scripts/webcams/generer.test.mjs` vérifie qu'elle est exactement celle
que produit le relevé versionné.

## Ce qui est dans le dépôt

| Chemin | Contenu |
|---|---|
| `scripts/webcams/*.mjs`, `stations.ts` | la chaîne du relevé, une étape par script |
| `scripts/webcams/releve/` | le relevé du 30 septembre 2026 : stations, caméras candidates, résultats du banc, choix |
| `src/lib/webcams.data.ts` | la table de l'application, générée depuis `releve/` |
| `src/components/v7/Webcams.tsx` | le lecteur de la fiche, lancé à son ouverture |

Le relevé du 30 septembre compte 505 caméras sur 147 stations : toutes les
caméras vérifiées de chaque station, sans plafond.

## Refaire la table depuis le relevé versionné

```bash
node scripts/webcams/generer.mjs
```

Sans argument, le script lit `scripts/webcams/releve/` et réécrit
`src/lib/webcams.data.ts`. C'est ce qu'on fait après avoir changé une
correction à la main dans `generer.mjs` (libellé, caméra retirée, caméra
rendue à une autre station).

Pour changer les règles de choix (ordre, écarts) sans refaire le
banc, relancer `choisir.mjs` sur une copie du relevé, puis `generer.mjs` sur
cette copie :

```bash
node scripts/webcams/choisir.mjs travail/releve-copie 2026-09-30
node scripts/webcams/generer.mjs travail/releve-copie
```

## Refaire un relevé complet

Chaque étape lit et écrit dans un dossier de travail, `travail/webcams` par
défaut (ignoré par git). Toutes les requêtes se présentent en navigateur
(consigne du 24 septembre 2026), une à la fois.

Les numéros sont ceux qu'annonce l'en-tête de chaque script.

- **1. Stations** : le référentiel, et les caméras que la table donne déjà.
  `node --experimental-strip-types scripts/webcams/stations.ts`
- **2. Skaping** : le plan du site des lecteurs (`sitemap.players.xml`, une
  requête), rapproché des stations par leur nom.
  `node scripts/webcams/skaping.mjs`
- **2 bis. Webcam-HD** : les groupes de caméras (`smr/json/webcam_display_group/`),
  essayés d'après les noms des stations, une requête toutes les 250 ms.
  `node scripts/webcams/webcam-hd.mjs`
- **3. Candidats** : Skaping et Webcam-HD, corrigés à la main (faux
  rapprochements, sites que le nom ne rapproche pas, caméras d'un groupe qui
  regardent une station voisine), plus la table actuelle. Écrit
  `candidats.json` et `urls.txt`.
  `node scripts/webcams/candidats.mjs`
- **4. Banc d'essai** : chaque adresse affichée comme dans l'application
  (`iframe`, mêmes attributs, `referrerpolicy="no-referrer"`), dans un
  Chromium sans fenêtre, avec une capture. Trois bancs au plus à la fois :
  on peut couper `urls.txt` en lots.
  `node scripts/webcams/banc.mjs travail/webcams/captures --lot travail/webcams/urls.txt > travail/webcams/banc.jsonl`
- **5. Planches contact** : les captures, douze par image, à regarder. Ce qui
  est anormal (image noire, page d'accueil, caméra d'une autre station) se
  corrige dans `choisir.mjs` (attribution) ou `generer.mjs` (libellé,
  retrait, station).
  `node scripts/webcams/planches.mjs travail/webcams/banc.jsonl travail/webcams/captures travail/webcams/planches`
- **6. Choix** : écarte ce que le banc a vu bloqué, refusé, en erreur, ou dont
  la dernière image a plus d'un an ; range le reste par intérêt (sommet et
  panorama, puis pistes, puis village, puis le reste), une caméra coupée pour
  l'intersaison derrière celles qui tournent.
  `node scripts/webcams/choisir.mjs travail/webcams AAAA-MM-JJ`
- **7. Table** :
  `node scripts/webcams/generer.mjs travail/webcams src/lib/webcams.data.ts AAAA-MM-JJ`

Pour versionner le nouveau relevé, copier dans `scripts/webcams/releve/`
`stations.json`, `candidats.json`, `banc.jsonl` (chemins de capture réduits à
leur nom) et `choix.json`, et mettre la date dans `releve.json`.

## Lecteur d'une caméra

Le flux reste chez l'exploitant (`src/components/v7/Webcams.tsx`) : un lecteur
dans un `iframe`, une image fixe dans un `img`. Le lecteur se lance à
l'ouverture de la fiche (`loading="eager"`, `allow="autoplay"` ; dans
l'application de bureau, `autoplayPolicy` de `desktop/main.mjs`). Un lecteur
qui ne s'est pas chargé dix secondes après être apparu à l'écran, ou une image
en erreur, laisse place au lien « Ouvrir chez l'exploitant ». L'ancien aperçu
(la dernière image avant le lecteur, `webcamApercu`) a été retiré avec le
lancement automatique.
