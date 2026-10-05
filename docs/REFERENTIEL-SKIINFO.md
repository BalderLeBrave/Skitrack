# Référentiel des stations selon Skiinfo — table finale

État du 5 octobre 2026. La table intègre tes positions, tes trois
réponses du 5 octobre (Le Barioz, Vergio, grands domaines) et les deux
relectures (§ 6).

Pour construire la table, j'ai lu l'index public de Skiinfo à la main :
les 7 listes par massif, puis les listes par département. Aucune fiche
n'a été aspirée.

## 1. En chiffres

| | Avant | Proposé |
| --- | --- | --- |
| Stations (une fiche Skiinfo chacune, sauf deux) | 230 + 83 sans fiche | **233** |
| dont stations ajoutées | | 3 : Sollières-Sardières ; Val d'Ese et Haut Asco, sans fiche (voir § 2, ligne 6) |
| Villages rattachés à une station (ne sont plus des stations) | | **65** |
| Doublon fusionné | | 1 : `le-granier` → `le-granier-vallee-des-entremonts` |
| Entrées supprimées (sans fiche, sans rattachement) | | **17** (§ 4) |

Tous les grands domaines sont confirmés (5 octobre 2026). Un `¹` signale un
département posé à la main : 36 stations reprises de la seule fiche
Skiinfo n'en avaient pas au référentiel.

## 2. Tes positions confrontées aux verdicts

| # | Ta position | Verdict des agents | Retenu |
| --- | --- | --- | --- |
| 1 | Sollières-Sardières a une fiche et reste distincte | Confirmé (agent 1) : site nordique, sans grand domaine | Ajoutée, Savoie |
| 2 | Montalbert → La Plagne, Villaroger → Les Arcs | Confirmé | Oui |
| 2 | Bisanne 1500 → Les Saisies | Confirmé | Oui |
| 2 | Hauteluce-Val Joly → Les Saisies, sauf avis contraire | **Contraire** (agent 1, appuyé par le code de l'agent 2) : télésiège du Col du Joly, domaine Contamines-Hauteluce | **→ Les Contamines** |
| 2 | Argentière, Le Tour → Chamonix ; Vallorcine selon l'agent 1 | Confirmé, Vallorcine comprise (Skiinfo n'a pas de fiche Vallorcine) | Les trois → Chamonix |
| 3 | Les 17 entrées sans fiche sont supprimées | Aucune n'a de fiche, même dans les listes par département | Supprimées (§ 4) |
| 4 | Le Granier : fusion si l'agent 2 confirme | **Confirmé** par les deux agents (détail au § 4.2) | Fusion vers `le-granier-vallee-des-entremonts` |
| 5 | Saint-Colomban dans les Sybelles | Confirmé | Oui |
| 5 | Abondance, Saint-Jean-d'Aulps, Évasion Mont-Blanc « à confirmer » | Agent 1 : retirer Abondance et Saint-Jean-d'Aulps (navette seulement) ; le code a déjà délié Abondance le 26 sept. | Confirmés le 5 octobre 2026 : Abondance et Saint-Jean-d'Aulps dans les Portes du Soleil, Évasion Mont-Blanc en un seul domaine |
| 6 | Ajouter Val d'Ese, Haut Asco, Vergio | Skiinfo dit Vergio fermée depuis 2007. **Val d'Ese et Haut Asco n'ont pas de fiche** : la page Corse de Skiinfo n'a qu'une fiche (Ghisoni) et ne cite les trois autres que dans son texte. Les identifiants de l'index du § 5 initial étaient faux. | Val d'Ese et Haut Asco gardées sans fiche (ta décision du 5 octobre) ; Vergio non ajoutée |
| — | Le Barioz relié aux 7 Laux (ta réponse) | Agent 1 : non relié au Collet | → Les 7 Laux |
| — | Doucy, Valberg - Beuil, Villard - Corrençon : accord | Proposés par l'agent 1 | Retenus |
| 7 | Garder `alpe-d-huez`, alias Skiinfo | — | Alias `alpe-dhuez` |

## 3. Table station → massif → département → grand domaine → villages

