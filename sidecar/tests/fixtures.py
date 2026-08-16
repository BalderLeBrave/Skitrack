"""Features OpenSkiMap réduites, calquées sur la structure réelle du dump.

Les valeurs sont tirées de l'entrée « Tignes - Val d'Isère » du dump du
2026-08-11, tronquée aux champs utiles. Garder des fixtures fidèles au format
réel est ce qui rend ces tests utiles : un test contre un format inventé ne dit
rien de l'import réel.
"""

from __future__ import annotations

SKI_AREA_TIGNES = {
    "type": "Feature",
    "geometry": {
        "type": "Polygon",
        "coordinates": [
            [
                [6.90, 45.42],
                [7.03, 45.42],
                [7.03, 45.50],
                [6.90, 45.50],
                [6.90, 45.42],
            ]
        ],
    },
    "properties": {
        "id": "32dd7f13640a64baef6c2ff8bca5f2b88e7a4b0d",
        "name": "Tignes - Val d'Isère",
        "type": "skiArea",
        "status": "operating",
        "activities": ["downhill", "nordic"],
        "wikidataID": "Q991331",
        "websites": ["https://www.espacekilly.com/"],
        "sources": [{"id": "way/45421423", "type": "openstreetmap"}],
        "places": [
            {
                "iso3166_2": "FR-73",
                "iso3166_1Alpha2": "FR",
                "localized": {"en": {"region": "Savoie", "country": "France", "locality": "Tignes"}},
            },
            {
                "iso3166_2": "FR-73",
                "iso3166_1Alpha2": "FR",
                "localized": {
                    "en": {"region": "Savoie", "country": "France", "locality": "Val d'Isère"}
                },
            },
        ],
        "viewportHint": {"center": [6.96494255, 45.4593228]},
        "statistics": {
            "runs": {
                "minElevation": 1558.7,
                "maxElevation": 3455.5,
                "byActivity": {
                    "downhill": {
                        "byDifficulty": {
                            "novice": {"count": 58, "lengthInKm": 23.69, "snowmakingLengthInKm": 0},
                            "easy": {"count": 173, "lengthInKm": 92.82, "snowmakingLengthInKm": 10.0},
                            "intermediate": {
                                "count": 91,
                                "lengthInKm": 68.87,
                                "snowmakingLengthInKm": 0,
                            },
                            "advanced": {"count": 22, "lengthInKm": 22.01, "snowmakingLengthInKm": 0},
                            "expert": {"count": 1, "lengthInKm": 0.26, "snowmakingLengthInKm": 0},
                        }
                    },
                    "nordic": {"byDifficulty": {"other": {"count": 6, "lengthInKm": 1.97}}},
                },
            },
            "lifts": {
                "minElevation": 1558.8,
                "maxElevation": 3447.2,
                "byType": {
                    "gondola": {"count": 7, "lengthInKm": 12.07},
                    "chair_lift": {"count": 38, "lengthInKm": 45.89},
                },
            },
        },
    },
}

SKI_AREA_NORDIC_ONLY = {
    "type": "Feature",
    "geometry": {"type": "Point", "coordinates": [6.1, 46.2]},
    "properties": {
        "id": "nordic-only-1",
        "name": "Plateau nordique",
        "status": "operating",
        "activities": ["nordic"],
        "places": [
            {
                "iso3166_2": "FR-39",
                "iso3166_1Alpha2": "FR",
                "localized": {"en": {"region": "Jura", "country": "France", "locality": "Les Rousses"}},
            }
        ],
        "statistics": {},
    },
}

SKI_AREA_ABANDONED = {
    "type": "Feature",
    "geometry": {"type": "Point", "coordinates": [6.2, 45.1]},
    "properties": {
        "id": "abandoned-1",
        "name": "Téléski fantôme",
        "status": "abandoned",
        "activities": ["downhill"],
        "places": [{"iso3166_2": "FR-05", "iso3166_1Alpha2": "FR", "localized": {"en": {}}}],
        "statistics": {},
    },
}

SKI_AREA_AUSTRIA = {
    "type": "Feature",
    "geometry": {"type": "Point", "coordinates": [11.4, 47.2]},
    "properties": {
        "id": "at-1",
        "name": "Skigebiet Tirol",
        "status": "operating",
        "activities": ["downhill"],
        "places": [
            {
                "iso3166_2": "AT-7",
                "iso3166_1Alpha2": "AT",
                "localized": {"en": {"region": "Tyrol", "country": "Austria", "locality": "Sölden"}},
            }
        ],
        "statistics": {"runs": {"minElevation": 1350.0, "maxElevation": 3250.0}},
    },
}

LIFT_TIGNES = {
    "type": "Feature",
    "geometry": {
        "type": "LineString",
        # gare aval à 1559 m, gare amont à 2100 m — l'altitude est la 3ᵉ composante
        "coordinates": [[6.9050, 45.4680, 1559.0], [6.9200, 45.4750, 2100.0]],
    },
    "properties": {
        "id": "lift-1",
        "name": "Télécabine du Palet",
        "liftType": "gondola",
        "status": "operating",
        "skiAreas": [
            {
                "type": "Feature",
                "properties": {
                    "id": "32dd7f13640a64baef6c2ff8bca5f2b88e7a4b0d",
                    "name": "Tignes - Val d'Isère",
                },
            }
        ],
    },
}

LIFT_ORPHAN = {
    "type": "Feature",
    "geometry": {"type": "LineString", "coordinates": [[19.18, 48.50, 663.8], [19.19, 48.50, 724.9]]},
    "properties": {
        "id": "lift-orphan",
        "name": "Modrý vlek",
        "liftType": "platter",
        "status": "abandoned",
        "skiAreas": [],
    },
}
