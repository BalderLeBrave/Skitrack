/**
 * Voyageurs et chambres : un titre, une règle, deux boutons ronds et le nombre.
 *
 * Les bornes viennent de `STAY_BOUNDS`, donc de `PARTY_LIMITS`. Un bouton
 * arrivé à la borne se désactive visiblement plutôt que de rester actif et
 * muet.
 */

import { Icon } from "@/components/Icon";
import { STAY_BOUNDS, stepStay, useSejour } from "@/lib/parcours";

export function Compteur({
  k,
  titre,
  regle,
  encadre = false,
}: {
  k: "trav" | "rooms";
  titre: string;
  regle: string;
  /** Dans un cadre à bord (panneau de séjour) plutôt qu'en ligne séparée. */
  encadre?: boolean;
}) {
  const { trav, rooms } = useSejour();
  const value = k === "trav" ? trav : rooms;
  const b = STAY_BOUNDS[k];
  return (
    <div className={`compteur${encadre ? " compteur--encadre" : ""}`}>
      <div className="compteur__texte">
        <span className="compteur__titre">{titre}</span>
        <span className="compteur__regle">{regle}</span>
      </div>
      <span className="compteur__pas">
        <button
          type="button"
          aria-label={`${titre}, un de moins`}
          disabled={value <= b.min}
          onClick={() => stepStay(k, -1)}
        >
          <Icon name="moins" taille={12} />
        </button>
        <b>{value}</b>
        <button
          type="button"
          aria-label={`${titre}, un de plus`}
          disabled={value >= b.max}
          onClick={() => stepStay(k, 1)}
        >
          <Icon name="plus" taille={12} />
        </button>
      </span>
    </div>
  );
}
