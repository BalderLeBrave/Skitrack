/**
 * La carte de station de la maquette v7, sur l'accueil et dans la liste de
 * l'écran Comparer : photo, km du domaine, nom, massif et domaine, trois
 * valeurs, la barre des pistes, puis le bouton « Comparer » et l'accès aux
 * logements.
 *
 * **Un clic gauche sur la vignette ouvre la fiche de la station. Partout.**
 * Sur l'accueil, il sélectionnait au lieu d'ouvrir : la vignette était un
 * interrupteur à trois cibles — la photo, le nom, un bouton « Retenir » — dont
 * aucune ne menait quelque part, et un second clic désélectionnait sans que
 * rien ne l'annonce. Il ne reste que deux gestes, et ils vont chacun à un
 * endroit précis : la vignette mène à la fiche, le bouton Comparer mène à
 * l'écran Comparer.
 *
 * Tout contrôle posé sur la vignette arrête la propagation du clic, faute de
 * quoi cocher « Comparer » ouvrirait aussi la fiche derrière.
 *
 * Toute valeur absente est écrite : « non relevée », « km non publié »,
 * « non relevé ». La barre reste vide quand la répartition n'est pas relevée.
 */

import type { MouseEvent } from "react";
import { ImageSlot } from "@/components/v6/ImageSlot";
import { useGo } from "@/components/v6/go";
import { PartPistes } from "./PartPistes";
import { stationPhoto, stationPhotoAbsence, useParcours } from "@/lib/parcours";
import type { Station } from "@/lib/stations";
import { altLbl, kmLbl, passLbl, sub, villageLbl } from "@/lib/v7";

export function CarteStation({
  s,
  variante,
  vif = false,
  surSurvol,
}: {
  s: Station;
  /** Désignée par la carte : même éclairage que l'épingle. */
  vif?: boolean;
  surSurvol?: (id: string | null) => void;
  /** `accueil` : photo 16/10. `liste` : photo 16/9, anneau quand la station est
   *  dans la comparaison. La variante ne change que la mise en forme — jamais
   *  la destination d'un clic. */
  variante: "accueil" | "liste";
}) {
  const go = useGo();
  const cmp = useParcours((p) => p.cmp);
  const toggleCmp = useParcours((p) => p.toggleCmp);
  const retain = useParcours((p) => p.retain);
  const inCmp = cmp.includes(s.id);
  const pass = passLbl(s);

  const ouvrir = (e?: MouseEvent) => {
    e?.preventDefault();
    void go("fiche", { id: s.id });
  };

  /** Le bouton Comparer : il pose la station dans la comparaison **et** mène à
   *  l'écran qui la lit. Cocher sans rien ouvrir laissait l'utilisateur devant
   *  une case cochée et aucun chemin. */
  const comparer = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!inCmp) toggleCmp(s.id);
    void go("compare");
  };

  const logements = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    retain(s.id);
    void go("lodging");
  };

  return (
    <article
      className={`stc7 stc7--${variante}${inCmp ? " stc7--cmp" : ""}${vif ? " stc7--vif" : ""}`}
      data-station={s.id}
      onMouseEnter={surSurvol ? () => surSurvol(s.id) : undefined}
      onMouseLeave={surSurvol ? () => surSurvol(null) : undefined}
    >
      {/* La photo est un raccourci souris vers la fiche ; le nom en dessous est
          le lien véritable, focalisable et copiable. */}
      <div className="stc7__media" onClick={ouvrir} aria-hidden>
        <ImageSlot
          shape="rect"
          id={`v7-${variante}-${s.id}`}
          placeholder={stationPhotoAbsence(s)}
          className="stc7__slot"
          src={stationPhoto(s)}
        />
        <span className="stc7__km">{kmLbl(s) ?? "km non publié"}</span>
      </div>
      <div className="stc7__corps">
        <div className="stc7__titre">
          <a href={`/stations/${s.id}`} onClick={ouvrir} className="stc7__nom">
            {s.name}
          </a>
          <span className="stc7__sub">{sub(s)}</span>
        </div>
        <div className="stc7__faits">
          <div>
            <span>Pistes</span>
            <b className={altLbl(s) ? undefined : "absent"}>{altLbl(s) ?? "non relevée"}</b>
          </div>
          <div>
            <span>Village</span>
            <b className={villageLbl(s) ? undefined : "absent"}>{villageLbl(s) ?? "non relevé"}</b>
          </div>
          <div>
            <span>Forfait 6 j</span>
            <b className={pass ? undefined : "absent"}>{pass ?? "non relevé"}</b>
          </div>
        </div>
        <PartPistes share={s.colorShare} />
        <div className="stc7__pied">
          <button
            type="button"
            className={`stc7__cmp${inCmp ? " stc7__cmp--on" : ""}`}
            aria-pressed={inCmp}
            onClick={comparer}
          >
            {inCmp ? "Dans la comparaison" : "Comparer"}
          </button>
          <button type="button" className="stc7__lodg-btn" onClick={logements}>
            Voir les logements
          </button>
        </div>
      </div>
    </article>
  );
}
