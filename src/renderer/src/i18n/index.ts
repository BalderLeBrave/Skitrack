/**
 * i18n minimaliste, sept langues.
 *
 * Pas de bibliothèque : l'application a quelques centaines de chaînes. Le
 * catalogue est indexé **par clé** et non par langue — chaque entrée est un
 * tuple dans l'ordre `LANGUAGES`. Un dictionnaire par langue obligeait à
 * parcourir sept fichiers pour vérifier une seule formulation ; côte à côte,
 * une traduction absente ou décalée saute aux yeux.
 *
 * Une valeur manquante retombe sur le français (index 0) plutôt que d'afficher
 * la clé : une phrase dans la mauvaise langue reste lisible, `sort_by` non.
 */

import { createContext, useContext } from 'react'

export const LANGUAGES = ['fr', 'en', 'de', 'nl', 'es', 'it', 'af'] as const
export type Language = (typeof LANGUAGES)[number]

/** Libellé de chaque langue, écrit dans cette langue. */
export const LANGUAGE_LABELS: Record<Language, string> = {
  fr: 'Français',
  en: 'English',
  de: 'Deutsch',
  nl: 'Nederlands',
  es: 'Español',
  it: 'Italiano',
  af: 'Afrikaans'
}

/** Locale BCP-47 utilisée pour les dates, les nombres et les montants. */
export const LOCALES: Record<Language, string> = {
  fr: 'fr-FR',
  en: 'en-GB',
  de: 'de-DE',
  nl: 'nl-NL',
  es: 'es-ES',
  it: 'it-IT',
  af: 'af-ZA'
}

/** Une entrée du catalogue : fr, en, de, nl, es, it, af — dans cet ordre. */
type Entry = readonly [string, string, string, string, string, string, string]

