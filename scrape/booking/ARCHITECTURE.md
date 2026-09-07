# Blueprint Booking 2026 (process isolé)

Selenium nu + URL `searchresults.html?ss=…` → accueil `errorc_searchstring_not_found`.
Cause : **pas de `dest_id` / `dest_type`**. Autocomplete Booking HTTP = 404.

## 1. Exécution & stealth

Pas de Chromium CDP maison (`navigator.webdriver`, plugins, WebGL). Booking le détecte.
Moteurs, dans l’ordre : **Crawlbase → ScrapingBee → Camoufox → invisible → UC**.
Profils persistants : `profile_store.py`. Pas d’en-têtes HTTP forcés.

## 2. dest_id

`dest.py` : cache stations → autocomplete Omkar (`dest_type` ≠ hotel) → `urls.search_url`
ajoute `dest_id`, `dest_type`, `ssne`. Crawlbase avec ces params : HTTP 200, 25 fiches.

## 3. Résilience

`failover.py` : last-good, cooldown 20 min, probe 8 s, retries.
`proxy.py` : résidentiel FR sticky, relais morts écartés. Crawlbase/ScrapingBee/Omkar
n’utilisent pas le pool local (ils ont le leur).

## 4. DOM & pagination

`map.py` : `data-testid=property-card`, totaux de séjour seulement, `privacy_type=3`.
Pagination `offset` × 25, max 15 pages. Photos : query `k=` BStatic.

## 5. API

```python
from scraper import BookingScraperEngine
e = BookingScraperEngine()
e.search("Les 2 Alpes", "2027-02-06", "2027-02-13", adults=8)
```

CLI inchangé : stdin JSON → stdout JSON.
