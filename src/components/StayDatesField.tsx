import { useState } from "react";
import {
  formatDayIso,
  isSaturdayIso,
  JOURS_COURTS,
  monthGrid,
  monthLabel,
  monthOfIso,
  nightsBetween,
  saturdayWeekFrom,
  shiftMonth,
  todayIso,
  type YearMonth,
} from "@/lib/stay/calendar";
import { useStay } from "@/lib/stay";

/**
 * Les dates du séjour : un seul geste, un calendrier de plage.
 *
 * Remplace deux `<input type="date">` séparés, qui laissaient produire des
 * plages inversées et taisaient la contrainte du métier : les centrales de
 * station vendent du **samedi au samedi**. Ici les samedis sont cerclés, et un
 * double-clic cale la plage sur la semaine correspondante. Rien n'est imposé :
 * les plateformes, elles, acceptent n'importe quelle plage, et une arrivée un
 * mercredi reste une demande légitime.
 *
 * Le magasin n'est modifié **qu'à la plage complète** : entre le premier clic
 * (arrivée) et le second (départ), la sélection vit en local. Écrire chaque
 * borne séparément faisait traverser au séjour des plages invalides que
 * l'affichage devait rattraper.
 *
 * Réécrit : l'original tenait à `useApp` et aux sélecteurs d'état, qui
 * n'existent plus. Toute la logique de dates reste dans `stay/calendar.ts`.
 */

function Chevron({ dir }: { dir: "left" | "right" | "down" }) {
  const d = dir === "left" ? "M14 6l-6 6 6 6" : dir === "right" ? "M10 6l6 6-6 6" : "M6 10l6 6 6-6";
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d={d}
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function StayDatesField() {
  const checkIn = useStay((s) => s.checkIn);
  const checkOut = useStay((s) => s.checkOut);
  const setStay = useStay((s) => s.setStay);

  const [open, setOpen] = useState(false);
  // Arrivée en attente de son départ. `null` = aucune sélection en cours.
  const [pending, setPending] = useState<string | null>(null);
  const [view, setView] = useState<YearMonth>(
    () => monthOfIso(checkIn) ?? (monthOfIso(todayIso()) as YearMonth),
  );

  const today = todayIso();
  const nights = nightsBetween(checkIn, checkOut);

  const poser = (arr: string, dep: string): void => {
    setStay({ checkIn: arr, checkOut: dep });
    setPending(null);
    setOpen(false);
  };

  const pick = (iso: string): void => {
    if (pending == null || iso <= pending) {
      // Premier clic, ou un clic revenu en arrière, qui recommence la plage.
      setPending(iso);
      return;
    }
    poser(pending, iso);
  };

  /** Double-clic : la semaine samedi vers samedi de ce jour, posée d'un coup. */
  const pickWeek = (iso: string): void => {
    const week = saturdayWeekFrom(iso);
    if (week) poser(week.arr, week.dep);
  };

  // La suggestion part de la sélection en cours, sinon de la plage posée. Elle
  // ne s'affiche que si elle change quelque chose et reste réservable : une
  // semaine qui commence hier n'est pas une suggestion, c'est un regret.
  const base = pending ?? checkIn;
  const week = saturdayWeekFrom(base);
  const suggestion =
    week && week.arr >= today && !(week.arr === checkIn && week.dep === checkOut) ? week : null;

  const dayClass = (iso: string): string => {
    const cls = ["relative h-9 w-9 text-sm"];
    if (isSaturdayIso(iso)) cls.push("rounded-full ring-1 ring-marque");
    else cls.push("rounded-md");
    if (pending != null) {
      if (iso === pending) cls.push("bg-marque text-white font-semibold");
    } else {
      if (iso === checkIn || iso === checkOut) cls.push("bg-marque text-white font-semibold");
      else if (iso > checkIn && iso < checkOut) cls.push("bg-glacier");
    }
    if (iso < today) cls.push("text-muted opacity-40");
    return cls.join(" ");
  };

  return (
    <div className="relative">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 rounded-md border border-line bg-panel px-3 py-2 text-sm"
        aria-expanded={open}
        onClick={() => {
          setOpen(!open);
          setPending(null);
          const shown = monthOfIso(checkIn);
          if (shown) setView(shown);
        }}
      >
        <span>
          {formatDayIso(checkIn)} au {formatDayIso(checkOut)}
          {nights == null ? (
            <span className="text-cta"> (dates illisibles)</span>
          ) : nights <= 0 ? (
            <span className="text-cta"> (départ avant l’arrivée)</span>
          ) : (
            <span className="text-muted"> · {nights} nuits</span>
          )}
        </span>
        <Chevron dir="down" />
      </button>

      {open && (
        <div className="absolute z-20 mt-1 w-[19rem] rounded-[var(--radius-card)] border border-line bg-panel p-3 shadow-lg">
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="rounded-md p-1 hover:bg-glacier"
              aria-label="Mois précédent"
              onClick={() => setView(shiftMonth(view, -1))}
            >
              <Chevron dir="left" />
            </button>
            <span className="text-sm font-semibold">{monthLabel(view)}</span>
            <button
              type="button"
              className="rounded-md p-1 hover:bg-glacier"
              aria-label="Mois suivant"
              onClick={() => setView(shiftMonth(view, 1))}
            >
              <Chevron dir="right" />
            </button>
          </div>

          <div className="mt-2 grid grid-cols-7 justify-items-center gap-y-1">
            {JOURS_COURTS.map((wd, i) => (
              <span key={`${wd}${i}`} className="text-xs text-muted" aria-hidden>
                {wd}
              </span>
            ))}
            {monthGrid(view)
              .flat()
              .map((iso, i) =>
                iso == null ? (
                  <span key={`v${i}`} aria-hidden />
                ) : (
                  <button
                    key={iso}
                    type="button"
                    className={dayClass(iso)}
                    disabled={iso < today}
                    aria-pressed={iso === checkIn || iso === checkOut || iso === pending}
                    onClick={() => pick(iso)}
                    onDoubleClick={() => pickWeek(iso)}
                  >
                    {Number(iso.slice(8))}
                  </button>
                ),
              )}
          </div>

          <p className="mt-2 text-xs text-muted" aria-live="polite">
            {pending == null
              ? "Cliquez l’arrivée, puis le départ."
              : `Arrivée le ${formatDayIso(pending)}. Cliquez le départ.`}
          </p>

          {suggestion && (
            <button
              type="button"
              className="mt-2 w-full rounded-md border border-line px-2 py-1.5 text-xs hover:bg-glacier"
              onClick={() => poser(suggestion.arr, suggestion.dep)}
            >
              Caler sur la semaine du {formatDayIso(suggestion.arr)} au{" "}
              {formatDayIso(suggestion.dep)}
            </button>
          )}

          <p className="mt-2 text-xs text-muted">
            Les samedis sont cerclés : les centrales de station vendent du samedi au samedi et
            refusent une arrivée hors calendrier. Un double-clic pose la semaine entière. Les
            plateformes, elles, acceptent n’importe quelle plage, donc rien ne vous y oblige.
          </p>
        </div>
      )}
    </div>
  );
}
