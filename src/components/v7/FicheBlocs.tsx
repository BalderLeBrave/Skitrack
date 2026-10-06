/**
 * Les blocs d'information de la fiche d'annonce (`VoletAnnonce`), dans
 * l'ordre de la colonne de gauche, et la carte de prix de droite.
 *
 * Rien n'est estimé : une donnée absente se dit absente. Les montants et
 * l'écart viennent des fonctions de l'écran Logements (`prixLbl`,
 * `eurCents`, `montantCents`, `forfaitInclus`, `ecartAvecPrincipale`).
 */

import { useMemo, useState, type ReactNode } from "react";
import { Carte, type Epingle, type Segment } from "@/components/Carte";
import { Icon } from "@/components/Icon";
import { altitudeAide, altitudeLbl, positionApprochee, type Altitude } from "@/lib/altitude/altitude";
import { useAltitudes } from "@/lib/altitude/store";
import { montantCents } from "@/lib/devises";
import type { BudgetForfaits } from "@/lib/forfaits/prixSejour";
import { aTraduire, tr, trN } from "@/lib/i18n";
import { langueIntl } from "@/lib/i18n/langue";
import type { Listing } from "@/lib/listings";
import { liftKindPhrase } from "@/lib/osmAccess";
import { eurCents, mLbl, nuitsLbl, travLbl } from "@/lib/parcours";
import { difficultyToColor, type PisteColor } from "@/lib/pistes";
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
import { forfaitInclus } from "@/lib/stay/forfaitInclus";
import { LIBELLE_EQUIPEMENT } from "@/lib/stay/equipements";
import { CHAMP_LIBELLE, champsNonIndiques } from "@/lib/stay/nonIndique";
import { ecartAvecPrincipale, type Logement } from "@/lib/stay/regroupement";
import { forfaitsAjoutables, parPersonne, totalSejour } from "@/lib/stay/totalSejour";
import { bedLbl, capLbl, distanceOf, firmOf, prixLbl } from "@/lib/v7";

type Sejour = { checkIn: string; checkOut: string };

/** Au-delà, la description se replie derrière « Lire toute la description ». */
const DESCRIPTION_COURTE = 170;

const PISTE_COULEUR: Record<PisteColor, string> = {
  green: aTraduire("Piste verte"),
  blue: aTraduire("Piste bleue"),
  red: aTraduire("Piste rouge"),
  black: aTraduire("Piste noire"),
  other: aTraduire("Piste"),
};

const dateCourte = (ms: number) =>
  new Intl.DateTimeFormat(langueIntl(), { day: "numeric", month: "short", year: "numeric" }).format(new Date(ms));

const note = (n: number) => new Intl.NumberFormat(langueIntl(), { maximumFractionDigits: 2 }).format(n);

/** Le type publié, avec sa capitale : Cozy écrit « studio », « appartement ». */
const majuscule = (s: string) => s.charAt(0).toLocaleUpperCase(langueIntl()) + s.slice(1);

const altM = (m: number) => `${new Intl.NumberFormat(langueIntl(), { maximumFractionDigits: 0 }).format(m)} m`;

/** 1. Disponibilité, note et avis, type publié. */
export function BlocBadges({ l, stay }: { l: Listing; stay: Sejour }) {
  const ferme = firmOf(l, stay);
  return (
    <div className="fiche7__badges">
      <span className={`fiche7__badge ${ferme ? "fiche7__badge--ok" : "fiche7__badge--alerte"}`}>
        <Icon name={ferme ? "coche" : "alerte"} taille={13} />
        {availabilityLabel(availabilityOf(l, stay))}
      </span>
      {l.rating != null ? (
        <span className="fiche7__badge">
          <Icon name="etoile" taille={13} />
          {l.reviewCount != null
            ? trN(l.reviewCount, "{note} · {n} avis sur {source}", "{note} · {n} avis sur {source}", { note: note(l.rating), source: l.source })
            : tr("{note} sur {source}", { note: note(l.rating), source: l.source })}
        </span>
      ) : null}
      {l.propertyType?.trim() ? <span className="fiche7__badge">{majuscule(l.propertyType.trim())}</span> : null}
      {l.priceIndicative ? <span className="fiche7__badge">{tr("Prix « à partir de »")}</span> : null}
    </div>
  );
}

