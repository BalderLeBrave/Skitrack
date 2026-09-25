/**
 * Le volet d'une annonce : photos, faits, prix, disponibilité, les offres du
 * même logement sur les autres plateformes, provenance et actions.
 *
 * Hors de la route pour que l'onglet « Par budget » de Prix ouvre le même volet
 * que Logements. L'écran garde l'annonce ouverte et le logement retenu ; le
 * volet ne tient que l'index de la photo affichée.
 */

import { useState, type ReactNode } from "react";
import { Icon } from "@/components/Icon";
import { GalerieAnnonce } from "@/components/LodgeSheet";
import { ImageSlot } from "@/components/v6/ImageSlot";
import { useEchap } from "@/components/v7/fermeture";
import { OffresLogement } from "@/components/v7/OffresLogement";
import type { Listing } from "@/lib/listings";
import { nuitsLbl } from "@/lib/parcours";
import { provenancePhrase } from "@/lib/provenance";
import { availabilityLabel, availabilityOf } from "@/lib/stay/availability";
import { completudeOf, galerieOf, trouLbl } from "@/lib/stay/completude";
import type { Logement } from "@/lib/stay/regroupement";
import { bedLbl, capLbl, distanceOf, firmOf, mediaTon, prixLbl, prixPersLbl } from "@/lib/v7";

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
  // Le volet est déclaré `aria-modal` : sans sortie clavier, la croix et le
  // fond en seraient les seules issues.
  useEchap(true, onFermer);
  // Passer à une autre offre du même logement repart de sa première photo.
  // L'index se remet à zéro pendant le rendu, et non dans un effet : un effet
  // laisserait passer un rendu sur l'ancien index, qui désignerait une autre
  // photo de la nouvelle galerie.
  const [photoI, setPhotoI] = useState(0);
  const [photoDe, setPhotoDe] = useState(l.id);
  if (photoDe !== l.id) {
    setPhotoDe(l.id);
    setPhotoI(0);
  }
  const galerie = galerieOf(l);
  const trous = completudeOf(l).trous;
  return (
    <>
      <div className="volet7__fond" onClick={onFermer} />
      <aside className="volet7" role="dialog" aria-modal="true" aria-label={l.title}>
        <div className={`volet7__media lodge7__media--${mediaTon(l)}`}>
          {(galerie[photoI] ?? l.photo) ? (
            <ImageSlot
              shape="rect"
              id={`v7app-sheet-${l.id}`}
              placeholder="Photo de l’annonce"
              className="lodge7__slot"
              src={galerie[photoI] ?? l.photo}
            />
          ) : (
            <span>Pas de photo dans l’annonce {l.source}</span>
          )}
          <button type="button" className="volet7__fermer" aria-label="Fermer" onClick={onFermer}>
            <Icon name="croix" taille={14} />
          </button>
        </div>
        <div className="volet7__corps">
          <div>
            <span className="volet7__ref">
              {l.source} · réf. {l.id}
              {l.priceIndicative ? " · prix « à partir de »" : ""}
            </span>
            <h2>{l.title}</h2>
          </div>
          <GalerieAnnonce urls={galerie} index={photoI} onIndex={setPhotoI} />
          <div className="volet7__faits">
            <div>
              <span>Capacité</span>
              <b>{capLbl(l)}</b>
            </div>
            <div>
              <span>Chambres</span>
              <b>{bedLbl(l)}</b>
            </div>
            <div className="volet7__large">
              <span>Distance aux remontées</span>
              <b className="volet7__doux">{distanceOf(l).text}</b>
            </div>
          </div>
          {trous.length ? <p className="lodge7__trous">{trous.map(trouLbl).join(" · ")}</p> : null}
          <div className="volet7__prix">
            <div>
              <span>
                Total du séjour · {nuitsLbl(nights)} · {trav} pers.
              </span>
              <b>{prixLbl(l)}</b>
            </div>
            <div>
              <span>Par personne</span>
              <b className="volet7__pp">{prixPersLbl(l, trav) ?? "–"}</b>
            </div>
            {firmOf(l, stay) ? (
              <div className="volet7__ok">
                <Icon name="coche" taille={16} />
                <span>
                  <b>Prix relevé pour ces dates.</b> La source a tarifé cette annonce pour ce séjour
                  ; le prix sera revérifié à la réservation.
                </span>
              </div>
            ) : (
              <div className="volet7__alerte">
                <Icon name="alerte" taille={16} />
                <span>
                  <b>Disponibilité non confirmée.</b> {availabilityLabel(availabilityOf(l, stay))}.
                  La disponibilité sera vérifiée à la réservation.
                </span>
              </div>
            )}
          </div>
          {groupe && groupe.offres.length > 1 ? (
            <OffresLogement g={groupe} ici={l.id} voir={onVoirOffre} />
          ) : null}
          <div className="volet7__prov">
            <span>Provenance</span>
            {/* La phrase, pas la trace du collecteur : celle-ci mêle anglais,
                jargon et dates ISO (« StaySearchResult live 2027-02-06… »). */}
            <p>{provenancePhrase(l)}</p>
          </div>
          <div className="volet7__actions">
            <button
              type="button"
              className={`btn7 btn7--grand btn7--pleine${retenu ? " btn7--tenu" : " btn7--encre"}`}
              onClick={onRetenir}
            >
              {retenu ? "Retenu" : "Retenir"}
            </button>
            {l.url ? (
              <a
                href={l.url}
                target="_blank"
                rel="noopener"
                className="btn7 btn7--fantome btn7--pleine btn7--lien"
              >
                Ouvrir sur {l.source}
                <Icon name="externe" taille={12} />
              </a>
            ) : (
              <span className="volet7__sanslien">
                L’annonce n’a pas de lien dans le relevé : la réservation se fera à la main.
              </span>
            )}
            {suite}
          </div>
        </div>
      </aside>
    </>
  );
}
