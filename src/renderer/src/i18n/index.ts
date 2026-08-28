/**
 * i18n minimaliste, deux langues.
 *
 * Pas de bibliothèque : l'application a quelques centaines de chaînes. Le
 * catalogue est indexé **par clé** et non par langue — chaque entrée est un
 * tuple dans l'ordre `LANGUAGES`. Un dictionnaire par langue obligeait à
 * parcourir sept fichiers pour vérifier une seule formulation ; côte à côte,
 * une traduction absente ou décalée saute aux yeux.
 *
 * Une valeur manquante retombe sur le français (index 0) plutôt que d'afficher
 * la clé : une phrase dans la mauvaise langue reste lisible, `sort_by` non.
 *
 * Le catalogue a porté sept langues. Il en porte deux : cinq d'entre elles
 * n'étaient relues par personne, et une traduction que personne ne relit vieillit
 * en silence — elle finit par décrire une interface qui a changé. Deux langues
 * tenues justes valent mieux que sept dont cinq dérivent.
 */

import { createContext, useContext } from 'react'

export const LANGUAGES = ['fr', 'en'] as const
export type Language = (typeof LANGUAGES)[number]

/** Libellé de chaque langue, écrit dans cette langue. */
export const LANGUAGE_LABELS: Record<Language, string> = {
  fr: 'Français',
  en: 'English'
}

/** Locale BCP-47 utilisée pour les dates, les nombres et les montants. */
export const LOCALES: Record<Language, string> = {
  fr: 'fr-FR',
  en: 'en-GB'
}

/** Une entrée du catalogue : fr puis en, dans cet ordre. */
type Entry = readonly [string, string]

