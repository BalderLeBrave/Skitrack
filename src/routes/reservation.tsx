/** Réservation – `#s-booking` (maquette l. 438–451 ; `renderBooking` l. 681–688).
 *  Ordre du DOM : contrat § 3.5. Station retenue et logement choisi viennent
 *  du parcours ; l'annonce est celle du relevé ou de la recherche en direct.
 *
 *  L'écran est le récapitulatif lui-même, et il s'imprime tel quel sur une A4.
 *  Il en portait deux : quatre cartes bordées à gauche, puis un « récapitulatif
 *  imprimable » qui répétait la station, les dates et le budget dans un cadre
 *  de plus. Il n'en reste qu'un, en sections séparées par le vide et un titre.
 *  Seul le panneau d'action, à droite, garde une surface : c'est lui qui agit. */

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bouton } from "@/components/base/Bouton";
import { Etat } from "@/components/base/Etat";
import { Liste } from "@/components/base/Liste";
import { Tableau } from "@/components/base/Tableau";
import { Icon } from "@/components/Icon";
import { Coquille } from "@/components/Coquille";
import { ImageSlot } from "@/components/v6/ImageSlot";
import { useGo } from "@/components/v6/go";
import { resolveListing } from "@/lib/accommodation";
import { getForfait } from "@/lib/forfaits/api";
import { domainForStation } from "@/lib/forfaits/catalog";
import type { ForfaitRow } from "@/lib/forfaits/types";
import { buildReport, fiabiliteLabel, ORIGINE_LABEL, origineForfait } from "@/lib/stay/report";
import { stayRangeLabel } from "@/lib/stay/calendar";
import { datesLbl, distLbl, eur, fmt, groupLbl, useParcours, useSejour } from "@/lib/parcours";
import { stationById } from "@/lib/stations";

export const Route = createFileRoute("/reservation")({ component: Reservation });

/** Forfait du domaine de la station retenue, s'il y en a un. `lecture` tant
 *  que le service n'a pas répondu : l'écran dessine la place du tarif au lieu
 *  d'écrire « non relevé » pendant la demi-seconde où il ne sait pas encore. */
function useForfait(stationId: string | null) {
  const [forfait, setForfait] = useState<ForfaitRow | null>(null);
  const [lecture, setLecture] = useState(false);
  const domain = stationId ? domainForStation(stationId) : undefined;
  useEffect(() => {
    if (!domain) {
      setForfait(null);
      setLecture(false);
      return;
    }
    let cancelled = false;
    setLecture(true);
    void getForfait({ data: { slug: domain.slug } })
      .then((r) => {
        if (!cancelled) setForfait(r);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLecture(false);
      });
    return () => {
      cancelled = true;
    };
  }, [domain?.slug]);
  return { forfait, domain, lecture };
}

