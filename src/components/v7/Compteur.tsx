/**
 * Voyageurs, enfants et chambres : un titre, une règle, deux boutons ronds et
 * le nombre.
 *
 * Les bornes viennent de `STAY_BOUNDS`, donc de `PARTY_LIMITS`. Un bouton
 * arrivé à la borne se désactive visiblement plutôt que de rester actif et
 * muet.
 */

import { Trace } from "@/components/maquette";
import { tr } from "@/lib/i18n";
import { STAY_BOUNDS, stepStay, useSejour } from "@/lib/parcours";

export function Compteur({
  k,
  titre,
  regle,
}: {
  k: "trav" | "enfants" | "rooms";
  titre: string;
  regle: string;
}) {
  const { trav, enfants, rooms } = useSejour();
  const value = k === "trav" ? trav : k === "enfants" ? enfants : rooms;
  // Les enfants sont bornés par le groupe : « + » se désactive quand tout le
  // monde est déjà compté enfant, plutôt que de rester actif et muet.
  const b = k === "enfants" ? { min: 0, max: trav } : STAY_BOUNDS[k];
  // « Chambres, une de moins » : le pronom s'accorde avec ce qu'on compte.
  const moins = k === "rooms" ? tr("{titre}, une de moins", { titre }) : tr("{titre}, un de moins", { titre });
  const plus = k === "rooms" ? tr("{titre}, une de plus", { titre }) : tr("{titre}, un de plus", { titre });
  return (
    <div className="acc-cpt">
      <div className="acc-cpt__texte">
        <b className="acc-cpt__titre">{titre}</b>
        <span className="acc-cpt__regle">{regle}</span>
      </div>
      <span className="acc-cpt__pas">
        <button
          type="button"
          aria-label={moins}
          disabled={value <= b.min}
          onClick={() => stepStay(k, -1)}
        >
          <Trace d="M5 12h14" taille={12} epaisseur={2.4} />
        </button>
        <b>{value}</b>
        <button
          type="button"
          aria-label={plus}
          disabled={value >= b.max}
          onClick={() => stepStay(k, 1)}
        >
          <Trace d="M12 5v14M5 12h14" taille={12} epaisseur={2.4} />
        </button>
      </span>
    </div>
  );
}
