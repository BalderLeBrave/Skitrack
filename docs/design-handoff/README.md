# Handoff SKITRACK — écart maquette v3 → dépôt

## À lire d'abord (Claude Code)

Dépôt cible : **BalderLeBrave/Skitrack**, branche `master` — application Electron + React +
TypeScript, feuille de style unique `src/renderer/src/styles.css`, état global dans
`src/renderer/src/state/`.

Les fichiers HTML de ce paquet sont une **maquette de référence**, pas du code à copier : ils
montrent l'intention visuelle et le comportement attendu. Le travail consiste à porter ces
comportements dans le dépôt, avec ses composants, ses classes CSS et ses conventions existantes
(`.chip`, `.linkbtn`, `.resultcard`, `useApp`, `useDerived`, catalogue `i18n`). Aucun style inline
de la maquette n'a à être repris tel quel : les valeurs, oui.

**Fidélité : haute.** Couleurs, typographie et espacements de la maquette sont ceux du dépôt
(mêmes jetons, Archivo, accent `#e0533f`). Les valeurs citées dans les chantiers sont à reprendre
exactes.

Dix chantiers indépendants suivent. Ordre conseillé en fin de document ; chacun est testable seul.
Ne pas utiliser `scrollIntoView`. Les chaînes nouvelles passent par le catalogue `i18n` (tuple de
sept : `fr, en, de, nl, es, it, af`).

Pour ouvrir la maquette : `SKITRACK - App v3.dc.html` + `support.js` + `skitrack-referentiel.json`
dans le même dossier, servis par un serveur statique local.

## Ce que contient ce paquet

`SKITRACK - App v3.dc.html` et `support.js` sont une **maquette de référence en HTML** : un
prototype qui montre l'aspect et le comportement voulus. Ce n'est pas du code à copier dans
l'app. La cible est le dépôt Electron + React TypeScript (`src/renderer/src/`), avec ses
composants, sa feuille de style unique et son i18n maison.

Ouvrir la maquette : les deux fichiers dans le même dossier, puis ouvrir le `.dc.html` dans un
navigateur.

**Fidélité : haute.** Valeurs exactes ci-dessous, à reprendre telles quelles.

## État réel : la plus grande partie est déjà dans le dépôt

Vérifié fichier par fichier avant d'écrire ce document. Sont **déjà implémentés** et n'ont pas
besoin d'être retouchés :

- i18n sept langues (`src/renderer/src/i18n/index.ts`, 892 lignes, catalogue indexé par clé,
  repli sur le français, `LOCALES`, `formatDuration`, `formatNumber`, clé `ago_pattern`) ;
- sélecteur de langue en barre supérieure (`App.tsx`) et dans les réglages (`SettingsPage.tsx`) ;
- fiche domaine complète (`DomainSheet.tsx`) : neige au sol, météo aux deux altitudes matin et
  après-midi, isotherme, prévisions 14 jours aux deux altitudes, webcams avec sélecteur, BRA
  avec saisie manuelle horodatée, forfaits ;
- table de webcams vérifiées (`data/webcams.ts`) et connecteur BRA (`data/bra.ts`) ;
- panneau de filtres avec compteur, pastilles retirables et sections repliables
  (`FilterPanel.tsx`) ;
- mentions légales (`pages/LegalSection.tsx`) ;
- jetons de thème clair et sombre identiques à la maquette (`styles.css`).

**Il reste quatre chantiers.** Ils sont décrits ci-dessous, du plus visible au plus discret.

---

## 1. `components/DomainCard.tsx` — refonte de la hiérarchie

C'est le seul écran dont la maquette diverge encore franchement du dépôt.

### Ce qui disparaît de la carte

| Élément actuel | Raison |
| --- | --- |
| `<DomainLogo …>` dans `domcard__ident` | Le carré d'initiales n'apporte rien. Le titre prend toute la largeur. |
| `domcard__trend` (courbe SVG + `hist.txt`) | La tendance de prix ne vit plus que dans la fiche du domaine. |
| `risque ~N/5` dans `domcard__snow` | Indice dérivé, pas le BRA. Le risque ne s'affiche plus que dans la fiche, et seulement s'il a été relevé à la main. |
| `{derived.hh.length > 1 && … Trajets : …}` | Les trajets par foyer passent en section de la fiche. |
| Bouton « tarifs » dans la cellule forfait | Le lien vers la billetterie descend dans la fiche. |
| Bouton « comparer les autres à celui-ci » (pied de carte) | Supprimé. |

