#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Collecteur multi-sites — version avec configuration intégrée.

    tools/.venv/Scripts/python tools/skitrack_v29.py --dry-run
    tools/.venv/Scripts/python tools/skitrack_v29.py --stations "Les Deux Alpes" --limit 1 --no-headless
    tools/.venv/Scripts/python tools/skitrack_v29.py --sites airbnb booking  # uniquement ces sources

## Principe
- Pour chaque station, on interroge TOUJOURS Airbnb et Booking (mode URL).
- Si la station possède un site officiel de réservation (défini dans STATION_CONFIG),
  on l'interroge EN PLUS (mode formulaire).
- Les deux modes de collecte sont conservés : URL (GET) et Formulaire (POST + clic).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import random
import re
import sys
from asyncio import Queue
from datetime import datetime
from pathlib import Path
from typing import Any, Iterable
import unicodedata
from urllib.parse import quote_plus, unquote_plus, urljoin

import nodriver as uc
import pandas as pd

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from skitrack_v25 import STATIONS  # noqa: E402

log = logging.getLogger("skitrack29")

# ================== CONFIG ==================
CHECK_IN = "2026-12-20"
CHECK_OUT = "2026-12-27"
ADULTS = 2

WORKERS = 4
MAX_PAGES = 30
REQUEST_DELAY = (2.0, 5.0)
SELECTOR_TIMEOUT_S = 6.0

# ================== SOURCES ==================
# Les sources généralistes (mode URL) sont TOUJOURS interrogées pour toutes les stations
GENERAL_SITES = ["airbnb", "booking"]

