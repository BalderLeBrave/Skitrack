import { memo } from "react";
import { Link } from "@tanstack/react-router";
import { formatEuroTarif } from "@/lib/forfaits/age";
import { domainForStation, passLinkFor, stationHasGlacier } from "@/lib/forfaits/catalog";
import { formatFleet, liftFleet } from "@/lib/osmAccess";
import { dropM, formatAlt, type Station } from "@/lib/stations";
import { PisteMixBar } from "./PisteMixBar";
import { usePisteFilter } from "@/lib/pisteFilter";

export const StationCard = memo(function StationCard({ station }: { station: Station }) {
  const unit = usePisteFilter((s) => s.unit);
  const drop = dropM(station);
  const pass = domainForStation(station.id);
  const glacier = stationHasGlacier(station.id);
  const link = passLinkFor(station.id, station.slopes.announcedKm);
  const blacks = station.slopes.counts.black ?? 0;
  const other = station.slopes.counts.other ?? 0;
  const fleet = liftFleet(station.id);
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
          Village {formatAlt(station.villageM)} · {station.slopes.announcedKm} km
        </p>
        {link.line ? (
          <p className="text-sm text-ink">
            {link.isLinked ? "Forfait lié" : "Zone"} : {link.line}
          </p>
        ) : null}
        <p className="text-sm text-ink">
          Sommet {formatAlt(station.maxM)} · {formatAlt(drop)} de dénivelé
        </p>
        <p className="text-sm text-ink">
          {blacks} noire{blacks > 1 ? "s" : ""} OSM
          {glacier ? " · glacier (catalogue)" : ""}
          {other > 0 ? ` · ${other} itinéraire${other > 1 ? "s" : ""} OSM` : ""}
        </p>
        <p className="text-sm text-muted">{formatFleet(fleet)}</p>
        {pass?.seed?.j6 != null ? (
          <p className="mt-1 text-sm text-ink">
            Forfait 6 jours {formatEuroTarif(pass.seed.j6)}
            {pass.seed.majLabel ? ` · ${pass.seed.majLabel}` : ""}
          </p>
        ) : null}
        <PisteMixBar slopes={station.slopes} unit={unit} compact />
      </div>
    </Link>
  );
});
