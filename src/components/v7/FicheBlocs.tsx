/**
 * Les blocs de la fiche d'annonce (`VoletAnnonce`), dans l'ordre de la
 * colonne de gauche, et la carte de prix de droite. Maquette « Fiche
 * Logement » du 12 oct. 2026.
 *
 * Rien n'est estimé : une donnée absente se dit absente. Les explications
 * (d'où vient une distance, une altitude, une position) vont en infobulle,
 * pas à côté de la donnée. Les montants et l'écart viennent des fonctions de
 * l'écran Logements (`prixLbl`, `eurCents`, `montantCents`, `forfaitInclus`,
 * `ecartAvecPrincipale`, `totalSejour`).
 */

import { useMemo, useState, type ReactNode } from "react";
import { Carte, type Epingle, type Segment } from "@/components/Carte";
import { PictoEquipement, PictoUi } from "@/components/v7/fiche/PictoFiche";
import { resumePrix } from "@/components/v7/fiche/resumePrix";
import { otherDomainMessage, sectorOf } from "@/lib/access";
import {
  altitudeAide,
  altitudeLbl,
  positionApprochee,
  type Altitude,
} from "@/lib/altitude/altitude";
import { useAltitudes } from "@/lib/altitude/store";
import { useCheminAPied } from "@/lib/geo/useReseauPieton";
import { trajetVoiture } from "@/lib/stay/aPied";
import { montantCents } from "@/lib/devises";
import type { BudgetForfaits } from "@/lib/forfaits/prixSejour";
import { aTraduire, tr, trN } from "@/lib/i18n";
import { langueIntl } from "@/lib/i18n/langue";
import type { Listing } from "@/lib/listings";
import { noteSur5Lbl } from "@/lib/note";
import { eurCents, mLbl, nuitsLbl } from "@/lib/parcours";
import { difficultyToColor, type PisteColor } from "@/lib/pistes";
import { provenancePhrase } from "@/lib/provenance";
import type { Station } from "@/lib/stations";
import {
  altitudesRemontee,
  arrondiM,
  pisteLaPlusProche,
  PISTE_MAX_M,
  skisAuxPieds,
  tempsAPied,
  type FichierTraces,
} from "@/lib/stay/accesPistes";
import { availabilityLabel, availabilityOf } from "@/lib/stay/availability";
import {
  EQUIPEMENTS_EN_AVANT,
  EQUIPEMENTS_FICHE,
  LIBELLE_EQUIPEMENT,
  type CleEquipement,
  type EquipementFiche,
} from "@/lib/stay/equipements";
import {
  avisDe,
  conditionsDe,
  descriptionDe,
  equipementsDe,
  tronquer,
  type ConditionsSejour,
} from "@/lib/stay/ficheEnrichie";
import { forfaitInclus } from "@/lib/stay/forfaitInclus";
import { CHAMP_LIBELLE, champsNonIndiques } from "@/lib/stay/nonIndique";
import { ecartAvecPrincipale, type Logement } from "@/lib/stay/regroupement";
import { forfaitsAjoutables } from "@/lib/stay/totalSejour";
import { bedLbl, capLbl, distanceOf, firmOf, kmLbl, prixLbl } from "@/lib/v7";

type Sejour = { checkIn: string; checkOut: string };

/** Au-delà, la description se replie derrière « Lire la suite ». */
const DESCRIPTION_COURTE = 170;
/** Au-delà, les équipements se replient derrière « Afficher les N équipements ». */
const EQUIPEMENTS_COURTS = 12;
/** La distance qui remplit le trait du schéma d'accès. */
const SCHEMA_M = 1500;

const PISTE_COULEUR: Record<PisteColor, string> = {
  green: aTraduire("Piste verte"),
  blue: aTraduire("Piste bleue"),
  red: aTraduire("Piste rouge"),
  black: aTraduire("Piste noire"),
  other: aTraduire("Piste"),
};

const dateCourte = (ms: number) =>
  new Intl.DateTimeFormat(langueIntl(), { day: "numeric", month: "short", year: "numeric" }).format(
    new Date(ms),
  );

