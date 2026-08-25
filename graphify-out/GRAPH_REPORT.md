# Graph Report - skitrack  (2026-08-25)

## Corpus Check
- 336 files · ~548,937 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 3396 nodes · 6160 edges · 202 communities (181 shown, 21 thin omitted)
- Extraction: 96% EXTRACTED · 3% INFERRED · 0% AMBIGUOUS · INFERRED: 214 edges (avg confidence: 0.84)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `ad02b911`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- support.js
- opensystem/parse.ts
- providers/types.ts
- models/__init__.py
- Session
- app.py
- Héros sombre « Le séjour au ski, prix réels compris. »
- scripts
- locvacances/parse.test.ts
- routing.py
- appState.tsx
- settings.py
- Lodging Card Component
- Decision Screen (avant)
- Matrice semaine × domaine « Quelle semaine, quel domaine »
- openskimap.py
- import-centrales.mjs
- mcpProvider.ts
- obscura.ts
- skitrack_v28.py
- chamonixParse.ts
- registry.py
- compilerOptions
- lodgingAvailability.test.ts
- devDependencies
- main/index.ts
- data/bra.ts
- fichePrice.test.ts
- compilerOptions
- chamonix.ts
- config.py
- routes/geo.py
- test_access_metrics.py
- msem.ts
- api/types.ts
- HttpClient
- station.ts
- sweep-centrales.ts
- providers/index.ts
- providers.ts
- FilterPanel.tsx
- userData.ts
- scrape.ts
- stations.ts
- lodgingFilter.test.ts
- skiAreas.test.ts
- Table ski_domain
- jobs.py
- costs.ts
- session_scope
- Lodging
- skiAreas.audit.ts
- places.ts
- reapply_curated
- shared.ts
- airbnbClip.ts
- snow.ts
- lodgings.ts
- referentiel.ts
- code-reviewer subagent
- domains.py
- dynamicHtml.ts
- Accommodation
- ResultCard.tsx
- coverage.audit.ts
- domainWeather.ts
- lodgingGeo.ts
- travel.ts
- ipc-contract.ts
- Connecteur station-web (centrales de réservation)
- test_scoring_and_geo.py
- i18n/index.ts
- deeplinks.ts
- weather.ts
- bookingFamilies.ts
- recon-centrales.mjs
- Handoff maquette v3 → dépôt (dix chantiers)
- osm.ts
- catalogue.ts
- domainGeo.ts
- Catalogue France Montagnes (classeur xlsx → franceMontagnesStations.ts)
- scan-untranslated.mjs
- calendarBlocks.ts
- priceRefresh.test.ts
- runProviderSearch.ts
- scoring.ts
- Chantier 6 — dériver la liste des sources des outcomes du moteur
- tripCodec.test.ts
- priceAlerts.test.ts
- proxy.ts
- Massif Selector Card Illustration Role
- DateRangePicker.tsx
- DomainMap.tsx
- forfait.test.ts
- geo.ts
- party.test.ts
- test_api_domains.py
- robots.ts
- DomainSheet.tsx
- Deep-link niveau 2 — aucune URL appelée par l'application
- package.json
- geocoding.py
- McpClient
- robots.test.ts
- Icons.tsx
- test_jobs_endpoints.py
- Invariant : rien n'est inventé
- Handshake Electron ↔ Python
- Table access_metrics (distances pré-calculées)
- deploy-github.mjs
- Pyrenees Illustration (sunrise over snowbound ridgeline)
- accessTime.ts
- verify.mjs
- test_curated_and_deeplinks.py
- ajax.ts
- App.tsx
- extract_prix_centrale.py — prix réel d'une centrale
- centrals.ts
- elevation.py
- Orchestra PMB / Ceto (booking.chamonix.com, canal CMB)
- fetch-obscura.mjs
- gen-types.mjs
- sidecar/requirements.txt
- secrets.py
- test_handshake.py
- photos.ts
- ceto/hosts.ts
- origins.ts
- dependencies
- services/http.py — point unique de cache, rate-limit et retry
- Modèle Station / Domaine
- Sprint 2 Ceto — notes, multi-SERP, deep-links
- Obscura — moteur headless CDP opt-in
- stationVillage.ts
- Onboarding.tsx
- DomainSearchPage.tsx
- extract-chamonix.mjs
- probe-ingenie-browser.mjs
- airbnb-bookmarklet.src.ts
- Webisation — cible future
- ingenieHosts.ts
- types.gen.ts
- DomainCard.tsx
- ComparePanel.tsx
- budget.ts
- massif.ts
- CombosPage.tsx
- SettingsPage.tsx
- TrackingPage.tsx
- ProviderCapabilities — capacités déclarées, pas supposées
- Index de recherche places.ts — normalisation sans accents
- ErrorEnvelopeMiddleware
- preload/index.ts
- bulkImport.ts
- hooks
- airbnb
- Snowfall.tsx
- app-config.ts
- airbnbBookmarklet.ts
- Table snow_report
- bootstrap.ps1
- activeLodgingFilters.ts
- FilterPopover.tsx
- LodgingMap.tsx
- SkiSearchLoading.tsx
- useFormat.ts
- OffersPage.tsx
- body-b2.mjs
- tsconfig.json
- Base Adresse Nationale (géocodage France)
- Règles absolues — aucun changement de logique, i18n intact
- electron-stub.mjs
- skitrack-sidecar
- Gîtes de France (deep-link non vérifié)
- tools/ — outils autonomes
- glaciers.py
- NormalizedAccommodation
- ResultCard.test.tsx
- Patch scrapers + UI recherche
- get_job
- tripShare.tsx
- userData.tsx
- AlertPanel.tsx
- usePriceRefresh.ts

## God Nodes (most connected - your core abstractions)
1. `scripts` - 55 edges
2. `session_scope()` - 40 edges
3. `Session` - 33 edges
4. `get_settings()` - 29 edges
5. `Base` - 27 edges
6. `SearchParams` - 24 edges
7. `get()` - 23 edges
8. `debugLog()` - 23 edges
9. `nowIso()` - 23 edges
10. `Lodging` - 23 edges

## Surprising Connections (you probably didn't know these)
- `Quinze écrans de la maquette (data-screen-label)` --conceptually_related_to--> `SKITRACK — application Electron + React + sidecar Python`  [INFERRED]
  docs/design-handoff/SKITRACK - App v3.dc.html → README.md
- `Fiches SERP article.cpt-result (data-product, data-geolocation)` --semantically_similar_to--> `Import manuel par URL (Open Graph + JSON-LD)`  [INFERRED] [semantically similar]
  docs/diagnostics/chamonix-orchestra.md → PROVIDERS.md
- `Planchers de version pour garantir une roue cp314 Windows` --semantically_similar_to--> `nodriver borné à 0.46.x — SyntaxError non-UTF-8 en 0.48/0.50`  [INFERRED] [semantically similar]
  sidecar/requirements.txt → tools/requirements.txt
- `SearchBar en pilule à quatre segments` --semantically_similar_to--> `Index de recherche places.ts — normalisation sans accents`  [INFERRED] [semantically similar]
  refonte-airbnb-prompt-v2.md → docs/diagnostics/stations-modele.md
- `CI job verify (ubuntu, Node 22)` --semantically_similar_to--> `npm run verify — le seul « done »`  [INFERRED] [semantically similar]
  .github/workflows/ci.yml → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Same persistent top nav chrome on every avant screen** — docs_refonte_captures_avant_5_decision_screenshot, docs_refonte_captures_avant_6_logements_screenshot, docs_refonte_captures_avant_7_suivi_screenshot, docs_refonte_captures_avant_8_reglages_screenshot, docs_refonte_captures_avant_5_decision_top_nav [EXTRACTED 1.00]
