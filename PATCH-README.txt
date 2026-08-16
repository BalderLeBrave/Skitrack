SKITRACK — patch scrapers + UI recherche (Airbnb auto, critères, ski, carte, timeouts, proxies)
================================================================================================

Contenu : fichiers ajoutés ou modifiés uniquement.
À dézipper à la racine de votre projet skitrack (même arborescence).

Installation (PowerShell)
-------------------------
  cd "C:\Users\Adrien RAFFRAY\Dev\skitrack"
  # Sauvegarde recommandée avant extraction
  Expand-Archive -Path ".\skitrack-patch-scrapers-ui.zip" -DestinationPath . -Force
  npm install
  npx playwright install chromium
  npm run dev

Parcours UI
-----------
  Domaine → Logements → critères (dates, voyageurs…) → Rechercher
  → écran ski + carte interactive → résultats

Proxies (optionnel)
-------------------
  SKITRACK_MOBILE_PROXY=http://user:pass@host:port
  SKITRACK_PROXY=http://user:pass@host:port
  SKITRACK_PROXY_MODE=prefer_mobile
  Secrets app : scrape_proxy_mobile, scrape_proxy

Scrapers web multi-sources
--------------------------
  Activés par défaut (Booking, Hotels.com, Expedia, Gîtes, CozyCozy).
  Désactiver : SKITRACK_WEB_SCRAPE=0

Timeout recherche Airbnb UI : 120 s (AIRBNB_SEARCH_TIMEOUT_MS)
