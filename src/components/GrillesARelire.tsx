/**
 * Plus › Forfaits : les grilles que le relevé a mises de côté.
 *
 * Un témoin (Skiinfo, skiresort.fr) les contredit de plus de moitié : le plus
 * souvent un prix enfant, débutant ou une assurance lu pour l'adulte, parfois
 * un témoin en retard d'une saison. On les relit ici, page officielle à côté,
 * et on tranche d'un clic : valider (la grille est servie) ou écarter (le
 * prix précédent reste). Le relevé suivant garde la décision tant que les prix
 * lus ne changent pas.
 */

import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { formatEuroTarif } from "@/lib/forfaits/age";
import { deciderGrilleARelire, listerGrillesARelire } from "@/lib/forfaits/api";
import type { GrilleARelire, Verdict } from "@/lib/forfaits/aRelire";
import type { Periode, Tarif } from "@/lib/forfaits/tarifsPeriode";
import { tr, trN } from "@/lib/i18n";

export function GrillesARelire() {
  const [items, setItems] = useState<GrilleARelire[] | null>(null);
  const [occupe, setOccupe] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    listerGrillesARelire({ data: {} })
      .then(setItems)
      .catch((e: unknown) => setErreur(e instanceof Error ? e.message : String(e)));
  }, []);

  const agir = async (x: GrilleARelire, verdict: Verdict) => {
    setOccupe(x.grille.id);
    setErreur(null);
    try {
      setItems(await deciderGrilleARelire({ data: { id: x.grille.id, verdict } }));
      setMessage(
        verdict === "validee"
          ? tr("{nom} : grille validée, ses prix sont servis.", { nom: x.grille.perimetre.nom })
          : tr("{nom} : grille écartée, le prix précédent reste.", { nom: x.grille.perimetre.nom }),
      );
    } catch (e) {
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      setOccupe(null);
    }
  };

  if (erreur && !items)
    return (
      <p className="forf__erreur" role="status">
        {erreur}
      </p>
    );
  if (!items || (!items.length && !message)) return null;

  return (
    <details className="arel7" open data-testid="grilles-a-relire">
      <summary className="arel7__tete" data-testid="grilles-a-relire-toggle">
        <Icon name="alerte" taille={16} />
        <strong>
          {items.length
            ? trN(
                items.length,
                "{n} grille mise de côté à relire",
                "{n} grilles mises de côté à relire",
              )
            : tr("Toutes les grilles mises de côté sont relues")}
        </strong>
        <span>
          {tr(
            "Un témoin les contredit de plus de moitié : elles ne sont pas servies tant qu'on ne les valide pas.",
          )}
        </span>
      </summary>
      {message ? (
        <p className="forf__bilan" role="status" data-testid="grilles-a-relire-message">
          {message}
        </p>
      ) : null}
      {erreur ? (
        <p className="forf__erreur" role="status">
          {erreur}
        </p>
      ) : null}
      <ul className="arel7__liste">
        {items.map((x) => (
          <ItemARelire
            key={x.grille.id}
            x={x}
            occupe={occupe === x.grille.id}
            bloque={!!occupe}
            agir={agir}
          />
        ))}
      </ul>
    </details>
  );
}

