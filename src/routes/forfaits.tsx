/**
 * Forfaits : les tarifs des domaines, un tableau par massif.
 *
 * La page était un mur de 11 000 px, une ligne par domaine, les prix non
 * alignés. Elle se lit maintenant par massif, chaque massif en tableau avec
 * les montants à droite en chiffres tabulaires, et un résumé en tête qui dit
 * combien de tarifs ont réellement été relevés. Les puces sous la barre
 * réduisent la page à un massif.
 *
 * Un tarif absent est dit absent. Un tarif estimé porte « ≈ » et ne compte
 * pas dans le coût d'un séjour.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Bouton } from "@/components/base/Bouton";
import { Champ } from "@/components/base/Champ";
import { Etat } from "@/components/base/Etat";
import { Liste } from "@/components/base/Liste";
import { Tableau } from "@/components/base/Tableau";
import { Coquille } from "@/components/Coquille";
import { formatForfaitAge, forfaitConfirmLabel } from "@/lib/forfaits/age";
import { listForfaitDomains, listForfaits, refreshForfaits } from "@/lib/forfaits/api";
import type { DomainForfait, ForfaitRow } from "@/lib/forfaits/types";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/forfaits")({ component: ForfaitsPage });

const TOUS = "tous";

function euros(n: number | null | undefined): string | null {
  return n == null ? null : `${n.toLocaleString("fr-FR")} €`;
}

function ForfaitsPage() {
  const t = useT();
  const [domains, setDomains] = useState<DomainForfait[] | null>(null);
  const [rows, setRows] = useState<Record<string, ForfaitRow>>({});
  const [erreur, setErreur] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [massif, setMassif] = useState<string>(TOUS);
  const [busy, setBusy] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);

  useEffect(() => {
    let annule = false;
    void Promise.all([listForfaitDomains({ data: {} }), listForfaits({ data: {} })])
      .then(([list, stored]) => {
        if (annule) return;
        setDomains(list);
        const map: Record<string, ForfaitRow> = {};
        for (const r of stored.items) map[r.slug] = r;
        setRows(map);
        setLastSync(stored.lastSyncAt);
      })
      .catch((err: unknown) => {
        if (annule) return;
        setErreur(err instanceof Error ? err.message : String(err));
        setDomains([]);
      });
    return () => {
      annule = true;
    };
  }, []);

  /** Les massifs, du plus fourni au moins fourni, avec leur nombre de domaines. */
  const massifs = useMemo(() => {
    const n = new Map<string, number>();
    for (const d of domains ?? []) n.set(d.massif, (n.get(d.massif) ?? 0) + 1);
    return [...n.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "fr"));
  }, [domains]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (domains ?? [])
      .filter((d) => massif === TOUS || d.massif === massif)
      .filter(
        (d) =>
          !needle ||
          d.name.toLowerCase().includes(needle) ||
          d.massif.toLowerCase().includes(needle) ||
          (d.pass ?? "").toLowerCase().includes(needle),
      );
  }, [domains, q, massif]);

  const groupes = useMemo(
    () =>
      massifs
        .map(([m]) => ({
          massif: m,
          domaines: visible
            .filter((d) => d.massif === m)
            .sort((a, b) => a.name.localeCompare(b.name, "fr")),
        }))
        .filter((g) => g.domaines.length > 0),
    [massifs, visible],
  );

  const releves = useMemo(
    () =>
      (domains ?? []).filter((d) => {
        const r = rows[d.slug];
        return r ? r.j1 != null || r.j6 != null : d.seed?.j1 != null || d.seed?.j6 != null;
      }).length,
    [domains, rows],
  );

  async function refreshVisible() {
    setBusy(true);
    try {
      const slugs = visible.slice(0, 16).map((d) => d.slug);
      const next = await refreshForfaits({ data: { slugs, force: true } });
      setRows((cur) => {
        const copy = { ...cur };
        for (const r of next) copy[r.slug] = r;
        return copy;
      });
      setLastSync(new Date().toISOString());
      setErreur(null);
    } catch (err) {
      setErreur(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Coquille
      chips={
        domains && domains.length ? (
          <>
            <button
              type="button"
              className={`chip${massif === TOUS ? " chip--on" : ""}`}
              onClick={() => setMassif(TOUS)}
            >
              Tous les massifs · {domains.length}
            </button>
            {massifs.map(([m, n]) => (
              <button
                key={m}
                type="button"
                className={`chip${massif === m ? " chip--on" : ""}`}
                onClick={() => setMassif(m)}
              >
                {m} · {n}
              </button>
            ))}
          </>
        ) : undefined
      }
    >
      <main className="page">
        <header className="page__tete">
          <h1 className="page__titre">{t("pass.title")}</h1>
          <p className="page__lead">
            Tarifs des domaines français, relevés sur les pages officielles. Un tarif estimé porte «
            ≈ » et n’entre pas dans le coût d’un séjour. Rien n’est inventé.
          </p>
        </header>

        <div className="page__outils">
          <Champ
            label="Rechercher un domaine"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nom, massif ou forfait lié"
          />
          <Bouton
            ton="fantome"
            onClick={() => void refreshVisible()}
            disabled={busy || !visible.length}
          >
            {busy ? "Actualisation en cours" : t("pass.refresh")}
          </Bouton>
        </div>

        {domains ? (
          <Liste
            colonnes={3}
            absence="jamais"
            faits={[
              { cle: "domaines", libelle: "Domaines de forfait", valeur: domains.length },
              {
                cle: "releves",
                libelle: "Tarifs relevés",
                valeur: `${releves} sur ${domains.length}`,
                precision: "un tarif relevé porte sa date ; les autres disent « non relevé »",
              },
              {
                cle: "synchro",
                libelle: "Dernière synchronisation",
                valeur: lastSync ? new Date(lastSync).toLocaleString("fr-FR") : null,
              },
            ]}
          />
        ) : null}

        {erreur ? (
          <Etat
            sorte="erreur"
            compact
            titre="Les tarifs n’ont pas pu être lus"
            cause={`${erreur}. Les montants affichés sont ceux du dernier relevé enregistré.`}
          />
        ) : null}

        {domains == null ? (
          <Etat
            sorte="chargement"
            titre="Lecture des tarifs enregistrés"
            cause="Le catalogue des domaines et leurs derniers relevés sont lus dans le dépôt."
            lignes={9}
          />
        ) : visible.length === 0 ? (
          <Etat
            sorte="vide"
            titre={
              q.trim()
                ? `Aucun domaine ne répond à « ${q.trim()} »`
                : "Aucun domaine dans ce massif"
            }
            cause="La recherche porte sur le nom du domaine, son massif et le forfait lié qu’il partage."
            action={
              <Bouton
                ton="fantome"
                onClick={() => {
                  setQ("");
                  setMassif(TOUS);
                }}
              >
                Tout afficher
              </Bouton>
            }
          />
        ) : (
          /* Un repli par massif, le premier ouvert, les autres fermés avec
             leur nombre : la page se lit massif par massif au lieu de faire
             un mur de 173 lignes. */
          groupes.map((g, i) => (
            <details className="repli page__repli" key={g.massif} open={i === 0}>
              <summary className="repli__tete page__section-titre">
                {g.massif}{" "}
                <small>
                  · {g.domaines.length} domaine{g.domaines.length > 1 ? "s" : ""}
                </small>
              </summary>
              <Tableau
                className="forfaits__t"
                absence="non relevé"
                colonnes={[
                  { cle: "domaine", entete: "Domaine" },
                  { cle: "j1", entete: t("pass.day"), nombre: true },
                  { cle: "j6", entete: t("pass.six"), nombre: true },
                  { cle: "enf6", entete: t("pass.child6"), nombre: true },
                  { cle: "releve", entete: "Relevé" },
                ]}
                lignes={g.domaines.map((d) => {
                  const row = rows[d.slug];
                  const estime = row?.status === "estimé";
                  const prefixe = estime ? "≈ " : "";
                  const j1 = euros(row?.j1 ?? d.seed?.j1);
                  const j6 = euros(row?.j6 ?? d.seed?.j6);
                  const enf6 = euros(row?.enf6 ?? d.seed?.enf6);
                  const confirm = row ? forfaitConfirmLabel(row) : null;
                  const releve = row
                    ? `${formatForfaitAge(row)}${confirm ? ` · ${confirm}` : ""}`
                    : d.seed?.majLabel
                      ? `relevé ${d.seed.majLabel}`
                      : null;
                  return {
                    cle: d.slug,
                    cellules: {
                      domaine: (
                        <span className="tableau__texte">
                          <strong>{d.name}</strong>
                          {d.pass ? (
                            <span className="muted forfaits__pass"> · {d.pass}</span>
                          ) : null}
                        </span>
                      ),
                      j1: j1 ? prefixe + j1 : null,
                      j6: j6 ? prefixe + j6 : null,
                      enf6: enf6 ? prefixe + enf6 : null,
                      releve: releve ? (
                        <span className="muted forfaits__releve">{releve}</span>
                      ) : null,
                    },
                  };
                })}
              />
            </details>
          ))
        )}
      </main>
    </Coquille>
  );
}
