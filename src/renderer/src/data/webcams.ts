/**
 * Webcams des domaines.
 *
 * Table vérifiée à la main : une webcam morte est pire qu'une webcam absente,
 * et aucun annuaire ouvert ne les recense de façon fiable. Les flux restent
 * chez l'exploitant — l'application les affiche dans une `iframe`, sans copie
 * ni réencodage, ce qui est ce que leurs conditions autorisent.
 *
 * Le rapprochement domaine → webcam se fait sur le nom, puis sur le nom du
 * forfait relié : « Val Thorens » a sa propre caméra, mais un domaine dont le
 * forfait est « Les 3 Vallées » hérite de celles des quatre stations du
 * groupe. Le rapprochement est textuel et tolérant aux accents, aux tirets et
 * aux parenthèses, parce que les noms du référentiel OpenSkiMap ne suivent
 * aucune convention stable.
 */

export interface Webcam {
  /** L'URL sert d'identifiant : elle est unique et stable. */
  id: string
  label: string
  url: string
}

/** Caméras par station, sous une clé déjà normalisée. */
const WEBCAMS: Record<string, [string, string][]> = {
  'les 2 alpes': [['Sommet 3400 m', 'https://www.skaping.com/les2alpes/3400m']],
  "alpe d'huez": [['Pic Blanc', 'https://www.skaping.com/alpedhuez/pic-blanc']],
  chamonix: [['Aiguille du Midi', 'https://www.skaping.com/chamonix/aiguille-du-midi']],
  'val thorens': [['Panorama 3 Vallées', 'https://www.skaping.com/valthorens/3vallees']],
  tignes: [['Grande Motte', 'https://tignes.roundshot.com/grande-motte/']],
  'serre chevalier': [['Cucumelle', 'https://www.skaping.com/serre-chevalier/cucumelle']],
  'la plagne': [['Live 3000', 'https://app.webcam-hd.com/webcam-station-la-plagne/live-3000']],
  'les arcs': [['Arcabulle', 'https://app.webcam-hd.com/lesarcs/arcabulle']],
  "val d'isere": [['Le Fornet', 'https://www.skaping.com/valdisere/fornet']],
  avoriaz: [['Pistes', 'https://www.skaping.com/avoriaz/pistes']],
  flaine: [['Désert Blanc', 'https://www.skaping.com/flaine/desert-blanc']],
  montgenevre: [['Église', 'https://app.webcam-hd.com/montgenevre/eglise']],
  valmorel: [['Planchamp', 'https://www.skaping.com/valmorel/planchamp']],
  'sainte-foy-tarentaise': [['Sommet Aiguille', 'https://app.webcam-hd.com/ste-foy-tarentaise/sommet-aiguille']],
  'la norma': [['Le Carrelet', 'https://www.skaping.com/la-norma/carrelet']],
  'val cenis': [['La Met', 'https://app.webcam-hd.com/valcenis/la-met']],
  aussois: [['Sommet Armoise', 'https://www.skaping.com/aussois/sommet-armoise']],
  'bonneval-sur-arc': [['Andagne', 'https://pv.viewsurf.com/1496/Bonneval-Andagne?i=NTk3ODp1bmRlZmluZWQ']],
  valloire: [['Col du Galibier', 'https://www.skaping.com/valloire/galibier']],
  'les karellis': [['TSD des Chaudannes', 'https://app.webcam-hd.com/les-karellis/tsd-des-chaudannes']],
  vars: [['Chabrières', 'https://www.skaping.com/vars/chabrieres']],
  risoul: [['Chabrières (Vars)', 'https://www.skaping.com/vars/chabrieres']],
  'puy-saint-vincent': [['Pelvoux', 'https://www.vision-environnement.com/live/player/pelvoux30.php']],
  'orcieres-merlette': [['Plateau de Rocherousse', 'https://www.skaping.com/orcieres/plateau-de-rocherousse']],
  'isola 2000': [['Vue station', 'https://www.stationsnicecotedazur.com/fr/webcam/isola-2000/']],
  'la rosiere': [
    ['Mont Valaisan', 'https://app.webcam-hd.com/la-rosiere/mont-valaisan'],
    ['Maison du ski', 'https://app.webcam-hd.com/la-rosiere/maison-du-ski']
  ],
  courchevel: [['Saulire', 'https://www.skaping.com/courchevel/saulire']],
  meribel: [['Roc de Fer', 'https://www.skaping.com/meribel/roc-de-fer']],
  'les menuires': [['Le Plan', 'https://www.skaping.com/menuires/plan']],
  valfrejus: [['Punta Bagna', 'https://www.skaping.com/valfrejus/puntabagna']],
  'la clusaz': [['Espace Nordique', 'https://www.skaping.com/la-clusaz/espace-nordique']],
  'la giettaz': [['Sommet', 'https://www.skaping.com/la-giettaz/sommet']]
}

