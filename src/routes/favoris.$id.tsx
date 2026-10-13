/**
 * Un dossier de favoris (Skitrack App.dc.html:615-646, script 1197-1208 et
 * 1231-1246) : ses logements en cartes à gauche et leur carte collante à
 * droite, comme une liste d'Airbnb ; et « Comparer », le tableau des mêmes
 * logements côte à côte, la meilleure valeur de chaque colonne en vert.
 *
 * Chaque logement garde le séjour pour lequel il a été enregistré : ses prix
 * valent pour ces dates et ce groupe.
 *
 * « Partager » copie un lien qui porte le dossier (`components/favoris/partage`).
 * Ouvert dans un autre navigateur, ce lien montre le dossier en lecture, avec
 * son bandeau « Partagée le … », et « Enregistrer dans mes favoris » en fait
 * un dossier à soi.
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Coquille } from "@/components/Coquille";
import { textesCarte } from "@/components/favoris/annonceCarte";
import { FlecheTri, VideFavoris } from "@/components/favoris/communs";
import { PICTO_GROUPE, PICTO_PARTAGER, useCopie } from "@/components/favoris/outils";
import {
  encoderPartage,
  lienPartage,
  lirePartage,
  type DossierPartage,
} from "@/components/favoris/partage";
import {
  CarteAnnonce,
  IconeCroix,
  IconeGauche,
  Onglets,
  Trace,
  useEnregistrement,
} from "@/components/maquette";
import { useGo } from "@/components/v6/go";
import { CarteEpingles, type Marqueur } from "@/components/v7/CarteEpingles";
import { epinglePrix, ETAGE } from "@/components/v7/epingle";
import { FicheEpingle } from "@/components/v7/FicheEpingle";
import { VoletAnnonce } from "@/components/v7/VoletAnnonce";
import {
  altitudeAide,
  altitudeLbl,
  pointAltitude,
  positionApprochee,
  type Altitude,
} from "@/lib/altitude/altitude";
import { useAltitudes } from "@/lib/altitude/store";
import { contenu, type Favori, type SejourFavori } from "@/lib/favoris/modele";
import { useFavoris } from "@/lib/favoris/store";
import type { Listing } from "@/lib/listings";
import { fmt, nightsBetween, useParcours } from "@/lib/parcours";
import { nomStationPropre } from "@/lib/rattachement";
import { useStay } from "@/lib/stay";
import { distFiltrableM } from "@/lib/stay/lodgingFilter";
import { parMesure, type Sens } from "@/lib/tri";
import { bedLbl, capLbl, distanceOf, prixLbl, prixPersLbl, prixPin } from "@/lib/v7";
import { viaDistance } from "@/lib/stay/aPied";
import { useAPied } from "@/lib/geo/useReseauPieton";
import { langueIntl } from "@/lib/i18n/langue";
import { aTraduire, tr, trN } from "@/lib/i18n";
import { voisinDansListe } from "@/lib/stay/visionneuse";
import { stationDuLogement } from "@/lib/stay/parStation";
import { adults, clampChildren } from "@/lib/stay/party";
import { useBudgetForfaits } from "@/components/v7/usePrixForfait";

export const Route = createFileRoute("/favoris/$id")({ component: PageDossier });

function PageDossier() {
  const { id } = Route.useParams();
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  return (
    <Coquille>
      <main className="fv-main" id="s-favoris-dossier" data-screen-label="Dossier de favoris">
        {monte ? <Dossier id={id} /> : null}
      </main>
    </Coquille>
  );
}

/** Le séjour d'un favori, ou celui de la recherche en cours s'il n'en a pas. */
function sejourDe(f: Favori, courant: SejourFavori): SejourFavori {
  return f.sejour ?? courant;
}

const dateCourte = (d: Date) =>
  new Intl.DateTimeFormat(langueIntl(), { day: "numeric", month: "short", timeZone: "UTC" }).format(
    d,
  );
