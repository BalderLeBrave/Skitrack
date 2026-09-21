/**
 * Le monde : 5 720 domaines, 73 pays, en trois niveaux.
 *
 * ## Pourquoi trois niveaux et non un filtre de plus
 *
 * `/carte` range 320 stations françaises et pose ses massifs en une rangée de
 * jetons, parce que dix massifs tiennent sur une ligne. Soixante-treize pays
 * n'y tiennent pas, et les aplatir en une liste unique de 5 720 domaines
 * demanderait de charger le monde entier pour en montrer vingt.
 *
 * D'où le parcours **continent → pays → domaines**, qui suit exactement la
 * forme du référentiel : `index.json` — six kilo-octets — sait compter les
 * domaines de chaque pays sans ouvrir aucun fichier de pays, et
 * `domainesPays()` n'ouvre que celui qu'on regarde. Les deux premiers niveaux
 * ne coûtent donc aucun chargement.
 *
 * ## Ce que l'écran ne fait pas
 *
 * Il ne comble rien. Un domaine sans kilomètres relevés écrit « non relevé »,
 * un domaine sans répartition le dit, et les seuils écartent le non mesuré au
 * lieu de le compter à zéro — c'est `atLeast`, la même règle que pour la
 * France. Les deux pays du référentiel qu'aucun continent n'accueille sont
 * nommés en pied d'écran plutôt que rangés d'office quelque part.
 *
 * Il ne mélange pas non plus la France du classeur et la France d'OpenSkiMap :
 * `STATIONS` n'apparaît pas ici. Les 320 stations françaises ont leurs écrans,
 * celui-ci sert le référentiel mondial, et un renvoi les relie.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Coquille } from "@/components/Coquille";
import { COLOR_HEX } from "@/lib/carte";
import { CONTINENTS, type ContinentId } from "@/lib/geo/continents";
import { paysByCode, paysDuContinent, type Pays } from "@/lib/geo/pays";
import { entier } from "@/lib/nombres";
import {
  mentionRattachement,
  mentionSource,
  releveRattachements,
  repartitionsDesDomaines,
  type Rattachement,
  type Repartition,
} from "@/lib/monde/couleurs";
import {
  AUCUN_FILTRE,
  chercher,
  denivele,
  filtresActifs,
  passeFiltres,
  SEUILS_MONDE,
  TRIS_MONDE,
  trier,
  type FiltresMonde,
  type TriMonde,
} from "@/lib/monde/filtres";
import {
  DOMAINES_MONDE,
  domainesPays,
  indexPays,
  PAYS_AVEC_DOMAINES,
  RELEVE_MONDE,
  SANS_PAYS,
  SEUIL_MONDE,
  type DomaineMonde,
} from "@/lib/monde/monde";
import { altitude, mesureDans, type Systeme } from "@/lib/unites";

export const Route = createFileRoute("/monde")({ component: PageMonde });

/** Les pays du référentiel qu'aucun continent n'accueille, avec leurs domaines.
 *  Calculé une fois : ni `PAYS` ni l'index ne bougent au cours d'une session. */
const HORS_ONGLETS = PAYS_AVEC_DOMAINES.filter((cc) => !paysByCode(cc)).map((cc) => ({
  code: cc,
  domaines: indexPays(cc)?.domaines ?? 0,
}));

/** Ce qu'un continent porte, sans ouvrir un seul fichier de pays. */
type ResumeContinent = {
  id: ContinentId;
  nom: string;
  pays: Pays[];
  domaines: number;
};

const RESUMES: ResumeContinent[] = CONTINENTS.map((c) => {
  const pays = paysDuContinent(c.id).filter((p) => indexPays(p.code));
  return {
    id: c.id,
    nom: c.nomFr,
    pays,
    domaines: pays.reduce((n, p) => n + (indexPays(p.code)?.domaines ?? 0), 0),
  };
}).filter((r) => r.pays.length > 0);

/** Les domaines rangés sous un continent, tous pays confondus. Sert le total
 *  affiché en tête, qui doit se retrouver en additionnant les onglets. */
const TOTAL_ONGLETS = RESUMES.reduce((n, r) => n + r.domaines, 0);

function BarreCouleurs({ r }: { r: Repartition }) {
  const parts: [string, number][] = [
    [COLOR_HEX.green, r.pct.vert],
    [COLOR_HEX.blue, r.pct.bleu],
    [COLOR_HEX.red, r.pct.rouge],
    [COLOR_HEX.black, r.pct.noir],
  ];
  return (
    <span className="monde-bar" aria-hidden>
      {parts.map(([hex, pct], i) => (
        <i key={i} style={{ width: `${pct}%`, background: hex }} />
      ))}
    </span>
  );
}