const CATALOG = {
  appName: ['SKITRACK', 'SKITRACK', 'SKITRACK', 'SKITRACK', 'SKITRACK', 'SKITRACK', 'SKITRACK'],

  // --- Navigation ---------------------------------------------------------
  nav_home: ['Accueil', 'Home', 'Start', 'Start', 'Inicio', 'Home', 'Tuis'],
  nav_search: ['Domaines', 'Resorts', 'Skigebiete', 'Skigebieden', 'Dominios', 'Comprensori', 'Skigebiede'],
  nav_settings: ['Réglages', 'Settings', 'Einstellungen', 'Instellingen', 'Ajustes', 'Impostazioni', 'Instellings'],
  nav_lodgings: ['Logements', 'Stays', 'Unterkünfte', 'Verblijven', 'Alojamientos', 'Alloggi', 'Verblyf'],
  nav_offers: [
    'Meilleures offres', 'Best offers', 'Beste Angebote', 'Beste aanbiedingen',
    'Mejores ofertas', 'Migliori offerte', 'Beste aanbiedinge'
  ],
  nav_combos: ['Combinaisons', 'Combinations', 'Kombinationen', 'Combinaties', 'Combinaciones', 'Combinazioni', 'Kombinasies'],
  nav_decision: ['Décision', 'Decision', 'Entscheidung', 'Beslissing', 'Decisión', 'Decisione', 'Besluit'],
  nav_tracking: ['Suivi', 'Tracking', 'Preisverfolgung', 'Prijsopvolging', 'Seguimiento', 'Monitoraggio', 'Opvolging'],
  nav_travelers: ['Voyageurs', 'Travellers', 'Reisende', 'Reizigers', 'Viajeros', 'Viaggiatori', 'Reisigers'],

  // --- Apparence ----------------------------------------------------------
  theme_light: ['Clair', 'Light', 'Hell', 'Licht', 'Claro', 'Chiaro', 'Lig'],
  theme_dark: ['Sombre', 'Dark', 'Dunkel', 'Donker', 'Oscuro', 'Scuro', 'Donker'],
  theme_toggle: [
    'Basculer clair / sombre', 'Switch light / dark', 'Hell / dunkel umschalten', 'Licht / donker wisselen',
    'Cambiar claro / oscuro', 'Passa a chiaro / scuro', 'Wissel lig / donker'
  ],
  theme_follows: [
    'Le thème suit le curseur de la barre supérieure.',
    'The theme follows the toggle in the top bar.',
    'Das Thema folgt dem Schalter in der oberen Leiste.',
    'Het thema volgt de schakelaar in de bovenbalk.',
    'El tema sigue el interruptor de la barra superior.',
    'Il tema segue l’interruttore della barra superiore.',
    'Die tema volg die skakelaar in die boonste balk.'
  ],
  appearance: ['Apparence', 'Appearance', 'Darstellung', 'Weergave', 'Apariencia', 'Aspetto', 'Voorkoms'],
  settings_snowfall: [
    'Neige animée', 'Animated snowfall', 'Animierter Schneefall', 'Geanimeerde sneeuw',
    'Nieve animada', 'Neve animata', 'Geanimeerde sneeu'
  ],
  density: ['Densité', 'Density', 'Dichte', 'Dichtheid', 'Densidad', 'Densità', 'Digtheid'],
  density_comfortable: ['Confortable', 'Comfortable', 'Komfortabel', 'Comfortabel', 'Cómoda', 'Comoda', 'Gemaklik'],
  density_compact: ['Compacte', 'Compact', 'Kompakt', 'Compact', 'Compacta', 'Compatta', 'Kompak'],
  lang_note: [
    'Toute l’interface, les unités, les dates et les montants suivent la langue choisie. Les noms de domaines et de massifs restent en français, sauf usage établi dans la langue.',
    'The whole interface, units, dates and amounts follow the chosen language. Resort and range names stay in French unless an established local usage exists.',
    'Die gesamte Oberfläche, Einheiten, Daten und Beträge folgen der gewählten Sprache. Gebiets- und Massivnamen bleiben französisch, sofern kein etablierter Name existiert.',
    'De hele interface, eenheden, datums en bedragen volgen de gekozen taal. Namen van skigebieden en massieven blijven Frans, tenzij een gangbare naam bestaat.',
    'Toda la interfaz, las unidades, las fechas y los importes siguen el idioma elegido. Los nombres de dominios y macizos permanecen en francés, salvo uso establecido.',
    'Tutta l’interfaccia, le unità, le date e gli importi seguono la lingua scelta. I nomi di comprensori e massicci restano in francese, salvo un uso consolidato.',
    'Die hele koppelvlak, eenhede, datums en bedrae volg die gekose taal. Name van skigebiede en bergreekse bly Frans, tensy ’n gevestigde naam bestaan.'
  ],

  // --- Moteur local -------------------------------------------------------
  sidecar_starting: [
    'Démarrage du moteur local…', 'Starting local engine…', 'Lokale Engine wird gestartet…',
    'Lokale engine wordt gestart…', 'Iniciando el motor local…', 'Avvio del motore locale…',
    'Plaaslike enjin begin…'
  ],
  sidecar_ready: [
    'Moteur local prêt', 'Local engine ready', 'Lokale Engine bereit', 'Lokale engine gereed',
    'Motor local listo', 'Motore locale pronto', 'Plaaslike enjin gereed'
  ],
  sidecar_error: [
    'Le moteur local ne démarre pas', 'The local engine failed to start', 'Die lokale Engine startet nicht',
    'De lokale engine start niet', 'El motor local no arranca', 'Il motore locale non si avvia',
    'Die plaaslike enjin begin nie'
  ],
  sidecar_restart: [
    'Redémarrer le moteur', 'Restart engine', 'Engine neu starten', 'Engine herstarten',
    'Reiniciar el motor', 'Riavvia il motore', 'Herbegin die enjin'
  ],
  sidecar_log: ['Journal', 'Log', 'Protokoll', 'Logboek', 'Registro', 'Registro', 'Logboek'],

  // --- Référentiel --------------------------------------------------------
  referential_empty_title: [
    'Aucun domaine dans la base', 'No resort in the database', 'Kein Skigebiet in der Datenbank',
    'Geen skigebied in de database', 'Ningún dominio en la base', 'Nessun comprensorio nel database',
    'Geen skigebied in die databasis'
  ],
  referential_empty_body: [
    "Importez le référentiel OpenSkiMap pour commencer. Le téléchargement fait environ 130 Mo (domaines + remontées) et n'a besoin d'être fait qu'une fois.",
    'Import the OpenSkiMap reference data to get started. The download is about 130 MB (resorts + lifts) and is only needed once.',
    'Importieren Sie die OpenSkiMap-Referenzdaten. Der Download umfasst etwa 130 MB (Gebiete + Bergbahnen) und ist nur einmal nötig.',
    'Importeer de OpenSkiMap-referentiegegevens om te beginnen. De download is ongeveer 130 MB (gebieden + liften) en hoeft maar één keer.',
    'Importe el fichero de referencia OpenSkiMap para empezar. La descarga es de unos 130 MB (dominios + remontes) y solo hace falta una vez.',
    'Importa l’archivio di riferimento OpenSkiMap per iniziare. Il download è di circa 130 MB (comprensori + impianti) ed è necessario una sola volta.',
    'Voer die OpenSkiMap-verwysingsdata in om te begin. Die aflaai is ongeveer 130 MB (gebiede + skilifte) en is net een keer nodig.'
  ],
  referential_import: [
    'Importer le référentiel', 'Import reference data', 'Referenzdaten importieren',
    'Referentiegegevens importeren', 'Importar el fichero de referencia', 'Importa l’archivio di riferimento',
    'Voer verwysingsdata in'
  ],
  referential_importing: ['Import en cours…', 'Importing…', 'Import läuft…', 'Bezig met importeren…', 'Importando…', 'Importazione…', 'Besig om in te voer…'],
  referential_with_lifts: [
    'Inclure les remontées (~107 Mo, donne l’altitude du front de neige)',
    'Include lifts (~107 MB, gives the base-station altitude)',
    'Bergbahnen einschließen (~107 MB, liefert die Höhe der Talstation)',
    'Liften meenemen (~107 MB, geeft de hoogte van het sneeuwfront)',
    'Incluir los remontes (~107 MB, da la altitud del frente de nieve)',
    'Includi gli impianti (~107 MB, fornisce la quota del fronte neve)',
    'Sluit skilifte in (~107 MB, gee die hoogte van die sneeufront)'
  ],
  referential_detect_glaciers: [
    'Détecter les glaciers (une requête Overpass)', 'Detect glaciers (one Overpass query)',
    'Gletscher erkennen (eine Overpass-Abfrage)', 'Gletsjers detecteren (één Overpass-query)',
    'Detectar los glaciares (una consulta Overpass)', 'Rileva i ghiacciai (una query Overpass)',
    'Bespeur gletsers (een Overpass-navraag)'
  ],
  referential_countries: ['Pays', 'Countries', 'Länder', 'Landen', 'Países', 'Paesi', 'Lande'],
  referential_domains_count: [
    'domaines en base', 'resorts stored', 'Gebiete in der Datenbank', 'gebieden in de database',
    'dominios en la base', 'comprensori in archivio', 'gebiede in die databasis'
  ],
  referential_title: [
    'Référentiel des domaines', 'Resort reference file', 'Referenzdatei der Skigebiete',
    'Referentiebestand van skigebieden', 'Fichero de referencia de dominios',
    'Archivio di riferimento dei comprensori', 'Verwysingslêer van skigebiede'
  ],
  referential_export: ['Exporter', 'Export', 'Exportieren', 'Exporteren', 'Exportar', 'Esporta', 'Voer uit'],
  referential_revert: [
    'Revenir au référentiel livré', 'Restore the bundled file', 'Gelieferte Datei wiederherstellen',
    'Meegeleverd bestand herstellen', 'Volver al fichero incluido', 'Ripristina l’archivio fornito',
    'Herstel die meegeleverde lêer'
  ],
  referential_import_file: [
    'Importer un fichier', 'Import a file', 'Datei importieren', 'Bestand importeren',
    'Importar un archivo', 'Importa un file', 'Voer ’n lêer in'
  ],
  referential_manage: [
    'Gérer le référentiel', 'Manage the reference file', 'Referenzdatei verwalten',
    'Referentiebestand beheren', 'Gestionar el fichero de referencia', 'Gestisci l’archivio di riferimento',
    'Bestuur die verwysingslêer'
  ],
  osm_odbl: [
    'Données © contributeurs OpenStreetMap, sous licence ODbL, via OpenSkiMap.org.',
    'Data © OpenStreetMap contributors, ODbL licence, via OpenSkiMap.org.',
    'Daten © OpenStreetMap-Mitwirkende, ODbL-Lizenz, über OpenSkiMap.org.',
    'Gegevens © OpenStreetMap-bijdragers, ODbL-licentie, via OpenSkiMap.org.',
    'Datos © colaboradores de OpenStreetMap, licencia ODbL, vía OpenSkiMap.org.',
    'Dati © contributori OpenStreetMap, licenza ODbL, via OpenSkiMap.org.',
    'Data © OpenStreetMap-bydraers, ODbL-lisensie, via OpenSkiMap.org.'
  ],

  // --- Filtres ------------------------------------------------------------
  filters: ['Filtres', 'Filters', 'Filter', 'Filters', 'Filtros', 'Filtri', 'Filters'],
  filter_altitude_min: [
    'Altitude minimum du bas des pistes', 'Minimum altitude at the base of the runs',
    'Mindesthöhe am Pistenende', 'Minimale hoogte onderaan de pistes',
    'Altitud mínima de la base de las pistas', 'Quota minima alla base delle piste',
    'Minimum hoogte by die voet van die plesiere'
  ],
  filter_altitude_min_help: [
    'Le critère le plus corrélé à la tenue de la neige. Attention : c’est le point skiable le plus bas, pas l’altitude du village.',
    'The criterion most correlated with lasting snow. Note: this is the lowest skiable point, not the village altitude.',
    'Das Kriterium mit dem stärksten Zusammenhang zur Schneesicherheit. Achtung: der tiefste befahrbare Punkt, nicht die Höhe des Ortes.',
    'Het criterium dat het meest samenhangt met sneeuwzekerheid. Let op: dit is het laagste skibare punt, niet de hoogte van het dorp.',
    'El criterio más correlacionado con la permanencia de la nieve. Atención: es el punto esquiable más bajo, no la altitud del pueblo.',
    'Il criterio più correlato alla tenuta della neve. Attenzione: è il punto sciabile più basso, non la quota del paese.',
    'Die maatstaf wat die meeste met sneeubestendigheid saamhang. Let op: dit is die laagste skibare punt, nie die hoogte van die dorp nie.'
  ],
  filter_altitude_max: [
    'Point culminant au moins à', 'Summit at least', 'Höchster Punkt mindestens', 'Hoogste punt minstens',
    'Cota máxima al menos', 'Punto più alto almeno', 'Hoogste punt minstens'
  ],
  filter_slopes_km: [
    'Kilomètres de pistes au minimum', 'Minimum kilometres of runs', 'Pistenkilometer mindestens',
    'Minimaal aantal pistekilometers', 'Kilómetros de pistas como mínimo', 'Chilometri di piste minimi',
    'Minimum kilometers plesiere'
  ],
  filter_country: ['Pays', 'Country', 'Land', 'Land', 'País', 'Paese', 'Land'],
  filter_massif: ['Massif', 'Range', 'Massiv', 'Massief', 'Macizo', 'Massiccio', 'Bergreeks'],
  filter_glacier: ['Glacier uniquement', 'Glacier only', 'Nur Gletscher', 'Alleen gletsjer', 'Solo glaciar', 'Solo ghiacciaio', 'Slegs gletser'],
  filter_linked: [
    'Domaine relié uniquement', 'Linked resorts only', 'Nur Skiverbund', 'Alleen verbonden skigebied',
    'Solo dominios enlazados', 'Solo comprensori collegati', 'Slegs verbinde skigebiede'
  ],
  filter_snowmaking: [
    'Neige de culture minimum', 'Minimum snowmaking', 'Beschneiung mindestens', 'Minimale kunstsneeuw',
    'Nieve artificial mínima', 'Innevamento minimo', 'Minimum kunssneeu'
  ],
  filter_travel: ['Trajet en voiture', 'Drive', 'Autofahrt', 'Autorit', 'Viaje en coche', 'Viaggio in auto', 'Rit met die motor'],
  filter_travel_max: [
    'Temps de trajet maximum', 'Maximum travel time', 'Maximale Fahrzeit', 'Maximale reistijd',
    'Tiempo de viaje máximo', 'Tempo di viaggio massimo', 'Maksimum reistyd'
  ],
  filter_distance_max: ['Distance maximum', 'Maximum distance', 'Maximale Entfernung', 'Maximale afstand', 'Distancia máxima', 'Distanza massima', 'Maksimum afstand'],
  filter_avoid_tolls: ['Éviter les péages', 'Avoid tolls', 'Maut vermeiden', 'Tol vermijden', 'Evitar peajes', 'Evita i pedaggi', 'Vermy tolgeld'],
  filter_forfait_max: [
    'Forfait 6 jours adulte, au plus', '6-day adult pass, at most', '6-Tage-Skipass Erwachsene, maximal',
    '6-daagse skipas volwassene, maximaal', 'Forfait de 6 días adulto, como máximo',
    'Skipass 6 giorni adulti, al massimo', '6-dag-kaartjie vir grootmense, hoogstens'
  ],
  filter_forfait_help: [
    'Tarif public haute saison du domaine relié. Les domaines sans tarif relevé sont masqués quand ce filtre est actif.',
    'Public high-season price of the linked resort. Resorts with no recorded price are hidden while this filter is on.',
    'Öffentlicher Hochsaisonpreis des Skiverbunds. Gebiete ohne erfassten Preis werden bei aktivem Filter ausgeblendet.',
    'Publieke hoogseizoenprijs van het verbonden skigebied. Gebieden zonder vastgelegde prijs worden verborgen zolang dit filter aanstaat.',
    'Tarifa pública de temporada alta del dominio enlazado. Los dominios sin tarifa registrada se ocultan cuando este filtro está activo.',
    'Prezzo pubblico di alta stagione del comprensorio collegato. I comprensori senza prezzo rilevato sono nascosti quando il filtro è attivo.',
    'Openbare hoogseisoenprys van die verbinde skigebied. Gebiede sonder ’n aangetekende prys word versteek terwyl hierdie filter aan is.'
  ],
  filter_options: ['Options', 'Options', 'Optionen', 'Opties', 'Opciones', 'Opzioni', 'Opsies'],
  filter_reset: ['Réinitialiser', 'Reset', 'Zurücksetzen', 'Herstellen', 'Restablecer', 'Reimposta', 'Herstel'],
  filter_search: ['Rechercher', 'Search', 'Suchen', 'Zoeken', 'Buscar', 'Cerca', 'Soek'],
  filter_clear_all: ['tout effacer', 'clear all', 'alles löschen', 'alles wissen', 'borrar todo', 'cancella tutto', 'vee alles uit'],
  filters_show: [
    'Afficher les filtres', 'Show filters', 'Filter anzeigen', 'Filters tonen',
    'Mostrar los filtros', 'Mostra i filtri', 'Wys filters'
  ],
  filters_hide: [
    'Masquer les filtres', 'Hide filters', 'Filter ausblenden', 'Filters verbergen',
    'Ocultar los filtros', 'Nascondi i filtri', 'Versteek filters'
  ],
  map_show: ['Afficher la carte', 'Show map', 'Karte anzeigen', 'Kaart tonen', 'Mostrar el mapa', 'Mostra la mappa', 'Wys kaart'],
  map_hide: ['Masquer la carte', 'Hide map', 'Karte ausblenden', 'Kaart verbergen', 'Ocultar el mapa', 'Nascondi la mappa', 'Versteek kaart'],
  filters_active: ['actif(s)', 'active', 'aktiv', 'actief', 'activo(s)', 'attivo(i)', 'aktief'],
  selected_pl: ['sélectionnés', 'selected', 'ausgewählt', 'geselecteerd', 'seleccionados', 'selezionati', 'gekies'],
  all_label: ['tous', 'all', 'alle', 'alle', 'todos', 'tutti', 'alles'],
  none_fem: ['aucune', 'none', 'keine', 'geen', 'ninguna', 'nessuna', 'geen'],
  linked_short: ['relié', 'linked', 'Verbund', 'verbonden', 'enlazado', 'collegato', 'verbind'],

  // --- Filtres en plage ----------------------------------------------------
  // Les intitulés sont neutres : les deux bornes se règlent, « au minimum » ou
  // « au plus » décrirait la moitié du contrôle. La valeur de la plage se lit
  // sur la seconde ligne de l'en-tête.
  filter_km_range: [
    'Kilomètres de pistes', 'Kilometres of runs', 'Pistenkilometer', 'Pistekilometers',
    'Kilómetros de pistas', 'Chilometri di piste', 'Kilometers plesiere'
  ],
  filter_travel_range: [
    'Temps de trajet', 'Travel time', 'Fahrzeit', 'Reistijd', 'Tiempo de viaje', 'Tempo di viaggio', 'Reistyd'
  ],
  filter_dist_range: ['Distance', 'Distance', 'Entfernung', 'Afstand', 'Distancia', 'Distanza', 'Afstand'],
  filter_pass_range: [
    'Forfait 6 jours adulte', '6-day adult pass', '6-Tage-Skipass Erwachsene', '6-daagse skipas volwassene',
    'Forfait de 6 días adulto', 'Skipass 6 giorni adulti', '6-dag-kaartjie vir grootmense'
  ],
  filter_lodg_budget_range: [
    'Budget du séjour', 'Stay budget', 'Budget des Aufenthalts', 'Budget van het verblijf',
    'Presupuesto de la estancia', 'Budget del soggiorno', 'Begroting vir die verblyf'
  ],
  filter_lodg_dist_range: [
    'Distance aux pistes', 'Distance to the runs', 'Entfernung zu den Pisten', 'Afstand tot de pistes',
    'Distancia a las pistas', 'Distanza dalle piste', 'Afstand na die plesiere'
  ],
  range_no_limit: ['sans limite', 'no limit', 'ohne Limit', 'geen limiet', 'sin límite', 'senza limite', 'geen limiet'],
  range_low: ['Borne basse', 'Lower bound', 'Untere Grenze', 'Ondergrens', 'Límite inferior', 'Limite inferiore', 'Ondergrens'],
  range_high: ['Borne haute', 'Upper bound', 'Obere Grenze', 'Bovengrens', 'Límite superior', 'Limite superiore', 'Bogrens'],
  range_all_altitudes: [
    'toutes altitudes', 'all altitudes', 'alle Höhen', 'alle hoogtes', 'todas las altitudes', 'tutte le quote', 'alle hoogtes'
  ],
  range_all_summits: [
    'tous sommets', 'all summits', 'alle Gipfel', 'alle toppen', 'todas las cotas', 'tutte le vette', 'alle pieke'
  ],
  range_all_sizes: [
    'toutes tailles', 'all sizes', 'alle Größen', 'alle groottes', 'todos los tamaños', 'tutte le dimensioni', 'alle groottes'
  ],
  range_all_travels: [
    'tous trajets', 'any travel time', 'alle Fahrzeiten', 'alle reistijden', 'todos los viajes', 'tutti i viaggi', 'enige reistyd'
  ],
  range_all_distances: [
    'toutes distances', 'any distance', 'alle Entfernungen', 'alle afstanden', 'todas las distancias', 'tutte le distanze', 'enige afstand'
  ],
  range_all_prices: [
    'tous tarifs', 'any price', 'alle Preise', 'alle prijzen', 'todas las tarifas', 'tutti i prezzi', 'enige prys'
  ],
  range_all_offers: [
    'toutes les offres', 'all offers', 'alle Angebote', 'alle aanbiedingen', 'todas las ofertas', 'tutte le offerte', 'alle aanbiedinge'
  ],
  range_all_lodg_distances: [
    'toutes les distances', 'all distances', 'alle Entfernungen', 'alle afstanden',
    'todas las distancias', 'tutte le distanze', 'alle afstande'
  ],
  chip_base: ['Bas', 'Base', 'Pistenende', 'Onderkant', 'Base', 'Base', 'Voet'],
  chip_summit: ['Sommet', 'Summit', 'Gipfel', 'Top', 'Cota', 'Vetta', 'Piek'],
  chip_km: ['Pistes', 'Runs', 'Pisten', 'Pistes', 'Pistas', 'Piste', 'Plesiere'],
  chip_travel: ['Trajet', 'Drive', 'Fahrt', 'Rit', 'Viaje', 'Viaggio', 'Rit'],
  chip_dist: ['Distance', 'Distance', 'Entfernung', 'Afstand', 'Distancia', 'Distanza', 'Afstand'],
  chip_pass: ['Forfait', 'Pass', 'Skipass', 'Skipas', 'Forfait', 'Skipass', 'Kaartjie'],

  // --- Cadrage de la carte des domaines ------------------------------------
  dom_out_of_view: [
    '{n} domaine(s) hors du cadrage', '{n} resort(s) outside the view',
    '{n} Gebiet(e) außerhalb des Ausschnitts', '{n} skigebied(en) buiten beeld',
    '{n} dominio(s) fuera del encuadre', '{n} comprensorio/i fuori inquadratura',
    '{n} skigebied(e) buite die aansig'
  ],
  dom_view_all: ['tout voir', 'show all', 'alle anzeigen', 'alles tonen', 'ver todo', 'mostra tutto', 'wys alles'],

  // --- Étiquettes dérivées de la vignette de domaine -----------------------
  tag_common_pass: ['Forfait commun :', 'Shared pass:', 'Gemeinsamer Skipass:', 'Gedeelde skipas:', 'Forfait común:', 'Skipass comune:', 'Gedeelde kaartjie:'],
  tag_large_area: ['Grand domaine', 'Large area', 'Großes Gebiet', 'Groot gebied', 'Dominio grande', 'Grande comprensorio', 'Groot gebied'],
  tag_high_altitude: ['Haute altitude', 'High altitude', 'Hochgelegen', 'Hooggelegen', 'Gran altitud', 'Alta quota', 'Hooggeleë'],
  tag_moderate_pass: ['Forfait modéré', 'Moderate pass', 'Günstiger Skipass', 'Betaalbare skipas', 'Forfait moderado', 'Skipass contenuto', 'Bekostigbare kaartjie'],
  tag_verified: ['vérifié', 'verified', 'geprüft', 'geverifieerd', 'verificado', 'verificato', 'geverifieer'],
  of_runs: ['de pistes', 'of runs', 'Pisten', 'pistes', 'de pistas', 'di piste', 'plesiere'],
  geo_from: ['de', 'from', 'von', 'van', 'de', 'da', 'van'],

  // --- Accueil -------------------------------------------------------------
  home_badge: [
    '{n} domaines vérifiés · {m} massifs', '{n} verified resorts · {m} ranges',
    '{n} geprüfte Gebiete · {m} Massive', '{n} geverifieerde gebieden · {m} massieven',
    '{n} dominios verificados · {m} macizos', '{n} comprensori verificati · {m} massicci',
    '{n} geverifieerde gebiede · {m} bergreekse'
  ],
  home_title_1: [
    'Le séjour au ski,', 'The ski trip,', 'Der Skiurlaub,', 'De skivakantie,',
    'La estancia de esquí,', 'La settimana bianca,', 'Die skivakansie,'
  ],
  home_title_2: [
    'prix réels compris.', 'real prices included.', 'echte Preise inbegriffen.',
    'echte prijzen inbegrepen.', 'precios reales incluidos.', 'prezzi reali compresi.',
    'werklike pryse ingesluit.'
  ],
  home_lead: [
    'Forfaits relevés station par station, logements agrégés sur trois sources, trajet et dépenses du groupe additionnés. Aucun score opaque.',
    'Passes recorded resort by resort, stays aggregated from three sources, travel and group costs added up. No opaque score.',
    'Skipässe Gebiet für Gebiet erfasst, Unterkünfte aus drei Quellen gebündelt, Fahrt und Gruppenkosten addiert. Kein undurchsichtiger Score.',
    'Skipassen per gebied vastgelegd, verblijven uit drie bronnen samengebracht, rit en groepskosten opgeteld. Geen ondoorzichtige score.',
    'Forfaits registrados estación por estación, alojamientos agregados de tres fuentes, viaje y gastos del grupo sumados. Ninguna puntuación opaca.',
    'Skipass rilevati comprensorio per comprensorio, alloggi aggregati da tre fonti, viaggio e spese del gruppo sommati. Nessun punteggio opaco.',
    'Kaartjies gebied vir gebied aangeteken, verblyf uit drie bronne saamgevoeg, rit en groepkoste bymekaargetel. Geen ondeursigtige telling nie.'
  ],
  home_search_placeholder: [
    'Chamonix, Val Thorens, Les Angles…', 'Chamonix, Val Thorens, Les Angles…',
    'Chamonix, Val Thorens, Les Angles…', 'Chamonix, Val Thorens, Les Angles…',
    'Chamonix, Val Thorens, Les Angles…', 'Chamonix, Val Thorens, Les Angles…',
    'Chamonix, Val Thorens, Les Angles…'
  ],
  home_cta: [
    'Comparer les domaines →', 'Compare the resorts →', 'Skigebiete vergleichen →',
    'Skigebieden vergelijken →', 'Comparar los dominios →', 'Confronta i comprensori →',
    'Vergelyk die skigebiede →'
  ],
  home_sc_large: ['Grands domaines', 'Large areas', 'Große Gebiete', 'Grote gebieden', 'Dominios grandes', 'Grandi comprensori', 'Groot gebiede'],
  home_sc_large_title: [
    '200 km de pistes ou plus', '200 km of runs or more', '200 Pistenkilometer oder mehr',
    '200 km pistes of meer', '200 km de pistas o más', '200 km di piste o più', '200 km plesiere of meer'
  ],
  home_sc_high: ['Haute altitude', 'High altitude', 'Hochgelegen', 'Hooggelegen', 'Gran altitud', 'Alta quota', 'Hooggeleë'],
  home_sc_high_title: [
    'Bas des pistes à 1 800 m ou plus', 'Base of the runs at 1,800 m or higher',
    'Pistenende auf 1 800 m oder höher', 'Onderkant pistes op 1 800 m of hoger',
    'Base de las pistas a 1 800 m o más', 'Base delle piste a 1 800 m o più',
    'Voet van die plesiere op 1 800 m of hoër'
  ],
  home_sc_cheap: [
    'Forfait sous 260 €', 'Pass under €260', 'Skipass unter 260 €', 'Skipas onder € 260',
    'Forfait por debajo de 260 €', 'Skipass sotto 260 €', 'Kaartjie onder €260'
  ],
  home_sc_cheap_title: [
    'Forfait 6 jours adulte à 260 € ou moins', '6-day adult pass at €260 or less',
    '6-Tage-Skipass Erwachsene für höchstens 260 €', '6-daagse skipas volwassene voor hoogstens € 260',
    'Forfait de 6 días adulto por 260 € o menos', 'Skipass 6 giorni adulti a 260 € o meno',
    '6-dag-kaartjie vir grootmense teen €260 of minder'
  ],
  home_sc_near: [
    'Moins de 4 h de route', 'Under 4 h of driving', 'Weniger als 4 Std. Fahrt',
    'Minder dan 4 u rijden', 'Menos de 4 h de carretera', 'Meno di 4 h di strada',
    'Minder as 4 u se ry'
  ],
  home_sc_near_title: [
    'Trajet le plus long sous 4 heures', 'Longest drive under 4 hours',
    'Längste Fahrt unter 4 Stunden', 'Langste rit onder 4 uur',
    'Viaje más largo por debajo de 4 horas', 'Viaggio più lungo sotto le 4 ore',
    'Langste rit onder 4 uur'
  ],
  // --- Barre de recherche en pilule ---------------------------------------
  sb_destination: ['Destination', 'Destination', 'Reiseziel', 'Bestemming', 'Destino', 'Destinazione', 'Bestemming'],
  sb_dates: ['Semaine', 'Week', 'Woche', 'Week', 'Semana', 'Settimana', 'Week'],
  sb_week_any: [
    'Choisir une semaine', 'Pick a week', 'Woche wählen', 'Kies een week',
    'Elegir una semana', 'Scegli una settimana', 'Kies ’n week'
  ],
  sb_domain: ['domaine', 'resort', 'Skigebiet', 'skigebied', 'dominio', 'comprensorio', 'skigebied'],
  sb_station: ['station', 'village', 'Ort', 'dorp', 'estación', 'località', 'dorp'],
  sb_less: ['Un voyageur de moins', 'One traveller fewer', 'Ein Reisender weniger', 'Eén reiziger minder',
    'Un viajero menos', 'Un viaggiatore in meno', 'Een reisiger minder'],
  sb_more: ['Un voyageur de plus', 'One traveller more', 'Ein Reisender mehr', 'Eén reiziger meer',
    'Un viajero más', 'Un viaggiatore in più', 'Een reisiger meer'],
  sb_go: [
    'Lancer la recherche', 'Start the search', 'Suche starten', 'Zoeken starten',
    'Iniciar la búsqueda', 'Avvia la ricerca', 'Begin die soektog'
  ],
  home_snow_note: [
    'Relevé du modèle sur les domaines en tête de liste. « — » quand le relevé manque : rien n’est estimé.',
    'Model reading for the resorts at the top of the list. “—” when the reading is missing: nothing is estimated.',
    'Modellwert für die Gebiete am Anfang der Liste. „—“ wenn der Wert fehlt: nichts wird geschätzt.',
    'Modelwaarde voor de skigebieden bovenaan de lijst. “—” als de waarde ontbreekt: er wordt niets geschat.',
    'Lectura del modelo para los dominios al principio de la lista. «—» cuando falta el dato: nada se estima.',
    'Rilevazione del modello per i comprensori in testa alla lista. «—» quando il dato manca: nulla è stimato.',
    'Modelwaarde vir die skigebiede aan die bokant van die lys. “—” wanneer die waarde ontbreek: niks word geskat nie.'
  ],
  home_by_massif: ['Explorer par', 'Explore by', 'Erkunden nach', 'Verkennen per', 'Explorar por', 'Esplora per', 'Verken volgens'],
  home_by_massif_word: ['massif', 'range', 'Massiv', 'massief', 'macizo', 'massiccio', 'bergreeks'],
  home_massif_note: [
    '{m} massifs, {n} domaines relevés.', '{m} ranges, {n} resorts recorded.',
    '{m} Massive, {n} erfasste Gebiete.', '{m} massieven, {n} vastgelegde gebieden.',
    '{m} macizos, {n} dominios registrados.', '{m} massicci, {n} comprensori rilevati.',
    '{m} bergreekse, {n} aangetekende gebiede.'
  ],
  home_massif_count: [
    '{n} domaines', '{n} resorts', '{n} Gebiete', '{n} gebieden', '{n} dominios', '{n} comprensori', '{n} gebiede'
  ],
  home_all_domains: [
    'Voir tous les domaines →', 'See all resorts →', 'Alle Gebiete ansehen →', 'Alle gebieden bekijken →',
    'Ver todos los dominios →', 'Vedi tutti i comprensori →', 'Sien alle gebiede →'
  ],
  massif_other: ['Autres', 'Other', 'Andere', 'Overige', 'Otros', 'Altri', 'Ander'],

  // --- Comparateur de logements --------------------------------------------
  cmp_lodging_price: [
    'Prix logement (tout compris)', 'Stay price (all in)', 'Unterkunftspreis (alles inklusive)',
    'Verblijfsprijs (alles inbegrepen)', 'Precio alojamiento (todo incluido)',
    'Prezzo alloggio (tutto compreso)', 'Verblyfprys (alles ingesluit)'
  ],
  cmp_per_person_night: [
    'Par personne / nuit', 'Per person / night', 'Pro Person / Nacht', 'Per persoon / nacht',
    'Por persona / noche', 'Per persona / notte', 'Per persoon / nag'
  ],
  cmp_full_cost: [
    'Coût complet séjour*', 'Full stay cost*', 'Gesamtkosten des Aufenthalts*',
    'Totale kosten van het verblijf*', 'Coste total de la estancia*',
    'Costo totale del soggiorno*', 'Volle koste van die verblyf*'
  ],
  cmp_walk_to_runs: [
    'Pistes à pied', 'Walk to the runs', 'Fußweg zur Piste', 'Lopen naar de pistes',
    'A pie hasta las pistas', 'A piedi fino alle piste', 'Loop na die plesiere'
  ],
  cmp_capacity: ['Capacité', 'Capacity', 'Kapazität', 'Capaciteit', 'Capacidad', 'Capacità', 'Kapasiteit'],
  cmp_guest_rating: [
    'Note voyageurs', 'Guest rating', 'Gästebewertung', 'Gastenbeoordeling',
    'Valoración de viajeros', 'Voto viaggiatori', 'Gastebeoordeling'
  ],
  cmp_cancellation: ['Annulation', 'Cancellation', 'Stornierung', 'Annulering', 'Cancelación', 'Cancellazione', 'Kansellasie'],
  cmp_cancel_free: ['gratuite', 'free', 'kostenlos', 'gratis', 'gratuita', 'gratuita', 'gratis'],
  cmp_cancel_none: [
    'non remboursable', 'non-refundable', 'nicht erstattbar', 'niet terugbetaalbaar',
    'no reembolsable', 'non rimborsabile', 'nie terugbetaalbaar nie'
  ],
  cmp_source: ['Source', 'Source', 'Quelle', 'Bron', 'Fuente', 'Fonte', 'Bron'],
  cmp_best: ['meilleure valeur', 'best value', 'bester Wert', 'beste waarde', 'mejor valor', 'valore migliore', 'beste waarde'],
  cmp_trophy_note: [
    'La meilleure valeur de chaque ligne porte un trophée.',
    'The best value in each row carries a trophy.',
    'Der beste Wert jeder Zeile trägt eine Trophäe.',
    'De beste waarde van elke rij draagt een trofee.',
    'El mejor valor de cada fila lleva un trofeo.',
    'Il valore migliore di ogni riga porta un trofeo.',
    'Die beste waarde in elke ry dra ’n trofee.'
  ],
  not_provided_fem: [
    'non renseignée', 'not provided', 'nicht angegeben', 'niet opgegeven',
    'no indicada', 'non indicata', 'nie verskaf nie'
  ],

  // --- Administration et provenance corrigeable ----------------------------
  settings_admin: ['Administration', 'Administration', 'Verwaltung', 'Beheer', 'Administración', 'Amministrazione', 'Administrasie'],
  settings_admin_intro: [
    'Réglages techniques de l’installation : moteur local, sources de données, fournisseur d’itinéraires et clés d’API. Rien ici ne change ce que vous voyez au quotidien — ces réglages se posent une fois.',
    'Technical settings for the installation: local engine, data sources, routing provider and API keys. Nothing here changes day-to-day use — these are set once.',
    'Technische Einstellungen der Installation: lokale Engine, Datenquellen, Routing-Anbieter und API-Schlüssel. Nichts davon ändert die tägliche Nutzung — einmal einstellen genügt.',
    'Technische instellingen van de installatie: lokale engine, gegevensbronnen, routeprovider en API-sleutels. Niets hiervan verandert het dagelijks gebruik — dit stelt u één keer in.',
    'Ajustes técnicos de la instalación: motor local, fuentes de datos, proveedor de itinerarios y claves de API. Nada de esto cambia el uso diario — se configura una vez.',
    'Impostazioni tecniche dell’installazione: motore locale, fonti dati, fornitore di itinerari e chiavi API. Nulla di tutto ciò cambia l’uso quotidiano — si imposta una volta.',
    'Tegniese instellings van die installasie: plaaslike enjin, databronne, roeteverskaffer en API-sleutels. Niks hiervan verander die daaglikse gebruik nie — dit word een keer gestel.'
  ],
  prov_correct: ['corriger', 'correct', 'korrigieren', 'corrigeren', 'corregir', 'correggi', 'korrigeer'],
  prov_modify: ['modifier', 'edit', 'ändern', 'wijzigen', 'modificar', 'modifica', 'wysig'],
  prov_restore: [
    'Rétablir la valeur d’origine', 'Restore the original value', 'Ursprungswert wiederherstellen',
    'Oorspronkelijke waarde herstellen', 'Restablecer el valor original', 'Ripristina il valore originale',
    'Herstel die oorspronklike waarde'
  ],
  prov_manual: [
    'saisi à la main', 'entered by hand', 'von Hand eingegeben', 'handmatig ingevoerd',
    'introducido a mano', 'inserito a mano', 'met die hand ingevoer'
  ],
  prov_measured: ['relevé', 'recorded', 'erfasst', 'vastgelegd', 'registrado', 'rilevato', 'aangeteken'],
  prov_estimated: ['estimé', 'estimated', 'geschätzt', 'geschat', 'estimado', 'stimato', 'geskat'],
  prov_missing: ['absent', 'missing', 'fehlt', 'ontbreekt', 'ausente', 'assente', 'ontbreek'],
  prov_empty_note: [
    'Enregistrer avec un texte vide supprime la correction. La ligne d’origine reste calculée dans tous les cas.',
    'Saving with empty text removes the correction. The original line stays computed either way.',
    'Mit leerem Text speichern entfernt die Korrektur. Die ursprüngliche Zeile bleibt in jedem Fall berechnet.',
    'Opslaan met lege tekst verwijdert de correctie. De oorspronkelijke regel blijft hoe dan ook berekend.',
    'Guardar con texto vacío elimina la corrección. La línea original sigue calculándose igualmente.',
    'Salvare con testo vuoto elimina la correzione. La riga originale resta comunque calcolata.',
    'Stoor met leë teks verwyder die regstelling. Die oorspronklike reël bly in elk geval bereken.'
  ],
  home_stat_domains: [
    'Domaines au référentiel', 'Resorts in the dataset', 'Gebiete im Datenbestand',
    'Gebieden in de dataset', 'Dominios en el repertorio', 'Comprensori nel repertorio',
    'Gebiede in die datastel'
  ],
  home_stat_domains_note: [
    'coordonnées et altitudes vérifiées', 'coordinates and altitudes verified',
    'Koordinaten und Höhen geprüft', 'coördinaten en hoogtes gecontroleerd',
    'coordenadas y altitudes verificadas', 'coordinate e quote verificate',
    'koördinate en hoogtes geverifieer'
  ],
  home_stat_median_pass: [
    'Forfait 6 jours médian', 'Median 6-day pass', 'Median 6-Tage-Skipass', 'Mediaan 6-daagse skipas',
    'Forfait de 6 días mediano', 'Skipass 6 giorni mediano', 'Mediaan 6-dag-kaartjie'
  ],
  home_stat_median_pass_note: [
    'tarif adulte relevé', 'recorded adult price', 'erfasster Erwachsenenpreis',
    'vastgelegde volwassenenprijs', 'tarifa adulto registrada', 'tariffa adulti rilevata',
    'aangetekende grootmensprys'
  ],
  home_stat_biggest: [
    'Plus grand domaine', 'Largest resort', 'Größtes Gebiet', 'Grootste gebied',
    'Dominio más grande', 'Comprensorio più grande', 'Grootste gebied'
  ],
  home_stat_sources: [
    'Sources de logement', 'Stay sources', 'Unterkunftsquellen', 'Verblijfsbronnen',
    'Fuentes de alojamiento', 'Fonti di alloggio', 'Verblyfbronne'
  ],
  home_stat_sources_none: [
    'aucun relevé pour l’instant', 'no search yet', 'noch keine Abfrage',
    'nog geen zoekopdracht', 'todavía ninguna búsqueda', 'nessuna ricerca finora',
    'nog geen soektog nie'
  ],

  // --- Recherche autour d'une commune -------------------------------------
  search_placeholder: [
    'Un domaine, un massif, ou une commune proche', 'A resort, a range, or a nearby town',
    'Ein Gebiet, ein Massiv oder ein Ort in der Nähe', 'Een gebied, een massief of een nabije gemeente',
    'Un dominio, un macizo o un municipio cercano', 'Un comprensorio, un massiccio o un comune vicino',
    '’n Gebied, ’n bergreeks of ’n nabygeleë dorp'
  ],
  search_aria: [
    'Rechercher un domaine ou une commune', 'Search a resort or a town', 'Skigebiet oder Ort suchen',
    'Zoek een skigebied of gemeente', 'Buscar un dominio o un municipio', 'Cerca un comprensorio o un comune',
    'Soek ’n skigebied of dorp'
  ],
  geo_around_town: [
    'Autour d’une commune', 'Around a town', 'Um einen Ort', 'Rondom een gemeente',
    'Alrededor de un municipio', 'Attorno a un comune', 'Rondom ’n dorp'
  ],
  geo_searching: ['Recherche…', 'Searching…', 'Suche…', 'Zoeken…', 'Buscando…', 'Ricerca…', 'Soek…'],
  geo_sorted_from: [
    'Domaines classés par distance depuis', 'Resorts ranked by distance from', 'Skigebiete nach Entfernung von',
    'Skigebieden gesorteerd op afstand vanaf', 'Dominios ordenados por distancia desde',
    'Comprensori ordinati per distanza da', 'Skigebiede gesorteer volgens afstand vanaf'
  ],
  geo_remove: ['retirer', 'remove', 'entfernen', 'verwijderen', 'quitar', 'rimuovi', 'verwyder'],
  geo_approx: [
    'Position approximative : le géocodeur n’a pas rattaché ce point à une commune précise. Le classement reste indicatif.',
    'Approximate position: the geocoder did not match this point to a specific town. The ranking is indicative only.',
    'Ungefähre Position: der Geokodierer konnte diesen Punkt keinem genauen Ort zuordnen. Die Reihenfolge ist nur ein Anhaltspunkt.',
    'Positie bij benadering: de geocoder kon dit punt niet aan een specifieke gemeente koppelen. De rangschikking is indicatief.',
    'Posición aproximada: el geocodificador no ha asociado este punto a un municipio concreto. La clasificación es orientativa.',
    'Posizione approssimativa: il geocodificatore non ha associato questo punto a un comune preciso. L’ordine è indicativo.',
    'Benaderde posisie: die geokodeerder kon nie hierdie punt aan ’n bepaalde dorp koppel nie. Die rangorde is net aanduidend.'
  ],
  geo_not_found: [
    'Commune introuvable. Essayez avec le code postal, ou vérifiez l’orthographe.',
    'Town not found. Try adding the postcode, or check the spelling.',
    'Ort nicht gefunden. Versuchen Sie es mit der Postleitzahl oder prüfen Sie die Schreibweise.',
    'Gemeente niet gevonden. Probeer met de postcode of controleer de spelling.',
    'Municipio no encontrado. Pruebe con el código postal o revise la ortografía.',
    'Comune non trovato. Prova con il codice postale o controlla l’ortografia.',
    'Dorp nie gevind nie. Probeer met die poskode, of gaan die spelling na.'
  ],
  geo_needs_engine: [
    'Le géocodage passe par le moteur local, qui n’est pas démarré.',
    'Geocoding goes through the local engine, which is not running.',
    'Die Geokodierung läuft über die lokale Engine, die nicht gestartet ist.',
    'Geocodering verloopt via de lokale engine, die niet draait.',
    'La geocodificación pasa por el motor local, que no está iniciado.',
    'La geocodifica passa dal motore locale, che non è avviato.',
    'Geokodering loop deur die plaaslike enjin, wat nie loop nie.'
  ],
  unpin_map: [
    'Retirer l’épingle de la carte ✕', 'Remove the map pin ✕', 'Kartenmarkierung entfernen ✕',
    'Kaartspeld verwijderen ✕', 'Quitar el marcador del mapa ✕', 'Rimuovi il segnaposto ✕',
    'Verwyder die kaartspeld ✕'
  ],
  wx_recorded: [
    'Neige et météo relevées', 'Snow and weather recorded', 'Schnee und Wetter erfasst',
    'Sneeuw en weer opgehaald', 'Nieve y meteorología registradas', 'Neve e meteo rilevati',
    'Sneeu en weer aangeteken'
  ],
  ago_pattern: ['il y a {d}', '{d} ago', 'vor {d}', '{d} geleden', 'hace {d}', '{d} fa', '{d} gelede'],

  // --- Fraîcheur d'une offre ----------------------------------------------
  fresh_just_added: [
    'ajouté à l’instant', 'just added', 'gerade hinzugefügt', 'zojuist toegevoegd',
    'añadido ahora mismo', 'appena aggiunto', 'pas bygevoeg'
  ],
  fresh_manual: [
    'saisi à la main', 'entered by hand', 'von Hand erfasst', 'handmatig ingevoerd',
    'introducido a mano', 'inserito a mano', 'met die hand ingevoer'
  ],
  fresh_source_down: [
    'source injoignable — dernier prix connu', 'source unreachable — last known price',
    'Quelle nicht erreichbar — letzter bekannter Preis', 'bron onbereikbaar — laatst bekende prijs',
    'fuente inaccesible — último precio conocido', 'fonte irraggiungibile — ultimo prezzo noto',
    'bron onbereikbaar — laaste bekende prys'
  ],
  fresh_recorded: ['relevé', 'recorded', 'erfasst', 'opgehaald', 'registrado', 'rilevato', 'aangeteken'],
  lodg_gone_notice: [
    'Introuvable au dernier relevé à ces dates — probablement réservée. Vérifiez sur la source avant de compter dessus.',
    'Not found in the last scan for these dates — probably booked. Check on the source before counting on it.',
    'Beim letzten Abruf zu diesen Daten nicht gefunden — wahrscheinlich belegt. Vor dem Einplanen bei der Quelle prüfen.',
    'Niet gevonden bij de laatste opvraging voor deze data — waarschijnlijk geboekt. Controleer het bij de bron.',
    'No encontrado en la última consulta para estas fechas — probablemente reservado. Compruébelo en la fuente.',
    'Non trovato nell’ultimo rilevamento per queste date — probabilmente prenotato. Verifica sulla fonte.',
    'Nie by die laaste opname vir hierdie datums gevind nie — waarskynlik bespreek. Gaan by die bron na.'
  ],
  offers_route_unknown: [
    'route non calculée', 'route not computed', 'Route nicht berechnet',
    'route niet berekend', 'ruta no calculada', 'percorso non calcolato',
    'roete nie bereken nie'
  ],
  offers_card_label: [
    '{l} à {d}, {p} tout compris', '{l} in {d}, {p} all in', '{l} in {d}, {p} alles inklusive',
    '{l} in {d}, {p} alles inbegrepen', '{l} en {d}, {p} todo incluido',
    '{l} a {d}, {p} tutto compreso', '{l} in {d}, {p} alles ingesluit'
  ],
  offers_price_unit: [
    'tout compris, {n} nuits', 'all in, {n} nights', 'alles inklusive, {n} Nächte',
    'alles inbegrepen, {n} nachten', 'todo incluido, {n} noches', 'tutto compreso, {n} notti',
    'alles ingesluit, {n} nagte'
  ],
  offers_per_person: [
    'soit {p} par personne', '{p} per person', 'also {p} pro Person', 'oftewel {p} per persoon',
    'es decir {p} por persona', 'ossia {p} a persona', 'dit is {p} per persoon'
  ],
  lodg_price_on_source: [
    'Prix sur {s}', 'Price on {s}', 'Preis auf {s}', 'Prijs op {s}',
    'Precio en {s}', 'Prezzo su {s}', 'Prys op {s}'
  ],
  lodg_gone_tally: [
    '{n} annonce(s) connue(s) n’apparaissent plus à ces dates — probablement réservées.',
    '{n} known listing(s) no longer appear for these dates — probably booked.',
    '{n} bekannte Anzeige(n) erscheinen zu diesen Daten nicht mehr — wahrscheinlich belegt.',
    '{n} bekende advertentie(s) verschijnen niet meer voor deze data — waarschijnlijk geboekt.',
    '{n} anuncio(s) conocido(s) ya no aparecen para estas fechas — probablemente reservados.',
    '{n} annuncio/i noto/i non compaiono più per queste date — probabilmente prenotati.',
    '{n} bekende advertensie(s) verskyn nie meer vir hierdie datums nie — waarskynlik bespreek.'
  ],
  lodg_gone_hide: [
    'Masquer les annonces introuvables au dernier relevé',
    'Hide listings missing from the last scan',
    'Beim letzten Abruf fehlende Anzeigen ausblenden',
    'Advertenties verbergen die bij de laatste opvraging ontbraken',
    'Ocultar los anuncios ausentes de la última consulta',
    'Nascondi gli annunci assenti dall’ultimo rilevamento',
    'Versteek advertensies wat by die laaste opname ontbreek'
  ],
  fresh_last_search: [
    'relevé lors de la dernière recherche', 'recorded in the last search',
    'bei der letzten Suche erfasst', 'opgehaald bij de laatste zoekopdracht',
    'registrado en la última búsqueda', 'rilevato nell’ultima ricerca',
    'tydens die laaste soektog aangeteken'
  ],
  fresh_last_search_short: [
    '↻ dernière recherche', '↻ last search', '↻ letzte Suche', '↻ laatste zoekopdracht',
    '↻ última búsqueda', '↻ ultima ricerca', '↻ laaste soektog'
  ],
  scan_recorded: ['Relevé', 'Scanned', 'Erfasst', 'Opgehaald', 'Registrado', 'Rilevato', 'Aangeteken'],

  // Réglages · état des connecteurs de logement.
  settings_lodging_sources: [
    'Sources de logement',
    'Lodging sources',
    'Unterkunftsquellen',
    'Verblijfsbronnen',
    'Fuentes de alojamiento',
    'Fonti di alloggio',
    'Verblyfbronne'
  ],
  settings_lodging_sources_none: [
    'Moteur de recherche indisponible — aucun connecteur n’a pu être interrogé.',
    'Search engine unavailable — no connector could be queried.',
    'Suchmaschine nicht verfügbar — kein Konnektor konnte abgefragt werden.',
    'Zoekmachine niet beschikbaar — geen connector kon worden bevraagd.',
    'Motor de búsqueda no disponible — ningún conector ha podido consultarse.',
    'Motore di ricerca non disponibile — nessun connettore interrogabile.',
    'Soekenjin nie beskikbaar nie — geen koppelaar kon bevraag word nie.'
  ],
  settings_lodging_sources_help: [
    'Ces connecteurs alimentent l’écran Logements aux côtés d’Airbnb. Une clé posée ci-dessus est prise en compte au relevé suivant, sans redémarrage.',
    'These connectors feed the Lodgings screen alongside Airbnb. A key entered above applies to the next scan, with no restart.',
    'Diese Konnektoren speisen den Unterkünfte-Bildschirm neben Airbnb. Ein oben eingetragener Schlüssel gilt ab der nächsten Erfassung, ohne Neustart.',
    'Deze connectoren voeden het scherm Verblijven naast Airbnb. Een hierboven ingevoerde sleutel geldt vanaf de volgende meting, zonder herstart.',
    'Estos conectores alimentan la pantalla Alojamientos junto a Airbnb. Una clave introducida arriba se aplica en la siguiente búsqueda, sin reiniciar.',
    'Questi connettori alimentano la schermata Alloggi accanto ad Airbnb. Una chiave inserita sopra vale dal rilevamento successivo, senza riavvio.',
    'Hierdie koppelaars voed die Verblyf-skerm saam met Airbnb. ’n Sleutel hierbo ingevoer geld vanaf die volgende soektog, sonder herbegin.'
  ],
  settings_src_ready: ['prêt', 'ready', 'bereit', 'gereed', 'listo', 'pronto', 'gereed'],
  settings_src_blocked: ['bloqué', 'blocked', 'blockiert', 'geblokkeerd', 'bloqueado', 'bloccato', 'geblokkeer'],

  // Relevé multi-sources : bilan et échec global.
  scan_sources_failed: [
    'sans réponse : {s} — voir Réglages › Sources de logement',
    'no answer: {s} — see Settings › Lodging sources',
    'ohne Antwort: {s} — siehe Einstellungen › Unterkunftsquellen',
    'geen antwoord: {s} — zie Instellingen › Verblijfsbronnen',
    'sin respuesta: {s} — ver Ajustes › Fuentes de alojamiento',
    'nessuna risposta: {s} — vedi Impostazioni › Fonti di alloggio',
    'geen antwoord nie: {s} — sien Instellings › Verblyfbronne'
  ],
  scan_no_source_answered: [
    'Aucune source n’a répondu.',
    'No source answered.',
    'Keine Quelle hat geantwortet.',
    'Geen enkele bron heeft geantwoord.',
    'Ninguna fuente ha respondido.',
    'Nessuna fonte ha risposto.',
    'Geen bron het geantwoord nie.'
  ],
  scan_other_sources_tally: [
    '{n} offre(s) sur {s} autre(s) source(s)',
    '{n} offer(s) from {s} other source(s)',
    '{n} Angebot(e) aus {s} anderen Quelle(n)',
    '{n} aanbieding(en) uit {s} andere bron(nen)',
    '{n} oferta(s) de {s} otra(s) fuente(s)',
    '{n} offerta/e da {s} altra/e fonte/i',
    '{n} aanbieding(e) uit {s} ander bron(ne)'
  ],

  // Casse de phrase, pas les capitales de la maquette : une pastille nomme un
  // attribut du logement, elle n'a pas à crier plus fort que son titre.
  badge_ski_in: [
    'Skis aux pieds',
    'Ski-in ski-out',
    'Ski-in ski-out',
    'Ski-in ski-out',
    'A pie de pista',
    'Ski ai piedi',
    'Ski-in ski-out'
  ],

  // Écran de relevé des logements. Les deux premières reprennent mot pour mot
  // la maquette Claude Design (`searchingLodgings`, `offersFound`).
  scan_searching_lodgings: [
    'Recherche de logements à',
    'Searching stays in',
    'Suche nach Unterkünften in',
    'Zoeken naar verblijven in',
    'Buscando alojamientos en',
    'Ricerca di alloggi a',
    'Soek na verblyf in'
  ],
  scan_offers_found: [
    'offres connues',
    'offers known',
    'Angebote bekannt',
    'aanbiedingen bekend',
    'ofertas conocidas',
    'offerte note',
    'aanbiedinge bekend'
  ],
  scan_travelers: [
    'voyageur(s)',
    'traveller(s)',
    'Reisende(r)',
    'reiziger(s)',
    'viajero(s)',
    'viaggiatore/i',
    'reisiger(s)'
  ],
  scan_rooms_min: [
    'chambre(s) minimum',
    'room(s) minimum',
    'Zimmer mindestens',
    'kamer(s) minimaal',
    'habitación(es) mínimo',
    'camera/e minimo',
    'kamer(s) minimum'
  ],
  scan_src_querying: [
    'interrogation…',
    'querying…',
    'Abfrage…',
    'bevragen…',
    'consultando…',
    'interrogazione…',
    'bevraag…'
  ],
  // Dire « en attente » laisserait croire que la source sera interrogée ensuite.
  // Seul Airbnb est automatisé ; les autres arrivent par import.
  scan_src_manual: [
    'import manuel',
    'manual import',
    'manueller Import',
    'handmatige import',
    'importación manual',
    'importazione manuale',
    'handmatige invoer'
  ],
  scan_src_disabled: [
    'source désactivée',
    'source disabled',
    'Quelle deaktiviert',
    'bron uitgeschakeld',
    'fuente desactivada',
    'fonte disattivata',
    'bron gedeaktiveer'
  ],
  scan_offers_one: ['offre', 'offer', 'Angebot', 'aanbieding', 'oferta', 'offerta', 'aanbieding'],
  scan_offers_plural: [
    'offres',
    'offers',
    'Angebote',
    'aanbiedingen',
    'ofertas',
    'offerte',
    'aanbiedinge'
  ],
  scan_elapsed_note: [
    '{e} s sur {t} s au maximum — la barre mesure le temps écoulé, pas l’avancement de la collecte.',
    '{e}s of {t}s maximum — the bar tracks elapsed time, not collection progress.',
    '{e} s von maximal {t} s — der Balken zeigt die verstrichene Zeit, nicht den Fortschritt.',
    '{e} s van maximaal {t} s — de balk toont de verstreken tijd, niet de voortgang.',
    '{e} s de {t} s como máximo — la barra mide el tiempo transcurrido, no el avance.',
    '{e} s su {t} s al massimo — la barra misura il tempo trascorso, non l’avanzamento.',
    '{e} s van hoogstens {t} s — die balk wys verstreke tyd, nie vordering nie.'
  ],
  free_cancel_fresh: [
    'Annulation gratuite · offre relevée il y a moins d’une heure',
    'Free cancellation · offer recorded less than an hour ago',
    'Kostenlose Stornierung · Angebot vor weniger als einer Stunde erfasst',
    'Gratis annulering · aanbieding minder dan een uur geleden opgehaald',
    'Cancelación gratuita · oferta registrada hace menos de una hora',
    'Cancellazione gratuita · offerta rilevata meno di un’ora fa',
    'Gratis kansellasie · aanbod minder as ’n uur gelede aangeteken'
  ],
  digest_short: [
    'résumé quotidien à 9 h', 'daily digest at 9 am', 'Tageszusammenfassung um 9 Uhr',
    'dagelijkse samenvatting om 9 uur', 'resumen diario a las 9 h', 'riepilogo quotidiano alle 9',
    'daaglikse opsomming om 09:00'
  ],
  digest_option: [
    'Résumé quotidien à 9 h plutôt qu’une alerte par baisse',
    'Daily digest at 9 am rather than one alert per drop',
    'Tageszusammenfassung um 9 Uhr statt einer Meldung je Preissenkung',
    'Dagelijkse samenvatting om 9 uur in plaats van één melding per daling',
    'Resumen diario a las 9 h en lugar de una alerta por bajada',
    'Riepilogo quotidiano alle 9 invece di un avviso per ogni ribasso',
    'Daaglikse opsomming om 09:00 eerder as een waarskuwing per daling'
  ],
  track_first_reading: [
    'premier relevé conservé', 'first reading kept', 'erste erfasste Messung',
    'eerste bewaarde meting', 'primera lectura conservada', 'primo rilevamento conservato',
    'eerste behoue lesing'
  ],
  track_six_weeks: [
    'il y a 6 semaines', '6 weeks ago', 'vor 6 Wochen', '6 weken geleden',
    'hace 6 semanas', '6 settimane fa', '6 weke gelede'
  ],

  // --- Fond de carte ------------------------------------------------------
  basemap: ['Fond', 'Basemap', 'Kartenhintergrund', 'Achtergrondkaart', 'Mapa base', 'Mappa di base', 'Basiskaart'],
  basemap_topo: ['Topographique', 'Topographic', 'Topografisch', 'Topografisch', 'Topográfico', 'Topografico', 'Topografies'],
  basemap_topo_sub: [
    'relief, pistes et sentiers — OpenTopoMap', 'relief, runs and trails — OpenTopoMap',
    'Relief, Pisten und Wege — OpenTopoMap', 'reliëf, pistes en paden — OpenTopoMap',
    'relieve, pistas y senderos — OpenTopoMap', 'rilievo, piste e sentieri — OpenTopoMap',
    'reliëf, plesiere en paaie — OpenTopoMap'
  ],
  basemap_plan: ['Plan', 'Street', 'Straßenkarte', 'Stratenkaart', 'Callejero', 'Stradale', 'Straatkaart'],
  basemap_plan_sub: [
    'routes et villages — OpenStreetMap', 'roads and villages — OpenStreetMap',
    'Straßen und Orte — OpenStreetMap', 'wegen en dorpen — OpenStreetMap',
    'carreteras y pueblos — OpenStreetMap', 'strade e paesi — OpenStreetMap',
    'paaie en dorpe — OpenStreetMap'
  ],
  relief_map: ['Carte', 'Map', 'Karte', 'Kaart', 'Mapa', 'Mappa', 'Kaart'],
  relief_hillshade: ['Relief ombré', 'Hillshade', 'Schummerung', 'Reliëfschaduw', 'Relieve sombreado', 'Rilievo ombreggiato', 'Reliëfskadu'],

  // --- Origine ------------------------------------------------------------
  origin: ['Point de départ', 'Starting point', 'Startpunkt', 'Vertrekpunt', 'Punto de partida', 'Punto di partenza', 'Vertrekpunt'],
  origin_none: [
    'Aucune adresse de départ', 'No starting address', 'Keine Startadresse', 'Geen vertrekadres',
    'Ninguna dirección de salida', 'Nessun indirizzo di partenza', 'Geen vertrekadres'
  ],
  origin_add: ['Ajouter une adresse', 'Add an address', 'Adresse hinzufügen', 'Adres toevoegen', 'Añadir una dirección', 'Aggiungi un indirizzo', 'Voeg ’n adres by'],
  origin_label: ['Nom (ex. Domicile)', 'Name (e.g. Home)', 'Name (z. B. Zuhause)', 'Naam (bijv. Thuis)', 'Nombre (p. ej. Casa)', 'Nome (es. Casa)', 'Naam (bv. Tuis)'],
  origin_address: ['Adresse complète', 'Full address', 'Vollständige Adresse', 'Volledig adres', 'Dirección completa', 'Indirizzo completo', 'Volledige adres'],
  origin_save: ['Enregistrer', 'Save', 'Speichern', 'Opslaan', 'Guardar', 'Salva', 'Stoor'],
  origin_geocoding: ['Géolocalisation…', 'Geocoding…', 'Geokodierung…', 'Geocoderen…', 'Geolocalizando…', 'Geocodifica…', 'Geokodering…'],
  origin_delete: ['Supprimer', 'Delete', 'Löschen', 'Verwijderen', 'Eliminar', 'Elimina', 'Verwyder'],
  origin_precompute: [
    'Calculer les temps de trajet', 'Compute travel times', 'Fahrzeiten berechnen', 'Reistijden berekenen',
    'Calcular los tiempos de viaje', 'Calcola i tempi di viaggio', 'Bereken reistye'
  ],
  origin_precompute_help: [
    'Itinéraires routiers réels, calculés une fois puis stockés. Rien n’est recalculé à l’affichage.',
    'Real road itineraries, computed once then stored. Nothing is recomputed on display.',
    'Echte Straßenrouten, einmal berechnet und gespeichert. Bei der Anzeige wird nichts neu berechnet.',
    'Echte routes over de weg, één keer berekend en opgeslagen. Bij weergave wordt niets opnieuw berekend.',
    'Itinerarios por carretera reales, calculados una vez y almacenados. Nada se recalcula al mostrarlos.',
    'Itinerari stradali reali, calcolati una volta e memorizzati. Nulla viene ricalcolato alla visualizzazione.',
    'Werklike padroetes, een keer bereken en gestoor. Niks word by weergawe herbereken nie.'
  ],
  origin_computing: ['Calcul en cours…', 'Computing…', 'Berechnung läuft…', 'Berekenen…', 'Calculando…', 'Calcolo in corso…', 'Besig om te bereken…'],
  origin_no_route: [
    'Aucun itinéraire calculé : les durées affichées sont des estimations',
    'No route computed: the times shown are estimates',
    'Keine Route berechnet: die angezeigten Zeiten sind Schätzungen',
    'Geen route berekend: de weergegeven tijden zijn schattingen',
    'Ninguna ruta calculada: los tiempos mostrados son estimaciones',
    'Nessun itinerario calcolato: i tempi mostrati sono stime',
    'Geen roete bereken nie: die tye wat gewys word, is skattings'
  ],
  origin_routes_done: [
    'itinéraires réels calculés', 'real routes computed', 'echte Routen berechnet', 'echte routes berekend',
    'rutas reales calculadas', 'itinerari reali calcolati', 'werklike roetes bereken'
  ],

  // --- Résultats ----------------------------------------------------------
  results_count: ['domaine(s)', 'resort(s)', 'Skigebiet(e)', 'skigebied(en)', 'dominio(s)', 'comprensorio(i)', 'skigebied(e)'],
  results_empty: [
    'Aucun domaine ne correspond à ces critères.', 'No resort matches these criteria.',
    'Kein Skigebiet entspricht diesen Kriterien.', 'Geen skigebied voldoet aan deze criteria.',
    'Ningún dominio coincide con estos criterios.', 'Nessun comprensorio corrisponde a questi criteri.',
    'Geen skigebied pas by hierdie kriteria nie.'
  ],
  results_empty_hint: [
    'Essayez d’abaisser l’altitude minimum ou d’élargir le temps de trajet.',
    'Try lowering the minimum altitude or widening the travel time.',
    'Senken Sie die Mindesthöhe oder erweitern Sie die Fahrzeit.',
    'Verlaag de minimale hoogte of verruim de reistijd.',
    'Pruebe a bajar la altitud mínima o a ampliar el tiempo de viaje.',
    'Prova ad abbassare la quota minima o ad ampliare il tempo di viaggio.',
    'Probeer die minimum hoogte verlaag of die reistyd verruim.'
  ],
  results_of: ['sur', 'of', 'von', 'van', 'de', 'su', 'van'],

  // --- Vignette de domaine ------------------------------------------------
  amplitude_lower: ['amplitude', 'vertical', 'Höhendifferenz', 'hoogteverschil', 'desnivel', 'dislivello', 'hoogteverskil'],
  lifts_plural: ['remontées', 'lifts', 'Bergbahnen', 'liften', 'remontes', 'impianti', 'skilifte'],
  snow_front_lower: ['front de neige', 'snow front', 'Talstation', 'sneeuwfront', 'frente de nieve', 'fronte neve', 'sneeufront'],
  of_road: ['de route', 'of driving', 'Fahrt', 'rijden', 'de carretera', 'di strada', 'se pad'],
  days_short: ['j', 'd', 'T', 'd', 'd', 'g', 'd'],
  card_pin_from_map: [
    'depuis la carte', 'from the map', 'von der Karte', 'vanaf de kaart',
    'desde el mapa', 'dalla mappa', 'vanaf die kaart'
  ],
  card_pin_out: [
    'carte · hors filtres', 'map · outside filters', 'Karte · außerhalb der Filter',
    'kaart · buiten de filters', 'mapa · fuera de filtros', 'mappa · fuori dai filtri',
    'kaart · buite die filters'
  ],
  card_off_map: ['hors carte', 'off the map', 'ohne Karte', 'buiten de kaart', 'fuera del mapa', 'fuori mappa', 'buite die kaart'],
  card_off_map_title: [
    'Position absente du référentiel : ni carte, ni météo, ni temps de trajet',
    'Position missing from the reference file: no map, no weather, no travel time',
    'Position fehlt in der Referenzdatei: keine Karte, kein Wetter, keine Fahrzeit',
    'Positie ontbreekt in het referentiebestand: geen kaart, geen weer, geen reistijd',
    'Posición ausente del fichero de referencia: ni mapa, ni meteorología, ni tiempo de viaje',
    'Posizione assente dall’archivio di riferimento: né mappa, né meteo, né tempo di viaggio',
    'Posisie ontbreek in die verwysingslêer: geen kaart, geen weer, geen reistyd nie'
  ],
  card_checked: [
    'vérifié à la main', 'checked by hand', 'von Hand geprüft', 'handmatig gecontroleerd',
    'verificado a mano', 'verificato a mano', 'met die hand nagegaan'
  ],
  price_estimated: [
    'Tarif estimé, non relevé', 'Estimated price, not recorded', 'Geschätzter Preis, nicht erfasst',
    'Geschatte prijs, niet vastgelegd', 'Tarifa estimada, no registrada',
    'Prezzo stimato, non rilevato', 'Geskatte prys, nie aangeteken nie'
  ],
  sort_by: ['Trier par', 'Sort by', 'Sortieren nach', 'Sorteren op', 'Ordenar por', 'Ordina per', 'Sorteer volgens'],
  sort_aria: [
    'Trier les domaines', 'Sort the resorts', 'Skigebiete sortieren', 'Skigebieden sorteren',
    'Ordenar los dominios', 'Ordina i comprensori', 'Sorteer die skigebiede'
  ],
  sort_relevance: ['Pertinence', 'Relevance', 'Relevanz', 'Relevantie', 'Relevancia', 'Pertinenza', 'Relevansie'],
  sort_altitude_min_desc: [
    'Bas des pistes (décroissant)', 'Base altitude (highest first)', 'Pistenende (absteigend)',
    'Pistebasis (hoog naar laag)', 'Base de las pistas (descendente)', 'Base delle piste (decrescente)',
    'Pistevoet (hoog na laag)'
  ],
  sort_altitude_max_desc: [
    'Point culminant (décroissant)', 'Summit (highest first)', 'Höchster Punkt (absteigend)',
    'Hoogste punt (hoog naar laag)', 'Cota máxima (descendente)', 'Punto più alto (decrescente)',
    'Hoogste punt (hoog na laag)'
  ],
  sort_slopes_km_desc: [
    'Kilomètres de pistes', 'Kilometres of runs', 'Pistenkilometer', 'Pistekilometers',
    'Kilómetros de pistas', 'Chilometri di piste', 'Kilometers plesiere'
  ],
  sort_travel_time_asc: ['Temps de trajet', 'Travel time', 'Fahrzeit', 'Reistijd', 'Tiempo de viaje', 'Tempo di viaggio', 'Reistyd'],
  sort_forfait_asc: [
    'Forfait 6 jours (croissant)', '6-day pass (cheapest first)', '6-Tage-Skipass (aufsteigend)',
    '6-daagse skipas (laag naar hoog)', 'Forfait de 6 días (ascendente)', 'Skipass 6 giorni (crescente)',
    '6-dag-kaartjie (laag na hoog)'
  ],
  sort_name_asc: ['Nom', 'Name', 'Name', 'Naam', 'Nombre', 'Nome', 'Naam'],

  // --- Fiche domaine ------------------------------------------------------
  sheet_resort: [
    'Fiche domaine', 'Resort details', 'Gebietsdetails', 'Gebiedsdetails',
    'Ficha del dominio', 'Scheda comprensorio', 'Gebiedsbesonderhede'
  ],
  sheet_resort_link: [
    'Fiche du domaine →', 'Resort details →', 'Gebietsdetails →', 'Gebiedsdetails →',
    'Ficha del dominio →', 'Scheda del comprensorio →', 'Gebiedsbesonderhede →'
  ],
  sheet_lodging: [
    'Fiche logement', 'Stay details', 'Unterkunftsdetails', 'Verblijfsdetails',
    'Ficha del alojamiento', 'Scheda alloggio', 'Verblyfbesonderhede'
  ],
  alti_profile: ['Profil altimétrique', 'Altitude profile', 'Höhenprofil', 'Hoogteprofiel', 'Perfil altimétrico', 'Profilo altimetrico', 'Hoogteprofiel'],
  altitude_bottom: [
    'Bas des pistes', 'Base of the runs', 'Pistenende', 'Onderkant pistes',
    'Base de las pistas', 'Base delle piste', 'Voet van die plesiere'
  ],
  altitude_bottom_lower: [
    'bas des pistes', 'base of the runs', 'Pistenende', 'onderkant pistes',
    'base de las pistas', 'base delle piste', 'voet van die plesiere'
  ],
  altitude_top: ['Point culminant', 'Summit', 'Höchster Punkt', 'Hoogste punt', 'Cota máxima', 'Punto più alto', 'Hoogste punt'],
  altitude_top_lower: ['point culminant', 'summit', 'höchster Punkt', 'hoogste punt', 'cota máxima', 'punto più alto', 'hoogste punt'],
  altitude_village: ['Front de neige', 'Snow front', 'Talstation', 'Sneeuwfront', 'Frente de nieve', 'Fronte neve', 'Sneeufront'],
  altitude_village_lower: ['front de neige', 'snow front', 'Talstation', 'sneeuwfront', 'frente de nieve', 'fronte neve', 'sneeufront'],
  altitude_range: [
    'Amplitude skiable', 'Skiable vertical', 'Skibare Höhendifferenz', 'Skibaar hoogteverschil',
    'Desnivel esquiable', 'Dislivello sciabile', 'Skibare hoogteverskil'
  ],
  slopes: ['Pistes', 'Runs', 'Pisten', 'Pistes', 'Pistas', 'Piste', 'Plesiere'],
  slopes_lifts: [
    'Pistes · remontées', 'Runs · lifts', 'Pisten · Bergbahnen', 'Pistes · liften',
    'Pistas · remontes', 'Piste · impianti', 'Plesiere · skilifte'
  ],
  lifts: ['Remontées', 'Lifts', 'Bergbahnen', 'Liften', 'Remontes', 'Impianti', 'Skilifte'],
  glacier: ['Glacier', 'Glacier', 'Gletscher', 'Gletsjer', 'Glaciar', 'Ghiacciaio', 'Gletser'],
  snowmaking: ['Neige de culture', 'Snowmaking', 'Beschneiung', 'Kunstsneeuw', 'Nieve artificial', 'Innevamento', 'Kunssneeu'],
  travel_time: ['Trajet', 'Drive', 'Fahrt', 'Rit', 'Viaje', 'Viaggio', 'Rit'],
  travel_car: ['Trajet voiture', 'Drive', 'Fahrzeit', 'Autorit', 'Viaje en coche', 'Viaggio in auto', 'Rit met die motor'],
  official_site: ['Site officiel', 'Official site', 'Offizielle Website', 'Officiële site', 'Sitio oficial', 'Sito ufficiale', 'Amptelike webwerf'],
  booking_site: ['Réservation', 'Booking', 'Buchung', 'Reservering', 'Reserva', 'Prenotazione', 'Bespreking'],
  score_why: ['Pourquoi ?', 'Why?', 'Warum?', 'Waarom?', '¿Por qué?', 'Perché?', 'Waarom?'],
  score_detail: ['Détail du score', 'Score breakdown', 'Score-Aufschlüsselung', 'Scoreverdeling', 'Detalle de la puntuación', 'Dettaglio del punteggio', 'Tellingverdeling'],
  score_note: [
    'Chaque critère est noté sur une échelle absolue de référence — par exemple un bas de pistes à 1 400 m vaut 62, à 2 000 m vaut 90 — et non par comparaison aux autres résultats. Un domaine correct reste donc bien noté même à côté d’un domaine exceptionnel. La note est ensuite multipliée par son poids ; le score est la somme des contributions.',
    'Each criterion is rated on an absolute reference scale — a base at 1,400 m scores 62, at 2,000 m it scores 90 — not by comparison with the other results. A decent resort therefore keeps a good rating even next to an exceptional one. The rating is then multiplied by its weight; the score is the sum of the contributions.',
    'Jedes Kriterium wird auf einer absoluten Referenzskala bewertet — ein Pistenende auf 1 400 m ergibt 62, auf 2 000 m ergibt 90 — und nicht im Vergleich zu den anderen Ergebnissen. Ein gutes Gebiet bleibt daher auch neben einem außergewöhnlichen gut bewertet. Die Note wird mit ihrem Gewicht multipliziert; der Score ist die Summe der Beiträge.',
    'Elk criterium krijgt een cijfer op een absolute referentieschaal — een pistebasis op 1 400 m geeft 62, op 2 000 m geeft 90 — en niet in vergelijking met de andere resultaten. Een degelijk gebied blijft dus goed beoordeeld, ook naast een uitzonderlijk gebied. Het cijfer wordt vervolgens met zijn gewicht vermenigvuldigd; de score is de som van de bijdragen.',
    'Cada criterio se puntúa en una escala absoluta de referencia — una base a 1 400 m vale 62, a 2 000 m vale 90 — y no por comparación con los demás resultados. Un dominio correcto conserva así una buena nota incluso al lado de uno excepcional. La nota se multiplica luego por su peso; la puntuación es la suma de las contribuciones.',
    'Ogni criterio è valutato su una scala assoluta di riferimento — una base a 1 400 m vale 62, a 2 000 m vale 90 — e non per confronto con gli altri risultati. Un comprensorio valido resta quindi ben valutato anche accanto a uno eccezionale. Il voto è poi moltiplicato per il suo peso; il punteggio è la somma dei contributi.',
    'Elke maatstaf word op ’n absolute verwysingskaal beoordeel — ’n pistevoet op 1 400 m gee 62, op 2 000 m gee 90 — en nie in vergelyking met die ander resultate nie. ’n Goeie gebied bly dus goed beoordeel, selfs naas ’n uitsonderlike een. Die punt word dan met sy gewig vermenigvuldig; die telling is die som van die bydraes.'
  ],
  source_openskimap: ['OpenSkiMap', 'OpenSkiMap', 'OpenSkiMap', 'OpenSkiMap', 'OpenSkiMap', 'OpenSkiMap', 'OpenSkiMap'],
  source_curated: [
    'vérifié à la main', 'manually verified', 'manuell geprüft', 'handmatig gecontroleerd',
    'verificado a mano', 'verificato a mano', 'met die hand geverifieer'
  ],
  source_derived: ['estimé', 'estimated', 'geschätzt', 'geschat', 'estimado', 'stimato', 'geskat'],
  data_incomplete: [
    'Donnée absente de la source', 'Not provided by the source', 'Von der Quelle nicht geliefert',
    'Niet geleverd door de bron', 'Dato ausente en la fuente', 'Dato assente nella fonte',
    'Nie deur die bron verskaf nie'
  ],
  pass_6d_adult: [
    'Forfait 6 j adulte', '6-day adult pass', '6-Tage-Pass Erw.', '6-daagse pas volw.',
    'Forfait 6 d adulto', 'Skipass 6 g adulti', '6-dag-kaartjie grootmens'
  ],
  pass_zone: ['Zone du forfait', 'Pass area', 'Skipass-Gebiet', 'Skipasgebied', 'Zona del forfait', 'Zona dello skipass', 'Kaartjiegebied'],
  passes_label: ['Forfaits', 'Passes', 'Skipässe', 'Skipassen', 'Forfaits', 'Skipass', 'Kaartjies'],
  passes_note: [
    'Tarifs publics haute saison, relevés sur le site officiel du domaine.',
    'Public high-season prices, recorded on the resort official site.',
    'Öffentliche Hochsaisonpreise, erfasst auf der offiziellen Website des Gebiets.',
    'Publieke hoogseizoenprijzen, vastgelegd op de officiële site van het gebied.',
    'Tarifas públicas de temporada alta, registradas en el sitio oficial del dominio.',
    'Prezzi pubblici di alta stagione, rilevati sul sito ufficiale del comprensorio.',
    'Openbare hoogseisoenpryse, aangeteken op die amptelike webwerf van die gebied.'
  ],
  passes_family_note: [
    'Tarif famille estimé (2 adultes + 2 enfants, remise usuelle de 5 %) — à confirmer sur la billetterie. Assurance et forfaits piéton non comptés.',
    'Family price estimated (2 adults + 2 children, usual 5% discount) — to be confirmed at the ticket office. Insurance and pedestrian passes not included.',
    'Familienpreis geschätzt (2 Erwachsene + 2 Kinder, üblicher Rabatt 5 %) — an der Kasse zu bestätigen. Versicherung und Fußgängerpässe nicht enthalten.',
    'Gezinsprijs geschat (2 volwassenen + 2 kinderen, gebruikelijke korting 5 %) — te bevestigen bij de kassa. Verzekering en voetgangerspassen niet meegerekend.',
    'Tarifa familiar estimada (2 adultos + 2 niños, descuento habitual del 5 %) — a confirmar en la taquilla. Seguro y forfaits de peatón no incluidos.',
    'Tariffa famiglia stimata (2 adulti + 2 bambini, sconto usuale del 5 %) — da confermare in biglietteria. Assicurazione e skipass pedonali esclusi.',
    'Gesinsprys geskat (2 grootmense + 2 kinders, gewone afslag van 5 %) — te bevestig by die kaartjieskantoor. Versekering en voetgangerkaartjies uitgesluit.'
  ],
  snow_label: ['Neige', 'Snow', 'Schnee', 'Sneeuw', 'Nieve', 'Neve', 'Sneeu'],
  snow_base_top: ['(bas / haut)', '(base / top)', '(Tal / Berg)', '(basis / top)', '(base / cima)', '(base / cima)', '(voet / top)'],
  snow_on_ground: ['Neige au sol', 'Snow on the ground', 'Schneehöhe', 'Sneeuw op de grond', 'Nieve en el suelo', 'Neve al suolo', 'Sneeu op die grond'],
  resort_base: ['Bas du domaine', 'Base of the resort', 'Talbereich', 'Onderkant gebied', 'Base del dominio', 'Base del comprensorio', 'Voet van die gebied'],
  resort_top: ['Haut du domaine', 'Top of the resort', 'Höchster Bereich', 'Bovenkant gebied', 'Parte alta del dominio', 'Parte alta del comprensorio', 'Bokant van die gebied'],
  snow_modelled: [
    'Hauteurs modélisées par Open-Meteo aux deux altitudes du domaine',
    'Depths modelled by Open-Meteo at both resort altitudes',
    'Von Open-Meteo modellierte Höhen auf beiden Gebietshöhen',
    'Door Open-Meteo gemodelleerde hoogtes op beide hoogtes van het gebied',
    'Espesores modelizados por Open-Meteo en ambas altitudes del dominio',
    'Spessori modellati da Open-Meteo alle due quote del comprensorio',
    'Dieptes deur Open-Meteo gemodelleer op beide hoogtes van die gebied'
  ],
  snow_from_ref: [
    'Valeurs du référentiel, relevé météo en attente', 'Reference-file values, weather reading pending',
    'Werte der Referenzdatei, Wettererfassung ausstehend', 'Waarden uit het referentiebestand, weermeting in afwachting',
    'Valores del fichero de referencia, lectura meteorológica pendiente',
    'Valori dell’archivio di riferimento, rilevamento meteo in attesa',
    'Waardes uit die verwysingslêer, weermeting hangende'
  ],
  snowfall_announced: [
    'Chutes annoncées :', 'Snowfall forecast:', 'Angekündigter Neuschnee:', 'Verwachte sneeuwval:',
    'Nevadas previstas:', 'Nevicate previste:', 'Verwagte sneeuval:'
  ],
  snowfall_none: [
    'aucune chute annoncée', 'no snowfall forecast', 'kein Neuschnee angekündigt', 'geen sneeuwval verwacht',
    'ninguna nevada prevista', 'nessuna nevicata prevista', 'geen sneeuval verwag'
  ],
  snowfall_cm_7d: [
    'cm attendus sur 7 jours', 'cm expected over 7 days', 'cm in 7 Tagen erwartet', 'cm verwacht in 7 dagen',
    'cm previstos en 7 días', 'cm previsti in 7 giorni', 'cm verwag oor 7 dae'
  ],
  resort_weather: [
    'Météo du domaine', 'Resort weather', 'Wetter im Gebiet', 'Weer in het gebied',
    'Meteorología del dominio', 'Meteo del comprensorio', 'Weer in die gebied'
  ],
  weather_morning: ['Matin', 'Morning', 'Vormittag', 'Ochtend', 'Mañana', 'Mattina', 'Oggend'],
  weather_afternoon: ['Après-midi', 'Afternoon', 'Nachmittag', 'Middag', 'Tarde', 'Pomeriggio', 'Middag'],
  weather_min_max: ['Mini / maxi', 'Min / max', 'Min / Max', 'Min / max', 'Mín / máx', 'Min / max', 'Min / maks'],
  weather_wind_max: ['Vent maximum', 'Maximum wind', 'Maximaler Wind', 'Maximale wind', 'Viento máximo', 'Vento massimo', 'Maksimum wind'],
  weather_precip_24h: ['Précipitations 24 h', 'Precipitation 24 h', 'Niederschlag 24 h', 'Neerslag 24 u', 'Precipitación 24 h', 'Precipitazioni 24 h', 'Neerslag 24 u'],
  weather_snowfall_24h: ['Neige 24 h', 'Snowfall 24 h', 'Neuschnee 24 h', 'Sneeuw 24 u', 'Nieve 24 h', 'Neve 24 h', 'Sneeu 24 u'],
  weather_snow_depth: ['Neige au sol', 'Snow depth', 'Schneehöhe', 'Sneeuwdek', 'Nieve en el suelo', 'Neve al suolo', 'Sneeudiepte'],
  weather_unavailable: [
    'Relevé météo indisponible', 'Weather reading unavailable', 'Wetterdaten nicht verfügbar',
    'Weergegevens niet beschikbaar', 'Lectura meteorológica no disponible', 'Rilevamento meteo non disponibile',
    'Weerlesing nie beskikbaar nie'
  ],
  weather_loading: [
    'Relevé de la neige et de la météo…', 'Recording snow and weather…', 'Schnee und Wetter werden erfasst…',
    'Sneeuw en weer ophalen…', 'Registrando nieve y meteorología…', 'Rilevamento di neve e meteo…',
    'Sneeu en weer word aangeteken…'
  ],
  isotherm: ['Isotherme 0 °C :', '0 °C isotherm:', '0-°C-Grenze:', '0 °C-isotherm:', 'Isoterma de 0 °C:', 'Isoterma 0 °C:', '0 °C-isoterm:'],
  isotherm_note: [
    '— au-dessus, les précipitations tombent en neige.', '— above it, precipitation falls as snow.',
    '— darüber fällt Niederschlag als Schnee.', '— daarboven valt neerslag als sneeuw.',
    '— por encima, la precipitación cae en forma de nieve.', '— al di sopra, le precipitazioni cadono come neve.',
    '— daarbo val neerslag as sneeu.'
  ],
  forecast_14: [
    'Prévisions 14 jours', '14-day forecast', '14-Tage-Prognose', 'Verwachting 14 dagen',
    'Previsión a 14 días', 'Previsioni a 14 giorni', '14-dae-voorspelling'
  ],
  forecast_7: [
    'Météo 7 jours', '7-day forecast', '7-Tage-Prognose', 'Verwachting 7 dagen',
    'Previsión a 7 días', 'Previsioni a 7 giorni', '7-dae-voorspelling'
  ],
  webcams_title: [
    'Webcams du domaine', 'Resort webcams', 'Webcams im Gebiet', 'Webcams van het gebied',
    'Webcams del dominio', 'Webcam del comprensorio', 'Webcams van die gebied'
  ],
  webcam_choose: ['Choisir une webcam', 'Choose a webcam', 'Webcam auswählen', 'Kies een webcam', 'Elegir una webcam', 'Scegli una webcam', 'Kies ’n webcam'],
  webcam_title: ['Webcam du domaine', 'Resort webcam', 'Webcam des Gebiets', 'Webcam van het gebied', 'Webcam del dominio', 'Webcam del comprensorio', 'Webcam van die gebied'],
  webcam_note: [
    'Flux de l’exploitant. Si l’image ne s’affiche pas,', 'Operator feed. If the image does not load,',
    'Stream des Betreibers. Wenn das Bild nicht erscheint,', 'Stream van de exploitant. Als het beeld niet verschijnt,',
    'Emisión del operador. Si la imagen no se muestra,', 'Flusso del gestore. Se l’immagine non appare,',
    'Stroom van die operateur. As die beeld nie wys nie,'
  ],
  webcam_open_tab: [
    'ouvrir dans un onglet ↗', 'open in a new tab ↗', 'in einem Tab öffnen ↗', 'openen in een tabblad ↗',
    'abrir en una pestaña ↗', 'apri in una scheda ↗', 'open in ’n oortjie ↗'
  ],
  webcam_none: [
    'Aucune webcam vérifiée pour ce domaine dans le référentiel.',
    'No verified webcam for this resort in the reference file.',
    'Keine geprüfte Webcam für dieses Gebiet in der Referenzdatei.',
    'Geen gecontroleerde webcam voor dit gebied in het referentiebestand.',
    'Ninguna webcam verificada para este dominio en el fichero de referencia.',
    'Nessuna webcam verificata per questo comprensorio nell’archivio di riferimento.',
    'Geen gekontroleerde webcam vir hierdie gebied in die verwysingslêer nie.'
  ],
  exposure: [
    'Exposition des pistes', 'Slope aspect', 'Pistenexposition', 'Expositie van de pistes',
    'Orientación de las pistas', 'Esposizione delle piste', 'Blootstelling van die plesiere'
  ],
  exposure_note: [
    'Part des kilomètres de pistes par orientation — une majorité nord tient mieux la neige en fin de saison.',
    'Share of run kilometres by aspect — a mostly north-facing resort holds snow better late in the season.',
    'Anteil der Pistenkilometer nach Exposition — überwiegend Nordhänge halten den Schnee am Saisonende besser.',
    'Aandeel pistekilometers per expositie — overwegend noord houdt de sneeuw beter laat in het seizoen.',
    'Proporción de kilómetros de pistas por orientación — una mayoría norte conserva mejor la nieve al final de temporada.',
    'Quota di chilometri di piste per esposizione — una prevalenza nord tiene meglio la neve a fine stagione.',
    'Aandeel kilometers plesiere per blootstelling — meestal noord hou die sneeu beter laat in die seisoen.'
  ],
  avg_price: [
    'Prix moyen des logements', 'Average price of stays', 'Durchschnittspreis der Unterkünfte',
    'Gemiddelde prijs van verblijven', 'Precio medio de los alojamientos', 'Prezzo medio degli alloggi',
    'Gemiddelde prys van verblyf'
  ],
  avg_price_note: [
    'Médiane des offres relevées pour ce domaine, 8 dernières semaines, à séjour comparable.',
    'Median of the offers recorded for this resort over the last 8 weeks, comparable stay.',
    'Median der erfassten Angebote für dieses Gebiet, letzte 8 Wochen, vergleichbarer Aufenthalt.',
    'Mediaan van de vastgelegde aanbiedingen voor dit gebied, laatste 8 weken, vergelijkbaar verblijf.',
    'Mediana de las ofertas registradas para este dominio, últimas 8 semanas, estancia comparable.',
    'Mediana delle offerte rilevate per questo comprensorio, ultime 8 settimane, soggiorno comparabile.',
    'Mediaan van die aangetekende aanbiedinge vir hierdie gebied, laaste 8 weke, vergelykbare verblyf.'
  ],
  see_lodgings: [
    'Voir les logements', 'View stays', 'Unterkünfte ansehen', 'Verblijven bekijken',
    'Ver alojamientos', 'Vedi alloggi', 'Bekyk verblyf'
  ],
  see_lodgings_of_resort: [
    'Voir les logements de ce domaine', 'View stays in this resort', 'Unterkünfte in diesem Gebiet ansehen',
    'Verblijven in dit gebied bekijken', 'Ver alojamientos de este dominio',
    'Vedi gli alloggi di questo comprensorio', 'Bekyk verblyf in hierdie gebied'
  ],

  // --- Risque d'avalanche -------------------------------------------------
  bra_title: [
    'Risque d’avalanche', 'Avalanche risk', 'Lawinengefahr', 'Lawinegevaar',
    'Riesgo de aludes', 'Rischio valanghe', 'Lawinegevaar'
  ],
  bra_official: [
    'Bulletin officiel Météo-France ↗', 'Official Météo-France bulletin ↗', 'Offizielles Météo-France-Bulletin ↗',
    'Officieel Météo-France-bulletin ↗', 'Boletín oficial de Météo-France ↗', 'Bollettino ufficiale Météo-France ↗',
    'Amptelike Météo-France-bulletin ↗'
  ],
  bra_today: ['du jour ↗', 'today ↗', 'von heute ↗', 'van vandaag ↗', 'de hoy ↗', 'di oggi ↗', 'van vandag ↗'],
  bra_level_read: [
    'Niveau lu sur le bulletin :', 'Level read on the bulletin:', 'Im Bulletin gelesene Stufe:',
    'Op het bulletin gelezen niveau:', 'Nivel leído en el boletín:', 'Livello letto sul bollettino:',
    'Vlak op die bulletin gelees:'
  ],
  bra_not_read: [
    'Niveau non renseigné — l’application n’invente pas de risque.',
    'Level not entered — the application does not invent a risk.',
    'Stufe nicht erfasst — die Anwendung erfindet keine Gefahr.',
    'Niveau niet ingevuld — de applicatie verzint geen risico.',
    'Nivel no indicado — la aplicación no inventa ningún riesgo.',
    'Livello non indicato — l’applicazione non inventa un rischio.',
    'Vlak nie ingevul nie — die toepassing versin nie ’n risiko nie.'
  ],
  bra_note: [
    'Le niveau affiché est celui que vous relevez sur le bulletin officiel. Il vaut pour un massif entier et une journée : il ne remplace ni la lecture du BRA avant la sortie, ni l’avis des professionnels sur place.',
    'The level shown is the one you read on the official bulletin. It applies to a whole range for a single day: it replaces neither reading the bulletin before going out, nor local professional advice.',
    'Die angezeigte Stufe ist die, die Sie im offiziellen Bulletin ablesen. Sie gilt für ein ganzes Massiv und einen Tag: sie ersetzt weder das Lesen des Lawinenlageberichts noch die Auskunft der Fachleute vor Ort.',
    'Het getoonde niveau is dat wat u op het officiële bulletin leest. Het geldt voor een heel massief en één dag: het vervangt niet het lezen van het lawinebulletin, noch het advies van professionals ter plaatse.',
    'El nivel mostrado es el que usted lee en el boletín oficial. Vale para todo un macizo y un día: no sustituye la lectura del boletín antes de salir ni el consejo de los profesionales en el terreno.',
    'Il livello mostrato è quello che leggi sul bollettino ufficiale. Vale per un intero massiccio e per una giornata: non sostituisce né la lettura del bollettino prima dell’uscita, né il parere dei professionisti sul posto.',
    'Die vlak wat gewys word, is dié wat jy op die amptelike bulletin lees. Dit geld vir ’n hele bergreeks en een dag: dit vervang nie die lees van die bulletin nie, en ook nie die raad van professionele mense ter plaatse nie.'
  ],
  bra_massif_unknown: [
    'Massif non identifié pour ce domaine : seul le portail Météo-France est proposé.',
    'Range not identified for this resort: only the Météo-France portal is offered.',
    'Massiv für dieses Gebiet nicht erkannt: nur das Météo-France-Portal wird angeboten.',
    'Massief niet herkend voor dit gebied: alleen het Météo-France-portaal wordt aangeboden.',
    'Macizo no identificado para este dominio: solo se ofrece el portal de Météo-France.',
    'Massiccio non identificato per questo comprensorio: viene proposto solo il portale Météo-France.',
    'Bergreeks nie vir hierdie gebied geïdentifiseer nie: slegs die Météo-France-portaal word aangebied.'
  ],
  bra_from_api: [
    'Bulletin Météo-France', 'Météo-France bulletin', 'Météo-France-Bulletin', 'Météo-France-bulletin',
    'Boletín de Météo-France', 'Bollettino Météo-France', 'Météo-France-bulletin'
  ],
  bra_from_manual: [
    'Niveau relevé à la main sur le bulletin officiel',
    'Level entered by hand from the official bulletin',
    'Von Hand aus dem offiziellen Bulletin übernommene Stufe',
    'Handmatig overgenomen niveau van het officiële bulletin',
    'Nivel introducido a mano desde el boletín oficial',
    'Livello inserito a mano dal bollettino ufficiale',
    'Vlak met die hand uit die amptelike bulletin ingevoer'
  ],
  clear_label: ['effacer', 'clear', 'löschen', 'wissen', 'borrar', 'cancella', 'vee uit'],

  // --- Réglages -----------------------------------------------------------
  settings_app: ['Application', 'Application', 'Anwendung', 'Applicatie', 'Aplicación', 'Applicazione', 'Toepassing'],
  settings_sources: ['Sources de données', 'Data sources', 'Datenquellen', 'Gegevensbronnen', 'Fuentes de datos', 'Fonti di dati', 'Databronne'],
  settings_engine: ['Moteur local', 'Local engine', 'Lokale Engine', 'Lokale engine', 'Motor local', 'Motore locale', 'Plaaslike enjin'],
  settings_legal: ['Mentions légales', 'Legal notices', 'Rechtliche Hinweise', 'Juridische informatie', 'Aviso legal', 'Note legali', 'Regskennisgewings'],
  settings_keys: ['Clés d’API', 'API keys', 'API-Schlüssel', 'API-sleutels', 'Claves de API', 'Chiavi API', 'API-sleutels'],
  settings_keys_help: [
    'Stockées chiffrées par Windows (DPAPI) et transmises en mémoire au moteur local. Jamais écrites en clair, jamais versionnées.',
    'Encrypted by Windows (DPAPI) and passed in memory to the local engine. Never written in clear text, never committed.',
    'Von Windows (DPAPI) verschlüsselt und im Arbeitsspeicher an die lokale Engine übergeben. Nie im Klartext gespeichert, nie versioniert.',
    'Versleuteld door Windows (DPAPI) en in het geheugen doorgegeven aan de lokale engine. Nooit in leesbare tekst opgeslagen, nooit in versiebeheer.',
    'Cifradas por Windows (DPAPI) y transmitidas en memoria al motor local. Nunca escritas en claro, nunca versionadas.',
    'Cifrate da Windows (DPAPI) e trasmesse in memoria al motore locale. Mai scritte in chiaro, mai versionate.',
    'Deur Windows (DPAPI) geënkripteer en in geheue aan die plaaslike enjin gegee. Nooit in gewone teks geskryf nie, nooit versiebeheer nie.'
  ],
  settings_key_set: ['Enregistrée', 'Stored', 'Gespeichert', 'Opgeslagen', 'Guardada', 'Salvata', 'Gestoor'],
  settings_key_unset: ['Non renseignée', 'Not set', 'Nicht gesetzt', 'Niet ingevuld', 'Sin definir', 'Non impostata', 'Nie gestel nie'],
  settings_save: ['Enregistrer', 'Save', 'Speichern', 'Opslaan', 'Guardar', 'Salva', 'Stoor'],
  settings_delete: ['Effacer', 'Clear', 'Löschen', 'Wissen', 'Borrar', 'Cancella', 'Vee uit'],
  settings_routing: [
    'Fournisseur d’itinéraires', 'Routing provider', 'Routing-Anbieter', 'Routeaanbieder',
    'Proveedor de rutas', 'Fornitore di itinerari', 'Roeteverskaffer'
  ],
  settings_about: ['À propos', 'About', 'Über', 'Over', 'Acerca de', 'Informazioni', 'Aangaande'],
  settings_language: ['Langue', 'Language', 'Sprache', 'Taal', 'Idioma', 'Lingua', 'Taal'],
  settings_encryption_unavailable: [
    'Le chiffrement système est indisponible : aucune clé ne peut être enregistrée.',
    'OS encryption is unavailable: no key can be stored.',
    'Die Systemverschlüsselung ist nicht verfügbar: es kann kein Schlüssel gespeichert werden.',
    'Systeemversleuteling is niet beschikbaar: er kan geen sleutel worden opgeslagen.',
    'El cifrado del sistema no está disponible: no se puede guardar ninguna clave.',
    'La cifratura di sistema non è disponibile: nessuna chiave può essere salvata.',
    'Stelselenkripsie is nie beskikbaar nie: geen sleutel kan gestoor word nie.'
  ],
  settings_weights: [
    'Poids du classement', 'Ranking weights', 'Gewichtung der Rangfolge', 'Weging van de rangschikking',
    'Pesos de la clasificación', 'Pesi della classifica', 'Gewigte van die rangorde'
  ],
  settings_weights_help: [
    'Ajustez l’importance de chaque critère. Les poids sont renormalisés : mettre un critère à 0 l’exclut du score.',
    'Adjust the importance of each criterion. Weights are renormalised: setting a criterion to 0 excludes it from the score.',
    'Passen Sie die Bedeutung jedes Kriteriums an. Die Gewichte werden neu normiert: ein Kriterium auf 0 schließt es vom Score aus.',
    'Pas het belang van elk criterium aan. De gewichten worden genormaliseerd: een criterium op 0 sluit het uit van de score.',
    'Ajuste la importancia de cada criterio. Los pesos se renormalizan: poner un criterio a 0 lo excluye de la puntuación.',
    'Regola l’importanza di ogni criterio. I pesi sono rinormalizzati: portare un criterio a 0 lo esclude dal punteggio.',
    'Pas die belang van elke maatstaf aan. Die gewigte word hernormaliseer: ’n maatstaf op 0 sluit dit uit die telling.'
  ],
  settings_weights_reset: [
    'Poids par défaut', 'Default weights', 'Standardgewichte', 'Standaardgewichten',
    'Pesos por defecto', 'Pesi predefiniti', 'Verstekgewigte'
  ],
  settings_purge: [
    'Effacer toutes mes données locales', 'Erase all my local data', 'Alle lokalen Daten löschen',
    'Al mijn lokale gegevens wissen', 'Borrar todos mis datos locales', 'Cancella tutti i miei dati locali',
    'Vee al my plaaslike data uit'
  ],
  settings_purge_confirm: [
    'Effacer les voyageurs, les adresses, les filtres, les votes, les logements suivis et l’historique de prix enregistrés sur cette machine ? Cette action est immédiate et sans retour.',
    'Erase the travellers, addresses, filters, votes, tracked stays and price history stored on this machine? This is immediate and cannot be undone.',
    'Reisende, Adressen, Filter, Abstimmungen, verfolgte Unterkünfte und Preisverlauf auf diesem Rechner löschen? Sofort wirksam und nicht rückgängig zu machen.',
    'De reizigers, adressen, filters, stemmen, gevolgde verblijven en prijsgeschiedenis op deze machine wissen? Dit gebeurt meteen en is onomkeerbaar.',
    '¿Borrar los viajeros, direcciones, filtros, votos, alojamientos seguidos e historial de precios guardados en esta máquina? Es inmediato e irreversible.',
    'Cancellare viaggiatori, indirizzi, filtri, voti, alloggi monitorati e storico dei prezzi salvati su questa macchina? È immediato e irreversibile.',
    'Vee die reisigers, adresse, filters, stemme, gevolgde verblyf en prysgeskiedenis op hierdie masjien uit? Dit is onmiddellik en onomkeerbaar.'
  ],

  // --- Réglages : moteur, provenance, itinéraires -------------------------
  settings_provenance: [
    'Provenance des données', 'Where the data comes from', 'Herkunft der Daten',
    'Herkomst van de gegevens', 'Procedencia de los datos', 'Provenienza dei dati',
    'Herkoms van die data'
  ],
  settings_file_loaded: ['Fichier chargé', 'Loaded file', 'Geladene Datei', 'Geladen bestand', 'Fichero cargado', 'File caricato', 'Gelaaide lêer'],
  settings_database: ['Base de données', 'Database', 'Datenbank', 'Database', 'Base de datos', 'Database', 'Databasis'],
  settings_ref_embedded: [
    'Référentiel embarqué', 'Bundled reference file', 'Mitgelieferte Referenzdatei',
    'Meegeleverd referentiebestand', 'Fichero de referencia incluido',
    'Archivio di riferimento incluso', 'Meegeleverde verwysingslêer'
  ],
  settings_data_path: ['Données', 'Data', 'Daten', 'Gegevens', 'Datos', 'Dati', 'Data'],
  settings_engine_only: [
    'Réglage porté par le moteur local, indisponible tant qu’il n’a pas démarré.',
    'Setting held by the local engine, unavailable until it has started.',
    'Einstellung der lokalen Engine, nicht verfügbar solange sie nicht gestartet ist.',
    'Instelling van de lokale engine, niet beschikbaar zolang die niet gestart is.',
    'Ajuste gestionado por el motor local, no disponible mientras no haya arrancado.',
    'Impostazione gestita dal motore locale, non disponibile finché non è avviato.',
    'Instelling by die plaaslike enjin, nie beskikbaar voor dit begin het nie.'
  ],
  engine_restart: ['Redémarrer', 'Restart', 'Neu starten', 'Herstarten', 'Reiniciar', 'Riavvia', 'Herbegin'],
  engine_update: ['Mettre à jour', 'Update', 'Aktualisieren', 'Bijwerken', 'Actualizar', 'Aggiorna', 'Werk by'],
  engine_ref_openskimap: [
    'Référentiel OpenSkiMap du moteur', 'Engine’s OpenSkiMap reference data',
    'OpenSkiMap-Referenzdaten der Engine', 'OpenSkiMap-referentiegegevens van de engine',
    'Fichero de referencia OpenSkiMap del motor', 'Archivio di riferimento OpenSkiMap del motore',
    'Enjin se OpenSkiMap-verwysingsdata'
  ],
  routing_ors: [
    'OpenRouteService (isochrones + péages)', 'OpenRouteService (isochrones + tolls)',
    'OpenRouteService (Isochronen + Maut)', 'OpenRouteService (isochronen + tol)',
    'OpenRouteService (isócronas + peajes)', 'OpenRouteService (isocrone + pedaggi)',
    'OpenRouteService (isochrone + tolgeld)'
  ],
  routing_osrm: [
    'OSRM (sans clé, sans isochrone ni péage)', 'OSRM (no key, no isochrones or tolls)',
    'OSRM (ohne Schlüssel, ohne Isochronen und Maut)', 'OSRM (zonder sleutel, zonder isochronen of tol)',
    'OSRM (sin clave, sin isócronas ni peajes)', 'OSRM (senza chiave, senza isocrone né pedaggi)',
    'OSRM (sonder sleutel, sonder isochrone of tolgeld)'
  ],

  // --- Filtres de logement ------------------------------------------------
  stay_label: ['Séjour', 'Stay', 'Aufenthalt', 'Verblijf', 'Estancia', 'Soggiorno', 'Verblyf'],
  arrival: ['Arrivée', 'Check-in', 'Anreise', 'Aankomst', 'Llegada', 'Arrivo', 'Aankoms'],
  departure_label: ['Départ', 'Check-out', 'Abreise', 'Vertrek', 'Salida', 'Partenza', 'Vertrek'],
  lodg_price_allin_note: [
    'Prix tout compris : ménage, taxe de séjour et frais de service inclus.',
    'All-in price: cleaning, tourist tax and service fees included.',
    'Gesamtpreis: Endreinigung, Kurtaxe und Servicegebühren inbegriffen.',
    'Totaalprijs: schoonmaak, toeristenbelasting en servicekosten inbegrepen.',
    'Precio todo incluido: limpieza, tasa turística y gastos de servicio incluidos.',
    'Prezzo tutto compreso: pulizie, tassa di soggiorno e costi di servizio inclusi.',
    'Alles-in-prys: skoonmaak, toeristebelasting en diensfooie ingesluit.'
  ],
  sources_label: ['Sources', 'Sources', 'Quellen', 'Bronnen', 'Fuentes', 'Fonti', 'Bronne'],
  // --- Panneau « État du relevé » ------------------------------------------
  scan_running: ['Relevé en cours…', 'Search running…', 'Abfrage läuft…', 'Zoekopdracht loopt…', 'Búsqueda en curso…', 'Rilevamento in corso…', 'Soektog aan die gang…'],
  scan_auto_on_open: [
    'Relevé automatique à l’ouverture de l’écran',
    'Automatic search when the screen opens',
    'Automatische Abfrage beim Öffnen des Bildschirms',
    'Automatische zoekopdracht bij het openen van het scherm',
    'Búsqueda automática al abrir la pantalla',
    'Rilevamento automatico all’apertura della schermata',
    'Outomatiese soektog wanneer die skerm oopmaak'
  ],
  scan_sources_uptodate: [
    'Les {n} sources sont à jour', 'All {n} sources are up to date', 'Alle {n} Quellen sind aktuell',
    'Alle {n} bronnen zijn actueel', 'Las {n} fuentes están al día', 'Le {n} fonti sono aggiornate',
    'Al {n} bronne is op datum'
  ],
  scan_sources_partial: [
    '{ok} source(s) sur {n} à jour', '{ok} of {n} sources up to date', '{ok} von {n} Quellen aktuell',
    '{ok} van {n} bronnen actueel', '{ok} de {n} fuentes al día', '{ok} fonti su {n} aggiornate',
    '{ok} van {n} bronne op datum'
  ],
  scan_unreachable: ['injoignable :', 'unreachable:', 'nicht erreichbar:', 'onbereikbaar:', 'inaccesible:', 'irraggiungibile:', 'onbereikbaar:'],
  scan_over_48h: [
    'relevé de plus de 48 h :', 'recorded over 48 h ago:', 'Abfrage älter als 48 Std.:',
    'ouder dan 48 u vastgelegd:', 'registrado hace más de 48 h:', 'rilevato da oltre 48 h:',
    'meer as 48 u gelede aangeteken:'
  ],
  scan_median: ['médiane du domaine', 'resort median', 'Median des Gebiets', 'mediaan van het gebied', 'mediana del dominio', 'mediana del comprensorio', 'mediaan van die gebied'],
  scan_merge_dupes: [
    'Fusionner les doublons', 'Merge duplicates', 'Duplikate zusammenführen', 'Duplicaten samenvoegen',
    'Fusionar duplicados', 'Unisci i duplicati', 'Voeg duplikate saam'
  ],
  scan_dupes_merged: [
    '{n} doublon(s) fusionné(s)', '{n} duplicate(s) merged', '{n} Duplikat(e) zusammengeführt',
    '{n} duplica(a)t(en) samengevoegd', '{n} duplicado(s) fusionado(s)', '{n} duplicato/i unito/i',
    '{n} duplikaat/duplikate saamgevoeg'
  ],
  scan_no_dupes: ['aucun doublon', 'no duplicates', 'keine Duplikate', 'geen duplicaten', 'ningún duplicado', 'nessun duplicato', 'geen duplikate'],
  geo_positions_tally: [
    '{n} position(s) · {v} publiée(s) par la source, {e} déduite(s)',
    '{n} position(s) · {v} published by the source, {e} inferred',
    '{n} Position(en) · {v} von der Quelle veröffentlicht, {e} abgeleitet',
    '{n} positie(s) · {v} door de bron gepubliceerd, {e} afgeleid',
    '{n} posición(es) · {v} publicada(s) por la fuente, {e} deducida(s)',
    '{n} posizione/i · {v} pubblicata/e dalla fonte, {e} dedotta/e',
    '{n} posisie(s) · {v} deur die bron gepubliseer, {e} afgelei'
  ],
  geo_bad_tally: [
    '⚠ {n} position(s) invraisemblable(s) — plan d’eau, pleine montagne ou hors périmètre',
    '⚠ {n} implausible position(s) — water, open mountain or outside the area',
    '⚠ {n} unplausible Position(en) — Gewässer, freies Gelände oder außerhalb des Gebiets',
    '⚠ {n} onwaarschijnlijke positie(s) — water, open berg of buiten het gebied',
    '⚠ {n} posición(es) inverosímil(es) — agua, montaña abierta o fuera del perímetro',
    '⚠ {n} posizione/i inverosimile/i — acqua, montagna aperta o fuori perimetro',
    '⚠ {n} onwaarskynlike posisie(s) — water, oop berg of buite die gebied'
  ],
  geo_warn_tally: [
    '{n} position(s) douteuse(s) — fond de vallée, ou aucun bâtiment cartographié à proximité',
    '{n} doubtful position(s) — valley floor, or no mapped building nearby',
    '{n} zweifelhafte Position(en) — Talboden oder kein kartiertes Gebäude in der Nähe',
    '{n} twijfelachtige positie(s) — dalbodem, of geen gekarteerd gebouw in de buurt',
    '{n} posición(es) dudosa(s) — fondo de valle, o ningún edificio cartografiado cerca',
    '{n} posizione/i dubbia/e — fondovalle, o nessun edificio mappato nelle vicinanze',
    '{n} twyfelagtige posisie(s) — valleivloer, of geen gekarteerde gebou naby nie'
  ],
  geo_waiting_tally: [
    '{n} position(s) en cours de vérification…', '{n} position(s) being checked…',
    '{n} Position(en) werden geprüft…', '{n} positie(s) worden gecontroleerd…',
    '{n} posición(es) en verificación…', '{n} posizione/i in verifica…',
    '{n} posisie(s) word nagegaan…'
  ],
  geo_hide_bad: [
    'Masquer les positions invraisemblables', 'Hide implausible positions',
    'Unplausible Positionen ausblenden', 'Onwaarschijnlijke posities verbergen',
    'Ocultar las posiciones inverosímiles', 'Nascondi le posizioni inverosimili',
    'Versteek onwaarskynlike posisies'
  ],
  geo_recheck: [
    'Revérifier les positions', 'Re-check the positions', 'Positionen erneut prüfen',
    'Posities opnieuw controleren', 'Volver a verificar las posiciones', 'Riverifica le posizioni',
    'Gaan posisies weer na'
  ],
  geo_rechecking: ['Vérification…', 'Checking…', 'Wird geprüft…', 'Controleren…', 'Verificando…', 'Verifica…', 'Nagaan…'],
  geo_panel_note: [
    'Altitudes issues du modèle d’élévation Open-Meteo ; plan d’eau et bâti d’OpenStreetMap. Une position déduite est placée autour du front de neige, jamais à l’adresse réelle du bien — elle sert à situer, pas à s’y rendre.',
    'Altitudes from the Open-Meteo elevation model; water and buildings from OpenStreetMap. An inferred position is placed around the snow front, never at the property’s real address — it locates, it does not guide.',
    'Höhen aus dem Open-Meteo-Höhenmodell; Gewässer und Gebäude aus OpenStreetMap. Eine abgeleitete Position liegt rund um die Talstation, nie an der echten Adresse — sie verortet, sie führt nicht hin.',
    'Hoogtes uit het Open-Meteo-hoogtemodel; water en gebouwen uit OpenStreetMap. Een afgeleide positie ligt rond het sneeuwfront, nooit op het echte adres — ze situeert, ze leidt niet.',
    'Altitudes del modelo de elevación Open-Meteo; agua y edificios de OpenStreetMap. Una posición deducida se sitúa alrededor del frente de nieve, nunca en la dirección real — sirve para situar, no para llegar.',
    'Quote dal modello di elevazione Open-Meteo; acqua ed edifici da OpenStreetMap. Una posizione dedotta è collocata attorno al fronte neve, mai all’indirizzo reale — serve a situare, non ad arrivarci.',
    'Hoogtes uit die Open-Meteo-hoogtemodel; water en geboue uit OpenStreetMap. ’n Afgeleide posisie lê rondom die sneeufront, nooit by die werklike adres nie — dit plaas, dit lei nie.'
  ],
  tracking_quiet_hours: [
    'Ne pas notifier entre 22 h et 8 h', 'No notifications between 10 pm and 8 am',
    'Keine Benachrichtigungen zwischen 22 und 8 Uhr', 'Geen meldingen tussen 22 en 8 uur',
    'Sin notificaciones entre las 22 h y las 8 h', 'Nessuna notifica tra le 22 e le 8',
    'Geen kennisgewings tussen 22:00 en 08:00 nie'
  ],
  tracking_quiet_hours_short: [
    'pas de notification entre 22 h et 8 h', 'no notifications between 10 pm and 8 am',
    'keine Benachrichtigungen zwischen 22 und 8 Uhr', 'geen meldingen tussen 22 en 8 uur',
    'sin notificaciones entre las 22 h y las 8 h', 'nessuna notifica tra le 22 e le 8',
    'geen kennisgewings tussen 22:00 en 08:00 nie'
  ],

  lodgmap_hint: [
    '● prix tout compris — cliquez une bulle pour remonter le logement en tête de liste',
    '● all-in price — click a bubble to move that stay to the top of the list',
    '● Preis inklusive — Blase anklicken, um die Unterkunft an den Listenanfang zu setzen',
    '● alles-in prijs — klik een bel om dat verblijf bovenaan de lijst te zetten',
    '● precio todo incluido — haga clic en una burbuja para subir el alojamiento al principio',
    '● prezzo tutto compreso — clicca una bolla per portare l’alloggio in cima all’elenco',
    '● alles-in prys — klik ’n borrel om daardie verblyf boaan die lys te sit'
  ],
  lodg_picked_on_map: [
    'Choisi sur la carte', 'Picked on the map', 'Auf der Karte gewählt', 'Op de kaart gekozen',
    'Elegido en el mapa', 'Scelto sulla mappa', 'Op die kaart gekies'
  ],
  lodg_picked_banner: [
    'Choisi sur la carte : {n} — remonté en tête de liste',
    'Picked on the map: {n} — moved to the top of the list',
    'Auf der Karte gewählt: {n} — an den Listenanfang gesetzt',
    'Op de kaart gekozen: {n} — bovenaan de lijst gezet',
    'Elegido en el mapa: {n} — subido al principio de la lista',
    'Scelto sulla mappa: {n} — portato in cima all’elenco',
    'Op die kaart gekies: {n} — boaan die lys gesit'
  ],
  lodg_picked_clear: [
    'retirer la mise en avant', 'remove the highlight', 'Hervorhebung entfernen',
    'markering verwijderen', 'quitar el destacado', 'rimuovi l’evidenziazione',
    'verwyder die uitlig'
  ],
  lodg_source_toggle: [
    'Afficher / masquer cette source', 'Show / hide this source', 'Diese Quelle ein-/ausblenden',
    'Deze bron tonen / verbergen', 'Mostrar / ocultar esta fuente', 'Mostra / nascondi questa fonte',
    'Wys / versteek hierdie bron'
  ],
  lodg_sources_note: [
    'Une bulle pleine est une source affichée. Cliquez-la pour masquer ses offres ; le décompte reste visible.',
    'A filled bubble is a source being shown. Click it to hide its offers; the count stays visible.',
    'Eine gefüllte Blase ist eine angezeigte Quelle. Klicken Sie darauf, um ihre Angebote auszublenden; die Anzahl bleibt sichtbar.',
    'Een gevulde bel is een getoonde bron. Klik erop om de aanbiedingen te verbergen; het aantal blijft zichtbaar.',
    'Una burbuja llena es una fuente mostrada. Haga clic para ocultar sus ofertas; el recuento sigue visible.',
    'Una bolla piena è una fonte mostrata. Cliccatela per nascondere le sue offerte; il conteggio resta visibile.',
    '’n Gevulde borrel is ’n bron wat gewys word. Klik daarop om sy aanbiedinge te versteek; die telling bly sigbaar.'
  ],
  lodg_prefilled_search: [
    'Recherche pré-remplie sur le site', 'Pre-filled search on the site',
    'Vorausgefüllte Suche auf der Website', 'Vooraf ingevulde zoekopdracht op de site',
    'Búsqueda prerrellenada en el sitio', 'Ricerca precompilata sul sito',
    'Vooraf ingevulde soektog op die webwerf'
  ],
  lodg_official_site: [
    'Site officiel de la station', 'Resort’s official site',
    'Offizielle Website des Skiorts', 'Officiële site van het skioord',
    'Sitio oficial de la estación', 'Sito ufficiale della stazione',
    'Amptelike webwerf van die oord'
  ],
  lodg_official_unverified: [
    'non vérifié', 'unverified', 'nicht geprüft', 'niet geverifieerd',
    'sin verificar', 'non verificato', 'nie geverifieer nie'
  ],
  lodg_official_unverified_note: [
    'Adresse déduite : l’hôte existe mais n’a pas répondu à la vérification.',
    'Inferred address: the host exists but did not answer the check.',
    'Abgeleitete Adresse: Der Host existiert, hat die Prüfung aber nicht beantwortet.',
    'Afgeleid adres: de host bestaat, maar antwoordde niet op de controle.',
    'Dirección deducida: el servidor existe pero no respondió a la comprobación.',
    'Indirizzo dedotto: l’host esiste ma non ha risposto alla verifica.',
    'Afgeleide adres: die gasheer bestaan, maar het nie op die kontrole geantwoord nie.'
  ],
  lodg_station_query: [
    'Recherché sous « {n} » — le nom de la station, celui que les sites de réservation reconnaissent.',
    'Searched as “{n}” — the resort name, the one booking sites recognise.',
    'Gesucht unter „{n}“ — der Ortsname, den Buchungsseiten kennen.',
    'Gezocht als “{n}” — de naam van het skioord, die boekingssites herkennen.',
    'Buscado como «{n}» — el nombre de la estación, el que reconocen los sitios de reserva.',
    'Cercato come «{n}» — il nome della stazione, quello riconosciuto dai siti di prenotazione.',
    'Gesoek as “{n}” — die oord se naam, dié wat besprekingswebwerwe herken.'
  ],
  kids_count_note: [
    'Compte pour les forfaits (tarif enfant), le matériel et les cours ESF.',
    'Counts for passes (child rate), equipment and ski-school lessons.',
    'Zählt für Skipässe (Kindertarif), Ausrüstung und Skikurse.',
    'Telt mee voor skipassen (kindertarief), materiaal en skilessen.',
    'Cuenta para los forfaits (tarifa infantil), el material y las clases de esquí.',
    'Conta per gli skipass (tariffa bambini), il materiale e i corsi di sci.',
    'Tel vir kaartjies (kindertarief), toerusting en skilesse.'
  ],
  walk_dist_note: [
    'À pied, dénivelé compté — 300 m à plat ≠ 300 m avec 60 m de montée skis à l’épaule.',
    'On foot, vertical included — 300 m flat ≠ 300 m with a 60 m climb carrying skis.',
    'Zu Fuß, Höhenmeter mitgezählt — 300 m eben ≠ 300 m mit 60 m Anstieg, Ski auf der Schulter.',
    'Te voet, hoogtemeters meegeteld — 300 m vlak ≠ 300 m met 60 m klim met de ski’s op de schouder.',
    'A pie, con desnivel — 300 m en llano ≠ 300 m con 60 m de subida con los esquís al hombro.',
    'A piedi, dislivello compreso — 300 m in piano ≠ 300 m con 60 m di salita con gli sci in spalla.',
    'Te voet, hoogte ingesluit — 300 m gelyk ≠ 300 m met ’n 60 m klim met ski’s op die skouer.'
  ],
  deeplinks_note: [
    'URL construites depuis vos critères. Une annonce vous plaît ? Importez-la pour la comparer ici.',
    'URLs built from your criteria. Found a listing you like? Import it to compare it here.',
    'Aus Ihren Kriterien erzeugte URLs. Eine Anzeige gefällt Ihnen? Importieren Sie sie zum Vergleich.',
    'URL’s opgebouwd uit uw criteria. Een advertentie die u bevalt? Importeer die om ze hier te vergelijken.',
    'URL construidas a partir de sus criterios. ¿Le gusta un anuncio? Impórtelo para compararlo aquí.',
    'URL costruite dai tuoi criteri. Un annuncio ti piace? Importalo per confrontarlo qui.',
    'URL’s uit jou kriteria gebou. ’n Advertensie wat jou aanstaan? Voer dit in om dit hier te vergelyk.'
  ],
  lodg_filters_reset: [
    'Réinitialiser les filtres', 'Reset the filters', 'Filter zurücksetzen',
    'Filters herstellen', 'Restablecer los filtros', 'Reimposta i filtri', 'Herstel die filters'
  ],

  // --- Écran Logements ----------------------------------------------------
  lodg_no_domain: [
    'Aucun domaine dans le référentiel.', 'No resort in the reference file.',
    'Kein Skigebiet in der Referenzdatei.', 'Geen skigebied in het referentiebestand.',
    'Ningún dominio en el fichero de referencia.', 'Nessun comprensorio nell’archivio di riferimento.',
    'Geen skigebied in die verwysingslêer nie.'
  ],
  lodg_dates_invalid: [
    'Indiquez une arrivée et un départ valides (arrivée avant départ).',
    'Enter a valid check-in and check-out (check-in before check-out).',
    'Geben Sie gültige An- und Abreisedaten an (Anreise vor Abreise).',
    'Voer een geldige aankomst en vertrek in (aankomst vóór vertrek).',
    'Indique una llegada y una salida válidas (llegada antes que salida).',
    'Inserisci un arrivo e una partenza validi (arrivo prima della partenza).',
    'Voer ’n geldige aankoms en vertrek in (aankoms voor vertrek).'
  ],
  lodg_see_imported: [
    'Voir les logements déjà importés', 'View stays already imported',
    'Bereits importierte Unterkünfte ansehen', 'Reeds geïmporteerde verblijven bekijken',
    'Ver los alojamientos ya importados', 'Vedi gli alloggi già importati',
    'Bekyk reeds ingevoerde verblyf'
  ],
  lodg_awaiting_scan: [
    'En attente du relevé…', 'Waiting for the scan…', 'Warten auf die Erfassung…',
    'Wachten op de meting…', 'Esperando el registro…', 'In attesa del rilevamento…',
    'Wag vir die opname…'
  ],
  lodg_recheck_again: [
    'Revérifier à nouveau ↗', 'Check again ↗', 'Erneut prüfen ↗', 'Opnieuw controleren ↗',
    'Volver a comprobar ↗', 'Verifica di nuovo ↗', 'Kontroleer weer ↗'
  ],
  lodg_rescan: [
    'Relancer le relevé', 'Run the scan again', 'Erfassung neu starten',
    'Opnieuw ophalen', 'Reiniciar la búsqueda', 'Riavvia il rilevamento',
    'Begin die opname weer'
  ],

  // --- Fiche logement -----------------------------------------------------
  lodg_no_photo: [
    'offre simulée — sans photo', 'simulated offer — no photo', 'simuliertes Angebot — ohne Foto',
    'gesimuleerde aanbieding — zonder foto', 'oferta simulada — sin foto',
    'offerta simulata — senza foto', 'gesimuleerde aanbod — sonder foto'
  ],
  fee_cleaning: ['Frais de ménage', 'Cleaning fee', 'Endreinigung', 'Schoonmaakkosten', 'Gastos de limpieza', 'Spese di pulizia', 'Skoonmaakfooi'],
  fee_stay_tax: ['Taxe de séjour', 'Tourist tax', 'Kurtaxe', 'Toeristenbelasting', 'Tasa turística', 'Tassa di soggiorno', 'Toeristebelasting'],
  access_label: ['Accès', 'Access', 'Zugang', 'Toegang', 'Acceso', 'Accesso', 'Toegang'],
  runs_on_foot: ['Pistes à pied', 'Runs on foot', 'Pisten zu Fuß', 'Pistes te voet', 'Pistas a pie', 'Piste a piedi', 'Plesiere te voet'],
  nearest_lift: [
    'Remontée la plus proche', 'Nearest lift', 'Nächste Bergbahn', 'Dichtstbijzijnde lift',
    'Remonte más cercano', 'Impianto più vicino', 'Naaste skilif'
  ],
  full_stay_cost: [
    'Coût complet du séjour', 'Full cost of the stay', 'Gesamtkosten des Aufenthalts',
    'Totale kosten van het verblijf', 'Coste total de la estancia', 'Costo totale del soggiorno',
    'Volle koste van die verblyf'
  ],
  rental_6days: [
    'Matériel de location — 6 jours', 'Rental equipment — 6 days', 'Leihausrüstung — 6 Tage',
    'Huurmateriaal — 6 dagen', 'Material de alquiler — 6 días', 'Attrezzatura a noleggio — 6 giorni',
    'Huurtoerusting — 6 dae'
  ],
  rental_option: [
    'Ajouter le matériel de location (96 €/adulte, 58 €/enfant)',
    'Add rental equipment (€96/adult, €58/child)',
    'Leihausrüstung hinzufügen (96 €/Erwachsener, 58 €/Kind)',
    'Huurmateriaal toevoegen (€96/volwassene, €58/kind)',
    'Añadir el material de alquiler (96 €/adulto, 58 €/niño)',
    'Aggiungi l’attrezzatura a noleggio (96 €/adulto, 58 €/bambino)',
    'Voeg huurtoerusting by (€96/grootmens, €58/kind)'
  ],

  // --- Premier lancement, voyageurs ---------------------------------------
  welcome_sub: [
    'Trois réglages pour personnaliser toutes les recherches — modifiables à tout moment dans les filtres.',
    'Three settings to tailor every search — changeable at any time in the filters.',
    'Drei Einstellungen für alle Suchen — jederzeit in den Filtern änderbar.',
    'Drie instellingen voor al uw zoekopdrachten — altijd aanpasbaar in de filters.',
    'Tres ajustes para personalizar todas las búsquedas — modificables en cualquier momento en los filtros.',
    'Tre impostazioni per personalizzare tutte le ricerche — modificabili in qualsiasi momento nei filtri.',
    'Drie instellings vir alle soektogte — enige tyd in die filters verstelbaar.'
  ],
  your_stay: ['Votre séjour', 'Your stay', 'Ihr Aufenthalt', 'Uw verblijf', 'Su estancia', 'Il tuo soggiorno', 'Jou verblyf'],
  start_point_car: [
    'Point de départ (trajets voiture)', 'Starting point (driving times)', 'Startpunkt (Fahrzeiten)',
    'Vertrekpunt (rijtijden)', 'Punto de partida (tiempos en coche)', 'Punto di partenza (tempi in auto)',
    'Vertrekpunt (rytye)'
  ],
  theme_label: ['Thème', 'Theme', 'Thema', 'Thema', 'Tema', 'Tema', 'Tema'],
  travelers_departures: [
    'Voyageurs et départs', 'Travellers and departures', 'Reisende und Startpunkte',
    'Reizigers en vertrekpunten', 'Viajeros y salidas', 'Viaggiatori e partenze',
    'Reisigers en vertrekpunte'
  ],
  the_departures: ['Les départs', 'The departures', 'Die Startpunkte', 'De vertrekpunten', 'Las salidas', 'Le partenze', 'Die vertrekpunte'],
  add_departure: [
    '＋ Ajouter un départ', '＋ Add a departure', '＋ Startpunkt hinzufügen', '＋ Vertrekpunt toevoegen',
    '＋ Añadir una salida', '＋ Aggiungi una partenza', '＋ Voeg ’n vertrekpunt by'
  ],
  reset_lower: ['réinitialiser', 'reset', 'zurücksetzen', 'herstellen', 'restablecer', 'reimposta', 'herstel'],

  // --- Filtres : foyers ---------------------------------------------------
  households_note: [
    'Plusieurs foyers : filtre et tri sur le foyer le plus éloigné, route comptée pour chaque voiture.',
    'Several households: filtering and sorting use the farthest one, and the drive is counted per car.',
    'Mehrere Haushalte: Filter und Sortierung nach dem entferntesten, die Fahrt zählt je Fahrzeug.',
    'Meerdere huishoudens: filteren en sorteren op het verste, de rit telt per auto.',
    'Varios hogares: el filtro y el orden usan el más lejano, y la ruta se cuenta por coche.',
    'Più nuclei: filtro e ordinamento sul più lontano, il viaggio è contato per ogni auto.',
    'Meer as een huishouding: filter en sortering op die verste, die rit tel per motor.'
  ],
  manage_travelers: [
    '+ Gérer les voyageurs et les départs', '+ Manage travellers and departures',
    '+ Reisende und Startpunkte verwalten', '+ Reizigers en vertrekpunten beheren',
    '+ Gestionar viajeros y salidas', '+ Gestisci viaggiatori e partenze',
    '+ Bestuur reisigers en vertrekpunte'
  ],
  no_household: [
    'Aucun foyer au départ.', 'No household set as departure.', 'Kein Haushalt als Startpunkt.',
    'Geen huishouden als vertrekpunt.', 'Ningún hogar como punto de salida.',
    'Nessun nucleo come punto di partenza.', 'Geen huishouding as vertrekpunt nie.'
  ],

  // --- Import d'annonce ---------------------------------------------------
  import_no_request: ['aucune requête', 'no request', 'keine Anfrage', 'geen verzoek', 'ninguna solicitud', 'nessuna richiesta', 'geen versoek'],
  import_refused: [
    'Lecture automatique refusée', 'Automated read refused', 'Automatisches Lesen abgelehnt',
    'Automatisch lezen geweigerd', 'Lectura automática rechazada', 'Lettura automatica rifiutata',
    'Outomatiese lees geweier'
  ],
  import_bookmarklet: [
    'Ou marque-page (recommandé)', 'Or bookmarklet (recommended)', 'Oder Lesezeichen (empfohlen)',
    'Of bladwijzer (aanbevolen)', 'O marcador (recomendado)', 'O segnalibro (consigliato)',
    'Of boekmerk (aanbeveel)'
  ],
  import_open_search: [
    'Ouvrez la recherche Airbnb du domaine, déjà pré-remplie avec vos dates.',
    'Open the resort’s Airbnb search, already pre-filled with your dates.',
    'Öffnen Sie die Airbnb-Suche des Gebiets, bereits mit Ihren Daten vorausgefüllt.',
    'Open de Airbnb-zoekopdracht van het gebied, al ingevuld met uw data.',
    'Abra la búsqueda de Airbnb del dominio, ya prerrellenada con sus fechas.',
    'Apri la ricerca Airbnb del comprensorio, già precompilata con le tue date.',
    'Open die gebied se Airbnb-soektog, reeds met jou datums ingevul.'
  ],
  import_scroll_then_click: [
    'Sur la page de résultats, faites défiler pour charger les annonces, puis cliquez le marque-page',
    'On the results page, scroll to load the listings, then click the bookmarklet',
    'Scrollen Sie auf der Ergebnisseite, um die Anzeigen zu laden, dann das Lesezeichen anklicken',
    'Scroll op de resultatenpagina om de advertenties te laden en klik dan op de bladwijzer',
    'En la página de resultados, desplácese para cargar los anuncios y luego haga clic en el marcador',
    'Nella pagina dei risultati, scorri per caricare gli annunci, poi clicca il segnalibro',
    'Rol op die resultatebladsy om die advertensies te laai, klik dan die boekmerk'
  ],

  // --- Divers écrans ------------------------------------------------------
  pass_day_adult: ['Journée adulte', 'Adult day pass', 'Tageskarte Erwachsene', 'Dagpas volwassene', 'Forfait de día adulto', 'Giornaliero adulti', 'Dagkaartjie grootmens'],
  pass_per_ski_day: [
    'Coût / jour skié', 'Cost per ski day', 'Kosten je Skitag', 'Kosten per skidag',
    'Coste por día esquiado', 'Costo per giorno sciato', 'Koste per skidag'
  ],
  pass_details: [
    'Détail des forfaits', 'Pass details', 'Skipass-Details', 'Details skipassen',
    'Detalle de los forfaits', 'Dettaglio degli skipass', 'Kaartjiebesonderhede'
  ],
  map_lift: ['remontée mécanique', 'ski lift', 'Bergbahn', 'skilift', 'remonte', 'impianto di risalita', 'skilif'],
  map_clicked_first: [
    'cliquée — remonte en tête de liste', 'clicked — moves to the top of the list',
    'angeklickt — erscheint oben in der Liste', 'aangeklikt — komt bovenaan de lijst',
    'seleccionada — pasa al principio de la lista', 'selezionata — va in cima all’elenco',
    'gekliek — skuif na die bokant van die lys'
  ],
  iso_needs_engine: [
    'Les isochrones demandent le moteur local et une clé OpenRouteService.',
    'Isochrones require the local engine and an OpenRouteService key.',
    'Isochronen benötigen die lokale Engine und einen OpenRouteService-Schlüssel.',
    'Isochronen vereisen de lokale engine en een OpenRouteService-sleutel.',
    'Las isócronas requieren el motor local y una clave de OpenRouteService.',
    'Le isocrone richiedono il motore locale e una chiave OpenRouteService.',
    'Isochrone vereis die plaaslike enjin en ’n OpenRouteService-sleutel.'
  ],
  geo_all_consistent: [
    'Toutes les positions sont cohérentes avec le relief de la station.',
    'Every position is consistent with the resort’s terrain.',
    'Alle Positionen stimmen mit dem Relief des Gebiets überein.',
    'Alle posities kloppen met het reliëf van het gebied.',
    'Todas las posiciones son coherentes con el relieve de la estación.',
    'Tutte le posizioni sono coerenti con il rilievo della stazione.',
    'Alle posisies strook met die gebied se reliëf.'
  ],
  geo_osm_unavailable: [
    'Plan d’eau et bâti non vérifiés : Overpass est injoignable. Les altitudes, elles, sont relevées.',
    'Water and buildings unchecked: Overpass is unreachable. Elevations were still recorded.',
    'Gewässer und Bebauung ungeprüft: Overpass ist nicht erreichbar. Die Höhen wurden erfasst.',
    'Water en bebouwing niet gecontroleerd: Overpass is onbereikbaar. De hoogtes zijn wel opgehaald.',
    'Agua y edificios sin verificar: Overpass no responde. Las altitudes sí se han registrado.',
    'Acqua ed edifici non verificati: Overpass è irraggiungibile. Le quote sono state rilevate.',
    'Water en geboue nie gekontroleer nie: Overpass is onbereikbaar. Die hoogtes is wel aangeteken.'
  ],
  decision_none: [
    'Aucune décision enregistrée', 'No decision recorded', 'Keine Entscheidung erfasst',
    'Geen beslissing vastgelegd', 'Ninguna decisión registrada', 'Nessuna decisione registrata',
    'Geen besluit aangeteken nie'
  ],
  decision_cost_by_item: [
    'Le coût, poste par poste', 'The cost, item by item', 'Die Kosten, Posten für Posten',
    'De kosten, post voor post', 'El coste, partida por partida', 'Il costo, voce per voce',
    'Die koste, item vir item'
  ],
  decision_cancel: [
    'Annuler la décision', 'Cancel the decision', 'Entscheidung aufheben',
    'Beslissing annuleren', 'Anular la decisión', 'Annulla la decisione', 'Kanselleer die besluit'
  ],
  offers_total_cost: [
    'Coût total du séjour', 'Total cost of the stay', 'Gesamtkosten des Aufenthalts',
    'Totale kosten van het verblijf', 'Coste total de la estancia', 'Costo totale del soggiorno',
    'Totale koste van die verblyf'
  ],
  offers_empty_hint: [
    'Augmentez le budget total, réduisez le nombre de voyageurs ou assouplissez les filtres de domaines.',
    'Raise the total budget, reduce the number of travellers, or relax the resort filters.',
    'Erhöhen Sie das Gesamtbudget, verringern Sie die Zahl der Reisenden oder lockern Sie die Gebietsfilter.',
    'Verhoog het totale budget, verminder het aantal reizigers of versoepel de gebiedsfilters.',
    'Aumente el presupuesto total, reduzca el número de viajeros o relaje los filtros de dominios.',
    'Aumenta il budget totale, riduci il numero di viaggiatori o allenta i filtri dei comprensori.',
    'Verhoog die totale begroting, verminder die reisigers, of versoepel die gebiedsfilters.'
  ],
  alert_threshold: [
    'Seuil de déclenchement', 'Trigger threshold', 'Auslöseschwelle', 'Drempelwaarde',
    'Umbral de activación', 'Soglia di attivazione', 'Sneller-drempel'
  ],
  tracking_sub: [
    'relevé toutes les heures · notification Windows en cas de baisse ≥ 5 % ou de nouvelle disponibilité',
    'checked hourly · Windows notification on a drop of 5% or more, or new availability',
    'stündlich erfasst · Windows-Benachrichtigung bei einem Rückgang ab 5 % oder neuer Verfügbarkeit',
    'elk uur opgehaald · Windows-melding bij een daling van 5 % of meer, of nieuwe beschikbaarheid',
    'consultado cada hora · notificación de Windows si baja un 5 % o más, o si hay disponibilidad',
    'rilevato ogni ora · notifica Windows per un calo del 5 % o più, o nuova disponibilità',
    'elke uur nagegaan · Windows-kennisgewing by ’n daling van 5 % of meer, of nuwe beskikbaarheid'
  ],
  tracking_note: [
    'Le relevé continue toutes les heures dans tous les cas ; seul l’affichage des notifications change.',
    'The hourly check runs either way; only how notifications are shown changes.',
    'Die stündliche Erfassung läuft in jedem Fall; nur die Anzeige der Benachrichtigungen ändert sich.',
    'De meting loopt hoe dan ook elk uur door; alleen de weergave van meldingen verandert.',
    'El registro continúa cada hora en todos los casos; solo cambia cómo se muestran las notificaciones.',
    'Il rilevamento prosegue ogni ora in ogni caso; cambia solo la visualizzazione delle notifiche.',
    'Die opname loop in elk geval elke uur; net die vertoon van kennisgewings verander.'
  ],
  copy_summary: [
    'Copier le récapitulatif', 'Copy the summary', 'Zusammenfassung kopieren',
    'Samenvatting kopiëren', 'Copiar el resumen', 'Copia il riepilogo', 'Kopieer die opsomming'
  ],
  back_to_results: [
    '← Retour aux résultats', '← Back to results', '← Zurück zu den Ergebnissen',
    '← Terug naar de resultaten', '← Volver a los resultados', '← Torna ai risultati',
    '← Terug na die resultate'
  ],
  dist_not_computed: [
    'Distance aux pistes non calculée — nécessite le moteur local.',
    'Distance to the runs not computed — needs the local engine.',
    'Entfernung zu den Pisten nicht berechnet — benötigt die lokale Engine.',
    'Afstand tot de pistes niet berekend — vereist de lokale engine.',
    'Distancia a las pistas sin calcular — requiere el motor local.',
    'Distanza dalle piste non calcolata — richiede il motore locale.',
    'Afstand na die plesiere nie bereken nie — vereis die plaaslike enjin.'
  ],
  map_search_on_move: [
    'Rechercher quand je déplace la carte', 'Search when I move the map',
    'Suchen, wenn ich die Karte verschiebe', 'Zoeken wanneer ik de kaart verplaats',
    'Buscar cuando muevo el mapa', 'Cerca quando sposto la mappa',
    'Soek wanneer ek die kaart beweeg'
  ],
  offers_found: [
    'offres relevées', 'offers recorded', 'Angebote erfasst', 'aanbiedingen gevonden',
    'ofertas registradas', 'offerte rilevate', 'aanbiedinge gevind'
  ],

  // --- Import et suivi ----------------------------------------------------
  import_url_label: ['URL de l’annonce', 'Listing URL', 'URL der Anzeige', 'URL van de advertentie', 'URL del anuncio', 'URL dell’annuncio', 'URL van die advertensie'],
  import_open_browser: [
    'Ouvrir l’annonce dans le navigateur', 'Open the listing in the browser',
    'Anzeige im Browser öffnen', 'Advertentie in de browser openen',
    'Abrir el anuncio en el navegador', 'Apri l’annuncio nel browser',
    'Open die advertensie in die blaaier'
  ],
  import_total_price: [
    'Prix total tout compris (€)', 'Total all-in price (€)', 'Gesamtpreis inkl. allem (€)',
    'Totale prijs alles inbegrepen (€)', 'Precio total todo incluido (€)',
    'Prezzo totale tutto compreso (€)', 'Totale alles-in-prys (€)'
  ],
  paste_step_1: [
    'Sur la page Airbnb qui vient de s’ouvrir, cliquez le marque-page',
    'On the Airbnb page that just opened, click the bookmarklet',
    'Klicken Sie auf der soeben geöffneten Airbnb-Seite das Lesezeichen an',
    'Klik op de zojuist geopende Airbnb-pagina op de bladwijzer',
    'En la página de Airbnb que se acaba de abrir, haga clic en el marcador',
    'Nella pagina Airbnb appena aperta, clicca il segnalibro',
    'Klik op die Airbnb-bladsy wat pas oopgemaak het, die boekmerk'
  ],
  paste_step_2: [
    'puis revenez ici : l’import se fera tout seul.',
    'then come back here: the import happens on its own.',
    'und kehren Sie hierher zurück: der Import läuft von selbst.',
    'en kom hier terug: de import gebeurt vanzelf.',
    'y vuelva aquí: la importación se hará sola.',
    'poi torna qui: l’importazione avverrà da sola.',
    'en kom terug hierheen: die invoer gebeur vanself.'
  ],
  tracking_empty: [
    'Aucun logement suivi pour l’instant', 'No stay tracked yet', 'Noch keine Unterkunft verfolgt',
    'Nog geen verblijf gevolgd', 'Ningún alojamiento seguido por ahora',
    'Nessun alloggio monitorato per ora', 'Nog geen verblyf gevolg nie'
  ],
  today_lower: ['aujourd’hui', 'today', 'heute', 'vandaag', 'hoy', 'oggi', 'vandag'],
  decision_empty_hint: [
    'Choisissez une combinaison semaine + domaine depuis l’onglet Combinaisons, puis revenez ici.',
    'Pick a week + resort combination from the Combinations tab, then come back here.',
    'Wählen Sie im Reiter Kombinationen eine Woche und ein Gebiet, und kehren Sie hierher zurück.',
    'Kies een combinatie week + gebied in het tabblad Combinaties en kom hier terug.',
    'Elija una combinación semana + dominio en la pestaña Combinaciones y vuelva aquí.',
    'Scegli una combinazione settimana + comprensorio nella scheda Combinazioni, poi torna qui.',
    'Kies ’n kombinasie week + gebied in die Kombinasies-oortjie, en kom dan terug hierheen.'
  ],

  // --- Dernières chaînes mêlées à du balisage -----------------------------
  budget_total_stay: [
    'Budget total du séjour', 'Total trip budget', 'Gesamtbudget der Reise',
    'Totaal budget van de reis', 'Presupuesto total del viaje', 'Budget totale del soggiorno',
    'Totale begroting van die reis'
  ],
  lodg_none_imported: [
    'Aucun logement importé pour', 'No stay imported for', 'Keine Unterkunft importiert für',
    'Geen verblijf geïmporteerd voor', 'Ningún alojamiento importado para',
    'Nessun alloggio importato per', 'Geen verblyf ingevoer vir'
  ],
  lodg_none_imported_yet: [
    'pour l’instant.', 'yet.', 'bislang.', 'voorlopig.', 'por ahora.', 'per ora.', 'voorlopig nie.'
  ],
  ref_format_intro: [
    'Un objet JSON avec deux clés :', 'A JSON object with two keys:', 'Ein JSON-Objekt mit zwei Schlüsseln:',
    'Een JSON-object met twee sleutels:', 'Un objeto JSON con dos claves:',
    'Un oggetto JSON con due chiavi:', '’n JSON-objek met twee sleutels:'
  ],
  ref_format_domains: [
    ', la liste des domaines (identifiant, nom, massif, altitudes basse et haute, kilomètres de pistes, remontées, coordonnées), et',
    ', the list of resorts (id, name, range, base and top altitudes, kilometres of runs, lifts, coordinates), and',
    ', die Liste der Skigebiete (Kennung, Name, Massiv, untere und obere Höhe, Pistenkilometer, Bergbahnen, Koordinaten), und',
    ', de lijst met skigebieden (id, naam, massief, laagste en hoogste hoogte, pistekilometers, liften, coördinaten), en',
    ', la lista de dominios (identificador, nombre, macizo, altitudes mínima y máxima, kilómetros de pistas, remontes, coordenadas), y',
    ', l’elenco dei comprensori (identificativo, nome, massiccio, quote minima e massima, chilometri di piste, impianti, coordinate), e',
    ', die lys skigebiede (id, naam, bergreeks, laagste en hoogste hoogte, kilometers plesiere, skilifte, koördinate), en'
  ],
  ref_format_passes: [
    ', les tarifs indexés par identifiant de domaine. Chaque domaine accepte un champ facultatif',
    ', the prices indexed by resort id. Each resort accepts an optional field',
    ', die nach Gebietskennung indexierten Preise. Jedes Gebiet akzeptiert ein optionales Feld',
    ', de prijzen geïndexeerd op gebied-id. Elk gebied aanvaardt een optioneel veld',
    ', las tarifas indexadas por identificador de dominio. Cada dominio acepta un campo opcional',
    ', i prezzi indicizzati per identificativo di comprensorio. Ogni comprensorio accetta un campo facoltativo',
    ', die pryse geïndekseer volgens gebied-id. Elke gebied aanvaar ’n opsionele veld'
  ],
  ref_format_logo: [
    '— l’adresse d’une image — pour afficher le vrai logo de la station. Exportez le référentiel livré pour partir d’un modèle valide.',
    '— the address of an image — to show the resort’s real logo. Export the bundled file to start from a valid template.',
    '— die Adresse eines Bildes — um das echte Logo des Gebiets anzuzeigen. Exportieren Sie die gelieferte Datei als gültige Vorlage.',
    '— het adres van een afbeelding — om het echte logo van het gebied te tonen. Exporteer het meegeleverde bestand als geldig model.',
    '— la dirección de una imagen — para mostrar el logotipo real de la estación. Exporte el fichero incluido como modelo válido.',
    '— l’indirizzo di un’immagine — per mostrare il vero logo della stazione. Esporta l’archivio fornito come modello valido.',
    '— die adres van ’n prent — om die gebied se werklike logo te wys. Voer die meegeleverde lêer uit as geldige model.'
  ],
  import_published_pos: [
    'Position publiée →', 'Published position →', 'Veröffentlichte Position →',
    'Gepubliceerde positie →', 'Posición publicada →', 'Posizione pubblicata →',
    'Gepubliseerde posisie →'
  ],
  import_from_center: [
    'du centre du domaine', 'from the centre of the resort', 'vom Zentrum des Gebiets',
    'vanaf het centrum van het gebied', 'del centro del dominio', 'dal centro del comprensorio',
    'vanaf die middel van die gebied'
  ],
  import_ingests: [
    ': l’application ingère ce que vous lui donnez.',
    ': the application ingests whatever you give it.',
    ': die Anwendung verarbeitet, was Sie ihr geben.',
    ': de applicatie verwerkt wat u haar geeft.',
    ': la aplicación asimila lo que usted le da.',
    ': l’applicazione acquisisce ciò che le fornisci.',
    ': die toepassing verwerk wat jy dit gee.'
  ],
  bookmarklet_drag_1: ['Le clic est désactivé ici : il faut le', 'Clicking is disabled here: you must', 'Klicken ist hier deaktiviert: Sie müssen es', 'Klikken is hier uitgeschakeld: u moet het', 'El clic está desactivado aquí: hay que', 'Il clic è disattivato qui: devi', 'Klik is hier gedeaktiveer: jy moet dit'],
  bookmarklet_drag_2: ['glisser', 'drag it', 'ziehen', 'slepen', 'arrastrarlo', 'trascinarlo', 'sleep'],
  bookmarklet_drag_3: [
    'vers les favoris. Faites apparaître la barre de favoris avec Ctrl+Maj+B si besoin.',
    'to the bookmarks bar. Show the bar with Ctrl+Shift+B if needed.',
    'in die Lesezeichenleiste. Blenden Sie die Leiste mit Strg+Umschalt+B ein.',
    'naar de bladwijzerbalk. Toon de balk met Ctrl+Shift+B indien nodig.',
    'a la barra de marcadores. Muestre la barra con Ctrl+Mayús+B si hace falta.',
    'nella barra dei preferiti. Mostra la barra con Ctrl+Maiusc+B se serve.',
    'na die boekmerkbalk. Wys die balk met Ctrl+Shift+B indien nodig.'
  ],

  // --- Raccourcis ---------------------------------------------------------
  kb_title: [
    'Raccourcis clavier', 'Keyboard shortcuts', 'Tastenkürzel', 'Sneltoetsen',
    'Atajos de teclado', 'Scorciatoie da tastiera', 'Sleutelbordkortpaaie'
  ],
  kb_browse: [
    'Parcourir les domaines', 'Browse the resorts', 'Skigebiete durchblättern', 'Door de skigebieden',
    'Recorrer los dominios', 'Scorri i comprensori', 'Blaai deur die skigebiede'
  ],
  kb_open: ['Ouvrir les logements', 'Open the stays', 'Unterkünfte öffnen', 'Verblijven openen', 'Abrir los alojamientos', 'Apri gli alloggi', 'Open die verblyf'],
  kb_filters: [
    'Afficher / masquer les filtres', 'Show / hide the filters', 'Filter ein-/ausblenden',
    'Filters tonen / verbergen', 'Mostrar / ocultar los filtros', 'Mostra / nascondi i filtri',
    'Wys / versteek die filters'
  ],
  kb_map: [
    'Afficher / masquer la carte', 'Show / hide the map', 'Karte ein-/ausblenden', 'Kaart tonen / verbergen',
    'Mostrar / ocultar el mapa', 'Mostra / nascondi la mappa', 'Wys / versteek die kaart'
  ],
  kb_close: [
    'Fermer fiche / comparateur', 'Close details / comparison', 'Details / Vergleich schließen',
    'Details / vergelijking sluiten', 'Cerrar ficha / comparador', 'Chiudi scheda / confronto',
    'Sluit besonderhede / vergelyking'
  ],
  kb_enter: ['Entrée', 'Enter', 'Enter', 'Enter', 'Intro', 'Invio', 'Enter'],
  kb_esc: ['Échap', 'Esc', 'Esc', 'Esc', 'Esc', 'Esc', 'Esc'],

  // --- Carte --------------------------------------------------------------
  map_isochrones: ['Isochrones', 'Isochrones', 'Isochronen', 'Isochronen', 'Isócronas', 'Isocrone', 'Isochrone'],
  map_isochrones_compute: [
    'Afficher les zones de temps de trajet', 'Show travel-time zones', 'Fahrzeitzonen anzeigen',
    'Reistijdzones tonen', 'Mostrar las zonas de tiempo de viaje', 'Mostra le zone di tempo di viaggio',
    'Wys reistydsones'
  ],
  map_attribution: [
    '© contributeurs OpenStreetMap · OpenTopoMap (CC-BY-SA) · OpenSkiMap',
    '© OpenStreetMap contributors · OpenTopoMap (CC-BY-SA) · OpenSkiMap',
    '© OpenStreetMap-Mitwirkende · OpenTopoMap (CC-BY-SA) · OpenSkiMap',
    '© OpenStreetMap-bijdragers · OpenTopoMap (CC-BY-SA) · OpenSkiMap',
    '© colaboradores de OpenStreetMap · OpenTopoMap (CC-BY-SA) · OpenSkiMap',
    '© contributori OpenStreetMap · OpenTopoMap (CC-BY-SA) · OpenSkiMap',
    '© OpenStreetMap-bydraers · OpenTopoMap (CC-BY-SA) · OpenSkiMap'
  ],
  map_fit: ['Recentrer', 'Fit to results', 'Neu zentrieren', 'Opnieuw centreren', 'Recentrar', 'Ricentra', 'Sentreer weer'],

  // --- Divers -------------------------------------------------------------
  minutes: ['min', 'min', 'Min.', 'min', 'min', 'min', 'min'],
  hours: ['h', 'h', 'Std.', 'u', 'h', 'h', 'u'],
  days: ['j', 'd', 'T', 'd', 'd', 'g', 'd'],
  km: ['km', 'km', 'km', 'km', 'km', 'km', 'km'],
  meters: ['m', 'm', 'm', 'm', 'm', 'm', 'm'],
  cancel: ['Annuler', 'Cancel', 'Abbrechen', 'Annuleren', 'Cancelar', 'Annulla', 'Kanselleer'],
  close: ['Fermer', 'Close', 'Schließen', 'Sluiten', 'Cerrar', 'Chiudi', 'Maak toe'],
  loading: ['Chargement…', 'Loading…', 'Wird geladen…', 'Laden…', 'Cargando…', 'Caricamento…', 'Laai tans…'],
  error: ['Erreur', 'Error', 'Fehler', 'Fout', 'Error', 'Errore', 'Fout'],
  refresh: ['actualiser', 'refresh', 'aktualisieren', 'verversen', 'actualizar', 'aggiorna', 'verfris'],
  estimated: ['estimé', 'estimated', 'geschätzt', 'geschat', 'estimado', 'stimato', 'geskat'],
  wx_sun: ['soleil', 'sun', 'Sonne', 'zon', 'sol', 'sole', 'son'],
  wx_cloud: ['nuageux', 'cloudy', 'wolkig', 'bewolkt', 'nublado', 'nuvoloso', 'bewolk'],
  wx_snow: ['neige', 'snow', 'Schnee', 'sneeuw', 'nieve', 'neve', 'sneeu'],
  wx_rain: ['pluie', 'rain', 'Regen', 'regen', 'lluvia', 'pioggia', 'reën'],

  // État du ciel, tel que le rend le code WMO d'Open-Meteo.
  sky_clear: ['ciel clair', 'clear sky', 'klarer Himmel', 'heldere hemel', 'cielo despejado', 'cielo sereno', 'helder lug'],
  sky_fair: ['peu nuageux', 'fair', 'leicht bewölkt', 'licht bewolkt', 'poco nuboso', 'poco nuvoloso', 'effens bewolk'],
  sky_overcast: ['couvert', 'overcast', 'bedeckt', 'zwaar bewolkt', 'cubierto', 'coperto', 'oortrek'],
  sky_fog: ['brouillard', 'fog', 'Nebel', 'mist', 'niebla', 'nebbia', 'mis'],
  sky_rain: ['pluie', 'rain', 'Regen', 'regen', 'lluvia', 'pioggia', 'reën'],
  sky_snow: ['neige', 'snow', 'Schnee', 'sneeuw', 'nieve', 'neve', 'sneeu'],
  sky_storm: ['orage', 'thunderstorm', 'Gewitter', 'onweer', 'tormenta', 'temporale', 'donderstorm'],
  sky_variable: ['variable', 'variable', 'wechselhaft', 'wisselend', 'variable', 'variabile', 'wisselend'],
  sky_unknown: ['—', '—', '—', '—', '—', '—', '—']
} as const satisfies Record<string, Entry>

export type TranslationKey = keyof typeof CATALOG

/** Exposé pour le test de complétude (`catalog.test.ts`), pas pour l'app. */
export const CATALOG_FOR_TEST: Record<string, readonly string[]> = CATALOG

const INDEX: Record<Language, number> = {
  fr: 0, en: 1, de: 2, nl: 3, es: 4, it: 5, af: 6
}

/** Traduit une clé, avec repli sur le français quand la langue manque. */
export function translate(key: TranslationKey, lang: Language): string {
  const entry = CATALOG[key] as unknown as readonly string[]
  return entry[INDEX[lang]] || entry[0]
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
