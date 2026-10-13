# Installateur Windows

`SKITRACK-<version>-x64.exe` installe une application complète : rien d'autre
n'est à installer sur le PC, ni Node, ni Python, ni navigateur, ni clé.

## Ce que l'installateur contient

| Élément | D'où il vient | À quoi il sert |
|---|---|---|
| Electron 44 (Chromium 152, Node 24.21) | `node_modules/electron` | La fenêtre, et le Node qui fait tourner le serveur (`ELECTRON_RUN_AS_NODE`) |
| Le serveur Nitro et l'interface | `.output/` (`vite build`, préréglage `node-server`) | Toute l'application, sur `http://127.0.0.1:4731` |
| Python 3.13 « embeddable » + curl_cffi, beautifulsoup4, requests | `build/python/` (`scripts/preparer-python-embarque.mjs`) | Les workers Airbnb, Booking et HomeToGo |
| Les workers | `scrape/airbnb`, `scrape/booking`, `scrape/hometogo` | Relevés directs |
| Chromium headless shell, révision du playwright-core tracé | `build/ms-playwright/` (`scripts/preparer-navigateur.mjs`) | CozyCozy (Abritel, Booking, part Cozy d'Airbnb), Gîtes de France, replis Booking et HomeToGo |
| Les tuiles de la carte des pistes (135 Mo) | `build/carte/` (docs/TUILES-OPENSKIMAP.md) | Carte des pistes, servie par tranches (`server/middleware/pmtiles-plages.ts`) |
| electron-updater et ses dépendances | `node_modules`, seuls modules admis dans `app.asar` (`scripts/modules-desktop.mjs`) | Les mises à jour automatiques |

Au lancement, `desktop/main.mjs` donne au serveur : le Python embarqué
(`SKITRACK_PYTHON`), le navigateur embarqué (`PLAYWRIGHT_BROWSERS_PATH`), les
certificats racines de Windows (`NODE_USE_SYSTEM_CA`, et pour Python un
magasin au chemin ASCII, `SSL_CERT_FILE`), le proxy du système s'il y en a
un, et un jeton d'instance que la fenêtre vérifie avant d'afficher le serveur.

## Fabriquer l'installateur

Sur un PC Windows x64, depuis un clone du dépôt :

- Node 24 (22.12 au minimum), Git ;
- Python 3 avec le lanceur `py` (pour `pip`, au moment de la fabrication
  seulement) ;
- le réseau vers python.org, PyPI, le CDN de Playwright et GitHub (Electron) ;
- environ 4 Go libres ; 16 Go de RAM si les tuiles sont à refaire.

```bash
npm ci
# Les tuiles, si build/carte/openskimap-europe.pmtiles manque et que
# public/carte n'en a pas (sinon release-win les copie) : voir
# docs/TUILES-OPENSKIMAP.md, « Installateur Windows ».
npm run release:win
```

`release:win` enchaîne `preparer-python-embarque.mjs`,
`preparer-navigateur.mjs` puis `release-win.mjs`. Ce dernier refuse
d'empaqueter s'il manque quoi que ce soit (serveur en préréglage node-server,
Python, navigateur à la bonne révision, workers, tuiles), puis revérifie le
contenu de `release/win-unpacked` ; un installateur qui échoue à ces
contrôles est renommé en `.exe.REFUSE`. `npm run dist:win` y mène aussi.

Le résultat : `release/SKITRACK-<version>-x64.exe`. Monter la version dans
`package.json` avant chaque installateur diffusé.

## Recette avant diffusion

Sur un PC (ou une session Windows) qui n'a jamais vu le dépôt, idéalement sous
un nom d'utilisateur accentué :

1. Installer, lancer : la carte des pistes montre des pistes.
2. Logements d'une station : Airbnb, Booking, Abritel (Cozy), Gîtes de France
   et HomeToGo rendent des résultats ou un motif lisible.
3. `%APPDATA%\skitrack\serveur.log` : pas d'erreur de démarrage.
4. Quitter : plus aucun `SKITRACK.exe`, `python.exe` ni
   `chrome-headless-shell.exe` dans le Gestionnaire des tâches.

## Ce que verra la personne qui installe

- **SmartScreen.** L'installateur n'est pas signé : Windows affiche « Windows a
  protégé votre ordinateur ». Cliquer sur « Informations complémentaires »,
  puis « Exécuter quand même ». Avec **Smart App Control** actif (Windows 11),
  un programme non signé est bloqué sans recours, et Windows 11 en **mode S**
  n'exécute aucun installateur hors Microsoft Store : seule une signature de
  code (certificat à acheter, `win.signtoolOptions` d'electron-builder) lève
  ces deux blocages.
- **Installation.** Par défaut pour l'utilisateur courant, dans
  `%LOCALAPPDATA%\Programs\SKITRACK`, sans droits d'administrateur. Garder ce
  dossier, ou un dossier de moins de 100 caractères : l'installateur saute en
  silence tout fichier dont le chemin dépasse 260 caractères, et le plus long
  de l'application en fait 149 (`release-win.mjs` refuse au-delà de 150).
- **Données.** Clés saisies (Plus › Clés), mémoire des fiches et journal du
  serveur dans `%APPDATA%\skitrack` ; comparateur, notes et préférences dans le
  stockage de la fenêtre. Une réinstallation ou une mise à jour les garde.
- **Port.** L'application écoute sur `127.0.0.1:4731`. Si le port est pris
  (SKITRACK ouvert dans une autre session Windows, un autre logiciel), elle le
  dit au lieu de démarrer.
- **Mises à jour.** Automatiques, voir plus bas : rien à faire.

## Mises à jour automatiques

L'application installée cherche une nouvelle version au démarrage puis toutes
les quatre heures, dans les Releases GitHub du dépôt (`publish`
d'electron-builder.yml, `electron-updater` dans `desktop/main.mjs`). Elle la
télécharge en arrière-plan (seuls les blocs qui changent, d'après le
`.blockmap` de la version installée), vérifie son empreinte SHA-512, puis :

- l'installe sans rien demander à la fermeture de SKITRACK ;
- propose aussi « Redémarrer maintenant » dès qu'elle est prête.

Les données restent (`%APPDATA%\skitrack`, stockage de la fenêtre). Hors
ligne, rien ne s'affiche ; tout est noté dans
`%APPDATA%\skitrack\mises-a-jour.log`.

### Publier une version

1. Monter `version` dans `package.json` (1.2.0 → 1.2.1), commiter, pousser.
2. `npm run release:win`.
3. `npm run release:publier` : crée la Release `v<version>` sur GitHub avec
   `latest.yml`, l'installateur et son `.blockmap`. Demande `gh` connecté
   (`gh auth login`) au compte qui peut publier sur le dépôt.

Ne pas supprimer les Releases précédentes : leur `.blockmap` sert de base au
téléchargement différentiel. Le dépôt étant public, les Releases (donc
l'installateur) sont téléchargeables par tous, sans compte.

### Recette des mises à jour, sans rien publier

`SKITRACK_MAJ_URL` (seulement `http://127.0.0.1:<port>/`) fait lire les
versions à un serveur local au lieu de GitHub : installer la version N, servir
le dossier qui contient `latest.yml`, l'installateur et le `.blockmap` de la
version N+1 (plus le `.blockmap` de N), lancer SKITRACK avec la variable,
attendre « Update has been downloaded » dans `mises-a-jour.log`, fermer :
la version N+1 s'installe et se trouve au même endroit.
