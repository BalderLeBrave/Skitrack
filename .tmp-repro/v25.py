import asyncio
import random
import re
import logging
from datetime import datetime
from typing import List, Dict, Optional
from asyncio import Queue, Semaphore
import nodriver as uc
import pandas as pd
import json
import time
from urllib.parse import quote_plus

# ================== CONFIG ==================
DAYS = 7
ADULTS = 2
CHECK_IN = "2026-12-20"
CHECK_OUT = "2026-12-27"
MAX_RETRIES = 3
REQUEST_DELAY = (2, 5)

# ================== STATIONS (TOUS LES DOMAINES SKIABLES DE FRANCE) ==================
# Regroupées par massif pour lisibilité
STATIONS = [
    # ===== ALPES DU NORD =====
    "Abondance", "Alpe d'Huez", "Arêches-Beaufort", "Argentière", "Aussois",
    "Avoriaz", "Beaufort", "Bellentre", "Bernex", "Bessans",
    "Bonneval-sur-Arc", "Bourg-Saint-Maurice", "Bramans", "Brides-les-Bains",
    "Champagny-en-Vanoise", "Chamonix", "Champoléon", "Champoussin",
    "Chapelle d'Abondance", "Chatel", "Châtillon-en-Diois", "Choranche",
    "Clavans", "Combloux", "Corbier", "Cordon", "Courchevel",
    "Creux de Thônes", "Demix", "Deux Alpes", "Doucy", "Doussard",
    "Entremont", "Esserts-Blay", "Flaine", "Fontcouverte-la-Toussuire",
    "Giettaz", "Hauteluce", "Huez", "Isola 2000", "Jarrier",
    "La Clusaz", "La Féclaz", "La Ferrière", "La Grave", "La Giettaz",
    "La Loge des Gardes", "La Madeleine", "La Motte-Servolex", "La Norma",
    "La Plagne", "La Rosière", "La Saisies", "La Tania", "La Toussuire",
    "La Vanoise", "Landry", "Lans-en-Vercors", "Le Corbier", "Le Freney",
    "Le Grand-Bornand", "Le Grand-Serre", "Le Haut-Bréda", "Le Lioran",
    "Le Mont-Dore", "Le Reposoir", "Le Sappey-en-Chartreuse", "Le Tour",
    "Les Arcs", "Les Belleville", "Les Bottières", "Les Carroz",
    "Les Contamines", "Les Deux Alpes", "Les Gets", "Les Houches",
    "Les Karellis", "Les Menuires", "Les Orres", "Les Rousses",
    "Les Saisies", "Les Trois Vallées", "Méaudre", "Megève",
    "Méribel", "Montchavin", "Mont-de-Lans", "Montgenèvre",
    "Montriond", "Morillon", "Morzine", "Névache", "Notre-Dame-de-Bellecombe",
    "Notre-Dame-du-Pré", "Orelle", "Orcières", "Peisey-Nancroix",
    "Peisey-Vallandry", "Peyragudes", "Pralognan", "Praz-de-Lys",
    "Praz-sur-Arly", "Risoul", "Saint-Bernard", "Saint-Chaffrey",
    "Saint-Colomban-des-Villards", "Saint-François-Longchamp",
    "Saint-Gervais", "Saint-Jean-d'Aulps", "Saint-Jean-de-Sixt",
    "Saint-Lary-Soulan", "Saint-Martin-de-Belleville",
    "Saint-Martin-de-la-Cluse", "Saint-Martin-en-Vercors",
    "Saint-Michel-de-Chaillol", "Saint-Nicolas-de-Véroce",
    "Saint-Pancrace", "Saint-Sauveur", "Saint-Sorlin-d'Arves",
    "Saint-Urbain", "Saint-Véran", "Samoëns", "Serre Chevalier",
    "Serre-Ponçon", "Sixt-Fer-à-Cheval", "Super-Besse", "Super-Dévoluy",
    "Super-Lioran", "Tignes", "Tincave", "Trois Vallées",
    "Val d'Allos", "Val d'Isère", "Val Thorens", "Valdeblore",
    "Valloire", "Valmeinier", "Vars", "Vaujany", "Vercorin",
    "Villard-de-Lans", "Villard-Reculas", "Ville-d'Abondance",

    # ===== ALPES DU SUD =====
    "Auron", "Barcelonnette", "Bédoin", "Bois de la Bâtie",
    "Bormes", "Boscodon", "Buis-les-Baronnies", "Cairanne",
    "Castellane", "Cévennes", "Chabanon", "Chaillol",
    "Château-Arnoux", "Châteauneuf-de-Cannes",
    "Clue de Barle", "Col de la Bonette", "Col de Tende",
    "Colmars", "Die", "Digne", "Embrun", "Entrevaux",
    "Forcalquier", "Gap", "Gorges du Verdon", "Isola 2000",
    "Lac de Serre-Ponçon", "Laragne", "Larche", "Lauzet",
    "Le Brusquet", "Le Fugeret", "Le Lauzet", "Le Queyras",
    "Malaucène", "Manosque", "Méailles", "Mercantour",
    "Montgenèvre", "Moustiers", "Nice", "Oze", "Pelvoux",
    "Pra-Loup", "Rabou", "Rémuzat", "Riez", "Royans",
    "Saint-Auban", "Saint-Jeannet", "Saint-Laurent",
    "Saint-Michel-l'Observatoire", "Saint-Paul", "Saint-Pierre",
    "Saint-Savournin", "Saint-Zacharie", "Salernes", "Sassenage",
    "Savines", "Seyne", "Sisteron", "Sospel",
    "St-Étienne", "St-Maime", "St-Marc-Jaumegarde",
    "St-Martin-Vésubie", "St-Michel", "St-Raphaël",
    "St-Saturnin", "St-Théoffrey", "Thoard",
    "Toulon", "Ubaye", "Valberg", "Valbelle", "Valdeblore",
    "Valensole", "Vallée des Merveilles", "Vallée du Verdon",
    "Vaucluse", "Ventoux", "Verdon", "Vernet", "Villecroze",
    "Vinon", "Vivarais",

    # ===== PYRÉNÉES =====
    "Artouste", "Ax 3 Domaines", "Barèges", "Bolquère Pyrénées 2000",
    "Cauterets", "Font-Romeu", "Gourette", "Grand Tourmalet",
    "Guzet", "Hautacam", "La Pierre Saint-Martin", "Les Angles",
    "Luz Ardiden", "Mijanes - Donezan", "Piau Engaly",
    "Porté-Puymorens", "Val Louron", "Saint-Lary-Soulan", "Peyragudes",

    # ===== JURA =====
    "Bellefontaine", "Foncine-le-Haut", "Métabief",
    "Monts Jura",  # regroupe Lélex-Crozet, Mijoux-la-Faucille, Menthières
    "Les Rousses",

    # ===== VOSGES =====
    "La Bresse", "Gérardmer", "Le Lac Blanc", "Ventron",
    "La Planche des Belles Filles", "La Schlucht", "Le Ballon d'Alsace",
    "Le Champ du Feu", "Le Grand Ballon", "Le Markstein",
    "Le Schnepfenried",

    # ===== MASSIF CENTRAL =====
    "Super-Besse", "Le Lioran", "Le Mont-Dore",
    "Brameloup", "Chalmazel", "La Croix de Bauzon",
    "Chastreix-Sancy", "Le Guéry"
]

