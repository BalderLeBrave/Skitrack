import { useNavigate } from "@tanstack/react-router";
import { STATIONS } from "@/lib/stations";
import { useStay } from "@/lib/stay";

export function SearchStayBar({ compact = false }: { compact?: boolean }) {
  const stationId = useStay((s) => s.stationId);
  const checkIn = useStay((s) => s.checkIn);
  const checkOut = useStay((s) => s.checkOut);
  const guests = useStay((s) => s.guests);
  const bedrooms = useStay((s) => s.bedrooms);
  const setStay = useStay((s) => s.setStay);
  const navigate = useNavigate();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setStay({ searchNonce: Date.now() });
    void navigate({ to: "/logements" });
  };

  const field = compact ? "h-10 rounded-lg bg-panel px-2 text-sm text-ink" : "h-11 rounded-xl bg-panel px-3 text-sm text-ink";

  return (
    <form
      onSubmit={submit}
      className={
        compact
          ? "grid grid-cols-2 items-center gap-1 sm:grid-cols-[1.3fr_1fr_1fr_4.5rem_4.5rem_auto]"
          : "stay-glass grid items-end gap-2 rounded-[var(--radius-card)] p-3 sm:grid-cols-[1.4fr_1fr_1fr_5.5rem_5.5rem_auto]"
      }
    >
      <label className={`grid ${compact ? "gap-0" : "gap-1 px-2"} text-xs text-muted`}>
        {compact ? <span className="sr-only">Station</span> : "Station"}
        <select
          className={field}
          value={stationId}
          onChange={(e) => setStay({ stationId: e.target.value })}
        >
          {STATIONS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      <label className={`grid ${compact ? "gap-0" : "gap-1 px-2"} text-xs text-muted`}>
        {compact ? <span className="sr-only">Arrivée</span> : "Arrivée"}
        <input
          type="date"
          className={field}
          value={checkIn}
          onChange={(e) => setStay({ checkIn: e.target.value })}
          suppressHydrationWarning
        />
      </label>
      <label className={`grid ${compact ? "gap-0" : "gap-1 px-2"} text-xs text-muted`}>
        {compact ? <span className="sr-only">Départ</span> : "Départ"}
        <input
          type="date"
          className={field}
          value={checkOut}
          onChange={(e) => setStay({ checkOut: e.target.value })}
          suppressHydrationWarning
        />
      </label>
      <label className={`grid ${compact ? "gap-0" : "gap-1 px-2"} text-xs text-muted`}>
        {compact ? <span className="sr-only">Personnes</span> : "Pers."}
        <input
          type="number"
          min={1}
          max={30}
          className={field}
          value={guests}
          onChange={(e) => setStay({ guests: Number(e.target.value) || 1 })}
          suppressHydrationWarning
        />
      </label>
      <label className={`grid ${compact ? "gap-0" : "gap-1 px-2"} text-xs text-muted`}>
        {compact ? <span className="sr-only">Chambres min</span> : "Ch. min"}
        <input
          type="number"
          min={0}
          max={20}
          className={field}
          value={bedrooms}
          onChange={(e) => setStay({ bedrooms: Number(e.target.value) || 0 })}
          suppressHydrationWarning
        />
      </label>
      <button
        type="submit"
        className={
          compact
            ? "h-10 rounded-lg bg-cta px-4 text-sm font-semibold text-cta-ink"
            : "h-11 rounded-xl bg-cta px-5 text-sm font-semibold text-cta-ink"
        }
      >
        Chercher
      </button>
    </form>
  );
}
