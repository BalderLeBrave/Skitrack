import { createFileRoute } from "@tanstack/react-router";
import { Flocons } from "@/components/Flocons";
import { PisteFilterBar } from "@/components/PisteFilterBar";
import { SearchStayBar } from "@/components/SearchStayBar";
import { StationCard } from "@/components/StationCard";
import { usePisteFilter } from "@/lib/pisteFilter";
import { stationMatchesPiste } from "@/lib/pistes";
import { STATIONS } from "@/lib/stations";
import { useTheme } from "@/lib/theme";

export const Route = createFileRoute("/")({ component: Home });

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
  const stations = STATIONS.filter((s) => stationMatchesPiste(s.slopes, filter));
  return (
    <main className="bg-bg text-ink">
      <section className="relative h-dvh min-h-[640px] overflow-hidden bg-[#1f4f86]">
        <HeroPhoto />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-ink/40 via-ink/15 to-ink/65" />
        <Flocons />
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-5 py-5 text-white">
          <p className="font-display text-xl tracking-tight">Skitrack</p>
          <div className="flex items-center gap-3 text-sm text-white/80">
            <p>Logements entiers · prix du séjour</p>
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
          Kilomètres par couleur = total annoncé, réparti selon OpenStreetMap. Filtrer par nombre, km ou %.
        </p>
        <div className="mt-6 rounded-[var(--radius-card)] border border-line bg-panel p-4">
          <PisteFilterBar />
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
