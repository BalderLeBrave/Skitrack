/**
 * Favoris : les dossiers de logements enregistrés, comme les listes d'Airbnb
 * (Skitrack App.dc.html:604-614). Chaque dossier montre une mosaïque carrée de
 * ses trois dernières photos, son nom, son compte et sa date ; il s'ouvre sur
 * sa liste et sa carte (`favoris.$id.tsx`).
 *
 * Les dossiers vivent dans le navigateur (`lib/favoris`) : la page attend
 * d'être montée pour les lire, comme Prix.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Coquille } from "@/components/Coquille";
import { Couverture, VideFavoris } from "@/components/favoris/communs";
import { contenu, couverture, dossiersRecents, type Dossier, type EtatFavoris } from "@/lib/favoris/modele";
import { useFavoris } from "@/lib/favoris/store";
import { nomStationPropre } from "@/lib/rattachement";
import { langueIntl } from "@/lib/i18n/langue";
import { tr, trN } from "@/lib/i18n";

export const Route = createFileRoute("/favoris/")({ component: Favoris });

function Favoris() {
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  return (
    <Coquille>
      <main className="fv-main" id="s-favoris" data-screen-label="Favoris">
        <h1 className="fv-h1">{tr("Favoris")}</h1>
        {monte ? <Dossiers /> : null}
      </main>
    </Coquille>
  );
}

function Dossiers() {
  const etat = useFavoris();
  const dossiers = dossiersRecents(etat);
  if (dossiers.length === 0) return <VideFavoris titre={tr("Aucun logement enregistré")} />;
  return (
    <ul className="fv-dossiers">
      {dossiers.map((d) => (
        <li key={d.id}>
          <CarteDossier d={d} etat={etat} />
        </li>
      ))}
    </ul>
  );
}

const jour = (d: Date) => new Intl.DateTimeFormat(langueIntl(), { day: "numeric", month: "short" }).format(d);

/** « Courchevel, La Plagne » : les stations du dossier, dans l'ordre des derniers ajouts. */
function stationsDe(etat: EtatFavoris, id: string): string {
  const noms = [...new Set(contenu(etat, id).map((f) => nomStationPropre(f.annonce)).filter((n): n is string => n != null))];
  return noms.length > 2
    ? trN(noms.length - 2, "{noms} et {n} autre", "{noms} et {n} autres", { noms: noms.slice(0, 2).join(", ") })
    : noms.join(", ");
}

function CarteDossier({ d, etat }: { d: Dossier; etat: EtatFavoris }) {
  const n = contenu(etat, d.id).length;
  const stations = stationsDe(etat, d.id);
  return (
    <Link to="/favoris/$id" params={{ id: d.id }} className="fv-dossier" title={stations || undefined}>
      <Couverture photos={couverture(etat, d.id)} />
      <span className="fv-dossier__texte">
        <b>{d.nom}</b>
        <span>
          {n === 0 ? tr("Vide") : trN(n, "{n} logement", "{n} logements")} ·{" "}
          {tr("Modifié le {date}", { date: jour(new Date(d.majLe)) })}
        </span>
      </span>
    </Link>
  );
}
