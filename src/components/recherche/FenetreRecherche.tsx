/**
 * « Modifier la recherche » (Skitrack App.dc.html:46-116) : la barre de
 * recherche complète, déroulée en haut de l'écran sur un fond flouté. La
 * pilule de la barre du haut l'ouvre, comme les boutons de séjour de
 * Logements et de la réservation (`stayOpen` du parcours).
 *
 * - La station en cours remplit Destination sans devenir un filtre : le texte
 *   reste un brouillon de la fenêtre jusqu'à « Rechercher ».
 * - Altitude, dates et voyageurs s'écrivent dans leurs magasins ; fermer la
 *   fenêtre sans chercher (croix, Échap depuis n'importe quel panneau, clic
 *   dehors, ou navigation) rend la recherche telle qu'elle était.
 * - « Rechercher » applique. Une station nommée : sur Logements, ses
 *   logements se rechargent ; depuis la réservation, une autre station mène à
 *   ses logements ; ailleurs, sa fiche s'ouvre. Sans station précise : la
 *   liste des stations, filtrée.
 */

import { useEffect, useRef, useState } from "react";
import { IconeCroix } from "@/components/maquette";
import { useGo, type Screen } from "@/components/v6/go";
import { tr } from "@/lib/i18n";
import { useParcours } from "@/lib/parcours";
import type { Station } from "@/lib/stations";
import { useStay } from "@/lib/stay";
import { BarreRecherche, type PanneauRecherche } from "./BarreRecherche";
import { stationDuTexte } from "./outils";

type Instantane = {
  parcours: Pick<
    ReturnType<typeof useParcours.getState>,
    "q" | "stationId" | "lodgeId" | "booked" | "massif" | "filters"
  >;
  sejour: Pick<ReturnType<typeof useStay.getState>, "checkIn" | "checkOut" | "guests" | "children" | "bedrooms">;
};

function prendre(): Instantane {
  const p = useParcours.getState();
  const s = useStay.getState();
  return {
    parcours: {
      q: p.q,
      stationId: p.stationId,
      lodgeId: p.lodgeId,
      booked: p.booked,
      massif: p.massif,
      filters: p.filters,
    },
    sejour: {
      checkIn: s.checkIn,
      checkOut: s.checkOut,
      guests: s.guests,
      children: s.children,
      bedrooms: s.bedrooms,
    },
  };
}

function rendre(i: Instantane) {
  useParcours.setState(i.parcours);
  useStay.getState().setStay(i.sejour);
}

export function FenetreRecherche({
  ecran,
  station,
}: {
  /** L'écran sous la fenêtre : il décide de ce que « Rechercher » ouvre. */
  ecran: Screen | null;
  /** La station en cours, qui pré-remplit Destination. */
  station: Station | undefined;
}) {
  const go = useGo();
  const setStayOpen = useParcours((s) => s.setStayOpen);
  const [instantane] = useState(prendre);
  const [texte, setTexte] = useState(() => station?.name ?? instantane.parcours.q);
  const [choisie, setChoisie] = useState<Station | null>(station ?? null);
  const [massif, setMassif] = useState<string | null>(instantane.parcours.massif);
  const [hp, setHp] = useState<PanneauRecherche>("q");
  const appliquee = useRef(false);

  // Se refermer sans « Rechercher », de quelque façon que ce soit, rend la
  // recherche d'avant. Le focus revient au bouton qui a ouvert la fenêtre.
  useEffect(() => {
    const avant = document.activeElement as HTMLElement | null;
    return () => {
      if (!appliquee.current) rendre(instantane);
      avant?.focus?.();
    };
  }, [instantane]);

  const fermer = () => setStayOpen(false);

  // Échap ferme la fenêtre depuis n'importe quel panneau.
  useEffect(() => {
    const echap = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStayOpen(false);
    };
    document.addEventListener("keydown", echap);
    return () => document.removeEventListener("keydown", echap);
  }, [setStayOpen]);

  const r = choisie && choisie.name === texte ? choisie : stationDuTexte(texte);

  const rechercher = () => {
    appliquee.current = true;
    const P = useParcours.getState();
    setStayOpen(false);
    if (r) {
      // Le nom de la station n'est pas un filtre : le texte se vide, la
      // station est retenue.
      useParcours.setState({ q: "", massif });
      const autre = r.id !== instantane.parcours.stationId;
      P.retain(r.id);
      if (ecran === "lodging") return;
      if (ecran === "booking") {
        if (autre) void go("lodging");
        return;
      }
      void go("fiche", { id: r.id });
      return;
    }
    P.setQ(texte);
    P.setMassif(massif);
    void go("compare");
  };

  return (
    <>
      <div className="sh-voile" onClick={fermer} aria-hidden />
      <div className="sh-fenetre" role="dialog" aria-modal="true" aria-label={tr("Modifier la recherche")}>
        <div className="sh-fenetre__in">
          <div className="sh-fenetre__tete">
            <button type="button" className="sh-rond" aria-label={tr("Fermer")} onClick={fermer}>
              <IconeCroix taille={14} />
            </button>
          </div>
          <BarreRecherche
            idBase="sh-q"
            q={texte}
            onQ={(t) => {
              setTexte(t);
              if (choisie && t !== choisie.name) setChoisie(null);
            }}
            onStation={(s) => {
              setTexte(s.name);
              setChoisie(s);
            }}
            onMassif={(m) => {
              setTexte(m);
              setChoisie(null);
              setMassif(m);
            }}
            onRechercher={rechercher}
            labelRecherche={
              r
                ? tr("Rechercher : {station}", { station: r.name })
                : tr("Rechercher dans la liste des stations")
            }
            hp={hp}
            setHp={setHp}
            fermerAEchap={false}
            autoFocus
          />
        </div>
      </div>
    </>
  );
}
