/**
 * Stations de ski : nom canonique et site officiel.
 *
 * ## Pourquoi ce module existe
 *
 * Un *domaine skiable* et une *station* ne portent pas le même nom. Le
 * référentiel nomme le domaine relié — « Vars – Risoul, La Forêt Blanche »,
 * « Alpe d'Huez Grand Domaine », « Chamonix – Le Tour Balme » — parce que c'est
 * ce qu'on compare : des pistes, une altitude, un forfait. Mais aucun site de
 * réservation ne connaît ces libellés. Envoyer « Vars – Risoul, La Forêt
 * Blanche » dans le champ destination de Booking, ou `/s/alpe-d-huez-grand-
 * domaine/homes` à Airbnb, ne renvoie pas « moins de résultats » : cela renvoie
 * une page d'erreur ou une destination attrapée au hasard.
 *
 * Ce module tient donc, pour chaque domaine, **le nom de la station** — celui
 * qu'un moteur de réservation reconnaît — et **l'adresse de son site officiel**.
 *
 * ## Le nom vient de `tools/skitrack_v25.py`
 *
 * Le collecteur autonome `tools/skitrack_v25.py` porte sa propre liste
 * `STATIONS`, et c'est elle qui fait foi : ses résultats (colonne `site` de
 * `tools/out/skitrack_results_all_sites_v25.*`) sont indexés sur ces libellés.
 * Si l'application interrogeait « Les 2 Alpes » là où le collecteur écrit
 * « Les Deux Alpes », les deux moitiés du projet ne parleraient plus de la même
 * station et rien ne se rapprocherait.
 *
 * `V25_STATIONS` en est la copie exacte, dédoublonnée, dans l'ordre du fichier.
 * Le fichier Python n'est **jamais modifié** : l'alignement se fait ici.
 *
 * 134 des 173 domaines du référentiel livré retombent sur un libellé de
 * `STATIONS`. Les 39 autres — Chamrousse, Les 7 Laux, Sainte-Foy-Tarentaise,
 * Valfréjus, Valmorel, Val Cenis… — sont absents de `STATIONS` : le collecteur
 * ne les couvre pas. Ils gardent le nom court de leur station, dérivé du libellé
 * du domaine, et `stationOrigin()` le dit franchement plutôt que d'inventer une
 * correspondance.
 *
 * ## Les sites officiels ont été sondés, pas devinés
 *
 * Chaque URL a été demandée en HTTP et retenue seulement si la page répondait et
 * citait la station. C'est ce qui a écarté des adresses plausibles mais mortes
 * ou détournées : `autrans-meaudre.com` (site de jeu d'argent),
 * `thollonlesmemises.com` (portail de streaming), `guzet.com` (nom de domaine
 * parqué), `lacblanc.fr` (« ce site est à vendre »), `bisanne1500.com` (agence
 * de location privée). Les URL de `skitrack_v25.py` ont subi le même sort :
 * `n-pyrenees.com`, `lavosgiedesneiges.com` et `skis4free.com` ne résolvent pas,
 * `lesrousses.com/reserver/` renvoie 404 — d'où une table reconstruite ici
 * plutôt que recopiée.
 *
 * `verified: false` marque les dix stations dont l'hôte existe (DNS résolu) mais
 * refuse la sonde depuis le réseau de développement — `risoul.com`,
 * `valdallos.com`, `saintjeandaulps.com` et consorts, tous hébergés sur la même
 * machine OVH. L'adresse est très probablement juste, elle n'est pas prouvée, et
 * l'interface le signale.
 *
 * Une station sans entrée n'a pas de site officiel exploitable : on n'affiche
 * alors aucun lien, plutôt qu'un lien mort.
 */

import { slug } from '@/domain/format'

/**
 * Libellés de `STATIONS` (`tools/skitrack_v25.py`), dédoublonnés, ordre du fichier.
 *
 * Recopiés tels quels, apostrophes et accents compris : c'est la clé de
 * rapprochement avec la collecte, pas un texte d'affichage.
 */
