# Extraction capacité + GPS — Airbnb et Booking

Outil autonome. Pour une liste d'URL de logements, il extrait la **capacité
d'accueil** et les **coordonnées**, avec la provenance de chaque valeur et une
qualification de la précision. Il ne devine rien : une donnée absente sort à
`null` avec un code de raison.

## Installation

L'environnement est déjà en place dans `.venv` (Playwright + Chromium).

```bash
cd tools/extract-listings
./.venv/Scripts/python.exe extract.py --help
```

Pour repartir de zéro :

```bash
python -m venv .venv && ./.venv/Scripts/python.exe -m pip install playwright && ./.venv/Scripts/python.exe -m playwright install chromium
```

## Utilisation

Reconnaissance d'une fiche — à faire **avant** de croire un chemin JSON :

```bash
./.venv/Scripts/python.exe discover.py --url https://www.booking.com/hotel/fr/le-valfrejus.fr.html
```

Extraction d'un lot :

```bash
./.venv/Scripts/python.exe extract.py --input urls.txt --out ./out
```

Modes hors ligne, quand le site refuse la visite automatisée :

```bash
./.venv/Scripts/python.exe extract.py --from-har dump.har --platform airbnb --url https://www.airbnb.fr/rooms/40088811
./.venv/Scripts/python.exe extract.py --from-html page.html --platform booking --url https://www.booking.com/hotel/fr/le-valfrejus.fr.html
```

Pour Airbnb, **le HAR est le seul mode hors ligne utile** : la fiche ne porte
plus ses données dans le HTML, tout arrive par `/api/v3/StaysPdpSections`. Un
HTML enregistré ne contient pas la capacité ; un HAR, oui.

## Sorties

- `out/listings.jsonl` — une ligne par annonce, schéma de `schema.py`
- `out/listings.csv` — mêmes champs, listes sérialisées en JSON
- `out/diagnostics/<plateforme>_<id>/` — `page.html`, `screenshot.png`,
  `blobs.json`, `network.json`, `discovery.md`

Les diagnostics sont écrits **même en cas d'échec**. C'est précisément là qu'ils
servent : quand un chemin disparaît, on relit le dump au lieu de relancer une
session en espérant retomber sur le cas.

## Ce que l'outil respecte

- **`robots.txt` est appliqué**, pas consulté pour la forme. `robots.py` rend un
  verdict avant toute requête, et un refus arrête la fiche.
  Mesuré le 2026-08-30 : `airbnb.fr/rooms/<id>` est **autorisé**,
  `airbnb.fr/rooms/<id>/location` est **interdit**. L'outil ne va donc jamais
  chercher la sous-page « location » — c'est une consigne explicite sur la
  donnée même qu'il cherche.
- **Rythme bas** : 8 à 15 secondes entre deux fiches, tirées au hasard.
- **Arrêt au premier refus** : 403, 429 ou page de challenge terminent la fiche
  sur `blocked`. Aucune rotation d'identité, aucun contournement de captcha.
- **Consentement** : le bouton de **refus** est cliqué en priorité. On ne
  consent pas à un pistage au nom de l'utilisateur pour lire une page publique.
- **Aucune adresse déduite.** L'outil ne géocode pas et ne fait pas de
  géocodage inverse. Il rapporte ce que la fiche publie.

## Limites connues

- **Airbnb ne publie pas de position exacte** avant réservation. Le point
  extrait sert de centre à une zone et peut s'écarter du logement d'une
  centaine de mètres. `gps_precision` vaut donc `approximate_public`, jamais
  `exact_public`. Le nombre de décimales ne borne pas cet écart — mesuré sur
  deux fiches, 4 puis 5 décimales pour la même qualité de position.
- **Un hôtel Booking n'a pas de capacité.** `guest_capacity_max` sort à `null`
  et `room_types[]` porte la capacité de chaque type de chambre. Les additionner
  donnerait un nombre que Booking n'affiche nulle part.
- Les chemins JSON de ces pages bougent. Quand la liste connue échoue, une
  recherche récursive prend le relais et le résultat porte
  `JSON_SCHEMA_CHANGED` : la valeur reste utilisable, mais elle signale qu'il
  faut relancer `discover.py`.
