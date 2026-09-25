/** Prix – maquette v7 (`SKITRACK v7 - Prix par station.dc.html`, réexport du
 *  24 sept. 2026).
 *
 *  Deux vues d'une même période et d'un même groupe. « Par station » : la
 *  médiane du total publié, station par station ; les relevés sont réels, une
 *  station à la fois, et continuent quand on quitte l'écran
 *  (`@/lib/prix/releve`). « Par budget » : les annonces que ces mêmes relevés
 *  ont retenues (`@/lib/prix/annonces`), filtrées par le total du séjour, et
 *  montrées comme dans Logements (liste, carte aux pastilles de prix, volet).
 *
 *  La période suit le séjour tant qu'on ne la change pas ici ; le groupe est
 *  celui du séjour. Vue, critères, tris et pages vivent dans le magasin :
 *  changer d'onglet, ou passer par Réservation et revenir, ne perd rien. */

import { createFileRoute } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Coquille } from "@/components/Coquille";
import { Icon } from "@/components/Icon";
import { useGo } from "@/components/v6/go";
import { CarteEpingles } from "@/components/v7/CarteEpingles";
import { CarteLogement, PAGE_LOGEMENTS } from "@/components/v7/CarteLogement";
import { epinglePrix, ETAGE } from "@/components/v7/epingle";
import { FicheEpingle } from "@/components/v7/FicheEpingle";
import { Fourchette } from "@/components/v7/Fourchette";
import { Pages } from "@/components/v7/Pages";
import { Vide } from "@/components/v7/Vide";
import { VoletAnnonce } from "@/components/v7/VoletAnnonce";
import { dansLesBornes, type Bornes as Cadre } from "@/lib/carte";
import type { Listing } from "@/lib/listings";
import { eur, groupLbl, useParcours, useSejour } from "@/lib/parcours";
import { useAnnonces } from "@/lib/prix/annonces";
import {
  annSub,
  avecNuits,
  bornesPlages,
  cleResultat,
  comparateur,
  comparateurBudget,
  countBudget,
  countFl,
  countLbl,
  decaler,
  departIso,
  departLbl,
  dureeLbl,
  ecartLbl,
  effacerBudget,
  estPassee,
  FL0,
  filtresActifs,
  filtresActifsBudget,
  grpKey,
  idsALancer,
  jetons,
  jetonsBudget,
  ligne,
  lireTri,
  lireTriB,
  medHead,
  memePeriode,
  MIN_ANNONCES,
  moreLbl,
  nomListe,
  NUITS_MAX,
  NUITS_MIN,
  ordreMassifs,
  PAGE,
  partielLbl,
  passe,
  passeBudget,
  passeStationSeule,
  perKey,
  perLbl,
  periodeDuSejour,
  PLAGE_BUDGET,
  PLAGES,
  PLAGES_STATION,
  plageLbl,
  plur,
  poserBorne,
  relLbl,
  releveLbl,
  retirerJeton,
  sousTitre,
  sousTitreBudget,
  triLbl,
  TRIS,
  TRIS_B,
  triVal,
  videBudget,
  type CarteAnnonce,
  type DefPlage,
  type Groupe,
  type Job,
  type Ligne,
  type Periode,
  type Tri,
} from "@/lib/prix/calcul";
import { usePrix, type Course, type Onglet } from "@/lib/prix/releve";
import { useStay } from "@/lib/stay";
import { todayIso } from "@/lib/stay/calendar";
import { clampRooms, clampTravelers } from "@/lib/stay/party";
import { STATIONS } from "@/lib/stations";
import { prixPin } from "@/lib/v7";

export const Route = createFileRoute("/prix")({ component: Prix });

/* Le référentiel ne change pas pendant la vie de l'écran : bornes des
   curseurs, ordre des massifs et options de massif se calculent une fois. */
const BORNES = bornesPlages(STATIONS);
const MASSIFS = ordreMassifs(STATIONS);
const RANG_MASSIF: ReadonlyMap<string, number> = new Map(MASSIFS.map((m, i) => [m, i]));
const NOMS: ReadonlyMap<string, string> = new Map(STATIONS.map((s) => [s.id, s.name]));
const OPTIONS_MASSIF = [
  { v: "", label: `Tous · ${STATIONS.length}` },
  ...MASSIFS.map((m) => ({
    v: m,
    label: `${m} · ${STATIONS.filter((s) => s.massif === m).length}`,
  })),
];

/* (Prix par station.dc.html:544) */
const ONGLETS: readonly { v: Onglet; lbl: string }[] = [
  { v: "station", lbl: "Par station" },
  { v: "budget", lbl: "Par budget" },
];
const idOnglet = (o: Onglet) => `prix-onglet-${o}`;
const idVue = (o: Onglet) => `prix-vue-${o}`;

/** Les départements du massif choisi, ou de tous, comptés dans ce même
 *  ensemble (Prix par station.dc.html:591). « Tous » n'a pas de compte. */
function optionsDept(massif: string): { v: string; label: string }[] {
  const pool = massif ? STATIONS.filter((s) => s.massif === massif) : STATIONS;
  const compte = new Map<string, number>();
  for (const s of pool) if (s.dept) compte.set(s.dept, (compte.get(s.dept) ?? 0) + 1);
  return [
    { v: "", label: "Tous" },
    ...[...compte.keys()]
      .sort((a, b) => a.localeCompare(b, "fr"))
      .map((d) => ({ v: d, label: `${d} · ${compte.get(d)}` })),
  ];
}

/** En-têtes du tableau : la date du relevé ne se trie pas, la médiane se
 *  range à droite (Prix par station.dc.html:506). */
type Colonne = { id: string; k: Tri["k"] | null; lbl: string; droite?: boolean };

function colonnes(nights: number): Colonne[] {
  return [
    { id: "station", k: "nom", lbl: "Station" },
    { id: "logements", k: "n", lbl: "Logements" },
    { id: "releve", k: null, lbl: "Relevé" },
    { id: "mediane", k: "med", lbl: medHead(nights), droite: true },
  ];
}

/* Le serveur rend l'écran avec des magasins vides ; le client relit période,
   résultats et séjour dans `localStorage` dès son premier rendu. Tout ce qui
   en dépend attend donc le montage : sinon l'hydratation échoue et la page
   clignote. */