| Station (fiche Skiinfo) | id | Département | Grand domaine relié | Villages rattachés |
| --- | --- | --- | --- | --- |
| **Alpes du Nord** (113) | | | | |
| Col de Rousset | `col-de-rousset` | Drôme |  |  |
| Font d'Urle | `font-durle` | Drôme |  |  |
| Lus la Jarjatte | `lus-la-jarjatte` | Drôme |  |  |
| Abondance | `abondance` | Haute-Savoie | Portes du Soleil |  |
| Avoriaz | `avoriaz` | Haute-Savoie | Portes du Soleil |  |
| Bellevaux - Hirmentaz | `bellevaux-hirmentaz` | Haute-Savoie | Hirmentaz - Les Habères |  |
| Bernex | `bernex` | Haute-Savoie |  |  |
| Chamonix | `chamonix` | Haute-Savoie |  | Argentière, Le Tour, Vallorcine |
| Chatel | `chatel` | Haute-Savoie | Portes du Soleil |  |
| Combloux | `combloux` | Haute-Savoie | Évasion Mont-Blanc |  |
| Cordon | `cordon` | Haute-Savoie |  |  |
| Flaine | `flaine` | Haute-Savoie | Le Grand Massif |  |
| La Chapelle d'Abondance | `la-chapelle-dabondance` | Haute-Savoie | Portes du Soleil |  |
| La Clusaz | `la-clusaz` | Haute-Savoie | La Clusaz - Manigod | Plateau de Beauregard |
| Le Grand Bornand | `le-grand-bornand` | Haute-Savoie |  | Le Chinaillon |
| Le Reposoir | `le-reposoir` | Haute-Savoie |  |  |
| Le Semnoz | `le-semnoz` | Haute-Savoie |  |  |
| Les Brasses | `les-brasses` | Haute-Savoie |  |  |
| Les Carroz | `les-carroz` | Haute-Savoie | Le Grand Massif |  |
| Les Contamines Montjoie | `les-contamines-montjoie` | Haute-Savoie |  | Hauteluce Val Joly |
| Les Gets | `les-gets` | Haute-Savoie | Portes du Soleil |  |
| Les Habères | `les-haberes` | Haute-Savoie | Hirmentaz - Les Habères |  |
| Les Houches | `les-houches` | Haute-Savoie |  |  |
| Manigod | `manigod` | Haute-Savoie | La Clusaz - Manigod |  |
| Megève | `megeve` | Haute-Savoie | Évasion Mont-Blanc |  |
| Mont Saxonnex | `mont-saxonnex` | Haute-Savoie |  |  |
| Montmin - Col de la Forclaz | `montmin-col-de-la-forclaz` | Haute-Savoie |  |  |
| Montriond | `montriond` | Haute-Savoie | Portes du Soleil |  |
| Morillon | `morillon` | Haute-Savoie | Le Grand Massif |  |
| Morzine | `morzine` | Haute-Savoie | Portes du Soleil |  |
| Passy Plaine Joux | `passy` | Haute-Savoie |  |  |
| Praz sur Arly | `praz-sur-arly` | Haute-Savoie | Espace Diamant |  |
| Roc d'Enfer - St Jean d'Aulps | `saint-jean-daulps` | Haute-Savoie | Portes du Soleil |  |
| Romme | `romme` | Haute-Savoie |  |  |
| Saint Gervais Mont-Blanc | `saint-gervais-mont-blanc` | Haute-Savoie | Évasion Mont-Blanc | Le Bettex, Saint-Nicolas de Véroce |
| Samoëns | `samoens` | Haute-Savoie | Le Grand Massif | Samoëns 1600 |
| Sixt Fer à Cheval | `sixt-fer-a-cheval` | Haute-Savoie | Le Grand Massif | Haut Giffre |
| Thollon les Memises | `thollon-les-memises` | Haute-Savoie |  |  |
| La Sambuy | `la-sambuy` | Haute-Savoie ¹ |  |  |
| Praz de Lys Sommand | `praz-de-lys-sommand` | Haute-Savoie ¹ |  |  |
| Saint Jean de Sixt | `saint-jean-de-sixt` | Haute-Savoie ¹ |  |  |
| Alpe d'Huez | `alpe-d-huez` (alias Skiinfo `alpe-dhuez`) | Isère | Alpe d'Huez Grand Domaine |  |
| Alpe du Grand Serre | `alpe-du-grand-serre` | Isère |  |  |
| Auris en Oisans | `auris-en-oisans` | Isère | Alpe d'Huez Grand Domaine |  |
| Autrans Méaudre | `autrans` | Isère |  |  |
| Chamrousse | `chamrousse` | Isère |  | Chamrousse 1650, Chamrousse 1750 |
| Col d'Ornon | `col-dornon` | Isère |  |  |
| Col de Marcieu | `col-de-marcieu` | Isère |  |  |
| Gresse en Vercors | `gresse-en-vercors` | Isère |  |  |
| Lans en Vercors | `lans-en-vercors` | Isère |  |  |
| Le Collet d'Allevard | `le-collet-dallevard` | Isère |  |  |
| Les 2 Alpes | `les-2-alpes` | Isère |  |  |
| Les 7 Laux | `les-7-laux` | Isère |  | Le Barioz Alpin, Le Pleynet, Pipay, Prapoutel |
| Les Egaux | `les-egaux` | Isère |  |  |
| OZ 3300 | `oz-en-oisans` | Isère | Alpe d'Huez Grand Domaine |  |
| Saint Hilaire du Touvet | `saint-hilaire-du-touvet` | Isère |  |  |
| Saint Pierre de Chartreuse / Le Planolet | `saint-pierre-de-chartreuse` | Isère |  |  |
| Vaujany | `vaujany` | Isère | Alpe d'Huez Grand Domaine |  |
| Villard de Lans | `villard-de-lans` | Isère | Villard-de-Lans - Corrençon |  |
| Villard Reculas | `villard-reculas` | Isère | Alpe d'Huez Grand Domaine |  |
| Col de Porte | `col-de-porte` | Isère ¹ |  |  |
| Corrençon en Vercors | `correncon-en-vercors` | Isère ¹ | Villard-de-Lans - Corrençon |  |
| Le Sappey en Chartreuse | `le-sappey-en-chartreuse` | Isère ¹ |  |  |
| Les Coulmes | `les-coulmes` | Isère ¹ |  |  |
| Aillons Margeriaz | `les-aillons-margeriaz` | Savoie |  |  |
| Albiez Montrond | `albiez-montrond` | Savoie |  |  |
| Areches Beaufort | `areches-beaufort` | Savoie |  |  |
| Aussois | `aussois` | Savoie |  |  |
| Bessans | `bessans` | Savoie |  |  |
| Bonneval sur Arc | `bonneval-sur-arc` | Savoie |  |  |
| Brides les Bains | `brides-les-bains` | Savoie | Les 3 Vallées |  |
| Champagny en Vanoise | `champagny-en-vanoise` | Savoie | Paradiski |  |
| Courchevel | `courchevel` | Savoie | Les 3 Vallées | Courchevel Le Praz, Courchevel Moriond 1650, Courchevel Village 1550 |
| Crest Voland Cohennoz | `crest-voland-cohennoz` | Savoie | Espace Diamant |  |
| Flumet - St Nicolas la Chapelle | `flumet-st-nicolas-la-chapelle` | Savoie | Espace Diamant |  |
| La Giettaz | `la-giettaz` | Savoie | Évasion Mont-Blanc |  |
| La Norma | `la-norma` | Savoie |  |  |
| La Plagne | `la-plagne` | Savoie | Paradiski | Aime 2000, Belle Plagne, Plagne 1800, Plagne Bellecôte, Plagne Centre, Plagne Soleil, Plagne Villages, La Plagne Montalbert |
| La Rosière 1850 | `la-rosiere-1850` | Savoie | Espace San Bernardo (avec La Thuile) |  |
| La Tania | `la-tania` | Savoie | Les 3 Vallées |  |
| La Toussuire | `la-toussuire` | Savoie | Les Sybelles |  |
| Le Corbier | `le-corbier` | Savoie | Les Sybelles |  |
| Les Arcs | `les-arcs-bourg-st-maurice` | Savoie | Paradiski | Arc 1600, Arc 1800, Arc 1950, Arc 2000, Villaroger |
| Les Bottières | `les-bottieres` | Savoie | Les Sybelles |  |
| Les Karellis | `les-karellis` | Savoie |  |  |
| Les Menuires | `les-menuires` | Savoie | Les 3 Vallées | Reberty |
| Les Saisies | `les-saisies` | Savoie | Espace Diamant | Bisanne 1500 |
| Méribel | `meribel` | Savoie | Les 3 Vallées | Méribel Village, Méribel-Mottaret |
| Montchavin - La Plagne | `montchavin-les-coches` | Savoie | Paradiski | Les Coches |
| Notre Dame de Bellecombe | `notre-dame-de-bellecombe` | Savoie | Espace Diamant |  |
| Orelle | `orelle` | Savoie | Les 3 Vallées |  |
| Peisey-Vallandry | `peisey-vallandry` | Savoie | Paradiski |  |
| Pralognan la Vanoise | `pralognan-la-vanoise` | Savoie |  |  |
| Saint François Longchamp | `saint-francois-longchamp` | Savoie | Le Grand Domaine |  |
| Saint Colomban des Villards | `saint-colomban-villards` | Savoie | Les Sybelles |  |
| Saint Jean d'Arves | `st-jean-darves` | Savoie | Les Sybelles |  |
| Saint Martin de Belleville | `saint-martin-de-belleville` | Savoie | Les 3 Vallées |  |
| Saint Sorlin d'Arves | `saint-sorlin-darves` | Savoie | Les Sybelles |  |
| Sainte Foy Tarentaise | `sainte-foy-tarentaise` | Savoie |  |  |
| Savoie Grand Revard | `savoie-grand-revard` | Savoie |  |  |
| Sollières - Sardières *(nouvelle ; fiche /savoie/la-chevrerie/)* | `sollieres-sardieres` | Savoie |  |  |
| Tignes | `tignes` | Savoie | Tignes - Val d'Isère | Tignes Le Lac, Tignes Les Boisses, Tignes Les Brévières, Tignes Val Claret |
| Val Thorens | `val-thorens` | Savoie | Les 3 Vallées |  |
| Val Cenis | `val-cenis` | Savoie |  | Lanslebourg, Lanslevillard, Termignon |
| Val d'Isère | `val-disere` | Savoie | Tignes - Val d'Isère | La Daille, Le Fornet |
| Valfréjus | `valfrejus` | Savoie |  |  |
| Valloire | `valloire` | Savoie | Galibier-Thabor |  |
| Valmeinier | `valmeinier` | Savoie | Galibier-Thabor |  |
| Valmorel | `valmorel` | Savoie | Le Grand Domaine |  |
| Bramans | `bramans` | Savoie ¹ |  |  |
| Doucy | `doucy` | Savoie ¹ | Le Grand Domaine |  |
| Le Désert d'Entremont | `le-desert-dentremonts` | Savoie ¹ |  |  |
| Le Granier | `le-granier-vallee-des-entremonts` | Savoie ¹ |  | Le Granier (doublon, fusionné) |
| **Alpes du Sud** (43) | | | | |
| Chabanon | `chabanon` | Alpes-de-Haute-Provence |  |  |
| Montclar les 2 vallées | `saint-jean-montclar` | Alpes-de-Haute-Provence |  |  |
| Praloup | `praloup` | Alpes-de-Haute-Provence | Espace Lumière | Pra Loup 1500 |
| Sauze Super Sauze | `sauze-supersauze` | Alpes-de-Haute-Provence |  | Super Sauze |
| Val d'Allos | `val-dallos-la-foux-le-seignus` | Alpes-de-Haute-Provence | Espace Lumière | La Foux d'Allos, Le Seignus |
| Larche | `larche` | Alpes-de-Haute-Provence ¹ |  |  |
| Sainte Anne la Condamine | `sainte-anne-la-condamine` | Alpes-de-Haute-Provence ¹ |  |  |
| Auron | `auron` | Alpes-Maritimes |  |  |
| Gréolières les Neiges | `greolieres-audibergue` | Alpes-Maritimes |  |  |
| Isola 2000 | `isola-2000` | Alpes-Maritimes |  |  |
| L'Audibergue - La Moulière | `laudibergue-la-mouliere` | Alpes-Maritimes |  |  |
| La Colmiane | `la-colmiane` | Alpes-Maritimes |  |  |
| Roubion - Les Buisses | `roubion-les-buisses` | Alpes-Maritimes |  |  |
| Valberg | `valberg` | Alpes-Maritimes | Valberg - Beuil |  |
| Beuil les Launes | `beuil-les-launes` | Alpes-Maritimes ¹ | Valberg - Beuil |  |
| Turini Camp d'Argent | `turini-camp-dargent` | Alpes-Maritimes ¹ |  |  |
| Val Pelens | `val-pelens` | Alpes-Maritimes ¹ |  |  |
| Ancelle | `ancelle` | Hautes-Alpes |  |  |
| Arvieux en Queyras | `arvieux` | Hautes-Alpes |  |  |
| Ceillac en Queyras | `ceillac` | Hautes-Alpes |  |  |
| Chaillol | `chaillol` | Hautes-Alpes |  |  |
| Crévoux | `crevoux` | Hautes-Alpes |  |  |
| La Grave la Meije | `la-grave-la-meije` | Hautes-Alpes |  |  |
| Laye en Champsaur | `laye-en-champsaur` | Hautes-Alpes |  |  |
| Les Orres | `les-orres` | Hautes-Alpes |  | Les Orres 1650, Les Orres 1800 |
| Molines en Queyras | `molines-en-queyras` | Hautes-Alpes |  |  |
| Montgenèvre | `montgenevre` | Hautes-Alpes | Voie Lactée (Via Lattea, avec l'Italie) |  |
| Orcières Merlette | `orcieres` | Hautes-Alpes |  |  |
| Pelvoux-Vallouise | `pelvoux-vallouise` | Hautes-Alpes |  |  |
| Puy-Saint-Vincent | `puy-saint-vincent` | Hautes-Alpes |  | Puy-Saint-Vincent 1600, Puy-Saint-Vincent 1800 |
| Réallon | `reallon` | Hautes-Alpes |  |  |
| Risoul | `risoul` | Hautes-Alpes | Forêt Blanche |  |
| Ristolas en Queyras | `ristolas` | Hautes-Alpes |  |  |
| Saint Léger les Mélèzes | `saint-leger-les-melezes` | Hautes-Alpes |  |  |
| Serre Chevalier | `serre-chevalier` | Hautes-Alpes |  | Serre Chevalier Briançon, Serre Chevalier Chantemerle, Serre Chevalier Le Monêtier |
| Serre Eyraud | `serre-eyraud` | Hautes-Alpes |  |  |
| Superdévoluy / La Joue du Loup | `superdevoluy-la-joue-du-loup` | Hautes-Alpes |  | La Joue du Loup, Le Devoluy |
| Vars | `vars` | Hautes-Alpes | Forêt Blanche | Les Claux, Vars Sainte-Marie |
| Abriès en Queyras | `abries` | Hautes-Alpes ¹ |  |  |
| Aiguilles en Queyras | `aiguilles` | Hautes-Alpes ¹ |  |  |
| Le Chazelet | `le-chazelet` | Hautes-Alpes ¹ |  |  |
| Saint Véran | `saint-veran` | Hautes-Alpes ¹ |  |  |
| Ventoux - Mont Serein | `ventoux-mont-serein` | Vaucluse |  |  |
| **Pyrénées** (35) | | | | |
| Ascou Pailhères | `ascou-pailheres` | Ariège |  |  |
| Ax 3 Domaines | `ax-3-domaines` | Ariège |  |  |
| Beille | `plateau-de-beille` | Ariège |  |  |
| Goulier | `goulier` | Ariège |  |  |
| Guzet | `guzet` | Ariège |  |  |
| Le Chioula | `le-chioula` | Ariège |  |  |
| Les Monts d'Olmes | `les-monts-dolmes` | Ariège |  |  |
| Mijanès - Donezan | `mijanes-donezan` | Ariège |  |  |
| Etang de Lers | `etang-de-lers` | Ariège ¹ |  |  |
| Camurac | `camurac` | Aude ¹ |  |  |
| Le Mourtis | `le-mourtis` | Haute-Garonne |  |  |
| Luchon Superbagnères | `luchon-superbagneres` | Haute-Garonne |  |  |
| Peyragudes | `peyragudes` | Haute-Garonne |  |  |
| Gavarnie Gèdre | `gavarnie-gedre` | Hautes-Pyrénées |  |  |
| Grand Tourmalet (La Mongie / Barèges) | `la-mongie-bareges` | Hautes-Pyrénées |  | Barèges, La Mongie |
| Hautacam | `hautacam` | Hautes-Pyrénées |  |  |
| Luz Ardiden | `luz-ardiden` | Hautes-Pyrénées |  |  |
| Piau Engaly | `piau-engaly` | Hautes-Pyrénées |  |  |
| Saint Lary | `saint-lary-soulan` | Hautes-Pyrénées |  | Espiaube, Saint-Lary Pla d'Adet |
| Val d'Azun | `val-dazun` | Hautes-Pyrénées |  |  |
| Val Louron | `val-louron` | Hautes-Pyrénées |  |  |
| Campan Payolle | `campan-payolle` | Hautes-Pyrénées ¹ |  |  |
| Cauterets | `cauterets` | Hautes-Pyrénées ¹ |  |  |
| Nistos | `nistos` | Hautes-Pyrénées ¹ |  |  |
| Artouste | `artouste` | Pyrénées-Atlantiques |  |  |
| Gourette | `gourette` | Pyrénées-Atlantiques |  |  |
| La Pierre St Martin | `la-pierre-st-martin` | Pyrénées-Atlantiques ¹ |  |  |
| Bolquère - Pyrénées 2000 | `bolquere-pyrenees-2000` | Pyrénées-Orientales | Font-Romeu - Pyrénées 2000 |  |
| Cambre d'Aze | `eyne-cambre-daze` | Pyrénées-Orientales |  |  |
| Font-Romeu - Pyrénées 2000 | `font-romeu-pyrenees-2000` | Pyrénées-Orientales | Font-Romeu - Pyrénées 2000 |  |
| Formiguères | `formigueres` | Pyrénées-Orientales |  |  |
| Les Angles | `les-angles` | Pyrénées-Orientales |  |  |
| Porte Puymorens | `porte-puymorens` | Pyrénées-Orientales |  |  |
| Puyvalador | `puyvalador` | Pyrénées-Orientales |  |  |
| Puigmal | `puigmal` | Pyrénées-Orientales ¹ |  |  |
| **Massif Central** (13) | | | | |
| La Loge des Gardes | `la-loge-des-gardes` | Allier |  |  |
| La Croix de Bauzon | `la-croix-de-bauzon` | Ardèche |  |  |
| Laguiole | `laguiole` | Aveyron |  |  |
| Brameloup | `brameloup` | Aveyron ¹ |  |  |
| Le Lioran | `le-lioran` | Cantal |  |  |
| Alti Aigoual | `mont-aigoual` | Gard ¹ |  |  |
| Les Estables - Mézenc | `les-estables` | Haute-Loire |  |  |
| Chalmazel | `chalmazel` | Loire ¹ |  |  |
| Le Bleymard - Mont Lozère | `le-bleymard` | Lozère |  |  |
| Besse Super Besse | `besse-super-besse` | Puy-de-Dôme | Le Grand Sancy |  |
| Chastreix Sancy | `chastreix-sancy` | Puy-de-Dôme |  |  |
| Le Mont Dore | `le-mont-dore` | Puy-de-Dôme | Le Grand Sancy |  |
| Prabouré | `praboure` | Puy-de-Dôme |  |  |
| **Jura** (9) | | | | |
| Les Plans d'Hotonnes - Plateau de Retord | `les-plans-dhotonnes-plateau-de-retord` | Ain |  |  |
| Monts Jura | `monts-jura` | Ain |  |  |
| Menthières | `menthieres` | Ain ¹ |  |  |
| La Combe Saint Pierre | `la-combe-saint-pierre` | Doubs |  |  |
| Les Fourgs | `les-fourgs` | Doubs |  |  |
| Métabief Mont d'Or | `metabief-mont-dor` | Doubs |  |  |
| La Source du Doubs - Mouthe | `source-du-doubs-mouthe` | Doubs ¹ |  |  |
| Espace Alpin Bellefontaine | `espace-alpin-bellefontaine` | Jura |  |  |
| Station des Rousses – Jura sur Léman | `les-rousses` | Jura |  |  |
| **Vosges** (17) | | | | |
| Le Champ du Feu | `le-champ-du-feu` | Bas-Rhin |  |  |
| Le Lac Blanc | `le-lac-blanc` | Haut-Rhin |  |  |
| Le Markstein | `le-markstein` | Haut-Rhin |  |  |
| Le Schnepfenried | `le-schnepfenried` | Haut-Rhin |  |  |
| Gaschney 360 | `le-gaschney` | Haut-Rhin ¹ |  |  |
| La Planche des Belles Filles | `rouge-gazon` | Haute-Saône |  |  |
| Le Ballon d'Alsace | `le-ballon-dalsace` | Territoire de Belfort |  |  |
| Gérardmer | `gerardmer` | Vosges |  |  |
| La Bresse Brabant | `la-bresse-brabant` | Vosges |  |  |
| La Bresse Hohneck | `la-bresse-hohneck` | Vosges |  |  |
| La Bresse Lispach | `la-bresse-lispach` | Vosges |  |  |
| La Schlucht | `la-schlucht` | Vosges |  |  |
| Saint Maurice sur Moselle | `saint-maurice-sur-moselle` | Vosges |  |  |
| Ventron | `ventron` | Vosges |  |  |
| Xonrupt - Le Poli | `xonrupt-le-poli` | Vosges |  |  |
| Bussang - Larcenaire | `bussang-larcenaire` | Vosges ¹ |  |  |
| Le Grand Valtin | `le-grand-valtin` | Vosges ¹ |  |  |
| **Corse** (3) | | | | |
| Ghisoni | `ghisoni` | Haute-Corse ¹ |  |  |
| Val d'Ese *(sans fiche Skiinfo, gardée)* | `val-d-ese` | Corse-du-Sud |  |  |
| Haut Asco *(sans fiche Skiinfo, gardée)* | `haut-asco` | Haute-Corse |  |  |

Règles appliquées :

- **Une station = une fiche Skiinfo.**
- **Un grand domaine relié** réunit des stations reliées par les remontées.
  Il ne fusionne aucun logement.
- **Les forfaits commerciaux sont exclus** : Espace Haute Maurienne
  Vanoise, Eski-mo, Mont Blanc Unlimited.
- **Les villages rattachés** sont listés dans la colonne de droite. Les
  Coches vont à Montchavin - La Plagne (fiche `montchavin-les-coches`).

## 4. Suppressions et fusion

### 4.1 Les 17 entrées supprimées

Aucune de ces entrées n'a de fiche Skiinfo. J'ai consulté l'index par
massif et les listes par département : Isère, Savoie, Haute-Savoie,
Hautes-Alpes, Alpes-de-Haute-Provence, Doubs, Ain, Puy-de-Dôme, Loire et
Haut-Rhin. La liste des Pyrénées-Atlantiques répond 404 ; Le Somport n'y
figure donc que par l'index du massif.

| Entrée | id | Massif | Département | Commune | Domaine OSM actuel | Note |
| --- | --- | --- | --- | --- | --- | --- |
| Col de l'Arzelier | `col-de-l-arzelier` | Alpes du Nord | Isère | Château-Bernard | Col de l'Arzelier |  |
| La Motte-d'Aveillans | `la-motte-d-aveillans` | Alpes du Nord | Isère | La Motte-d'Aveillans | Les Signaraux |  |
| Lullin | `lullin` | Alpes du Nord | Haute-Savoie | Lullin | Stade de neige du Col du Feu | Col du Feu |
| Mégevette | `megevette` | Alpes du Nord | Haute-Savoie | Mégevette | Hirmentaz - Les Habères | ? peut-être rattachée aux Habères / Hirmentaz |
| Orange | `orange` | Alpes du Nord | Haute-Savoie | Saint-Sixt | Le Grand-Bornand | ? petite station de Saint-Sixt, 13 km du Grand-Bornand |
| Le Queyras | `le-queyras` | Alpes du Sud | Hautes-Alpes | Château-Ville-Vieille | Queyras - Arvieux | ? libellé générique « Le Queyras », peut-être un doublon |
| Montagne de Lure | `montagne-de-lure` | Alpes du Sud | Alpes-de-Haute-Provence | Saint-Étienne-les-Orgues | Montagne de Lure |  |
| Névache | `nevache` | Alpes du Sud | Hautes-Alpes | Névache | domaine non nommé (OpenStreetMap) | nordique surtout |
| Chaux de Gilley | `chaux-de-gilley` | Jura | Doubs | La Chaux | La Cernay Blanche |  |
| Hauteville - Lompnes | `hauteville-lompnes` | Jura | Ain | Plateau d'Hauteville | Terre Ronde |  |
| Le Larmont | `le-larmont` | Jura | Doubs | Pontarlier | Les Fourgs | ? Pontarlier, rangé sous « Les Fourgs » par OSM |
| Val de Morteau | `val-de-morteau` | Jura | Doubs | Morteau | Site du Meix Musy |  |
| La Bourboule | `la-bourboule` | Massif Central | Puy-de-Dôme | La Bourboule | — | sans domaine alpin |
| Les Monts du Pilat | `les-monts-du-pilat` | Massif Central | Loire | Saint-Genest-Malifaux | — | nordique |
| Le Somport / Candanchu | `le-somport-candanchu` | Pyrénées | Pyrénées-Atlantiques | Urdos | Candanchu | domaine côté Espagne |
| Le Frenz | `le-frenz` | Vosges | Haut-Rhin | Vieux-Thann | Thanner Hubel |  |
| Le Schlumpf | `le-schlumpf` | Vosges | Haut-Rhin | Dolleren | Le Schlumpf |  |

Ce que la suppression touchera en phase 2 :

- **Mécanisme.** Ces lignes viennent du classeur, qu'on ne corrige que dans
  le classeur et jamais dans le fichier généré. Une liste d'exclusion du
  même modèle que `STATIONS_FERMEES` (`classeur.ts:193`) les écartera. Un
  séjour, un relevé ou un lien enregistrés sous leur identifiant ne
  résoudront plus rien (`stationById` rend `undefined`), comme pour
  Le Grand Puy.
- **Références dans le dépôt.**
  - Grilles de forfait : `grillesMigrees.json`, `grillesOfficielles.json`
    et `sourcesTarifs.ts`, pour Arzelier, La Motte, Lullin, Orange,
    Le Queyras, Hauteville…
  - `osmAccess.snapshot.json`.
  - Webcams (`scripts/webcams/`, table générée).
  - `bra/massifs.ts` (Névache).
  - `classeur.ts:104` (La Bourboule).
  - Tests : `domainFit`, `fiche`, `v7`, `remontees`, `remonteeEnService`,
    `prix/calcul`, `forfaits/resolution`, `carte`.
- **Sous verrou « scraps ».** La seule référence trouvée est `la-bourboule`
  dans `src/lib/scrape/agences/couverture.ts:462`. Laissée en place, ce
  n'est qu'une clé morte.

### 4.2 Le Granier : fusion

Les deux agents confirment le doublon.

- La ligne `le-granier` du classeur n'a aucune mesure propre. Son domaine,
  ses 7,2 km de pistes et ses 10 remontées sont ceux du Planolet, obtenus
  par vote de proximité.
- Son repère est à 2,4 km de toute piste.
- Les deux lignes portent la même commune, Saint-Pierre-d'Entremont
  (INSEE 38446).
- `le-granier-vallee-des-entremonts` est relevée sur une vraie zone
  OpenSkiMap « Le Granier » : 8 pistes et 4 remontées. Sa grille de tarifs
  vient de stationdugranier.com.

Le code dit pourtant l'inverse. Il faudra le changer en phase 2 :

- `classeur.ts:380-384` traite les deux lignes comme deux lieux distincts.
- `stationMigration.ts:37-48` en fait autant.
- Deux tests exigent deux homonymes : `prix/calcul.test.ts:1144-1155` et
  `:2873-2874`.
- `grillesMigrees.json` place `le-granier` dans la grille de
  Saint-Pierre-de-Chartreuse.

## 5. Points ouverts

Les trois points à trancher sont réglés : Le Barioz va aux 7 Laux, Vergio
n'est pas ajoutée, et Doucy, Valberg - Beuil et Villard - Corrençon sont
retenus. Chastreix-Sancy reste hors du Grand Sancy.

**Non bloquants (domaine relié, aucun logement déplacé) :**

4. Abondance et Roc d'Enfer - Saint-Jean-d'Aulps : confirmées dans les
   Portes du Soleil le 5 octobre 2026.
5. Évasion Mont-Blanc : confirmé le 5 octobre 2026, un seul domaine relié
   (Megève, Saint-Gervais, Combloux, La Giettaz).
6. La Rosière (Espace San Bernardo) et Montgenèvre (Voie Lactée) : confirmés
   le 5 octobre 2026, grands domaines reliés avec l'Italie.
7. Nom des domaines : Le Grand Sancy / Le Sancy ; Tignes - Val d'Isère /
   Espace Killy.

**Complétude de l'index :** les listes par département n'ont pas toutes
été lues. Lues : les 10 départements du § 4.1 et la Corse. D'autres fiches
rangées sous un chemin par département, comme Sollières, peuvent exister
ailleurs.

## 6. Phase 2 : constats de départ (relecture du code)

Ordre de rattachement confirmé : d'abord la table village → station, puis
les coordonnées, puis le texte. Chaque village de la table reçoit ses
propres coordonnées. Le repère de La Plagne passe à Plagne Centre ; celui
des Menuires est revu pour que Reberty y soit rattaché. **Chaque
coordonnée sera proposée avec sa source avant d'être inscrite.**

Constats de la relecture du code (agent 2) :


- **Forfaits commerciaux déjà traités comme liaisons.** `linkedSkiStations`
  (`domainFit.ts:135-174`) relie Aussois, Bessans, Bonneval et Termignon
  par le pass Haute Maurienne Vanoise, Combloux / Contamines /
  Saint-Nicolas par Évasion Mont-Blanc, Chamonix / Vallorcine par Mont
  Blanc Unlimited. Ces paires comptent comme « dans le domaine »
  (`domainFit.ts:276`). `stationsVoisines` donne 8 voisines à Val Cenis
  par « Espace Haute Maurienne Vanoise ».
- **Repères faux** (ceux du dépôt, qui priment sur le classeur,
  `stations.ts:200-204`) : `la-plagne` est à 270 m de Montchavin (1 249 m) ;
  `les-menuires` à 310 m de Saint-Martin (1 429 m) ; **`les-saisies`** à
  250 m de Notre-Dame-de-Bellecombe (1 145 m). Décentrés : `val-cenis`
  (à Termignon), `val-dallos` (au Seignus), `la-mongie-bareges`, `samoens`
  (fond de vallée). Hors table : `st-jean-darves` et `le-corbier` à 30 m
  l'un de l'autre. 15 villages sur 66 ont pour plus proche une autre
  station que leur cible.
- **Pas de contours dans le dépôt.** Les polygones OpenSkiMap ne sont que
  dans le PMTiles hors dépôt. Repli possible : l'osmId de zone du classeur,
  identique entre village et cible pour 59 villages sur 66.
- **Retirer les villages des stations change le jugement des annonces.**
  `nearestStationPin` et `stationIdFromText` (`domainFit.ts:184-223`) s'en
  servent comme repères fins et comme noms. Sans eux et sans table :
  Villaroger et Vallorcine sortent du domaine ; une annonce qui ne dit que
  « Val Claret » ou « Arc 1800 » devient inconnue (seuls Le Fornet et
  La Daille ont un alias, `domainFit.ts:71-82`).
- **Données enregistrées sous un id de village.** Relevés Prix (clé par
  `station.id`, lus en parcourant `STATIONS`, `routes/prix.tsx:625, 906,
  910, 1011`, sans `stationById`) ; parcours (`idCourant` ne connaît que
  `IDS_RETIRES`, `parcours.ts:229-231`) ; favoris (nom par `stationById`).
- **Forfaits par village.** 18 grilles de `grillesMigrees.json` ne portent
  que des villages (dont Saint-Lary, sur `espiaube` et
  `saint-lary-pla-d-adet` seuls). 13 villages ont leur entrée de catalogue :
  Termignon (255 €) et Saint-Nicolas (312 €) portent un tarif que Val Cenis
  et Saint-Gervais n'ont pas.
- **Collecteurs indexés par village, sous verrou « scraps »** :
  `scrape/agences/couverture.ts` (38 villages), `alpissime.ts`,
  `centrales/hotes/laPlagne.ts`, `centrales/moteurs.data.json`,
  `gitesCommunes.ts`, `skiPlanet.residences.json`. Sans l'accord, ces
  tables ne suivront pas : une recherche sur La Plagne n'interroge que les
  lieux listés sous sa propre clé.
- **`stationId` de `Listing`** (`listings.ts:20`, sans commentaire) est
  toujours **la station de la recherche** : recopiée par les collecteurs
  depuis `input.stationId`, filtrée en égalité stricte
  (`listings.ts:527-529`). La station déduite vit dans `nearestDomainId` /
  `nearestDomainName` (`listings.ts:110-111`), rejugée à la relecture
  (`domainFit.ts:299-321`).
- **Tests** qui portent des ids de village ou le compte de 313 : `alt`,
  `fiche`, `remontees`, `alpine`, `stationMigration`, `domainFit`,
  `forfaits/catalog`, `prix/calcul`, `prix/horsSujet`, `remonteeEnService`,
  `v7`. `GPS_FIXES` : 18 entrées sur 22 sont des villages.

## 7. Coordonnées proposées (à valider avant inscription)

Rien n'est inscrit. Il y a trois sources :

- **le relevé à la main du 15 septembre** (`GPS_FIXES`), gardé tel quel pour
  18 villages ;
- **le géocodage public de l'IGN** (`data.geopf.fr/geocodage`, toponymes de
  la BD TOPO), une requête par lieu ;
