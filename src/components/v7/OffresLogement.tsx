/**
 * Les offres d'un logement sur ses différentes plateformes, dans le volet de
 * l'annonce. Hors de la route pour que Prix ouvre le même volet que Logements.
 */

import { Icon } from "@/components/Icon";
import { tr } from "@/lib/i18n";
import { eurCents } from "@/lib/parcours";
import { ecartAvecPrincipale, type Logement } from "@/lib/stay/regroupement";
import { prixLbl } from "@/lib/v7";

/**
 * Les offres d'un même logement, de la moins chère à la plus chère, avec
 * l'écart de chacune à la moins chère. Un écart ne se calcule qu'entre deux
 * prix publiés dans la même devise : sinon on le tait.
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
    <div className="offres7">
      <span className="offres7__titre">{tr("Ce logement sur {n} plateformes", { n: g.offres.length })}</span>
      <ul>
        {g.offres.map((o) => {
          const e = ecartAvecPrincipale(o, base);
          const pct = e != null && base.total > 0 ? (e / base.total) * 100 : null;
          const pctLbl = pct != null && pct < 1 ? tr("moins de 1 %") : `+${Math.round(pct ?? 0)} %`;
          const ecart =
            o.id === base.id
              ? base.total > 0
                ? tr("la moins chère")
                : ""
              : e == null
                ? ""
                : e === 0
                  ? tr("même prix")
                  : `+${eurCents(e) ?? e} (${pctLbl})`;
          const courante = o.id === ici;
          return (
            <li key={o.id} className={courante ? "offres7__ici" : undefined}>
              <button
                type="button"
                className="offres7__source"
                aria-current={courante ? "true" : undefined}
                aria-label={courante ? tr("{source}, offre affichée", { source: o.source }) : tr("Voir l’offre {source}", { source: o.source })}
                onClick={() => {
                  if (!courante) voir(o.id);
                }}
              >
                {o.source}
              </button>
              <b className={o.total > 0 ? undefined : "absent"}>{prixLbl(o)}</b>
              <span className={`offres7__ecart${o.id === base.id ? " offres7__ecart--base" : ""}`}>
                {ecart}
              </span>
              {o.url ? (
                <a
                  href={o.url}
                  target="_blank"
                  rel="noopener"
                  className="offres7__lien"
                  aria-label={tr("Ouvrir l’offre {source} dans un nouvel onglet", { source: o.source })}
                >
                  {tr("Ouvrir")}
                  <Icon name="externe" taille={12} />
                </a>
              ) : (
                <span className="offres7__lien absent">{tr("sans lien")}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
