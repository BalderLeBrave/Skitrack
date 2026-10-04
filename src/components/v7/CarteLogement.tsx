/**
 * La carte d'annonce de la liste des logements.
 *
 * Elle vit hors de la route pour que l'onglet « Par budget » de Prix montre la
 * même carte que Logements, et non une copie qui s'en écarterait.
 */

import { memo } from "react";
import { Icon } from "@/components/Icon";
import { BoutonFavori } from "@/components/v7/BoutonFavori";
import { ImageSlot } from "@/components/v6/ImageSlot";
import { altitudeAide, altitudeLbl, pointAltitude, positionApprochee, type Altitude } from "@/lib/altitude/altitude";
import { tr } from "@/lib/i18n";
import type { Listing } from "@/lib/listings";
import { fmt, nuitsLbl } from "@/lib/parcours";
import { completudeOf, trouLbl } from "@/lib/stay/completude";
import {
  bedLbl,
  bedNomme,
  capNomme,
  distanceOf,
  firmOf,
  mediaTon,
  NON_RENSEIGNE,
  prixLbl,
  prixPersLbl,
} from "@/lib/v7";

/**
 * Logements par page, comme sur Airbnb. La carte ne porte que ceux de la page
 * en cours : trois mille pastilles d'un coup la rendaient illisible.
 */
export const PAGE_LOGEMENTS = 18;

/** Les trous que la carte ne dit pas déjà ailleurs (capacité, prix, photo, position). */
const TROUS_SEULS = new Set(["url"]);

/** Écart d'altitude à partir duquel l'annonce est signalée sous le village. */
const ECART_VILLAGE_M = 300;

const PETITS_MOTS = new Set(["de", "du", "des", "la", "le", "les", "et", "d", "l", "au", "aux", "en", "sur"]);

/** Un titre de source écrit en capitales, avec sa référence interne entre
 *  parenthèses, se lit mal : la carte le remet en casse de phrase et laisse
 *  la référence au volet de l'annonce. Aucun mot n'est ajouté ni retiré. */
function titreLisible(t: string): string {
  const sansRef = t.replace(/\s*\(\s*(?=[A-Z0-9 _-]*\d)[A-Z0-9][A-Z0-9 _-]{2,}\s*\)\s*$/, "");
  return sansRef.replace(/\p{Lu}{2,}(?:[\s'’-]+\p{Lu}{1,})*\p{Lu}/gu, (bloc) => {
    let premier = true;
    return bloc.toLowerCase().replace(/\p{L}+/gu, (mot) => {
      const garder = !premier && PETITS_MOTS.has(mot);
      premier = false;
      return garder ? mot : mot[0].toUpperCase() + mot.slice(1);
    });
  });
}

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
  altitude,
  avecAltitude = false,
  altVillage = null,
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
  /** L'altitude au point de l'annonce (`useAltitudes`) : `undefined` tant qu'elle se lit. */
  altitude?: Altitude | null;
  /** L'écran lit les altitudes : la carte les montre. */
  avecAltitude?: boolean;
  /** L'altitude du village de la station, pour signaler une annonce bien plus bas. */
  altVillage?: number | null;
}) {
  const isKept = retenu != null;
  const seen = vue && !isKept;
  const d = distanceOf(l);
  const firm = firmOf(l, stay);
  const complet = completudeOf(l);
  const pers = prixPersLbl(l, trav);
  const trous = complet.trous.filter((t) => TROUS_SEULS.has(t));
  const ecart = altVillage != null && altitude ? altVillage - altitude.m : null;
  const sousVillage = ecart != null && ecart >= ECART_VILLAGE_M ? Math.round(ecart / 50) * 50 : null;
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
            placeholder={tr("Photo de l’annonce")}
            className="lodge7__slot"
            src={l.photo}
          />
        ) : (
          <span className="lodge7__sansphoto">{tr("Pas de photo dans l’annonce {source}", { source: l.source })}</span>
        )}
        <span className="lodge7__source" title={autres ?? undefined}>
          {sources}
          {autres ? <span className="lecteur7">. {autres}</span> : null}
        </span>
        {l.priceIndicative ? <span className="lodge7__indic">{tr("Prix « à partir de »")}</span> : null}
        {isKept ? <span className="lodge7__retenu">{tr("Retenu")}</span> : null}
        <BoutonFavori
          l={l}
          sejour={{ checkIn: stay.checkIn, checkOut: stay.checkOut, trav }}
          className="lodge7__coeur"
        />
        {seen ? <span className="lodge7__vue">{tr("déjà vue")}</span> : null}
      </div>
      <div className="lodge7__corps">
        <strong className="lodge7__titre" title={l.title}>{titreLisible(l.title)}</strong>
        <div className="lodge7__meta">
          {l.capacity == null && bedLbl(l) === tr(NON_RENSEIGNE) ? (
            <span className="absent">{tr("Capacité et chambres non renseignées")}</span>
          ) : (
            <>
              <span className={l.capacity == null ? "absent" : undefined}>{capNomme(l)}</span>
              <span className={bedLbl(l) === tr(NON_RENSEIGNE) ? "absent" : undefined}>{bedNomme(l)}</span>
            </>
          )}
        </div>
        {trous.length ? (
          <span className="lodge7__trous">{trous.map(trouLbl).join(" · ")}</span>
        ) : null}
        <div className="lodge7__lieu">
          <span className={`lodge7__dist${d.kind === "measured" ? "" : " absent"}`}>
            <Icon name="epingle" taille={13} />
            {d.text}
          </span>
          {avecAltitude && pointAltitude(l) ? (
            <span
              className={`lodge7__dist${altitude ? "" : " absent"}`}
              title={altitudeAide(altitude, positionApprochee(l))}
            >
              <Icon name="montagne" taille={13} />
              {altitudeLbl(altitude, positionApprochee(l))}
            </span>
          ) : null}
          {sousVillage != null ? (
            <span
              className="lodge7__ecart"
              data-testid="lodging-below-village-badge"
              title={tr("Le village de la station est à {altitude} m : prévoyez une navette ou une remontée pour rejoindre les pistes.", { altitude: fmt(altVillage ?? 0) })}
            >
              {tr("{m} m sous le village", { m: fmt(sousVillage) })}
            </span>
          ) : null}
        </div>
        <div className="lodge7__pied">
          <div className={`lodge7__prix${l.total > 0 ? "" : " lodge7__prix--muet"}`}>
            <b>{prixLbl(l)}</b>
            <span>
              {nuitsLbl(nights)}
              {pers ? ` · ${tr("{prix} / pers.", { prix: pers })}` : ""}
            </span>
            <span className={`lodge7__ferme${firm ? " lodge7__ferme--oui" : ""}`}>
              <i />
              {firm ? tr("Prix relevé pour ces dates") : tr("Disponibilité non confirmée")}
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
            {isKept ? (retenuSource ? tr("Retenu · {source}", { source: retenuSource }) : tr("Retenu")) : tr("Retenir")}
          </button>
        </div>
      </div>
    </article>
  );
});
