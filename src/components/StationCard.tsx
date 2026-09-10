import { memo } from "react";
import { Link } from "@tanstack/react-router";
import { formatEuroTarif } from "@/lib/forfaits/age";
import { domainForStation, passLinkFor, stationHasGlacier } from "@/lib/forfaits/catalog";
import { formatFleet, liftFleet } from "@/lib/osmAccess";
import { dropM, formatAlt, type Station } from "@/lib/stations";
import { PisteMixBar } from "./PisteMixBar";
import { usePisteFilter } from "@/lib/pisteFilter";
import { useT } from "@/lib/i18n";

export const StationCard = memo(function StationCard({ station }: { station: Station }) {
  const t = useT();
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
      <div className="station-frame relative bg-glacier">
        {station.photo ? (
          <>
            <img
              src={station.photo}
              alt={station.name}
              loading="lazy"
              decoding="async"
              className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.03]"
            />
            <span className="pointer-events-none absolute bottom-2 left-2 rounded bg-ink/55 px-1.5 py-0.5 text-[10px] text-white/90">
              {t("photo.skiinfo")}
            </span>
          </>
        ) : (
          <div className="flex h-full items-end bg-glacier p-5 text-sm text-muted">
            photo station manquante
          </div>
        )}
      </div>
      <div className="p-4">
        <p className="font-display text-2xl tracking-tight">{station.name}</p>
        <p className="mt-1 text-sm text-muted">
          {station.fmId || station.pinKind === "base" ? "Village" : "Base"} {formatAlt(station.villageM)} ·{" "}
          {station.slopes.announcedKm > 0 ? `${station.slopes.announcedKm} km` : "km non publié"}
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
          {blacks} noire{blacks > 1 ? "s" : ""}
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