# ================== SITES DE RÉSERVATION ==================
SITES = {
    # Sites généralistes
    "booking": {
        "url": "https://www.booking.com/searchresults.html?ss=",
        "type": "general"
    },
    "airbnb": {
        "url": "https://www.airbnb.fr/s/",
        "type": "general"
    },
    "expedia": {
        "url": "https://www.expedia.com/Fr/?q=",
        "type": "general"
    },
    "hotels.com": {
        "url": "https://www.hotels.com/search/?ss=",
        "type": "general"
    },
    "gitesdefrance": {
        "url": "https://www.gites-de-france.com/recherche?destination=",
        "type": "gites"
    },
    "gites.com": {
        "url": "https://www.gites.com/fr/search/?q=",
        "type": "gites"
    },
    "cozycozy": {
        "url": "https://www.cozycozy.com/search?location=",
        "type": "general"
    },
    "skis4free": {
        "url": "https://www.skis4free.com/search/results/?q=",
        "type": "ski"
    },
    
    # Centrales de réservation France Montagnes
    "alpes_du_nord": {
        "url": "https://www.les2alpes.com/reserver/",
        "type": "station",
        "stations": ["Les Deux Alpes", "Alpe d'Huez"]
    },
    "alpes_du_sud": {
        "url": "https://www.valberg.com/reserver/",
        "type": "station",
        "stations": ["Valberg", "Auron", "Isola 2000"]
    },
    "pyrenees": {
        "url": "https://www.n-pyrenees.com/reserver/",
        "type": "station",
        "stations": ["Saint-Lary-Soulan", "Peyragudes", "Barèges", "Cauterets", "Gourette", "Font-Romeu"]
    },
    "jura": {
        "url": "https://www.lesrousses.com/reserver/",
        "type": "station",
        "stations": ["Les Rousses", "Métabief", "Bellefontaine"]
    },
    "massif_central": {
        "url": "https://www.superbesse.com/reserver/",
        "type": "station",
        "stations": ["Super-Besse", "Le Lioran", "Le Mont-Dore"]
    },
    "vosges": {
        "url": "https://www.lavosgiedesneiges.com/reserver/",
        "type": "station",
        "stations": ["La Bresse", "Gérardmer", "Le Lac Blanc"]
    }
}

