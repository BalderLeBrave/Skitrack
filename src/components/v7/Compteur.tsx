/**
 * Voyageurs, enfants et chambres : un titre, une règle, deux boutons ronds et
 * le nombre.
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
  k: "trav" | "enfants" | "rooms";
  titre: string;
  regle: string;
  /** Dans un cadre à bord (panneau de séjour) plutôt qu'en ligne séparée. */
  encadre?: boolean;
}) {
  const { trav, enfants, rooms } = useSejour();
  const value = k === "trav" ? trav : k === "enfants" ? enfants : rooms;
  // Les enfants sont bornés par le groupe : « + » se désactive quand tout le
  // monde est déjà compté enfant, plutôt que de rester actif et muet.
  const b = k === "enfants" ? { min: 0, max: trav } : STAY_BOUNDS[k];
  // « Chambres, une de moins » : le pronom s'accorde avec ce qu'on compte.
  const un = k === "rooms" ? "une" : "un";
  return (
    <div className={`compteur${encadre ? " compteur--encadre" : ""}`}>
      <div className="compteur__texte">
        <span className="compteur__titre">{titre}</span>
        <span className="compteur__regle">{regle}</span>
      </div>
      <span className="compteur__pas">
        <button
          type="button"
          aria-label={`${titre}, ${un} de moins`}
          disabled={value <= b.min}
          onClick={() => stepStay(k, -1)}
        >
          <Icon name="moins" taille={12} />
        </button>
        <b>{value}</b>
        <button
          type="button"
          aria-label={`${titre}, ${un} de plus`}
          disabled={value >= b.max}
          onClick={() => stepStay(k, 1)}
        >
          <Icon name="plus" taille={12} />
        </button>
      </span>
    </div>
  );
}