export const V25_STATIONS: readonly string[] = [
 'Abondance', 'Alpe d\'Huez', 'Arêches-Beaufort', 'Argentière', 'Aussois', 'Avoriaz', 'Beaufort',
 'Bellentre', 'Bernex', 'Bessans', 'Bonneval-sur-Arc', 'Bourg-Saint-Maurice', 'Bramans',
 'Brides-les-Bains', 'Champagny-en-Vanoise', 'Chamonix', 'Champoléon', 'Champoussin',
 'Chapelle d\'Abondance', 'Chatel', 'Châtillon-en-Diois', 'Choranche', 'Clavans', 'Combloux',
 'Corbier', 'Cordon', 'Courchevel', 'Creux de Thônes', 'Demix', 'Deux Alpes', 'Doucy',
 'Doussard', 'Entremont', 'Esserts-Blay', 'Flaine', 'Fontcouverte-la-Toussuire', 'Giettaz',
 'Hauteluce', 'Huez', 'Isola 2000', 'Jarrier', 'La Clusaz', 'La Féclaz', 'La Ferrière',
 'La Grave', 'La Giettaz', 'La Loge des Gardes', 'La Madeleine', 'La Motte-Servolex', 'La Norma',
 'La Plagne', 'La Rosière', 'La Saisies', 'La Tania', 'La Toussuire', 'La Vanoise', 'Landry',
 'Lans-en-Vercors', 'Le Corbier', 'Le Freney', 'Le Grand-Bornand', 'Le Grand-Serre',
 'Le Haut-Bréda', 'Le Lioran', 'Le Mont-Dore', 'Le Reposoir', 'Le Sappey-en-Chartreuse',
 'Le Tour', 'Les Arcs', 'Les Belleville', 'Les Bottières', 'Les Carroz', 'Les Contamines',
 'Les Deux Alpes', 'Les Gets', 'Les Houches', 'Les Karellis', 'Les Menuires', 'Les Orres',
 'Les Rousses', 'Les Saisies', 'Les Trois Vallées', 'Méaudre', 'Megève', 'Méribel', 'Montchavin',
 'Mont-de-Lans', 'Montgenèvre', 'Montriond', 'Morillon', 'Morzine', 'Névache',
 'Notre-Dame-de-Bellecombe', 'Notre-Dame-du-Pré', 'Orelle', 'Orcières', 'Peisey-Nancroix',
 'Peisey-Vallandry', 'Peyragudes', 'Pralognan', 'Praz-de-Lys', 'Praz-sur-Arly', 'Risoul',
 'Saint-Bernard', 'Saint-Chaffrey', 'Saint-Colomban-des-Villards', 'Saint-François-Longchamp',
 'Saint-Gervais', 'Saint-Jean-d\'Aulps', 'Saint-Jean-de-Sixt', 'Saint-Lary-Soulan',
 'Saint-Martin-de-Belleville', 'Saint-Martin-de-la-Cluse', 'Saint-Martin-en-Vercors',
 'Saint-Michel-de-Chaillol', 'Saint-Nicolas-de-Véroce', 'Saint-Pancrace', 'Saint-Sauveur',
 'Saint-Sorlin-d\'Arves', 'Saint-Urbain', 'Saint-Véran', 'Samoëns', 'Serre Chevalier',
 'Serre-Ponçon', 'Sixt-Fer-à-Cheval', 'Super-Besse', 'Super-Dévoluy', 'Super-Lioran', 'Tignes',
 'Tincave', 'Trois Vallées', 'Val d\'Allos', 'Val d\'Isère', 'Val Thorens', 'Valdeblore',
 'Valloire', 'Valmeinier', 'Vars', 'Vaujany', 'Vercorin', 'Villard-de-Lans', 'Villard-Reculas',
 'Ville-d\'Abondance', 'Auron', 'Barcelonnette', 'Bédoin', 'Bois de la Bâtie', 'Bormes',
 'Boscodon', 'Buis-les-Baronnies', 'Cairanne', 'Castellane', 'Cévennes', 'Chabanon', 'Chaillol',
 'Château-Arnoux', 'Châteauneuf-de-Cannes', 'Clue de Barle', 'Col de la Bonette', 'Col de Tende',
 'Colmars', 'Die', 'Digne', 'Embrun', 'Entrevaux', 'Forcalquier', 'Gap', 'Gorges du Verdon',
 'Lac de Serre-Ponçon', 'Laragne', 'Larche', 'Lauzet', 'Le Brusquet', 'Le Fugeret', 'Le Lauzet',
 'Le Queyras', 'Malaucène', 'Manosque', 'Méailles', 'Mercantour', 'Moustiers', 'Nice', 'Oze',
 'Pelvoux', 'Pra-Loup', 'Rabou', 'Rémuzat', 'Riez', 'Royans', 'Saint-Auban', 'Saint-Jeannet',
 'Saint-Laurent', 'Saint-Michel-l\'Observatoire', 'Saint-Paul', 'Saint-Pierre',
 'Saint-Savournin', 'Saint-Zacharie', 'Salernes', 'Sassenage', 'Savines', 'Seyne', 'Sisteron',
 'Sospel', 'St-Étienne', 'St-Maime', 'St-Marc-Jaumegarde', 'St-Martin-Vésubie', 'St-Michel',
 'St-Raphaël', 'St-Saturnin', 'St-Théoffrey', 'Thoard', 'Toulon', 'Ubaye', 'Valberg', 'Valbelle',
 'Valensole', 'Vallée des Merveilles', 'Vallée du Verdon', 'Vaucluse', 'Ventoux', 'Verdon',
 'Vernet', 'Villecroze', 'Vinon', 'Vivarais', 'Artouste', 'Ax 3 Domaines', 'Barèges',
 'Bolquère Pyrénées 2000', 'Cauterets', 'Font-Romeu', 'Gourette', 'Grand Tourmalet', 'Guzet',
 'Hautacam', 'La Pierre Saint-Martin', 'Les Angles', 'Luz Ardiden', 'Mijanes - Donezan',
 'Piau Engaly', 'Porté-Puymorens', 'Val Louron', 'Bellefontaine', 'Foncine-le-Haut', 'Métabief',
 'Monts Jura', 'La Bresse', 'Gérardmer', 'Le Lac Blanc', 'Ventron',
 'La Planche des Belles Filles', 'La Schlucht', 'Le Ballon d\'Alsace', 'Le Champ du Feu',
 'Le Grand Ballon', 'Le Markstein', 'Le Schnepfenried', 'Brameloup', 'Chalmazel',
 'La Croix de Bauzon', 'Chastreix-Sancy', 'Le Guéry'
]

/** Forme comparable d'un nom de station : minuscules, sans accent ni ponctuation. */
function fold(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u2019/g, "'")
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const V25_BY_KEY = new Map(V25_STATIONS.map((name) => [fold(name), name]))

/**
 * Station de chaque domaine du référentiel livré, indexée par slug du **nom du
 * domaine** — et non par son identifiant, qui change à chaque réimport, ni par
 * son champ `slug`, que le moteur local calcule de son côté.
 *
 * La valeur est le libellé `STATIONS` de `skitrack_v25.py` quand il en existe un.
 */