const CATALOG = {
  appName: ['SKITRACK', 'SKITRACK'],

  // --- Navigation ---------------------------------------------------------
  nav_home: ['Accueil', 'Home'],
  nav_search: ['Stations', 'Resorts'],
  nav_settings: ['Réglages', 'Settings'],
  nav_lodgings: ['Logements', 'Stays'],
  nav_offers: ['Meilleures offres', 'Best offers'],
  nav_combos: ['Combinaisons', 'Combinations'],
  nav_decision: ['Décision', 'Decision'],
  nav_tracking: ['Suivi', 'Tracking'],
  nav_travelers: ['Voyageurs', 'Travellers'],
  /** Nom du groupe segmenté pour les lecteurs d'écran. Le nommer « Décision »
   *  reprendrait le libellé d'un de ses trois boutons. */
  nav_seg_label: ['Vues de la comparaison', 'Comparison views'],
  nav_favorites: ['Favoris', 'Shortlist'],
  /** Infobulle de l'onglet Logements tant qu'aucun domaine n'est ouvert. */
  nav_lodgings_need_domain: [
    'Ouvrez d’abord un domaine depuis Rechercher.',
    'Open a resort from Search first.'
  ],

  // --- Fil du parcours (stepper) -----------------------------------------
  // Trois étapes qui disent l'ordre naturel de la tâche : on choisit une
  // station, puis un logement dans cette station, puis on compare pour
  // trancher. Rend explicite un enchaînement qui restait implicite entre des
  // onglets à plat.
  journey_station: ['Station', 'Resort'],
  journey_lodging: ['Logement', 'Stay'],
  journey_decision: ['Décision', 'Decision'],
  journey_station_sub: ['Choisir un domaine', 'Pick a resort'],
  journey_lodging_sub: ['Choisir un hébergement', 'Pick a stay'],
  journey_decision_sub: ['Comparer & trancher', 'Compare & decide'],
  journey_step: ['Étape', 'Step'],
  journey_locked: ['Choisissez d’abord une station', 'Pick a resort first'],
  journey_aria: ['Parcours : station, logement, décision', 'Journey: resort, stay, decision'],


  // --- Apparence ----------------------------------------------------------
  theme_light: ['Clair', 'Light'],
  theme_dark: ['Sombre', 'Dark'],
  theme_toggle: ['Basculer clair / sombre', 'Switch light / dark'],
  theme_follows: [
    'Le thème suit le curseur de la barre supérieure.',
    'The theme follows the toggle in the top bar.'
  ],
  appearance: ['Apparence', 'Appearance'],
  settings_snowfall: ['Neige animée', 'Animated snowfall'],
  density: ['Densité', 'Density'],
  density_comfortable: ['Confortable', 'Comfortable'],
  density_compact: ['Compacte', 'Compact'],
  lang_note: [
    'Toute l’interface, les unités, les dates et les montants suivent la langue choisie. Les noms de domaines et de massifs restent en français, sauf usage établi dans la langue.',
    'The whole interface, units, dates and amounts follow the chosen language. Resort and range names stay in French unless an established local usage exists.'
  ],

  // --- Moteur local -------------------------------------------------------
  sidecar_starting: ['Démarrage du moteur local…', 'Starting local engine…'],
  sidecar_ready: ['Moteur local prêt', 'Local engine ready'],
  sidecar_error: ['Le moteur local ne démarre pas', 'The local engine failed to start'],
  sidecar_restart: ['Redémarrer le moteur', 'Restart engine'],
  sidecar_log: ['Journal', 'Log'],

  // --- Référentiel --------------------------------------------------------
  referential_empty_title: ['Aucun domaine dans la base', 'No resort in the database'],
  referential_empty_body: [
    "Importez le référentiel OpenSkiMap pour commencer. Le téléchargement fait environ 130 Mo (domaines + remontées) et n'a besoin d'être fait qu'une fois.",
    'Import the OpenSkiMap reference data to get started. The download is about 130 MB (resorts + lifts) and is only needed once.'
  ],
  referential_import: ['Importer le référentiel', 'Import reference data'],
  referential_importing: ['Import en cours…', 'Importing…'],
  referential_with_lifts: [
    'Inclure les remontées (~107 Mo, donne l’altitude du front de neige)',
    'Include lifts (~107 MB, gives the base-station altitude)'
  ],
  referential_detect_glaciers: [
    'Détecter les glaciers (une requête Overpass)',
    'Detect glaciers (one Overpass query)'
  ],
  referential_countries: ['Pays', 'Countries'],
  referential_domains_count: ['domaines en base', 'resorts stored'],
  referential_title: ['Référentiel des domaines', 'Resort reference file'],
  referential_export: ['Exporter', 'Export'],
  referential_revert: ['Revenir au référentiel livré', 'Restore the bundled file'],
  referential_import_file: ['Importer un fichier', 'Import a file'],
  referential_manage: ['Gérer le référentiel', 'Manage the reference file'],
  osm_odbl: [
    'Données © contributeurs OpenStreetMap, sous licence ODbL, via OpenSkiMap.org.',
    'Data © OpenStreetMap contributors, ODbL licence, via OpenSkiMap.org.'
  ],

  // --- Filtres ------------------------------------------------------------
  filters: ['Filtres', 'Filters'],
  filter_altitude_min: ['Altitude minimum du bas des pistes', 'Minimum altitude at the base of the runs'],
  filter_altitude_min_help: [
    'Le critère le plus corrélé à la tenue de la neige. Attention : c’est le point skiable le plus bas, pas l’altitude du village.',
    'The criterion most correlated with lasting snow. Note: this is the lowest skiable point, not the village altitude.'
  ],
  filter_altitude_max: ['Point culminant au moins à', 'Summit at least'],
  filter_slopes_km: ['Kilomètres de pistes au minimum', 'Minimum kilometres of runs'],
  filter_country: ['Pays', 'Country'],
  filter_massif: ['Massif', 'Range'],
  filter_glacier: ['Glacier uniquement', 'Glacier only'],
  filter_linked: ['Domaine relié uniquement', 'Linked resorts only'],
  filter_snowmaking: ['Neige de culture minimum', 'Minimum snowmaking'],
  filter_travel: ['Trajet en voiture', 'Drive'],
  filter_travel_max: ['Temps de trajet maximum', 'Maximum travel time'],
  filter_distance_max: ['Distance maximum', 'Maximum distance'],
  filter_avoid_tolls: ['Éviter les péages', 'Avoid tolls'],
  filter_forfait_max: ['Forfait 6 jours adulte, au plus', '6-day adult pass, at most'],
  filter_forfait_help: [
    'Tarif public haute saison du domaine relié. Les domaines sans tarif relevé sont masqués quand ce filtre est actif.',
    'Public high-season price of the linked resort. Resorts with no recorded price are hidden while this filter is on.'
  ],
  filter_options: ['Options', 'Options'],
  filter_reset: ['Réinitialiser', 'Reset'],
  filter_search: ['Rechercher', 'Search'],
  filter_clear_all: ['tout effacer', 'clear all'],
  filters_show: ['Afficher les filtres', 'Show filters'],
  filters_hide: ['Masquer les filtres', 'Hide filters'],
  map_show: ['Afficher la carte', 'Show map'],
  map_hide: ['Masquer la carte', 'Hide map'],
  filters_active: ['actif(s)', 'active'],
  selected_pl: ['sélectionnés', 'selected'],
  all_label: ['tous', 'all'],
  none_fem: ['aucune', 'none'],
  linked_short: ['relié', 'linked'],

  // --- Filtres en plage ----------------------------------------------------
  // Les intitulés sont neutres : les deux bornes se règlent, « au minimum » ou
  // « au plus » décrirait la moitié du contrôle. La valeur de la plage se lit
  // sur la seconde ligne de l'en-tête.
  filter_km_range: ['Kilomètres de pistes', 'Kilometres of runs'],
  filter_travel_range: ['Temps de trajet', 'Travel time'],
  filter_dist_range: ['Distance', 'Distance'],
  filter_pass_range: ['Forfait 6 jours adulte', '6-day adult pass'],
  filter_lodg_budget_range: ['Budget du séjour', 'Stay budget'],
  filter_lodg_dist_range: ['Distance aux pistes', 'Distance to the runs'],
  range_no_limit: ['sans limite', 'no limit'],
  range_low: ['Borne basse', 'Lower bound'],
  range_high: ['Borne haute', 'Upper bound'],
  range_all_altitudes: ['toutes altitudes', 'all altitudes'],
  range_all_summits: ['tous sommets', 'all summits'],
  range_all_sizes: ['toutes tailles', 'all sizes'],
  range_all_travels: ['tous trajets', 'any travel time'],
  range_all_distances: ['toutes distances', 'any distance'],
  range_all_prices: ['tous tarifs', 'any price'],
  range_all_offers: ['toutes les offres', 'all offers'],
  range_all_lodg_distances: ['toutes les distances', 'all distances'],
  chip_base: ['Bas', 'Base'],
  chip_summit: ['Sommet', 'Summit'],
  chip_km: ['Pistes', 'Runs'],
  chip_travel: ['Trajet', 'Drive'],
  chip_dist: ['Distance', 'Distance'],
  chip_pass: ['Forfait', 'Pass'],

  // --- Cadrage de la carte des domaines ------------------------------------
  dom_out_of_view: ['{n} domaine(s) hors du cadrage', '{n} resort(s) outside the view'],
  dom_view_all: ['tout voir', 'show all'],

  // --- Étiquettes dérivées de la vignette de domaine -----------------------
  tag_common_pass: ['Forfait commun :', 'Shared pass:'],
  tag_large_area: ['Grand domaine', 'Large area'],
  tag_high_altitude: ['Haute altitude', 'High altitude'],
  tag_moderate_pass: ['Forfait modéré', 'Moderate pass'],
  tag_verified: ['mesuré', 'measured'],
  of_runs: ['de pistes', 'of runs'],
  geo_from: ['de', 'from'],

  // --- Accueil -------------------------------------------------------------
  home_badge: ['{n} domaines vérifiés · {m} massifs', '{n} verified resorts · {m} ranges'],
  /** Titre du sommaire des massifs, colonne collante de gauche. */
  home_cta_start: ['Commencer la recherche', 'Start searching'],
  home_massif_index: ['Sommaire des massifs', 'Range index'],
  home_massif_explore: ['Explorer {m}', 'Explore {m}'],
  /** Encart flottant du héros. Ne se rend que si le modèle a répondu. */
  home_snow_today: ['Neige relevée ce matin', 'Snow measured this morning'],
  home_title_1: ['Le bon domaine, à la bonne altitude,', 'The right resort, at the right altitude,'],
  home_title_2: ['au bon prix.', 'at the right price.'],
  home_lead: [
    'Forfaits relevés station par station, logements agrégés sur trois sources, trajet et dépenses du groupe additionnés. Aucun score opaque.',
    'Passes recorded resort by resort, stays aggregated from three sources, travel and group costs added up. No opaque score.'
  ],
  home_search_placeholder: ['Chamonix, Val Thorens, Les Angles…', 'Chamonix, Val Thorens, Les Angles…'],
  home_cta: ['Comparer les domaines →', 'Compare the resorts →'],
  home_sc_large: ['Grands domaines', 'Large areas'],
  home_sc_large_title: ['200 km de pistes ou plus', '200 km of runs or more'],
  home_sc_high: ['Haute altitude', 'High altitude'],
  home_sc_high_title: ['Bas des pistes à 1 800 m ou plus', 'Base of the runs at 1,800 m or higher'],
  home_sc_cheap: ['Forfait sous 260 €', 'Pass under €260'],
  home_sc_cheap_title: ['Forfait 6 jours adulte à 260 € ou moins', '6-day adult pass at €260 or less'],
  home_sc_near: ['Moins de 4 h de route', 'Under 4 h of driving'],
  home_sc_near_title: ['Trajet le plus long sous 4 heures', 'Longest drive under 4 hours'],
  // --- Référentiel ---------------------------------------------------------
  referential_state: ['État du référentiel', 'Reference data state'],
  referential_actions: ['Actions', 'Actions'],
  referential_replace: ['Remplacer par mon fichier', 'Replace with my file'],
  referential_export_edit: ['Exporter pour le corriger', 'Export to edit it'],
  referential_wipe_warning: [
    'Importer un référentiel ou revenir à celui livré efface les itinéraires calculés, la décision en cours, les suivis de prix et le comparateur : ils étaient établis pour des domaines qui n’existent peut-être plus.',
    'Importing reference data or reverting to the bundled one erases computed routes, the current decision, price tracking and the comparison: they were built for resorts that may no longer exist.'
  ],

  // --- Suivi : courbes réelles et simulées ---------------------------------
  track_real_curve: ['Historique relevé', 'Recorded history'],
  track_simulated_curve: [
    'Courbe simulée, en attente des premiers relevés',
    'Simulated curve, waiting for the first readings'
  ],
  track_simulated_short: ['simulée', 'simulated'],

  lodg_loading_grid: ['Logements en cours de relevé', 'Stays being collected'],

  // --- Combinaisons : légende de la grille ---------------------------------
  combo_legend_cheap: ['Donné', 'Cheap'],
  combo_legend_mid: ['Moyen', 'Mid-range'],
  combo_legend_dear: ['Cher', 'Expensive'],
  combo_legend_holiday: ['Vacances scolaires', 'School holidays'],

  // --- Offres : partition par prix de nuitée -------------------------------
  offers_per_night: ['Plafond par nuit et par logement', 'Cap per night and per stay'],
  offers_within: ['Dans le budget', 'Within budget'],
  offers_above: ['Juste au-dessus', 'Just above'],
  offers_within_none: ['Aucune offre sous ce plafond.', 'No offer under this cap.'],
  offers_above_none: ['Rien au-dessus de ce plafond.', 'Nothing above this cap.'],
  offers_per_night_note: [
    'Ce plafond ne relance aucune recherche : il partage le classement ci-dessous en deux colonnes.',
    'This cap runs no new search: it splits the ranking below into two columns.'
  ],

  split_drag: ['Glisser pour redimensionner', 'Drag to resize'],

  // --- Barre de recherche en pilule ---------------------------------------
  sb_destination: ['Destination', 'Destination'],
  sb_dates: ['Dates', 'Dates'],
  sb_week_any: ['Choisir une semaine', 'Pick a week'],
  sb_domain: ['domaine skiable', 'ski area'],
  sb_station: ['station', 'resort'],
  dp_title: ['Dates du séjour', 'Stay dates'],
  dp_prev_month: ['Mois précédent', 'Previous month'],
  dp_next_month: ['Mois suivant', 'Next month'],
  dp_nights: ['{n} nuits', '{n} nights'],
  dp_pick_arrival: ['Choisissez la date d’arrivée', 'Pick the arrival date'],
  dp_pick_departure: ['Choisissez la date de départ', 'Pick the departure date'],
  dp_measured_weeks: ['Semaines relevées', 'Recorded weeks'],
  filter_km_help: [
    'Les domaines dont les kilomètres de pistes ne sont pas relevés comptent pour zéro : poser un plancher les écarte.',
    'Resorts whose slope kilometres are not recorded count as zero: setting a floor excludes them.'
  ],
  sb_village: ['village', 'village'],
  sb_area: ['forfait relié', 'linked pass'],
  card_area_title: [
    'Domaine skiable — voir toutes ses stations',
    'Ski area — show all its resorts'
  ],
  card_area_stations: ['{n} stations', '{n} resorts'],
  sb_nearby: ['Stations proches de', 'Resorts near'],
  sb_nearby_busy: ['Recherche par proximité géographique…', 'Searching by geographic proximity…'],
  sb_nearby_none: [
    'Lieu introuvable — ni station, ni domaine, ni commune reconnue.',
    'Place not found — no resort, ski area or town matches.'
  ],
  sb_less: ['Un voyageur de moins', 'One traveller fewer'],
  sb_more: ['Un voyageur de plus', 'One traveller more'],
  sb_go: ['Lancer la recherche', 'Start the search'],
  home_by_massif: ['Explorer par', 'Explore by'],
  home_by_massif_word: ['massif', 'range'],
  home_massif_note: ['{m} massifs, {n} domaines relevés.', '{m} ranges, {n} resorts recorded.'],
  home_massif_count: ['{n} domaines', '{n} resorts'],
  home_all_domains: ['Voir toutes les stations →', 'See all resorts →'],
  massif_other: ['Autres', 'Other'],

  // --- Comparateur de logements --------------------------------------------
  cmp_lodging_price: ['Prix logement (tout compris)', 'Stay price (all in)'],
  cmp_per_person_night: ['Par personne / nuit', 'Per person / night'],
  cmp_full_cost: ['Coût complet séjour*', 'Full stay cost*'],
  cmp_walk_to_runs: ['Pistes à pied', 'Walk to the runs'],
  cmp_capacity: ['Capacité', 'Capacity'],
  cmp_guest_rating: ['Note voyageurs', 'Guest rating'],
  cmp_cancellation: ['Annulation', 'Cancellation'],
  cmp_cancel_free: ['gratuite', 'free'],
  cmp_cancel_none: ['non remboursable', 'non-refundable'],
  cmp_source: ['Source', 'Source'],
  cmp_best: ['meilleure valeur', 'best value'],
  cmp_trophy_note: [
    'La meilleure valeur de chaque ligne porte un trophée.',
    'The best value in each row carries a trophy.'
  ],
  not_provided_fem: ['non renseignée', 'not provided'],

  // --- Administration et provenance corrigeable ----------------------------
  settings_admin: ['Administration', 'Administration'],
  settings_admin_intro: [
    'Réglages techniques de l’installation : moteur local, sources de données, fournisseur d’itinéraires et clés d’API. Rien ici ne change ce que vous voyez au quotidien — ces réglages se posent une fois.',
    'Technical settings for the installation: local engine, data sources, routing provider and API keys. Nothing here changes day-to-day use — these are set once.'
  ],
  prov_correct: ['corriger', 'correct'],
  prov_modify: ['modifier', 'edit'],
  prov_restore: ['Rétablir la valeur d’origine', 'Restore the original value'],
  prov_manual: ['saisi à la main', 'entered by hand'],
  prov_measured: ['relevé', 'recorded'],
  prov_estimated: ['estimé', 'estimated'],
  prov_missing: ['absent', 'missing'],
  prov_empty_note: [
    'Enregistrer avec un texte vide supprime la correction. La ligne d’origine reste calculée dans tous les cas.',
    'Saving with empty text removes the correction. The original line stays computed either way.'
  ],
  /* Accueil en registre d'affiche — héros de massif et section éditoriale.
     Les phrases de caractère ci-dessous ne décrivent aucun relevé : ce sont des
     titres, et elles n'existent que pour les six massifs que le référentiel
     nomme. Un massif inconnu n'en reçoit pas — il n'en reçoit pas une inventée. */
  home_dom_photo_massif: [
    'Photo du massif {m} — aucune photo de {d}',
    'Photo of the {m} range — no photo of {d}'
  ],
  /* Encadré des photos de stations : revue de l'import et crédits. */
  photos_title: ['Photos des stations', 'Resort photos'],
  photos_lede: [
    'Une photo par station, prise sur Wikimedia Commons par sa position et non par son nom. La distance sépare la photo du front de neige : au-delà de deux kilomètres, vérifiez qu’elle montre bien la station.',
    'One photo per resort, taken from Wikimedia Commons by position rather than name. The distance is from the photo to the base of the runs: beyond two kilometres, check that it really shows the resort.'
  ],
  photos_search: ['Chercher une station', 'Search a resort'],
  photos_all: ['Toutes · {n}', 'All · {n}'],
  photos_with: ['Avec photo · {n}', 'With photo · {n}'],
  photos_without: ['Sans photo · {n}', 'Without photo · {n}'],
  photos_missing: ['aucune photo', 'no photo'],
  photos_dist: ['{n} m', '{n} m'],
  photos_dist_unknown: ['distance non relevée', 'distance not measured'],
  photos_no_credit: ['photo sans crédit enregistré', 'photo with no recorded credit'],
  photos_alt: ['Photo de {d}', 'Photo of {d}'],
  photos_source: ['Voir sur Commons ↗', 'View on Commons ↗'],
  photos_none_title: ['Aucune station ne correspond', 'No resort matches'],
  photos_none_body: [
    'Changez le mot cherché, ou revenez à « Toutes ».',
    'Change the search term, or go back to “All”.'
  ],
  photos_licence_note: [
    'Ces photos viennent de Wikimedia Commons sous CC0, domaine public, CC-BY ou CC-BY-SA. L’auteur et la licence affichés ci-dessus sont la mention exigée par ces licences : ils doivent rester visibles partout où la photo est publiée.',
    'These photos come from Wikimedia Commons under CC0, public domain, CC-BY or CC-BY-SA. The author and licence shown above are the attribution those licences require: they must stay visible wherever the photo is published.'
  ],
  home_stat_domains: ['Stations au référentiel', 'Resorts in the dataset'],
  home_stat_domains_note: ['coordonnées et altitudes vérifiées', 'coordinates and altitudes verified'],
  home_stat_median_pass: ['Forfait 6 jours médian', 'Median 6-day pass'],
  home_stat_median_pass_note: ['tarif adulte relevé', 'recorded adult price'],
  home_stat_biggest: ['Plus grand domaine', 'Largest resort'],
  home_stat_sources: ['Sources de logement', 'Stay sources'],
  home_stat_sources_none: ['aucun relevé pour l’instant', 'no search yet'],

  // --- Recherche autour d'une commune -------------------------------------
  search_placeholder: [
    'Un domaine, un massif, ou une commune proche',
    'A resort, a range, or a nearby town'
  ],
  search_aria: ['Rechercher un domaine ou une commune', 'Search a resort or a town'],
  geo_around_town: ['Autour d’une commune', 'Around a town'],
  geo_searching: ['Recherche…', 'Searching…'],
  geo_sorted_from: ['Domaines classés par distance depuis', 'Resorts ranked by distance from'],
  geo_remove: ['retirer', 'remove'],
  geo_approx: [
    'Position approximative : le géocodeur n’a pas rattaché ce point à une commune précise. Le classement reste indicatif.',
    'Approximate position: the geocoder did not match this point to a specific town. The ranking is indicative only.'
  ],
  geo_not_found: [
    'Commune introuvable. Essayez avec le code postal, ou vérifiez l’orthographe.',
    'Town not found. Try adding the postcode, or check the spelling.'
  ],
  geo_needs_engine: [
    'Le géocodage passe par le moteur local, qui n’est pas démarré.',
    'Geocoding goes through the local engine, which is not running.'
  ],
  unpin_map: ['Retirer l’épingle de la carte ✕', 'Remove the map pin ✕'],
  wx_recorded: ['Neige et météo relevées', 'Snow and weather recorded'],
  ago_pattern: ['il y a {d}', '{d} ago'],

  // --- Fraîcheur d'une offre ----------------------------------------------
  fresh_just_added: ['ajouté à l’instant', 'just added'],
  fresh_manual: ['saisi à la main', 'entered by hand'],
  fresh_source_down: ['source injoignable — dernier prix connu', 'source unreachable — last known price'],
  fresh_recorded: ['relevé', 'recorded'],
  lodg_gone_notice: [
    'Introuvable au dernier relevé à ces dates — probablement réservée. Vérifiez sur la source avant de compter dessus.',
    'Not found in the last scan for these dates — probably booked. Check on the source before counting on it.'
  ],
  offers_route_unknown: ['route non calculée', 'route not computed'],
  offers_card_label: ['{l} à {d}, {p} tout compris', '{l} in {d}, {p} all in'],
  offers_price_unit: ['tout compris, {n} nuits', 'all in, {n} nights'],
  offers_per_person: ['soit {p} par personne', '{p} per person'],
  lodg_price_on_source: ['Prix sur {s}', 'Price on {s}'],
  price_from: ['À partir de', 'From'],
  price_all_in: ['tout compris', 'all in'],
  price_unit_confirmed: ['tout compris · {pp}/pers/nuit', 'all in · {pp}/pers/night'],
  price_unit_partial: ['indicatif · {pp}/pers/nuit — confirmer sur le site', 'indicative · {pp}/pers/night — confirm on site'],
  price_badge_confirmed: ['Confirmé', 'Confirmed'],
  price_badge_partial: ['À partir de', 'From'],
  price_badge_confirmed_title: [
    'Prix du séjour pour les dates demandées',
    'Stay total for the requested dates'
  ],
  price_badge_partial_title: [
    'Tarif « à partir de » : le montant exact se confirme sur le site',
    '“From” rate: the exact amount is confirmed on the site'
  ],
  central_live: [
    'Centrale : prix pour vos dates',
    'Booking desk: prices for your dates'
  ],
  central_link: [
    'Centrale : lien seulement — le prix se confirme sur le site',
    'Booking desk: link only — confirm the price on the site'
  ],
  central_none: [
    'Pas de centrale de réservation connue pour cette station',
    'No known booking desk for this resort'
  ],
  scan_sources_empty: [
    'Stock vide (réponse OK, 0 offre tarifée) : {s}',
    'Empty inventory (OK response, 0 priced offer): {s}'
  ],
  lodg_gone_tally: [
    '{n} annonce(s) connue(s) n’apparaissent plus à ces dates — probablement réservées.',
    '{n} known listing(s) no longer appear for these dates — probably booked.'
  ],
  lodg_gone_hide: [
    'Masquer les annonces introuvables au dernier relevé',
    'Hide listings missing from the last scan'
  ],
  fresh_last_search: ['relevé lors de la dernière recherche', 'recorded in the last search'],
  fresh_last_search_short: ['↻ dernière recherche', '↻ last search'],
  scan_recorded: ['Relevé', 'Scanned'],

  // Réglages · état des connecteurs de logement.
  settings_lodging_sources: ['Sources de logement', 'Lodging sources'],
  settings_lodging_sources_none: [
    'Moteur de recherche indisponible — aucun connecteur n’a pu être interrogé.',
    'Search engine unavailable — no connector could be queried.'
  ],
  settings_lodging_sources_help: [
    'Ces connecteurs alimentent l’écran Logements aux côtés d’Airbnb. Une clé posée ci-dessus est prise en compte au relevé suivant, sans redémarrage.',
    'These connectors feed the Lodgings screen alongside Airbnb. A key entered above applies to the next scan, with no restart.'
  ],
  settings_src_ready: ['prêt', 'ready'],
  settings_src_blocked: ['bloqué', 'blocked'],

  // Relevé multi-sources : bilan et échec global.
  scan_sources_failed: [
    'sans réponse : {s} — voir Réglages › Sources de logement',
    'no answer: {s} — see Settings › Lodging sources'
  ],
  scan_no_source_answered: ['Aucune source n’a répondu.', 'No source answered.'],
  scan_other_sources_tally: [
    '{n} offre(s) sur {s} autre(s) source(s)',
    '{n} offer(s) from {s} other source(s)'
  ],

  // Casse de phrase, pas les capitales de la maquette : une pastille nomme un
  // attribut du logement, elle n'a pas à crier plus fort que son titre.
  badge_ski_in: ['Skis aux pieds', 'Ski-in ski-out'],

  // Écran de relevé des logements. Les deux premières reprennent mot pour mot
  // la maquette Claude Design (`searchingLodgings`, `offersFound`).
  scan_searching_lodgings: ['Recherche de logements à', 'Searching stays in'],
  scan_offers_found: ['offres connues', 'offers known'],
  scan_travelers: ['voyageur(s)', 'traveller(s)'],
  scan_rooms_min: ['chambre(s) minimum', 'room(s) minimum'],
  scan_src_querying: ['interrogation…', 'querying…'],
  // Dire « en attente » laisserait croire que la source sera interrogée ensuite.
  // Seul Airbnb est automatisé ; les autres arrivent par import.
  scan_src_manual: ['import manuel', 'manual import'],
  scan_src_disabled: ['source désactivée', 'source disabled'],
  scan_offers_one: ['offre', 'offer'],
  scan_offers_plural: ['offres', 'offers'],
  scan_elapsed_note: [
    '{e} s sur {t} s au maximum — la barre mesure le temps écoulé, pas l’avancement de la collecte.',
    '{e}s of {t}s maximum — the bar tracks elapsed time, not collection progress.'
  ],
  free_cancel_fresh: [
    'Annulation gratuite · offre relevée il y a moins d’une heure',
    'Free cancellation · offer recorded less than an hour ago'
  ],
  digest_short: ['résumé quotidien à 9 h', 'daily digest at 9 am'],
  digest_option: [
    'Résumé quotidien à 9 h plutôt qu’une alerte par baisse',
    'Daily digest at 9 am rather than one alert per drop'
  ],
  track_first_reading: ['premier relevé conservé', 'first reading kept'],
  track_six_weeks: ['il y a 6 semaines', '6 weeks ago'],

  // --- Fond de carte ------------------------------------------------------
  basemap: ['Fond', 'Basemap'],
  basemap_topo: ['Topographique', 'Topographic'],
  basemap_topo_sub: ['relief, pistes et sentiers — OpenTopoMap', 'relief, runs and trails — OpenTopoMap'],
  basemap_plan: ['Plan', 'Street'],
  basemap_plan_sub: ['routes et villages — OpenStreetMap', 'roads and villages — OpenStreetMap'],
  relief_map: ['Carte', 'Map'],
  relief_hillshade: ['Relief ombré', 'Hillshade'],

  // --- Origine ------------------------------------------------------------
  origin: ['Point de départ', 'Starting point'],
  origin_none: ['Aucune adresse de départ', 'No starting address'],
  origin_add: ['Ajouter une adresse', 'Add an address'],
  origin_label: ['Nom (ex. Domicile)', 'Name (e.g. Home)'],
  origin_address: ['Adresse complète', 'Full address'],
  origin_save: ['Enregistrer', 'Save'],
  origin_geocoding: ['Géolocalisation…', 'Geocoding…'],
  origin_delete: ['Supprimer', 'Delete'],
  origin_precompute: ['Calculer les temps de trajet', 'Compute travel times'],
  origin_precompute_help: [
    'Itinéraires routiers réels, calculés une fois puis stockés. Rien n’est recalculé à l’affichage.',
    'Real road itineraries, computed once then stored. Nothing is recomputed on display.'
  ],
  origin_computing: ['Calcul en cours…', 'Computing…'],
  origin_no_route: [
    'Aucun itinéraire calculé : les durées affichées sont des estimations',
    'No route computed: the times shown are estimates'
  ],
  origin_routes_done: ['itinéraires réels calculés', 'real routes computed'],

  // --- Résultats ----------------------------------------------------------
  results_count: ['station(s)', 'resort(s)'],
  results_empty: ['Aucune station ne correspond à ces critères.', 'No resort matches these criteria.'],
  results_empty_hint: [
    'Essayez d’abaisser l’altitude minimum ou d’élargir le temps de trajet.',
    'Try lowering the minimum altitude or widening the travel time.'
  ],
  results_of: ['sur', 'of'],

  // --- Vignette de domaine ------------------------------------------------
  amplitude_lower: ['amplitude', 'vertical'],
  lifts_plural: ['remontées', 'lifts'],
  snow_front_lower: ['front de neige', 'snow front'],
  of_road: ['de route', 'of driving'],
  days_short: ['j', 'd'],
  card_pin_from_map: ['depuis la carte', 'from the map'],
  card_pin_out: ['carte · hors filtres', 'map · outside filters'],
  card_off_map: ['hors carte', 'off the map'],
  card_off_map_title: [
    'Position absente du référentiel : ni carte, ni météo, ni temps de trajet',
    'Position missing from the reference file: no map, no weather, no travel time'
  ],
  card_checked: [
    'Altitudes mesurées : le village sur le modèle de terrain de l’IGN, les pistes sur OpenSkiMap',
    'Measured altitudes: the village on the IGN terrain model, the slopes on OpenSkiMap'
  ],
  price_estimated: ['Tarif estimé, non relevé', 'Estimated price, not recorded'],
  sort_by: ['Trier par', 'Sort by'],
  sort_aria: ['Trier les domaines', 'Sort the resorts'],
  sort_relevance: ['Pertinence', 'Relevance'],
  sort_altitude_min_desc: ['Bas des pistes (décroissant)', 'Base altitude (highest first)'],
  sort_altitude_max_desc: ['Point culminant (décroissant)', 'Summit (highest first)'],
  sort_slopes_km_desc: ['Kilomètres de pistes', 'Kilometres of runs'],
  sort_travel_time_asc: ['Temps de trajet', 'Travel time'],
  sort_forfait_asc: ['Forfait 6 jours (croissant)', '6-day pass (cheapest first)'],
  sort_name_asc: ['Nom', 'Name'],

  // --- Fiche domaine ------------------------------------------------------
  sheet_resort: ['Fiche domaine', 'Resort details'],
  sheet_resort_link: ['Fiche du domaine →', 'Resort details →'],
  sheet_lodging: ['Fiche logement', 'Stay details'],
  alti_profile: ['Profil altimétrique', 'Altitude profile'],
  altitude_span: ['Altitude', 'Elevation'],
  altitude_bottom: ['Bas des pistes', 'Base of the runs'],
  altitude_bottom_lower: ['bas des pistes', 'base of the runs'],
  altitude_top: ['Point culminant', 'Summit'],
  altitude_top_lower: ['point culminant', 'summit'],
  altitude_village: ['Front de neige', 'Snow front'],
  altitude_village_lower: ['front de neige', 'snow front'],
  altitude_range: ['Amplitude skiable', 'Skiable vertical'],
  slopes: ['Pistes', 'Runs'],
  slopes_lifts: ['Pistes · remontées', 'Runs · lifts'],
  lifts: ['Remontées', 'Lifts'],
  glacier: ['Glacier', 'Glacier'],
  snowmaking: ['Neige de culture', 'Snowmaking'],
  travel_time: ['Trajet', 'Drive'],
  travel_car: ['Trajet voiture', 'Drive'],
  official_site: ['Site officiel', 'Official site'],
  booking_site: ['Réservation', 'Booking'],
  score_why: ['Pourquoi ?', 'Why?'],
  score_detail: ['Détail du score', 'Score breakdown'],
  score_note: [
    'Chaque critère est noté sur une échelle absolue de référence — par exemple un bas de pistes à 1 400 m vaut 62, à 2 000 m vaut 90 — et non par comparaison aux autres résultats. Un domaine correct reste donc bien noté même à côté d’un domaine exceptionnel. La note est ensuite multipliée par son poids ; le score est la somme des contributions.',
    'Each criterion is rated on an absolute reference scale — a base at 1,400 m scores 62, at 2,000 m it scores 90 — not by comparison with the other results. A decent resort therefore keeps a good rating even next to an exceptional one. The rating is then multiplied by its weight; the score is the sum of the contributions.'
  ],
  source_openskimap: ['OpenSkiMap', 'OpenSkiMap'],
  source_curated: ['vérifié à la main', 'manually verified'],
  source_derived: ['estimé', 'estimated'],
  data_incomplete: ['Donnée absente de la source', 'Not provided by the source'],
  pass_6d_adult: ['Forfait 6 j adulte', '6-day adult pass'],
  pass_zone: ['Zone du forfait', 'Pass area'],
  passes_label: ['Forfaits', 'Passes'],
  passes_note: [
    'Tarifs publics haute saison, relevés sur le site officiel du domaine.',
    'Public high-season prices, recorded on the resort official site.'
  ],
  passes_family_note: [
    'Tarif famille estimé (2 adultes + 2 enfants, remise usuelle de 5 %) — à confirmer sur la billetterie. Assurance et forfaits piéton non comptés.',
    'Family price estimated (2 adults + 2 children, usual 5% discount) — to be confirmed at the ticket office. Insurance and pedestrian passes not included.'
  ],
  snow_label: ['Neige', 'Snow'],
  snow_base_top: ['(bas / haut)', '(base / top)'],
  snow_on_ground: ['Neige au sol', 'Snow on the ground'],
  resort_base: ['Bas du domaine', 'Base of the resort'],
  resort_top: ['Haut du domaine', 'Top of the resort'],
  snow_modelled: [
    'Hauteurs modélisées par Open-Meteo aux deux altitudes du domaine',
    'Depths modelled by Open-Meteo at both resort altitudes'
  ],
  snow_from_ref: [
    'Valeurs du référentiel, relevé météo en attente',
    'Reference-file values, weather reading pending'
  ],
  snowfall_announced: ['Chutes annoncées :', 'Snowfall forecast:'],
  snowfall_none: ['aucune chute annoncée', 'no snowfall forecast'],
  snowfall_cm_7d: ['cm attendus sur 7 jours', 'cm expected over 7 days'],
  resort_weather: ['Météo du domaine', 'Resort weather'],
  weather_morning: ['Matin', 'Morning'],
  weather_afternoon: ['Après-midi', 'Afternoon'],
  weather_min_max: ['Mini / maxi', 'Min / max'],
  weather_wind_max: ['Vent maximum', 'Maximum wind'],
  weather_precip_24h: ['Précipitations 24 h', 'Precipitation 24 h'],
  weather_snowfall_24h: ['Neige 24 h', 'Snowfall 24 h'],
  weather_snow_depth: ['Neige au sol', 'Snow depth'],
  weather_unavailable: ['Relevé météo indisponible', 'Weather reading unavailable'],
  weather_loading: ['Relevé de la neige et de la météo…', 'Recording snow and weather…'],
  isotherm: ['Isotherme 0 °C :', '0 °C isotherm:'],
  isotherm_note: [
    '— au-dessus, les précipitations tombent en neige.',
    '— above it, precipitation falls as snow.'
  ],
  forecast_14: ['Prévisions 14 jours', '14-day forecast'],
  forecast_7: ['Météo 7 jours', '7-day forecast'],
  webcams_title: ['Webcams du domaine', 'Resort webcams'],
  webcam_choose: ['Choisir une webcam', 'Choose a webcam'],
  webcam_title: ['Webcam du domaine', 'Resort webcam'],
  webcam_note: [
    'Flux de l’exploitant. Si l’image ne s’affiche pas,',
    'Operator feed. If the image does not load,'
  ],
  webcam_open_tab: ['ouvrir dans un onglet ↗', 'open in a new tab ↗'],
  webcam_none: [
    'Aucune webcam vérifiée pour ce domaine dans le référentiel.',
    'No verified webcam for this resort in the reference file.'
  ],
  exposure: ['Exposition des pistes', 'Slope aspect'],
  exposure_note: [
    'Part des kilomètres de pistes par orientation — une majorité nord tient mieux la neige en fin de saison.',
    'Share of run kilometres by aspect — a mostly north-facing resort holds snow better late in the season.'
  ],
  avg_price: ['Prix moyen des logements', 'Average price of stays'],
  avg_price_note: [
    'Médiane des offres relevées pour ce domaine, 8 dernières semaines, à séjour comparable.',
    'Median of the offers recorded for this resort over the last 8 weeks, comparable stay.'
  ],
  see_lodgings: ['Voir les logements', 'View stays'],
  /** Ce que couvre le montant de la carte de domaine. Le logement n'y est pas :
   *  aucun relevé n'existe pour un domaine qu'on n'a pas encore ouvert. */
  card_price_scope: ['forfaits, {n} voyageur(s)', 'passes, {n} traveller(s)'],
  card_price_no_lodging: [
    'Logement non compris : il se relève domaine par domaine.',
    'Stay not included: it is fetched resort by resort.'
  ],
  see_lodgings_of_resort: ['Voir les logements de ce domaine', 'View stays in this resort'],

  // --- Risque d'avalanche -------------------------------------------------
  bra_title: ['Risque d’avalanche', 'Avalanche risk'],
  bra_official: ['Bulletin officiel Météo-France ↗', 'Official Météo-France bulletin ↗'],
  bra_today: ['du jour ↗', 'today ↗'],
  bra_level_read: ['Niveau lu sur le bulletin :', 'Level read on the bulletin:'],
  bra_not_read: [
    'Niveau non renseigné — l’application n’invente pas de risque.',
    'Level not entered — the application does not invent a risk.'
  ],
  bra_note: [
    'Le niveau affiché est celui que vous relevez sur le bulletin officiel. Il vaut pour un massif entier et une journée : il ne remplace ni la lecture du BRA avant la sortie, ni l’avis des professionnels sur place.',
    'The level shown is the one you read on the official bulletin. It applies to a whole range for a single day: it replaces neither reading the bulletin before going out, nor local professional advice.'
  ],
  bra_massif_unknown: [
    'Massif non identifié pour ce domaine : seul le portail Météo-France est proposé.',
    'Range not identified for this resort: only the Météo-France portal is offered.'
  ],
  bra_from_api: ['Bulletin Météo-France', 'Météo-France bulletin'],
  bra_from_manual: [
    'Niveau relevé à la main sur le bulletin officiel',
    'Level entered by hand from the official bulletin'
  ],
  clear_label: ['effacer', 'clear'],

  // --- Réglages -----------------------------------------------------------
  settings_app: ['Application', 'Application'],
  settings_sources: ['Sources de données', 'Data sources'],
  settings_engine: ['Moteur local', 'Local engine'],
  settings_legal: ['Mentions légales', 'Legal notices'],
  settings_keys: ['Clés d’API', 'API keys'],
  settings_keys_help: [
    'Stockées chiffrées par Windows (DPAPI) et transmises en mémoire au moteur local. Jamais écrites en clair, jamais versionnées.',
    'Encrypted by Windows (DPAPI) and passed in memory to the local engine. Never written in clear text, never committed.'
  ],
  settings_key_set: ['Enregistrée', 'Stored'],
  settings_key_unset: ['Non renseignée', 'Not set'],
  settings_save: ['Enregistrer', 'Save'],
  settings_delete: ['Effacer', 'Clear'],
  settings_routing: ['Fournisseur d’itinéraires', 'Routing provider'],
  settings_about: ['À propos', 'About'],
  settings_language: ['Langue', 'Language'],
  settings_encryption_unavailable: [
    'Le chiffrement système est indisponible : aucune clé ne peut être enregistrée.',
    'OS encryption is unavailable: no key can be stored.'
  ],
  settings_weights: ['Poids du classement', 'Ranking weights'],
  settings_weights_help: [
    'Ajustez l’importance de chaque critère. Les poids sont renormalisés : mettre un critère à 0 l’exclut du score.',
    'Adjust the importance of each criterion. Weights are renormalised: setting a criterion to 0 excludes it from the score.'
  ],
  settings_weights_reset: ['Poids par défaut', 'Default weights'],
  settings_purge: ['Effacer toutes mes données locales', 'Erase all my local data'],
  settings_purge_confirm: [
    'Effacer les voyageurs, les adresses, les filtres, les votes, les logements suivis et l’historique de prix enregistrés sur cette machine ? Cette action est immédiate et sans retour.',
    'Erase the travellers, addresses, filters, votes, tracked stays and price history stored on this machine? This is immediate and cannot be undone.'
  ],

  // --- Réglages : moteur, provenance, itinéraires -------------------------
  settings_provenance: ['Provenance des données', 'Where the data comes from'],
  settings_file_loaded: ['Fichier chargé', 'Loaded file'],
  settings_database: ['Base de données', 'Database'],
  settings_ref_embedded: ['Référentiel embarqué', 'Bundled reference file'],
  settings_data_path: ['Données', 'Data'],
  settings_engine_only: [
    'Réglage porté par le moteur local, indisponible tant qu’il n’a pas démarré.',
    'Setting held by the local engine, unavailable until it has started.'
  ],
  engine_restart: ['Redémarrer', 'Restart'],
  engine_update: ['Mettre à jour', 'Update'],
  engine_ref_openskimap: ['Référentiel OpenSkiMap du moteur', 'Engine’s OpenSkiMap reference data'],
  routing_ors: ['OpenRouteService (isochrones + péages)', 'OpenRouteService (isochrones + tolls)'],
  routing_osrm: ['OSRM (sans clé, sans isochrone ni péage)', 'OSRM (no key, no isochrones or tolls)'],

  // --- Filtres de logement ------------------------------------------------
  stay_label: ['Séjour', 'Stay'],
  arrival: ['Arrivée', 'Check-in'],
  departure_label: ['Départ', 'Check-out'],
  lodg_price_allin_note: [
    'Prix tout compris : ménage, taxe de séjour et frais de service inclus.',
    'All-in price: cleaning, tourist tax and service fees included.'
  ],
  // `avail_only` et `avail_only_help` ont disparu avec la case qu'ils
  // légendaient : la réservabilité est une règle de l'écran, plus un réglage.
  avail_unconfirmed: ['Disponibilité non confirmée', 'Availability not confirmed'],
  avail_reason_unpriced: [
    'listée sans tarif à ces dates — le plus souvent, elle n’est pas libre',
    'listed with no price for these dates — usually meaning it is not free'
  ],
  avail_reason_other_dates: [
    'relevée pour d’autres dates, jamais confrontée à celles-ci',
    'recorded for other dates, never checked against these'
  ],
  avail_hidden: [
    '{n} annonce(s) sans disponibilité confirmée, masquée(s)',
    '{n} listing(s) without confirmed availability, hidden'
  ],
  avail_show: ['les afficher', 'show them'],
  avail_open_anyway: ['Ouvrir quand même', 'Open anyway'],

  // --- Ma sélection --------------------------------------------------------
  sel_title: ['Ma sélection', 'My shortlist'],
  sel_domains: ['Domaines', 'Resorts'],
  sel_lodgings: ['Logements retenus', 'Shortlisted stays'],
  sel_gone_title: ['Ces logements ne sont plus disponibles', 'These stays are no longer available'],
  sel_gone_sub: [
    'Changez de dates, ou retenez-en d’autres. Ils restent listés pour que le groupe sache ce qui a été perdu.',
    'Change the dates, or shortlist others. They stay listed so the group knows what was lost.'
  ],
  sel_empty_domains: [
    'Rien de retenu. Le bouton « Retenir » d’une carte de domaine ajoute ici.',
    'Nothing shortlisted yet. The “Shortlist” button on a resort card adds it here.'
  ],
  sel_empty_lodgings: [
    'Aucun logement retenu. Ouvrez un domaine et appuyez sur « Retenir ».',
    'No stay shortlisted. Open a resort and press “Shortlist”.'
  ],
  sel_add_domain: ['Retenir', 'Shortlist'],
  sel_added_domain: ['Retenu', 'Shortlisted'],
  sel_remove: ['Retirer de la sélection', 'Remove from shortlist'],
  sel_note_add: ['Ajouter une note', 'Add a note'],
  sel_note_count: ['{n} note(s)', '{n} note(s)'],
  sel_note_placeholder: [
    'Ce que le groupe doit savoir avant de trancher',
    'What the group should know before deciding'
  ],
  sel_note_publish: ['Publier la note', 'Post the note'],
  sel_note_cancel: ['Annuler', 'Cancel'],
  sel_vote_for: ['Pour', 'For'],
  sel_vote_against: ['Contre', 'Against'],
  /** Rappel que les « collaborateurs » sont les voyageurs du groupe, en local. */
  sel_collaborators_local: [
    'Les voyageurs du groupe, enregistrés sur cet ordinateur. Rien n’est partagé en ligne.',
    'The travellers in your group, stored on this computer. Nothing is shared online.'
  ],
  sel_go_compare: ['Comparer les domaines retenus', 'Compare shortlisted resorts'],
  sel_go_search: ['Ajouter un domaine', 'Add a resort'],
  sel_summary: ['Résumé', 'Summary'],
  sel_cheapest_stay: ['Séjour le moins cher', 'Cheapest stay'],
  sel_nights: ['Nuits', 'Nights'],
  /** Un identifiant retenu qui ne se résout plus dans `state.imported` : le
   *  relevé a été remplacé. On le dit plutôt que de laisser la vignette
   *  s'évaporer, ce qui est précisément ce que cet écran doit empêcher. */
  sel_lost_refs: [
    '{n} logement(s) retenu(s) ne sont plus dans le dernier relevé. Relancez la recherche du domaine concerné pour les retrouver.',
    '{n} shortlisted stay(s) are no longer in the last scan. Run the resort search again to bring them back.'
  ],

  // --- Logements écartés ---------------------------------------------------
  // Les règles de l'écran retirent des annonces ; elles restent visibles ici,
  // avec le motif calculé et la donnée qui l'explique.
  lodg_rejected_title: ['Ces logements sont écartés', 'These stays are set aside'],
  lodg_rejected_sub: [
    'Ils restent visibles avec leur motif. Changez de dates, ou relancez le relevé, pour les récupérer.',
    'They stay visible with the reason. Change the dates, or run the scan again, to bring them back.'
  ],
  lodg_rejected_count: ['{n} écarté(s)', '{n} set aside'],
  lodg_rejected_jump: ['{n} écarté(s), listé(s) plus bas', '{n} set aside, listed below'],
  /** Libellés courts posés sur la vignette. Le texte long reste sous la carte. */
  lodg_reason_gone: ['Introuvable au dernier relevé', 'Not in the last scan'],
  lodg_reason_unpriced: ['Sans tarif à ces dates', 'No price for these dates'],
  lodg_reason_other_dates: ['Tarif d’autres dates', 'Price from other dates'],
  /** Donnée qui explique le motif : les dates réellement tarifées. */
  lodg_reason_priced_for: ['Tarif relevé pour {d}', 'Price recorded for {d}'],
  lodg_reason_stay_asked: ['Séjour demandé : {d}', 'Stay requested: {d}'],
  lodg_dist_to_runs: ['{n} m des pistes', '{n} m from the runs'],
  lodg_src_hidden: ['masquée', 'hidden'],
  lodg_free_cancel: ['Annulation gratuite uniquement', 'Free cancellation only'],
  sources_label: ['Sources', 'Sources'],
  // --- Panneau « État du relevé » ------------------------------------------
  scan_running: ['Relevé en cours…', 'Search running…'],
  scan_auto_on_open: [
    'Relevé automatique à l’ouverture de l’écran',
    'Automatic search when the screen opens'
  ],
  scan_sources_uptodate: ['Les {n} sources sont à jour', 'All {n} sources are up to date'],
  scan_sources_partial: ['{ok} source(s) sur {n} à jour', '{ok} of {n} sources up to date'],
  scan_unreachable: ['injoignable :', 'unreachable:'],
  scan_over_48h: ['relevé de plus de 48 h :', 'recorded over 48 h ago:'],
  scan_median: ['médiane du domaine', 'resort median'],
  scan_merge_dupes: ['Fusionner les doublons', 'Merge duplicates'],
  scan_dupes_merged: ['{n} doublon(s) fusionné(s)', '{n} duplicate(s) merged'],
  scan_no_dupes: ['aucun doublon', 'no duplicates'],
  geo_positions_tally: [
    '{n} position(s) · {v} publiée(s) par la source, {e} déduite(s)',
    '{n} position(s) · {v} published by the source, {e} inferred'
  ],
  geo_bad_tally: [
    '⚠ {n} position(s) invraisemblable(s) — plan d’eau, pleine montagne ou hors périmètre',
    '⚠ {n} implausible position(s) — water, open mountain or outside the area'
  ],
  geo_warn_tally: [
    '{n} position(s) douteuse(s) — fond de vallée, ou aucun bâtiment cartographié à proximité',
    '{n} doubtful position(s) — valley floor, or no mapped building nearby'
  ],
  geo_waiting_tally: ['{n} position(s) en cours de vérification…', '{n} position(s) being checked…'],
  geo_hide_bad: ['Masquer les positions invraisemblables', 'Hide implausible positions'],
  geo_recheck: ['Revérifier les positions', 'Re-check the positions'],
  geo_rechecking: ['Vérification…', 'Checking…'],
  geo_panel_note: [
    'Altitudes issues du modèle d’élévation Open-Meteo ; plan d’eau et bâti d’OpenStreetMap. Une position déduite est placée autour du front de neige, jamais à l’adresse réelle du bien — elle sert à situer, pas à s’y rendre.',
    'Altitudes from the Open-Meteo elevation model; water and buildings from OpenStreetMap. An inferred position is placed around the snow front, never at the property’s real address — it locates, it does not guide.'
  ],
  tracking_quiet_hours: ['Ne pas notifier entre 22 h et 8 h', 'No notifications between 10 pm and 8 am'],
  tracking_quiet_hours_short: [
    'pas de notification entre 22 h et 8 h',
    'no notifications between 10 pm and 8 am'
  ],

  lodgmap_hint: [
    '● prix tout compris — cliquez une bulle pour remonter le logement en tête de liste',
    '● all-in price — click a bubble to move that stay to the top of the list'
  ],
  lodg_picked_on_map: ['Choisi sur la carte', 'Picked on the map'],
  lodg_picked_banner: [
    'Choisi sur la carte : {n} — remonté en tête de liste',
    'Picked on the map: {n} — moved to the top of the list'
  ],
  lodg_picked_clear: ['retirer la mise en avant', 'remove the highlight'],
  lodg_source_toggle: ['Afficher / masquer cette source', 'Show / hide this source'],
  lodg_sources_note: [
    'Une bulle pleine est une source affichée. Cliquez-la pour masquer ses offres ; le décompte reste visible.',
    'A filled bubble is a source being shown. Click it to hide its offers; the count stays visible.'
  ],
  lodg_prefilled_search: ['Recherche pré-remplie sur le site', 'Pre-filled search on the site'],
  lodg_official_site: ['Site officiel de la station', 'Resort’s official site'],
  lodg_official_unverified: ['non vérifié', 'unverified'],
  lodg_rate_grid: ['Tarifs de la centrale', 'Booking centre rates'],
  lodg_rate_grid_note: [
    'Un tarif par occupation, relevé sur la fiche aux dates du séjour. La ligne mise en avant est celle de votre groupe.',
    'One rate per occupancy, read on the listing for your stay dates. The highlighted row is your group’s.'
  ],
  lodg_rate_guests: ['{n} pers.', '{n} guests'],
  lodg_rate_yours: ['votre groupe', 'your group'],
  lodg_rooms_count: ['{n} pièces', '{n} rooms'],
  lodg_rooms_count_one: ['{n} pièce', '{n} room'],
  // --- Réglages : observabilité des sources --------------------------------
  metrics_title: ['Observabilité des sources', 'Source observability'],
  metrics_help: [
    'Latence moyenne, taux d’offres tarifées et erreurs depuis le démarrage — pour diagnostiquer sans ouvrir la console.',
    'Average latency, share of priced offers and errors since start-up — to diagnose without opening the console.'
  ],
  metrics_reset: ['Réinitialiser les compteurs', 'Reset the counters'],
  metrics_none: [
    'Aucun relevé pour l’instant — lancez une recherche logements.',
    'No reading yet — run a stays search.'
  ],

  // --- Onboarding ----------------------------------------------------------
  onb_summary: [
    'Je cherche un appart pour {w} à {p}, du {f} au {t}',
    'Looking for a place for {w} in {p}, {f} → {t}'
  ],
  onb_arrival_label: ['Date d’arrivée', 'Arrival date'],
  onb_departure_label: ['Date de départ', 'Departure date'],
  onb_station_unknown: [
    'Station introuvable dans le référentiel — vous pourrez la choisir plus tard.',
    'Resort not found in the reference list — you can pick it later.'
  ],

  // --- Écran Décision : postes de coût et répartition ----------------------
  decision_lodging_sub: [
    '{l} · {n} nuits · réparti au nombre de personnes',
    '{l} · {n} nights · split by head count'
  ],
  decision_rental_label: ['Location de matériel', 'Equipment rental'],
  decision_option_off: ['option désactivée', 'option turned off'],
  decision_lessons_sub: [
    '{n} inscrit(s), formule par voyageur',
    '{n} enrolled, per-traveller package'
  ],
  decision_route_sub: [
    '{n} foyer(s) · carburant {f} · péages {t}',
    '{n} household(s) · fuel {f} · tolls {t}'
  ],
  decision_share_rental: ['matériel {p}', 'equipment {p}'],
  decision_share_even: ['à parts égales', 'an even split'],
  decision_share_above: ['+{d} € au-dessus d’un partage égal', '+{d} € above an even split'],
  decision_share_below: ['{d} € sous un partage égal', '{d} € below an even split'],

  // --- Écran Logements : relevé, état, listes vides ------------------------
  lodg_geo_bad_positions: ['{n} position(s) à corriger', '{n} position(s) to fix'],
  lodg_src_unavailable: ['{s} : temporairement indisponible', '{s}: temporarily unavailable'],
  lodg_src_no_result: ['{s} : pas de résultat', '{s}: no result'],
  lodg_altitudes_measured: ['altitudes mesurées', 'measured altitudes'],
  lodg_back_to_domains: ['← Retour aux domaines', '← Back to resorts'],
  /** En-tête de contexte de l'écran Logements : la station cherchée, puis les
   *  critères du séjour en jetons. */
  lodg_ctx_eyebrow: ['Logements à', 'Stays in'],
  lodg_ctx_dates: ['Séjour', 'Stay'],
  lodg_ctx_group: ['Groupe', 'Group'],
  /** Bandeau de séjour, en pied de l'écran Logements. */
  lodg_keep: ['Retenir ce logement', 'Keep this stay'],
  lodg_kept: ['Logement retenu', 'Stay kept'],
  stay_kept: ['Logement retenu', 'Stay kept'],
  stay_cheapest: ['Le moins cher — rien de retenu', 'Cheapest — nothing kept yet'],
  stay_total_scope: [
    'logement {l} · forfaits {f} · route {r}',
    'stay {l} · passes {f} · travel {r}'
  ],
  stay_share: ['Partager le récap', 'Share the recap'],
  stay_compare: ['Comparer & trancher', 'Compare & decide'],
  /** Récapitulatif de séjour, à copier ou à envoyer. */
  stay_recap_title: ['Récapitulatif du séjour', 'Stay recap'],
  stay_recap_help: [
    'Texte prêt à coller dans un message. Les montants sont ceux affichés à l’écran.',
    'Plain text, ready to paste. Amounts are the ones shown on screen.'
  ],
  stay_recap_lodging: ['Logement', 'Stay'],
  stay_recap_link: ['Annonce', 'Listing'],
  stay_recap_costs: ['Coûts', 'Costs'],
  stay_recap_c_lodging: ['Logement', 'Lodging'],
  stay_recap_c_passes: ['Forfaits', 'Lift passes'],
  stay_recap_c_route: ['Route', 'Travel'],
  stay_recap_c_rental: ['Matériel', 'Rental'],
  stay_recap_c_lessons: ['Cours', 'Lessons'],
  stay_recap_total: ['Total', 'Total'],
  stay_recap_per_head: ['par personne', 'per person'],
  stay_recap_no_lodging: [
    'Aucun logement retenu pour l’instant.',
    'No stay kept yet.'
  ],
  stay_recap_copy: ['Copier le récap', 'Copy recap'],
  stay_recap_copied: ['Copié', 'Copied'],
  stay_recap_mail: ['Envoyer par e-mail', 'Send by e-mail'],
  /** Parcours replié, sur fenêtre étroite. */
  nav_journey_jump: ['Aller à', 'Go to'],
  lodg_stay_cost: ['Coût du séjour', 'Stay cost'],
  /** Ce que couvre le montant de la barre de contexte : rien de plus. */
  /** Postes couverts par le total de la barre de contexte. `sejourCost.total`
   *  additionne logement, forfaits, route, et — si les options sont cochées —
   *  matériel et cours : la légende doit les nommer, sinon le montant ment. */
  lodg_stay_cost_scope: [
    'logement + forfaits + route',
    'stay + passes + drive'
  ],
  lodg_stay_cost_scope_opts: [
    'logement + forfaits + route + matériel/cours',
    'stay + passes + drive + gear/lessons'
  ],
  /** Rappelle sur quel logement le total est calculé quand on n'en a retenu
   *  aucun : le moins cher de ceux qui ont un prix relevé. */
  lodg_stay_cost_cheapest: ['sur le logement le moins cher', 'on the cheapest stay'],
  lodg_travelers_count: ['{n} voyageur(s)', '{n} traveller(s)'],
  lodg_rooms_min: ['{n} chambre(s) min', '{n} room(s) min'],
  // Calendrier de plage du séjour (StayDatesField). Les noms de mois et de
  // jours viennent d'Intl, pas du catalogue.
  stay_edit_dates: ['Modifier les dates du séjour', 'Change stay dates'],
  stay_pick_arrival: ['Choisissez votre jour d’arrivée', 'Pick your arrival day'],
  stay_pick_departure: ['…puis votre jour de départ', '…then your departure day'],
  stay_prev_month: ['Mois précédent', 'Previous month'],
  stay_next_month: ['Mois suivant', 'Next month'],
  stay_snap_week: ['Caler sur la semaine {a} → {b}', 'Snap to the {a} → {b} week'],
  stay_sat_note: [
    'Les centrales de station vendent surtout du samedi au samedi — jours marqués d’un point.',
    'Resort booking desks mostly sell Saturday to Saturday — dotted days.'
  ],
  // Le repos du réglage « chambres minimum » : il descend jusqu'au studio, qui
  // n'a aucune chambre et qu'aucun seuil ne peut donc retenir.
  lodg_rooms_studio: ['studio', 'studio'],
  lodg_rooms_any: ['sans minimum (studios inclus)', 'no minimum (studios included)'],
  lodg_criteria_order: [
    'Dates et groupe : la centrale de station répond en premier (prix datés), puis les autres sources.',
    'Dates and party: the resort booking centre answers first (dated prices), then the other sources.'
  ],
  lodg_reset_filters_title: [
    'Réinitialiser les filtres de l’écran Logements',
    'Reset the Stays screen filters'
  ],
  lodg_hidden_by_filters: [
    '{n} masqué(s) par les filtres — tout afficher',
    '{n} hidden by the filters — show all'
  ],
  lodg_open_on: ['Ouvrir sur', 'Open on'],
  lodg_also_on: ['aussi sur {s}', 'also on {s}'],
  access_no_engine: [
    'Moteur local non démarré : aucune distance aux pistes ne peut être calculée, pour aucune annonce. Réglages → Moteur local → Redémarrer.',
    'Local engine not running: no distance to the slopes can be computed, for any listing. Settings → Local engine → Restart.'
  ],
  access_no_engine_domain: [
    'Ce domaine n’est pas rapproché du moteur local : il a été importé sans ses tracés, ou sous un autre nom.',
    'This resort is not matched to the local engine: it was imported without its runs, or under another name.'
  ],
  access_no_position: [
    'Cette annonce n’a pas de position exploitable : la source ne l’a pas publiée. Ouvrez-la sur {s} pour sa localisation exacte.',
    'This listing carries no usable position: the source did not publish one. Open it on {s} for its exact location.'
  ],
  access_not_yet: [
    'Distance aux pistes non calculée pour cette annonce. Relancez une recherche pour la mesurer.',
    'Distance to the slopes not computed for this listing. Run a search again to measure it.'
  ],
  lodg_status_title: ['État du relevé et des positions', 'State of the reading and the positions'],
  lodg_status_running: ['Relevé en cours…', 'Reading in progress…'],
  lodg_status_hide: ['Masquer l’état du relevé', 'Hide the reading state'],
  lodg_status_show: ['État du relevé', 'Reading state'],
  lodg_week_reference: ['référence', 'reference'],
  lodg_none_for_dates: [
    'Aucune offre pour {d} à ces dates',
    'No offer for {d} on these dates'
  ],
  lodg_run_search_hint: [
    'Lancez une recherche pour afficher les annonces tarifées, avec distance aux pistes.',
    'Run a search to show priced listings, with their distance to the slopes.'
  ],
  lodg_try_other_dates: [
    'Essayez d’autres dates ou un village voisin du même domaine.',
    'Try other dates, or a neighbouring village in the same area.'
  ],
  lodg_clear_selection: ['Vider la sélection', 'Clear the selection'],

  // --- États vides de la mosaïque ----------------------------------------
  // Deux situations opposées : des annonces existent mais les filtres les
  // écartent toutes, ou il n'y a rien à montrer. Les libellés restent
  // distincts pour ne pas envoyer relancer une recherche qui rapporterait des
  // annonces tout aussi invisibles.
  lodg_empty_hidden_title: [
    '{n} offre(s) masquée(s) par vos filtres',
    '{n} offer(s) hidden by your filters'
  ],
  lodg_empty_hidden_hint: [
    'Budget, distance aux pistes ou type de bien : un critère écarte toute la liste pour {d}.',
    'Budget, distance to the slopes or property type: one criterion rules out the whole list for {d}.'
  ],
  lodg_change_dates: ['Changer les dates', 'Change the dates'],
  lodg_search_listings: ['Rechercher des annonces', 'Search for listings'],
  lodg_open_central: ['Ouvrir la centrale', 'Open the booking centre'],

  // --- Fiche logement : ce qui a été relevé ------------------------------
  sheet_verified_title: ['Ce que Skitrack a vérifié', 'What Skitrack checked'],
  sheet_verified_dates: ['Dates du relevé', 'Dates of the reading'],
  sheet_dates_differ: ['dates de recherche différentes', 'different search dates'],
  sheet_dates_match: ['alignées sur votre séjour', 'matching your stay'],
  sheet_ski_access: ['Accès pistes', 'Slope access'],
  sheet_price_from: ['À partir de {p}', 'From {p}'],
  sheet_price_confirmed: ['confirmé pour vos dates', 'confirmed for your dates'],
  sheet_price_confirmed_these: ['confirmé pour ces dates', 'confirmed for these dates'],
  sheet_price_teaser: ['à partir de (tarif d’appel)', 'starting price (teaser rate)'],
  sheet_teaser_rate: ['tarif d’appel', 'teaser rate'],
  sheet_price_to_confirm: ['à confirmer sur le site', 'to be confirmed on the site'],
  sheet_price_unpublished: [
    'non publié — ouverture de la source pour le tarif',
    'not published — open the source for the rate'
  ],
  sheet_origin_default: ['le départ', 'the departure point'],
  sheet_tolls: ['péages {p}', 'tolls {p}'],
  sheet_no_tolls: ['sans péage', 'toll-free'],

  lodg_official_unverified_note: [
    'Adresse déduite : l’hôte existe mais n’a pas répondu à la vérification.',
    'Inferred address: the host exists but did not answer the check.'
  ],
  lodg_station_query: [
    'Recherché sous « {n} » — le nom de la station, celui que les sites de réservation reconnaissent.',
    'Searched as “{n}” — the resort name, the one booking sites recognise.'
  ],
  kids_count_note: [
    'Compte pour les forfaits (tarif enfant), le matériel et les cours ESF.',
    'Counts for passes (child rate), equipment and ski-school lessons.'
  ],
  walk_dist_note: [
    'À pied, dénivelé compté — 300 m à plat ≠ 300 m avec 60 m de montée skis à l’épaule.',
    'On foot, vertical included — 300 m flat ≠ 300 m with a 60 m climb carrying skis.'
  ],
  deeplinks_note: [
    'URL construites depuis vos critères. Une annonce vous plaît ? Importez-la pour la comparer ici.',
    'URLs built from your criteria. Found a listing you like? Import it to compare it here.'
  ],
  lodg_filters_reset: ['Réinitialiser les filtres', 'Reset the filters'],

  // --- Écran Logements ----------------------------------------------------
  lodg_no_domain: ['Aucun domaine dans le référentiel.', 'No resort in the reference file.'],
  lodg_dates_invalid: [
    'Indiquez une arrivée et un départ valides (arrivée avant départ).',
    'Enter a valid check-in and check-out (check-in before check-out).'
  ],
  lodg_see_imported: ['Voir les logements déjà importés', 'View stays already imported'],
  lodg_awaiting_scan: ['En attente du relevé…', 'Waiting for the scan…'],
  lodg_recheck_again: ['Revérifier à nouveau ↗', 'Check again ↗'],
  lodg_rescan: ['Relancer le relevé', 'Run the scan again'],

  // --- Fiche logement -----------------------------------------------------
  lodg_no_photo: ['offre simulée — sans photo', 'simulated offer — no photo'],
  fee_cleaning: ['Frais de ménage', 'Cleaning fee'],
  fee_stay_tax: ['Taxe de séjour', 'Tourist tax'],
  geocode_pending: ['Localisation de l’adresse…', 'Locating the address…'],
  geocode_done: ['Adresse localisée — trajets calculables.', 'Address located — travel times available.'],
  geocode_none: [
    'Adresse non localisée : sans elle, ni temps de route, ni péage, ni carburant.',
    'Address not located: without it, no drive time, no tolls, no fuel.'
  ],
  access_by_car: ['Route depuis chez vous', 'Drive from home'],
  access_label: ['Accès', 'Access'],
  runs_on_foot: ['Pistes à pied', 'Runs on foot'],
  access_to_runs: ['Point skiable le plus proche', 'Nearest skiable point'],
  access_walk_time: ['{n} min à pied', '{n} min on foot'],
  access_drive_time: ['{n} min en voiture', '{n} min by car'],
  access_shuttle_time: ['{n} min de navette', '{n} min by shuttle'],
  access_ski_in: ['skis aux pieds', 'ski-in / ski-out'],
  access_climb: ['{n} m à remonter', '{n} m to climb'],
  access_descent: ['{n} m à redescendre', '{n} m downhill'],
  access_flat: ['de plain-pied', 'level'],
  access_mode: ['Comment on y va', 'How you get there'],
  access_mode_ski: ['skis aux pieds', 'ski-in / ski-out'],
  access_mode_shuttle: ['navette', 'shuttle'],
  access_mode_car: ['voiture', 'car'],
  access_mode_unknown: ['non déterminé', 'undetermined'],
  access_walk_note: [
    'Distance et dénivelé sont mesurés à vol d’oiseau sur les tracés OpenSkiMap. Le temps est une estimation : 50 m/min à pied, 25 km/h sur les routes de station plus 5 min pour sortir et garer la voiture. L’attente d’une navette n’y est pas comptée.',
    'Distance and climb are measured as the crow flies on OpenSkiMap traces. The time is an estimate: 50 m/min on foot, 25 km/h on resort roads plus 5 min to get the car out and park. Shuttle waiting time is not included.'
  ],
  nearest_lift: ['Remontée la plus proche', 'Nearest lift'],
  full_stay_cost: ['Coût complet du séjour', 'Full cost of the stay'],
  rental_6days: ['Matériel de location — 6 jours', 'Rental equipment — 6 days'],
  rental_option: [
    'Ajouter le matériel de location (96 €/adulte, 58 €/enfant)',
    'Add rental equipment (€96/adult, €58/child)'
  ],

  // --- Premier lancement, voyageurs ---------------------------------------
  welcome_sub: [
    'Trois réglages pour personnaliser toutes les recherches — modifiables à tout moment dans les filtres.',
    'Three settings to tailor every search — changeable at any time in the filters.'
  ],
  your_stay: ['Votre séjour', 'Your stay'],
  start_point_car: ['Point de départ (trajets voiture)', 'Starting point (driving times)'],
  theme_label: ['Thème', 'Theme'],
  travelers_departures: ['Voyageurs et départs', 'Travellers and departures'],
  the_departures: ['Les départs', 'The departures'],
  add_departure: ['＋ Ajouter un départ', '＋ Add a departure'],
  reset_lower: ['réinitialiser', 'reset'],

  // --- Filtres : foyers ---------------------------------------------------
  households_note: [
    'Plusieurs foyers : filtre et tri sur le foyer le plus éloigné, route comptée pour chaque voiture.',
    'Several households: filtering and sorting use the farthest one, and the drive is counted per car.'
  ],
  manage_travelers: ['+ Gérer les voyageurs et les départs', '+ Manage travellers and departures'],
  no_household: ['Aucun foyer au départ.', 'No household set as departure.'],

  // --- Import d'annonce ---------------------------------------------------
  import_no_request: ['aucune requête', 'no request'],
  import_refused: ['Lecture automatique refusée', 'Automated read refused'],
  import_bookmarklet: ['Ou marque-page (recommandé)', 'Or bookmarklet (recommended)'],
  import_open_search: [
    'Ouvrez la recherche Airbnb du domaine, déjà pré-remplie avec vos dates.',
    'Open the resort’s Airbnb search, already pre-filled with your dates.'
  ],
  import_scroll_then_click: [
    'Sur la page de résultats, faites défiler pour charger les annonces, puis cliquez le marque-page',
    'On the results page, scroll to load the listings, then click the bookmarklet'
  ],

  // --- Divers écrans ------------------------------------------------------
  pass_day_adult: ['Journée adulte', 'Adult day pass'],
  pass_per_ski_day: ['Coût / jour skié', 'Cost per ski day'],
  pass_details: ['Détail des forfaits', 'Pass details'],
  map_lift: ['remontée mécanique', 'ski lift'],
  map_clicked_first: ['cliquée — remonte en tête de liste', 'clicked — moves to the top of the list'],
  iso_needs_engine: [
    'Les isochrones demandent le moteur local et une clé OpenRouteService.',
    'Isochrones require the local engine and an OpenRouteService key.'
  ],
  geo_all_consistent: [
    'Toutes les positions sont cohérentes avec le relief de la station.',
    'Every position is consistent with the resort’s terrain.'
  ],
  geo_osm_unavailable: [
    'Plan d’eau et bâti non vérifiés : Overpass est injoignable. Les altitudes, elles, sont relevées.',
    'Water and buildings unchecked: Overpass is unreachable. Elevations were still recorded.'
  ],
  decision_none: ['Aucune décision enregistrée', 'No decision recorded'],
  decision_cost_by_item: ['Le coût, poste par poste', 'The cost, item by item'],
  decision_cancel: ['Annuler la décision', 'Cancel the decision'],
  offers_total_cost: ['Coût total du séjour', 'Total cost of the stay'],
  offers_empty_hint: [
    'Augmentez le budget total, réduisez le nombre de voyageurs ou assouplissez les filtres de domaines.',
    'Raise the total budget, reduce the number of travellers, or relax the resort filters.'
  ],
  alert_threshold: ['Seuil de déclenchement', 'Trigger threshold'],
  tracking_sub: [
    'relevé toutes les heures · notification Windows en cas de baisse ≥ 5 % ou de nouvelle disponibilité',
    'checked hourly · Windows notification on a drop of 5% or more, or new availability'
  ],
  tracking_note: [
    'Le relevé continue toutes les heures dans tous les cas ; seul l’affichage des notifications change.',
    'The hourly check runs either way; only how notifications are shown changes.'
  ],
  copy_summary: ['Copier le récapitulatif', 'Copy the summary'],
  back_to_results: ['← Retour aux résultats', '← Back to results'],
  dist_not_computed: [
    'Distance aux pistes non calculée — nécessite le moteur local.',
    'Distance to the runs not computed — needs the local engine.'
  ],
  map_search_on_move: ['Rechercher quand je déplace la carte', 'Search when I move the map'],
  offers_found: ['offres relevées', 'offers recorded'],

  // --- Import et suivi ----------------------------------------------------
  import_url_label: ['URL de l’annonce', 'Listing URL'],
  import_open_browser: ['Ouvrir l’annonce dans le navigateur', 'Open the listing in the browser'],
  import_total_price: ['Prix total tout compris (€)', 'Total all-in price (€)'],
  paste_step_1: [
    'Sur la page Airbnb qui vient de s’ouvrir, cliquez le marque-page',
    'On the Airbnb page that just opened, click the bookmarklet'
  ],
  paste_step_2: [
    'puis revenez ici : l’import se fera tout seul.',
    'then come back here: the import happens on its own.'
  ],
  tracking_empty: ['Aucun logement suivi pour l’instant', 'No stay tracked yet'],
  today_lower: ['aujourd’hui', 'today'],
  decision_empty_hint: [
    'Choisissez une combinaison semaine + domaine depuis l’onglet Combinaisons, puis revenez ici.',
    'Pick a week + resort combination from the Combinations tab, then come back here.'
  ],

  // --- Dernières chaînes mêlées à du balisage -----------------------------
  budget_total_stay: ['Budget total du séjour', 'Total trip budget'],
  lodg_none_imported: ['Aucun logement importé pour', 'No stay imported for'],
  lodg_none_imported_yet: ['pour l’instant.', 'yet.'],
  ref_format_intro: ['Un objet JSON avec deux clés :', 'A JSON object with two keys:'],
  ref_format_domains: [
    ', la liste des domaines (identifiant, nom, massif, altitudes basse et haute, kilomètres de pistes, remontées, coordonnées), et',
    ', the list of resorts (id, name, range, base and top altitudes, kilometres of runs, lifts, coordinates), and'
  ],
  ref_format_passes: [
    ', les tarifs indexés par identifiant de domaine. Chaque domaine accepte un champ facultatif',
    ', the prices indexed by resort id. Each resort accepts an optional field'
  ],
  ref_format_logo: [
    '— l’adresse d’une image — pour afficher le vrai logo de la station. Exportez le référentiel livré pour partir d’un modèle valide.',
    '— the address of an image — to show the resort’s real logo. Export the bundled file to start from a valid template.'
  ],
  import_published_pos: ['Position publiée →', 'Published position →'],
  import_from_center: ['du centre du domaine', 'from the centre of the resort'],
  import_ingests: [
    ': l’application ingère ce que vous lui donnez.',
    ': the application ingests whatever you give it.'
  ],
  bookmarklet_drag_1: ['Le clic est désactivé ici : il faut le', 'Clicking is disabled here: you must'],
  bookmarklet_drag_2: ['glisser', 'drag it'],
  bookmarklet_drag_3: [
    'vers les favoris. Faites apparaître la barre de favoris avec Ctrl+Maj+B si besoin.',
    'to the bookmarks bar. Show the bar with Ctrl+Shift+B if needed.'
  ],

  // --- Raccourcis ---------------------------------------------------------
  kb_title: ['Raccourcis clavier', 'Keyboard shortcuts'],
  kb_browse: ['Parcourir les domaines', 'Browse the resorts'],
  kb_open: ['Ouvrir les logements', 'Open the stays'],
  kb_filters: ['Afficher / masquer les filtres', 'Show / hide the filters'],
  kb_map: ['Afficher / masquer la carte', 'Show / hide the map'],
  kb_close: ['Fermer fiche / comparateur', 'Close details / comparison'],
  kb_enter: ['Entrée', 'Enter'],
  kb_esc: ['Échap', 'Esc'],

  // --- Carte --------------------------------------------------------------
  map_isochrones: ['Isochrones', 'Isochrones'],
  map_isochrones_compute: ['Afficher les zones de temps de trajet', 'Show travel-time zones'],
  map_attribution: [
    '© contributeurs OpenStreetMap · OpenTopoMap (CC-BY-SA) · OpenSkiMap',
    '© OpenStreetMap contributors · OpenTopoMap (CC-BY-SA) · OpenSkiMap'
  ],
  map_fit: ['Recentrer', 'Fit to results'],

  // --- Divers -------------------------------------------------------------
  minutes: ['min', 'min'],
  hours: ['h', 'h'],
  days: ['j', 'd'],
  km: ['km', 'km'],
  meters: ['m', 'm'],
  cancel: ['Annuler', 'Cancel'],
  close: ['Fermer', 'Close'],
  loading: ['Chargement…', 'Loading…'],
  error: ['Erreur', 'Error'],
  refresh: ['actualiser', 'refresh'],
  estimated: ['estimé', 'estimated'],
  wx_sun: ['soleil', 'sun'],
  wx_cloud: ['nuageux', 'cloudy'],
  wx_snow: ['neige', 'snow'],
  wx_rain: ['pluie', 'rain'],

  // État du ciel, tel que le rend le code WMO d'Open-Meteo.
  sky_clear: ['ciel clair', 'clear sky'],
  sky_fair: ['peu nuageux', 'fair'],
  sky_overcast: ['couvert', 'overcast'],
  sky_fog: ['brouillard', 'fog'],
  sky_rain: ['pluie', 'rain'],
  sky_snow: ['neige', 'snow'],
  sky_storm: ['orage', 'thunderstorm'],
  sky_variable: ['variable', 'variable'],
  sky_unknown: ['—', '—']
} as const satisfies Record<string, Entry>

