/**
 * Génère `docs/diagnostics/couverture-stations.md`.
 *
 * Un audit écrit à la main vieillit mal : il décrit le référentiel du jour où
 * on l'a tapé. Celui-ci se régénère — `npm run areas:audit` — et se relit dans
 * le dépôt. Il dit trois choses, dont la troisième est la seule qui compte
 * vraiment : la couverture, le contenu de chaque domaine, et **ce qui manque**.
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { skiAreaIndex } from './skiAreas'
import { BUNDLED_REFERENTIAL, hasCoords } from './referentiel'
import { DOMAIN_FIXES, catalogueOf } from './catalogue'
import { FM_STATIONS } from './franceMontagnesStations'
import { placeIndex, squash } from './places'

const OUT = 'docs/diagnostics/couverture-stations.md'

const { stations, excluded } = catalogueOf(BUNDLED_REFERENTIAL)
const { areas } = skiAreaIndex(stations)
const index = placeIndex(stations)
const villages = new Set(FM_STATIONS.filter((s) => s.kind === 'village').map((s) => s.id))

/**
 * Liste nominative de l'énoncé, telle qu'elle a été demandée.
 *
 * Elle sert de contrôle **contre** la donnée, pas de vérité à imposer : quand
 * un rattachement de l'énoncé n'existe pas dans le référentiel, l'audit le dit
 * au lieu de le fabriquer.
 */
const EXPECTED: [string, string[]][] = [
  ['Les 3 Vallées', ['Courchevel', 'Méribel', 'Les Menuires', 'Val Thorens', 'Saint-Martin-de-Belleville', 'Brides-les-Bains', 'Orelle']],
  ['Paradiski', ['La Plagne', 'Aime 2000', 'Montchavin', 'Les Arcs', 'Peisey-Vallandry']],
  ['Espace Killy', ['Tignes', "Val d'Isère"]],
  ['Les Sybelles', ['Le Corbier', 'La Toussuire', "Saint-Sorlin-d'Arves", "Saint-Jean-d'Arves", 'Les Bottières', 'Saint-Colomban-des-Villards']],
  ['Les Portes du Mont-Blanc', ['Combloux', 'Megève Le Jaillet', 'La Giettaz', 'Cordon']],
  ['Portes du Soleil', ['Avoriaz', 'Morzine', 'Les Gets', 'Châtel', 'Montriond', "Saint-Jean-d'Aulps", "La Chapelle-d'Abondance", 'Abondance']],
  ["Alpe d'Huez Grand Domaine", ["Alpe d'Huez", 'Vaujany', 'Oz-en-Oisans', 'Villard-Reculas', 'Auris-en-Oisans']],
  ['Le Grand Massif', ['Flaine', 'Samoëns', 'Morillon', 'Les Carroz', 'Sixt-Fer-à-Cheval']],
  ['Serre Chevalier', ['Briançon', 'Chantemerle', 'Villeneuve', 'Le Monêtier']],
  ['Evasion Mont-Blanc', ['Megève', 'Saint-Gervais', 'Les Contamines-Montjoie', 'Combloux']],
  ['Espace Diamant', ['Les Saisies', 'Praz-sur-Arly', 'Notre-Dame-de-Bellecombe', 'Crest-Voland']],
  ['Le Grand Domaine', ['Valmorel', 'Saint-François-Longchamp']]
]

const lines: string[] = []
const w = (s = ''): void => void lines.push(s)

const multi = areas.filter((a) => !a.single)
const single = areas.filter((a) => a.single)
const noCoords = stations.filter((s) => !hasCoords(s))