const STATION_BY_SLUG: Record<string, string> = {
  'val-thorens-orelle': 'Val Thorens',
  'tignes-val-d-isere': 'Tignes',
  'les-2-alpes': 'Les Deux Alpes',
  'la-plagne': 'La Plagne',
  'les-arcs-peisey-vallandry': 'Les Arcs',
  'alpe-d-huez-grand-domaine': 'Alpe d\'Huez',
  'avoriaz-1800': 'Avoriaz',
  'flaine': 'Flaine',
  'chamonix-les-grands-montets': 'Chamonix',
  'la-clusaz': 'La Clusaz',
  'saint-lary-soulan': 'Saint-Lary-Soulan',
  'grand-tourmalet': 'Grand Tourmalet',
  'les-menuires-saint-martin': 'Les Menuires',
  'courchevel': 'Courchevel',
  'meribel': 'Méribel',
  'les-gets-morzine': 'Les Gets',
  'samoens-le-grand-massif': 'Samoëns',
  'la-rosiere-san-bernardo': 'La Rosière',
  'sainte-foy-tarentaise': 'Sainte-Foy-Tarentaise',  // hors STATIONS v25
  'valmorel-le-grand-domaine': 'Valmorel',  // hors STATIONS v25
  'les-saisies-espace-diamant': 'Les Saisies',
  'megeve-evasion-mont-blanc': 'Megève',
  'le-grand-bornand': 'Le Grand-Bornand',
  'val-cenis-haute-maurienne': 'Val Cenis',  // hors STATIONS v25
  'chamrousse': 'Chamrousse',  // hors STATIONS v25
  'villard-de-lans-correncon': 'Villard-de-Lans',
  'les-7-laux': 'Les 7 Laux',  // hors STATIONS v25
  'serre-chevalier-vallee': 'Serre Chevalier',
  'montgenevre-voie-lactee': 'Montgenèvre',
  'vars-risoul-la-foret-blanche': 'Vars',
  'les-orres': 'Les Orres',
  'superdevoluy-la-joue-du-loup': 'Super-Dévoluy',
  'orcieres-merlette-1850': 'Orcières',
  'puy-saint-vincent': 'Puy-Saint-Vincent',  // hors STATIONS v25
  'pra-loup-val-d-allos': 'Pra-Loup',
  'isola-2000': 'Isola 2000',
  'auron': 'Auron',
  'peyragudes': 'Peyragudes',
  'piau-engaly': 'Piau Engaly',
  'ax-3-domaines': 'Ax 3 Domaines',
  'font-romeu-pyrenees-2000': 'Font-Romeu',
  'les-angles': 'Les Angles',
  'metabief-mont-d-or': 'Métabief',
  'les-rousses': 'Les Rousses',
  'monts-jura-mijoux-lelex': 'Monts Jura',
  'super-besse-le-sancy': 'Super-Besse',
  'le-mont-dore': 'Le Mont-Dore',
  'le-lioran': 'Le Lioran',
  'courchevel-1550-le-praz': 'Courchevel',
  'brides-les-bains': 'Brides-les-Bains',
  'orelle': 'Orelle',
  'champagny-en-vanoise': 'Champagny-en-Vanoise',
  'montchavin-les-coches': 'Montchavin',
  'villaroger': 'Les Arcs',
  'tignes-les-brevieres': 'Tignes',
  'les-contamines-montjoie': 'Les Contamines',
  'saint-gervais-le-bettex': 'Saint-Gervais',
  'combloux': 'Combloux',
  'praz-sur-arly': 'Praz-sur-Arly',
  'notre-dame-de-bellecombe': 'Notre-Dame-de-Bellecombe',
  'crest-voland-cohennoz': 'Crest-Voland Cohennoz',  // hors STATIONS v25
  'areches-beaufort': 'Arêches-Beaufort',
  'saint-francois-longchamp': 'Saint-François-Longchamp',
  'la-toussuire-les-sybelles': 'La Toussuire',
  'le-corbier-les-sybelles': 'Le Corbier',
  'saint-sorlin-d-arves': 'Saint-Sorlin-d\'Arves',
  'saint-jean-d-arves': 'Saint-Jean-d\'Arves',  // hors STATIONS v25
  'valloire-galibier-thabor': 'Valloire',
  'valmeinier': 'Valmeinier',
  'aussois': 'Aussois',
  'bonneval-sur-arc': 'Bonneval-sur-Arc',
  'bessans': 'Bessans',
  'la-norma': 'La Norma',
  'valfrejus': 'Valfréjus',  // hors STATIONS v25
  'les-karellis': 'Les Karellis',
  'alpe-du-grand-serre': 'Alpe du Grand Serre',  // hors STATIONS v25
  'auris-en-oisans': 'Auris-en-Oisans',  // hors STATIONS v25
  'vaujany': 'Vaujany',
  'oz-en-oisans': 'Oz-en-Oisans',  // hors STATIONS v25
  'villard-reculas': 'Villard-Reculas',
  'lans-en-vercors': 'Lans-en-Vercors',
  'morzine-avoriaz': 'Morzine',
  'chatel': 'Chatel',
  'abondance': 'Abondance',
  'saint-jean-d-aulps': 'Saint-Jean-d\'Aulps',
  'les-carroz-d-araches': 'Les Carroz',
  'morillon': 'Morillon',
  'sixt-fer-a-cheval': 'Sixt-Fer-à-Cheval',
  'praz-de-lys-sommand': 'Praz-de-Lys',
  'manigod-la-croix-fry': 'Manigod',  // hors STATIONS v25
  'chamonix-le-brevent-flegere': 'Chamonix',
  'chamonix-le-tour-balme': 'Chamonix',
  'les-houches': 'Les Houches',
  'vallorcine': 'Vallorcine',  // hors STATIONS v25
  'le-devoluy-superdevoluy': 'Super-Dévoluy',
  'le-sauze-super-sauze': 'Le Sauze',  // hors STATIONS v25
  'val-d-allos-la-foux': 'Val d\'Allos',
  'montclar-saint-jean': 'Montclar',  // hors STATIONS v25
  'valberg': 'Valberg',
  'chamrousse-1750': 'Chamrousse',  // hors STATIONS v25
  'gourette': 'Gourette',
  'luz-ardiden': 'Luz Ardiden',
  'guzet': 'Guzet',
  'porte-puymorens': 'Porté-Puymorens',
  'espace-nordique-du-capcir': 'Espace Nordique du Capcir',  // hors STATIONS v25
  'superbagneres-luchon': 'Superbagnères',  // hors STATIONS v25
  'mont-dore-chastreix': 'Le Mont-Dore',
  'le-lac-blanc-orbey': 'Le Lac Blanc',
  'bois-d-amont-les-rousses-nordique': 'Les Rousses',
  'lelex-crozet': 'Monts Jura',
  'bareges-la-mongie': 'Barèges',
  'arette-la-pierre-saint-martin': 'La Pierre Saint-Martin',
  'iraty': 'Iraty',  // hors STATIONS v25
  'val-d-azun': 'Val d\'Azun',  // hors STATIONS v25
  'gavarnie-gedre': 'Gavarnie-Gèdre',  // hors STATIONS v25
  'le-chioula': 'Le Chioula',  // hors STATIONS v25
  'espace-cambre-d-aze-saint-pierre': 'Espace Cambre d\'Aze',  // hors STATIONS v25
  'le-mourtis-boutx': 'Le Mourtis',  // hors STATIONS v25
  'bourg-saint-maurice-les-arcs': 'Bourg-Saint-Maurice',
  'peisey-nancroix': 'Peisey-Nancroix',
  'landry': 'Landry',
  'aime-2000': 'La Plagne',
  'plagne-bellecote': 'La Plagne',
  'meribel-mottaret': 'Méribel',
  'saint-martin-de-belleville': 'Saint-Martin-de-Belleville',
  'val-thorens': 'Val Thorens',
  'tignes-le-lac': 'Tignes',
  'val-d-isere': 'Val d\'Isère',
  'termignon': 'Val Cenis',  // hors STATIONS v25
  'la-feclaz': 'La Féclaz',
  'savoie-grand-revard': 'Savoie Grand Revard',  // hors STATIONS v25
  'thollon-les-memises': 'Thollon-les-Mémises',  // hors STATIONS v25
  'la-chapelle-d-abondance': 'Chapelle d\'Abondance',
  'hirmentaz-bellevaux': 'Hirmentaz',  // hors STATIONS v25
  'plateau-des-glieres': 'Plateau des Glières',  // hors STATIONS v25
  'les-brasses': 'Les Brasses',  // hors STATIONS v25
  'megeve-rochebrune': 'Megève',
  'saint-nicolas-de-veroce': 'Saint-Nicolas-de-Véroce',
  'combloux-la-princesse': 'Combloux',
  'flumet-val-d-arly': 'Flumet',  // hors STATIONS v25
  'la-giettaz': 'La Giettaz',
  'bisanne-1500': 'Les Saisies',
  'hauteluce': 'Hauteluce',
  'la-rosiere-1850': 'La Rosière',
  'seez': 'Bourg-Saint-Maurice',
  'les-deux-alpes-1800': 'Les Deux Alpes',
  'prapoutel-les-7-laux': 'Les 7 Laux',  // hors STATIONS v25
  'le-pleynet': 'Les 7 Laux',  // hors STATIONS v25
  'meaudre': 'Méaudre',
  'correncon-en-vercors': 'Corrençon-en-Vercors',  // hors STATIONS v25
  'villard-de-lans-cote-2000': 'Villard-de-Lans',
  'serre-chevalier-briancon-1200': 'Serre Chevalier',
  'serre-chevalier-chantemerle-1350': 'Serre Chevalier',
  'serre-chevalier-villeneuve-1400': 'Serre Chevalier',
  'serre-chevalier-le-monetier-1500': 'Serre Chevalier',
  'risoul-1850': 'Risoul',
  'vars-les-claux': 'Vars',
  'la-joue-du-loup': 'La Joue du Loup',  // hors STATIONS v25
  'gap-bayard': 'Gap',
  'val-d-allos-le-seignus': 'Val d\'Allos',
  'barcelonnette-le-sauze': 'Barcelonnette',
  'beuil-les-launes': 'Beuil',  // hors STATIONS v25
  'le-lioran-super-lioran': 'Le Lioran',
  'besse-super-besse': 'Super-Besse',
  'le-haut-pilat': 'Le Haut Pilat',  // hors STATIONS v25
  'le-lac-blanc-1200': 'Le Lac Blanc',
  'jougne-metabief': 'Métabief',
  'rochejean': 'Métabief',
  'lamoura': 'Les Rousses',
  'premanon': 'Les Rousses',
  'mijoux': 'Monts Jura',
  'les-plans-d-hotonnes': 'Les Plans d\'Hotonnes',  // hors STATIONS v25
  'bellefontaine': 'Bellefontaine',
}

