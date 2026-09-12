/** `header.nav` de la maquette (l. 197–215) : marque et parcours.
 *
 *  Le séjour ne vit plus ici. La maquette posait à droite deux pastilles,
 *  dates et voyageurs, ouvrant un sélecteur : deux endroits pour régler la
 *  même chose, dont un qui n'était pas celui que la page met en avant. Dates,
 *  voyageurs et chambres se posent dans la barre de recherche de l'accueil, et
 *  suivent de là jusqu'à la réservation. */

import { useGo, useScreen } from "./go";
import { useParcours } from "@/lib/parcours";

const JOURNEY: {
  go: "home" | "compare" | "lodging" | "booking";
  step: number | null;
  label: string;
}[] = [
  { go: "home", step: null, label: "Accueil" },
  { go: "compare", step: 1, label: "Comparer" },
  { go: "lodging", step: 2, label: "Logements" },
  { go: "booking", step: 3, label: "Réservation" },
];

export function Nav() {
  const go = useGo();
  const screen = useScreen();
  const stationId = useParcours((s) => s.stationId);
  const lodgeId = useParcours((s) => s.lodgeId);

  return (
    <header className="nav nav--slim">
      <span className="brand" data-go="home" onClick={() => go("home")}>
        <span className="brand__ski">ski</span>
        <span className="brand__track">track</span>
        <i className="brand__dot" />
      </span>
      <nav className="journey" id="journey">
        {JOURNEY.map((j) => {
          // l. 484–489 : la fiche allume « Comparer » ; verrou hors écran actif.
          const on = j.go === screen || (screen === "fiche" && j.go === "compare");
          const locked = (j.go === "lodging" && !stationId) || (j.go === "booking" && !lodgeId);
          return (
            <button
              key={j.go}
              type="button"
              className={`jl${on ? " jl--on" : ""}${locked && !on ? " jl--locked" : ""}`}
              data-go={j.go}
              onClick={() => go(j.go)}
            >
              {j.step != null ? <i className="step">{j.step}</i> : null}
              {j.label}
            </button>
          );
        })}
      </nav>
    </header>
  );
}