/** 2. Les quatre faits. */
export function BlocFaits({ l, altitude }: { l: Listing; altitude: Altitude | null | undefined }) {
  const couchage = [bedLbl(l), l.beds != null ? trN(l.beds, "{n} lit", "{n} lits") : null].filter(Boolean).join(" · ");
  return (
    <dl className="fiche7__faits">
      <div>
        <dt>{tr("Capacité")}</dt>
        <dd>{capLbl(l)}</dd>
      </div>
      <div>
        <dt>{tr("Couchage")}</dt>
        <dd>{couchage}</dd>
      </div>
      <div>
        <dt>{tr("Distance aux remontées")}</dt>
        <dd>{distanceOf(l).text}</dd>
      </div>
      <div title={altitudeAide(altitude, positionApprochee(l))}>
        <dt>{tr("Altitude")}</dt>
        <dd>{l.lat != null && l.lon != null ? altitudeLbl(altitude, positionApprochee(l)) : tr("Position non publiée")}</dd>
      </div>
    </dl>
  );
}

/** Une ligne de l'accès aux pistes : un pictogramme, un titre, un détail. */
function Ligne({ icone, titre, children }: { icone: "montagne" | "epingle" | "fleche-droite"; titre: string; children: ReactNode }) {
  return (
    <li>
      <Icon name={icone} taille={16} />
      <div>
        <span className="fiche7__acces-titre">{titre}</span>
        {children}
      </div>
    </li>
  );
}