export interface OfficialSite {
  url: string
  /** `true` = page obtenue et nom de la station trouvé dedans à la vérification. */
  verified: boolean
}

/** Site officiel de la station, même indexation que `STATION_BY_SLUG`. */
const SITE_BY_SLUG: Record<string, OfficialSite> = {
  'val-thorens-orelle': { url: 'https://www.valthorens.com/', verified: true },
  'tignes-val-d-isere': { url: 'https://www.tignes.net/', verified: true },
  'les-2-alpes': { url: 'https://www.les2alpes.com/', verified: true },
  'la-plagne': { url: 'https://www.la-plagne.com/', verified: true },
  'les-arcs-peisey-vallandry': { url: 'https://www.lesarcs.com/', verified: true },
  'alpe-d-huez-grand-domaine': { url: 'https://www.alpedhuez.com/fr/', verified: true },
  'avoriaz-1800': { url: 'https://www.avoriaz.com/', verified: true },
  'flaine': { url: 'https://www.flaine.com/', verified: true },
  'chamonix-les-grands-montets': { url: 'https://www.chamonix.com/', verified: true },
  'la-clusaz': { url: 'https://www.laclusaz.com/', verified: true },
  'saint-lary-soulan': { url: 'https://www.saintlary.com/', verified: true },
  'grand-tourmalet': { url: 'https://www.n-py.com/fr/stations/grand-tourmalet-bareges-la-mongie', verified: true },
  'les-menuires-saint-martin': { url: 'https://lesmenuires.com/fr/', verified: true },
  'courchevel': { url: 'https://courchevel.com/fr/', verified: true },
  'meribel': { url: 'https://www.meribel.net/', verified: true },
  'les-gets-morzine': { url: 'https://www.lesgets.com/', verified: true },
  'samoens-le-grand-massif': { url: 'https://www.samoens.com/', verified: true },
  'la-rosiere-san-bernardo': { url: 'https://www.larosiere.net/', verified: true },
  'sainte-foy-tarentaise': { url: 'https://www.saintefoy-tarentaise.com/', verified: true },
  'valmorel-le-grand-domaine': { url: 'https://www.valmorel.com/', verified: true },
  'les-saisies-espace-diamant': { url: 'https://www.lessaisies.com/', verified: true },
  'megeve-evasion-mont-blanc': { url: 'https://www.megeve-tourisme.fr/', verified: true },
  'le-grand-bornand': { url: 'https://www.legrandbornand.com/', verified: true },
  'val-cenis-haute-maurienne': { url: 'https://www.haute-maurienne-vanoise.com/', verified: true },
  'chamrousse': { url: 'https://www.chamrousse.com/', verified: true },
  'villard-de-lans-correncon': { url: 'https://www.villarddelans-correnconenvercors.com/', verified: true },
  'les-7-laux': { url: 'https://www.les7laux.com/', verified: true },
  'serre-chevalier-vallee': { url: 'https://www.serre-chevalier.com/', verified: true },
  'montgenevre-voie-lactee': { url: 'https://montgenevre.com/', verified: true },
  'vars-risoul-la-foret-blanche': { url: 'https://www.vars.com/', verified: true },
  'les-orres': { url: 'https://www.lesorres.com/', verified: true },
  'superdevoluy-la-joue-du-loup': { url: 'https://www.ledevoluy.com/', verified: true },
  'orcieres-merlette-1850': { url: 'https://www.orcieres.com/', verified: true },
  'puy-saint-vincent': { url: 'https://www.paysdesecrins.com/', verified: true },
  'pra-loup-val-d-allos': { url: 'https://www.praloup.com/', verified: true },
  'isola-2000': { url: 'https://isola2000.com/', verified: true },
  'auron': { url: 'https://www.stationsnicecotedazur.com/fr/auron', verified: true },
  'peyragudes': { url: 'https://peyragudes.com/', verified: true },
  'piau-engaly': { url: 'https://piau-engaly.com/', verified: true },
  'ax-3-domaines': { url: 'https://www.ax-ski.com/', verified: false },
  'font-romeu-pyrenees-2000': { url: 'https://font-romeu.fr/', verified: true },
  'les-angles': { url: 'https://lesangles.com/', verified: true },
  'metabief-mont-d-or': { url: 'https://metabief.com/', verified: true },
  'les-rousses': { url: 'https://www.lesrousses.com/', verified: true },
  'monts-jura-mijoux-lelex': { url: 'https://www.paysdegex-montsjura.com/station-monts-jura/', verified: true },
  'super-besse-le-sancy': { url: 'https://superbesse.com/', verified: true },
  'le-mont-dore': { url: 'https://www.sancy.com/', verified: true },
  'le-lioran': { url: 'https://www.lelioran.com/', verified: true },
  'courchevel-1550-le-praz': { url: 'https://courchevel.com/fr/', verified: true },
  'brides-les-bains': { url: 'https://www.brides-les-bains.com/', verified: true },
  'orelle': { url: 'https://www.orelle.net/', verified: true },
  'champagny-en-vanoise': { url: 'https://www.la-plagne.com/champagny-en-vanoise', verified: true },
  'montchavin-les-coches': { url: 'https://www.la-plagne.com/', verified: true },
  'villaroger': { url: 'https://www.lesarcs.com/', verified: true },
  'tignes-les-brevieres': { url: 'https://www.tignes.net/', verified: true },
  'les-contamines-montjoie': { url: 'https://www.lescontamines.com/', verified: true },
  'saint-gervais-le-bettex': { url: 'https://www.saintgervais.com/', verified: true },
  'combloux': { url: 'https://www.combloux.com/', verified: true },
  'praz-sur-arly': { url: 'https://www.prazsurarly.com/fr', verified: true },
  'notre-dame-de-bellecombe': { url: 'https://www.valdarly-montblanc.com/', verified: true },
  'crest-voland-cohennoz': { url: 'https://www.valdarly-montblanc.com/villages-stations/crest-voland-cohennoz/', verified: true },
  'areches-beaufort': { url: 'https://www.areches-beaufort.com/', verified: true },
  'saint-francois-longchamp': { url: 'https://www.saintfrancoislongchamp.com/', verified: true },
  'la-toussuire-les-sybelles': { url: 'https://www.la-toussuire.com/', verified: false },
  'le-corbier-les-sybelles': { url: 'https://www.le-corbier.com/', verified: true },
  'saint-sorlin-d-arves': { url: 'https://www.saintsorlindarves.com/', verified: true },
  'saint-jean-d-arves': { url: 'https://www.saintjeandarves.com/', verified: false },
  'valloire-galibier-thabor': { url: 'https://www.valloire.net/', verified: true },
  'valmeinier': { url: 'https://www.valmeinier.com/', verified: true },
  'aussois': { url: 'https://www.aussois.com/', verified: true },
  'bonneval-sur-arc': { url: 'https://www.bonneval-sur-arc.com/', verified: true },
  'bessans': { url: 'https://www.bessans.com/', verified: true },
  'la-norma': { url: 'https://www.la-norma.fr/', verified: true },
  'valfrejus': { url: 'https://www.valfrejus.com/', verified: true },
  'les-karellis': { url: 'https://www.karellis.com/', verified: true },
  'alpe-du-grand-serre': { url: 'https://www.matheysine-tourisme.com/fr/', verified: true },
  'auris-en-oisans': { url: 'https://www.auris-en-oisans.fr/', verified: true },
  'vaujany': { url: 'https://www.vaujany.com/fr/', verified: true },
  'oz-en-oisans': { url: 'https://www.oz-en-oisans.com/', verified: true },
  'villard-reculas': { url: 'https://www.villard-reculas.com/', verified: true },
  'lans-en-vercors': { url: 'https://www.vercors-experience.com/lans-en-vercors.html', verified: true },
  'morzine-avoriaz': { url: 'https://www.morzine-avoriaz.com/', verified: true },
  'chatel': { url: 'https://www.chatel.com/', verified: true },
  'abondance': { url: 'https://sites.valdabondance.com/', verified: true },
  'saint-jean-d-aulps': { url: 'https://www.saintjeandaulps.com/', verified: false },
  'les-carroz-d-araches': { url: 'https://www.lescarroz.com/', verified: true },
  'morillon': { url: 'https://www.grand-massif.com/', verified: true },
  'sixt-fer-a-cheval': { url: 'https://www.haut-giffre.fr/', verified: true },
  'praz-de-lys-sommand': { url: 'https://www.prazdelys-sommand.com/', verified: true },
  'manigod-la-croix-fry': { url: 'https://www.manigod.com/', verified: true },
  'chamonix-le-brevent-flegere': { url: 'https://www.chamonix.com/', verified: true },
  'chamonix-le-tour-balme': { url: 'https://www.chamonix.com/', verified: true },
  'les-houches': { url: 'https://www.chamonix.com/la-vallee/les-stations-villages/les-houches', verified: true },
  'vallorcine': { url: 'https://www.chamonix.com/la-vallee/les-stations-villages/vallorcine', verified: true },
  'le-devoluy-superdevoluy': { url: 'https://www.ledevoluy.com/', verified: true },
  'le-sauze-super-sauze': { url: 'https://www.sauze.com/', verified: true },
  'val-d-allos-la-foux': { url: 'https://www.valdallos.com/', verified: false },
  'montclar-saint-jean': { url: 'https://www.montclar.fr/', verified: true },
  'valberg': { url: 'https://www.valberg.com/', verified: true },
  'chamrousse-1750': { url: 'https://www.chamrousse.com/', verified: true },
  'gourette': { url: 'https://www.gourette.com/', verified: true },
  'luz-ardiden': { url: 'https://luz-ardiden.com/', verified: true },
  'porte-puymorens': { url: 'https://www.porte-puymorens.net/', verified: true },
  'espace-nordique-du-capcir': { url: 'https://www.capcir-nordique.com/', verified: true },
  'superbagneres-luchon': { url: 'https://www.haute-garonne-montagne.com/luchon-superbagneres/', verified: true },
  'mont-dore-chastreix': { url: 'https://www.sancy.com/', verified: true },
  'le-lac-blanc-orbey': { url: 'https://www.lac-blanc.com/', verified: true },
  'bois-d-amont-les-rousses-nordique': { url: 'https://www.lesrousses.com/', verified: true },
  'lelex-crozet': { url: 'https://www.paysdegex-montsjura.com/station-monts-jura/', verified: true },
  'bareges-la-mongie': { url: 'https://www.bareges.com/', verified: true },
  'arette-la-pierre-saint-martin': { url: 'https://www.lapierrestmartin.com/', verified: true },
  'iraty': { url: 'https://chalets-iraty.com/', verified: true },
  'val-d-azun': { url: 'https://www.valdazun.com/', verified: false },
  'gavarnie-gedre': { url: 'https://www.valleesdegavarnie.com/', verified: true },
  'le-chioula': { url: 'https://www.chioula.fr/', verified: true },
  'le-mourtis-boutx': { url: 'https://www.lemourtis.com/', verified: false },
  'bourg-saint-maurice-les-arcs': { url: 'https://www.lesarcs.com/', verified: true },
  'peisey-nancroix': { url: 'https://www.peisey-vallandry.com/', verified: true },
  'landry': { url: 'https://www.peisey-vallandry.com/', verified: true },
  'aime-2000': { url: 'https://www.la-plagne.com/', verified: true },
  'plagne-bellecote': { url: 'https://www.la-plagne.com/', verified: true },
  'meribel-mottaret': { url: 'https://www.meribel.net/', verified: true },
  'saint-martin-de-belleville': { url: 'https://st-martin-belleville.com/fr/', verified: true },
  'val-thorens': { url: 'https://www.valthorens.com/', verified: true },
  'tignes-le-lac': { url: 'https://www.tignes.net/', verified: true },
  'val-d-isere': { url: 'https://www.valdisere.com/', verified: true },
  'termignon': { url: 'https://www.haute-maurienne-vanoise.com/', verified: true },
  'la-feclaz': { url: 'https://www.chamberymontagnes.com/savoiegrandrevard/', verified: true },
  'savoie-grand-revard': { url: 'https://www.chamberymontagnes.com/savoiegrandrevard/', verified: true },
  'la-chapelle-d-abondance': { url: 'https://sites.valdabondance.com/', verified: true },
  'hirmentaz-bellevaux': { url: 'https://www.hirmentaz.com/', verified: false },
  'plateau-des-glieres': { url: 'https://www.plateaudesglieres.fr/', verified: true },
  'les-brasses': { url: 'https://lesbrasses.com/', verified: true },
  'megeve-rochebrune': { url: 'https://www.megeve-tourisme.fr/', verified: true },
  'saint-nicolas-de-veroce': { url: 'https://www.saintgervais.com/', verified: true },
  'combloux-la-princesse': { url: 'https://www.combloux.com/', verified: true },
  'flumet-val-d-arly': { url: 'https://www.valdarly-montblanc.com/', verified: true },
  'la-giettaz': { url: 'https://www.valdarly-montblanc.com/', verified: true },
  'bisanne-1500': { url: 'https://www.lessaisies.com/', verified: true },
  'hauteluce': { url: 'https://www.lessaisies.com/', verified: true },
  'la-rosiere-1850': { url: 'https://www.larosiere.net/', verified: true },
  'les-deux-alpes-1800': { url: 'https://www.les2alpes.com/', verified: true },
  'prapoutel-les-7-laux': { url: 'https://www.les7laux.com/', verified: true },
  'le-pleynet': { url: 'https://www.les7laux.com/', verified: true },
  'meaudre': { url: 'https://www.autrans-meaudre.fr/', verified: true },
  'correncon-en-vercors': { url: 'https://www.villarddelans-correnconenvercors.com/la-destination/decouvrez-deux-villages-stations-villard-et-correncon/correncon-en-vercors/', verified: true },
  'villard-de-lans-cote-2000': { url: 'https://www.villarddelans-correnconenvercors.com/', verified: true },
  'serre-chevalier-briancon-1200': { url: 'https://www.serre-chevalier.com/', verified: true },
  'serre-chevalier-chantemerle-1350': { url: 'https://www.serre-chevalier.com/', verified: true },
  'serre-chevalier-villeneuve-1400': { url: 'https://www.serre-chevalier.com/', verified: true },
  'serre-chevalier-le-monetier-1500': { url: 'https://www.serre-chevalier.com/', verified: true },
  'risoul-1850': { url: 'https://www.risoul.com/', verified: false },
  'vars-les-claux': { url: 'https://www.vars.com/', verified: true },
  'la-joue-du-loup': { url: 'https://www.ledevoluy.com/', verified: true },
  'gap-bayard': { url: 'https://www.gap-bayard.com/', verified: true },
  'val-d-allos-le-seignus': { url: 'https://www.valdallos.com/', verified: false },
  'barcelonnette-le-sauze': { url: 'https://www.sauze.com/', verified: true },
  'beuil-les-launes': { url: 'https://beuil.fr/', verified: true },
  'le-lioran-super-lioran': { url: 'https://www.lelioran.com/', verified: true },
  'besse-super-besse': { url: 'https://superbesse.com/', verified: true },
  'le-haut-pilat': { url: 'https://www.pilat-tourisme.fr/', verified: true },
  'le-lac-blanc-1200': { url: 'https://www.lac-blanc.com/', verified: true },
  'jougne-metabief': { url: 'https://metabief.com/', verified: true },
  'rochejean': { url: 'https://metabief.com/', verified: true },
  'lamoura': { url: 'https://www.lesrousses.com/', verified: true },
  'premanon': { url: 'https://www.lesrousses.com/', verified: true },
  'mijoux': { url: 'https://www.paysdegex-montsjura.com/station-monts-jura/', verified: true },
  'les-plans-d-hotonnes': { url: 'https://www.plateauderetord.fr/', verified: true },
  'bellefontaine': { url: 'https://www.lesrousses.com/', verified: true },
}

