"""CLI d'administration — utilisable sans lancer Electron.

    python -m skitrack.cli import --countries FR
    python -m skitrack.cli import --file C:\\dumps\\ski_areas.geojson --no-lifts
    python -m skitrack.cli curated
    python -m skitrack.cli glaciers --countries FR
    python -m skitrack.cli stats

Sert aussi de chemin de secours quand le téléchargement de 130 Mo passe mal
depuis l'UI (réseau d'entreprise, proxy).
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys

from .config import Settings, set_settings
from .db.bootstrap import initialize
from .db.session import init_engine, session_scope
from .ingest.curated import apply_curated
from .ingest.glaciers import detect_glaciers
from .ingest.openskimap import download_dump, import_lifts, import_ski_areas, load_local_dump
from .services.http import close_http


def _setup(data_dir: str | None) -> None:
    logging.basicConfig(level=logging.INFO, format="%(levelname)-7s %(message)s")
    kwargs = {"data_dir": data_dir} if data_dir else {}
    settings = Settings(**kwargs)  # type: ignore[arg-type]
    settings.ensure_dirs()
    set_settings(settings)
    init_engine(settings.db_path)
    with session_scope() as session:
        initialize(session)


def _progress(prefix: str):
    def report(value: float, message: str) -> None:
        sys.stderr.write(f"\r{prefix} {value * 100:5.1f}%  {message[:70]:<70}")
        sys.stderr.flush()

    return report


async def _cmd_import(args: argparse.Namespace) -> None:
    countries = [c.strip().upper() for c in args.countries.split(",") if c.strip()]

    if args.file:
        areas_path = load_local_dump(args.file)
    else:
        areas_path = await download_dump("ski_areas", force=args.force, progress=_progress("dump  "))
    print()

    with session_scope() as session:
        result = import_ski_areas(
            session, areas_path, countries=countries, progress=_progress("import")
        )
    print(f"\nDomaines : {result}")

    if not args.no_lifts:
        lifts_path = (
            load_local_dump(args.lifts_file)
            if args.lifts_file
            else await download_dump("lifts", force=args.force, progress=_progress("dump  "))
        )
        print()
        with session_scope() as session:
            result = import_lifts(
                session, lifts_path, countries=countries, progress=_progress("import")
            )
        print(f"\nRemontées : {result}")

    with session_scope() as session:
        print(f"Curated : {apply_curated(session)}")

    await close_http()


async def _cmd_glaciers(args: argparse.Namespace) -> None:
    countries = [c.strip().upper() for c in args.countries.split(",") if c.strip()]
    with session_scope() as session:
        print(await detect_glaciers(session, countries=countries))
    await close_http()


def _cmd_curated(_args: argparse.Namespace) -> None:
    with session_scope() as session:
        result = apply_curated(session)
    print(f"Appliqué sur {result['applied']} domaine(s)")
    for item in result["unmatched"]:
        print(f"  non apparié : {item}")
    for item in result["warnings"]:
        print(f"  attention : {item}")


def _cmd_stats(_args: argparse.Namespace) -> None:
    from sqlalchemy import func, select

    from .models import DomainLift, SkiDomain

    with session_scope() as session:
        total = session.execute(select(func.count(SkiDomain.id))).scalar_one()
        lifts = session.execute(select(func.count(DomainLift.id))).scalar_one()
        with_alt = session.execute(
            select(func.count(SkiDomain.id)).where(SkiDomain.altitude_min_m.is_not(None))
        ).scalar_one()
        with_village = session.execute(
            select(func.count(SkiDomain.id)).where(SkiDomain.altitude_village_m.is_not(None))
        ).scalar_one()
        glaciers = session.execute(
            select(func.count(SkiDomain.id)).where(SkiDomain.glacier.is_(True))
        ).scalar_one()
        by_massif = session.execute(
            select(SkiDomain.massif, func.count(SkiDomain.id))
            .group_by(SkiDomain.massif)
            .order_by(func.count(SkiDomain.id).desc())
        ).all()

    print(f"Domaines                    : {total}")
    print(f"  avec altitude de pistes   : {with_alt}")
    print(f"  avec altitude de village  : {with_village}")
    print(f"  marqués glacier           : {glaciers}")
    print(f"Remontées                   : {lifts}")
    print("Par massif :")
    for massif, count in by_massif:
        print(f"  {massif or '(non classé)':<28} {count}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="skitrack.cli")
    parser.add_argument("--data-dir", default=None)
    sub = parser.add_subparsers(dest="command", required=True)

    p_import = sub.add_parser("import", help="Importer le référentiel OpenSkiMap")
    p_import.add_argument("--countries", default="FR", help="Codes ISO séparés par des virgules")
    p_import.add_argument("--file", help="ski_areas.geojson local")
    p_import.add_argument("--lifts-file", help="lifts.geojson local")
    p_import.add_argument("--no-lifts", action="store_true")
    p_import.add_argument("--force", action="store_true", help="Retélécharger même si récent")

    p_glaciers = sub.add_parser("glaciers", help="Détecter les domaines glaciaires (Overpass)")
    p_glaciers.add_argument("--countries", default="FR")

    sub.add_parser("curated", help="Réappliquer les données curatées")
    sub.add_parser("stats", help="Statistiques du référentiel")

    args = parser.parse_args(argv)
    _setup(args.data_dir)

    if args.command == "import":
        asyncio.run(_cmd_import(args))
    elif args.command == "glaciers":
        asyncio.run(_cmd_glaciers(args))
    elif args.command == "curated":
        _cmd_curated(args)
    elif args.command == "stats":
        _cmd_stats(args)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
