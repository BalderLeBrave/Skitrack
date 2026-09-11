import { createFileRoute, Link } from "@tanstack/react-router";
import { AltCard } from "@/components/AltCard";
import { AppShell } from "@/components/AppShell";
import { BraCard } from "@/components/BraCard";
import { FicheDetail } from "@/components/FicheDetail";
import { ForfaitCard } from "@/components/ForfaitCard";
import { IgnSkiCard } from "@/components/IgnSkiCard";
import { OsmSkiCard } from "@/components/OsmSkiCard";
import { LiftBoard } from "@/components/LiftBoard";
import { MapPanel, type MapLine, type MapPin } from "@/components/MapPanel";
import { MfCard } from "@/components/MfCard";
import { PisteMixBar } from "@/components/PisteMixBar";
import { SnowCard } from "@/components/SnowCard";
import { stationHasGlacier, passLinkFor } from "@/lib/forfaits/catalog";
import { dropM, formatAlt, stationById } from "@/lib/stations";
import { formatFleet, liftFleet, liftKindLabel, stationLifts } from "@/lib/osmAccess";
import { useStay } from "@/lib/stay";
import { useSkiinfoLive } from "@/lib/skiinfoLive";

export const Route = createFileRoute("/stations/$id")({ component: StationPage });

function StationPage() {
  const { id } = Route.useParams();
  const station = stationById(id);
  const setStay = useStay((s) => s.setStay);
  const photoRev = useSkiinfoLive((s) => s.rows[id]?.photoRev);

  if (!station) {
    return (
      <AppShell>
        <p className="p-8 text-muted">Station inconnue.</p>
      </AppShell>
    );
  }

  const glacier = stationHasGlacier(station.id);
  const blacks = station.slopes.counts.black ?? 0;
  const other = station.slopes.counts.other ?? 0;
  const link = passLinkFor(station.id, station.slopes.announcedKm);
  const fleet = liftFleet(station.id);
  const lifts = stationLifts(station.id);
  const liftPins: MapPin[] = [];
  for (const l of lifts) {
    const name = l.name ?? "Remontée OSM";
    liftPins.push({
      id: `a-${l.aLat}-${l.aLon}`,
      lat: l.aLat,
      lon: l.aLon,
      title: name,
      hint: `${name} · ${liftKindLabel(l.kind)} · gare OSM`,
      kind: "lift",
    });
    if (l.bLat != null && l.bLon != null && liftPins.length < 80) {
      liftPins.push({
        id: `b-${l.bLat}-${l.bLon}`,
        lat: l.bLat,
        lon: l.bLon,
        title: name,
        hint: `${name} · autre gare OSM`,
        kind: "lift-top",
      });
    }
    if (liftPins.length >= 80) break;
  }
  const liftLines: MapLine[] = lifts
    .filter((l): l is typeof l & { bLat: number; bLon: number } => l.bLat != null && l.bLon != null)
    .slice(0, 80)
    .map((l) => ({
      id: `${l.name ?? "lift"}-${l.aLat}`,
      a: [l.aLon, l.aLat],
      b: [l.bLon, l.bLat],
    }));

  const photoSrc = station.photo
    ? photoRev
      ? `${station.photo}?v=${photoRev}`
      : station.photo
    : null;

  return (
    <AppShell>
      <article>
        <div className="relative min-h-[32vh] bg-glacier">
          {photoSrc ? (
            <img src={photoSrc} alt="" className="h-[32vh] w-full object-cover" />
          ) : (
            <div className="flex h-[32vh] items-end p-8 text-muted">photo station manquante</div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 to-transparent p-8 text-white">
            <p className="text-sm uppercase tracking-wide text-white/70">{station.massif}</p>
            <h1 className="font-display text-5xl tracking-tight">{station.name}</h1>
            <p className="mt-2 text-lg">
              Village {formatAlt(station.villageM)} · sommet {formatAlt(station.maxM)} ·{" "}
              {formatAlt(dropM(station))} de dénivelé · {station.slopes.announcedKm} km
            </p>
            <p className="mt-1 text-sm text-white/80">
              {blacks} noire{blacks > 1 ? "s" : ""} OSM
              {other > 0 ? ` · ${other} itinéraire${other > 1 ? "s" : ""} OSM` : ""}
              {glacier ? " · glacier (catalogue du domaine)" : ""}
              {link.line ? ` · ${link.line}` : ""}
            </p>
            <p className="mt-1 text-sm text-white/75">{formatFleet(fleet)}</p>
          </div>
        </div>
        <div className="mx-auto grid max-w-none gap-6 px-4 py-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(560px,1.3fr)]">
          <div className="flex flex-col gap-4">
            <p className="text-muted">
              Altitudes France Montagnes (id {station.fmId}). Mix Skiinfo × {station.slopes.announcedKm} km
              annoncés : la somme des couleurs est ce total.
            </p>
            <FicheDetail station={station} />
            <ForfaitCard stationId={station.id} />
            <SnowCard
              lat={station.lat}
              lon={station.lon}
              villageM={station.villageM}
              summitM={station.maxM}
            />
            <BraCard
              name={station.name}
              massif={station.massif}
              lat={station.lat}
              lon={station.lon}
              villageM={station.villageM}
            />
            <PisteMixBar slopes={station.slopes} unit="km" />
            <IgnSkiCard station={station} />
            <OsmSkiCard station={station} />
            <AltCard station={station} />
            <MfCard
              lat={station.lat}
              lon={station.lon}
              villageM={station.villageM}
              summitM={station.maxM}
            />
            <LiftBoard stationId={station.id} />
            <Link
              to="/logements"
              onClick={() => setStay({ stationId: station.id })}
              className="inline-flex h-12 w-fit items-center rounded-xl bg-cta px-6 font-semibold text-cta-ink"
            >
              Voir les logements
            </Link>
          </div>
          <MapPanel
            lat={station.lat}
            lon={station.lon}
            zoom={12}
            label={station.name}
            pins={liftPins}
            lines={liftLines}
          />
        </div>
      </article>
    </AppShell>
  );
}