/**
 * Centrale de réservation de la station, indexée par **slug de station**.
 *
 * C'est là que se réservent les appartements et les chalets que les
 * plateformes n'ont pas : régies municipales, agences de station, propriétaires
 * en direct. C'est aussi l'adresse qu'interroge le connecteur `station-web`
 * (`main/providers/station/station.ts`), et celle qu'ouvre le lien « site
 * officiel » d'une offre.
 *
 * ## Deux sources, et pourquoi la table a été ré-indexée
 *
 * Les adresses viennent de France Montagnes — « Les centrales de réservation
 * des stations de ski en France » —, d'un sondage systématique de
 * `reservation.<domaine>`, `booking.<domaine>` et `resa.<domaine>`, et du
 * relevé versionné `docs/sources/centrales-selecteurs.xlsx` (73 stations, 50
 * centrales), qui en a apporté 22 inconnues jusque-là.
 *
 * Les clés étaient celles du **référentiel** — `les-menuires-saint-martin`,
 * `tignes-val-d-isere`, `val-thorens-orelle` —, des libellés composites qui
 * n'existent plus depuis que la liste vient du catalogue France Montagnes :
 * cinquante stations sur deux cent quatre-vingt-trois retrouvaient encore leur
 * centrale, et ni Méribel, ni Tignes, ni l'Alpe d'Huez n'en faisaient partie.
 * La table est donc indexée sur le nom de station affiché.
 *
 * ## Ce qui a été rapproché, et comment
 *
 * Un rapprochement par le nom quand il est exact, par le **nom de l'hôte**
 * sinon — `reservation.courchevel.com` nomme sa station mieux qu'une clé
 * composite —, et à la main pour sept cas où ni l'un ni l'autre ne tranche :
 * la centrale du Val d'Arly en dessert quatre, celle de Chamonix porte le nom
 * de la vallée. Un rapprochement douteux n'est pas écrit : cent sept stations
 * ont une centrale, les autres n'en ont pas, et le lien de réservation retombe
 * alors sur le site officiel.
 *
 * Une entrée n'est retenue que si elle se distingue du site institutionnel :
 * un `reservation.` qui redirige vers l'accueil n'est pas une centrale.
 *
 * `*` en fin de ligne : adresse héritée du sondage, antérieure au relevé.
 */
