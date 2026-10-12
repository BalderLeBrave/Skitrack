/** Prix (Skitrack App.dc.html:564-600, script 1187-1196 et 1213-1230).
 *
 *  Deux vues d'une même période et d'un même groupe. « Par station » : la
 *  médiane du total publié, station par station ; les relevés sont réels, une
 *  station à la fois, et continuent quand on quitte l'écran
 *  (`@/lib/prix/releve`). « Par budget » : les annonces que ces mêmes relevés
 *  ont retenues (`@/lib/prix/annonces`), filtrées par le total du séjour, en
 *  cartes Airbnb à côté de la carte aux pastilles de prix.
 *
 *  La période suit le séjour tant qu'on ne la change pas ici ; le groupe est
 *  celui du séjour. Vue, critères, tris et pages vivent dans le magasin :
 *  changer d'onglet, ou passer par Réservation et revenir, ne perd rien. Les
 *  critères qui ne tiennent pas dans la barre de la maquette sont dans la
 *  fenêtre « Filtres ». */

import { createFileRoute, Link } from "@tanstack/react-router";
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
import { textesCarte } from "@/components/favoris/annonceCarte";
import { FlecheTri } from "@/components/favoris/communs";
import {
  BoutonFiltres,
  CarteAnnonce as CarteMaquette,
  IconeDroite,
  IconeGauche,
  Interrupteur,
  ModaleFiltres,
  PuceCritere,
  SectionFiltre,
  Trace,
  useEnregistrement,
} from "@/components/maquette";
import { useFermeture } from "@/components/v7/fermeture";
import { useGo } from "@/components/v6/go";
import { CarteEpingles } from "@/components/v7/CarteEpingles";
import { PAGE_LOGEMENTS } from "@/components/v7/CarteLogement";
import { epinglePrix, ETAGE } from "@/components/v7/epingle";
import { FicheEpingle } from "@/components/v7/FicheEpingle";
import { Fourchette } from "@/components/v7/Fourchette";
import { SensTri } from "@/components/v7/SensTri";
import { Pages } from "@/components/v7/Pages";
import { VoletAnnonce } from "@/components/v7/VoletAnnonce";
import { dansLesBornes, type Bornes as Cadre } from "@/lib/carte";
import type { Listing } from "@/lib/listings";
import { datesCourtes, eur, fmt, groupLbl, nuitsLbl, useParcours, useSejour } from "@/lib/parcours";
import { useAnnonces } from "@/lib/prix/annonces";
import { resultatsALaLecture } from "@/lib/prix/recompte";
import {
  annSub,
  avecNuits,
  bornesPlages,
  choisirDept,
  choisirDomaine,
  choisirMassif,
  choisirStation,
  cleDeLecture,
  comparateur,
  comparateurBudget,
  countBudget,
  countFl,
  countLbl,
  decaler,
  departIso,
  dureeLbl,
  ecartLbl,
  effacerBudget,
  estPassee,
  FL0,
  filtresActifs,
  filtresActifsBudget,
  filtrerCartes,
  grpKey,
  idsALancer,
  toutesALancer,
  jetons,
  jetonsBudget,
  lieuSansReleve,
  ligne,
  lireTri,
  lireTriB,
  memePeriode,
  MIN_ANNONCES,
  moreLbl,
  nomListe,
  nomsDistincts,
  NUITS_MAX,
  NUITS_MIN,
  logementsBudget,
  logementsReleves,
  bascule,
  optionsDomaine,
  optionsStation,
  ordreMassifs,
  PAGE,
  partielLbl,
  passe,
  passeStationSeule,
  perKey,
  perLbl,
  periodeDuSejour,
  PLAGE_BUDGET,
  PLAGES,
  PLAGES_LOGEMENT,
  PLAGES_STATION,
  plageLbl,
  poserBorne,
  relLbl,
  relToutesLbl,
  dureeReleveLbl,
  releveLbl,
  retirerJeton,
  sourcesBudget,
  triParEnTete,
  TRIS,
  TRIS_B,
  versLogement,
  videBudget,
  type CarteAnnonce,
  type DefPlage,
  type Groupe,
  type Job,
  type Ligne,
  type LogementBudget,
  type Periode,
  type Resultat,
  type Tri,
} from "@/lib/prix/calcul";
import { usePrix, type Course, type Onglet } from "@/lib/prix/releve";
import { nomStationPropre, sourceEtLieu } from "@/lib/rattachement";
import { useStay } from "@/lib/stay";
import { todayIso } from "@/lib/stay/calendar";
import { voisinDansListe } from "@/lib/stay/visionneuse";
import { stationDuLogement } from "@/lib/stay/parStation";
import { useBudgetForfaits } from "@/components/v7/usePrixForfait";
import { adults, clampChildren, clampRooms, clampTravelers } from "@/lib/stay/party";
import { STATIONS, type Station } from "@/lib/stations";
import { prixPin, villageM } from "@/lib/v7";
import { useIdsFavoris } from "@/lib/favoris/store";
import { useAltitudes } from "@/lib/altitude/store";
import { aTraduire, dire, tr, trN } from "@/lib/i18n";

export const Route = createFileRoute("/prix")({ component: Prix });

/* Le référentiel ne change pas pendant la vie de l'écran : bornes des
   curseurs, ordre des massifs et options de massif se calculent une fois. */
const BORNES = bornesPlages(STATIONS);
const MASSIFS = ordreMassifs(STATIONS);
const RANG_MASSIF: ReadonlyMap<string, number> = new Map(MASSIFS.map((m, i) => [m, i]));
const NOMS: ReadonlyMap<string, string> = new Map(STATIONS.map((s) => [s.id, s.name]));
/** Pour le choix de station et son jeton : deux « Praloup » s'y distinguent. */
const NOMS_DISTINCTS: ReadonlyMap<string, string> = nomsDistincts(STATIONS);
const OPTIONS_MASSIF = [
  { v: "", label: `Tous · ${STATIONS.length}` },
  ...MASSIFS.map((m) => ({
    v: m,
    label: `${m} · ${STATIONS.filter((s) => s.massif === m).length}`,
  })),
];

/* (Prix par station.dc.html:544) */
const ONGLETS: readonly { v: Onglet; lbl: string }[] = [
  { v: "station", lbl: aTraduire("Par station") },
  { v: "budget", lbl: aTraduire("Par budget") },
];
const idOnglet = (o: Onglet) => `prix-onglet-${o}`;
const idVue = (o: Onglet) => `prix-vue-${o}`;

/** Les départements du massif choisi, ou de tous, comptés dans ce même
 *  ensemble (Prix par station.dc.html:591). « Tous » n'a pas de compte. */
