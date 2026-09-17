/** Réservation – maquette v7 (`SKITRACK v7 - App.dc.html`, bloc RÉSERVATION).
 *
 *  Le logement retenu, la station et le séjour, ce que le récapitulatif ne dit
 *  pas ; à droite, le coût poste par poste, l'action chez la source, la case
 *  « réservé », la copie et le lien de partage. Skitrack ne prend pas de
 *  paiement. Station retenue et logement choisi viennent du parcours ;
 *  l'annonce est celle du relevé ou de la recherche en direct. */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Icon } from "@/components/Icon";
import { Coquille } from "@/components/Coquille";
import { ImageSlot } from "@/components/v6/ImageSlot";
import { useGo } from "@/components/v6/go";
import { useForfait } from "@/components/v7/useForfait";
import { resolveListing } from "@/lib/accommodation";
import { coutForfaits } from "@/lib/forfaits/cout";
import { dire } from "@/lib/i18n";
import {
  datesLbl,
  eur,
  eurCents,
  groupLbl,
  nuitsLbl,
  travLbl,
  useParcours,
  useSejour,
} from "@/lib/parcours";
import { stationById } from "@/lib/stations";
import { availabilityLabel, availabilityOf } from "@/lib/stay/availability";
import {
  altLbl,
  aStation,
  bedLbl,
  capLbl,
  crumbDomaine,
  distanceOf,
  firmOf,
  kmLbl,
  mediaTon,
  prixLbl,
} from "@/lib/v7";

export const Route = createFileRoute("/reservation")({ component: Reservation });

