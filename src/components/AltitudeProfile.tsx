/**
 * Profil d'une station, posé sur le dessin unique `ProfilAltitude`.
 *
 * Trois altitudes sont relevées et trois seulement : le bas des pistes, le
 * village et le point culminant. La silhouette qui les relie est dessinée,
 * pas mesurée : aucun modèle de terrain n'est interrogé ici.
 *
 * Le repère pointillé marque 2 000 m, seuil usuel de tenue de la neige en fin
 * de saison. Il ne s'affiche que si l'amplitude le traverse : une ligne collée
 * au bord n'apprend rien.
 */

import { ProfilAltitude, type PointProfil, type Repere } from "./ProfilAltitude";
import { formatAlt } from "@/lib/stations";

const REPERE_M = 2000;

/** Parts d'amplitude de la crête. Les abscisses sont arbitraires. */
const CRETE = [
  [0, 0],
  [0.22, 0.3],
  [0.42, 0.22],
  [0.68, 0.78],
  [0.82, 0.66],
  [1, 1],
] as const;

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

  const points: PointProfil[] = CRETE.map(([x, part]) => ({
    x,
    y: minM + (maxM - minM) * part,
  }));

  const reperes: Repere[] = [{ y: REPERE_M, texte: "2 000 m", pointille: true, ton: "accent" }];
  if (villageM != null) reperes.push({ y: villageM, texte: "village", ton: "gris" });

  const bornes = [
    { cle: "bas", texte: `bas ${formatAlt(minM)}` },
    ...(villageM != null ? [{ cle: "village", texte: `village ${formatAlt(villageM)}` }] : []),
    { cle: "sommet", texte: `sommet ${formatAlt(maxM)}` },
  ];

  return (
    <ProfilAltitude
      points={points}
      reperes={reperes}
      mesure={false}
      description={`Amplitude skiable de ${minM} à ${maxM} mètres`}
      bornes={bornes}
    />
  );
}
