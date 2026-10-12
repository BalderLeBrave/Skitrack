/** Réservation (Skitrack App.dc.html:649-672, script 1247-1252).
 *
 *  Le séjour en titre, le lien à copier, puis le logement retenu en rangée :
 *  photo, titre, station et logement, offre et prix confirmé, total et part
 *  par personne, « Retirer » et « Réserver » chez la source. Dessous, le coût
 *  poste par poste (logement, forfaits du groupe), la case « réservé » et la
 *  copie du récapitulatif. Skitrack ne prend pas de paiement. Station retenue
 *  et logement choisi viennent du parcours ; l'annonce est celle du relevé ou
 *  de la recherche en direct. */

import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Coquille } from "@/components/Coquille";
import { photosDe } from "@/components/favoris/annonceCarte";
import { VideFavoris } from "@/components/favoris/communs";
import { PICTO_CORBEILLE, PICTO_EXTERNE, PICTO_LIEN, useCopie } from "@/components/favoris/outils";
import { IconeCoche, IconeCroix, Trace } from "@/components/maquette";
import { useGo } from "@/components/v6/go";
import { FiabiliteFaible } from "@/components/v7/FiabiliteFaible";
import { usePrixForfait } from "@/components/v7/usePrixForfait";
import { VoletAnnonce } from "@/components/v7/VoletAnnonce";
import { resolveListing } from "@/lib/accommodation";
import { libellesForfait, mentionForfait } from "@/lib/forfaits/prixSejour";
import { montantCents } from "@/lib/devises";
import { forfaitInclus } from "@/lib/stay/forfaitInclus";
import { tr } from "@/lib/i18n";
import {
  datesLbl,
  dm,
  eurCents,
  groupLbl,
  nuitsLbl,
  travLbl,
  useParcours,
  useSejour,
} from "@/lib/parcours";
import { stationById } from "@/lib/stations";
import { useAPied } from "@/lib/geo/useReseauPieton";
import { availabilityLabel, availabilityOf } from "@/lib/stay/availability";
import { bedLbl, capLbl, distanceOf, firmOf, persLbl, prixLbl, prixPersLbl } from "@/lib/v7";

export const Route = createFileRoute("/reservation")({ component: Reservation });

/* Le parcours est gardé dans le navigateur : le serveur ne connaît ni la
   station ni le logement retenus. L'écran attend le montage pour ne pas
   montrer « Aucun logement retenu » le temps d'une image. */
function Reservation() {
  const [monte, setMonte] = useState(false);
  useEffect(() => setMonte(true), []);
  return (
    <Coquille>
      <main className="fv-main fv-main--resa" id="s-booking" data-screen-label="3 Réservation">
        {monte ? <EcranReservation /> : null}
      </main>
    </Coquille>
  );
}

