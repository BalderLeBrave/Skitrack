/**
 * La carte de station de la maquette v7, sur l'accueil et dans la liste de
 * l'écran Comparer : photo, km du domaine, nom, massif et domaine, trois
 * valeurs, la barre des pistes, puis la case « Comparer » et l'accès aux
 * logements.
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
}: {
  s: Station;
  /** `accueil` : photo 16/10, lien « Voir les logements → ». `liste` : photo
   *  16/9, anneau quand la station est dans la comparaison, bouton. */
  variante: "accueil" | "liste";
}) {
  const go = useGo();
  const cmp = useParcours((p) => p.cmp);
  const stationId = useParcours((p) => p.stationId);
  const toggleCmp = useParcours((p) => p.toggleCmp);
  const retain = useParcours((p) => p.retain);
  const inCmp = cmp.includes(s.id);
  const retained = stationId === s.id;
  const pass = passLbl(s);
  const ouvrir = (e?: MouseEvent) => {
    e?.preventDefault();
    void go("fiche", { id: s.id });
  };
  const logements = (e?: MouseEvent) => {
    e?.preventDefault();
    retain(s.id);
    void go("lodging");
  };

  return (
    <article
      className={`stc7 stc7--${variante}${inCmp && variante === "liste" ? " stc7--cmp" : ""}`}
      data-station={s.id}
    >
      <div className="stc7__media" onClick={ouvrir} role="link" tabIndex={-1}>
        <ImageSlot shape="rect"
          id={`v7-${variante}-${s.id}`}
          placeholder={stationPhotoAbsence(s)}
          className="stc7__slot"
          src={stationPhoto(s)}
        />
        <span className="stc7__km" title="Kilomètres de pistes du domaine">
          {kmLbl(s) ?? "km non publié"}
        </span>
        {variante === "liste" && retained ? <span className="stc7__retenue">Retenue</span> : null}
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
          <label className={`stc7__cmp${inCmp ? " stc7__cmp--on" : ""}`}>
            <input type="checkbox" checked={inCmp} onChange={() => toggleCmp(s.id)} />
            {inCmp ? "Dans la comparaison" : "Comparer"}
          </label>
          {variante === "accueil" ? (
            <a href="/logements" onClick={logements} className="stc7__lodg">
              Voir les logements →
            </a>
          ) : (
            <button type="button" className="stc7__lodg-btn" onClick={() => logements()}>
              Voir les logements
            </button>
          )}
        </div>
      </div>
    </article>
  );
}
