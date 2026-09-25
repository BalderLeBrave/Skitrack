/**
 * La fiche d'un logement sur la carte aux pastilles de prix : au survol d'une
 * pastille, puis épinglée au clic.
 *
 * Hors de la route pour que l'onglet « Par budget » de Prix montre la même
 * fiche que Logements. La recherche de l'annonce reste au parent : lui seul
 * sait dans quelle liste la chercher.
 */

import { ImageSlot } from "@/components/v6/ImageSlot";
import type { Listing } from "@/lib/listings";
import { nuitsLbl } from "@/lib/parcours";
import { availabilityLabel, availabilityOf } from "@/lib/stay/availability";
import { bedLbl, capLbl, distanceOf, firmOf, prixLbl, prixPersLbl } from "@/lib/v7";

export function FicheEpingle({
  l,
  sources,
  stay,
  trav,
  nights,
}: {
  l: Listing;
  /** L'étiquette de sources du logement, la même que sur sa carte d'annonce. */
  sources: string;
  stay: { checkIn: string; checkOut: string };
  trav: number;
  nights: number;
}) {
  const d = distanceOf(l);
  const ferme = firmOf(l, stay);
  const pers = prixPersLbl(l, trav);
  return (
    <>
      {l.photo ? (
        <div className="fc__media">
          <ImageSlot
            shape="rect"
            id={`v7app-fc-${l.id}`}
            placeholder="Photo de l’annonce"
            className="fc__slot"
            src={l.photo}
          />
          <span className="fc__source">{sources}</span>
          {l.priceIndicative ? <span className="lodge7__indic">Prix « à partir de »</span> : null}
        </div>
      ) : null}
      <div className="fc__texte">
        {!l.photo ? <span className="toujours7__regle">{sources}</span> : null}
        <strong className="fc__titre">{l.title}</strong>
        <span className="fc__ligne">
          <span className={l.guests == null ? "absent" : undefined}>{capLbl(l)}</span>
          <span>{bedLbl(l)}</span>
        </span>
        <span className={`fc__ligne${d.kind === "measured" ? "" : " absent"}`}>{d.text}</span>
        <span className="fc__prix">
          <b>{prixLbl(l)}</b>
          <span>
            {nuitsLbl(nights)}
            {pers ? ` · ${pers} / pers.` : ""}
          </span>
        </span>
        <span className={`fc__verdict${ferme ? " fc__verdict--ok" : ""}`}>
          <i />
          {ferme ? "Prix relevé pour ces dates" : availabilityLabel(availabilityOf(l, stay))}
        </span>
      </div>
    </>
  );
}
