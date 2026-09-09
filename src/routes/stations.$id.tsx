import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { MapPanel } from "@/components/MapPanel";
import { PisteMixBar } from "@/components/PisteMixBar";
import { stationById } from "@/lib/stations";
import { useStay } from "@/lib/stay";

export const Route = createFileRoute("/stations/$id")({ component: StationPage });

function StationPage() {
  const { id } = Route.useParams();
  const station = stationById(id);
  const setStay = useStay((s) => s.setStay);

  if (!station) {
    return (
      <AppShell>
        <p className="p-8 text-muted">Station inconnue.</p>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <article>
        <div className="relative min-h-[42vh] bg-glacier">
          {station.photo ? (
            <img src={station.photo} alt="" className="h-[42vh] w-full object-cover" />
          ) : (
            <div className="flex h-[42vh] items-end p-8 text-muted">photo station manquante</div>
          )}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink/85 to-transparent p-8 text-white">
            <p className="text-sm uppercase tracking-wide text-white/70">{station.massif}</p>
            <h1 className="font-display text-5xl tracking-tight">{station.name}</h1>
            <p className="mt-2 text-lg">
              Village {station.villageM} m · domaine {station.minM}–{station.maxM} m · {station.slopes.announcedKm} km
            </p>
          </div>
        </div>
        <div className="mx-auto grid max-w-none gap-6 px-4 py-8 lg:grid-cols-[minmax(0,0.7fr)_minmax(560px,1.3fr)]">
          <div className="flex flex-col gap-4">
            <p className="text-muted">
              Altitudes France Montagnes (id {station.fmId}). Mix OSM × {station.slopes.announcedKm} km
              annoncés : la somme des couleurs est ce total.
            </p>
            <PisteMixBar slopes={station.slopes} unit="km" />
            <Link
              to="/logements"
              onClick={() => setStay({ stationId: station.id })}
              className="inline-flex h-12 w-fit items-center rounded-xl bg-cta px-6 font-semibold text-cta-ink"
            >
              Voir les logements
            </Link>
          </div>
          <MapPanel lat={station.lat} lon={station.lon} zoom={12} label={station.name} />
        </div>
      </article>
    </AppShell>
  );
}
