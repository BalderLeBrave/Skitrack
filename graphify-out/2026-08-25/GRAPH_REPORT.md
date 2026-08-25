# Graph Report - skitrack  (2026-08-25)

## Corpus Check
- Large corpus: 356 files · ~528,670 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder.

## Summary
- 3198 nodes · 5843 edges · 191 communities (172 shown, 19 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 212 edges (avg confidence: 0.84)
- Token cost: 687,005 input · 0 output

## Community Hubs (Navigation)
- Runtime maquette autonome
- Connecteur Open System
- Connecteur Ceto Chamonix
- Modèles SQLAlchemy sidecar
- Extraction prix centrales
- Application FastAPI sidecar
- Écrans avant — recherche
- Scripts npm
- Connecteur Locvacances
- Itinéraires et élévation
- État global du renderer
- Réglages et deep-links API
- Écrans après — décision
- Écrans avant — décision
- Écrans après — recherche
- Import OpenSkiMap
- Import du catalogue
- Connecteur MCP Airbnb
- Navigateur furtif Obscura
- Collecteur skitrack v28
- Analyse SERP Chamonix
- Socle providers Python
- Config TypeScript Node
- Disponibilité des logements
- Dépendances applicatives
- Coffre, BRA et pont collage
- BRA et webcams renderer
- Prix fiche station
- Config TypeScript renderer
- Occupation Ceto
- Configuration du sidecar
- API géographie
- Métriques d'accès aux pistes
- Connecteur Ublo
- Client API renderer
- Cache HTTP sidecar
- Relevé station Ingénie
- Balayage des centrales
- Registre des connecteurs
- Extracteurs webscrape
- Filtres et curseurs
- Collecteur skitrack v25
- Relevé Airbnb Playwright
- Table des stations renderer
- Tests filtre logements
- Domaines et stations proches
- Doctrine du référentiel
- Registre des jobs
- Calcul des coûts
- CLI et données curées
- Fusion des relevés Airbnb
- Audit des altitudes
- Index des lieux
- API référentiel et glaciers
- Pont IPC connecteurs
- Import presse-papier Airbnb
- Domaines et enneigement
- Modèle de logement
- Référentiel côté renderer
- Discipline de relecture
- API domaines skiables
- Extraction Airbnb cheerio
- Déduplication des offres
- Cartes de résultat
- Audit de couverture
- Météo des domaines
- Géolocalisation des logements
- Trajets et distances
- Contrat IPC partagé
- Diagnostics des centrales
- Géométrie sidecar
- Catalogue i18n
- Deep-links renderer
- Météo renderer
- Familles de centrales
- Reconnaissance des centrales
- Handoff maquette v3
- Logements OpenStreetMap
- Construction du catalogue
- Géocodage des domaines
- Couverture France Montagnes
- Dette de traduction
- Blocages de calendrier Airbnb
- Connecteur Booking
- Lancement de recherche
- Score de pertinence
- Contrat des connecteurs
- Score de domaine sidecar
- Import d'annonce par URL
- Rotation de proxy
- Illustrations Alpes et Jura
- Sélecteur de dates
- Carte des domaines
- Tests des forfaits
- Zone de recherche partagée
- API accès logements
- Tests API domaines
- Règle robots.txt
- Fiche domaine
- Refonte Airbnb — cadrage
- Métadonnées du paquet
- Géocodage sidecar
- Client MCP
- Tests robots.txt
- Icônes du renderer
- Tests index des lieux
- Sécurité et coffre de clés
- Handshake Electron-Python
- Schéma des tables logement
- Déploiement GitHub
- Illustrations massifs restants
- Temps d'accès
- Portail de vérification
- Calcul d'accès aux pistes
- Sonde AJAX station
- Coquille applicative
- Fixtures HTML de centrales
- Annuaire des centrales
- Capacités des centrales
- Diagnostics Chamonix Orchestra
- Téléchargement d'Obscura
- Génération des types API
- Outils et dépendances Python
- Classification par massif
- Tests du handshake
- Photos de massifs
- Tarifs de forfait
- Adresses de départ
- Dépendances de relevé
- Cache et quotas d'itinéraires
- Modèle station-domaine
- Déploiement et sprints Ceto
- Empaquetage et binaires
- Appariement des villages
- Onboarding
- Page recherche de domaines
- Extraction payload Chamonix
- Sonde navigateur Ingénie
- Bookmarklet Airbnb
- Résultat d'accès aux pistes
- Hôtes Ingénie
- Types OpenAPI générés
- Carte et profil d'altitude
- Panneau de comparaison
- Verdict budgétaire
- Teintes de massif
- Page combinaisons
- Réglages et mentions légales
- Page suivi de prix
- Fournisseurs d'itinéraires
- Recherche par village
- Middleware d'erreur
- Préchargement Electron
- Logos de domaine
- Réglages Claude Code
- Serveur MCP Airbnb
- Neige animée
- Configuration technique
- Pont bookmarklet Airbnb
- Sources météo et neige
- Amorçage Python
- Filtres logements actifs
- Popover de filtre
- Carte des logements
- Écran de chargement
- Hook de formatage
- Page meilleures offres
- Corps de requête Chamonix B2
- Config TypeScript racine
- Géocodeurs d'adresses
- Règles de la refonte
- Stub Electron pour outils
- Paquet Python sidecar
- Gîtes de France
- Outils autonomes

## God Nodes (most connected - your core abstractions)
1. `scripts` - 50 edges
2. `session_scope()` - 40 edges
3. `Session` - 33 edges
4. `get_settings()` - 29 edges
5. `Base` - 27 edges
6. `SearchParams` - 24 edges
7. `get()` - 23 edges
8. `debugLog()` - 23 edges
9. `nowIso()` - 23 edges
10. `createRuntime()` - 22 edges

## Surprising Connections (you probably didn't know these)
- `CI job verify (ubuntu, Node 22)` --semantically_similar_to--> `npm run verify — le seul « done »`  [INFERRED] [semantically similar]
  .github/workflows/ci.yml → CLAUDE.md
- `Scrapers web multi-sources (SKITRACK_WEB_SCRAPE)` --conceptually_related_to--> `Chantier 6 — dériver la liste des sources des outcomes du moteur`  [INFERRED]
  PATCH-README.txt → docs/design-handoff/README.md
- `Prix ferme vs prix « à partir de »` --semantically_similar_to--> `Un « à partir de » n'est pas un prix (priceConfidence: partial)`  [INFERRED] [semantically similar]
  docs/diagnostics/centrales-releve.md → PROVIDERS.md
- `Fiches SERP article.cpt-result (data-product, data-geolocation)` --semantically_similar_to--> `Import manuel par URL (Open Graph + JSON-LD)`  [INFERRED] [semantically similar]
  docs/diagnostics/chamonix-orchestra.md → PROVIDERS.md
- `Quinze écrans de la maquette (data-screen-label)` --conceptually_related_to--> `SKITRACK — application Electron + React + sidecar Python`  [INFERRED]
  docs/design-handoff/SKITRACK - App v3.dc.html → README.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Flux de démarrage sécurisé Electron ↔ sidecar Python** — docs_architecture_handshake_electron_python, docs_architecture_token_par_stdin, docs_architecture_socket_reservee_port_0, docs_architecture_token_auth_middleware, docs_architecture_sidecar_diagnose, docs_architecture_sidecar_stop_taskkill [EXTRACTED 1.00]
- **Chaîne de relevé des centrales Ingénie (robots → village → prix ferme → rapport)** — providers_station_web, providers_moteur_ingenie, claude_robots_txt_fait_autorite, docs_diagnostics_centrales_multi_villages_stationvillage, docs_diagnostics_centrales_releve_sweep, docs_diagnostics_centrales_reste_central_by_slug [EXTRACTED 1.00]
- **Invariant anti-invention : une absence reste une absence** — claude_rien_n_est_invente, docs_data_model_snowmaking_pct_null, docs_data_model_altitude_source, docs_data_model_location_precision, providers_a_partir_de_n_est_pas_un_prix, docs_diagnostics_centrales_reste_pas_de_faux_live, readme_forfaits_estimes_hors_score [INFERRED 0.95]
- **Le catalogue France Montagnes fait foi, corrigé à la marge** — docs_diagnostics_couverture_france_montagnes_catalogue_france_montagnes, docs_diagnostics_couverture_france_montagnes_refs_audit, docs_diagnostics_couverture_stations_areas_audit, docs_diagnostics_couverture_stations_domain_fixes, docs_diagnostics_stations_modele_forfait_index_by_area, docs_diagnostics_couverture_stations_manque_ecrit_jamais_comble [INFERRED 0.85]
- **Chaîne d'extraction du prix réel des centrales** — tools_readme_extract_prix_centrale, tools_readme_json_parser, r_search_ajax_response, src_main_providers_ceto_fixtures_megeve_serp_sample_cpt_result, src_main_providers_opensystem_fixtures_listing_sample_resultat, vendor_obscura_readme_obscura_engine [INFERRED 0.75]
- **Refonte UI « Airbnb × Skiinfo »** — refonte_airbnb_prompt_v2, refonte_airbnb_prompt_v2_design_tokens, refonte_airbnb_prompt_v2_regles_absolues, refonte_airbnb_prompt_v2_maquette_reference, docs_refonte_captures_readme, src_renderer_src_assets_img_readme_bundled_photos [EXTRACTED 1.00]
- **Parcours de décision après refonte : accueil → filtres domaines → meilleures offres → matrice semaine/domaine** — docs_refonte_captures_apres_1_accueil_search_bar, docs_refonte_captures_apres_2_recherche_filter_panel, docs_refonte_captures_apres_3_offres_two_column_split, docs_refonte_captures_apres_4_combinaisons_matrix [INFERRED 0.85]
- **Principe « rien n'est inventé » rendu visible dans l'interface** — docs_refonte_captures_apres_1_accueil_no_opaque_score, docs_refonte_captures_apres_1_accueil_missing_value_dash, docs_refonte_captures_apres_3_offres_route_non_calculee, docs_refonte_captures_apres_4_combinaisons_row_context [INFERRED 0.85]
- **Coût complet du séjour agrégé : logement, forfaits, route, matériel, cours** — docs_refonte_captures_apres_3_offres_cost_breakdown, docs_refonte_captures_apres_3_offres_budget_slider, docs_refonte_captures_apres_4_combinaisons_full_cost_scope, docs_refonte_captures_apres_2_recherche_trajet_voiture [INFERRED 0.75]
- **Lodging Choice Funnel: results to tracking to decision** — docs_refonte_captures_apres_6_logements_screen, docs_refonte_captures_apres_7_suivi_screen, docs_refonte_captures_apres_5_decision_screen, docs_refonte_captures_apres_6_logements_card_actions [INFERRED 0.85]
- **Never-Invent Disclosure Pattern (placeholder, provenance, simulated label, per-line justification)** — docs_refonte_captures_apres_5_decision_photo_placeholder, docs_refonte_captures_apres_6_logements_provenance_note, docs_refonte_captures_apres_7_suivi_simulated_label, docs_refonte_captures_apres_5_decision_line_item_justification [INFERRED 0.85]
- **Post-Refonte Application Shell (nav tabs, global controls, card sections, contextual header)** — docs_refonte_captures_apres_5_decision_nav_tabs, docs_refonte_captures_apres_5_decision_global_controls, docs_refonte_captures_apres_8_reglages_card_sections, docs_refonte_captures_apres_6_logements_context_header [INFERRED 0.85]
- **Entonnoir avant refonte : accueil → domaines filtrés → meilleures offres → matrice semaine/domaine** — docs_refonte_captures_avant_1_accueil_screenshot, docs_refonte_captures_avant_2_recherche_screenshot, docs_refonte_captures_avant_3_offres_screenshot, docs_refonte_captures_avant_4_combinaisons_screenshot [INFERRED 0.85]
- **Motif « une valeur absente reste absente » décliné dans toute l'interface** — docs_refonte_captures_avant_2_recherche_missing_value_dash, docs_refonte_captures_avant_2_recherche_missing_thumbnail_placeholder, docs_refonte_captures_avant_3_offres_photo_placeholder, docs_refonte_captures_avant_3_offres_route_not_computed [INFERRED 0.85]
- **Coût complet du séjour comme unité de comparaison partagée entre écrans** — docs_refonte_captures_avant_3_offres_cost_breakdown, docs_refonte_captures_avant_3_offres_budget_slider, docs_refonte_captures_avant_4_combinaisons_full_cost_definition, docs_refonte_captures_avant_2_recherche_metric_row [INFERRED 0.75]
- **Same persistent top nav chrome on every avant screen** — docs_refonte_captures_avant_5_decision_screenshot, docs_refonte_captures_avant_6_logements_screenshot, docs_refonte_captures_avant_7_suivi_screenshot, docs_refonte_captures_avant_8_reglages_screenshot, docs_refonte_captures_avant_5_decision_top_nav [EXTRACTED 1.00]
- **Choose lodging, lock the decision, then track its price** — docs_refonte_captures_avant_6_logements_lodging_card, docs_refonte_captures_avant_6_logements_card_actions, docs_refonte_captures_avant_5_decision_cost_breakdown_card, docs_refonte_captures_avant_7_suivi_tracked_items_list [INFERRED 0.85]
- **Absent or non-measured data is labelled, never faked** — docs_refonte_captures_avant_6_logements_no_photo_placeholder, docs_refonte_captures_avant_7_suivi_simulated_curve_disclaimer, docs_refonte_captures_avant_5_decision_disabled_line_items [INFERRED 0.85]
- **Massif illustration set (one photo per French ski massif, uniform card framing)** — src_renderer_src_assets_img_massif_alpes_nord_massif_image_asset, src_renderer_src_assets_img_massif_alpes_sud_massif_image_asset, src_renderer_src_assets_img_massif_jura_massif_image_asset, src_renderer_src_assets_img_massif_jura_massif_card_illustration [INFERRED 0.85]
- **French ski massif geography covered by the renderer imagery** — src_renderer_src_assets_img_hero_montblanc_mont_blanc_massif, src_renderer_src_assets_img_massif_alpes_nord_alpes_du_nord_massif, src_renderer_src_assets_img_massif_alpes_sud_alpes_du_sud_massif, src_renderer_src_assets_img_massif_jura_jura_massif [INFERRED 0.85]
- **Shared winter photographic treatment: deep snow cover, clear blue sky, daylight, no people in focus** — src_renderer_src_assets_img_hero_montblanc_hero_image_asset, src_renderer_src_assets_img_massif_alpes_nord_massif_image_asset, src_renderer_src_assets_img_massif_alpes_sud_massif_image_asset, src_renderer_src_assets_img_massif_jura_massif_image_asset [INFERRED 0.95]
- **Massif illustration assets shipped with the renderer** — src_renderer_src_assets_img_massif_massif_central_massif_central_photo, src_renderer_src_assets_img_massif_pyrenees_pyrenees_photo, src_renderer_src_assets_img_massif_vosges_vosges_photo, src_renderer_src_assets_img_massif_vosges_massif_illustration_convention [INFERRED 0.85]
- **French ski massifs illustrated in this chunk** — src_renderer_src_assets_img_massif_massif_central_massif_central, src_renderer_src_assets_img_massif_pyrenees_pyrenees, src_renderer_src_assets_img_massif_vosges_vosges [INFERRED 0.85]
- **Terrain signatures distinguishing the three massifs in winter** — src_renderer_src_assets_img_massif_pyrenees_high_altitude_rocky_relief, src_renderer_src_assets_img_massif_vosges_mid_altitude_forested_massif, src_renderer_src_assets_img_massif_massif_central_purpose_built_resort_village, src_renderer_src_assets_img_massif_vosges_winter_season_framing [INFERRED 0.75]

## Communities (191 total, 19 thin omitted)

### Community 0 - "Runtime maquette autonome"
Cohesion: 0.06
Nodes (75): boot(), bundledBlob(), cdnScriptFor(), collectProps(), compileAttr(), compileTemplate(), contentKey(), createComponentFactory() (+67 more)

### Community 1 - "Connecteur Open System"
Cohesion: 0.07
Nodes (57): dmy(), dmyParts(), etapeRestQuery(), extractOpenSystem(), fetchEtapePages(), fetchHtmlListings(), fetchText(), fetchVueInfo() (+49 more)

### Community 2 - "Connecteur Ceto Chamonix"
Cohesion: 0.07
Nodes (42): breaker, CETO_CHAMONIX_PROVIDER_NAME, toAccommodation(), ChamonixListing, extractChamonixMulti(), occupancyGridsForSerp(), CETO_HOSTS, hostOf() (+34 more)

### Community 3 - "Modèles SQLAlchemy sidecar"
Cohesion: 0.08
Nodes (46): datetime, DeclarativeBase, Base, JSONType, Any, Base déclarative + types utilitaires., JSON stocké en TEXT. SQLAlchemy fournit `sqlalchemy.JSON`, mais on veut un…, DateTime toujours stocké/relu en UTC *aware*. SQLite ne conserve pas le fuseau… (+38 more)

### Community 4 - "Extraction prix centrales"
Cohesion: 0.11
Nodes (47): BeautifulSoup, health(), get, Sonde du handshake Electron. Volontairement hors authentification et sans accès…, État fonctionnel : y a-t-il un référentiel exploitable ?, status(), exemple_ceto(), exemple_json_total() (+39 more)

### Community 5 - "Application FastAPI sidecar"
Cohesion: 0.08
Nodes (39): Engine, FastAPI, RuntimeError, Métriques d'accès aux pistes pour un lot de logements. Point d'entrée unique :…, create_app(), lifespan(), Assemblage de l'application FastAPI., check_version() (+31 more)

### Community 6 - "Écrans avant — recherche"
Cohesion: 0.05
Nodes (50): Bouton primaire rouge « Comparer les domaines → », Contrôles globaux : Suivi · 2, Réglages, sélecteur Français, Voyageurs · 1, bascule Clair/Sombre, Héros sombre « Le séjour au ski, prix réels compris. », Section « Explorer par massif » — cartes de massifs colorées, Onglets Accueil · Domaines · Meilleures offres · Combinaisons · Décision · Logements, Promesse éditoriale « Aucun score opaque » / prix relevés, pas estimés, Puces de préfiltrage (Grands domaines, Haute altitude, Forfait sous 260 €, Moins de 4 h de route), Écran Accueil (avant refonte) (+42 more)

### Community 7 - "Scripts npm"
Cohesion: 0.04
Nodes (50): scripts, accesstime:test, altitudes:test, areas:audit, areas:test, avail:test, bootstrap, budget:test (+42 more)

### Community 8 - "Connecteur Locvacances"
Cohesion: 0.06
Nodes (34): BY_HOST, hostOf(), LocvacancesSite, locvacancesSiteOf(), SITES, decodeEntities(), extractLocvacances(), worker() (+26 more)

### Community 9 - "Itinéraires et élévation"
Cohesion: 0.09
Nodes (23): Protocol, get_settings(), Instance courante (créée depuis l'environnement au premier appel)., Request, elevation_at(), elevations(), _ign_batch(), _opentopo_batch() (+15 more)

### Community 10 - "État global du renderer"
Cohesion: 0.06
Nodes (42): AppContext, AppContextValue, AppProvider(), AppState, ComboSelection, Decision, DEFAULT_PEOPLE, DEFAULT_PLACES (+34 more)

### Community 11 - "Réglages et deep-links API"
Cohesion: 0.08
Nodes (39): DeepLink, patch, cancel_job(), clear_cache(), deeplinks(), deeplinks_reload(), patch_settings(), push_secrets() (+31 more)

### Community 12 - "Écrans après — décision"
Cohesion: 0.07
Nodes (41): Centered Narrow Reading Column Layout, Cost Breakdown Card (Le cout, poste par poste), Global Controls: Suivi counter, Reglages, Language select, Voyageurs, Clair/Sombre toggle, Group Vote Status (Vote du groupe : aucun avis), Per-Line Justification Subtext (repartition, tarif du domaine, option desactivee), Selected Lodging Summary (Residence Cheval Blanc, dates, provider Expedia), Nav Tabs: Accueil / Domaines / Meilleures offres / Combinaisons / Decision / Logements, Sans Photo Placeholder (gradient + mountain glyph) (+33 more)

### Community 13 - "Écrans avant — décision"
Cohesion: 0.06
Nodes (41): Decision Actions (Changer de logement, Imprimer, Annuler la decision), Cost Breakdown Card (Le cout, poste par poste), Disabled Cost Lines Shown at 0 EUR (option desactivee), Flat Stacked White Cards on Plain Background, Group Vote Status (Vote du groupe: aucun avis), Decision Header Summary (station, total, dates, lodging), Per-Household Split Row (Depart 1, a parts egales), Decision Screen (avant) (+33 more)

### Community 14 - "Écrans après — recherche"
Cohesion: 0.07
Nodes (40): Section « Explorer par massif » (8 massifs, 259 domaines relevés), Contrôles d'en-tête : Suivi · 2, Réglages, sélecteur Français, Voyageurs · 1, bascule Clair/Sombre, Hero photographique « Le séjour au ski, prix réels compris. », Convention « — » pour un relevé manquant : rien n'est estimé, Principe affiché : « Aucun score opaque » — rien n'est estimé, Puces de filtre rapide (Grands domaines · Haute altitude · Forfait sous 260 € · Moins de 4 h de route), Écran Accueil (après refonte), Barre de recherche unifiée (Destination · Semaine · Voyageurs · Bas des pistes) (+32 more)

### Community 15 - "Import OpenSkiMap"
Cohesion: 0.10
Nodes (36): ProgressFn, _as_int(), _downhill_stats(), download_dump(), dump_summary(), import_lifts(), import_ski_areas(), iter_features() (+28 more)

### Community 16 - "Import du catalogue"
Cohesion: 0.08
Nodes (33): attrSelector(), centrals, controlOf(), CONTROLS, ENTITIES, firstTag(), hosts, NAME (+25 more)

### Community 17 - "Connecteur MCP Airbnb"
Cohesion: 0.12
Nodes (30): airbnbRedirect(), buildAirbnbSearchUrl(), citySegment(), extractToolPayload(), JsonRpcResponse, McpServerConfig, McpTool, parseSseMessages() (+22 more)

### Community 18 - "Navigateur furtif Obscura"
Cohesion: 0.11
Nodes (32): launchBrowser(), openPersistentContext(), profileDir(), ProxyConfig, toPlaywrightProxy(), closeObscura(), CONTEXT_OPTS, ensureServer() (+24 more)

### Community 19 - "Collecteur skitrack v28"
Cohesion: 0.13
Nodes (29): _progress(), build_search_url(), card_link(), check_sources(), collect(), collect_form_mode(), collect_url_mode(), extract_cards() (+21 more)

### Community 20 - "Analyse SERP Chamonix"
Cohesion: 0.11
Nodes (29): attr(), buildQuery(), ChamonixExtractResult, ChamonixSearchOpts, decodeEntities(), decodeHtmlEntities(), enrichMissingImages(), extractChamonix() (+21 more)

### Community 21 - "Socle providers Python"
Cohesion: 0.09
Nodes (24): ABC, BaseProvider, NormalizedAccommodation, NormalizedOffer, ProviderInfo, Any, Interface commune des connecteurs de logement. **Aucune implémentation de…, Contrat que doit remplir tout connecteur. Règles imposées à toute… (+16 more)

### Community 22 - "Config TypeScript Node"
Cohesion: 0.06
Nodes (31): electron.vite.config.ts, electron-vite/node, node, scripts/**/*, src/main/**/*, src/main/**/*.test.ts, src/preload/**/*, compilerOptions (+23 more)

### Community 23 - "Disponibilité des logements"
Cohesion: 0.10
Nodes (26): availabilityOf(), AvailabilityReason, AvailabilityStatus, AvailabilityVerdict, isBookable(), isDoorway(), Stay, gone (+18 more)

### Community 24 - "Dépendances applicatives"
Cohesion: 0.06
Nodes (31): electron, electron-vite, @fontsource/archivo, @fontsource/plus-jakarta-sans, maplibre-gl, openapi-typescript, devDependencies, electron (+23 more)

### Community 25 - "Coffre, BRA et pont collage"
Cohesion: 0.15
Nodes (26): attr(), cache, empty(), fetchBra(), level(), parseBulletin(), seasonMessage(), pushSecretsToSidecar() (+18 more)

### Community 26 - "BRA et webcams renderer"
Cohesion: 0.10
Nodes (28): BRA_KEYWORDS, BRA_LABELS, BRA_MAX_AGE_MS, braCodeOf(), braKeyOf(), braLevelOf(), braLinks, BraManual (+20 more)

### Community 27 - "Prix fiche station"
Cohesion: 0.14
Nodes (26): attr(), cleanProductUrl(), extractObjectCodeFromCardHtml(), extractTarifsPrestationId(), extractWidgetObject(), hasFlag(), IngenieObjectRef, parseCalculerTotal() (+18 more)

### Community 28 - "Config TypeScript renderer"
Cohesion: 0.07
Nodes (28): DOM.Iterable, src/preload/index.d.ts, src/renderer/src/**/*, vite/client, compilerOptions, allowSyntheticDefaultImports, baseUrl, composite (+20 more)

### Community 29 - "Occupation Ceto"
Cohesion: 0.11
Nodes (23): BUDGET_MS, cache, cacheKey(), FicheOccupancyRequest, FicheOccupancyResult, MAX_FICHES, readFicheOccupancies(), readOne() (+15 more)

### Community 30 - "Configuration du sidecar"
Cohesion: 0.12
Nodes (20): BaseSettings, _setup(), default_data_dir(), Path, Configuration du sidecar. Deux niveaux : * `Settings` — paramètres de…, Répertoire de données par défaut. Sous Windows : %APPDATA%\\SKITRACK. Ailleurs…, Dumps OpenSkiMap téléchargés (volumineux, purgeables)., Injecte une instance — utilisé par `__main__` après parsing des arguments CLI. (+12 more)

### Community 31 - "API géographie"
Cohesion: 0.18
Nodes (25): Origin, create_origin(), delete_origin(), elevation_endpoint(), isochrones(), list_origins(), precompute_routes(), delete (+17 more)

### Community 32 - "Métriques d'accès aux pistes"
Cohesion: 0.12
Nodes (26): classify_access(), compute_access(), nearest_point_on_geometry(), Any, Point le plus proche d'un tracé GeoJSON, segments compris. Renvoie aussi…, Traduit distance et dénivelé en une étiquette d'accès. Le dénivelé est…, Calcule les métriques d'accès d'un logement. `slopes` et `lifts` sont des…, Métriques d'accès aux pistes. Aucun réseau, aucune base : le module de calcul… (+18 more)

### Community 33 - "Connecteur Ublo"
Cohesion: 0.11
Nodes (24): BY_HOST, hostOf(), isUbloHost(), SITES, UBLO_SITES, UbloSite, ubloSiteOf(), extractUblo() (+16 more)

### Community 34 - "Client API renderer"
Cohesion: 0.11
Nodes (23): api, ApiError, formatDetail(), request(), AltitudeSource, DeepLink, DomainAccess, DomainDetail (+15 more)

### Community 35 - "Cache HTTP sidecar"
Cohesion: 0.13
Nodes (19): HttpCacheEntry, Cache HTTP applicatif, clé = hash(méthode, url, corps). On ne s'appuie pas sur…, cache_get(), cache_key(), cache_put(), HttpClient, purge_cache(), Any (+11 more)

### Community 36 - "Relevé station Ingénie"
Cohesion: 0.10
Nodes (21): atLeast(), breakersByHost, Choice, CONSENT_BUTTONS, dismissConsent(), DomNode, DomRoot, extractStationCards() (+13 more)

### Community 37 - "Balayage des centrales"
Cohesion: 0.08
Nodes (22): adults, byUrl, centrals, empty, failed, FIELDS, from, limit (+14 more)

### Community 38 - "Registre des connecteurs"
Cohesion: 0.14
Nodes (19): resolveBookingCredentials(), createCetoChamonixProvider(), createCetoMegeveProvider(), createCetoMeribelProvider(), createCetoPlagneProvider(), createCetoPrazProvider(), debugEnabled(), debugLog() (+11 more)

### Community 39 - "Extracteurs webscrape"
Cohesion: 0.17
Nodes (22): extractBookingCards(), extractCozycozyCards(), extractExpediaFamilyCards(), extractGitesCards(), RawCard, createBookingWebProvider(), createCozycozyWebProvider(), createExpediaWebProvider() (+14 more)

### Community 40 - "Filtres et curseurs"
Cohesion: 0.11
Nodes (18): ActiveFilter, FILTER_DEFAULTS, useActiveFilters(), boundsOf(), FIELD, FilterBounds, snap(), useFilterBounds() (+10 more)

### Community 41 - "Collecteur skitrack v25"
Cohesion: 0.12
Nodes (20): Semaphore, AsyncScrapingWorker, build_search_url(), extract_card_data(), extract_results(), format_station_name(), get_databay_proxies(), get_selectors_for_site() (+12 more)

### Community 42 - "Relevé Airbnb Playwright"
Cohesion: 0.20
Nodes (24): AirbnbUrlParams, waitForSearchResultsShell(), waitForStableDeferredState(), AirbnbScrapeError, AirbnbScrapeOutcome, AirbnbScrapeParams, exponentialBackoffMs(), extractFromPage() (+16 more)

### Community 43 - "Table des stations renderer"
Cohesion: 0.14
Nodes (20): runProviderSearch(), bookingCentralOf(), CENTRAL_BY_SLUG, derive(), fold(), isV25Station(), OfficialSite, officialSiteOf() (+12 more)

### Community 44 - "Tests filtre logements"
Cohesion: 0.09
Nodes (23): apres, apresAjout, apresMuet, avail, budget, cancel, CRITERIA, enregistree (+15 more)

### Community 45 - "Domaines et stations proches"
Cohesion: 0.11
Nodes (21): GeoFeature, NearbyResult, NearbyStation, shortLabel(), stationsNear(), areaKeyOf(), CACHE, pickName() (+13 more)

### Community 46 - "Doctrine du référentiel"
Cohesion: 0.10
Nodes (24): Le catalogue France Montagnes fait foi, Pipeline d'import du référentiel (ijson en flux, upsert idempotent), Migrations : create_all + SCHEMA_VERSION, Registre de jobs en mémoire (services/jobs.py), Score de pertinence (normalisation relative, _weight_covered), Types partagés Pydantic → openapi.json → types.gen.ts, altitude_source — chaque altitude porte sa provenance, Difficulté stockée, couleur dérivée à l'agrégation (+16 more)

### Community 47 - "Registre des jobs"
Cohesion: 0.11
Nodes (20): get_job(), list_jobs(), providers(), get, JobStatus, ProviderStatus, JobStatus, ProblemDetail (+12 more)

### Community 48 - "Calcul des coûts"
Cohesion: 0.12
Nodes (21): adultsCount(), ESF_BASE, esfRate, EsfRates, HOUR_OPTS, hoursTxt(), isKid(), KID_MAX_AGE (+13 more)

### Community 49 - "CLI et données curées"
Cohesion: 0.16
Nodes (20): _cmd_curated(), _cmd_glaciers(), _cmd_import(), _cmd_stats(), main(), Namespace, CLI d'administration — utilisable sans lancer Electron. python -m skitrack.cli…, apply_curated() (+12 more)

### Community 50 - "Fusion des relevés Airbnb"
Cohesion: 0.14
Nodes (19): mergeAirbnbPaste(), MergeOptions, MergeResult, roomKey(), EnrichResult, enrichWithAccess(), mergeMetrics(), AIRBNB_SEARCH_TIMEOUT_MS (+11 more)

### Community 51 - "Audit des altitudes"
Cohesion: 0.10
Nodes (17): attendus, hauts, stations, troisV, DOMAIN_FIXES, FM_STATIONS, FmStation, BUNDLED_REFERENTIAL (+9 more)

### Community 52 - "Index des lieux"
Cohesion: 0.13
Nodes (22): priced, ALIASES_BY_KEY, aliasesOf(), areaOf(), ARTICLES, CACHE, digitsFromWords(), fold() (+14 more)

### Community 53 - "API référentiel et glaciers"
Cohesion: 0.13
Nodes (19): delete_dump(), ImportRequest, BaseModel, delete, get, JobStatus, post, Import et entretien du référentiel des domaines. (+11 more)

### Community 54 - "Pont IPC connecteurs"
Cohesion: 0.16
Nodes (19): closeAirbnbBrowser(), rejectedMcpSources(), ensure(), providerMetricsSnapshot(), recordProviderOutcome(), resetProviderMetrics(), SourceMetric, store (+11 more)

### Community 55 - "Import presse-papier Airbnb"
Cohesion: 0.15
Nodes (16): AirbnbClipboard, AirbnbClipListing, AirbnbParseResult, airbnbRoomUrl(), parseAirbnbClipboard(), parseAirbnbPrice(), parseAirbnbRating(), clip (+8 more)

### Community 56 - "Domaines et enneigement"
Cohesion: 0.11
Nodes (13): Catalogue, catalogueStations(), applyEngineOverlay(), DomainSource, fallbackDomains(), loadDomains(), LoadedDomains, Domain (+5 more)

### Community 57 - "Modèle de logement"
Cohesion: 0.11
Nodes (15): agoCore(), agoTxt(), BASE_SOURCES, Deal, Freshness, freshnessOf(), LEGACY_CENTRALE_SOURCES, LODG_TEMPLATES (+7 more)

### Community 58 - "Référentiel côté renderer"
Cohesion: 0.12
Nodes (15): CLOSED_STATUS, domainsFromReferential(), estimateForfait(), Forfait, FORFAIT_ANCHORS, ForfaitEntry, interpolate(), isOperating() (+7 more)

### Community 59 - "Discipline de relecture"
Cohesion: 0.13
Nodes (20): code-reviewer subagent, Relecture par contexte neuf, Constat prouvé par extrait (sévérité, fichier:ligne, impact, correction), /critique — autocritique adversariale du diff, Score de confiance 0-100 avec explication de l'écart, Les trois listes (vérifié / supposé / non ouvert), Ceto location mapping step (esbuild bundle of chamonixExtract.test.ts), Smoke tests (robots, stations, places, avail) (+12 more)

### Community 60 - "API domaines skiables"
Cohesion: 0.17
Nodes (17): model_validator, get_domain(), map_points(), get, Écran 1 — recherche de domaines skiables., Points pour la carte, en GeoJSON minimal. Endpoint séparé de la recherche : la…, DomainAccessOut, DomainDetailOut (+9 more)

### Community 61 - "Extraction Airbnb cheerio"
Cohesion: 0.21
Nodes (15): CheerioAirbnbMeta, collectDeferredJsonTexts(), extractAirbnbFromHtml(), mergeListings(), DynamicWaitOptions, extractProgressive(), mergeListings(), ProgressiveExtractOptions (+7 more)

### Community 62 - "Déduplication des offres"
Cohesion: 0.17
Nodes (16): deduplicate(), distanceM(), normaliseTitle(), Offer, Property, PropertySource, similarity(), titleSimilarity() (+8 more)

### Community 63 - "Cartes de résultat"
Cohesion: 0.13
Nodes (12): Props, ResultCard(), ResultCardProps, ResultCardSkeleton(), ResultPrice, ResultRatio, full, loading (+4 more)

### Community 64 - "Audit de couverture"
Cohesion: 0.13
Nodes (16): added, { areas, byStation }, byArea, bySlug, estimated, lines, missing, singles (+8 more)

### Community 65 - "Météo des domaines"
Cohesion: 0.15
Nodes (17): cache, DomainWeatherDay, DomainWeatherDetail, DomainWeatherLevel, DomainWeatherSlot, DomainWeatherState, fetchDomainWeather(), levelOf() (+9 more)

### Community 66 - "Géolocalisation des logements"
Cohesion: 0.19
Nodes (18): coordKey(), fetchElevations(), fetchOsmContext(), fmt(), GeoCheck, GeoChecks, GeoLevel, GeoShrink (+10 more)

### Community 67 - "Trajets et distances"
Cohesion: 0.14
Nodes (15): tripCost, computeRoutes(), hasCoordinates(), haversineKm(), OsrmTable, Route, ROUTES_STORAGE_KEY, routesCoverage() (+7 more)

### Community 68 - "Contrat IPC partagé"
Cohesion: 0.11
Nodes (18): AirbnbScrapeError, AirbnbScrapeOutcome, AirbnbScrapeParams, AirbnbScrapeResult, AppInfo, BraBulletin, IPC, ListingExtract (+10 more)

### Community 69 - "Diagnostics des centrales"
Cohesion: 0.14
Nodes (18): stationVillage.ts — matchVillageOption et cityMismatch, Val d'Arly — centrale multi-villages (6 stations), Hôtes bloqués par robots.txt (Combloux, Montgenèvre), Familles de plateformes de centrales (Ingénie, Open System, Ceto, Ublo, Elloha, Eliberty, Yoplanning), Rapport de reconnaissance des centrales (npm run centrales:recon), Prix ferme vs prix « à partir de », Relevé des centrales (npm run centrales:sweep) — 28/104, 190 offres, Échec « Timeout AJAX formulaire Ingénie (12 s) » (+10 more)

### Community 70 - "Géométrie sidecar"
Cohesion: 0.18
Nodes (16): bbox_of(), bearing_deg(), centroid_of(), haversine_m(), in_metropolitan_france(), iter_coords(), Géométrie de base — sans dépendance réseau., Distance orthodromique en mètres. (+8 more)

### Community 71 - "Catalogue i18n"
Cohesion: 0.14
Nodes (13): CATALOG, CATALOG_FOR_TEST, Entry, formatDuration(), I18nContext, INDEX, Language, LANGUAGE_LABELS (+5 more)

### Community 72 - "Deep-links renderer"
Cohesion: 0.13
Nodes (13): Builder, BUILDERS, CONNECTOR_STAY_KEY, DeepLink, DEEPLINK_SOURCES, deepLinks(), isSelfDatedHost(), listingUrlWithStay() (+5 more)

### Community 73 - "Météo renderer"
Cohesion: 0.16
Nodes (13): dayLabel(), DomainWeather, fetchBatch(), fetchWeather(), isFresh(), OpenMeteoPoint, readCache(), SkyKind (+5 more)

### Community 74 - "Familles de centrales"
Cohesion: 0.20
Nodes (11): BookingFamily, bookingFamilyOf(), hostOf(), isKnownNonIngenie(), isOpenSystemLiveHost(), NON_INGENIE_HOSTS, OPENSYSTEM_LIVE_HOSTS, repairUbloListingUrl() (+3 more)

### Community 75 - "Reconnaissance des centrales"
Cohesion: 0.12
Nodes (11): byHost, families, findings, forbidden, hosts, ingenie, limitArg, lines (+3 more)

### Community 76 - "Handoff maquette v3"
Cohesion: 0.14
Nodes (16): Chantier 3 — agoTxt et la clé ago_pattern à motif unique, Catalogue i18n en tuple de sept (fr, en, de, nl, es, it, af), Discipline de l'accent — var(--accent) réservé aux actions et au bas des pistes, Chantier 1 — refonte de DomainCard (quatre chiffres décisifs), Handoff maquette v3 → dépôt (dix chantiers), Chantier 5 — lodgPhase seule source de vérité, lodgLoading supprimé, Chantier 10 — lodgPickId, mise en tête depuis la carte, Chantier 2 — hook useFormat() au lieu de 'fr-FR' en dur (+8 more)

### Community 77 - "Logements OpenStreetMap"
Cohesion: 0.15
Nodes (11): buildOverpassQuery(), cache, fetchOsmLodgings(), OsmLodging, OsmLodgingParams, OVERPASS_ENDPOINTS, OverpassElement, toOsmLodging() (+3 more)

### Community 78 - "Construction du catalogue"
Cohesion: 0.21
Nodes (15): buildCatalogue(), CACHE, catalogueOf(), defaultSeasonality(), displayName(), domainLabel(), ExcludedStation, excludedStations() (+7 more)

### Community 79 - "Géocodage des domaines"
Cohesion: 0.24
Nodes (14): altitudePlausible(), applyResolvedCoords(), DomainGeoCache, elevationsOf(), geoKeyOf(), GeoProgress, norm(), queriesFor() (+6 more)

### Community 80 - "Couverture France Montagnes"
Cohesion: 0.15
Nodes (15): Couverture du catalogue France Montagnes, Catalogue France Montagnes (classeur xlsx → franceMontagnesStations.ts), Le moteur local enrichit, il ne fournit plus la liste, refs:audit (générateur d'audit du référentiel), Tarif de forfait estimé vs relevé, Couverture stations → domaines, areas:audit (générateur de l'audit stations → domaines), Domaine mono-station (+7 more)

### Community 81 - "Dette de traduction"
Cohesion: 0.13
Nodes (10): ACC, ALL, BUDGET, DELIBERATE, DIRS, expr, found, jsx (+2 more)

### Community 82 - "Blocages de calendrier Airbnb"
Cohesion: 0.24
Nodes (12): addDaysIso(), CalendarDate, DATE_BLOCK_TEXT, DateBlockDiagnosis, detectDateBlockMessage(), diagnoseEmptySearch(), nextSaturday(), rangeHitsBlocked() (+4 more)

### Community 83 - "Connecteur Booking"
Cohesion: 0.19
Nodes (7): affiliateUrl(), BookingCredentials, BookingProvider, BookingRow, normalizeBooking(), RateLimiter, SearchParams

### Community 84 - "Lancement de recherche"
Cohesion: 0.19
Nodes (13): LodgingGeoState, CENTRALE_SOURCE, Lodging, idFromUrl(), lodgingsFromOutcome(), mergeProviderReadings(), outcomeSummary(), ProviderSearchOutcome (+5 more)

### Community 85 - "Score de pertinence"
Cohesion: 0.17
Nodes (14): band(), CRITERIA, Criterion, onScale(), rawValue(), SCALES, Score, SCORE_BANDS (+6 more)

### Community 86 - "Contrat des connecteurs"
Cohesion: 0.15
Nodes (14): Un échec de source reste local, Zones à ne pas toucher (airbnb/**, skitrack_v25.py, franceMontagnesStations.ts), BaseProvider (providers/base.py) et ses trois règles, Table provider_state (état runtime d'un connecteur), Table saved_search (criteria JSON schemaless), Table search_run (provider_report), Chantier 6 — dériver la liste des sources des outcomes du moteur, « Répond sans offre » distingué de l'échec (+6 more)

### Community 87 - "Score de domaine sidecar"
Cohesion: 0.15
Nodes (13): DomainSearchRequest, DomainSearchResponse, post, search_domains(), Criterion, _normalize(), Score de pertinence — et surtout son explication. Principe : chaque critère est…, Score chaque ligne. `rows` = liste de dicts {critère: valeur|None}. Une valeur… (+5 more)

### Community 88 - "Import d'annonce par URL"
Cohesion: 0.25
Nodes (12): decodeEntities(), emptyExtract(), fetchListing(), flattenJsonLd(), FORBIDDEN_HOSTS, get(), isAllowedByRobots(), Json (+4 more)

### Community 89 - "Rotation de proxy"
Cohesion: 0.26
Nodes (13): collect(), currentProxy(), loadProxyList(), nextProxy(), parseProxyUrl(), proxyCount(), ProxyKind, ProxyMode (+5 more)

### Community 90 - "Illustrations Alpes et Jura"
Cohesion: 0.22
Nodes (14): Groomed Winter Piste Scene (Aiguilles and Mont Blanc dome, blue sky, ski tracks), Hero Banner Illustration Role, hero-montblanc.jpg (hero image asset), Mont Blanc Massif, Alpes du Nord Massif, massif-alpes-nord.jpg (massif image asset), Purpose-Built High-Altitude Resort Village (Tarentaise-style apartment blocks under snow), Alpes du Sud Massif (+6 more)

### Community 91 - "Sélecteur de dates"
Cohesion: 0.26
Nodes (11): addDays(), addMonths(), DateRangePicker(), monthGrid(), nightsBetweenDates(), parseIso(), Props, sameDay() (+3 more)

### Community 92 - "Carte des domaines"
Cohesion: 0.18
Nodes (13): BasemapKey, BASEMAPS, DEFAULT_BASEMAP, DomainMap(), EMPTY, ISO_RANGES, loadPistes(), OverpassElement (+5 more)

### Community 93 - "Tests des forfaits"
Cohesion: 0.15
Nodes (12): forfaitPourDuree(), douze, famille, familleTrois, parJour, sept, six, solo (+4 more)

### Community 94 - "Zone de recherche partagée"
Cohesion: 0.21
Nodes (11): boxAround(), coordsUsable(), distanceKm(), domainRadiusKm(), domainZone(), GeoBox, kmPerDegreeLon(), OUT_OF_ZONE_MARGIN_KM (+3 more)

### Community 95 - "API accès logements"
Cohesion: 0.19
Nodes (12): LodgingAccessRequest, LodgingAccessResponse, lodgings_access(), post, LodgingAccessOut, LodgingAccessRequest, LodgingAccessResponse, LodgingIn (+4 more)

### Community 96 - "Tests API domaines"
Cohesion: 0.24
Nodes (9): Features OpenSkiMap réduites, calquées sur la structure réelle du dump. Les…, _seed(), test_facets_expose_countries_and_massifs(), test_map_endpoint_returns_geojson_points(), test_score_breakdown_is_returned(), test_search_empty_request_returns_everything(), test_search_filters_on_bottom_altitude(), test_search_travel_filter_requires_origin() (+1 more)

### Community 97 - "Règle robots.txt"
Cohesion: 0.19
Nodes (11): allowsPath(), CACHE, CachedRobots, Fetcher, forgetRobots(), parseRobots(), ROBOTS_AGENT, robotsAllows() (+3 more)

### Community 98 - "Fiche domaine"
Cohesion: 0.15
Nodes (6): PROFILE_SHAPE, SKY_KEYS, CloudIcon(), RainIcon(), SnowIcon(), SunIcon()

### Community 99 - "Refonte Airbnb — cadrage"
Cohesion: 0.17
Nodes (11): Deep-link Orchestra — dates injectées dans le hash, Captures avant / après — refonte Airbnb × Skiinfo, window.__DEMO_OVERRIDES__ — sonde de capture temporaire, Refonte « Airbnb × Skiinfo » — prompt corrigé v2, Jetons de design (accent bleu #0B6FC2, clair + sombre), Annexe B — maquette de référence SKITRACK App v4, Deep-link niveau 2 — aucune URL appelée par l'application, Champ `verified` — date de constat d'un pattern d'URL (+3 more)

### Community 100 - "Métadonnées du paquet"
Cohesion: 0.17
Nodes (11): allowScripts, electron@33.4.11, esbuild@0.21.5, author, description, license, main, name (+3 more)

### Community 101 - "Géocodage sidecar"
Cohesion: 0.27
Nodes (11): geocode_endpoint(), GeocodeResult, get, GeocodeResult, geocode(), _geocode_ban(), _geocode_nominatim(), _looks_french() (+3 more)

### Community 103 - "Tests robots.txt"
Cohesion: 0.18
Nodes (11): anchored, check(), equal, fetcher(), mixed, named, orphan, permissive (+3 more)

### Community 105 - "Tests index des lieux"
Cohesion: 0.17
Nodes (8): ACCEPTANCE, index, PAIRS, SAME, stations, suggestions, TROIS_VALLEES, vallorcine

### Community 106 - "Sécurité et coffre de clés"
Cohesion: 0.20
Nodes (11): Invariant : rien n'est inventé, Coffre de clés safeStorage / DPAPI, Durcissement du renderer (contextIsolation, CSP, openExternal filtré), Clés d'API — env var lue une fois, chiffrée, jamais versionnée, Règles productives (prix + lieu) pour les centrales, keytar abandonné au profit de safeStorage, Connecteur MCP générique déclaratif (mcp-sources.json), Champ legalBasis obligatoire sur toute source déclarée (+3 more)

### Community 107 - "Handshake Electron-Python"
Cohesion: 0.20
Nodes (11): Empaquetage : extraResources + recherche de l'interpréteur, ErrorEnvelopeMiddleware sous CORS, Handshake Electron ↔ Python, Pile de middlewares et CORS, Sidecar.diagnose() — traduction des motifs stderr, Sidecar.stop() — taskkill /T /F sur l'arborescence, Socket réservée sur port 0 puis passée à uvicorn, TokenAuthMiddleware (comparaison en temps constant) (+3 more)

### Community 108 - "Schéma des tables logement"
Cohesion: 0.18
Nodes (11): Table access_metrics (distances pré-calculées), Table accommodation, denivele_to_slope_m et le badge « skis aux pieds », location_precision exact / approximate, Table offer (guests dans la clé, price_total tout compris), Table price_point (historique de prix), Décorateur UTCDateTime (datetimes UTC aware), SQLite n'a pas d'index spatial (bbox + shapely en mémoire) (+3 more)

### Community 109 - "Déploiement GitHub"
Cohesion: 0.31
Nodes (10): collectTargets(), DEFAULT_PATHS, __dirname, getSha(), gh(), listFiles(), main(), parseArgs() (+2 more)

### Community 110 - "Illustrations massifs restants"
Cohesion: 0.35
Nodes (11): Massif Central (French ski massif), Massif Central Illustration (aerial winter resort village), Purpose-built resort village at the foot of the domain, High-altitude rocky relief above the treeline, Pyrenees (French ski massif), Pyrenees Illustration (sunrise over snowbound ridgeline), massif-<slug>.jpg naming convention for renderer massif illustrations, Mid-altitude forested massif with rounded summits (+3 more)

### Community 111 - "Temps d'accès"
Cohesion: 0.24
Nodes (8): AccessMode, AccessTime, accessTimeOf(), driveMinutes(), EngineAccessType, loin, paliers, walkMinutes()

### Community 113 - "Portail de vérification"
Cohesion: 0.22
Nodes (8): fingerprint(), git(), input, output, ROOT, run, STAMP, WATCHED

### Community 114 - "Calcul d'accès aux pistes"
Cohesion: 0.22
Nodes (9): _bbox_is_far(), _metres_per_degree(), NearestPoint, Métriques d'accès aux pistes d'un logement. ## Le chaînon manquant Une API de…, Facteurs de conversion degré → mètre autour d'une latitude. Projection…, Rejet grossier par boîte englobante, avant le calcul segment par segment., Arrondit à la centaine quand la position n'est qu'approximative., Point le plus proche trouvé sur une géométrie. (+1 more)

### Community 115 - "Sonde AJAX station"
Cohesion: 0.22
Nodes (9): AJAX_TIMEOUT, AjaxExchange, AjaxProbe, attachAjaxProbe(), pickHeaders(), REQ_KEYS, RES_KEYS, waitForIngenieForm() (+1 more)

### Community 117 - "Fixtures HTML de centrales"
Cohesion: 0.25
Nodes (9): SERP multi-types (hotel + apartment + residence), r.html — réponse searchAjax capturée, Payload searchAjax Ingénie (nbResults / nbResultsFiche), Fixture SERP Ceto — Megève, article.cpt-result — carte d'offre Orchestra, Fixture listing Open System, div.Resultat[data-cle] — annonce Open System avec prix réel, extract_prix_centrale.py — prix réel d'une centrale (+1 more)

### Community 118 - "Annuaire des centrales"
Cohesion: 0.22
Nodes (8): Central, CENTRAL_HOSTS, CentralControl, CentralKind, CENTRALS, LOCAL_CENTRALS, OTA_HOSTS, OTAS

### Community 119 - "Capacités des centrales"
Cohesion: 0.25
Nodes (7): CentralCapability, centralCapabilityOf(), CentralPriceMode, CETO_HOSTS, hostOf(), INGENIE_HOSTS, ROBOTS_BLOCKED

### Community 120 - "Diagnostics Chamonix Orchestra"
Cohesion: 0.29
Nodes (8): La Plagne Resort — UI custom, 12 villages, LOCATION_MAP (ref_c.LOCATION cmb.*), Orchestra PMB / Ceto (booking.chamonix.com, canal CMB), src/main/providers/ceto/ — connecteur Ceto, Fiches SERP article.cpt-result (data-product, data-geolocation), tools/extract-chamonix.mjs (payload-*.b64), L'import manuel par URL est une zone grise, pas une zone sûre, Import manuel par URL (Open Graph + JSON-LD)

### Community 121 - "Téléchargement d'Obscura"
Cohesion: 0.25
Nodes (5): archive, dest, { file, bin }, OUT, ROOT

### Community 122 - "Génération des types API"
Cohesion: 0.25
Nodes (7): cli, openapi, outPath, root, schemaPath, sidecar, venvPython

### Community 123 - "Outils et dépendances Python"
Cohesion: 0.29
Nodes (5): Planchers de version pour garantir une roue cp314 Windows, skitrack_v25.py — collecteur figé, quatre défauts consignés, skitrack_v26.py — collecteur multi-sites, Liste STATIONS — référence de nommage du projet, nodriver borné à 0.46.x — SyntaxError non-UTF-8 en 0.48/0.50

### Community 124 - "Classification par massif"
Cohesion: 0.32
Nodes (7): facets(), Valeurs disponibles pour alimenter les filtres — évite de proposer un massif ou…, known_massifs(), massif_for(), Classification en massifs à partir du code ISO 3166-2., _table(), test_massif_resolution_falls_back_to_country()

### Community 125 - "Tests du handshake"
Cohesion: 0.29
Nodes (4): _get(), Le handshake, testé sur un vrai processus. C'est le seul point de contact entre…, Le token fourni sur stdin protège bien l'API — sans jamais apparaître dans la…, test_token_read_from_stdin_is_enforced()

### Community 126 - "Photos de massifs"
Cohesion: 0.36
Nodes (7): BY_FILE, fold(), heroPhoto(), IMAGES, MASSIF_FILES, massifPhoto(), urlOf()

### Community 127 - "Tarifs de forfait"
Cohesion: 0.29
Nodes (7): splitRows(), Composition, forfaitAdulte(), ForfaitConfiance, ForfaitDuree, forfaitUnitaires, joursDeSki()

### Community 128 - "Adresses de départ"
Cohesion: 0.36
Nodes (7): addressOf(), ensureSidecarOrigin(), normalise(), ResolvedOrigin, resolveSidecarOrigin(), Origin, Place

### Community 129 - "Dépendances de relevé"
Cohesion: 0.29
Nodes (7): cheerio, electron-updater, dependencies, cheerio, electron-updater, playwright, playwright

### Community 130 - "Cache et quotas d'itinéraires"
Cohesion: 0.29
Nodes (7): services/http.py — point unique de cache, rate-limit et retry, Stratégie de quota pour les itinéraires (pré-filtre vol d'oiseau, stopped_early), Table domain_access (profile est une ligne, pas une colonne), Table http_cache (TTL par namespace), Table origin (adresses de départ), IGN Géoplateforme RGE ALTI, OpenTopoData EU-DEM 25 m / SRTM 30 m

### Community 131 - "Modèle station-domaine"
Cohesion: 0.29
Nodes (7): DOMAIN_FIXES — rattachements corrigés à la main, Un manque est écrit, jamais comblé, Badge de domaine — aucun total de kilomètres inventé, collapseToStations (supprimé), Champ `pass` — le forfait relié tient lieu de domaine, referentiel.json — référentiel livré (173 entrées), Modèle Station / Domaine

### Community 132 - "Déploiement et sprints Ceto"
Cohesion: 0.29
Nodes (7): Déploiement GitHub automatisé, .github/workflows/ci.yml — typecheck + smoke, scripts/deploy-github.mjs, GITHUB_TOKEN — PAT fine-grained hors du dépôt, Sprint 1 Ceto — statut (stub), Sprint 2 Ceto — notes, multi-SERP, deep-links, Badge ★ note TripAdvisor sur LodgingCard

### Community 133 - "Empaquetage et binaires"
Cohesion: 0.29
Nodes (7): electron-builder, extraResources — sidecar copié hors de l'asar, Gel PyInstaller du sidecar pour distribution autonome, electron-builder, Obscura (binaire) — README, Firefox par défaut — Obscura 0/104 au sweep des centrales, Obscura — moteur headless CDP opt-in

### Community 134 - "Appariement des villages"
Cohesion: 0.52
Nodes (6): cityMismatch(), expandAbbrevs(), matchVillageOption(), normPlace(), tokenCoverage(), VillageChoice

### Community 135 - "Onboarding"
Cohesion: 0.48
Nodes (6): LogoIcon(), fmtShort(), fold(), matchDomain(), Onboarding(), SUGGESTIONS

### Community 136 - "Page recherche de domaines"
Cohesion: 0.38
Nodes (4): isApproximate(), SearchBar(), shortLabel(), SORT_OPTIONS

### Community 137 - "Extraction payload Chamonix"
Cohesion: 0.29
Nodes (6): assembled, b64, code, dir, lib, parts

### Community 138 - "Sonde navigateur Ingénie"
Cohesion: 0.48
Nodes (6): freePort(), probeObscura(), probePlaywright(), readForm(), rows, vendorBin()

### Community 139 - "Bookmarklet Airbnb"
Cohesion: 0.53
Nodes (5): collectAirbnb(), DeferredListing, getElementById(), prompt(), writeText()

### Community 140 - "Résultat d'accès aux pistes"
Cohesion: 0.33
Nodes (4): AccessResult, La plus courte des deux distances (piste OU remontée). C'est la définition…, Dénivelé au point d'accès effectivement le plus proche. Cohérent avec…, Ce qu'on sait de l'accès aux pistes depuis un logement. Tous les champs sont…

### Community 141 - "Hôtes Ingénie"
Cohesion: 0.40
Nodes (5): hostOf(), INGENIE_HOSTS, ROBOTS_BLOCKED_HOSTS, SHORTFORM_HOSTS, shouldAttemptIngenie()

### Community 142 - "Types OpenAPI générés"
Cohesion: 0.33
Nodes (5): components, $defs, operations, paths, webhooks

### Community 143 - "Carte et profil d'altitude"
Cohesion: 0.40
Nodes (3): AltitudeProfile(), Props, Props

### Community 144 - "Panneau de comparaison"
Cohesion: 0.47
Nodes (5): bestOf(), Cell, ComparePanel(), ratios(), Row

### Community 145 - "Verdict budgétaire"
Cohesion: 0.47
Nodes (3): budgetHides(), BudgetParts, budgetVerdict

### Community 146 - "Teintes de massif"
Cohesion: 0.47
Nodes (5): fold(), MASSIF_TINTS, MASSIF_TINTS_FOLD, massifColor(), MassifTint

### Community 147 - "Page combinaisons"
Cohesion: 0.47
Nodes (5): CombosPage(), HEAT_FROM, HEAT_TO, heatColor(), isSchoolHoliday()

### Community 148 - "Réglages et mentions légales"
Cohesion: 0.47
Nodes (3): LegalSection(), purgeLocalData(), SHORTCUTS

### Community 149 - "Page suivi de prix"
Cohesion: 0.47
Nodes (5): Series, seriesOf(), SIMULATED_SHAPE, sparkPath(), TrackingPage()

### Community 150 - "Fournisseurs d'itinéraires"
Cohesion: 0.50
Nodes (5): ProviderCapabilities — capacités déclarées, pas supposées, L'évitement des péages ne s'applique pas au calcul matriciel, Google Routes API, OpenRouteService, OSRM

### Community 151 - "Recherche par village"
Cohesion: 0.40
Nodes (5): Village-station, VILLAGE_ALIASES — hameaux comme termes de recherche, Nombres écrits en lettres — seul manque réel de l'index, Index de recherche places.ts — normalisation sans accents, SearchBar en pilule à quatre segments

### Community 152 - "Middleware d'erreur"
Cohesion: 0.40
Nodes (4): ErrorEnvelopeMiddleware, BaseHTTPMiddleware, Request, Transforme toute erreur non prévue en réponse JSON, **sous** CORS. Un…

### Community 153 - "Préchargement Electron"
Cohesion: 0.60
Nodes (3): api, Window, SkitrackApi

### Community 154 - "Logos de domaine"
Cohesion: 0.50
Nodes (4): candidatesFor(), DomainLogo(), ICON_PATHS, Props

### Community 155 - "Réglages Claude Code"
Cohesion: 0.50
Nodes (3): hooks, Stop, $schema

### Community 156 - "Serveur MCP Airbnb"
Cohesion: 0.50
Nodes (3): npx, airbnb, @openbnb/mcp-server-airbnb

### Community 157 - "Neige animée"
Cohesion: 0.67
Nodes (3): Flake, makeFlakes(), Snowfall()

### Community 158 - "Configuration technique"
Cohesion: 0.50
Nodes (3): LODGING_SOURCES_OFF, OSRM_BASE, ROUTING_PROVIDER

### Community 160 - "Sources météo et neige"
Cohesion: 0.67
Nodes (3): Table snow_report, Météo-France BRA (bulletins d'avalanche), Open-Meteo (neige et météo)

## Ambiguous Edges - Review These
- `Expedia Rapid (Expedia, Abritel/Vrbo)` → `Risque : le bas des pistes vaut ce que vaut la cartographie OSM`  [AMBIGUOUS]
  docs/RISQUES.md · relation: conceptually_related_to
- `Barre de navigation principale (Accueil · Domaines · Meilleures offres · Combinaisons · Décision · Logements)` → `Écran Meilleures offres (après refonte)`  [AMBIGUOUS]
  docs/refonte-captures/apres/3-offres.jpg · relation: shares_data_with
- `Principe affiché : « Aucun score opaque » — rien n'est estimé` → `Badge d'affluence chiffré (« 33 · Faible », « 44 · Moyen »)`  [AMBIGUOUS]
  docs/refonte-captures/apres/3-offres.jpg · relation: conceptually_related_to
- `Global Controls: Suivi counter, Reglages, Language select, Voyageurs, Clair/Sombre toggle` → `Group Vote Status (Vote du groupe : aucun avis)`  [AMBIGUOUS]
  docs/refonte-captures/apres/5-decision.jpg · relation: conceptually_related_to
- `Résumé de contexte « 4 voyageurs · 7 nuits · logement + forfaits + route »` → `Colonnes de semaines datées, avec repère de vacances scolaires (zone C)`  [AMBIGUOUS]
  docs/refonte-captures/avant/4-combinaisons.jpg · relation: conceptually_related_to
- `Grille de cartes d'offres à 4 colonnes` → `Défaut visible : quatre cartes portent le même titre « Studio Choucas — balcon est »`  [AMBIGUOUS]
  docs/refonte-captures/avant/3-offres.jpg · relation: references
- `Cost Breakdown Card (Le cout, poste par poste)` → `Ranking Criteria Set (bas des pistes, point culminant, km, trajet, forfait, glacier, domaine relie)`  [AMBIGUOUS]
  docs/refonte-captures/avant/8-reglages.jpg · relation: conceptually_related_to
- `Alerts Configuration Panel` → `Settings Pill Tabs (Application, Administration, Mentions legales)`  [AMBIGUOUS]
  docs/refonte-captures/avant/8-reglages.jpg · relation: conceptually_related_to
- `Alpes du Sud Massif` → `High-Altitude Off-Piste Terrain (lone skier, cable-car span, sunburst over a sea of cloud)`  [AMBIGUOUS]
  src/renderer/src/assets/img/massif-alpes-sud.jpg · relation: conceptually_related_to
- `Jura Massif` → `Wooden Chalet Lodging in Snowbound Forest Foothills`  [AMBIGUOUS]
  src/renderer/src/assets/img/massif-jura.jpg · relation: conceptually_related_to
- `Pyrenees Illustration (sunrise over snowbound ridgeline)` → `Pyrenees (French ski massif)`  [AMBIGUOUS]
  src/renderer/src/assets/img/massif-pyrenees.jpg · relation: rationale_for

## Knowledge Gaps
- **819 isolated node(s):** `ROOT`, `STAMP`, `WATCHED`, `input`, `run` (+814 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **19 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Expedia Rapid (Expedia, Abritel/Vrbo)` and `Risque : le bas des pistes vaut ce que vaut la cartographie OSM`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Barre de navigation principale (Accueil · Domaines · Meilleures offres · Combinaisons · Décision · Logements)` and `Écran Meilleures offres (après refonte)`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._
- **What is the exact relationship between `Principe affiché : « Aucun score opaque » — rien n'est estimé` and `Badge d'affluence chiffré (« 33 · Faible », « 44 · Moyen »)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Global Controls: Suivi counter, Reglages, Language select, Voyageurs, Clair/Sombre toggle` and `Group Vote Status (Vote du groupe : aucun avis)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Résumé de contexte « 4 voyageurs · 7 nuits · logement + forfaits + route »` and `Colonnes de semaines datées, avec repère de vacances scolaires (zone C)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Grille de cartes d'offres à 4 colonnes` and `Défaut visible : quatre cartes portent le même titre « Studio Choucas — balcon est »`?**
  _Edge tagged AMBIGUOUS (relation: references) - confidence is low._
- **What is the exact relationship between `Cost Breakdown Card (Le cout, poste par poste)` and `Ranking Criteria Set (bas des pistes, point culminant, km, trajet, forfait, glacier, domaine relie)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._