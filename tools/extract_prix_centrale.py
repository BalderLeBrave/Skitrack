#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vrais prix des centrales — BeautifulSoup + parseur JSON.

Ce n'est PAS le « à partir de » de la liste. Pour Ingénie, c'est le span

    <span id="total-prestation-G-5834094-6395741-1">432,47 €</span>

rempli par `calculerTotalPrestationAjax` après Rechercher + Sélectionner.

    python tools/extract_prix_centrale.py \\
        --from 2027-01-16 --to 2027-01-23 --adults 3 \\
        https://reservation.les2alpes.com/vacanceole-residence-champame-studio-3-personnes-les-2-alpes.html

HTML : BeautifulSoup (`html.parser`). JSON / JSONP : `tools/json_parser.py`.
"""
from __future__ import annotations

import argparse
import http.cookiejar
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime
from pathlib import Path
from typing import Any

try:
    from bs4 import BeautifulSoup, Tag
except ImportError as e:  # pragma: no cover
    raise SystemExit(
        "BeautifulSoup manquant. Installe-le :\n"
        "  pip install beautifulsoup4\n"
        "  tools/.venv/Scripts/pip install -r tools/requirements.txt"
    ) from e

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
from json_parser import dump as json_dump  # noqa: E402
from json_parser import object_after, parse, parse_or_none  # noqa: E402

UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)

UBLO = {
    "reservation.alpedhuez.com": {
        "origin": "https://reservation.alpedhuez.com",
        "channel": "OT-125",
        "resort": 125,
        "prefix": "",
    },
    "www.saintefoy-reservation.com": {
        "origin": "https://www.saintefoy-reservation.com",
        "channel": "OT-595",
        "resort": 595,
        "prefix": "/fr",
    },
    "saintefoy-reservation.com": {
        "origin": "https://www.saintefoy-reservation.com",
        "channel": "OT-595",
        "resort": 595,
        "prefix": "/fr",
    },
    "reservation.saintfrancoislongchamp.com": {
        "origin": "https://reservation.saintfrancoislongchamp.com",
        "channel": "OT-SFL",
        "resort": 566,
        "prefix": "",
    },
}

OPENSYSTEM = {
    "reservation.la-toussuire.com": {
        "origin": "https://reservation.la-toussuire.com",
        "login": "latoussuire",
        "vueId": 1730,
    },
    "reservation.ledevoluy.com": {
        "origin": "https://reservation.ledevoluy.com",
        "login": "devoluy-hautesalpes",
        "vueId": 1755,
    },
    "reservation.ax-ski.com": {
        "origin": "https://reservation.ax-ski.com",
        "login": "ariege",
        "vueId": 1861,
    },
    "reservation.valmorel.com": {
        "origin": "https://reservation.valmorel.com",
        "login": "valmorel",
        "vueId": 1423,
    },
    "www.valmorel.com": {
        "origin": "https://reservation.valmorel.com",
        "login": "valmorel",
        "vueId": 1423,
    },
}

CETO = {
    "booking.chamonix.com": {
        "base": "https://booking.chamonix.com",
        "path": "/fr/serp",
        "query": "s_c.ACCOMMODATION=chalet,apartment",
        "dates": "iso",
        "pax": "chamonix",
    },
    "reservations.meribel.net": {
        "base": "https://reservations.meribel.net",
        "path": "/serp",
        "query": "lang=fr_FR&s_c.ACCOMMODATION=apartment,chalet",
        "dates": "dmy",
        "pax": "pax",
    },
    "www.reservations.meribel.net": {
        "base": "https://reservations.meribel.net",
        "path": "/serp",
        "query": "lang=fr_FR&s_c.ACCOMMODATION=apartment,chalet",
        "dates": "dmy",
        "pax": "pax",
    },
    "megeve-booking.com": {
        "base": "https://megeve-booking.com",
        "path": "/serp",
        "query": "lang=fr_FR&s_c.ACCOMMODATION=apartment,chalet",
        "dates": "dmy",
        "pax": "pax",
    },
    "www.megeve-booking.com": {
        "base": "https://megeve-booking.com",
        "path": "/serp",
        "query": "lang=fr_FR&s_c.ACCOMMODATION=apartment,chalet",
        "dates": "dmy",
        "pax": "pax",
    },
    "www.laplagneresort.com": {
        "base": "https://www.laplagneresort.com",
        "path": "/serp",
        "query": "lang=fr_FR&s_c.ACCOMMODATION=apartment,chalet",
        "dates": "dmy",
        "pax": None,
    },
    "laplagneresort.com": {
        "base": "https://www.laplagneresort.com",
        "path": "/serp",
        "query": "lang=fr_FR&s_c.ACCOMMODATION=apartment,chalet",
        "dates": "dmy",
        "pax": None,
    },
}
CETO["www.booking.chamonix.com"] = CETO["booking.chamonix.com"]


def soupify(html: str) -> BeautifulSoup:
    return BeautifulSoup(html, "html.parser")


def host_of(url: str) -> str:
    u = urllib.parse.urlparse(url if "://" in url else "https://" + url)
    return (u.hostname or "").lower()


def family_of(url: str) -> str:
    h = host_of(url)
    if h in UBLO:
        return "ublo"
    if h in OPENSYSTEM:
        return "opensystem"
    if h in CETO:
        return "ceto"
    return "ingenie"


def nights_between(iso_from: str, iso_to: str) -> int:
    a = date.fromisoformat(iso_from)
    b = date.fromisoformat(iso_to)
    n = (b - a).days
    return n if n > 0 else 7


def dmy(iso: str) -> str:
    y, m, d = iso.split("-")
    return f"{d}/{m}/{y}"


def tidy(text: str) -> str:
    return re.sub(r"[\s\xa0\u202f]+", " ", text).strip()


def parse_price(text: str | None) -> float | None:
    if not text:
        return None
    t = tidy(text).replace("€", "").replace("EUR", "").strip()
    m = re.search(r"\d[\d\s.,]*", t)
    if not m:
        return None
    token = re.sub(r"[\s]", "", m.group(0))
    if "," in token and token.rfind(",") > token.rfind("."):
        token = token.replace(".", "").replace(",", ".")
    else:
        token = token.replace(",", "")
    try:
        n = float(token)
    except ValueError:
        return None
    return n if n > 0 else None


class Session:
    def __init__(self) -> None:
        self.cj = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.HTTPCookieProcessor(self.cj)
        )

    def get(self, url: str, referer: str | None = None, origin: str | None = None) -> str:
        headers = {
            "User-Agent": UA,
            "Accept-Language": "fr-FR,fr;q=0.9",
            "Accept": "text/html,application/json,application/javascript;q=0.9,*/*;q=0.8",
        }
        if referer:
            headers["Referer"] = referer
        if origin:
            headers["Origin"] = origin
        req = urllib.request.Request(url, headers=headers)
        with self.opener.open(req, timeout=25) as resp:
            return resp.read().decode("utf-8", "replace")

    def get_json(self, url: str, referer: str | None = None, origin: str | None = None) -> Any:
        return parse(self.get(url, referer=referer, origin=origin))

    def post_json(self, url: str, payload: dict[str, Any], origin: str) -> Any:
        data = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "User-Agent": UA,
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Origin": origin,
                "Referer": origin.rstrip("/") + "/",
            },
        )
        with self.opener.open(req, timeout=25) as resp:
            return parse(resp.read())


# ---------- BeautifulSoup : Ingénie ----------

def extract_widget(html: str) -> tuple[str | None, str | None]:
    soup = soupify(html)
    cid = None
    cid_input = soup.find("input", attrs={"name": "cid"}) or soup.find("input", class_="cid")
    if isinstance(cid_input, Tag) and cid_input.get("value"):
        cid = str(cid_input["value"])

    for script in soup.find_all("script"):
        body = script.string or script.get_text() or ""
        params = object_after(body, "var params =") or object_after(body, "IngenieWidgetDispo")
        if isinstance(params, dict):
            obj = params.get("object") or {}
            code = obj.get("code") if isinstance(obj, dict) else None
            if params.get("cid"):
                cid = str(params["cid"])
            if code:
                return str(code), cid

    text = soup.get_text("\n")
    ty = re.search(r'gsw_vars\["TYPREST"\]\s*=\s*"([^"]+)"', html)
    ag = re.search(r'gsw_vars\["CODEPRESTATAIRE"\]\s*=\s*"([^"]+)"', html)
    pr = re.search(r'gsw_vars\["CODEPRESTATION"\]\s*=\s*"([^"]+)"', html)
    if ty and ag and pr:
        return f"{ty.group(1)}|{ag.group(1)}|{pr.group(1)}", cid
    init = re.search(r"Resa\.init_moteur_resa\(\s*'(\d+)'", html)
    if init and not cid:
        cid = init.group(1)
    loose = re.search(r"\b([A-Z]\|\d+\|[A-Z0-9]+)\b", text)
    return (loose.group(1) if loose else None), cid


def prestation_dash(pipe: str) -> str:
    raw = pipe.strip()
    if re.match(r"^(PRESTATION|PRESTATAIRE)-", raw, re.I):
        return raw
    parts = [p for p in raw.split("|") if p]
    kind = "PRESTATION" if len(parts) >= 3 else "PRESTATAIRE"
    return f"{kind}-{'-'.join(parts)}"


def serialize_tarifs(html: str) -> str:
    soup = soupify(html)
    form = soup.find("form", id=re.compile(r"^frm-tarifs-", re.I)) or soup.find("form")
    root = form if isinstance(form, Tag) else soup
    fields: list[tuple[str, str]] = []
    for inp in root.find_all("input"):
        if not isinstance(inp, Tag):
            continue
        if inp.has_attr("disabled"):
            continue
        typ = str(inp.get("type") or "text").lower()
        if typ in ("button", "submit", "reset", "file", "image"):
            continue
        name = inp.get("name")
        if not name:
            continue
        if typ in ("checkbox", "radio") and not inp.has_attr("checked"):
            continue
        value = inp.get("value")
        fields.append((str(name), str(value) if value is not None else ("on" if typ in ("checkbox", "radio") else "")))
    for sel in root.find_all("select"):
        if not isinstance(sel, Tag) or sel.has_attr("disabled"):
            continue
        name = sel.get("name")
        if not name:
            continue
        opt = sel.find("option", selected=True) or sel.find("option")
        value = opt.get("value", "") if isinstance(opt, Tag) else ""
        fields.append((str(name), str(value)))
    return urllib.parse.urlencode(fields, doseq=True)


def total_prestation_span(html: str) -> tuple[str | None, str | None]:
    soup = soupify(html)
    for span in soup.find_all("span", id=re.compile(r"^total-prestation-", re.I)):
        if not isinstance(span, Tag):
            continue
        text = tidy(span.get_text(" ", strip=True))
        sid = str(span.get("id") or "")
        if not text or re.match(r"n/?a$", text, re.I):
            continue
        if re.search(r"\d", text):
            return sid, text
    return None, None


def extract_open_prestation(html: str) -> str | None:
    soup = soupify(html)
    hidden = soup.find("input", attrs={"name": "prestation"})
    if isinstance(hidden, Tag) and hidden.get("value"):
        return str(hidden["value"])
    for a in soup.find_all("a", onclick=True):
        m = re.search(r"detail_tarifs_prestation_open\(\s*'([^']+)'", str(a.get("onclick")))
        if m:
            return m.group(1)
    open_el = soup.find(id=re.compile(r"^open-"))
    if isinstance(open_el, Tag) and open_el.get("id"):
        return str(open_el["id"]).removeprefix("open-")
    m = re.search(r"detail_tarifs_prestation_open\(\s*'([^']+)'", html)
    return m.group(1) if m else None


def page_title(html: str) -> str | None:
    soup = soupify(html)
    if soup.title and soup.title.string:
        return tidy(soup.title.string)
    h1 = soup.find("h1")
    return tidy(h1.get_text(" ", strip=True)) if h1 else None


def ingenie_fiche_total(
    sess: Session,
    url: str,
    iso_from: str,
    iso_to: str,
    adults: int,
    children: int,
) -> dict[str, Any]:
    product = urllib.parse.urlunparse(urllib.parse.urlparse(url)._replace(query="", fragment=""))
    origin = f"{urllib.parse.urlparse(product).scheme}://{urllib.parse.urlparse(product).netloc}"
    html = sess.get(product, referer=origin + "/")
    pipe, cid = extract_widget(html)
    if not pipe or not cid:
        return {"ok": False, "error": "pas de widget Ingénie (object/cid) sur la fiche", "url": product}

    dash = prestation_dash(pipe)
    stay = nights_between(iso_from, iso_to)
    q = urllib.parse.urlencode(
        {
            "cid": cid,
            "action": "searchAjax",
            "type_prestataire": pipe.split("|")[0] or "G",
            "cle_fiche": dash,
            "datedeb": dmy(iso_from),
            "datefin": dmy(iso_to),
            "duree": str(stay),
            "adultes": str(adults),
            "enfants": str(children),
            "personnes": str(adults + children),
        }
    )
    search = sess.get_json(f"{origin}/booking?{q}", referer=product)
    data = search.get("data") if isinstance(search, dict) else {}
    nb = int((data or {}).get("nbResultsFiche") or (data or {}).get("nbResults") or 0)
    if nb <= 0:
        return {
            "ok": True,
            "available": False,
            "family": "ingenie",
            "title": page_title(html),
            "total": None,
            "total_text": None,
            "url": product,
            "span_id": None,
            "note": "pas de dispo pour ces dates",
        }

    prestation = re.sub(r"^PRESTATION-", "", dash, flags=re.I)
    tarifs_q = urllib.parse.urlencode(
        {"action": "detailTarifsPrestationAjax", "cid": cid, "prestation": prestation}
    )
    tarifs = sess.get(f"{origin}/booking?{tarifs_q}", referer=product)
    if len(tarifs) < 80:
        detail = sess.get(
            f"{origin}/booking?action=detailPrestationsAjax&id={urllib.parse.quote(dash)}&cid={cid}",
            referer=product,
        )
        found = extract_open_prestation(detail)
        if found and found != prestation:
            prestation = found
            tarifs_q = urllib.parse.urlencode(
                {"action": "detailTarifsPrestationAjax", "cid": cid, "prestation": prestation}
            )
            tarifs = sess.get(f"{origin}/booking?{tarifs_q}", referer=product)

    form_qs = serialize_tarifs(tarifs)
    if not form_qs:
        return {"ok": False, "error": "formulaire tarifs vide", "url": product}

    calc = sess.get_json(
        f"{origin}/booking?action=calculerTotalPrestationAjax&{form_qs}",
        referer=product,
    )
    total_text = None
    span_id, span_text = total_prestation_span(tarifs)
    if isinstance(calc, dict) and calc.get("success") in (1, True, "1"):
        tot = (calc.get("data") or {}).get("total")
        if isinstance(tot, str) and not re.match(r"n/?a$", tot.strip(), re.I):
            total_text = tidy(tot)
    if not total_text:
        total_text = span_text
    if not span_id:
        span_id = f"total-prestation-{prestation}-1"

    total = parse_price(total_text)
    return {
        "ok": True,
        "available": total is not None,
        "family": "ingenie",
        "title": page_title(html),
        "total": total,
        "total_text": total_text,
        "url": product,
        "span_id": span_id,
        "prestation": prestation,
        "object": pipe,
        "cid": cid,
        "from": iso_from,
        "to": iso_to,
        "adults": adults,
        "children": children,
        "note": "TOTAL #total-prestation (BeautifulSoup + JSON)",
    }


# ---------- Ublo / MSEM (JSON) ----------

def ublo_search(sess: Session, url: str, iso_from: str, iso_to: str, adults: int, children: int, limit: int) -> dict[str, Any]:
    site = UBLO[host_of(url)]
    origin = site["origin"]
    list_url = (
        f"https://services.msem.tech/api/lodging/resort/{site['resort']}/{site['channel']}"
        f"?language=fr&facet=0"
    )
    listing = sess.get_json(list_url, referer=origin + "/", origin=origin)
    offers = sess.post_json(
        f"https://services.msem.tech/api/lodging/resort/{site['resort']}/offers",
        {
            "channel": site["channel"],
            "preview": False,
            "adults": adults,
            "children": children,
            "agesChildren": [],
            "start": iso_from,
            "end": iso_to,
        },
        origin,
    )
    acc = listing.get("accomodations") or [] if isinstance(listing, dict) else []
    out = []
    for item in acc:
        oid = str(item.get("id") or "")
        offer = offers.get(oid) if isinstance(offers, dict) else None
        price = (offer or {}).get("price") if isinstance(offer, dict) else None
        if not isinstance(price, (int, float)) or price <= 0:
            continue
        slug = item.get("slug") or ""
        path = f"{site['prefix']}/{slug}".replace("//", "/")
        href = f"{origin}{path}?from={iso_from}&to={iso_to}&adults={adults}"
        out.append({"title": item.get("name"), "total": round(float(price), 2), "url": href, "id": oid})
    out.sort(key=lambda r: r["total"])
    return {
        "ok": True,
        "family": "ublo",
        "count": len(out),
        "listings": out[:limit],
        "note": "JSON MSEM POST /offers",
    }


# ---------- Open System (JSONP) ----------

def opensystem_search(sess: Session, url: str, iso_from: str, iso_to: str, adults: int, children: int, limit: int) -> dict[str, Any]:
    site = OPENSYSTEM[host_of(url)]
    nights = nights_between(iso_from, iso_to)
    ages = ",".join(["8"] * children) if children else ""
    pipe = "|".join(
        [
            "", "0", "20", site["login"], "", "", str(site["vueId"]), "0", "0", "",
            "2", str(nights), iso_from, str(adults), ages, "*", "0", "0", "", "*",
        ]
    )
    api = (
        "https://etape-rest.for-system.com/index.aspx?ref=json-catalogue-etape16v5"
        f"&callback=cb&q={urllib.parse.quote(pipe)}"
    )
    payload = sess.get_json(api, referer=site["origin"] + "/", origin=site["origin"])
    items = payload.get("items") if isinstance(payload, dict) else None
    if items is None and isinstance(payload, dict) and isinstance(payload.get("data"), dict):
        items = payload["data"].get("items")
    items = items or []
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        prix = it.get("prix")
        total = prix if isinstance(prix, (int, float)) and prix > 0 else parse_price(str(prix) if prix is not None else None)
        if total is None:
            continue
        out.append(
            {
                "title": it.get("nom") or it.get("libelle") or it.get("cle"),
                "total": float(total),
                "id": it.get("cle"),
                "dispo": it.get("dispo"),
            }
        )
    out.sort(key=lambda r: r["total"])
    return {
        "ok": True,
        "family": "opensystem",
        "count": len(out),
        "listings": out[:limit],
        "note": "JSONP etape-rest (json_parser)",
    }


# ---------- Orchestra / Ceto (BeautifulSoup) ----------

def ceto_search(sess: Session, url: str, iso_from: str, iso_to: str, adults: int, children: int, limit: int) -> dict[str, Any]:
    cfg = CETO[host_of(url)]
    parts = [cfg["query"]]
    if cfg["dates"] == "iso":
        parts += [f"s_checkinDate={iso_from}", f"s_checkoutDate={iso_to}"]
        parts += [f"s_c.PAX.adultsNumber={adults}", f"s_c.PAX.childrenNumber={children}"]
    else:
        y, m, d = iso_from.split("-")
        nights = nights_between(iso_from, iso_to)
        parts += [f"s_dd={d}", f"s_dmy={m}/{y}", f"s_minMan={nights},{nights}"]
        if cfg["pax"] == "pax":
            parts.append(f"s_c.PAX={adults + children}")
    serp = f"{cfg['base']}{cfg['path']}?{'&'.join(parts)}"
    page = sess.get(serp, referer=cfg["base"] + "/")
    soup = soupify(page)
    out = []
    cards = soup.select("article.cpt-result") or soup.select("article")
    for art in cards:
        if not isinstance(art, Tag):
            continue
        price_el = art.select_one(".price")
        if not price_el:
            continue
        total = parse_price(price_el.get_text(" ", strip=True))
        if total is None:
            continue
        h3 = art.find("h3")
        title = tidy(h3.get_text(" ", strip=True)) if h3 else None
        from_el = art.select_one(".from")
        from_price = bool(from_el and re.search(r"partir", from_el.get_text(), re.I))
        href = art.get("data-link")
        listing_url = urllib.parse.urljoin(cfg["base"], str(href)) if href else None
        out.append({"title": title, "total": total, "from_price": from_price, "url": listing_url})
        if len(out) >= limit:
            break
    return {
        "ok": True,
        "family": "ceto",
        "count": len(out),
        "listings": out,
        "request": serp,
        "note": "BeautifulSoup article.cpt-result .price",
    }


def print_result(obj: dict[str, Any]) -> None:
    if obj.get("listings") is not None:
        print(f"famille={obj.get('family')}  n={obj.get('count')}  {obj.get('note') or ''}")
        for i, row in enumerate(obj["listings"], 1):
            title = row.get("title") or row.get("id") or "?"
            flag = "  (à partir de)" if row.get("from_price") else ""
            print(f"  {i:3d}.  {row['total']:>10} €{flag}   {title}")
            if row.get("url"):
                print(f"         {row['url']}")
        return
    if not obj.get("ok"):
        print("ERREUR:", obj.get("error"), file=sys.stderr)
        return
    if not obj.get("available"):
        print(obj.get("note") or "indisponible")
        return
    print(f"{obj.get('total_text') or (str(obj.get('total')) + ' €')}")
    if obj.get("span_id"):
        print(f"  span  #{obj['span_id']}")
    if obj.get("title"):
        print(f"  fiche {obj['title']}")
    print(f"  {obj.get('url')}")
    print(f"  {obj.get('note')}")


def self_test() -> int:
    failures = 0

    def check(label: str, cond: bool, detail: Any = None) -> None:
        nonlocal failures
        print(f"  {'✓' if cond else '✗'} {label}" + ("" if cond or detail is None else f" — {detail!r}"))
        if not cond:
            failures += 1

    print("json_parser")
    data = parse('{"success":1,"data":{"total":"432,47 €","nbResultsFiche":1}}')
    check("JSON strict", data["data"]["total"] == "432,47 €")
    data = parse('cb({"data":{"nbResultsFiche":1},"success":1});')
    check("JSONP callback", data["data"]["nbResultsFiche"] == 1)
    data = parse("/**/jQuery123({\"items\":[{\"prix\":400}]});")
    check("JSONP jQuery", data["items"][0]["prix"] == 400)
    check("vide → None", parse_or_none("") is None)
    params = object_after(
        'var params = {"object":{"code":"G|290|ST3N"},"cid":"5"};',
        "var params =",
    )
    check("objet JS inline", params["object"]["code"] == "G|290|ST3N" and params["cid"] == "5")

    print("BeautifulSoup")
    sid, text = total_prestation_span(
        '<span id="total-prestation-G-5834094-6395741-1">432,47&nbsp;€</span>'
    )
    check("span TOTAL 432,47 €", sid == "total-prestation-G-5834094-6395741-1" and text == "432,47 €", text)
    check("N/A ignoré", total_prestation_span('<span id="total-prestation-x">N/A</span>') == (None, None))

    widget = """
    <script>var params = {"object":{"code":"G|290|ST3N"},"cid":"5"}; var widget = new IngenieWidgetDispo.Client(params);</script>
    <input name="cid" value="5" />
    """
    pipe, cid = extract_widget(widget)
    check("widget pipe", pipe == "G|290|ST3N", pipe)
    check("widget cid", cid == "5", cid)

    form = """
    <form id="frm-tarifs-G-290-ST3N-1">
      <input type="hidden" name="cid" value="5" />
      <input type="hidden" name="prestation" value="G-290-ST3N" />
      <input type="hidden" name="formules[]" value="RESALYSLOC7" />
      <input type="checkbox" name="formule-checked-X" checked disabled />
      <select name="nb_personnes_MTAXE3E">
        <option value="1">1</option>
        <option value="3" selected>3</option>
      </select>
      <input type="button" value="Ajouter" />
    </form>
    """
    qs = serialize_tarifs(form)
    check("serialize cid", "cid=5" in qs)
    check("serialize taxe 3", "nb_personnes_MTAXE3E=3" in qs)
    check("disabled absente", "formule-checked" not in qs)
    check("bouton absente", "Ajouter" not in qs)

    ceto = """
    <article class="cpt-result" data-link="/product?s_pid=3113">
      <h3>STUDIO LE RELAX</h3>
      <div class="price-wrap">
        <span class="from">à partir de</span>
        <span class="price">424<span class="currency">€</span></span>
      </div>
    </article>
    """
    soup = soupify(ceto)
    art = soup.select_one("article.cpt-result")
    check("carte Ceto", art is not None and art.select_one(".price").get_text()[:3] == "424")

    return failures


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Vrai prix d'une centrale (TOTAL, pas « à partir de »).")
    p.add_argument("url", nargs="?", help="URL fiche produit ou accueil de la centrale")
    p.add_argument("--from", dest="iso_from", default="2027-01-16")
    p.add_argument("--to", dest="iso_to", default="2027-01-23")
    p.add_argument("--adults", type=int, default=3)
    p.add_argument("--children", type=int, default=0)
    p.add_argument("--limit", type=int, default=8)
    p.add_argument("--family", choices=["ingenie", "ublo", "opensystem", "ceto", "auto"], default="auto")
    p.add_argument("--json", action="store_true")
    p.add_argument("--self-test", action="store_true", help="parseurs BeautifulSoup + JSON, sans réseau")
    args = p.parse_args(argv)

    if args.self_test:
        n = self_test()
        if n:
            print(f"\n{n} échec(s)")
            return 1
        print("\nok")
        return 0

    if not args.url:
        p.error("url requise (ou --self-test)")

    datetime.strptime(args.iso_from, "%Y-%m-%d")
    datetime.strptime(args.iso_to, "%Y-%m-%d")

    url = args.url if "://" in args.url else "https://" + args.url
    fam = args.family if args.family != "auto" else family_of(url)
    sess = Session()
    try:
        if fam == "ingenie":
            result = ingenie_fiche_total(sess, url, args.iso_from, args.iso_to, args.adults, args.children)
        elif fam == "ublo":
            result = ublo_search(sess, url, args.iso_from, args.iso_to, args.adults, args.children, args.limit)
        elif fam == "opensystem":
            result = opensystem_search(sess, url, args.iso_from, args.iso_to, args.adults, args.children, args.limit)
        elif fam == "ceto":
            result = ceto_search(sess, url, args.iso_from, args.iso_to, args.adults, args.children, args.limit)
        else:
            print("famille inconnue", file=sys.stderr)
            return 2
    except urllib.error.HTTPError as e:
        print(f"HTTP {e.code} {e.reason} {e.url}", file=sys.stderr)
        return 1
    except urllib.error.URLError as e:
        print(f"réseau: {e.reason}", file=sys.stderr)
        return 1

    if args.json:
        print(json_dump(result))
    else:
        print_result(result)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