# ================== MAPPING STATION -> SITE ==================
STATION_SITE_MAPPING = {
    # Alpes du Nord
    "Les Deux Alpes": "alpes_du_nord",
    "Alpe d'Huez": "alpes_du_nord",
    # Alpes du Sud
    "Valberg": "alpes_du_sud",
    "Auron": "alpes_du_sud",
    "Isola 2000": "alpes_du_sud",
    # Pyrénées
    "Saint-Lary-Soulan": "pyrenees",
    "Peyragudes": "pyrenees",
    "Barèges": "pyrenees",
    "Cauterets": "pyrenees",
    "Gourette": "pyrenees",
    "Font-Romeu": "pyrenees",
    # Jura
    "Les Rousses": "jura",
    "Métabief": "jura",
    "Bellefontaine": "jura",
    # Massif Central
    "Super-Besse": "massif_central",
    "Le Lioran": "massif_central",
    "Le Mont-Dore": "massif_central",
    # Vosges
    "La Bresse": "vosges",
    "Gérardmer": "vosges",
    "Le Lac Blanc": "vosges",
    # Pour les autres stations, on utilisera booking par défaut (via get_station_sites)
}

# ================== FONCTIONS UTILITAIRES ==================
def parse_price(raw) -> float:
    if raw is None:
        return float("nan")
    txt = re.sub(r"[^\d.,]", "", str(raw))
    if not txt:
        return float("nan")
    last_dot, last_comma = txt.rfind("."), txt.rfind(",")
    sep = max(last_dot, last_comma)
    if sep == -1 or len(txt) - sep - 1 == 3:
        txt = txt.replace(".", "").replace(",", "")
    else:
        txt = txt[:sep].replace(".", "").replace(",", "") + "." + txt[sep + 1:]
    try:
        return float(txt)
    except ValueError:
        return float("nan")

def format_station_name(station: str) -> str:
    """Formate le nom de la station pour les URLs"""
    return quote_plus(station.replace("'", "").strip())

def get_station_sites(station: str) -> List[str]:
    """Retourne la liste des sites à utiliser pour une station donnée"""
    sites = []
    
    # 1. Site spécifique de la station (si disponible)
    main_site = STATION_SITE_MAPPING.get(station)
    if main_site and main_site in SITES:
        sites.append(main_site)
    
    # 2. Sites généralistes
    general_sites = ["booking", "airbnb", "expedia", "hotels.com"]
    for site in general_sites:
        if site not in sites:
            sites.append(site)
    
    # 3. Sites de gîtes
    gites_sites = ["gitesdefrance", "gites.com"]
    for site in gites_sites:
        if site not in sites:
            sites.append(site)
    
    # 4. Sites spécialisés ski
    if "skis4free" not in sites:
        sites.append("skis4free")
    
    return sites

# ================== EXTRACTION DES RÉSULTATS ==================
async def extract_results(tab, site_key: str, station: str):
    """Extrait les résultats d'un site donné pour une station"""
    results = []
    site_config = SITES.get(site_key)
    if not site_config:
        return results
    
    base_url = site_config["url"]
    station_formatted = format_station_name(station)
    
    url = await build_search_url(base_url, station_formatted, site_key)
    
    try:
        await tab.get(url)
        await asyncio.sleep(random.uniform(REQUEST_DELAY[0], REQUEST_DELAY[1]))
        
        selectors = get_selectors_for_site(site_key)
        
        cards = []
        for selector in selectors:
            try:
                cards = await tab.select_all(selector, timeout=5000)
                if cards:
                    break
            except:
                continue
        
        if not cards:
            return results
        
        for card in cards:
            try:
                result = await extract_card_data(card, site_key, station)
                if result:
                    results.append(result)
            except Exception:
                continue
                
    except Exception as e:
        logger.error(f"❌ Erreur extraction {station} sur {site_key}: {e}")
    
    return results

