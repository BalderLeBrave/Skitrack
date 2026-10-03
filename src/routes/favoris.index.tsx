/**
 * Favoris : les dossiers de logements enregistrés, comme les listes d'Airbnb.
 * Chaque dossier montre ses trois dernières photos, son nom et ce qu'il
 * contient ; il s'ouvre sur sa liste et sa carte (`favoris.$id.tsx`).
 *
 * Les dossiers vivent dans le navigateur (`lib/favoris`) : la page attend
 * d'être montée pour les lire, comme Prix.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Coquille } from "@/components/Coquille";
import { Icon } from "@/components/Icon";
import { ImageSlot } from "@/components/v6/ImageSlot";
import { useGo } from "@/components/v6/go";
import { Vide } from "@/components/v7/Vide";
import { contenu, couverture, dossiersRecents, type Dossier, type EtatFavoris } from "@/lib/favoris/modele";
import { useFavoris } from "@/lib/favoris/store";
import { stationById } from "@/lib/stations";
import { langueIntl } from "@/lib/i18n/langue";

export const Route = createFileRoute("/favoris/")({ component: Favoris });

function Favoris() {
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  return (
    <Coquille>
      <main className="v7main favoris7" id="s-favoris" data-screen-label="Favoris">
        <h1 className="favoris7__titre">Favoris</h1>
        {monte ? <Dossiers /> : null}
      </main>
    </Coquille>
  );
}

function Dossiers() {
  const etat = useFavoris();
  const go = useGo();
  const dossiers = dossiersRecents(etat);
  if (dossiers.length === 0) {
    return (
      <Vide
        titre="Aucun logement enregistré"
        actions={
          <button type="button" className="btn7 btn7--encre" onClick={() => go("lodging")}>
            Voir les logements
          </button>
        }
      >
        Le cœur, en haut à droite de chaque annonce, l’enregistre dans un dossier. Vos dossiers apparaissent ici.
      </Vide>
    );
  }
  return (
    <ul className="favoris7__grille">
      {dossiers.map((d) => (
        <li key={d.id}>
          <CarteDossier d={d} etat={etat} />
        </li>
      ))}
    </ul>
  );
}

const jour = (d: Date) => new Intl.DateTimeFormat(langueIntl(), { day: "numeric", month: "long" }).format(d);

/** « Courchevel, La Plagne » : les stations du dossier, dans l'ordre des derniers ajouts. */
function stationsDe(etat: EtatFavoris, id: string): string {
  const noms = [...new Set(contenu(etat, id).map((f) => stationById(f.annonce.stationId)?.name).filter(Boolean))];
  return noms.length > 2 ? `${noms.slice(0, 2).join(", ")} et ${noms.length - 2} autre${noms.length > 3 ? "s" : ""}` : noms.join(", ");
}

function CarteDossier({ d, etat }: { d: Dossier; etat: EtatFavoris }) {
  const photos = couverture(etat, d.id);
  const n = contenu(etat, d.id).length;
  const stations = stationsDe(etat, d.id);
  return (
    <Link to="/favoris/$id" params={{ id: d.id }} className="favoris7__dossier">
      <span className={`favoris7__couv favoris7__couv--${Math.max(1, photos.length)}`}>
        {photos.length === 0 ? (
          <Icon name="coeur" taille={28} />
        ) : (
          photos.map((src, i) => (
            <span key={src} className="favoris7__photo">
              <ImageSlot shape="rect" id={`dossier-${d.id}-${i}`} placeholder="" src={src} />
            </span>
          ))
        )}
      </span>
      <b>{d.nom}</b>
      <span>
        {n === 0 ? "Vide" : `${n} logement${n > 1 ? "s" : ""}`}
        {stations ? ` · ${stations}` : ""}
      </span>
      <span className="favoris7__date">Modifié le {jour(new Date(d.majLe))}</span>
    </Link>
  );
}