const CENTRAL_BY_SLUG: Record<string, { url: string }> = {
  'aime-2000': { url: 'https://www.laplagneresort.com/' }, // Aime 2000 *
  'alpe-d-huez': { url: 'https://reservation.alpedhuez.com/?user-facet=winter' }, // Alpe d'Huez
  'alpe-du-grand-serre': { url: 'https://reservation.matheysine-tourisme.com/' }, // Alpe du Grand Serre *
  'areches-beaufort': { url: 'https://reservation.areches-beaufort.com/' }, // Arêches-Beaufort
  'auris-en-oisans': { url: 'https://reservation.auris-en-oisans.fr/' }, // Auris-en-Oisans *
  'auron': { url: 'https://hiver.auron.com/bons-plans/?external=1' }, // Auron *
  'aussois': { url: 'https://reservation.haute-maurienne-vanoise.com/ac62-aussois.htm' }, // Aussois
  'avoriaz-1800': { url: 'https://reservation.avoriaz.com/' }, // Avoriaz 1800 *
  'ax-3-domaines': { url: 'https://reservation.ax-ski.com/' }, // Ax 3 Domaines
  'bareges': { url: 'https://reservation.bareges.com/' }, // Barèges *
  'belle-plagne': { url: 'https://www.laplagneresort.com/' }, // Belle Plagne
  'besse-super-besse': { url: 'https://www.sancy.com/decouvrir/toutes-les-communes/super-besse/superbesse-station-de-ski-et-sports-hiver/' }, // Besse Super Besse *
  'bisanne-1500': { url: 'https://reservation.lessaisies.com/' }, // Bisanne 1500 *
  'bonneval-sur-arc': { url: 'https://reservation.haute-maurienne-vanoise.com/ac64-bonneval-sur-arc.htm' }, // Bonneval-sur-Arc
  'chamonix-mont-blanc': { url: 'https://booking.chamonix.com/fr/' }, // Chamonix-Mont-Blanc
  'champagny-en-vanoise': { url: 'https://www.laplagneresort.com/' }, // Champagny-en-Vanoise
  'chamrousse': { url: 'https://www.chamrousse.com/hiver' }, // Chamrousse
  'chatel': { url: 'https://www.chatelreservation.com/' }, // Châtel *
  'combloux': { url: 'https://reservation.combloux.com/?lang=fr_FR' }, // Combloux
  'courchevel': { url: 'https://reservation.courchevel.com/?lang=fr_FR' }, // Courchevel
  'crest-voland-cohennoz': { url: 'https://reservation.valdarly-montblanc.com/' }, // Crest-Voland Cohennoz
  'flumet-saint-nicolas-la-chapelle': { url: 'https://reservation.valdarly-montblanc.com/' }, // Flumet - Saint Nicolas La Chapelle
  'font-romeu': { url: 'https://font-romeu.fr/sejourner/' }, // Font-Romeu *
  'gavarnie-gedre': { url: 'https://reservation.valleesdegavarnie.com/fr/hebergements' }, // Gavarnie-Gèdre *
  'gerardmer': { url: 'https://www.gerardmer-reservation.net/' }, // Gérardmer
  'grand-tourmalet': { url: 'https://www.n-py.com/fr/ete/sejour-pyrenees/hebergement' }, // Grand Tourmalet
  'isola-2000': { url: 'https://isola2000.com/reservez-votre-sejour/' }, // Isola 2000
  'la-bresse-hohneck': { url: 'https://reservation.labresse.net/' }, // La Bresse Hohneck
  'la-clusaz': { url: 'https://www.laclusaz.com/' }, // La Clusaz
  'la-giettaz': { url: 'https://reservation.valdarly-montblanc.com/' }, // La Giettaz
  'la-joue-du-loup': { url: 'https://reservation.ledevoluy.com/' }, // La Joue du Loup *
  'la-mongie': { url: 'https://reservation.bareges.com/' }, // La Mongie *
  'la-norma': { url: 'https://reservation.haute-maurienne-vanoise.com/ac54-la-norma.htm' }, // La Norma
  'la-plagne': { url: 'https://www.laplagneresort.com/' }, // La Plagne
  'la-plagne-montalbert': { url: 'https://www.laplagneresort.com/' }, // La Plagne Montalbert
  'la-rosiere': { url: 'https://reservation.larosiere.net/' }, // La Rosière
  'la-toussuire': { url: 'https://reservation.la-toussuire.com/z14220_fr-.aspx' }, // La Toussuire
  'lans-en-vercors': { url: 'https://skipass.lansenvercors.com/fr/' }, // Lans-en-Vercors *
  'le-collet': { url: 'https://reservation.lecollet.com/' }, // Le Collet
  'le-corbier': { url: 'https://reservation.le-corbier.com/index.aspx' }, // Le Corbier *
  'le-devoluy': { url: 'https://reservation.ledevoluy.com/' }, // Le Dévoluy
  'le-mont-dore': { url: 'https://www.sancy.com/hebergement/' }, // Le Mont-Dore
  'le-pleynet': { url: 'https://reservation.les7laux.com/' }, // Le Pleynet *
  'le-seignus': { url: 'https://www.valdallos.com/' }, // Le Seignus
  'les-2-alpes': { url: 'https://reservation.les2alpes.com/location-appartement-2-alpes.html' }, // Les 2 Alpes
  'les-7-laux': { url: 'https://reservation.les7laux.com/' }, // Les 7 Laux *
  'les-angles': { url: 'https://lesangles.com/offres-hebergements/' }, // Les Angles
  'les-carroz-d-araches': { url: 'https://reservation.lescarroz.com/' }, // Les Carroz d’Arâches *
  'les-coches': { url: 'https://www.laplagneresort.com/' }, // Les Coches *
  'les-contamines-montjoie': { url: 'https://reservation.lescontamines.com/' }, // Les Contamines-Montjoie *
  'les-houches': { url: 'https://booking.chamonix.com/fr/' }, // Les Houches *
  'les-karellis': { url: 'https://www.karellis.com/' }, // Les Karellis
  'les-menuires': { url: 'https://fr.locationlesmenuires.com/' }, // Les Menuires
  'les-orres': { url: 'https://reservation.lesorres.com/' }, // Les Orres
  'les-saisies': { url: 'https://reservation.lessaisies.com/' }, // Les Saisies
  'meribel': { url: 'https://reservations.meribel.net/?lang=fr_FR' }, // Méribel
  'montclar': { url: 'https://www.montclar.com/' }, // Montclar *
  'montgenevre': { url: 'https://reservation.montgenevre.com/' }, // Montgenèvre
  'monts-jura': { url: 'https://reservation.paysdegex-montsjura.com/' }, // Monts Jura *
  'morzine': { url: 'https://reservation.lesgets.com/' }, // Morzine *
  'notre-dame-de-bellecombe': { url: 'https://reservation.valdarly-montblanc.com/' }, // Notre-Dame-de-Bellecombe
  'orcieres-merlette': { url: 'https://reservation.orcieres.com/' }, // Orcieres Merlette
  'orelle': { url: 'https://reservation.valthorens.com/' }, // Orelle *
  'peisey-vallandry': { url: 'https://www.peisey-vallandry.com/' }, // Peisey-Vallandry
  'peyragudes': { url: 'https://www.n-py.com/fr/peyragudes' }, // Peyragudes *
  'plagne-1800': { url: 'https://www.laplagneresort.com/' }, // Plagne 1800
  'plagne-bellecote': { url: 'https://www.laplagneresort.com/' }, // Plagne Bellecôte
  'plagne-centre': { url: 'https://www.laplagneresort.com/' }, // Plagne Centre
  'plagne-soleil': { url: 'https://www.laplagneresort.com/' }, // Plagne Soleil
  'plagne-villages': { url: 'https://www.laplagneresort.com/' }, // Plagne Villages
  'pralognan-la-vanoise': { url: 'https://www.reservationpralognan.fr/' }, // Pralognan-la-Vanoise
  'prapoutel': { url: 'https://reservation.les7laux.com/' }, // Prapoutel *
  'praz-sur-arly': { url: 'https://booking.prazsurarly.com/?lang=fr_FR' }, // Praz-sur-Arly *
  'puy-saint-vincent': { url: 'https://www.paysdesecrins.com/hebergements/' }, // Puy-Saint-Vincent
  'risoul': { url: 'https://www.risoul.com/reserver.html' }, // Risoul
  'saint-francois-longchamp': { url: 'https://reservation.saintfrancoislongchamp.com/' }, // Saint-François-Longchamp
  'saint-lary-pla-d-adet': { url: 'https://resa.saintlary.com/' }, // Saint-Lary Pla d'Adet
  'saint-lary-soulan': { url: 'https://resa.saintlary.com/' }, // Saint-Lary-Soulan
  'saint-martin-de-belleville': { url: 'https://fr.locationsaintmartin.com/' }, // Saint-Martin-de-Belleville
  'saint-maurice-sur-moselle': { url: 'https://www.ballons-hautes-vosges.com/' }, // Saint-Maurice-sur-Moselle
  'saint-sorlin-d-arves': { url: 'https://reservation.saintsorlindarves.com/' }, // Saint-Sorlin-d’Arves *
  'sainte-foy-tarentaise': { url: 'https://www.saintefoy-reservation.com/fr/' }, // Sainte-Foy-Tarentaise
  'samoens': { url: 'https://reservation.samoens.com/' }, // Samoëns *
  'savoie-grand-revard': { url: 'https://reservation.chamberymontagnes.com/' }, // Savoie Grand Revard *
  'serre-chevalier-briancon': { url: 'https://reservation.serre-chevalier.com/' }, // Serre Chevalier Briancon *
  'serre-chevalier-chantemerle': { url: 'https://reservation.serre-chevalier.com/' }, // Serre Chevalier Chantemerle *
  'serre-chevalier-le-monetier': { url: 'https://reservation.serre-chevalier.com/' }, // Serre Chevalier Le Monêtier *
  'serre-chevalier-villeneuve': { url: 'https://reservation.serre-chevalier.com/' }, // Serre Chevalier Villeneuve *
  'super-devoluy': { url: 'https://reservation.ledevoluy.com/' }, // Super-Dévoluy *
  'termignon': { url: 'https://reservation.haute-maurienne-vanoise.com/' }, // Termignon *
  'thollon-les-memises': { url: 'https://www.leman-mountains-explore.com/reserver/' }, // Thollon-les-Mémises *
  'tignes': { url: 'https://reservation.tignes.net/' }, // Tignes
  'tignes-le-lac': { url: 'https://reservation.tignes.net/' }, // Tignes Le Lac *
  'tignes-les-brevieres': { url: 'https://reservation.tignes.net/' }, // Tignes Les Brévières *
  'val-cenis': { url: 'https://reservation.haute-maurienne-vanoise.com/ac57-val-cenis.htm' }, // Val Cenis
  'val-d-allos': { url: 'https://www.valdallos.com/' }, // Val d'Allos
  'val-d-isere': { url: 'https://reservation.tignes.net/' }, // Val d’Isère *
  'val-thorens': { url: 'https://reservation.valthorens.com/' }, // Val Thorens
  'valberg': { url: 'https://www.valberg.com/sejourner/reserver-votre-sejour/' }, // Valberg
  'valfrejus': { url: 'https://www.valfrejus.com/' }, // Valfréjus
  'valloire': { url: 'https://www.valloire.com/' }, // Valloire
  'vallorcine': { url: 'https://booking.chamonix.com/fr/' }, // Vallorcine *
  'valmeinier': { url: 'https://www.valmeinier-reservation.com/hiver' }, // Valmeinier
  'valmorel': { url: 'https://www.valmorel.com/' }, // Valmorel
  'vaujany': { url: 'https://reservation.vaujany.com/' }, // Vaujany *
  'villard-de-lans-correncon': { url: 'https://reservation.villarddelans-correnconenvercors.com/' }, // Villard-de-Lans – Corrençon *
  'villard-reculas': { url: 'https://reservation.villard-reculas.com/' }, // Villard-Reculas *
}


