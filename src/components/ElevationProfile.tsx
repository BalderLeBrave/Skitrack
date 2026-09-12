/**
 * Profil d'une trace GPX, posé sur le dessin unique `ProfilAltitude`.
 *
 * Chaque point vient du fichier : distance cumulée en abscisse, altitude lue
 * en ordonnée. Rien n'est lissé ni complété.
 */

import { ProfilAltitude } from "./ProfilAltitude";
import { profileSeries, type GpxPoint } from "@/lib/gpx";

export function ElevationProfile({ points }: { points: GpxPoint[] }) {
  const serie = profileSeries(points);
  const altitudes = serie.map((p) => p.ele);
  const bas = altitudes.length ? Math.round(Math.min(...altitudes)) : null;
  const haut = altitudes.length ? Math.round(Math.max(...altitudes)) : null;
  const km = serie.length ? serie[serie.length - 1].km : 0;

  return (
    <div className="gpx-profile" data-testid="gpx-profile">
      <ProfilAltitude
        points={serie.map((p) => ({ x: p.km, y: p.ele }))}
        mesure
        description={
          bas != null && haut != null
            ? `Profil de la trace, de ${bas} à ${haut} mètres sur ${km.toFixed(1)} kilomètres`
            : "Profil de la trace"
        }
        bornes={
          bas != null && haut != null
            ? [
                { cle: "bas", texte: `bas ${bas} m` },
                { cle: "long", texte: `${km.toFixed(1)} km` },
                { cle: "haut", texte: `haut ${haut} m` },
              ]
            : undefined
        }
        vide="Pas d’altitude dans ce GPX — le profil n’est pas tracé."
      />
    </div>
  );
}