function sejourLbl(s: SejourFavori): string {
  const d = (iso: string) => dateCourte(new Date(`${iso}T12:00:00Z`));
  const dates = { du: d(s.checkIn), au: d(s.checkOut) };
  // « 1 pers. » à part : l'anglais dit « 1 person », « 4 people ».
  return s.trav === 1
    ? tr("{du} → {au} · 1 pers.", dates)
    : tr("{du} → {au} · {n} pers.", { ...dates, n: s.trav });
}

/** Le dossier partagé de l'ancre, lu une fois au montage : `undefined` pendant
 *  la lecture, `null` sans ancre ou ancre illisible. */
function usePartage(actif: boolean): DossierPartage | null | undefined {
  const [d, setD] = useState<DossierPartage | null | undefined>(actif ? undefined : null);
  useEffect(() => {
    if (!actif) return;
    let vivant = true;
    void lirePartage(window.location.hash).then((r) => {
      if (vivant) setD(r);
    });
    return () => {
      vivant = false;
    };
  }, [actif]);
  return actif ? d : null;
}

function Dossier({ id }: { id: string }) {
  const etat = useFavoris();
  const dossier = etat.dossiers.find((d) => d.id === id);
  // Un dossier à soi se montre tel quel, même ouvert par son propre lien.
  const partage = usePartage(!dossier);
  const local = useMemo(() => contenu(etat, id), [etat, id]);
  const favorisBruts = useMemo<Favori[]>(
    () =>
      dossier
        ? local
        : (partage?.favoris ?? []).map((f) => ({
            annonceId: f.annonce.id,
            dossierId: id,
            ajouteLe: f.ajouteLe,
            annonce: f.annonce,
            sejour: f.sejour,
          })),
    [dossier, local, partage, id],
  );
  // La distance à pied de chaque logement, dès que le réseau de sa station est
  // chargé (`stay/aPied.ts`) : la comparaison, les cartes et la fiche la
  // lisent. Le favori enregistré, lui, garde son relevé.
  const annoncesBrutes = useMemo(() => favorisBruts.map((f) => f.annonce), [favorisBruts]);
  const annonces = useAPied(annoncesBrutes);
  const favoris = useMemo<Favori[]>(
    () =>
      annonces === annoncesBrutes
        ? favorisBruts
        : favorisBruts.map((f, i) => (annonces[i] === f.annonce ? f : { ...f, annonce: annonces[i] })),
    [favorisBruts, annonces, annoncesBrutes],
  );
  const altDe = useAltitudes(annonces);
  const { checkIn, checkOut, guests, children } = useStay();
  const courant = useMemo<SejourFavori>(
    () => ({ checkIn, checkOut, trav: guests }),
    [checkIn, checkOut, guests],
  );
  const enr = useEnregistrement(courant);
  const [vue, setVue] = useState<"liste" | "comparer">("liste");
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [actif, setActif] = useState<string | null>(null);
  const [bandeau, setBandeau] = useState(true);
  const P = useParcours();
  const go = useGo();

  // Les forfaits du groupe pour le favori ouvert, à la station du logement et
  // aux dates de son séjour. La composition du groupe (adultes, enfants) n'est
  // connue que pour le séjour en cours : un favori enregistré pour un autre
  // nombre de voyageurs ne les calcule pas.
  const favOuvert = ouvert ? favoris.find((f) => f.annonceId === ouvert) : undefined;
  const sejOuvert = favOuvert ? sejourDe(favOuvert, courant) : null;
  const memeGroupe = sejOuvert != null && sejOuvert.trav === guests;
  const forfaitsOuverts = useBudgetForfaits(
    favOuvert && memeGroupe
      ? stationDuLogement(favOuvert.annonce, favOuvert.annonce.stationId)
      : null,
    sejOuvert?.checkIn ?? checkIn,
    sejOuvert?.checkOut ?? checkOut,
    adults(guests, children),
    clampChildren(children, guests),
  );

  const retenir = useCallback(
    (annonceId: string) => {
      const p = useParcours.getState();
      if (p.lodgeId === annonceId) return p.chooseLodge(null);
      const f = favoris.find((x) => x.annonceId === annonceId);
      if (!f) return;
      p.retain(f.annonce.stationId);
      if (f.sejour)
        useStay.getState().setStay({ checkIn: f.sejour.checkIn, checkOut: f.sejour.checkOut });
      p.chooseLodge(annonceId);
    },
    [favoris],
  );

  if (!dossier && partage === undefined) return null;
  if (!dossier && !partage) {
    return (
      <div className="fv-vide">
        <b>{tr("Ce dossier n’existe plus")}</b>
        <Link to="/favoris" className="fv-encre">
          {tr("Revoir les dossiers")}
        </Link>
      </div>
    );
  }
  const nom = dossier?.nom ?? partage?.nom ?? "";

  const parId = new Map(favoris.map((f) => [f.annonceId, f]));
  const fOuvert = ouvert ? parId.get(ouvert) : undefined;
  /** Le logement voisin dans le dossier, dans l'ordre où il s'affiche. */
  const favoriVoisin = (sens: 1 | -1) => {
    const vid = ouvert
      ? voisinDansListe(
          favoris.map((f) => f.annonceId),
          [ouvert],
          sens,
        )
      : null;
    return vid ? () => setOuvert(vid) : null;
  };
  const situes = favoris.filter((f) => pointAltitude(f.annonce));
  const marqueurs: Marqueur[] = situes.map((f) => {
    const l = f.annonce;
    const sel = l.id === ouvert || l.id === P.lodgeId;
    return {
      id: l.id,
      lat: l.lat as number,
      lon: l.lon as number,
      nom: l.title,
      epingle: epinglePrix(prixPin(l), l.title, sel ? "retenue" : "normale", true),
      zIndex: sel ? ETAGE.designee : ETAGE.normale,
    };
  });
  const cadrage = `${id}|${situes.map((f) => f.annonceId).join(",")}`;

  return (
    <>
      <EnTete
        id={id}
        nom={nom}
        favoris={favoris}
        sansPoint={favoris.length - situes.length}
        vue={vue}
        setVue={setVue}
        partagee={!dossier}
      />
      {!dossier && partage && bandeau ? (
        <div className="fv-bandeau" role="status">
          <Trace d={PICTO_GROUPE} taille={15} epaisseur={1.8} />
          {partage.le
            ? tr("Partagée le {date}", { date: dateCourte(new Date(partage.le)) })
            : tr("Liste partagée")}
          <button
            type="button"
            className="fv-bandeau__x"
            aria-label={tr("Fermer")}
            onClick={() => setBandeau(false)}
          >
            <IconeCroix taille={11} epaisseur={2.6} />
          </button>
        </div>
      ) : null}
      {favoris.length === 0 ? (
        <VideFavoris titre={tr("Ce dossier est vide")} />
      ) : vue === "comparer" ? (
        <Comparaison favoris={favoris} courant={courant} altDe={altDe} ouvrir={setOuvert} />
      ) : (
        <div className="fv-deux">
          <div className="fv-grille" aria-label={tr("Logements du dossier")}>
            {favoris.map((f) => {
              const s = sejourDe(f, courant);
              const retenu = P.lodgeId === f.annonceId;
              return (
                <CarteAnnonce
                  key={f.annonceId}
                  {...textesCarte(f.annonce, { nights: nightsBetween(s.checkIn, s.checkOut) ?? 0 })}
                  badge={f.annonce.source}
                  onOpen={() => setOuvert(f.annonceId)}
                  heart={enr.coeur(f.annonce)}
                  link={{
                    label: retenu ? tr("Retenu") : tr("Retenir"),
                    on: retenu,
                    onClick: () => retenir(f.annonceId),
                  }}
                  vif={actif === f.annonceId}
                  onMouseEnter={() => setActif(f.annonceId)}
                  onMouseLeave={() => setActif(null)}
                />
              );
            })}
          </div>
          <div className="fv-deux__carte">
            <CarteEpingles
              marqueurs={marqueurs}
              cadrage={cadrage}
              maxZoom={14}
              actif={actif}
              surActif={setActif}
              ficheDe={(mid) => {
                const f = parId.get(mid);
                if (!f) return null;
                const s = sejourDe(f, courant);
                return (
                  <FicheEpingle
                    l={f.annonce}
                    sources={f.annonce.source}
                    stay={s}
                    trav={s.trav}
                    nights={nightsBetween(s.checkIn, s.checkOut) ?? 0}
                  />
                );
              }}
              actionsDe={(mid) =>
                parId.has(mid) ? (
                  <button type="button" className="btn7" onClick={() => setOuvert(mid)}>
                    {tr("Voir l’annonce")}
                  </button>
                ) : null
              }
              legende={
                <b>
                  {trN(situes.length, "{n} logement sur la carte", "{n} logements sur la carte")}
                  {favoris.length > situes.length
                    ? ` · ${tr("{n} sans position", { n: favoris.length - situes.length })}`
                    : ""}
                </b>
              }
            />
          </div>
        </div>
      )}
      {favoris.length > 0 ? (
        <div>
          <button
            type="button"
            className="fv-encre fv-encre--grand"
            onClick={() => void go("booking")}
          >
            {tr("Passer à la réservation")}
          </button>
        </div>
      ) : null}
      {fOuvert ? (
        <VoletAnnonce
          l={fOuvert.annonce}
          stay={sejourDe(fOuvert, courant)}
          trav={sejourDe(fOuvert, courant).trav}
          nights={
            nightsBetween(
              sejourDe(fOuvert, courant).checkIn,
              sejourDe(fOuvert, courant).checkOut,
            ) ?? 0
          }
          groupe={null}
          retenu={P.lodgeId === fOuvert.annonceId}
          onRetenir={() => retenir(fOuvert.annonceId)}
          onFermer={() => setOuvert(null)}
          onVoirOffre={setOuvert}
          onPrecedent={favoriVoisin(-1)}
          onSuivant={favoriVoisin(1)}
          forfaits={forfaitsOuverts}
          forfaitsMotif={
            memeGroupe
              ? null
              : tr("non calculés : la composition du groupe de ce séjour n’est pas connue")
          }
          suite={
            P.lodgeId === fOuvert.annonceId ? (
              <button
                type="button"
                className="fv-encre fv-encre--grand"
                onClick={() => void go("booking")}
              >
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

const VUES = [
  { key: "liste", label: aTraduire("Liste et carte") },
  { key: "comparer", label: aTraduire("Comparer") },
] as const;

function EnTete({
  id,
  nom,
  favoris,
  sansPoint,
  vue,
  setVue,
  partagee,
}: {
  id: string;
  nom: string;
  favoris: readonly Favori[];
  sansPoint: number;
  vue: "liste" | "comparer";
  setVue: (v: "liste" | "comparer") => void;
  /** Le dossier vient d'un lien : ni renommer, ni supprimer, mais l'enregistrer chez soi. */
  partagee: boolean;
}) {
  const n = favoris.length;
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState(nom);
  const [suppression, setSuppression] = useState(false);
  const { copie, copier } = useCopie();
  const navigate = useNavigate();

  const renommer = (e: FormEvent) => {
    e.preventDefault();
    if (!brouillon.trim()) return;
    useFavoris.getState().renommer(id, brouillon);
    setEdition(false);
  };
  const partager = () =>
    void copier(
      partagee
        ? window.location.href
        : encoderPartage(nom, favoris).then((code) => lienPartage(id, code)),
    );
  const garderChezSoi = () => {
    const st = useFavoris.getState();
    const nid = st.creer(nom);
    if (!nid) return;
    // Du plus ancien au plus récent : le dossier garde l'ordre affiché.
    for (const f of [...favoris].reverse()) st.enregistrer(f.annonce, nid, f.sejour);
    void navigate({ to: "/favoris/$id", params: { id: nid } });
  };

  return (
    <div className="fv-tete">
      <Link to="/favoris" className="fv-retour">
        <IconeGauche taille={14} epaisseur={2.4} />
        {tr("Favoris")}
      </Link>
      {edition ? (
        <form className="fv-renommer" onSubmit={renommer}>
          <input
            value={brouillon}
            maxLength={60}
            onChange={(e) => setBrouillon(e.target.value)}
            aria-label={tr("Nom du dossier")}
            autoFocus
          />
          <button type="submit" className="fv-encre fv-encre--moyen" disabled={!brouillon.trim()}>
            {tr("Enregistrer")}
          </button>
          <button type="button" className="fv-lien" onClick={() => setEdition(false)}>
            {tr("Annuler")}
          </button>
        </form>
      ) : (
        <h1 className="fv-h1 fv-h1--dossier">{nom}</h1>
      )}
      <span
        className="fv-compte"
        title={sansPoint > 0 ? tr("{n} sans position sur la carte", { n: sansPoint }) : undefined}
      >
        {trN(n, "{n} logement", "{n} logements")}
      </span>
      <div className="fv-outils">
        <Onglets
          items={VUES.map((v) => ({ key: v.key, label: tr(v.label) }))}
          valeur={vue}
          onChoisir={setVue}
          ariaLabel={tr("Affichage")}
        />
        <button type="button" className="fv-pilule" onClick={partager} aria-live="polite">
          <Trace d={PICTO_PARTAGER} taille={14} epaisseur={2} />
          {copie ? tr("Lien copié") : tr("Partager")}
        </button>
        {partagee ? (
          <button type="button" className="fv-pilule" onClick={garderChezSoi}>
            {tr("Enregistrer dans mes favoris")}
          </button>
        ) : (
          <>
            {!edition ? (
              <button
                type="button"
                className="fv-pilule"
                onClick={() => {
                  setBrouillon(nom);
                  setEdition(true);
                }}
              >
                {tr("Renommer")}
              </button>
            ) : null}
            {suppression ? (
              <span className="fv-confirmer" role="alert">
                {tr("Supprimer ce dossier ?")}
                <button
                  type="button"
                  className="fv-pilule fv-pilule--danger"
                  onClick={() => {
                    useFavoris.getState().supprimer(id);
                    void navigate({ to: "/favoris" });
                  }}
                >
                  {tr("Supprimer")}
                </button>
                <button type="button" className="fv-pilule" onClick={() => setSuppression(false)}>
                  {tr("Garder")}
                </button>
              </span>
            ) : (
              <button
                type="button"
                className="fv-pilule fv-pilule--supprimer"
                onClick={() => setSuppression(true)}
              >
                {tr("Supprimer le dossier")}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

type Colonne = "prix" | "pp" | "cap" | "ch" | "dist" | "alt";

/** Les colonnes comparées : chacune part dans son sens de départ, le meilleur en tête. */
const COLONNES: { k: Colonne; label: string; sens: Sens }[] = [
  { k: "prix", label: aTraduire("Prix total"), sens: 1 },
  { k: "pp", label: aTraduire("Par personne"), sens: 1 },
  { k: "cap", label: aTraduire("Capacité"), sens: -1 },
  { k: "ch", label: aTraduire("Chambres"), sens: -1 },
  { k: "dist", label: aTraduire("Remontées"), sens: 1 },
  { k: "alt", label: aTraduire("Altitude"), sens: -1 },
];

function Comparaison({
  favoris,
  courant,
  altDe,
  ouvrir,
}: {
  favoris: Favori[];
  courant: SejourFavori;
  altDe: (l: Listing) => Altitude | null | undefined;
  ouvrir: (id: string) => void;
}) {
  // Le moins cher d'abord, comme la maquette.
  const [col, setCol] = useState<Colonne>("prix");
  const [sens, setSens] = useState<Sens>(1);
  const mesure = (f: Favori, c: Colonne): number | null => {
    const l = f.annonce;
    const s = sejourDe(f, courant);
    if (c === "prix") return l.total > 0 ? l.total : null;
    if (c === "pp") return l.total > 0 && s.trav > 0 ? l.total / s.trav : null;
    if (c === "cap") return l.capacity ?? null;
    if (c === "ch") return l.bedrooms ?? null;
    if (c === "dist") return distFiltrableM(l);
    return altDe(l)?.m ?? null;
  };
  const lignes = [...favoris].sort((a, b) => parMesure(mesure(a, col), mesure(b, col), sens));
  /** La meilleure valeur de chaque colonne, pour la marquer. */
  const meilleure = new Map<Colonne, number>();
  for (const c of COLONNES) {
    const vals = favoris.map((f) => mesure(f, c.k)).filter((v): v is number => v != null);
    // Rien à départager quand toutes les valeurs sont égales.
    if (vals.length > 1 && Math.min(...vals) !== Math.max(...vals)) {
      meilleure.set(c.k, c.sens === 1 ? Math.min(...vals) : Math.max(...vals));
    }
  }
  const cls = (f: Favori, c: Colonne) => {
    const v = mesure(f, c);
    return `fv-cmp__val${v != null && meilleure.get(c) === v ? " fv-cmp__val--mieux" : ""}`;
  };
  const trier = (c: Colonne, sensDepart: Sens) => {
    if (col === c) setSens((s) => (s === 1 ? -1 : 1));
    else {
      setCol(c);
      setSens(sensDepart);
    }
  };
  return (
    <section className="fv-cmp" aria-label={tr("Comparaison des logements du dossier")}>
      <div role="table" className="fv-cmp__table">
        <div role="row" className="fv-cmp__rang fv-cmp__rang--tete">
          <span role="columnheader" className="m8-lu-seul">
            {tr("Logement")}
          </span>
          {COLONNES.map((c) => (
            <span
              key={c.k}
              role="columnheader"
              aria-sort={col === c.k ? (sens === 1 ? "ascending" : "descending") : undefined}
            >
              <button
                type="button"
                className={`fv-tri${col === c.k ? " fv-tri--on" : ""}`}
                onClick={() => trier(c.k, c.sens)}
              >
                {tr(c.label)}
                {col === c.k ? <FlecheTri sens={sens} /> : null}
              </button>
            </span>
          ))}
        </div>
        {lignes.map((f) => {
          const l = f.annonce;
          const s = sejourDe(f, courant);
          const alt = altDe(l);
          return (
            <div role="row" key={f.annonceId} className="fv-cmp__rang">
              <span role="rowheader">
                <button
                  type="button"
                  className="fv-cmp__logement"
                  title={tr("Prix pour {sejour}", { sejour: sejourLbl(s) })}
                  onClick={() => ouvrir(l.id)}
                >
                  <span className="fv-cmp__vignette">
                    {l.photo ? <img src={l.photo} alt="" loading="lazy" decoding="async" /> : null}
                  </span>
                  <span className="fv-cmp__noms">
                    <b>{l.title}</b>
                    <span>{nomStationPropre(l) ?? l.source}</span>
                  </span>
                </button>
              </span>
              <span role="cell" className={cls(f, "prix")}>
                {prixLbl(l)}
              </span>
              <span role="cell" className={cls(f, "pp")}>
                {prixPersLbl(l, s.trav) ?? "–"}
              </span>
              <span role="cell" className={cls(f, "cap")}>
                {capLbl(l)}
              </span>
              <span role="cell" className={cls(f, "ch")}>
                {bedLbl(l)}
              </span>
              <span role="cell" className={cls(f, "dist")}>
                {distFiltrableM(l) == null
                  ? tr("non mesurée")
                  : viaDistance(l) === "pieton" && distanceOf(l).kind === "measured"
                    ? tr("{distance} à pied", { distance: `${fmt(distFiltrableM(l))} m` })
                    : tr("{distance} à vol d’oiseau", { distance: `${fmt(distFiltrableM(l))} m` })}
              </span>
              <span
                role="cell"
                className={cls(f, "alt")}
                title={altitudeAide(alt, positionApprochee(l))}
              >
                {pointAltitude(l) ? altitudeLbl(alt, positionApprochee(l)) : tr("sans position")}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