function Prix() {
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  return (
    <Coquille>
      {monte ? (
        <EcranPrix />
      ) : (
        <main className="v7main prix7" id="s-prix" data-screen-label="Prix">
          <div className="prix7__tete">
            <div className="prix7__titre">
              <h1>Prix</h1>
            </div>
          </div>
        </main>
      )}
    </Coquille>
  );
}

const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;

function EcranPrix() {
  const sej = useSejour();
  const { checkIn, nights, enfants } = sej;
  const perChoisie = usePrix((s) => s.per);
  const onglet = usePrix((s) => s.onglet);
  const setPer = usePrix((s) => s.setPer);
  const setOnglet = usePrix((s) => s.setOnglet);
  const refsOnglets = useRef<Partial<Record<Onglet, HTMLButtonElement | null>>>({});
  const refDate = useRef<HTMLInputElement>(null);
  // La saisie en cours du champ de date, tant qu'elle ne dit pas une arrivée
  // valable : Chromium envoie l'année chiffre par chiffre (0002, 0020, 0202),
  // et chacune serait une période enregistrée.
  const [saisie, setSaisie] = useState<string | null>(null);

  const sejour = useMemo(() => periodeDuSejour(checkIn, nights), [checkIn, nights]);
  const per = perChoisie ?? sejour;
  // Un lien ou une adresse peuvent poser un groupe hors des bornes de l'écran
  // de séjour ; clés et requêtes suivent ces bornes.
  const trav = clampTravelers(sej.trav);
  const rooms = clampRooms(sej.rooms);
  const groupe = useMemo<Groupe>(() => ({ trav, rooms }), [trav, rooms]);
  const auj = todayIso();

  // `setPer` ramène aux premières pages (Prix par station.dc.html:423).
  // Revenir sur les dates du séjour, pas à pas ou d'un saut, lui rend la
  // période : elle le suivra de nouveau.
  const poserPer = (p: Periode | null) => setPer(p && !memePeriode(p, sejour) ? p : null);

  // Ouvrir un onglet depuis ailleurs que lui y porte le focus : le bouton
  // qu'on vient d'actionner disparaît avec l'autre vue.
  const ouvrir = (o: Onglet) => {
    setOnglet(o);
    refsOnglets.current[o]?.focus();
  };

  // Onglets à tabulation mobile : une seule tabulation entre dans la barre,
  // les flèches passent d'un onglet à l'autre et l'ouvrent.
  const clavierOnglets = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const n = ONGLETS.length;
    const j =
      e.key === "ArrowRight"
        ? (i + 1) % n
        : e.key === "ArrowLeft"
          ? (i + n - 1) % n
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? n - 1
              : -1;
    const o = ONGLETS[j];
    if (!o) return;
    e.preventDefault();
    ouvrir(o.v);
  };

  return (
    <main className="v7main prix7" id="s-prix" data-screen-label="Prix">
      <div className="prix7__tete">
        <div className="prix7__titre">
          <h1>Prix</h1>
          <p>
            {onglet === "budget" ? sousTitreBudget(per.nights, trav) : sousTitre(per.nights, trav)}
          </p>
        </div>
        <div className="prix7__groupe" title="Le groupe se change dans votre séjour">
          <span className="prix7__groupe-lbl">Groupe</span>
          <span className="prix7__groupe-val">{groupLbl(trav, rooms, enfants)}</span>
        </div>
      </div>

      <div role="tablist" aria-label="Vue" className="prix7__onglets">
        {ONGLETS.map((o, i) => {
          const on = o.v === onglet;
          return (
            <button
              key={o.v}
              ref={(el) => {
                refsOnglets.current[o.v] = el;
              }}
              type="button"
              role="tab"
              id={idOnglet(o.v)}
              aria-controls={idVue(o.v)}
              aria-selected={on}
              tabIndex={on ? 0 : -1}
              className={`prix7__onglet${on ? " prix7__onglet--on" : ""}`}
              onClick={() => setOnglet(o.v)}
              onKeyDown={(e) => clavierOnglets(e, i)}
            >
              {o.lbl}
            </button>
          );
        })}
      </div>

      {/* La période et l'écart sont communs aux deux vues : ils précèdent
            `sc-if isStation` (Prix par station.dc.html:35-54). */}
      <div className="prix7__carte prix7__periode">
        <div className="prix7__arrivee">
          <label className="prix7__lbl" htmlFor="prix-arrivee">
            Arrivée
          </label>
          {/* Pas de relevé pour des dates passées : l'arrivée ne descend pas
                sous aujourd'hui, comme dans le calendrier du séjour. */}
          <button
            type="button"
            className="prix7__rond"
            title="Un jour plus tôt"
            aria-label="Un jour plus tôt"
            disabled={per.from <= auj}
            onClick={() => poserPer(decaler(per, -1))}
          >
            <Icon name="chevron-gauche" taille={14} />
          </button>
          <input
            ref={refDate}
            id="prix-arrivee"
            type="date"
            className="prix7__date"
            min={auj}
            value={saisie ?? per.from}
            onChange={(e) => {
              // Une date entière et à venir passe au magasin ; le reste
              // (champ vidé, année en cours de frappe, jour passé) reste un
              // brouillon, que la sortie du champ abandonne.
              const v = e.target.value;
              if (DATE_ISO.test(v) && v >= todayIso()) {
                setSaisie(null);
                poserPer({ ...per, from: v });
              } else setSaisie(v);
            }}
            onBlur={() => setSaisie(null)}
          />
          <button
            type="button"
            className="prix7__rond"
            title="Un jour plus tard"
            aria-label="Un jour plus tard"
            onClick={() => poserPer(decaler(per, 1))}
          >
            <Icon name="chevron-droite" taille={14} />
          </button>
        </div>
        <div className="prix7__nuits" role="group" aria-labelledby="prix-nuits">
          <span className="prix7__lbl" id="prix-nuits">
            Nuits
          </span>
          <button
            type="button"
            className="prix7__rond"
            title="Une nuit de moins"
            aria-label="Une nuit de moins"
            disabled={per.nights <= NUITS_MIN}
            onClick={() => poserPer(avecNuits(per, per.nights - 1))}
          >
            <Icon name="moins" taille={14} />
          </button>
          <span className="prix7__nombre" aria-live="polite">
            {per.nights}
          </span>
          <button
            type="button"
            className="prix7__rond"
            title="Une nuit de plus"
            aria-label="Une nuit de plus"
            disabled={per.nights >= NUITS_MAX}
            onClick={() => poserPer(avecNuits(per, per.nights + 1))}
          >
            <Icon name="plus" taille={14} />
          </button>
          <span className="prix7__depart">départ le {departLbl(per)}</span>
        </div>
      </div>

      {!memePeriode(per, sejour) ? (
        <div className="prix7__ecart">
          <span>{ecartLbl(sejour)}</span>
          {/* Le bouton disparaît avec l'écart : le focus passe à l'arrivée. */}
          <button
            type="button"
            className="prix7__pilule"
            onClick={() => {
              poserPer(null);
              refDate.current?.focus();
            }}
          >
            Revenir à votre séjour
          </button>
        </div>
      ) : null}

      {/* Les deux panneaux existent, pour que chaque onglet désigne le sien ;
            seul l'ouvert porte un contenu, et lui seul lit les annonces. */}
      {ONGLETS.map((o) =>
        o.v === onglet ? (
          <div
            key={o.v}
            role="tabpanel"
            id={idVue(o.v)}
            aria-labelledby={idOnglet(o.v)}
            className="prix7__vue"
          >
            {o.v === "station" ? (
              <VueStation per={per} groupe={groupe} />
            ) : (
              <VueBudget per={per} groupe={groupe} ouvrir={ouvrir} />
            )}
          </div>
        ) : (
          <div key={o.v} role="tabpanel" id={idVue(o.v)} aria-labelledby={idOnglet(o.v)} hidden />
        ),
      )}
    </main>
  );
}