async def build_search_url(base_url: str, station_formatted: str, site_key: str) -> str:
    """Construit l'URL de recherche en fonction du site"""
    if site_key in ["booking", "hotels.com"]:
        return f"{base_url}{station_formatted}&checkin={CHECK_IN}&checkout={CHECK_OUT}&group_adults={ADULTS}"
    elif site_key == "airbnb":
        return f"{base_url}{station_formatted}?checkin={CHECK_IN}&checkout={CHECK_OUT}&adults={ADULTS}"
    elif site_key in ["gitesdefrance", "gites.com"]:
        return f"{base_url}{station_formatted}&checkin={CHECK_IN}&checkout={CHECK_OUT}&adults={ADULTS}"
    elif site_key == "skis4free":
        return f"{base_url}{station_formatted}&checkin={CHECK_IN}&checkout={CHECK_OUT}&adults={ADULTS}"
    elif site_key in ["alpes_du_nord", "alpes_du_sud", "pyrenees", "jura", "massif_central", "vosges"]:
        return f"{base_url}?date={CHECK_IN}&date_end={CHECK_OUT}&adultes={ADULTS}"
    else:
        return f"{base_url}{station_formatted}"

def get_selectors_for_site(site_key: str) -> List[str]:
    """Retourne les sélecteurs CSS pour chaque site"""
    selectors = {
        "booking": [
            '[data-testid="card-container"]',
            '.srp-grid-list__item',
            '.property-card'
        ],
        "airbnb": [
            '[data-testid="listing-card"]',
            '.listing-card-container',
            '.t1jojoys'
        ],
        "expedia": [
            '[data-testid="property-card"]',
            '.uitk-card',
            '.hotel-card'
        ],
        "hotels.com": [
            '.hotel-card',
            '.property-card',
            '.result-item'
        ],
        "gitesdefrance": [
            '.gite-card',
            '.result-item',
            '.card-gite'
        ],
        "gites.com": [
            '.property-card',
            '.gite-item',
            '.result-card'
        ],
        "skis4free": [
            '.skis4free-card',
            '.property-card',
            '.search-result'
        ],
        "cozycozy": [
            '.accommodation-card',
            '.property-card',
            '.result-item'
        ]
    }
    return selectors.get(site_key, ['[data-testid="card-container"]', '.property-card'])

async def extract_card_data(card, site_key: str, station: str) -> Optional[Dict]:
    """Extrait les données d'une carte d'hébergement"""
    try:
        title_selectors = [
            '[data-testid="listing-card-title"]',
            '[data-testid="title"]',
            '.gite-title',
            '.property-title',
            'h3',
            '[class*="title"]'
        ]
        title = None
        for selector in title_selectors:
            try:
                el = await card.select(selector)
                if el:
                    title = (await el.text()).strip()
                    break
            except:
                continue
        
        price_selectors = [
            '[data-testid="listing-price"]',
            '.price',
            '.gite-price',
            '.property-price',
            '[class*="price"]',
            '[data-testid="price"]'
        ]
        price = None
        for selector in price_selectors:
            try:
                el = await card.select(selector)
                if el:
                    price = (await el.text()).strip()
                    break
            except:
                continue
        
        link = None
        try:
            link_el = await card.select('a')
            if link_el:
                link = await link_el.get_attribute("href")
                if link and not link.startswith('http'):
                    link = f"https://www.{site_key}.com{link}"
        except:
            pass
        
        if title and price and link:
            return {
                "name": title,
                "price": price,
                "price_num": parse_price(price),
                "url": link,
                "site": station,
                "source": site_key,
                "check_in": CHECK_IN,
                "check_out": CHECK_OUT,
                "adults": ADULTS,
                "timestamp": datetime.now().isoformat()
            }
    except Exception:
        pass
    return None