`avalancheIndex`, `riskColor`, `domainPriceHistory` et `DomainLogo` ne sont plus importés par ce
fichier. Vérifier qu'ils restent utilisés ailleurs avant de les supprimer de leur module.

### Ce qui remplace la liste de sept données

Quatre chiffres décisifs, sur une ligne encadrée, puis une ligne de contexte grise.

```tsx
<dl className="domcard__figs">
  <div>
    <dt>{t('altitude_base')}</dt>
    <dd className="u-num domcard__fig domcard__fig--accent">{fmt(d.min)} m</dd>
  </div>
  <div>
    <dt>{t('slopes')}</dt>
    <dd className="u-num domcard__fig">{fmt(d.km)} km</dd>
  </div>
  <div>
    <dt>{t('pass_6d_adult')}</dt>
    <dd className="u-num domcard__fig">
      {forfait.j6 != null ? `${forfait.estimated ? '≈ ' : ''}${eur(forfait.j6)}` : '—'}
    </dd>
  </div>
  <div>
    <dt>{t('travel')}</dt>
    <dd className="u-num domcard__fig u-nowrap">{dur(derived.worstTravel(d))}</dd>
  </div>
</dl>

<p className="domcard__meta">{metaLine}</p>
```

`metaLine` se compose en amont du JSX, pour que la traduction reste lisible :

```ts
const metaLine = [
  `${t('altitude_top_lower')} ${fmt(d.max)} m`,
  `${t('amplitude_lower')} ${fmt(d.max - d.min)} m`,
  `${d.lifts} ${t('lifts_plural')}`,
  `${t('snow_front_lower')} ${fmt(d.village)} m${d.curated ? '' : ` (${t('estimated')})`}`,
  `${fmt(derived.worstDistance(d))} km ${t('of_road')}`
].join(' · ')
```

### CSS à ajouter dans `styles.css`

```css
.domcard__figs {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(112px, 1fr));
  gap: 10px 14px;
  margin: 0;
  padding: 10px 0;
  border-top: 1px solid var(--border-soft);
  border-bottom: 1px solid var(--border-soft);
}
.domcard__figs dt { font-size: 12px; color: var(--muted); }
.domcard__fig {
  margin: 1px 0 0;
  font-size: 19px;
  font-weight: 700;
  letter-spacing: -0.02em;
}
.domcard__fig--accent { color: var(--accent); }
.domcard__meta { margin: 8px 0 0; font-size: 12px; color: var(--muted); }
```

### Discipline de l'accent

`var(--accent)` ne sert plus qu'aux actions et au **bas des pistes**, le critère structurant.
Passent en gras neutre (`var(--text)`) : trajet, forfaits, total d'une offre, prix d'un logement,
contribution d'un critère dans le détail du score, « pistes à pied » de la fiche logement.

### Textes en dur à faire passer par `t()`

Dans ce fichier : `Glacier`, `depuis la carte`, `carte · hors filtres`, `vérifié à la main`,
`hors carte`, `Position absente du référentiel…`, `Fiche du domaine →`, `Neige`, `(bas / haut)`,
`référentiel`, `Front de neige`, `Tarif estimé, non relevé`.

---

## 2. `domain/format.ts` — la locale n'est pas appliquée

Le fichier fixe `'fr-FR'` dans `fmt`, `eur`, `dur`, `fmtDate`, `fmtDay`, alors que la décision
produit est « tout localisé » : dates, séparateurs de milliers, devise et durées suivent la
langue. `LOCALES`, `formatNumber` et `formatDuration` existent déjà dans `i18n/index.ts` mais ne
sont pas utilisés par ces cinq fonctions, qui sont appelées partout.

Deux options, la seconde est préférable :

1. passer `lang` en paramètre à chacune — beaucoup de sites d'appel à modifier ;
2. exposer un hook `useFormat()` qui referme `lang` et renvoie `{ fmt, eur, dur, fmtDate, fmtDay }`,
   et remplacer les imports de `@/domain/format` par ce hook dans les composants. Garder les
   fonctions pures pour les modules non-React, avec `lang` explicite.

`eur` doit aussi suivre la locale pour la position du symbole : `1 250 €` en français,
`€1,250` en anglais. `Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' })` s'en
charge.

---

## 3. `data/lodgings.ts` — `agoTxt` ignore `ago_pattern`

