/**
 * Altitudes : l'IGN contre Skiinfo, station par station.
 *
 * L'IGN donne l'altitude du point GPS de la station (RGE ALTI). Skiinfo publie
 * une bande base–sommet. L'écart entre les deux est la seule raison de venir
 * ici : il est en tête, en résumé, puis en colonne alignée à droite. Les puces
 * sous la barre filtrent par verdict.
 *
 * C'est un écran de contrôle. Il garde la forme d'une page produit : un titre,
 * une phrase, un résumé, un tableau. Pas de cadre.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bouton } from "@/components/base/Bouton";
import { Etat } from "@/components/base/Etat";
import { Etiquette, type EtiquetteTon } from "@/components/base/Etiquette";
import { Liste } from "@/components/base/Liste";
import { Tableau } from "@/components/base/Tableau";
import { Coquille } from "@/components/Coquille";
import { ignSkiinfoAll, ignSkiinfoSummary, type IgnSkiVerdict } from "@/lib/ignSkiinfo";
import { formatAlt } from "@/lib/stations";

export const Route = createFileRoute("/altitudes")({ component: Altitudes });

type Filter = "all" | IgnSkiVerdict;

function delta(n: number | null): string | null {
  if (n == null) return null;
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toLocaleString("fr-FR")} m`;
}

/* La lecture, en deux ou trois mots : la phrase complète de `VERDICT_FR` ne
   tient pas dans une cellule et ne dit rien de plus que la colonne d'écart. */
const LECTURE: Record<IgnSkiVerdict, string> = {
  village: "au village",
  sommet: "au sommet",
  domaine: "dans le domaine",
  sous_base: "sous la base",
  sur_sommet: "au-dessus du sommet",
  manque: "sans donnée",
};

/** Lignes montrées d'abord : les plus grands écarts. Le reste se déplie. */
const PREMIERES = 40;

/* Le ton dit le rôle : un point qui tombe au village ou au sommet publié est
   confirmé ; un point sous la base ou au-dessus du sommet est à regarder. */
const TON: Record<IgnSkiVerdict, EtiquetteTon> = {
  village: "ok",
  sommet: "ok",
  domaine: "neutre",
  sous_base: "alerte",
  sur_sommet: "alerte",
  manque: "neutre",
};

function Altitudes() {
  const rows = useMemo(() => ignSkiinfoAll(), []);
  const sum = useMemo(() => ignSkiinfoSummary(rows), [rows]);
  const [filter, setFilter] = useState<Filter>("all");
  const [tout, setTout] = useState(false);
  const shown = useMemo(() => {
    const list = filter === "all" ? [...rows] : rows.filter((r) => r.verdict === filter);
    list.sort((a, b) => Math.abs(b.dBase ?? 0) - Math.abs(a.dBase ?? 0));
    return list;
  }, [rows, filter]);

  const chips: [Filter, string][] = [
    ["all", `Toutes · ${sum.n}`],
    ["village", `au village · ${sum.village}`],
    ["domaine", `dans le domaine · ${sum.domaine}`],
    ["sous_base", `sous la base · ${sum.sous_base}`],
    ["sommet", `au sommet · ${sum.sommet}`],
    ["sur_sommet", `au-dessus du sommet · ${sum.sur_sommet}`],
    ["manque", `sans donnée · ${sum.manque}`],
  ];

  return (
    <Coquille
      chips={
        <>
          {chips.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`chip${filter === id ? " chip--on" : ""}`}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </>
      }
    >
      <main className="page">
        <header className="page__tete">
          <h1 className="page__titre">Altitudes : IGN et Skiinfo</h1>
          <p className="page__lead">
            L’IGN donne l’altitude du point GPS de chaque station (RGE ALTI). Skiinfo publie une
            bande base–sommet. L’écart entre le point IGN et la base Skiinfo dit si le point est
            posé au front de neige ou en vallée. Deux points restent en commune, pas au front de
            neige : Lans-en-Vercors et Goulier. L’IGN ne publie ni kilomètres ni couleurs de pistes
            : ils ne sont pas comparés.
          </p>
        </header>

        <Liste
          colonnes={4}
          taille="grande"
          absence="non calculée"
          faits={[
            {
              cle: "mediane",
              libelle: "Écart médian, IGN et base Skiinfo",
              valeur:
                sum.medianAbsBase != null ? `${sum.medianAbsBase.toLocaleString("fr-FR")} m` : null,
              precision: "en valeur absolue, sur les stations qui ont les deux altitudes",
            },
            { cle: "n", libelle: "Stations comparées", valeur: sum.n },
            {
              cle: "confirmees",
              libelle: "Point au village ou au sommet publié",
              valeur: sum.village + sum.sommet,
              precision: "à 150 m près",
            },
            {
              cle: "aregarder",
              libelle: "Point hors de la bande publiée",
              valeur: sum.sous_base + sum.sur_sommet,
              precision: `${sum.manque} sans donnée`,
            },
          ]}
        />

        {shown.length === 0 ? (
          <Etat
            sorte="vide"
            titre="Aucune station pour ce verdict"
            cause={`${sum.n} stations comparées, aucune dont le point IGN tombe là.`}
            action={
              <Bouton ton="fantome" onClick={() => setFilter("all")}>
                Toutes les stations
              </Bouton>
            }
          />
        ) : (
          <section className="page__section">
            <Tableau
              legende={
                tout || shown.length <= PREMIERES
                  ? `${shown.length} station${shown.length > 1 ? "s" : ""}, du plus grand écart au plus petit.`
                  : `Les ${PREMIERES} plus grands écarts sur ${shown.length} stations.`
              }
              absence="non relevée"
              colonnes={[
                { cle: "station", entete: "Station" },
                { cle: "skiinfo", entete: "Skiinfo, base et sommet", nombre: true },
                { cle: "ign", entete: "IGN, point GPS", nombre: true },
                { cle: "delta", entete: "Écart à la base", nombre: true },
                { cle: "verdict", entete: "Lecture" },
              ]}
              lignes={(tout ? shown : shown.slice(0, PREMIERES)).map((r) => ({
                cle: r.id,
                cellules: {
                  station: (
                    <span className="tableau__texte">
                      <Link to="/stations/$id" params={{ id: r.id }} className="altitudes__lien">
                        {r.name}
                      </Link>
                      <span className="muted altitudes__massif"> · {r.massif}</span>
                    </span>
                  ),
                  skiinfo:
                    r.skiMin != null && r.skiMax != null
                      ? `${formatAlt(r.skiMin)} – ${formatAlt(r.skiMax)}`
                      : null,
                  ign: r.ignM != null ? formatAlt(r.ignM) : null,
                  delta: r.dBase != null ? <strong>{delta(r.dBase)}</strong> : null,
                  verdict: <Etiquette ton={TON[r.verdict]}>{LECTURE[r.verdict]}</Etiquette>,
                },
              }))}
            />
            {!tout && shown.length > PREMIERES ? (
              <p className="altitudes__reste">
                <Bouton ton="fantome" onClick={() => setTout(true)}>
                  Afficher les {shown.length - PREMIERES} autres stations
                </Bouton>
                <span className="muted">
                  {" "}
                  Leur écart tient sous{" "}
                  {Math.abs(shown[PREMIERES].dBase ?? 0).toLocaleString("fr-FR")} m.
                </span>
              </p>
            ) : null}
          </section>
        )}
      </main>
    </Coquille>
  );
}
