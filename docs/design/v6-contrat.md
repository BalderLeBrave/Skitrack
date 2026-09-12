# Contrat d'interface — maquette v6

Ce contrat vaut **uniquement** pour la version de la maquette identifiée
ci-dessous. Tout changement de l'un de ces deux hashes invalide le contrat :
il doit être relu et réémis.

| Fichier | `git hash-object` |
| --- | --- |
| `design/v6/SKITRACK - App v6 (parcours complet).html` | `c9d9775640408a5348a8579c91de07cabb768511` |
| `design/v6/image-slot.js` | `e30189ba5b84fb5b9578f15081b5ce6ccf393ce4` |

Sources autorisées : ces deux fichiers du dépôt, et eux seuls. Pas de MCP
`claude_design` (transport cassé : 403, portées manquantes), pas de zip hors
dépôt, pas de reconstitution de mémoire.

Le dossier `design/v6/` contient d'autres fichiers (`deck-stage.js`,
`support.js`, `github.md`, `skitrack-referentiel.json`,
`skitrack-annonces.json`, sous-dossiers `src/`, `export/`, `screenshots/`,
`uploads/`, `design_handoff_skitrack/`, `bra-connector/`). Ils ne sont pas
sources du contrat. Deux d'entre eux sont des **dépendances d'exécution** de
la maquette, chargées par le HTML lui-même, et sont relevés en § 6 avec leur
hash pour que la phase 3 les serve à l'identique :

| Dépendance d'exécution | `git hash-object` |
| --- | --- |
| `design/v6/stations-map-data.json` | `432053a68cc83a31817877a7b591551909b40ea0` |
| `design/v6/.image-slots.state.json` | `943c7dede87b20650a3353af43e01b878be12752` |

Toutes les références de ligne ci-dessous renvoient au HTML.

---

## 0. Structure du document (balises de premier niveau)

756 lignes. Colonne 0 :

- `<!DOCTYPE html>` → `<html lang="fr">`
- `<head>` (l. 3–194) : `meta` charset + viewport, `title`, `link` preconnect
  Google Fonts, `link` Plus Jakarta Sans, `link` Leaflet 1.9.4 CSS (SRI),
  `script` Leaflet 1.9.4 JS (SRI), `script src="image-slot.js"`,
  `style` (l. 12–193)
- `<body>` (l. 195–755) :
  - `div.app` (l. 196–453) — la totalité de l'écran
  - `div.toast#toast` (l. 454)
  - `script` (l. 456–754) — l'état et le parcours

`div.app` n'a que deux enfants directs : `header.nav` (l. 197–215) et
`main` (l. 217–452).

---

## 1. Bloc `:root`, recopié intégralement

Ligne 13 du HTML. Dix-huit variables, dans l'ordre du source.

| Variable | Valeur |
| --- | --- |
| `--bg` | `#f7fbfe` |
| `--glacier` | `#e8f3fa` |
| `--ink` | `#0b1f33` |
| `--cta` | `#ff5a3c` |
| `--texte-2` | `#63717d` |
| `--texte-3` | `#768593` |
| `--bordure` | `#c9d3dc` |
| `--bordure-douce` | `#e9eef2` |
| `--marque` | `#0b6fc2` |
| `--marque-tenue` | `#eef6fd` |
| `--marque-texte` | `#0959a0` |
| `--neige` | `#bfe0f7` |
| `--neige-texte` | `#133f63` |
| `--ok` | `#d3efe3` |
| `--ok-texte` | `#0a6b4a` |
| `--mono` | `inherit` |
| `--side` | `440px` |
| `--shadow` | `0 1px 2px rgba(17,24,32,.04),0 4px 12px rgba(17,24,32,.07)` |

Source littéral :

```css
:root { --bg:#f7fbfe; --glacier:#e8f3fa; --ink:#0b1f33; --cta:#ff5a3c; --texte-2:#63717d; --texte-3:#768593; --bordure:#c9d3dc; --bordure-douce:#e9eef2; --marque:#0b6fc2; --marque-tenue:#eef6fd; --marque-texte:#0959a0; --neige:#bfe0f7; --neige-texte:#133f63; --ok:#d3efe3; --ok-texte:#0a6b4a; --mono:inherit; --side:440px; --shadow:0 1px 2px rgba(17,24,32,.04),0 4px 12px rgba(17,24,32,.07); }
```

Deux remarques factuelles, sans correction :

- `--mono: inherit`. Les classes qui s'en servent (`.rel`, `.stepper b`) ne
  passent donc **pas** en chasse fixe : elles restent en Plus Jakarta Sans.
  `.rel` obtient son alignement de chiffres par `font-variant-numeric:
  tabular-nums`, pas par une police mono.
- `--side` est lu et réécrit à l'exécution sur `#split` (poignée de
  redimensionnement), pas sur `:root`.

### 1 bis. Valeurs brutes de la maquette sans jeton `:root`

Elles existent dans le HTML hors du bloc `:root` et devront devenir des jetons
en phase 2 (règle 3), sans être codées en dur dans les composants. Inventaire
complet :

| Valeur | Usage dans la maquette |
| --- | --- |
| `#fff` | fond des cartes, `.chip`, `.btn--ghost`, `.jl--on`, `.seg span.on`, texte sur fond sombre |
| `rgba(255,255,255,.94)` | fond `.nav` |
| `rgba(255,255,255,.96)` | fond `.foot` |
| `rgba(247,251,254,.97)` | fond `.cmpp` |
| `rgba(255,255,255,.82)` | fond `.sbar` |
| `#2e9e5b` | pistes vertes |
| `#0b6fc2` | pistes bleues (identique à `--marque`) |
| `#d9382e` | pistes rouges |
| `#1b2530` | pistes noires |
| `#9bd2f5` | `em` dans le titre du hero |
| `#fdf1e2` / `#92400e` | `.tag--warn` fond / texte |
| `#d6e8f3` | `.jl--locked .step` fond |
| `#e9eef2` | fond `.mapcol` et `.leaflet-container` (identique à `--bordure-douce`) |
| `#0959a0` | `.pin.cmp` (identique à `--marque-texte`) |
| `#b3261e` | texte `.err` de `image-slot` |
| `#c96442` | anneau de survol / poignées de `image-slot` |
| `#f2f1ef` / `#6e6c66` | tuile d'erreur d'attribution de `image-slot` |
| `linear-gradient(180deg,#1f4f86 0%,#4a8ac4 30%,#9cc6e6 58%,#e6f0f7 100%)` | `.hero__bg` |
| `linear-gradient(180deg,rgba(11,31,51,.42) 0%,rgba(11,31,51,.16) 45%,rgba(11,31,51,.62) 100%)` | `.hero__veil` |
| `linear-gradient(180deg,rgba(11,31,51,.05) 30%,rgba(11,31,51,.78) 100%)` | `.fhero__veil` |
| `rgba(11,31,51,.3)` / `.32` / `.45` | badge du hero, `.hchips .chip`, ombre du titre |
| `rgba(255,255,255,.88)` / `.85` / `.3` / `.9` | textes et bordures sur fond sombre |
| `0 2px 6px rgba(17,24,32,.10),0 10px 24px rgba(17,24,32,.14)` | ombre haute (`.pop`, `.sugg`, `.lbl`) |
| `0 1px 2px rgba(17,24,32,.08)` | ombre `.seg span.on` |
| `inset 0 1px 0 rgba(255,255,255,.9),0 18px 40px rgba(11,31,51,.28)` | ombre `.sbar` |
| `0 1px 4px rgba(11,31,51,.4)` | ombre `.pin` |
| `rgba(11,111,194,.3)` | halo `.pin.cmp` et légende |
| `440` (`DEF`), `320` (min), `380` (réserve carte) | bornes de la poignée, en JS |