/** Massif et département, les mêmes dans les deux vues
 *  (Prix par station.dc.html:58-59, 141-142). */
function ChoixLieu() {
  const massif = usePrix((s) => s.fl.massif);
  const dept = usePrix((s) => s.fl.dept);
  const setFl = usePrix((s) => s.setFl);
  const deptOpts = useMemo(() => optionsDept(massif), [massif]);
  return (
    <>
      <label className="prix7__champ">
        <span>Massif</span>
        <select
          className="prix7__select"
          value={massif}
          // Un autre massif rend le département caduc.
          onChange={(e) => setFl({ massif: e.target.value, dept: "" })}
        >
          {OPTIONS_MASSIF.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
      <label className="prix7__champ">
        <span>Département</span>
        <select
          className="prix7__select"
          value={dept}
          onChange={(e) => setFl({ dept: e.target.value })}
        >
          {deptOpts.map((o) => (
            <option key={o.v} value={o.v}>
              {o.label}
            </option>
          ))}
        </select>
      </label>
    </>
  );
}

/** Une fourchette de critère. La mise à jour part de l'état courant du
 *  magasin : un même geste peut poser deux bornes (un brouillon validé à la
 *  sortie du champ, puis la poignée). */
function PlageFiltre({ p }: { p: DefPlage }) {
  const valeur = usePrix((s) => s.fl[p.k]);
  const majFl = usePrix((s) => s.majFl);
  const b = BORNES[p.k];
  return (
    <Fourchette
      lbl={p.lbl}
      bornes={b}
      valeur={valeur}
      pas={p.pas}
      unite={p.unite}
      resume={plageLbl(p.k, valeur, b)}
      onPoser={(which, v) =>
        majFl((f) => ({ ...f, [p.k]: poserBorne(f[p.k], b, p.pas, which, v) }))
      }
    />
  );
}

/** « Par station » : critères, relevé, tableau (Prix par station.dc.html:54-125). */
function VueStation({ per, groupe }: { per: Periode; groupe: Groupe }) {
  const res = usePrix((s) => s.res);
  const course = usePrix((s) => s.course);
  const file = usePrix((s) => s.file);
  const lancer = usePrix((s) => s.lancer);
  const arreter = usePrix((s) => s.arreter);
  const fl = usePrix((s) => s.fl);
  const tri = usePrix((s) => s.tri);
  const limit = usePrix((s) => s.limit);
  const setFl = usePrix((s) => s.setFl);
  const majFl = usePrix((s) => s.majFl);
  const resetFl = usePrix((s) => s.resetFl);
  const setTri = usePrix((s) => s.setTri);
  const setLimit = usePrix((s) => s.setLimit);
  const kGrp = grpKey(groupe);
  // Des dates passées ne se relèvent pas : le magasin ignorerait le relevé.
  const passee = estPassee(per, todayIso());
  // Où le focus se pose quand le bouton actionné disparaît.
  const refActions = useRef<HTMLDivElement>(null);
  const refCompte = useRef<HTMLSpanElement>(null);

  // Une course ne vaut pour les lignes que si elle porte sur la période et le
  // groupe affichés. En attente : ce qui reste à faire de la course (la
  // station courante comprise tant que le créneau Airbnb la retient) et tout
  // ce que la file prévoit.
  const { enCoursId, enAttente } = useMemo(() => {
    const ici = (j: Job) => memePeriode(j.per, per) && grpKey(j.groupe) === kGrp;
    const attente = new Set<string>();
    let courant: string | null = null;
    if (course && ici(course)) {
      if (!course.attente) courant = course.ids[course.i] ?? null;
      for (const id of course.ids.slice(course.i)) attente.add(id);
    }
    for (const j of file) if (ici(j)) for (const id of j.ids) attente.add(id);
    return { enCoursId: courant, enAttente: attente };
  }, [course, file, per, kGrp]);

  const lignes = useMemo(
    () =>
      STATIONS.map((s) => ({
        s,
        l: ligne(s, res[cleResultat(per, groupe, s.id)] ?? null, {
          enCours: s.id === enCoursId,
          attente: enAttente.has(s.id),
        }),
      })),
    [res, per, groupe, enCoursId, enAttente],
  );
  const filtrees = useMemo(
    () => lignes.filter(({ s, l }) => passe(l, s, fl, BORNES)).map(({ l }) => l),
    [lignes, fl],
  );
  const triees = useMemo(() => [...filtrees].sort(comparateur(tri, RANG_MASSIF)), [filtrees, tri]);

  // La liste à relever est tout ce qui passe les critères, dans l'ordre du
  // tri, et pas seulement la page affichée (Prix par station.dc.html:502) ;
  // moins ce qu'un relevé des mêmes dates prévoit déjà : une liste filtrée
  // grandit pendant un relevé, et la relancer referait ces stations.
  const ids = useMemo(() => triees.map((l) => l.id), [triees]);
  const aLancer = useMemo(
    () => idsALancer(ids, per, groupe, course, file),
    [ids, per, groupe, course, file],
  );
  const indice = useMemo(() => {
    if (aLancer.length > 0 || ids.length === 0) return null;
    const vues = new Set(ids);
    const enCours =
      course != null &&
      memePeriode(course.per, per) &&
      grpKey(course.groupe) === kGrp &&
      course.ids.some((id) => vues.has(id));
    return enCours ? "Relevé de cette liste en cours." : "Relevé de cette liste en attente.";
  }, [aLancer, ids, course, per, kGrp]);
  const listeFaite = filtrees.every((l) => l.res?.etat === "fait");

  const triV = triVal(tri);
  // Un clic d'en-tête peut donner un tri absent de la liste (« Nom, de Z à
  // A ») : il y entre, pour que le choix affiché dise le tri réel.
  const optionsTri = TRIS.some((o) => o.v === triV)
    ? TRIS
    : [...TRIS, { v: triV, label: triLbl(tri) }];
  const js = jetons(fl, BORNES);
  const vues = triees.slice(0, limit);

  const trier = (k: Tri["k"]) => setTri({ k, dir: tri.k === k && tri.dir === 1 ? -1 : 1 });
  const surCompte = () => refCompte.current?.focus();

  return (
    <>
      <section className="prix7__carte prix7__filtres" aria-label="Critères">
        <div className="prix7__choix">
          <label className="prix7__champ">
            <span>Trier</span>
            <select
              className="prix7__select"
              value={triV}
              onChange={(e) => setTri(lireTri(e.target.value))}
            >
              {optionsTri.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <ChoixLieu />
          <label className="prix7__case">
            <input
              type="checkbox"
              checked={fl.avecPrix}
              onChange={(e) => setFl({ avecPrix: e.target.checked })}
            />
            Avec un prix seulement
          </label>
        </div>
        <div className="prix7__plages">
          {PLAGES.map((p) => (
            <PlageFiltre key={p.k} p={p} />
          ))}
        </div>
        <div className="prix7__jetons">
          <span className="prix7__compte" ref={refCompte} tabIndex={-1}>
            {countFl(filtrees.length, STATIONS.length)}
          </span>
          {js.map((j) => (
            <button
              key={j.k}
              type="button"
              className="prix7__jeton"
              title="Retirer ce critère"
              onClick={() => {
                majFl((f) => retirerJeton(f, j.k));
                surCompte();
              }}
            >
              {j.lbl}
              <Icon name="croix" taille={11} />
            </button>
          ))}
          {filtresActifs(fl) ? (
            <button
              type="button"
              className="prix7__effacer"
              onClick={() => {
                resetFl(FL0);
                surCompte();
              }}
            >
              Tout effacer
            </button>
          ) : null}
        </div>
      </section>

      <div className="prix7__actions" ref={refActions} tabIndex={-1}>
        {passee ? (
          <span className="prix7__indice" role="status">
            Ces dates sont passées. Choisissez une arrivée à partir d’aujourd’hui.
          </span>
        ) : aLancer.length > 0 ? (
          <button
            type="button"
            className="prix7__relever"
            title="Une station prend environ une minute."
            onClick={() => {
              lancer({ nom: nomListe(fl), ids: aLancer, per, groupe });
              // Le bouton cède la place à l'indice : le focus reste dans la rangée.
              refActions.current?.focus();
            }}
          >
            {relLbl(triees.length, listeFaite)}
          </button>
        ) : indice ? (
          <span className="prix7__indice" role="status">
            {indice}
          </span>
        ) : null}
      </div>

      {course ? (
        <BandeauCourse
          course={course}
          file={file}
          onArreter={() => {
            // Sans relevé en file, le bandeau et son bouton disparaissent.
            if (file.length === 0) refActions.current?.focus();
            arreter();
          }}
        />
      ) : null}

      <section className="prix7__carte prix7__table" aria-label="Stations">
        <div role="table" aria-label="Prix par station">
          <div role="rowgroup">
            <div role="row" className="prix7__rang prix7__entete">
              {colonnes(per.nights).map(({ id, k, lbl, droite }) => {
                const on = k != null && tri.k === k;
                const cls = `prix7__tri${on ? " prix7__tri--on" : ""}${
                  droite ? " prix7__tri--droite" : ""
                }`;
                return (
                  <div
                    key={id}
                    role="columnheader"
                    aria-sort={on ? (tri.dir > 0 ? "ascending" : "descending") : undefined}
                  >
                    {k ? (
                      <button type="button" className={cls} onClick={() => trier(k)}>
                        {lbl}
                        <span className="prix7__fleche" aria-hidden="true">
                          {on ? (tri.dir > 0 ? "↑" : "↓") : ""}
                        </span>
                      </button>
                    ) : (
                      <span className={`${cls} prix7__tri--fixe`}>{lbl}</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div role="rowgroup">
            {vues.map((l) => (
              <LignePrix
                key={l.id}
                l={l}
                // Une station déjà prévue ne se relance pas une deuxième fois,
                // et des dates passées pas du tout.
                relever={
                  passee || enAttente.has(l.id)
                    ? null
                    : () => lancer({ nom: l.nom, ids: [l.id], per, groupe })
                }
              />
            ))}
          </div>
        </div>
        {triees.length === 0 ? (
          <div className="prix7__vide">
            <strong>Aucune station ne correspond à ces critères</strong>
            <span>Retirez un critère, ou effacez-les tous.</span>
          </div>
        ) : null}
        <div className="prix7__pied">
          <span>{countLbl(Math.min(limit, triees.length), triees.length)}</span>
          {triees.length > limit ? (
            <button
              type="button"
              className="prix7__pilule prix7__pilule--grande"
              onClick={() => setLimit(limit + PAGE)}
            >
              {moreLbl(triees.length - limit)}
            </button>
          ) : null}
        </div>
      </section>

      <p className="prix7__note">
        Le total est celui que l’annonce publie pour ces dates exactes. Une annonce sans capacité
        annoncée est écartée et comptée, jamais supposée assez grande. Une station sans relevé passe
        en fin de liste, dans les deux sens du tri.
      </p>
    </>
  );
}

/** L'étiquette d'une carte d'annonce et de sa fiche : la plateforme, puis la
 *  station du relevé. La liste mêle plusieurs stations, et la carte de
 *  Logements n'a pas d'autre place pour la nommer. */
function sourceDe(c: CarteAnnonce): string {
  return `${c.a.source} · ${c.stationNom}`;
}

function situee(l: Listing): boolean {
  return l.lat != null && l.lon != null;
}

/** Ce que le cadre laisse voir d'une liste, en bref : le nombre, la première
 *  et la dernière annonce. */
function signatureCadre(cartes: readonly CarteAnnonce[], b: Cadre | null): string {
  const v = b ? cartes.filter((c) => dansLesBornes(c.a, b)) : cartes;
  return `${v.length}|${v[0]?.a.id ?? ""}|${v[v.length - 1]?.a.id ?? ""}`;
}

/** « Par budget » : les annonces retenues par les relevés de ces dates et de
 *  ce groupe, filtrées par station puis par total (Prix par station.dc.html:
 *  126-164, 545-578). Sous les critères, la liste, la carte aux pastilles de
 *  prix et le volet de Logements, demandés par le propriétaire le 25 sept.
 *  2026 à la place des cartes de la maquette : une annonce s'ouvre ici, sans
 *  passer par Logements. */
function VueBudget({
  per,
  groupe,
  ouvrir,
}: {
  per: Periode;
  groupe: Groupe;
  ouvrir: (o: Onglet) => void;
}) {
  const res = usePrix((s) => s.res);
  const fl = usePrix((s) => s.fl);
  const triB = usePrix((s) => s.triB);
  const pageB = usePrix((s) => s.pageB);
  const majFl = usePrix((s) => s.majFl);
  const resetFl = usePrix((s) => s.resetFl);
  const setTriB = usePrix((s) => s.setTriB);
  const setPageB = usePrix((s) => s.setPageB);
  const lodgeId = useParcours((s) => s.lodgeId);
  const seen = useParcours((s) => s.seen);
  const go = useGo();
  const refCompte = useRef<HTMLSpanElement>(null);
  const surCompte = () => refCompte.current?.focus();
  const listeRef = useRef<HTMLDivElement>(null);
  const trav = groupe.trav;
  const nights = per.nights;
  const stay = useMemo(() => ({ checkIn: per.from, checkOut: departIso(per) }), [per]);

  // Les stations relevées pour ces dates et ce groupe : le magasin le sait sans
  // IndexedDB, et seules celles-là y sont lues, pas les 320 d'office. Les
  // critères de station s'appliquent après la lecture : lus seulement pour les
  // stations retenues, élargir un critère faisait lire une clé neuve, et la
  // liste comme la carte disparaissaient le temps de la lecture.
  const relevees = useMemo(
    () => STATIONS.filter((s) => res[cleResultat(per, groupe, s.id)]?.etat === "fait"),
    [res, per, groupe],
  );
  const cles = useMemo(
    () => relevees.map((s) => cleResultat(per, groupe, s.id)),
    [relevees, per, groupe],
  );
  const { parCle, pret, anciennes } = useAnnonces(cles);
  // Une fois la première lecture faite pour ces dates et ce groupe, l'écran ne
  // se vide plus : une station ajoutée par un autre onglet se lit sans retirer
  // la liste et la carte le temps de la lecture.
  const vueLue = `${perKey(per)}|${grpKey(groupe)}`;
  const [luePour, setLuePour] = useState<string | null>(null);
  useEffect(() => {
    if (pret) setLuePour(vueLue);
  }, [pret, vueLue]);
  const affichable = pret || luePour === vueLue;

  const avant = useMemo<CarteAnnonce[]>(
    () =>
      relevees.flatMap((s, i) =>
        passeStationSeule(s, fl, BORNES)
          ? (parCle.get(cles[i] ?? "") ?? []).map((a) => ({
              a,
              stationId: s.id,
              stationNom: s.name,
            }))
          : [],
      ),
    [relevees, cles, parCle, fl],
  );
  // Dans l'ordre du référentiel : la carte se cadre sur elles, et un autre tri
  // ne la recadre pas. Une annonce sortie des relevés de deux stations voisines
  // (même rayon de 12 km) n'y figure qu'une fois, sous la première de ses
  // stations : deux cartes d'un même logement ouvraient et retenaient la même
  // copie, et le compte le prenait deux fois.
  const filtrees = useMemo(() => {
    const vues = new Set<string>();
    return avant.filter((c) => {
      if (vues.has(c.a.id) || !passeBudget(c.a.total, fl.budget, BORNES.budget)) return false;
      vues.add(c.a.id);
      return true;
    });
  }, [avant, fl.budget]);
  const cartes = useMemo(() => [...filtrees].sort(comparateurBudget(triB)), [filtrees, triB]);
  const nStations = useMemo(() => new Set(filtrees.map((c) => c.stationId)).size, [filtrees]);
  const parId = useMemo(() => new Map(filtrees.map((c) => [c.a.id, c] as const)), [filtrees]);

  // Annonce ouverte, cadre de la carte, fiche épinglée et annonce désignée
  // restent à l'écran : ils ne valent que tant qu'on le regarde.
  const [ouverte, setOuverte] = useState<string | null>(null);
  const [cadre, setCadre] = useState<Cadre | null>(null);
  const [recadrages, setRecadrages] = useState(0);
  const [epinglee, setEpinglee] = useState<string | null>(null);
  const [actifCarte, setActifCarte] = useState<string | null>(null);

  // Le cadre visible compte toujours, comme dans Logements : liste, légende et
  // pastilles disent la même chose.
  const affichees = useMemo(
    () => (cadre ? cartes.filter((c) => dansLesBornes(c.a, cadre)) : cartes),
    [cartes, cadre],
  );
  const horsCadre = cartes.length - affichees.length;
  const nPages = Math.max(1, Math.ceil(affichees.length / PAGE_LOGEMENTS));
  const page = Math.min(pageB, nPages - 1);
  const pageItems = useMemo(
    () => affichees.slice(page * PAGE_LOGEMENTS, (page + 1) * PAGE_LOGEMENTS),
    [affichees, page],
  );

  // Le recadrage suit le résultat des filtres, pas le contenu du cadre : sinon
  // recadrer changerait la liste, qui recadrerait encore (voir Logements).
  const cadrageCalcule = useMemo(
    () =>
      `${recadrages}|${filtrees
        .filter((c) => situee(c.a))
        .map((c) => c.a.id)
        .join(",")}`,
    [filtrees, recadrages],
  );
  // Après un geste sur la carte, le cadre choisi tient jusqu’au prochain
  // changement de critère, de dates ou de groupe : pendant un relevé, chaque
  // station terminée changeait le résultat et recadrait la carte sur la France.
  // Les annonces arrivées hors du cadre se comptent dans la légende.
  const criteres = `${recadrages}|${perKey(per)}|${grpKey(groupe)}|${JSON.stringify(fl)}`;
  const [fige, setFige] = useState<{ criteres: string; cle: string } | null>(null);
  const cadrage = fige?.criteres === criteres ? fige.cle : cadrageCalcule;
  const pointsResultat = useMemo(
    () =>
      filtrees
        .filter((c) => situee(c.a))
        .map((c) => [c.a.lat as number, c.a.lon as number] as [number, number]),
    [filtrees],
  );

  // Lus par référence : les rappels restent les mêmes d'un rendu à l'autre, et
  // `memo` épargne les cartes d'annonce (même raison que dans Logements).
  const lecture = useRef({ parId, per, cadrage, cartes, criteres });
  lecture.current = { parId, per, cadrage, cartes, criteres };

  // Déplacer la carte ramène à la première page quand la liste change, comme
  // dans Logements. Mais pas quand la carte se recadre d'elle-même, au montage
  // ou sur une liste neuve : la page vient du magasin, et un retour sur
  // l'onglet doit la retrouver.
  const cadrageVu = useRef<string | null>(null);
  const cadreVu = useRef<Cadre | null>(null);
  const surCadre = useCallback((b: Cadre) => {
    const { cadrage: c, cartes: liste, criteres: crit } = lecture.current;
    const geste = cadrageVu.current === c;
    const precedent = cadreVu.current;
    cadrageVu.current = c;
    cadreVu.current = b;
    setCadre(b);
    if (geste) setFige({ criteres: crit, cle: c });
    if (geste && signatureCadre(liste, precedent) !== signatureCadre(liste, b)) {
      usePrix.getState().setPageB(0);
    }
  }, []);
  // Rendre les annonces que le cadre a laissées dehors : la carte ne recadre
  // que si la clé `cadrage` change, d'où le compteur.
  const revoirTout = useCallback(() => {
    cadreVu.current = null;
    setCadre(null);
    setRecadrages((n) => n + 1);
    usePrix.getState().setPageB(0);
  }, []);

  // Au changement de page, le focus passe à la liste, et la liste remonte sous
  // la barre du haut, sans animation quand le mouvement est réduit.
  const versListe = useRef(false);
  const allerPage = useCallback(
    (p: number) => {
      versListe.current = true;
      setPageB(p);
    },
    [setPageB],
  );
  useEffect(() => {
    if (!versListe.current) return;
    versListe.current = false;
    const el = listeRef.current;
    if (!el) return;
    el.focus({ preventScroll: true });
    const barre = document.querySelector(".v7haut")?.getBoundingClientRect().bottom ?? 0;
    const haut = el.getBoundingClientRect().top;
    if (haut < barre) {
      const reduit = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      window.scrollTo({
        top: window.scrollY + haut - barre - 12,
        behavior: reduit ? "auto" : "smooth",
      });
    }
  }, [page]);

  const ouvrirAnnonce = useCallback((id: string) => {
    useParcours.getState().markSeen(id);
    setOuverte(id);
  }, []);
  const fermerVolet = useCallback(() => setOuverte(null), []);
  // Retenir fait ce que faisait « Voir le logement » (App.dc.html:503) : la
  // station du relevé est retenue et le séjour prend les dates de la liste ;
  // on reste ici. Retenir à nouveau relâche le logement, comme dans Logements.
  const retenir = useCallback((id: string) => {
    const p = useParcours.getState();
    if (p.lodgeId === id) {
      p.chooseLodge(null);
      return;
    }
    const { parId: annonces, per: dates } = lecture.current;
    const c = annonces.get(id);
    if (!c) return;
    p.retain(c.stationId);
    useStay.getState().setStay({ checkIn: dates.from, checkOut: departIso(dates) });
    p.chooseLodge(id);
    // Le séjour porte désormais ces dates : la période le suit de nouveau.
    // Sans `setPer`, qui ramènerait la liste à sa première page.
    if (usePrix.getState().per) usePrix.setState({ per: null });
  }, []);

  // Sur la carte, comme dans Logements : les annonces de la page en cours, plus
  // la fiche épinglée, l'annonce ouverte et le logement retenu, pour qu'ils ne
  // disparaissent pas au changement de page. Pas de repère de station : la
  // liste en mêle plusieurs.
  const situees = useMemo(() => {
    const vues = new Set<string>();
    const out: Listing[] = [];
    const designees = [epinglee, ouverte, lodgeId].map((id) => (id ? parId.get(id)?.a : undefined));
    for (const l of [...pageItems.map((c) => c.a), ...designees]) {
      if (!l || vues.has(l.id) || !situee(l)) continue;
      vues.add(l.id);
      out.push(l);
    }
    return out;
  }, [pageItems, parId, epinglee, ouverte, lodgeId]);
  const marqueurs = useMemo(
    () =>
      situees.map((l) => {
        const sel = l.id === ouverte || l.id === lodgeId;
        const etat = sel ? "retenue" : seen[l.id] ? "vue" : "normale";
        return {
          id: l.id,
          lat: l.lat as number,
          lon: l.lon as number,
          nom: l.title,
          epingle: epinglePrix(prixPin(l), l.title, etat),
          zIndex: sel ? ETAGE.designee : ETAGE.normale,
        };
      }),
    [situees, ouverte, lodgeId, seen],
  );

  const js = jetonsBudget(fl, BORNES);
  // Une station relevée dont IndexedDB a perdu les annonces (base effacée,
  // navigation privée) ne compte pas : tout lu et rien trouvé, il n'y a pas de
  // relevé à montrer.
  const aucunReleve = relevees.length === 0 || (pret && parCle.size === 0);
  const vide = videBudget(aucunReleve, avant.length);
  const annonceOuverte = ouverte ? (parId.get(ouverte) ?? null) : null;
  const ouverteRetenue = annonceOuverte != null && lodgeId === annonceOuverte.a.id;

  return (
    <>
      <section className="prix7__carte prix7__filtres" aria-label="Critères">
        <div className="prix7__budget">
          <PlageFiltre p={PLAGE_BUDGET} />
          <div className="prix7__choix prix7__choix--budget">
            <label className="prix7__champ">
              <span>Trier</span>
              <select
                className="prix7__select"
                value={triB}
                onChange={(e) => setTriB(lireTriB(e.target.value))}
              >
                {TRIS_B.map((o) => (
                  <option key={o.v} value={o.v}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <ChoixLieu />
          </div>
        </div>
        <div className="prix7__plages prix7__plages--trois">
          {PLAGES_STATION.map((p) => (
            <PlageFiltre key={p.k} p={p} />
          ))}
        </div>
        <div className="prix7__jetons">
          {/* Rien tant que les annonces se lisent : « 0 logement » serait faux. */}
          <span className="prix7__compte" ref={refCompte} tabIndex={-1}>
            {affichable ? countBudget(cartes.length, nStations) : ""}
          </span>
          {js.map((j) => (
            <button
              key={j.k}
              type="button"
              className="prix7__jeton"
              title="Retirer ce critère"
              onClick={() => {
                majFl((f) => retirerJeton(f, j.k));
                surCompte();
              }}
            >
              {j.lbl}
              <Icon name="croix" taille={11} />
            </button>
          ))}
          {filtresActifsBudget(fl) ? (
            <button
              type="button"
              className="prix7__effacer"
              onClick={() => {
                resetFl(effacerBudget(fl));
                surCompte();
              }}
            >
              Tout effacer
            </button>
          ) : null}
        </div>
      </section>

      {/* Les relevés d'avant le 25 septembre 2026 ne gardaient pas la position
          des logements : sans le dire, la carte vide et « GPS manquant » sur
          chaque carte laisseraient croire à une panne. */}
      {affichable && anciennes > 0 ? (
        <p className="prix7__note">
          {anciennes > 1
            ? `${anciennes} stations ont été relevées avant le 25 septembre : leurs logements n’ont pas de position enregistrée, donc pas de pastille sur la carte. Relevez-les à nouveau dans l’onglet Par station pour les y voir.`
            : "Une station a été relevée avant le 25 septembre : ses logements n’ont pas de position enregistrée, donc pas de pastille sur la carte. Relevez-la à nouveau dans l’onglet Par station pour les y voir."}
        </p>
      ) : null}

      {!affichable ? null : cartes.length > 0 ? (
        <div className="v7deux">
          <div
            className="v7deux__liste"
            ref={listeRef}
            tabIndex={-1}
            aria-label="Logements de la page"
          >
            {affichees.length > 0 ? (
              <>
                <div className="grille7-2">
                  {pageItems.map((c) => (
                    <CarteLogement
                      key={`${c.stationId}|${c.a.id}`}
                      l={c.a}
                      sources={sourceDe(c)}
                      autres={null}
                      retenu={lodgeId === c.a.id ? c.a.id : null}
                      retenuSource={null}
                      vue={!!seen[c.a.id]}
                      vif={actifCarte === c.a.id}
                      stay={stay}
                      trav={trav}
                      nights={nights}
                      ouvrir={ouvrirAnnonce}
                      retenir={retenir}
                      designer={setActifCarte}
                    />
                  ))}
                </div>
                {nPages > 1 ? <Pages page={page} n={nPages} aller={allerPage} /> : null}
              </>
            ) : (
              <Vide
                titre="Aucune annonce dans ce cadrage"
                actions={
                  <button type="button" className="btn7" onClick={revoirTout}>
                    Revoir toutes les annonces
                  </button>
                }
              >
                La liste suit la carte. Déplacez-la, dézoomez ou revenez au cadrage des résultats.
              </Vide>
            )}
          </div>
          <div className="v7deux__carte">
            <CarteEpingles
              marqueurs={marqueurs}
              cadrage={cadrage}
              cadrerSur={pointsResultat}
              surFixe={setEpinglee}
              maxZoom={14}
              surBornes={surCadre}
              actif={actifCarte}
              surActif={setActifCarte}
              ficheDe={(id) => {
                const c = parId.get(id);
                if (!c) return null;
                return (
                  <FicheEpingle
                    l={c.a}
                    sources={sourceDe(c)}
                    stay={stay}
                    trav={trav}
                    nights={nights}
                  />
                );
              }}
              actionsDe={(id) => {
                if (!parId.has(id)) return null;
                const r = lodgeId === id;
                return (
                  <>
                    <button type="button" className="btn7" onClick={() => ouvrirAnnonce(id)}>
                      Voir l’annonce
                    </button>
                    <button
                      type="button"
                      className="btn7 btn7--fantome"
                      aria-pressed={r}
                      onClick={() => retenir(id)}
                    >
                      {r ? "Retenu" : "Retenir"}
                    </button>
                  </>
                );
              }}
              legende={
                <>
                  <b>
                    {nPages > 1 ? `Page ${page + 1} sur ${nPages} · ` : ""}
                    {plur(affichees.length, "logement", "logements")} dans le cadre
                  </b>
                  {horsCadre > 0 ? (
                    <button type="button" className="carte7__revoir" onClick={revoirTout}>
                      {cartes.length > 1
                        ? `Revoir les ${cartes.length} logements`
                        : "Revoir le logement"}
                      <Icon name="fleche-droite" taille={14} />
                    </button>
                  ) : null}
                </>
              }
            />
          </div>
        </div>
      ) : (
        <div className="prix7__carte prix7__vide prix7__vide--budget">
          <strong>{vide.titre}</strong>
          <span>{vide.hint}</span>
          {vide.versStation ? (
            <button
              type="button"
              className="prix7__pilule prix7__pilule--grande"
              onClick={() => ouvrir("station")}
            >
              Ouvrir l’onglet Par station
            </button>
          ) : null}
        </div>
      )}

      {annonceOuverte ? (
        <VoletAnnonce
          l={annonceOuverte.a}
          stay={stay}
          trav={trav}
          nights={nights}
          groupe={null}
          retenu={ouverteRetenue}
          onRetenir={() => retenir(annonceOuverte.a.id)}
          onFermer={fermerVolet}
          onVoirOffre={ouvrirAnnonce}
          suite={
            // Réservation retrouve ce logement par `resolveListing`, qui fait
            // passer devant la copie tarifée pour les dates du séjour : celle
            // relevée ici, que Retenir vient de poser.
            ouverteRetenue ? (
              <button
                type="button"
                className="btn7 btn7--grand btn7--pleine"
                onClick={() => void go("booking")}
              >
                Passer à la réservation
                <Icon name="fleche-droite" taille={16} />
              </button>
            ) : null
          }
        />
      ) : null}
    </>
  );
}

/** Une ligne du tableau. La colonne Relevé dit l'état de la course avant la
 *  date du dernier relevé ; « partiel » nomme en clair les sources qui n'ont
 *  pas répondu (au clavier et au toucher, un `title` ne se lit pas), et le
 *  survol en redonne la liste entière quand la colonne la coupe. */
function LignePrix({ l, relever }: { l: Ligne; relever: (() => void) | null }) {
  const refReleve = useRef<HTMLDivElement>(null);
  const ecartees = annSub(l.res);
  const partiel = l.res?.etat === "fait" ? l.res.partiel : [];
  const releve =
    l.etat === "en-cours" ? "en cours" : l.etat === "attente" ? "en attente" : releveLbl(l.res);
  const boutonRelever =
    relever && (l.etat === "non-releve" || l.etat === "echec") ? (
      <button
        type="button"
        className="prix7__pilule prix7__pilule--ligne"
        aria-label={`Relever ${l.nom}`}
        onClick={() => {
          relever();
          // Le bouton disparaît : le focus passe à l'état du relevé, qui
          // dit désormais « en cours » ou « en attente ».
          refReleve.current?.focus();
        }}
      >
        Relever
      </button>
    ) : null;
  return (
    <div role="row" className="prix7__rang prix7__ligne">
      <div role="cell" className="prix7__station">
        <span className="prix7__nom">{l.nom}</span>
        <span className="prix7__massif">{l.subMassif}</span>
      </div>
      <div role="cell" className="prix7__annonces">
        <span className={`prix7__n${l.n == null ? " prix7__n--absent" : ""}`}>
          {l.n == null ? "" : plur(l.n, "logement", "logements")}
        </span>
        <span className="prix7__ecartes" title={ecartees || undefined}>
          {ecartees}
        </span>
      </div>
      <div role="cell" className="prix7__releve" ref={refReleve} tabIndex={-1}>
        <span>{releve}</span>
        {partiel.length > 0 ? (
          <span className="prix7__partiel" title={`Sans réponse : ${partiel.join(", ")}.`}>
            {partielLbl(partiel)}
          </span>
        ) : null}
      </div>
      <div role="cell" className="prix7__valeur">
        {l.etat === "prix" ? (
          <span className="prix7__prix">{eur(l.med)}</span>
        ) : l.etat === "en-cours" ? (
          <span className="prix7__etat prix7__etat--encours">Relevé en cours</span>
        ) : l.etat === "attente" ? (
          <span className="prix7__etat">En attente</span>
        ) : l.etat === "peu" ? (
          <>
            <span className="prix7__etat">Pas assez d’annonces</span>
            <span className="prix7__sous">Il en faut {MIN_ANNONCES} pour une médiane</span>
          </>
        ) : l.etat === "echec" ? (
          <>
            <span className="prix7__etat">Relevé impossible</span>
            {l.res?.etat === "echec" ? <span className="prix7__sous">{l.res.raison}</span> : null}
            {boutonRelever}
          </>
        ) : (
          <>
            <span className="prix7__etat">Non relevé</span>
            {boutonRelever}
          </>
        )}
      </div>
    </div>
  );
}

/** Ce que la course attend avant sa prochaine station. */
function suiteAttente(a: NonNullable<Course["attente"]>, nom: string | null, now: number): string {
  const reste = a.jusqua == null ? null : dureeLbl(Math.max(0, a.jusqua - now));
  switch (a.motif) {
    case "refus":
      return reste
        ? ` · Airbnb demande une pause, reprise dans ${reste}`
        : " · Airbnb demande une pause";
    case "arret":
      return nom ? ` · ${nom} après la fin du relevé arrêté` : "";
    case "logements":
      return nom ? ` · ${nom} après la recherche en cours dans Logements` : "";
    case "rythme":
      return nom ? (reste ? ` · ${nom} dans ${reste}` : ` · ${nom} en attente`) : "";
  }
}

/** Le relevé en cours, quelle que soit la période affichée. Pendant une
 *  attente du créneau Airbnb, le reste se décompte à la seconde : le composant
 *  porte sa propre horloge, pour ne pas redessiner le tableau chaque seconde. */
function BandeauCourse({
  course,
  file,
  onArreter,
}: {
  course: Course;
  file: readonly Job[];
  onArreter: () => void;
}) {
  const jusqua = course.attente?.jusqua ?? null;
  const [now, setNow] = useState(() => Date.now());
  // Avant la peinture : l'horloge arrêtée depuis la dernière attente
  // afficherait, le temps d'une image, un reste gonflé de plusieurs minutes.
  useLayoutEffect(() => {
    if (jusqua == null) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [jusqua]);

  const total = course.ids.length;
  const nom = NOMS.get(course.ids[course.i] ?? "") ?? null;
  const suite = course.attente
    ? suiteAttente(course.attente, nom, now)
    : nom
      ? ` · ${nom} en cours`
      : "";

  return (
    <div className="prix7__course">
      <div className="prix7__course-corps">
        <div className="prix7__course-tete">
          <strong className="prix7__course-titre">
            Relevé : {course.nom}, {perLbl(course.per)}
          </strong>
          <span className="prix7__course-sous">
            {course.i} sur {total}
            {suite}
          </span>
        </div>
        <div
          className="prix7__jauge"
          role="progressbar"
          aria-label="Stations relevées"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={course.i}
        >
          <i style={{ width: `${total ? (course.i / total) * 100 : 0}%` }} />
        </div>
        {file.length > 0 ? (
          <span className="prix7__course-file">
            Ensuite : {file.map((j) => `${j.nom} (${perLbl(j.per)})`).join(", ")}.
          </span>
        ) : null}
      </div>
      <button type="button" className="prix7__arreter" onClick={onArreter}>
        Arrêter
      </button>
    </div>
  );
}