- **Flux de démarrage sécurisé Electron ↔ sidecar Python** — docs_architecture_handshake_electron_python, docs_architecture_token_par_stdin, docs_architecture_socket_reservee_port_0, docs_architecture_token_auth_middleware, docs_architecture_sidecar_diagnose, docs_architecture_sidecar_stop_taskkill [EXTRACTED 1.00]
- **Refonte UI « Airbnb × Skiinfo »** — refonte_airbnb_prompt_v2, refonte_airbnb_prompt_v2_design_tokens, refonte_airbnb_prompt_v2_regles_absolues, refonte_airbnb_prompt_v2_maquette_reference, docs_refonte_captures_readme, src_renderer_src_assets_img_readme_bundled_photos [EXTRACTED 1.00]
- **Chaîne de relevé des centrales Ingénie (robots → village → prix ferme → rapport)** — providers_station_web, providers_moteur_ingenie, claude_robots_txt_fait_autorite, docs_diagnostics_centrales_multi_villages_stationvillage, docs_diagnostics_centrales_releve_sweep, docs_diagnostics_centrales_reste_central_by_slug [EXTRACTED 1.00]
- **Coût complet du séjour comme unité de comparaison partagée entre écrans** — docs_refonte_captures_avant_3_offres_cost_breakdown, docs_refonte_captures_avant_3_offres_budget_slider, docs_refonte_captures_avant_4_combinaisons_full_cost_definition, docs_refonte_captures_avant_2_recherche_metric_row [INFERRED 0.75]
- **Coût complet du séjour agrégé : logement, forfaits, route, matériel, cours** — docs_refonte_captures_apres_3_offres_cost_breakdown, docs_refonte_captures_apres_3_offres_budget_slider, docs_refonte_captures_apres_4_combinaisons_full_cost_scope, docs_refonte_captures_apres_2_recherche_trajet_voiture [INFERRED 0.75]
- **Chaîne d'extraction du prix réel des centrales** — tools_readme_extract_prix_centrale, tools_readme_json_parser, r_search_ajax_response, src_main_providers_ceto_fixtures_megeve_serp_sample_cpt_result, src_main_providers_opensystem_fixtures_listing_sample_resultat, vendor_obscura_readme_obscura_engine [INFERRED 0.75]
- **Terrain signatures distinguishing the three massifs in winter** — src_renderer_src_assets_img_massif_pyrenees_high_altitude_rocky_relief, src_renderer_src_assets_img_massif_vosges_mid_altitude_forested_massif, src_renderer_src_assets_img_massif_massif_central_purpose_built_resort_village, src_renderer_src_assets_img_massif_vosges_winter_season_framing [INFERRED 0.75]
- **Motif « une valeur absente reste absente » décliné dans toute l'interface** — docs_refonte_captures_avant_2_recherche_missing_value_dash, docs_refonte_captures_avant_2_recherche_missing_thumbnail_placeholder, docs_refonte_captures_avant_3_offres_photo_placeholder, docs_refonte_captures_avant_3_offres_route_not_computed [INFERRED 0.85]
- **Choose lodging, lock the decision, then track its price** — docs_refonte_captures_avant_6_logements_lodging_card, docs_refonte_captures_avant_6_logements_card_actions, docs_refonte_captures_avant_5_decision_cost_breakdown_card, docs_refonte_captures_avant_7_suivi_tracked_items_list [INFERRED 0.85]
- **Absent or non-measured data is labelled, never faked** — docs_refonte_captures_avant_6_logements_no_photo_placeholder, docs_refonte_captures_avant_7_suivi_simulated_curve_disclaimer, docs_refonte_captures_avant_5_decision_disabled_line_items [INFERRED 0.85]
- **Entonnoir avant refonte : accueil → domaines filtrés → meilleures offres → matrice semaine/domaine** — docs_refonte_captures_avant_1_accueil_screenshot, docs_refonte_captures_avant_2_recherche_screenshot, docs_refonte_captures_avant_3_offres_screenshot, docs_refonte_captures_avant_4_combinaisons_screenshot [INFERRED 0.85]
- **Le catalogue France Montagnes fait foi, corrigé à la marge** — docs_diagnostics_couverture_france_montagnes_catalogue_france_montagnes, docs_diagnostics_couverture_france_montagnes_refs_audit, docs_diagnostics_couverture_stations_areas_audit, docs_diagnostics_couverture_stations_domain_fixes, docs_diagnostics_stations_modele_forfait_index_by_area, docs_diagnostics_couverture_stations_manque_ecrit_jamais_comble [INFERRED 0.85]
- **French ski massifs illustrated in this chunk** — src_renderer_src_assets_img_massif_massif_central_massif_central, src_renderer_src_assets_img_massif_pyrenees_pyrenees, src_renderer_src_assets_img_massif_vosges_vosges [INFERRED 0.85]
- **French ski massif geography covered by the renderer imagery** — src_renderer_src_assets_img_hero_montblanc_mont_blanc_massif, src_renderer_src_assets_img_massif_alpes_nord_alpes_du_nord_massif, src_renderer_src_assets_img_massif_alpes_sud_alpes_du_sud_massif, src_renderer_src_assets_img_massif_jura_jura_massif [INFERRED 0.85]
- **Lodging Choice Funnel: results to tracking to decision** — docs_refonte_captures_apres_6_logements_screen, docs_refonte_captures_apres_7_suivi_screen, docs_refonte_captures_apres_5_decision_screen, docs_refonte_captures_apres_6_logements_card_actions [INFERRED 0.85]
- **Massif illustration assets shipped with the renderer** — src_renderer_src_assets_img_massif_massif_central_massif_central_photo, src_renderer_src_assets_img_massif_pyrenees_pyrenees_photo, src_renderer_src_assets_img_massif_vosges_vosges_photo, src_renderer_src_assets_img_massif_vosges_massif_illustration_convention [INFERRED 0.85]
- **Massif illustration set (one photo per French ski massif, uniform card framing)** — src_renderer_src_assets_img_massif_alpes_nord_massif_image_asset, src_renderer_src_assets_img_massif_alpes_sud_massif_image_asset, src_renderer_src_assets_img_massif_jura_massif_image_asset, src_renderer_src_assets_img_massif_jura_massif_card_illustration [INFERRED 0.85]
- **Never-Invent Disclosure Pattern (placeholder, provenance, simulated label, per-line justification)** — docs_refonte_captures_apres_5_decision_photo_placeholder, docs_refonte_captures_apres_6_logements_provenance_note, docs_refonte_captures_apres_7_suivi_simulated_label, docs_refonte_captures_apres_5_decision_line_item_justification [INFERRED 0.85]
- **Parcours de décision après refonte : accueil → filtres domaines → meilleures offres → matrice semaine/domaine** — docs_refonte_captures_apres_1_accueil_search_bar, docs_refonte_captures_apres_2_recherche_filter_panel, docs_refonte_captures_apres_3_offres_two_column_split, docs_refonte_captures_apres_4_combinaisons_matrix [INFERRED 0.85]
- **Post-Refonte Application Shell (nav tabs, global controls, card sections, contextual header)** — docs_refonte_captures_apres_5_decision_nav_tabs, docs_refonte_captures_apres_5_decision_global_controls, docs_refonte_captures_apres_8_reglages_card_sections, docs_refonte_captures_apres_6_logements_context_header [INFERRED 0.85]
- **Principe « rien n'est inventé » rendu visible dans l'interface** — docs_refonte_captures_apres_1_accueil_no_opaque_score, docs_refonte_captures_apres_1_accueil_missing_value_dash, docs_refonte_captures_apres_3_offres_route_non_calculee, docs_refonte_captures_apres_4_combinaisons_row_context [INFERRED 0.85]
- **Invariant anti-invention : une absence reste une absence** — claude_rien_n_est_invente, docs_data_model_snowmaking_pct_null, docs_data_model_altitude_source, docs_data_model_location_precision, providers_a_partir_de_n_est_pas_un_prix, docs_diagnostics_centrales_reste_pas_de_faux_live, readme_forfaits_estimes_hors_score [INFERRED 0.95]
- **Shared winter photographic treatment: deep snow cover, clear blue sky, daylight, no people in focus** — src_renderer_src_assets_img_hero_montblanc_hero_image_asset, src_renderer_src_assets_img_massif_alpes_nord_massif_image_asset, src_renderer_src_assets_img_massif_alpes_sud_massif_image_asset, src_renderer_src_assets_img_massif_jura_massif_image_asset [INFERRED 0.95]

## Communities (202 total, 21 thin omitted)

### Community 0 - "support.js"
Cohesion: 0.06
Nodes (75): boot(), bundledBlob(), cdnScriptFor(), collectProps(), compileAttr(), compileTemplate(), contentKey(), createComponentFactory() (+67 more)

### Community 1 - "opensystem/parse.ts"
Cohesion: 0.07
Nodes (57): dmy(), dmyParts(), etapeRestQuery(), extractOpenSystem(), fetchEtapePages(), fetchHtmlListings(), fetchText(), fetchVueInfo() (+49 more)

### Community 2 - "providers/types.ts"
Cohesion: 0.07
Nodes (30): affiliateUrl(), BookingCredentials, BookingProvider, BookingRow, normalizeBooking(), breaker, CETO_MEGEVE_PROVIDER_NAME, toAccommodation() (+22 more)

### Community 3 - "models/__init__.py"
Cohesion: 0.07
Nodes (55): datetime, DeclarativeBase, Base, JSONType, Any, Base déclarative + types utilitaires., JSON stocké en TEXT. SQLAlchemy fournit `sqlalchemy.JSON`, mais on veut un…, DateTime toujours stocké/relu en UTC *aware*. SQLite ne conserve pas le fuseau… (+47 more)

