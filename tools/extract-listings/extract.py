"""Extracteur : d'une liste d'URL vers `listings.jsonl` + `listings.csv`.

    python extract.py --input urls.txt --out ./out
    python extract.py --from-html dump.html --platform airbnb --url <url>
    python extract.py --from-har  dump.har  --platform booking --url <url>

Le mode hors ligne existe parce qu'une visite automatisee peut etre refusee, et
que le brief interdit d'y repondre par de l'evasion. L'utilisateur ouvre alors
la fiche dans son propre navigateur, enregistre la page (ou le HAR), et l'outil
en tire exactement ce qu'il aurait tire d'une visite — sans emettre une requete.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path
from typing import Any

import fetch
import parsers
from platforms import detecter_plateforme, normaliser_url
from schema import CSV_COLUMNS, Listing


def _sources_airbnb(art: fetch.Artefacts) -> list[tuple[str, Any]]:
    """Charges utiles ou chercher, pour Airbnb.

    Le reseau d'abord : mesure du 2026-08-30, la fiche ne porte plus ses
    donnees dans le DOM — `<script type="application/json">` ne rend rien — et
    tout arrive par `/api/v3/StaysPdpSections`. Les blobs restent essayes
    ensuite, au cas ou la page reviendrait a un rendu serveur.
    """
    sources: list[tuple[str, Any]] = []
    for rep in art.reseau:
        if "json" not in rep:
            continue
        url = rep["url"]
        nom = url.split("/api/v3/")[-1].split("/")[0] if "/api/v3/" in url else url[-48:]
        sources.append((nom, rep["json"]))
    for b in art.blobs:
        if b.get("data") is not None:
            sources.append((str(b.get("id")), b["data"]))
    return sources


def valider(l: Listing) -> None:
    """Controles de coherence. Ils avertissent, ils ne corrigent jamais.

    Corriger une valeur douteuse la rendrait indiscernable d'une valeur sure ;
    l'avertissement laisse la decision a qui lira la sortie.
    """
    if l.lat is not None and not (-90 <= l.lat <= 90):
        l.warnings.append(f"LAT_HORS_BORNES: {l.lat}")
        l.lat = None
    if l.lng is not None and not (-180 <= l.lng <= 180):
        l.warnings.append(f"LNG_HORS_BORNES: {l.lng}")
        l.lng = None
    if (l.lat is None) != (l.lng is None):
        l.warnings.append("COORDONNEE_ORPHELINE")
        l.lat = l.lng = None
        l.gps_precision = "missing"

    if l.guest_capacity_max is not None and l.guest_capacity_max < 1:
        l.warnings.append(f"CAPACITE_INVALIDE: {l.guest_capacity_max}")
        l.guest_capacity_max = None

    if (
        l.guest_capacity_max is not None
        and l.beds is not None
        and l.guest_capacity_max >= 8
        and l.beds <= 1
        and not (l.sleeping_arrangement_text or "")
    ):
        l.warnings.append(
            f"INVRAISEMBLABLE: capacite {l.guest_capacity_max} pour {l.beds} lit(s)"
        )

    if l.platform == "airbnb" and l.gps_precision == "exact_public":
        # Garde-fou : rien dans les fiches observees ne justifie ce verdict.
        l.warnings.append("PRECISION_A_JUSTIFIER: Airbnb annonce rarement une position exacte")

    a_capacite = l.guest_capacity_max is not None or bool(l.room_types)
    a_gps = l.lat is not None
    # `not_found` est le defaut du schema : l'exclure ici empechait toute mise a
    # jour, et trois extractions reussies sortaient en « not_found ». Seuls un
    # blocage et une erreur d'analyse doivent survivre a cette etape.
    if l.extraction_status not in ("blocked", "parse_error"):
        l.extraction_status = (
            "ok" if (a_capacite and a_gps) else ("partial" if (a_capacite or a_gps) else "not_found")
        )


def traiter(url_entree: str, dossier_diag: Path, *, headless: bool = True,
            html_local: Path | None = None, har_local: Path | None = None,
            plateforme_forcee: str | None = None) -> Listing:
    plateforme = plateforme_forcee or detecter_plateforme(url_entree)
    url, ident = normaliser_url(url_entree)

    l = Listing(
        input_url=url_entree,
        canonical_url=url,
        platform=plateforme,  # type: ignore[arg-type]
        listing_id=ident or "",
    )

    if plateforme == "unknown":
        l.extraction_status = "not_found"
        l.warnings.append("PLATEFORME_INCONNUE")
        return l

    dossier = dossier_diag / f"{plateforme}_{ident or 'inconnu'}"
    if har_local is not None:
        art = fetch.har_depuis_fichier(har_local, url)
    elif html_local is not None:
        art = fetch.html_depuis_fichier(html_local, url)
    else:
        art = fetch.recuperer(url, dossier, headless=headless)

    l.http_status = art.http_status

    if art.bloque or art.echec:
        l.extraction_status = "blocked" if art.bloque else "parse_error"
        l.warnings.append(art.echec or "BOT_CHALLENGE")
        if art.motif_blocage:
            l.warnings.append(f"motif: {art.motif_blocage}")
        return l

    try:
        if plateforme == "airbnb":
            sources = _sources_airbnb(art)
            cap = parsers.capacite_airbnb(sources)
            gps = parsers.gps_airbnb(sources)
        else:
            cap = parsers.capacite_booking(art.blobs)
            gps = parsers.gps_booking(art.blobs, art.html)
    except Exception as e:  # noqa: BLE001
        l.extraction_status = "parse_error"
        l.warnings.append(f"PARSE_ERROR: {type(e).__name__}: {e}")
        return l

    l.guest_capacity_max = cap.guest_capacity_max
    l.bedrooms = cap.bedrooms
    l.beds = cap.beds
    l.bathrooms = cap.bathrooms
    l.sleeping_arrangement_text = cap.sleeping_arrangement_text
    l.room_types = cap.room_types
    l.capacity_scope = cap.scope  # type: ignore[assignment]
    l.capacity_confidence = cap.confidence
    l.capacity_source_path = cap.source_path

    l.lat, l.lng = gps.lat, gps.lng
    l.gps_precision = gps.precision
    l.gps_precision_note = gps.note
    l.gps_source_path = gps.source_path
    l.map_display_type = gps.map_display_type  # type: ignore[assignment]

    l.warnings.extend(cap.warnings)
    l.warnings.extend(gps.warnings)

    # Titre : agreable, jamais structurant. Un titre absent n'invalide rien.
    import re as _re

    m = _re.search(r"<title>(.*?)</title>", art.html, _re.S | _re.I)
    if m:
        l.title = _re.sub(r"\s+", " ", m.group(1)).strip()[:160]

    valider(l)
    return l


def ecrire(lignes: list[Listing], out: Path) -> None:
    out.mkdir(parents=True, exist_ok=True)
    with (out / "listings.jsonl").open("w", encoding="utf-8") as f:
        for l in lignes:
            f.write(json.dumps(l.to_json(), ensure_ascii=False) + "\n")
    with (out / "listings.csv").open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=CSV_COLUMNS, extrasaction="ignore")
        w.writeheader()
        for l in lignes:
            d = l.to_json()
            d["room_types"] = json.dumps(d["room_types"], ensure_ascii=False)
            d["warnings"] = json.dumps(d["warnings"], ensure_ascii=False)
            w.writerow(d)


def main() -> int:
    ap = argparse.ArgumentParser(description="Extraction capacite + GPS, Airbnb et Booking.")
    ap.add_argument("--input", type=Path, help="Fichier d'URL, une par ligne.")
    ap.add_argument("--url", help="URL unique.")
    ap.add_argument("--from-html", type=Path, help="HTML enregistre a la main.")
    ap.add_argument("--from-har", type=Path, help="HAR d'une session reelle (seul mode hors ligne utile pour Airbnb).")
    ap.add_argument("--platform", choices=["airbnb", "booking"], help="Force la plate-forme (modes hors ligne).")
    ap.add_argument("--out", type=Path, default=Path("out"))
    ap.add_argument("--headed", action="store_true")
    args = ap.parse_args()

    urls: list[str] = []
    if args.input:
        urls = [
            l.strip()
            for l in args.input.read_text(encoding="utf-8").splitlines()
            if l.strip() and not l.strip().startswith("#")
        ]
    if args.url:
        urls.append(args.url)
    if not urls:
        print("aucune URL — utilisez --input ou --url", file=sys.stderr)
        return 2

    diag = args.out / "diagnostics"
    resultats: list[Listing] = []
    vus: set[tuple[str, str]] = set()

    for i, u in enumerate(urls):
        if i > 0 and args.from_html is None and args.from_har is None:
            fetch.patienter()
        l = traiter(
            u,
            diag,
            headless=not args.headed,
            html_local=args.from_html,
            har_local=args.from_har,
            plateforme_forcee=args.platform,
        )
        cle = (l.platform, l.listing_id)
        if l.listing_id and cle in vus:
            continue
        vus.add(cle)
        resultats.append(l)
        print(
            f"{i + 1}/{len(urls)} {l.platform:8} {l.listing_id[:28]:28} "
            f"{l.extraction_status:8} cap={l.guest_capacity_max} gps="
            f"{'oui' if l.lat is not None else 'non'} ({l.gps_precision})"
        )

    ecrire(resultats, args.out)
    ok = sum(1 for l in resultats if l.extraction_status == "ok")
    print(f"\n{ok}/{len(resultats)} complets — {args.out / 'listings.jsonl'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
