/**
 * Plus › Forfaits : la liste des domaines, et la grille tarifaire de celui que
 * l'on choisit.
 *
 * Ce qui ne marchait pas, et qui est traité ici :
 *
 * - **la liste ne défilait pas.** La coquille des écrans de contrôle est en
 *   `height: 100vh` avec `overflow: hidden` sur le corps du document, et
 *   l'écran ne posait aucun conteneur défilant. La correction est dans la
 *   feuille (`.v6 main`), commune aux cinq écrans ; ici, la liste porte sa
 *   propre hauteur bornée et son `overflow-y: auto` ;
 * - **on ne pouvait pas choisir un domaine.** Les lignes n'étaient ni des
 *   boutons ni des liens. Elles le sont, et le choix s'écrit dans l'adresse ;
 * - **la grille n'existait pas.** Trois nombres — 1 jour, 6 jours, 6 jours
 *   enfant — tenaient lieu de tarification. Durées en lignes, catégories en
 *   colonnes, saisie au clavier, sauvegarde immédiate, annulation ;
 * - **« Actualiser » n'actualisait rien de visible** : seize domaines choisis
 *   par le champ de recherche, aucun résultat, aucune progression. Deux actions
 *   distinctes désormais, l'une pour le domaine choisi, l'autre pour tous, avec
 *   compte, résultat par domaine et arrêt possible.
 */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/components/Icon";
import { Coquille } from "@/components/Coquille";
import { etatTarif, formatEuroTarif } from "@/lib/forfaits/age";
import {
  getForfait,
  listForfaitDomains,
  listForfaits,
  reactiverForfait,
  refreshForfaits,
  type ResultatForfait,
} from "@/lib/forfaits/api";
import {
  CATEGORIES,
  durees,
  lire,
  saisonDe,
  STATUT_LBL,
  useGrilles,
  type Categorie,
} from "@/lib/forfaits/grille";
import { TENTATIVE_LBL, VOIE_LBL, type EtatSource } from "@/lib/forfaits/sources";
import type { DomainForfait, ForfaitRow } from "@/lib/forfaits/types";
import { foldName } from "@/lib/carte";
import { stationsDuDomaine } from "@/lib/domaineStations";

export const Route = createFileRoute("/forfaits")({ component: ForfaitsPage });

/** Ce qu'une actualisation a produit, domaine par domaine : singulier, pluriel. */
const ISSUE_LBL: Record<ResultatForfait["issue"], [string, string]> = {
  maj: ["mis à jour", "mis à jour"],
  inchange: ["inchangé", "inchangés"],
  manuel: ["saisie manuelle conservée", "saisies manuelles conservées"],
  refus: ["source non accessible automatiquement", "sources non accessibles automatiquement"],
  echec: ["échec", "échecs"],
  desactivee: ["source désactivée", "sources désactivées"],
  ignore: ["source en saisie assistée", "sources en saisie assistée"],
};

/** Combien de domaines par aller-retour. Le serveur les mène de front, un
 *  hôte à la fois — c'est le maximum que le validateur accepte, et il tient
 *  en une quarantaine de secondes même quand aucun tarif n'est trouvé. */
const LOT = 24;

