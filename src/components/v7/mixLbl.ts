import type { ColorShare } from "@/lib/classeur";
import { COLS } from "@/lib/parcours";
import { tr } from "@/lib/i18n";

/** « 20 / 40 / 30 / 10 % », ou l'absence. */
export function mixLbl(share: ColorShare | null): string {
  return share ? `${COLS.map((c) => share[c.key]).join(" / ")} %` : tr("répartition non relevée");
}