---

## 2. Inventaire des écrans, dans l'ordre du parcours

Cinq écrans, tous enfants de `main`, tous `section.screen` avec un
`data-screen-label`. Mécanique d'affichage, littérale :

```css
.screen { position:absolute; inset:0; display:none; min-height:0; }
.screen.on { display:flex; flex-direction:column; }
```

`go(screen)` (l. 480) retire `.on` partout puis le pose sur `#s-<screen>`.

| # | Écran | Sélecteur racine | `data-screen-label` |
| --- | --- | --- | --- |
| 0 | Accueil | `#s-home` | `Accueil` |
| 1 | Comparer | `#s-compare` | `1 Comparer` |
| 1 bis | Fiche station | `#s-fiche` | `Fiche station` |
| 2 | Logements | `#s-lodging` | `2 Logements` |
| 3 | Réservation | `#s-booking` | `3 Réservation` |

### 2.0 État initial, chargement, erreur

Il n'y a **aucun écran de chargement**. Au parse, aucune `section.screen` ne
porte `.on` : l'application affiche la barre de navigation et un `main` vide.
`go()` n'est appelé pour la première fois que dans le `.then()` du
`fetch('stations-map-data.json')` (l. 750–753).

Le `fetch` n'a **pas de `.catch`**. En cas d'échec (fichier absent, réseau
coupé), aucun écran n'apparaît jamais : l'état vide initial est l'état
d'erreur. C'est le comportement réel de la maquette, pas une omission de ce
contrat.

À la résolution du `fetch` :

- si `location.hash` porte `s=<id>` connu : `S.station`, puis `n`/`t`/`r`
  éventuels, `S.lodges = seedLodges(...)`, `S.lodge = l` si présent, puis
  `go('booking')` si un logement est dans le lien, sinon `go('lodging')` ;
- sinon `go('home')`.

### 2.1 Transitions

Règle générale (l. 494) : un clic sur tout `[data-go]` **hors de `.pop`**
appelle `go(dataset.go)`.

Verrous dans `go()` (l. 481–482), avant tout changement d'écran :

- `lodging` sans `S.station` → `toast('Retenez d'abord une station.')`, pas de
  navigation ;
- `booking` sans `S.lodge` → `toast('Choisissez d'abord un logement.')`, pas de
  navigation.

Effets de bord de `go()`, dans l'ordre du code :

1. `S.screen = screen` ;
2. bascule `.on` sur la bonne `section.screen` ;
3. état des onglets `#journey .jl` : `.jl--on` si `k === screen` **ou** si
   `screen === 'fiche' && k === 'compare'` ; `.jl--locked` si
   (`k === 'lodging'` et pas de station) ou (`k === 'booking'` et pas de
   logement), et seulement si l'onglet n'est pas actif ;
4. `compare` → `setTimeout(() => map.invalidateSize(), 0)` ;
5. `fiche` → `renderFiche(opts.id)` ; `lodging` → `renderLodging()` ;
   `booking` → `renderBooking()` ;
6. `.screen.on .scroll` remis à `scrollTop = 0`.

Transitions nommées, par origine :

| Depuis | Déclencheur | Vers |
| --- | --- | --- |
| partout | `.brand[data-go=home]` | Accueil |
| partout | `#journey .jl[data-go]` (4 boutons) | écran correspondant, sous verrou |
| Accueil | `#hgo` (ou Entrée dans `#hq`) | Comparer, avec `q` propagé dans `#q`, `render()`, puis `setActive(premier, 'fromRow')` après 50 ms |
| Accueil | `.sugg div[data-m]` | Comparer, massif filtré, `#hq` vidé |
| Accueil | `.sugg div[data-s]` | Fiche |
| Accueil | `#hchips [data-preset]` | Comparer, après `resetF()` + préréglage |
| Accueil | `a[data-go=compare]` « Toutes les stations sur la carte → » | Comparer |
| Accueil | `#home-top article[data-fiche]` | Fiche |
| Accueil | `#home-massifs .mcard[data-m]` | Comparer, massif filtré |
| Comparer | `.row [data-fiche]` | Fiche |
| Comparer | `#cmp-table [data-fiche]` | Fiche |
| Comparer | `#cmp-go` | `retain(cmpPick)`, fermeture de `.cmpp`, Logements |
| Fiche | `a[data-go=compare]` « ← Comparer les stations » | Comparer |
| Fiche | `#fi-go` | `retain(id)` puis Logements |
| Logements | `#lo-fiche` / `#lo-fiche2` | Fiche |
| Logements | `#lo-go` | Réservation |
| Réservation | `a[data-go=fiche]` « Fiche station » | Fiche |
| Réservation | `a` « Changer de logement » | Logements |

`retain(id)` (l. 596) : si la station change, `S.lodge` et `S.lodges` sont
remis à zéro, puis `render()`.

Préréglages des chips du hero (l. 726) : `big` → `F.km = 300` ; `high` →
`F.hi = 3000` ; `village` → `F.g = 'village-station'` ; `family` →
`unit = 'pct'` et `F.col.blue = 40`.

### 2.2 États par écran

**Accueil** — un seul état de mise en page. Sous-états :

- `.sugg` fermée (défaut) / `.sugg.open` dès qu'une saisie donne au moins un
  massif ou une station (7 stations au plus) ; refermée si la saisie est vide.
- `#home-count`, `#home-top` (6 cartes) et `#home-massifs` sont vides tant que
  le `fetch` n'a pas résolu.

**Comparer** — le plus dense :

- panneau latéral déplié (défaut, `--side: 440px`) / `.split.collapsed`
  (`--side` à 0) ; largeur et pliage persistés dans `localStorage`
  (`skitrack.v6.side`, `skitrack.v6.side.collapsed`) ;
- poignée au repos / `:hover` / `.drag` ;
- filtres fermés (défaut) / `.filters.open` ;
- liste peuplée / liste vide : `<p class="muted" style="padding:24px 20px">`
  « Aucune station ne remplit tous les critères. Assouplissez un filtre ou
  réinitialisez. » ;
- `#fbadge` masqué si aucun filtre actif, sinon compte des filtres ;
- `#ftoggle` reçoit `.chip--on` si un filtre est actif **ou** si le panneau
  est ouvert ;
- `#fclose` : « Voir N station(s) » si la liste n'est pas vide, sinon
  « Aucune station : assouplir » ; ne ferme pas les filtres si la liste est
  vide ;
- tiroir de comparaison fermé / `.tray.open` dès `S.cmp.length > 0` ;
- `#cmp-open` désactivé tant que `S.cmp.length < 2`, libellé « Ajoutez une 2e
  station » puis « Comparer N stations » ;
- panneau de comparaison fermé / `.cmpp.open` (par-dessus la carte, `z-index
  600`) ;
- sélection : `.row.on` (+ `box-shadow:inset 3px 0 0 var(--marque)`), `.pin.on`
  sur la carte, étiquette `.lbl` ajoutée au `labelLayer` ; la ligne défile
  dans la liste quand la sélection vient de la carte ; la carte vole vers la
  station (`flyTo`, zoom ≥ 9, 0,6 s) quand la sélection vient d'un clic sur
  la ligne ;
- station dans la comparaison : `.pin.cmp`, `.mini--on`, et les épingles hors
  filtre passent à `opacity .18` ;
- station retenue : `<span class="tag tag--brand">Retenue</span>` dans
  `.row__act`.

**Fiche station** — `renderFiche(id)` sort sans rien faire si `byId[id]` est
absent (pas d'état d'erreur dédié). Sous-états :

