# Configuration technique

Les réglages techniques ne sont plus dans l'interface. Ils vivent dans le code,
à un seul endroit chacun.

## Où regarder

`src/renderer/src/config/app-config.ts` porte ce qui n'avait pas d'autre
domicile que l'écran Réglages : fournisseur d'itinéraires, service OSRM,
sources de logement coupées. Son en-tête renvoie aux réglages qui vivaient déjà
ailleurs — marge de zone (`src/shared/geo.ts`), centrales autorisées et règle
`robots.txt` (`src/main/providers/station/`) — et qui n'ont pas bougé.

## Clés d'API — cinq lignes

1. Les clés ne sont **jamais** écrites dans un fichier versionné : ni
   `app-config.ts`, ni `.env` commité, ni le référentiel.
2. Au premier lancement, le processus principal lit la variable
   d'environnement (par exemple `ORS_API_KEY`) si elle est posée.
3. Il la chiffre avec `safeStorage` d'Electron et l'écrit dans le stockage
   utilisateur ; la variable d'environnement n'est plus nécessaire ensuite.
4. Si `safeStorage` n'est pas disponible sur la machine, la clé n'est pas
   enregistrée et la source concernée reste inactive — elle n'est pas écrite en
   clair en secours.
5. Pour changer une clé : reposer la variable d'environnement et relancer.

## Ce que l'interface ne montre plus

Sources de données, sources de logement, provenance, moteur local, métriques,
itinéraires, clés d'API — et l'onglet Admin qui les rangeait. La **logique**
est intacte : seuls les écrans qui la pilotaient ont disparu.
