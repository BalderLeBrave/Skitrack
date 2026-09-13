/**
 * La barre des pistes par couleur : quatre parts, à l'échelle du domaine.
 *
 * Sans répartition relevée, la barre reste vide et grise, et l'infobulle le
 * dit : rien n'est dessiné à la place d'une mesure absente.
 */

import { COLS } from "@/lib/parcours";
import type { ColorShare } from "@/lib/classeur";

export function PartPistes({
  share,
  hauteur = 6,
  className,
}: {
  share: ColorShare | null;
  hauteur?: number;
  className?: string;
}) {
  return (
    <div
      className={["parts", className].filter(Boolean).join(" ")}
      style={{ height: hauteur, borderRadius: hauteur / 2 }}
      title={share ? undefined : "Répartition des pistes non relevée"}
      role="img"
      aria-label={
        share
          ? `Pistes : ${COLS.map((c) => `${c.label} ${share[c.key]} %`).join(", ")}`
          : "Répartition des pistes non relevée"
      }
    >
      {share
        ? COLS.map((c) => (
            <i key={c.key} style={{ width: `${share[c.key]}%`, background: c.token }} />
          ))
        : null}
    </div>
  );
}

/** « 20 / 40 / 30 / 10 % », ou l'absence. */
export function mixLbl(share: ColorShare | null): string {
  return share ? `${COLS.map((c) => share[c.key]).join(" / ")} %` : "non relevée";
}