/** Le type publié, avec sa capitale : Cozy écrit « studio », « appartement ». */
const majuscule = (s: string) => s.charAt(0).toLocaleUpperCase(langueIntl()) + s.slice(1);

const altM = (m: number) =>
  `${new Intl.NumberFormat(langueIntl(), { maximumFractionDigits: 0 }).format(m)} m`;

/** Le titre : le lieu et la station, le nom, la note, le type, la plateforme. */
export function BlocTitre({
  l,
  station,
  titreId,
}: {
  l: Listing;
  station: string | null;
  titreId: string;
}) {
  const avis = avisDe(l);
  const note = avis ? noteSur5Lbl(avis.noteSur5) : null;
  const lieu = [sectorOf(l), station].filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
  return (
    <div className="fl-titre">
      {lieu.length ? <span className="fl-titre__lieu">{lieu.join(" · ")}</span> : null}
      <h1 id={titreId}>{l.title}</h1>
      <div
        className="fl-titre__meta"
        title={[provenancePhrase(l), l.proven].filter(Boolean).join("\n")}
      >
        <span>
          <b>{note ?? tr("Sans note")}</b>
          {avis?.nombre ? trN(avis.nombre, "{n} avis", "{n} avis") : null}
        </span>
        {l.propertyType?.trim() ? <span>{majuscule(l.propertyType.trim())}</span> : null}
        {l.priceIndicative ? <span className="fl-puce">{tr("Prix « à partir de »")}</span> : null}
      </div>
    </div>
  );
}