function Reservation() {
  const go = useGo();
  const stationId = useParcours((x) => x.stationId);
  const lodgeId = useParcours((x) => x.lodgeId);
  const say = useParcours((x) => x.say);
  const { checkIn, checkOut, trav, rooms, nights } = useSejour();
  const s = stationId ? stationById(stationId) : undefined;
  const l = lodgeId ? resolveListing(lodgeId) : undefined;
  const { forfait, domain, lecture } = useForfait(stationId);

  /* La maquette ne rendait rien sans station ni logement (l. 682), parce qu'on
     n'y arrivait que par le parcours. À l'adresse `/reservation`, ouverte
     directement ou par l'onglet de navigation, cela donnait une page
     entièrement vide. L'étape dit maintenant ce qui lui manque et renvoie là
     où on le choisit. */
  if (!s || !l) {
    return (
      <Coquille>
        <section className="screen on" id="s-booking" data-screen-label="3 Réservation">
          <div className="scroll">
            <div className="wrap recap__wrap">
              <header className="recap__tete">
                <span className="eyebrow">Étape 3 · Réservation</span>
                <h1 className="h1 h1--xl">Rien à récapituler pour l’instant</h1>
              </header>
              <Etat
                sorte="vide"
                titre={!s ? "Aucune station retenue" : "Aucun logement choisi"}
                cause={
                  !s
                    ? "Le récapitulatif reprend une station, un logement et vos dates. Commencez par retenir une station."
                    : `${s.name} est retenue. Il reste à choisir un logement parmi ceux relevés à ces dates.`
                }
                action={
                  <Bouton onClick={() => go(s ? "lodging" : "compare")}>
                    {s ? "Voir les logements" : "Choisir une station"}
                  </Bouton>
                }
              />
              <p className="muted">
                <span className="rel js-dates">{datesLbl(checkIn, checkOut, nights)}</span> ·{" "}
                <span className="rel js-group">{groupLbl(trav, rooms)}</span> · le séjour saisi en
                haut de page suit jusqu’ici.
              </p>
            </div>
          </div>
        </section>
      </Coquille>
    );
  }

  const j6 = forfait?.j6 ?? null;
  const forfaitTotal = j6 != null ? j6 * trav : null;
  const forfaitOrigine = origineForfait(forfait?.status);
  const report = buildReport({
    stationName: s.name,
    checkIn,
    checkOut,
    voyageurs: trav,
    postes: [
      {
        label: `Logement, ${nights} nuit${nights > 1 ? "s" : ""}`,
        montant: l.total,
        origine: "relevé",
        detail: `${l.title} · ${l.source}`,
      },
      {
        label: `Forfaits, ${trav} × 6 jours`,
        montant: forfaitTotal,
        origine: forfaitOrigine,
        detail: domain?.name ?? null,
      },
    ],
    manquesAutres: [
      l.distToLiftM == null
        ? "La distance du logement aux remontées n’est pas mesurée : l’annonce ne publie pas sa position."
        : null,
      !l.url ? "L’annonce n’a pas de lien : la réservation se fait à la main." : null,
      "Trajet : aucun itinéraire n’est calculé, donc ni carburant ni péage.",
    ].filter((x): x is string => x != null),
  });

  const share = () => {
    const link = `${window.location.href.split("#")[0]}#s=${s.id}&l=${l.id}&n=${nights}&t=${trav}&r=${rooms}`;
    void navigator.clipboard?.writeText(link);
    say("Lien de partage copié.");
  };

  const forfaitDit =
    j6 != null
      ? `${trav} × 6 jours à ${eur(j6)}, ${
          forfaitOrigine === "estimé"
            ? "estimés"
            : forfait?.status === "stale"
              ? "tarif ancien"
              : "relevés"
        } : à confirmer sur le site du domaine.`
      : "tarifs non relevés, à demander sur le site du domaine.";

  return (
    <Coquille>
      <section className="screen on" id="s-booking" data-screen-label="3 Réservation">
        <div className="scroll">
          <div className="wrap recap__wrap">
            <header className="recap__tete">
              <span className="eyebrow">Étape 3 · Réservation</span>
              <h1 className="h1 h1--xl">Récapitulatif du séjour</h1>
              <p className="muted recap__lead">
                {s.name}, {stayRangeLabel(checkIn, checkOut)},{" "}
                {rooms > 0 ? groupLbl(trav, rooms) : `${trav} voyageur${trav > 1 ? "s" : ""}`}.
                Skitrack ne prend pas de paiement : la réservation se fait sur le site de l’annonce,
                au prix relevé.
              </p>
            </header>

            <div className="recap__duo">
              <article className="recap" id="stay-report" data-testid="stay-report">
                <section className="recap__section">
                  <h2 className="recap__titre">Station</h2>
                  <p className="recap__nom">
                    <strong>{s.name}</strong>
                    <span className="muted">
                      {" "}
                      · {s.massif}
                      {s.dept ? ` · ${s.dept}` : ""}
                      {s.domain ? ` · ${s.domain}` : ""}
                    </span>
                  </p>
                  <Liste
                    colonnes={4}
                    absence="non relevé"
                    faits={[
                      {
                        cle: "pistes",
                        libelle: "Pistes",
                        valeur:
                          s.minM != null && s.maxM != null
                            ? `${fmt(s.minM)} – ${fmt(s.maxM)} m`
                            : null,
                      },
                      {
                        cle: "village",
                        libelle: "Village",
                        valeur: s.villageM ? `${fmt(s.villageM)} m` : null,
                      },
                      {
                        cle: "km",
                        libelle: "Pistes du domaine",
                        valeur: s.pistesKm != null ? `${fmt(s.pistesKm)} km` : null,
                      },
                      {
                        cle: "remontees",
                        libelle: "Remontées",
                        valeur: s.lifts != null ? fmt(s.lifts) : null,
                      },
                    ]}
                  />
                  <p className="recap__liens">
                    <button
                      type="button"
                      className="lien"
                      onClick={() => go("fiche", { id: s.id })}
                    >
                      Fiche station
                    </button>
                  </p>
                </section>

                <section className="recap__section">
                  <h2 className="recap__titre">Logement</h2>
                  <div className="recap__logement">
                    <div className="recap__photo">
                      <ImageSlot
                        id={`v6-l-${l.id}`}
                        placeholder="Photo"
                        className="lodge__slot"
                        src={l.photo}
                      />
                    </div>
                    <div className="recap__logement-corps">
                      <p className="recap__nom">
                        <strong>{l.title}</strong>
                        <span className="muted"> · {l.source}</span>
                      </p>
                      <Liste
                        colonnes={3}
                        absence="non annoncé"
                        faits={[
                          {
                            cle: "chambres",
                            libelle: "Chambres",
                            valeur: l.bedrooms != null ? fmt(l.bedrooms) : null,
                          },
                          {
                            cle: "capacite",
                            libelle: "Capacité",
                            valeur: l.guests != null ? `${fmt(l.guests)} personnes` : null,
                          },
                          {
                            cle: "remontee",
                            libelle: "Remontée la plus proche",
                            valeur: l.distToLiftM != null ? distLbl(l.distToLiftM / 1000) : null,
                            precision: l.distToLiftM != null && l.liftName ? l.liftName : undefined,
                          },
                        ]}
                      />
                      <p className="recap__liens">
                        {l.url ? (
                          <a href={l.url} target="_blank" rel="noopener noreferrer">
                            Voir l’annonce
                          </a>
                        ) : null}
                        {l.url ? " · " : null}
                        <button type="button" className="lien" onClick={() => go("lodging")}>
                          Changer de logement
                        </button>
                      </p>
                    </div>
                  </div>
                </section>

                <section className="recap__section">
                  <h2 className="recap__titre">Budget</h2>
                  {lecture ? (
                    <Etat
                      sorte="chargement"
                      compact
                      titre="Lecture du tarif des forfaits"
                      cause={`Le tarif ${domain ? `de ${domain.name}` : "du domaine"} est demandé au service du dépôt.`}
                      lignes={3}
                    />
                  ) : (
                    <>
                      <Tableau
                        className="recap__budget"
                        absence="non relevé"
                        colonnes={[
                          { cle: "poste", entete: "Poste" },
                          { cle: "origine", entete: "Origine" },
                          { cle: "montant", entete: "Montant", nombre: true },
                        ]}
                        lignes={[
                          ...report.postes.map((p) => ({
                            cle: p.label,
                            cellules: {
                              poste: (
                                <span className="tableau__texte">
                                  {p.label}
                                  {p.detail ? (
                                    <span className="muted recap__detail">{p.detail}</span>
                                  ) : null}
                                </span>
                              ),
                              origine: ORIGINE_LABEL[p.origine],
                              montant: `${p.origine === "estimé" ? "≈ " : ""}${eur(p.montant)}`,
                            },
                          })),
                          {
                            cle: "total",
                            retenue: true,
                            cellules: {
                              poste: <strong>Total</strong>,
                              origine: "",
                              montant: <strong>{eur(report.total)}</strong>,
                            },
                          },
                          ...(report.parPersonne != null
                            ? [
                                {
                                  cle: "personne",
                                  cellules: {
                                    poste: <span className="muted">Par personne, {trav}</span>,
                                    origine: "",
                                    montant: (
                                      <span className="muted">{eur(report.parPersonne)}</span>
                                    ),
                                  },
                                },
                              ]
                            : []),
                        ]}
                      />
                      <p className="muted">{fiabiliteLabel(report)}</p>
                    </>
                  )}
                </section>

                <section className="recap__section">
                  <h2 className="recap__titre">Avant de réserver</h2>
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
                      <span>
                        Capacité vérifiée pour le groupe
                        {l.guests != null
                          ? ` : ${fmt(l.guests)} personnes annoncées pour ${trav}.`
                          : " : l’annonce ne la publie pas."}
                      </span>
                    </li>
                    <li>
                      <i
                        className={
                          forfaitTotal != null && forfait?.status === "ok" ? undefined : "todo"
                        }
                      >
                        <Icon
                          name={
                            forfaitTotal != null && forfait?.status === "ok" ? "coche" : "point"
                          }
                        />
                      </i>
                      <span>Forfaits : {forfaitDit}</span>
                    </li>
                    <li>
                      <i className="todo">
                        <Icon name="point" />
                      </i>
                      <span>Trajet : itinéraire non calculé ici.</span>
                    </li>
                  </ul>
                </section>

                {/* La section la plus utile du document : un récapitulatif qui
                    tait ses trous laisse croire qu'il n'en a pas. */}
                <section className="recap__section">
                  <h2 className="recap__titre">Ce que ce document ne dit pas</h2>
                  {report.manques.length === 0 ? (
                    <p className="muted">
                      Rien ne manque à l’appel : chaque poste attendu porte un montant et son
                      origine.
                    </p>
                  ) : (
                    <ul className="recap__manques">
                      {report.manques.map((m) => (
                        <li key={m}>{m}</li>
                      ))}
                    </ul>
                  )}
                  <p className="muted recap__mention">
                    Composé le {new Date().toLocaleDateString("fr-FR")} à partir de ce que
                    l’application a relevé ; aucun chiffre n’y est ajouté. Aucun plan des pistes
                    officiel n’est reproduit : ce sont des œuvres graphiques protégées.
                  </p>
                </section>
              </article>

              <aside className="aside card recap__aside">
                <span className="eyebrow">Total du séjour</span>
                <div id="bk-lines">
                  <div className="line">
                    <span>Logement · {nights} nuits</span>
                    <b className="rel">{eur(l.total)}</b>
                  </div>
                  <div className="line">
                    <span>Forfaits · {trav} × 6 j</span>
                    {lecture ? (
                      <span className="squelette recap__attente" aria-hidden="true">
                        <span className="squelette__ligne" />
                      </span>
                    ) : forfaitTotal != null ? (
                      <b className="rel">
                        {forfaitOrigine === "estimé" ? "≈ " : ""}
                        {eur(forfaitTotal)}
                      </b>
                    ) : (
                      <span className="line__none">non relevé</span>
                    )}
                  </div>
                  <div className="line line--total">
                    <b>Total</b>
                    <b className="rel">{eur(report.total)}</b>
                  </div>
                  <div className="line">
                    <span className="muted">Par personne ({trav})</span>
                    <b className="rel">
                      {report.parPersonne != null ? eur(report.parPersonne) : "–"}
                    </b>
                  </div>
                  <div className="line">
                    <span className="muted">Dates</span>
                    <span className="rel">{datesLbl(checkIn, checkOut, nights)}</span>
                  </div>
                </div>
                <Bouton
                  grand
                  pleineLargeur
                  id="bk-open"
                  disabled={!l.url}
                  onClick={() => {
                    if (l.url) window.open(l.url, "_blank", "noopener");
                  }}
                >
                  Ouvrir l’annonce et réserver
                </Bouton>
                {!l.url ? (
                  <p className="muted aside__note">
                    L’annonce n’a pas de lien : la réservation se fait à la main, auprès de{" "}
                    {l.source}.
                  </p>
                ) : null}
                <Bouton ton="fantome" pleineLargeur id="bk-share" onClick={share}>
                  Copier le lien de partage
                </Bouton>
                <Bouton ton="fantome" pleineLargeur id="bk-print" onClick={() => window.print()}>
                  Imprimer le récapitulatif
                </Bouton>
                <p className="muted aside__note">
                  Le lien reprend station, logement, dates et groupe : vos co-voyageurs voient
                  exactement le même récapitulatif. L’impression tient sur une page A4.
                </p>
              </aside>
            </div>
          </div>
        </div>
      </section>
    </Coquille>
  );
}
