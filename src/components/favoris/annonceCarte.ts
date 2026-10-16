/**
 * Les textes d'une `CarteAnnonce` pour un logement (lCard de la maquette,
 * Skitrack App.dc.html:865-876) : photos, note sur 5, lieu et distance aux
 * remontées, capacité, chambres et surface publiée, prix du séjour. Prix (onglet budget),
 * Favoris et Réservation montrent ainsi la même carte.
 */

import type { CarteAnnonceProps, PhotoCarte } from "@/components/maquette";
import {
  altitudeLbl,
  pointAltitude,
  positionApprochee,
  type Altitude,
} from "@/lib/altitude/altitude";
import { tr, trN } from "@/lib/i18n";
import { langueIntl } from "@/lib/i18n/langue";
import type { Listing } from "@/lib/listings";
import { nuitsLbl } from "@/lib/parcours";
import { nomStationPropre } from "@/lib/rattachement";
import { noteSur5De } from "@/lib/stay/ficheEnrichie";
import { bedLbl, capLbl, distanceOf, prixLbl, surfaceLbl } from "@/lib/v7";

/** La photo principale puis les autres de la tuile, sans doublon. */
export function photosDe(l: Listing): PhotoCarte[] {
  const srcs = [l.photo, ...(l.photos ?? [])].filter((s): s is string => Boolean(s));
  return [...new Set(srcs)].map((src) => ({ src }));
}

/** « 4,8 », seulement quand la source publie une note ramenable sur 5. */
export function noteDe(l: Listing): string | null {
  const n = noteSur5De(l);
  if (n == null) return null;
  return new Intl.NumberFormat(langueIntl(), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(n);
}

/** « 1 240 € » « pour 7 nuits » : rien après un prix non publié. */
export function prixDe(l: Listing, nights: number): { price: string; priceSub?: string } {
  return {
    price: prixLbl(l),
    priceSub:
      l.total > 0 && nights > 0 ? tr("pour {nuits}", { nuits: nuitsLbl(nights) }) : undefined,
  };
}

/** La ligne de lieu : la station du logement, puis la distance aux remontées. */
export function lieuDe(l: Listing): string {
  return [nomStationPropre(l), distanceOf(l).text].filter(Boolean).join(" · ");
}

export function textesCarte(
  l: Listing,
  o: { nights: number; altitude?: Altitude | null; avecAltitude?: boolean },
): Pick<CarteAnnonceProps, "photos" | "title" | "note" | "l2" | "l3" | "price" | "priceSub"> {
  const l3 = [capLbl(l), bedLbl(l)];
  const surface = surfaceLbl(l);
  if (surface) l3.push(surface);
  if (l.beds != null && l.beds > 0) l3.push(trN(l.beds, "{n} lit", "{n} lits"));
  if (o.avecAltitude && pointAltitude(l)) l3.push(altitudeLbl(o.altitude, positionApprochee(l)));
  return {
    photos: photosDe(l),
    title: l.title,
    note: noteDe(l),
    l2: lieuDe(l),
    l3: l3.join(" · "),
    ...prixDe(l, o.nights),
  };
}
