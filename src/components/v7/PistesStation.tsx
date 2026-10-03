/**
 * La section « Pistes » de la fiche station : le résumé toujours visible, et
 * le détail piste par piste qu'on déplie.
 *
 * Le résumé dit les chiffres de Skiinfo (fiche de la station ou de la vallée)
 * et les remontées d'OpenSkiMap (domaine). Le détail vient d'openskidata
 * (`docs/PISTES-DETAIL.md`) : les pistes de la station d'abord, puis, quand un
 * domaine en relie plusieurs, celles du domaine entier, dans une seconde
 * partie qu'on ouvre à part. Le fichier du domaine n'est chargé qu'à la
 * première ouverture.
 *
 * La section n'écrit ni source ni commentaire : des chiffres, leur étiquette,
 * et le tableau. Les tracés qui ne sont pas des pistes sont écartés dès la
 * construction de la liste (`regrouper`), et les compteurs en tiennent compte.
 */

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { Icon } from "@/components/Icon";
import { PartPistes } from "@/components/v7/PartPistes";
import { OPENSKIMAP, osmFor } from "@/lib/openskimap";
import { COLS, fmt } from "@/lib/parcours";
import { PISTE_HEX, type PisteColor } from "@/lib/pistes";
import {
  COULEUR_LIBELLE,
  ORDRE_COULEUR,
  detailDisponible,
  parts,
  portionStation,
  regrouper,
  secteurDe,
  totauxPistes,
  trier,
  type CleTri,
  type DetailDomaine,
  type IndexStation,
  type PisteDetail,
  type Regroupement,
} from "@/lib/pistesDetail";
import indexBrut from "@/lib/pistesDetail.index.json";
import { SKIINFO, countsFromSkiinfo } from "@/lib/skiinfo";
import { stationById, type Station } from "@/lib/stations";
import { langueIntl } from "@/lib/i18n/langue";

type Index = {
  le: string;
  source: string;
  domaines: Record<string, { nom: string; troncons: number; m: number }>;
  stations: Record<string, IndexStation>;
};

const INDEX = indexBrut as Index;
const AIRE_DE: Record<string, string> = Object.fromEntries(
  Object.entries(INDEX.stations).map(([id, e]) => [id, e.aire]),
);

const FINE = String.fromCharCode(0x2009);
const TIRET = String.fromCharCode(0x2013);
const INSEC = String.fromCharCode(0xa0);

const m = (v: number | null | undefined) => (v != null ? `${fmt(v)}${INSEC}m` : null);
const km = (v: number) => `${v.toLocaleString(langueIntl(), { maximumFractionDigits: 1 })}${INSEC}km`;
const longueur = (v: number | null) => (v == null ? null : v >= 1000 ? km(v / 1000) : m(v));
const pluriel = (n: number, mot: string) => `${fmt(n)} ${mot}${n > 1 ? "s" : ""}`;

const TOKEN: Record<PisteColor, string> = {
  green: "var(--color-piste-verte)",
  blue: "var(--color-piste-bleue)",
  red: "var(--color-piste-rouge)",
  black: "var(--color-piste-noire)",
  other: "var(--color-texte-3)",
};
const LIBELLE_PLURIEL: Record<PisteColor, string> = {
  green: "Vertes",
  blue: "Bleues",
  red: "Rouges",
  black: "Noires",
  other: "Autres",
};

/** Un fichier par domaine de tête, chargé une fois pour la station et pour le domaine. */
const FICHIERS = new Map<string, Promise<DetailDomaine>>();
function charger(fichier: string): Promise<DetailDomaine> {
  let p = FICHIERS.get(fichier);
  if (!p) {
    p = fetch(`/pistes-detail/${fichier}.json`).then((r) => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json() as Promise<DetailDomaine>;
    });
    // Un échec ne reste pas en cache : la prochaine ouverture réessaie.
    p.catch(() => FICHIERS.delete(fichier));
    FICHIERS.set(fichier, p);
  }
  return p;
}

type Etat =
  | { status: "attente" }
  | { status: "chargement" }
  | { status: "pret"; data: DetailDomaine }
  | { status: "erreur"; cause: string };

