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
import { IconeFiche } from "@/components/v7/IconesFiche";
import { PartPistes } from "@/components/v7/PartPistes";
import { OPENSKIMAP, osmFor } from "@/lib/openskimap";
import { COLS, fmt } from "@/lib/parcours";
import type { PisteColor } from "@/lib/pistes";
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
import { aTraduire, tr, trC, trN } from "@/lib/i18n";

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

const TOKEN: Record<PisteColor, string> = {
  green: "var(--color-piste-verte)",
  blue: "var(--color-piste-bleue)",
  red: "var(--color-piste-rouge)",
  black: "var(--color-piste-noire)",
  other: "var(--color-texte-3)",
};
const LIBELLE_PLURIEL: Record<PisteColor, string> = {
  green: aTraduire("Vertes"),
  blue: aTraduire("Bleues"),
  red: aTraduire("Rouges"),
  black: aTraduire("Noires"),
  other: aTraduire("Autres"),
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

  // Dans un domaine relié, les pistes de Skiinfo sont celles de la station et
  // les remontées celles du domaine : l'étiquette dit l'échelle, comme le
  // bandeau de la fiche (« 771 km de pistes, domaine »).
  const relie = s.domain != null && s.pistesKm != null && si?.km != null && si.km !== s.pistesKm;
  const chiffres: { t: string; v: string | null }[] = [
    { t: relie ? tr("Pistes, station") : tr("Pistes"), v: si?.n != null ? fmt(si.n) : null },
    { t: relie ? tr("Kilomètres, station") : tr("Kilomètres"), v: si?.km != null ? km(si.km) : null },
    {
      t: tr("Altitudes"),
      v: si?.minM != null && si.maxM != null ? `${fmt(si.minM)}${FINE}${TIRET}${FINE}${fmt(si.maxM)}${INSEC}m` : null,
    },
    { t: relie ? tr("Remontées, domaine") : tr("Remontées"), v: s.lifts != null ? fmt(s.lifts) : null },
    { t: tr("Piste la plus longue"), v: si?.longestKm != null ? km(si.longestKm) : null },
  ];

  return (
    <section className="fs-carte fs-pistes">
      <h2>{tr("Pistes")}</h2>

      <dl className="fs-pistes__resume">
        {chiffres.map((c) => (
          <div key={c.t}>
            <dt>{c.t}</dt>
            <dd className={c.v == null ? "fs-absent" : undefined}>{c.v ?? tr("non publié")}</dd>
          </div>
        ))}
      </dl>

      {share ? (
        <>
          <span className="fs-pistes__sur">{tr("Par couleur")}</span>
          <PartPistes share={share} hauteur={12} className="fs-pistes__barre" />
          <div className="fs-pistes__mix">
            {COLS.map((c) => {
              // Le nombre de pistes de chaque couleur, quand Skiinfo le publie.
              const n = shareSkiinfo ? counts?.[c.key] : null;
              return (
                <div key={c.key}>
                  <span className="fs-pistes__coul">
                    <i style={{ background: c.token }} />
                    {tr(c.label)}
                  </span>
                  <b>{share[c.key]} %</b>
                  <span className="fs-pistes__n">{n != null ? trN(n, "{n} piste", "{n} pistes", { n: fmt(n) }) : ""}</span>
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <p className="fs-muet">{tr("Répartition par couleur non publiée.")}</p>
      )}

      {dispo ? (
        <>
          <button
            type="button"
            className="fs-plus"
            aria-expanded={ouvert}
            aria-controls={idDetail}
            onClick={() => setOuvert((o) => !o)}
          >
            {ouvert ? tr("Moins de détails") : tr("Plus de détails")}
            <IconeFiche nom="chevron-bas" taille={14} />
          </button>
          <div id={idDetail} className="fs-pistes__detail" hidden={!ouvert}>
            {etat.status === "pret" ? (
              <Detail s={s} entree={entree} data={etat.data} />
            ) : etat.status === "erreur" ? (
              <p className="fs-muet">
                {tr("Le détail des pistes n’a pas pu être chargé ({cause}). Il le sera à la prochaine ouverture.", {
                  cause: etat.cause,
                })}
              </p>
            ) : (
              <p className="fs-muet">{tr("Chargement du détail des pistes…")}</p>
            )}
          </div>
        </>
      ) : (
        <p className="fs-muet">{tr("Détail piste par piste non disponible.")}</p>
      )}
    </section>
  );
}

/** Le nombre de pistes et leurs kilomètres, en chiffres, sur la liste construite. */
function Compteurs({ r }: { r: Regroupement }) {
  const t = totauxPistes(r);
  return (
    <dl className="fs-pistes__chiffres">
      <div>
        <dt>{tr("Pistes")}</dt>
        <dd>{fmt(t.pistes)}</dd>
      </div>
      <div>
        <dt>{tr("Km")}</dt>
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
    <div className="fs-pistes__parties">
      <div className="fs-pistes__partie">
        <h3>{tr("Pistes de {station}", { station: s.name })}</h3>
        <Compteurs r={station} />
        <TablePistes r={station} />
      </div>

      {avecDomaine ? (
        <div className="fs-pistes__partie fs-pistes__partie--domaine">
          <h3>{tr("Domaine {domaine}", { domaine: data.nom })}</h3>
          <Compteurs r={domaine} />
          <button
            type="button"
            className="fs-plus fs-plus--simple"
            aria-expanded={domaineOuvert}
            aria-controls={idDomaine}
            onClick={() => setDomaineOuvert((o) => !o)}
          >
            {domaineOuvert ? tr("Masquer les pistes du domaine") : tr("Voir les pistes du domaine")}
          </button>
          <div id={idDomaine} hidden={!domaineOuvert}>
            <TablePistes r={domaine} />
          </div>
        </div>
      ) : null}
    </div>
  );
}

const COLONNES_TRI: { cle: CleTri; t: string }[] = [
  { cle: "nom", t: aTraduire("Nom") },
  { cle: "couleur", t: aTraduire("Couleur") },
  { cle: "longueur", t: aTraduire("Longueur") },
  { cle: "denivelle", t: aTraduire("Dénivelé") },
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
    return <p className="fs-muet">{tr("Aucune piste de descente relevée ici.")}</p>;

  return (
    <div className="fs-pistes__bloc">
      <div className="fs-pistes__filtres" role="group" aria-label={tr("Filtrer par couleur")}>
        <button
          type="button"
          className={`fs-puce${filtre.length === 0 ? " fs-puce--on" : ""}`}
          aria-pressed={filtre.length === 0}
          onClick={() => setFiltre([])}
        >
          {tr("Toutes")}
          <span className="fs-puce__n">{fmt(pistes.length)}</span>
        </button>
        {ORDRE_COULEUR.filter((c) => p[c].n > 0).map((c) => (
          <button
            key={c}
            type="button"
            className={`fs-puce${filtre.includes(c) ? " fs-puce--on" : ""}`}
            aria-pressed={filtre.includes(c)}
            onClick={() => basculer(c)}
          >
            <i className="fs-pastille" style={{ background: TOKEN[c] }} />
            {tr(LIBELLE_PLURIEL[c])}
            <span className="fs-puce__n">
              {fmt(p[c].n)} · {p[c].pct} %
            </span>
          </button>
        ))}
      </div>
      <Tableau lignes={visibles} tri={tri} trierPar={trierPar} legende={tr("Pistes nommées")} />
      {sansNomVisibles.length ? (
        <>
          <h4 className="fs-pistes__h4">{tr("Pistes sans nom ({n})", { n: fmt(sansNomVisibles.length) })}</h4>
          <Tableau lignes={sansNomVisibles} tri={tri} trierPar={trierPar} legende={tr("Pistes sans nom")} />
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
    return <p className="fs-muet">{tr("Aucune piste de cette couleur.")}</p>;
  return (
    <div
      className="fs-table"
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
                  {tr(c.t)}
                  {tri.cle === c.cle ? (
                    <IconeFiche nom={tri.sens === "asc" ? "tri-haut" : "tri-bas"} taille={10} />
                  ) : null}
                </button>
              </th>
            ))}
            <th scope="col">{trC("piste", "Départ")}</th>
            <th scope="col">{trC("piste", "Arrivée")}</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map((x) => (
            <tr key={x.cle}>
              <th scope="row" data-label={tr("Nom")}>
                {x.nom ?? tr("Sans nom")}
              </th>
              <td data-label={tr("Couleur")}>
                <span className="fs-table__couleur">
                  <i className="fs-pastille" data-couleur={x.couleur} style={{ background: TOKEN[x.couleur] }} />
                  {tr(COULEUR_LIBELLE[x.couleur])}
                </span>
              </td>
              <td data-label={tr("Longueur")}>{longueur(x.longueurM) ?? tr("non mesurée")}</td>
              <td data-label={tr("Dénivelé")}>{m(x.denivelleM) ?? tr("non relevé")}</td>
              <td data-label={trC("piste", "Départ")}>{m(x.departM) ?? tr("non relevé")}</td>
              <td data-label={trC("piste", "Arrivée")}>{m(x.arriveeM) ?? tr("non relevé")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
