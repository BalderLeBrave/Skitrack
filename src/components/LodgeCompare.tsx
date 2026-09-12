/**
 * Comparateur de logements : un tiroir, les annonces retenues côte à côte.
 *
 * ## Ce qu'il compare
 *
 * Ce que les annonces publient, et rien d'autre : le total du séjour, le prix
 * par personne, la capacité et les chambres **quand elles sont annoncées**, la
 * distance aux pistes et à la remontée **quand elle est mesurée**, la source,
 * et le verdict de disponibilité de `stay/availability.ts`. Une ligne vide dit
 * « non annoncé », jamais un zéro.
 *
 * ## Trois colonnes du modèle qui n'existent pas ici, et pourquoi
 *
 * - **Note et avis** : aucune des sources relevées ne les publie. Une note
 *   inventée serait la pire des valeurs inventées, parce qu'elle décide.
 * - **Prix par source** : dans le relevé, une annonce appartient à une seule
 *   source. Il n'y a pas la même annonce chez deux plateformes à confronter ;
 *   ce que la colonne « source » dit, c'est d'où vient ce prix-là.
 * - **Évolution sur 30 jours** : il n'existe aucun historique de prix. Le jour
 *   où l'application en tiendra un, il commencera vide, comme l'historique de
 *   neige, et le dira.
 *
 * Le tiroir les annonce en pied plutôt que de laisser trois colonnes muettes.
 */

import { availabilityLabel, availabilityOf } from "@/lib/stay/availability";
import { formatEuro, type Listing } from "@/lib/listings";
import { IconClose } from "@/components/v6/icons";

type Ligne = {
  label: string;
  /** Valeur par annonce, ou `null` quand l'annonce ne la publie pas. */
  valeur: (l: Listing) => string | null;
};

function metres(m: number | null | undefined): string | null {
  if (m == null) return null;
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace(".", ",")} km`;
}

export function LodgeCompare({
  listings,
  guests,
  nights,
  checkIn,
  checkOut,
  onClose,
  onRemove,
}: {
  listings: Listing[];
  guests: number;
  nights: number;
  checkIn: string;
  checkOut: string;
  onClose: () => void;
  onRemove: (id: string) => void;
}) {
  if (listings.length === 0) return null;
  const moinsCher = Math.min(...listings.map((l) => l.total));

  const lignes: Ligne[] = [
    { label: "Prix du séjour", valeur: (l) => formatEuro(l.total) },
    {
      label: `Par personne (${guests})`,
      valeur: (l) => (guests > 0 ? formatEuro(Math.round(l.total / guests)) : null),
    },
    {
      label: "Par nuit",
      valeur: (l) => (nights > 0 ? formatEuro(Math.round(l.total / nights)) : null),
    },
    { label: "Capacité annoncée", valeur: (l) => (l.guests != null ? `${l.guests} pers.` : null) },
    {
      label: "Chambres annoncées",
      valeur: (l) => (l.bedrooms != null ? `${l.bedrooms} ch.` : null),
    },
    { label: "Distance aux pistes", valeur: (l) => metres(l.distToSlopesM) },
    {
      label: "Remontée la plus proche",
      valeur: (l) => {
        const d = metres(l.distToLiftM);
        return d ? `${d}${l.liftName ? ` · ${l.liftName}` : ""}` : null;
      },
    },
    { label: "Lieu", valeur: (l) => l.locality ?? l.placeName ?? null },
    { label: "Source", valeur: (l) => l.source },
    {
      label: "Disponibilité",
      valeur: (l) => availabilityLabel(availabilityOf(l, { checkIn, checkOut })),
    },
    { label: "Preuve du prix", valeur: (l) => l.proven },
  ];

  return (
    <div className="cmpdr" role="dialog" aria-label="Comparaison des logements retenus">
      <header className="cmpdr__head">
        <div>
          <strong>
            {listings.length} logement{listings.length > 1 ? "s" : ""} comparé
            {listings.length > 1 ? "s" : ""}
          </strong>
          <p className="muted cmpdr__lead">
            {nights} nuit{nights > 1 ? "s" : ""} · {guests} voyageur{guests > 1 ? "s" : ""} · prix
            relevés, frais compris quand la source les inclut.
          </p>
        </div>
        <button type="button" className="mini" onClick={onClose} aria-label="Fermer la comparaison">
          <IconClose /> Fermer
        </button>
      </header>

      <div className="cmpdr__scroll">
        <table className="cmpdr__table">
          <thead>
            <tr>
              <th scope="row" />
              {listings.map((l) => (
                <th key={l.id} scope="col">
                  <span className="cmpdr__name">{l.title}</span>
                  {l.total === moinsCher && listings.length > 1 ? (
                    <span className="tag tag--ok cmpdr__best">Prix le plus bas</span>
                  ) : null}
                  <button
                    type="button"
                    className="cmpdr__drop"
                    onClick={() => onRemove(l.id)}
                    aria-label={`Retirer ${l.title} de la comparaison`}
                  >
                    Retirer
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                {listings.map((l) => {
                  const v = r.valeur(l);
                  return (
                    <td key={l.id} className={v == null ? "cmpdr__none" : undefined}>
                      {v ?? "non annoncé"}
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th scope="row">Ouvrir</th>
              {listings.map((l) => (
                <td key={l.id}>
                  {l.url ? (
                    <a href={l.url} target="_blank" rel="noopener">
                      {l.source}
                    </a>
                  ) : (
                    <span className="cmpdr__none">pas de lien publié</span>
                  )}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      <p className="muted cmpdr__note">
        Ni note, ni avis, ni évolution de prix : aucune source relevée ne publie de note, et
        l’application ne tient pas encore d’historique de prix. « Source » dit d’où vient ce
        prix-là, pas le prix de la même annonce ailleurs : dans ce relevé, une annonce n’appartient
        qu’à une seule plateforme.
      </p>
    </div>
  );
}
