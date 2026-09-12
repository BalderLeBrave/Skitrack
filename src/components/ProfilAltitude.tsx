/**
 * Le profil d'altitude de SKITRACK : une aire, une ligne, des repères.
 *
 * L'application en portait deux, l'un dessiné à la main en SVG pour la fiche
 * station, l'autre tracé par `recharts` pour un fichier GPX. Deux dessins pour
 * la même idée, dans deux technologies. Il n'en reste qu'un.
 *
 * `mesure` dit la vérité du tracé. Une trace GPX est mesurée point par point.
 * La silhouette d'une station ne l'est pas : trois altitudes sont relevées et
 * la courbe qui les relie est dessinée. Le composant l'écrit sous le dessin,
 * parce qu'une courbe a l'air d'une mesure.
 */

import { useId } from "react";

export type PointProfil = { x: number; y: number };

export type Repere = {
  /** Altitude du repère, dans l'unité des ordonnées. */
  y: number;
  texte: string;
  /** Un trait plein pour un fait, pointillé pour un seuil de lecture. */
  pointille?: boolean;
  ton?: "accent" | "gris";
};

const L = 320;
const H = 132;
const MX = 10;
const MY = 14;

export function ProfilAltitude({
  points,
  reperes = [],
  mesure,
  description,
  legende,
  bornes,
  vide = "Profil non traçable : pas d’altitude relevée.",
}: {
  points: readonly PointProfil[];
  reperes?: readonly Repere[];
  /** Vrai quand chaque point vient d'une mesure, faux quand la forme est dessinée. */
  mesure: boolean;
  /** Texte lu par un lecteur d'écran à la place du dessin. */
  description: string;
  /** Ce que le dessin montre, sous lui, en une ligne. */
  legende?: string;
  /** Valeurs remarquables posées sous le dessin, déjà formatées. */
  bornes?: readonly { cle: string; texte: string }[];
  vide?: string;
}) {
  const id = useId();
  if (points.length < 2) {
    return (
      <p className="text-corps text-muted" data-testid="profil-vide">
        {vide}
      </p>
    );
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const reperesUtiles = reperes.filter((r) => r.y > Math.min(...ys) && r.y < Math.max(...ys));
  const lo = Math.min(...ys, ...reperesUtiles.map((r) => r.y));
  const hi = Math.max(...ys, ...reperesUtiles.map((r) => r.y));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const ampleurY = Math.max(hi - lo, 1);
  const ampleurX = Math.max(x1 - x0, 1);

  const px = (v: number) => MX + (L - 2 * MX) * ((v - x0) / ampleurX);
  const py = (v: number) => MY + (H - 2 * MY) * (1 - (v - lo) / ampleurY);

  const ligne = points
    .map((p, i) => `${i === 0 ? "M" : "L"}${px(p.x).toFixed(1)} ${py(p.y).toFixed(1)}`)
    .join(" ");
  const aire = `${ligne} L${(L - MX).toFixed(1)} ${H - MY} L${MX} ${H - MY} Z`;

  return (
    <div data-testid="profil-altitude">
      <svg viewBox={`0 0 ${L} ${H}`} className="w-full" role="img" aria-label={description}>
        <title id={id}>{description}</title>
        <path d={aire} fill="var(--color-glacier)" />
        <path
          d={ligne}
          fill="none"
          stroke="var(--color-marque)"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        {reperesUtiles.map((r) => {
          const y = py(r.y);
          const couleur = r.ton === "accent" ? "var(--color-cta)" : "var(--color-muted)";
          return (
            <g key={r.texte}>
              <line
                x1={MX}
                x2={L - MX}
                y1={y}
                y2={y}
                stroke={couleur}
                strokeWidth="1"
                strokeDasharray={r.pointille ? "3 3" : undefined}
              />
              <text
                x={r.ton === "accent" ? L - MX : MX}
                y={y - 4}
                textAnchor={r.ton === "accent" ? "end" : "start"}
                fontSize="9"
                fill={couleur}
              >
                {r.texte}
              </text>
            </g>
          );
        })}
      </svg>
      {bornes && bornes.length ? (
        <div className="mt-1 flex justify-between text-note text-muted">
          {bornes.map((b) => (
            <span key={b.cle}>{b.texte}</span>
          ))}
        </div>
      ) : null}
      {legende ? <p className="mt-2 text-note text-muted">{legende}</p> : null}
      {!mesure ? (
        <p className="mt-2 text-note text-muted">
          Silhouette indicative : seules les altitudes ci-dessus sont relevées, le tracé qui les
          relie est dessiné.
        </p>
      ) : null}
    </div>
  );
}
