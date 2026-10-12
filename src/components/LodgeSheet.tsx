/**
 * La fiche d'un logement depuis l'écran Traces : la même fenêtre que
 * Logements, Prix et Favoris (`VoletAnnonce`), avec en plus la distance du
 * logement à la trace GPX chargée et à son départ.
 */

import { useCallback } from "react";
import { usePrixForfait } from "@/components/v7/usePrixForfait";
import { VoletAnnonce } from "@/components/v7/VoletAnnonce";
import { distToGpxM, distToGpxStartM } from "@/lib/accommodation";
import { formatDistFrom } from "@/lib/access";
import { tr } from "@/lib/i18n";
import type { Listing } from "@/lib/listings";
import { useParcours } from "@/lib/parcours";
import { stationById } from "@/lib/stations";
import { useStay } from "@/lib/stay";
import { stationDuLogement } from "@/lib/stay/parStation";
import { useTrack } from "@/lib/track";

export function LodgeSheet({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  const stay = useStay();
  const hasTrack = useTrack((s) => s.points.length > 0);
  const start = useTrack((s) => s.stats?.start);
  const retenu = useParcours((p) => p.lodgeId === listing.id);
  const prix = usePrixForfait(stationById(stationDuLogement(listing, listing.stationId)));
  const nights = Math.max(
    1,
    Math.round((Date.parse(stay.checkOut) - Date.parse(stay.checkIn)) / 86400000),
  );
  const retenir = useCallback(() => {
    const p = useParcours.getState();
    p.chooseLodge(p.lodgeId === listing.id ? null : listing.id);
  }, [listing.id]);
  const gpx = [
    hasTrack
      ? `${tr("Trace GPX")}${tr(" : ")}${formatDistFrom(distToGpxM(listing), tr("du point le plus proche"))}`
      : null,
    start
      ? `${tr("Départ GPX")}${tr(" : ")}${formatDistFrom(distToGpxStartM(listing), tr("du départ"))}`
      : null,
  ].filter((x): x is string => x != null);

  return (
    <VoletAnnonce
      l={listing}
      stay={{ checkIn: stay.checkIn, checkOut: stay.checkOut }}
      trav={stay.guests}
      nights={nights}
      groupe={null}
      retenu={retenu}
      onRetenir={retenir}
      onFermer={onClose}
      onVoirOffre={() => undefined}
      forfaits={prix.pret ? prix.budget : undefined}
      complementsAcces={gpx.map((t) => (
        <li key={t}>{t}</li>
      ))}
    />
  );
}