function useDetail(fichier: string | null, actif: boolean): Etat {
  const [etat, setEtat] = useState<Etat>({ status: "attente" });
  useEffect(() => {
    if (!fichier || !actif) return;
    let vivant = true;
    // Rouvrir ne recharge rien : le fichier est en cache (`charger`).
    setEtat((e) => (e.status === "pret" ? e : { status: "chargement" }));
    charger(fichier).then(
      (data) => vivant && setEtat({ status: "pret", data }),
      (e: unknown) => vivant && setEtat({ status: "erreur", cause: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      vivant = false;
    };
  }, [fichier, actif]);
  return etat;
}

export function PistesStation({ s }: { s: Station }) {
  const si = SKIINFO[s.id];
  const counts = si?.n && s.skiinfoPct ? countsFromSkiinfo(si.n, si.pct) : null;
  const share = s.skiinfoPct ?? s.colorShare;
  const shareSkiinfo = s.skiinfoPct != null;

  const entree = INDEX.stations[s.id] ?? null;
  const osm = osmFor(s.id);
  const verdict = osm?.verdict ?? (OPENSKIMAP[s.id] ? "osm_absent" : null);
  const dispo = entree != null && detailDisponible(verdict);

  const [ouvert, setOuvert] = useState(false);
  const idDetail = useId();
  const etat = useDetail(entree?.fichier ?? null, ouvert);

  const chiffres: { t: string; v: string | null }[] = [
    { t: "Pistes", v: si?.n != null ? fmt(si.n) : null },
    { t: "Kilomètres", v: si?.km != null ? km(si.km) : null },
    {
      t: "Altitudes",
      v: si?.minM != null && si.maxM != null ? `${fmt(si.minM)}${FINE}${TIRET}${FINE}${fmt(si.maxM)}${INSEC}m` : null,
    },
    { t: "Remontées", v: s.lifts != null ? fmt(s.lifts) : null },
    { t: "Piste la plus longue", v: si?.longestKm != null ? km(si.longestKm) : null },
  ];

  return (
    <section className="carte7-sect pistes7">
      <div className="carte7-sect__tete">
        <h2>Pistes</h2>
      </div>

      <dl className="pistes7__resume">
        {chiffres.map((c) => (
          <div key={c.t}>
            <dt>{c.t}</dt>
            <dd>
              <b>{c.v ?? "non publié"}</b>
            </dd>
          </div>
        ))}
      </dl>

      {share ? (
        <>
          <div className="carte7-sect__ligne">
            <span>Par couleur</span>
          </div>
          <PartPistes share={share} hauteur={12} />
          <div className="mix7">
            {COLS.map((c) => {
              // Le nombre de pistes de chaque couleur, quand Skiinfo le publie.
              const n = shareSkiinfo ? counts?.[c.key] : null;
              return (
                <div key={c.key}>
                  <span className="mix7__t">
                    <i style={{ background: c.token }} />
                    {c.label}
                  </span>
                  <b>{share[c.key]} %</b>
                  <span className="mix7__sub">{n != null ? pluriel(n, "piste") : ""}</span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="carte7-sect__texte carte7-sect__texte--petit">Répartition par couleur non publiée.</p>
      )}

      {dispo ? (
        <>
          <button
            type="button"
            className="pistes7__plus"
            aria-expanded={ouvert}
            aria-controls={idDetail}
            onClick={() => setOuvert((o) => !o)}
          >
            {ouvert ? "Moins de détails" : "Plus de détails"}
            <Icon name="chevron-bas" taille={16} />
          </button>
          <div id={idDetail} className="pistes7__detail" hidden={!ouvert}>
            {etat.status === "pret" ? (
              <Detail s={s} entree={entree} data={etat.data} />
            ) : etat.status === "erreur" ? (
              <p className="carte7-sect__texte carte7-sect__texte--petit">
                Le détail des pistes n’a pas pu être chargé ({etat.cause}). Il le sera à la prochaine
                ouverture.
              </p>
            ) : (
              <p className="carte7-sect__texte carte7-sect__texte--petit">Chargement du détail des pistes…</p>
            )}
          </div>
        </>
      ) : (
        <p className="carte7-sect__texte carte7-sect__texte--petit">Détail piste par piste non disponible.</p>
      )}
    </section>
  );
}

/** Le nombre de pistes et leurs kilomètres, en chiffres, sur la liste construite. */
function Compteurs({ r }: { r: Regroupement }) {
  const t = totauxPistes(r);
  return (
    <dl className="pistes7__chiffres">
      <div>
        <dt>Pistes</dt>
        <dd>{fmt(t.pistes)}</dd>
      </div>
      <div>
        <dt>Km</dt>
        <dd>{t.km.toLocaleString(langueIntl(), { maximumFractionDigits: 1 })}</dd>
      </div>
    </dl>
  );
}

function Detail({ s, entree, data }: { s: Station; entree: IndexStation; data: DetailDomaine }) {
  const [domaineOuvert, setDomaineOuvert] = useState(false);
  const idDomaine = useId();

  const portion = useMemo(() => {
    const reperes = entree.voisines
      .map((id) => stationById(id))
      .filter((v): v is Station => v != null)
      .map((v) => ({ id: v.id, lat: v.lat, lon: v.lon }));
    return portionStation(data, s.id, entree, AIRE_DE, reperes);
  }, [data, entree, s.id]);
  const station = useMemo(
    () => regrouper(portion.troncons, (t) => secteurDe(t, data.aires, entree.aire)),
    [portion, data, entree.aire],
  );
  const domaine = useMemo(
    () => regrouper(data.troncons, (t) => secteurDe(t, data.aires, data.domaine)),
    [data],
  );

  const partage = entree.voisines.length > 1;
  const avecDomaine = partage || entree.fichier !== entree.aire;

  return (
    <div className="pistes7__parties">
      <div className="pistes7__partie">
        <div className="carte7-sect__ligne">
          <h3 className="carte7-sect__h3">Pistes de {s.name}</h3>
        </div>
        <Compteurs r={station} />
        <TablePistes r={station} />
      </div>

      {avecDomaine ? (
        <div className="pistes7__partie pistes7__partie--domaine">
          <div className="carte7-sect__ligne">
            <h3 className="carte7-sect__h3">Domaine {data.nom}</h3>
          </div>
          <Compteurs r={domaine} />
          <button
            type="button"
            className="pistes7__plus"
            aria-expanded={domaineOuvert}
            aria-controls={idDomaine}
            onClick={() => setDomaineOuvert((o) => !o)}
          >
            {domaineOuvert ? "Masquer les pistes du domaine" : "Voir les pistes du domaine"}
            <Icon name="chevron-bas" taille={16} />
          </button>
          <div id={idDomaine} className="pistes7__detail" hidden={!domaineOuvert}>
            <TablePistes r={domaine} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

const COLONNES_TRI: { cle: CleTri; t: string }[] = [
  { cle: "nom", t: "Nom" },
  { cle: "couleur", t: "Couleur" },
  { cle: "longueur", t: "Longueur" },
  { cle: "denivelle", t: "Dénivelé" },
];

function TablePistes({ r }: { r: Regroupement }) {
  const { pistes, sansNom } = r;
  const [tri, setTri] = useState<{ cle: CleTri; sens: "asc" | "desc" }>({ cle: "nom", sens: "asc" });
  const [filtre, setFiltre] = useState<PisteColor[]>([]);
  const p = useMemo(() => parts(pistes), [pistes]);
  const garder = useCallback((x: PisteDetail) => filtre.length === 0 || filtre.includes(x.couleur), [filtre]);
  const visibles = useMemo(() => trier(pistes.filter(garder), tri.cle, tri.sens), [pistes, garder, tri]);
  // Sans nom, le tri par nom n'a pas de sens : ils vont du plus long au plus court.
  const sansNomVisibles = useMemo(
    () =>
      trier(sansNom.filter(garder), tri.cle === "nom" ? "longueur" : tri.cle, tri.cle === "nom" ? "desc" : tri.sens),
    [sansNom, garder, tri],
  );

  const trierPar = (cle: CleTri) =>
    setTri((t) => (t.cle === cle ? { cle, sens: t.sens === "asc" ? "desc" : "asc" } : { cle, sens: cle === "nom" || cle === "couleur" ? "asc" : "desc" }));
  const basculer = (c: PisteColor) => setFiltre((f) => (f.includes(c) ? f.filter((x) => x !== c) : [...f, c]));

  if (pistes.length === 0 && sansNom.length === 0)
    return <p className="carte7-sect__texte carte7-sect__texte--petit">Aucune piste de descente relevée ici.</p>;

  return (
    <div className="pistes7__table-bloc">
      <div className="pistes7__filtres" role="group" aria-label="Filtrer par couleur">
        <button
          type="button"
          className={`puce puce--case${filtre.length === 0 ? " puce--on" : ""}`}
          aria-pressed={filtre.length === 0}
          onClick={() => setFiltre([])}
        >
          Toutes
          <span className="puce__n">{fmt(pistes.length)}</span>
        </button>
        {ORDRE_COULEUR.filter((c) => p[c].n > 0).map((c) => (
          <button
            key={c}
            type="button"
            className={`puce puce--case${filtre.includes(c) ? " puce--on" : ""}`}
            aria-pressed={filtre.includes(c)}
            onClick={() => basculer(c)}
          >
            <span className="mix7__t">
              <i style={{ background: TOKEN[c] }} />
              {LIBELLE_PLURIEL[c]}
            </span>
            <span className="puce__n">
              {fmt(p[c].n)} · {p[c].pct} %
            </span>
          </button>
        ))}
      </div>
      <Tableau lignes={visibles} tri={tri} trierPar={trierPar} legende="Pistes nommées" />
      {sansNomVisibles.length ? (
        <>
          <h4 className="pistes7__h4">Pistes sans nom ({fmt(sansNomVisibles.length)})</h4>
          <Tableau lignes={sansNomVisibles} tri={tri} trierPar={trierPar} legende="Pistes sans nom" />
        </>
      ) : null}
    </div>
  );
}

function Tableau({
  lignes,
  tri,
  trierPar,
  legende,
}: {
  lignes: PisteDetail[];
  tri: { cle: CleTri; sens: "asc" | "desc" };
  trierPar: (c: CleTri) => void;
  legende: string;
}) {
  if (lignes.length === 0)
    return <p className="carte7-sect__texte carte7-sect__texte--petit">Aucune piste de cette couleur.</p>;
  return (
    <div
      className={`pistes7__table${lignes.length > 20 ? " pistes7__table--long" : ""}`}
      role="region"
      aria-label={legende}
      tabIndex={lignes.length > 20 ? 0 : undefined}
    >
      <table>
        <caption className="sr-only">{legende}</caption>
        <thead>
          <tr>
            {COLONNES_TRI.map((c) => (
              <th
                key={c.cle}
                scope="col"
                aria-sort={tri.cle === c.cle ? (tri.sens === "asc" ? "ascending" : "descending") : "none"}
              >
                <button type="button" onClick={() => trierPar(c.cle)}>
                  {c.t}
                  {tri.cle === c.cle ? (
                    <Icon
                      name="chevron-bas"
                      taille={12}
                      className={tri.sens === "asc" ? "pistes7__sens pistes7__sens--asc" : "pistes7__sens"}
                    />
                  ) : null}
                </button>
              </th>
            ))}
            <th scope="col">Départ</th>
            <th scope="col">Arrivée</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((x) => (
            <tr key={x.cle}>
              <th scope="row" data-label="Nom">
                {x.nom ?? "Sans nom"}
              </th>
              <td data-label="Couleur">
                <span className="pistes7__couleur">
                  <i data-couleur={x.couleur} style={{ background: PISTE_HEX[x.couleur] }} />
                  {COULEUR_LIBELLE[x.couleur]}
                </span>
              </td>
              <td data-label="Longueur">{longueur(x.longueurM) ?? "non mesurée"}</td>
              <td data-label="Dénivelé">{m(x.denivelleM) ?? "non relevé"}</td>
              <td data-label="Départ">{m(x.departM) ?? "non relevé"}</td>
              <td data-label="Arrivée">{m(x.arriveeM) ?? "non relevé"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