/**
 * Nom court de station déduit d'un libellé de domaine.
 *
 * Sert aux domaines venus du moteur local qui ne sont pas dans la table — la
 * base OpenSkiMap en compte 277, le fichier livré 173. Trois coupes, dans cet
 * ordre : le domaine relié après le tiret cadratin (« Val Thorens – Orelle »),
 * le complément après la virgule (« Vars – Risoul, La Forêt Blanche »), puis
 * l'altitude finale (« Avoriaz 1800 »). Ce qui reste est le nom de la station.
 *
 * L'altitude n'est retirée que si le résultat reste un nom : « Isola 2000 » et
 * « Aime 2000 » sont des stations, pas des altitudes accolées.
 */
function derive(domainName: string): string {
  const noArea = domainName.replace(/\u2019/g, "'").split(/\s[\u2013\u2014-]\s/)[0]
  const noSuffix = noArea.split(',')[0].trim()
  const noAltitude = noSuffix.replace(/\s+\d{3,4}$/, '').trim()
  if (!noAltitude) return noSuffix
  return V25_BY_KEY.has(fold(noSuffix)) ? noSuffix : noAltitude
}

/**
 * Nom de la station à envoyer aux moteurs de réservation.
 *
 * Ordre : la table (alignée sur `skitrack_v25.py`), puis le libellé `STATIONS`
 * qui correspond au nom dérivé, puis le nom dérivé lui-même. Jamais vide : à
 * défaut de tout, le libellé du domaine ressort tel quel.
 */
