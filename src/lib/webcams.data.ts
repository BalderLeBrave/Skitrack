/**
 * Caméras vérifiées, par identifiant de station.
 *
 * Relevé du 2026-09-30 : chaque adresse a été affichée dans le cadre de
 * l'application (`iframe`, `sandbox="allow-scripts allow-same-origin"`,
 * `referrerpolicy="no-referrer"`) depuis une page locale, sa capture regardée,
 * et la date de sa dernière image relevée. Trois caméras au plus par station :
 * la vue la plus large du domaine d'abord, puis le sommet ou le front de neige,
 * puis le village ; une caméra coupée pour l'intersaison passe derrière celles
 * qui tournent, son lecteur affiche la date de sa dernière image.
 *
 * Sources : le plan du site de Skaping (`sitemap.players.xml`), les groupes de
 * Webcam-HD (`smr/json/webcam_display_group/<groupe>.json`, le fichier que
 * son lecteur lit), et les caméras de l'ancienne table. 148 stations,
 * 319 caméras.
 */

export type Camera = {
  label: string;
  url: string;
  fournisseur: string;
  /** Une image fixe plutôt qu'un lecteur. */
  kind?: "image";
};

export const CAMERAS: Readonly<Record<string, readonly Camera[]>> = {
  "les-aillons-margeriaz": [
    { label: "Roc de Margériaz", url: "https://www.skaping.com/aillons-margeriaz/roc-de-margeriaz", fournisseur: "Skaping" },
    { label: "Sommet Margériaz", url: "https://app.webcam-hd.com/aillons-margeriaz/les-biolles", fournisseur: "Webcam-HD" },
    { label: "Val d'Aillon (Aillons Margériaz 1000)", url: "https://www.skaping.com/aillons-margeriaz/1000", fournisseur: "Skaping" },
  ],
  "aime-2000": [
    { label: "La Plagne Aime 2000", url: "https://app.webcam-hd.com/webcam-station-la-plagne/Aime-2000", fournisseur: "Webcam-HD" },
  ],
  "albiez-montrond": [
    { label: "Front de Neige Grand Loup", url: "https://app.webcam-hd.com/albiez/front-de-neige-grand-loup", fournisseur: "Webcam-HD" },
    { label: "Haut Echaux, Albiez", url: "https://app.webcam-hd.com/albiez/haut-echaux", fournisseur: "Webcam-HD" },
  ],
  "alpe-d-huez": [
    { label: "Vue à 3 060 m", url: "https://www.skaping.com/alpedhuez/3060m", fournisseur: "Skaping" },
    { label: "Le Signal", url: "https://www.skaping.com/alpedhuez/lesignal", fournisseur: "Skaping" },
    { label: "Pic Blanc", url: "https://www.skaping.com/alpedhuez/pic-blanc", fournisseur: "Skaping" },
  ],
  "alpe-du-grand-serre": [
    { label: "Sommet Serriou", url: "https://app.webcam-hd.com/alpe-du-grand-serre/serriou", fournisseur: "Webcam-HD" },
    { label: "Les Cochettes", url: "https://app.webcam-hd.com/alpe-du-grand-serre/les-cochettes", fournisseur: "Webcam-HD" },
    { label: "Les bergeries", url: "https://app.webcam-hd.com/alpe-du-grand-serre/la-flambee", fournisseur: "Webcam-HD" },
  ],
  "areches-beaufort": [
    { label: "Sommet Combettes", url: "https://app.webcam-hd.com/areches-beaufort/sommet-combettes", fournisseur: "Webcam-HD" },
    { label: "Cuvy", url: "https://app.webcam-hd.com/areches-beaufort/cuvy", fournisseur: "Webcam-HD" },
    { label: "Planay", url: "https://app.webcam-hd.com/areches-beaufort/planay", fournisseur: "Webcam-HD" },
  ],
  "argentiere": [
    { label: "Plateau de Lognan", url: "https://www.skaping.com/chamonix/plateau-de-lognan", fournisseur: "Skaping" },
  ],
  "aussois": [
    { label: "Sommet de l'Armoise", url: "https://www.skaping.com/aussois/sommet-armoise", fournisseur: "Skaping" },
    { label: "Sommet Grand Jeu", url: "https://www.skaping.com/aussois/sommet-grand-jeu", fournisseur: "Skaping" },
    { label: "Le Village", url: "https://www.skaping.com/aussois/le-village", fournisseur: "Skaping" },
  ],
  "autrans": [
    { label: "Sommet du domaine alpin", url: "https://app.webcam-hd.com/autrans-meaudre/tsf-la-quoi", fournisseur: "Webcam-HD" },
    { label: "Front de neige", url: "https://app.webcam-hd.com/autrans-meaudre/chatelard", fournisseur: "Webcam-HD" },
    { label: "Tremplins du Claret", url: "https://app.webcam-hd.com/autrans-meaudre/autrans_tremplin", fournisseur: "Webcam-HD" },
  ],
  "avoriaz": [
    { label: "Vue Station", url: "https://www.skaping.com/avoriaz/pistes", fournisseur: "Skaping" },
    { label: "Station", url: "https://www.skaping.com/avoriaz/station", fournisseur: "Skaping" },
  ],
  "bernex": [
    { label: "Front de neige", url: "https://app.webcam-hd.com/bernex/front-de-neige", fournisseur: "Webcam-HD" },
    { label: "TSD Pré-Richard", url: "https://app.webcam-hd.com/bernex/pre-richard", fournisseur: "Webcam-HD" },
  ],
  "bessans": [
    { label: "Panoramique", url: "https://app.webcam-hd.com/bessans/relais", fournisseur: "Webcam-HD" },
    { label: "La Bessannaise", url: "https://app.webcam-hd.com/bessans/bessannaise", fournisseur: "Webcam-HD" },
    { label: "Carreley", url: "https://app.webcam-hd.com/bessans/carreley", fournisseur: "Webcam-HD" },
  ],
  "bisanne-1500": [
    { label: "Bisanne 1500", url: "https://app.webcam-hd.com/les-saisies/bisanne-1500", fournisseur: "Webcam-HD" },
  ],
  "bonneval-sur-arc": [
    { label: "Andagne", url: "https://pv.viewsurf.com/1496/Bonneval-Andagne?i=NTk3ODp1bmRlZmluZWQ", fournisseur: "Viewsurf" },
  ],
  "brides-les-bains": [
    { label: "Centre Village", url: "https://app.webcam-hd.com/brides-les-bains/centre-village", fournisseur: "Webcam-HD" },
  ],
  "chamonix": [
    { label: "Aiguille du Midi", url: "https://www.skaping.com/chamonix/aiguille-du-midi", fournisseur: "Skaping" },
    { label: "Panorama", url: "https://www.skaping.com/chamonix-mont-blanc", fournisseur: "Skaping" },
    { label: "Chamonix Index", url: "https://www.skaping.com/chamonix/flegere", fournisseur: "Skaping" },
  ],
  "champagny-en-vanoise": [
    { label: "Le Village", url: "https://app.webcam-hd.com/champagny/webcam-champagny-village", fournisseur: "Webcam-HD" },
    { label: "Le Haut-Site nordique", url: "https://app.webcam-hd.com/champagny/champagny-le-haut", fournisseur: "Webcam-HD" },
    { label: "Tour de Glace", url: "https://app.webcam-hd.com/champagny/tour-de-glace", fournisseur: "Webcam-HD" },
  ],
  "chamrousse": [
    { label: "Casserousse", url: "https://www.skaping.com/chamrousse/panorama-casserousse", fournisseur: "Skaping" },
    { label: "Les crêtes", url: "https://www.skaping.com/chamrousse/les-cretes", fournisseur: "Skaping" },
    { label: "La Croix", url: "https://www.skaping.com/chamrousse/la-croix", fournisseur: "Skaping" },
  ],
  "la-chapelle-dabondance": [
    { label: "Braitaz", url: "https://app.webcam-hd.com/la-chapelle/braitaz", fournisseur: "Webcam-HD" },
  ],
  "chatel": [
    { label: "Panoramique Morclan", url: "https://app.webcam-hd.com/chatel/morclan", fournisseur: "Webcam-HD" },
    { label: "TS L'Echo Alpin", url: "https://app.webcam-hd.com/chatel/ts-echo-alpin", fournisseur: "Webcam-HD" },
    { label: "Pierre longue", url: "https://www.skaping.com/chatel/pierre-longue", fournisseur: "Skaping" },
  ],
  "combloux": [
    { label: "Pertuis", url: "https://www.skaping.com/combloux/sommet", fournisseur: "Skaping" },
  ],
  "courchevel": [
    { label: "Le Signal", url: "https://www.skaping.com/courchevel/le-signal", fournisseur: "Skaping" },
    { label: "Chenus", url: "https://www.skaping.com/courchevel/chenus", fournisseur: "Skaping" },
    { label: "La Croisette", url: "https://www.skaping.com/courchevel/la-croisette", fournisseur: "Skaping" },
  ],
  "crest-voland-cohennoz": [
    { label: "La Logère", url: "https://www.skaping.com/crest-voland/lalogere", fournisseur: "Skaping" },
    { label: "Le Cernix", url: "https://www.skaping.com/crest-voland/le-cernix", fournisseur: "Skaping" },
  ],
  "saint-jean-daulps": [
    { label: "Roc d'Enfer", url: "https://www.skaping.com/rocdenfer", fournisseur: "Skaping" },
  ],
  "flaine": [
    { label: "Véret", url: "https://www.skaping.com/flaine/veret", fournisseur: "Skaping" },
    { label: "Désert Blanc", url: "https://www.skaping.com/flaine/desert-blanc", fournisseur: "Skaping" },
  ],
  "gresse-en-vercors": [
    { label: "Grand Veymont", url: "https://app.webcam-hd.com/gresse-en-vercors/grand-veymont", fournisseur: "Webcam-HD" },
  ],
  "les-haberes": [
    { label: "Centre Station", url: "https://app.webcam-hd.com/les-haberes/centre-station", fournisseur: "Webcam-HD" },
  ],
  "bellevaux-hirmentaz": [
    { label: "Secteur Rhodos", url: "https://app.webcam-hd.com/hirmentaz/coeur-de-station", fournisseur: "Webcam-HD" },
    { label: "Glisse Tranquille", url: "https://app.webcam-hd.com/hirmentaz/glisse-tranquille", fournisseur: "Webcam-HD" },
    { label: "Espace Nordique", url: "https://app.webcam-hd.com/hirmentaz/espace-nordique", fournisseur: "Webcam-HD" },
  ],
  "la-clusaz": [
    { label: "Snowpark", url: "https://app.webcam-hd.com/la-clusaz/snow-park", fournisseur: "Webcam-HD" },
    { label: "Beauregard", url: "https://app.webcam-hd.com/la-clusaz/beauregard", fournisseur: "Webcam-HD" },
    { label: "Le Bossonnet", url: "https://app.webcam-hd.com/la-clusaz/bossonnet", fournisseur: "Webcam-HD" },
  ],
  "la-daille": [
    { label: "La Daille", url: "https://www.skaping.com/valdisere/la-daille", fournisseur: "Skaping" },
  ],
  "la-giettaz": [
    { label: "Sommet Tête du Torraz, 1 930 m", url: "https://www.skaping.com/la-giettaz/sommet", fournisseur: "Skaping" },
  ],
  "la-norma": [
    { label: "Carrelet", url: "https://www.skaping.com/la-norma/carrelet", fournisseur: "Skaping" },
    { label: "Fontaine aux oiseaux", url: "https://www.skaping.com/la-norma/fontaine-aux-oiseaux", fournisseur: "Skaping" },
  ],
  "la-plagne": [
    { label: "Bergerie", url: "https://app.webcam-hd.com/webcam-station-la-plagne/bergerie", fournisseur: "Webcam-HD" },
    { label: "Grande Rochette", url: "https://app.webcam-hd.com/webcam-station-la-plagne/grande-rochette", fournisseur: "Webcam-HD" },
    { label: "Live 3000", url: "https://app.webcam-hd.com/webcam-station-la-plagne/live-3000", fournisseur: "Webcam-HD" },
  ],
  "la-plagne-montalbert": [
    { label: "Montalbert", url: "https://app.webcam-hd.com/webcam-station-la-plagne/montalbert", fournisseur: "Webcam-HD" },
  ],
  "la-rosiere-1850": [
    { label: "Mont Valaisan, 2 800 m", url: "https://app.webcam-hd.com/la-rosiere/mont-valaisan", fournisseur: "Webcam-HD" },
    { label: "Le Fort, 2 400 m", url: "https://app.webcam-hd.com/la-rosiere/traversette", fournisseur: "Webcam-HD" },
    { label: "Plan du Repos, 2 330 m", url: "https://app.webcam-hd.com/la-rosiere/plan-du-repos", fournisseur: "Webcam-HD" },
  ],
  "la-tania": [
    { label: "Coeur de Station", url: "https://app.webcam-hd.com/la-tania/chalet-esf", fournisseur: "Webcam-HD" },
    { label: "Bouc Blanc", url: "https://www.skaping.com/courchevel/bouc-blanc", fournisseur: "Skaping" },
  ],
  "la-toussuire": [
    { label: "Front de Neige", url: "https://www.skaping.com/la-toussuire/front-de-neige", fournisseur: "Skaping" },
    { label: "Les Lutins", url: "https://www.skaping.com/latoussuire/les-lutins", fournisseur: "Skaping" },
    { label: "Chaput", url: "https://www.skaping.com/latoussuire/chaput", fournisseur: "Skaping" },
  ],
  "le-collet-dallevard": [
    { label: "Les Plagnes", url: "https://www.skaping.com/collet-d-allevard/sommet", fournisseur: "Skaping" },
  ],
  "le-corbier": [
    { label: "Charvin Express", url: "https://www.skaping.com/les-sybelles/charvin-express/panoramique", fournisseur: "Skaping" },
    { label: "Pointe du Corbier", url: "https://www.skaping.com/les-sybelles/pointe-du-corbier", fournisseur: "Skaping" },
    { label: "Front de neige", url: "https://www.skaping.com/le-corbier/front-de-neige", fournisseur: "Skaping" },
  ],
  "le-fornet": [
    { label: "Fornet", url: "https://www.skaping.com/valdisere/fornet", fournisseur: "Skaping" },
  ],
  "le-grand-bornand": [
    { label: "La Taverne, 1 550 m", url: "https://www.skaping.com/le-grand-bornand/taverne", fournisseur: "Skaping" },
    { label: "Le Maroly, 1 750 m", url: "https://www.skaping.com/le-grand-bornand/terresrouges", fournisseur: "Skaping" },
    { label: "Village, 1 000 m", url: "https://www.skaping.com/le-grand-bornand/village", fournisseur: "Skaping" },
  ],
  "le-pleynet": [
    { label: "Oursière", url: "https://www.skaping.com/les7laux/pleynet/oursiere", fournisseur: "Skaping" },
  ],
  "le-reposoir": [
    { label: "Village", url: "https://app.webcam-hd.com/le-reposoir/village", fournisseur: "Webcam-HD" },
  ],
  "le-semnoz": [
    { label: "Arrivée Télémix", url: "https://app.webcam-hd.com/semnoz/sommet_tmx", fournisseur: "Webcam-HD" },
    { label: "Parking versant Bauges", url: "https://app.webcam-hd.com/semnoz/sud_bauges", fournisseur: "Webcam-HD" },
    { label: "Versant Annecy", url: "https://app.webcam-hd.com/semnoz/versant-annecy", fournisseur: "Webcam-HD" },
  ],
  "le-tour": [
    { label: "Tête de Balme", url: "https://www.skaping.com/chamonix/tete-de-balme", fournisseur: "Skaping" },
    { label: "Charamillon", url: "https://www.skaping.com/chamonix/balme/charamillon", fournisseur: "Skaping" },
  ],
  "les-2-alpes": [
    { label: "Grande Aiguille", url: "https://www.skaping.com/les2alpes/grande-aiguille", fournisseur: "Skaping" },
    { label: "Vue à 3 200 m", url: "https://www.skaping.com/les2alpes/3200m", fournisseur: "Skaping" },
    { label: "Vue à 3 400 m", url: "https://www.skaping.com/les2alpes/3400m", fournisseur: "Skaping" },
  ],
  "les-arcs-bourg-st-maurice": [
    { label: "TSD Mont Blanc", url: "https://app.webcam-hd.com/lesarcs/mont-blanc", fournisseur: "Webcam-HD" },
    { label: "Aiguille Rouge", url: "https://app.webcam-hd.com/lesarcs/aiguille-rouge", fournisseur: "Webcam-HD" },
    { label: "Varet", url: "https://app.webcam-hd.com/lesarcs/varet", fournisseur: "Webcam-HD" },
  ],
  "les-brasses": [
    { label: "Chaîne d'or", url: "https://app.webcam-hd.com/les-brasses/restaurant", fournisseur: "Webcam-HD" },
  ],
  "les-carroz": [
    { label: "Pointe de Cupoire", url: "https://app.webcam-hd.com/lescarroz/pointe-de-cupoire", fournisseur: "Webcam-HD" },
    { label: "Oasis snowpark", url: "https://app.webcam-hd.com/lescarroz/oasis", fournisseur: "Webcam-HD" },
    { label: "Front de neige", url: "https://app.webcam-hd.com/lescarroz/front-de-neige", fournisseur: "Webcam-HD" },
  ],
  "les-contamines-montjoie": [
    { label: "Centre du village", url: "https://app.webcam-hd.com/lescontamines/Centre-Village", fournisseur: "Webcam-HD" },
  ],
  "les-gets": [
    { label: "Front de neige", url: "https://app.webcam-hd.com/lesgets/front-de-neige-panoramique", fournisseur: "Webcam-HD" },
    { label: "Sommet Chéry", url: "https://app.webcam-hd.com/lesgets/les_gets_sommet-chery", fournisseur: "Webcam-HD" },
    { label: "Départ Perrières", url: "https://app.webcam-hd.com/lesgets/depart-perrieres", fournisseur: "Webcam-HD" },
  ],
  "les-houches": [
    { label: "Les Houches", url: "https://www.skaping.com/chamonix/les-houches", fournisseur: "Skaping" },
    { label: "Tramway du Mont-Blanc", url: "https://www.skaping.com/les-houches/tramway-du-mont-blanc", fournisseur: "Skaping" },
    { label: "Prarion", url: "https://www.skaping.com/les-houches/prarion", fournisseur: "Skaping" },
  ],
  "les-karellis": [
    { label: "Station", url: "https://app.webcam-hd.com/les-karellis/front-de-neige", fournisseur: "Webcam-HD" },
    { label: "Vinouve, 2 130 m", url: "https://app.webcam-hd.com/les-karellis/vinouve", fournisseur: "Webcam-HD" },
    { label: "TSD des Chaudannes", url: "https://app.webcam-hd.com/les-karellis/tsd-des-chaudannes", fournisseur: "Webcam-HD" },
  ],
  "les-menuires": [
    { label: "Départ Croisette", url: "https://www.skaping.com/les-menuires/depart-croisette", fournisseur: "Skaping" },
    { label: "Départ Masse", url: "https://www.skaping.com/les-menuires/depart-masse", fournisseur: "Skaping" },
    { label: "Les Enverses", url: "https://www.skaping.com/les-menuires/les-enverses", fournisseur: "Skaping" },
  ],
  "les-saisies": [
    { label: "Le Manant", url: "https://www.skaping.com/les-saisies/le-manant", fournisseur: "Skaping" },
    { label: "Mont Bisanne", url: "https://app.webcam-hd.com/les-saisies/bisanne-panoramique-2000", fournisseur: "Webcam-HD" },
    { label: "Centre station", url: "https://app.webcam-hd.com/les-saisies/boetet", fournisseur: "Webcam-HD" },
  ],
  "manigod": [
    { label: "Merdassier Centre Station", url: "https://app.webcam-hd.com/manigod/merdassier-centre-station", fournisseur: "Webcam-HD" },
    { label: "Croix Fry", url: "https://www.skaping.com/manigod/croix-fry", fournisseur: "Skaping" },
    { label: "Merdassier", url: "https://www.skaping.com/manigod/merdassier", fournisseur: "Skaping" },
  ],
  "megeve": [
    { label: "Rochebrune", url: "https://www.skaping.com/megeve/rochebrune/panoramique", fournisseur: "Skaping" },
    { label: "Mont d'Arbois", url: "https://www.skaping.com/megeve/mont-d-arbois", fournisseur: "Skaping" },
    { label: "Croix de sur les Prés", url: "https://www.skaping.com/jaillet/sommet", fournisseur: "Skaping" },
  ],
  "meribel": [
    { label: "Roc de fer", url: "https://www.skaping.com/meribel/roc-de-fer", fournisseur: "Skaping" },
    { label: "Col de la Loze", url: "https://app.webcam-hd.com/meribel/courchevel-meribel_col-de-la-loze", fournisseur: "Webcam-HD" },
    { label: "Mottaret Centre", url: "https://app.webcam-hd.com/meribel/meribel-mottaret_front-de-neige", fournisseur: "Webcam-HD" },
  ],
  "montriond": [
    { label: "Ardent", url: "https://www.skaping.com/montriond/ardent", fournisseur: "Skaping" },
    { label: "Lac", url: "https://www.skaping.com/montriond/lac", fournisseur: "Skaping" },
    { label: "Lindarets", url: "https://www.skaping.com/montriond/village-des-lindarets", fournisseur: "Skaping" },
  ],
  "morzine": [
    { label: "Chamossière, 2 002 m", url: "https://www.skaping.com/morzine/chamossiere", fournisseur: "Skaping" },
    { label: "Plateau de Nyon, 1 421 m", url: "https://www.skaping.com/portes-du-soleil/morzine", fournisseur: "Skaping" },
    { label: "Pleney, 1 505 m", url: "https://www.skaping.com/morzine/pleney", fournisseur: "Skaping" },
  ],
  "orelle": [
    { label: "Plan Bouchet", url: "https://app.webcam-hd.com/orelle/sommet-orelle", fournisseur: "Webcam-HD" },
    { label: "Sommet des 3 Vallées", url: "https://app.webcam-hd.com/orelle/tyrolienne", fournisseur: "Webcam-HD" },
  ],
  "oz-en-oisans": [
    { label: "Station", url: "https://www.skaping.com/oz-en-oisans/station", fournisseur: "Skaping" },
  ],
  "passy": [
    { label: "Station", url: "https://www.skaping.com/passy-plaine-joux/station", fournisseur: "Skaping" },
    { label: "Barmus", url: "https://www.skaping.com/passy-plaine-joux/barmus", fournisseur: "Skaping" },
    { label: "Base de loisirs", url: "https://app.webcam-hd.com/passy/base-de-loisirs-de-passy", fournisseur: "Webcam-HD" },
  ],
  "pipay": [
    { label: "Grand Cerf", url: "https://www.skaping.com/les7laux/pipay/grand-cerf", fournisseur: "Skaping" },
  ],
  "plagne-centre": [
    { label: "Plagne Centre", url: "https://app.webcam-hd.com/webcam-station-la-plagne/colorado", fournisseur: "Webcam-HD" },
  ],
  "pralognan-la-vanoise": [
    { label: "Mont Bochor", url: "https://app.webcam-hd.com/pralognan/mont-bochor", fournisseur: "Webcam-HD" },
    { label: "Front de Neige", url: "https://app.webcam-hd.com/pralognan/village", fournisseur: "Webcam-HD" },
  ],
  "prapoutel": [
    { label: "Sommet des Bouquetins", url: "https://www.skaping.com/les7laux/prapoutel/sommetdesbouquetins", fournisseur: "Skaping" },
  ],
  "praz-sur-arly": [
    { label: "Mont Rond", url: "https://www.skaping.com/val-d-arly/mont-rond/panoramique", fournisseur: "Skaping" },
  ],
  "saint-francois-longchamp": [
    { label: "Le Frêne", url: "https://www.skaping.com/saint-francois-longchamp/le-frene", fournisseur: "Skaping" },
  ],
  "saint-martin-de-belleville": [
    { label: "Village", url: "https://www.skaping.com/saintmartindebelleville/village", fournisseur: "Skaping" },
  ],
  "saint-gervais-mont-blanc": [
    { label: "Mont Joux", url: "https://www.skaping.com/saint-gervais-mont-blanc/mont-joux", fournisseur: "Skaping" },
    { label: "Espace Mont Blanc", url: "https://www.skaping.com/saint-gervais/espace-mont-blanc", fournisseur: "Skaping" },
  ],
  "sainte-foy-tarentaise": [
    { label: "Sommet Aiguille", url: "https://app.webcam-hd.com/ste-foy-tarentaise/sommet-aiguille", fournisseur: "Webcam-HD" },
  ],
  "samoens": [
    { label: "Col de Joux Plane", url: "https://www.skaping.com/samoens/col-de-joux-plane", fournisseur: "Skaping" },
  ],
  "savoie-grand-revard": [
    { label: "Stade de biathlon", url: "https://www.skaping.com/la-feclaz/stade-de-biathlon", fournisseur: "Skaping" },
    { label: "Télésiège de l'Orionde", url: "https://www.skaping.com/la-feclaz/orionde", fournisseur: "Skaping" },
    { label: "Col des Ébats", url: "https://www.skaping.com/revard/tesson", fournisseur: "Skaping" },
  ],
  "thollon-les-memises": [
    { label: "Parchet", url: "https://app.webcam-hd.com/thollon-les-memises/sommet-parchet", fournisseur: "Webcam-HD" },
    { label: "Front", url: "https://app.webcam-hd.com/thollon-les-memises/front-de-neige", fournisseur: "Webcam-HD" },
  ],
  "tignes": [
    { label: "Grande Motte", url: "https://tignes.roundshot.com/grande-motte/", fournisseur: "Roundshot" },
  ],
  "val-cenis": [
    { label: "Sommet du Solert", url: "https://app.webcam-hd.com/valcenis/sommet-solert", fournisseur: "Webcam-HD" },
    { label: "Plateau du Mont-Cenis", url: "https://app.webcam-hd.com/valcenis/plateau-du-mont-cenis", fournisseur: "Webcam-HD" },
    { label: "Téléski de Pont Noir", url: "https://app.webcam-hd.com/valcenis/tk-pont-noir", fournisseur: "Webcam-HD" },
  ],
  "val-disere": [
    { label: "Borsat", url: "https://www.skaping.com/valdisere/borsat", fournisseur: "Skaping" },
    { label: "Pisaillais", url: "https://www.skaping.com/valdisere/pisaillas", fournisseur: "Skaping" },
    { label: "Solaise", url: "https://www.skaping.com/valdisere/solaise", fournisseur: "Skaping" },
  ],
  "val-thorens": [
    { label: "Cime Caron", url: "https://www.skaping.com/val-thorens/cime-caron", fournisseur: "Skaping" },
    { label: "Station", url: "https://www.skaping.com/valthorens/station", fournisseur: "Skaping" },
    { label: "3 Vallées", url: "https://www.skaping.com/valthorens/3vallees", fournisseur: "Skaping" },
  ],
  "valfrejus": [
    { label: "Arrondaz, 2 222 m", url: "https://www.skaping.com/valfrejus/arrondaz", fournisseur: "Skaping" },
    { label: "Front de neige", url: "https://www.skaping.com/valfrejus/tc-arrondaz", fournisseur: "Skaping" },
    { label: "Punta Bagna", url: "https://www.skaping.com/valfrejus/puntabagna", fournisseur: "Skaping" },
  ],
  "valloire": [
    { label: "Col du Galibier", url: "https://www.skaping.com/valloire/galibier", fournisseur: "Skaping" },
    { label: "Crey du quart", url: "https://www.skaping.com/valloire/crey-du-quart", fournisseur: "Skaping" },
    { label: "Poingt Ravier", url: "https://www.skaping.com/valloire/poingt_ravier", fournisseur: "Skaping" },
  ],
  "valmeinier": [
    { label: "Front de neige", url: "https://www.skaping.com/valmeinier/front-de-neige/photo", fournisseur: "Skaping" },
    { label: "La Sandonière", url: "https://www.skaping.com/Valmeinier/sandoniere", fournisseur: "Skaping" },
  ],
  "valmorel": [
    { label: "Col du Mottet", url: "https://www.skaping.com/valmorel/col-du-mottet", fournisseur: "Skaping" },
    { label: "Sommet Lanchettes", url: "https://app.webcam-hd.com/valmorel/lanchettes", fournisseur: "Webcam-HD" },
    { label: "Sommet Combelouvière", url: "https://app.webcam-hd.com/valmorel/sommet-combelouviere", fournisseur: "Webcam-HD" },
  ],
  "vaujany": [
    { label: "Dôme des Rousses, 2 800 m", url: "https://app.webcam-hd.com/vaujany/sommet-2800", fournisseur: "Webcam-HD" },
  ],
  "villard-de-lans": [
    { label: "Colline des Bains", url: "https://app.webcam-hd.com/villard-de-lans/colline-des-bains", fournisseur: "Webcam-HD" },
    { label: "Bois Barbu", url: "https://app.webcam-hd.com/villard-de-lans/Bois_barbu", fournisseur: "Webcam-HD" },
    { label: "Village", url: "https://app.webcam-hd.com/villard-de-lans/village", fournisseur: "Webcam-HD" },
  ],
  "ancelle": [
    { label: "Piste Zénith", url: "https://app.webcam-hd.com/ancelle/zenith", fournisseur: "Webcam-HD" },
    { label: "Station", url: "https://app.webcam-hd.com/ancelle/station", fournisseur: "Webcam-HD" },
    { label: "Nordique", url: "https://app.webcam-hd.com/ancelle/nordique", fournisseur: "Webcam-HD" },
  ],
  "auron": [
    { label: "Cime de Chavalet", url: "https://app.webcam-hd.com/auron/cime-chavalet", fournisseur: "Webcam-HD" },
    { label: "Village", url: "https://app.webcam-hd.com/auron/village", fournisseur: "Webcam-HD" },
    { label: "Chastellares", url: "https://app.webcam-hd.com/auron/las-donnas", fournisseur: "Webcam-HD" },
  ],
  "chabanon": [
    { label: "Sommet Les Monges", url: "https://app.webcam-hd.com/chabanon/sommet-des-monges", fournisseur: "Webcam-HD" },
    { label: "Chabanon, 1 610 m", url: "https://app.webcam-hd.com/chabanon/chabanon", fournisseur: "Webcam-HD" },
    { label: "Les Ganiayes", url: "https://app.webcam-hd.com/chabanon/les-ganiayes", fournisseur: "Webcam-HD" },
  ],
  "crevoux": [
    { label: "Front de neige", url: "https://app.webcam-hd.com/crevoux/front-de-neige", fournisseur: "Webcam-HD" },
    { label: "Station", url: "https://www.skaping.com/lac-serre-poncon/crevoux/station", fournisseur: "Skaping" },
  ],
  "greolieres-audibergue": [
    { label: "Front de neige", url: "https://www.skaping.com/greolieres/front-de-neige/photo", fournisseur: "Skaping" },
    { label: "Les Huskies", url: "https://www.skaping.com/greolieres/huskies", fournisseur: "Skaping" },
  ],
  "isola-2000": [
    { label: "Pélevos", url: "https://app.webcam-hd.com/isola/isola-2000_snowpark", fournisseur: "Webcam-HD" },
    { label: "Centre Station", url: "https://app.webcam-hd.com/isola/isola-2000_centre-station", fournisseur: "Webcam-HD" },
  ],
  "la-grave-la-meije": [
    { label: "La Grave, 3 200 m", url: "https://www.skaping.com/lagrave/3200m", fournisseur: "Skaping" },
    { label: "Village, 1 500 m", url: "https://www.skaping.com/lagrave/1500m", fournisseur: "Skaping" },
    { label: "La Grave, 2 400 m", url: "https://www.skaping.com/lagrave/2400m", fournisseur: "Skaping" },
  ],
  "les-orres": [
    { label: "Sommet Pousterle, 2 530 m", url: "https://www.skaping.com/les-orres/pousterle", fournisseur: "Skaping" },
  ],
  "montgenevre": [
    { label: "Col de Montgenèvre", url: "https://app.webcam-hd.com/montgenevre/eglise", fournisseur: "Webcam-HD" },
    { label: "Front de neige", url: "https://app.webcam-hd.com/montgenevre/front-de-neige", fournisseur: "Webcam-HD" },
    { label: "Luge Monty Express", url: "https://app.webcam-hd.com/montgenevre/mur-d-escalade", fournisseur: "Webcam-HD" },
  ],
  "orcieres": [
    { label: "Orcières La Favue", url: "https://www.skaping.com/orcieres/la-favue/panorama", fournisseur: "Skaping" },
    { label: "Plateau de Rocherousse", url: "https://www.skaping.com/orcieres/plateau-de-rocherousse", fournisseur: "Skaping" },
    { label: "Base de loisirs", url: "https://app.webcam-hd.com/orcieres/base-de-loisirs", fournisseur: "Webcam-HD" },
  ],
  "pra-loup-1500": [
    { label: "Station", url: "https://www.skaping.com/pra-loup/station", fournisseur: "Skaping" },
    { label: "Sommet de Péguiéou", url: "https://www.skaping.com/pra-loup/peguieou", fournisseur: "Skaping" },
    { label: "Costebelle", url: "https://app.webcam-hd.com/pra-loup/costebelle", fournisseur: "Webcam-HD" },
  ],
  "puy-saint-vincent": [
    { label: "Pelvoux-Vallouise", url: "https://www.vision-environnement.com/live/player/pelvoux30.php", fournisseur: "Vision Environnement" },
  ],
  "risoul": [
    { label: "Sommet Razis", url: "https://app.webcam-hd.com/risoul/sommet-razis", fournisseur: "Webcam-HD" },
    { label: "Front de neige", url: "https://app.webcam-hd.com/risoul/risoul_front", fournisseur: "Webcam-HD" },
    { label: "Pré du Bois", url: "https://app.webcam-hd.com/risoul/pre-du-bois", fournisseur: "Webcam-HD" },
  ],
  "reallon": [
    { label: "Front de Neige", url: "https://app.webcam-hd.com/reallon/reallon-front-de-neige", fournisseur: "Webcam-HD" },
    { label: "Chabrières", url: "https://app.webcam-hd.com/reallon/reallon_chabrieres", fournisseur: "Webcam-HD" },
  ],
  "chaillol": [
    { label: "Sommet Clot Chenu", url: "https://app.webcam-hd.com/chaillol/sommet-clot-chenu", fournisseur: "Webcam-HD" },
    { label: "Piste Clot Chenu", url: "https://app.webcam-hd.com/chaillol/piste-clot-chenu", fournisseur: "Webcam-HD" },
  ],
  "serre-chevalier-briancon": [
    { label: "Briançon", url: "https://www.skaping.com/serre-chevalier/briancon", fournisseur: "Skaping" },
  ],
  "serre-chevalier-le-monetier": [
    { label: "Monetier", url: "https://www.skaping.com/serrechevalier/monetier", fournisseur: "Skaping" },
    { label: "Refuge du clôt des vaches", url: "https://www.skaping.com/monetier-les-bains/refuge-clot-vaches", fournisseur: "Skaping" },
  ],
  "serre-chevalier": [
    { label: "Col du Lautaret", url: "https://www.skaping.com/serrechevalier/coldulautaret", fournisseur: "Skaping" },
    { label: "Place du téléphérique", url: "https://www.skaping.com/serre-chevalier/saint-chaffrey", fournisseur: "Skaping" },
    { label: "Prorel", url: "https://www.skaping.com/serre-chevalier/prorel", fournisseur: "Skaping" },
  ],
  "superdevoluy-la-joue-du-loup": [
    { label: "Coeur du Domaine", url: "https://app.webcam-hd.com/superdevoluy/snowpark", fournisseur: "Webcam-HD" },
    { label: "Arrivée télésiège Génépy", url: "https://app.webcam-hd.com/superdevoluy/sommet-domaine-skiable", fournisseur: "Webcam-HD" },
    { label: "Télémix des fontettes", url: "https://app.webcam-hd.com/superdevoluy/fontettes", fournisseur: "Webcam-HD" },
  ],
  "val-dallos-la-foux-le-seignus": [
    { label: "Départ du télésiège Clos Bertrand, 1 530 m", url: "https://app.webcam-hd.com/valdallos/seignus-bas", fournisseur: "Webcam-HD" },
    { label: "Sommet du télésiège Clos Bertrand, 1 915 m", url: "https://app.webcam-hd.com/valdallos/seignus-haut", fournisseur: "Webcam-HD" },
    { label: "Centre Station", url: "https://app.webcam-hd.com/valdallos/centre-station", fournisseur: "Webcam-HD" },
  ],
  "valberg": [
    { label: "Sommet Tête des Eguilles", url: "https://app.webcam-hd.com/valberg/sommet-tete-des-eguilles", fournisseur: "Webcam-HD" },
    { label: "Leysin", url: "https://app.webcam-hd.com/valberg/leysin", fournisseur: "Webcam-HD" },
    { label: "Ancolies", url: "https://app.webcam-hd.com/valberg/ancolie", fournisseur: "Webcam-HD" },
  ],
  "vars": [
    { label: "Col de Crevoux", url: "https://www.skaping.com/vars/col-de-crevoux", fournisseur: "Skaping" },
    { label: "Pic de Chabrières", url: "https://app.webcam-hd.com/vars/chabrieres", fournisseur: "Webcam-HD" },
    { label: "Front de Neige", url: "https://www.skaping.com/vars/les-claux", fournisseur: "Skaping" },
  ],
  "vars-sainte-marie": [
    { label: "Sainte Marie", url: "https://app.webcam-hd.com/vars/sainte-marie", fournisseur: "Webcam-HD" },
  ],
  "hauteville-lompnes": [
    { label: "Terre Ronde", url: "https://app.webcam-hd.com/hauteville-lompnes/terre-ronde", fournisseur: "Webcam-HD" },
    { label: "Cormaranche Bikepark", url: "https://app.webcam-hd.com/hauteville-lompnes/cormaranche-bike-park", fournisseur: "Webcam-HD" },
    { label: "La Praille", url: "https://app.webcam-hd.com/hauteville-lompnes/la-praille", fournisseur: "Webcam-HD" },
  ],
  "la-combe-saint-pierre": [
    { label: "La Combe Saint Pierre", url: "https://app.webcam-hd.com/combe-saint-pierre/front-de-neige", fournisseur: "Webcam-HD" },
  ],
  "le-larmont": [
    { label: "Chapelle", url: "https://app.webcam-hd.com/pontarlier/chapelle-esperance", fournisseur: "Webcam-HD" },
  ],
  "les-rousses": [
    { label: "Mont Blanc", url: "https://www.skaping.com/jura-sur-leman/la-dole/vue-mont-blanc", fournisseur: "Skaping" },
    { label: "Sommet des Tuffes", url: "https://app.webcam-hd.com/les-rousses/les-tuffes", fournisseur: "Webcam-HD" },
    { label: "Le Balancier, pied des pistes", url: "https://app.webcam-hd.com/les-rousses/porte-balancier", fournisseur: "Webcam-HD" },
  ],
  "les-plans-dhotonnes-plateau-de-retord": [
    { label: "Plans d'Hotonnes", url: "https://app.webcam-hd.com/plateau-de-retord/plans-hotonnes", fournisseur: "Webcam-HD" },
    { label: "Cuvéry", url: "https://app.webcam-hd.com/plateau-de-retord/cuvery", fournisseur: "Webcam-HD" },
    { label: "Biathlon", url: "https://app.webcam-hd.com/plateau-de-retord/biathlon", fournisseur: "Webcam-HD" },
  ],
  "val-de-morteau": [
    { label: "Gardot", url: "https://app.webcam-hd.com/val-de-morteau/gardot", fournisseur: "Webcam-HD" },
    { label: "Meix-Musy", url: "https://app.webcam-hd.com/val-de-morteau/val-de-morteau_meix-musy", fournisseur: "Webcam-HD" },
  ],
  "besse-super-besse": [
    { label: "Front de neige", url: "https://app.webcam-hd.com/superbesse/front-de-neige", fournisseur: "Webcam-HD" },
  ],
  "chastreix-sancy": [
    { label: "Chastreix", url: "https://app.webcam-hd.com/chastreix-sancy/chastreix", fournisseur: "Webcam-HD" },
  ],
  "laguiole": [
    { label: "Le Bouyssou", url: "https://app.webcam-hd.com/laguiole/front-de-neige-le-bouyssou", fournisseur: "Webcam-HD" },
  ],
  "le-lioran": [
    { label: "Sommet Combe, 1 760 m", url: "https://app.webcam-hd.com/lioran/lioran_combe", fournisseur: "Webcam-HD" },
    { label: "Font d'Alagnon, 1 195 m", url: "https://app.webcam-hd.com/lioran/lioran_font-d-alagnon", fournisseur: "Webcam-HD" },
    { label: "Centre Station, 1 250 m", url: "https://app.webcam-hd.com/lioran/lioran_station", fournisseur: "Webcam-HD" },
  ],
  "les-estables": [
    { label: "Ski Alpin", url: "https://www.skaping.com/les-estables/ski-alpin/panoramique", fournisseur: "Skaping" },
    { label: "Domaine nordique", url: "https://www.skaping.com/les-estables/ski-nordique", fournisseur: "Skaping" },
  ],
  "praboure": [
    { label: "Front de Neige", url: "https://app.webcam-hd.com/praboure/front-de-neige", fournisseur: "Webcam-HD" },
  ],
  "font-romeu-pyrenees-2000": [
    { label: "Col del Pam", url: "https://app.webcam-hd.com/font-romeu/col-del-pam", fournisseur: "Webcam-HD" },
    { label: "Les Airelles", url: "https://app.webcam-hd.com/font-romeu/pied-de-piste", fournisseur: "Webcam-HD" },
    { label: "Front de neige", url: "https://app.webcam-hd.com/font-romeu/pyrenees-2000-front-de-neige", fournisseur: "Webcam-HD" },
  ],
  "la-mongie-bareges": [
    { label: "La Mongie, 2 100 m", url: "https://www.skaping.com/grandtourmalet/liaison", fournisseur: "Skaping" },
    { label: "Barèges Tournaboup, 1 450 m", url: "https://www.skaping.com/grandtourmalet/baregestournaboup", fournisseur: "Skaping" },
    { label: "Barèges Tourmalet, 1 750 m", url: "https://www.skaping.com/grandtourmalet/baregestourmalet", fournisseur: "Skaping" },
  ],
  "eyne-cambre-daze": [
    { label: "Pla", url: "https://www.skaping.com/cambredaze/pla", fournisseur: "Skaping" },
  ],
  "luz-ardiden": [
    { label: "Sommet de l'Aulian", url: "https://www.skaping.com/luz-ardiden/sommet-aulian", fournisseur: "Skaping" },
    { label: "Aulian", url: "https://www.skaping.com/luz-ardiden/aulian", fournisseur: "Skaping" },
    { label: "Caperette", url: "https://www.skaping.com/luz-ardiden/caperette", fournisseur: "Skaping" },
  ],
  "peyragudes": [
    { label: "Peyresourde", url: "https://www.skaping.com/peyragudes/peyresourde", fournisseur: "Skaping" },
    { label: "Les Agudes", url: "https://www.skaping.com/peyragudes/les-agudes", fournisseur: "Skaping" },
    { label: "Belvédère", url: "https://www.skaping.com/peyragudes/belvedere", fournisseur: "Skaping" },
  ],
  "saint-lary-soulan": [
    { label: "Pic d'Aret", url: "https://www.skaping.com/saint-lary/pic-d-aret", fournisseur: "Skaping" },
    { label: "Bouleaux", url: "https://www.skaping.com/saint-lary/bouleaux/panoramique", fournisseur: "Skaping" },
    { label: "Les Merlans", url: "https://www.skaping.com/saint-lary/les-merlans/live", fournisseur: "Skaping" },
  ],
  "saint-lary-pla-d-adet": [
    { label: "Pla d'Adet", url: "https://www.skaping.com/saint-lary/pla-d-adet", fournisseur: "Skaping" },
  ],
  "val-louron": [
    { label: "Loudenvielle", url: "https://www.skaping.com/loudenvielle/tour-de-genos", fournisseur: "Skaping" },
  ],
  "val-dazun": [
    { label: "Col de Couraduque", url: "https://www.skaping.com/val-d-azun/col-de-couraduque", fournisseur: "Skaping" },
    { label: "Col du Soulor", url: "https://www.skaping.com/arbeost/col-du-soulor", fournisseur: "Skaping" },
  ],
  "le-champ-du-feu": [
    { label: "Vue piste", url: "https://www.skaping.com/le-champ-du-feu/pistes", fournisseur: "Skaping" },
    { label: "Vue chalet", url: "https://www.skaping.com/le-champ-du-feu/chalet", fournisseur: "Skaping" },
  ],
  "gerardmer": [
    { label: "Front de neige", url: "https://app.webcam-hd.com/gerardmer/front-de-neige", fournisseur: "Webcam-HD" },
    { label: "Xettes", url: "https://app.webcam-hd.com/gerardmer/xettes", fournisseur: "Webcam-HD" },
    { label: "Tetras", url: "https://app.webcam-hd.com/gerardmer/tetras", fournisseur: "Webcam-HD" },
  ],
  "la-bresse-brabant": [
    { label: "Sommet Petit Artimont", url: "https://www.skaping.com/la-bresse/sommet-petit-artimont", fournisseur: "Skaping" },
    { label: "Front de neige", url: "https://www.skaping.com/labresse/front-de-neige", fournisseur: "Skaping" },
    { label: "Haut de Vologne", url: "https://www.skaping.com/la-bresse/haut-de-vologne", fournisseur: "Skaping" },
  ],
  "la-bresse-hohneck": [
    { label: "Hohneck, Chitelet", url: "https://www.skaping.com/la-bresse/hohneck", fournisseur: "Skaping" },
  ],
  "la-schlucht": [
    { label: "Front de neige", url: "https://www.skaping.com/la-schlucht/front-de-neige", fournisseur: "Skaping" },
  ],
  "le-ballon-dalsace": [
    { label: "Sommet téléski", url: "https://www.skaping.com/ballon-d-alsace/sommet-teleski", fournisseur: "Skaping" },
    { label: "Front de neige", url: "https://www.skaping.com/ballon-d-alsace/front-de-neige", fournisseur: "Skaping" },
  ],
  "le-lac-blanc": [
    { label: "Au pied du télésiège Montjoie", url: "https://app.webcam-hd.com/lac-blanc/900", fournisseur: "Webcam-HD" },
    { label: "Batiment d'accueil", url: "https://app.webcam-hd.com/lac-blanc/lac-blanc-1200", fournisseur: "Webcam-HD" },
  ],
  "le-markstein": [
    { label: "Steinlebach", url: "https://app.webcam-hd.com/markstein/maison-accueil", fournisseur: "Webcam-HD" },
    { label: "La Fédérale", url: "https://app.webcam-hd.com/markstein/la-federale", fournisseur: "Webcam-HD" },
    { label: "La Grenouillère", url: "https://app.webcam-hd.com/markstein/grenouillere", fournisseur: "Webcam-HD" },
  ],
  "la-bresse-lispach": [
    { label: "Lispach", url: "https://www.skaping.com/la-bresse/lispach", fournisseur: "Skaping" },
  ],
  "le-schnepfenried": [
    { label: "Schnepfenriedkopf", url: "https://www.skaping.com/le-schnepfenried/panoramique", fournisseur: "Skaping" },
  ],
  "col-de-porte": [
    { label: "Biathlon", url: "https://www.skaping.com/col-de-porte/biathlon", fournisseur: "Skaping" },
    { label: "Chartreuse", url: "https://www.skaping.com/col-de-porte/ski-alpin", fournisseur: "Skaping" },
  ],
  "correncon-en-vercors": [
    { label: "Stade de Biathlon", url: "https://app.webcam-hd.com/correncon-en-vercors/stand-de-tir", fournisseur: "Webcam-HD" },
    { label: "Hameau des Rambins", url: "https://app.webcam-hd.com/correncon-en-vercors/rambins", fournisseur: "Webcam-HD" },
    { label: "Site nordique, Porte des Hauts Plateaux", url: "https://app.webcam-hd.com/correncon-en-vercors/plateau", fournisseur: "Webcam-HD" },
  ],
  "doucy": [
    { label: "Doucy", url: "https://app.webcam-hd.com/valmorel/doucy-combelouviere", fournisseur: "Webcam-HD" },
  ],
  "saint-jean-de-sixt": [
    { label: "Forgeassoud Dessus", url: "https://app.webcam-hd.com/saint-jean-de-sixt/stade-de-neige", fournisseur: "Webcam-HD" },
    { label: "Village", url: "https://app.webcam-hd.com/saint-jean-de-sixt/village", fournisseur: "Webcam-HD" },
  ],
  "le-grand-puy": [
    { label: "Les Planes", url: "https://app.webcam-hd.com/grand-puy/planes", fournisseur: "Webcam-HD" },
    { label: "Espace débutant", url: "https://app.webcam-hd.com/grand-puy/espace-debutant", fournisseur: "Webcam-HD" },
    { label: "Front de neige", url: "https://app.webcam-hd.com/grand-puy/front-de-neige", fournisseur: "Webcam-HD" },
  ],
  "source-du-doubs-mouthe": [
    { label: "Source du Doubs", url: "https://app.webcam-hd.com/mouthe/source-du-doubs", fournisseur: "Webcam-HD" },
  ],
  "chalmazel": [
    { label: "Front de neige", url: "https://app.webcam-hd.com/chalmazel/front-de-neige", fournisseur: "Webcam-HD" },
    { label: "Espace apprentissage", url: "https://app.webcam-hd.com/chalmazel/espace-apprentissage", fournisseur: "Webcam-HD" },
    { label: "Jasseries", url: "https://app.webcam-hd.com/chalmazel/jasseries", fournisseur: "Webcam-HD" },
  ],
  "campan-payolle": [
    { label: "Pic du Midi", url: "https://www.skaping.com/campan/payolle/pic-du-midi", fournisseur: "Skaping" },
    { label: "Payolle", url: "https://www.skaping.com/campan/payolle/carriere", fournisseur: "Skaping" },
    { label: "Lac de Payolle", url: "https://www.skaping.com/campan/lac-de-payolle", fournisseur: "Skaping" },
  ],
  "cauterets": [
    { label: "Terrasse du Lys, 1 850 m", url: "https://www.skaping.com/cauterets/cirque-du-lys/panorama", fournisseur: "Skaping" },
    { label: "Les Crêtes", url: "https://www.skaping.com/cauterets/les-cretes/panoramique", fournisseur: "Skaping" },
    { label: "Village", url: "https://www.skaping.com/cauterets/village/casino", fournisseur: "Skaping" },
  ],
};