/**
 * La ligne d'un domaine.
 *
 * `partage === "estime"` s'écrit à l'écran, et non seulement dans une
 * infobulle : une valeur estimée qui ne se dit pas estimée est pire qu'une
 * absence, puisque l'absence, elle, se voit.
 */
function LigneDomaine({
  d,
  r,
  rattachement,
  systeme,
}: {
  d: DomaineMonde;
  r: Repartition | undefined;
  rattachement: Rattachement | undefined;
  systeme: Systeme;
}) {
  const dn = denivele(d);
  const lieu = [d.region, d.localite].filter(Boolean).join(" · ");
  const titre = [mentionSource(r ?? null), mentionRattachement(rattachement)]
    .filter(Boolean)
    .join(" — ");
  return (
    <li className="monde-row">
      <div className="monde-row__tete">
        <span className="monde-row__nom">{d.nom || "Domaine sans nom"}</span>
        {d.pays.length > 1 ? (
          <span className="monde-row__frontiere" title="Domaine à cheval sur une frontière">
            {d.pays.join(" / ")}
          </span>
        ) : null}
      </div>
      {lieu ? <p className="monde-row__lieu">{lieu}</p> : null}
      <dl className="monde-row__mesures">
        <div>
          <dt>Pistes</dt>
          <dd>{d.km != null ? mesureDans({ valeur: d.km, unite: "km" }, systeme) : "non relevé"}</dd>
        </div>
        <div>
          <dt>Sommet</dt>
          <dd>{d.maxM != null ? altitude(d.maxM, systeme) : "non relevé"}</dd>
        </div>
        <div>
          <dt>Dénivelé</dt>
          <dd>{dn != null ? altitude(dn, systeme) : "non relevé"}</dd>
        </div>
        <div>
          <dt>Remontées</dt>
          <dd>{d.lifts != null ? entier(d.lifts) : "non relevé"}</dd>
        </div>
      </dl>
      {r ? (
        <div className="monde-row__couleurs" title={titre}>
          <BarreCouleurs r={r} />
          <span className="monde-row__pct">
            {r.pct.vert} · {r.pct.bleu} · {r.pct.rouge} · {r.pct.noir} %
          </span>
          {r.partage === "estime" ? (
            <span className="monde-row__estime">vert et bleu estimés</span>
          ) : null}
        </div>
      ) : (
        <p className="monde-row__absence">Répartition par couleur non relevée</p>
      )}
    </li>
  );
}