La clé existe déjà dans le catalogue (ligne 320) :

```ts
ago_pattern: ['il y a {d}', '{d} ago', 'vor {d}', '{d} geleden', 'hace {d}', '{d} fa', '{d} gelede']
```

`agoTxt` écrit encore « il y a » en dur. Le piège rencontré sur la maquette : découper en
préfixe et suffixe ne marche pas, parce qu'une chaîne vide volontaire (l'anglais n'a pas de
préfixe) est indistinguable d'une traduction manquante et retombe sur le français. D'où le motif
unique avec `{d}`.

```ts
export function agoCore(m: number, lang: Language): string {
  if (m < 60) return `${m} ${translate('minutes', lang)}`
  if (m < 1440) return `${Math.floor(m / 60)} ${translate('hours', lang)} ${String(m % 60).padStart(2, '0')}`
  const d = Math.floor(m / 1440)
  return `${d} ${translate('days_short', lang)} ${Math.floor((m % 1440) / 60)} ${translate('hours', lang)}`
}

export function agoTxt(m: number, lang: Language): string {
  return translate('ago_pattern', lang).replace('{d}', agoCore(m, lang))
}
```

La pastille courte de fraîcheur d'une offre se construit à partir de `agoCore`, jamais en
retirant « il y a » de la chaîne française : `↻ ${agoCore(m, lang)}`.

---

## 4. Textes français résiduels hors `DomainCard`

| Fichier | Ligne | Texte |
| --- | --- | --- |
| `components/LodgingGeoPanel.tsx` | 49 | `Relevé ${agoTxt(…)}` |
| `components/LodgingSheet.tsx` | 148 | `Annulation gratuite · offre relevée il y a moins d'une heure` |
| `pages/TrackingPage.tsx` | 43 | `· résumé quotidien à 9 h` |
| `pages/TrackingPage.tsx` | 149 | `Résumé quotidien à 9 h plutôt qu'une alerte par baisse` |
| `pages/TrackingPage.tsx` | 247 | `premier relevé conservé` / `il y a 6 semaines` |
| `data/lodgings.ts` | 187, 189 | `source injoignable — dernier prix connu …`, `relevé …` |

Un test de complétude vaut mieux qu'une relecture : parcourir le catalogue et échouer si une
entrée a moins de sept valeurs, et interdire par lint les littéraux accentués dans le JSX de
`src/renderer/src/components` et `pages`.

---

## 5. Écran de chargement des logements — deux écrans en concurrence

Symptôme : au lancement, la recherche de logements affiche toujours l'ancien écran, quoi qu'on
change dans le nouveau. Ce n'est pas un problème de cache ni de build.

### Diagnostic

Deux composants de chargement coexistent, et ils ne sont pas pilotés par le même état :

| Composant | Condition d'affichage | Site |
| --- | --- | --- |
| `SkiSearchLoading` (nouveau) | `state.lodgPhase === 'searching'` | `LodgingsPage.tsx:316` |
| `LodgingScanCard` (ancien) | `state.lodgLoading === true` | `LodgingsPage.tsx:644` |

`lodgPhase` vaut `'results'` par défaut (`appState.tsx:334`) et ne figure pas dans la liste des
clés persistées (`appState.tsx:398`) : il repart donc à `'results'` à chaque lancement. Et les
trois entrées vers l'écran Logements allument `lodgLoading` sans jamais toucher `lodgPhase` :

- `DomainSheet.tsx:664` — `patch({ tab: 'logements', lodgingDomainId: d.id, domFicheId: null, lodgLoading: true })`
- `OffersPage.tsx:100` — `patch({ …, lodgLoading: true, ficheId: o.l.id })`
- `rescan()`, `LodgingsPage.tsx:157` — `patch({ lodgLoading: true })`

On entre donc en phase `results` avec `lodgLoading` vrai : la branche résultats se rend, et avec
elle l'ancienne carte. Seul `DomainCard.tsx:155` fait autrement, en posant `lodgPhase: 'criteria'`
et `lodgLoading: false` — c'est le seul chemin qui donne l'écran attendu.

S'ajoute à cela que l'effet de `LodgingsPage.tsx:137` est une **animation simulée** : il fait
défiler `LODG_SOURCES` avec des délais aléatoires (`190 + Math.random() * 170`) puis éteint
`lodgLoading` de lui-même. Elle ne mesure rien et n'a aucun lien avec la recherche réelle, qui
pilote `lodgPhase` depuis l'effet de la ligne 226.

