import { memo } from "react";
import { Link } from "@tanstack/react-router";
import type { Station } from "@/lib/stations";
import { PisteMixBar } from "./PisteMixBar";
import { usePisteFilter } from "@/lib/pisteFilter";

export const StationCard = memo(function StationCard({ station }: { station: Station }) {
  const unit = usePisteFilter((s) => s.unit);
  return (
    <Link
      to="/stations/$id"
      params={{ id: station.id }}
      className="group relative block overflow-hidden rounded-[var(--radius-card)] bg-panel"
    >
      <div className="station-frame bg-glacier">
        {station.photo ? (
          <img
            src={station.photo}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-end bg-glacier p-5 text-sm text-muted">
            photo station manquante
          </div>
        )}
      </div>
      <div className="p-4">
        <p className="font-display text-2xl tracking-tight">{station.name}</p>
        <p className="mt-1 text-sm text-muted">
          {station.villageM} m · domaine {station.minM}–{station.maxM} m · {station.slopes.announcedKm} km
        </p>
        <PisteMixBar slopes={station.slopes} unit={unit} compact />
      </div>
    </Link>
  );
});