### Community 4 - "Session"
Cohesion: 0.09
Nodes (51): BeautifulSoup, model_validator, delete_origin(), delete, health(), get, Sonde du handshake Electron. Volontairement hors authentification et sans accès…, État fonctionnel : y a-t-il un référentiel exploitable ? (+43 more)

### Community 5 - "app.py"
Cohesion: 0.10
Nodes (25): Engine, FastAPI, RuntimeError, Métriques d'accès aux pistes pour un lot de logements. Point d'entrée unique :…, lifespan(), Assemblage de l'application FastAPI., check_version(), create_schema() (+17 more)

### Community 6 - "Héros sombre « Le séjour au ski, prix réels compris. »"
Cohesion: 0.05
Nodes (50): Bouton primaire rouge « Comparer les domaines → », Contrôles globaux : Suivi · 2, Réglages, sélecteur Français, Voyageurs · 1, bascule Clair/Sombre, Héros sombre « Le séjour au ski, prix réels compris. », Section « Explorer par massif » — cartes de massifs colorées, Onglets Accueil · Domaines · Meilleures offres · Combinaisons · Décision · Logements, Promesse éditoriale « Aucun score opaque » / prix relevés, pas estimés, Puces de préfiltrage (Grands domaines, Haute altitude, Forfait sous 260 €, Moins de 4 h de route), Écran Accueil (avant refonte) (+42 more)

### Community 7 - "scripts"
Cohesion: 0.04
Nodes (55): scripts, accesstime:test, alerts:test, altitudes:test, areas:audit, areas:test, avail:test, bootstrap (+47 more)

### Community 8 - "locvacances/parse.test.ts"
Cohesion: 0.10
Nodes (27): BY_HOST, hostOf(), LocvacancesSite, locvacancesSiteOf(), SITES, decodeEntities(), extractLocvacances(), worker() (+19 more)

### Community 9 - "routing.py"
Cohesion: 0.11
Nodes (15): Protocol, get_http(), ProviderUnavailable, Le fournisseur a échoué après épuisement des tentatives., available_providers(), GoogleRoutesProvider, OpenRouteServiceProvider, OsrmProvider (+7 more)

### Community 10 - "appState.tsx"
Cohesion: 0.05
Nodes (43): AppContext, AppContextValue, AppProvider(), AppState, ComboSelection, Decision, DEFAULT_PEOPLE, DEFAULT_PLACES (+35 more)

### Community 11 - "settings.py"
Cohesion: 0.13
Nodes (18): DeepLink, patch, cancel_job(), clear_cache(), deeplinks(), deeplinks_reload(), patch_settings(), BaseModel (+10 more)

### Community 12 - "Lodging Card Component"
Cohesion: 0.07
Nodes (41): Centered Narrow Reading Column Layout, Cost Breakdown Card (Le cout, poste par poste), Global Controls: Suivi counter, Reglages, Language select, Voyageurs, Clair/Sombre toggle, Group Vote Status (Vote du groupe : aucun avis), Per-Line Justification Subtext (repartition, tarif du domaine, option desactivee), Selected Lodging Summary (Residence Cheval Blanc, dates, provider Expedia), Nav Tabs: Accueil / Domaines / Meilleures offres / Combinaisons / Decision / Logements, Sans Photo Placeholder (gradient + mountain glyph) (+33 more)

### Community 13 - "Decision Screen (avant)"
Cohesion: 0.06
Nodes (41): Decision Actions (Changer de logement, Imprimer, Annuler la decision), Cost Breakdown Card (Le cout, poste par poste), Disabled Cost Lines Shown at 0 EUR (option desactivee), Flat Stacked White Cards on Plain Background, Group Vote Status (Vote du groupe: aucun avis), Decision Header Summary (station, total, dates, lodging), Per-Household Split Row (Depart 1, a parts egales), Decision Screen (avant) (+33 more)

### Community 14 - "Matrice semaine × domaine « Quelle semaine, quel domaine »"
Cohesion: 0.07
Nodes (40): Section « Explorer par massif » (8 massifs, 259 domaines relevés), Contrôles d'en-tête : Suivi · 2, Réglages, sélecteur Français, Voyageurs · 1, bascule Clair/Sombre, Hero photographique « Le séjour au ski, prix réels compris. », Convention « — » pour un relevé manquant : rien n'est estimé, Principe affiché : « Aucun score opaque » — rien n'est estimé, Puces de filtre rapide (Grands domaines · Haute altitude · Forfait sous 260 € · Moins de 4 h de route), Écran Accueil (après refonte), Barre de recherche unifiée (Destination · Semaine · Voyageurs · Bas des pistes) (+32 more)

