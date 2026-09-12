/**
 * Profil altimétrique d'une station.
 *
 * Trois altitudes sont relevées et trois seulement : le bas des pistes, le
 * village et le point culminant. La silhouette qui les relie est **dessinée**,
 * pas mesurée : aucun modèle de terrain n'est interrogé ici. L'écran le dit,
 * parce qu'une courbe a l'air d'une mesure.
 *
 * Le trait pointillé marque 2 000 m, repère usuel de la tenue de la neige en
 * fin de saison. Il ne s'affiche que si l'amplitude le traverse : une ligne
 * collée au bord n'apprend rien.
 */

import { formatAlt } from "@/lib/stations";

const W = 320;
const H = 132;
const PAD_X = 10;
const PAD_Y = 14;
const REPERE_M = 2000;

export function AltitudeProfile({
  minM,
  villageM,
  maxM,
}: {
  minM: number | null;
  villageM: number | null;
  maxM: number | null;
}) {
  if (minM == null || maxM == null || maxM <= minM) {
    return <p className="muted">Amplitude non relevée pour cette station.</p>;
  }

  // L'échelle englobe le village même s'il est sous le bas des pistes, ce qui
  // arrive pour un village de fond de vallée.
  const lo = Math.min(minM, villageM ?? minM);
  const hi = Math.max(maxM, villageM ?? maxM);
  const span = Math.max(hi - lo, 1);
  const y = (v: number) => PAD_Y + (H - 2 * PAD_Y) * (1 - (v - lo) / span);

  // Silhouette : une crête simple entre le bas et le sommet. Les abscisses
  // sont arbitraires, seules les ordonnées portent une altitude.
  const crete = [
    [PAD_X, y(minM)],
    [PAD_X + (W - 2 * PAD_X) * 0.22, y(minM + (maxM - minM) * 0.3)],
    [PAD_X + (W - 2 * PAD_X) * 0.42, y(minM + (maxM - minM) * 0.22)],
    [PAD_X + (W - 2 * PAD_X) * 0.68, y(minM + (maxM - minM) * 0.78)],
    [PAD_X + (W - 2 * PAD_X) * 0.82, y(minM + (maxM - minM) * 0.66)],
    [W - PAD_X, y(maxM)],
  ];
  const ligne = crete.map(([x, v], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${v.toFixed(1)}`).join(" ");
  const surface = `${ligne} L${W - PAD_X} ${H - PAD_Y} L${PAD_X} ${H - PAD_Y} Z`;
  const repere = lo < REPERE_M && hi > REPERE_M ? y(REPERE_M) : null;

  return (
    <div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label={`Amplitude skiable de ${minM} à ${maxM} mètres`}
      >
        <path d={surface} fill="var(--color-glacier)" />
        <path
          d={ligne}
          fill="none"
          stroke="var(--color-marque)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {repere != null && (
          <>
            <line
              x1={PAD_X}
              x2={W - PAD_X}
              y1={repere}
              y2={repere}
              stroke="var(--color-cta)"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
            <text x={W - PAD_X} y={repere - 4} textAnchor="end" fontSize="9" fill="var(--color-cta)">
              2 000 m
            </text>
          </>
        )}
        {villageM != null && (
          <>
            <line
              x1={PAD_X}
              x2={W - PAD_X}
              y1={y(villageM)}
              y2={y(villageM)}
              stroke="var(--color-muted)"
              strokeWidth="1"
            />
            <text x={PAD_X} y={y(villageM) - 4} fontSize="9" fill="var(--color-muted)">
              village
            </text>
          </>
        )}
      </svg>
      <div className="mt-1 flex justify-between text-note text-muted">
        <span>bas {formatAlt(minM)}</span>
        {villageM != null && <span>village {formatAlt(villageM)}</span>}
        <span>sommet {formatAlt(maxM)}</span>
      </div>
      <p className="muted mt-2 text-note">
        Silhouette indicative : seules les trois altitudes ci-dessus sont relevées, le tracé qui les
        relie est dessiné.
      </p>
    </div>
  );
}