- répartition des pistes connue → barre + 4 colonnes ; inconnue →
  `<p class="muted">Répartition des pistes non relevée.</p>` ;
- chaque fait absent → `—` en `var(--texte-3)` ;
- `#fi-go` : « Voir les logements » si déjà retenue, sinon « Retenir et voir
  les logements » ;
- `#fi-cmp` : `.mini--on` + « Dans la comparaison ✓ » si présente, sinon
  « + Ajouter à la comparaison » ;
- étiquettes de `#fi-tags` conditionnelles, dans l'ordre : `tag--snow`
  « Village-station » ; `tag--brand` `<domaine> · <km> km` (ou `tag` neutre
  « Domaine non renseigné ») ; `tag--warn` « Fiche Skiinfo, hors classeur »
  si `origin === 'depot'` ; `tag--ok` « Retenue » si retenue.

**Logements** :

- aucune annonce chargée → bloc `.empty.card` (« Aucune annonce relevée pour
  cette station »), `#lo-count` vide ;
- annonces chargées mais filtrées à zéro → `<p class="muted"
  style="grid-column:1/-1;padding:24px">` « Aucun logement ne remplit tous les
  critères pour ce groupe et ce budget. » ;
- carte choisie → `.lodge.on` et bouton plein « Choisi ✓ » ;
- pied de page `#lo-foot` : « Aucun logement choisi. » et `#lo-go` désactivé,
  sinon nom + prix + `#lo-go` actif ;
- chips de filtre : `.chip--on` quand le filtre est actif (budget < 5000,
  proximité, annulation).

**Réservation** — `renderBooking()` sort sans rien faire si la station ou le
logement manque. Un seul état de mise en page. La ligne « Forfaits » affiche en
dur `— non relevé` en `var(--texte-3)`.

---

## 3. Ordre du DOM, écran par écran

C'est cet ordre qui fait foi.

### 3.0 `header.nav` (l. 197–215) — présent sur tous les écrans

Grille `1fr auto 1fr`, hauteur 64px, padding `0 28px`.

1. `span.brand[data-go=home]`
   1. `span.brand__ski` → `ski`
   2. `span.brand__track` → `track`
   3. `i.brand__dot`
2. `nav.journey#journey`
   1. `button.jl[data-go=home]` → `Accueil`
   2. `button.jl[data-go=compare]` → `i.step` `1` + `Comparer`
   3. `button.jl[data-go=lodging]` → `i.step` `2` + `Logements`
   4. `button.jl[data-go=booking]` → `i.step` `3` + `Réservation`
3. `div.utils`
   1. `span.chip#stay-chip` > `span#stay-lbl` (dates)
   2. `span.chip#trav-chip` → `Voyageurs · ` + `b.rel#trav-n`
   3. `div.pop#pop` (fermé par défaut, `.open` au clic sur l'un des deux chips,
      refermé par tout clic hors `.utils`)
      1. `div.stepper` Voyageurs : `−` / `b#p-trav` / `+`
      2. `div.stepper` Chambres : `−` / `b#p-rooms` / `+`
      3. `div.stepper` Nuits : `−` / `b#p-nights` / `+`
      4. `p.muted[style=font-size:12px]` → `Arrivée le ` + `span.rel` `6 févr.`
         + ` Dates et groupe suivent jusqu'à la réservation.`

Bornes du sélecteur (l. 497) : voyageurs 1–12, chambres 1–6, nuits 1–14.
Valeurs initiales : 6 voyageurs, 3 chambres, 7 nuits.

### 3.1 Accueil — `#s-home` (l. 219–258)

1. `div.scroll`
   1. `div.hero` (`min-height:520px`)
      1. `div.hero__bg` — dégradé
      2. `image-slot#v6-hero[placeholder="Photo de couverture"]`,
         `position:absolute;inset:0`
      3. `div.hero__veil`
      4. `div.hero__in` (grille, `gap:16px`, `justify-items:start`,
         `padding:64px 28px 48px`)
         1. `span.tag` (fond `rgba(11,31,51,.3)`, texte blanc, bordure
            `rgba(255,255,255,.3)`) > `span#home-count.rel`
         2. `h1` → `Le bon domaine, à la bonne altitude, ` +
            `em[style=font-style:normal;color:#9bd2f5]` → `au bon prix.`
         3. `p` (`max-width:60ch`, `16px`, `rgba(255,255,255,.88)`) →
            « Altitudes, pistes, remontées et logements à prix ferme, tirés de
            sources vérifiables. Rien n'est estimé sans le dire. »
         4. `div.sbar`
            1. `div.sbar__f` : `small` `Station ou massif` + `input#hq`
               (placeholder `Chamonix, Val Thorens, Pyrénées…`)
            2. `div.sbar__f` : `small` `Dates` + `b#h-dates.rel`
            3. `div.sbar__f` : `small` `Voyageurs` + `b#h-trav.rel`
            4. `div.sbar__f` : `small` `Chambres` + `b#h-rooms.rel`
            5. `button.btn.btn--lg#hgo` : svg loupe (18px) + `Rechercher`
            6. `div.sugg#sugg`
         5. `div.hchips#hchips` — 4 `span.chip[data-preset]` :
            `big` « Grands domaines · 300 km et plus »,
            `high` « Haute altitude · sommet 3 000 m »,
            `village` « Villages-stations »,
            `family` « Plus de 40 % de pistes faciles »
   2. `div.wrap` (`display:grid;gap:44px`)
      1. `section` (`gap:20px`)
         1. `header` (flex, `align-items:flex-end`, `space-between`, `gap:24px`)
            1. `div` : `h2.h1[style=font-size:22px]` « Les plus grands
               domaines » + `p.muted[margin-top:6px]` « Une station par domaine
               relié, classées par kilomètres de pistes (OpenSkiMap). »
            2. `a[data-go=compare]` « Toutes les stations sur la carte → »
         2. `div.grid3#home-top` — 6 `article.stc[data-fiche]` (une station
            par domaine distinct, triées par km décroissants) :
            1. `div.stc__img` (`aspect-ratio:16/9`, fond `--neige`)
               1. `image-slot#v6-st-<id>[placeholder="Photo <nom>"]` 100 % × 100 %
               2. `span.tag.tag--snow.rel` en haut à droite → `<km> km`
            2. `div.stc__body`
               1. `div` : `strong` 18px (nom) + `span.muted` `<massif> · <domaine>`
               2. `dl.facts` en 3 colonnes : `Altitude` (`lo–hi m`),
                  `Remontées`, `Faciles` (vertes + bleues, en %)
      2. `section` (`gap:20px`)
         1. `header` : `h2.h1[font-size:22px]` « Par massif » +
            `p.muted` « Ouvre la carte filtrée sur le massif. »
         2. `div.massifs#home-massifs` — une `div.mcard[data-m]` par massif,
            triées par nombre de stations décroissant :
            `strong` 16px (massif) + `span.muted` `<n> stations · sommet
            jusqu'à <max hi> m`

### 3.2 Comparer — `#s-compare` (l. 261–343)

