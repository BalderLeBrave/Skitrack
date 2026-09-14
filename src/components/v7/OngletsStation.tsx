/**
 * Les deux onglets d'une station : sa fiche, et ses logements.
 *
 * La fiche et l'écran Logements sont deux pages de la même station, et rien ne
 * le disait : depuis la fiche, il fallait un bouton « Retenir et voir les
 * logements » pour passer de l'une à l'autre, et depuis les logements, aucun
 * chemin ne ramenait à la fiche. La loupe de l'accueil, quand une station est
 * renseignée, ouvre la station sur son onglet Logements : cet onglet-ci.
 *
 * Le composant ne décide de rien : il dit où l'on est et où l'on peut aller.
 */

import { useGo } from "@/components/v6/go";
import { useParcours } from "@/lib/parcours";
import type { Station } from "@/lib/stations";

export function OngletsStation({ s, actif }: { s: Station; actif: "fiche" | "logements" }) {
  const go = useGo();
  const retain = useParcours((p) => p.retain);

  const aller = (onglet: "fiche" | "logements") => {
    if (onglet === actif) return;
    if (onglet === "fiche") return void go("fiche", { id: s.id });
    retain(s.id);
    void go("lodging");
  };

  return (
    <nav className="ongletsst" aria-label={`Station ${s.name}`}>
      <span className="ongletsst__nom">{s.name}</span>
      <span className="ongletsst__liste">
        {(["fiche", "logements"] as const).map((k) => (
          <button
            key={k}
            type="button"
            className={`ongletsst__onglet${k === actif ? " ongletsst__onglet--on" : ""}`}
            aria-current={k === actif ? "page" : undefined}
            onClick={() => aller(k)}
          >
            {k === "fiche" ? "Fiche station" : "Logements"}
          </button>
        ))}
      </span>
    </nav>
  );
}
