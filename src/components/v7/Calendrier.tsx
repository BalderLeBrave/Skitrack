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

import { Icon } from "@/components/Icon";
import { setStayRange, STAY_BOUNDS } from "@/lib/parcours";
import { useStay } from "@/lib/stay";
import type { Plage } from "./plage";
import {
  JOURS_COURTS,
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
  hauteur = 40,
  onPose,
}: {
  plage: Plage;
  /** Hauteur d'une case : 40 sur l'accueil, 38 dans le panneau de séjour. */
  hauteur?: number;
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
    phase === "to" ? "Choisissez la date de départ." : "Choisissez la date d’arrivée. 21 nuits au plus.";

  const Mois = ({ ym }: { ym: YearMonth }) => (
    <div className="cal__mois">
      <span className="cal__titre">{monthLabel(ym)}</span>
      <div className="cal__jours">
        {JOURS_COURTS.map((j, i) => (
          <span key={i}>{j}</span>
        ))}
      </div>
      <div className="cal__grille">
        {monthGrid(ym)
          .flat()
          .map((iso, i) => {
            if (iso == null) return <span key={`v${i}`} />;
            const isFrom = iso === from;
            const isTo = !pending && iso === to;
            const inside = !pending && iso > from && iso < to;
            const past = iso < today;
            const cls = [
              "cal__jour",
              isFrom || isTo ? "cal__jour--borne" : null,
              inside ? "cal__jour--dedans" : null,
              isFrom && !isTo && !pending ? "cal__jour--debut" : null,
              isTo ? "cal__jour--fin" : null,
              past ? "cal__jour--passe" : null,
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <button
                key={iso}
                type="button"
                className={cls}
                style={{ height: hauteur }}
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
    <div className="cal">
      <div className="cal__deux">
        <button
          type="button"
          className="cal__nav cal__nav--prec"
          title="Mois précédent"
          onClick={() => plage.setMois(shiftMonth(mois, -1))}
        >
          <Icon name="chevron-gauche" taille={12} />
        </button>
        <button
          type="button"
          className="cal__nav cal__nav--suiv"
          title="Mois suivant"
          onClick={() => plage.setMois(shiftMonth(mois, 1))}
        >
          <Icon name="chevron-droite" taille={12} />
        </button>
        <Mois ym={mois} />
        <Mois ym={mois2} />
      </div>
      <span className="cal__hint">{hint}</span>
    </div>
  );
}