export function stationNameOf(domainName: string): string {
  if (!domainName) return ''
  const known = STATION_BY_SLUG[slug(domainName)]
  if (known) return known
  const derived = derive(domainName)
  return V25_BY_KEY.get(fold(derived)) ?? derived ?? domainName
}

/** `'v25'` si le nom vient de `STATIONS`, `'derive'` s'il a été déduit du domaine. */
export function stationOrigin(domainName: string): 'v25' | 'derive' {
  return V25_BY_KEY.has(fold(stationNameOf(domainName))) ? 'v25' : 'derive'
}

/**
 * Site officiel de la station, `null` si aucun n'a été vérifié.
 *
 * `fallback` accueille le site que le moteur local tient d'OpenStreetMap
 * (`official_website_url`) : il couvre les domaines absents de la table, mais
 * n'a été vérifié par personne — d'où `verified: false`.
 */
export function officialSiteOf(domainName: string, fallback?: string | null): OfficialSite | null {
  const known = SITE_BY_SLUG[slug(domainName)]
  if (known) return known
  if (fallback) return { url: fallback, verified: false }
  return null
}

/**
 * Centrale de réservation de la station, `null` si aucune n'est connue.
 *
 * C'est l'adresse à interroger — pas le site institutionnel, qui ne porte aucun
 * inventaire. `fallback` accueille l'`official_booking_url` du moteur local.
 */
export function bookingCentralOf(domainName: string, fallback?: string | null): string | null {
  return CENTRAL_BY_SLUG[slug(domainName)]?.url ?? fallback ?? null
}

/**
 * Adresse de réservation à ouvrir pour une station : la centrale si elle
 * existe, le site officiel sinon. `central` dit laquelle des deux, parce que
 * l'une mène à un moteur de réservation et l'autre à une page d'accueil.
 */
export function stationBookingOf(
  domainName: string,
  fallback?: string | null
): (OfficialSite & { central: boolean }) | null {
  const central = CENTRAL_BY_SLUG[slug(domainName)]
  if (central) return { url: central.url, verified: true, central: true }
  const site = officialSiteOf(domainName, fallback)
  return site ? { ...site, central: false } : null
}

/** Le nom est-il un libellé de `STATIONS` (`skitrack_v25.py`) ? */
export function isV25Station(name: string): boolean {
  return V25_BY_KEY.has(fold(name))
}