/** Forfaits reliés : le domaine hérite des caméras de ses stations membres. */
const WEBCAM_GROUPS: Record<string, string[]> = {
  'les 3 vallees': ['val thorens', 'courchevel', 'meribel', 'les menuires'],
  '3 vallees': ['val thorens', 'courchevel', 'meribel', 'les menuires'],
  paradiski: ['la plagne', 'les arcs'],
  'espace killy': ["val d'isere", 'tignes'],
  'tignes val d’isere': ["val d'isere", 'tignes'],
  'portes du soleil': ['avoriaz'],
  'grand massif': ['flaine'],
  'la voie lactee': ['montgenevre'],
  'vars risoul': ['vars'],
  'la foret blanche': ['vars']
}

/** Nom d'affichage d'une station, pour préfixer les caméras d'un groupe. */
const CAM_NAMES: Record<string, string> = {
  'les 2 alpes': 'Les 2 Alpes',
  "alpe d'huez": "Alpe d'Huez",
  chamonix: 'Chamonix',
  'val thorens': 'Val Thorens',
  tignes: 'Tignes',
  'serre chevalier': 'Serre Chevalier',
  'la plagne': 'La Plagne',
  'les arcs': 'Les Arcs',
  "val d'isere": "Val d'Isère",
  avoriaz: 'Avoriaz',
  flaine: 'Flaine',
  montgenevre: 'Montgenèvre',
  valmorel: 'Valmorel',
  'sainte-foy-tarentaise': 'Sainte-Foy-Tarentaise',
  'la norma': 'La Norma',
  'val cenis': 'Val Cenis',
  aussois: 'Aussois',
  'bonneval-sur-arc': 'Bonneval-sur-Arc',
  valloire: 'Valloire',
  'les karellis': 'Les Karellis',
  vars: 'Vars',
  risoul: 'Risoul',
  'puy-saint-vincent': 'Puy-Saint-Vincent',
  'orcieres-merlette': 'Orcières-Merlette',
  'isola 2000': 'Isola 2000',
  'la rosiere': 'La Rosière',
  courchevel: 'Courchevel',
  meribel: 'Méribel',
  'les menuires': 'Les Menuires',
  valfrejus: 'Valfréjus',
  'la clusaz': 'La Clusaz',
  'la giettaz': 'La Giettaz'
}

/** Minuscules, sans accents, séparateurs réduits à une espace simple. */
export function camKey(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9']+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** « Tignes – Val d'Isère », « Vars / Risoul », « Chabrières (Vars) »… */
function segments(value: string): string[] {
  return value
    .split(/[–—/(]|\s-\s/)
    .map((part) => camKey(part))
    .filter(Boolean)
}

const GROUP_INDEX = new Map(Object.entries(WEBCAM_GROUPS).map(([k, v]) => [camKey(k), v]))
const CAM_INDEX = new Map(Object.entries(WEBCAMS).map(([k, v]) => [camKey(k), v]))
const NAME_INDEX = new Map(Object.entries(CAM_NAMES).map(([k, v]) => [camKey(k), v]))

/** Clés candidates les plus longues d'abord : « les 2 alpes » avant « alpes ». */
const GROUP_KEYS = [...GROUP_INDEX.keys()].sort((a, b) => b.length - a.length)
const CAM_KEYS = [...CAM_INDEX.keys()].sort((a, b) => b.length - a.length)

export interface WebcamSubject {
  name: string
  pass: string | null
}

/**
 * Webcams d'un domaine, groupe de forfait compris.
 *
 * Les correspondances sont essayées de la plus spécifique à la plus large :
 * nom exact, segments du nom, puis clés reconnues dans le texte concaténé. Un
 * groupe l'emporte sur une station isolée — un domaine « Les 3 Vallées » doit
 * montrer les quatre caméras, pas seulement celle de Val Thorens.
 */
export function webcamsFor(domain: WebcamSubject): Webcam[] {
  const tries: string[] = []
  for (const source of [domain.name, domain.pass].filter((v): v is string => Boolean(v))) {
    tries.push(camKey(source))
    tries.push(...segments(source))
  }

  const haystack = tries.join(' ')
  for (const key of GROUP_KEYS) if (key.length > 3 && haystack.includes(key)) tries.push(key)
  for (const key of CAM_KEYS) if (key.length > 3 && haystack.includes(key)) tries.push(key)

  for (const key of tries) {
    const group = GROUP_INDEX.get(key)
    if (group) {
      const out: Webcam[] = []
      for (const station of group) {
        const sk = camKey(station)
        const label = NAME_INDEX.get(sk) ?? station
        for (const [name, url] of CAM_INDEX.get(sk) ?? []) out.push({ id: url, label: `${label} — ${name}`, url })
      }
      if (out.length > 0) return out
    }
    const own = CAM_INDEX.get(key)
    if (own) return own.map(([label, url]) => ({ id: url, label, url }))
  }
  return []
}
