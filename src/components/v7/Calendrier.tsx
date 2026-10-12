/**
 * Le calendrier de la maquette v7 : deux mois côte à côte, arrivée puis départ.
 *
 * La sélection se fait en deux clics. Le premier pose l'arrivée en attente ;
 * le second, s'il est postérieur, pose le départ et écrit la plage dans le
 * magasin de séjour, bornée à 21 nuits. Un second clic antérieur recommence.
 * Le magasin n'est modifié qu'à la plage complète : entre les deux clics, la
 * sélection vit ici.
 *
 * Les jours passés sont grisés et inertes. La grille vient de
 * `stay/calendar.ts`, déjà testée.
 */

import type { ReactNode } from "react";
import { IconeDroite, IconeGauche } from "@/components/maquette";
import { tr } from "@/lib/i18n";
import { setStayRange, STAY_BOUNDS } from "@/lib/parcours";
import { useStay } from "@/lib/stay";
import type { Plage } from "./plage";
import {
  joursCourts,
  monthGrid,
  monthLabel,
  shiftMonth,
  todayIso,
  type YearMonth,
} from "@/lib/stay/calendar";

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + n)).toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b + "T12:00:00Z") - Date.parse(a + "T12:00:00Z")) / 864e5);
}

export function Calendrier({
  plage,
  onPose,
  pied,
}: {
  plage: Plage;
  /** À droite sous les deux mois : le récapitulatif du séjour. */
  pied?: ReactNode;
  /** Appelé quand la plage complète est posée. */
  onPose?: () => void;
}) {
  const checkIn = useStay((s) => s.checkIn);
  const checkOut = useStay((s) => s.checkOut);
  const today = todayIso();
  const { phase, pending, mois } = plage;
  const from = pending ?? checkIn;
  const to = checkOut;

  const pick = (k: string) => {
    if (k < today) return;
    const base = pending ?? checkIn;
    if (phase === "from" || k <= base) {
      plage.setPending(k);
      plage.setPhase("to");
      return;
    }
    const n = Math.min(STAY_BOUNDS.nights.max, daysBetween(base, k));
    setStayRange(base, addDays(base, n));
    plage.reset();
    onPose?.();
  };

  const mois2 = shiftMonth(mois, 1);
  const hint =
    phase === "to"
      ? tr("Choisissez la date de départ.")
      : tr("Choisissez la date d’arrivée. 21 nuits au plus.");

  const Mois = ({ ym }: { ym: YearMonth }) => (
    <div className="acc-cal__mois">
      <b className="acc-cal__titre">{monthLabel(ym)}</b>
      <div className="acc-cal__grille">
        {joursCourts().map((j, i) => (
          <span key={`j${i}`} className="acc-cal__sem">
            {j}
          </span>
        ))}
        {monthGrid(ym)
          .flat()
          .map((iso, i) => {
            if (iso == null) return <span key={`v${i}`} />;
            const isFrom = iso === from;
            const isTo = !pending && iso === to;
            const inside = !pending && iso > from && iso < to;
            const past = iso < today;
            const cls = [
              "acc-cal__jour",
              isFrom || isTo ? "acc-cal__jour--borne" : null,
              inside ? "acc-cal__jour--dedans" : null,
              past ? "acc-cal__jour--passe" : null,
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={iso}
                type="button"
                className={cls}
                disabled={past}
                aria-pressed={isFrom || isTo}
                onClick={() => pick(iso)}
              >
                {Number(iso.slice(8))}
              </button>
            );
          })}
      </div>
    </div>
  );

  return (
    <div className="acc-cal">
      <div className="acc-cal__deux">
        <button
          type="button"
          className="acc-cal__nav acc-cal__nav--prec"
          aria-label={tr("Mois précédent")}
          title={tr("Mois précédent")}
          onClick={() => plage.setMois(shiftMonth(mois, -1))}
        >
          <IconeGauche taille={14} epaisseur={2.4} />
        </button>
        <button
          type="button"
          className="acc-cal__nav acc-cal__nav--suiv"
          aria-label={tr("Mois suivant")}
          title={tr("Mois suivant")}
          onClick={() => plage.setMois(shiftMonth(mois, 1))}
        >
          <IconeDroite taille={14} epaisseur={2.4} />
        </button>
        <Mois ym={mois} />
        <Mois ym={mois2} />
      </div>
      <div className="acc-cal__pied">
        <span className="acc-cal__hint">{hint}</span>
        {pied}
      </div>
    </div>
  );
}
