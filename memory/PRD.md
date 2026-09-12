# Skitrack — PRD / journal

## Contexte
Dépôt externe **BalderLeBrave/Skitrack** (comparateur de séjours ski FR).
Stack : React 19 + TanStack Start (SSR) + Nitro + Vite, Better Auth, Neon/PGLite,
scrapers Playwright, wrapper Electron. Cloné et travaillé dans **/app/skitrack**
(branche `feat/claude-assistant`). Je ne peux PAS pousser sur leur GitHub.

## Fait (2026-06)
### Carte des logements façon Airbnb + filtre 5 km (branche feat/lodging-map, base aba6172)
- `src/components/LodgeMap.tsx` : carte Leaflet, pastilles-prix par annonce, épingle station + cercle 5 km, survol/clic synchronisés liste↔carte.
- `logements.tsx` : filtre « aucune annonce > 5 km de la station » (haversine `metresBetween`, annonces sans coords conservées car non mesurables), split liste/carte collante, compteur des masqués.
- Vérifié preview : 21 pastilles, cercle 5 km, « 1 bien masqué : à plus de 5 km » (26/27). Typecheck 0, lint 0. Commit db08c5b · patch `/app/skitrack-lodging-map.patch`.
- **v2 (commit d41e5e9)** : rayon réglable 1–10 km, regroupement des pastilles (clusters qui s'éclatent au zoom), pastille prix total/personne selon le tri, vignette (photo+titre) au survol, filtres sources + altitude min, clic annonce → fiche détail (`LodgeSheet` : lieu, accès ski, distance remontées, altitude modèle, GPX). Vérifié preview. Typecheck 0, lint 0.

### Intégration Claude Sonnet 5 (assistant ski, branche feat/claude-assistant, base 6829894)
- Passerelle LLM Emergent en Node/TS (`src/lib/ai/emergent.server.ts`), endpoint
  OpenAI-compatible `${INTEGRATION_PROXY_URL}/llm/chat/completions`, modèle
  `claude-sonnet-5`, clé `EMERGENT_LLM_KEY`.
- Server function `askSki` multi-tour, modes chat/recommend/summary
  (`src/lib/ai/api.ts`), contexte catalogue stations FR (`context.server.ts`).
- UI `SkiAssistant.tsx` (bouton flottant + panneau + suggestions), montée dans
  `__root.tsx`. Testé : boot OK, panneau OK, erreur clé inactive gérée proprement.
- **Bloqueur** : la clé Universal Emergent est **inactive** → pas de réponse réelle
  tant qu'elle n'est pas activée (Profile → Manage plan → Universal Key → Add Balance).

### Correctifs sécurité (subset des axes d'analyse)
- Clé API Météo-France sortie du code vers `process.env.METEOFRANCE_API_KEY`
  (`bra/secrets.server.ts`). **À révoquer/régénérer** côté Météo-France (elle est
  dans l'historique git).
- Rate-limiting en mémoire (`serverRate.server.ts`) sur `searchStay` (scraping,
  20/min/IP) et `askSki` (IA, 15/min/IP).

Typecheck projet : 0 erreur. ESLint nouveaux fichiers : 0 warning.
Livrable : branche `feat/claude-assistant` + patch `/app/skitrack-claude-assistant.patch`.

## Backlog (axes d'analyse restants — décisions/action requises)
- P0 purge historique git de la clé Météo-France (BFG/filter-repo) — action user.
- P0 aligner cible de déploiement (Vercel serverless vs Playwright/PGLite persistants).
- P1 scraping → pipeline planifié persisté en DB (au lieu d'à-la-requête) ; robots/CGU.
- P1 nettoyage scrapers vendorisés dupliqués : `git rm -r --cached scrape/**/tools scrape/**/vendor`.
- P2 features user (favoris/comparaisons sauvegardées) pour justifier l'auth ; refactor routes lourdes ; lazy-load 3D/carte ; i18n ; CI.