export type TranslationKey = keyof typeof CATALOG

/** Exposé pour le test de complétude (`catalog.test.ts`), pas pour l'app. */
export const CATALOG_FOR_TEST: Record<string, readonly string[]> = CATALOG

const INDEX: Record<Language, number> = { fr: 0, en: 1 }

/**
 * La langue est-elle encore servie ?
 *
 * Le catalogue a porté sept langues et n'en porte plus que deux. Une
 * préférence enregistrée peut donc valoir `de` ou `es` : sans ce garde, elle
 * traverserait `INDEX` en `undefined` et l'interface s'afficherait dans une
 * langue qui n'existe plus.
 */
export function isLanguage(value: unknown): value is Language {
  return typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)
}

/** Traduit une clé, avec repli sur le français quand la langue manque. */
export function translate(key: TranslationKey, lang: Language): string {
  const entry = CATALOG[key] as unknown as readonly string[]
  return entry[INDEX[lang] ?? 0] || entry[0]
}

export const I18nContext = createContext<{ lang: Language; setLang: (l: Language) => void }>({
  lang: 'fr',
  setLang: () => undefined
})

export function useI18n(): {
  t: (key: TranslationKey) => string
  lang: Language
  locale: string
  setLang: (l: Language) => void
} {
  const { lang, setLang } = useContext(I18nContext)
  return { t: (key) => translate(key, lang), lang, locale: LOCALES[lang], setLang }
}

/** Formate une durée en minutes en « 4 h 25 » / « 4h 25m ». */
export function formatDuration(minutes: number | null | undefined, lang: Language): string {
  if (minutes == null) return '—'
  const h = Math.floor(minutes / 60)
  const m = Math.round(minutes % 60)
  if (h === 0) return `${m} ${translate('minutes', lang)}`
  const unit = translate('hours', lang)
  // Le français sépare l'unité des minutes (« 4 h 25 ») ; les autres langues
  // la collent au nombre d'heures, minutes suffixées.
  return lang === 'fr'
    ? `${h} ${unit} ${String(m).padStart(2, '0')}`
    : `${h}${unit} ${m}m`
}

export function formatNumber(value: number | null | undefined, lang: Language, digits = 0): string {
  if (value == null) return '—'
  return value.toLocaleString(LOCALES[lang], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  })
}
