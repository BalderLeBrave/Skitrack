/**
 * Couverture du catalogue France Montagnes.
 *
 * Deux listes portent le même nom et ne disent pas la même chose :
 *
 * * `data/franceMontagnes.ts` — les **232 noms** relevés sur le site de France
 *   Montagnes le 18 août 2026. Rien que des noms : ni altitude, ni position.
 * * `data/franceMontagnesStations.ts` — le **classeur** livré depuis, généré
 *   par `npm run catalogue:import` : 285 lignes, chacune avec ses coordonnées,
 *   son altitude de village et son domaine skiable.
 *
 * Cet audit les confronte, et répond à trois questions : combien de stations
 * publiées le classeur décrit-il ? qu'ajoute-t-il ? et combien d'entre elles
 * portent un **tarif de forfait relevé** plutôt qu'estimé ?
 *
 * Ce que le rapport ne fait pas : combler. Une station publiée que le classeur
 * ignore est nommée ici, pas fabriquée ailleurs.
 *
 *   npm run refs:audit
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { BUNDLED_REFERENTIAL, forfaitIndexByArea, forfaitIndexBySlug } from './referentiel'
import { catalogueOf } from './catalogue'
import { FM_STATIONS } from './franceMontagnesStations'
import { skiAreaIndex } from './skiAreas'
import { FRANCE_MONTAGNES, samePlace } from './franceMontagnes'
import { squash } from './places'
import { slug } from '@/domain/format'

const OUT = 'docs/diagnostics/couverture-france-montagnes.md'

const { stations, excluded } = catalogueOf(BUNDLED_REFERENTIAL)
const { areas, byStation } = skiAreaIndex(stations)

/** Une station publiée par le site figure-t-elle au classeur ? */
const missing = FRANCE_MONTAGNES.filter(
  (official) => !FM_STATIONS.some((row) => samePlace(official, row.fmName))
)

/** Et l'inverse : ce que le classeur ajoute au relevé du site. */
const added = FM_STATIONS.filter(
  (row) => !FRANCE_MONTAGNES.some((official) => samePlace(official, row.fmName))
)

// Le tarif d'un forfait se lit sur la station, puis sur son domaine relié —
// exactement la cascade des écrans (`state/selectors.tsx`).
const bySlug = forfaitIndexBySlug(BUNDLED_REFERENTIAL, slug)
const byArea = forfaitIndexByArea(BUNDLED_REFERENTIAL, squash)
const priced = stations.filter(
  (s) => bySlug.get(s.slug) ?? byArea.get(squash(s.name)) ?? (s.pass ? byArea.get(squash(s.pass)) : undefined)
)
const estimated = stations.filter((s) => !priced.includes(s))

const lines: string[] = []
const w = (s = ''): void => void lines.push(s)

w('# Couverture du catalogue France Montagnes')
w()
w('*Généré par `npm run refs:audit` — ne pas éditer à la main.*')
w('*Relevé du site : `data/franceMontagnes.ts`, 18 août 2026,*')
w(`*https://www.france-montagnes.com/les-stations-de-ski/ — ${FRANCE_MONTAGNES.length} stations distinctes.*`)
w('*Classeur : `docs/sources/stations-ski-france-montagnes.xlsx`, converti en*')
w(`*\`data/franceMontagnesStations.ts\` — ${FM_STATIONS.length} lignes.*`)
w()
w('## Chiffres')
w()
w('| | |')
w('| --- | --- |')
w(`| Stations publiées par le site | ${FRANCE_MONTAGNES.length} |`)
w(`| Lignes du classeur | ${FM_STATIONS.length} |`)
w(`| Publiées et absentes du classeur | **${missing.length}** |`)
w(`| Ajoutées par le classeur | ${added.length} |`)
w(`| **Stations affichées par l’application** | **${stations.length}** |`)
w(`| Domaines skiables formés | ${areas.length} |`)
w(`| Tarif de forfait relevé | ${priced.length} |`)
w(`| Tarif estimé, faute de relevé | ${estimated.length} |`)
w()
w('Le rapport de force a changé : le référentiel livré décrivait 115 des')
w(`${FRANCE_MONTAGNES.length} stations publiées, le classeur en décrit ${FRANCE_MONTAGNES.length - missing.length}.`)
w('Les altitudes, les kilomètres et les positions viennent de lui ; le')
w('référentiel n’apporte plus que les tarifs, la saisonnalité et les glaciers.')
w()

