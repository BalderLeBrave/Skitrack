# Obscura (binaire)

Moteur headless CDP pour les scrapers Playwright (Ingénie, Booking web, Airbnb).

```
npm run obscura:fetch
```

Place `obscura` / `obscura.exe` ici. Non versionné (70 Mo).
**Opt-in** : `SKITRACK_BROWSER=obscura`. Le défaut est **Firefox** —
Obscura 0.2.1 a rendu **0/104** au sweep des centrales du 2026-08-24
(`docs/diagnostics/centrales-releve.md`) : moteur Ingénie invisible au DOM
évalué sur ~20 centrales prouvées live, « Network error » au `goto` sur ~19
hôtes même rejoués seuls. Chromium ne se lance que forcé :
`SKITRACK_BROWSER=chromium`.
Maps / pixels abortés — sans cet abort, 0.2.1 partait en SIGSEGV sur les
centrales Ingénie.
`SKITRACK_OBSCURA=/chemin` surcharge le binaire.

## Ce qui est mesuré, et ce qui ne l'est pas

`npm run scrape:probe-browser:win` sur la homepage des 2 Alpes, un tour :

| moteur | datedeb | ms | HTTP |
| --- | --- | --- | --- |
| chromium | INPUT | 9579 | 200 |
| firefox | INPUT | 5985 | 200 |
| obscura | INPUT | 8169 | 200 |

Deux choses à en retenir, et une à ne pas en tirer.

Obscura **voit le formulaire**. Le « 0 input `datedeb` sous 0.2.1 » de
`d132a81` ne se reproduit plus depuis `4b95d79` (injection de
`IngenieWidgetResaClient` avant `goto`) et `d810d06` (`waitForIngenieForm` en
poll `evaluate`).

Obscura passe devant Chromium, d'environ 15 %. Mais **Firefox passe devant
Obscura**, d'environ 27 %.

Ce qu'on ne peut pas en tirer : un classement. Un seul tour par moteur, sur une
page réelle où le réseau et le site pèsent plus lourd que le moteur, et 3,6 s
d'écart entre les extrêmes. Les 85 ms annoncés en amont mesurent un démarrage à
vide, pas ce chargement-ci. Relancer trois fois avant de décider quoi que ce
soit.
