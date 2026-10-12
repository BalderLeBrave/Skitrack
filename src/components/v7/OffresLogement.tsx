/**
 * Les offres d'un logement sur ses différentes plateformes, dans la fiche de
 * l'annonce. Hors de la route pour que Prix ouvre la même fiche que
 * Logements.
 */

import { Icon } from "@/components/Icon";
import { tr } from "@/lib/i18n";
import { eurCents } from "@/lib/parcours";
import { ecartAvecPrincipale, type Logement } from "@/lib/stay/regroupement";
import { prixLbl } from "@/lib/v7";

/**
 * Une ligne par plateforme, de la moins chère à la plus chère, avec l'écart
 * de chacune à la moins chère. Un écart ne se calcule qu'entre deux prix
 * publiés dans la même devise : sinon on le tait.
 *
 * La ligne entière choisit l'offre (la carte de prix la suit) ; « Voir
 * l'offre » ouvre la plateforme dans un nouvel onglet.
 */
export function OffresLogement({
  g,
  ici,
  voir,
}: {
  g: Logement;
  ici: string;
  voir: (id: string) => void;
}) {
  const base = g.principale;
  return (
    <section
      className="fl-carte fl-offres"
      aria-label={tr("Ce logement sur {n} plateformes", { n: g.offres.length })}
    >
      <ul>
        {g.offres.map((o) => {
          const e = o.id === base.id ? null : ecartAvecPrincipale(o, base);
          const courante = o.id === ici;
          return (
            <li key={o.id} className={`fl-offre${courante ? " fl-offre--ici" : ""}`}>
              <button
                type="button"
                className="fl-offre__choix"
                aria-pressed={courante}
                onClick={() => voir(o.id)}
              >
                <span className="fl-offre__source">{o.source}</span>
                <span className="fl-offre__ecart">
                  {e != null && e > 0 ? `+${eurCents(e) ?? e}` : ""}
                </span>
                <b className={o.total > 0 ? undefined : "fl-absent"}>{prixLbl(o)}</b>
              </button>
              {o.url ? (
                <a
                  href={o.url}
                  target="_blank"
                  rel="noopener"
                  className="fl-offre__lien"
                  aria-label={tr("Ouvrir l’offre {source} dans un nouvel onglet", {
                    source: o.source,
                  })}
                >
                  {tr("Voir l’offre")}
                  <Icon name="externe" taille={11} />
                </a>
              ) : (
                <span className="fl-offre__lien fl-absent">{tr("sans lien")}</span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
