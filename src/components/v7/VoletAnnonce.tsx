/**
 * La fiche d'une annonce, en plein écran : toutes ses photos en grand, côte à
 * côte, et un bandeau en bas qui porte tout le texte — faits, distance,
 * altitude, prix, les offres du même logement sur les autres plateformes, et
 * les actions.
 *
 * Demandée par le propriétaire le 5 oct. 2026 à la place du volet latéral, qui
 * montrait une photo à la fois. Sans phrase de provenance ni explication du
 * prix relevé : la fiche montre l'annonce, pas la façon dont on l'a relevée.
 *
 * Hors de la route pour que l'onglet « Par budget » de Prix ouvre la même
 * fiche que Logements.
 */

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { BoutonFavori } from "@/components/v7/BoutonFavori";
import { useEchap } from "@/components/v7/fermeture";
import { OffresLogement } from "@/components/v7/OffresLogement";
import { altitudeAide, altitudeLbl, pointAltitude, positionApprochee } from "@/lib/altitude/altitude";
import { useAltitudes } from "@/lib/altitude/store";
import { tr, trN } from "@/lib/i18n";
import type { Listing } from "@/lib/listings";
import { nuitsLbl } from "@/lib/parcours";
import { availabilityLabel, availabilityOf } from "@/lib/stay/availability";
import { completudeOf, galerieOf, trouLbl } from "@/lib/stay/completude";
import type { Logement } from "@/lib/stay/regroupement";
import { bedLbl, capLbl, distanceOf, firmOf, persLbl, prixLbl, prixPersLbl } from "@/lib/v7";

