import type { ForfaitRow } from "./types";

export function formatEuroTarif(n: number | null | undefined): string {
  if (n == null) return "–";
  return `${n.toLocaleString("fr-FR")} €`;
}

export function formatForfaitAge(row: ForfaitRow, now = Date.now()): string {
  if (row.status === "manuel" || row.locked) return "saisi à la main";
  if (row.status === "estimé") return "≈ estimé, hors coût officiel";
  if (row.fetchedAt == null && row.lastAttemptAt == null) return "tarif non relevé";
  const at = Date.parse(row.fetchedAt ?? row.lastAttemptAt ?? "");
  if (!Number.isFinite(at)) return "tarif non relevé";
  const delta = now - at;
  if (row.status === "stale" || row.status === "erreur") {
    if (row.j1 != null || row.j6 != null) {
      // « tarif non à jour » sans date ne dit pas si le montant affiché a un
      // mois ou trois ans. La date du relevé est connue : elle s'écrit.
      const le = row.fetchedAt ? `, relevé le ${new Date(at).toLocaleDateString("fr-FR")}` : "";
      return `tarif non à jour${le}${row.lastError ? ` : ${row.lastError}` : ""}`;
    }
    return row.lastError ? `tarif en erreur : ${row.lastError}` : "tarif en erreur";
  }
  if (delta < 60_000) return "à l’instant";
  if (delta < 3_600_000) return `il y a ${Math.max(1, Math.round(delta / 60_000))} min`;
  if (delta < 36_000_000) return `il y a ${Math.max(1, Math.round(delta / 3_600_000))} h`;
  const day = new Date(at);
  const today = new Date(now);
  const yday = new Date(now - 86_400_000);
  const same = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (same(day, today)) return "aujourd’hui";
  if (same(day, yday)) return "hier";
  return day.toLocaleDateString("fr-FR");
}

export function forfaitConfirmLabel(row: ForfaitRow): string | null {
  if (row.status === "stale" || row.status === "erreur") return "forfait à confirmer";
  if (row.status === "estimé") return "hors coût officiel";
  return null;
}