function ForfaitsPage() {
  const [domains, setDomains] = useState<DomainForfait[]>([]);
  const [rows, setRows] = useState<Record<string, ForfaitRow>>({});
  const [sources, setSources] = useState<Record<string, EtatSource>>({});
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<string | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [chargement, setChargement] = useState(true);

  // Une seule actualisation à la fois, interruptible. `encours` compte les
  // domaines du lot qui court : sans lui, le décompte restait figé pendant
  // toute la durée d'un aller-retour et l'écran passait pour bloqué.
  const [travail, setTravail] = useState<{
    quoi: "un" | "tous";
    fait: number;
    encours: number;
    total: number;
  } | null>(null);
  const [bilan, setBilan] = useState<{ slug: string; issue: ResultatForfait["issue"] }[] | null>(null);
  const arret = useRef(false);
  // « Arrêter » ne rendait la main qu'entre deux lots. Le signal coupe
  // l'attente ici même ; le relevé déjà lancé finit côté serveur et son
  // résultat est gardé en mémoire pour la fois d'après — rien n'est perdu,
  // et aucun site n'est sollicité deux fois pour rien.
  const abandon = useRef<AbortController | null>(null);

  const saison = useMemo(() => saisonDe(new Date()), []);
  const grilles = useGrilles((g) => g.grilles);
  const poser = useGrilles((g) => g.poser);
  const etendre = useGrilles((g) => g.etendre);
  const appliquerReleve = useGrilles((g) => g.appliquerReleve);
  const annulerDerniere = useGrilles((g) => g.annulerDerniere);
  const peutAnnuler = useGrilles((g) => g.derniere != null);

  const charger = useCallback(() => {
    setChargement(true);
    setErreur(null);
    void Promise.all([listForfaitDomains({ data: {} }), listForfaits({ data: {} })])
      .then(([list, stored]) => {
        setDomains(list);
        setRows(Object.fromEntries(stored.items.map((r) => [r.slug, r])));
        setSources(Object.fromEntries(stored.sources.map((s) => [s.slug, s])));
      })
      .catch((e: unknown) => {
        console.warn("[forfaits] catalogue illisible", e);
        setErreur(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setChargement(false));
  }, []);

  useEffect(charger, [charger]);

  const visible = useMemo(() => {
    const n = foldName(q);
    if (!n) return domains;
    return domains.filter(
      (d) =>
        foldName(d.name).includes(n) ||
        foldName(d.massif).includes(n) ||
        foldName(d.pass ?? "").includes(n) ||
        foldName(d.slug).includes(n),
    );
  }, [domains, q]);

  const choisi = sel ? (domains.find((d) => d.slug === sel) ?? null) : null;
  const grille = choisi ? grilles[`${choisi.slug}|${saison}`] : undefined;
  const rowChoisie = choisi ? rows[choisi.slug] : undefined;

  // Ouvrir un domaine pré-remplit sa grille avec les tarifs connus. La fusion
  // ne touche jamais une case saisie à la main : l'ouverture est sans risque.
  useEffect(() => {
    if (choisi && rowChoisie) appliquerReleve(choisi.slug, saison, rowChoisie);
  }, [choisi, rowChoisie, saison, appliquerReleve]);

  const encaisser = useCallback(
    (res: ResultatForfait[]) => {
      setRows((cur) => {
        const copie = { ...cur };
        for (const r of res) copie[r.row.slug] = r.row;
        return copie;
      });
      setSources((cur) => {
        const copie = { ...cur };
        for (const r of res) copie[r.source.slug] = r.source;
        return copie;
      });
      setBilan((cur) => [...(cur ?? []), ...res.map((r) => ({ slug: r.row.slug, issue: r.issue }))]);
    },
    [],
  );

  /** Le domaine choisi, et lui seul. */
  async function actualiserUn(slug: string) {
    if (travail) return;
    arret.current = false;
    abandon.current = new AbortController();
    setBilan(null);
    setTravail({ quoi: "un", fait: 0, encours: 1, total: 1 });
    try {
      const r = await getForfait({ data: { slug, refresh: true }, signal: abandon.current.signal });
      encaisser([r]);
      // Le relevé alimente la grille sans jamais écraser une saisie manuelle.
      const conflits = appliquerReleve(slug, saison, r.row);
      if (conflits) {
        setErreur(
          `${conflits} valeur${conflits > 1 ? "s" : ""} saisie${conflits > 1 ? "s" : ""} à la main diffère${conflits > 1 ? "nt" : ""} du relevé. ${conflits > 1 ? "Elles sont conservées" : "Elle est conservée"} ; utilisez « Reprendre le relevé » pour ${conflits > 1 ? "les" : "la"} remplacer.`,
        );
      }
    } catch (e: unknown) {
      if (arret.current) return;
      console.warn(`[forfaits] ${slug} : actualisation en échec`, e);
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      abandon.current = null;
      setTravail(null);
    }
  }

  /** Tous les domaines du catalogue — action distincte, et dite comme telle. */
  async function actualiserTous() {
    if (travail) return;
    arret.current = false;
    abandon.current = new AbortController();
    setBilan([]);
    setErreur(null);
    const slugs = visible.map((d) => d.slug);
    setTravail({ quoi: "tous", fait: 0, encours: 0, total: slugs.length });
    try {
      for (let i = 0; i < slugs.length; i += LOT) {
        if (arret.current) break;
        const lot = slugs.slice(i, i + LOT);
        setTravail({ quoi: "tous", fait: i, encours: lot.length, total: slugs.length });
        const res = await refreshForfaits({
          data: { slugs: lot, force: true },
          signal: abandon.current.signal,
        });
        encaisser(res);
        for (const r of res) appliquerReleve(r.row.slug, saison, r.row);
        setTravail({ quoi: "tous", fait: i + lot.length, encours: 0, total: slugs.length });
      }
    } catch (e: unknown) {
      // Un arrêt demandé n'est pas une panne : il ne s'affiche pas en rouge.
      if (arret.current) return;
      console.warn("[forfaits] actualisation générale en échec", e);
      setErreur(e instanceof Error ? e.message : String(e));
    } finally {
      abandon.current = null;
      setTravail(null);
    }
  }

  async function reactiver(slug: string) {
    try {
      const s = await reactiverForfait({ data: { slug } });
      setSources((cur) => ({ ...cur, [slug]: s }));
    } catch (e: unknown) {
      console.warn(`[forfaits] ${slug} : réactivation en échec`, e);
    }
  }

  const bilanTexte = useMemo(() => {
    if (!bilan?.length) return null;
    const parIssue = new Map<string, number>();
    for (const b of bilan) parIssue.set(b.issue, (parIssue.get(b.issue) ?? 0) + 1);
    return [...parIssue.entries()]
      .map(([k, n]) => `${n} ${ISSUE_LBL[k as ResultatForfait["issue"]][n > 1 ? 1 : 0]}`)
      .join(" · ");
  }, [bilan]);

  return (
    <Coquille>
      <div className="forf">
        <header className="forf__tete">
          <div>
            <h1 className="font-display text-affiche tracking-tight">Forfaits</h1>
            <p className="forf__lead">
              Tarifs des domaines français. Un tarif relevé porte sa date ; un tarif jamais obtenu
              se saisit à la main.
            </p>
          </div>
          <div className="forf__actions">
            <button
              type="button"
              className="btn7 btn7--fantome"
              onClick={() => void actualiserTous()}
              disabled={!!travail}
              aria-busy={travail?.quoi === "tous"}
            >
              {travail?.quoi === "tous"
                ? `Tous les domaines… ${travail.fait}/${travail.total}${travail.encours ? ` · ${travail.encours} en cours` : ""}`
                : visible.length > 1
                  ? `Mettre à jour les ${visible.length} domaines`
                  : `Mettre à jour ${visible.length} domaine`}
            </button>
            {travail ? (
              <button
                type="button"
                className="btn7 btn7--fantome"
                onClick={() => {
                  arret.current = true;
                  abandon.current?.abort();
                }}
              >
                Arrêter
              </button>
            ) : null}
          </div>
        </header>

        {erreur ? (
          <p className="forf__erreur" role="status">
            {erreur}
            <button type="button" className="lien-doux" onClick={() => setErreur(null)}>
              Masquer
            </button>
          </p>
        ) : null}
        {bilanTexte ? (
          <p className="forf__bilan" role="status">
            {bilanTexte}
          </p>
        ) : null}

        <div className="forf__deux">
          <div className="forf__col">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Rechercher un domaine"
              className="forf__q"
              aria-label="Rechercher un domaine"
            />
            {/* La liste défile : hauteur bornée ici, `min-height: 0` sur les
                parents, `overflow-y: auto` sur elle. */}
            <ul className="forf__liste">
              {chargement ? (
                <li className="forf__vide">Chargement du catalogue…</li>
              ) : !visible.length ? (
                <li className="forf__vide">
                  {q.trim() ? (
                    <>Aucun domaine ne correspond à «&nbsp;{q.trim()}&nbsp;».</>
                  ) : (
                    "Aucun domaine dans le catalogue."
                  )}
                </li>
              ) : (
                visible.map((d) => {
                  const row = rows[d.slug];
                  const e = row ? etatTarif(row) : null;
                  return (
                    <li key={d.slug}>
                      <button
                        type="button"
                        className={`forf__ligne${sel === d.slug ? " forf__ligne--on" : ""}`}
                        aria-pressed={sel === d.slug}
                        onClick={() => setSel(d.slug)}
                      >
                        <span className="forf__nom">{d.name}</span>
                        <span className="forf__meta">
                          {d.massif}
                          {d.pass ? ` · ${d.pass}` : ""}
                        </span>
                        <span className="forf__prix">
                          {formatEuroTarif(row?.j6 ?? d.seed?.j6)}
                          <small>6 j adulte</small>
                        </span>
                        <span className={`forf__fiab forf__fiab--${e?.fiabilite ?? "jamais"}`}>
                          {e?.fiabiliteLbl ?? "tarif à saisir"}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>

          <div className="forf__col forf__col--panneau">
            {choisi ? (
              <PanneauDomaine
                d={choisi}
                row={rows[choisi.slug]}
                source={sources[choisi.slug]}
                saison={saison}
                grille={grille}
                occupe={!!travail}
                onActualiser={() => void actualiserUn(choisi.slug)}
                onReactiver={() => void reactiver(choisi.slug)}
                onPoser={(duree, cat, prix) => poser(choisi.slug, saison, duree, cat, prix)}
                onEtendre={(n) => etendre(choisi.slug, saison, n)}
                onAnnuler={annulerDerniere}
                peutAnnuler={peutAnnuler}
                onReprendre={() => {
                  const r = rows[choisi.slug];
                  if (r) appliquerReleve(choisi.slug, saison, r, true);
                }}
              />
            ) : (
              <p className="forf__vide forf__vide--panneau">
                Choisissez un domaine dans la liste pour ouvrir sa grille tarifaire.
              </p>
            )}
          </div>
        </div>
      </div>
    </Coquille>
  );
}

/**
 * Les stations que ce forfait ouvre.
 *
 * L'écran laissait choisir un domaine et n'offrait aucun moyen d'en ouvrir une
 * station : on lisait « Les 3 Vallées, 359 € » sans pouvoir passer à
 * Courchevel ni à Méribel. Le rattachement est celui du domaine skiable, le
 * même que la fiche affiche.
 */
function StationsDuDomaine({ slug }: { slug: string }) {
  const stations = useMemo(() => stationsDuDomaine(slug), [slug]);
  if (!stations.length) return null;
  return (
    <div className="forfp__stations">
      <span className="forfp__stationsTitre">
        {stations.length} station{stations.length > 1 ? "s" : ""} dans ce domaine
      </span>
      <ul className="forfp__stationsListe">
        {stations.map((s) => (
          <li key={s.id}>
            <Link to="/stations/$id" params={{ id: s.id }} className="forfp__station">
              {s.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** La grille d'un domaine : durées en lignes, catégories en colonnes. */
function PanneauDomaine({
  d,
  row,
  source,
  saison,
  grille,
  occupe,
  onActualiser,
  onReactiver,
  onPoser,
  onEtendre,
  onAnnuler,
  peutAnnuler,
  onReprendre,
}: {
  d: DomainForfait;
  row: ForfaitRow | undefined;
  source: EtatSource | undefined;
  saison: string;
  grille: ReturnType<typeof useGrilles.getState>["grilles"][string] | undefined;
  occupe: boolean;
  onActualiser: () => void;
  onReactiver: () => void;
  onPoser: (duree: number, categorie: Categorie, prix: number | null) => void;
  onEtendre: (n: number) => void;
  onAnnuler: () => void;
  peutAnnuler: boolean;
  onReprendre: () => void;
}) {
  const e = row ? etatTarif(row) : null;
  const lignes = durees(grille?.dureeMax ?? 7);

  return (
    <section className="forfp">
      <header className="forfp__tete">
        <div>
          <h2>{d.name}</h2>
          <p>
            {d.massif} · saison {saison}
            {d.website ? (
              <>
                {" · "}
                <a href={d.website} target="_blank" rel="noopener">
                  site officiel <Icon name="externe" taille={12} />
                </a>
              </>
            ) : null}
          </p>
        </div>
        <div className="forfp__actions">
          <button type="button" className="btn7" onClick={onActualiser} disabled={occupe} aria-busy={occupe}>
            {occupe ? "Mise à jour…" : "Mettre à jour ce domaine"}
          </button>
        </div>
      </header>

      {/* Trois champs séparés : fraîcheur, fiabilité, cause repliée. */}
      <div className="forfp__etat">
        <span className="forfp__fraicheur">{e?.fraicheur ?? "jamais relevé"}</span>
        <span className={`forf__fiab forf__fiab--${e?.fiabilite ?? "jamais"}`}>
          {e?.fiabiliteLbl ?? "tarif à saisir"}
        </span>
        <span className="forfp__voie">
          Voie retenue : {VOIE_LBL[source?.voie ?? "auto"]}
          {source?.desactivee ? " · désactivée après trois échecs" : ""}
        </span>
        {source?.desactivee || source?.voie === "manuelle" ? (
          <button type="button" className="lien-doux" onClick={onReactiver}>
            Réactiver la source
          </button>
        ) : null}
      </div>
      <StationsDuDomaine slug={d.slug} />

      {/* La cause technique et le journal des tentatives : repliés. Ils
          n'apparaissent jamais dans le libellé principal. */}
      {e?.cause || source?.cause || source?.journal.length ? (
        <details className="forfp__detail">
          <summary>
            Détail technique
            {source?.journal.length ? ` · ${source.journal.length} tentative${source.journal.length > 1 ? "s" : ""}` : ""}
          </summary>
          {e?.cause || source?.cause ? <code>{e?.cause ?? source?.cause}</code> : null}
          {source?.journal.length ? (
            <ol className="forfp__journal">
              {source.journal.map((t, i) => (
                <li key={`${t.at}-${i}`}>
                  <span>{new Date(t.at).toLocaleString("fr-FR")}</span>
                  <span>{TENTATIVE_LBL[t.issue]}</span>
                  <span>{t.message}</span>
                  <span className="forfp__journal-url">{t.url}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </details>
      ) : null}
      {source?.voie === "manuelle" ? (
        <p className="forfp__assiste">
          Cette source n’est pas accessible automatiquement. Ouvrez la page officielle et reportez
          les tarifs dans la grille : ils seront marqués comme saisis à la main.
          {d.website ? (
            <>
              {" "}
              <a href={d.website} target="_blank" rel="noopener">
                Ouvrir le site officiel <Icon name="externe" taille={12} />
              </a>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="forfp__grille">
        <table className="forfp__table">
          <caption className="sr-only">
            Grille tarifaire de {d.name}, saison {saison}
          </caption>
          <thead>
            <tr>
              <th scope="col">Durée</th>
              {CATEGORIES.map((c) => (
                <th key={c.cle} scope="col">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lignes.map((j) => (
              <tr key={j}>
                <th scope="row">{j === 0.5 ? "½ journée" : `${j} j`}</th>
                {CATEGORIES.map((c) => {
                  const t = lire(grille, j, c.cle);
                  return (
                    <td key={c.cle} className={`forfp__case forfp__case--${t.statut}`}>
                      <input
                        type="number"
                        min={0}
                        step={0.5}
                        inputMode="decimal"
                        value={t.prix ?? ""}
                        aria-label={`${d.name}, ${j === 0.5 ? "demi-journée" : `${j} jour${j > 1 ? "s" : ""}`}, ${c.label}, prix en euros`}
                        onChange={(ev) => {
                          const v = ev.target.value.trim();
                          onPoser(j, c.cle, v === "" ? null : Number(v));
                        }}
                      />
                      <span className="forfp__statut" title={t.source ?? undefined}>
                        {STATUT_LBL[t.statut]}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="forfp__pied">
        <label className="forfp__etendre">
          Durées jusqu’à
          <input
            type="number"
            min={7}
            max={21}
            value={grille?.dureeMax ?? 7}
            onChange={(ev) => onEtendre(Number(ev.target.value))}
          />
          jours
        </label>
        <button type="button" className="lien-doux" onClick={onAnnuler} disabled={!peutAnnuler}>
          Annuler la dernière saisie
        </button>
        <button type="button" className="lien-doux" onClick={onReprendre}>
          Reprendre le relevé (remplace les saisies manuelles)
        </button>
      </div>
      <p className="forfp__note">
        Chaque valeur est enregistrée dès la frappe, sur cet appareil. Une valeur saisie à la main
        est marquée comme telle et n’est jamais remplacée par un relevé automatique sans passer par
        « Reprendre le relevé ».
      </p>
    </section>
  );
}