- pour 25 villages, **le repère actuel**, qui est déjà exactement le
  toponyme IGN : le classeur le tient de là.

La colonne « remontée » donne la distance à la plus proche remontée OSM
que le dépôt associe à l'entrée (`osmAccess.snapshot.json`). Pour Le Barioz,
ces remontées ont été rattachées depuis l'ancien repère, à Allevard : la
distance n'y prouve rien.

### Repères de station

| Station | Proposé | Actuel | Remontée OSM la plus proche | Source |
| --- | --- | --- | --- | --- |
| La Plagne | 45.50751, 6.67691 | 45.55812, 6.73730 (déplacé de 7,3 km) | 109 m | IGN BD TOPO, Plagne Centre (comme `plagne-centre`) — ta consigne |
| Les Menuires | 45.32739, 6.53682 | 45.37691, 6.50495 (déplacé de 6,0 km) | 138 m | IGN BD TOPO, toponyme « les Menuires » — ta consigne : Reberty doit y revenir |
| Les Saisies | 45.75615, 6.54070 | 45.81000, 6.52007 (déplacé de 6,2 km) | 364 m | IGN BD TOPO, toponyme « les Saisies » — proposé : repère actuel à 6,2 km, signalé par l'agent 2 |

Contrôle Reberty : 1,6 km des Menuires, 3,3 km de Val Thorens, 7,9 km de Saint-Martin.

