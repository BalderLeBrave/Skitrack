/**
 * « Enregistrer » (Skitrack App.dc.html:444-453) : les listes de favoris en
 * grille de deux, chacune avec sa couverture carrée et son compte, et en pied
 * un champ « Nouvelle liste » suivi de « Créer ».
 *
 * Branchée sur le vrai magasin des favoris (`lib/favoris/store.ts`) : une
 * liste du design est un dossier du dépôt. Choisir une liste y range le
 * logement ; créer une liste la crée puis y range le logement.
 *
 * Le cœur des cartes qui l'ouvre : `useEnregistrement` (`enregistrement.tsx`).
 */

import { useState } from "react";
import {
  contenu,
  couverture,
  dossiersRecents,
  NOM_MAX,
  type SejourFavori,
} from "@/lib/favoris/modele";
import { useFavoris } from "@/lib/favoris/store";
import type { Listing } from "@/lib/listings";
import { useParcours } from "@/lib/parcours";
import { tr, trN } from "@/lib/i18n";
import { ModaleCentree } from "./ModaleCentree";

export function ModaleEnregistrer({
  l,
  sejour,
  onFermer,
}: {
  /** Le logement à ranger. */
  l: Listing;
  /** Le séjour cherché : les prix gardés valent pour lui. */
  sejour: SejourFavori | null;
  onFermer: () => void;
}) {
  const etat = useFavoris();
  const dossiers = dossiersRecents(etat);
  const [nom, setNom] = useState("");

  const ranger = (dossierId: string, nomDossier: string) => {
    useFavoris.getState().enregistrer(l, dossierId, sejour);
    useParcours.getState().say(tr("Enregistré dans « {nom} ».", { nom: nomDossier }));
    onFermer();
  };
  const creer = () => {
    const id = useFavoris.getState().creer(nom);
    if (!id) return;
    const d = useFavoris.getState().dossiers.find((x) => x.id === id);
    ranger(id, d?.nom ?? nom);
  };
  const pret = nom.trim().length > 0;

  return (
    <ModaleCentree
      titre={tr("Enregistrer")}
      onFermer={onFermer}
      largeur="etroite"
      niveau="dessus"
      classeCorps={dossiers.length ? "m8-listes" : "m8-listes m8-listes--vide"}
      focusInitial={dossiers.length ? ".m8-liste" : ".m8-listes-pied input"}
      pied={
        <form
          className="m8-listes-pied"
          onSubmit={(e) => {
            e.preventDefault();
            creer();
          }}
        >
          <input
            value={nom}
            maxLength={NOM_MAX}
            onChange={(e) => setNom(e.target.value)}
            placeholder={tr("Nouvelle liste")}
            aria-label={tr("Nom de la liste")}
          />
          <button type="submit" className="m8-listes-creer" disabled={!pret}>
            {tr("Créer")}
          </button>
        </form>
      }
    >
      {dossiers.map((d) => {
        const photo = couverture(etat, d.id)[0];
        const n = contenu(etat, d.id).length;
        return (
          <button key={d.id} type="button" className="m8-liste" onClick={() => ranger(d.id, d.nom)}>
            <span className="m8-liste__couv">
              {photo ? <img src={photo} alt="" loading="lazy" decoding="async" /> : null}
            </span>
            <b>{d.nom}</b>
            <span className="m8-liste__n">
              {n === 0 ? tr("Vide") : trN(n, "{n} logement", "{n} logements")}
            </span>
          </button>
        );
      })}
    </ModaleCentree>
  );
}