### Correction

Supprimer `lodgLoading` en tant que second état de chargement. `lodgPhase` devient la seule
source de vérité.

1. Supprimer le rendu de `LodgingScanCard` (`LodgingsPage.tsx:644`) et l'effet simulé des lignes
   137 à 154, avec le `timer` et la constante `LODG_SOURCES` s'ils ne servent plus ailleurs. Le
   fichier `components/LodgingScanCard.tsx` peut partir.
2. Les trois entrées passent `lodgPhase: 'searching'` au lieu de `lodgLoading: true`.
3. `rescan()` devient `patch({ lodgPhase: 'searching' })`.
4. Retirer `lodgLoading` de `AppState` (`appState.tsx:190`) et de ses valeurs par défaut
   (`:333`). Les lectures restantes deviennent `state.lodgPhase === 'searching'` :
   `LodgingGeoPanel.tsx:49` et `:85`, `LodgingsPage.tsx:460` et `:712`.
5. Vérifier que l'effet de recherche (`LodgingsPage.tsx:226`) sort bien de `'searching'` dans
   tous ses chemins, y compris l'échec et l'expiration — sans quoi l'écran reste bloqué. Il pose
   déjà `lodgPhase: 'criteria'` en cas d'erreur (`:248`, `:259`) et `'results'` au succès
   (`:253`) ; l'expiration à `AIRBNB_SEARCH_TIMEOUT_MS` doit faire de même.

Une fois `lodgLoading` retiré du type, le compilateur signale lui-même les sites oubliés.

---

## 6. Les sources retirées restent dans les filtres

Décision : les sources encore interrogées sont **Airbnb, Booking.com et le site officiel de la
station**. Expedia, Hotels.com, Gîtes de France, cozycozy et LiteAPI ne le sont plus, et ne
doivent plus apparaître comme lignes de filtre : une ligne qu'aucun relevé ne peut rafraîchir
n'est pas un filtre, c'est un souvenir — décochable sans effet, comptée à zéro, et comptée dans
le total de l'écran de relevé.

### Où c'est écrit aujourd'hui

`src/renderer/src/data/lodgings.ts` — `LODG_SOURCES` est une liste en dur de sept noms, tenue à
jour à la main à chaque changement de connecteur, donc désynchronisée dès le premier oubli :

```ts
export const LODG_SOURCES = [
  'Site officiel de la station', 'Expedia', 'Airbnb', 'Booking.com',
  'Gîtes de France', 'cozycozy', 'LiteAPI'
]
```

### Correction : dériver la liste du moteur

La liste des sources interrogées existe déjà au bon endroit : `runProviderSearch` renvoie un
`outcome` **par connecteur enregistré**, avec son libellé d'interface (`sourceLabelOf`), et cela
même quand le connecteur ne rend aucune offre. C'est la seule source de vérité qui ne peut pas
se désynchroniser du moteur.

1. `LODG_SOURCES` ne garde que le socle qui ne passe pas par `providers.search` :

```ts
/** Sources hors moteur multi-sources : Airbnb est relevé par `runAirbnbSearch`,
 *  pas par un connecteur enregistré. */
export const BASE_SOURCES = ['Airbnb']
```

