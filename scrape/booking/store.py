"""Écriture JSON / CSV. Isolé du reste du comparateur."""

from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

CSV_FIELDS = (
    "sourceId",
    "title",
    "url",
    "totalPrice",
    "currency",
    "nightlyPrice",
    "guests",
    "bedrooms",
    "beds",
    "city",
    "location",
    "latitude",
    "longitude",
    "altitudeM",
    "distToSlopesM",
    "distToLiftM",
    "deniveleM",
    "skiIn",
    "accessType",
    "walkMinutes",
    "propertyType",
    "unitType",
    "availabilityStatus",
    "checkIn",
    "checkOut",
    "instantBooking",
    "rating",
    "reviewCount",
    "engine",
    "searchPageIndex",
)


def write_results(
    listings: list[dict[str, Any]],
    output_dir: str,
    *,
    extra: dict[str, Any] | None = None,
) -> dict[str, str]:
    if not output_dir:
        return {}
    folder = Path(output_dir)
    folder.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    payload = {
        "ok": True,
        "count": len(listings),
        "retrievedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "results": listings,
        **(extra or {}),
    }
    json_path = folder / f"booking-{stamp}.json"
    csv_path = folder / f"booking-{stamp}.csv"
    json_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    with csv_path.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=CSV_FIELDS, extrasaction="ignore")
        writer.writeheader()
        for row in listings:
            writer.writerow({k: row.get(k, "") for k in CSV_FIELDS})
    return {"json": str(json_path), "csv": str(csv_path)}
