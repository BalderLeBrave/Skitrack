#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Exemples — BeautifulSoup + JSON/JSONP pour les vrais prix.

Sans réseau. Lance :

    python tools/exemples_prix.py
"""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from bs4 import BeautifulSoup
from json_parser import object_after, parse, parse_or_none

from extract_prix_centrale import (
    extract_widget,
    parse_price,
    serialize_tarifs,
    soupify,
    total_prestation_span,
)

# ---------------------------------------------------------------------------
# 1. BeautifulSoup — le span TOTAL (ce que Skitrack doit afficher)
# ---------------------------------------------------------------------------
HTML_TOTAL = """
<td class="total_prestation">
  <span id="total-prestation-G-5834094-6395741-1">432,47&nbsp;€</span>
</td>
"""


def exemple_span_total() -> None:
    soup = BeautifulSoup(HTML_TOTAL, "html.parser")
    span = soup.find("span", id=lambda s: s and s.startswith("total-prestation-"))
    print("1. span TOTAL")
    print(f"   id    = {span['id']}")
    print(f"   texte = {span.get_text(' ', strip=True)}")
    # Même chose via le helper du script :
    sid, text = total_prestation_span(HTML_TOTAL)
    print(f"   helper: #{sid} → {text} → {parse_price(text)} €")


# ---------------------------------------------------------------------------
# 2. JSON strict — réponse de calculerTotalPrestationAjax
# ---------------------------------------------------------------------------
CALC_JSON = '{"success":1,"data":{"total":"432,47\\u00a0\\u20ac"}}'


def exemple_json_total() -> None:
    data = parse(CALC_JSON)
    total = data["data"]["total"]
    print("2. JSON calculerTotalPrestationAjax")
    print(f"   data.total = {total!r} → {parse_price(total)} €")


# ---------------------------------------------------------------------------
# 3. JSONP — searchAjax Ingénie et etape-rest Open System
# ---------------------------------------------------------------------------
SEARCH_JSONP = 'cb({"data":{"nbResultsFiche":1},"success":1});'
ETAPE_JSONP = "/**/jQuery123({\"items\":[{\"cle\":\"OSMB-42161-1\",\"prix\":400}]});"


def exemple_jsonp() -> None:
    search = parse(SEARCH_JSONP)
    etape = parse(ETAPE_JSONP)
    print("3. JSONP")
    print(f"   searchAjax nbResultsFiche = {search['data']['nbResultsFiche']}")
    print(f"   etape-rest premier prix   = {etape['items'][0]['prix']} €")
    print(f"   corps vide                = {parse_or_none('')}")


# ---------------------------------------------------------------------------
# 4. Objet JS inline — widget #tarifs (var params = {…})
# ---------------------------------------------------------------------------
WIDGET_JS = """
<script>
    var params = {"object":{"code":"G|290|ST3N"},"cid":"5","el":"widget-dispo"};
    var widget = new IngenieWidgetDispo.Client(params);
    widget.init();
</script>
<input type="hidden" name="cid" value="5" />
"""


def exemple_widget() -> None:
    params = object_after(WIDGET_JS, "var params =")
    pipe, cid = extract_widget(WIDGET_JS)
    print("4. widget Ingénie (script + BeautifulSoup)")
    print(f"   object.code = {params['object']['code']}")
    print(f"   cid         = {params['cid']}")
    print(f"   helper      = pipe={pipe} cid={cid}")


# ---------------------------------------------------------------------------
# 5. Serialize le form tarifs (comme jQuery.serialize)
# ---------------------------------------------------------------------------
FORM_TARIFS = """
<form id="frm-tarifs-G-290-ST3N-1">
  <input type="hidden" name="cid" value="5" />
  <input type="hidden" name="prestation" value="G-290-ST3N" />
  <input type="hidden" name="formules[]" value="RESALYSLOC7" />
  <input type="checkbox" name="formule-checked-X" checked disabled />
  <select name="nb_personnes_MTAXE3E">
    <option value="1">1</option>
    <option value="3" selected>3</option>
  </select>
</form>
"""


def exemple_serialize() -> None:
    qs = serialize_tarifs(FORM_TARIFS)
    print("5. serialize frm-tarifs (GET calculerTotalPrestationAjax)")
    print(f"   {qs}")


# ---------------------------------------------------------------------------
# 6. Carte Orchestra / Ceto
# ---------------------------------------------------------------------------
SERP_CETO = """
<article class="cpt-result is-clickable" data-link="/product?s_pid=3113">
  <h3>STUDIO LE RELAX</h3>
  <div class="price-wrap">
    <span class="from">à partir de</span>
    <span class="price">424<span class="currency">€</span></span>
  </div>
</article>
"""


def exemple_ceto() -> None:
    soup = soupify(SERP_CETO)
    art = soup.select_one("article.cpt-result")
    titre = art.find("h3").get_text(" ", strip=True)
    prix = parse_price(art.select_one(".price").get_text())
    appel = "partir" in art.select_one(".from").get_text().lower()
    print("6. carte Ceto (BeautifulSoup)")
    print(f"   {titre} → {prix} €  {'(à partir de)' if appel else ''}")


# ---------------------------------------------------------------------------
# 7. Appel bibliothèque (réseau) — commenté, à copier
# ---------------------------------------------------------------------------
EXEMPLE_LIVE = '''
from extract_prix_centrale import Session, ingenie_fiche_total, ublo_search

sess = Session()
fiche = ingenie_fiche_total(
    sess,
    "https://reservation.les2alpes.com/vacanceole-residence-champame-studio-3-personnes-les-2-alpes.html",
    iso_from="2027-01-16",
    iso_to="2027-01-23",
    adults=3,
    children=0,
)
print(fiche["span_id"], fiche["total_text"])  # total-prestation-G-290-ST3N-1  1 067,97 €

offres = ublo_search(
    sess, "https://reservation.alpedhuez.com",
    "2027-01-16", "2027-01-23", adults=2, children=0, limit=5,
)
for o in offres["listings"]:
    print(o["total"], o["title"])
'''


def main() -> int:
    exemple_span_total()
    print()
    exemple_json_total()
    print()
    exemple_jsonp()
    print()
    exemple_widget()
    print()
    exemple_serialize()
    print()
    exemple_ceto()
    print()
    print("7. appel live (à copier, réseau)")
    print(EXEMPLE_LIVE)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