function Reservation() {
  const go = useGo();
  const P = useParcours();
  const { checkIn, checkOut, trav, adultes, enfants, rooms, nights } = useSejour();
  const s = P.stationId ? stationById(P.stationId) : undefined;
  const l = P.lodgeId ? resolveListing(P.lodgeId) : undefined;
  const forfait = useForfait(s);

  // Sans logement, la maquette renvoie où on le choisit, avec le bandeau.
  // L'état est relu dans le magasin : au premier rendu du navigateur, le
  // sélecteur sert encore l'instantané du serveur, où rien n'est retenu.
  useEffect(() => {
    const { stationId: st, lodgeId: lo } = useParcours.getState();
    if (!st) {
      P.say(dire("nav.lodgingLocked"));
      void go("compare");
    } else if (!lo || !resolveListing(lo)) {
      P.say(dire("nav.bookingLocked"));
      void go("lodging");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.id, l?.id]);

  if (!s || !l) {
    return (
      <Coquille>
        <main className="v7main" id="s-booking" data-screen-label="3 Réservation" />
      </Coquille>
    );
  }

  const stay = { checkIn, checkOut };
  const firm = firmOf(l, stay);
  // Le coût des forfaits comptait huit adultes pour un groupe qui pouvait en
  // compter six et deux enfants, alors que le tarif enfant était relevé.
  const pass = coutForfaits(forfait?.j6, forfait?.enf6, adultes, enfants);
  const passGroupN = pass.total ?? 0;
  const totalN = l.total + passGroupN;
  const d = distanceOf(l);

  const recap = () =>
    [
      `Skitrack – ${s.name}`,
      `${datesLbl(checkIn, checkOut, nights)} · ${groupLbl(trav, rooms, enfants)}`,
      `Logement : ${l.title} (${l.source}) ${prixLbl(l)}`,
      `Forfaits : ${pass.total != null ? `${eur(passGroupN)} (${pass.detail})` : "non relevés"}`,
      `Total : ${l.total > 0 ? eurCents(totalN) : "logement non tarifé"}`,
    ].join("\n");

  const copyRecap = () => {
    void navigator.clipboard?.writeText(recap());
    P.say("Récapitulatif copié.");
  };
  const copyLink = () => {
    const link = `${window.location.origin}/reservation#s=${s.id}&l=${l.id}&d=${checkIn}&n=${nights}&t=${trav}&e=${enfants}&r=${rooms}`;
    void navigator.clipboard?.writeText(link);
    P.say("Lien de partage copié.");
  };
  const reserver = () => {
    if (l.url) {
      window.open(l.url, "_blank", "noopener");
      P.setBooked(true);
      P.say(`Ouverture de l’annonce sur ${l.source} · le récapitulatif est marqué « réservé ».`);
    } else {
      P.say("Annonce sans lien : la réservation se fait à la main, puis se marque ici.");
    }
  };

  return (
    <Coquille>
      <main className="v7main" id="s-booking" data-screen-label="3 Réservation">
        <a
          href="/logements"
          className="v7retour"
          onClick={(e) => {
            e.preventDefault();
            void go("lodging");
          }}
        >
          <Icon name="chevron-gauche" taille={14} />
          Logements {aStation(s.name)}
        </a>
        <header className="v7tete">
          <span className="v7surtitre">Étape 3 · Réservation</span>
          <h1>Récapitulatif du séjour</h1>
        </header>

        {P.shared ? (
          <div className="bandeau7 bandeau7--partage">
            <span>
              <b>Récapitulatif partagé.</b> Station, logement, dates et voyageurs viennent du lien ;
              ils remplacent votre séjour en cours.
            </span>
            <button type="button" className="v7fermer" aria-label="Fermer" onClick={() => P.setShared(false)}>
              <Icon name="croix" taille={12} />
            </button>
          </div>
        ) : null}

        {P.booked ? (
          <div className="bandeau7 bandeau7--reserve">
            <span className="bandeau7__coche">
              <Icon name="coche" taille={18} />
            </span>
            <div>
              <strong>Séjour marqué comme réservé</strong>
              <span>
                La confirmation et le paiement sont chez {l.source}. Le récapitulatif garde le prix
                relevé.
              </span>
            </div>
            <a
              href="/"
              onClick={(e) => {
                e.preventDefault();
                P.restart();
                void go("home");
              }}
            >
              Préparer un autre séjour
              <Icon name="fleche-droite" taille={14} />
            </a>
          </div>
        ) : null}

        <div className="bgrid7">
          <div className="bgrid7__main">
            <section className="bk7">
              <div className={`bk7__media lodge7__media--${mediaTon(l)}`}>
                {l.photo ? (
                  <ImageSlot shape="rect" id={`v7app-bk-${l.id}`} placeholder="Photo de l'annonce" className="lodge7__slot" src={l.photo} />
                ) : (
                  <span>Pas de photo dans l'annonce</span>
                )}
              </div>
              <div className="bk7__corps">
                <div className="bk7__tete">
                  <div>
                    <span className="bk7__ref">
                      Logement · {l.source} · réf. {l.id}
                    </span>
                    <h2>{l.title}</h2>
                  </div>
                  <a
                    href="/logements"
                    onClick={(e) => {
                      e.preventDefault();
                      void go("lodging");
                    }}
                  >
                    Changer
                  </a>
                </div>
                <div className="bk7__faits">
                  <span>{capLbl(l)}</span>
                  <span>{bedLbl(l)}</span>
                  <span className="absent">{d.text}</span>
                </div>
                {firm ? (
                  <div className="bk7__ok">
                    <Icon name="coche" taille={16} />
                    <span>
                      <b>Prix relevé aux dates.</b> La source a tarifé cette annonce pour ce séjour. La
                      source fera foi.
                    </span>
                  </div>
                ) : (
                  <div className="bk7__alerte">
                    <Icon name="alerte" taille={16} />
                    <span>
                      <b>Disponibilité non confirmée.</b> {availabilityLabel(availabilityOf(l, stay))}. La
                      source fera foi.
                    </span>
                  </div>
                )}
              </div>
            </section>

            <div className="bgrid7__deux">
              <section className="carte7-sect carte7-sect--serre">
                <div className="carte7-sect__ligne">
                  <span>Station</span>
                  <a
                    href={`/stations/${s.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      void go("fiche", { id: s.id });
                    }}
                  >
                    Fiche
                  </a>
                </div>
                <strong className="carte7-sect__grand">{s.name}</strong>
                <span className="carte7-sect__texte carte7-sect__texte--petit">
                  {crumbDomaine(s)}
                </span>
                <span className="carte7-sect__chiffres">
                  {altLbl(s) ?? "altitudes non relevées"} · {kmLbl(s) ?? "km non publié"}{" "}
                  <small>de pistes, domaine</small>
                </span>
              </section>
              <section className="carte7-sect carte7-sect--serre">
                <div className="carte7-sect__ligne">
                  <span>Séjour</span>
                  <a
                    href="#"
                    data-sejour-ouvre
                    onClick={(e) => {
                      e.preventDefault();
                      P.setStayOpen(!P.stayOpen);
                    }}
                  >
                    Modifier
                  </a>
                </div>
                <strong className="carte7-sect__grand">{datesLbl(checkIn, checkOut, nights)}</strong>
                <span className="carte7-sect__texte carte7-sect__texte--petit">
                  {groupLbl(trav, rooms, enfants)}
                </span>
                <span className={`carte7-sect__chiffres${pass.total != null ? "" : " absent"}`}>
                  {pass.total != null
                    ? `Forfaits 6 jours : ${pass.detail}${forfait?.releveLbl ? `, au tarif relevé le ${forfait.releveLbl}` : ""}`
                    : "Forfaits non relevés pour ce domaine"}
                </span>
              </section>
            </div>

          </div>

          <aside className="aside7 aside7--large">
            <span className="v7surtitre">Coût du séjour, poste par poste</span>
            <table className="cout7">
              <tbody>
                <tr>
                  <th>
                    Logement · {nuitsLbl(nights)}
                    <span className="cout7__ok">relevé chez la source</span>
                  </th>
                  <td className={l.total > 0 ? undefined : "absent"}>{prixLbl(l)}</td>
                </tr>
                <tr>
                  <th>
                    Forfaits · 6 jours
                    <span className={pass.enfantsAuTarifAdulte ? "cout7__alerte" : undefined}>
                      {pass.detail}
                    </span>
                  </th>
                  <td className={pass.total != null ? undefined : "absent"}>
                    {pass.total != null ? eur(passGroupN) : "non relevés"}
                  </td>
                </tr>
                <tr className="cout7__total">
                  <th>Total</th>
                  <td className={l.total > 0 ? undefined : "absent"}>
                    {l.total > 0
                      ? eurCents(totalN)
                      : "logement non tarifé"}
                  </td>
                </tr>
                <tr className="cout7__pp">
                  <th>Par personne, sur {travLbl(trav)}</th>
                  <td className={l.total > 0 ? undefined : "absent"}>
                    {l.total > 0 ? eurCents(Math.round((totalN / trav) * 100) / 100) : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
            <button
              type="button"
              className={`btn7 btn7--grand btn7--pleine${l.url ? "" : " btn7--inerte"}`}
              onClick={reserver}
            >
              {l.url ? `Réserver sur ${l.source}` : "Annonce sans lien : réserver à la main"}
            </button>
            <label className="cocher7">
              <input type="checkbox" checked={P.booked} onChange={() => P.setBooked(!P.booked)} />
              {P.booked ? "Réservé chez la source" : "Marquer comme réservé"}
            </label>
            <div className="aside7__deux">
              <button type="button" className="btn7 btn7--fantome" onClick={copyRecap}>
                Copier le récapitulatif
              </button>
              <button type="button" className="btn7 btn7--fantome" onClick={copyLink}>
                Lien de partage
              </button>
            </div>
            <p className="aside7__note">
              Le lien de partage reprend station, logement, dates et voyageurs : les autres
              voyageurs voient le même récapitulatif.
            </p>
          </aside>
        </div>
      </main>
    </Coquille>
  );
}