/** Le curseur d'un seuil, avec sa valeur en clair. */
function Curseur({
  label,
  valeur,
  max,
  step,
  unite,
  onChange,
}: {
  label: string;
  valeur: number;
  max: number;
  step: number;
  unite: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="monde-curseur">
      <span className="monde-curseur__label">
        {label}
        <b>{valeur ? `≥ ${entier(valeur)}${unite ? ` ${unite}` : ""}` : "tous"}</b>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={step}
        value={valeur}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function PageMonde() {
  const [continent, setContinent] = useState<ContinentId | null>(null);
  const [pays, setPays] = useState<string | null>(null);
  const [systeme, setSysteme] = useState<Systeme>("metrique");

  const [domaines, setDomaines] = useState<DomaineMonde[] | null>(null);
  const [repartitions, setRepartitions] = useState<ReadonlyMap<string, Repartition>>(new Map());
  const [rattachements, setRattachements] = useState<Record<string, Rattachement>>({});
  const [chargement, setChargement] = useState(false);
  const [panne, setPanne] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [tri, setTri] = useState<TriMonde>("km");
  const [filtres, setFiltres] = useState<FiltresMonde>(AUCUN_FILTRE);
  const [ouvert, setOuvert] = useState(false);

  // Le pays est ouvert quand on le choisit, et une seule fois : `domainesPays`
  // garde ses promesses en cache, mais l'écran ne doit pas non plus redemander
  // à chaque frappe dans la recherche.
  useEffect(() => {
    if (!pays) {
      setDomaines(null);
      return;
    }
    let vivant = true;
    setChargement(true);
    setPanne(null);
    Promise.all([domainesPays(pays), releveRattachements()])
      .then(async ([lot, releve]) => {
        const parts = await repartitionsDesDomaines(lot);
        if (!vivant) return;
        setDomaines(lot);
        setRepartitions(parts);
        setRattachements(releve.rattachements);
      })
      .catch((e: unknown) => {
        if (!vivant) return;
        // Une panne de chargement n'est pas un pays vide : l'écran dit laquelle
        // des deux il a rencontrée, au lieu d'afficher « aucun domaine ».
        setPanne(e instanceof Error ? e.message : "chargement impossible");
        setDomaines([]);
      })
      .finally(() => {
        if (vivant) setChargement(false);
      });
    return () => {
      vivant = false;
    };
  }, [pays]);

  const listeContinent = useMemo(
    () => (continent ? RESUMES.find((r) => r.id === continent) : null),
    [continent],
  );

  const retenus = useMemo(() => {
    if (!domaines) return [];
    const gardes = chercher(domaines, q).filter((d) => passeFiltres(d, filtres, repartitions));
    return trier(gardes, tri);
  }, [domaines, q, filtres, repartitions, tri]);

  const nFiltres = filtresActifs(filtres);
  const fiche = pays ? paysByCode(pays) : undefined;
  const idx = pays ? indexPays(pays) : undefined;
  // `domainesPays()` rend les domaines hébergés **et** ceux qui débordent d'un
  // pays voisin ; l'index, lui, ne compte que les hébergés. Écrire « 396 sur
  // 381 » laissait ces deux comptes se contredire à l'écran sans rien dire.
  const frontaliers = Math.max(0, (domaines?.length ?? 0) - (idx?.domaines ?? 0));

  return (
    <Coquille>
      <div className="monde">
        <header className="monde__tete">
          <p className="monde__surtitre">Référentiel mondial · OpenSkiMap</p>
          <h1 className="monde__titre">Le monde</h1>
          <p className="monde__intro">
            {entier(DOMAINES_MONDE)} domaines de ski alpin, {PAYS_AVEC_DOMAINES.length} pays. Seuil
            retenu : {SEUIL_MONDE}. Relevé du {RELEVE_MONDE.slice(0, 10)}.
          </p>
          <div className="monde__systeme" role="group" aria-label="Unités">
            {(
              [
                ["metrique", "km · m"],
                ["imperial", "mi · ft"],
              ] as [Systeme, string][]
            ).map(([s, label]) => (
              <button
                key={s}
                type="button"
                className={`chip chip--sm${systeme === s ? " chip--on" : ""}`}
                aria-pressed={systeme === s}
                onClick={() => setSysteme(s)}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        <nav className="monde__fil" aria-label="Où vous êtes">
          <button
            type="button"
            className="monde__miette"
            onClick={() => {
              setContinent(null);
              setPays(null);
            }}
          >
            Monde
          </button>
          {listeContinent ? (
            <>
              <span aria-hidden>›</span>
              <button type="button" className="monde__miette" onClick={() => setPays(null)}>
                {listeContinent.nom}
              </button>
            </>
          ) : null}
          {pays ? (
            <>
              <span aria-hidden>›</span>
              <span className="monde__miette monde__miette--ici">{fiche?.nomFr ?? pays}</span>
            </>
          ) : null}
        </nav>

        {/* ── Niveau 1 : les continents ─────────────────────────────────── */}
        {!continent ? (
          <>
            <ul className="monde__continents">
              {RESUMES.map((r) => (
                <li key={r.id}>
                  <button type="button" className="monde-carte" onClick={() => setContinent(r.id)}>
                    <span className="monde-carte__nom">{r.nom}</span>
                    <span className="monde-carte__chiffre">{entier(r.domaines)}</span>
                    <span className="monde-carte__quoi">
                      domaines · {r.pays.length} pays
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <p className="monde__note">
              {entier(TOTAL_ONGLETS)} domaines sont rangés sous ces six onglets.{" "}
              {HORS_ONGLETS.length ? (
                <>
                  {HORS_ONGLETS.length === 1 ? "Un pays du référentiel n'y figure" : "Deux pays du référentiel n'y figurent"}{" "}
                  pas —{" "}
                  {HORS_ONGLETS.map((p, i) => (
                    <span key={p.code}>
                      {i > 0 ? ", " : ""}
                      <b>{p.code}</b> ({entier(p.domaines)} domaine{p.domaines > 1 ? "s" : ""})
                    </span>
                  ))}{" "}
                  : l'Antarctique n'a pas d'onglet où aller, et le Kosovo n'a ni devise ni fuseau
                  qui se sourcent. {entier(SANS_PAYS)} domaines de plus ne sont rattachés à aucun
                  pays par la source, et restent donc hors du référentiel.
                </>
              ) : null}
            </p>
            <p className="monde__renvoi">
              Les 320 stations françaises du classeur France Montagnes ont leurs propres écrans :{" "}
              <Link to="/carte">la carte</Link> et <Link to="/comparer">Comparer</Link>. Ce
              référentiel-ci décrit la France par sa seule entrée OpenSkiMap, ce qui n'est pas la
              même chose.
            </p>
          </>
        ) : null}

        {/* ── Niveau 2 : les pays du continent ──────────────────────────── */}
        {listeContinent && !pays ? (
          <ul className="monde__pays">
            {listeContinent.pays
              .slice()
              .sort((a, b) => (indexPays(b.code)?.domaines ?? 0) - (indexPays(a.code)?.domaines ?? 0))
              .map((p) => {
                const i = indexPays(p.code);
                return (
                  <li key={p.code}>
                    <button type="button" className="monde-pays" onClick={() => setPays(p.code)}>
                      <span className="monde-pays__nom">{p.nomFr}</span>
                      <span className="monde-pays__n">{entier(i?.domaines ?? 0)}</span>
                      <span className="monde-pays__detail">
                        {i?.kmTotal != null
                          ? mesureDans({ valeur: i.kmTotal, unite: "km" }, systeme)
                          : "km non relevés"}
                        {i?.maxM != null ? ` · jusqu'à ${altitude(i.maxM, systeme)}` : null}
                      </span>
                      <span className="monde-pays__devise">{p.devise}</span>
                    </button>
                  </li>
                );
              })}
          </ul>
        ) : null}

        {/* ── Niveau 3 : les domaines du pays ───────────────────────────── */}
        {pays ? (
          <section className="monde__domaines">
            <div className="monde__barre">
              <label className="monde__recherche">
                <span className="sr-only">Rechercher un domaine, une région</span>
                <input
                  type="search"
                  value={q}
                  placeholder="Zermatt, Tyrol, Hokkaido…"
                  autoComplete="off"
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
              <button
                type="button"
                className={`chip${nFiltres || ouvert ? " chip--on" : ""}`}
                aria-expanded={ouvert}
                onClick={() => setOuvert((v) => !v)}
              >
                Filtres
                {nFiltres ? <span className="fbadge">{nFiltres}</span> : null}
              </button>
              <label>
                <span className="sr-only">Tri des domaines</span>
                <select
                  className="monde__tri"
                  value={tri}
                  onChange={(e) => setTri(e.target.value as TriMonde)}
                >
                  {TRIS_MONDE.map(([id, label]) => (
                    <option key={id} value={id}>
                      Tri : {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {ouvert ? (
              <div className="monde__filtres">
                {SEUILS_MONDE.map((s) => (
                  <Curseur
                    key={s.k}
                    label={s.label}
                    valeur={filtres[s.k]}
                    max={s.max}
                    step={s.step}
                    unite={s.unite}
                    onChange={(v) => setFiltres({ ...filtres, [s.k]: v })}
                  />
                ))}
                <label className="monde-bascule">
                  <input
                    type="checkbox"
                    checked={filtres.avecCouleurs}
                    onChange={(e) => setFiltres({ ...filtres, avecCouleurs: e.target.checked })}
                  />
                  Seulement les domaines dont la répartition est connue
                </label>
                <button
                  type="button"
                  className="chip chip--sm"
                  onClick={() => setFiltres(AUCUN_FILTRE)}
                >
                  Tout remettre à zéro
                </button>
              </div>
            ) : null}

            <p className="monde__compte">
              {chargement
                ? "Ouverture du pays…"
                : panne
                  ? `Le pays n'a pas pu être ouvert : ${panne}`
                  : `${entier(retenus.length)} domaine${retenus.length > 1 ? "s" : ""} sur ${entier(
                      domaines?.length ?? 0,
                    )}`}
            </p>

            {!chargement && !panne && frontaliers > 0 ? (
              <p className="monde__compte">
                Dont {entier(frontaliers)} à cheval sur une frontière : le référentiel les range
                sous {fiche?.nomFr ?? pays} comme sous leur autre pays, sans les copier. L'index en
                compte {entier(idx?.domaines ?? 0)} pour ce pays, qui sont ceux qu'il héberge.
              </p>
            ) : null}

            {!chargement && !panne && retenus.length === 0 ? (
              <p className="monde__vide">
                Aucun domaine ne remplit tous les critères. Un seuil actif écarte les domaines dont
                la valeur n'est pas relevée : c'est voulu, mais c'est souvent lui qui vide la liste.
              </p>
            ) : null}

            <ul className="monde__liste">
              {retenus.map((d) => (
                <LigneDomaine
                  key={d.id}
                  d={d}
                  r={repartitions.get(d.id)}
                  rattachement={rattachements[d.id]}
                  systeme={systeme}
                />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Coquille>
  );
}
