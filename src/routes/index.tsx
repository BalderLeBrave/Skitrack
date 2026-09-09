import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Flocons } from "@/components/Flocons";
import { PisteFilterBar } from "@/components/PisteFilterBar";
import { SearchStayBar } from "@/components/SearchStayBar";
import { StationCard } from "@/components/StationCard";
import { stationHasGlacier, passLinkFor } from "@/lib/forfaits/catalog";
import { usePisteFilter } from "@/lib/pisteFilter";
import { stationMatchesPiste } from "@/lib/pistes";
import { dropM, STATIONS } from "@/lib/stations";
import { useTheme } from "@/lib/theme";
import { LangToggle } from "@/components/LangToggle";

export const Route = createFileRoute("/")({ component: Home });

type StationOrder = "catalog" | "summit" | "drop" | "blacks" | "linked" | "itineraires";

function HeroPhoto() {
  return (
    <div
      className="absolute inset-0 bg-[#1f4f86] bg-cover bg-[center_28%]"
      style={{ backgroundImage: "url(/hero.jpg)" }}
      data-testid="home-hero-photo"
      aria-hidden
    />
  );
}

function Home() {
  const theme = useTheme((s) => s.theme);
  const toggle = useTheme((s) => s.toggle);
  const filter = usePisteFilter();
  const [order, setOrder] = useState<StationOrder>("catalog");
  const stations = useMemo(() => {
    const rows = STATIONS.filter((s) =>
      stationMatchesPiste(s.slopes, filter, {
        minM: s.minM,
        maxM: s.maxM,
        glacier: stationHasGlacier(s.id),
        linked: passLinkFor(s.id, s.slopes.announcedKm).isLinked,
      }),
    );
    if (order === "summit") rows.sort((a, b) => b.maxM - a.maxM);
    else if (order === "drop") rows.sort((a, b) => dropM(b) - dropM(a));
    else if (order === "blacks") {
      rows.sort((a, b) => (b.slopes.counts.black ?? 0) - (a.slopes.counts.black ?? 0));
    } else if (order === "linked") {
      rows.sort((a, b) => {
        const ak = passLinkFor(a.id, a.slopes.announcedKm).linkedKm ?? a.slopes.announcedKm;
        const bk = passLinkFor(b.id, b.slopes.announcedKm).linkedKm ?? b.slopes.announcedKm;
        return bk - ak;
      });
    } else if (order === "itineraires") {
      rows.sort((a, b) => (b.slopes.counts.other ?? 0) - (a.slopes.counts.other ?? 0));
    }
    return rows;
  }, [filter, order]);
  return (
    <main className="bg-bg text-ink">
      <section className="relative h-dvh min-h-[640px] overflow-hidden bg-[#1f4f86]">
        <HeroPhoto />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink/40 via-ink/15 to-ink/65" />
        <Flocons />
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-5 text-white">
          <p className="font-display text-xl tracking-tight">Skitrack</p>
          <div className="flex items-center gap-3 text-sm text-white/80">
            <Link to="/forfaits" className="text-white/80 hover:text-white">
              Forfaits
            </Link>
            <Link to="/traces" className="text-white/80 hover:text-white">
              Traces GPX
            </Link>
            <p className="hidden sm:block">Logements entiers · prix du séjour</p>
            <LangToggle light />
            <button
              type="button"
              role="switch"
              aria-checked={theme === "dark"}
              onClick={toggle}
              className="rounded-full border border-white/35 bg-ink/30 px-3 py-1 text-white"
              data-testid="theme-toggle"
            >
              {theme === "dark" ? "Sombre" : "Clair"}
            </button>
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 z-10 mx-auto w-full max-w-5xl px-4 pb-8">
          <p className="mb-3 max-w-xl font-display text-3xl text-white sm:text-4xl">
            Un massif. Des dates. Le logement entier.
          </p>
          <SearchStayBar />
        </div>
      </section>
      <section className="mx-auto max-w-6xl px-4 py-12">
        <h2 className="font-display text-3xl tracking-tight">Stations</h2>
        <p className="mt-2 max-w-xl text-muted">
          Sommet et dénivelé : France Montagnes. Kilomètres par couleur : total annoncé, réparti selon
          OpenStreetMap. Glacier et forfait lié : catalogue. Itinéraires et remontées : OSM.
        </p>
        <div className="mt-6 rounded-[var(--radius-card)] border border-line bg-panel p-4">
          <PisteFilterBar />
          <div className="mt-4 flex flex-wrap gap-2" role="radiogroup" aria-label="Ordre des stations">
            {(
              [
                ["catalog", "Catalogue"],
                ["summit", "Plus haut"],
                ["drop", "Plus de dénivelé"],
                ["blacks", "Plus de noires"],
                ["linked", "Plus grand forfait"],
                ["itineraires", "Plus d’itinéraires"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={order === id}
                className={`rounded-full px-3 py-1.5 text-sm ${order === id ? "bg-glacier font-semibold" : "border border-line text-muted"}`}
                onClick={() => setOrder(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-8 grid gap-5 md:grid-cols-2">
          {stations.length === 0 ? (
            <p className="text-muted">Aucune station ne correspond à ce mix de pistes.</p>
          ) : (
            stations.map((s) => <StationCard key={s.id} station={s} />)
          )}
        </div>
      </section>
    </main>
  );
}
