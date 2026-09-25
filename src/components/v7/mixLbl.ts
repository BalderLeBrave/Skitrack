import type { ColorShare } from "@/lib/classeur";
import { COLS } from "@/lib/parcours";

/** « 20 / 40 / 30 / 10 % », ou l'absence. */
export function mixLbl(share: ColorShare | null): string {
  return share ? `${COLS.map((c) => share[c.key]).join(" / ")} %` : "répartition non relevée";
}