### Community 15 - "openskimap.py"
Cohesion: 0.08
Nodes (47): ProgressFn, delete_dump(), delete, get, Import et entretien du référentiel des domaines., sources(), get_settings(), Instance courante (créée depuis l'environnement au premier appel). (+39 more)

### Community 16 - "import-centrales.mjs"
Cohesion: 0.08
Nodes (33): attrSelector(), centrals, controlOf(), CONTROLS, ENTITIES, firstTag(), hosts, NAME (+25 more)

### Community 17 - "mcpProvider.ts"
Cohesion: 0.13
Nodes (27): extractToolPayload(), JsonRpcResponse, McpServerConfig, McpTool, parseSseMessages(), ToolCallResult, asNumber(), asStrings() (+19 more)

### Community 18 - "obscura.ts"
Cohesion: 0.13
Nodes (25): launchBrowser(), openPersistentContext(), profileDir(), toPlaywrightProxy(), CONTEXT_OPTS, ensureServer(), extraRoots, freePort() (+17 more)

### Community 19 - "skitrack_v28.py"
Cohesion: 0.07
Nodes (48): Semaphore, AsyncScrapingWorker, build_search_url(), extract_card_data(), extract_results(), format_station_name(), get_databay_proxies(), get_selectors_for_site() (+40 more)

### Community 20 - "chamonixParse.ts"
Cohesion: 0.11
Nodes (31): attr(), buildQuery(), ChamonixExtractResult, ChamonixListing, ChamonixSearchOpts, decodeEntities(), decodeHtmlEntities(), enrichMissingImages() (+23 more)

### Community 21 - "registry.py"
Cohesion: 0.16
Nodes (13): ABC, BaseProvider, NormalizedOffer, ProviderInfo, Interface commune des connecteurs de logement. **Aucune implémentation de…, Contrat que doit remplir tout connecteur. Règles imposées à toute…, Vrai si les clés nécessaires sont présentes dans le coffre en mémoire., Recherche. Renvoie ([], []) si non configuré. (+5 more)

### Community 22 - "compilerOptions"
Cohesion: 0.06
Nodes (31): electron.vite.config.ts, electron-vite/node, node, scripts/**/*, src/main/**/*, src/main/**/*.test.ts, src/preload/**/*, compilerOptions (+23 more)

### Community 23 - "lodgingAvailability.test.ts"
Cohesion: 0.10
Nodes (26): availabilityOf(), AvailabilityReason, AvailabilityStatus, AvailabilityVerdict, isBookable(), isDoorway(), Stay, gone (+18 more)

### Community 24 - "devDependencies"
Cohesion: 0.06
Nodes (31): electron, electron-vite, @fontsource/archivo, @fontsource/plus-jakarta-sans, maplibre-gl, openapi-typescript, devDependencies, electron (+23 more)

### Community 25 - "main/index.ts"
Cohesion: 0.06
Nodes (47): attr(), cache, empty(), fetchBra(), level(), parseBulletin(), seasonMessage(), pushSecretsToSidecar() (+39 more)

### Community 26 - "data/bra.ts"
Cohesion: 0.10
Nodes (28): BRA_KEYWORDS, BRA_LABELS, BRA_MAX_AGE_MS, braCodeOf(), braKeyOf(), braLevelOf(), braLinks, BraManual (+20 more)

### Community 27 - "fichePrice.test.ts"
Cohesion: 0.14
Nodes (26): attr(), cleanProductUrl(), extractObjectCodeFromCardHtml(), extractTarifsPrestationId(), extractWidgetObject(), hasFlag(), IngenieObjectRef, parseCalculerTotal() (+18 more)

### Community 28 - "compilerOptions"
Cohesion: 0.07
Nodes (28): DOM.Iterable, src/preload/index.d.ts, src/renderer/src/**/*, vite/client, compilerOptions, allowSyntheticDefaultImports, baseUrl, composite (+20 more)

### Community 29 - "chamonix.ts"
Cohesion: 0.08
Nodes (32): breaker, CETO_CHAMONIX_PROVIDER_NAME, toAccommodation(), BUDGET_MS, cache, cacheKey(), FicheOccupancyRequest, FicheOccupancyResult (+24 more)

### Community 30 - "config.py"
Cohesion: 0.10
Nodes (26): BaseSettings, create_app(), default_data_dir(), Path, Configuration du sidecar. Deux niveaux : * `Settings` — paramètres de…, Répertoire de données par défaut. Sous Windows : %APPDATA%\\SKITRACK. Ailleurs…, Dumps OpenSkiMap téléchargés (volumineux, purgeables)., Injecte une instance — utilisé par `__main__` après parsing des arguments CLI. (+18 more)

### Community 31 - "routes/geo.py"
Cohesion: 0.19
Nodes (23): Origin, create_origin(), elevation_endpoint(), isochrones(), list_origins(), precompute_routes(), JobStatus, post (+15 more)

### Community 32 - "test_access_metrics.py"
Cohesion: 0.05
Nodes (51): LodgingAccessRequest, LodgingAccessResponse, lodgings_access(), post, LodgingAccessOut, LodgingAccessRequest, LodgingAccessResponse, LodgingIn (+43 more)

### Community 33 - "msem.ts"
Cohesion: 0.11
Nodes (24): BY_HOST, hostOf(), isUbloHost(), SITES, UBLO_SITES, UbloSite, ubloSiteOf(), extractUblo() (+16 more)

### Community 34 - "api/types.ts"
Cohesion: 0.11
Nodes (23): api, ApiError, formatDetail(), request(), AltitudeSource, DeepLink, DomainAccess, DomainDetail (+15 more)

### Community 35 - "HttpClient"
Cohesion: 0.25
Nodes (4): HttpClient, RateLimiter, Wrapper httpx avec cache + retry. `use_cache=False` sur les appels qui ne…, Limiteur à jetons simple, par hôte. `min_interval_s` couvre les limites…

### Community 36 - "station.ts"
Cohesion: 0.11
Nodes (20): atLeast(), breakersByHost, Choice, CONSENT_BUTTONS, dismissConsent(), DomNode, DomRoot, extractStationCards() (+12 more)

### Community 37 - "sweep-centrales.ts"
Cohesion: 0.08
Nodes (22): adults, byUrl, centrals, empty, failed, FIELDS, from, limit (+14 more)

### Community 38 - "providers/index.ts"
Cohesion: 0.09
Nodes (37): resolveBookingCredentials(), createCetoChamonixProvider(), createCetoMegeveProvider(), createCetoMeribelProvider(), createCetoPlagneProvider(), createCetoPrazProvider(), debugEnabled(), debugLog() (+29 more)

### Community 39 - "providers.ts"
Cohesion: 0.18
Nodes (21): extractBookingCards(), extractCozycozyCards(), extractExpediaFamilyCards(), extractGitesCards(), RawCard, createBookingWebProvider(), createCozycozyWebProvider(), createExpediaWebProvider() (+13 more)

### Community 40 - "FilterPanel.tsx"
Cohesion: 0.11
Nodes (18): ActiveFilter, FILTER_DEFAULTS, useActiveFilters(), boundsOf(), FIELD, FilterBounds, snap(), useFilterBounds() (+10 more)

### Community 41 - "userData.ts"
Cohesion: 0.11
Nodes (41): addFavorite(), clearUserData(), FavoriteStation, getAlerts(), getFavorites(), getOnboarded(), getTrips(), importTrip() (+33 more)

### Community 42 - "scrape.ts"
Cohesion: 0.21
Nodes (22): AirbnbUrlParams, AirbnbScrapeError, AirbnbScrapeOutcome, AirbnbScrapeParams, exponentialBackoffMs(), extractFromPage(), getSharedContext(), humanize() (+14 more)

### Community 43 - "stations.ts"
Cohesion: 0.10
Nodes (27): CentralCapability, centralCapabilityOf(), CentralPriceMode, CETO_HOSTS, hostOf(), INGENIE_HOSTS, ROBOTS_BLOCKED, runProviderSearch() (+19 more)

### Community 44 - "lodgingFilter.test.ts"
Cohesion: 0.09
Nodes (23): apres, apresAjout, apresMuet, avail, budget, cancel, CRITERIA, enregistree (+15 more)

### Community 45 - "skiAreas.test.ts"
Cohesion: 0.14
Nodes (15): areaKeyOf(), CACHE, pickName(), SkiArea, skiAreaIndex, areaNamed(), { areas, byStation, areaOf }, deuxAlpes (+7 more)

### Community 46 - "Table ski_domain"
Cohesion: 0.10
Nodes (24): Le catalogue France Montagnes fait foi, Pipeline d'import du référentiel (ijson en flux, upsert idempotent), Migrations : create_all + SCHEMA_VERSION, Registre de jobs en mémoire (services/jobs.py), Score de pertinence (normalisation relative, _weight_covered), Types partagés Pydantic → openapi.json → types.gen.ts, altitude_source — chaque altitude porte sa provenance, Difficulté stockée, couleur dérivée à l'agrégation (+16 more)

### Community 47 - "jobs.py"
Cohesion: 0.11
Nodes (18): provider_statuses(), ProviderStatus, JobStatus, ProblemDetail, ProviderStatus, BaseModel, Format d'erreur unique renvoyé par le sidecar (RFC 7807 allégé)., Suivi d'une tâche longue (import du référentiel, pré-calcul des trajets). (+10 more)

### Community 48 - "costs.ts"
Cohesion: 0.12
Nodes (20): adultsCount(), ESF_BASE, esfRate, EsfRates, HOUR_OPTS, hoursTxt(), isKid(), KID_MAX_AGE (+12 more)

### Community 49 - "session_scope"
Cohesion: 0.15
Nodes (25): _cmd_curated(), _cmd_glaciers(), _cmd_import(), _cmd_stats(), main(), _progress(), Namespace, CLI d'administration — utilisable sans lancer Electron. python -m skitrack.cli… (+17 more)

### Community 50 - "Lodging"
Cohesion: 0.16
Nodes (20): mergeAirbnbPaste(), MergeOptions, MergeResult, roomKey(), EnrichResult, enrichWithAccess(), mergeMetrics(), Lodging (+12 more)

### Community 51 - "skiAreas.audit.ts"
Cohesion: 0.07
Nodes (25): attendus, hauts, stations, troisV, DOMAIN_FIXES, FM_STATIONS, FmStation, ACCEPTANCE (+17 more)

### Community 52 - "places.ts"
Cohesion: 0.13
Nodes (23): priced, ALIASES_BY_KEY, aliasesOf(), areaOf(), ARTICLES, CACHE, digitsFromWords(), fold() (+15 more)

### Community 53 - "reapply_curated"
Cohesion: 0.29
Nodes (8): ImportRequest, BaseModel, JobStatus, post, Recharge le YAML curaté sans refaire l'import — pratique pendant la saisie., reapply_curated(), start_glacier_detection(), start_import()

### Community 54 - "shared.ts"
Cohesion: 0.27
Nodes (11): closeAirbnbBrowser(), ProxyConfig, closeObscura(), closeWebscrapeBrowser(), exponentialBackoffMs(), gate, getScrapeContext(), getScrapeContextSerialized() (+3 more)

### Community 55 - "airbnbClip.ts"
Cohesion: 0.26
Nodes (10): AirbnbClipboard, AirbnbClipListing, AirbnbParseResult, airbnbRoomUrl(), parseAirbnbClipboard(), parseAirbnbPrice(), parseAirbnbRating(), clip (+2 more)

### Community 56 - "snow.ts"
Cohesion: 0.22
Nodes (4): EXPOSURES, PriceHistory, Week, WEEKS

### Community 57 - "lodgings.ts"
Cohesion: 0.12
Nodes (15): agoCore(), agoTxt(), BASE_SOURCES, Deal, Freshness, freshnessOf(), LEGACY_CENTRALE_SOURCES, LODG_TEMPLATES (+7 more)

### Community 58 - "referentiel.ts"
Cohesion: 0.12
Nodes (15): CLOSED_STATUS, domainsFromReferential(), estimateForfait(), Forfait, FORFAIT_ANCHORS, ForfaitEntry, interpolate(), isOperating() (+7 more)

### Community 59 - "code-reviewer subagent"
Cohesion: 0.13
Nodes (20): code-reviewer subagent, Relecture par contexte neuf, Constat prouvé par extrait (sévérité, fichier:ligne, impact, correction), /critique — autocritique adversariale du diff, Score de confiance 0-100 avec explication de l'écart, Les trois listes (vérifié / supposé / non ouvert), Ceto location mapping step (esbuild bundle of chamonixExtract.test.ts), Smoke tests (robots, stations, places, avail) (+12 more)

### Community 60 - "domains.py"
Cohesion: 0.16
Nodes (21): DomainSearchRequest, DomainSearchResponse, facets(), get_domain(), map_points(), get, post, Écran 1 — recherche de domaines skiables. (+13 more)

### Community 61 - "dynamicHtml.ts"
Cohesion: 0.19
Nodes (17): CheerioAirbnbMeta, collectDeferredJsonTexts(), extractAirbnbFromHtml(), mergeListings(), DynamicWaitOptions, extractProgressive(), mergeListings(), ProgressiveExtractOptions (+9 more)

### Community 62 - "Accommodation"
Cohesion: 0.26
Nodes (10): deduplicate(), distanceM(), normaliseTitle(), Offer, PropertySource, similarity(), titleSimilarity(), toOffer() (+2 more)

### Community 63 - "ResultCard.tsx"
Cohesion: 0.21
Nodes (7): Props, ResultCard(), ResultCardProps, ResultCardSkeleton(), ResultPrice, ResultRatio, ResultGridProps

### Community 64 - "coverage.audit.ts"
Cohesion: 0.13
Nodes (16): added, { areas, byStation }, byArea, bySlug, estimated, lines, missing, singles (+8 more)

### Community 65 - "domainWeather.ts"
Cohesion: 0.15
Nodes (17): cache, DomainWeatherDay, DomainWeatherDetail, DomainWeatherLevel, DomainWeatherSlot, DomainWeatherState, fetchDomainWeather(), levelOf() (+9 more)

### Community 66 - "lodgingGeo.ts"
Cohesion: 0.17
Nodes (19): coordKey(), fetchElevations(), fetchOsmContext(), fmt(), GeoCheck, GeoChecks, GeoLevel, GeoShrink (+11 more)

### Community 67 - "travel.ts"
Cohesion: 0.13
Nodes (17): tripCost, computeRoutes(), hasCoordinates(), haversineKm(), Origin, OsrmTable, Place, Route (+9 more)

### Community 68 - "ipc-contract.ts"
Cohesion: 0.09
Nodes (21): AirbnbScrapeError, AirbnbScrapeOutcome, AirbnbScrapeParams, AirbnbScrapeResult, AppInfo, BraBulletin, IPC, ListingExtract (+13 more)

### Community 69 - "Connecteur station-web (centrales de réservation)"
Cohesion: 0.14
Nodes (18): stationVillage.ts — matchVillageOption et cityMismatch, Val d'Arly — centrale multi-villages (6 stations), Hôtes bloqués par robots.txt (Combloux, Montgenèvre), Familles de plateformes de centrales (Ingénie, Open System, Ceto, Ublo, Elloha, Eliberty, Yoplanning), Rapport de reconnaissance des centrales (npm run centrales:recon), Prix ferme vs prix « à partir de », Relevé des centrales (npm run centrales:sweep) — 28/104, 190 offres, Échec « Timeout AJAX formulaire Ingénie (12 s) » (+10 more)

### Community 70 - "test_scoring_and_geo.py"
Cohesion: 0.10
Nodes (27): bbox_of(), bearing_deg(), centroid_of(), haversine_m(), iter_coords(), Géométrie de base — sans dépendance réseau., Distance orthodromique en mètres., Parcourt les positions d'une géométrie GeoJSON en (lon, lat, ele|None).… (+19 more)

### Community 71 - "i18n/index.ts"
Cohesion: 0.14
Nodes (13): CATALOG, CATALOG_FOR_TEST, Entry, formatDuration(), I18nContext, INDEX, Language, LANGUAGE_LABELS (+5 more)

### Community 72 - "deeplinks.ts"
Cohesion: 0.13
Nodes (13): Builder, BUILDERS, CONNECTOR_STAY_KEY, DeepLink, DEEPLINK_SOURCES, deepLinks(), isSelfDatedHost(), listingUrlWithStay() (+5 more)

### Community 73 - "weather.ts"
Cohesion: 0.16
Nodes (13): dayLabel(), DomainWeather, fetchBatch(), fetchWeather(), isFresh(), OpenMeteoPoint, readCache(), SkyKind (+5 more)

### Community 74 - "bookingFamilies.ts"
Cohesion: 0.20
Nodes (11): BookingFamily, bookingFamilyOf(), hostOf(), isKnownNonIngenie(), isOpenSystemLiveHost(), NON_INGENIE_HOSTS, OPENSYSTEM_LIVE_HOSTS, repairUbloListingUrl() (+3 more)

### Community 75 - "recon-centrales.mjs"
Cohesion: 0.12
Nodes (11): byHost, families, findings, forbidden, hosts, ingenie, limitArg, lines (+3 more)

### Community 76 - "Handoff maquette v3 → dépôt (dix chantiers)"
Cohesion: 0.24
Nodes (10): Chantier 3 — agoTxt et la clé ago_pattern à motif unique, Catalogue i18n en tuple de sept (fr, en, de, nl, es, it, af), Discipline de l'accent — var(--accent) réservé aux actions et au bas des pistes, Chantier 1 — refonte de DomainCard (quatre chiffres décisifs), Handoff maquette v3 → dépôt (dix chantiers), Chantier 10 — lodgPickId, mise en tête depuis la carte, Chantier 2 — hook useFormat() au lieu de 'fr-FR' en dur, Jetons de thème clair/sombre (accent #e0533f, Archivo) (+2 more)

### Community 77 - "osm.ts"
Cohesion: 0.13
Nodes (16): airbnbRedirect(), buildAirbnbSearchUrl(), citySegment(), buildOverpassQuery(), cache, fetchOsmLodgings(), OsmLodging, OsmLodgingParams (+8 more)

### Community 78 - "catalogue.ts"
Cohesion: 0.13
Nodes (23): buildCatalogue(), CACHE, Catalogue, catalogueOf(), catalogueStations(), defaultSeasonality(), displayName(), domainLabel() (+15 more)

### Community 79 - "domainGeo.ts"
Cohesion: 0.15
Nodes (20): altitudePlausible(), applyResolvedCoords(), DomainGeoCache, elevationsOf(), geoKeyOf(), GeoProgress, norm(), queriesFor() (+12 more)

### Community 80 - "Catalogue France Montagnes (classeur xlsx → franceMontagnesStations.ts)"
Cohesion: 0.15
Nodes (15): Couverture du catalogue France Montagnes, Catalogue France Montagnes (classeur xlsx → franceMontagnesStations.ts), Le moteur local enrichit, il ne fournit plus la liste, refs:audit (générateur d'audit du référentiel), Tarif de forfait estimé vs relevé, Couverture stations → domaines, areas:audit (générateur de l'audit stations → domaines), Domaine mono-station (+7 more)

### Community 81 - "scan-untranslated.mjs"
Cohesion: 0.13
Nodes (10): ACC, ALL, BUDGET, DELIBERATE, DIRS, expr, found, jsx (+2 more)

### Community 82 - "calendarBlocks.ts"
Cohesion: 0.24
Nodes (12): addDaysIso(), CalendarDate, DATE_BLOCK_TEXT, DateBlockDiagnosis, detectDateBlockMessage(), diagnoseEmptySearch(), nextSaturday(), rangeHitsBlocked() (+4 more)

### Community 83 - "priceRefresh.test.ts"
Cohesion: 0.09
Nodes (30): trackKey(), AttemptRecord, AttemptStore, backoffMs(), groupForRefresh(), isDue(), isRefreshable(), keyOfLodging() (+22 more)

### Community 84 - "runProviderSearch.ts"
Cohesion: 0.21
Nodes (11): CENTRALE_SOURCE, idFromUrl(), lodgingsFromOutcome(), mergeProviderReadings(), outcomeSummary(), ProviderSearchOutcome, RunProviderSearchParams, RunProviderSearchResult (+3 more)

### Community 85 - "scoring.ts"
Cohesion: 0.17
Nodes (14): band(), CRITERIA, Criterion, onScale(), rawValue(), SCALES, Score, SCORE_BANDS (+6 more)

### Community 86 - "Chantier 6 — dériver la liste des sources des outcomes du moteur"
Cohesion: 0.15
Nodes (14): Un échec de source reste local, Zones à ne pas toucher (airbnb/**, skitrack_v25.py, franceMontagnesStations.ts), BaseProvider (providers/base.py) et ses trois règles, Table provider_state (état runtime d'un connecteur), Table saved_search (criteria JSON schemaless), Table search_run (provider_report), Chantier 6 — dériver la liste des sources des outcomes du moteur, « Répond sans offre » distingué de l'échec (+6 more)

### Community 87 - "tripCodec.test.ts"
Cohesion: 0.11
Nodes (27): decodeTrip(), decodeTripFile(), decodeTripLink(), encodeTrip(), fromBase64Url(), isLinkTooLong(), LINK_MAX_CHARS, parseTripLink() (+19 more)

### Community 88 - "priceAlerts.test.ts"
Cohesion: 0.11
Nodes (19): AlertFiring, AlertMode, AlertOutcome, AlertReading, evaluateAlert(), evaluateSeries(), initialArmed(), PriceAlert (+11 more)

### Community 89 - "proxy.ts"
Cohesion: 0.25
Nodes (14): collect(), currentProxy(), loadProxyList(), nextProxy(), parseProxyUrl(), proxyCount(), ProxyKind, ProxyMode (+6 more)

### Community 90 - "Massif Selector Card Illustration Role"
Cohesion: 0.22
Nodes (14): Groomed Winter Piste Scene (Aiguilles and Mont Blanc dome, blue sky, ski tracks), Hero Banner Illustration Role, hero-montblanc.jpg (hero image asset), Mont Blanc Massif, Alpes du Nord Massif, massif-alpes-nord.jpg (massif image asset), Purpose-Built High-Altitude Resort Village (Tarentaise-style apartment blocks under snow), Alpes du Sud Massif (+6 more)

### Community 91 - "DateRangePicker.tsx"
Cohesion: 0.26
Nodes (11): addDays(), addMonths(), DateRangePicker(), monthGrid(), nightsBetweenDates(), parseIso(), Props, sameDay() (+3 more)

### Community 92 - "DomainMap.tsx"
Cohesion: 0.18
Nodes (13): BasemapKey, BASEMAPS, DEFAULT_BASEMAP, DomainMap(), EMPTY, ISO_RANGES, loadPistes(), OverpassElement (+5 more)

### Community 93 - "forfait.test.ts"
Cohesion: 0.11
Nodes (19): splitRows(), Composition, forfaitAdulte(), ForfaitConfiance, ForfaitDuree, forfaitPourDuree(), forfaitUnitaires, joursDeSki() (+11 more)

### Community 94 - "geo.ts"
Cohesion: 0.21
Nodes (11): boxAround(), coordsUsable(), distanceKm(), domainRadiusKm(), domainZone(), GeoBox, kmPerDegreeLon(), OUT_OF_ZONE_MARGIN_KM (+3 more)

### Community 95 - "party.test.ts"
Cohesion: 0.13
Nodes (17): Person, CHILD_AGE_LIMIT, DEFAULT_ADULT_AGE, DEFAULT_CHILD_AGE, isChild(), peopleForParty(), afterShrinkGrow, countAdults() (+9 more)

### Community 96 - "test_api_domains.py"
Cohesion: 0.21
Nodes (11): DomainAccess, Temps/distance porte-à-porte entre une origine et un domaine. Pré-calculé…, Features OpenSkiMap réduites, calquées sur la structure réelle du dump. Les…, _seed(), test_facets_expose_countries_and_massifs(), test_map_endpoint_returns_geojson_points(), test_score_breakdown_is_returned(), test_search_empty_request_returns_everything() (+3 more)

### Community 97 - "robots.ts"
Cohesion: 0.19
Nodes (11): allowsPath(), CACHE, CachedRobots, Fetcher, forgetRobots(), parseRobots(), ROBOTS_AGENT, robotsAllows() (+3 more)

### Community 98 - "DomainSheet.tsx"
Cohesion: 0.15
Nodes (7): candidatesFor(), DomainLogo(), ICON_PATHS, Props, PROFILE_SHAPE, SKY_KEYS, SunIcon()

### Community 99 - "Deep-link niveau 2 — aucune URL appelée par l'application"
Cohesion: 0.17
Nodes (11): Deep-link Orchestra — dates injectées dans le hash, Captures avant / après — refonte Airbnb × Skiinfo, window.__DEMO_OVERRIDES__ — sonde de capture temporaire, Refonte « Airbnb × Skiinfo » — prompt corrigé v2, Jetons de design (accent bleu #0B6FC2, clair + sombre), Annexe B — maquette de référence SKITRACK App v4, Deep-link niveau 2 — aucune URL appelée par l'application, Champ `verified` — date de constat d'un pattern d'URL (+3 more)

### Community 100 - "package.json"
Cohesion: 0.17
Nodes (11): allowScripts, electron@33.4.11, esbuild@0.21.5, author, description, license, main, name (+3 more)

### Community 101 - "geocoding.py"
Cohesion: 0.27
Nodes (11): geocode_endpoint(), GeocodeResult, get, GeocodeResult, geocode(), _geocode_ban(), _geocode_nominatim(), _looks_french() (+3 more)

### Community 103 - "robots.test.ts"
Cohesion: 0.18
Nodes (11): anchored, check(), equal, fetcher(), mixed, named, orphan, permissive (+3 more)

### Community 104 - "Icons.tsx"
Cohesion: 0.18
Nodes (5): CloseIcon(), CloudIcon(), ExternalIcon(), RainIcon(), SnowIcon()

### Community 105 - "test_jobs_endpoints.py"
Cohesion: 0.15
Nodes (10): Origin, Adresse de départ. Plusieurs possibles (domicile, bureau, chez les parents)., Non-régression sur les endpoints qui démarrent une tâche de fond. Ces trois…, Garde-fou statique : une régression se verrait à la relecture du diff., Le job est bien créé et interrogeable — sans toucher au réseau., Une erreur serveur doit rester lisible par le renderer. Si elle remonte jusqu'à…, test_import_endpoint_returns_a_job(), test_job_starting_endpoints_are_coroutines() (+2 more)

### Community 106 - "Invariant : rien n'est inventé"
Cohesion: 0.20
Nodes (11): Invariant : rien n'est inventé, Coffre de clés safeStorage / DPAPI, Durcissement du renderer (contextIsolation, CSP, openExternal filtré), Clés d'API — env var lue une fois, chiffrée, jamais versionnée, Règles productives (prix + lieu) pour les centrales, keytar abandonné au profit de safeStorage, Connecteur MCP générique déclaratif (mcp-sources.json), Champ legalBasis obligatoire sur toute source déclarée (+3 more)

### Community 107 - "Handshake Electron ↔ Python"
Cohesion: 0.20
Nodes (11): Empaquetage : extraResources + recherche de l'interpréteur, ErrorEnvelopeMiddleware sous CORS, Handshake Electron ↔ Python, Pile de middlewares et CORS, Sidecar.diagnose() — traduction des motifs stderr, Sidecar.stop() — taskkill /T /F sur l'arborescence, Socket réservée sur port 0 puis passée à uvicorn, TokenAuthMiddleware (comparaison en temps constant) (+3 more)

### Community 108 - "Table access_metrics (distances pré-calculées)"
Cohesion: 0.18
Nodes (11): Table access_metrics (distances pré-calculées), Table accommodation, denivele_to_slope_m et le badge « skis aux pieds », location_precision exact / approximate, Table offer (guests dans la clé, price_total tout compris), Table price_point (historique de prix), Décorateur UTCDateTime (datetimes UTC aware), SQLite n'a pas d'index spatial (bbox + shapely en mémoire) (+3 more)

### Community 109 - "deploy-github.mjs"
Cohesion: 0.31
Nodes (10): collectTargets(), DEFAULT_PATHS, __dirname, getSha(), gh(), listFiles(), main(), parseArgs() (+2 more)

### Community 110 - "Pyrenees Illustration (sunrise over snowbound ridgeline)"
Cohesion: 0.35
Nodes (11): Massif Central (French ski massif), Massif Central Illustration (aerial winter resort village), Purpose-built resort village at the foot of the domain, High-altitude rocky relief above the treeline, Pyrenees (French ski massif), Pyrenees Illustration (sunrise over snowbound ridgeline), massif-<slug>.jpg naming convention for renderer massif illustrations, Mid-altitude forested massif with rounded summits (+3 more)

### Community 111 - "accessTime.ts"
Cohesion: 0.24
Nodes (8): AccessMode, AccessTime, accessTimeOf(), driveMinutes(), EngineAccessType, loin, paliers, walkMinutes()

### Community 113 - "verify.mjs"
Cohesion: 0.22
Nodes (8): fingerprint(), git(), input, output, ROOT, run, STAMP, WATCHED

### Community 114 - "test_curated_and_deeplinks.py"
Cohesion: 0.38
Nodes (9): build_links(), _config(), DeepLink, DeepLinkRequest, _fill(), BaseModel, Générateur d'URLs de recherche pré-remplies. Purement local : construit des…, test_deeplinks_fill_dates_and_encode_query() (+1 more)

### Community 115 - "ajax.ts"
Cohesion: 0.22
Nodes (9): AJAX_TIMEOUT, AjaxExchange, AjaxProbe, attachAjaxProbe(), pickHeaders(), REQ_KEYS, RES_KEYS, waitForIngenieForm() (+1 more)

### Community 117 - "extract_prix_centrale.py — prix réel d'une centrale"
Cohesion: 0.25
Nodes (9): SERP multi-types (hotel + apartment + residence), r.html — réponse searchAjax capturée, Payload searchAjax Ingénie (nbResults / nbResultsFiche), Fixture SERP Ceto — Megève, article.cpt-result — carte d'offre Orchestra, Fixture listing Open System, div.Resultat[data-cle] — annonce Open System avec prix réel, extract_prix_centrale.py — prix réel d'une centrale (+1 more)

### Community 118 - "centrals.ts"
Cohesion: 0.22
Nodes (8): Central, CENTRAL_HOSTS, CentralControl, CentralKind, CENTRALS, LOCAL_CENTRALS, OTA_HOSTS, OTAS

### Community 119 - "elevation.py"
Cohesion: 0.29
Nodes (9): elevation_at(), elevations(), _ign_batch(), _opentopo_batch(), Altimétrie. Deux fournisseurs, tous deux ouverts et sans clé : * **IGN…, Altitudes de points (lat, lon). Renvoie (altitude_m, fournisseur). Les points…, in_metropolitan_france(), Test grossier de bbox — sert uniquement à choisir l'IGN plutôt que SRTM. Un… (+1 more)

### Community 120 - "Orchestra PMB / Ceto (booking.chamonix.com, canal CMB)"
Cohesion: 0.29
Nodes (8): La Plagne Resort — UI custom, 12 villages, LOCATION_MAP (ref_c.LOCATION cmb.*), Orchestra PMB / Ceto (booking.chamonix.com, canal CMB), src/main/providers/ceto/ — connecteur Ceto, Fiches SERP article.cpt-result (data-product, data-geolocation), tools/extract-chamonix.mjs (payload-*.b64), L'import manuel par URL est une zone grise, pas une zone sûre, Import manuel par URL (Open Graph + JSON-LD)

### Community 121 - "fetch-obscura.mjs"
Cohesion: 0.25
Nodes (5): archive, dest, { file, bin }, OUT, ROOT

### Community 122 - "gen-types.mjs"
Cohesion: 0.25
Nodes (7): cli, openapi, outPath, root, schemaPath, sidecar, venvPython

### Community 123 - "sidecar/requirements.txt"
Cohesion: 0.29
Nodes (5): Planchers de version pour garantir une roue cp314 Windows, skitrack_v25.py — collecteur figé, quatre défauts consignés, skitrack_v26.py — collecteur multi-sites, Liste STATIONS — référence de nommage du projet, nodriver borné à 0.46.x — SyntaxError non-UTF-8 en 0.48/0.50

### Community 124 - "secrets.py"
Cohesion: 0.25
Nodes (8): push_secrets(), read_settings(), configured_keys(), has_secret(), Coffre de secrets *en mémoire*. Le sidecar ne lit ni n'écrit jamais les clés…, Remplace le contenu du coffre. Renvoie les noms de clés inconnues (ignorées)., Noms des clés présentes — jamais les valeurs., set_secrets()

### Community 125 - "test_handshake.py"
Cohesion: 0.29
Nodes (4): _get(), Le handshake, testé sur un vrai processus. C'est le seul point de contact entre…, Le token fourni sur stdin protège bien l'API — sans jamais apparaître dans la…, test_token_read_from_stdin_is_enforced()

### Community 126 - "photos.ts"
Cohesion: 0.36
Nodes (7): BY_FILE, fold(), heroPhoto(), IMAGES, MASSIF_FILES, massifPhoto(), urlOf()

### Community 127 - "ceto/hosts.ts"
Cohesion: 0.36
Nodes (8): CETO_HOSTS, hostOf(), isCetoHost(), isChamonixCentral(), isMegeveCentral(), isMeribelCentral(), isPlagneCentral(), isPrazCentral()

### Community 128 - "origins.ts"
Cohesion: 0.53
Nodes (5): addressOf(), ensureSidecarOrigin(), normalise(), ResolvedOrigin, resolveSidecarOrigin()

### Community 129 - "dependencies"
Cohesion: 0.29
Nodes (7): cheerio, electron-updater, dependencies, cheerio, electron-updater, playwright, playwright

### Community 130 - "services/http.py — point unique de cache, rate-limit et retry"
Cohesion: 0.29
Nodes (7): services/http.py — point unique de cache, rate-limit et retry, Stratégie de quota pour les itinéraires (pré-filtre vol d'oiseau, stopped_early), Table domain_access (profile est une ligne, pas une colonne), Table http_cache (TTL par namespace), Table origin (adresses de départ), IGN Géoplateforme RGE ALTI, OpenTopoData EU-DEM 25 m / SRTM 30 m

### Community 131 - "Modèle Station / Domaine"
Cohesion: 0.29
Nodes (7): DOMAIN_FIXES — rattachements corrigés à la main, Un manque est écrit, jamais comblé, Badge de domaine — aucun total de kilomètres inventé, collapseToStations (supprimé), Champ `pass` — le forfait relié tient lieu de domaine, referentiel.json — référentiel livré (173 entrées), Modèle Station / Domaine

### Community 132 - "Sprint 2 Ceto — notes, multi-SERP, deep-links"
Cohesion: 0.29
Nodes (7): Déploiement GitHub automatisé, .github/workflows/ci.yml — typecheck + smoke, scripts/deploy-github.mjs, GITHUB_TOKEN — PAT fine-grained hors du dépôt, Sprint 1 Ceto — statut (stub), Sprint 2 Ceto — notes, multi-SERP, deep-links, Badge ★ note TripAdvisor sur LodgingCard

### Community 133 - "Obscura — moteur headless CDP opt-in"
Cohesion: 0.29
Nodes (7): electron-builder, extraResources — sidecar copié hors de l'asar, Gel PyInstaller du sidecar pour distribution autonome, electron-builder, Obscura (binaire) — README, Firefox par défaut — Obscura 0/104 au sweep des centrales, Obscura — moteur headless CDP opt-in

### Community 134 - "stationVillage.ts"
Cohesion: 0.52
Nodes (6): cityMismatch(), expandAbbrevs(), matchVillageOption(), normPlace(), tokenCoverage(), VillageChoice

### Community 135 - "Onboarding.tsx"
Cohesion: 0.67
Nodes (3): LogoIcon(), fmtShort(), Onboarding()

### Community 136 - "DomainSearchPage.tsx"
Cohesion: 0.38
Nodes (4): isApproximate(), SearchBar(), shortLabel(), SORT_OPTIONS

### Community 137 - "extract-chamonix.mjs"
Cohesion: 0.29
Nodes (6): assembled, b64, code, dir, lib, parts

### Community 138 - "probe-ingenie-browser.mjs"
Cohesion: 0.48
Nodes (6): freePort(), probeObscura(), probePlaywright(), readForm(), rows, vendorBin()

### Community 139 - "airbnb-bookmarklet.src.ts"
Cohesion: 0.53
Nodes (5): collectAirbnb(), DeferredListing, getElementById(), prompt(), writeText()

### Community 140 - "Webisation — cible future"
Cohesion: 0.25
Nodes (7): Candidats cohérents, Ce qu'il ne faut pas faire, Ce que deviendrait chaque brique, Ce qui ne change pas, Le point de bascule : `store/userData.ts`, Pourquoi ce n'est pas fait, Webisation — cible future

### Community 141 - "ingenieHosts.ts"
Cohesion: 0.40
Nodes (5): hostOf(), INGENIE_HOSTS, ROBOTS_BLOCKED_HOSTS, SHORTFORM_HOSTS, shouldAttemptIngenie()

### Community 142 - "types.gen.ts"
Cohesion: 0.33
Nodes (5): components, $defs, operations, paths, webhooks

### Community 143 - "DomainCard.tsx"
Cohesion: 0.40
Nodes (3): AltitudeProfile(), Props, Props

### Community 144 - "ComparePanel.tsx"
Cohesion: 0.47
Nodes (5): bestOf(), Cell, ComparePanel(), ratios(), Row

### Community 145 - "budget.ts"
Cohesion: 0.47
Nodes (3): budgetHides(), BudgetParts, budgetVerdict

### Community 146 - "massif.ts"
Cohesion: 0.47
Nodes (5): fold(), MASSIF_TINTS, MASSIF_TINTS_FOLD, massifColor(), MassifTint

### Community 147 - "CombosPage.tsx"
Cohesion: 0.47
Nodes (5): CombosPage(), HEAT_FROM, HEAT_TO, heatColor(), isSchoolHoliday()

### Community 148 - "SettingsPage.tsx"
Cohesion: 0.47
Nodes (3): LegalSection(), purgeLocalData(), SHORTCUTS

### Community 149 - "TrackingPage.tsx"
Cohesion: 0.43
Nodes (6): nights(), Series, seriesOf(), SIMULATED_SHAPE, sparkPath(), TrackingPage()

### Community 150 - "ProviderCapabilities — capacités déclarées, pas supposées"
Cohesion: 0.50
Nodes (5): ProviderCapabilities — capacités déclarées, pas supposées, L'évitement des péages ne s'applique pas au calcul matriciel, Google Routes API, OpenRouteService, OSRM

### Community 151 - "Index de recherche places.ts — normalisation sans accents"
Cohesion: 0.40
Nodes (5): Village-station, VILLAGE_ALIASES — hameaux comme termes de recherche, Nombres écrits en lettres — seul manque réel de l'index, Index de recherche places.ts — normalisation sans accents, SearchBar en pilule à quatre segments

### Community 152 - "ErrorEnvelopeMiddleware"
Cohesion: 0.40
Nodes (4): ErrorEnvelopeMiddleware, BaseHTTPMiddleware, Request, Transforme toute erreur non prévue en réponse JSON, **sous** CORS. Un…

### Community 153 - "preload/index.ts"
Cohesion: 0.60
Nodes (3): api, Window, SkitrackApi

### Community 154 - "bulkImport.ts"
Cohesion: 0.32
Nodes (6): asNumber(), BulkContext, BulkResult, JSON_EXAMPLE, parseListingsJson(), toLodging()

### Community 155 - "hooks"
Cohesion: 0.40
Nodes (4): hooks, PreToolUse, Stop, $schema

### Community 156 - "airbnb"
Cohesion: 0.50
Nodes (3): npx, airbnb, @openbnb/mcp-server-airbnb

### Community 157 - "Snowfall.tsx"
Cohesion: 0.67
Nodes (3): Flake, makeFlakes(), Snowfall()

### Community 158 - "app-config.ts"
Cohesion: 0.50
Nodes (3): LODGING_SOURCES_OFF, OSRM_BASE, ROUTING_PROVIDER

### Community 160 - "Table snow_report"
Cohesion: 0.67
Nodes (3): Table snow_report, Météo-France BRA (bulletins d'avalanche), Open-Meteo (neige et météo)

### Community 191 - "glaciers.py"
Cohesion: 0.43
Nodes (6): detect_glaciers(), _elements_to_polygons(), _overpass_query(), Any, Détection des domaines glaciaires via Overpass. Le dump OpenSkiMap ne porte pas…, Convertit la sortie `out geom` d'Overpass en polygones shapely.

### Community 192 - "NormalizedAccommodation"
Cohesion: 0.29
Nodes (5): NormalizedAccommodation, Any, Fiche complète d'un logement., Charge utile brute -> objet pivot. Pure, sans I/O., Sortie pivot d'un connecteur — miroir des colonnes `Accommodation`. Un logement…

### Community 193 - "ResultCard.test.tsx"
Cohesion: 0.29
Nodes (5): full, loading, noImage, skeleton, square

### Community 194 - "Patch scrapers + UI recherche"
Cohesion: 0.33
Nodes (6): Chantier 5 — lodgPhase seule source de vérité, lodgLoading supprimé, Firefox (Gecko Playwright) comme navigateur par défaut des scrapers, AIRBNB_SEARCH_TIMEOUT_MS (120 s), Patch scrapers + UI recherche, Proxies scrape (SKITRACK_PROXY, prefer_mobile), Scrapers web multi-sources (SKITRACK_WEB_SCRAPE)

### Community 195 - "get_job"
Cohesion: 0.40
Nodes (6): get_job(), list_jobs(), providers(), get, JobStatus, ProviderStatus

### Community 196 - "tripShare.tsx"
Cohesion: 0.33
Nodes (3): ShareOutcome, TripShareContext, TripShareValue

## Ambiguous Edges - Review These
- `Pyrenees (French ski massif)` → `Pyrenees Illustration (sunrise over snowbound ridgeline)`  [AMBIGUOUS]
  src/renderer/src/assets/img/massif-pyrenees.jpg · relation: rationale_for
- `Global Controls: Suivi counter, Reglages, Language select, Voyageurs, Clair/Sombre toggle` → `Group Vote Status (Vote du groupe : aucun avis)`  [AMBIGUOUS]
  docs/refonte-captures/apres/5-decision.jpg · relation: conceptually_related_to
- `Cost Breakdown Card (Le cout, poste par poste)` → `Ranking Criteria Set (bas des pistes, point culminant, km, trajet, forfait, glacier, domaine relie)`  [AMBIGUOUS]
  docs/refonte-captures/avant/8-reglages.jpg · relation: conceptually_related_to
- `Alerts Configuration Panel` → `Settings Pill Tabs (Application, Administration, Mentions legales)`  [AMBIGUOUS]
  docs/refonte-captures/avant/8-reglages.jpg · relation: conceptually_related_to
- `Barre de navigation principale (Accueil · Domaines · Meilleures offres · Combinaisons · Décision · Logements)` → `Écran Meilleures offres (après refonte)`  [AMBIGUOUS]
  docs/refonte-captures/apres/3-offres.jpg · relation: shares_data_with
- `Badge d'affluence chiffré (« 33 · Faible », « 44 · Moyen »)` → `Principe affiché : « Aucun score opaque » — rien n'est estimé`  [AMBIGUOUS]
  docs/refonte-captures/apres/3-offres.jpg · relation: conceptually_related_to
- `Expedia Rapid (Expedia, Abritel/Vrbo)` → `Risque : le bas des pistes vaut ce que vaut la cartographie OSM`  [AMBIGUOUS]
  docs/RISQUES.md · relation: conceptually_related_to
- `Résumé de contexte « 4 voyageurs · 7 nuits · logement + forfaits + route »` → `Colonnes de semaines datées, avec repère de vacances scolaires (zone C)`  [AMBIGUOUS]
  docs/refonte-captures/avant/4-combinaisons.jpg · relation: conceptually_related_to
- `Défaut visible : quatre cartes portent le même titre « Studio Choucas — balcon est »` → `Grille de cartes d'offres à 4 colonnes`  [AMBIGUOUS]
  docs/refonte-captures/avant/3-offres.jpg · relation: references
- `Alpes du Sud Massif` → `High-Altitude Off-Piste Terrain (lone skier, cable-car span, sunburst over a sea of cloud)`  [AMBIGUOUS]
  src/renderer/src/assets/img/massif-alpes-sud.jpg · relation: conceptually_related_to
- `Jura Massif` → `Wooden Chalet Lodging in Snowbound Forest Foothills`  [AMBIGUOUS]
  src/renderer/src/assets/img/massif-jura.jpg · relation: conceptually_related_to

## Knowledge Gaps
- **899 isolated node(s):** `ROOT`, `STAMP`, `WATCHED`, `input`, `run` (+894 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Pyrenees (French ski massif)` and `Pyrenees Illustration (sunrise over snowbound ridgeline)`?**
  _Edge tagged AMBIGUOUS (relation: rationale_for) - confidence is low._
- **What is the exact relationship between `Global Controls: Suivi counter, Reglages, Language select, Voyageurs, Clair/Sombre toggle` and `Group Vote Status (Vote du groupe : aucun avis)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Cost Breakdown Card (Le cout, poste par poste)` and `Ranking Criteria Set (bas des pistes, point culminant, km, trajet, forfait, glacier, domaine relie)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Alerts Configuration Panel` and `Settings Pill Tabs (Application, Administration, Mentions legales)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Barre de navigation principale (Accueil · Domaines · Meilleures offres · Combinaisons · Décision · Logements)` and `Écran Meilleures offres (après refonte)`?**
  _Edge tagged AMBIGUOUS (relation: shares_data_with) - confidence is low._
- **What is the exact relationship between `Badge d'affluence chiffré (« 33 · Faible », « 44 · Moyen »)` and `Principe affiché : « Aucun score opaque » — rien n'est estimé`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `Expedia Rapid (Expedia, Abritel/Vrbo)` and `Risque : le bas des pistes vaut ce que vaut la cartographie OSM`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._