if (missing.length > 0) {
  w(`## Les ${missing.length} stations publiées que le classeur ne décrit pas`)
  w()
  w('Le relevé du site date du 18 août 2026 ; le classeur, plus récent, écarte ce')
  w('qui ne skie plus. Sa feuille « Paramètres » documente les fermetures — La')
  w('Sambuy (2023, démantelée en 2025), Le Grand Puy (2024), Puigmal (liquidé fin')
  w('2023), Chalmazel (fermée l’hiver 2025-2026) — et les stations sans piste')
  w('alpine cartographiée à moins de 15 km, dont Valdrôme et Soleilhas-Vauplane.')
  w('Saint-Pierre-de-Chartreuse, elle, est bien au classeur, sous les noms de ses')
  w('secteurs (Le Granier, Le Planolet, Saint-Hugues-les-Égaux).')
  w()
  w('Aucune n’est affichée, et toutes sont nommées ici.')
  w()
  for (const name of missing) w(`- ${name}`)
  w()
}

w(`## Les ${added.length} lignes que le classeur ajoute`)
w()
w('Villages-stations des grands domaines (Arc 1600, Belle Plagne, Val Claret…),')
w('graphies différentes du relevé, et stations que le site nomme autrement. Une')
w('ligne de type « village-station » reste une station de la liste : c’est un')
w('endroit où l’on dort et d’où l’on skie.')
w()
for (const row of added) w(`- ${row.fmName}${row.kind === 'village' ? ' *(village-station)*' : ''} — ${row.domain ?? 'sans domaine'}`)
w()

if (excluded.length > 0) {
  w('## Lignes écartées de la liste')
  w()
  for (const row of excluded) w(`- **${row.name}** — ${row.reason}.`)
  w()
}

w(`## Les ${estimated.length} stations dont le tarif de forfait n’est pas relevé`)
w()
w('Le référentiel livré porte les tarifs relevés à la main sur les sites')
w('officiels, domaine par domaine. Une station dont le domaine n’y figure pas')
w('affiche un tarif **estimé**, marqué comme tel partout où il s’affiche, et qui')
w('n’entre pas dans le score. Ce sont presque toutes de petites stations que le')
w('référentiel n’a jamais décrites.')
w()
for (const s of estimated) w(`- ${s.name} — ${s.pass ?? 'domaine inconnu'}`)
w()
w('## Stations retenues, par domaine skiable')
w()
w('| Domaine | Stations |')
w('| --- | --- |')
for (const area of areas.filter((a) => !a.single)) {
  w(`| ${area.name} | ${area.stations.map((s) => s.name).join(', ')} |`)
}
const singles = stations.filter((s) => byStation.get(s.id)?.single)
w()
w(`Et ${singles.length} stations dont le domaine se confond avec elles-mêmes.`)
w()
w('## Note sur le moteur local')
w()
w('Le moteur local ne fournit plus la liste : il l’**enrichit**. Sa base')
w('OpenSkiMap (`npm run sidecar:stats`) apporte les sites officiels et les pages')
w('de réservation que le classeur n’a pas retenus, et les glaciers qu’elle')
w('déclare. Démarrer le moteur ne change donc ni le nombre de stations, ni leurs')
w('altitudes, ni leur rattachement — c’est le point de ce rangement.')

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, lines.join('\n') + '\n', 'utf-8')
console.log(
  `${OUT} — publiées ${FRANCE_MONTAGNES.length} · absentes du classeur ${missing.length} · ` +
    `affichées ${stations.length} · forfait relevé ${priced.length} / ${stations.length}`
)