/** 3. Du logement à la remontée, la piste la plus proche, le village à pied. */
export function BlocAcces({
  l,
  altitude,
  traces,
}: {
  l: Listing;
  altitude: Altitude | null | undefined;
  /** Les tracés du domaine : `undefined` pendant le chargement. */
  traces: FichierTraces | null | undefined;
}) {
  const approchee = positionApprochee(l);
  const gares = useMemo(
    () => [
      { lat: l.liftLat ?? null, lon: l.liftLon ?? null },
      { lat: l.liftOtherLat ?? null, lon: l.liftOtherLon ?? null },
    ],
    [l.liftLat, l.liftLon, l.liftOtherLat, l.liftOtherLon],
  );
  const altDe = useAltitudes(gares);
  const altA = altDe(gares[0]);
  const altB = altDe(gares[1]);
  const remontee = altitudesRemontee(altA?.m, altB?.m);
  const lectureGares = (gares[0].lat != null && altA === undefined) || (gares[1].lat != null && altB === undefined);
  const piste = useMemo(
    () => (l.lat != null && l.lon != null && traces ? pisteLaPlusProche(l.lat, l.lon, traces.pistes) : null),
    [l.lat, l.lon, traces],
  );
  const aPied = tempsAPied(l.distToPlaceM);

  if (l.lat == null || l.lon == null) {
    return (
      <section className="fiche7__bloc" aria-labelledby="fiche7-acces">
        <h3 id="fiche7-acces">{tr("Accès aux pistes")}</h3>
        <p className="fiche7__absent">{tr("Position non publiée par {source} : l’accès aux pistes ne se mesure pas.", { source: l.source })}</p>
      </section>
    );
  }

  const pisteM = piste ? arrondiM(piste.m) : null;
  return (
    <section className="fiche7__bloc" aria-labelledby="fiche7-acces">
      <h3 id="fiche7-acces">{tr("Accès aux pistes")}</h3>
      <ul className="fiche7__acces">
        <Ligne icone="fleche-droite" titre={tr("Remontée la plus proche")}>
          {l.distToLiftM != null ? (
            <>
              <b>{tr("{distance} {remontee}", { distance: mLbl(l.distToLiftM) ?? "", remontee: liftKindPhrase(l.liftKind, l.liftName) })}</b>
              <span>
                {[
                  altitude ? tr("logement à {altitude}", { altitude: altM(altitude.m) }) : null,
                  remontee
                    ? tr("remontée de {depart} à {arrivee}", { depart: altM(remontee.depart), arrivee: altM(remontee.arrivee) })
                    : lectureGares
                      ? tr("altitudes de la remontée en cours de lecture")
                      : tr("altitudes de la remontée non mesurées"),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </>
          ) : (
            <span className="fiche7__absent">{distanceOf(l).text}</span>
          )}
        </Ligne>
        <Ligne icone="montagne" titre={tr("Piste la plus proche")}>
          {traces === undefined ? (
            <span className="fiche7__absent">{tr("Tracés des pistes en cours de chargement")}</span>
          ) : traces === null ? (
            <span className="fiche7__absent">{tr("Tracés des pistes non disponibles pour cette station")}</span>
          ) : piste && pisteM != null ? (
            <>
              <b>
                {tr("{piste} à {distance}", {
                  piste: [tr(PISTE_COULEUR[difficultyToColor(piste.piste.d ?? undefined)]), piste.piste.n ?? piste.piste.r]
                    .filter(Boolean)
                    .join(" "),
                  distance: mLbl(pisteM) ?? "",
                })}
                {skisAuxPieds(piste.m, approchee) ? <span className="fiche7__badge fiche7__badge--ok">{tr("Skis aux pieds")}</span> : null}
              </b>
              <span>{tr("Distance à vol d’oiseau jusqu’au tracé de la piste (OpenSkiMap).")}</span>
            </>
          ) : (
            <span className="fiche7__absent">{tr("Aucune piste à moins de {distance}", { distance: mLbl(PISTE_MAX_M) ?? "" })}</span>
          )}
        </Ligne>
        <Ligne icone="epingle" titre={tr("Village")}>
          {l.placeName ? (
            <>
              <b>{l.placeName}</b>
              <span>
                {l.distToPlaceM != null && aPied
                  ? aPied.moins
                    ? tr("{distance}, moins de 5 min à pied", { distance: mLbl(l.distToPlaceM) ?? "" })
                    : tr("{distance}, {minutes} min à pied", { distance: mLbl(l.distToPlaceM) ?? "", minutes: aPied.minutes })
                  : tr("distance au village non mesurée")}
              </span>
            </>
          ) : (
            <span className="fiche7__absent">{tr("Village le plus proche non mesuré")}</span>
          )}
        </Ligne>
      </ul>
      {approchee ? (
        <p className="fiche7__note">
          {tr("Position approchée : les distances peuvent s’écarter de quelques dizaines de mètres.")}
        </p>
      ) : null}
    </section>
  );
}

/** 4. La description publiée, repliée quand elle est longue. */
export function BlocAnnonce({ l }: { l: Listing }) {
  const [ouverte, setOuverte] = useState(false);
  const texte = l.description?.trim() ?? "";
  const longue = texte.length > DESCRIPTION_COURTE;
  // Sans description, rien n'en est dit : le bloc ne porte que les équipements.
  return (
    <section className="fiche7__bloc" aria-labelledby="fiche7-annonce">
      {texte ? (
        <>
          <h3 id="fiche7-annonce">{tr("Dans l’annonce")}</h3>
          <p className="fiche7__description">
            {longue && !ouverte ? `${texte.slice(0, DESCRIPTION_COURTE).trimEnd()}…` : texte}
          </p>
          {longue ? (
            <button type="button" className="fiche7__lien" aria-expanded={ouverte} onClick={() => setOuverte((o) => !o)}>
              {ouverte ? tr("Replier la description") : tr("Lire toute la description")}
            </button>
          ) : null}
          <h4 className="fiche7__sous-titre">{tr("Équipements")}</h4>
        </>
      ) : (
        <h3 id="fiche7-annonce">{tr("Équipements")}</h3>
      )}
      {l.amenities?.length ? (
        <ul className="fiche7__equipements">
          {l.amenities.map((e) => (
            <li key={e.cle} className={`fiche7__equipement fiche7__equipement--${e.valeur}`}>
              <span className="fiche7__pastille" aria-hidden>
                <Icon name={e.valeur === "oui" ? "coche" : e.valeur === "non" ? "moins" : "question"} taille={12} />
              </span>
              <span className="fiche7__equipement-nom">{tr(LIBELLE_EQUIPEMENT[e.cle])}</span>
              <span className="lecteur7">
                {e.valeur === "oui" ? tr("présent") : e.valeur === "non" ? tr("absent") : tr("non indiqué")}
              </span>
              {e.valeur === "inconnu" ? <span className="fiche7__equipement-note" aria-hidden>{tr("non indiqué")}</span> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="fiche7__absent">{tr("Équipements non relevés pour cette annonce.")}</p>
      )}
    </section>
  );
}

/** 5. Les champs vides de l'annonce. */
export function BlocNonIndique({ l }: { l: Listing }) {
  const champs = champsNonIndiques(l);
  // Les équipements que l'annonce tait, quand ses équipements ont été relevés.
  const taits = (l.amenities ?? []).filter((e) => e.valeur === "inconnu");
  if (!champs.length && !taits.length) return null;
  return (
    <section className="fiche7__encadre" aria-labelledby="fiche7-non-indique">
      <h3 id="fiche7-non-indique">
        <Icon name="info" taille={15} />
        {tr("Non indiqué par {source}", { source: l.source })}
      </h3>
      <ul>
        {champs.map((c) => (
          <li key={c}>{tr(CHAMP_LIBELLE[c])}</li>
        ))}
        {taits.map((e) => (
          <li key={e.cle}>{tr(LIBELLE_EQUIPEMENT[e.cle])}</li>
        ))}
      </ul>
    </section>
  );
}

/** 7. Le logement et sa remontée, reliés par un trait. */
export function BlocEmplacement({ l }: { l: Listing }) {
  const { epingles, segments, trace } = useMemo(() => {
    const ep: Epingle[] = [];
    const sg: Segment[] = [];
    let ligne: { lat: number; lon: number }[] = [];
    if (l.lat != null && l.lon != null) {
      ep.push({ id: "logement", lat: l.lat, lon: l.lon, titre: l.title, sorte: "logement" });
      if (l.liftLat != null && l.liftLon != null) {
        ep.push({ id: "remontee", lat: l.liftLat, lon: l.liftLon, titre: l.liftName ?? tr("Remontée"), sorte: "remontee" });
        ligne = [
          { lat: l.lat, lon: l.lon },
          { lat: l.liftLat, lon: l.liftLon },
        ];
        if (l.liftOtherLat != null && l.liftOtherLon != null) {
          sg.push({ id: "remontee", a: [l.liftLat, l.liftLon], b: [l.liftOtherLat, l.liftOtherLon] });
        }
      }
    }
    return { epingles: ep, segments: sg, trace: ligne };
  }, [l.lat, l.lon, l.liftLat, l.liftLon, l.liftOtherLat, l.liftOtherLon, l.title, l.liftName]);
  return (
    <section className="fiche7__bloc" aria-labelledby="fiche7-emplacement">
      <h3 id="fiche7-emplacement">{tr("Emplacement")}</h3>
      {epingles.length ? (
        <div className="fiche7__carte">
          <Carte epingles={epingles} segments={segments} trace={trace} ajuster outils={false} zoom={15} centre={[l.lat as number, l.lon as number]} />
        </div>
      ) : (
        <p className="fiche7__absent">{tr("Position non publiée par {source}.", { source: l.source })}</p>
      )}
      {epingles.length && positionApprochee(l) ? (
        <p className="fiche7__note">{tr("Position approchée publiée par {source}.", { source: l.source })}</p>
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
  groupe: Logement | null;
  retenu: boolean;
  onRetenir: () => void;
  onVoirOffre: (id: string) => void;
  suite?: ReactNode;
}) {
  const [mode, setMode] = useState<"total" | "pers">("total");
  const { total, forfaitsAjoutes } = totalSejour(l, forfaits, avecForfaits);
  const parPers = parPersonne(total, trav);
  const inclus = forfaitInclus(l);
  const ferme = firmOf(l, stay);
  const moinsChere = groupe && groupe.principale.id !== l.id ? groupe.principale : null;
  const ecart = moinsChere ? ecartAvecPrincipale(l, moinsChere) : null;

  return (
    <>
      <div className="fiche7__onglets" role="group" aria-label={tr("Affichage du prix")}>
        <button type="button" aria-pressed={mode === "total"} onClick={() => setMode("total")}>
          {tr("Total séjour")}
        </button>
        <button type="button" aria-pressed={mode === "pers"} onClick={() => setMode("pers")}>
          {tr("Par personne")}
        </button>
      </div>
      <div className="fiche7__prix">
        <b>{total == null ? tr("prix non publié") : eurCents(mode === "total" ? total : parPers)}</b>
        <span>
          {mode === "total"
            ? [nuitsLbl(nights), travLbl(trav), forfaitsAjoutes ? tr("avec les forfaits") : null]
                .filter(Boolean)
                .join(" · ")
            : [trN(trav, "pour {n} voyageur", "pour {n} voyageurs"), forfaitsAjoutes ? tr("avec les forfaits") : null].filter(Boolean).join(" · ")}
        </span>
      </div>
      <dl className="fiche7__detail">
        <div>
          <dt>{tr("Logement · {nuits}", { nuits: nuitsLbl(nights) })}</dt>
          <dd className={l.total > 0 ? undefined : "absent"}>{prixLbl(l)}</dd>
        </div>
        <div>
          <dt>
            {inclus || !forfaits || forfaits.total == null ? (
              tr("Forfaits du groupe")
            ) : (
              <label className="fiche7__case">
                <input
                  type="checkbox"
                  checked={avecForfaits}
                  disabled={!forfaitsAjoutables(l, forfaits)}
                  onChange={(e) => setAvecForfaits(e.target.checked)}
                />
                {forfaits.libelle}
              </label>
            )}
          </dt>
          <dd className={inclus || forfaits?.total != null ? undefined : "absent"}>
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
        {!inclus && forfaits?.total != null && (forfaits.periodeCourte || forfaits.enfantsAuTarifAdulte) ? (
          <p className="fiche7__note">
            {[forfaits.periodeCourte, forfaits.enfantsAuTarifAdulte ? tr("enfants au tarif adulte, tarif enfant non communiqué") : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
        <div>
          <dt>{tr("Par personne")}</dt>
          <dd className={parPers != null ? undefined : "absent"}>{parPers != null ? eurCents(parPers) : "–"}</dd>
        </div>
      </dl>
      <p className={`fiche7__dispo${ferme ? " fiche7__dispo--ok" : ""}`}>
        <Icon name={ferme ? "coche" : "alerte"} taille={14} />
        <span>
          {availabilityLabel(availabilityOf(l, stay))}
          {l.scannedAt != null ? ` · ${tr("relevé le {date}", { date: dateCourte(l.scannedAt) })}` : ""}
        </span>
      </p>
      <div className="fiche7__actions">
        <button
          type="button"
          className={`btn7 btn7--grand btn7--pleine${retenu ? " btn7--tenu" : " btn7--encre"}`}
          onClick={onRetenir}
        >
          {retenu ? tr("Retenu") : tr("Retenir ce logement")}
        </button>
        {l.url ? (
          <a href={l.url} target="_blank" rel="noopener" className="btn7 btn7--fantome btn7--pleine btn7--lien">
            {tr("Ouvrir sur {source}", { source: l.source })}
            <Icon name="externe" taille={12} />
          </a>
        ) : null}
        {suite}
      </div>
      {moinsChere && ecart != null && ecart > 0 ? (
        <p className="fiche7__moins-cher">
          {tr("Le même logement est {ecart} moins cher sur {source}.", {
            ecart: eurCents(ecart) ?? "",
            source: moinsChere.source,
          })}{" "}
          <button type="button" className="fiche7__lien" onClick={() => onVoirOffre(moinsChere.id)}>
            {tr("Voir cette offre")}
          </button>
        </p>
      ) : null}
    </>
  );
}