2. Mémoriser les libellés du dernier relevé (état de l'écran Logements), issus des `outcomes` :

```ts
setQueriedSources(result.outcomes.map((o) => o.source))
```

3. `lodgingSources` fait la réunion, comme aujourd'hui, mais sur cette base :

```ts
export function lodgingSources(list: Lodging[], queried: string[]): string[] {
  const out = [...BASE_SOURCES, ...queried.filter((s) => !BASE_SOURCES.includes(s))]
  for (const lodging of list) {
    const source = srcOf(lodging)
    if (source !== MANUAL_SOURCE && !out.includes(source)) out.push(source)
  }
  return out
}
```

Avant le premier relevé, `queried` est vide : la liste vaut `BASE_SOURCES` plus les sources
réellement présentes dans les offres, ce qui reste juste — on n'affiche que ce qu'on a.

4. Retirer LiteAPI du moteur, sinon ses offres reviendront par la réunion de l'étape 3 :
   `src/main/providers/index.ts` enregistre encore `LiteApiProvider` (et `createCozycozyWebProvider`,
   `createExpediaWebProvider`, `createGitesWebProvider` sous `enableWebScrape`). Ne garder que
   `BookingProvider` / `createBookingWebProvider` et `createStationProvider`. `RESERVED` dans
   `mcp/registry.ts` peut garder les noms retirés : ils restent réservés pour éviter qu'une source
   MCP déclarée se fasse passer pour eux.

5. `SRC_STATUS` : supprimer les entrées `Expedia` et `Gîtes de France`. Une source absente de la
   table n'a pas d'âge simulé et retombe déjà sur `fresh_last_search` — c'est le comportement
   voulu pour la centrale de station.

6. `sourceHealth()` prend déjà la liste en paramètre : lui passer `lodgingSources(...)` et non
   `LODG_SOURCES`, faute de quoi l'écran de relevé annonce plus de sources qu'il n'en interroge.

### Dans la maquette

Fait : `QUERIED_SOURCES` (trois noms), `lodgingSources(list)` pour la réunion, et un
`RETIRED_SOURCES` qui rattache les offres du catalogue simulé encore étiquetées Expedia /
Hotels.com / Gîtes de France à la centrale de station, en dédoublonnant — deux marques du même
distributeur ne font pas deux offres. Ce dernier point est propre au catalogue simulé et n'a pas
d'équivalent à porter dans le dépôt.

---

## 7. Écran Logements : bandeaux au-dessus de la liste, et en-tête trop fort

Après un relevé, quatre bandeaux s'empilent entre l'en-tête et la première vignette. Aucun n'est
une information qu'on lit deux fois, et ensemble ils repoussent les logements sous la ligne de
flottaison. Ils disparaissent tous ; ce qu'ils disaient existe déjà dans le panneau « État du
relevé » (`LodgingGeoPanel`), qui reçoit déjà `health`, `median`, `dupMerged` et `onRescan`.

### Ce qui disparaît de `pages/LodgingsPage.tsx`

| Bloc | Ligne (master) | Décision |
| --- | --- | --- |
| `{state.lodgSearchMsg && (<div className="srcbanner" …>` + bouton `OK` | ~« 12 nouvelle(s) · 12 prix actualisé(s) … sans réponse : … » | Supprimé. Le compte-rendu du relevé se lit pendant le relevé (`SkiSearchLoading` reçoit déjà `message`) ; passé le résultat, il n'a plus d'action associée. Garder `lodgSearchMsg` dans l'état, et le poser à `null` en entrant dans `'results'`. |
| Le `<div className="srcbanner">` permanent : « Les N sources sont à jour », médiane, « Fusionner les doublons », « Relancer le relevé » | fin du bloc `results` | Supprimé — doublon exact de `LodgingGeoPanel`. La case « Fusionner les doublons » et « Relancer le relevé » y sont déjà. |
| Pastille `btn--pill btn--warn` « ⚠ N position(s) à corriger » | en-tête | Conservée mais en texte : `className="linkbtn"` + `style={{ color: 'var(--warn)', fontSize: 12 }}`. Une alerte doit se voir, pas peser. |

Le bandeau « N prix relevé(s) pour d'autres dates » (`staleCount` / `recheck`) **reste** : il porte
une action qu'on ne trouve nulle part ailleurs (« Valider les nouvelles dates ↗ »).

### En-tête plus discret

Les huit contrôles de `<header className="lodgings__head">` sont aujourd'hui sept pastilles
bordées plus un titre à 15 px : autant de poids visuel que les vignettes qu'ils surplombent. Tous
passent en boutons-texte, le titre passe en libellé.

```tsx
&lt;h2 className="results__count"&gt;{derived.lodgList.length} logement(s)&lt;/h2&gt;
```

```css
/* styles.css */
.results__count { margin: 0; font-size: 12px; font-weight: 600; color: var(--muted); letter-spacing: 0; }
.lodgings__head { gap: 16px; margin-bottom: 14px; }
/* Zone tactile de 44 px conservée malgré le retrait du fond. */
.linkbtn--head { background: none; border: 0; padding: 15px 0; margin: -15px 0; font-size: 12px; font-weight: 600; color: var(--muted); white-space: nowrap; cursor: pointer; }
.linkbtn--head:hover { color: var(--text); }
.linkbtn--head.is-strong { color: var(--text); }
```

Remplacer `className="btn btn--pill"` par `className="linkbtn--head"` sur : « ◂ Filtres », « État
du relevé », « Dates flexibles », « ＋ Importer une annonce », « Afficher la carte ». « Rechercher »
perd `btn--primary` et prend `className="linkbtn--head is-strong"` : elle reste l'action lisible
de l'en-tête sans être un bouton plein — l'accent est réservé aux actions de la vignette.

La ligne « prix tout compris, N nuit(s), N personnes · offres de moins d'une heure » reste, à
12 px `u-muted`, immédiatement après le compte : c'est la seule phrase de contexte de l'écran.

### Dans la maquette

La maquette a par ailleurs été réalignée sur la présentation actuelle du dépôt (relecture de
`ResultCard`, `ResultGrid`, `LodgingCard`, `LodgingFilters`, `styles.css`) : vignette sans cadre à
média 4/3, pastille source sombre translucide, ligne de faits gauche/droite, prix sur une seule
ligne, signalements en dessous du filet, et filtres de sources en liste à pastille avec décompte.
Ce n'est pas un chantier : le dépôt est déjà là, c'est la maquette qui rattrapait son retard.

Pour l'en-tête, fait à l'identique : boutons-texte 12 px, compte en libellé muet, alerte ⚠ en texte.
La maquette n'a jamais eu les quatre bandeaux — l'état du relevé y a toujours été replié derrière
« État du relevé ». C'est cet état-là qui est la cible.

---

## 8. Filtres chiffrés : passer aux slicers de plage

Les huit filtres chiffrés de l'application sont aujourd'hui des bornes uniques (`altMin`,
`altMax`, `kmMin`, `travelMax`, `distMax`, `forfaitMax`, `lodgBudget`, `lodgDist`) rendues par un
`&lt;input type="range"&gt;`. La maquette les remplace par un **slicer de plage** : une piste, deux
poignées, la bande colorée entre elles, et deux champs chiffrés sous la piste — la borne se tape
quand on la connaît, au lieu de la chercher au pixel.

### Nouvel état (`state/appState.tsx`)

Chaque filtre devient un couple, avec un plancher et un plafond nommés. Une plage est **ouverte**
— donc inactive — quand la borne basse est au plancher et la haute au plafond.

| Filtre | Bornes | Plage | Pas |
| --- | --- | --- | --- |
| Bas des pistes | `baseMin` / `baseMax` | 0 – 2400 m | 50 |
| Point culminant | `summitMin` / `summitMax` | 0 – 4000 m | 100 |
| Kilomètres de pistes | `kmMin` / `kmMax` | 0 – 600 km | 10 |
| Temps de trajet | `travelMin` / `travelMax` | 0 – 720 min | 15 |
| Distance | `distMin` / `distMax` | 0 – 1200 km | 25 |
| Forfait 6 jours adulte | `forfaitMin` / `forfaitMax` | 0 – 400 € | 10 |
| Budget du séjour | `lodgBudgetMin` / `lodgBudgetMax` | 0 – 8000 € | 100 |
| Distance aux pistes | `lodgDistMin` / `lodgDistMax` | 0 – 1000 m | 50 |

`altMin` devient `baseMin` ; `altMax` (qui voulait dire « sommet au moins à ») devient
`summitMin`. `FILTER_DEFAULTS`, `LODG_FILTER_RESET` et la liste de clés persistées de
`appState.tsx:401` sont à reprendre : la borne haute se remet à son **plafond**, jamais à 0.

### Prédicats (`state/selectors.tsx`)

Deux fonctions, et rien d'inline :

```ts
const rangeOpen = (lo: number, hi: number, ceil: number): boolean =&gt; lo === 0 && hi &gt;= ceil
const inRange = (v: number, lo: number, hi: number, ceil: number): boolean =&gt;
  rangeOpen(lo, hi, ceil) || (v &gt;= lo && (hi &gt;= ceil || v &lt;= hi))
/** Valeur inconnue (temps de route, forfait non relevé) : écartée dès que la plage est posée. */
const inRangeOrNull = (v: number | null, lo: number, hi: number, ceil: number): boolean =&gt;
  rangeOpen(lo, hi, ceil) || (v != null && v &gt;= lo && (hi &gt;= ceil || v &lt;= hi))
```

`selectors.tsx:238` et suivantes remplacent les six comparaisons `!== 0 &&` ; `selectors.tsx:452`
et `:454` font de même pour les deux filtres de logement.

### Migration des préférences — indispensable

Piège rencontré et corrigé dans la maquette : l'ancien schéma écrivait `travelMax: 0` au sens
« pas de plafond ». Relu tel quel par le nouveau code, `[0, 0]` est une plage **posée**, qui
écarte tous les domaines — écran vide au lancement, sans erreur console. La lecture des
préférences doit donc migrer :

- `altMin → baseMin`, `altMax → summitMin`, `lodgBudget → lodgBudgetMax`, `lodgDist → lodgDistMax` ;
- toute borne haute absente ou nulle est remise à son plafond ;
- toute borne basse absente est mise à 0 ;
- marquer la version (`prefsSchema: 2`) pour ne migrer qu'une fois.

### Le composant

`components/RangeSlicer.tsx`, présentationnel : props `min`, `max`, `step`, `lo`, `hi`,
`format`, `unit`, `onChange(lo, hi)`. Comportement repris de la maquette :

- poignées en `role="slider"` focusables, `aria-valuemin/max/now/valuetext` renseignés ; flèches
  au pas du filtre, Page pour dix pas, Début / Fin aux bornes ;
- `pointerdown` sur une poignée capture le rectangle de la piste puis suit `pointermove` sur la
  fenêtre — pas de listener par image ;
- clic dans la piste : la poignée la plus proche vient au point cliqué **et reste attrapée** ;
- une borne poussée au-delà de l'autre les échange, plutôt que de bloquer le geste ;
- deux `&lt;input type="number"&gt;` sous la piste, clampés au même pas.

### En-têtes et intitulés

L'en-tête de chaque filtre passe sur deux lignes (libellé, puis valeur de plage en dessous) : la
valeur est bien plus longue qu'avant (« toutes altitudes ») et, en panneau étroit, une ligne
unique écrase la colonne du libellé — mesuré à 5 lignes de titre sur un aside de 220 px. Les six
intitulés du catalogue passent au neutre, les deux bornes étant réglables : `fMinBase` « Bas des
pistes », `fSummit` « Point culminant », `fKm` « Kilomètres de pistes », `fMaxTime` « Temps de
trajet », `fMaxDist` « Distance », `fPass6` « Forfait 6 jours adulte » — sept langues chacun.
Valeur affichée : `« 400 m – 1 450 m »`, `« 30 € – sans limite »`, ou l'état ouvert
(« toutes altitudes », « tous sommets », « toutes tailles », « tous trajets », « toutes
distances », « tous tarifs », « toutes les offres », « toutes les distances »).

Les puces de filtres actifs affichent la plage (« Bas 400 m – 1 450 m ») et leur croix rouvre la
plage entière au lieu de remettre une borne à 0.

---

## 9. Sources des logements : des bulles, pas une liste

`components/LodgingFilters.tsx` rend aujourd'hui les sources en `.srcrow` (pastille ●, nom,
« N offres ») suivies d'un bloc « Recherches pré-remplies » listant une URL par source avec
« copier » et « ouvrir ». La maquette réduit tout ça à une rangée de **bulles cliquables**, une par
source : nom + décompte, pleine (`.chip--on`) quand la source est affichée, vide et grise quand
elle est masquée. Disparaissent : les URL en clair, les boutons copier / ouvrir et le paragraphe
d'explication. Même géométrie que les puces « Type de bien » — `.chip` existe déjà, il n'y a pas
de CSS à écrire.

