---
allowed-tools: Read, Grep, Glob, Bash(git diff:*), Bash(git status:*), Bash(git log:*), Bash(npm run:*)
description: Autocritique adversariale du diff courant, avec ce qui n'a pas été vérifié
---

## Diff à critiquer

!`git diff HEAD`

## Fichiers non suivis, s'il y en a

!`git status --short`

## Ta mission

Relis ce diff comme un reviewer qui cherche à faire échouer la PR — pas comme
son auteur. Tu as écrit ce code : c'est précisément pourquoi cette relecture
demande un effort. Cherche activement à te contredire.

1. **Défauts de correction**, du plus grave au plus léger : sévérité,
   fichier:ligne, extrait à l'appui, impact concret. Seulement ce qui touche la
   correction ou les exigences — le style est hors sujet.

2. **Le meilleur argument contre ton approche.** Pas une réserve de forme :
   une raison concrète pour laquelle elle casse en production, ici, sur cette
   application de bureau Windows avec son sidecar Python et ses sources
   distantes.

3. **Score de confiance de 0 à 100**, et surtout l'explication de l'écart à
   100. « 85 parce que je n'ai jamais exécuté le chemin X » vaut mille fois
   « 85 ».

4. **Les trois listes**, sans en escamoter aucune :
   - (a) ce que tu as vérifié **en exécutant** quelque chose — dis quoi ;
   - (b) ce que tu affirmes par lecture ou par habitude, sans l'avoir exécuté ;
   - (c) les fichiers, écrans et chemins que tu n'as **pas** ouverts.

5. **Les critères d'acceptation** ci-dessous, cochés un par un, avec la raison
   quand ils ne le sont pas. Un critère invérifiable se déclare invérifiable,
   il ne se coche pas : $ARGUMENTS

Ne corrige rien pour l'instant. Liste d'abord, puis attends l'arbitrage.

Si le diff est sain, dis-le en une ligne plutôt que d'inventer des reproches.