1. `div.split#split` — grille `var(--side) 10px minmax(0,1fr)`
   1. `aside.side`
      1. `div.side__head` (`padding:18px 20px 12px`, `gap:10px`)
         1. `span.eyebrow` « Étape 1 · Station »
         2. `h1.h1#side-title` « Toutes les stations » (ou « Stations ·
            <massif> »)
         3. `label.search` : svg loupe + `input#q`
            (placeholder `Chamonix, Val Thorens, Les Angles…`)
         4. `div.chips#massifs` — chip « Tous » puis un chip par massif, triés
         5. `div[style=display:flex;gap:8px;align-items:center]`
            1. `span.chip#ftoggle` : svg (3 traits) + `Filtres ` +
               `span.fbadge#fbadge`
            2. `select#sort` (hauteur 36, rayon 999) — 7 options, dans l'ordre :
               `km` « Tri : km de pistes », `v` « Tri : altitude village »,
               `lo` « Tri : bas des pistes », `hi` « Tri : sommet »,
               `np` « Tri : tronçons de pistes », `lifts` « Tri : remontées »,
               `n` « Tri : nom »
      2. `div.side__body`
         1. `div.filters#filters` (superposé, `inset:0`, `z-index:5`, masqué)
            1. `div.filters__in`
               1. `div.two` — 6 blocs `.f` :
                  1. « Village, au minimum » + `span.rel#lab-v` ;
                     `input#f-v[type=range][min=0][max=2400][step=100][value=0]`
                  2. « Bas des pistes, au minimum » + `#lab-lo` ;
                     `#f-lo` 0–2200 pas 100
                  3. « Sommet, au minimum » + `#lab-hi` ; `#f-hi` 0–3400 pas 100
                  4. « Km de pistes, au minimum » + `#lab-km` ; `#f-km` 0–600 pas 10
                  5. « Remontées, au minimum » + `#lab-np` ; `#f-np` 0–150 pas 5
                     (l'id dit `np`, le filtre compare `s.lifts`)
                  6. « Type » + `span.seg#gseg` : `Tous` (actif) / `Station` /
                     `Village-station`
               2. `div.f`
                  1. `div.f__lab` : « Répartition par couleur, au minimum » +
                     `span.seg#unit` : `%` (actif) / `tronçons` / `km`
                  2. `div.cols#cols` — 4 `.col`, dans l'ordre `Vertes`,
                     `Bleues`, `Rouges`, `Noires` : pastille + curseur +
                     `span.col__v#cv-<c>` ; bornes par unité : `%` 0–60 pas 5,
                     `tronçons` 0–200 pas 5, `km` 0–200 pas 10 ; changer
                     d'unité remet les quatre seuils à 0
                  3. `p.muted[font-size:11.5px]` « Tronçons par couleur :
                     OpenSkiMap, à l'échelle du domaine skiable. Les km par
                     couleur sont estimés (part × km du domaine). »
               3. `div.f` : « Domaine skiable » + `select#f-pass`
                  (`Tous`, `Non renseigné`, puis un domaine par valeur distincte)
               4. `span.muted[font-size:12px]` « Sources : France Montagnes
                  (référentiel), OpenSkiMap (pistes, remontées). Répartition
                  Skiinfo du <span.rel#src-at> en info-bulle quand disponible. »
            2. `div.filters__foot` : `button.reset#reset` « Réinitialiser » +
               `button.btn#fclose`
         2. `div.count` : `span#count` (« N stations sur M ») +
            `span#sortlab` (« Trié par km de pistes »)
         3. `div.list#list` — une `div.row[data-id]` par station, ordre interne
            fixe :
            1. `span.row__name` — nom
            2. `span.row__km.rel` — `<km> km`, suffixé ` (Skiinfo)` et doté
               d'un `title` quand `pisteSrc === 'skiinfo'` ; `—` si absent
            3. `span.row__sub` — `subLbl(s)`, suffixé ` · Fiche Skiinfo, hors
               classeur` quand `origin === 'depot'`
            4. `span.row__facts` (pleine largeur) — `lo–hi m`, puis
               `village <v> m`, puis `<lifts> remontées` si connu, puis
               `piste à <dist>` si connue
            5. `span.row__pistes` (pleine largeur) — `span.bar` à 4 segments
               + `span.rel` `v / b / r / n %` ; sinon texte « Répartition des
               pistes non relevée »
            6. `span.row__act` (pleine largeur) — `button.mini[data-cmp]`
               (svg + « Comparer » / « Dans la comparaison »),
               `button.mini[data-fiche]` « Fiche », puis
               `span.tag.tag--brand` « Retenue » si retenue
         4. `div.tray#tray` : `div.tray__chips#tray-chips`
            (une `span.tag.tag--brand` par station avec un `b[data-rm]` `✕`)
            + `button.btn#cmp-open`
   2. `div.handle#handle` (`title` : « Glisser pour redimensionner ·
      double-clic pour revenir à la largeur par défaut »)
      1. `button.handle__btn#collapse` (svg chevron ; `title` : « Replier /
         déplier le panneau »)
      2. `span.handle__tip` « Glisser · double-clic : largeur par défaut »
   3. `div.mapcol`
      1. `div.lmap#map`
      2. `div.maptools` (haut droite) : `span.chip.chip--on` (svg coche +
         `Carte`) + `span.chip` `Fond IGN`
      3. `div.legend` (bas gauche) :
         1. `b` `Épingles`
         2. `span` pastille `#0b6fc2` + « Station ou village-station »
         3. `span` pastille `#0959a0` (halo) + « Dans la comparaison »
         4. `span` pastille `#ff5a3c` + « Station survolée ou sélectionnée »
         5. `span[color:var(--texte-2)]` « Coordonnées et altitudes : France
            Montagnes / OpenSkiMap. »
      4. `div.cmpp#cmpp` (superposé, `z-index:600`, masqué)
         1. `div.cmpp__in`
            1. `header` (flex, `align-items:flex-start`, `space-between`)
               1. `div` : `span.eyebrow` « Étape 1 · Station » +
                  `h1.h1.h1--xl` « Comparer les stations » +
                  `p.muted` « Données du référentiel. Choisissez la station
                  retenue, puis ouvrez ses logements — dates et groupe
                  suivent. »
               2. `button.chip#cmp-close` « Retour à la carte »
            2. `div.card[overflow:hidden]` > `table.cmp#cmp-table`
            3. `div` (flex, `space-between`) :
               `span.muted` « « — » : donnée absente du référentiel ou non
               relevée. Surligné : meilleure valeur du critère. » +
               `button.btn.btn--lg#cmp-go`

Poignée (l. 599–613) : `pointerdown` / `pointermove` / `pointerup` avec
capture ; largeur bornée entre 320 et « largeur du split − 380 » ; double-clic
→ 440 ; `ArrowLeft` / `ArrowRight` au clavier → ±24 px ; le tout persisté.

Table de comparaison (`CRIT`, l. 570–582), ordre des lignes, littéral :
`Altitude des pistes`, `Village`, `Km de pistes (domaine)`,
`Tronçons de pistes`, `Remontées`, `Pistes faciles (vertes + bleues)`,
`Pistes noires`, `Piste la plus proche`, `Domaine skiable`, `Type`,
`Massif · département`. En-tête de la première colonne : `Critère`. Chaque
colonne de station porte une `input[type=radio][name=pick]`, le nom, puis
`Fiche` et `Retirer`. La meilleure valeur d'un critère numérique reçoit
`.best` (seulement si au moins deux valeurs sont renseignées ; pour la
distance, c'est la plus petite) ; la colonne choisie reçoit `.sel`. Trois
stations au maximum ; au-delà, `toast('Trois stations au plus dans la
comparaison.')`. Retirer une station sous le seuil de deux ferme le panneau.

### 3.3 Fiche station — `#s-fiche` (l. 346–405)

1. `div.scroll` > `div.wrap[display:grid;gap:22px]`
   1. `nav[font-size:13.5px;font-weight:600]` > `a[data-go=compare]`
      « ← Comparer les stations »
   2. `div.fhero` (`min-height:320px`, rayon 16, fond `--neige`)
      1. `image-slot#v6-fiche-hero[placeholder="Photo de la station — créditée"]`,
         `position:absolute;inset:0`
      2. `div.fhero__veil`
      3. `div.fhero__in` (`padding:28px 30px`)
         1. `span.eyebrow#fi-crumb` (blanc 85 %) — `<massif> · <dept> · <commune>`
         2. `h1#fi-name`
         3. `div.chips#fi-tags`
   3. `div.fgrid` — `minmax(0,1fr) 340px`, `gap:28px`
      1. colonne principale (`display:grid;gap:20px`)
         1. `dl.facts.card#fi-facts` — 6 colonnes, `padding:18px 22px`,
            `box-shadow:none` ; ordre : `Altitude des pistes`, `Village`,
            `Pistes (domaine)`, `Tronçons`, `Remontées`,
            `Piste la plus proche`
         2. `section.sect.card` « Pistes par couleur »
            1. `h2` « Pistes par couleur »
            2. `div#fi-pistes` — barre 12px (rayon 6) + 4 blocs (pastille +
               libellé, `b.rel` 20px en graisse 500 avec le %, `span.muted`
               12px avec les tronçons et, si disponible, `· Skiinfo <n> %`)
            3. `p.muted#fi-pistes-note` — « Parts OpenSkiMap à l'échelle du
               domaine » + « ; répartition Skiinfo relevée le <at> » si
               disponible, puis « . »
         3. `section.sect.card` « Situation »
            1. `div` (flex, `space-between`, `align-items:baseline`) :
               `h2` « Situation » + `span.muted#fi-coords` (`lat, lon` à 4
               décimales)
            2. `div.minimap#minimap` (hauteur 260)
         4. `section.sect.card` « Forfaits et neige »
            1. `h2` « Forfaits et neige »
            2. `p.muted` « Tarifs et hauteurs de neige non relevés pour cette
               maquette : ils s'affichent « — » tant que le relevé n'a pas
               tourné. »
            3. `dl.facts` 4 colonnes, valeurs en dur `—` en `--texte-3` :
               `Adulte 6 j`, `Enfant 6 j`, `Neige bas`, `Neige sommet`
         5. `p.muted[font-size:12px]#fi-src` — « Sources : France Montagnes
            (référentiel), OpenSkiMap (pistes, remontées) » + « , <a>fiche
            Skiinfo</a> » si `src`, puis « . »
      2. `aside.aside.card` (`position:sticky;top:0`)
         1. `span.eyebrow` « Votre séjour »
         2. `dl.facts[gap:10px]` — 3 `div.kv` : `Dates` (`dd.rel.js-dates`),
            `Voyageurs` (`dd.rel.js-group`), `Station` (`dd#fi-aside-name`)
         3. `button.btn.btn--lg#fi-go[width:100%]`
         4. `div.chips` > `button.mini#fi-cmp`
         5. `p.muted[font-size:12.5px]` « Dates et groupe se modifient dans la
            barre du haut et suivent jusqu'à la réservation. »

### 3.4 Logements — `#s-lodging` (l. 408–435)

1. `div.scroll` > `div.wrap[display:grid;gap:20px]`
   1. `header` (flex, `align-items:flex-start`, `space-between`, `gap:24px`)
      1. `div` : `span.eyebrow` « Étape 2 · Logement » +
         `h1.h1.h1--xl#lo-title` (« Logements à <nom> ») + `p.muted`
         (`span.rel.js-dates` ` · ` `span.rel.js-group` ` · ` `a#lo-fiche`
         « Fiche station »)
      2. `div[display:flex;gap:10px;flex-shrink:0]` :
         `button.btn.btn--ghost#lo-import` « Importer une annonce » +
         `button.btn.btn--ghost#lo-demo` « Charger des annonces d'exemple »
   2. `section.ribbon.card` — grille `148px minmax(0,1fr) auto`
      1. `div[aspect-ratio:4/3;border-radius:12px;background:var(--neige)]` >
         `image-slot#v6-ribbon[placeholder="Photo"]` 100 % × 100 %
      2. `div[display:grid;gap:8px]` : `span.muted#lo-crumb`
         (`<massif> · <dept> · <domaine>`) + `dl.facts#lo-facts` 4 colonnes
         (`Altitude`, `Pistes (domaine)`, `Remontées`, `Piste la plus proche`)
      3. `a#lo-fiche2` « Fiche station → »
   3. `div.lfilters`
      1. `span.chip#lf-budget` « Budget total · » + `b.rel#lf-budget-v`
         (« tous » ou « ≤ <n> € »)
      2. `input#lf-budget-r[type=range][min=800][max=5000][step=100][value=5000]`
         (largeur 160)
      3. `select#lf-type` : `Tout type de bien`, `Appartement`, `Chalet`,
         `Studio`, `Hôtel`
      4. `span.chip#lf-dist` « Aux pieds des pistes · 500 m »
      5. `span.chip#lf-cancel` « Annulation gratuite »
      6. `span[flex:1]` — espaceur
      7. `span.muted#lo-count` (« N logement(s) sur M »)
      8. `select#lf-sort` : `pp` « Tri : prix par personne », `total` « Tri :
         prix total », `dist` « Tri : distance aux pistes », `note` « Tri :
         note »
   4. `p.muted#lo-rule` (fond `--glacier`, rayon 10, `padding:10px 14px`)
      « Une annonce n'apparaît que si les quatre conditions sont réunies :
      disponible aux dates, capacité suffisante, prix ferme pour le séjour,
      distance aux pistes calculée. »
   5. `div#lodges` — reçoit la classe `lodges` quand des annonces existent ;
      une `article.lodge[data-l]` par annonce :
      1. `div.lodge__img` (`aspect-ratio:16/10`)
         1. `image-slot#v6-l-<id>[placeholder="Photo de l'annonce"]`
         2. `span.tag.tag--warn` en haut à gauche « Exemple »
         3. `span.tag[background:#fff]` en haut à droite — la source
      2. `div.lodge__body`
         1. `div` : `strong` 16px (nom) + `span.lodge__meta`
            (`<n> ch.`, `piste à <d>`, `★ <note> (<avis>)`, puis
            « Annulation gratuite » en `--ok-texte` si applicable)
         2. `div.lodge__price` : `b.rel` 20px graisse 500 (total) +
            `span.muted` `total · N nuits`, puis `b.rel` prix par personne
            + ` / pers.`
         3. `button.btn[data-pick]` — `.btn--ghost` tant que non choisi ;
            « Choisir ce logement » / « Choisi ✓ » ; second clic → désélection
2. `div.foot#lo-foot`
   1. `span.muted#lo-foot-lbl`
   2. `button.btn.btn--lg#lo-go[disabled]` « Passer à la réservation »

Filtrage des annonces (l. 653) : `personnes ≥ voyageurs`, `total ≤ budget`,
type, `dist ≤ 500` si proximité, annulation ; tri croissant sur la clé.

État vide (`.empty.card`) : `strong` 16px « Aucune annonce relevée pour cette
station », `p.muted[max-width:52ch]` « Le relevé n'a pas tourné aux dates du
séjour. Importez une annonce (JSON ou lien) ou chargez des annonces d'exemple,
clairement marquées comme telles. », puis deux boutons (« Importer une
annonce » fantôme, « Charger des annonces d'exemple » plein).

### 3.5 Réservation — `#s-booking` (l. 438–451)

1. `div.scroll` > `div.wrap[display:grid;gap:22px]`
   1. `header` : `span.eyebrow` « Étape 3 · Réservation » +
      `h1.h1.h1--xl` « Récapitulatif du séjour » + `p.muted` « Skitrack ne
      prend pas de paiement : la réservation se fait sur le site de l'annonce,
      avec le prix relevé. »
   2. `div.bgrid` — `minmax(0,1fr) 380px`, `gap:28px`
      1. colonne principale (`display:grid;gap:20px`)
         1. `section.sect.card` : `h2` « Station » + `div#bk-station`
            (nom 18px, `p.muted` `<massif> · <dept> · <domaine>`,
            `p.muted` altitudes / km / remontées, `a` « Fiche station »)
         2. `section.sect.card` : `h2` « Logement » + `div#bk-lodge`
            (vignette 160px `aspect-ratio:16/10` avec
            `image-slot#v6-l-<id>[placeholder="Photo"]`, puis
            `span.tag.tag--warn` « Exemple · <source> », `strong` 16px,
            `span.muted` chambres / distance / note, `a` « Changer de
            logement »)
         3. `section.sect.card` : `h2` « Avant de réserver » + `ul.checklist`
            1. `i` `✓` — « Prix total confirmé aux dates du séjour, taxes et
               frais compris. »
            2. `i` `✓` — « Capacité vérifiée pour le groupe. »
            3. `i.todo` `·` — « Forfaits : tarifs non relevés, à confirmer sur
               le site du domaine. »
            4. `i.todo` `·` — « Trajet : itinéraire non calculé dans cette
               maquette. »
      2. `aside.aside.card`
         1. `span.eyebrow` « Total du séjour »
         2. `div#bk-lines` — 5 `div.line`, dans l'ordre :
            `Logement · N nuits` / total ;
            `Forfaits · T × 6 j` / `— non relevé` en `--texte-3` ;
            `Total` (16px, en gras des deux côtés) ;
            `Par personne (T)` ; `Dates`
         3. `button.btn.btn--lg#bk-open[width:100%]` « Ouvrir l'annonce et
            réserver »
         4. `button.btn.btn--ghost#bk-share[width:100%]` « Copier le lien de
            partage »
         5. `p.muted[font-size:12.5px]` « Le lien reprend station, logement,
            dates et groupe : vos co-voyageurs voient exactement le même
            récapitulatif. »

### 3.6 `div.toast#toast` (l. 454)

Hors de `.app`, `position:fixed`, `left:50%`, `bottom:24px`, `z-index:100`.
Apparaît par `.show` pendant 2 200 ms.

---

## 4. Typographie effective

**Familles.** Une seule : `'Plus Jakarta Sans', ui-sans-serif, system-ui,
sans-serif`, posée sur `body`. Graisses chargées : 400, 500, 600, 700, 800.
`--mono: inherit` : aucune chasse fixe n'est utilisée nulle part.

**Taille de base.** `body` ne fixe pas de `font-size` : la valeur de l'agent
utilisateur s'applique (16px), et `1rem` vaut 16px. Aucun `rem` dans la
maquette — toutes les tailles sont en px.

| Usage | Sélecteur | Taille | Graisse | Interlignage | Interlettrage |
| --- | --- | --- | --- | --- | --- |
| Marque | `.brand` | 20 | 400 / 800 | — | −.02em |
| Onglet de parcours | `.jl` | 14 | 600 | — | — |
| Pastille d'étape | `.step` | 11 | 800 | — | — |
| Chip | `.chip` | 13.5 | 600 | — | — |
| Mini-bouton | `.mini` | 12 | 600 | — | — |
| Sélecteur du séjour | `.stepper` / `.stepper b` | 14 | — / 500 | — | — |
| Surtitre | `.eyebrow` | 11.5 | 800 | — | .08em, capitales |
| Titre de section | `.h1` | 26 | 800 | 1.1 | −.02em |
| Grand titre d'écran | `.h1--xl` | 34 | 800 | 1.1 | −.02em |
| Titre de bloc d'accueil | `.h1` surchargé en ligne | 22 | 800 | 1.1 | −.02em |
| Titre du hero | `.hero h1` | 52 | 800 | 1.04 | −.025em |
| Sous-titre du hero | `p` en ligne | 16 | — | — | — |
| Texte secondaire | `.muted` | 13.5 | — | — | — |
| Valeur numérique | `.rel` | héritée | 600 | — | −.01em, `tabular-nums` |
| Bouton | `.btn` | 14 | 700 | — | — |
| Grand bouton | `.btn--lg` | 15 | 700 | — | — |
| Étiquette de fait | `.facts dt` | 11 | 700 | — | .06em, capitales |
| Valeur de fait | `.facts dd` | 15 | — | — | — |
| Étiquette | `.tag` | 12 | 600 | — | — |
| Libellé de champ (barre de recherche) | `.sbar__f small` | 11 | 800 | — | .06em, capitales |
| Valeur (barre de recherche) | `.sbar__f b`, `input` | 15 | 600 | — | — |
| Suggestion | `.sugg div` | 14 | — | — | — |
| Nom de station (liste) | `.row__name` | 15 | 700 | — | −.01em |
| Sous-titre de ligne | `.row__sub` | 12.5 | — | — | — |
| Faits de ligne | `.row__facts` | 12.5 | — | — | — |
| Pastille km | `.row__km` | 12 | 600 | — | — |
| Répartition de ligne | `.row__pistes` | 12 | — | — | — |
| Compteur | `.count` | 12.5 | — | — | — |
| Champ de recherche | `.search input` | 14 | — | — | — |
| Liste déroulante | `select` | 13 | — | — | — |
| Libellé de filtre | `.f__lab` | 12.5 | 700 | — | — |
| Titre de couleur | `.col__t` | 12 | 700 | — | — |
| Valeur de couleur | `.col__v` | 12 | — | — | — |
| Segment | `.seg span` | 12 | 600 | — | — |
| Réinitialiser | `.reset` | 12.5 | 600 | — | — |
| Badge de filtres | `.fbadge` | 11 | 800 | — | — |
| Légende | `.legend` | 12.5 | — | — | — |
| Titre de légende | `.legend b` | 11 | 800 | — | .06em, capitales |
| Étiquette de carte | `.lbl` | 13 | 600 | — | — |
| Cellule de comparaison | `table.cmp th/td` | 14 | — | — | — |
| En-tête de colonne | `table.cmp thead th` | 15 | 800 | — | — |
| En-tête de ligne | `table.cmp tbody th` | 12 | 700 | — | .04em, capitales |
| Titre de fiche | `.fhero h1` | 34 | 800 | 1.1 | −.02em |
| Titre de carte | `.sect h2` | 16 | 700 | — | — |
| Paire clé/valeur | `.kv` | 14 | 600 (dt et dd) | — | — |
| Titre de carte station (accueil) | `strong` en ligne | 18 | 700 | — | — |
| Titre de massif | `.mcard strong` | 16 | — | — | — |
| Titre d'annonce | `strong` en ligne | 16 | 700 | — | — |
| Méta d'annonce | `.lodge__meta` | 13 | — | — | — |
| Prix | `b.rel` en ligne | 20 | 500 | — | −.01em |
| Pourcentage de couleur (fiche) | `b.rel` en ligne | 20 | 500 | — | −.01em |
| Nom de station (réservation) | `strong` en ligne | 18 | — | — | — |
| Ligne de récapitulatif | `.line` | 14 | — | — | — |
| Élément de liste de contrôle | `.checklist li` | 14 | — | — | — |
| Puce de liste de contrôle | `.checklist i` | 12 | 800 | — | — |
| Bandeau | `.toast` | 13.5 | 600 | — | — |
| Mentions en ligne | `style=font-size:…` | 11.5 / 12 / 12.5 | — | — | — |

`.muted` et le sous-titre du hero portent `text-wrap: pretty`.
`.hero h1` porte `text-shadow: 0 1px 24px rgba(11,31,51,.45)` et
`max-width: 20ch` ; le sous-titre, `max-width: 60ch`.

`image-slot` n'hérite pas de cette typographie : son shadow DOM impose
`font: 13px/1.3 system-ui, -apple-system, sans-serif` (et 11px / 10px pour le
sous-texte, les contrôles et le crédit).

---

## 5. `image-slot.js`

IIFE autonome, sans dépendance. Enregistre l'élément personnalisé
`image-slot` via `customElements.define`, protégé par
`if (!customElements.get('image-slot'))`.

### 5.1 Signature

`observedAttributes` (l. 440–442), exhaustif et dans l'ordre :

`shape`, `radius`, `mask`, `fit`, `placeholder`, `src`, `id`, `credit`,
`credit-href`.

| Attribut | Valeurs | Défaut | Effet |
| --- | --- | --- | --- |
| `id` | chaîne | aucun | clé de persistance ; sans lui, `console.warn` une fois par page et aucune persistance |
| `shape` | `rect` / `rounded` / `circle` / `pill` | `rounded` | `circle` → `border-radius:50%` ; `pill` → `9999px` ; `rect` → aucun rayon |
| `radius` | nombre (px) | `12` | rayon pour `rounded` uniquement ; valeur non finie → 12 |
| `mask` | toute valeur `clip-path` | — | remplace `shape` ; masque aussi l'anneau pointillé |
| `fit` | `cover` / `contain` | `cover` | cadrage initial ; l'utilisateur peut recadrer ensuite |
| `placeholder` | chaîne | `Drop an image` | légende de l'état vide |
| `src` | URL | — | image initiale, écrasée par un dépôt utilisateur |
| `credit` | chaîne | — | crédit affiché en bas à gauche ; obligatoire pour tout `src` Unsplash |
| `credit-href` | URL http(s) | — | lien du nom du photographe ; tout autre protocole est rendu en texte |

### 5.2 Shadow DOM (ordre littéral, l. 501–528)

`attachShadow({ mode:'open', clonable:true })`, puis :

1. `<style>`
2. `div.frame[part=frame]`
   1. `img[part=image][alt=""][draggable=false]`, `display:none` au départ
   2. `div.empty[part=empty]` : icône SVG 28×28 (cadre + point + montagne),
      `div.cap` (le `placeholder`), `div.sub` → `or <u>browse files</u>`
   3. `div.attr-error[part=attribution-error]` : icône SVG 28×28
      (triangle d'alerte) + `div.cap` « This photo needs attribution »
   4. `div.loading[part=loading]`
   5. `div.ring[part=ring]`
3. `span.credit[part=credit]`
4. `div.spill[popover=manual]` : `img.ghost` + 4 `div.handle[data-c=nw|ne|sw|se]`
5. `div.ctl[popover=manual]` : `button[data-act=replace]` « Replace » +
   `button[data-act=edit]` « Edit »
6. `input[type=file][hidden]`, `accept="image/png,image/jpeg,image/webp,image/avif"`

### 5.3 Dimensions

```css
:host { display:block; position:relative;
        font:13px/1.3 system-ui,-apple-system,sans-serif;
        width:100%; height:100%; aspect-ratio:3/2 }
```

Le slot remplit son conteneur. Quand la hauteur du parent est indéfinie,
`height:100%` se résout en `auto` et le rapport 3/2 prend le relais : pleine
largeur, hauteur dérivée. Un `width`/`height` explicite sur l'élément écrase
tout cela. Dans un parent qui se rétracte (flottant, `width:max-content`,
absolu non dimensionné), les pourcentages n'ont rien à résoudre : il faut
dimensionner explicitement.

`.frame` est en `position:absolute; inset:0; overflow:hidden;` avec
`background: rgba(127,127,127,.08)`. Un `ResizeObserver` sur l'hôte relance
`_render()` à chaque changement de taille.

### 5.4 Comportement de repli

- **Vide** : `.empty` affichée (`display:flex`), anneau
  `1.5px dashed currentColor` à `opacity:.35`, icône à `opacity:.45`, légende
  et sous-légende à `opacity:.75`. La couleur vient de `color:inherit`.
- **Survol d'un fichier** : `[data-over]` → contour `2px solid #c96442` et fond
  `rgba(201,100,66,.10)`.
- **Remplie** : `[data-filled]`, anneau masqué, image positionnée par
  `_applyView()` (échelle et décalage persistés).
- **Remplacement en cours** : `[data-swapping]` → l'image précédente passe en
  `visibility:hidden` et un rond de chargement tourne (`om-slot-spin`, .7s,
  neutralisé sous `prefers-reduced-motion`).
- **Erreur d'attribution** : un `src` sur un hôte Unsplash sans `credit` non
  vide → `[data-attribution-error]`, la photo **n'est pas rendue du tout**, la
  tuile `.attr-error` prend sa place (fond `#f2f1ef`, texte `#6e6c66`), et
  l'anneau est masqué.
- **Lecture seule** : les contrôles et le recadrage sont conditionnés à
  `!!(window.omelette && window.omelette.writeFile)`. Hors de ce runtime,
  `[data-editable]` est absent, `.ctl` reste à `opacity:0` et la sous-légende
  « or browse files » est masquée.

### 5.5 Persistance

Fichier `.image-slots.state.json`, **frère du HTML**. Lecture par `fetch`
relatif au document, écriture par `window.omelette.writeFile` (sérialisée).
Une seule entrée par `id` : `{ u, s, x, y }` — URL, échelle, décalages. À la
relecture, seules les URL `data:image/…` sont acceptées ; toute autre valeur
est ignorée.

Ré-encodage à l'ingestion : `MAX_DIM = 1200` px sur le plus grand côté, WebP
q≈0.85. Formats acceptés : PNG, JPEG, WebP, AVIF. SVG et GIF sont exclus
volontairement.

### 5.6 Usage réel dans la maquette

Six emplacements, aucun avec `src`, `credit` ni `shape` :

| `id` | `placeholder` | Conteneur | Dimensions |
| --- | --- | --- | --- |
| `v6-hero` | `Photo de couverture` | `.hero` | `position:absolute;inset:0` |
| `v6-fiche-hero` | `Photo de la station — créditée` | `.fhero` | `position:absolute;inset:0` |
| `v6-ribbon` | `Photo` | `.ribbon` (vignette `aspect-ratio:4/3`) | `width:100%;height:100%` |
| `v6-st-<id station>` | `Photo <nom de la station>` | `.stc__img` (`16/9`) | `width:100%;height:100%` |
| `v6-l-<id annonce>` | `Photo de l'annonce` | `.lodge__img` (`16/10`) | `width:100%;height:100%` |
| `v6-l-<id annonce>` | `Photo` | `#bk-lodge` (vignette 160px, `16/10`) | `width:100%;height:100%` |

Le sidecar `design/v6/.image-slots.state.json` existe (80 739 octets) et
contient **une seule clé** : `skitrack-hero` (`{ s:1, x:0, y:0, u:"data:image/webp;base64,…" }`).
Cette clé ne correspond à **aucun** des six `id` de la maquette v6 (tous
préfixés `v6-`). Conséquence, vérifiée dans le code de `_render()` : les six
slots de la maquette restent à l'état vide — anneau pointillé, icône, légende.
Il n'y a donc **aucune photo à porter** ; l'état de référence de chaque
emplacement photo est l'état vide de `image-slot`. La clé `skitrack-hero`
appartient à une autre page du même dossier et n'entre pas dans le contrat.

Les deux dernières lignes du tableau partagent le même `id` pour une même
annonce : la carte de l'écran Logements et la vignette de l'écran Réservation
sont deux éléments avec un `id` identique, ce que la documentation du
composant interdit explicitement (« every slot on the page needs a distinct
id »). Constat factuel, à reporter dans `v6-ecarts.md`, sans correction
spontanée.

Les scrims `.hero__veil` et `.fhero__veil` couvrent le slot en plein écran ;
`.fhero__veil` porte `pointer-events:none`, `.hero__veil` **non**.

---

## 6. Dépendances externes

### 6.1 Polices

```html
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" />
```

Une seule famille, cinq graisses, `display=swap`. Il n'y a pas de `preconnect`
vers `fonts.gstatic.com` (d'où viennent réellement les fichiers de police).

### 6.2 Bibliothèques

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha384-sHL9NAb7lN7rfvG5lfHpm643Xkcjzp4jFvuavGOndn6pjVqS6ny56CAt3nsEVT4H"
      crossorigin="anonymous">
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha384-cxOPjt7s7Iz04uaHJceBmS+qpjv2JkIHNVcuOrM+YHwZOmJGBXI00mdUXEq65HTH"
        crossorigin="anonymous"></script>
<script src="image-slot.js"></script>
```

Leaflet 1.9.4, épinglé par SRI. Aucune bibliothèque d'icônes : tous les
pictogrammes sont des `<svg>` en ligne (loupe, coche, plus, chevron, trois
traits). Les seules exceptions sont des caractères textuels dans le contenu :
`−` / `+` du sélecteur de séjour, `✕` des chips du tiroir, `✓` et `·` de la
liste de contrôle, `★` des notes, `→` et `←` des liens.

Configuration Leaflet, littérale :

- carte principale : `L.map('map', { zoomControl:false, scrollWheelZoom:true })`,
  `setView([45.4, 4.6], 6)`, contrôle de zoom en `bottomright`,
  `ResizeObserver` → `invalidateSize({ pan:false })` ;
- minicarte de la fiche : `L.map('minimap', { zoomControl:false,
  scrollWheelZoom:false, dragging:false })`, `setView([lat, lon], 11)` ;
- fond : `https://tile.openstreetmap.org/{z}/{x}/{y}.png`,
  `attribution: '© OpenStreetMap contributors'`, `maxZoom: 18` ;
- épingle : `divIcon` `<div class="pin"></div>`, `iconSize:[12,12]`,
  `iconAnchor:[6,6]` ; `mouseover` → sélection « map », `click` → sélection
  « fromRow », `dblclick` → fiche ;
- étiquette : `divIcon` `<span class="lbl">…</span>`, `iconSize:[0,0]`,
  `interactive:false`.

La barre `.maptools` annonce « Fond IGN », mais aucune tuile IGN n'est
chargée : le fond réel est OpenStreetMap. Constat factuel.

### 6.3 Sources d'images

Aucune balise `<img>` dans le HTML, aucune URL d'image, aucun
`background-image`. Les six emplacements photo sont des `image-slot` sans
`src`, et le sidecar ne les alimente pas (§ 5.6). Les seules images
effectivement rendues sont les tuiles OpenStreetMap.

### 6.4 Données

Ligne 738 : `fetch('stations-map-data.json')`, résolu relativement au
document, donc `design/v6/stations-map-data.json` (hash
`432053a68cc83a31817877a7b591551909b40ea0`, 164 415 octets).

Contenu, relevé : un tableau de **318** stations ; **7** massifs (`Alpes du
Nord`, `Alpes du Sud`, `Corse`, `Jura`, `Massif Central`, `Pyrénées`,
`Vosges`) ; deux types (`station`, `village-station`).

Champs lus par le script, exhaustivement, avec leur couverture dans le fichier :

| Champ | Emploi | Renseigné |
| --- | --- | --- |
| `id` | clé, `data-id`, `byId`, lien de partage | 318 |
| `n` | nom | 318 |
| `m` | massif | 318 |
| `dept` | département | 318 |
| `com` | commune (fil d'Ariane de la fiche) | 283 |
| `t` | `station` ou `village-station` | 318 |
| `dom` | domaine skiable | 283 |
| `st` | statut (`En activité`, …) | 283 |
| `lat`, `lon` | carte, minicarte, coordonnées affichées à 4 décimales | 318 |
| `v` | altitude du village | 318 |
| `lo`, `hi` | bas et haut des pistes | 318 |
| `km` | km de pistes du domaine | 317 |
| `np` | tronçons de pistes | 271 |
| `lifts` | remontées | 284 |
| `dist` | distance à la piste, en km (affichée en m sous 1 km) | 201 |
| `share` | `{green,blue,red,black}` en % (OpenSkiMap, échelle domaine) | 316 |
| `cnt` | `{green,blue,red,black,other}` en tronçons | 271 |
| `pct` | `{green,blue,red,black}` en % (Skiinfo) | 202 |
| `at` | date du relevé Skiinfo | 204 |
| `src` | URL de la fiche Skiinfo | 204 |
| `origin` | `depot` → étiquette « Fiche Skiinfo, hors classeur » | valeurs : absent / `depot` |
| `pisteSrc` | `skiinfo` → suffixe « (Skiinfo) » et info-bulle sur les km | valeurs : absent / `skiinfo` |

Champs présents dans le fichier mais **jamais lus** par la maquette : `med`,
`p2000`, `skm`, `snp`, `legacyId`, `osm`, `g`, `vClasseur`, `vSrc`, et la
clé `other` de `cnt`. Ils ne font pas partie du contrat d'affichage.

`fetch()` sans `.catch` : la phase 3 doit servir tout le dossier `design/v6/`
(HTML, `image-slot.js`, `stations-map-data.json`, `.image-slots.state.json`),
sinon la maquette reste vide (§ 2.0).

### 6.5 Stockage local et lien de partage

- `localStorage` : `skitrack.v6.side` (largeur en px, défaut 440, bornée entre
  320 et « largeur du split − 380 ») et `skitrack.v6.side.collapsed`
  (`'0'` / `'1'`).
- Lien de partage (`#bk-share`) :
  `<url sans hash>#s=<station>&l=<logement>&n=<nuits>&t=<voyageurs>&r=<chambres>`,
  copié via `navigator.clipboard?.writeText`.

---

## 7. Valeurs de démonstration, à ne pas porter telles quelles

La règle 6 de la phase 2 interdit de fabriquer des valeurs. Les éléments
suivants sont explicitement de la démonstration dans la maquette :

- `seedLodges(station)` (l. 640–646) fabrique 6 annonces par générateur
  pseudo-aléatoire déterministe amorcé sur l'id de la station : nom, type,
  capacité, chambres, m², note, avis, prix par nuit, distance, annulation,
  source (`Airbnb` ou `Booking.com`). Toutes portent l'étiquette « Exemple ».
  Rien de tout cela n'est une donnée réelle ;
- les dates sont figées : `datesLbl()` rend `6 – <6+nuits> févr.`, sans année
  ni calendrier ;
- la section « Forfaits et neige » de la fiche et la ligne « Forfaits » de la
  réservation sont en dur à `—` / `— non relevé` ;
- `#lo-import` n'ouvre rien : `toast('Import JSON / lien : hors maquette (voir
  skitrack-annonces.json).')` ;
- `#bk-open` n'ouvre rien : `toast('Annonce d'exemple : aucun lien externe.')` ;
- `#lo-demo` : `toast('6 annonces d'exemple chargées — aucune n'est réelle.')`.

Les libellés qui signalent une estimation dans la maquette : « Les km par
couleur sont estimés (part × km du domaine) » (note des filtres) et
« Répartition Skiinfo du <date> en info-bulle quand disponible ». Aucun
symbole `≈` n'apparaît dans la maquette.
