# Architecture

## Vue d'ensemble

```
┌──────────────────────── Electron (Node) ────────────────────────┐
│                                                                 │
│  main/index.ts        fenêtre, IPC, politique de navigation     │
│  main/sidecar.ts      spawn du process Python, handshake stdout │
│  main/secrets.ts      coffre DPAPI (safeStorage)                │
│         │                                                       │
│         │ contextBridge (surface fermée, contextIsolation: on)  │
│         ▼                                                       │
│  renderer/  React 18 + MapLibre + TanStack Query                │
│         │                                                       │
└─────────┼───────────────────────────────────────────────────────┘
          │ HTTP sur 127.0.0.1:<port éphémère>
          │ en-tête X-Skitrack-Token
┌─────────▼───────────── Sidecar Python ──────────────────────────┐
│                                                                 │
│  __main__.py    réserve la socket, annonce le port, lance uvicorn│
│  app.py         FastAPI + middleware token                      │
│  api/routes/    health · domains · geo · referential · settings │
│  services/      http+cache · elevation · geocoding · routing    │
│                 scoring · massif · jobs · secrets · geo_math    │
│  ingest/        openskimap · curated · glaciers                 │
│  providers/     BaseProvider · registry · deeplinks             │
│  models/        SQLAlchemy ──────► SQLite (WAL)                 │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼  APIs externes, toutes derrière services/http.py
   IGN RGE ALTI · OpenTopoData · BAN · Nominatim
   OpenRouteService / OSRM / Google · Overpass · OpenSkiMap
```

---

## Handshake Electron ↔ Python

Le problème classique : « je teste que le port 8000 est libre, puis je le donne à un enfant qui le
prend 200 ms plus tard » — entre-temps, un autre processus a pu s'en emparer.

Séquence retenue :

1. Electron génère un **token de session** (32 octets aléatoires, `randomBytes`).
2. Il lance
   `python -m skitrack --host 127.0.0.1 --port 0 --token-stdin --data-dir <userData>`,
   puis écrit le token suivi d'un saut de ligne sur **stdin** de l'enfant.

   > Le token ne passe **ni par argv ni par l'environnement**. Sous Windows,
   > `Get-CimInstance Win32_Process` expose la ligne de commande de tout processus de la session
   > à n'importe quelle application, sans élévation — vérifié sur cette machine. Un token en
   > argument serait donc lisible par le premier programme venu, ce qui viderait
   > l'authentification de son sens. `--token <hex>` reste accepté pour le développement.