function EcranReservation() {
  const go = useGo();
  const P = useParcours();
  const { checkIn, checkOut, trav, enfants, rooms, nights } = useSejour();
  const s = P.stationId ? stationById(P.stationId) : undefined;
  const brute = P.lodgeId ? resolveListing(P.lodgeId) : undefined;
  // La distance à pied quand le réseau de la station est chargé (`stay/aPied.ts`).
  const uneSeule = useMemo(() => (brute ? [brute] : []), [brute]);
  const l = useAPied(uneSeule)[0] as typeof brute;
  const prix = usePrixForfait(s);
  const { copie, copier } = useCopie();
  const [ouvert, setOuvert] = useState(false);

  // En titre, le séjour (App.dc.html:1247) ; à droite, le lien de partage.
  // Les dates et le groupe se changent dans la barre de recherche du haut.
  const tete = (lien: () => string) => (
    <div className="fv-tete">
      <h1 className="fv-h1 fv-h1--resa">
        {dm(checkIn)} → {dm(checkOut)} · {persLbl(trav)}
      </h1>
      <button
        type="button"
        className="fv-pilule fv-pilule--haute fv-pilule--droite"
        onClick={() => void copier(lien())}
        aria-live="polite"
      >
        <Trace d={PICTO_LIEN} taille={14} epaisseur={2} />
        {copie ? tr("Lien copié") : tr("Copier le lien")}
      </button>
    </div>
  );

  if (!s || !l) {
    return (
      <>
        {tete(() => window.location.href)}
        <VideFavoris titre={tr("Aucun logement retenu")} />
      </>
    );
  }

  const stay = { checkIn, checkOut };
  const firm = firmOf(l, stay);
  // Le forfait du séjour, résolu pour ses dates : adultes et enfants chacun
  // à leur tarif, sur le même forfait, pour la durée du séjour.
  const pass = prix.budget;
  const adulte = prix.forfaits?.adulte.statut === "resolu" ? prix.forfaits.adulte : null;
  const lib = adulte ? libellesForfait(adulte) : null;
  // Un séjour vendu forfaits compris les porte déjà dans son prix : les
  // ajouter les ferait compter deux fois.
  const forfaitsCompris = forfaitInclus(l);
  const passGroupN = forfaitsCompris ? 0 : (pass?.total ?? 0);
  const totalN = l.total + passGroupN;
  const photo = photosDe(l)[0]?.src ?? null;
  const pp = prixPersLbl(l, trav);

  const recap = () =>
    [
      `Skitrack – ${s.name}`,
      `${datesLbl(checkIn, checkOut, nights)} · ${groupLbl(trav, rooms, enfants)}`,
      tr("Logement : {titre} ({source}) {prix}", {
        titre: l.title,
        source: l.source,
        prix: prixLbl(l),
      }),
      tr("Forfaits : {forfaits}", {
        forfaits: forfaitsCompris
          ? tr("compris dans le prix du logement")
          : pass?.total != null && adulte && lib
            ? `${montantCents(passGroupN, pass.devise)} (${pass.libelle.toLowerCase()}${tr(" : ")}${pass.detail} ; ${mentionForfait(adulte)}${lib.faible ? ` ; ${tr("fiabilité faible")}` : ""})`
            : (pass?.manque ?? tr("non relevés")),
      }),
      tr("Total : {total}", {
        total: l.total > 0 ? (eurCents(totalN) ?? "") : tr("logement non tarifé"),
      }),
    ].join("\n");

  const copyRecap = () => {
    void navigator.clipboard?.writeText(recap());
    P.say(tr("Récapitulatif copié."));
  };
  const lienPartage = () =>
    `${window.location.origin}/reservation#s=${s.id}&l=${l.id}&d=${checkIn}&n=${nights}&t=${trav}&e=${enfants}&r=${rooms}`;
  const marquerReserve = () => {
    P.setBooked(true);
    P.say(
      tr("Ouverture de l’annonce sur {source}. Le récapitulatif est marqué « réservé ».", {
        source: l.source,
      }),
    );
  };
  const retirer = () => {
    P.chooseLodge(null);
    P.say(tr("Logement retiré de la réservation."));
  };

  return (
    <>
      {tete(lienPartage)}

      {P.shared ? (
        <div className="fv-bandeau" role="status">
          <b>{tr("Récapitulatif partagé.")}</b>
          <button
            type="button"
            className="fv-bandeau__x"
            aria-label={tr("Fermer")}
            onClick={() => P.setShared(false)}
          >
            <IconeCroix taille={11} epaisseur={2.6} />
          </button>
        </div>
      ) : null}

      {P.booked ? (
        <div className="fv-bandeau fv-bandeau--ok" role="status">
          <IconeCoche />
          <b>{tr("Séjour marqué comme réservé")}</b>
          <a
            href="/"
            className="fv-bandeau__lien"
            onClick={(e) => {
              e.preventDefault();
              P.restart();
              void go("home");
            }}
          >
            {tr("Préparer un autre séjour")}
          </a>
        </div>
      ) : null}

      <section className="fv-resa" aria-label={tr("Logement retenu")}>
        <div className="fv-resa__rang">
          <button
            type="button"
            className="fv-resa__photo"
            aria-label={l.title}
            onClick={() => setOuvert(true)}
          >
            {photo ? <img src={photo} alt="" loading="lazy" decoding="async" /> : null}
          </button>
          <div className="fv-resa__corps">
            <button type="button" className="fv-resa__titre" onClick={() => setOuvert(true)}>
              {l.title}
            </button>
            <span className="fv-resa__ligne">
              <Link to="/stations/$id" params={{ id: s.id }} className="fv-resa__station">
                {s.name}
              </Link>
              {" · "}
              {[capLbl(l), bedLbl(l), distanceOf(l).text].join(" · ")}
            </span>
            <div className="fv-resa__puces">
              <span className="fv-resa__offre">
                {l.source} {prixLbl(l)}
              </span>
              {firm ? (
                <span className="fv-resa__ferme">
                  <i />
                  {tr("Prix confirmé pour vos dates")}
                </span>
              ) : null}
            </div>
          </div>
          <div className="fv-resa__droite">
            {/* Sans prix confirmé, la disponibilité se lit au survol du prix. */}
            <div
              className="fv-resa__prix"
              title={firm ? undefined : availabilityLabel(availabilityOf(l, stay))}
            >
              <b>{prixLbl(l)}</b>
              {pp ? <span>{tr("{prix} / pers.", { prix: pp })}</span> : null}
            </div>
            <div className="fv-resa__actions">
              <button
                type="button"
                className="fv-rond"
                aria-label={tr("Retirer")}
                title={tr("Retirer")}
                onClick={retirer}
              >
                <Trace d={PICTO_CORBEILLE} taille={14} epaisseur={2} />
              </button>
              {l.url ? (
                <a
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="fv-reserver"
                  title={tr("Réserver sur {source}", { source: l.source })}
                  onClick={marquerReserve}
                >
                  {tr("Réserver")}
                  <Trace d={PICTO_EXTERNE} taille={11} epaisseur={2.6} />
                </a>
              ) : (
                <button
                  type="button"
                  className="fv-reserver fv-reserver--inerte"
                  title={tr("Annonce sans lien : réserver à la main")}
                  onClick={() =>
                    P.say(
                      tr(
                        "Annonce sans lien : la réservation se fait à la main, puis se marque ici.",
                      ),
                    )
                  }
                >
                  {tr("Réserver")}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="fv-cout">
          <dl className="fv-cout__table">
            <div>
              <dt>
                {tr("Logement")} · {nuitsLbl(nights)}
              </dt>
              <dd className={l.total > 0 ? undefined : "fv-muet"}>{prixLbl(l)}</dd>
            </div>
            <div>
              <dt>
                {tr("Forfaits")}
                {!forfaitsCompris && pass?.duree ? ` · ${pass.duree}` : ""}
                <span className={pass?.enfantsAuTarifAdulte ? "fv-cout__alerte" : undefined}>
                  {forfaitsCompris
                    ? tr("compris dans le prix du logement")
                    : pass?.total != null && adulte && lib
                      ? `${pass.detail} · ${mentionForfait(adulte)} · ${lib.source}`
                      : prix.forfaits?.adulte.statut === "grille-ancienne"
                        ? tr("Forfait non publié : le dernier tarif connu a plus de trois saisons")
                        : (pass?.detail ?? tr("Forfaits non relevés pour ce domaine"))}
                  {pass?.periode && !forfaitsCompris ? ` · ${pass.periode}` : ""}
                </span>
                {lib?.faible && !forfaitsCompris ? <FiabiliteFaible raisons={lib.raisons} /> : null}
              </dt>
              <dd className={forfaitsCompris || pass?.total != null ? undefined : "fv-muet"}>
                {forfaitsCompris
                  ? tr("compris")
                  : pass?.total != null
                    ? montantCents(passGroupN, pass.devise)
                    : (pass?.manque ?? tr("non relevés"))}
              </dd>
            </div>
            <div className="fv-cout__total">
              <dt>{tr("Total")}</dt>
              <dd className={l.total > 0 ? undefined : "fv-muet"}>
                {l.total > 0 ? eurCents(totalN) : tr("logement non tarifé")}
              </dd>
            </div>
            <div>
              <dt>{tr("Par personne, sur {voyageurs}", { voyageurs: travLbl(trav) })}</dt>
              <dd className={l.total > 0 ? undefined : "fv-muet"}>
                {l.total > 0 ? eurCents(Math.round((totalN / trav) * 100) / 100) : "–"}
              </dd>
            </div>
          </dl>
          <div className="fv-cout__pied">
            <label className="fv-case-cocher">
              <input type="checkbox" checked={P.booked} onChange={() => P.setBooked(!P.booked)} />
              {P.booked ? tr("Réservé chez la source") : tr("Marquer comme réservé")}
            </label>
            <button type="button" className="fv-pilule" onClick={copyRecap}>
              {tr("Copier le récapitulatif")}
            </button>
          </div>
        </div>
      </section>

      {ouvert ? (
        <VoletAnnonce
          l={l}
          stay={stay}
          trav={trav}
          nights={nights}
          groupe={null}
          retenu
          onRetenir={retirer}
          onFermer={() => setOuvert(false)}
          onVoirOffre={() => undefined}
          forfaits={prix.pret ? prix.budget : undefined}
        />
      ) : null}
    </>
  );
}