w('# Couverture stations → domaines')
w()
w('*Généré par `npm run areas:audit` — ne pas éditer à la main.*')
w('*Source : le catalogue France Montagnes — `docs/sources/stations-ski-france-montagnes.xlsx`,*')
w(`*${FM_STATIONS.length} lignes, converti en \`data/franceMontagnesStations.ts\`. Forfaits, saisonnalité et*`)
w('*glaciers viennent du référentiel livré, posés par `data/catalogue.ts`.*')
w()
w('## Chiffres')
w()
w('| | |')
w('| --- | --- |')
w(`| Lignes au classeur | ${FM_STATIONS.length} |`)
w(`| Stations affichées | **${stations.length}** |`)
w(`| dont villages-stations | ${stations.filter((s) => villages.has(s.id)).length} |`)
w(`| Écartées | ${excluded.length} |`)
w(`| Domaines | **${areas.length}** |`)
w(`| dont multi-stations | ${multi.length} |`)
w(`| dont mono-station | ${single.length} |`)
w(`| Domaines sans station | **0** |`)
w(`| Stations sans coordonnées | ${noCoords.length} |`)
w()
w('La couverture est de 100 % par construction : un domaine est un *groupe de')
w('stations*, il ne peut donc pas en être dépourvu. Les domaines mono-station')
w('sont les stations dont le domaine se confond avec elles-mêmes — elles ne sont')
w('pas dupliquées, et le badge de domaine ne s’affiche pas pour elles.')
w()
w('## Provenance')
w()
w('Toutes les stations viennent du **classeur France Montagnes** — aucune n’est')
w('fabriquée. Chaque ligne y porte ses coordonnées, l’altitude de son village')
w('(modèle de terrain RGE ALTI de l’IGN) et son domaine skiable de rattachement,')
w('mesuré sur les tracés OpenSkiMap. Le référentiel livré n’apporte plus que ce')
w('que le classeur ne connaît pas : le tarif du forfait, la saisonnalité, le')
w('glacier et le logo.')
w()
w('Deux tables restent tenues à la main, et rien d’autre :')
w()
w('- `DOMAIN_FIXES` (`data/catalogue.ts`) — les rattachements corrigés ci-dessous ;')
w('- `VILLAGE_ALIASES` (`data/places.ts`) — des **hameaux** (Val Claret, Mottaret,')
w('  Reberty…) qui n’ont pas de ligne au classeur et servent de termes de')
w('  recherche vers leur station, sans devenir des stations eux-mêmes.')
w()
w('### Rattachements corrigés')
w()
w('Le classeur rattache une station au domaine dont les pistes sont les plus')
w('proches de son **village**, ce qui se trompe quand le village est loin de son')
w('propre domaine. Une correction ne peut que déplacer une station vers un autre')
w('domaine du classeur : les chiffres restent ceux du classeur, pris sur le')
w('domaine d’arrivée.')
w()
for (const [name, fix] of Object.entries(DOMAIN_FIXES)) {
  w(`- **${name}** → ${fix.domain} — ${fix.why}.`)
}
w()
if (excluded.length > 0) {
  w('### Lignes du classeur écartées')
  w()
  for (const row of excluded) w(`- **${row.name}** — ${row.reason}.`)
  w()
}
w('## Contrôle sur la liste nominative de l’énoncé')
w()
w('Chaque ligne confronte ce que l’énoncé attendait à ce que le catalogue')
w('contient. **Un manque est écrit, jamais comblé** : un rattachement inventé')
w('coûterait plus cher qu’une lacune connue.')
w()

let gaps = 0
for (const [label, expected] of EXPECTED) {
  const key = squash(label)
  const area = areas.find((a) => a.id === key)
  w(`### ${label}`)
  w()
  if (!area) {
    gaps++
    w(`> ⚠ **Absent du référentiel.** Aucun domaine ne porte ce nom. Les stations`)
    w('> citées existent, mais rattachées ailleurs :')
    w()
    for (const name of expected) {
      const found = stations.filter((s) => index.matches(s, name))
      const where = [...new Set(found.map((s) => areas.find((a) => a.stations.includes(s))?.name))]
      w(`> - ${name} → ${where.length ? where.join(', ') : '*introuvable*'}`)
    }
    w()
    continue
  }
  w(`${area.stations.length} station(s), point culminant ${area.summit} m.`)
  w()
  for (const station of area.stations) {
    w(`- ${station.name}${hasCoords(station) ? '' : ' *(sans coordonnées)*'} — village ${station.village} m`)
  }
  const missing = expected.filter(
    (name) => !area.stations.some((s) => squash(s.name).includes(squash(name)) || squash(name).includes(squash(s.name)))
  )
  if (missing.length > 0) {
    gaps += missing.length
    w()
    w('> ⚠ Attendu par l’énoncé, absent de ce domaine. Où se trouvent ces stations :')
    w('>')
    for (const name of missing) {
      // Dire « absent » sans dire « et il est là-bas » oblige le lecteur à
      // refaire l'enquête. La réponse est à portée d'index : on la donne.
      const found = stations.filter((s) => index.matches(s, name))
      const where = [...new Set(found.map((s) => areas.find((a) => a.stations.includes(s))?.name))]
      w(`> - **${name}** → ${where.length ? where.join(', ') : '*absent du catalogue*'}`)
    }
  }
  w()
}

w('## Tous les domaines multi-stations')
w()
w('| Domaine | Stations | Sommet | Massif |')
w('| --- | --- | ---: | --- |')
for (const area of multi) {
  w(`| ${area.name} | ${area.stations.map((s) => s.name).join(', ')} | ${area.summit} m | ${area.massif} |`)
}
w()
w('## Dette connue')
w()
w(`- **${noCoords.length} stations sans coordonnées** : elles sortent de la carte, du tri`)
w('  par distance et du calcul de trajet tant que `data/domainGeo.ts` ne les a pas')
w('  géocodées. Liste :')
w()
for (const s of noCoords) w(`  - ${s.name}`)
w()
w(`- **${gaps} écart(s)** entre la liste nominative de l’énoncé et le catalogue,`)
w('  détaillés ci-dessus. Ils ne sont pas comblés : le classeur fait foi, et un')
w('  rattachement incertain serait pire qu’un manque signalé.')

mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, lines.join('\n') + '\n', 'utf-8')
console.log(
  `${OUT} — ${stations.length} stations, ${areas.length} domaines, ` +
    `${noCoords.length} sans coordonnées, ${gaps} écart(s) à l'énoncé.`
)
