/**
 * La mention de la prévision sur la fiche station : « Météo en date du
 * 30/09/2026 à 16h50 ». Date à la française, heure locale de la station, sans
 * nom de fournisseur ni altitude de modélisation.
 *
 * Chargé tel quel par `node --experimental-strip-types` : aucun alias `@/`.
 */

import { paysByCode } from "../geo/pays.ts";
import { langue, langueIntl } from "../i18n/langue.ts";
import { tr } from "../i18n/tr.ts";

/** Le fuseau de la station, celui de son pays ; Paris à défaut : les stations
 *  du référentiel sont toutes françaises. */
export function fuseauStation(pays: string | null | undefined): string {
  return paysByCode(pays)?.fuseau ?? "Europe/Paris";
}

/** « Météo en date du 30/09/2026 à 16h50 », à l'heure du fuseau donné. */
export function meteoEnDateDu(d: Date, fuseau: string): string {
  const parts = new Intl.DateTimeFormat(langueIntl(), {
    timeZone: fuseau,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const v = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  // L'heure s'écrit « 16h50 » en français, « 16:50 » en anglais.
  const heure = langue() === "en" ? `${v("hour")}:${v("minute")}` : `${v("hour")}h${v("minute")}`;
  return tr("Météo en date du {date} à {heure}", { date: `${v("day")}/${v("month")}/${v("year")}`, heure });
}