3. Le sidecar **réserve lui-même une socket** sur le port 0 (l'OS en choisit un libre), puis écrit
   **une ligne JSON sur stdout** :
   ```json
   {"event":"ready","host":"127.0.0.1","port":56985,"pid":24676,"version":"0.1.0"}
   ```
4. Uvicorn reçoit **cette socket déjà liée** (`server.run(sockets=[sock])`). Il n'y a donc aucune
   fenêtre de course entre l'annonce du port et sa mise en écoute.
5. Electron lit la ligne, cesse de scruter stdout et parle en HTTP.

`stdout` est **réservé au handshake** ; tous les logs partent sur `stderr`, remontés à l'UI.
`PYTHONUNBUFFERED=1` évite que la ligne de handshake reste bloquée dans le tampon.

### Diagnostic des échecs de démarrage

`Sidecar.diagnose()` traduit les motifs de `stderr` les plus fréquents en conseil actionnable
plutôt qu'en trace brute :

| Motif détecté | Message affiché |
|---|---|
| `No module named skitrack` | « Lancez `npm run bootstrap` » |
| `No module named fastapi\|uvicorn\|…` | « Des dépendances Python manquent » |
| `Microsoft Store` / `introuvable` | « L'alias Python du Store a été appelé. Installez Python 3.11+ depuis python.org » |
| `WinError 10013` / `Accès refusé` | « Le pare-feu bloque l'écoute sur 127.0.0.1 » |

### Arrêt : tuer l'arborescence, pas seulement l'enfant

Sous Windows, `sidecar\.venv\Scripts\python.exe` est un **lanceur** qui ré-exécute l'interpréteur
de base dans un processus enfant — constaté sur cette machine : deux PID distincts, et c'est le
*petit-fils* qui tient réellement la socket et la base. `child.kill()` ne toucherait que le
lanceur et laisserait un sidecar orphelin conservant le port et le verrou SQLite. `Sidecar.stop()`
utilise donc `taskkill /T /F` sur l'arborescence complète (et `process.kill(-pid)` ailleurs).

### Pile de middlewares et CORS

```
ServerErrorMiddleware (Starlette, hors de notre contrôle)
  └─ CORSMiddleware
       └─ TokenAuthMiddleware
            └─ ErrorEnvelopeMiddleware
                 └─ ExceptionMiddleware → routes
```

Le renderer est **cross-origin** par rapport au sidecar : `http://localhost:5173` en
développement, `file://` (origine `null`) une fois empaqueté, contre `http://127.0.0.1:<port>`.
Sans CORS, l'en-tête `X-Skitrack-Token` déclenche une requête préliminaire `OPTIONS` que le
navigateur rejette, et **toute** l'interface échoue sur « TypeError: Failed to fetch ».

`ErrorEnvelopeMiddleware` est placé **sous** CORS pour une raison précise : Starlette installe un
`@app.exception_handler(Exception)` sur `ServerErrorMiddleware`, le plus externe — sa réponse ne
traverse jamais CORS. Une erreur 500 arrivait donc au navigateur sans en-tête
`Access-Control-Allow-Origin` et se présentait comme une panne réseau, rendant tout bug serveur
indiagnosticable depuis l'UI. Les deux comportements sont verrouillés par des tests.

---

## Sécurité

### Pourquoi un token alors que le service n'écoute que sur 127.0.0.1

Sous Windows, **tout processus de la session peut joindre un port local**. Sans authentification,
n'importe quelle application installée pourrait lire la base, déclencher des imports ou faire
consommer les quotas d'API. Le token est comparé en **temps constant** (`hmac.compare_digest`),
transmis par stdin (jamais par argv ni par l'environnement) et n'est jamais journalisé.

Seuls `/api/health` et les routes de documentation sont publics : `/api/health` est la sonde du
handshake et doit répondre même si SQLite est verrouillé.

### Clés d'API

```
Utilisateur → renderer → IPC → main/secrets.ts
                                    │ safeStorage.encryptString (DPAPI)
                                    ▼
                          %APPDATA%\SKITRACK\secrets.enc.json
                                    │ decryptAll()
                                    ▼
                    POST /api/settings/secrets  →  coffre EN MÉMOIRE du sidecar
```

- Le chiffrement DPAPI est lié au **compte Windows** : le fichier copié ailleurs est illisible.
- Le renderer ne reçoit **jamais** une valeur de clé — `listSecrets()` ne renvoie que des booléens
  de présence.
- Le sidecar ne les écrit ni en base ni en log. Il est tué, elles disparaissent.
- Si `safeStorage` n'est pas disponible, l'enregistrement est **refusé explicitement** plutôt que
  de basculer en clair sans le dire.

### Durcissement du renderer

| Mesure | Détail |
|---|---|
| `contextIsolation: true`, `nodeIntegration: false` | Le renderer affiche des données tierces (descriptifs, photos) : aucun accès direct à Node. |
| Surface de preload fermée | Pas d'`ipcRenderer` brut, pas de `fs`, pas d'`exec`. Uniquement ce qui est listé dans `src/preload/index.ts`. |
| CSP stricte | `script-src 'self'` ; `connect-src` limité au sidecar local et aux tuiles. |
| `setWindowOpenHandler` + `will-navigate` | Toute navigation hors app part dans le navigateur système. C'est le comportement voulu pour les deep-links, et ça évite qu'une page tierce s'exécute dans une fenêtre disposant du preload. |
| `openExternal` filtré | `http(s)` uniquement — pas de `file:`, pas de `javascript:`. |
| Instance unique | Deux sidecars sur la même base finiraient par se marcher dessus malgré le WAL. |

> **`sandbox: false`** est nécessaire pour un preload ESM (le projet est en `"type": "module"`,
> electron-vite émet `index.mjs`). Le risque est contenu par `contextIsolation` et par l'absence
> totale d'API Node exposée.

---

## Cache et quotas

Tous les appels sortants passent par `services/http.py`. C'est le **seul** endroit qui décide
d'attendre, de réessayer ou de servir depuis le cache — ce qui rend le respect des quotas
vérifiable en un point unique.

| Élément | Comportement |
|---|---|
| Rate-limit | Par hôte, `min_interval_s` (IGN 0,25 s · OpenTopoData 1,05 s · Nominatim 1,05 s · ORS 1,6 s). |
| Retry | Exponentiel sur erreurs réseau et 5xx. |
| 429 | Respecte `Retry-After` ; sur la dernière tentative, remonte une `RateLimitError` → **HTTP 429 avec message lisible**, pas une erreur silencieuse. |
| Cache | Table `http_cache`, clé = `sha256(méthode, url, corps)`, TTL **par famille** : altitude 1 an, itinéraire 30 j, géocodage 180 j, météo 3 h, offre 6 h. |
| Purge | Sélective par `namespace` — purger les altitudes n'a aucun intérêt et coûterait des milliers d'appels. |

### Stratégie de quota pour les itinéraires

1. **Pré-filtre à vol d'oiseau** (`max_crow_km`, gratuit) avant tout appel réseau.
2. Réutilisation : un couple (origine, domaine, profil) déjà calculé n'est pas recalculé.
3. Découpage en lots à la taille max du provider (ORS 500, OSRM 95, Google 100).
4. **En cas de 429 à mi-parcours, le job conserve ce qui a été calculé** et renvoie
   `stopped_early` + la raison, au lieu d'annuler 200 trajets réussis.

---

## Tâches longues

L'import du référentiel (130 Mo + parsing) et le pré-calcul de ~280 itinéraires dépassent le
timeout d'une requête HTTP. Ils tournent en `asyncio.Task` avec un registre en mémoire
(`services/jobs.py`) ; l'UI interroge `GET /api/jobs/{id}` toutes les secondes.

Registre **en mémoire volontairement** : un job perdu au redémarrage du sidecar n'a aucune
conséquence, tout est idempotent — il suffit de relancer.

---

## Import du référentiel

```
download_dump()  ──► cache 24 h, reprise possible depuis un fichier local (--file)
      │
iter_features()  ──► ijson en flux : lifts.geojson pèse 107 Mo, runs.geojson
      │                plusieurs centaines. Jamais chargé en mémoire.
map_ski_area()   ──► fonction pure, testable sans réseau ni base
      │
import_ski_areas() ► upsert idempotent sur (source, source_id)
      │                les champs curatés ne sont jamais écrasés
import_lifts()     ► rattachement via skiAreas[].properties.id
      │                altitude lue dans la 3ᵉ composante des coordonnées
      │                → altitude_village_m = gare aval la plus basse
detect_glaciers()  ► UNE requête Overpass par pays, puis intersection shapely
      │
apply_curated()    ► le YAML gagne toujours, et marque le domaine `curated`
```

Mesuré le 2026-08-11 sur la France : 12 209 domaines lus → **277 créés**, 33 116 remontées lues →
**3 052 importées** sur 232 domaines, 6 entrées curatées appliquées.

---

## Providers

Deux hiérarchies distinctes, avec la même philosophie : **les capacités sont déclarées**, pas
supposées.

### Routage — `services/routing.py`

`ProviderCapabilities(isochrones, avoid_tolls_route, avoid_tolls_matrix, max_matrix_destinations)`.

L'UI lit ces capacités : demander une isochrone à OSRM renvoie un message clair
(« basculez sur OpenRouteService ») au lieu d'un 500. Et comme `/v2/matrix` d'ORS n'accepte pas
l'évitement des péages, le job de pré-calcul renvoie une note explicite que l'UI affiche.

### Logement — `providers/base.py`

Aucune implémentation en phase 1, **et ce n'est pas un oubli** : Booking Demand et Expedia Rapid
exigent un compte partenaire validé. Écrire un connecteur contre une documentation qu'on n'a pas
pu exécuter produirait du code plausible et faux.

L'interface est posée maintenant pour que le reste (normalisation, cache, comparateur) soit écrit
contre elle. Trois règles imposées à toute implémentation future :

1. `search()` ne lève **jamais** pour clé manquante — elle renvoie `([], [])` et `is_configured()`
   vaut `False`. Une source non configurée ne casse pas la recherche des autres.
2. Tous les appels réseau passent par `services.http` — jamais `httpx` directement.
3. `normalize()` est **pure** : testable sur une charge utile figée, sans réseau.

`providers/registry.py` expose l'état de chaque source à l'UI, y compris
« connecteur non implémenté (phase 3/4) ».

---

## Score de pertinence

Normalisation **relative au jeu de résultats courant**, puis pondération. C'est un choix
délibéré : « 1 800 m de bas de pistes » n'a pas la même valeur dans une liste pyrénéenne que dans
une liste savoyarde, et un score absolu écraserait tout le classement pyrénéen vers zéro.

Deux propriétés qui font la différence à l'usage :

- **Une valeur absente ne pénalise pas.** Son poids est retiré du dénominateur de cette ligne
  seulement. Sinon, un domaine sans temps de trajet calculé — parce que hors du pré-filtre à vol
  d'oiseau — tomberait en queue de liste pour une raison qui n'est pas la sienne.
  `_weight_covered` dit à l'utilisateur quelle part des critères a réellement joué.
- **Des valeurs toutes égales sont neutralisées à 0,5** plutôt que ramenées à 1,0, ce qui
  gonflerait artificiellement tous les scores.

Le détail complet est renvoyé avec chaque résultat (`score_breakdown`) et affiché à la demande :
un classement qu'on ne peut pas auditer ne sert à rien.

---

## Types partagés

```
schémas Pydantic ──► FastAPI openapi() ──► openapi.json ──► openapi-typescript
                                                                    │
                                                                    ▼
                                              src/renderer/src/api/types.gen.ts
```

`npm run gen:types` n'a **pas besoin de démarrer un serveur** : `skitrack.tools.dump_openapi`
sérialise le schéma directement, ce qui rend la génération utilisable en CI.

`types.ts` est un miroir écrit à la main, utilisé par l'application ; en cas de divergence, le
fichier généré fait foi.

---

## Migrations

Pas d'Alembic en phase 1 : `create_all` suffit tant que rien n'a été livré à un utilisateur.
`SCHEMA_VERSION` est stockée dans `app_setting` et sert de point de départ aux migrations dès le
premier build distribué. Le schéma des phases 2 à 4 est **déjà créé** pour éviter une migration en
milieu de projet.

---

## Empaquetage

`electron-builder` copie `sidecar/` en `extraResources` — hors asar, car Python doit voir de vrais
fichiers sur disque. `src/main/python.ts` cherche l'interpréteur dans cet ordre :

1. `SKITRACK_PYTHON` (échappatoire explicite)
2. `sidecar/.venv/Scripts/python.exe` (développement)
3. `sidecar/skitrack-sidecar.exe` (binaire gelé PyInstaller)
4. `python` du PATH — avec avertissement, car c'est souvent l'alias Microsoft Store

⚠️ L'installeur livré **n'embarque pas d'interpréteur**. Pour une distribution autonome, geler le
sidecar avec PyInstaller avant `electron-builder` : la commande est en commentaire dans
`electron-builder.yml`, et le cas 3 ci-dessus la détecte automatiquement.
