# Obscura (binaire)

Moteur headless CDP pour les scrapers Playwright (Ingénie, Booking web, Airbnb).

```
npm run obscura:fetch
```

Place `obscura` / `obscura.exe` ici. Non versionné (70 Mo).
Défaut dès que le binaire est là. `SKITRACK_BROWSER=chromium` force Chromium.
Maps / pixels abortés (SIGSEGV 0.2.1 sur les centrales Ingénie).
`SKITRACK_OBSCURA=/chemin` surcharge le binaire.
