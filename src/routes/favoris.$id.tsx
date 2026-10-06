/**
 * Un dossier de favoris : ses logements à gauche, leur carte à droite, comme
 * une liste d'Airbnb ; et « Comparer », le tableau des mêmes logements côte à
 * côte (prix, capacité, chambres, distance aux remontées, altitude).
 *
 * Chaque logement garde le séjour pour lequel il a été enregistré : ses prix
 * valent pour ces dates et ce groupe, et la carte le dit.
 */

import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Coquille } from "@/components/Coquille";
import { Icon } from "@/components/Icon";
import { ImageSlot } from "@/components/v6/ImageSlot";
import { useGo } from "@/components/v6/go";
import { CarteEpingles, type Marqueur } from "@/components/v7/CarteEpingles";
import { CarteLogement } from "@/components/v7/CarteLogement";
import { epinglePrix, ETAGE } from "@/components/v7/epingle";
import { FicheEpingle } from "@/components/v7/FicheEpingle";
import { Vide } from "@/components/v7/Vide";
import { VoletAnnonce } from "@/components/v7/VoletAnnonce";
import { altitudeAide, altitudeLbl, pointAltitude, positionApprochee, type Altitude } from "@/lib/altitude/altitude";
import { useAltitudes } from "@/lib/altitude/store";
import { contenu, type Favori, type SejourFavori } from "@/lib/favoris/modele";
import { useFavoris } from "@/lib/favoris/store";
import type { Listing } from "@/lib/listings";
import { nightsBetween, useParcours } from "@/lib/parcours";
import { sourceEtLieu } from "@/lib/rattachement";
import { useStay } from "@/lib/stay";
import { distFiltrableM } from "@/lib/stay/lodgingFilter";
import { parMesure, type Sens } from "@/lib/tri";
import { bedLbl, capLbl, distanceOf, prixLbl, prixPersLbl, prixPin } from "@/lib/v7";
import { langueIntl } from "@/lib/i18n/langue";
import { aTraduire, tr, trN } from "@/lib/i18n";

export const Route = createFileRoute("/favoris/$id")({ component: PageDossier });

