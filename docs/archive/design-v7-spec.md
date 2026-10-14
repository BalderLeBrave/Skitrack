# SKITRACK v7 — spécification de portage au pixel

Étape 0 : inventaire. **Aucun code écrit.** Ce document attend une validation
avant que la moindre ligne ne bouge.

Source : `SKITRACK v7 - App.dc.html` (951 lignes), export Claude Design du
16 septembre 2026, projet `94054660-9e3d-4b33-98e2-0e5b5f9047a4`. Lus aussi :
`V7Coquille.dc.html`, `support.js`, `image-slot.js`, et le `CLAUDE.md` du
bundle (guide de rédaction).

Relevé mécanique, pas à l'œil : **709 déclarations de style en ligne** ont été
extraites et dépouillées propriété par propriété. Les chiffres cités plus bas
sont des comptes, pas des impressions.

---

## 0. Trois faits à poser avant tout

### 0.1 Le MCP claude_design n'est pas joignable ici

`/design-login` n'existe pas dans cet environnement — vérifié à la demande
précédente. Le projet n'a donc pas été importé par le MCP : je travaille sur le
**bundle que vous avez téléversé** (`Skitrack.zip`, `Skitrack-handoff.zip`),
extrait et complet, `SKITRACK v7 - App.dc.html` compris. Le contenu est le
même ; seul le chemin d'accès change. Si vous tenez à l'import par le MCP, il
faut une session où `/design-login` est disponible.

### 0.2 Ce design est déjà implémenté dans le dépôt

Ce n'est pas un portage à faire : c'est un portage à **resserrer**.

- `src/design/system.css` porte en en-tête : « Les valeurs sont celles de la
  maquette v7 (`SKITRACK v7 - App.dc.html`, handoff Claude Design du
  13 septembre 2026) ».
- `src/design/v7.css` (4 182 lignes) transcrit les styles en ligne en classes.
- Les cinq écrans du parcours existent et suivent la structure du design.
- La passe de conformité à l'export du 16 (PR #23, fusionnée ce matin) a déjà
  corrigé une trentaine d'écarts et consigné quatre écarts assumés dans
  `docs/design/v7-ecarts.md`.

Conséquence sur la méthode que vous avez posée : **« Étape 1, jetons : crée le
fichier de jetons » est déjà faite à 90 %.** Le tableau du § 2 le montre valeur
par valeur. La question n'est pas « quels jetons créer » mais « lesquels des
onze écarts restants faut-il aligner sur le design, et lesquels sont des
corrections à garder ».

### 0.3 Trois conflits que la règle 8 m'interdit de trancher

Ils sont détaillés au § 5. En deux lignes :

1. **Le gris `#8a919b`, employé 62 fois dans le design, mesure 3,05:1 sur la
   surface `#fafafb`.** Le dépôt l'a relevé à `#646b75` pour cette raison,
   commentaire à l'appui. La fidélité au pixel et la lisibilité se contredisent
   ici, et huit autres couleurs sont dans le même cas.
2. **Le design est mono-thème.** Il n'a qu'une palette claire, en dur. Le dépôt
   a un thème sombre complet (`src/styles.css`, 1 325 lignes) avec une bascule
   réelle. « Fidélité au pixel » sur un design mono-thème veut dire, à la
   lettre, supprimer le thème sombre.
3. **Le design emploie `→`, `↗` et `←` comme icônes** (16 occurrences). Votre
   contrainte de style permanente dit : « icônes dessinées en SVG
   (currentColor), jamais de glyphe Unicode ni d'emoji en guise d'icône ». La
   règle 2 d'aujourd'hui dit de reprendre les icônes du design. Les deux se
   contredisent sur ces seize caractères.

Rien d'autre ne déclenche la règle 7 : **aucun emoji**, et **aucun fond blanc
pur** — la seule occurrence de `#fff` est la couleur d'un flocon de neige sur
une photo sombre, ce qui est légitime. La surface du design est `#fafafb`.

---

## 1. Écrans, sections, composants

Correspondance établie ligne à ligne avec le design. « Modifier » veut dire que
le composant existe et couvre le besoin, mais que des valeurs ou des états
diffèrent ; le détail de ces écarts est du ressort des étapes suivantes.

