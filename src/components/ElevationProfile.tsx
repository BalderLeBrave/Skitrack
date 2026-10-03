/**
 * Profil d'une trace GPX, posé sur le dessin unique `ProfilAltitude`.
 *
 * Chaque point vient du fichier : distance cumulée en abscisse, altitude lue
 * en ordonnée. Rien n'est lissé ni complété.
 */

import { ProfilAltitude } from "./ProfilAltitude";
import { profileSeries, type GpxPoint } from "@/lib/gpx";
import { decimal, entier } from "@/lib/nombres";
import { tr } from "@/lib/i18n";

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
            ? tr("Profil de la trace, de {bas} à {haut} mètres sur {km} kilomètres", {
                bas: entier(bas),
                haut: entier(haut),
                km: decimal(km),
              })
            : tr("Profil de la trace")
        }
        bornes={
          bas != null && haut != null
            ? [
                { cle: "bas", texte: tr("bas {altitude} m", { altitude: entier(bas) }) },
                { cle: "long", texte: `${decimal(km)} km` },
                { cle: "haut", texte: tr("haut {altitude} m", { altitude: entier(haut) }) },
              ]
            : undefined
        }
        vide={tr("Pas d’altitude dans ce fichier GPX : le profil n’est pas tracé.")}
      />
    </div>
  );
}