Les liens pré-remplis restent utiles ailleurs (`data/deeplinks.ts` sert aussi la fiche logement) :
c'est leur place dans le panneau de filtres qui est supprimée, pas la fonction.

---

## 10. Bulle de prix sur la carte : mise en tête et surbrillance

`components/LodgingMap.tsx` fait aujourd'hui `patch({ ficheId: lg.id })` au clic sur une épingle :
la fiche s'ouvre par-dessus la liste. La maquette dissocie les deux gestes — **cliquer une bulle
met le logement en avant dans la liste**, ouvrir la fiche reste le clic sur la vignette.

1. Ajouter `lodgPickId: number | null` à l'état (absent du dépôt).
2. Épingle : `patch({ lodgPickId: state.lodgPickId === lg.id ? null : lg.id })`, sans toucher à
   `ficheId`. Re-cliquer la même bulle retire la mise en avant ; cliquer une autre la transfère
   (une seule à la fois).
3. `selectors.tsx` : après le tri, remonter l'élu en tête —
   `if (pick != null) { const i = list.findIndex(l =&gt; l.id === pick); if (i &gt; 0) list.unshift(list.splice(i, 1)[0]) }` —
   et l'exempter du filtre de cadrage et du masquage « position invraisemblable », sinon la bulle
   qu'on vient de cliquer peut disparaître de la liste.