### 1.1 Coquille et panneau de séjour

| Design | Lignes | Dépôt | Action |
| --- | --- | --- | --- |
| `<dc-import name="V7Coquille">` — barre, marque, cinq étapes, verrous, thème, langue, « Plus » | 33 + `V7Coquille.dc.html` | `src/components/Coquille.tsx` | Modifier |
| Capteur de clic plein écran (`inset:0;z-index:25`) | 35 | `src/components/v7/fermeture.ts` (`useFermeture`, garde) | Réutiliser |
| Panneau « Votre séjour » : calendrier deux mois, compteurs | 36-59 | `Coquille.tsx` + `v7/Calendrier.tsx` + `v7/Compteur.tsx` | Modifier |
| Variante `part="tabbar"` (barre du bas, quatre colonnes) | `V7Coquille.dc.html:52-64` | **absent** | Créer — *ou pas : voir § 5.4* |
| Toast | 465 | `src/components/v6/Toast.tsx` | Réutiliser |
| Neige (44 flocons, `position:fixed`, `z-index:12`) | 488, 944-945 | `src/components/Flocons.tsx` (canevas, confiné à la couverture) | Modifier — *écart assumé, § 5.5* |

### 1.2 Accueil

| Design | Lignes | Dépôt | Action |
| --- | --- | --- | --- |
| Couverture pleine page, voile, titre en deux temps, chapô | 63-69 | `src/routes/index.tsx` (`.hero7`) | Modifier |
| Barre de recherche en cinq segments (64 px de haut) | 71-81 | `index.tsx` (`.sbar7`) | Modifier |
| Voile de fermeture des panneaux (`inset:0;z-index:9`) | 70 | `index.tsx` (`.hero7__fond`) + `useEchap` | Réutiliser |
| Panneau Suggestions | 82-87 | `index.tsx` | Modifier |
| Panneau Dates (calendrier deux mois) | 88-105 | `v7/Calendrier.tsx` | Réutiliser |
| Panneau Altitude (trois curseurs) | 106-113 | `index.tsx` | Modifier |
| Panneau Voyageurs (compteurs + 4 raccourcis) | 114-124 | `index.tsx` + `v7/Compteur.tsx` | Modifier |
| Indice de défilement (bouton, `showCue`, `goDown`) | 125-130 | `index.tsx` (`.hero7__suite`, inerte) | Modifier — *écart assumé, § 5.5* |
| Section « Plus grands domaines » (6 vignettes) | 131-146 | `index.tsx` + `v7/CarteStation.tsx` | Modifier |
| Section « Par massif » (7 cartes) | 147-152 | `index.tsx` | Modifier |

### 1.3 Comparer