/** Les faits clés sur une ligne : capacité, chambres, lits, remontées, altitude. */
export function BlocFaits({ l, altitude }: { l: Listing; altitude: Altitude | null | undefined }) {
  const dist = distanceOf(l);
  const approchee = positionApprochee(l);
  const faits: { k: string; v: string; aide?: string }[] = [
    { k: "cap", v: capLbl(l) },
    { k: "ch", v: bedLbl(l) },
    ...(l.beds != null ? [{ k: "lits", v: trN(l.beds, "{n} lit", "{n} lits") }] : []),
    ...(l.baths != null
      ? [{ k: "sdb", v: trN(l.baths, "{n} salle de bain", "{n} salles de bain") }]
      : []),
    {
      k: "dist",
      v:
        dist.kind === "measured"
          ? [
              dist.via === "pieton"
                ? tr("{distance} à pied des remontées", { distance: mLbl(l.distToLiftM) ?? "" })
                : tr("{distance} des remontées à vol d’oiseau", {
                    distance: mLbl(l.distToLiftM) ?? "",
                  }),
              // La marche d'abord, qui trie et filtre ; la voiture quand elle
              // l'emporte (`stay/aPied.ts`).
              dist.voiture
                ? tr("{minutes} min en voiture", { minutes: dist.voiture.minutes })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : dist.text,
      aide: dist.kind === "measured" ? dist.text : undefined,
    },
    ...(l.lat != null && l.lon != null
      ? [
          {
            k: "alt",
            v: altitude
              ? tr("{altitude} d’altitude", { altitude: altitudeLbl(altitude, approchee) })
              : altitudeLbl(altitude, approchee),
            aide: altitudeAide(altitude, approchee),
          },
        ]
      : []),
  ];
  return (
    <p className="fl-faits">
      {faits.map((f) => (
        <span key={f.k} title={f.aide}>
          {f.v}
        </span>
      ))}
    </p>
  );
}

/**
 * Du logement à la remontée la plus proche, en schéma ; dessous, le domaine,
 * la piste la plus proche et le village. `complements` : des mesures de plus
 * (la trace GPX de l'écran Traces).
 */
export function BlocAcces({
  l,
  altitude,
  traces,
  station,
  complements,
}: {
  l: Listing;
  altitude: Altitude | null | undefined;
  /** Les tracés du domaine : `undefined` pendant le chargement. */
  traces: FichierTraces | null | undefined;
  station: Station | undefined;
  complements?: ReactNode;
}) {
  const approchee = positionApprochee(l);
  // La marche longue fait prendre la voiture (`stay/aPied.ts`) : le schéma
  // dit alors la route, jusqu'à la remontée qu'on rejoint en voiture.
  const voiture = trajetVoiture(l);
  const lift = voiture ?? l;
  const trajetM = voiture ? voiture.m : l.distToLiftM;
  const gares = useMemo(
    () => [
      { lat: lift.liftLat ?? null, lon: lift.liftLon ?? null },
      { lat: lift.liftOtherLat ?? null, lon: lift.liftOtherLon ?? null },
    ],
    [lift.liftLat, lift.liftLon, lift.liftOtherLat, lift.liftOtherLon],
  );
  const altDe = useAltitudes(gares);
  const altA = altDe(gares[0]);
  const altB = altDe(gares[1]);
  const remontee = altitudesRemontee(altA?.m, altB?.m);
  const lectureGares =
    (gares[0].lat != null && altA === undefined) || (gares[1].lat != null && altB === undefined);
  const piste = useMemo(
    () =>
      l.lat != null && l.lon != null && traces
        ? pisteLaPlusProche(l.lat, l.lon, traces.pistes)
        : null,
    [l.lat, l.lon, traces],
  );
  const aPied = tempsAPied(l.distToPlaceM);
  const dist = distanceOf(l);
  const km = station ? kmLbl(station) : null;
  // Un point triangulé n'est pas la porte : l'accès ne se mesure pas plus
  // que sans point.
  const mesurable = l.lat != null && l.lon != null && l.gpsSource !== "triangule";

  const autre =
    l.domainFit === "other"
      ? otherDomainMessage(
          {
            searchedId: l.stationId,
            nearestStationId: l.nearestDomainId ?? null,
            nearestStationName: l.nearestDomainName ?? null,
            villageId: l.villageId ?? null,
            via: l.rattachementVia ?? null,
            motif: null,
            distToSearchedPinM: l.distToSlopesM ?? null,
            distToNearestPinM: l.distToNearestDomainM ?? null,
            verdict: "other",
            winterBarrier: l.winterBarrier ?? null,
          },
          station?.name ?? l.stationId,
        )
      : null;

  const pisteM = piste ? arrondiM(piste.m) : null;
  const pct = trajetM != null ? Math.min(0.94, Math.max(0.06, trajetM / SCHEMA_M)) * 100 : null;

  return (
    <section
      className="fl-carte fl-acces"
      aria-label={tr("Accès aux pistes")}
      title={
        mesurable && approchee
          ? tr(
              "Position approchée : les distances peuvent s’écarter de quelques dizaines de mètres.",
            )
          : undefined
      }
    >
      {mesurable && dist.kind === "measured" && pct != null ? (
        <div className="fl-schema">
          <div className="fl-schema__bout">
            <b>{tr("Logement")}</b>
            <span title={altitudeAide(altitude, approchee)}>
              {altitudeLbl(altitude, approchee)}
            </span>
          </div>
          <div className="fl-schema__trait" title={dist.text}>
            <i style={{ width: `${pct}%` }} />
            <span style={{ left: `${pct}%` }}>{mLbl(trajetM)}</span>
            {/* Ce que mesure le chiffre : la route quand la marche est
                longue, la marche par les rues et chemins (`stay/aPied.ts`),
                ou la ligne droite faute de réseau. */}
            <small>
              {voiture
                ? tr("en voiture, {minutes} min", { minutes: voiture.minutes })
                : dist.via === "pieton"
                  ? tr("à pied")
                  : tr("à vol d’oiseau")}
            </small>
          </div>
          <div className="fl-schema__bout fl-schema__bout--fin">
            <b>{lift.liftName?.trim() || tr("Remontée")}</b>
            <span className={remontee ? undefined : "fl-absent"}>
              {remontee
                ? `${altM(remontee.depart)} → ${altM(remontee.arrivee)}`
                : lectureGares
                  ? tr("altitudes de la remontée en cours de lecture")
                  : tr("altitudes de la remontée non mesurées")}
            </span>
          </div>
        </div>
      ) : (
        <p className="fl-acces__seul" title={autre ?? undefined}>
          {dist.text}
        </p>
      )}
      <ul className="fl-acces__ligne">
        {voiture && l.distToLiftM != null ? (
          <li>
            {dist.via === "pieton"
              ? tr("{distance} à pied de {remontee}", {
                  distance: mLbl(l.distToLiftM) ?? "",
                  remontee: l.liftName ?? tr("la remontée"),
                })
              : tr("{distance} à vol d’oiseau de {remontee}", {
                  distance: mLbl(l.distToLiftM) ?? "",
                  remontee: l.liftName ?? tr("la remontée"),
                })}
          </li>
        ) : null}
        {km ? <li>{tr("{km} de pistes", { km })}</li> : null}
        {mesurable ? (
          <li
            title={
              piste
                ? tr("Distance à vol d’oiseau jusqu’au tracé de la piste (OpenSkiMap).")
                : undefined
            }
          >
            {traces === undefined ? (
              <span className="fl-absent">{tr("Tracés des pistes en cours de chargement")}</span>
            ) : traces === null ? (
              <span className="fl-absent">
                {tr("Tracés des pistes non disponibles pour cette station")}
              </span>
            ) : piste && pisteM != null ? (
              <>
                {tr("{piste} à {distance}", {
                  piste: [
                    tr(PISTE_COULEUR[difficultyToColor(piste.piste.d ?? undefined)]),
                    piste.piste.n ?? piste.piste.r,
                  ]
                    .filter(Boolean)
                    .join(" "),
                  distance: mLbl(pisteM) ?? "",
                })}
                {skisAuxPieds(piste.m, approchee) ? (
                  <span className="fl-puce fl-puce--ok">{tr("Skis aux pieds")}</span>
                ) : null}
              </>
            ) : (
              <span className="fl-absent">
                {tr("Aucune piste à moins de {distance}", { distance: mLbl(PISTE_MAX_M) ?? "" })}
              </span>
            )}
          </li>
        ) : null}
        {mesurable && l.placeName ? (
          <li>
            {[
              l.placeName,
              l.distToPlaceM != null && aPied
                ? aPied.moins
                  ? tr("{distance}, moins de 5 min à pied", {
                      distance: mLbl(l.distToPlaceM) ?? "",
                    })
                  : tr("{distance}, {minutes} min à pied", {
                      distance: mLbl(l.distToPlaceM) ?? "",
                      minutes: aPied.minutes,
                    })
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </li>
        ) : null}
        {complements}
      </ul>
    </section>
  );
}

/** Les douze clés des collecteurs, vers la table des équipements de la fiche. */
const ID_DE_CLE: Record<CleEquipement, string> = {
  balcon: "balcon",
  cheminee: "cheminee",
  wifi: "wifi",
  laveVaisselle: "lave_vaisselle",
  laveLinge: "lave_linge",
  linge: "linge_fourni",
  parking: "parking",
  casierSkis: "casier_skis",
  saunaSpa: "sauna_spa",
  piscine: "piscine",
  animaux: "animaux",
  ascenseur: "ascenseur",
};

type EtatEquipement = "oui" | "non" | "inconnu";
type LigneEquipement = { id: string; nom: string; libelle: string; etat: EtatEquipement };

/** Le nom d'un équipement : le libellé français de la table, sinon celui de la source. */
function nomEquipement(e: EquipementFiche): string {
  const def = EQUIPEMENTS_FICHE[e.id];
  return def ? tr(def.libelle) : e.libelle;
}

/**
 * Les équipements dans l'ordre de lecture : ceux qu'on met en avant, les
 * autres présents par groupe, les absents, puis ceux que l'annonce tait
 * (relevés « inconnu » sur les douze clés des collecteurs).
 */
function lignesEquipements(l: Listing): LigneEquipement[] {
  const liste = equipementsDe(l) ?? [];
  const presents = liste.filter((e) => e.present);
  const enAvant = EQUIPEMENTS_EN_AVANT.map((id) => presents.find((e) => e.id === id)).filter(
    (e): e is EquipementFiche => e != null,
  );
  const reste = presents
    .filter((e) => !enAvant.includes(e))
    .sort((a, b) => (a.groupe ?? "~").localeCompare(b.groupe ?? "~"));
  const vus = new Set(liste.map((e) => e.id));
  const taits = (l.amenities ?? [])
    .filter((e) => e.valeur === "inconnu" && !vus.has(ID_DE_CLE[e.cle]))
    .map((e): LigneEquipement => {
      const nom = tr(LIBELLE_EQUIPEMENT[e.cle]);
      return { id: ID_DE_CLE[e.cle], nom, libelle: nom, etat: "inconnu" };
    });
  const ligne = (e: EquipementFiche): LigneEquipement => ({
    id: e.id,
    nom: nomEquipement(e),
    libelle: e.libelle,
    etat: e.present ? "oui" : "non",
  });
  return [
    ...enAvant.map(ligne),
    ...reste.map(ligne),
    ...liste.filter((e) => !e.present).map(ligne),
    ...taits,
  ];
}

const ETAT_LECTEUR: Record<EtatEquipement, string> = {
  oui: aTraduire("présent"),
  non: aTraduire("absent"),
  inconnu: aTraduire("non indiqué"),
};

/** La description publiée, repliée quand elle est longue, puis les équipements en pictogrammes. */
export function BlocAnnonce({ l }: { l: Listing }) {
  const [entiere, setEntiere] = useState(false);
  const [tous, setTous] = useState(false);
  const texte = descriptionDe(l) ?? "";
  const longue = texte.length > DESCRIPTION_COURTE;
  const lignes = useMemo(() => lignesEquipements(l), [l]);
  const vus = tous ? lignes : lignes.slice(0, EQUIPEMENTS_COURTS);
  if (!texte && !lignes.length) {
    return (
      <section className="fl-carte fl-annonce">
        <p className="fl-absent">{tr("Non publié par {source}", { source: l.source })}</p>
      </section>
    );
  }
  return (
    <section className="fl-carte fl-annonce" aria-label={tr("Description")}>
      {texte ? (
        <>
          <p className="fl-annonce__texte">
            {longue && !entiere ? tronquer(texte, DESCRIPTION_COURTE) : texte}
          </p>
          {longue ? (
            <button
              type="button"
              className="fl-lien"
              aria-expanded={entiere}
              onClick={() => setEntiere((o) => !o)}
            >
              {entiere ? tr("Réduire") : tr("Lire la suite")}
            </button>
          ) : null}
        </>
      ) : null}
      {lignes.length ? (
        <>
          <ul
            className={`fl-equipements${texte ? "" : " fl-equipements--seuls"}`}
            aria-label={tr("Équipements")}
          >
            {vus.map((e) => (
              <li
                key={e.id}
                className={`fl-equipement fl-equipement--${e.etat}`}
                title={
                  e.etat === "oui"
                    ? e.libelle !== e.nom
                      ? e.libelle
                      : undefined
                    : e.etat === "non"
                      ? tr("Non")
                      : tr("Non indiqué")
                }
              >
                <PictoEquipement id={e.id} />
                <span className="fl-equipement__nom">{e.nom}</span>
                <span className="lecteur7">{tr(ETAT_LECTEUR[e.etat])}</span>
              </li>
            ))}
          </ul>
          {lignes.length > EQUIPEMENTS_COURTS ? (
            <button
              type="button"
              className="fl-lien"
              aria-expanded={tous}
              onClick={() => setTous((o) => !o)}
            >
              {tous ? tr("Réduire") : tr("Afficher les {n} équipements", { n: lignes.length })}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

/** Une section repliable de la fiche. */
function Repli({
  titre,
  resume,
  ouverte = false,
  children,
}: {
  titre: string;
  resume?: string | null;
  ouverte?: boolean;
  children: ReactNode;
}) {
  return (
    <details className="fl-carte fl-repli" open={ouverte}>
      <summary>
        <b>{titre}</b>
        {resume ? <span>{resume}</span> : null}
        <PictoUi nom="bas" />
      </summary>
      <div className="fl-repli__corps">{children}</div>
    </details>
  );
}

/** « Voir sur Airbnb », vers la page de la source. */
function VoirSur({ l, url }: { l: Listing; url?: string | null }) {
  const href = url ?? l.url;
  if (!href) return null;
  return (
    <a className="fl-lien" href={href} target="_blank" rel="noopener">
      {tr("Voir sur {source}", { source: l.source })}
      <PictoUi nom="externe" />
    </a>
  );
}

/** Les avis publiés : la note, le nombre, les extraits. Rien quand la source n'en publie pas. */
export function BlocAvis({ l }: { l: Listing }) {
  const avis = avisDe(l);
  if (!avis || (!avis.extraits.length && !avis.url)) return null;
  const note = noteSur5Lbl(avis.noteSur5);
  const resume = [note, avis.nombre ? trN(avis.nombre, "{n} avis", "{n} avis") : null]
    .filter(Boolean)
    .join(" · ");
  return (
    <Repli titre={tr("Avis")} resume={resume || null}>
      {avis.extraits.length ? (
        <ul className="fl-avis">
          {avis.extraits.map((x, i) => {
            const n = noteSur5Lbl(x.noteSur5);
            const meta = [x.auteur, x.date, n].filter(Boolean).join(" · ");
            return (
              <li key={i}>
                <blockquote>{tronquer(x.texte, 400)}</blockquote>
                {meta ? <span className="fl-note">{meta}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
      <VoirSur l={l} url={avis.url} />
    </Repli>
  );
}

const OUI_NON: Record<string, string> = {
  oui: aTraduire("Oui"),
  non: aTraduire("Non"),
  sur_demande: aTraduire("Sur demande"),
};

const LIGNES_CONDITIONS: readonly { k: keyof ConditionsSejour; label: string }[] = [
  { k: "arrivee", label: aTraduire("Arrivée") },
  { k: "depart", label: aTraduire("Départ") },
  { k: "annulation", label: aTraduire("Annulation") },
  { k: "paiement", label: aTraduire("Acompte et paiement") },
  { k: "caution", label: aTraduire("Caution") },
  { k: "animaux", label: aTraduire("Animaux") },
  { k: "fumeurs", label: aTraduire("Fumeurs") },
  { k: "fetes", label: aTraduire("Fêtes") },
  { k: "reglement", label: aTraduire("Règlement intérieur") },
];

/** Les conditions, dans les mots de la source. Rien quand elle n'en publie pas. */
export function BlocConditions({ l }: { l: Listing }) {
  const c = conditionsDe(l);
  if (!c) return null;
  const lignes = LIGNES_CONDITIONS.filter(({ k }) => c[k] != null);
  return (
    <Repli titre={tr("Conditions")}>
      {lignes.length ? (
        <dl className="fl-conditions">
          {lignes.map(({ k, label }) => {
            const v = c[k] as string;
            return (
              <div key={k}>
                <dt>{tr(label)}</dt>
                <dd>
                  {k === "animaux" || k === "fumeurs" || k === "fetes" ? tr(OUI_NON[v] ?? v) : v}
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}
      {c.texteSource ? (
        <p
          className="fl-annonce__texte"
          title={tr("Texte publié par {source}, non reformulé.", { source: l.source })}
        >
          {c.texteSource}
        </p>
      ) : null}
    </Repli>
  );
}

/** Les champs vides de l'annonce, sur une ligne. */
export function BlocNonIndique({ l }: { l: Listing }) {
  const champs = champsNonIndiques(l).map((c) => tr(CHAMP_LIBELLE[c]));
  // Les équipements que l'annonce tait, quand ses équipements ont été relevés.
  const taits = (l.amenities ?? [])
    .filter((e) => e.valeur === "inconnu")
    .map((e) => tr(LIBELLE_EQUIPEMENT[e.cle]));
  const tout = [...champs, ...taits];
  if (!tout.length) return null;
  return (
    <section className="fl-manques" title={tr("Non indiqué par {source}", { source: l.source })}>
      <PictoUi nom="alerte" />
      <span>{tr("Non indiqué : {liste}", { liste: tout.join(", ") })}</span>
    </section>
  );
}

/** Le logement et sa remontée sur la carte, reliés par le trajet. */
export function BlocEmplacement({ l }: { l: Listing }) {
  // Le trajet jusqu'à la remontée : par la route quand la marche est longue,
  // à pied sinon ; à défaut de réseau, le trait droit d'avant.
  const chemin = useCheminAPied(l);
  const voiture = trajetVoiture(l);
  const lift = voiture ?? l;
  const { epingles, segments, trace: traitDroit } = useMemo(() => {
    const ep: Epingle[] = [];
    const sg: Segment[] = [];
    let ligne: { lat: number; lon: number }[] = [];
    if (l.lat != null && l.lon != null) {
      ep.push({ id: "logement", lat: l.lat, lon: l.lon, titre: l.title, sorte: "logement" });
      if (lift.liftLat != null && lift.liftLon != null) {
        ep.push({
          id: "remontee",
          lat: lift.liftLat,
          lon: lift.liftLon,
          titre: lift.liftName ?? tr("Remontée"),
          sorte: "remontee",
        });
        ligne = [
          { lat: l.lat, lon: l.lon },
          { lat: lift.liftLat, lon: lift.liftLon },
        ];
        if (lift.liftOtherLat != null && lift.liftOtherLon != null) {
          sg.push({
            id: "remontee",
            a: [lift.liftLat, lift.liftLon],
            b: [lift.liftOtherLat, lift.liftOtherLon],
          });
        }
      }
    }
    return { epingles: ep, segments: sg, trace: ligne };
  }, [
    l.lat,
    l.lon,
    l.title,
    lift.liftLat,
    lift.liftLon,
    lift.liftOtherLat,
    lift.liftOtherLon,
    lift.liftName,
  ]);
  const trace = chemin?.points ?? traitDroit;
  if (!epingles.length) {
    return (
      <section className="fl-carte fl-plan fl-plan--vide">
        <span>{tr("Position non publiée par {source}.", { source: l.source })}</span>
      </section>
    );
  }
  const triangulee = l.gpsSource === "triangule";
  return (
    <section className="fl-carte fl-plan" aria-label={tr("Emplacement")}>
      <Carte
        epingles={epingles}
        segments={segments}
        trace={trace}
        ajuster
        statique
        outils={false}
        zoom={15}
        centre={[l.lat as number, l.lon as number]}
      />
      {triangulee ? (
        <span
          className="fl-plan__note"
          title={tr(
            "Position triangulée : {source} n'a pas publié de GPS. Ce n'est pas la porte.",
            { source: l.source },
          )}
        >
          {tr("Position triangulée")}
        </span>
      ) : positionApprochee(l) ? (
        <span
          className="fl-plan__note"
          title={tr("Position approchée publiée par {source}.", { source: l.source })}
        >
          {tr("Position approchée")}
        </span>
      ) : null}
    </section>
  );
}

/** La carte de prix, à droite. */
export function CartePrix({
  l,
  stay,
  trav,
  nights,
  forfaits,
  forfaitsMotif,
  avecForfaits,
  setAvecForfaits,
  mode,
  setMode,
  groupe,
  retenu,
  onRetenir,
  onVoirOffre,
  suite,
}: {
  l: Listing;
  stay: Sejour;
  trav: number;
  nights: number;
  forfaits: BudgetForfaits | null | undefined;
  forfaitsMotif?: string | null;
  avecForfaits: boolean;
  setAvecForfaits: (v: boolean) => void;
  mode: "total" | "pers";
  setMode: (m: "total" | "pers") => void;
  groupe: Logement | null;
  retenu: boolean;
  onRetenir: () => void;
  onVoirOffre: (id: string) => void;
  suite?: ReactNode;
}) {
  const prix = resumePrix(l, forfaits, avecForfaits, trav, nights, mode);
  const inclus = forfaitInclus(l);
  const ajoutables = forfaitsAjoutables(l, forfaits);
  const ferme = firmOf(l, stay);
  const moinsChere = groupe && groupe.principale.id !== l.id ? groupe.principale : null;
  const ecart = moinsChere ? ecartAvecPrincipale(l, moinsChere) : null;
  const aideForfaits =
    !inclus && forfaits?.total != null
      ? [
          forfaits.periode ?? forfaits.periodeCourte,
          forfaits.enfantsAuTarifAdulte
            ? tr("enfants au tarif adulte, tarif enfant non communiqué")
            : null,
        ]
          .filter(Boolean)
          .join(" · ") || undefined
      : undefined;

  return (
    <div className="fl-prix">
      <div className="fl-onglets" role="group" aria-label={tr("Affichage du prix")}>
        <button type="button" aria-pressed={mode === "total"} onClick={() => setMode("total")}>
          {tr("Séjour")}
        </button>
        <button type="button" aria-pressed={mode === "pers"} onClick={() => setMode("pers")}>
          {tr("Par pers.")}
        </button>
      </div>
      <div className="fl-prix__montant">
        <b>{prix.principal}</b>
        <span>{prix.detail}</span>
      </div>
      <dl className="fl-detail">
        <div>
          <dt>{`${nuitsLbl(nights)} · ${l.source}`}</dt>
          <dd className={l.total > 0 ? undefined : "fl-absent"}>{prixLbl(l)}</dd>
        </div>
        <div title={aideForfaits}>
          <dt>
            {inclus || !forfaits || forfaits.total == null ? (
              tr("Forfaits")
            ) : (
              <label className="fl-case">
                <input
                  type="checkbox"
                  checked={avecForfaits && ajoutables}
                  disabled={!ajoutables}
                  onChange={(e) => setAvecForfaits(e.target.checked)}
                />
                {`${forfaits.libelle} × ${trav}`}
              </label>
            )}
          </dt>
          <dd
            className={
              inclus
                ? undefined
                : forfaits?.total != null
                  ? avecForfaits && ajoutables
                    ? undefined
                    : "fl-raye"
                  : "fl-absent"
            }
          >
            {inclus
              ? tr("compris dans le prix")
              : forfaits === undefined
                ? tr("en cours de calcul")
                : forfaits === null
                  ? (forfaitsMotif ?? tr("non relevés pour cette station"))
                  : forfaits.total != null
                    ? montantCents(forfaits.total, forfaits.devise)
                    : (forfaits.manque ?? tr("non relevés"))}
          </dd>
        </div>
      </dl>
      {moinsChere && ecart != null && ecart > 0 ? (
        <button type="button" className="fl-moins-cher" onClick={() => onVoirOffre(moinsChere.id)}>
          {tr("{source} : {ecart} de moins", {
            source: moinsChere.source,
            ecart: eurCents(ecart) ?? "",
          })}
          <PictoUi nom="chevron" />
        </button>
      ) : null}
      <span
        className={`fl-dispo${ferme ? " fl-dispo--ok" : ""}`}
        title={
          [
            ferme ? availabilityLabel(availabilityOf(l, stay)) : null,
            l.scannedAt != null ? tr("Relevé le {date}", { date: dateCourte(l.scannedAt) }) : null,
          ]
            .filter(Boolean)
            .join(" · ") || undefined
        }
      >
        <i aria-hidden />
        {ferme ? tr("Disponible") : availabilityLabel(availabilityOf(l, stay))}
      </span>
      <button
        type="button"
        className={`fl-retenir${retenu ? " fl-retenir--on" : ""}`}
        aria-pressed={retenu}
        onClick={onRetenir}
      >
        {retenu ? <PictoUi nom="coche" /> : null}
        {retenu ? tr("Retenu") : tr("Retenir")}
      </button>
      {l.url ? (
        <a
          href={l.url}
          target="_blank"
          rel="noopener"
          className="fl-reserver"
          title={tr("Réserver sur {source}", { source: l.source })}
        >
          {tr("Réserver")}
          <PictoUi nom="externeGrand" />
        </a>
      ) : (
        <span className="fl-reserver fl-reserver--off" title={tr("Annonce sans lien")}>
          {tr("Réserver")}
        </span>
      )}
      {suite}
    </div>
  );
}