function ItemARelire({
  x,
  occupe,
  bloque,
  agir,
}: {
  x: GrilleARelire;
  occupe: boolean;
  bloque: boolean;
  agir: (x: GrilleARelire, v: Verdict) => void;
}) {
  const g = x.grille;
  const id = g.id.replace(/[^a-z0-9]+/gi, "-");
  return (
    <li className="arel7__item" data-testid={`grille-a-relire-${id}`}>
      <div className="arel7__ligne">
        <div>
          <strong className="arel7__nom">{g.perimetre.nom}</strong>
          <span className="arel7__meta">
            {trN(g.stationIds.length, "{n} station", "{n} stations")} ·{" "}
            {tr("saison {saison}", { saison: g.saison })}
            {g.scrapeLe ? ` · ${tr("lue le {jour}", { jour: g.scrapeLe.slice(0, 10) })}` : ""}
          </span>
        </div>
        {g.source.url ? (
          <a
            className="lien-doux arel7__source"
            href={g.source.url}
            target="_blank"
            rel="noreferrer"
          >
            {tr("Page lue")} <Icon name="externe" taille={12} />
          </a>
        ) : null}
      </div>
      <ul className="arel7__ecarts">
        {ecartsParDuree(x).map((e) => (
          <li key={e.jours}>
            {e.jours === 1 ? tr("Journée adulte") : tr("6 jours adulte")} :{" "}
            <b>{tr("lu {prix}", { prix: fourchette(e.notre) })}</b>
            {" · "}
            {tr("témoins {prix}", { prix: fourchette(e.temoins) })} (
            {e.sites.map((c, i) => (
              <span key={c.site}>
                {i ? ", " : ""}
                <a className="lien-doux" href={c.fiche} target="_blank" rel="noreferrer">
                  {c.site}
                </a>
              </span>
            ))}
            ) <span className="arel7__pct">{e.pct}</span>
          </li>
        ))}
      </ul>
      <details className="arel7__grille">
        <summary>
          {trN(
            g.periodes.length,
            "Voir la grille lue ({n} période)",
            "Voir la grille lue ({n} périodes)",
          )}
        </summary>
        {g.periodes.map((p, i) => (
          <PeriodeLue key={i} p={p} />
        ))}
      </details>
      <div className="arel7__actions">
        <button
          type="button"
          className="btn7"
          disabled={bloque}
          aria-busy={occupe}
          onClick={() => agir(x, "validee")}
          data-testid={`valider-grille-${id}`}
        >
          {tr("Valider la grille")}
        </button>
        <button
          type="button"
          className="btn7 btn7--fantome"
          disabled={bloque}
          onClick={() => agir(x, "ecartee")}
          data-testid={`ecarter-grille-${id}`}
        >
          {tr("Écarter, garder le prix précédent")}
        </button>
      </div>
    </li>
  );
}

function PeriodeLue({ p }: { p: Periode }) {
  const adultes = p.tarifs
    .filter((t) => t.categorie === "adulte" && !t.restriction)
    .sort((a, b) => rang(a) - rang(b));
  const autres = p.tarifs.length - adultes.length;
  return (
    <div className="arel7__periode">
      <span className="arel7__plib">
        {p.libelle} · {p.debut} → {p.fin}
      </span>
      <span>
        {adultes.length
          ? adultes.map((t) => `${t.libelleDuree} ${formatEuroTarif(t.prix)}`).join(" · ")
          : tr("aucun tarif adulte ordinaire")}
        {autres ? ` · ${trN(autres, "+ {n} autre tarif", "+ {n} autres tarifs")}` : ""}
      </span>
    </div>
  );
}

/** Les écarts regroupés par durée : un témoin par station du domaine faisait
 *  huit lignes pour un seul prix lu. */
function ecartsParDuree(x: GrilleARelire) {
  return ([1, 6] as const).flatMap((jours) => {
    const ks = x.confrontations.flatMap((c) =>
      c.comparaisons.filter((k) => k.jours === jours && k.ecart > 0).map((k) => ({ c, k })),
    );
    if (!ks.length) return [];
    const prix = ks.map(({ k }) => k.temoin);
    const signes = ks.map(({ k }) => (k.notre.max < k.temoin ? -1 : 1) * Math.round(k.ecart * 100));
    const [bas, haut] = [Math.min(...signes), Math.max(...signes)];
    const pc = (n: number) => `${n < 0 ? "−" : "+"}${Math.abs(n)} %`;
    return [
      {
        jours,
        notre: ks[0].k.notre,
        temoins: { min: Math.min(...prix), max: Math.max(...prix) },
        sites: [...new Map(ks.map(({ c }) => [c.site, c])).values()],
        pct: bas === haut ? pc(bas) : `${pc(bas)} … ${pc(haut)}`,
      },
    ];
  });
}

const rang = (t: Tarif) =>
  t.duree.type === "jours" ? t.duree.jours : t.duree.type === "partielle" ? 0 : 99;

const fourchette = (n: { min: number; max: number }) =>
  n.min === n.max
    ? formatEuroTarif(n.min)
    : `${formatEuroTarif(n.min)} – ${formatEuroTarif(n.max)}`;
