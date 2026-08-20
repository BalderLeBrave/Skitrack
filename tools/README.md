# `tools/` — outils autonomes

Scripts qui vivent à côté de l'application sans en faire partie : ils ne sont
ni empaquetés par `electron-builder`, ni installés par le sidecar, ni exécutés
par `npm run build`. Rien dans `src/` ni dans `sidecar/` ne les importe.

---

## `extract_prix_centrale.py`

Prix **réel** d'une centrale. HTML via **BeautifulSoup**, JSON/JSONP via
`json_parser.py`. Sur Ingénie, ce n'est pas le « à partir de » de la liste :
c'est le TOTAL `#total-prestation-G-…` (ex. `432,47 €`) après Rechercher +
Sélectionner.

    pip install beautifulsoup4
    python tools/extract_prix_centrale.py --self-test
    python tools/extract_prix_centrale.py --from 2027-01-16 --to 2027-01-23 --adults 3 ^
        https://reservation.les2alpes.com/vacanceole-residence-champame-studio-3-personnes-les-2-alpes.html

    python tools/extract_prix_centrale.py --from 2027-01-16 --to 2027-01-23 ^
        https://reservation.alpedhuez.com --limit 5

Familles auto-détectées : `ingenie`, `ublo` (JSON MSEM `/offers`), `opensystem`
(JSONP etape-rest), `ceto` (SERP Orchestra, `article.cpt-result`). `--json`
pour une sortie machine.


## `skitrack_v26.py`

Collecteur multi-sites, écrit à partir de la spécification du 16 août 2026.
**`skitrack_v25.py` n'est pas modifié** : la v26 lui *importe* sa liste
`STATIONS`, pour que les deux fichiers ne puissent pas diverger sur les noms.

    tools/.venv/Scripts/python tools/skitrack_v26.py --check-sources
    tools/.venv/Scripts/python tools/skitrack_v26.py --dry-run --limit 3
    tools/.venv/Scripts/python tools/skitrack_v26.py --stations "Les Deux Alpes" --sites airbnb

### Sources

Cinq généralistes — Airbnb, Booking, CozyCozy, Ski-Planet, Travelski — plus la
centrale de la station quand `STATION_SITE_MAPPING` en connaît une. Ni Expedia,
ni Hotels.com, ni Gîtes de France, ni Skis4free : leur absence est un choix.

### Ce qui marche, vérifié le 16 août 2026

| Source | État |
| --- | --- |
| **airbnb** | ✅ **48 offres** relevées sur Les Deux Alpes (2 pages), prix, URL et nom d'annonce corrects |
| booking | ❌ 0 carte — la page de résultats se charge mais ne rend aucune annonce au navigateur piloté, y compris avec fenêtre visible |
| cozycozy | ❌ 0 carte — l'application ne démarre pas sous pilotage |
| skiplanet | ❌ 403 hors navigateur, chemin de recherche non confirmé |
| travelski | ❌ la recherche vit dans le **fragment** d'URL (`#e=…`), qu'un serveur ne reçoit jamais |
| centrales | ⚠️ les 6 URLs répondent, mais aucune n'a de moteur atteignable par URL construite |

`--check-sources` re-sonde les onze adresses et imprime leur statut réel : c'est
la première commande à lancer quand une source cesse de répondre.

### Corrections apportées à la spécification

Cinq URLs de la spécification ne fonctionnaient pas ; elles ont été remplacées,
et chaque entrée de `SITES` porte la date et le résultat de sa vérification.

| Source | Spécification | Réel |
| --- | --- | --- |
| airbnb | `/s/Les+Deux+Alpes?…` → 404 | `/s/les-deux-alpes/homes?…` (la destination est dans le chemin) |
| cozycozy | `/search?location=` → 404 | `/fr/search?location=` |
| pyrenees | `n-pyrenees.com` → n'existe pas | `n-py.com` |
| jura | `lesrousses.com/reserver/` → 404 | `lesrousses.com/` |
| massif_central | `superbesse.com/reserver/` → redirige | `superbesse.com/` |
| vosges | `lavosgiedesneiges.com` → n'existe pas | `labresse.net` (les trois stations vosgiennes n'ont pas de centrale commune) |

Les sélecteurs d'Airbnb et de Booking ont eux aussi été relevés sur les pages
réelles : `[data-testid="card-container"]` pour Airbnb — `listing-card` de la
spécification n'existe pas — et `[data-testid="property-card"]` pour Booking.

### Sortie

`skitrack_results_complete.csv` (UTF-8 avec BOM, lisible par Excel),
`skitrack_results_complete.json` et `skitrack_top30.csv` (les trente moins
chères, prix illisibles exclus), dans `tools/out/` par défaut (`--out`).

---

## `skitrack_v25.py`

Collecteur multi-sites autonome : 272 entrées de stations (263 libellés
uniques), 14 sites de réservation, quatre workers asyncio, file d'attente
bornée, rotation de proxys, sortie CSV + JSON. Le navigateur est piloté par
**`nodriver`** (`import nodriver as uc`).

**Ce fichier ne doit pas être modifié.** Il fait référence : c'est sa liste
`STATIONS` qui nomme les stations pour tout le projet — voir
« Rapport avec le reste du dépôt » plus bas.

