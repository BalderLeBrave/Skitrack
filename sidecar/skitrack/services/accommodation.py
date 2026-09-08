"""Upsert d'un CanonicalListing dans `accommodation` + `access_metrics`.

UNIQUE(source, source_id). Les champs nuls restent nuls. L'altitude d'annonce
n'est jamais écrite ici — seulement celle déjà calculée (IGN).
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AccessMetrics, Accommodation
from ..scrapers.canonical import CanonicalListing


def upsert_canonical(
    session: Session,
    listing: CanonicalListing,
    *,
    domain_id: int | None = None,
) -> Accommodation:
    row = session.execute(
        select(Accommodation).where(
            Accommodation.source == listing.source,
            Accommodation.source_id == listing.source_id,
        )
    ).scalar_one_or_none()
    if row is None:
        row = Accommodation(source=listing.source, source_id=listing.source_id, title=listing.name)
        session.add(row)

    row.title = listing.name
    row.deep_link = listing.url
    if domain_id is not None:
        row.domain_id = domain_id
    row.lat = listing.lat
    row.lon = listing.lon
    row.address = listing.address_text
    row.location_precision = listing.location_precision
    # Jamais une altitude marketing : seulement IGN/EU-DEM déjà posée.
    if listing.altitude_source in {"ign", "eudem", "curated"} and listing.altitude_m is not None:
        row.altitude_m = listing.altitude_m
        row.altitude_source = listing.altitude_source
    row.bedrooms = listing.bedrooms
    row.beds = listing.beds
    row.capacity_max = listing.capacity_max
    row.amenities = listing.amenities or None
    row.rating = listing.rating
    row.rating_scale = float(listing.rating_scale) if listing.rating_scale else None
    row.reviews_count = listing.review_count
    if listing.commune:
        row.commune = listing.commune
    if listing.capacity_source:
        row.capacity_source = listing.capacity_source
    if listing.fields_quality:
        row.fields_quality = listing.fields_quality

    if listing.dist_to_nearest_lift_m is not None:
        metrics = row.access
        if metrics is None:
            metrics = AccessMetrics(accommodation=row)
            row.access = metrics
        metrics.dist_to_nearest_lift_m = float(listing.dist_to_nearest_lift_m)
        metrics.walk_time_to_lift_min = (
            float(listing.walk_min_to_lift) if listing.walk_min_to_lift is not None else None
        )
        metrics.computed_with = {"method": "lift_base"}

    session.flush()
    return row


def apply_access(session: Session, accommodation: Accommodation, payload: dict[str, Any]) -> AccessMetrics:
    metrics = accommodation.access
    if metrics is None:
        metrics = AccessMetrics(accommodation=accommodation)
        accommodation.access = metrics
    if payload.get("dist_to_nearest_lift_m") is not None:
        metrics.dist_to_nearest_lift_m = payload["dist_to_nearest_lift_m"]
    if payload.get("dist_to_nearest_slope_m") is not None:
        metrics.dist_to_nearest_slope_m = payload["dist_to_nearest_slope_m"]
    if payload.get("nearest_lift_id") is not None:
        metrics.nearest_lift_id = payload["nearest_lift_id"]
    if payload.get("slope_access_type"):
        metrics.slope_access_type = payload["slope_access_type"]
    if payload.get("denivele_to_lift_m") is not None:
        metrics.denivele_to_lift_m = payload["denivele_to_lift_m"]
    metrics.computed_with = payload.get("computed_with") or {"method": "lift_base"}
    session.flush()
    return metrics
