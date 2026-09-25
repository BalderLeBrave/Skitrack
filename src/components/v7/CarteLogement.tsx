/**
 * La carte d'annonce de la liste des logements.
 *
 * Elle vit hors de la route pour que l'onglet « Par budget » de Prix montre la
 * même carte que Logements, et non une copie qui s'en écarterait.
 */

import { memo } from "react";
import { Icon } from "@/components/Icon";
import { ImageSlot } from "@/components/v6/ImageSlot";
import type { Listing } from "@/lib/listings";
import { nuitsLbl } from "@/lib/parcours";
import { completudeOf, trouLbl } from "@/lib/stay/completude";
import { bedLbl, capLbl, distanceOf, firmOf, mediaTon, prixLbl, prixPersLbl } from "@/lib/v7";

/**
 * Logements par page, comme sur Airbnb. La carte ne porte que ceux de la page
 * en cours : trois mille pastilles d'un coup la rendaient illisible.
 */
export const PAGE_LOGEMENTS = 18;

/**
 * Une annonce dans la liste.
 *
 * Défini dans le corps du rendu, il changeait d'identité à chaque rendu : React
 * démontait puis remontait toute la liste, les photos repartaient au
 * chargement et le focus tombait. Ce qu'il lisait par fermeture arrive
 * désormais en propriétés, et `memo` lui évite de se redessiner quand rien de
 * ce qui le concerne n'a bougé.
 */
export const CarteLogement = memo(function CarteLogement({
  l,
  retenu,
  vue,
  vif,
  stay,
  trav,
  nights,
  ouvrir,
  retenir,
  designer,
  sources,
  autres,
  retenuSource,
}: {
  l: Listing;
  /** « Abritel », ou « Airbnb + 2 » quand le logement est aussi ailleurs. */
  sources: string;
  /** Les autres plateformes et leurs prix, pour l'infobulle de l'étiquette. */
  autres: string | null;
  /** L'offre retenue parmi celles du logement, ou `null`. */
  retenu: string | null;
  /** Sa plateforme, quand ce n'est pas celle de la carte. */
  retenuSource: string | null;
  vue: boolean;
  vif: boolean;
  stay: { checkIn: string; checkOut: string };
  trav: number;
  nights: number;
  ouvrir: (id: string) => void;
  retenir: (id: string) => void;
  designer: (id: string | null) => void;
}) {
  const isKept = retenu != null;
  const seen = vue && !isKept;
  const d = distanceOf(l);
  const firm = firmOf(l, stay);
  const complet = completudeOf(l);
  const pers = prixPersLbl(l, trav);
  return (
    <article
      className={`lodge7${isKept ? " lodge7--kept" : ""}${vif ? " lodge7--vif" : ""}`}
      onClick={() => ouvrir(l.id)}
      onMouseEnter={() => designer(l.id)}
      onMouseLeave={() => designer(null)}
      data-l={l.id}
    >
      <div className={`lodge7__media lodge7__media--${mediaTon(l)}`}>
        {l.photo ? (
          <ImageSlot
            shape="rect"
            id={`v7app-l-${l.id}`}
            placeholder="Photo de l’annonce"
            className="lodge7__slot"
            src={l.photo}
          />
        ) : (
          <span className="lodge7__sansphoto">Pas de photo dans l’annonce {l.source}</span>
        )}
        <span className="lodge7__source" title={autres ?? undefined}>
          {sources}
          {autres ? <span className="lecteur7">. {autres}</span> : null}
        </span>
        {l.priceIndicative ? <span className="lodge7__indic">Prix « à partir de »</span> : null}
        {isKept ? <span className="lodge7__retenu">Retenu</span> : null}
        {seen ? <span className="lodge7__vue">déjà vue</span> : null}
      </div>
      <div className="lodge7__corps">
        <strong className="lodge7__titre">{l.title}</strong>
        <div className="lodge7__meta">
          <span className={l.guests == null ? "absent" : undefined}>{capLbl(l)}</span>
          <span>{bedLbl(l)}</span>
        </div>
        {complet.trous.length ? (
          <span className="lodge7__trous">{complet.trous.map(trouLbl).join(" · ")}</span>
        ) : null}
        <span className={`lodge7__dist${d.kind === "measured" ? "" : " absent"}`}>
          <Icon name="epingle" taille={13} />
          {d.text}
        </span>
        <div className="lodge7__pied">
          <div className={`lodge7__prix${l.total > 0 ? "" : " lodge7__prix--muet"}`}>
            <b>{prixLbl(l)}</b>
            <span>
              {nuitsLbl(nights)}
              {pers ? ` · ${pers} / pers.` : ""}
            </span>
            <span className={`lodge7__ferme${firm ? " lodge7__ferme--oui" : ""}`}>
              <i />
              {firm ? "Prix relevé pour ces dates" : "Disponibilité non confirmée"}
            </span>
          </div>
          <button
            type="button"
            className={`lodge7__retenir${isKept ? " lodge7__retenir--on" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              retenir(retenu ?? l.id);
            }}
          >
            {isKept ? (retenuSource ? `Retenu · ${retenuSource}` : "Retenu") : "Retenir"}
          </button>
        </div>
      </div>
    </article>
  );
});
