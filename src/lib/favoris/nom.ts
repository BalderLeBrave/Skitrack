import type { Listing } from "../listings.ts";
import { stationById } from "../stations.ts";
import type { SejourFavori } from "./modele.ts";

/** Le nom proposé pour un premier dossier : la station et le mois du séjour. */
export function nomPropose(l: Listing, sejour: SejourFavori | null): string {
  const station = stationById(l.stationId)?.name ?? "";
  const mois = sejour
    ? new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${sejour.checkIn}T12:00:00Z`),
      )
    : "";
  return [station, mois].filter(Boolean).join(", ");
}