function optionsDept(massifs: readonly string[]): { v: string; label: string }[] {
  const pool = massifs.length > 0 ? STATIONS.filter((s) => massifs.includes(s.massif)) : STATIONS;
  const compte = new Map<string, number>();
  for (const s of pool) if (s.dept) compte.set(s.dept, (compte.get(s.dept) ?? 0) + 1);
  return [
    { v: "", label: tr("Tous") },
    ...[...compte.keys()]
      .sort((a, b) => a.localeCompare(b, "fr"))
      .map((d) => ({ v: d, label: `${d} · ${compte.get(d)}` })),
  ];
}

/** En-têtes du tableau : la date du relevé et l'altitude du village ne se
 *  trient pas, la médiane se range à droite (Skitrack App.dc.html:1220). */
type Colonne = { id: string; k: Tri["k"] | null; lbl: string; droite?: boolean };

function colonnes(nights: number): Colonne[] {
  return [
    { id: "station", k: "nom", lbl: tr("Station") },
    { id: "logements", k: "n", lbl: tr("Logements") },
    { id: "village", k: null, lbl: tr("Village") },
    { id: "releve", k: null, lbl: tr("Mis à jour") },
    { id: "mediane", k: "med", lbl: tr("Prix médian · {nuits}", { nuits: nuitsLbl(nights) }), droite: true },
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
        <main className="px-main" id="s-prix" data-screen-label="Prix">
          <h1 className="m8-lu-seul">{dire("nav.prices")}</h1>
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
    <main className="px-main" id="s-prix" data-screen-label="Prix">
      <h1 className="m8-lu-seul">{dire("nav.prices")}</h1>
      <div className="px-barre">
        <div role="tablist" aria-label={tr("Vue")} className="m8-onglets">
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
                className={`m8-onglet${on ? " m8-onglet--on" : ""}`}
                onClick={() => setOnglet(o.v)}
                onKeyDown={(e) => clavierOnglets(e, i)}
              >
                {tr(o.lbl)}
              </button>
            );
          })}
        </div>

        {/* La période : un jour de plus ou de moins, ou une arrivée choisie au
            calendrier sous le libellé. Pas de relevé pour des dates passées :
            l'arrivée ne descend pas sous aujourd'hui. */}
        <div className="px-pas" role="group" aria-label={tr("Arrivée")}>
          <button
            type="button"
            className="px-pas__rond"
            title={tr("Un jour plus tôt")}
            aria-label={tr("Un jour plus tôt")}
            disabled={per.from <= auj}
            onClick={() => poserPer(decaler(per, -1))}
          >
            <IconeGauche taille={12} epaisseur={2.4} />
          </button>
          <label className="px-periode">
            <span className="px-periode__lbl" aria-hidden>
              {datesCourtes(per.from, departIso(per))}
            </span>
            <input
              ref={refDate}
              id="prix-arrivee"
              type="date"
              className="px-periode__date"
              aria-label={tr("Arrivée")}
              min={auj}
              value={saisie ?? per.from}
              onClick={(e) => {
                const el = e.currentTarget;
                try {
                  if ("showPicker" in el) el.showPicker();
                } catch {
                  // Sans calendrier natif, le champ se tape.
                }
              }}
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
          </label>
          <button
            type="button"
            className="px-pas__rond"
            title={tr("Un jour plus tard")}
            aria-label={tr("Un jour plus tard")}
            onClick={() => poserPer(decaler(per, 1))}
          >
            <IconeDroite taille={12} epaisseur={2.4} />
          </button>
        </div>

        <div className="px-pas" role="group" aria-label={tr("Nuits")}>
          <button
            type="button"
            className="px-pas__rond"
            title={tr("Une nuit de moins")}
            aria-label={tr("Une nuit de moins")}
            disabled={per.nights <= NUITS_MIN}
            onClick={() => poserPer(avecNuits(per, per.nights - 1))}
          >
            <Trace d="M5 12h14" taille={12} epaisseur={2.4} />
          </button>
          <span className="px-pas__val px-pas__val--nuits" aria-live="polite">
            {nuitsLbl(per.nights)}
          </span>
          <button
            type="button"
            className="px-pas__rond"
            title={tr("Une nuit de plus")}
            aria-label={tr("Une nuit de plus")}
            disabled={per.nights >= NUITS_MAX}
            onClick={() => poserPer(avecNuits(per, per.nights + 1))}
          >
            <Trace d="M12 5v14M5 12h14" taille={12} epaisseur={2.4} />
          </button>
        </div>

        <span className="px-groupe" title={tr("Le groupe se change dans votre séjour")}>
          {groupLbl(trav, rooms, enfants)}
        </span>

        {!memePeriode(per, sejour) ? (
          <button
            type="button"
            className="px-revenir"
            title={ecartLbl(sejour)}
            onClick={() => {
              // Le bouton disparaît avec l'écart : le focus passe à l'arrivée.
              poserPer(null);
              refDate.current?.focus();
            }}
          >
            {tr("Revenir à mes dates")}
          </button>
        ) : null}
      </div>

      {/* Les deux panneaux existent, pour que chaque onglet désigne le sien ;
            seul l'ouvert porte un contenu, et lui seul lit les annonces. */}
      {ONGLETS.map((o) =>
        o.v === onglet ? (
          <div
            key={o.v}
            role="tabpanel"
            id={idVue(o.v)}
            aria-labelledby={idOnglet(o.v)}
            className="px-vue"
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

/**
 * Un lieu qui se choisit à plusieurs (demande du propriétaire, 3 octobre
 * 2026) : un bouton qui dit le choix (« Tous », le nom, ou « 2 massifs »), et
 * une liste de cases à cocher, comptées comme les menus d'avant. La case
 * « Tous » vide le choix.
 */
function ChoixMultiple({
  titre,
  vide,
  pluriel,
  options,
  valeurs,
  onChange,
}: {
  titre: string;
  vide: string;
  /** « 2 massifs », « 3 stations » : le compte des choix, déjà écrit. */
  pluriel: string;
  options: readonly { v: string; label: string }[];
  valeurs: readonly string[];
  onChange: (valeurs: string[]) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const hote = useRef<HTMLDivElement>(null);
  const fermer = useCallback(() => setOuvert(false), []);
  useFermeture(ouvert, fermer, hote);
  const choix = options.filter((o) => o.v !== "");
  // Le nom seul, sans son compte (« Savoie · 23 »).
  const nom = (v: string) => choix.find((o) => o.v === v)?.label.replace(/ · \d+$/, "") ?? v;
  const resume = valeurs.length === 0 ? vide : valeurs.length === 1 ? nom(valeurs[0]) : pluriel;
  return (
    <div className="px-champ px-multi" ref={hote}>
      <span>{titre}</span>
      <button
        type="button"
        className="px-select px-multi__bouton"
        aria-haspopup="true"
        aria-expanded={ouvert}
        onClick={() => setOuvert((o) => !o)}
      >
        {resume}
        <Trace d="m6 9 6 6 6-6" taille={12} epaisseur={2.2} />
      </button>
      {ouvert ? (
        <div className="px-multi__liste" role="group" aria-label={titre}>
          <label className="px-multi__option">
            <input type="checkbox" checked={valeurs.length === 0} onChange={() => onChange([])} />
            <span>{vide}</span>
          </label>
          {choix.map((o) => (
            <label key={o.v} className="px-multi__option">
              <input type="checkbox" checked={valeurs.includes(o.v)} onChange={() => onChange(bascule(valeurs, o.v))} />
              <span>{o.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Massifs et départements, les mêmes dans les deux vues
 *  (Prix par station.dc.html:58-59, 141-142). */
function ChoixLieu() {
  const massif = usePrix((s) => s.fl.massif);
  const dept = usePrix((s) => s.fl.dept);
  const majFl = usePrix((s) => s.majFl);
  const deptOpts = useMemo(() => optionsDept(massif), [massif]);
  return (
    <>
      <ChoixMultiple
        titre={tr("Massif")}
        vide={tr("Tous")}
        pluriel={tr("{n} massifs", { n: massif.length })}
        options={OPTIONS_MASSIF}
        valeurs={massif}
        // D'autres massifs : les départements, domaines et stations qui n'y tiennent plus s'en vont.
        onChange={(v) => majFl((f) => choisirMassif(f, v))}
      />
      <ChoixMultiple
        titre={tr("Département")}
        vide={tr("Tous")}
        pluriel={tr("{n} départements", { n: dept.length })}
        options={deptOpts}
        valeurs={dept}
        onChange={(v) => majFl((f) => choisirDept(f, v))}
      />
    </>
  );
}

/** Domaine skiable et station : les choix de lieu propres à l'onglet budget
 *  (demande du propriétaire, 25 sept. 2026). Les domaines sont ceux du
 *  référentiel dans le massif et le département choisis ; les stations, celles
 *  relevées pour ces dates et ce groupe. La distance aux remontées, qui
 *  s'y choisissait par paliers, est une fourchette avec les autres
 *  (`PLAGES_LOGEMENT`). */
function ChoixStation({ relevees }: { relevees: readonly Station[] }) {
  const massif = usePrix((s) => s.fl.massif);
  const dept = usePrix((s) => s.fl.dept);
  const domaine = usePrix((s) => s.fl.domaine);
  const station = usePrix((s) => s.fl.station);
  const majFl = usePrix((s) => s.majFl);
  const domaines = useMemo(() => optionsDomaine(STATIONS, massif, dept), [massif, dept]);
  const stations = useMemo(
    () => optionsStation(relevees, { massif, dept, domaine, station }, NOMS_DISTINCTS),
    [relevees, massif, dept, domaine, station],
  );
  return (
    <>
      <ChoixMultiple
        titre={tr("Domaine skiable")}
        vide={tr("Tous")}
        pluriel={tr("{n} domaines", { n: domaine.length })}
        options={domaines}
        valeurs={domaine}
        onChange={(v) => majFl((f) => choisirDomaine(f, v))}
      />
      <ChoixMultiple
        titre={tr("Station")}
        vide={tr("Toutes")}
        pluriel={tr("{n} stations", { n: station.length })}
        options={stations}
        valeurs={station}
        onChange={(v) => majFl((f) => choisirStation(f, v))}
      />
    </>
  );
}

/** Une fourchette de critère. La mise à jour part de l'état courant du
 *  magasin : un même geste peut poser deux bornes (un brouillon validé à la
 *  sortie du champ, puis la poignée). Une borne tapée garde sa valeur. */
function PlageFiltre({ p }: { p: DefPlage }) {
  const valeur = usePrix((s) => s.fl[p.k]);
  const majFl = usePrix((s) => s.majFl);
  const b = BORNES[p.k];
  return (
    <Fourchette
      lbl={tr(p.lbl)}
      bornes={b}
      valeur={valeur}
      pas={p.pas}
      unite={p.unite === "pers." ? tr("pers.") : p.unite === "ch." ? tr("ch.") : p.unite}
      resume={plageLbl(p.k, valeur, b)}
      onPoser={(which, v, exact) =>
        majFl((f) => ({ ...f, [p.k]: poserBorne(f[p.k], b, p.pas, which, v, exact) }))
      }
    />
  );
}

/**
 * Les résultats de ces dates et de ce groupe, **recomptés à la lecture**
 * (`resultatsALaLecture`), sans rien écrire : chaque relevé sur ses seules
 * annonces, celles que l'onglet « Par budget » montre sous la même clé. Le
 * temps de la lecture, les résultats enregistrés.
 */
function useResultatsRecomptes(per: Periode, groupe: Groupe): Record<string, Resultat> {
  const res = usePrix((s) => s.res);
  const prefixe = `${perKey(per)}|${grpKey(groupe)}|`;
  const cles = useMemo(
    () => Object.keys(res).filter((k) => k.startsWith(prefixe) && res[k]?.etat === "fait"),
    [res, prefixe],
  );
  const { parCle } = useAnnonces(cles);
  return useMemo(() => resultatsALaLecture(parCle, res), [parCle, res]);
}

/** « Par station » : critères, relevé, tableau (Prix par station.dc.html:54-125). */
function VueStation({ per, groupe }: { per: Periode; groupe: Groupe }) {
  const res = useResultatsRecomptes(per, groupe);
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
        l: ligne(s, res[cleDeLecture(res, per, groupe, s.id)] ?? null, {
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
    return enCours ? tr("Relevé de cette liste en cours.") : tr("Relevé de cette liste en attente.");
  }, [aLancer, ids, course, per, kGrp]);
  const listeFaite = filtrees.every((l) => l.res?.etat === "fait");

  // « Prix connus seulement » a son interrupteur dans la barre : sa puce ne
  // se répète pas à côté.
  const js = jetons(fl, BORNES).filter((j) => j.k !== "avecPrix");
  const vues = triees.slice(0, limit);
  const [filtres, setFiltres] = useState(false);

  const trier = (k: Tri["k"]) => setTri(triParEnTete(tri, k));
  const surCompte = () => refCompte.current?.focus();

  return (
    <>
      <div className="px-ligne">
        <button
          type="button"
          role="switch"
          aria-checked={fl.avecPrix}
          className="px-bascule"
          onClick={() => setFl({ avecPrix: !fl.avecPrix })}
        >
          <Interrupteur on={fl.avecPrix} />
          {tr("Prix connus seulement")}
        </button>
        <BoutonFiltres n={js.length} onClick={() => setFiltres(true)} />
        {js.map((j) => (
          <PuceCritere
            key={`${j.k}|${j.v ?? ""}`}
            label={j.lbl}
            onRetirer={() => {
              majFl((f) => retirerJeton(f, j.k, j.v));
              surCompte();
            }}
          />
        ))}
        {filtresActifs(fl) ? (
          <button
            type="button"
            className="m8-lien-fort px-effacer"
            onClick={() => {
              resetFl(FL0);
              surCompte();
            }}
          >
            {tr("Tout effacer")}
          </button>
        ) : null}
        <span className="px-compte" ref={refCompte} tabIndex={-1}>
          {countFl(filtrees.length, STATIONS.length)}
        </span>
        <div className="px-actions" ref={refActions} tabIndex={-1}>
          {passee ? (
            <span className="px-indice" role="status">
              {tr("Ces dates sont passées. Choisissez une arrivée à partir d’aujourd’hui.")}
            </span>
          ) : aLancer.length > 0 ? (
            <button
              type="button"
              className="px-relever"
              title={`${relLbl(triees.length, listeFaite)} · ${tr("Une station prend environ une minute.")}`}
              onClick={() => {
                lancer({ nom: nomListe(fl), ids: aLancer, per, groupe });
                // Le bouton cède la place à l'indice : le focus reste dans la rangée.
                refActions.current?.focus();
              }}
            >
              {trN(aLancer.length, "Mettre à jour {n} station", "Mettre à jour {n} stations")}
            </button>
          ) : indice ? (
            <span className="px-indice" role="status">
              {indice}
            </span>
          ) : null}
        </div>
      </div>

      {course ? (
        <BandeauCourse
          course={course}
          file={file}
          onArreter={() => {
            // Sans relevé en file, le bandeau et son bouton disparaissent.
            if (file.every((j) => estPassee(j.per, todayIso()))) refActions.current?.focus();
            arreter();
          }}
        />
      ) : null}

      <section className="px-table" aria-label={tr("Stations")}>
        <div role="table" aria-label={tr("Prix par station")} className="px-table__defile">
          <div role="rowgroup">
            <div role="row" className="px-rang px-rang--tete">
              {colonnes(per.nights).map(({ id, k, lbl, droite }) => {
                const on = k != null && tri.k === k;
                const cls = `px-tri${on ? " px-tri--on" : ""}${droite ? " px-tri--droite" : ""}`;
                return (
                  <div
                    key={id}
                    role="columnheader"
                    aria-sort={on ? (tri.dir > 0 ? "ascending" : "descending") : undefined}
                    className={droite ? "px-cell--droite" : undefined}
                  >
                    {k ? (
                      <button type="button" className={cls} onClick={() => trier(k)}>
                        {lbl}
                        {on ? <FlecheTri sens={tri.dir > 0 ? 1 : -1} /> : null}
                      </button>
                    ) : (
                      <span className={cls}>{lbl}</span>
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
          <div className="px-vide px-vide--table">
            <b>{tr("Aucune station ne correspond à ces critères")}</b>
          </div>
        ) : null}
        {triees.length > limit ? (
          <div className="px-pied">
            <span>{countLbl(Math.min(limit, triees.length), triees.length)}</span>
            <button type="button" className="px-pilule" onClick={() => setLimit(limit + PAGE)}>
              {moreLbl(triees.length - limit)}
            </button>
          </div>
        ) : null}
      </section>

      {filtres ? (
        <ModaleFiltres
          onFermer={() => setFiltres(false)}
          onEffacer={() => resetFl(FL0)}
          cta={trN(filtrees.length, "Afficher {n} station", "Afficher {n} stations")}
        >
          <SectionFiltre
            titre={tr("Trier")}
            aside={
              <SensTri sens={tri.dir} alpha={tri.k === "nom"} onChange={(dir) => setTri({ ...tri, dir })} />
            }
          >
            <select
              className="px-select"
              aria-label={tr("Trier")}
              value={tri.k}
              onChange={(e) => setTri(lireTri(e.target.value))}
            >
              {TRIS.map((o) => (
                <option key={o.k} value={o.k}>
                  {tr(o.label)}
                </option>
              ))}
            </select>
          </SectionFiltre>
          <SectionFiltre titre={tr("Lieu")}>
            <div className="px-choix">
              <ChoixLieu />
            </div>
          </SectionFiltre>
          <SectionFiltre titre={tr("Prix et domaine")}>
            {PLAGES.map((p) => (
              <PlageFiltre key={p.k} p={p} />
            ))}
          </SectionFiltre>
        </ModaleFiltres>
      ) : null}
    </>
  );
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
 *  ce groupe, filtrées par station, puis par total, distance aux remontées,
 *  personnes et chambres (Prix par station.dc.html:126-164, 545-578). Sous
 *  les critères, la liste, la carte aux pastilles de prix et le volet de
 *  Logements, demandés par le propriétaire le 25 sept. 2026 à la place des
 *  cartes de la maquette : une annonce s'ouvre ici, sans passer par
 *  Logements. Seuls des logements de station y paraissent, à 2 km au plus
 *  d'une remontée, ceux des relevés antérieurs à cette règle compris. */
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
  const course = usePrix((s) => s.course);
  const file = usePrix((s) => s.file);
  const lancer = usePrix((s) => s.lancer);
  const arreter = usePrix((s) => s.arreter);
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
    () => STATIONS.filter((s) => res[cleDeLecture(res, per, groupe, s.id)]?.etat === "fait"),
    [res, per, groupe],
  );
  const cles = useMemo(
    () => relevees.map((s) => cleDeLecture(res, per, groupe, s.id)),
    [relevees, res, per, groupe],
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

  // Toutes les annonces relevées, avant tout critère : c'est sur elles que se
  // fait l'identité des logements, qui ne tourne ainsi qu'à l'arrivée d'une
  // station, et non à chaque cran d'un curseur.
  const tout = useMemo<CarteAnnonce[]>(
    () =>
      relevees.flatMap((s, i) =>
        (parCle.get(cles[i] ?? "") ?? []).map((a) => ({
          a,
          stationId: s.id,
          lieu: nomStationPropre(a),
        })),
      ),
    [relevees, cles, parCle],
  );
  const avant = useMemo<CarteAnnonce[]>(() => {
    const passent = new Set(
      relevees.filter((s) => passeStationSeule(s, fl, BORNES)).map((s) => s.id),
    );
    return tout.filter((c) => passent.has(c.stationId));
  }, [tout, relevees, fl]);
  // Dans l'ordre du référentiel : la carte se cadre sur elles, et un autre tri
  // ne la recadre pas. Une annonce située ne passe que sous sa station
  // (`passeAnnonce`) ; une annonce non située sortie de deux relevés n'y figure
  // qu'une fois, sous celle qui la mesure le plus près des remontées
  // (`filtrerCartes`).
  const filtrees = useMemo(() => filtrerCartes(avant, fl, BORNES), [avant, fl]);
  // Un logement par carte, comme dans Logements : ses offres des autres
  // plateformes se rangent derrière la moins chère de celles qui passent, et
  // l'étiquette les nomme. L'identité est celle des relevés, sur tout ce qui
  // est relevé : les critères choisissent les cartes, pas qui va avec qui.
  const groupes = useMemo(() => logementsReleves(tout), [tout]);
  const logements = useMemo(() => logementsBudget(groupes, filtrees), [groupes, filtrees]);
  const logementDe = useMemo(() => {
    const m = new Map<string, LogementBudget>();
    for (const g of logements) for (const o of g.offres) m.set(o.a.id, g);
    return m;
  }, [logements]);
  const principales = useMemo(() => logements.map((g) => g.principale), [logements]);
  // Ce qu'un budget trop serré cache : la liste vide le dit, et combien.
  const avantBudget = useMemo(
    () =>
      logements.length === 0 && fl.budget != null
        ? logementsBudget(groupes, filtrerCartes(avant, { ...fl, budget: null }, BORNES)).length
        : 0,
    [logements, groupes, avant, fl],
  );
  const cartes = useMemo(
    () => [...principales].sort(comparateurBudget(triB)),
    [principales, triB],
  );
  const nStations = useMemo(
    () => new Set(principales.map((c) => c.stationId)).size,
    [principales],
  );
  // Toutes les offres, pas seulement les principales : le volet passe de l'une
  // à l'autre, et Retenir porte sur celle qu'on a choisie.
  const parId = useMemo(() => new Map(filtrees.map((c) => [c.a.id, c] as const)), [filtrees]);

  // Les stations de la liste relevées avec la version du 25 septembre 2026 au
  // matin (PR #47) : leurs annonces n'ont pas de position, et seul un nouveau
  // relevé la leur donne. On les relève d'ici, et seulement celles qui ont un
  // logement à l'écran : relever les autres coûterait du temps et du quota
  // Airbnb pour rien.
  const sansPosition = useMemo(() => {
    const vieilles = new Set(anciennes);
    const montrees = new Set(filtrees.map((c) => c.stationId));
    return relevees.filter((s, i) => vieilles.has(cles[i] ?? "") && montrees.has(s.id));
  }, [anciennes, relevees, cles, filtrees]);
  const aRepositionner = useMemo(
    () => idsALancer(sansPosition.map((s) => s.id), per, groupe, course, file),
    [sansPosition, per, groupe, course, file],
  );
  // Un relevé des mêmes dates et du même groupe porte déjà l'une d'elles.
  const repositionEnCours =
    course != null &&
    memePeriode(course.per, per) &&
    grpKey(course.groupe) === grpKey(groupe) &&
    sansPosition.some((s) => course.ids.slice(course.i).includes(s.id));
  const passee = estPassee(per, todayIso());

  // « Relever toutes les stations » (demande du 1er octobre 2026) : celles
  // qui n'ont pas encore de relevé pour ces dates et ce groupe, puis, toutes
  // faites, toutes à nouveau (`toutesALancer`). Leurs logements arrivent dans
  // la liste et sur la carte au fil des stations terminées.
  const toutes = useMemo(
    () =>
      toutesALancer(
        STATIONS.map((s) => s.id),
        (id) => res[cleDeLecture(res, per, groupe, id)]?.etat === "fait",
        per,
        groupe,
        course,
        file,
      ),
    [res, per, groupe, course, file],
  );
  // Rien à lancer : toutes sont déjà prévues par un relevé de ces dates.
  const toutesPrevues =
    course != null && memePeriode(course.per, per) && grpKey(course.groupe) === grpKey(groupe)
      ? tr("Relevé de toutes les stations en cours.")
      : tr("Relevé de toutes les stations en attente.");

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
  // La légende dit pourquoi une page a moins de pastilles que de cartes.
  const pageSansPosition = pageItems.filter((c) => !situee(c.a)).length;

  // Le recadrage suit le résultat des filtres, pas le contenu du cadre : sinon
  // recadrer changerait la liste, qui recadrerait encore (voir Logements).
  const cadrageCalcule = useMemo(
    () =>
      `${recadrages}|${principales
        .filter((c) => situee(c.a))
        .map((c) => c.a.id)
        .join(",")}`,
    [principales, recadrages],
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
      principales
        .filter((c) => situee(c.a))
        .map((c) => [c.a.lat as number, c.a.lon as number] as [number, number]),
    [principales],
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
  // liste en mêle plusieurs. Une offre désignée se montre par l'épingle de son
  // logement : l'offre Airbnb ouverte d'un logement montré sous Booking ne
  // pose pas une seconde épingle au même endroit.
  const situees = useMemo(() => {
    const vues = new Set<string>();
    const out: Listing[] = [];
    const designees = [epinglee, ouverte, lodgeId].map((id) =>
      id ? (logementDe.get(id)?.principale.a ?? parId.get(id)?.a) : undefined,
    );
    for (const l of [...pageItems.map((c) => c.a), ...designees]) {
      if (!l || vues.has(l.id) || !situee(l)) continue;
      vues.add(l.id);
      out.push(l);
    }
    return out;
  }, [pageItems, logementDe, parId, epinglee, ouverte, lodgeId]);
  const favoris = useIdsFavoris();
  // L'altitude des logements de la page : entre stations, elle se compare.
  const altDe = useAltitudes(useMemo(() => pageItems.map((c) => c.a), [pageItems]));
  const marqueurs = useMemo(
    () =>
      situees.map((l) => {
        // Le logement est désigné, ou vu, quand l'une de ses offres l'est.
        const offres = logementDe.get(l.id)?.offres.map((o) => o.a.id) ?? [l.id];
        const sel = offres.some((id) => id === ouverte || id === lodgeId);
        const etat = sel ? "retenue" : offres.some((id) => seen[id]) ? "vue" : "normale";
        return {
          id: l.id,
          lat: l.lat as number,
          lon: l.lon as number,
          nom: l.title,
          epingle: epinglePrix(prixPin(l), l.title, etat, offres.some((id) => favoris.has(id))),
          zIndex: sel ? ETAGE.designee : ETAGE.normale,
        };
      }),
    [situees, logementDe, ouverte, lodgeId, seen, favoris],
  );
  /** L'offre de ce logement que le séjour retient, ou `null`. Retenir à
   *  nouveau la relâche : l'action porte sur elle, pas sur la principale. */
  const offreRetenue = (g: LogementBudget | undefined): CarteAnnonce | null =>
    (lodgeId && g?.offres.find((o) => o.a.id === lodgeId)) || null;

  const js = jetonsBudget(fl, BORNES, NOMS_DISTINCTS);
  // Une station relevée dont IndexedDB a perdu les annonces (base effacée,
  // navigation privée) ne compte pas : tout lu et rien trouvé, il n'y a pas de
  // relevé à montrer.
  const aucunReleve = relevees.length === 0 || (pret && parCle.size === 0);
  const vide = videBudget(
    aucunReleve,
    avantBudget,
    filtresActifsBudget(fl),
    lieuSansReleve(fl, relevees),
  );
  const annonceOuverte = ouverte ? (parId.get(ouverte) ?? null) : null;
  const ouverteRetenue = annonceOuverte != null && lodgeId === annonceOuverte.a.id;
  // Le logement de l'offre ouverte : le volet dit « Ce logement sur N
  // plateformes » et passe de l'une à l'autre, comme dans Logements.
  // Les forfaits du groupe à la station du logement ouvert, aux dates de la
  // liste : le tableau mêle plusieurs stations, chacune a les siens.
  const { enfants: enfantsSejour } = useSejour();
  const forfaitsOuverts = useBudgetForfaits(
    annonceOuverte ? stationDuLogement(annonceOuverte.a, annonceOuverte.stationId) : null,
    stay.checkIn,
    stay.checkOut,
    adults(trav, enfantsSejour),
    clampChildren(enfantsSejour, trav),
  );
  /** Le logement voisin de l'annonce ouverte, dans la page affichée. */
  const ouverteVoisine = (sens: 1 | -1) => {
    if (!ouverte) return null;
    const ici = [ouverte, ...(logementDe.get(ouverte)?.offres.map((o) => o.a.id) ?? [])];
    const id = voisinDansListe(pageItems.map((c) => c.a.id), ici, sens);
    return id ? () => ouvrirAnnonce(id) : null;
  };
  const groupeOuvert = useMemo(() => {
    const g = ouverte ? logementDe.get(ouverte) : undefined;
    return g && g.offres.length > 1 ? versLogement(g) : null;
  }, [ouverte, logementDe]);

  const enr = useEnregistrement(useMemo(() => ({ ...stay, trav }), [stay, trav]));
  const [filtres, setFiltres] = useState(false);
  const bBudget = BORNES.budget;
  const plafond = fl.budget?.[1] ?? bBudget[1];
  /** « Booking + 1 » : la plateforme de la carte, et combien d'autres. */
  const badgeDe = (g: LogementBudget | undefined, c: CarteAnnonce) =>
    g && g.offres.length > 1 ? `${c.a.source} + ${g.offres.length - 1}` : c.a.source;
  // Le budget seul écarte tout : la maquette le dit d'une ligne.
  const sousBudget =
    !aucunReleve && avantBudget > 0 && fl.budget != null && fl.budget[0] <= bBudget[0]
      ? tr("Aucun logement sous {prix}", { prix: eur(fl.budget[1]) })
      : null;

  return (
    <>
      <div className="px-ligne">
        <label className="px-budget">
          <span className="px-budget__lbl">{tr("Budget")}</span>
          <input
            type="range"
            min={bBudget[0]}
            max={bBudget[1]}
            step={PLAGE_BUDGET.pas}
            value={plafond}
            aria-valuetext={plageLbl("budget", fl.budget, bBudget)}
            onChange={(e) =>
              majFl((f) => ({
                ...f,
                budget: poserBorne(f.budget, bBudget, PLAGE_BUDGET.pas, 1, Number(e.target.value)),
              }))
            }
          />
          <b className="px-budget__val">{fl.budget ? eur(plafond) : plageLbl("budget", null, bBudget)}</b>
        </label>
        <BoutonFiltres n={js.length} onClick={() => setFiltres(true)} />
        {js.map((j) => (
          <PuceCritere
            key={`${j.k}|${j.v ?? ""}`}
            label={j.lbl}
            onRetirer={() => {
              majFl((f) => retirerJeton(f, j.k, j.v));
              surCompte();
            }}
          />
        ))}
        {filtresActifsBudget(fl) ? (
          <button
            type="button"
            className="m8-lien-fort px-effacer"
            onClick={() => {
              resetFl(effacerBudget(fl));
              surCompte();
            }}
          >
            {tr("Tout effacer")}
          </button>
        ) : null}
        {/* Rien tant que les annonces se lisent : « 0 logement » serait faux. */}
        <span className="px-compte" ref={refCompte} tabIndex={-1}>
          {affichable ? countBudget(cartes.length, nStations) : ""}
        </span>
        <div className="px-actions">
          {passee ? (
            <span className="px-indice" role="status">
              {tr("Ces dates sont passées. Choisissez une arrivée à partir d’aujourd’hui.")}
            </span>
          ) : toutes.ids.length > 0 ? (
            <button
              type="button"
              className="px-relever"
              title={tr(
                "Une station prend environ une minute : {duree} pour celles-ci. Le relevé continue quand on quitte l’écran.",
                { duree: dureeReleveLbl(toutes.ids.length) },
              )}
              onClick={() => {
                // Le nom du relevé reste en français dans le magasin ; le bandeau le traduit.
                lancer({ nom: aTraduire("toutes les stations"), ids: toutes.ids, per, groupe });
                // Le bouton cède la place à l'indice : le focus va au compte.
                refCompte.current?.focus();
              }}
            >
              {relToutesLbl(toutes.ids.length, STATIONS.length, toutes.aNouveau)}
            </button>
          ) : (
            <span className="px-indice" role="status">
              {toutesPrevues}
            </span>
          )}
        </div>
      </div>

      {/* Le relevé en cours se suit aussi d'ici : relever toutes les stations,
          ou celles sans position, se lance depuis cet onglet, et leurs
          pastilles arrivent au fil des stations terminées. */}
      {course ? (
        <BandeauCourse
          course={course}
          file={file}
          onArreter={() => {
            // Sans relevé à venir (la file écarte ceux dont les dates sont
            // passées), le bandeau et son bouton disparaissent.
            if (file.every((j) => estPassee(j.per, todayIso()))) refCompte.current?.focus();
            arreter();
          }}
        />
      ) : null}

      {/* Les relevés faits avec la version du 25 septembre 2026 au matin ne
          gardaient pas la position des logements : la carte vide laisserait
          croire à une panne. */}
      {affichable && sansPosition.length > 0 ? (
        <div className="px-avis">
          <span>
            {sansPosition.length > 1
              ? tr("{n} stations sans position de logement", { n: sansPosition.length })
              : tr("{station} sans position de logement", {
                  station: NOMS.get(sansPosition[0]?.id ?? "") ?? tr("Une station"),
                })}
          </span>
          {passee ? null : aRepositionner.length > 0 ? (
            <button
              type="button"
              className="px-pilule"
              title={tr("Une station prend environ une minute.")}
              onClick={() => {
                lancer({ nom: aTraduire("logements sans position"), ids: aRepositionner, per, groupe });
                refCompte.current?.focus();
              }}
            >
              {aRepositionner.length === 1
                ? NOMS.get(aRepositionner[0] ?? "")
                  ? tr("Relever {station}", { station: NOMS.get(aRepositionner[0] ?? "") ?? "" })
                  : tr("Relever cette station")
                : aRepositionner.length < sansPosition.length
                  ? tr("Relever les {n} stations restantes", { n: aRepositionner.length })
                  : tr("Relever ces {n} stations", { n: aRepositionner.length })}
            </button>
          ) : (
            <span className="px-indice" role="status">
              {sansPosition.length > 1
                ? repositionEnCours
                  ? tr("Relevé de ces stations en cours.")
                  : tr("Relevé de ces stations en attente.")
                : repositionEnCours
                  ? tr("Relevé de cette station en cours.")
                  : tr("Relevé de cette station en attente.")}
            </span>
          )}
        </div>
      ) : null}

      {!affichable ? null : cartes.length > 0 ? (
        <div className="px-deux">
          <div
            className="px-deux__liste"
            ref={listeRef}
            tabIndex={-1}
            aria-label={tr("Logements de la page")}
          >
            {affichees.length > 0 ? (
              <>
                <div className="px-grille">
                  {pageItems.map((c) => {
                    const g = logementDe.get(c.a.id);
                    const r = offreRetenue(g);
                    return (
                      <CarteMaquette
                        key={`${c.stationId}|${c.a.id}`}
                        {...textesCarte(c.a, { nights, altitude: altDe(c.a), avecAltitude: true })}
                        badge={badgeDe(g, c)}
                        onOpen={() => ouvrirAnnonce(c.a.id)}
                        heart={enr.coeur(c.a)}
                        link={{
                          label: r
                            ? r.a.id !== c.a.id
                              ? tr("Retenu · {source}", { source: r.a.source })
                              : tr("Retenu")
                            : tr("Retenir"),
                          on: r != null,
                          onClick: () => retenir(r?.a.id ?? c.a.id),
                        }}
                        vif={actifCarte === c.a.id}
                        onMouseEnter={() => setActifCarte(c.a.id)}
                        onMouseLeave={() => setActifCarte(null)}
                      />
                    );
                  })}
                </div>
                {nPages > 1 ? <Pages page={page} n={nPages} aller={allerPage} /> : null}
              </>
            ) : (
              <div className="px-vide">
                <b>{tr("Aucune annonce dans ce cadrage")}</b>
                <button type="button" className="px-encre" onClick={revoirTout}>
                  {tr("Revoir toutes les annonces")}
                </button>
              </div>
            )}
          </div>
          <div className="px-deux__carte">
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
                const g = logementDe.get(id);
                return (
                  <FicheEpingle
                    l={c.a}
                    sources={g ? sourcesBudget(g) : sourceEtLieu(c.a)}
                    stay={stay}
                    trav={trav}
                    nights={nights}
                  />
                );
              }}
              actionsDe={(id) => {
                if (!parId.has(id)) return null;
                const r = offreRetenue(logementDe.get(id));
                return (
                  <>
                    <button type="button" className="btn7" onClick={() => ouvrirAnnonce(id)}>
                      {tr("Voir l’annonce")}
                    </button>
                    <button
                      type="button"
                      className="btn7 btn7--fantome"
                      aria-pressed={r != null}
                      onClick={() => retenir(r?.a.id ?? id)}
                    >
                      {r ? tr("Retenu") : tr("Retenir")}
                    </button>
                  </>
                );
              }}
              legende={
                <>
                  <b>
                    {nPages > 1 ? `${tr("Page {page} sur {n}", { page: page + 1, n: nPages })} · ` : ""}
                    {trN(affichees.length, "{n} logement dans le cadre", "{n} logements dans le cadre")}
                    {pageSansPosition > 0
                      ? ` · ${tr("{n} sans position sur cette page", { n: pageSansPosition })}`
                      : ""}
                  </b>
                  {horsCadre > 0 ? (
                    <button type="button" className="carte7__revoir" onClick={revoirTout}>
                      {cartes.length > 1
                        ? tr("Revoir les {n} logements", { n: cartes.length })
                        : tr("Revoir le logement")}
                      <IconeDroite taille={12} epaisseur={2.4} />
                    </button>
                  ) : null}
                </>
              }
            />
          </div>
        </div>
      ) : (
        <div className="px-vide">
          <b>{sousBudget ?? vide.titre}</b>
          {vide.versStation ? (
            <button type="button" className="px-encre" onClick={() => ouvrir("station")}>
              {tr("Ouvrir l’onglet Par station")}
            </button>
          ) : null}
        </div>
      )}

      {filtres ? (
        <ModaleFiltres
          onFermer={() => setFiltres(false)}
          onEffacer={() => resetFl(effacerBudget(fl))}
          cta={trN(cartes.length, "Afficher {n} logement", "Afficher {n} logements")}
        >
          <SectionFiltre titre={tr("Budget")}>
            <PlageFiltre p={PLAGE_BUDGET} />
          </SectionFiltre>
          <SectionFiltre
            titre={tr("Trier")}
            aside={<SensTri sens={triB.dir} onChange={(dir) => setTriB({ ...triB, dir })} />}
          >
            <select
              className="px-select"
              aria-label={tr("Trier")}
              value={triB.k}
              onChange={(e) => setTriB(lireTriB(e.target.value))}
            >
              {TRIS_B.map((o) => (
                <option key={o.k} value={o.k}>
                  {tr(o.label)}
                </option>
              ))}
            </select>
          </SectionFiltre>
          <SectionFiltre titre={tr("Lieu")}>
            <div className="px-choix">
              <ChoixLieu />
              <ChoixStation relevees={relevees} />
            </div>
          </SectionFiltre>
          <SectionFiltre titre={tr("Logement")}>
            {PLAGES_LOGEMENT.map((p) => (
              <PlageFiltre key={p.k} p={p} />
            ))}
          </SectionFiltre>
          <SectionFiltre titre={tr("Station")}>
            {PLAGES_STATION.map((p) => (
              <PlageFiltre key={p.k} p={p} />
            ))}
          </SectionFiltre>
        </ModaleFiltres>
      ) : null}

      {annonceOuverte ? (
        <VoletAnnonce
          l={annonceOuverte.a}
          stay={stay}
          trav={trav}
          nights={nights}
          groupe={groupeOuvert}
          retenu={ouverteRetenue}
          onRetenir={() => retenir(annonceOuverte.a.id)}
          onFermer={fermerVolet}
          onVoirOffre={ouvrirAnnonce}
          onPrecedent={ouverteVoisine(-1)}
          onSuivant={ouverteVoisine(1)}
          forfaits={forfaitsOuverts}
          suite={
            // Réservation retrouve ce logement par `resolveListing`, qui fait
            // passer devant la copie tarifée pour les dates du séjour : celle
            // relevée ici, que Retenir vient de poser.
            ouverteRetenue ? (
              <button type="button" className="px-encre px-encre--large" onClick={() => void go("booking")}>
                {tr("Passer à la réservation")}
              </button>
            ) : null
          }
        />
      ) : null}
      {enr.modale}
    </>
  );
}

const STATION_DE: ReadonlyMap<string, Station> = new Map(STATIONS.map((s) => [s.id, s]));

/** Une ligne du tableau (Skitrack App.dc.html:583-587). « Mis à jour » dit
 *  l'état de la course avant la date du dernier relevé ; « partiel » nomme en
 *  clair les sources qui n'ont pas répondu. Le bouton rond relève la station
 *  quand elle n'a pas de relevé, ou que le dernier a échoué. */
function LignePrix({ l, relever }: { l: Ligne; relever: (() => void) | null }) {
  const refReleve = useRef<HTMLDivElement>(null);
  const s = STATION_DE.get(l.id);
  const village = s ? villageM(s) : null;
  const ecartees = annSub(l.res);
  const partiel = l.res?.etat === "fait" ? l.res.partiel : [];
  const releve =
    l.etat === "en-cours" ? tr("en cours") : l.etat === "attente" ? tr("en attente") : releveLbl(l.res);
  const muet = l.n == null ? " px-cell--muet" : "";
  const valeur =
    l.etat === "prix" ? (
      <b className="px-prix">{eur(l.med)}</b>
    ) : l.etat === "peu" ? (
      <span className="px-etat" title={tr("Il en faut {n} pour une médiane", { n: MIN_ANNONCES })}>
        {tr("Pas assez d’annonces")}
      </span>
    ) : l.etat === "echec" ? (
      // La raison est gardée en français dans le relevé (`aTraduire`).
      <span className="px-etat" title={l.res?.etat === "echec" ? tr(l.res.raison) : undefined}>
        {tr("Relevé impossible")}
      </span>
    ) : (
      <b className="px-prix px-prix--muet" aria-label={l.etat === "non-releve" ? tr("Non relevé") : undefined}>
        –
      </b>
    );
  return (
    <div role="row" className="px-rang">
      <div role="cell" className="px-station">
        <Link to="/stations/$id" params={{ id: l.id }} className="px-station__nom" title={l.subMassif}>
          {l.nom}
        </Link>
        <span className="px-station__sous">{s?.domain && s.domain !== l.nom ? s.domain : l.subMassif}</span>
      </div>
      <div role="cell" className={`px-cell${muet}`} title={ecartees || undefined}>
        {l.n == null ? "–" : fmt(l.n)}
      </div>
      <div role="cell" className={`px-cell${muet}`}>
        {village != null ? `${fmt(village)} m` : "–"}
      </div>
      <div role="cell" className={`px-cell${muet}`} ref={refReleve} tabIndex={-1}>
        {releve || "–"}
        {partiel.length > 0 ? (
          <span className="px-partiel" title={tr("Sans réponse : {sources}.", { sources: partiel.join(", ") })}>
            {partielLbl(partiel)}
          </span>
        ) : null}
      </div>
      <div role="cell" className="px-valeur">
        {valeur}
        {relever && (l.etat === "non-releve" || l.etat === "echec") ? (
          <button
            type="button"
            className="px-rond"
            aria-label={tr("Relever {station}", { station: l.nom })}
            title={tr("Mettre à jour")}
            onClick={() => {
              relever();
              // Le bouton disparaît : le focus passe à l'état du relevé, qui
              // dit désormais « en cours » ou « en attente ».
              refReleve.current?.focus();
            }}
          >
            <Trace d="M21 12a9 9 0 1 1-3-6.7M21 3v6h-6" taille={12} epaisseur={2.2} />
          </button>
        ) : null}
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
        ? ` · ${tr("Airbnb demande une pause, reprise dans {duree}", { duree: reste })}`
        : ` · ${tr("Airbnb demande une pause")}`;
    case "arret":
      return nom ? ` · ${tr("{station} après la fin du relevé arrêté", { station: nom })}` : "";
    case "logements":
      return nom ? ` · ${tr("{station} après la recherche en cours dans Logements", { station: nom })}` : "";
    case "rythme":
      return nom
        ? reste
          ? ` · ${tr("{station} dans {duree}", { station: nom, duree: reste })}`
          : ` · ${tr("{station} en attente", { station: nom })}`
        : "";
  }
}

/**
 * La complétion de la station en cours : « La Clusaz : fiches 12 sur 57 »,
 * et ce qu'elle attend entre deux tranches.
 */
function suiteFiches(
  f: NonNullable<Course["fiches"]>,
  a: Course["attente"],
  nom: string,
  now: number,
): string {
  const base = ` · ${tr("{station} : fiches {faites} sur {total}", { station: nom, faites: f.faites, total: f.total })}`;
  if (a?.motif === "logements") return `${base}, ${tr("reprise après la recherche en cours dans Logements")}`;
  if (a?.motif === "rythme" && a.jusqua != null) {
    return `${base}, ${tr("suite dans {duree}", { duree: dureeLbl(Math.max(0, a.jusqua - now)) })}`;
  }
  return base;
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
  const fiches = course.fiches && course.fiches.total > 0 ? course.fiches : null;
  const suite =
    fiches && nom
      ? suiteFiches(fiches, course.attente, nom, now)
      : course.attente
        ? suiteAttente(course.attente, nom, now)
        : nom
          ? ` · ${tr("{station} en cours", { station: nom })}`
          : "";

  const enCours = nom ? `${nom} · ` : "";
  return (
    <div className="px-course">
      <div className="px-course__ligne">
        <span className="px-course__lbl">
          {enCours}
          {course.i + (course.i < total ? 1 : 0)} / {total}
        </span>
        <div
          className="px-course__jauge"
          role="progressbar"
          aria-label={tr("Stations relevées")}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={course.i}
        >
          <i style={{ width: `${total ? (course.i / total) * 100 : 0}%` }} />
        </div>
        <button type="button" className="px-course__arreter" onClick={onArreter}>
          {tr("Arrêter")}
        </button>
      </div>
      <span className="px-course__sous">
        {tr("Relevé : {nom}, {periode}", { nom: tr(course.nom), periode: perLbl(course.per) })}
        {suite}
        {course.airbnbRefus ? ` · ${tr("Airbnb a refusé des requêtes : fiches Airbnb suspendues pour cette course.")}` : ""}
        {file.length > 0
          ? ` · ${tr("Ensuite : {releves}.", { releves: file.map((j) => `${tr(j.nom)} (${perLbl(j.per)})`).join(", ") })}`
          : ""}
      </span>
    </div>
  );
}
