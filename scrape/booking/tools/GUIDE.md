# Guide Booking.com — deux dépôts Selenium (isolés)

Cibles :

1. [groverkaushal/bookingdotcom-scraper](https://github.com/groverkaushal/bookingdotcom-scraper)
2. [gilbertekalea/booking.com_crawler](https://github.com/gilbertekalea/booking.com_crawler)

Ils vivent dans `scrape/booking/tools/` avec **leur propre venv**. Ils n’importent pas Airbnb, Gîtes, Crawlbase ni Camoufox.

> Booking.com en 2026 bloque le Selenium « nu ». Ces deux repos servent de référence UI. Le relevé Skitrack qui tient encore : Crawlbase → ScrapingBee → invisible / Camoufox / SeleniumBase UC.

## 1. Prérequis

| Outil | Version | Pourquoi |
|---|---|---|
| Python | 3.11 ou 3.12 | Grover indique 3.12.9 |
| pip | livré avec Python | deps Selenium / Pandas |
| Google Chrome | stable | les deux repos héritant `webdriver.Chrome` |
| ChromeDriver | via `webdriver-manager` | plus de zip à coller dans le PATH |

Vérif :

```bash
python3 --version
python3 -m pip --version
google-chrome --version || chromium --version
```

Windows : n’utilisez pas le `python` du Microsoft Store. `winget install --id Python.Python.3.12`.

## 2. Clonage et venv

```bash
cd scrape/booking/tools
git clone https://github.com/groverkaushal/bookingdotcom-scraper.git
git clone https://github.com/gilbertekalea/booking.com_crawler.git
```

### Grover (CSV Pandas, dates exactes)

```bash
cd bookingdotcom-scraper
python3.12 -m venv .venv
source .venv/bin/activate          # Windows : .venv\Scripts\activate
pip install -U pip
pip install -r requirements.txt webdriver-manager
```

### Gilbert (CSV/JSON, plages générées)

Le `requirements.txt` pin Selenium **4.1.3** (2022) et `find_element_by_*` (API morte). On installe un Selenium 4 récent :

```bash
cd booking.com_crawler
rm -rf venv                        # venv Windows livré dans le clone, inutilisable
python3.12 -m venv .venv
source .venv/bin/activate
pip install -U pip
pip install selenium pandas prettytable webdriver-manager python-dotenv
```

## 3. Critères de recherche

### Grover — fichier `.env`

```
BASE_URL = "https://www.booking.com"
SELENIUM_DRIVERS_PATH = ""
OUTPUT_DIR_PATH = "./outputs"
CURRENCY_TO_SELECT = ["Euro", "EUR", "€"]
PLACE_TO_SELECT = "Les 2 Alpes"
CHECK_IN_DATE_TO_SELECT = "2027-02-06"
CHECK_OUT_DATE_TO_SELECT = "2027-02-13"
OCCUPANCY_OPTIONS_TO_SELECT = [["group_adults",8], ["group_children",0], ["no_rooms",1]]
STAR_RATING_TO_SELECT = []
SORT_OPTION_TO_SELECT = "Price (lowest first)"
```

- Ville : `PLACE_TO_SELECT`
- Dates : `CHECK_IN_DATE_TO_SELECT` / `CHECK_OUT_DATE_TO_SELECT` (`YYYY-MM-DD`)
- Adultes / enfants / chambres : triplets `group_adults`, `group_children`, `no_rooms`
- Prix, photo, lien : extraits des cartes `[data-testid=property-card]` → colonnes `Price`, `Image URL`, `Booking Link`
- `STAR_RATING_TO_SELECT = []` : ne **pas** filtrer 4–5★ (ça vire les chalets)

### Gilbert — `client_input/destination_param.csv`

```csv
place,start_year,start_month,duration,adult,rooms
Les 2 Alpes,2027,2,7,8,1
```

Le bot **génère** les dates à partir de `start_month`/`start_year`/`duration` (il ne prend pas un check-in ISO). Pour une semaine du 6 au 13 février : `duration=7`, mois 2, année 2027. Les enfants ne sont pas un champ.

Champs exportés (README) : `property_name`, `property_price`, `property_images`, `property_url_link`, `property_address`, `property_score`, dates, adultes, chambres.

## 4. Lancement et export

```bash
# Grover → outputs/hotels.csv
cd bookingdotcom-scraper
source .venv/bin/activate
python main.py
```

```bash
# Gilbert → scraped_data/*.csv
cd booking.com_crawler
source .venv/bin/activate
python runbot.py
```

JSON Gilbert : le README l’annonce ; le code écrit surtout du CSV via `report.py`. Conversion :

```python
import pandas as pd
pd.read_csv("outputs/hotels.csv").to_json("outputs/hotels.json", orient="records", force_ascii=False)
```

## 5. Anti-blocage 2026

Déjà patché à l’init Chrome des deux clones :

- `excludeSwitches: enable-automation`
- `useAutomationExtension: false`
- `--disable-blink-features=AutomationControlled`
- `navigator.webdriver` undefined
- `webdriver-manager` (plus de ChromeDriver orphelin)
- `--lang=fr-FR`

Ça **ne suffit pas** face à Booking 2026 (403 / captcha / accueil). À faire en plus, sans mélanger les scrapers :

1. Relais **résidentiels** FR (`SKITRACK_PROXY`), pas d’IP datacenter.
2. Pas de `--headless` brutal (détecté) ; `headless=new` ou Camoufox `virtual`.
3. Pauses 2–6 s, pas de rythme fixe ; accueil → cookies → recherche (referer).
4. URL avec `sb_price_type=total` + `nflt=privacy_type=3` (logement entier, **total de séjour**).
5. Ne pas forcer des en-têtes `Sec-Fetch-Site: none` + UA aléatoire (ça casse l’empreinte).
6. Si Selenium tombe : Crawlbase / ScrapingBee (`booking-scraper-api`) déjà dans Skitrack.

Proxy (option) :

```python
options.add_argument("--proxy-server=http://user:pass@host:port")
```

Gilbert : `set_proxy()` existe, **non branché** (« Proxy - not yet implemented »).
