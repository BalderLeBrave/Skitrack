/**
 * La carte de station, sur l'accueil et dans la liste de l'écran Stations :
 * la carte Airbnb commune (`CarteAnnonce`, `stCard` de Skitrack App.dc.html).
 * Photo de la station, rond « comparer » en haut à droite, nom, massif et
 * domaine, altitudes et km, forfait adulte du séjour, lien « Logements ».
 *
 * **Un clic gauche sur la photo ou le nom ouvre la fiche de la station.
 * Partout.** Sur l'accueil, il sélectionnait au lieu d'ouvrir : la vignette
 * était un interrupteur à trois cibles dont aucune ne menait quelque part, et
 * un second clic désélectionnait sans que rien ne l'annonce. Il ne reste que
 * des gestes qui vont chacun à un endroit précis : la photo et le nom mènent à
 * la fiche, le rond Comparer pose la station dans la comparaison, le lien
 * Logements retient la station et ouvre ses logements.
 *
 * Les contrôles posés sur la photo arrêtent la propagation du clic
 * (`CarteAnnonce`), faute de quoi cocher « Comparer » ouvrirait aussi la fiche.
 *
 * Toute valeur absente est écrite : « altitudes non relevées », « km non
 * publié », « non relevé ».
 */

import { useMemo } from "react";
import { CarteAnnonce } from "@/components/maquette";
import { useGo } from "@/components/v6/go";
import { usePrixStations } from "./usePrixForfait";
import { montantCents } from "@/lib/devises";
import { echecLbl, libellesForfait } from "@/lib/forfaits/prixSejour";
import { forfaitsStation } from "@/lib/forfaits/prixStations";
import { stationPhoto, useParcours } from "@/lib/parcours";
import type { Station } from "@/lib/stations";
import { altLbl, kmLbl, sub } from "@/lib/v7";
import { tr } from "@/lib/i18n";

export function CarteStation({
  s,
  variante,
  vif = false,
  surSurvol,
}: {
  s: Station;
  /** Désignée par la carte : même éclairage que l'épingle. */
  vif?: boolean;
  surSurvol?: (id: string | null) => void;
  /** `accueil` : cocher « Comparer » pose la station et ouvre l'écran qui la
   *  lit. `liste` : le rond bascule dans les deux sens, on est déjà sur
   *  l'écran. */
  variante: "accueil" | "liste";
}) {
  const go = useGo();
  const inCmp = useParcours((p) => p.cmp.includes(s.id));
  const toggleCmp = useParcours((p) => p.toggleCmp);
  const retain = useParcours((p) => p.retain);
  const retenue = useParcours((p) => p.stationId) === s.id;
  // Le forfait adulte du séjour : ses dates fixent la durée et la période.
  const { pret, jours, ctx } = usePrixStations();
  const forfait = forfaitsStation(s.id, ctx)?.adulte ?? null;
  const pass = forfait?.statut === "resolu" ? forfait : null;

  const src = stationPhoto(s);
  const photos = useMemo(() => (src ? [{ src }] : []), [src]);

  const ouvrir = () => void go("fiche", { id: s.id });

  /** Sur l'accueil, le rond pose la station dans la comparaison **et** mène à
   *  l'écran qui la lit : cocher sans rien ouvrir laissait l'utilisateur
   *  devant une case cochée et aucun chemin. Sur l'écran Stations, c'est une
   *  bascule. */
  const comparer = () => {
    if (variante === "liste") return toggleCmp(s.id);
    if (!inCmp) toggleCmp(s.id);
    void go("compare");
  };

  const logements = () => {
    retain(s.id);
    void go("lodging");
  };

  const l3 = [altLbl(s) ?? tr("altitudes non relevées"), kmLbl(s) ?? tr("km non publié")].join(" · ");
  const price = pass
    ? (montantCents(pass.prix, pass.devise) ?? tr("non relevé"))
    : forfait && forfait.statut !== "resolu"
      ? echecLbl(forfait)
      : pret
        ? tr("non relevé")
        : "…";
  const faible = pass && libellesForfait(pass).faible;
  const priceSub = [tr("forfait {jours} j", { jours: jours ?? 6 }), faible ? tr("fiabilité faible") : null]
    .filter(Boolean)
    .join(" · ");

  return (
    <CarteAnnonce
      className={`st-carte-station st-carte-station--${variante}`}
      photos={photos}
      title={s.name}
      l2={sub(s)}
      l3={l3}
      price={price}
      priceSub={priceSub}
      onOpen={ouvrir}
      badge={retenue ? tr("Retenue") : null}
      cmp={{
        on: inCmp,
        title: inCmp ? tr("Retirer de la comparaison") : tr("Ajouter à la comparaison"),
        onToggle: comparer,
      }}
      link={{ label: tr("Logements"), on: retenue, onClick: logements }}
      vif={vif}
      onMouseEnter={surSurvol ? () => surSurvol(s.id) : undefined}
      onMouseLeave={surSurvol ? () => surSurvol(null) : undefined}
    />
  );
}