| Design | Lignes | Dépôt | Action |
| --- | --- | --- | --- |
| En-tête « Étape 1 » + h1 « Stations » | 160 | `src/routes/comparer.tsx` | Modifier |
| Barre collante (`top:60px`, `z-index:29`) : recherche, Filtres, tri | 162-170 | `comparer.tsx` (`.filtres7`, collante à 138 px) | Modifier — *écart assumé, § 5.5* |
| Panneau Filtres : raccourcis, 5 curseurs, 4 curseurs de couleur, massif, domaine | 171-187 | `comparer.tsx` (`.pop7--filtres`) | Modifier |
| Tableau de comparaison (jusqu'à 4 stations) | 190-202 | `comparer.tsx` (`.cmp7`) | Modifier |
| Jetons de critères actifs | 204-211 | `comparer.tsx` (`.jetons7`) | Réutiliser |
| Liste de vignettes (60 au plus) + carte à épingles | 215-239 | `comparer.tsx`, `v7/CarteEpingles.tsx`, `v7/epingle.ts` | Modifier — *§ 5.3* |
| État vide | 231-238 | `v7/Vide.tsx` | Réutiliser |

### 1.4 Station

| Design | Lignes | Dépôt | Action |
| --- | --- | --- | --- |
| Branche « station inconnue » | 245-249 | `src/routes/stations.$id.tsx` | Réutiliser |
| Bandeau photo (`min-height:340px`) + crédit | 253-261 | `stations.$id.tsx` + `v6/ImageSlot.tsx` | Modifier |
| Forfaits | 264-275 | `stations.$id.tsx` + `v7/useForfait.ts` | Réutiliser |
| Météo aux deux altitudes | 276-290 | `stations.$id.tsx` | Réutiliser |
| Bande 14 jours (`repeat(14,minmax(0,1fr))`) | 291-295 | `stations.$id.tsx` | Modifier |
| Pistes par couleur | 297-301 | `v7/PartPistes.tsx` | Réutiliser |
| Webcams | 302 | `stations.$id.tsx` + `src/lib/webcams.ts` | Modifier — *le dépôt en a, le design non* |
| Bulletin d'avalanche | 303-304 | `stations.$id.tsx` + `src/lib/bra/` | Modifier — *5 états contre 1* |
| Panneau de séjour à droite (`sticky top:254px`) | 305-311 | `stations.$id.tsx` (`.aside7`, 138 px) | Modifier |
| Onglets « Fiche station / Logements » | **absent du design** | `v7/OngletsStation.tsx` | *Ajout du dépôt — § 5.5* |

### 1.5 Logements

| Design | Lignes | Dépôt | Action |
| --- | --- | --- | --- |
| En-tête + résumé de séjour à droite | 321-331 | `src/routes/logements.tsx` | Modifier — *§ 5.2* |
| Ruban de station (`64px minmax(0,1fr) auto`) | 332-336 | `logements.tsx` (`.ruban7`) | Réutiliser |
| Jetons + barre de filtres | 337-346 | `logements.tsx` | Modifier |
| Panneau de filtres (5 curseurs + cases) | 347-367 | `logements.tsx` (`.pop7--large`) | Modifier |
| Liste d'annonces + carte aux prix | 368-398 | `logements.tsx`, `CarteEpingles.tsx`, `epingle.ts` | Modifier — *§ 5.3* |
| Barre de retenue en bas | 403-410 | `logements.tsx` (`.pied7`) | Réutiliser |
| Volet latéral d'annonce | 411-422 | `logements.tsx` (`.volet7`) + `LodgeSheet.tsx` | Modifier |

### 1.6 Réservation

| Design | Lignes | Dépôt | Action |
| --- | --- | --- | --- |
| En-tête « Étape 3 » | 429 | `src/routes/reservation.tsx` | Réutiliser |
| Bandeau « partagé » / « réservé » | 430-431 | `reservation.tsx` (`.bandeau7`) | Réutiliser |
| Section logement (`200px minmax(0,1fr)`) | 434-441 | `reservation.tsx` | Modifier |
| Cartes Station et Séjour | 443-444 | `reservation.tsx` (`.carte7-sect`) | Modifier |
| Encadré de droite : coût, case réservé, deux copies | 448-460 | `reservation.tsx` (`.aside7`, `.cout7`) | Modifier |

### 1.7 Panneau « Centrales de réservation »

| Design | Lignes | Dépôt | Action |
| --- | --- | --- | --- |
| Voile, modale centrée, 4 compteurs, table 5 colonnes | 466-487 | **absent** | **Ne rien faire — § 5.1** |

---

## 2. Jetons

### 2.1 Couleurs — ce qui est déjà en place

Dix-neuf des vingt-huit couleurs du design sont **déjà** des jetons, à la
valeur exacte. Rien à faire sur celles-ci.

| Valeur du design | Occurrences | Jeton existant |
| --- | --- | --- |
| `#5b636e` | 83 | `--color-muted` |
| `#fafafb` | 76 | `--color-surface` |
| `#16191e` | 60 | `--color-ink` |
| `#0b6fc2` | 30 | `--color-cta`, `--color-marque`, `--color-piste-bleue` |
| `#eceef1` | 30 | `--color-line-douce` |
| `#085291` | 24 | `--color-marque-texte`, `--color-neige-texte` |
| `#dde0e5` | 22 | `--color-line` |
| `#e9ebee` | 8 | `--color-glacier` |
| `#f2f3f5` | 2 | `--color-bg` |
| `#e6f0fa` | 2 | `--color-marque-tenue`, `--color-neige` |
| `#e6e9ed` | 2 | `--color-carte-fond` |
| `#dfe3e8` | 3 | `--color-media` |
| `#e3e6ea` | 3 | `--color-media-autre` |
| `#c8372d` | 4 | `--color-piste-rouge` |
| `#2f9e5a` | 4 | `--color-piste-verte` |
| `#22262c` | 4 | `--color-piste-noire` |
| `#8a5a12` | 3 | `--color-alerte-texte` |
| `#f7ecd6` | 1 | `--color-alerte` |
| `#c9d3dc` | 1 | `--color-hero-fond` (proche : `#dfe6ee`) |

### 2.2 Couleurs — les neuf écarts à arbitrer

| Valeur du design | Occ. | Emploi | État du dépôt | Contraste sur `#fafafb` |
| --- | --- | --- | --- | --- |
| `#8a919b` | **62** | libellés secondaires : « Pistes », « Village », « Forfait 6 j », compteurs, unités | **`--color-texte-3: #646b75`** (relevé exprès) | **3,05:1 — échoue** |
| `#c9ced5` | 8 | bordure de segment au survol, anneau de champ | aucun jeton | 1,52:1 (bordure, pas du texte) |
| `#4a5560` | 6 | survol d'un libellé de segment | aucun jeton | 7,4:1 |
| `#f0f1f3` | 6 | survol d'une surface | aucun jeton | — |
| `#1f7a4d` | 4 | « relevé chez la source » | **`--color-ok-texte: #1b6f45`** | 5,10:1 (design) / 5,9:1 (dépôt) |
| `#6b737d` | 3 | texte tertiaire au survol | aucun jeton | 4,60:1 |
| `#3f4a56` | 2 | survol appuyé | aucun jeton | 9,1:1 |
| `#7b838d` | 1 | prix d'une annonce déjà vue, sur pastille | aucun jeton | 3,68:1 |
| `#dcdfe4` | 1 | survol du bouton d'effacement | aucun jeton | — |

Proposition, **si** vous tranchez en faveur de la fidélité : `--color-survol-encre` (`#4a5560`),
`--color-survol-appui` (`#3f4a56`), `--color-survol-surface` (`#f0f1f3`),
`--color-survol-ligne` (`#dcdfe4`), `--color-anneau` (`#c9ced5`),
`--color-texte-4` (`#6b737d`), `--color-epingle-vue` (`#7b838d`).

### 2.3 Typographie

Le design emploie **douze tailles**. L'échelle du dépôt en a six. Six tailles
du design n'ont donc aucun jeton, et ont été absorbées par la voisine.

| Taille | Occ. | Jeton |
| --- | --- | --- |
| `12px` | 95 | `--text-note` |
| `13.5px` | 81 | `--text-detail` |
| `15px` | 40 | `--text-corps` |
| `13px` | **31** | **aucun** |
| `20px` | 27 | `--text-section` |
| `11px` | **13** | **aucun** |
| `14px` | **12** | **aucun** |
| `30px` | 7 | `--text-titre` |
| `17px` | **4** | **aucun** |
| `22px` | **2** | **aucun** |
| `12.5px` | **1** | **aucun** |
| `clamp(44px,4.4vw,64px)` | 1 | `--text-affiche` |

Graisses : `500` (15), `600` (39), `700` (108), `800` (48) — Manrope, quatre
graisses, toutes déjà chargées.
Interlettrage : `-.025em` (1), `-.02em` (12), `-.01em` (16), `.06em` (11).
Interlignage explicite : `1` (4), `1.02` (1), `1.3` (2), `22px` (2).

**Conséquence** : la fidélité au pixel demande **six jetons de taille en plus**
(11, 12.5, 13, 14, 17, 22 px), ce qui porte l'échelle de six à douze valeurs et
retire au système la propriété que son en-tête revendique (« cinq tailles »).
C'est un arbitrage, pas une évidence — voir § 5.6.

### 2.4 Rayons

| Valeur | Occ. | Jeton |
| --- | --- | --- |
| `999px` | 53 | `rounded-full` |
| `50%` | 28 | cercle |
| `14px` | 22 | `--radius-surface` |
| `10px` | 9 | `--radius-champ` |
| `16px` | 5 | `--radius-flottant` |
| `12px` | 4 | **aucun** |
| `24px` | 3 | **aucun** |
| `3px`, `8px`, `20px`, `4px`, `6px` | 7 | ponctuels (barres, jauges) |

### 2.5 Ombres et flous

| Valeur | Occ. | Jeton |
| --- | --- | --- |
| `0 2px 6px rgba(22,25,30,.08),0 18px 48px rgba(22,25,30,.18)` | 3 | `--shadow-flottant` ✅ |
| `0 2px 6px rgba(22,25,30,.06),0 14px 36px rgba(22,25,30,.08)` | 2 | `--shadow-encadre` ✅ |
| `0 2px 6px rgba(22,25,30,.10),0 18px 48px rgba(22,25,30,.22)` | 3 | **aucun** |
| `0 2px 6px rgba(22,25,30,.10),0 14px 36px rgba(22,25,30,.18)` | 1 | **aucun** |
| `inset 0 0 0 1.5px #16191e` | 2 | **aucun** (anneau de sélection) |
| `inset 0 1px 0 rgba(255,255,255,.7),0 16px 40px rgba(22,25,30,.28)` | 1 | **aucun** (segment actif) |
| `0 24px 64px rgba(22,25,30,.32)` | 1 | **aucun** (modale d'audit) |
| `-2px 0 6px …,-18px 0 48px rgba(22,25,30,.16)` | 1 | **aucun** (volet latéral) |
| `0 1px 6px rgba(22,25,30,.35)` | 1 | `--shadow-epingle` ✅ |
| `0 0 0 1px #0b6fc2` | 1 | **aucun** (focus) |

Flous : `blur(18px)` ×4, `blur(14px)` ×2, `blur(12px)` ×2,
`blur(18px) saturate(1.4)` ×1, `blur(16px)` ×1, `blur(10px)` ×1. **Aucun n'est
jetonné** ; `v7.css` les écrit en clair.

### 2.6 Mouvement

| Valeur | Emploi |
| --- | --- |
| `transform .12s` ×2, `transform .1s` ×1 | appui sur un bouton |
| `v7fade 1.1s ease-out .3s both` | titre, fragment 1 |
| `v7fade 1.1s ease-out 1.6s both` | titre, fragment 2 |
| `v7fade 1s ease-out 2.7s both` | chapô |
| `v7fade 1s ease-out 3.2s both` | barre de recherche |
| `v7fade 1s ease-out 3.7s both` | jetons / indice |
| `@keyframes v7fall` | neige |
| `@media (prefers-reduced-motion: reduce)` | `animation:none !important; opacity:0 !important` sur `.v7flake` |

Le dépôt a `--ease-ui: cubic-bezier(.2,0,0,1)`, que **le design n'emploie
nulle part** : il s'en tient à `ease-out`. Écart à trancher.

### 2.7 Espacement, cotes, empilement

- `gap` : 226 occurrences, 18 valeurs distinctes, toutes multiples de 1 px —
  les plus fréquentes `8px` (36), `2px` (35), `12px` (33), `6px` (20),
  `10px` (19), `16px` (13), `1px` (12).
- Hauteurs de commande : `40px` (23), `32px` (15), `36px` (6), `30px` (5),
  `64px` (5, segments d'accueil), `48px` (4).
- Largeurs de panneau : `720px` (séjour), `520px` (altitude), `460px`
  (filtres Comparer), `440px`, `420px`, `400px` (volet).
- `max-width` de page : `1280px` (7), `min-width: 1100px` sur la coquille.
- `z-index` : 9, 10, 25, 26, 28, 29, 30, 40, 41, 45, 46, 100, 500.
- Ancrages collants : `top:60px` (barre Comparer), `top:254px` (aside
  Station), `top:138px` (aside Réservation), `top:84px`, `top:80px`,
  `top:130px`, `top:48px`, `top:4vh` (modale).

---

## 3. Interactions et états

### 3.1 État de l'application (design, l. 494-500)

```
screen, stations, forfaits, D
q, qId, massif, f{v,lo,hi,km,pass}, unit, col{green,blue,red,black}, dom, chipsOn, sort, filtersOpen
cmp[], pick, station, fiche, lodge, sheet, seen{}
lf{budget,pp,cap,rooms,dist,src{},measured,link,photo,firm,pos}, lfOpen, lsort
stay{from,nights,trav,rooms}, stayOpen
homePanel, calMonth, calPick, calPhase
wx{}, toast, bC, bL, radiusKm, centrales, auditOpen
```

### 3.2 Écouteurs globaux (l. 552-557)

- `pointerdown` en capture : ferme `filtersOpen` si le clic n'est ni dans
  `[data-panel="filters"]` ni sur `[data-panel-btn="filters"]` ; même règle
  pour `lfOpen`.
- `keydown` Échap : remet à zéro `stayOpen`, `filtersOpen`, `lfOpen`, `sheet`,
  `auditOpen`, `homePanel`, `calPick`, et `calPhase` à `'from'`.
- `scroll` passif : `showCue` bascule à 45 % de la hauteur de couverture.

**État du dépôt** : les deux règles sont en place depuis la PR #23
(`src/components/v7/fermeture.ts`), sauf `calPick`/`calPhase` qu'Échap ne remet
pas à zéro, et `auditOpen` qui n'existe pas.

### 3.3 États définis par élément

| Élément | États du design |
| --- | --- |
| Segment de la barre d'accueil | repos / survol (`background:rgba(22,25,30,.04)`) / actif (`background:#fafafb` + ombre `inset 0 1px 0 rgba(255,255,255,.7),0 16px 40px rgba(22,25,30,.28)`) |
| Bouton `.btn7` | repos / survol / appui (`transform:scale(.9)`, `.12s`) |
| Puce de raccourci | décochée (bordure `#dde0e5`) / cochée (fond `#16191e`, texte `#fafafb`) |
| Vignette de station | repos / survol / dans la comparaison (`inset 0 0 0 1.5px #16191e`) |
| Épingle de carte | normale / survolée / retenue / déjà vue (`#e2e5e9` / `#7b838d`) |
| Champ de recherche | repos (`border:#dde0e5`) / survol (`border-color:#16191e`) / focus |
| Annonce | repos / retenue (pastille) / déjà vue (mention) |
| Liste | chargement (`Relevé en cours…`) / vide filtres / vide cadrage / vide relevé |
| Météo | `lv.ok` / `lv.msg` |
| Forfaits | `fi.pass` / `fi.noPass` |
| Mix de pistes | `fi.hasMix` / `fi.noMix` |

---

## 4. Écarts avec le modèle de données

| Sujet | Design | Dépôt | Portée |
| --- | --- | --- | --- |
| Référentiel | `stations-map-data.json`, 318 stations, champs courts (`n,m,v,lo,hi,km,lifts,g,dom,share,cnt,pct,src`) | `src/lib/stations.ts`, **320 stations**, champs longs | `src/lib/v7.ts` fait déjà la correspondance, champ par champ |
| Rattachement au domaine | `dom` : une chaîne | `Station.domain` + `forfaits/catalog.ts` (`domainForStation`) + `DOMAIN_FIXES` | Le dépôt distingue station et domaine là où le design a un seul champ |
| Altitudes | `lo`/`hi` toujours présents | `minM`/`maxM` valent 0 quand le classeur se tait ; `alt()` rend `null` | Le design n'a pas de cas « non relevé » |
| Annonces | relevé figé `RELEVE_2A` (`v7-data.js`), aucun total à zéro, aucun « à partir de » | relevé figé **plus** relevé en direct ; `total: 0` = prix non publié ; `priceIndicative` | Le design ne couvre aucun de ces deux cas |
| Chambres | `bedrooms` seul | `bedrooms` **et** `rooms` (pièces), convertis par `normalizedBedrooms` | Les centrales comptent en pièces |
| Périmètre | 4 pastilles fixes (5, 12, 25, 50 km), défaut 12 | curseur 10-30 km, défaut 15, plus la priorité du domaine sur la distance | Décision antérieure, documentée dans `lodgingFilter.ts` |
| Position GPS | `lat`/`lon` bruts | `GPS_FIXES` absentes ici, mais `pinKind`, `gpsDup`, `demM` | — |
| Forfaits | graine du catalogue | graine **plus** relevé daté (`getForfait`) | Le design n'a pas de date de relevé |
| Webcams | aucune source | `src/lib/webcams.ts` | Le design écrit l'absence en dur |
| Bulletin d'avalanche | un bloc figé | 5 états (`src/lib/bra/api.ts`) | Le design est muet, pas juste |
| Centrales | `CEN_CHERCHER`, `CEN_FICHIER`, `CEN_ETAT`, `CEN_DEMENTIS` recopiés à la main du dépôt (l. 660-712), déjà périmés | `src/lib/scrape/centrales/registre.ts` — **surface verrouillée** | Le design copie le dépôt, pas l'inverse |
| Photos | `image-slot.js`, emplacements | `src/lib/skiinfo.photos.json` — **surface verrouillée en écriture** | Lecture seule : branchement possible, régénération interdite |

---

## 5. Questions ouvertes — je m'arrête ici

### 5.1 Le panneau « Centrales de réservation » (l. 466-487)

Il est **inatteignable dans la maquette elle-même** : `auditOpen` naît à
`false`, Échap le remet à `false`, et `openAudit` — seule fonction qui le
passerait à `true` — n'est liée à aucun balisage, dans aucun des dix fichiers
de l'export. Ses compteurs (« 49 centrales de station, 5 de domaine »,
« 27 connecteurs, 19 qui répondent ») sont tapés à la main, et son bandeau
finit par « Les annonces affichées dans **cette maquette** viennent du relevé
du 3 sept. 2026 aux 2 Alpes ».

> **Question 1** — Le porter demanderait d'inventer un déclencheur que le
> design ne donne pas, et d'afficher des chiffres qui ne sont calculés nulle
> part. Je le laisse de côté, comme aujourd'hui ? Ou vous voulez un vrai
> panneau d'audit, branché sur `registre.ts`, avec un point d'entrée à définir
> ensemble ?

### 5.2 La pilule de séjour sur Comparer et Logements

Le design calcule `showStayBar: screen !== 'compare' && screen !== 'lodgings'`
(l. 918) : il la retire de ces deux écrans parce qu'il met à la place, sur
Logements, un résumé de séjour dans l'en-tête (l. 321-331). Le dépôt garde la
pilule et n'a pas ce résumé.

> **Question 2** — J'ajoute le résumé de séjour à l'en-tête des Logements
> **puis** je retire la pilule des deux écrans (ordre obligatoire, sinon on
> perd le seul accès aux dates et au groupe) ? Ou on garde la pilule ?

### 5.3 Les étiquettes de nom sur les épingles

Le design dessine, à côté de chaque pastille, une étiquette de nom séparée avec
un algorithme d'évitement (`declutterC`, l. 517-530), attache un `bindTooltip`
Leaflet et fait du clic un `go('station', id)`. Le dépôt a délibérément refait
cela : boîte fixe de 32 px, aucun texte dans la pastille (le nom vit dans
`aria-label`), pas de `title` natif, fiche de survol et fiche épinglée qui
coexistent. C'est écrit dans `src/components/v7/epingle.ts`.

> **Question 3** — Fidélité au design (étiquettes + infobulle Leaflet + clic
> qui navigue), ou on garde la carte actuelle ?

### 5.4 La barre du bas (`part="tabbar"`)

`V7Coquille.dc.html:52-64` définit une barre du bas à quatre colonnes.
`App.dc.html:33` importe la coquille **sans attribut `part`**, donc la valeur
par défaut `'top'` s'applique : l'application du design n'instancie jamais
cette barre. Son conteneur porte d'ailleurs `min-width:1100px`.

> **Question 4** — La porter, c'est ouvrir le chantier du responsive, qui n'est
> pas dans ce design. Je la laisse ?

### 5.5 Cinq écarts assumés, déjà consignés

`docs/design/v7-ecarts.md` les porte, avec leur raison. La règle 3
d'aujourd'hui (« aucune suppression ni simplification ») les remet en jeu :

1. **Neige** : design = 44 flocons fixes au-dessus des cinq écrans ; dépôt =
   canevas confiné à la couverture, sous le texte. Un voile fixe passerait
   devant le tableau de comparaison, les listes et la carte Leaflet.
2. **Indice de défilement** : design = bouton qui défile en douceur et
   s'efface à 45 % ; dépôt = ornement inerte (`aria-hidden`,
   `pointer-events:none`).
3. **Onglets « Fiche station / Logements »** : ajout du dépôt, absent du
   design. La règle 2 (« aucun ajout ») demanderait de les retirer — mais
   alors rien ne ramène des logements à la fiche.
4. **Bulletin d'avalanche** : 5 états contre 1 ; **webcams** : réelles contre
   une phrase d'absence en dur.
5. **Voile de la couverture** : le dépôt l'a renforcé
   (`8% → 18%@24% → 68%@44% → 90%`) parce que le dégradé du design donnait
   1,65:1 sur le titre. Mesuré 7,5-10:1 après.

> **Question 5** — Lesquels de ces cinq faut-il ramener au design ? Ma
> recommandation : aucun, et je les documente mieux. Mais c'est votre appel.

### 5.6 Les trois conflits structurels du § 0.3

> **Question 6 — contraste.** `#8a919b` sur `#fafafb` = **3,05:1**, employé
> 62 fois pour les libellés secondaires. Le dépôt l'a relevé à `#646b75`
> (4,9:1). Trois issues : (a) fidélité stricte, on redescend à `#8a919b` et
> l'interface repasse sous le seuil ; (b) on garde `#646b75` et cet écart est
> assumé, comme aujourd'hui ; (c) on cherche une valeur qui tienne 4,5:1 en
> restant au plus près. Je ne tranche pas.
>
> **Question 7 — thème sombre.** Le design est mono-thème. Le dépôt a un thème
> sombre complet et une bascule réelle (là où le design a un bouton inerte avec
> un soleil fixe). « Fidélité au pixel » à la lettre veut dire le supprimer.
> Je suppose que non — confirmez.
>
> **Question 8 — flèches Unicode.** `→` (12), `↗` (3), `←` (1) servent
> d'icônes dans le design. Votre contrainte permanente les interdit au profit
> de SVG. Je les dessine en SVG (ce que fait le dépôt aujourd'hui), ou je
> reprends les glyphes du design ?

### 5.7 Une question de méthode

Votre § « Vérification visuelle obligatoire » demande d'ouvrir le HTML du
design et l'écran implémenté côte à côte dans Playwright. C'est faisable —
Chromium est disponible, je l'ai employé ce matin. Deux réserves à lever :

- Le design charge **Leaflet et Manrope depuis le réseau**
  (`unpkg.com`, `fonts.googleapis.com`). Le proxy de cet environnement bloque
  les tuiles OpenStreetMap : les cartes ne se compareront pas. Les autres
  surfaces, si.
- `support.js` fabrique l'environnement `<sc-if>` / `<sc-for>` / `{{ }}`.
  Ouvert tel quel, le design **rend le prototype avec ses données figées**
  (relevé du 3 septembre, 2 Alpes), pas les données du dépôt. La comparaison
  géométrique reste valable ; la comparaison de contenu, non.

> **Question 9** — Je compare sur les deux tailles demandées (1440×900,
> 1280×800) en acceptant ces deux réserves, en les redisant à chaque écran ?

---

## 6. Ce que je propose comme suite

Si vous répondez aux neuf questions, l'ordre naturel est :

1. **Jetons** — compléter `system.css` des valeurs arbitrées au § 2.2, 2.3,
   2.4, 2.5, puis retirer de `v7.css` les valeurs en clair correspondantes.
2. **Coquille** — c'est la seule surface commune aux cinq écrans.
3. **Accueil**, 4. **Comparer**, 5. **Station**, 6. **Logements**,
   7. **Réservation** — dans l'ordre du parcours, un écran par étape, avec la
   comparaison mesurée à chaque fin d'étape.

Rien n'est écrit tant que vous n'avez pas validé.