### Villages

| Village | Station | Proposé (lat, lon) | Écart au repère actuel | Remontée OSM la plus proche | Source |
| --- | --- | --- | --- | --- | --- |
| Argentière | Chamonix-Mont-Blanc | 45.98400, 6.92800 | inchangé | 510 m | relevé à la main du 15 sept. 2026 (`GPS_FIXES`) |
| Le Tour | Chamonix-Mont-Blanc | 45.99970, 6.94730 | inchangé | 282 m | relevé à la main du 15 sept. 2026 (`GPS_FIXES`) |
| Vallorcine | Chamonix-Mont-Blanc | 46.02819, 6.92584 | déplacé de 576 m | 816 m | IGN BD TOPO, toponyme « Vallorcine », lieu-dit habité |
| Chamrousse 1650 | Chamrousse | 45.12526, 5.87525 | déplacé de 171 m | 124 m | IGN BD TOPO, toponyme « le Recoin » |
| Chamrousse 1750 | Chamrousse | 45.11069, 5.87524 | déplacé de 226 m | 79 m | IGN BD TOPO, toponyme « Roche Béranger » |
| Courchevel Le Praz | Courchevel | 45.43202, 6.62165 | inchangé | 186 m | IGN BD TOPO, toponyme « Courchevel le Praz » |
| Courchevel Moriond 1650 | Courchevel | 45.41650, 6.65200 | inchangé | 73 m | relevé à la main du 15 sept. 2026 (`GPS_FIXES`) |
| Courchevel Village 1550 | Courchevel | 45.42221, 6.64143 | inchangé | 66 m | IGN BD TOPO, toponyme « Courchevel Village » |
| Plateau de Beauregard | La Clusaz | 45.89538, 6.41247 | déplacé de 4,9 km | 466 m | IGN BD TOPO, toponyme « Beauregard », commune de La Clusaz — repère actuel au centre de Manigod, à 4,9 km |
| Barèges | Grand Tourmalet (La Mongie / Barèges) | 42.89642, 0.06284 | inchangé | 1,3 km | IGN BD TOPO, toponyme « Barèges » |
| La Mongie | Grand Tourmalet (La Mongie / Barèges) | 42.91015, 0.17511 | inchangé | 141 m | IGN BD TOPO, toponyme « la Mongie » |
| Aime 2000 | La Plagne | 45.50850, 6.67250 | inchangé | 235 m | relevé à la main du 15 sept. 2026 (`GPS_FIXES`) |
| Belle Plagne | La Plagne | 45.51280, 6.70600 | inchangé | 488 m | relevé à la main du 15 sept. 2026 (`GPS_FIXES`) |
| La Plagne Montalbert | La Plagne | 45.53415, 6.63702 | déplacé de 114 m | 38 m | IGN BD TOPO, toponyme « Montalbert » |
| Plagne 1800 | La Plagne | 45.50872, 6.67690 | inchangé | 183 m | IGN BD TOPO, toponyme « Plagne 1800 » |
| Plagne Bellecôte | La Plagne | 45.51294, 6.69835 | inchangé | 41 m | IGN BD TOPO, toponyme « Plagne Bellecôte » |
| Plagne Centre | La Plagne | 45.50751, 6.67691 | inchangé | 109 m | IGN BD TOPO, « Police municipale – Plagne Centre » (aucun lieu-dit « Plagne Centre » à l'IGN) ; = repère du classeur |
| Plagne Soleil | La Plagne | 45.50639, 6.68525 | inchangé | 85 m | IGN BD TOPO, toponyme « Plagne Soleil » |
| Plagne Villages | La Plagne | 45.50496, 6.68709 | inchangé | 143 m | IGN BD TOPO, toponyme « Plagne Villages » |
| Le Chinaillon | Le Grand-Bornand | 45.96470, 6.45090 | inchangé | 357 m | relevé à la main du 15 sept. 2026 (`GPS_FIXES`) |
| Le Barioz Alpin | Les 7 Laux | 45.33141, 6.02698 | déplacé de 8,7 km | 2,0 km | IGN BD TOPO, toponyme « Col du Barioz » (Theys) — repère actuel à Allevard, 8 km du col |
| Le Pleynet | Les 7 Laux | 45.27233, 6.05559 | inchangé | 85 m | IGN BD TOPO, toponyme « le Pleynet » |
| Pipay | Les 7 Laux | 45.26498, 6.01548 | inchangé | 69 m | IGN BD TOPO, toponyme « Pipay » |
| Prapoutel | Les 7 Laux | 45.25464, 5.99385 | déplacé de 269 m | 29 m | IGN BD TOPO, toponyme « Prapoutel » |
| Arc 1600 | Les Arcs | 45.57350, 6.79600 | inchangé | 130 m | relevé à la main du 15 sept. 2026 (`GPS_FIXES`) |
| Arc 1800 | Les Arcs | 45.57170, 6.80600 | inchangé | 266 m | relevé à la main du 15 sept. 2026 (`GPS_FIXES`) |
| Arc 1950 | Les Arcs | 45.57310, 6.82850 | inchangé | 89 m | relevé à la main du 15 sept. 2026 (`GPS_FIXES`) |
| Arc 2000 | Les Arcs | 45.57150, 6.83190 | inchangé | 13 m | relevé à la main du 15 sept. 2026 (`GPS_FIXES`) |
| Villaroger | Les Arcs | 45.59053, 6.87512 | déplacé de 940 m | 950 m | IGN BD TOPO, toponyme « Villaroger », lieu-dit habité |
| Hauteluce Val Joly | Les Contamines-Montjoie | 45.75930, 6.60460 | inchangé | 2,1 km | relevé à la main du 15 sept. 2026 (`GPS_FIXES`) |
| Reberty | Les Menuires | 45.31455, 6.54458 | déplacé de 411 m | 19 m | IGN BD TOPO, toponyme « Reberty » |
| Les Orres 1650 | Les Orres | 44.49328, 6.55666 | déplacé de 46 m | 117 m | IGN BD TOPO, toponyme « les Orres 1650 » |
| Les Orres 1800 | Les Orres | 44.48362, 6.55361 | déplacé de 116 m | 51 m | IGN BD TOPO, toponyme « les Orres 1800 » |
| Bisanne 1500 | Les Saisies | 45.75260, 6.52430 | inchangé | 472 m | relevé à la main du 15 sept. 2026 (`GPS_FIXES`) |
| Méribel-Mottaret | Méribel | 45.37308, 6.57727 | inchangé | 90 m | IGN BD TOPO, toponyme « Méribel-Mottaret » |
| Méribel Village | Méribel | 45.41593, 6.56438 | inchangé | 102 m | IGN BD TOPO, toponyme « Méribel Village » |
| Les Coches | Montchavin - La Plagne | 45.54720, 6.74300 | inchangé | 359 m | relevé à la main du 15 sept. 2026 (`GPS_FIXES`) |
| Pra Loup 1500 | Praloup | 44.35984, 6.61236 | déplacé de 179 m | 107 m | IGN BD TOPO, toponyme « les Molanès » (Pra Loup 1500) |
| Puy-Saint-Vincent 1600 | Puy-Saint-Vincent | 44.81919, 6.48635 | déplacé de 67 m | 122 m | IGN BD TOPO, toponyme « Station 1600 » |
| Puy-Saint-Vincent 1800 | Puy-Saint-Vincent | 44.81672, 6.48108 | déplacé de 124 m | 377 m | IGN BD TOPO, toponyme « Station 1800 » |
| Le Bettex | Saint Gervais Mont-Blanc | 45.86000, 6.69600 | inchangé | 794 m | relevé à la main du 15 sept. 2026 (`GPS_FIXES`) |
| Saint-Nicolas de Véroce | Saint Gervais Mont-Blanc | 45.85502, 6.72284 | déplacé de 2,0 km | 151 m | IGN BD TOPO, toponyme « Saint-Nicolas de Véroce » — repère actuel au centre de la commune de Saint-Gervais |
| Espiaube | Saint Lary | 42.82569, 0.25866 | déplacé de 651 m | 54 m | IGN BD TOPO, toponyme « Espiaube » |
| Saint-Lary Pla d'Adet | Saint Lary | 42.81339, 0.29658 | déplacé de 142 m | 65 m | IGN BD TOPO, toponyme « le Pla d'Adet » |
| Samoëns 1600 | Samoëns | 46.05502, 6.70127 | déplacé de 312 m | 44 m | IGN BD TOPO, toponyme « Station de Samoëns 1600 » |
| Super Sauze | Sauze Super Sauze | 44.35806, 6.68648 | déplacé de 75 m | 95 m | IGN BD TOPO, toponyme « le Super Sauze » |
| Serre Chevalier Briançon | Serre Chevalier | 44.90451, 6.63122 | déplacé de 8,1 km | 866 m | IGN BD TOPO, toponyme « le Prorel », Briançon — confirmé le 5 octobre 2026 ; l'ancien repère (et la commune La Salle-les-Alpes) était celui de Villeneuve |
| Serre Chevalier Chantemerle | Serre Chevalier | 44.93175, 6.58944 | inchangé | 208 m | repère du classeur, gardé (aucun toponyme « Chantemerle » à l'IGN dans les Hautes-Alpes) — confirmé le 5 octobre 2026 |
| Serre Chevalier Le Monêtier | Serre Chevalier | 44.97526, 6.51079 | inchangé | 454 m | IGN BD TOPO, toponyme « Le Monêtier-les-Bains » |
| Haut Giffre | Sixt-Fer-à-Cheval | 46.04148, 6.77085 | déplacé de 2,6 km | 295 m | IGN BD TOPO, toponyme « Salvagny » (secteur de Sixt du Grand Massif) — confirmé le 5 octobre 2026 (aucun toponyme « Haut Giffre » à l'IGN) |
| La Joue du Loup | Superdévoluy / La Joue du Loup | 44.68999, 5.89362 | inchangé | 163 m | IGN BD TOPO, toponyme « la Joue du Loup » |
| Le Devoluy | Superdévoluy / La Joue du Loup | 44.67834, 5.92701 | déplacé de 1,6 km | 213 m | IGN BD TOPO, toponyme « Superdévoluy » — l'entrée « Le Dévoluy » désigne Superdévoluy |
| Tignes Le Lac | Tignes | 45.46834, 6.90629 | inchangé | 74 m | IGN BD TOPO, toponyme « Tignes le Lac » |
| Tignes Les Boisses | Tignes | 45.49524, 6.92555 | inchangé | 90 m | IGN BD TOPO, toponyme « les Boisses » |
| Tignes Les Brévières | Tignes | 45.50878, 6.92025 | inchangé | 154 m | IGN BD TOPO, toponyme « les Brévières » |
| Tignes Val Claret | Tignes | 45.45644, 6.89979 | inchangé | 217 m | IGN BD TOPO, toponyme « Val Claret » |
| Lanslebourg | Val-Cenis | 45.28600, 6.87900 | inchangé | 216 m | relevé à la main du 15 sept. 2026 (`GPS_FIXES`) |
| Lanslevillard | Val-Cenis | 45.29000, 6.90800 | inchangé | 154 m | relevé à la main du 15 sept. 2026 (`GPS_FIXES`) |
| Termignon | Val-Cenis | 45.27934, 6.81530 | inchangé | 629 m | IGN BD TOPO, toponyme « Termignon » |
| La Foux d'Allos | Val d'Allos | 44.29029, 6.57021 | inchangé | 160 m | IGN BD TOPO, toponyme « la Foux d'Allos » |
| Le Seignus | Val d'Allos | 44.24185, 6.61660 | inchangé | 122 m | IGN BD TOPO, toponyme « le Seignus Bas » |
| La Daille | Val-d'Isère | 45.45950, 6.96200 | inchangé | 180 m | relevé à la main du 15 sept. 2026 (`GPS_FIXES`) |
| Le Fornet | Val-d'Isère | 45.43970, 7.01900 | inchangé | 307 m | relevé à la main du 15 sept. 2026 (`GPS_FIXES`) |
| Les Claux | Vars | 44.57061, 6.68299 | déplacé de 247 m | 188 m | IGN BD TOPO, toponyme « les Claux », commune de Vars |
| Vars Sainte-Marie | Vars | 44.59763, 6.69249 | déplacé de 526 m | 309 m | IGN BD TOPO, toponyme « Sainte-Marie », commune de Vars |

### Stations ajoutées

| Station | Proposé | Source |
| --- | --- | --- |
| sollieres-sardieres | 45.24383, 6.78029 | IGN BD TOPO, toponyme « Sardières », Val-Cenis (domaine nordique) |

### Contrôle : villages dont la station la plus proche n'est pas la leur (après correction)

- Vallorcine : plus proche Sixt-Fer-à-Cheval (12,0 km), station Chamonix-Mont-Blanc (12,4 km)
- Villaroger : plus proche Sainte-Foy-Tarentaise (2,1 km), station Les Arcs (6,7 km)
- Hauteluce Val Joly : plus proche Les Saisies (5,0 km), station Les Contamines-Montjoie (11,9 km)
- Saint-Nicolas de Véroce : plus proche Les Contamines-Montjoie (3,7 km), station Saint Gervais Mont-Blanc (4,1 km)

Ces quatre villages restent plus près d'une autre station que de la leur,
même après correction. C'est pour cela que la table passe avant les
coordonnées. Hauteluce-Val Joly n'est relié aux Contamines que par le
domaine, et Saint-Nicolas est entre Saint-Gervais et Les Contamines.

## 8. Phase 2 faite (5 octobre 2026)

Accord « scraps » donné le 5 octobre. Code :

- `src/lib/villages.ts` : la table (65 villages et leurs coordonnées validées,
  17 lignes retirées, la fusion du Granier, l'alias `alpe-dhuez`, les trois
  repères revus, Sollières-Sardières, les départements posés à la main) et
  `RATTACHEMENT_MAX_KM = 12`.
- `src/lib/grandsDomaines.ts` : les 21 grands domaines reliés, tous confirmés.
- `src/lib/rattachement.ts` : localité publiée par la table, puis repère le
  plus proche à 12 km, puis texte. Une localité qui n'est qu'une commune
  partagée (Morzine, Val-Cenis, La Plagne Tarentaise) ne prouve rien ; la
  phrase de distance d'Airbnb (« Morzine est à 11 km de Abondance ») est
  ramenée à son lieu. Sans rien : « non rattaché », motif `trop-loin` ou
  `sans-lieu`.
- `stations.ts` : 231 stations ; `stationById` résout village, doublon et
  alias. `domainFit`, `stationsVoisines`, la puce et la ligne « Domaine relié »
  lisent la même table. Plus de liaison par forfait ni par libellé OSM.
- Logements : sur un grand domaine, les logements se rangent par station (la
  cherchée d'abord), chacun une fois ; « N non rattachés (motifs) » s'affiche
  à côté du compte.
- Recherche par nom : un village (« Val Claret », « Plagne Centre ») renvoie à
  sa station, dans les suggestions et en toutes lettres.
- Pas de migration des données : relevés Prix lus sous la clé d'un ancien
  identifiant (`cleDeLecture`), annonces rejugées à la relecture, grilles de
  forfait d'un village ramenées à sa station quand elle n'en a pas, remontées
  OSM d'un village réunies à sa station (sans les gares d'un autre domaine).
  Seul le parcours enregistré (station retenue, comparaison) est réécrit
  (`migrerParcours`, version 5), comme pour les identifiants retirés en
  septembre.
- Collecteurs (verrou « scraps ») : `couverture.ts` (une station interroge ses
  lieux, à défaut ceux de ses villages ; Ski-Planet additionne les deux) et
  `centrales/registre.ts` (l'hôte d'un village vaut pour sa station qui n'en a
  pas).
- `Listing.stationId` documenté : la station du relevé, pas celle du logement.
- Point ouvert : un même bien sur deux plateformes reste en double hors des
  deux preuves de `stay/regroupement.ts`.

Décisions du 5 octobre 2026, toutes prises :

1. ~~Val d'Ese et Haut Asco~~ : gardées sans fiche Skiinfo (5 octobre 2026).
   Altitudes du texte de la page Corse de Skiinfo : Val d'Ese 1 620 – 1 825 m,
   Haut Asco 1 450 m, sommet non publié.
2. ~~Évasion Mont-Blanc~~ : confirmé le 5 octobre 2026 (Megève,
   Saint-Gervais, Combloux, La Giettaz, un seul domaine relié).
3. ~~Serre Chevalier Briançon, Chantemerle, Haut Giffre~~ : confirmés le
   5 octobre 2026 (Briançon au Prorel, Chantemerle au repère du classeur,
   Haut Giffre à Salvagny).