# Configuration des sites officiels par station (mode formulaire)
# Chaque station peut avoir un site spécifique avec ses propres sélecteurs.
# Si une station n'est pas dans ce dictionnaire, elle n'aura pas de site officiel.
STATION_CONFIG: dict[str, dict[str, Any]] = {
    # ===== ALPES DU NORD =====
    "Areches-Beaufort": {
        "url": "https://reservation.areches-beaufort.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": "samedi/samedi, dimanche/dimanche, court séjour"
    },
    "Chamonix": {
        "url": "https://booking.chamonix.com/fr/",
        "form_selectors": {
            "checkin": 'input[name="checkin"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="checkout"], input[placeholder*="départ"]',
            "adults": 'select[name="adults"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Réserver")',
        },
        "notes": "dates en français"
    },
    "Les Houches": {
        "url": "https://booking.chamonix.com/fr/",
        "form_selectors": {
            "checkin": 'input[name="checkin"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="checkout"], input[placeholder*="départ"]',
            "adults": 'select[name="adults"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Réserver")',
        },
        "notes": "même site que Chamonix"
    },
    "Flumet / St Nicolas la Chapelle": {
        "url": "https://reservation.valdarly-montblanc.com/",
        "form_selectors": {
            "station": 'select[name="station"], input[name="station"]',
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": "liste déroulante station (Flumet, Crest-Voland, La Giettaz, Notre-Dame-de-Bellecombe)"
    },
    "Crest-Voland / Cohennoz": {
        "url": "https://reservation.valdarly-montblanc.com/",
        "form_selectors": {
            "station": 'select[name="station"], input[name="station"]',
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": "liste déroulante station (Flumet, Crest-Voland, La Giettaz, Notre-Dame-de-Bellecombe)"
    },
    "Notre Dame de Bellecombe": {
        "url": "https://reservation.valdarly-montblanc.com/",
        "form_selectors": {
            "station": 'select[name="station"], input[name="station"]',
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": "liste déroulante station (Flumet, Crest-Voland, La Giettaz, Notre-Dame-de-Bellecombe)"
    },
    "La Giettaz en Aravis": {
        "url": "https://reservation.valdarly-montblanc.com/",
        "form_selectors": {
            "station": 'select[name="station"], input[name="station"]',
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": "liste déroulante station (Flumet, Crest-Voland, La Giettaz, Notre-Dame-de-Bellecombe)"
    },
    "La Norma": {
        "url": "https://reservation.haute-maurienne-vanoise.com/ac54-la-norma.htm",
        "form_selectors": {
            "checkin": 'input[name="date_debut"], input[name*="arrivee"]',
            "checkout": 'input[name="date_fin"], input[name*="depart"]',
            "adults": 'select[name="nb_adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": "dates libres"
    },
    "La Plagne": {
        "url": "https://www.laplagneresort.com/",
        "form_selectors": {
            "station": 'select[name="station"], input[name="station"]',
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": "choix station (Plagne Aime 2000, Belle Plagne, etc.)"
    },
    "La Rosière": {
        "url": "https://reservation.larosiere.net/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": "dates libres"
    },
    "Les 2 Alpes": {
        "url": "https://reservation.les2alpes.com/",
        "form_selectors": {
            "station": 'input[name="station"], input[placeholder*="station"]',
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": "séjour du samedi au samedi"
    },
    "Les Karellis": {
        "url": "https://www.karellis-reservation.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Les Saisies": {
        "url": "https://reservation.lessaisies.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Pralognan la Vanoise": {
        "url": "https://www.reservationpralognan.fr/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Saint François Longchamp": {
        "url": "https://reservation.saintfrancoislongchamp.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Saint Martin de Belleville": {
        "url": "https://fr.locationsaintmartin.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Saint Foy Tarentaise": {
        "url": "https://www.saintefoy-reservation.com/fr/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Val Cenis": {
        "url": "https://reservation.haute-maurienne-vanoise.com/ac57-val-cenis.htm",
        "form_selectors": {
            "checkin": 'input[name="date_debut"], input[name*="arrivee"]',
            "checkout": 'input[name="date_fin"], input[name*="depart"]',
            "adults": 'select[name="nb_adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Valloire": {
        "url": "https://www.valloire.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Valmorel": {
        "url": "https://www.valmorel.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Combloux": {
        "url": "https://reservation.combloux.com/?lang=fr_FR",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "La Clusaz": {
        "url": "https://www.laclusaz.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Alpe d'Huez": {
        "url": "https://reservation.alpedhuez.com/?user-facet=winter",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Aussois": {
        "url": "https://reservation.haute-maurienne-vanoise.com/ac62-aussois.htm",
        "form_selectors": {
            "checkin": 'input[name="date_debut"], input[name*="arrivee"]',
            "checkout": 'input[name="date_fin"], input[name*="depart"]',
            "adults": 'select[name="nb_adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Bonneval sur Arc": {
        "url": "https://reservation.haute-maurienne-vanoise.com/ac64-bonneval-sur-arc.htm",
        "form_selectors": {
            "checkin": 'input[name="date_debut"], input[name*="arrivee"]',
            "checkout": 'input[name="date_fin"], input[name*="depart"]',
            "adults": 'select[name="nb_adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Courchevel": {
        "url": "https://reservation.courchevel.com/?lang=fr_FR",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "La Toussuire": {
        "url": "https://reservation.la-toussuire.com/z14220_fr-.aspx",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Les Menuires": {
        "url": "https://fr.locationlesmenuires.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Meribel": {
        "url": "https://reservations.meribel.net/?lang=fr_FR",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Peisey Vallandry": {
        "url": "https://www.peisey-vallandry.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Saint Sorlin d'Arves": {
        "url": "https://www.saintsorlindarves.com/hebergements/reservation",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": "page info avec bouton réservation"
    },
    "Tignes": {
        "url": "https://reservation.tignes.net/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Val d'Isère": {
        "url": "https://reservation.valdisere.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Valfréjus": {
        "url": "https://www.valfrejus.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Valmeinier": {
        "url": "https://www.valmeinier-reservation.com/hiver",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Val Thorens": {
        "url": "https://reservation.valthorens.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Chamrousse": {
        "url": "https://www.chamrousse.com/hiver",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Le Collet": {
        "url": "https://reservation.lecollet.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },

    # ===== ALPES DU SUD =====
    "Isola 2000": {
        "url": "https://isola2000.com/reservez-votre-sejour/#/lodgings",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": "application JS, risque de ne pas fonctionner"
    },
    "Le Dévoluy": {
        "url": "https://reservation.ledevoluy.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Orcières Merlette / Serre-Eyraud": {
        "url": "https://reservation.orcieres.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Risoul": {
        "url": "https://www.risoul.com/reserver.html",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Valberg": {
        "url": "https://www.valberg.com/sejourner/reserver-votre-sejour/#/lodgings",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": "application JS, risque de ne pas fonctionner"
    },
    "Les Orres": {
        "url": "https://reservation.lesorres.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Montgenèvre": {
        "url": "https://reservation.montgenevre.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Puy Saint Vincent": {
        "url": "https://www.paysdesecrins.com/hebergements/#/lodgings",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": "application JS, risque de ne pas fonctionner"
    },
    "Serre Chevalier": {
        "url": "https://reservation.serre-chevalier.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Val d'Allos": {
        "url": "https://www.valdallos.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Vars": {
        "url": "https://www.alpes-sudlocations.com/reservation-sejour-vars/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },

    # ===== PYRÉNÉES =====
    "Ax les Thermes": {
        "url": "https://reservation.ax-ski.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Grand Tourmalet": {
        "url": "https://www.n-py.com/fr/ete/sejour-pyrenees/hebergement",
        "form_selectors": {
            "station": 'select[name="station"], input[name="station"]',
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": "centrale N'PY pour les Pyrénées"
    },
    "Les Angles": {
        "url": "https://lesangles.com/offres-hebergements/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Saint Lary Soulan": {
        "url": "https://resa.saintlary.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },

    # ===== MASSIF CENTRAL =====
    "Besse Super Besse": {
        "url": "https://www.sancy.com/hebergement/",
        "form_selectors": {
            "station": 'select[name="station"], input[name="station"]',
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": "centrale Sancy (Super-Besse, Mont-Dore)"
    },
    "Le Mont Dore": {
        "url": "https://www.sancy.com/hebergement/",
        "form_selectors": {
            "station": 'select[name="station"], input[name="station"]',
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": "centrale Sancy (Super-Besse, Mont-Dore)"
    },

    # ===== VOSGES =====
    "La Bresse Hohneck": {
        "url": "https://www.labresse.net/hebergements-a-la-bresse-hautes-vosges/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Saint Maurice sur Moselle": {
        "url": "https://www.ballons-hautes-vosges.com/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
    "Gérardmer": {
        "url": "https://www.gerardmer-reservation.net/",
        "form_selectors": {
            "checkin": 'input[name="date_arrivee"], input[placeholder*="arrivée"]',
            "checkout": 'input[name="date_depart"], input[placeholder*="départ"]',
            "adults": 'select[name="adultes"], input[name="adults"]',
            "submit": 'button[type="submit"]:has-text("Rechercher")',
        },
        "notes": ""
    },
}

# ================== SÉLECTEURS POUR LES SITES GÉNÉRALISTES ==================
SELECTORS: dict[str, list[str]] = {
    "booking": ['[data-testid="property-card"]', '[data-testid="card-container"]', ".srp-grid-list__item"],
    "airbnb": ['[data-testid="card-container"]', '[data-testid="listing-card"]', ".listing-card-container"],
}

DEFAULT_SELECTORS = ['[data-testid="card-container"]', ".property-card", "article"]

TITLE_SELECTORS = [
    '[data-testid="listing-card-name"]',
    '[data-testid="listing-card-title"]',
    '[data-testid="title"]',
    ".property-title",
    "h3",
    "h2",
    '[class*="title"]',
]

PRICE_SELECTORS = [
    '[data-testid="price-availability-row"]',
    '[data-testid="listing-price"]',
    '[data-testid="price-and-discounted-price"]',
    '[data-testid="price"]',
    ".price",
    ".property-price",
    ".prix",
    '[class*="price"]',
]

# ================== OUTILS ==================
def parse_price(raw: Any) -> float:
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
        txt = txt[:sep].replace(".", "").replace(",", "") + "." + txt[sep + 1 :]
    try:
        return float(txt)
    except ValueError:
        return float("nan")


def format_station_name(station: str) -> str:
    return quote_plus(station.replace("'", "").replace("’", "").strip())


def station_slug(station_formatted: str) -> str:
    text = unicodedata.normalize("NFD", unquote_plus(station_formatted).lower())
    text = "".join(c for c in text if unicodedata.category(c) != "Mn")
    return re.sub(r"[^a-z0-9]+", "-", text).strip("-")


def get_station_sites(station: str) -> list[str]:
    """
    Retourne la liste des sites à interroger pour une station.
    - Toujours : airbnb et booking (mode URL)
    - En plus : le site officiel si présent dans STATION_CONFIG (mode formulaire)
    """
    sites: list[str] = []
    # 1. Sites généralistes (toujours présents)
    for site in GENERAL_SITES:
        sites.append(site)
    # 2. Site officiel (si disponible)
    if station in STATION_CONFIG:
        # On utilise le nom de la station comme clé pour le site officiel
        # mais on peut aussi utiliser un identifiant personnalisé
        sites.append(station)  # On utilise le nom de la station comme identifiant de source
    return sites


def build_search_url(base_url: str, station_formatted: str, site_key: str) -> str:
    if site_key == "booking":
        return f"{base_url}{station_formatted}&checkin={CHECK_IN}&checkout={CHECK_OUT}&group_adults={ADULTS}"
    if site_key == "airbnb":
        return (
            f"{base_url}{station_slug(station_formatted)}/homes"
            f"?checkin={CHECK_IN}&checkout={CHECK_OUT}&adults={ADULTS}"
        )
    return base_url


def paginate(url: str, site_key: str, page: int) -> str:
    if page == 0:
        return url
    if site_key == "booking":
        return f"{url}&offset={page * 25}"
    if site_key == "airbnb":
        return f"{url}&items_offset={page * 18}"
    return f"{url}&page={page + 1}"


def get_selectors_for_site(site_key: str) -> list[str]:
    return SELECTORS.get(site_key, DEFAULT_SELECTORS)


# ================== PROXIES ==================
class ProxyManager:
    def __init__(self, proxies: Iterable[str] | None = None) -> None:
        self.proxies = list(proxies or [])
        self.current_idx = 0
        self.station_proxy: dict[str, str] = {}

    def get_next_proxy(self, station: str) -> str | None:
        if not self.proxies:
            return None
        if station not in self.station_proxy:
            self.station_proxy[station] = self.proxies[self.current_idx % len(self.proxies)]
            self.current_idx += 1
        return self.station_proxy[station]


def load_proxies() -> list[str]:
    import os
    raw = os.environ.get("SKITRACK_PROXIES", "")
    return [p.strip() for p in raw.split(",") if p.strip()]


# ================== EXTRACTION ==================
async def first_text(card: Any, selectors: list[str]) -> str | None:
    for selector in selectors:
        try:
            el = await card.query_selector(selector)
        except Exception:
            continue
        if not el:
            continue
        try:
            text = (el.text or "").strip()
        except Exception:
            continue
        if text:
            return text
    return None


async def card_link(card: Any, page_url: str) -> str | None:
    try:
        anchor = await card.query_selector("a[href]")
    except Exception:
        return None
    if not anchor:
        return None
    href = (anchor.attrs or {}).get("href")
    if not href:
        return None
    return urljoin(page_url, href)


async def extract_cards(tab: Any, site_key: str, page_url: str) -> list[dict[str, Any]]:
    cards: list[Any] = []
    for selector in get_selectors_for_site(site_key):
        try:
            found = await tab.select_all(selector, timeout=SELECTOR_TIMEOUT_S)
        except Exception:
            continue
        if found:
            cards = found
            break

    out: list[dict[str, Any]] = []
    for card in cards:
        try:
            title = await first_text(card, TITLE_SELECTORS)
            price = await first_text(card, PRICE_SELECTORS)
            url = await card_link(card, page_url)
        except Exception:
            continue
        if not title or not url:
            continue
        out.append({"name": title, "price": price, "url": url})
    return out


# ================== MODE 1 : URL (Airbnb, Booking) ==================
async def collect_url_mode(
    tab: Any,
    station: str,
    site_key: str,
    interactive: bool = False,
) -> tuple[list[dict[str, Any]], str | None]:
    log.info("🔍 [URL] collecte %s / %s", station, site_key)
    base = SITES[site_key]["url"] if site_key in SITES else None
    if not base:
        return [], f"source {site_key} inconnue"

    # Construction de l'URL pour le site_key (airbnb ou booking)
    # On utilise une fonction qui construit l'URL avec les paramètres
    # Cette fonction est définie plus haut : build_search_url
    search_url = build_search_url(base, format_station_name(station), site_key)
    log.info("🔍 URL : %s", search_url)

    seen_urls: set[str] = set()
    seen_titles: set[tuple[str, str]] = set()
    results: list[dict[str, Any]] = []
    reason: str | None = None

    for page in range(MAX_PAGES):
        url = paginate(search_url, site_key, page)
        log.info("🔍 Chargement page %d", page)

        try:
            await tab.get(url)
        except Exception as error:
            reason = f"chargement impossible : {type(error).__name__} {error}"
            break

        if interactive and page == 0:
            log.info("🔍 Mode interactif – résolvez le challenge puis appuyez sur Entrée")
            await asyncio.to_thread(input)

        await asyncio.sleep(random.uniform(*REQUEST_DELAY))

        try:
            cards = await extract_cards(tab, site_key, url)
        except Exception as e:
            reason = f"erreur extraction : {type(e).__name__} {e}"
            break
        log.info("🔍 %d cartes", len(cards))

        if not cards and page == 0:
            try:
                await tab.verify_cf()
                await asyncio.sleep(random.uniform(*REQUEST_DELAY))
                cards = await extract_cards(tab, site_key, url)
            except Exception:
                pass

        fresh = []
        if site_key == "booking":
            for card in cards:
                key = (card.get("name", ""), card.get("price", ""))
                if key in seen_titles:
                    continue
                seen_titles.add(key)
                fresh.append(card)
        else:
            for card in cards:
                card_url = card.get("url", "")
                if not card_url or card_url in seen_urls:
                    continue
                seen_urls.add(card_url)
                fresh.append(card)

        if not fresh:
            reason = "plus de nouvelles offres" if page > 0 else "aucune carte extraite"
            break

        results.extend(fresh)
        log.info("🔍 Page %d : %d nouvelles (total %d)", page, len(fresh), len(results))

        threshold = 25 if site_key == "booking" else 18
        if len(cards) < threshold and page > 0:
            log.info("🔍 Dernière page détectée")
            break

    return results, reason


# ================== MODE 2 : FORMULAIRE (sites officiels) ==================
async def collect_form_mode(
    tab: Any,
    station: str,
    site_key: str,
) -> tuple[list[dict[str, Any]], str | None]:
    log.info("🔍 [FORM] collecte %s / %s", station, site_key)

    # Le site_key est le nom de la station (ex: "Les 2 Alpes")
    config = STATION_CONFIG.get(station)
    if not config:
        return [], f"aucune configuration pour {station}"
    form_selectors = config.get("form_selectors", {})
    if not form_selectors:
        return [], "aucun sélecteur de formulaire défini"

    url = config["url"]

    # 1. Ouvrir la page d'accueil
    try:
        await tab.get(url)
        await asyncio.sleep(random.uniform(2, 4))
    except Exception as e:
        return [], f"ouverture page impossible : {e}"

    # 2. Remplir la station (si présent)
    station_selector = form_selectors.get("station")
    if station_selector:
        try:
            el = await tab.query_selector(station_selector)
            if el:
                await el.clear()
                await el.send_keys(station)
                log.info("🔍 Station remplie : %s", station)
        except Exception as e:
            log.warning("⚠️ Échec remplissage station : %s", e)

    # 3. Remplir la date d'arrivée
    checkin_selector = form_selectors.get("checkin")
    if checkin_selector:
        try:
            el = await tab.query_selector(checkin_selector)
            if el:
                await el.clear()
                await el.send_keys(CHECK_IN)
                log.info("🔍 Arrivée : %s", CHECK_IN)
        except Exception as e:
            log.warning("⚠️ Échec remplissage arrivée : %s", e)

    # 4. Remplir la date de départ
    checkout_selector = form_selectors.get("checkout")
    if checkout_selector:
        try:
            el = await tab.query_selector(checkout_selector)
            if el:
                await el.clear()
                await el.send_keys(CHECK_OUT)
                log.info("🔍 Départ : %s", CHECK_OUT)
        except Exception as e:
            log.warning("⚠️ Échec remplissage départ : %s", e)

    # 5. Remplir le nombre d'adultes
    adults_selector = form_selectors.get("adults")
    if adults_selector:
        try:
            el = await tab.query_selector(adults_selector)
            if el:
                await el.clear()
                await el.send_keys(str(ADULTS))
                log.info("🔍 Adultes : %d", ADULTS)
        except Exception as e:
            log.warning("⚠️ Échec remplissage adultes : %s", e)

    # 6. Cliquer sur "Rechercher"
    submit_selector = form_selectors.get("submit")
    if not submit_selector:
        return [], "aucun sélecteur de bouton Rechercher défini"

    try:
        btn = await tab.query_selector(submit_selector)
        if not btn:
            return [], f"bouton Rechercher introuvable : {submit_selector}"
        await btn.click()
        log.info("🔍 Clic sur Rechercher")
        await asyncio.sleep(random.uniform(3, 5))
    except Exception as e:
        return [], f"erreur clic Rechercher : {e}"

    # 7. Extraire les résultats
    try:
        # On utilise la page courante (résultats)
        # On utilise des sélecteurs génériques par défaut (on peut aussi les spécifier)
        cards = await extract_cards(tab, "booking", tab.url)  # on réutilise les sélecteurs booking par défaut
        log.info("🔍 %d cartes extraites", len(cards))
        return cards, None
    except Exception as e:
        return [], f"erreur extraction résultats : {e}"


# ================== DISPATCH ==================
async def collect(
    tab: Any,
    station: str,
    site_key: str,
    interactive: bool = False,
) -> tuple[list[dict[str, Any]], str | None]:
    """
    Dispatch vers le mode approprié.
    - Si site_key est 'airbnb' ou 'booking' → mode URL
    - Si site_key est un nom de station présent dans STATION_CONFIG → mode formulaire
    """
    if site_key in GENERAL_SITES:
        return await collect_url_mode(tab, station, site_key, interactive)
    elif site_key in STATION_CONFIG:
        return await collect_form_mode(tab, station, site_key)
    else:
        return [], f"source inconnue : {site_key}"


# ================== WORKERS ==================
SENTINEL = object()


class Worker:
    def __init__(
        self,
        name: str,
        queue: Queue,
        proxies: ProxyManager,
        headless: bool,
        session_dir: Path | None = None,
        interactive_booking: bool = False,
    ) -> None:
        self.name = name
        self.queue = queue
        self.proxies = proxies
        self.headless = headless
        self.session_dir = session_dir
        self.interactive_booking = interactive_booking
        self.browser: Any = None
        self.results: list[dict[str, Any]] = []
        self.failures: list[tuple[str, str, str]] = []

    async def _browser_for(self, station: str) -> Any:
        if self.browser is None:
            config = uc.Config(
                headless=self.headless,
                browser_args=[
                    "--no-sandbox",
                    "--disable-dev-shm-usage",
                    "--disable-blink-features=AutomationControlled",
                ],
            )
            if self.session_dir:
                config.user_data_dir = str(self.session_dir)
                log.info("📁 Profil : %s", self.session_dir)

            proxy = self.proxies.get_next_proxy(station)
            if proxy:
                config.add_argument(f"--proxy-server=http://{proxy}")

            self.browser = await uc.start(config=config)
        return self.browser

    async def run(self) -> list[dict[str, Any]]:
        while True:
            task = await self.queue.get()
            if task is SENTINEL:
                self.queue.task_done()
                log.info("[%s] arrêt propre", self.name)
                break

            station, site_key = task
            try:
                browser = await self._browser_for(station)
                tab = await browser.get("about:blank")

                # Mode interactif uniquement pour booking
                interactive = self.interactive_booking and site_key == "booking"

                offers, reason = await collect(tab, station, site_key, interactive=interactive)

                if offers:
                    stamp = datetime.now().isoformat(timespec="seconds")
                    for offer in offers:
                        offer.update(
                            price_num=parse_price(offer["price"]),
                            station=station,
                            source=site_key,
                            check_in=CHECK_IN,
                            check_out=CHECK_OUT,
                            adults=ADULTS,
                            timestamp=stamp,
                        )
                    self.results.extend(offers)
                    log.info("[%s] %-22s %-14s %d offre(s)", self.name, station[:22], site_key, len(offers))
                else:
                    self.failures.append((station, site_key, reason or "aucune offre"))
                    log.info("[%s] %-22s %-14s — %s", self.name, station[:22], site_key, reason or "aucune offre")

            except Exception as error:
                self.failures.append((station, site_key, f"{type(error).__name__}: {error}"))
                log.warning("[%s] %s / %s : %s", self.name, station, site_key, error)
            finally:
                self.queue.task_done()

        if self.browser is not None:
            try:
                self.browser.stop()
            except Exception:
                pass
        return self.results


async def produce(queue: Queue, stations: list[str], only_sites: set[str] | None) -> int:
    count = 0
    for station in stations:
        for site in get_station_sites(station):
            if only_sites and site not in only_sites:
                continue
            await queue.put((station, site))
            count += 1
    for _ in range(WORKERS):
        await queue.put(SENTINEL)
    return count


# ================== SORTIE ==================
def write_outputs(rows: list[dict[str, Any]], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    complete_csv = out_dir / "skitrack_results_complete.csv"
    complete_json = out_dir / "skitrack_results_complete.json"
    top30_csv = out_dir / "skitrack_top30.csv"

    columns = [
        "name", "price", "price_num", "url", "station", "source",
        "check_in", "check_out", "adults", "timestamp",
    ]
    frame = pd.DataFrame(rows, columns=columns)
    frame.to_csv(complete_csv, index=False, encoding="utf-8-sig")
    complete_json.write_text(json.dumps(rows, indent=2, ensure_ascii=False), encoding="utf-8")

    ranked = frame.dropna(subset=["price_num"]).sort_values("price_num", ascending=True)
    ranked.head(30).to_csv(top30_csv, index=False, encoding="utf-8-sig")

    log.info("📁 CSV    : %s", complete_csv)
    log.info("📁 JSON   : %s", complete_json)
    log.info("📁 Top 30 : %s", top30_csv)


def report(rows: list[dict[str, Any]], failures: list[tuple[str, str, str]], planned: int) -> None:
    log.info("─" * 62)
    log.info("Combinaisons station × source : %d", planned)
    log.info("Offres collectées             : %d", len(rows))

    by_source: dict[str, int] = {}
    for row in rows:
        by_source[row["source"]] = by_source.get(row["source"], 0) + 1
    # Afficher les sources présentes dans les résultats et les sources configurées
    all_sources = set(GENERAL_SITES) | set(STATION_CONFIG.keys())
    for source in sorted(all_sources):
        log.info("   %-14s %5d", source, by_source.get(source, 0))

    stations_ok = {row["station"] for row in rows}
    log.info("Stations avec au moins une offre : %d", len(stations_ok))

    if failures:
        motifs: dict[str, int] = {}
        for _, site, reason in failures:
            key = f"{site} — {reason.split(':')[0]}"
            motifs[key] = motifs.get(key, 0) + 1
        log.info("Combinaisons sans résultat : %d", len(failures))
        for motif, count in sorted(motifs.items(), key=lambda kv: -kv[1])[:12]:
            log.info("   %-52s %4d", motif[:52], count)


# ================== MAIN ==================
async def run(
    stations: list[str],
    only_sites: set[str] | None,
    headless: bool,
    out_dir: Path,
    session_dir: Path | None,
    interactive_booking: bool,
) -> int:
    queue: Queue = Queue(maxsize=100)
    proxies = ProxyManager(load_proxies())
    workers = [
        Worker(
            f"W{i + 1}",
            queue,
            proxies,
            headless,
            session_dir=session_dir,
            interactive_booking=interactive_booking,
        )
        for i in range(WORKERS)
    ]

    producer = asyncio.create_task(produce(queue, stations, only_sites))
    tasks = [asyncio.create_task(w.run()) for w in workers]

    planned = await producer
    log.info("📦 %d combinaison(s) en file, %d workers", planned, WORKERS)
    await asyncio.gather(*tasks)

    rows = [row for w in workers for row in w.results]
    failures = [f for w in workers for f in w.failures]

    if rows:
        write_outputs(rows, out_dir)
    else:
        log.warning("Aucune offre collectée — aucun fichier écrit.")
    report(rows, failures, planned)
    return 0 if rows else 1


def plan(stations: list[str], only_sites: set[str] | None) -> None:
    total = 0
    for station in stations:
        sites = [s for s in get_station_sites(station) if not only_sites or s in only_sites]
        total += len(sites)
        has_official = station in STATION_CONFIG
        print(f"\n{station}  ({'site officiel' if has_official else 'pas de site officiel'})")
        for site in sites:
            if site in GENERAL_SITES:
                url = build_search_url(SITES[site]["url"], format_station_name(station), site)
                print(f"   {site:<14} {url}")
            else:
                # site officiel
                config = STATION_CONFIG.get(site, {})
                url = config.get("url", "URL non définie")
                print(f"   {site:<14} [FORMULAIRE] {url}")
    print(f"\n{len(stations)} station(s) → {total} combinaison(s)")


def check_sources() -> int:
    # Vérification rapide des URLs des sites généralistes
    import urllib.error
    import urllib.request

    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
        ),
    }
    station = "Les Deux Alpes"
    station_formatted = format_station_name(station)
    worst = 0
    for site in GENERAL_SITES:
        url = build_search_url(SITES[site]["url"], station_formatted, site)
        try:
            request = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(request, timeout=20) as response:
                status = str(response.status)
        except urllib.error.HTTPError as error:
            status = str(error.code)
        except Exception as error:
            status = type(error).__name__
        if not status.startswith("2"):
            worst = 1
        print(f"{site:<14} {status:<18} {url}")
    return worst


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--stations", nargs="*", help="stations à traiter")
    parser.add_argument("--limit", type=int, help="n'en garder que les N premières")
    parser.add_argument("--sites", nargs="*", help="restreindre aux sources indiquées (airbnb, booking, ou nom de station)")
    parser.add_argument("--out", type=Path, default=ROOT / "out", help="dossier de sortie")
    parser.add_argument("--no-headless", action="store_true", help="afficher le navigateur")
    parser.add_argument("--dry-run", action="store_true", help="afficher le plan, ne rien ouvrir")
    parser.add_argument("--check-sources", action="store_true", help="sonder les URLs des sources généralistes")
    parser.add_argument("--max-pages", type=int, help=f"pages par recherche (défaut {MAX_PAGES})")
    parser.add_argument("--session-dir", type=Path, help="dossier pour le profil Chrome persistant")
    parser.add_argument(
        "--interactive-booking",
        action="store_true",
        help="mode interactif pour Booking : pause après le chargement",
    )
    args = parser.parse_args(argv)

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s | %(levelname)-7s | %(message)s",
        datefmt="%H:%M:%S",
    )

    if args.max_pages:
        globals()["MAX_PAGES"] = args.max_pages

    stations = args.stations or list(dict.fromkeys(STATIONS))
    unknown = [s for s in (args.sites or []) if s not in GENERAL_SITES and s not in STATION_CONFIG]
    if unknown:
        raise SystemExit(f"source(s) inconnue(s) : {unknown}. Connues : {GENERAL_SITES} + noms de stations configurées")
    only_sites = set(args.sites) if args.sites else None
    if args.limit:
        stations = stations[: args.limit]

    if args.check_sources:
        return check_sources()

    if args.dry_run:
        plan(stations, only_sites)
        return 0

    return asyncio.run(
        run(
            stations,
            only_sites,
            not args.no_headless,
            args.out,
            args.session_dir,
            args.interactive_booking,
        )
    )


if __name__ == "__main__":
    raise SystemExit(main())
