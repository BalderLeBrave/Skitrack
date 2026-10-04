# SKITRACK — PRD (agent memory)

## Problème d'origine
« Analyse mon application permettant de rechercher des stations et des logements à partir du choix effectué et dis-moi ce qui pourrait être amélioré pour l'expérience utilisateur »
Choix : rapport UX priorisé + implémentation ; priorités parcours station→logements et lisibilité ; cible grand public/vacanciers.

## Architecture
- TanStack Start + Vite 8 + React 19 (Electron desktop + PWA), PGLite, server functions dans Vite. Node 22 requis (installé dans /root/node22).
- Aperçu Emergent : /app/frontend/package.json = shim qui lance `vite dev --port 3000` depuis /app (pas de backend 8001).
- Zones verrouillées par CLAUDE.md : src/lib/scrape/, scrape/, robots, public/stations/, hero/og, photos skiinfo.

## Fait (2026-10-04)
- Logements : résultats progressifs pendant le relevé (cartes + squelettes, « N logements, recherche en cours… »).
- Carte logement : pastille « X m sous le village », titres lisibles, trous non dupliqués.
- Fiche station : bande de séjour opaque, encadré collant décalé ; libellés Pistes station/domaine.
- Comparer : départage par altitude du village à km égaux.
- Rapport : /app/docs/audit-ux-parcours.md. Tests : /app/test_reports/iteration_1.json (7/7).

## Backlog
- P0 : responsive mobile ; tri/filtre « dans la station d'abord ».
- P1 : séjour par défaut grand public ; navigation dédoublée ; bloc collant compact ; jargon ; bouton Comparer.
- P2 : carte Comparer en français ; regroupement d'épingles ; langue persistée.

## Fait (2026-10-04, lot 2)
- Responsive ≤760 px (v7.css fin de fichier ; `.v7.app` min-width levé).
- Tri Logements « dans la station d'abord » par défaut ; coût/pers. avec forfaits sur les cartes.
- Séjour par défaut : 2 voyageurs, prochaines vacances scolaires de ski (`sejourParDefaut` dans stay.ts).
- Lecteur de grilles : PDF bilingues, en-têtes multi-lignes, bandeau de périmètre, dates après tarifs ; tests ajoutés.
- Relevé : grilles contredites >50 % par un témoin mises de côté ; `grillesOfficielles.json` généré (51 grilles, 81 périodes).
- Tests : /app/test_reports/iteration_2.json ; débordement de la fiche mobile corrigé ensuite.
- Échec préexistant sans rapport : src/lib/prix/releve.test.ts.

## Backlog relevé forfaits
- Pages refusées ou à rendre au navigateur (Playwright absent ici), PDF en colonnes (Orelle), pages en anglais, grilles en image.
