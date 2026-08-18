/**
 * Couverture du catalogue France Montagnes.
 *
 * L'application ne présente que les stations que France Montagnes publie (voir
 * `data/franceMontagnes.ts`). Cet audit répond à la seule question qui reste :
 * **combien de ces stations le référentiel chargé sait-il décrire ?**
 *
 * Une station du catalogue dont ni le fichier livré ni le moteur local ne
 * connaissent l'altitude, les pistes ou la position n'apparaît pas : elle n'est
 * pas inventée, elle est **nommée ici comme manquante**. C'est tout l'objet de
 * ce rapport — dire ce qui n'est pas là, plutôt que de le combler.
 *
 *   npm run refs:audit
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { BUNDLED_REFERENTIAL, domainsFromReferential } from './referentiel'
import { collapseToStations } from './stationList'
import { skiAreaIndex } from './skiAreas'
import { FRANCE_MONTAGNES, franceMontagnesName, samePlace } from './franceMontagnes'
import { stationNameOf } from './stations'
import { slug } from '@/domain/format'

const OUT = 'docs/diagnostics/couverture-france-montagnes.md'

const entries = domainsFromReferential(BUNDLED_REFERENTIAL, slug)
const stations = collapseToStations(entries)
const { areas, byStation } = skiAreaIndex(stations)

/** Noms de stations que le référentiel porte, avant filtrage par le catalogue. */
const beforeFilter = [...new Set(entries.map((e) => stationNameOf(e.name) || e.name))]
const rejected = beforeFilter.filter((name) => franceMontagnesName(name) === null)
const missing = FRANCE_MONTAGNES.filter((official) => !stations.some((s) => samePlace(official, s.name)))

const lines: string[] = []
const w = (s = ''): void => void lines.push(s)

w('# Couverture du catalogue France Montagnes')
w()
w('*Généré par `npm run refs:audit` — ne pas éditer à la main.*')
w('*Catalogue : `data/franceMontagnes.ts`, relevé le 18 août 2026 sur*')
w('*https://www.france-montagnes.com/les-stations-de-ski/ — 232 stations distinctes.*')
w('*Référentiel mesuré : le fichier livré. Moteur local arrêté — voir la note finale.*')
w()
w('## Chiffres')
w()
w('| | |')
w('| --- | --- |')
w(`| Stations au catalogue | **${FRANCE_MONTAGNES.length}** |`)
w(`| Décrites par le référentiel livré | **${stations.length}** |`)
w(`| Manquantes | **${missing.length}** |`)
w(`| Entrées du référentiel écartées (hors catalogue) | ${rejected.length} |`)
w(`| Domaines skiables formés | ${areas.length} |`)
w()
w(`## Les ${missing.length} stations du catalogue que le référentiel ne décrit pas`)
w()
w('Elles existent — France Montagnes les publie — mais aucune source chargée ne')
w('donne leurs altitudes, leurs pistes ni leur position. Les afficher sans ces')
w('valeurs reviendrait à inventer une station ; elles sont donc absentes de la')
w('liste, et nommées ici.')
w()
for (const name of missing) w(`- ${name}`)
w()
w(`## Les ${rejected.length} entrées du référentiel écartées`)
w()
w('Elles sont dans le référentiel mais pas au catalogue : villes, sites')
w('nordiques, secteurs ou libellés de domaine. Le filtre les retire de la liste.')
w()
for (const name of [...rejected].sort((a, b) => a.localeCompare(b, 'fr'))) w(`- ${name}`)
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
w('La base OpenSkiMap importée par le moteur (`npm run sidecar:stats`) porte')
w('**277 domaines**, dont 259 exploitables. Confrontée au catalogue, elle en')
w('couvre **164 sur 232** — contre les chiffres ci-dessus pour le seul fichier')
w('livré. Démarrer le moteur augmente donc nettement la liste sans rien changer')
w('au modèle : le filtre du catalogue s’applique de la même façon aux deux')
w('sources.')

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, lines.join('\n') + '\n', 'utf-8')
console.log(
  `${OUT} — catalogue ${FRANCE_MONTAGNES.length} · décrites ${stations.length} · ` +
    `manquantes ${missing.length} · écartées ${rejected.length}`
)