function PageDossier() {
  const { id } = Route.useParams();
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  return (
    <Coquille>
      <main className="v7main v7main--serre favoris7" id="s-favoris-dossier" data-screen-label="Dossier de favoris">
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
  new Intl.DateTimeFormat(langueIntl(), { day: "numeric", month: "short", timeZone: "UTC" }).format(d);
function sejourLbl(s: SejourFavori): string {
  const d = (iso: string) => dateCourte(new Date(`${iso}T12:00:00Z`));
  const dates = { du: d(s.checkIn), au: d(s.checkOut) };
  // « 1 pers. » à part : l'anglais dit « 1 person », « 4 people ».
  return s.trav === 1 ? tr("{du} → {au} · 1 pers.", dates) : tr("{du} → {au} · {n} pers.", { ...dates, n: s.trav });
}

function Dossier({ id }: { id: string }) {
  const etat = useFavoris();
  const dossier = etat.dossiers.find((d) => d.id === id);
  const favoris = useMemo(() => contenu(etat, id), [etat, id]);
  const annonces = useMemo(() => favoris.map((f) => f.annonce), [favoris]);
  const altDe = useAltitudes(annonces);
  const { checkIn, checkOut, guests } = useStay();
  const courant = useMemo<SejourFavori>(() => ({ checkIn, checkOut, trav: guests }), [checkIn, checkOut, guests]);
  const [vue, setVue] = useState<"liste" | "comparer">("liste");
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [actif, setActif] = useState<string | null>(null);
  const P = useParcours();
  const go = useGo();

  const retenir = useCallback(
    (annonceId: string) => {
      const p = useParcours.getState();
      if (p.lodgeId === annonceId) return p.chooseLodge(null);
      const f = favoris.find((x) => x.annonceId === annonceId);
      if (!f) return;
      p.retain(f.annonce.stationId);
      if (f.sejour) useStay.getState().setStay({ checkIn: f.sejour.checkIn, checkOut: f.sejour.checkOut });
      p.chooseLodge(annonceId);
    },
    [favoris],
  );

  if (!dossier) {
    return (
      <Vide
        titre={tr("Ce dossier n’existe plus")}
        actions={
          <Link to="/favoris" className="btn7 btn7--encre">
            {tr("Revoir les dossiers")}
          </Link>
        }
      >
        {tr("Il a été supprimé, ou il a été créé dans un autre navigateur. Vos dossiers restent dans Favoris.")}
      </Vide>
    );
  }

  const parId = new Map(favoris.map((f) => [f.annonceId, f]));
  const fOuvert = ouvert ? parId.get(ouvert) : undefined;
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
      <EnTete id={id} nom={dossier.nom} n={favoris.length} sansPoint={favoris.length - situes.length} vue={vue} setVue={setVue} />
      {favoris.length === 0 ? (
        <Vide
          titre={tr("Ce dossier est vide")}
          actions={
            <button type="button" className="btn7 btn7--encre" onClick={() => go("lodging")}>
              {tr("Voir les logements")}
            </button>
          }
        >
          {tr("Le cœur, en haut à droite de chaque annonce, l’enregistre ici.")}
        </Vide>
      ) : vue === "comparer" ? (
        <Comparaison favoris={favoris} courant={courant} altDe={altDe} ouvrir={setOuvert} />
      ) : (
        <div className="v7deux">
          <div className="v7deux__liste" aria-label={tr("Logements du dossier")}>
            <div className="grille7-2">
              {favoris.map((f) => {
                const s = sejourDe(f, courant);
                return (
                  <div key={f.annonceId} className="favoris7__case">
                    <CarteLogement
                      l={f.annonce}
                      sources={sourceEtLieu(f.annonce)}
                      autres={null}
                      retenu={P.lodgeId === f.annonceId ? f.annonceId : null}
                      retenuSource={null}
                      vue={false}
                      vif={actif === f.annonceId}
                      stay={s}
                      trav={s.trav}
                      nights={nightsBetween(s.checkIn, s.checkOut) ?? 0}
                      ouvrir={setOuvert}
                      retenir={retenir}
                      designer={setActif}
                      altitude={altDe(f.annonce)}
                      avecAltitude
                    />
                    <span className="favoris7__sejour">{tr("Prix pour {sejour}", { sejour: sejourLbl(s) })}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="v7deux__carte">
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
      {fOuvert ? (
        <VoletAnnonce
          l={fOuvert.annonce}
          stay={sejourDe(fOuvert, courant)}
          trav={sejourDe(fOuvert, courant).trav}
          nights={nightsBetween(sejourDe(fOuvert, courant).checkIn, sejourDe(fOuvert, courant).checkOut) ?? 0}
          groupe={null}
          retenu={P.lodgeId === fOuvert.annonceId}
          onRetenir={() => retenir(fOuvert.annonceId)}
          onFermer={() => setOuvert(null)}
          onVoirOffre={setOuvert}
          suite={
            P.lodgeId === fOuvert.annonceId ? (
              <button type="button" className="btn7 btn7--grand btn7--pleine" onClick={() => void go("booking")}>
                {tr("Passer à la réservation")}
                <Icon name="fleche-droite" taille={16} />
              </button>
            ) : null
          }
        />
      ) : null}
    </>
  );
}

function EnTete({
  id,
  nom,
  n,
  sansPoint,
  vue,
  setVue,
}: {
  id: string;
  nom: string;
  n: number;
  sansPoint: number;
  vue: "liste" | "comparer";
  setVue: (v: "liste" | "comparer") => void;
}) {
  const [edition, setEdition] = useState(false);
  const [brouillon, setBrouillon] = useState(nom);
  const [suppression, setSuppression] = useState(false);
  const navigate = useNavigate();
  return (
    <div className="favoris7__tete">
      <Link to="/favoris" className="favoris7__retour">
        <Icon name="chevron-gauche" taille={14} />
        {tr("Favoris")}
      </Link>
      {edition ? (
        <form
          className="favoris7__renommer"
          onSubmit={(e) => {
            e.preventDefault();
            useFavoris.getState().renommer(id, brouillon);
            setEdition(false);
          }}
        >
          <input value={brouillon} maxLength={60} onChange={(e) => setBrouillon(e.target.value)} aria-label={tr("Nom du dossier")} autoFocus />
          <button type="submit" className="btn7 btn7--encre" disabled={!brouillon.trim()}>
            {tr("Enregistrer")}
          </button>
          <button type="button" className="btn7 btn7--fantome" onClick={() => setEdition(false)}>
            {tr("Annuler")}
          </button>
        </form>
      ) : (
        <h1 className="favoris7__titre">{nom}</h1>
      )}
      <div className="favoris7__barre">
        <span className="favoris7__compte">
          {trN(n, "{n} logement", "{n} logements")}
          {sansPoint > 0 ? ` · ${tr("{n} sans position sur la carte", { n: sansPoint })}` : ""}
        </span>
        <div className="favoris7__vues" role="tablist" aria-label={tr("Affichage")}>
          <button type="button" role="tab" aria-selected={vue === "liste"} className={vue === "liste" ? "on" : undefined} onClick={() => setVue("liste")}>
            {tr("Liste et carte")}
          </button>
          <button type="button" role="tab" aria-selected={vue === "comparer"} className={vue === "comparer" ? "on" : undefined} onClick={() => setVue("comparer")}>
            {tr("Comparer")}
          </button>
        </div>
        {!edition ? (
          <button
            type="button"
            className="btn7 btn7--fantome"
            onClick={() => {
              setBrouillon(nom);
              setEdition(true);
            }}
          >
            {tr("Renommer")}
          </button>
        ) : null}
        {suppression ? (
          <span className="favoris7__confirmer" role="alert">
            {n > 0
              ? trN(n, "Supprimer ce dossier et son logement ?", "Supprimer ce dossier et ses {n} logements ?")
              : tr("Supprimer ce dossier ?")}
            <button
              type="button"
              className="btn7 btn7--encre"
              onClick={() => {
                useFavoris.getState().supprimer(id);
                void navigate({ to: "/favoris" });
              }}
            >
              {tr("Supprimer")}
            </button>
            <button type="button" className="btn7 btn7--fantome" onClick={() => setSuppression(false)}>
              {tr("Garder")}
            </button>
          </span>
        ) : (
          <button type="button" className="btn7 btn7--fantome" onClick={() => setSuppression(true)}>
            {tr("Supprimer le dossier")}
          </button>
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
  const [col, setCol] = useState<Colonne | null>(null);
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
  const lignes = col ? [...favoris].sort((a, b) => parMesure(mesure(a, col), mesure(b, col), sens)) : favoris;
  /** La meilleure valeur de chaque colonne, pour la marquer. */
  const meilleure = new Map<Colonne, number>();
  for (const c of COLONNES) {
    const vals = favoris.map((f) => mesure(f, c.k)).filter((v): v is number => v != null);
    // Rien à départager quand toutes les valeurs sont égales.
    if (vals.length > 1 && Math.min(...vals) !== Math.max(...vals)) {
      meilleure.set(c.k, c.sens === 1 ? Math.min(...vals) : Math.max(...vals));
    }
  }
  const marque = (f: Favori, c: Colonne) => {
    const v = mesure(f, c);
    return v != null && meilleure.get(c) === v ? " favcmp7__mieux" : "";
  };
  const trier = (c: Colonne, sensDepart: Sens) => {
    if (col === c) setSens((s) => (s === 1 ? -1 : 1));
    else {
      setCol(c);
      setSens(sensDepart);
    }
  };
  return (
    <div className="favcmp7" role="region" aria-label={tr("Comparaison des logements du dossier")}>
      <table>
        <thead>
          <tr>
            <th scope="col">{tr("Logement")}</th>
            <th scope="col">{tr("Séjour")}</th>
            {COLONNES.map((c) => (
              <th key={c.k} scope="col" aria-sort={col === c.k ? (sens === 1 ? "ascending" : "descending") : undefined}>
                <button type="button" onClick={() => trier(c.k, c.sens)}>
                  {tr(c.label)}
                  {col === c.k ? <Icon name={sens === 1 ? "chevron-bas" : "chevron-droite"} taille={12} /> : null}
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lignes.map((f) => {
            const l = f.annonce;
            const s = sejourDe(f, courant);
            const alt = altDe(l);
            return (
              <tr key={f.annonceId}>
                <th scope="row">
                  <button type="button" className="favcmp7__logement" onClick={() => ouvrir(l.id)}>
                    <span className="favcmp7__vignette">
                      {l.photo ? <ImageSlot shape="rect" id={`cmp-${l.id}`} placeholder="" className="favcmp7__img" src={l.photo} /> : null}
                    </span>
                    <span>
                      <b>{l.title}</b>
                      <small>
                        {sourceEtLieu(l)}
                      </small>
                    </span>
                  </button>
                </th>
                <td className="favcmp7__doux">{sejourLbl(s)}</td>
                <td className={`favcmp7__nombre${marque(f, "prix")}`}>{prixLbl(l)}</td>
                <td className={`favcmp7__nombre${marque(f, "pp")}`}>{prixPersLbl(l, s.trav) ?? "–"}</td>
                <td className={`favcmp7__nombre${marque(f, "cap")}`}>{capLbl(l)}</td>
                <td className={`favcmp7__nombre${marque(f, "ch")}`}>{bedLbl(l)}</td>
                <td className={marque(f, "dist").trim() || undefined}>{distanceOf(l).text}</td>
                <td
                  className={`favcmp7__nombre${marque(f, "alt")}`}
                  title={altitudeAide(alt, positionApprochee(l))}
                >
                  {pointAltitude(l) ? altitudeLbl(alt, positionApprochee(l)) : tr("sans position")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="favcmp7__note">
        {tr(
          "En gras, la meilleure valeur de chaque colonne. Les prix valent pour le séjour de chaque ligne : deux logements enregistrés pour des dates différentes ne se comparent qu’à titre indicatif.",
        )}
      </p>
    </div>
  );
}
