/**
 * Caméras vérifiées, par identifiant de station.
 *
 * Relevé du 2026-09-30 : chaque adresse a été affichée dans le cadre de
 * l'application (`iframe`, `sandbox="allow-scripts allow-same-origin"`,
 * `referrerpolicy="no-referrer"`) depuis une page locale, sa capture regardée,
 * et la date de sa dernière image relevée. Toutes les caméras vérifiées d'une
 * station, dans cet ordre :
 * la vue la plus large du domaine d'abord, puis le sommet ou le front de neige,
 * puis le village ; une caméra coupée pour l'intersaison passe derrière celles
 * qui tournent, son lecteur affiche la date de sa dernière image.
 *
 * Sources : le plan du site de Skaping (`sitemap.players.xml`), les groupes de
 * Webcam-HD (`smr/json/webcam_display_group/<groupe>.json`, le fichier que
 * son lecteur lit), et les caméras de l'ancienne table. 147 stations,
 * 505 caméras.
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
    { label: "Aillons Margériaz Front de neige", url: "https://www.skaping.com/les-aillons/margeriaz", fournisseur: "Skaping" },
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
    { label: "Vue à 2 100 m", url: "https://www.skaping.com/alpedhuez/2100m", fournisseur: "Skaping" },
    { label: "Station", url: "https://www.skaping.com/alpedhuez/auris-station", fournisseur: "Skaping" },
    { label: "Herpie", url: "https://www.skaping.com/alpedhuez/herpie", fournisseur: "Skaping" },
    { label: "Montfrais", url: "https://www.skaping.com/alpedhuez/vaujany/montfrais", fournisseur: "Skaping" },
    { label: "Alpette", url: "https://www.skaping.com/alpedhuez/vaujany/alpette", fournisseur: "Skaping" },
    { label: "Auris", url: "https://www.skaping.com/alpedhuez/auris", fournisseur: "Skaping" },
  ],
  "alpe-du-grand-serre": [
    { label: "Sommet Serriou", url: "https://app.webcam-hd.com/alpe-du-grand-serre/serriou", fournisseur: "Webcam-HD" },
    { label: "Les Cochettes", url: "https://app.webcam-hd.com/alpe-du-grand-serre/les-cochettes", fournisseur: "Webcam-HD" },
    { label: "Les bergeries", url: "https://app.webcam-hd.com/alpe-du-grand-serre/la-flambee", fournisseur: "Webcam-HD" },
    { label: "La Blache", url: "https://app.webcam-hd.com/alpe-du-grand-serre/la-blache", fournisseur: "Webcam-HD" },
  ],
  "areches-beaufort": [
    { label: "Sommet Combettes", url: "https://app.webcam-hd.com/areches-beaufort/sommet-combettes", fournisseur: "Webcam-HD" },
    { label: "Cuvy", url: "https://app.webcam-hd.com/areches-beaufort/cuvy", fournisseur: "Webcam-HD" },
    { label: "Planay", url: "https://app.webcam-hd.com/areches-beaufort/planay", fournisseur: "Webcam-HD" },
    { label: "Bonnets Rouges", url: "https://app.webcam-hd.com/areches-beaufort/bonnets-rouges", fournisseur: "Webcam-HD" },
  ],
  "argentiere": [
    { label: "Plateau de Lognan", url: "https://www.skaping.com/chamonix/plateau-de-lognan", fournisseur: "Skaping" },
  ],
  "aussois": [
    { label: "Sommet de l'Armoise", url: "https://www.skaping.com/aussois/sommet-armoise", fournisseur: "Skaping" },
    { label: "Sommet Grand Jeu", url: "https://www.skaping.com/aussois/sommet-grand-jeu", fournisseur: "Skaping" },
    { label: "Le Village", url: "https://www.skaping.com/aussois/le-village", fournisseur: "Skaping" },
    { label: "Village", url: "https://app.webcam-hd.com/aussois/village-aussois", fournisseur: "Webcam-HD" },
    { label: "Grand Jeu", url: "https://app.webcam-hd.com/aussois/grand-jeu", fournisseur: "Webcam-HD" },
    { label: "Domaine nordique du Monolithe", url: "https://www.skaping.com/aussois/domaine-nordique-du-monolithe", fournisseur: "Skaping" },
    { label: "Domaine Nordique Monolithe", url: "https://app.webcam-hd.com/aussois/domaine-nordique-monolithe", fournisseur: "Webcam-HD" },
  ],
  "autrans": [
    { label: "Sommet du domaine alpin", url: "https://app.webcam-hd.com/autrans-meaudre/tsf-la-quoi", fournisseur: "Webcam-HD" },
    { label: "Front de neige", url: "https://app.webcam-hd.com/autrans-meaudre/chatelard", fournisseur: "Webcam-HD" },
    { label: "Tremplins du Claret", url: "https://app.webcam-hd.com/autrans-meaudre/autrans_tremplin", fournisseur: "Webcam-HD" },
    { label: "La Sure", url: "https://app.webcam-hd.com/autrans-meaudre/la-poya", fournisseur: "Webcam-HD" },
    { label: "Piscine de Méaudre", url: "https://app.webcam-hd.com/autrans-meaudre/centre-nordique-meaudre", fournisseur: "Webcam-HD" },
    { label: "Domaine nordique Géve", url: "https://app.webcam-hd.com/autrans-meaudre/geve", fournisseur: "Webcam-HD" },
    { label: "Départ tyrolienne géante Méaudre", url: "https://app.webcam-hd.com/autrans-meaudre/depart-zipline-tyro-alt.1300m", fournisseur: "Webcam-HD" },
    { label: "Centre nordique Autrans", url: "https://app.webcam-hd.com/autrans-meaudre/autran-village", fournisseur: "Webcam-HD" },
  ],
  "avoriaz": [
    { label: "Vue Station", url: "https://www.skaping.com/avoriaz/pistes", fournisseur: "Skaping" },
    { label: "Station", url: "https://www.skaping.com/avoriaz/station", fournisseur: "Skaping" },
    { label: "Zore", url: "https://app.webcam-hd.com/avoriaz/zore", fournisseur: "Webcam-HD" },
    { label: "Fornet", url: "https://www.skaping.com/avoriaz/fornet", fournisseur: "Skaping" },
    { label: "Tour", url: "https://app.webcam-hd.com/avoriaz/tour", fournisseur: "Webcam-HD" },
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
    { label: "Brévent", url: "https://www.skaping.com/chamonix/brevent", fournisseur: "Skaping" },
    { label: "Plan Praz", url: "https://www.skaping.com/chamonix/plan-praz", fournisseur: "Skaping" },
    { label: "Montenvers", url: "https://www.skaping.com/chamonix/montenvers", fournisseur: "Skaping" },
    { label: "De la Flégère", url: "https://www.skaping.com/chamonix-flegere-G1", fournisseur: "Skaping" },
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
    { label: "Front de neige", url: "https://www.skaping.com/chamrousse/recoin/archives", fournisseur: "Skaping" },
    { label: "Roche Béranger", url: "https://www.skaping.com/chamrousse/roche-beranger", fournisseur: "Skaping" },
  ],
  "la-chapelle-dabondance": [
    { label: "Braitaz", url: "https://app.webcam-hd.com/la-chapelle/braitaz", fournisseur: "Webcam-HD" },
  ],
  "chatel": [
    { label: "Panoramique Morclan", url: "https://app.webcam-hd.com/chatel/morclan", fournisseur: "Webcam-HD" },
    { label: "TS L'Echo Alpin", url: "https://app.webcam-hd.com/chatel/ts-echo-alpin", fournisseur: "Webcam-HD" },
    { label: "Pierre longue", url: "https://www.skaping.com/chatel/pierre-longue", fournisseur: "Skaping" },
    { label: "Portes du soleil", url: "https://www.skaping.com/portes-du-soleil/chatel/torgon/plan-de-croix", fournisseur: "Skaping" },
    { label: "Super Chatel", url: "https://app.webcam-hd.com/chatel/super-chatel", fournisseur: "Webcam-HD" },
    { label: "Rochassons", url: "https://app.webcam-hd.com/chatel/rochassons", fournisseur: "Webcam-HD" },
    { label: "Village", url: "https://app.webcam-hd.com/chatel/village", fournisseur: "Webcam-HD" },
    { label: "Chatel Lac de Vonnes", url: "https://www.skaping.com/chatel/lac-de-vonnes", fournisseur: "Skaping" },
    { label: "Place Eglise Châtel", url: "https://app.webcam-hd.com/chatel/chantier-conche", fournisseur: "Webcam-HD" },
    { label: "Lac de la Mouille", url: "https://app.webcam-hd.com/chatel/lac-de-la-mouille", fournisseur: "Webcam-HD" },
    { label: "Lac de la Mouille 2", url: "https://app.webcam-hd.com/chatel/lac-de-la-mouille-2", fournisseur: "Webcam-HD" },
    { label: "Tronchey", url: "https://app.webcam-hd.com/chatel/torgon", fournisseur: "Webcam-HD" },
  ],
  "combloux": [
    { label: "Pertuis", url: "https://www.skaping.com/combloux/sommet", fournisseur: "Skaping" },
  ],
  "courchevel": [
    { label: "Le Signal", url: "https://www.skaping.com/courchevel/le-signal", fournisseur: "Skaping" },
    { label: "Chenus", url: "https://www.skaping.com/courchevel/chenus", fournisseur: "Skaping" },
    { label: "La Croisette", url: "https://www.skaping.com/courchevel/la-croisette", fournisseur: "Skaping" },
    { label: "Saulire", url: "https://www.skaping.com/courchevel/saulire", fournisseur: "Skaping" },
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
    { label: "Grand Site", url: "https://app.webcam-hd.com/hirmentaz/grand-site", fournisseur: "Webcam-HD" },
  ],
  "la-clusaz": [
    { label: "Snowpark", url: "https://app.webcam-hd.com/la-clusaz/snow-park", fournisseur: "Webcam-HD" },
    { label: "Beauregard", url: "https://app.webcam-hd.com/la-clusaz/beauregard", fournisseur: "Webcam-HD" },
    { label: "Le Bossonnet", url: "https://app.webcam-hd.com/la-clusaz/bossonnet", fournisseur: "Webcam-HD" },
    { label: "Crêt du Loup", url: "https://app.webcam-hd.com/la-clusaz/cret-du-loup", fournisseur: "Webcam-HD" },
    { label: "Etale", url: "https://app.webcam-hd.com/la-clusaz/etale", fournisseur: "Webcam-HD" },
    { label: "Massif de l'Etale", url: "https://app.webcam-hd.com/la-clusaz/massif-etale", fournisseur: "Webcam-HD" },
    { label: "Place du village", url: "https://app.webcam-hd.com/la-clusaz/place-du-village", fournisseur: "Webcam-HD" },
    { label: "Espace Nordique", url: "https://www.skaping.com/la-clusaz/espace-nordique", fournisseur: "Skaping" },
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
    { label: "Montchavin", url: "https://app.webcam-hd.com/webcam-station-la-plagne/montchavin", fournisseur: "Webcam-HD" },
    { label: "Roche de Mio", url: "https://app.webcam-hd.com/webcam-station-la-plagne/roche-de-mio", fournisseur: "Webcam-HD" },
    { label: "Télébuffette", url: "https://app.webcam-hd.com/webcam-station-la-plagne/montchavin-telebuffette", fournisseur: "Webcam-HD" },
    { label: "Sommet Bijolin", url: "https://app.webcam-hd.com/webcam-station-la-plagne/montchavin-bijolin", fournisseur: "Webcam-HD" },
    { label: "Becoin", url: "https://app.webcam-hd.com/webcam-station-la-plagne/becoin", fournisseur: "Webcam-HD" },
    { label: "Fornelet", url: "https://app.webcam-hd.com/webcam-station-la-plagne/webcam-montalbert-fornelet", fournisseur: "Webcam-HD" },
    { label: "La Rossa", url: "https://app.webcam-hd.com/webcam-station-la-plagne/champagny-la-rossa", fournisseur: "Webcam-HD" },
  ],
  "la-plagne-montalbert": [
    { label: "Montalbert", url: "https://app.webcam-hd.com/webcam-station-la-plagne/montalbert", fournisseur: "Webcam-HD" },
  ],
  "la-rosiere-1850": [
    { label: "Mont Valaisan, 2 800 m", url: "https://app.webcam-hd.com/la-rosiere/mont-valaisan", fournisseur: "Webcam-HD" },
    { label: "Le Fort, 2 400 m", url: "https://app.webcam-hd.com/la-rosiere/traversette", fournisseur: "Webcam-HD" },
    { label: "Plan du Repos, 2 330 m", url: "https://app.webcam-hd.com/la-rosiere/plan-du-repos", fournisseur: "Webcam-HD" },
    { label: "Front de neige, 1 850 m", url: "https://app.webcam-hd.com/la-rosiere/maison-du-ski", fournisseur: "Webcam-HD" },
    { label: "Golf", url: "https://app.webcam-hd.com/la-rosiere/golf", fournisseur: "Webcam-HD" },
    { label: "Plan de l'arc", url: "https://app.webcam-hd.com/la-rosiere/plan-de-l-arc", fournisseur: "Webcam-HD" },
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
    { label: "L'Ouillon", url: "https://www.skaping.com/les-sybelles/ouillon", fournisseur: "Skaping" },
  ],
  "le-fornet": [
    { label: "Fornet", url: "https://www.skaping.com/valdisere/fornet", fournisseur: "Skaping" },
  ],
  "le-grand-bornand": [
    { label: "La Taverne, 1 550 m", url: "https://www.skaping.com/le-grand-bornand/taverne", fournisseur: "Skaping" },
    { label: "Le Maroly, 1 750 m", url: "https://www.skaping.com/le-grand-bornand/terresrouges", fournisseur: "Skaping" },
    { label: "Village, 1 000 m", url: "https://www.skaping.com/le-grand-bornand/village", fournisseur: "Skaping" },
    { label: "Chinaillon, 1 300 m", url: "https://www.skaping.com/le-grand-bornand/chinaillon", fournisseur: "Skaping" },
    { label: "Mont Lachat, 2 100 m", url: "https://www.skaping.com/le-grand-bornand/mont-lachat", fournisseur: "Skaping" },
    { label: "Auberge Nordique, 1 200 m", url: "https://www.skaping.com/le-grand-bornand/auberge-nordique", fournisseur: "Skaping" },
    { label: "1650", url: "https://app.webcam-hd.com/grand-bornand/maroly", fournisseur: "Webcam-HD" },
  ],
  "le-pleynet": [
    { label: "Oursière", url: "https://www.skaping.com/les7laux/pleynet/oursiere", fournisseur: "Skaping" },
    { label: "Les Loups", url: "https://www.skaping.com/les7laux/pleynet/les-loups", fournisseur: "Skaping" },
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
    { label: "Super Diable", url: "https://www.skaping.com/les2alpes/super-diable", fournisseur: "Skaping" },
    { label: "Vallée Blanche", url: "https://www.skaping.com/les2alpes/vallee-blanche", fournisseur: "Skaping" },
    { label: "Bellecombe", url: "https://www.skaping.com/les2alpes/bellecombe", fournisseur: "Skaping" },
    { label: "La Fée", url: "https://www.skaping.com/les2alpes/la-fee", fournisseur: "Skaping" },
  ],
  "les-arcs-bourg-st-maurice": [
    { label: "TSD Mont Blanc", url: "https://app.webcam-hd.com/lesarcs/mont-blanc", fournisseur: "Webcam-HD" },
    { label: "Aiguille Rouge", url: "https://app.webcam-hd.com/lesarcs/aiguille-rouge", fournisseur: "Webcam-HD" },
    { label: "Varet", url: "https://app.webcam-hd.com/lesarcs/varet", fournisseur: "Webcam-HD" },
    { label: "Arpette", url: "https://app.webcam-hd.com/lesarcs/arpette", fournisseur: "Webcam-HD" },
    { label: "Arcabulle", url: "https://app.webcam-hd.com/lesarcs/arcabulle", fournisseur: "Webcam-HD" },
    { label: "Vanoise Express", url: "https://app.webcam-hd.com/lesarcs/vanoise-express", fournisseur: "Webcam-HD" },
    { label: "Snowpark", url: "https://app.webcam-hd.com/lesarcs/snowpark", fournisseur: "Webcam-HD" },
    { label: "Grizzly", url: "https://app.webcam-hd.com/lesarcs/grizzly", fournisseur: "Webcam-HD" },
  ],
  "les-brasses": [
    { label: "Chaîne d'or", url: "https://app.webcam-hd.com/les-brasses/restaurant", fournisseur: "Webcam-HD" },
  ],
  "les-carroz": [
    { label: "Pointe de Cupoire", url: "https://app.webcam-hd.com/lescarroz/pointe-de-cupoire", fournisseur: "Webcam-HD" },
    { label: "Oasis snowpark", url: "https://app.webcam-hd.com/lescarroz/oasis", fournisseur: "Webcam-HD" },
    { label: "Front de neige", url: "https://app.webcam-hd.com/lescarroz/front-de-neige", fournisseur: "Webcam-HD" },
    { label: "Arrivée de la télécabine", url: "https://app.webcam-hd.com/lescarroz/arrivee-telecabine", fournisseur: "Webcam-HD" },
    { label: "Les Molliets 1500", url: "https://app.webcam-hd.com/lescarroz/les-molliets-1500", fournisseur: "Webcam-HD" },
    { label: "Vue village", url: "https://app.webcam-hd.com/lescarroz/vue-village", fournisseur: "Webcam-HD" },
    { label: "Les Carroz 2100", url: "https://app.webcam-hd.com/lescarroz/carroz-2100", fournisseur: "Webcam-HD" },
  ],
  "les-contamines-montjoie": [
    { label: "Centre du village", url: "https://app.webcam-hd.com/lescontamines/Centre-Village", fournisseur: "Webcam-HD" },
  ],
  "les-gets": [
    { label: "Front de neige", url: "https://app.webcam-hd.com/lesgets/front-de-neige-panoramique", fournisseur: "Webcam-HD" },
    { label: "Sommet Chéry", url: "https://app.webcam-hd.com/lesgets/les_gets_sommet-chery", fournisseur: "Webcam-HD" },
    { label: "Départ Perrières", url: "https://app.webcam-hd.com/lesgets/depart-perrieres", fournisseur: "Webcam-HD" },
    { label: "Départ Ranfoilly", url: "https://app.webcam-hd.com/lesgets/depart-ranfoilly", fournisseur: "Webcam-HD" },
    { label: "Chavannes", url: "https://app.webcam-hd.com/lesgets/lesgets_chavannes", fournisseur: "Webcam-HD" },
    { label: "Plateau des Chavannes", url: "https://app.webcam-hd.com/lesgets/plateau-des-chavannes", fournisseur: "Webcam-HD" },
    { label: "Village", url: "https://app.webcam-hd.com/lesgets/route-des-metrallins", fournisseur: "Webcam-HD" },
    { label: "Lac", url: "https://app.webcam-hd.com/lesgets/lac", fournisseur: "Webcam-HD" },
    { label: "Portes du soleil", url: "https://www.skaping.com/portes-du-soleil/les-gets", fournisseur: "Skaping" },
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
    { label: "Bruyères", url: "https://www.skaping.com/les-menuires/bruyeres/photo", fournisseur: "Skaping" },
    { label: "Jardin d'enfant", url: "https://www.skaping.com/les-menuires/jardin-enfant", fournisseur: "Skaping" },
    { label: "La Masse", url: "https://www.skaping.com/les-menuires/la-masse", fournisseur: "Skaping" },
    { label: "Clocher", url: "https://www.skaping.com/les-menuires/clocher", fournisseur: "Skaping" },
    { label: "La Croisette", url: "https://www.skaping.com/lesmenuires/croisette", fournisseur: "Skaping" },
    { label: "Lac du Lou", url: "https://www.skaping.com/les-menuires/lac-du-lou", fournisseur: "Skaping" },
  ],
  "les-saisies": [
    { label: "Le Manant", url: "https://www.skaping.com/les-saisies/le-manant", fournisseur: "Skaping" },
    { label: "Mont Bisanne", url: "https://app.webcam-hd.com/les-saisies/bisanne-panoramique-2000", fournisseur: "Webcam-HD" },
    { label: "Centre station", url: "https://app.webcam-hd.com/les-saisies/boetet", fournisseur: "Webcam-HD" },
    { label: "Hauteluce Chozal", url: "https://app.webcam-hd.com/les-saisies/hauteluce-chozal", fournisseur: "Webcam-HD" },
    { label: "Hauteluce Village", url: "https://app.webcam-hd.com/les-saisies/hauteluce-mtblanc", fournisseur: "Webcam-HD" },
    { label: "Espace Erwin Eckl", url: "https://app.webcam-hd.com/les-saisies/espace-erwineckl", fournisseur: "Webcam-HD" },
    { label: "Bellasta", url: "https://app.webcam-hd.com/les-saisies/bellasta", fournisseur: "Webcam-HD" },
    { label: "Domaine nordique", url: "https://app.webcam-hd.com/les-saisies/nordique", fournisseur: "Webcam-HD" },
  ],
  "manigod": [
    { label: "Merdassier Centre Station", url: "https://app.webcam-hd.com/manigod/merdassier-centre-station", fournisseur: "Webcam-HD" },
    { label: "Croix Fry", url: "https://www.skaping.com/manigod/croix-fry", fournisseur: "Skaping" },
    { label: "Merdassier", url: "https://www.skaping.com/manigod/merdassier", fournisseur: "Skaping" },
    { label: "Manigod Village", url: "https://app.webcam-hd.com/manigod/webcam-village", fournisseur: "Webcam-HD" },
    { label: "Manigod La Croix Fry", url: "https://app.webcam-hd.com/manigod/manigod_la-croix-fry", fournisseur: "Webcam-HD" },
    { label: "Cabeau", url: "https://www.skaping.com/manigod/cabeau", fournisseur: "Skaping" },
  ],
  "megeve": [
    { label: "Rochebrune", url: "https://www.skaping.com/megeve/rochebrune/panoramique", fournisseur: "Skaping" },
    { label: "Mont d'Arbois", url: "https://www.skaping.com/megeve/mont-d-arbois", fournisseur: "Skaping" },
    { label: "Croix de sur les Prés", url: "https://www.skaping.com/jaillet/sommet", fournisseur: "Skaping" },
    { label: "La livraz", url: "https://www.skaping.com/megeve/la-livraz", fournisseur: "Skaping" },
    { label: "Alpette", url: "https://www.skaping.com/megeve/alpette", fournisseur: "Skaping" },
    { label: "Cote 2000", url: "https://www.skaping.com/megeve/cote-2000", fournisseur: "Skaping" },
    { label: "Village", url: "https://www.skaping.com/megeve/village", fournisseur: "Skaping" },
    { label: "Fontaine", url: "https://www.skaping.com/megeve/fontaine", fournisseur: "Skaping" },
    { label: "Altiport", url: "https://app.webcam-hd.com/megeve/altiport", fournisseur: "Webcam-HD" },
    { label: "Lac d'Arbois", url: "https://www.skaping.com/megeve/lac-d-arbois", fournisseur: "Skaping" },
  ],
  "meribel": [
    { label: "Roc de fer", url: "https://www.skaping.com/meribel/roc-de-fer", fournisseur: "Skaping" },
    { label: "Col de la Loze", url: "https://app.webcam-hd.com/meribel/courchevel-meribel_col-de-la-loze", fournisseur: "Webcam-HD" },
    { label: "Mottaret Centre", url: "https://app.webcam-hd.com/meribel/meribel-mottaret_front-de-neige", fournisseur: "Webcam-HD" },
    { label: "Mont Vallon", url: "https://www.skaping.com/meribel/mont-vallon", fournisseur: "Skaping" },
    { label: "Bouquetin", url: "https://app.webcam-hd.com/meribel/bouquetin", fournisseur: "Webcam-HD" },
    { label: "Chaudanne", url: "https://app.webcam-hd.com/meribel/meribel_chaudanne", fournisseur: "Webcam-HD" },
    { label: "Tougnète", url: "https://app.webcam-hd.com/meribel/meribel_tougnete", fournisseur: "Webcam-HD" },
    { label: "Versant Saulire", url: "https://app.webcam-hd.com/meribel/meribel_versant-saulire", fournisseur: "Webcam-HD" },
    { label: "Lac de Tueda", url: "https://app.webcam-hd.com/meribel/lac-de-tueda", fournisseur: "Webcam-HD" },
    { label: "TC Rhodos", url: "https://app.webcam-hd.com/meribel/meribel_rhodos", fournisseur: "Webcam-HD" },
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
    { label: "Sommet de la Télécabine du Pleney", url: "https://app.webcam-hd.com/morzine/sommet-du-pleney", fournisseur: "Webcam-HD" },
    { label: "Office de tourisme, 1 000 m", url: "https://www.skaping.com/morzine/office-de-tourisme", fournisseur: "Skaping" },
    { label: "Chamossière, 2 002 m", url: "https://app.webcam-hd.com/morzine/chamossiere", fournisseur: "Webcam-HD" },
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
    { label: "Revard", url: "https://www.skaping.com/grandlac/revard", fournisseur: "Skaping" },
    { label: "Revard Info Neige", url: "https://www.skaping.com/grandlac/revardinfoneige", fournisseur: "Skaping" },
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
    { label: "La Met", url: "https://app.webcam-hd.com/valcenis/la-met", fournisseur: "Webcam-HD" },
    { label: "Replat des Canons", url: "https://app.webcam-hd.com/valcenis/replat-des-canons", fournisseur: "Webcam-HD" },
  ],
  "val-disere": [
    { label: "Borsat", url: "https://www.skaping.com/valdisere/borsat", fournisseur: "Skaping" },
    { label: "Pisaillais", url: "https://www.skaping.com/valdisere/pisaillas", fournisseur: "Skaping" },
    { label: "Solaise", url: "https://www.skaping.com/valdisere/solaise", fournisseur: "Skaping" },
    { label: "Leissières", url: "https://www.skaping.com/valdisere/leissieres", fournisseur: "Skaping" },
    { label: "Village", url: "https://www.skaping.com/valdisere/village", fournisseur: "Skaping" },
    { label: "Refuge du Prariond", url: "https://www.skaping.com/valdisere/refuge-du-prariond", fournisseur: "Skaping" },
    { label: "Club des sports 2", url: "https://app.webcam-hd.com/val-d-isere/club-des-sports-2", fournisseur: "Webcam-HD" },
    { label: "Club des sports 1", url: "https://app.webcam-hd.com/val-d-isere/club-des-sports-1", fournisseur: "Webcam-HD" },
  ],
  "val-thorens": [
    { label: "Cime Caron", url: "https://www.skaping.com/val-thorens/cime-caron", fournisseur: "Skaping" },
    { label: "Station", url: "https://www.skaping.com/valthorens/station", fournisseur: "Skaping" },
    { label: "3 Vallées", url: "https://www.skaping.com/valthorens/3vallees", fournisseur: "Skaping" },
    { label: "Funitel Thorens", url: "https://www.skaping.com/valthorens/funitelthorens", fournisseur: "Skaping" },
    { label: "Restaurant La Maison", url: "https://www.skaping.com/valthorens/lamaison", fournisseur: "Skaping" },
    { label: "Tyrolienne", url: "https://www.skaping.com/val-thorens/tyrolienne-la-bee", fournisseur: "Skaping" },
    { label: "Boismint", url: "https://www.skaping.com/valthorens/boismint", fournisseur: "Skaping" },
    { label: "École Prosneige", url: "https://www.skaping.com/valthorens/prosneige", fournisseur: "Skaping" },
    { label: "Lac Blanc", url: "https://www.skaping.com/valthorens/stade", fournisseur: "Skaping" },
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
    { label: "Planchamp", url: "https://www.skaping.com/valmorel/planchamp", fournisseur: "Skaping" },
    { label: "Village", url: "https://app.webcam-hd.com/valmorel/village", fournisseur: "Webcam-HD" },
    { label: "Biollene", url: "https://app.webcam-hd.com/valmorel/biollene", fournisseur: "Webcam-HD" },
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
    { label: "Blainon", url: "https://app.webcam-hd.com/auron/blainon", fournisseur: "Webcam-HD" },
    { label: "Berchia", url: "https://app.webcam-hd.com/auron/berchia", fournisseur: "Webcam-HD" },
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
    { label: "Tête Cabane", url: "https://app.webcam-hd.com/isola/isola-2000_tete-cabane", fournisseur: "Webcam-HD" },
    { label: "Chastillon", url: "https://app.webcam-hd.com/isola/isola-2000_chastillon", fournisseur: "Webcam-HD" },
    { label: "Front de neige", url: "https://app.webcam-hd.com/isola/front-de-neige", fournisseur: "Webcam-HD" },
    { label: "Sistron", url: "https://app.webcam-hd.com/isola/sistron", fournisseur: "Webcam-HD" },
  ],
  "la-grave-la-meije": [
    { label: "La Grave, 3 200 m", url: "https://www.skaping.com/lagrave/3200m", fournisseur: "Skaping" },
    { label: "Village, 1 500 m", url: "https://www.skaping.com/lagrave/1500m", fournisseur: "Skaping" },
    { label: "La Grave, 2 400 m", url: "https://www.skaping.com/lagrave/2400m", fournisseur: "Skaping" },
    { label: "Hôtel Castillan", url: "https://www.skaping.com/la-grave/hotel-castillan", fournisseur: "Skaping" },
  ],
  "les-orres": [
    { label: "Sommet Pousterle, 2 530 m", url: "https://www.skaping.com/les-orres/pousterle", fournisseur: "Skaping" },
  ],
  "montgenevre": [
    { label: "Col de Montgenèvre", url: "https://app.webcam-hd.com/montgenevre/eglise", fournisseur: "Webcam-HD" },
    { label: "Front de neige", url: "https://app.webcam-hd.com/montgenevre/front-de-neige", fournisseur: "Webcam-HD" },
    { label: "Luge Monty Express", url: "https://app.webcam-hd.com/montgenevre/mur-d-escalade", fournisseur: "Webcam-HD" },
    { label: "Espace ski nordique", url: "https://app.webcam-hd.com/montgenevre/espace-ski-nordique", fournisseur: "Webcam-HD" },
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
    { label: "Clos du serre", url: "https://www.skaping.com/pra-loup/molanes", fournisseur: "Skaping" },
  ],
  "puy-saint-vincent": [
    { label: "Pelvoux-Vallouise", url: "https://www.vision-environnement.com/live/player/pelvoux30.php", fournisseur: "Vision Environnement" },
  ],
  "risoul": [
    { label: "Sommet Razis", url: "https://app.webcam-hd.com/risoul/sommet-razis", fournisseur: "Webcam-HD" },
    { label: "Front de neige", url: "https://app.webcam-hd.com/risoul/risoul_front", fournisseur: "Webcam-HD" },
    { label: "Pré du Bois", url: "https://app.webcam-hd.com/risoul/pre-du-bois", fournisseur: "Webcam-HD" },
    { label: "Homme de Pierre", url: "https://app.webcam-hd.com/risoul/homme-de-pierre", fournisseur: "Webcam-HD" },
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
    { label: "Méa", url: "https://www.skaping.com/serre-chevalier/mea", fournisseur: "Skaping" },
    { label: "Cucumelle", url: "https://www.skaping.com/serre-chevalier/cucumelle", fournisseur: "Skaping" },
  ],
  "superdevoluy-la-joue-du-loup": [
    { label: "Coeur du Domaine", url: "https://app.webcam-hd.com/superdevoluy/snowpark", fournisseur: "Webcam-HD" },
    { label: "Arrivée télésiège Génépy", url: "https://app.webcam-hd.com/superdevoluy/sommet-domaine-skiable", fournisseur: "Webcam-HD" },
    { label: "Télémix des fontettes", url: "https://app.webcam-hd.com/superdevoluy/fontettes", fournisseur: "Webcam-HD" },
    { label: "Superdévoluy", url: "https://app.webcam-hd.com/superdevoluy/village", fournisseur: "Webcam-HD" },
    { label: "La Joue du Loup", url: "https://app.webcam-hd.com/superdevoluy/la-joue-du-loup", fournisseur: "Webcam-HD" },
  ],
  "val-dallos-la-foux-le-seignus": [
    { label: "Départ du télésiège Clos Bertrand, 1 530 m", url: "https://app.webcam-hd.com/valdallos/seignus-bas", fournisseur: "Webcam-HD" },
    { label: "Sommet du télésiège Clos Bertrand, 1 915 m", url: "https://app.webcam-hd.com/valdallos/seignus-haut", fournisseur: "Webcam-HD" },
    { label: "Centre Station", url: "https://app.webcam-hd.com/valdallos/centre-station", fournisseur: "Webcam-HD" },
    { label: "Départ TS Observatoire, 2 140 m", url: "https://app.webcam-hd.com/valdallos/observatoire", fournisseur: "Webcam-HD" },
    { label: "Sommet TSD Marin Pascal, 2 360 m", url: "https://app.webcam-hd.com/valdallos/sommet-marin-pascal", fournisseur: "Webcam-HD" },
    { label: "Départ TSD Marin Pascal, 1 840 m", url: "https://app.webcam-hd.com/valdallos/front-de-neige", fournisseur: "Webcam-HD" },
    { label: "Le Village", url: "https://app.webcam-hd.com/valdallos/village", fournisseur: "Webcam-HD" },
  ],
  "valberg": [
    { label: "Sommet Tête des Eguilles", url: "https://app.webcam-hd.com/valberg/sommet-tete-des-eguilles", fournisseur: "Webcam-HD" },
    { label: "Leysin", url: "https://app.webcam-hd.com/valberg/leysin", fournisseur: "Webcam-HD" },
    { label: "Ancolies", url: "https://app.webcam-hd.com/valberg/ancolie", fournisseur: "Webcam-HD" },
    { label: "Place du village", url: "https://app.webcam-hd.com/valberg/valberg_village", fournisseur: "Webcam-HD" },
    { label: "Beuil-Les Launes", url: "https://app.webcam-hd.com/valberg/nordique_des_launes", fournisseur: "Webcam-HD" },
    { label: "Chantier 1", url: "https://app.webcam-hd.com/valberg/chantier1", fournisseur: "Webcam-HD" },
  ],
  "vars": [
    { label: "Col de Crevoux", url: "https://www.skaping.com/vars/col-de-crevoux", fournisseur: "Skaping" },
    { label: "Pic de Chabrières", url: "https://app.webcam-hd.com/vars/chabrieres", fournisseur: "Webcam-HD" },
    { label: "Front de Neige", url: "https://www.skaping.com/vars/les-claux", fournisseur: "Skaping" },
    { label: "Chabrières", url: "https://www.skaping.com/vars/chabrieres", fournisseur: "Skaping" },
    { label: "Peynier", url: "https://www.skaping.com/vars/peynier", fournisseur: "Skaping" },
    { label: "Speed Master", url: "https://www.skaping.com/vars/speed-master", fournisseur: "Skaping" },
    { label: "Mayt", url: "https://www.skaping.com/vars/mayt", fournisseur: "Skaping" },
    { label: "Crevoux", url: "https://app.webcam-hd.com/vars/crevoux", fournisseur: "Webcam-HD" },
    { label: "Les Claux", url: "https://www.skaping.com/vars/les-claux/video", fournisseur: "Skaping" },
    { label: "Snowpark", url: "https://www.skaping.com/vars/snowpark", fournisseur: "Skaping" },
    { label: "Snowpark de l'Eyssina", url: "https://app.webcam-hd.com/vars/snowpark", fournisseur: "Webcam-HD" },
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
    { label: "Les Jouvencelles, pied des pistes", url: "https://app.webcam-hd.com/les-rousses/jouvencelles-ts", fournisseur: "Webcam-HD" },
    { label: "La Serra, pied des pistes", url: "https://app.webcam-hd.com/les-rousses/la-serra", fournisseur: "Webcam-HD" },
    { label: "Sommet de la Dôle, vue Mont-Blanc", url: "https://app.webcam-hd.com/les-rousses/massif-de-dole", fournisseur: "Webcam-HD" },
    { label: "Dappes", url: "https://www.skaping.com/jura-sur-leman/la-dole/vue-les-rousses", fournisseur: "Skaping" },
    { label: "Village des Rousses, Omnibus", url: "https://app.webcam-hd.com/les-rousses/omnibus", fournisseur: "Webcam-HD" },
    { label: "Base Nautique, Lac des Rousses", url: "https://app.webcam-hd.com/les-rousses/base-nautique", fournisseur: "Webcam-HD" },
    { label: "Darbella nordique, départ pistes nordiques", url: "https://app.webcam-hd.com/les-rousses/darbella", fournisseur: "Webcam-HD" },
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
    { label: "Versant Plomb", url: "https://app.webcam-hd.com/lioran/lioran_versant-plomb", fournisseur: "Webcam-HD" },
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
    { label: "Roc de la Calme", url: "https://app.webcam-hd.com/font-romeu/roc-de-la-calme", fournisseur: "Webcam-HD" },
    { label: "Calme Sud", url: "https://app.webcam-hd.com/font-romeu/calme-sud", fournisseur: "Webcam-HD" },
  ],
  "la-mongie-bareges": [
    { label: "La Mongie, 2 100 m", url: "https://www.skaping.com/grandtourmalet/liaison", fournisseur: "Skaping" },
    { label: "Barèges Tournaboup, 1 450 m", url: "https://www.skaping.com/grandtourmalet/baregestournaboup", fournisseur: "Skaping" },
    { label: "Barèges Tourmalet, 1 750 m", url: "https://www.skaping.com/grandtourmalet/baregestourmalet", fournisseur: "Skaping" },
    { label: "La Mongie Col Du Tourmalet, 2 115 m", url: "https://www.skaping.com/grandtourmalet/coldutourmalet", fournisseur: "Skaping" },
    { label: "Village, 1 750 m", url: "https://www.skaping.com/grandtourmalet/lamongievillage", fournisseur: "Skaping" },
    { label: "Barèges Laquette, 1 700 m", url: "https://www.skaping.com/grandtourmalet/laquette", fournisseur: "Skaping" },
    { label: "La Mongie Tourmalet, 1 800 m", url: "https://www.skaping.com/grandtourmalet/lamongietourmalet", fournisseur: "Skaping" },
    { label: "Grand Tourmalet", url: "https://www.skaping.com/grandtourmalet/lamongiepourteilh", fournisseur: "Skaping" },
    { label: "Barèges Lienz", url: "https://www.skaping.com/grandtourmalet/baregeslienz", fournisseur: "Skaping" },
    { label: "La Mongie 4 Termes", url: "https://www.skaping.com/grandtourmalet/lamongie4termes", fournisseur: "Skaping" },
  ],
  "eyne-cambre-daze": [
    { label: "Pla", url: "https://www.skaping.com/cambredaze/pla", fournisseur: "Skaping" },
  ],
  "luz-ardiden": [
    { label: "Sommet de l'Aulian", url: "https://www.skaping.com/luz-ardiden/sommet-aulian", fournisseur: "Skaping" },
    { label: "Aulian", url: "https://www.skaping.com/luz-ardiden/aulian", fournisseur: "Skaping" },
    { label: "Caperette", url: "https://www.skaping.com/luz-ardiden/caperette", fournisseur: "Skaping" },
    { label: "Pourtere", url: "https://www.skaping.com/luz-ardiden/pourtere", fournisseur: "Skaping" },
    { label: "Snowpark", url: "https://www.skaping.com/luz-ardiden/snowpark", fournisseur: "Skaping" },
    { label: "Bédéret", url: "https://www.skaping.com/luz-ardiden/bederet/video", fournisseur: "Skaping" },
    { label: "Freestyle", url: "https://www.skaping.com/luz-ardiden/freestyle/video", fournisseur: "Skaping" },
  ],
  "peyragudes": [
    { label: "Peyresourde", url: "https://www.skaping.com/peyragudes/peyresourde", fournisseur: "Skaping" },
    { label: "Les Agudes", url: "https://www.skaping.com/peyragudes/les-agudes", fournisseur: "Skaping" },
    { label: "Belvédère", url: "https://www.skaping.com/peyragudes/belvedere", fournisseur: "Skaping" },
    { label: "Cap De Pales", url: "https://www.skaping.com/peyragudes/cap-de-pales", fournisseur: "Skaping" },
  ],
  "saint-lary-soulan": [
    { label: "Pic d'Aret", url: "https://www.skaping.com/saint-lary/pic-d-aret", fournisseur: "Skaping" },
    { label: "Bouleaux", url: "https://www.skaping.com/saint-lary/bouleaux/panoramique", fournisseur: "Skaping" },
    { label: "Les Merlans", url: "https://www.skaping.com/saint-lary/les-merlans/live", fournisseur: "Skaping" },
    { label: "De Saint-Lary-Soulan", url: "https://www.skaping.com/saint-lary/fontaine", fournisseur: "Skaping" },
    { label: "Au coeur du village de Saint-Lary", url: "https://www.skaping.com/saint-lary/village", fournisseur: "Skaping" },
    { label: "Tourette", url: "https://www.skaping.com/saint-lary/tourette", fournisseur: "Skaping" },
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
    { label: "Lac de Gérardmer", url: "https://app.webcam-hd.com/gerardmer/lac-de-gerardmer", fournisseur: "Webcam-HD" },
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
    { label: "Grand Ballon", url: "https://app.webcam-hd.com/markstein/grand-ballon", fournisseur: "Webcam-HD" },
    { label: "Luge sur rail", url: "https://app.webcam-hd.com/markstein/luge", fournisseur: "Webcam-HD" },
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
    { label: "ESF Corrençon", url: "https://app.webcam-hd.com/correncon-en-vercors/jardin-des-neiges-esf-correncon", fournisseur: "Webcam-HD" },
  ],
  "doucy": [
    { label: "Doucy", url: "https://app.webcam-hd.com/valmorel/doucy-combelouviere", fournisseur: "Webcam-HD" },
  ],
  "saint-jean-de-sixt": [
    { label: "Forgeassoud Dessus", url: "https://app.webcam-hd.com/saint-jean-de-sixt/stade-de-neige", fournisseur: "Webcam-HD" },
    { label: "Village", url: "https://app.webcam-hd.com/saint-jean-de-sixt/village", fournisseur: "Webcam-HD" },
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
    { label: "Puntas", url: "https://www.skaping.com/cauterets/puntas/video", fournisseur: "Skaping" },
    { label: "Place de la mairie", url: "https://www.skaping.com/cauterets/village", fournisseur: "Skaping" },
    { label: "Cascade du Pont d'Espagne", url: "https://www.skaping.com/cauterets/pontdespagne", fournisseur: "Skaping" },
    { label: "Cascade Pont d'Espagne", url: "https://www.skaping.com/cauterets/pontdespagne/video0", fournisseur: "Skaping" },
  ],
};
