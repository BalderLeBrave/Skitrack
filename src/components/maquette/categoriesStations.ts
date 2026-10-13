/**
 * La rangée de catégories des stations (accueil et Comparer) : les six
 * raccourcis `CHIPS` de `lib/v7.ts`, avec le libellé court et l'icône de la
 * maquette Airbnb (`CHIPS`, Skitrack App.dc.html). Le libellé long de
 * `CHIPS` passe en infobulle.
 */

import { aTraduire } from "@/lib/i18n/tr";
import type { ChipKey } from "@/lib/parcours";
import { CHIPS } from "@/lib/v7";
import { ICONES } from "./icones";

export const CATEGORIES_STATIONS: { key: ChipKey; court: string; long: string; icone: string }[] = [
  { key: "big", court: aTraduire("Grands domaines"), long: CHIPS.big.label, icone: ICONES.big },
  { key: "high", court: aTraduire("Haute altitude"), long: CHIPS.high.label, icone: ICONES.high },
  { key: "glacier", court: aTraduire("Glacier"), long: CHIPS.glacier.label, icone: ICONES.glacier },
  { key: "linked", court: aTraduire("Domaine relié"), long: CHIPS.linked.label, icone: ICONES.linked },
  { key: "family", court: aTraduire("Familial"), long: CHIPS.family.label, icone: ICONES.family },
  { key: "steep", court: aTraduire("Engagé"), long: CHIPS.steep.label, icone: ICONES.steep },
];
