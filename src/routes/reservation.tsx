/** Réservation – `#s-booking` (maquette l. 438–451 ; `renderBooking` l. 681–688).
 *  Ordre du DOM : contrat § 3.5. Station retenue et logement choisi viennent
 *  du parcours ; l'annonce est celle du relevé ou de la recherche en direct. */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Icon } from "@/components/Icon";
import { Coquille } from "@/components/Coquille";
import { ImageSlot } from "@/components/v6/ImageSlot";
import { useGo } from "@/components/v6/go";
import { StayReport } from "@/components/StayReport";
import { resolveListing } from "@/lib/accommodation";
import { getForfait } from "@/lib/forfaits/api";
import { domainForStation } from "@/lib/forfaits/catalog";
import type { ForfaitRow } from "@/lib/forfaits/types";
import { origineForfait } from "@/lib/stay/report";
import { datesLbl, distLbl, eur, fmt, useParcours, useSejour } from "@/lib/parcours";
import { stationById } from "@/lib/stations";

export const Route = createFileRoute("/reservation")({ component: Reservation });

/** Forfait du domaine de la station retenue, s'il y en a un. */
function useForfait(stationId: string | null) {
  const [forfait, setForfait] = useState<ForfaitRow | null>(null);
  const domain = stationId ? domainForStation(stationId) : undefined;
  useEffect(() => {
    if (!domain) return setForfait(null);
    let cancelled = false;
    void getForfait({ data: { slug: domain.slug } })
      .then((r) => {
        if (!cancelled) setForfait(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [domain?.slug]);
  return { forfait, domain };
}

function Reservation() {
  const go = useGo();
  const stationId = useParcours((x) => x.stationId);
  const lodgeId = useParcours((x) => x.lodgeId);
  const say = useParcours((x) => x.say);
  const { checkIn, checkOut, trav, rooms, nights } = useSejour();
  const s = stationId ? stationById(stationId) : undefined;
  const l = lodgeId ? resolveListing(lodgeId) : undefined;
  const { forfait, domain } = useForfait(stationId);

  /* La maquette ne rendait rien sans station ni logement (l. 682), parce qu'on
     n'y arrivait que par le parcours. À l'adresse `/reservation`, ouverte
     directement ou par l'onglet de navigation, cela donnait une page
     entièrement vide : ni titre, ni message, rien qui distingue un écran à
     remplir d'un écran en panne. L'étape dit maintenant ce qui lui manque et
     renvoie là où on le choisit. */
  if (!s || !l) {
    return (
      <Coquille>
        <section className="screen on" id="s-booking" data-screen-label="3 Réservation">
          <div className="scroll">
            <div className="wrap">
              <span className="eyebrow">Étape 3 · Réservation</span>
              <h1 className="h1 h1--xl">Rien à récapituler pour l’instant</h1>
              <div className="empty card">
                <strong className="empty__title">
                  {!s ? "Aucune station retenue" : "Aucun logement choisi"}
                </strong>
                <p className="muted empty__lead">
                  {!s
                    ? "Le récapitulatif reprend une station, un logement et vos dates. Commencez par retenir une station."
                    : `${s.name} est retenue. Il reste à choisir un logement parmi ceux relevés à ces dates.`}
                </p>
                <div className="empty__actions">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => go(s ? "lodging" : "compare")}
                  >
                    {s ? "Voir les logements" : "Choisir une station"}
                  </button>
                </div>
              </div>
              <p className="muted">
                <span className="rel js-dates">{datesLbl(checkIn, checkOut, nights)}</span> · le
                séjour saisi en haut de page suit jusqu’ici.
              </p>
            </div>
          </div>
        </section>
      </Coquille>
    );
  }

  const total = l.total;
  const dist = l.distToSlopesM ?? null;
  const share = () => {
    const link = `${window.location.href.split("#")[0]}#s=${s.id}&l=${l.id}&n=${nights}&t=${trav}&r=${rooms}`;
    void navigator.clipboard?.writeText(link);
    say("Lien de partage copié.");
  };

  return (
    <Coquille>
      <section className="screen on" id="s-booking" data-screen-label="3 Réservation">
        <div className="scroll">
          <div className="wrap booking__wrap">
            <header>
              <span className="eyebrow">Étape 3 · Réservation</span>
              <h1 className="h1 h1--xl booking__title">Récapitulatif du séjour</h1>
              <p className="muted booking__lead">
                Skitrack ne prend pas de paiement : la réservation se fait sur le site de l'annonce,
                avec le prix relevé.
              </p>
            </header>
            <div className="bgrid">
              <div className="booking__main">
                <section className="sect card">
                  <h2>Station</h2>
                  <div id="bk-station">
                    <div className="bk-station">
                      <div>
                        <strong className="bk-station__name">{s.name}</strong>
                        <p className="muted bk-station__sub">
                          {s.massif} · {s.dept ?? "–"}
                          {s.domain ? ` · ${s.domain}` : ""}
                        </p>
                        <p className="muted bk-station__facts">
                          <span className="rel">
                            {fmt(s.minM)}–{fmt(s.maxM)} m
                          </span>{" "}
                          ·{" "}
                          <span className="rel">
                            {s.pistesKm != null ? fmt(s.pistesKm) + " km" : "–"}
                          </span>{" "}
                          de pistes · <span className="rel">{s.lifts ?? "–"}</span> remontées
                        </p>
                      </div>
                      <a data-go="fiche" onClick={() => go("fiche", { id: s.id })}>
                        Fiche station
                      </a>
                    </div>
                  </div>
                </section>
                <section className="sect card">
                  <h2>Logement</h2>
                  <div id="bk-lodge">
                    <div className="bk-lodge">
                      <div className="bk-lodge__img">
                        <ImageSlot
                          id={`v6-l-${l.id}`}
                          placeholder="Photo"
                          className="lodge__slot"
                          src={l.photo}
                        />
                      </div>
                      <div className="bk-lodge__body">
                        <span className="tag bk-lodge__tag">{l.source}</span>
                        <strong className="bk-lodge__name">{l.title}</strong>
                        <span className="muted">
                          {l.bedrooms != null ? `${l.bedrooms} chambres` : "chambres non annoncées"}
                          {dist != null ? ` · piste à ${distLbl(dist / 1000)}` : ""}
                        </span>
                        <a onClick={() => go("lodging")}>Changer de logement</a>
                      </div>
                    </div>
                  </div>
                </section>
                <section className="sect card">
                  <h2>Avant de réserver</h2>
                  <ul className="checklist">
                    <li>
                      <i>
                        <Icon name="coche" />
                      </i>
                      <span>Prix total confirmé aux dates du séjour, taxes et frais compris.</span>
                    </li>
                    <li>
                      <i>
                        <Icon name="coche" />
                      </i>
                      <span>Capacité vérifiée pour le groupe.</span>
                    </li>
                    <li>
                      <i className="todo">
                        <Icon name="point" />
                      </i>
                      <span>
                        Forfaits : tarifs non relevés, à confirmer sur le site du domaine.
                      </span>
                    </li>
                    <li>
                      <i className="todo">
                        <Icon name="point" />
                      </i>
                      <span>Trajet : itinéraire non calculé dans cette maquette.</span>
                    </li>
                  </ul>
                </section>
                {/* Récapitulatif imprimable du lot 4 : chaque montant porte son
                    origine, et les postes sans montant partent dans « ce que ce
                    document ne dit pas » au lieu de s'afficher à zéro. */}
                <section className="sect card">
                  <h2>Récapitulatif imprimable</h2>
                  <StayReport
                    lat={l.lat}
                    lon={l.lon}
                    listingTitle={l.title}
                    input={{
                      stationName: s.name,
                      checkIn,
                      checkOut,
                      voyageurs: trav,
                      postes: [
                        {
                          label: "Logement",
                          montant: l.total,
                          origine: "relevé",
                          detail: `${l.title} · ${l.source}`,
                        },
                        {
                          label: `Forfaits ${trav} × 6 jours`,
                          montant: forfait?.j6 != null ? forfait.j6 * trav : null,
                          origine: origineForfait(forfait?.status),
                          detail: domain?.name ?? null,
                        },
                      ],
                      manquesAutres: [
                        l.lat == null || l.lon == null
                          ? "Le logement n’a pas de position : sa distance aux pistes n’est pas mesurée."
                          : null,
                        !l.url ? "L’annonce n’a pas de lien : la réservation se fait à la main." : null,
                        "Trajet : aucun itinéraire n’est calculé, donc ni carburant ni péage.",
                      ].filter((x): x is string => x != null),
                    }}
                  />
                </section>
              </div>
              <aside className="aside card">
                <span className="eyebrow">Total du séjour</span>
                <div id="bk-lines">
                  <div className="line">
                    <span>Logement · {nights} nuits</span>
                    <b className="rel">{eur(total)}</b>
                  </div>
                  <div className="line">
                    <span>Forfaits · {trav} × 6 j</span>
                    {forfait?.j6 != null ? (
                      <b className="rel">{eur(forfait.j6 * trav)}</b>
                    ) : (
                      <span className="line__none">– non relevé</span>
                    )}
                  </div>
                  <div className="line line--total">
                    <b>Total</b>
                    <b className="rel">{eur(total + (forfait?.j6 != null ? forfait.j6 * trav : 0))}</b>
                  </div>
                  <div className="line">
                    <span className="muted">Par personne ({trav})</span>
                    <b className="rel">
                      {eur((total + (forfait?.j6 != null ? forfait.j6 * trav : 0)) / trav)}
                    </b>
                  </div>
                  <div className="line">
                    <span className="muted">Dates</span>
                    <span className="rel">{datesLbl(checkIn, checkOut, nights)}</span>
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn--lg btn--full"
                  id="bk-open"
                  disabled={!l.url}
                  onClick={() => {
                    if (l.url) window.open(l.url, "_blank", "noopener");
                  }}
                >
                  Ouvrir l'annonce et réserver
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--full"
                  id="bk-share"
                  onClick={share}
                >
                  Copier le lien de partage
                </button>
                <p className="muted aside__note">
                  Le lien reprend station, logement, dates et groupe : vos co-voyageurs voient
                  exactement le même récapitulatif.
                </p>
              </aside>
            </div>
          </div>
        </div>
      </section>
    </Coquille>
  );
}
