/**
 * Le cœur d'une annonce, comme sur Airbnb : vide, il ouvre le choix du
 * dossier ; plein, il retire le logement de ses dossiers.
 *
 * Il vit dans la carte d'annonce et dans le volet : partout où ils servent
 * (Logements, Prix « Par budget », Favoris), le cœur suit sans rien câbler.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/Icon";
import { ImageSlot } from "@/components/v6/ImageSlot";
import { contenu, couverture, dossiersDe, dossiersRecents, type SejourFavori } from "@/lib/favoris/modele";
import { nomPropose } from "@/lib/favoris/nom";
import { useEstFavori, useFavoris } from "@/lib/favoris/store";
import type { Listing } from "@/lib/listings";
import { useParcours } from "@/lib/parcours";
import { tr, trN } from "@/lib/i18n";

export function BoutonFavori({
  l,
  sejour,
  className = "",
  libelle = false,
}: {
  l: Listing;
  sejour: SejourFavori | null;
  className?: string;
  /** Écrit « Enregistrer » ou « Enregistré » à côté du cœur (en-tête de la
   *  fiche d'annonce). */
  libelle?: boolean;
}) {
  // Les favoris vivent dans le navigateur : le rendu serveur ne les connaît
  // pas, le cœur ne dit son état qu'une fois la page montée.
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  const favori = useEstFavori(l.id) && monte;
  const [choix, setChoix] = useState(false);
  const fermer = useCallback(() => setChoix(false), []);
  return (
    <>
      <button
        type="button"
        className={`coeur7${favori ? " coeur7--on" : ""} ${className}`}
        aria-pressed={favori}
        aria-label={favori ? tr("Retirer des favoris") : tr("Enregistrer dans un dossier")}
        title={favori ? tr("Retirer des favoris") : tr("Enregistrer dans un dossier")}
        onClick={(e) => {
          e.stopPropagation();
          if (!favori) return setChoix(true);
          const noms = dossiersDe(useFavoris.getState(), l.id).map((d) => d.nom);
          useFavoris.getState().retirer(l.id);
          useParcours.getState().say(noms.length === 1 ? tr("Retiré de « {nom} ».", { nom: noms[0] }) : tr("Retiré des favoris."));
        }}
      >
        <Icon name="coeur" taille={18} />
        {libelle ? <span>{favori ? tr("Enregistré") : tr("Enregistrer")}</span> : null}
      </button>
      {choix ? <ChoixDossier l={l} sejour={sejour} onFermer={fermer} /> : null}
    </>
  );
}

/** « Enregistrer dans un dossier » : les dossiers existants, ou un nouveau. */
export function ChoixDossier({
  l,
  sejour,
  onFermer,
}: {
  l: Listing;
  sejour: SejourFavori | null;
  onFermer: () => void;
}) {
  const etat = useFavoris();
  const dossiers = dossiersRecents(etat);
  const [creation, setCreation] = useState(dossiers.length === 0);
  const [nom, setNom] = useState(() => nomPropose(l, sejour));
  const champ = useRef<HTMLInputElement>(null);

  // Échap ferme cette fenêtre seule, pas le volet d'annonce dessous : l'écoute
  // passe avant celles du document, et s'y arrête.
  useEffect(() => {
    const echap = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onFermer();
    };
    window.addEventListener("keydown", echap, true);
    return () => window.removeEventListener("keydown", echap, true);
  }, [onFermer]);

  useEffect(() => {
    if (creation) champ.current?.select();
  }, [creation]);

  const ranger = (dossierId: string, nomDossier: string) => {
    useFavoris.getState().enregistrer(l, dossierId, sejour);
    useParcours.getState().say(tr("Enregistré dans « {nom} ».", { nom: nomDossier }));
    onFermer();
  };

  const creer = () => {
    const id = useFavoris.getState().creer(nom);
    if (!id) return champ.current?.focus();
    const d = useFavoris.getState().dossiers.find((x) => x.id === id);
    ranger(id, d?.nom ?? nom);
  };

  return createPortal(
    <div
      className="dossiers7"
      role="dialog"
      aria-modal="true"
      aria-label={creation ? tr("Créer un dossier") : tr("Enregistrer dans un dossier")}
      onClick={(e) => {
        e.stopPropagation();
        if (e.target === e.currentTarget) onFermer();
      }}
    >
      <div className="dossiers7__boite">
        <div className="dossiers7__tete">
          {creation && dossiers.length > 0 ? (
            <button type="button" className="dossiers7__rond" aria-label={tr("Revenir aux dossiers")} onClick={() => setCreation(false)}>
              <Icon name="chevron-gauche" taille={16} />
            </button>
          ) : (
            <span className="dossiers7__rond dossiers7__rond--vide" aria-hidden />
          )}
          <h2>{creation ? tr("Créer un dossier") : tr("Enregistrer dans un dossier")}</h2>
          <button type="button" className="dossiers7__rond" aria-label={tr("Fermer")} onClick={onFermer}>
            <Icon name="croix" taille={14} />
          </button>
        </div>
        {creation ? (
          <form
            className="dossiers7__creer"
            onSubmit={(e) => {
              e.preventDefault();
              creer();
            }}
          >
            <label>
              <span>{tr("Nom du dossier")}</span>
              <input
                ref={champ}
                value={nom}
                maxLength={60}
                onChange={(e) => setNom(e.target.value)}
                placeholder={tr("Courchevel, février 2027")}
                autoFocus
              />
            </label>
            <span className="dossiers7__compte">{tr("{n}/60 caractères", { n: nom.trim().length })}</span>
            <div className="dossiers7__pied">
              <button type="button" className="btn7 btn7--fantome" onClick={onFermer}>
                {tr("Annuler")}
              </button>
              <button type="submit" className="btn7 btn7--encre" disabled={!nom.trim()}>
                {tr("Créer")}
              </button>
            </div>
          </form>
        ) : (
          <>
            <ul className="dossiers7__grille">
              {dossiers.map((d) => {
                const photos = couverture(etat, d.id);
                const n = contenu(etat, d.id).length;
                return (
                  <li key={d.id}>
                    <button type="button" className="dossiers7__dossier" onClick={() => ranger(d.id, d.nom)}>
                      <span className="dossiers7__couv">
                        {photos[0] ? (
                          <ImageSlot shape="rect" id={`dossier-${d.id}`} placeholder="" className="dossiers7__img" src={photos[0]} />
                        ) : (
                          <Icon name="coeur" taille={22} />
                        )}
                      </span>
                      <b>{d.nom}</b>
                      <span>{n === 0 ? tr("Vide") : trN(n, "{n} logement", "{n} logements")}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="dossiers7__pied">
              <button type="button" className="btn7 btn7--encre btn7--pleine" onClick={() => setCreation(true)}>
                {tr("Créer un dossier")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
