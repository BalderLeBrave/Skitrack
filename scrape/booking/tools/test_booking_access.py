import os
import time
from pathlib import Path

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.support.ui import WebDriverWait
from webdriver_manager.chrome import ChromeDriverManager

HERE = Path(__file__).resolve().parent
OUT = HERE / "test_booking_access_out"
CHROME = (
    os.environ.get("SKITRACK_CHROME")
    or os.environ.get("CHROME_BIN")
    or str(Path("/tmp/skitrack/scrape/booking/.browsers/chrome-linux64/chrome"))
)


def test_booking_access():
    print("=== Initialisation du test de contournement Booking ===")
    OUT.mkdir(parents=True, exist_ok=True)

    chrome_options = Options()
    # Mettez "--headless=new" si vous ne voulez pas voir la fenêtre s'ouvrir
    # Gardez-le commenté ou désactivé pour observer si un captcha s'affiche
    # chrome_options.add_argument("--headless=new")

    if Path(CHROME).is_file():
        chrome_options.binary_location = CHROME
        print(f"Chrome: {CHROME}")

    chrome_options.add_argument("--disable-gpu")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("start-maximized")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option("useAutomationExtension", False)
    chrome_options.add_argument("--lang=fr-FR")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--window-size=1440,900")

    chrome_ver = "151.0.7922.34"
    try:
        import subprocess

        out = subprocess.check_output([CHROME, "--version"], text=True)
        chrome_ver = out.strip().split()[-1]
        print(f"Chrome version: {chrome_ver}")
    except Exception:
        print(f"Chrome version fallback: {chrome_ver}")

    driver = webdriver.Chrome(
        service=Service(ChromeDriverManager(driver_version=chrome_ver).install()),
        options=chrome_options,
    )

    driver.execute_script(
        "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
    )
    try:
        url = (
            "https://www.booking.com/searchresults.html?ss=Les+2+Alpes"
            "&checkin=2027-02-06&checkout=2027-02-13&group_adults=8&no_rooms=1"
        )
        print(f"Connexion en cours à : {url}")
        driver.get(url)

        time.sleep(4)
        try:
            cookie_button = WebDriverWait(driver, 5).until(
                EC.element_to_be_clickable(
                    (
                        By.CSS_SELECTOR,
                        '#onetrust-accept-btn-handler, [data-cookie-banner="accept"]',
                    )
                )
            )
            cookie_button.click()
            print("-> [OK] Bannière de cookies validée avec succès.")
            time.sleep(2)
        except Exception:
            print("-> [Info] Pas de bannière de cookies détectée ou déjà acceptée.")

        title = driver.title
        print(f"-> Titre de la page récupérée : {title}")
        print(f"-> URL finale : {driver.current_url}")
        if (
            "403" in title
            or "Accès refusé" in title
            or "Error" in title
            or "Blocked" in title
        ):
            print(
                "-> [ALERTE] Échec : Booking a détecté le script (Erreur 403 ou page de blocage)."
            )
        else:
            cards = driver.find_elements(By.CSS_SELECTOR, '[data-testid="property-card"]')
            if len(cards) > 0:
                print(
                    f"-> [SUCCÈS] Connexion réussie ! {len(cards)} hôtels détectés sur la première vue."
                )
            else:
                print(
                    "-> [ATTENTION] La page s'est chargée mais aucun hôtel n'a été trouvé (structure modifiée ou page vide)."
                )
        (OUT / "title.txt").write_text(title or "", encoding="utf-8")
        (OUT / "url.txt").write_text(driver.current_url or "", encoding="utf-8")
        (OUT / "page.html").write_text(driver.page_source or "", encoding="utf-8")
        driver.save_screenshot(str(OUT / "page.png"))
        print(f"-> Capture : {OUT / 'page.png'}")
    except Exception as e:
        print(f"-> [ERREUR CRITIQUE] Une exception est survenue : {e}")
        try:
            driver.save_screenshot(str(OUT / "error.png"))
        except Exception:
            pass
    finally:
        print("Fermeture du navigateur de test dans 5 secondes...")
        time.sleep(5)
        driver.quit()


if __name__ == "__main__":
    test_booking_access()