### Installation

L'environnement vit dans `tools/.venv` (Python 3.14.7). Pour le refaire :

    python -m venv tools/.venv
    tools/.venv/Scripts/pip install -r tools/requirements.txt
    tools/.venv/Scripts/python tools/skitrack_v25.py

`nodriver` est borné à la 0.46.x : les 0.48 et 0.50 ne s'importent pas sous
Python ≥ 3.12 (octet latin-1 non déclaré dans `nodriver/cdp/network.py`). Le
détail est dans `requirements.txt`, au-dessus de la ligne concernée.

### État réel : le script ne peut pas encore aboutir

Vérifié le 15 août 2026, dépendances installées. Le script **s'importe** et ses
fonctions pures répondent (`parse_price('1 250 €') == 1250.0`,
`build_search_url` produit bien l'URL Booking attendue). Quatre défauts
l'empêchent en revanche de collecter quoi que ce soit. Ils sont dans le fichier,
qu'on ne touche pas : ils sont donc consignés ici, pas corrigés.

| # | Où | Ce qui se passe |
| --- | --- | --- |
| 1 | `main()`, production de la file | La file est bornée à 100 (`Queue(maxsize=100)`) et les **1 931** tâches sont toutes mises en file *avant* la création des workers. Le 101ᵉ `await queue.put(...)` attend un consommateur qui n'existe pas encore : le script se fige au démarrage, sans message. Produire dans une tâche concurrente — ou démarrer les workers avant la boucle — lève le blocage. |
| 2 | `extract_card_data`, `await card.select(...)` | `nodriver.Element` n'a pas de méthode `select` ; c'est `query_selector`. L'`AttributeError` est avalée par l'`except:` nu de la boucle de sélecteurs, donc `title` et `price` restent `None` et la carte est ignorée en silence. |
| 3 | `extract_card_data`, `await el.text()` et `await link_el.get_attribute("href")` | `Element.text` est une **propriété** (`el.text`, sans parenthèses ni `await`) et `get_attribute` n'existe pas : l'attribut se lit dans `el.attrs` (`el.attrs.get('href')`). Même effet que ci-dessus. |
| 4 | `extract_results`, `tab.select_all(selector, timeout=5000)` | Le `timeout` de nodriver est en **secondes**, pas en millisecondes : chaque sélecteur absent attend 5 000 s (1 h 23) au lieu de 5 s. Trois sélecteurs par site suffisent à immobiliser un worker pour la journée. |

Conséquence : `tools/out/skitrack_results_all_sites_v25.json` contient `[]`, et
`run.log` se termine sur « Aucun résultat collecté ». Ce n'est pas un problème
de sélecteurs CSS ni de blocage anti-bot — l'extraction n'atteint jamais le
DOM.

À noter aussi, sans conséquence tant que le script est lancé en ligne de
commande : `logger` et `SENTINEL` ne sont définis que dans le bloc
`if __name__ == "__main__"`. Le module s'importe (c'est ce que fait le test
d'alignement des noms, qui ne lit que les données), mais `main()` appelé depuis
un autre programme lèverait un `NameError`.

### Ce qui n'a pas été touché, et reste à décider

- **`get_databay_proxies()` renvoie une liste vide** : aucune rotation de proxy
  n'a lieu, les 1 931 requêtes partiraient de la même adresse.
- **Six des URLs de `SITES` n'existent pas.** Sondées le 15 août 2026 :
  `n-pyrenees.com`, `lavosgiedesneiges.com` et `skis4free.com` ne résolvent pas ;
  `lesrousses.com/reserver/` renvoie 404 ; `superbesse.com/reserver/` redirige
  vers l'accueil. Seuls `les2alpes.com/reserver/` et `valberg.com/reserver/`
  mènent bien à une page de réservation. C'est pourquoi l'application ne recopie
  pas cette table mais tient la sienne, vérifiée — voir
  `src/renderer/src/data/stations.ts`.
- **Les sélecteurs CSS** (`.gite-card`, `.skis4free-card`, …) n'ont jamais été
  confrontés aux sites réels.
- **La branche « site de station » de `build_search_url` ignore la station** :
  elle produit la même URL pour les trois stations d'un même massif.

### Rapport avec le reste du dépôt

Le script n'est appelé par personne et n'appelle rien de l'application. Mais sa
liste `STATIONS` est la **référence de nommage** du projet : c'est sous ces
libellés que la collecte range ses résultats (colonne `site`), et c'est donc
sous ces mêmes libellés que l'application interroge les sites de réservation.

L'alignement est tenu côté application, dans
`src/renderer/src/data/stations.ts`, et vérifié par `npm run stations:test` —
qui **lit ce fichier Python** et échoue si les deux listes divergent. 134 des
173 domaines du référentiel livré portent un libellé de `STATIONS` ; les 39
autres (Chamrousse, Les 7 Laux, Sainte-Foy-Tarentaise, Valfréjus, Valmorel,
Val Cenis…) sont absents de `STATIONS`, ce que le test admet nommément.

L'application relève par ailleurs Airbnb par un chemin distinct et indépendant —
`src/main/providers/airbnb/`, piloté depuis le renderer par
`data/runAirbnbSearch.ts`.