4. `LodgingCard` : la vignette élue prend un fond `var(--accent-soft)`, 8 px de retrait et un
   liseré `2px var(--accent)` — sur une vignette sans cadre, un liseré seul ne se voit pas. Elle
   porte la pastille « Choisi sur la carte » avec sa croix.
5. `LodgingsPage` : un bandeau au-dessus de la liste, « Choisi sur la carte : <nom> — remonté en
   tête de liste », avec « retirer la mise en avant ». C'est ce qui rend l'effet lisible quand la
   liste est défilée ou la carte au premier plan.
6. Au moment de la mise en avant, remonter le conteneur de liste (et ses parents défilables) à
   zéro. Ne pas utiliser `scrollIntoView`.
7. L'épingle élue reste distinguée sur la carte, comme l'épingle sélectionnée aujourd'hui.

---

## Clés de catalogue à ajouter

Format du dépôt : tuple de sept, dans l'ordre `fr, en, de, nl, es, it, af`. Vérifier avant
d'ajouter — `estimated`, `altitude_top_lower`, `snowfall_cm_7d`, `snowfall_none` et
`source_derived` existent déjà.

```ts
amplitude_lower: ['amplitude', 'vertical', 'Höhendifferenz', 'hoogteverschil', 'desnivel', 'dislivello', 'hoogteverskil'],
lifts_plural: ['remontées', 'lifts', 'Bergbahnen', 'liften', 'remontes', 'impianti', 'skilifte'],
snow_front_lower: ['front de neige', 'snow front', 'Talstation', 'sneeuwfront', 'frente de nieve', 'fronte neve', 'sneeufront'],
of_road: ['de route', 'of driving', 'Fahrt', 'rijden', 'de carretera', 'di strada', 'se pad'],
days_short: ['j', 'd', 'T', 'd', 'd', 'g', 'd'],
card_pin_from_map: ['depuis la carte', 'from the map', 'von der Karte', 'vanaf de kaart', 'desde el mapa', 'dalla mappa', 'vanaf die kaart'],
card_pin_out: ['carte · hors filtres', 'map · outside filters', 'Karte · außerhalb der Filter', 'kaart · buiten de filters', 'mapa · fuera de filtros', 'mappa · fuori dai filtri', 'kaart · buite die filters'],
card_off_map: ['hors carte', 'off the map', 'ohne Karte', 'buiten de kaart', 'fuera del mapa', 'fuori mappa', 'buite die kaart'],
card_checked: ['vérifié à la main', 'checked by hand', 'von Hand geprüft', 'handmatig gecontroleerd', 'verificado a mano', 'verificato a mano', 'met die hand nagegaan'],
price_estimated: ['Tarif estimé, non relevé', 'Estimated price, not recorded', 'Geschätzter Preis, nicht erfasst', 'Geschatte prijs, niet vastgelegd', 'Tarifa estimada, no registrada', 'Prezzo stimato, non rilevato', 'Geskatte prys, nie aangeteken nie']
```