# ================== PROXY MANAGER ==================
class ProxyManager:
    def __init__(self, proxies=None):
        self.proxies = proxies or []
        self.current_idx = 0
        self.station_proxy_map = {}

    def get_next_proxy(self, station):
        if not self.proxies:
            return None
        if station not in self.station_proxy_map:
            self.station_proxy_map[station] = self.proxies[self.current_idx % len(self.proxies)]
            self.current_idx = (self.current_idx + 1) % len(self.proxies)
        return self.station_proxy_map[station]

def get_databay_proxies():
    """Retourne les proxies (à configurer)"""
    return [
        # "username:password@proxy.databay.com:port",
    ]

# ================== WORKER ==================
class AsyncScrapingWorker:
    def __init__(self, name: str, queue: Queue, semaphore: Semaphore, proxy_manager: ProxyManager):
        self.name = name
        self.queue = queue
        self.semaphore = semaphore
        self.proxy_manager = proxy_manager
        self.results: List[Dict] = []
        self.browser = None

    async def run(self):
        while True:
            task = await self.queue.get()
            if task is SENTINEL:
                logger.info(f"🛑 [{self.name}] Arrêt propre")
                self.queue.task_done()
                break

            station, site_key = task
            async with self.semaphore:
                try:
                    proxy = self.proxy_manager.get_next_proxy(station)
                    if proxy:
                        logger.debug(f"[{self.name}] Proxy {proxy} pour {station}")

                    config = uc.Config(
                        headless=True,
                        browser_args=[
                            "--no-sandbox",
                            "--disable-dev-shm-usage",
                            "--disable-blink-features=AutomationControlled"
                        ]
                    )
                    
                    self.browser = await uc.start(config=config)
                    
                    if proxy:
                        tab = await self.browser.create_context(
                            proxy_server=f"http://{proxy}",
                            url=f"http://{proxy}"
                        )
                    else:
                        tab = await self.browser.create_context()

                    await asyncio.sleep(random.uniform(2, 4))

                    site_results = await extract_results(tab, site_key, station)
                    if site_results:
                        self.results.extend(site_results)
                        logger.info(f"[{self.name}] ✅ {len(site_results)} résultats sur {station} via {site_key}")
                    else:
                        logger.info(f"[{self.name}] ⚠️ Aucun résultat sur {station} via {site_key}")

                except Exception as e:
                    logger.error(f"[{self.name}] ❌ Erreur {station}/{site_key}: {e}")
                finally:
                    if self.browser:
                        try:
                            await self.browser.stop()
                        except:
                            pass
                    self.queue.task_done()

        return self.results

# ================== MAIN ==================
async def main():
    try:
        queue: Queue = Queue(maxsize=100)
        semaphore = Semaphore(4)
        proxy_manager = ProxyManager(get_databay_proxies())
        
        workers = [
            AsyncScrapingWorker(f"Worker-{i+1}", queue, semaphore, proxy_manager)
            for i in range(4)
        ]

        logger.info(f"📦 Production: {len(STATIONS)} stations")
        for station in STATIONS:
            sites = get_station_sites(station)
            for site in sites:
                await queue.put((station, site))
                logger.debug(f"📤 {station} -> {site}")

        for _ in range(4):
            await queue.put(SENTINEL)

        worker_tasks = [asyncio.create_task(w.run()) for w in workers]
        
        await queue.join()
        
        for task in worker_tasks:
            await task

        all_results = []
        for w in workers:
            if w.results:
                all_results.extend(w.results)

        if all_results:
            df = pd.DataFrame(all_results)
            df.to_csv("skitrack_results_complete.csv", index=False, encoding="utf-8-sig")
            with open("skitrack_results_complete.json", "w", encoding="utf-8") as f:
                json.dump(all_results, f, indent=2, ensure_ascii=False)
            
            if "price_num" in df.columns:
                df_sorted = df.sort_values("price_num", ascending=True, na_position="last")
                df_sorted.head(30).to_csv("skitrack_top30.csv", index=False)
            
            stats = df.groupby('source').size().to_dict()
            logger.info(f"📊 Statistiques: {stats}")
            logger.info(f"🎉 Terminé ! {len(all_results)} logements collectés")
        else:
            logger.warning("⚠️ Aucun résultat collecté")

    except Exception as e:
        logger.error(f"❌ Erreur principale: {e}")
        raise

if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s | %(levelname)-8s | %(name)s | %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    logger = logging.getLogger("SkisTrack")
    SENTINEL = object()
    asyncio.run(main())
