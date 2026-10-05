import type { Listing } from "../listings.ts";
import { nomStationPropre } from "../rattachement.ts";
import type { SejourFavori } from "./modele.ts";
import { langueIntl } from "../i18n/langue.ts";

/** Le nom proposé pour un premier dossier : la station et le mois du séjour. */
export function nomPropose(l: Listing, sejour: SejourFavori | null): string {
  const station = nomStationPropre(l) ?? "";
  const mois = sejour
    ? new Intl.DateTimeFormat(langueIntl(), { month: "long", year: "numeric", timeZone: "UTC" }).format(
        new Date(`${sejour.checkIn}T12:00:00Z`),
      )
    : "";
  return [station, mois].filter(Boolean).join(", ");
}