---

## Ordre de travail conseillé

1. `DomainCard.tsx` + le CSS associé — c'est ce qui change la perception de l'app.
2. `agoTxt` avec `ago_pattern`, et la pastille de fraîcheur.
3. `format.ts` via un hook `useFormat()`.
4. Les six textes résiduels, puis le test de complétude du catalogue.
5. Les chantiers 9 et 10 (bulles de sources, mise en tête depuis la carte) — courts, visibles tout de suite.
6. Le chantier 8 (slicers de plage) — le plus gros : état, prédicats, migration des préférences, composant.
7. Le chantier 7 (bandeaux et en-tête de l'écran Logements) — purement `renderer`, effet immédiat.
8. Le chantier 6 (filtres de sources) — court, et il touche `src/main/` : à faire d'une traite.
9. La fusion `lodgLoading` → `lodgPhase` du chantier 5 — indépendante des quatre autres, faisable
   en premier si l'écran de chargement bloque le travail au quotidien.

Seul le chantier 6 touche `src/main/` (désenregistrement des connecteurs retirés) et demande un
redémarrage d'Electron ; pour les autres, le rechargement du renderer suffit.

## Fichiers de référence

- `SKITRACK - App v3.dc.html` — la maquette complète, tous écrans.
- `support.js` — le runtime dont la maquette a besoin pour s'afficher.
