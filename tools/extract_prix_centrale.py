#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Vrais prix des centrales — stdlib, cookies de session.

Ce n'est PAS le « à partir de » de la liste. Pour Ingénie, c'est le span

    <span id="total-prestation-G-5834094-6395741-1">432,47 €</span>

rempli par `calculerTotalPrestationAjax` après Rechercher + Sélectionner.

    python tools/extract_prix_centrale.py \\
        --from 2027-01-16 --to 2027-01-23 --adults 3 \\
        https://reservation.les2alpes.com/vacanceole-residence-champame-studio-3-personnes-les-2-alpes.html

    python tools/extract_prix_centrale.py --from 2027-01-16 --to 2027-01-23 \\
        https://reservation.alpedhuez.com --limit 5

Familles : ingenie (fiche TOTAL), ublo (MSEM /offers), opensystem (etape-rest),
ceto (SERP Orchestra).
"""
from __future__ import annotations

import argparse
import html as htmlmod
import http.cookiejar
import json
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, datetime
from typing import Any

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
    "www.booking.chamonix.com": None,  # filled below
    "reservations.meribel.net": {
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
    "www.laplagneresort.com": {
        "base": "https://www.laplagneresort.com",
        "path": "/serp",
        "query": "lang=fr_FR&s_c.ACCOMMODATION=apartment,chalet",
        "dates": "dmy",
        "pax": None,
    },
}
CETO["www.booking.chamonix.com"] = CETO["booking.chamonix.com"]
CETO["www.reservations.meribel.net"] = CETO["reservations.meribel.net"]
CETO["www.megeve-booking.com"] = CETO["megeve-booking.com"]
CETO["laplagneresort.com"] = CETO["www.laplagneresort.com"]


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


def parse_price(text: str | None) -> float | None:
    if not text:
        return None
    t = (
        text.replace("\xa0", " ")
        .replace("\u202f", " ")
        .replace("&nbsp;", " ")
        .replace("€", "")
        .replace("EUR", "")
        .strip()
    )
    m = re.search(r"\d[\d\s.,]*", t)
    if not m:
        return None
    token = re.sub(r"[\s]", "", m.group(0))
    if "," in token and (token.rfind(",") > token.rfind(".")):
        token = token.replace(".", "").replace(",", ".")
    else:
        token = token.replace(",", "")
    try:
        n = float(token)
    except ValueError:
        return None
    return n if n > 0 else None


def parse_jsonish(raw: str) -> Any:
    text = raw.strip()
    if not text:
        return None
    try:
        if text[0] in "{[":
            return json.loads(text)
        inner = re.sub(r"^[^(]*\(", "", text)
        inner = re.sub(r"\)\s*;?\s*$", "", inner)
        return json.loads(inner)
    except json.JSONDecodeError:
        return None


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
            return json.loads(resp.read().decode("utf-8", "replace"))


# ---------- Ingénie : TOTAL #total-prestation ----------

def _attr(tag: str, name: str) -> str | None:
    m = re.search(
        rf'(?:^|\s){name}\s*=\s*("([^"]*)"|\'([^\']*)\'|([^\s>]+))',
        tag,
        re.I,
    )
    if not m:
        return None
    return m.group(2) or m.group(3) or m.group(4)


def _flag(tag: str, name: str) -> bool:
    return bool(re.search(rf"(?:^|\s){name}(?:\s|=|>|$)", tag, re.I))


def extract_widget(html: str) -> tuple[str | None, str | None]:
    obj = re.search(r'"object"\s*:\s*\{\s*"code"\s*:\s*"([^"]+)"', html)
    cid_m = (
        re.search(r'IngenieWidgetDispo[\s\S]{0,1600}?"cid"\s*:\s*"(\d+)"', html)
        or re.search(r'var params = \{[\s\S]{0,1600}?"cid"\s*:\s*"(\d+)"', html)
        or re.search(r"Resa\.init_moteur_resa\(\s*'(\d+)'", html)
        or re.search(r'name="cid"[^>]*value="(\d+)"', html, re.I)
    )
    cid = cid_m.group(1) if cid_m else None
    if obj:
        return obj.group(1), cid
    ty = re.search(r'gsw_vars\["TYPREST"\]\s*=\s*"([^"]+)"', html)
    ag = re.search(r'gsw_vars\["CODEPRESTATAIRE"\]\s*=\s*"([^"]+)"', html)
    pr = re.search(r'gsw_vars\["CODEPRESTATION"\]\s*=\s*"([^"]+)"', html)
    if ty and ag and pr:
        return f"{ty.group(1)}|{ag.group(1)}|{pr.group(1)}", cid
    return None, cid


def prestation_dash(pipe: str) -> str:
    raw = pipe.strip()
    if re.match(r"^(PRESTATION|PRESTATAIRE)-", raw, re.I):
        return raw
    parts = [p for p in raw.split("|") if p]
    kind = "PRESTATION" if len(parts) >= 3 else "PRESTATAIRE"
    return f"{kind}-{'-'.join(parts)}"


def serialize_tarifs(html: str) -> str:
    fields: list[tuple[str, str]] = []
    for m in re.finditer(r"<input\b([^>]*)>", html, re.I):
        tag = m.group(1)
        if _flag(tag, "disabled"):
            continue
        typ = (_attr(tag, "type") or "text").lower()
        if typ in ("button", "submit", "reset", "file", "image"):
            continue
        name = _attr(tag, "name")
        if not name:
            continue
        if typ in ("checkbox", "radio") and not _flag(tag, "checked"):
            continue
        fields.append((name, _attr(tag, "value") or ("on" if typ in ("checkbox", "radio") else "")))
    for m in re.finditer(r"<select\b([^>]*)>([\s\S]*?)</select>", html, re.I):
        tag, body = m.group(1), m.group(2)
        if _flag(tag, "disabled"):
            continue
        name = _attr(tag, "name")
        if not name:
            continue
        options = list(re.finditer(r"<option\b([^>]*)>", body, re.I))
        selected = next((o for o in options if _flag(o.group(1), "selected")), options[0] if options else None)
        fields.append((name, _attr(selected.group(1), "value") or "" if selected else ""))
    return urllib.parse.urlencode(fields, doseq=True)


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
    search = parse_jsonish(sess.get(f"{origin}/booking?{q}", referer=product))
    nb = 0
    if isinstance(search, dict):
        data = search.get("data") or {}
        nb = int(data.get("nbResultsFiche") or data.get("nbResults") or 0)
    if nb <= 0:
        return {
            "ok": True,
            "available": False,
            "family": "ingenie",
            "title": None,
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
        open_m = re.search(r"detail_tarifs_prestation_open\(\s*'([^']+)'", detail)
        if open_m:
            prestation = open_m.group(1)
            tarifs_q = urllib.parse.urlencode(
                {"action": "detailTarifsPrestationAjax", "cid": cid, "prestation": prestation}
            )
            tarifs = sess.get(f"{origin}/booking?{tarifs_q}", referer=product)

    form_qs = serialize_tarifs(tarifs)
    if not form_qs:
        return {"ok": False, "error": "formulaire tarifs vide", "url": product}

    calc_raw = sess.get(
        f"{origin}/booking?action=calculerTotalPrestationAjax&{form_qs}",
        referer=product,
    )
    calc = parse_jsonish(calc_raw)
    total_text = None
    span_id = None
    if isinstance(calc, dict) and calc.get("success") in (1, True, "1"):
        tot = (calc.get("data") or {}).get("total")
        if isinstance(tot, str) and not re.match(r"n/?a$", tot.strip(), re.I):
            total_text = (
                tot.replace("\xa0", " ").replace("\u202f", " ").replace("&nbsp;", " ")
            )
            total_text = re.sub(r"\s+", " ", total_text).strip()
    if not total_text:
        m = re.search(r'id="(total-prestation-[^"]+)"[^>]*>([^<]+)', tarifs)
        if m and not re.match(r"n/?a$", m.group(2).strip(), re.I):
            span_id = m.group(1)
            total_text = htmlmod.unescape(m.group(2)).replace("\xa0", " ").strip()
    else:
        m = re.search(r'id="(total-prestation-[^"]+)"', tarifs)
        span_id = m.group(1) if m else f"total-prestation-{prestation}-1"

    title_m = re.search(r"<title>([^<]+)</title>", html, re.I)
    title = htmlmod.unescape(title_m.group(1).strip()) if title_m else None
    total = parse_price(total_text)
    return {
        "ok": True,
        "available": total is not None,
        "family": "ingenie",
        "title": title,
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
        "note": "TOTAL #total-prestation (pas le tarif d'appel)",
    }


# ---------- Ublo / MSEM ----------

def ublo_search(sess: Session, url: str, iso_from: str, iso_to: str, adults: int, children: int, limit: int) -> dict[str, Any]:
    site = UBLO[host_of(url)]
    origin = site["origin"]
    list_url = (
        f"https://services.msem.tech/api/lodging/resort/{site['resort']}/{site['channel']}"
        f"?language=fr&facet=0"
    )
    listing = parse_jsonish(sess.get(list_url, referer=origin + "/", origin=origin))
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
    acc = (listing or {}).get("accomodations") or [] if isinstance(listing, dict) else []
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
        out.append(
            {
                "title": item.get("name"),
                "total": round(float(price), 2),
                "url": href,
                "id": oid,
            }
        )
    out.sort(key=lambda r: r["total"])
    return {
        "ok": True,
        "family": "ublo",
        "count": len(out),
        "listings": out[:limit],
        "note": "POST MSEM /offers — tarif séjour daté",
    }


# ---------- Open System ----------

def opensystem_search(sess: Session, url: str, iso_from: str, iso_to: str, adults: int, children: int, limit: int) -> dict[str, Any]:
    site = OPENSYSTEM[host_of(url)]
    nights = nights_between(iso_from, iso_to)
    ages = ",".join(["8"] * children) if children else ""
    pipe = "|".join(
        [
            "",
            "0",
            "20",
            site["login"],
            "",
            "",
            str(site["vueId"]),
            "0",
            "0",
            "",
            "2",
            str(nights),
            iso_from,
            str(adults),
            ages,
            "*",
            "0",
            "0",
            "",
            "*",
        ]
    )
    api = (
        "https://etape-rest.for-system.com/index.aspx?ref=json-catalogue-etape16v5"
        f"&callback=cb&q={urllib.parse.quote(pipe)}"
    )
    raw = sess.get(api, referer=site["origin"] + "/", origin=site["origin"])
    payload = parse_jsonish(raw)
    items = (payload or {}).get("items") if isinstance(payload, dict) else None
    if items is None and isinstance(payload, dict):
        items = (payload.get("data") or {}).get("items") if isinstance(payload.get("data"), dict) else []
    items = items or []
    out = []
    for it in items:
        if not isinstance(it, dict):
            continue
        prix = it.get("prix")
        total = parse_price(str(prix) if prix is not None else None)
        if total is None:
            continue
        out.append(
            {
                "title": it.get("nom") or it.get("libelle") or it.get("cle"),
                "total": total,
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
        "note": "etape-rest JSONP — prix daté (vueinfo.id)",
    }


# ---------- Orchestra / Ceto ----------

def ceto_search(sess: Session, url: str, iso_from: str, iso_to: str, adults: int, children: int, limit: int) -> dict[str, Any]:
    cfg = CETO[host_of(url)]
    parts = [cfg["query"]]
    if cfg["dates"] == "iso":
        parts += [f"s_checkinDate={iso_from}", f"s_checkoutDate={iso_to}"]
        parts += [
            f"s_c.PAX.adultsNumber={adults}",
            f"s_c.PAX.childrenNumber={children}",
        ]
    else:
        y, m, d = iso_from.split("-")
        nights = nights_between(iso_from, iso_to)
        parts += [f"s_dd={d}", f"s_dmy={m}/{y}", f"s_minMan={nights},{nights}"]
        if cfg["pax"] == "pax":
            parts.append(f"s_c.PAX={adults + children}")
    serp = f"{cfg['base']}{cfg['path']}?{'&'.join(parts)}"
    page = sess.get(serp, referer=cfg["base"] + "/")
    out = []
    for m in re.finditer(
        r"<h3[^>]*>([\s\S]*?)</h3>[\s\S]{0,1600}?class=\"price\"[^>]*>([\s\S]*?)</span>",
        page,
        re.I,
    ):
        title = re.sub(r"<[^>]+>", " ", m.group(1))
        title = htmlmod.unescape(re.sub(r"\s+", " ", title)).strip()
        total = parse_price(re.sub(r"<[^>]+>", "", m.group(2)))
        if total is None:
            continue
        window = page[max(0, m.start() - 80) : m.end()]
        from_price = bool(re.search(r"partir", window, re.I))
        out.append({"title": title or None, "total": total, "from_price": from_price})
        if len(out) >= limit:
            break
    return {
        "ok": True,
        "family": "ceto",
        "count": len(out),
        "listings": out,
        "request": serp,
        "note": "SERP Orchestra — .price (séjour daté ; « à partir de » signalé)",
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


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(description="Vrai prix d'une centrale (TOTAL, pas « à partir de »).")
    p.add_argument("url", help="URL fiche produit ou accueil de la centrale")
    p.add_argument("--from", dest="iso_from", default="2027-01-16")
    p.add_argument("--to", dest="iso_to", default="2027-01-23")
    p.add_argument("--adults", type=int, default=3)
    p.add_argument("--children", type=int, default=0)
    p.add_argument("--limit", type=int, default=8)
    p.add_argument("--family", choices=["ingenie", "ublo", "opensystem", "ceto", "auto"], default="auto")
    p.add_argument("--json", action="store_true")
    args = p.parse_args(argv)

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
        json.dump(result, sys.stdout, ensure_ascii=False, indent=2)
        print()
    else:
        print_result(result)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