export function VoletAnnonce({
  l,
  stay,
  trav,
  nights,
  groupe,
  retenu,
  onRetenir,
  onFermer,
  onVoirOffre,
  suite,
}: {
  l: Listing;
  stay: { checkIn: string; checkOut: string };
  trav: number;
  nights: number;
  /** Le logement sur toutes ses plateformes, ou null : « Ce logement sur N plateformes ». */
  groupe: Logement | null;
  /** Cette annonce est le logement retenu. */
  retenu: boolean;
  onRetenir: () => void;
  onFermer: () => void;
  /** Ouvre une autre offre du même logement. */
  onVoirOffre: (id: string) => void;
  /**
   * Une action de plus sous « Retenir » et « Ouvrir sur … » (Prix y met
   * « Passer à la réservation »).
   */
  suite?: ReactNode;
}) {
  // La fiche est déclarée `aria-modal` : sans sortie clavier, la croix en
  // serait la seule issue.
  useEchap(true, onFermer);
  const bande = useRef<HTMLDivElement>(null);
  const galerie = galerieOf(l);
  const altDe = useAltitudes(useMemo(() => [l], [l]));
  const altitude = altDe(l);
  const trous = completudeOf(l).trous;

  // La page ne défile plus sous la fiche.
  useEffect(() => {
    const html = document.documentElement;
    const avant = html.style.overflow;
    html.style.overflow = "hidden";
    return () => {
      html.style.overflow = avant;
    };
  }, []);

  // La molette fait défiler les photos, et les flèches du clavier aussi. Un
  // écouteur natif : React pose les siens en passif, et la molette verticale
  // ne pourrait pas être détournée vers l'horizontale.
  useEffect(() => {
    const el = bande.current;
    if (!el) return;
    const molette = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };
    const fleches = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") defiler(el, 1);
      else if (e.key === "ArrowLeft") defiler(el, -1);
    };
    el.addEventListener("wheel", molette, { passive: false });
    document.addEventListener("keydown", fleches);
    return () => {
      el.removeEventListener("wheel", molette);
      document.removeEventListener("keydown", fleches);
    };
  }, [l.id]);

  return (
    <div className="fiche7" role="dialog" aria-modal="true" aria-label={l.title}>
      <div className="fiche7__haut">
        {/* `key` : passer à une autre offre du même logement repart de sa
            première photo. */}
        <div
          key={l.id}
          ref={bande}
          className="fiche7__photos"
          aria-label={tr("Photos de l’annonce")}
          onClick={(e) => {
            if (e.target === e.currentTarget) onFermer();
          }}
        >
          {galerie.length ? (
            galerie.map((u, i) => (
              <img
                key={u}
                src={u}
                alt={tr("Photo {n} sur {total}", { n: i + 1, total: galerie.length })}
                loading={i < 3 ? "eager" : "lazy"}
                onError={(e) => {
                  e.currentTarget.hidden = true;
                }}
              />
            ))
          ) : (
            <span className="fiche7__sansphoto">
              {tr("Pas de photo dans l’annonce {source}", { source: l.source })}
            </span>
          )}
        </div>
        <button type="button" className="fiche7__rond fiche7__fermer" aria-label={tr("Fermer")} onClick={onFermer}>
          <Icon name="croix" taille={16} />
        </button>
        <BoutonFavori
          l={l}
          sejour={{ checkIn: stay.checkIn, checkOut: stay.checkOut, trav }}
          className="fiche7__coeur"
        />
        {galerie.length > 1 ? (
          <>
            <span className="fiche7__compte">{trN(galerie.length, "{n} photo", "{n} photos")}</span>
            <button
              type="button"
              className="fiche7__rond fiche7__prec"
              aria-label={tr("Photos précédentes")}
              onClick={() => bande.current && defiler(bande.current, -1)}
            >
              <Icon name="chevron-gauche" taille={18} />
            </button>
            <button
              type="button"
              className="fiche7__rond fiche7__suiv"
              aria-label={tr("Photos suivantes")}
              onClick={() => bande.current && defiler(bande.current, 1)}
            >
              <Icon name="chevron-droite" taille={18} />
            </button>
          </>
        ) : null}
      </div>

      <div className="fiche7__bandeau">
        <div className="fiche7__infos">
          <div className="fiche7__tete">
            <span className="fiche7__ref">
              {l.source}
              {l.priceIndicative ? ` · ${tr("prix « à partir de »")}` : ""}
            </span>
            <h2>{l.title}</h2>
          </div>
          <dl className="fiche7__faits">
            <div>
              <dt>{tr("Capacité")}</dt>
              <dd>{capLbl(l)}</dd>
            </div>
            <div>
              <dt>{tr("Chambres")}</dt>
              <dd>{bedLbl(l)}</dd>
            </div>
            <div>
              <dt>{tr("Distance aux remontées")}</dt>
              <dd>{distanceOf(l).text}</dd>
            </div>
            {pointAltitude(l) ? (
              <div title={altitudeAide(altitude, positionApprochee(l))}>
                <dt>{tr("Altitude")}</dt>
                <dd>{altitudeLbl(altitude, positionApprochee(l))}</dd>
              </div>
            ) : null}
          </dl>
          {trous.length ? <p className="lodge7__trous">{trous.map(trouLbl).join(" · ")}</p> : null}
          {groupe && groupe.offres.length > 1 ? (
            <OffresLogement g={groupe} ici={l.id} voir={onVoirOffre} />
          ) : null}
        </div>

        <div className="fiche7__cote">
          <div className="fiche7__prix">
            <span>{tr("Total du séjour · {nuits} · {pers}", { nuits: nuitsLbl(nights), pers: persLbl(trav) })}</span>
            <b>{prixLbl(l)}</b>
            <span>
              {tr("Par personne")} <b>{prixPersLbl(l, trav) ?? "–"}</b>
            </span>
            {firmOf(l, stay) ? null : (
              <span className="fiche7__alerte">
                <Icon name="alerte" taille={14} />
                {tr("Disponibilité non confirmée.")} {availabilityLabel(availabilityOf(l, stay))}
              </span>
            )}
          </div>
          <div className="fiche7__actions">
            <button
              type="button"
              className={`btn7 btn7--grand btn7--pleine${retenu ? " btn7--tenu" : " btn7--encre"}`}
              onClick={onRetenir}
            >
              {retenu ? tr("Retenu") : tr("Retenir")}
            </button>
            {l.url ? (
              <a href={l.url} target="_blank" rel="noopener" className="btn7 btn7--fantome btn7--pleine btn7--lien">
                {tr("Ouvrir sur {source}", { source: l.source })}
                <Icon name="externe" taille={12} />
              </a>
            ) : null}
            {suite}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Avance ou recule la bande des photos de presque un écran. */
function defiler(el: HTMLElement, sens: 1 | -1) {
  el.scrollBy({ left: sens * el.clientWidth * 0.8, behavior: "smooth" });
}
